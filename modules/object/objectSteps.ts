import { expect, Locator, Page } from '@playwright/test';
import { closeMenus } from '../../core/pages/menus';
import { apiGet, tenantOf } from '../../core/pages/runApi';
import { CaseHandler } from '../../core/runner/registerCases';
import { RepoPage } from '../repo/shared/RepoPage';

/**
 * The Confidence Object module: every part of /confidence-engine?pillar=object (workspace overview) for the run that just finished.
 * Verified live. The page is read from its own text (locators / role names) and compared with the same data calls the page makes
 * (runtime-api projects, views-api runs/latest-by-project, views-api run scores) - never screenshots. Nothing is clicked that
 * starts, cancels or downloads anything. The module ends by clicking "Back to Confidence Engine".
 */

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();
const num = (s: unknown): number => Number(String(s ?? '').replace(/[^\d.\-]/g, ''));
const runId = (page: Page): string => new URL(page.url()).searchParams.get('runId') ?? '';
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Passes as soon as ANY element of the locator is visible (the first match may be a hidden duplicate); polls instead of sleeping. */
const anyShown = (loc: Locator, timeout = 10_000): Promise<void> =>
  expect.poll(async () => { for (const l of await loc.all()) if (await l.isVisible().catch(() => false)) return true; return false; }, { timeout }).toBe(true);
const letters = (s: string): string => s.toLowerCase().replace(/[^a-z]/g, '');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOMAINS = ['Whitebox', 'Blackbox', 'Performance', 'Security', 'Compliance'];

interface Card { score: string; status: string; name: string; sub: string; domains: string[] }
interface View {
  avg: string; rating: string; projects: number; validations: number; shipRate: number; openRisks: number;
  org: string; domains: string[]; trendNote: string; axis: string[]; wb: string; labels: string[];
  tilesOk: boolean; trendOk: boolean; ttAvg: string; types: Array<[string, number]>; cards: Card[]; pager: { page: number; pages: number; total: number } | null;
}

/** Reads the page text (the page writes some words in capitals with styling, so this is the text as shown). */
async function read(page: Page): Promise<View> {
  // the cards and tiles are filled in by data calls after the page frame is shown, so read again until they are there (max ~10 s)
  let v = await readOnce(page);
  for (let i = 0; i < 20 && (!v.tilesOk || v.cards.length === 0); i++) { await page.waitForTimeout(500); v = await readOnce(page); }
  return v;
}

async function readOnce(page: Page): Promise<View> {
  const t = (await page.locator('body').innerText()).split('\n').map((s) => s.trim()).filter(Boolean).join('|');
  const m = (re: RegExp): RegExpMatchArray => t.match(re) ?? ([] as unknown as RegExpMatchArray);
  // the small captions under the tile figures ("in workspace", "validation pass rate", "failed validations") are optional
  const tiles = m(/(\d+|N\/A)\|Avg Confidence\|([^|]+)\|(\d+)\|Projects\|(?:in workspace\|)?(\d+)\|Validations\|(?:[^|%]*\|)?(\d+)\s*%\|Ship Rate\|(?:validation pass rate\|)?(\d+)\|Open Risks/i);
  const dom = m(/(\d+|N\/A)\|ORG\|Whitebox\|([^|]+)\|Blackbox\|([^|]+)\|Performance\|([^|]+)\|Security\|([^|]+)\|Compliance\|([^|]+)(?:\||$)/i);
  const trend = m(/Whitebox Trend\|([^|]*)\|100\|80\|60\|40\|20\|0\|(?:(\d+) WB\|)?(.*?)\|Testing Type\|/i);
  const tt = m(/Testing Type\|(\d+)\|testing-type avg\|(.*?)\|Projects domain breakdown\|/i);
  const flat = (tt[2] ?? '').split('|').filter(Boolean);
  const types: Array<[string, number]> = [];
  for (let i = 0; i + 1 < flat.length; i += 2) types.push([flat[i], num(flat[i + 1])]);
  const from = t.search(/Projects domain breakdown\|/i);
  const region = from < 0 ? '' : t.slice(from + 'Projects domain breakdown|'.length);
  const cards: Card[] = [];
  const re = /(\d+|N\/A)\|([A-Za-z][A-Za-z ]*)\|([^|]+)\|\3 · ([^|]+)\|Whitebox\|([^|]+)\|Blackbox\|([^|]+)\|Performance\|([^|]+)\|Security\|([^|]+)\|Compliance\|([^|]+)/gi;
  const dv = (x: string): string => x.trim().replace(/\s*%$/, '').toUpperCase();   // a card domain value: "85" / "85%" -> "85", "n/a" -> "N/A"
  for (let x = re.exec(region); x; x = re.exec(region)) cards.push({ score: dv(x[1]), status: x[2].trim().toUpperCase(), name: x[3], sub: x[4], domains: [x[5], x[6], x[7], x[8], x[9]].map(dv) });
  const pg = t.match(/Page\s+(\d+)\s+of\s+(\d+)\s*·\s*(\d+)\s+projects?/i);
  return {
    tilesOk: tiles.length > 0, trendOk: trend.length > 0,
    avg: tiles[1] ?? '', rating: (tiles[2] ?? '').trim(), projects: num(tiles[3]), validations: num(tiles[4]), shipRate: num(tiles[5]), openRisks: num(tiles[6]),
    org: dom[1] ?? '', domains: [dom[2], dom[3], dom[4], dom[5], dom[6]].map((x) => x ?? ''),
    trendNote: trend[1] ?? '', axis: ['100', '80', '60', '40', '20', '0'], wb: trend[2] ?? '', labels: (trend[3] ?? '').split('|').filter(Boolean),
    ttAvg: tt[1] ?? '', types, cards, pager: pg ? { page: num(pg[1]), pages: num(pg[2]), total: num(pg[3]) } : null,
  };
}

interface WorkspaceData { latest: Array<{ project_id: string; branch_name: string; overall_score: number | null }>; projects: Array<{ id: string; name: string }>; ptotal: number; aStatus: number; pStatus: number }
async function workspace(page: Page): Promise<WorkspaceData> {
  const tenant = await tenantOf(page);
  const a = await apiGet(page, `/views-api/v1/runs/latest-by-project?tenant_id=${tenant}&limit=200`);
  const p = await apiGet(page, '/runtime-api/v1/projects?limit=200');
  return { latest: a.json?.runs ?? [], projects: p.json?.projects ?? [], ptotal: num(p.json?.total), aStatus: a.status, pStatus: p.status };
}

/** SKIPS the case unless the Confidence Engine page of a finished run is open; then opens the Confidence Object page. */
async function needObject(ctx: Parameters<CaseHandler<RepoPage>>[0]): Promise<void> {
  const { page } = ctx;
  const onEngine = /\/confidence-engine/.test(page.url()) && !!runId(page);
  if (!onEngine) ctx.skip('The Confidence Engine page of a finished run is not open (the Execution module did not get a run to its results), so the Confidence Object page cannot be opened.');
  await closeMenus(page);
  if (!/pillar=object/.test(page.url())) {
    await page.locator('a[href*="/confidence-engine"][href*="pillar=object"]').first().click();
    await page.waitForURL(/pillar=object/, { timeout: 30_000 }).catch(() => ctx.skip('Clicking "Confidence Object" did not open the Confidence Object page.'));
  }
  await page.getByText(/^\s*Confidence Domains\s*$/i).first().waitFor({ state: 'visible', timeout: 30_000 })
    .catch(() => ctx.skip('The Confidence Object page did not show "Confidence Domains".'));
  await page.getByText(/Page \d+ of \d+/).first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => undefined);
}

export const objectSteps: Record<string, CaseHandler<RepoPage>> = {
  'OBJ-001': async (ctx) => {
    await needObject(ctx);
    const { page, check, note, snap } = ctx;
    const id = runId(page);
    const q = new URL(page.url()).searchParams;
    await snap('Confidence Object page: breadcrumb and branch run selector', page.getByRole('navigation', { name: 'Breadcrumb' }));
    await check('The address is /confidence-engine with pillar=object for the same run id', () => {
      expect(new URL(page.url()).pathname).toBe('/confidence-engine');
      expect(q.get('pillar')).toBe('object');
      expect(q.get('runId')).toBe(id);
    });
    await check('The address also carries a projectId, a repositoryId and the branch', () => {
      expect(q.get('projectId') ?? '').toMatch(UUID);
      expect(q.get('repositoryId') ?? '').toMatch(UUID);
      expect(q.get('branch') ?? '').not.toBe('');
    });
    await check('The page is not sent to the login page', () => expect(page).not.toHaveURL(/\/auth\//));
    await check('The breadcrumb shows "Confidence Object" and the start of the run id', async () => {
      await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(/confidence object/i);
      expect(norm(await page.locator('body').innerText())).toMatch(new RegExp(`run\\s*${id.slice(0, 8)}`, 'i'));
    });
    await check('The "Branch run" selector shows the branch, the commit and the start of the run id', () =>
      expect(page.getByRole('combobox', { name: 'Branch run' })).toContainText(new RegExp(`${esc((q.get('branch') ?? '').slice(0, 20))}.*[0-9a-f]{7}.*${id.slice(0, 8)}`, 'i')));
    await check('"Back to Confidence Engine" is shown at the bottom', () => expect(page.getByRole('link', { name: /back to confidence engine/i }).first()).toBeVisible());
    await check('No error message is shown', () => expect(page.getByText(/something went wrong|failed to load|unable to load/i)).toHaveCount(0));
    note(`Run ${id}`);
  },

  'OBJ-002': async (ctx) => {
    await needObject(ctx);
    const { page, check, snap } = ctx;
    const id = runId(page);
    await snap('Left menu and top links of the Confidence Object page', page.getByRole('navigation', { name: 'Workspace' }));
    for (const [name, href] of [['Dashboard', '/dashboard'], ['Confidence Engine', '/confidence-engine'], ['Execution Assistant', '/execution-assistant'], ['Account and Plan', '/account']] as const) {
      await check(`Left menu link "${name}" is shown and goes to ${href}`, async () => {
        const link = page.getByRole('link', { name: new RegExp(`^\\s*${esc(name)}\\s*$`, 'i') }).first();
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('href', new RegExp(href));
      });
    }
    await check('The executions meter ("Executions: used / limit") is shown, links to /account and used is not above the limit', async () => {
      const meter = page.locator('a[href="/account"]').filter({ hasText: /Executions:\s*\d+\s*\/\s*\d+/ }).first();
      await expect(meter).toBeVisible();
      const m = norm(await meter.innerText()).match(/Executions:\s*(\d+)\s*\/\s*(\d+)/)!;
      expect(num(m[1])).toBeLessThanOrEqual(num(m[2]));
    });
    for (const name of ['Sign out', 'Notifications', 'Support', 'Submit question']) {
      await check(`The "${name}" button is shown`, () => expect(page.getByRole('button', { name: new RegExp(esc(name), 'i') }).first()).toBeVisible());
    }
    for (const [name, pillar] of [['Confidence Object', 'object'], ['Confidence Graph', 'graph'], ['Confidence Engine', 'engine']] as const) {
      await check(`The top link "${name}" points to this run with pillar=${pillar}`, async () => {
        const link = page.locator(`a[href*="/confidence-engine"][href*="pillar=${pillar}"]`).first();
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('href', new RegExp(`runId=${id}`));
      });
      await check(`The "About ${name}" button is shown`, () => expect(page.getByRole('button', { name: new RegExp(`About ${esc(name)}`, 'i') }).first()).toBeVisible());
    }
    await check('"Closed-Loop Intel" is marked COMING SOON', () =>
      expect(page.locator('a,div,button').filter({ hasText: /Closed.?Loop Intel/i }).filter({ hasText: /coming soon/i }).last()).toBeVisible());
  },

  'OBJ-003': async (ctx) => {
    await needObject(ctx);
    const { page, check, snap } = ctx;
    await snap('The question box and "Submit question" button', page.getByRole('textbox', { name: /ask a confidence question/i }));
    await check('The question box "Ask a confidence question" is shown', () => expect(page.getByRole('textbox', { name: /ask a confidence question/i })).toBeVisible());
    await check('"Submit question" is shown (it is not clicked)', () => expect(page.getByRole('button', { name: 'Submit question' })).toBeVisible());
    await check('The chat still says the run is complete', () => anyShown(page.getByText(/run (is )?complete/i)));
    await check('"Analyze latest commit" is offered and enabled (it is not clicked)', async () => {
      const analyze = page.getByRole('button', { name: /analy[sz]e latest commit/i }).first();
      await expect(analyze).toBeVisible();
      await expect(analyze).toBeEnabled();
    });
  },

  'OBJ-004': async (ctx) => {
    await needObject(ctx);
    const { page, check, note } = ctx;
    const v = await read(page);
    const run = await apiGet(page, `/views-api/v1/runs/${runId(page)}/scores?tenant_id=${await tenantOf(page)}`);
    const apiScore = run.status === 200 ? num(run.json?.overall_score) : NaN;
    await ctx.snap('The five tiles: Avg Confidence, Projects, Validations, Ship Rate, Open Risks', page.getByText(/^\s*Avg Confidence\s*$/i).first().locator('xpath=ancestor::*[contains(., "Open Risks")][1]'));
    note(`Tiles: Avg Confidence ${v.avg} ${v.rating}; Projects ${v.projects}; Validations ${v.validations}; Ship Rate ${v.shipRate}%; Open Risks ${v.openRisks}. This run's score (API): ${apiScore}.`);
    await check('The five tiles could be read (Avg Confidence, Projects, Validations, Ship Rate, Open Risks)', () => expect(v.tilesOk, 'the tiles text was not found on the page').toBe(true));
    await check('Avg Confidence is a number from 0 to 100 with a rating word (e.g. SHIP)', () => {
      expect(num(v.avg)).toBeGreaterThanOrEqual(0);
      expect(num(v.avg)).toBeLessThanOrEqual(100);
      expect(v.rating).toMatch(/^[a-z][a-z -]+$/i);
    });
    await check('"Projects - in workspace" is a whole number', () => { expect(v.tilesOk).toBe(true); expect(Number.isInteger(v.projects) && v.projects >= 0).toBe(true); });
    await check('Validations is a whole number', () => { expect(v.tilesOk).toBe(true); expect(Number.isInteger(v.validations) && v.validations >= 0).toBe(true); });
    await check('Ship Rate is 0-100%', () => { expect(v.shipRate).toBeGreaterThanOrEqual(0); expect(v.shipRate).toBeLessThanOrEqual(100); });
    await check('Open Risks (failed validations) is not more than Validations', () => expect(v.openRisks).toBeLessThanOrEqual(v.validations));
    await check('Ship Rate = (Validations - Open Risks) / Validations', () => {
      expect(v.validations, 'Validations is 0, so the rate cannot be calculated').toBeGreaterThan(0);
      expect(Math.abs(v.shipRate - ((v.validations - v.openRisks) / v.validations) * 100), `Validations ${v.validations}, Open Risks ${v.openRisks}, Ship Rate ${v.shipRate}%`).toBeLessThanOrEqual(1);
    });
    await check("Avg Confidence equals the Confidence Score of this run (run API, rounded)", () =>
      expect(Math.abs(num(v.avg) - apiScore), `API score ${apiScore}, tile ${v.avg}`).toBeLessThanOrEqual(1));
  },

  'OBJ-005': async (ctx) => {
    await needObject(ctx);
    const { page, check, note } = ctx;
    const v = await read(page);
    await ctx.snap('Confidence Domains: ORG score and the five domains', page.getByText(/^\s*Confidence Domains\s*$/i).first().locator('xpath=ancestor::*[contains(., "Compliance")][1]'));
    note(`ORG ${v.org}; ${DOMAINS.map((d, i) => `${d} ${v.domains[i]}`).join('; ')}`);
    await check('"Confidence Domains" and "Weighted accumulation → Org Score" are shown', async () => {
      await anyShown(page.getByText(/^\s*Confidence Domains\s*$/i));
      await anyShown(page.getByText(/Weighted accumulation/i));
    });
    await check('The ORG score is a number from 0 to 100', () => { expect(num(v.org)).toBeGreaterThanOrEqual(0); expect(num(v.org)).toBeLessThanOrEqual(100); });
    await check('The ORG score equals the Avg Confidence tile', () => expect(num(v.org), `ORG ${v.org}, tile ${v.avg}`).toBe(num(v.avg)));
    for (let i = 0; i < DOMAINS.length; i++) {
      await check(`Domain "${DOMAINS[i]}" is shown with a percentage or N/A (0-100%)`, () => {
        expect(v.domains[i], `${DOMAINS[i]} shows "${v.domains[i]}"`).toMatch(/^(N\/A|\d{1,3}\s*%)$/i);
        if (!/n\/a/i.test(v.domains[i])) expect(num(v.domains[i])).toBeLessThanOrEqual(100);
      });
    }
  },

  'OBJ-006': async (ctx) => {
    await needObject(ctx);
    const { page, check, note } = ctx;
    const v = await read(page);
    await ctx.snap('The Whitebox Trend chart', page.getByText(/^\s*Whitebox Trend\s*$/i).first().locator('xpath=ancestor::*[.//svg][1]'));
    note(`Trend header "${v.trendNote}"; marker "${v.wb} WB"; ${v.labels.length} labels.`);
    await check('"Whitebox Trend" is shown', () => anyShown(page.getByText(/^\s*Whitebox Trend\s*$/i)));
    await check('The change figure reads like "N pts"', () => expect(v.trendNote).toMatch(/^[+\-−–]?\s*\d+(\.\d+)?\s*pts?$/i));
    await check('The vertical axis shows 100, 80, 60, 40, 20, 0', () => expect(v.trendOk, 'the axis values 100, 80, 60, 40, 20, 0 were not found under "Whitebox Trend"').toBe(true));
    await check('The Whitebox marker ("<n> WB") is a number from 0 to 100', () => { expect(v.wb).not.toBe(''); expect(num(v.wb)).toBeLessThanOrEqual(100); });
    await check('A drawn chart is shown (an SVG with at least one line or point)', () =>
      expect(page.locator('svg path, svg circle, svg polyline').count()).resolves.toBeGreaterThan(5));
    await check('The chart lists the same testing types as the "Testing Type" list below it', () => {
      expect(v.labels.length, 'no chart labels were read').toBeGreaterThan(0);
      // a label may be a shortened form of the testing type name, so one containing the other is the same type
      const a = v.labels.map(letters).sort();
      const b = v.types.map(([n]) => letters(n)).sort();
      expect(a.length, `chart labels ${v.labels.join(', ')} vs testing types ${v.types.map(([n]) => n).join(', ')}`).toBe(b.length);
      expect(b.every((n) => a.some((l) => l.includes(n) || n.includes(l))), `chart labels ${v.labels.join(', ')} vs testing types ${v.types.map(([n]) => n).join(', ')}`).toBe(true);
    });
  },

  'OBJ-007': async (ctx) => {
    await needObject(ctx);
    const { page, check, note } = ctx;
    const v = await read(page);
    const scores = v.types.map(([, s]) => s);
    await ctx.snap('The Testing Type list with its scores', page.getByText(/^\s*Testing Type\s*$/i).first().locator('xpath=ancestor::*[contains(., "testing-type avg")][1]'));
    note(`Testing Type: average ${v.ttAvg}; ${v.types.length} types: ${v.types.map(([n, s]) => `${n} ${s}`).join(', ')}`);
    await check('"Testing Type" is shown with at least one testing type', async () => {
      await anyShown(page.getByText(/^\s*Testing Type\s*$/i));
      expect(v.types.length).toBeGreaterThan(0);
    });
    await check('Every testing type has a score from 0 to 100', () => scores.forEach((s) => { expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThanOrEqual(100); }));
    await check('The testing types are listed from the highest score to the lowest', () => expect(scores).toEqual([...scores].sort((a, b) => b - a)));
    await check('No testing type is listed twice', () => expect(new Set(v.types.map(([n]) => letters(n))).size).toBe(v.types.length));
    await check('"testing-type avg" equals the average of the listed scores (rounded)', () =>
      expect(Math.abs(num(v.ttAvg) - scores.reduce((a, b) => a + b, 0) / (scores.length || 1)), `scores average ${(scores.reduce((a, b) => a + b, 0) / (scores.length || 1)).toFixed(1)}, page shows ${v.ttAvg}`).toBeLessThanOrEqual(1));
  },

  'OBJ-008': async (ctx) => {
    await needObject(ctx);
    const { page, check, note } = ctx;
    const v = await read(page);
    const w = await workspace(page);
    await ctx.snap('Projects domain breakdown: the project cards and the page counter', page.getByText(/projects domain breakdown/i).first());
    note(`${v.cards.length} project cards; pager ${v.pager ? `Page ${v.pager.page} of ${v.pager.pages} · ${v.pager.total} projects` : '(not found)'}; projects API total ${w.ptotal}.`);
    await check('"Projects domain breakdown" is shown', () => anyShown(page.getByText(/projects domain breakdown/i)));
    await check('The page counter reads "Page N of M · X projects"', () => expect(v.pager, 'no "Page N of M · X projects" text found').not.toBeNull());
    await check('The number of projects in the counter equals the "Projects" tile', () => expect(v.pager?.total).toBe(v.projects));
    await check('The number of projects equals the project list the page loads (runtime-api projects)', () => expect(v.projects, `projects API returned ${w.projects.length}`).toBe(w.projects.length));
    await check('The number of cards shown equals the number of projects (when there is one page)', () => {
      if ((v.pager?.pages ?? 1) === 1) expect(v.cards.length).toBe(v.projects);
    });
    await check('Every card shows a score (or N/A), a status word, the project name and the five domains', () => {
      expect(v.cards.length).toBeGreaterThan(0);
      for (const c of v.cards) {
        expect(c.score, `${c.name} score`).toMatch(/^(\d{1,3}|N\/A)$/);
        expect(c.status, `${c.name} status`).toMatch(/^[A-Z][A-Z ]*$/);
        expect(c.domains.length, `${c.name} domains`).toBe(5);
        c.domains.forEach((d) => expect(d, `${c.name} domain value`).toMatch(/^(N\/A|\d{1,3})$/));
      }
    });
    await check('A card with no run says "NOT STARTED", has N/A everywhere and "no executions yet"', () => {
      for (const c of v.cards.filter((x) => /no executions yet/i.test(x.sub))) {
        expect(c.status, `${c.name} status`).toBe('NOT STARTED');
        expect(c.score, `${c.name} score`).toBe('N/A');
        expect(c.domains.every((d) => d === 'N/A'), `${c.name} domains`).toBe(true);
      }
    });
    await check('A card with a run shows the branch and how long ago it ran (e.g. "master · about 17 hours ago")', () => {
      for (const c of v.cards.filter((x) => !/no executions yet/i.test(x.sub))) {
        expect(c.sub, `${c.name}: "${c.sub}"`).toMatch(/\S.* · .*(ago|now)$/i);
        expect(c.status, `${c.name} status`).not.toBe('NOT STARTED');
      }
    });
    await check('No project name appears on two cards', () => expect(new Set(v.cards.map((c) => c.name)).size).toBe(v.cards.length));
  },

  'OBJ-009': async (ctx) => {
    await needObject(ctx);
    const { page, check, note } = ctx;
    const v = await read(page);
    const w = await workspace(page);
    await ctx.snap('Projects domain breakdown: project cards with score and branch', page.getByText(/projects domain breakdown/i).first());
    const nameOf = new Map(w.projects.map((p) => [p.id, p.name]));
    note(`Latest run per project (API): ${w.latest.map((r) => `${nameOf.get(r.project_id)} ${r.branch_name} ${r.overall_score === null ? 'N/A' : Math.round(num(r.overall_score))}`).join('; ')}`);
    const onePage = (v.pager?.pages ?? 1) <= 1;
    if (!onePage) note(`The cards are spread over ${v.pager?.pages} pages, so only the cards of the page shown can be compared with the project list.`);
    await check('The two data calls worked (runtime-api projects and views-api runs/latest-by-project)', () => expect([w.pStatus, w.aStatus]).toEqual([200, 200]));
    await check('Every project from the project list has a card', () => {
      if (!onePage) return;
      const shown = new Set(v.cards.map((c) => c.name));
      expect(w.projects.filter((p) => !shown.has(p.name)).map((p) => p.name), 'projects without a card').toEqual([]);
    });
    await check('Every card is a project from the project list', () => {
      const known = new Set(w.projects.map((p) => p.name));
      expect(v.cards.filter((c) => !known.has(c.name)).map((c) => c.name), 'cards that are not projects').toEqual([]);
    });
    await check('Each project with a run shows the score of its latest run (run API, rounded)', () => {
      for (const r of w.latest) {
        const c = v.cards.find((x) => x.name === nameOf.get(r.project_id));
        if (!c && !onePage) continue;
        expect(c, `no card for ${nameOf.get(r.project_id)}`).toBeDefined();
        if (r.overall_score === null) { expect(c!.score, `${c!.name}: API has no score`).toBe('N/A'); continue; }
        expect(Math.abs(num(c!.score) - num(r.overall_score)), `${c!.name}: card ${c!.score}, API ${r.overall_score}`).toBeLessThanOrEqual(1);
      }
    });
    await check('Each project with a run shows the branch of its latest run', () => {
      for (const r of w.latest) {
        const c = v.cards.find((x) => x.name === nameOf.get(r.project_id));
        if (!c && !onePage) continue;
        // a very long branch name is cut short by the card ("CS_VNET8_SDKMSBUILD_NUGETPACKAGE · 1 day ago"), so the shown part must be the start of the branch
        const shown = (c?.sub ?? '').split('·')[0].replace(/…|\.\.\./g, '').trim();
        expect(shown.length > 0 && r.branch_name.toLowerCase().startsWith(shown.toLowerCase()), `${c?.name}: the card shows "${shown}", API branch ${r.branch_name}`).toBe(true);
      }
    });
    await check('A project without a run is shown as NOT STARTED', () => {
      const withRun = new Set(w.latest.map((r) => nameOf.get(r.project_id)));
      for (const c of v.cards.filter((x) => !withRun.has(x.name))) expect(c.status, `${c.name}`).toBe('NOT STARTED');
    });
    await check('On a card with a run the Whitebox figure equals the card score', () => {
      for (const c of v.cards.filter((x) => x.score !== 'N/A')) expect(num(c.domains[0]), `${c.name}: score ${c.score}, Whitebox ${c.domains[0]}`).toBe(num(c.score));
    });
  },

  'OBJ-010': async (ctx) => {
    await needObject(ctx);
    const { page, check, note } = ctx;
    const v = await read(page);
    await ctx.snap('Project cards with their status words, and the Avg Confidence tile', page.getByText(/projects domain breakdown/i).first());
    const scored = v.cards.filter((c) => c.score !== 'N/A');
    const avgCards = scored.length ? scored.reduce((s, c) => s + num(c.score), 0) / scored.length : NaN;
    const ship = scored.filter((c) => c.status === 'SHIP').map((c) => num(c.score));
    const hold = scored.filter((c) => c.status !== 'SHIP').map((c) => num(c.score));
    note(`Scored cards: ${scored.length}; their average is ${avgCards.toFixed(1)}; the Avg Confidence tile shows ${v.avg}. Lowest SHIP score ${ship.length ? Math.min(...ship) : '-'}, highest other score ${hold.length ? Math.max(...hold) : '-'}.`);
    await check('Every card with a score has a status word (SHIP / HOLD ...)', () => scored.forEach((c) => expect(c.status, c.name).not.toMatch(/NOT STARTED|^$/)));
    await check('A higher score never has a worse status (every SHIP score is above every non-SHIP score)', () => {
      if (ship.length && hold.length) expect(Math.min(...ship), `lowest SHIP ${Math.min(...ship)} vs highest other ${Math.max(...hold)}`).toBeGreaterThan(Math.max(...hold));
    });
    await check('The rating word of the Avg Confidence tile follows the same rule as the cards', () => {
      const t = num(v.avg);
      if (ship.length && hold.length) {
        if (t > Math.max(...hold) && t >= Math.min(...ship)) expect(v.rating).toBe('SHIP');
        else if (t <= Math.max(...hold)) expect(v.rating).not.toBe('SHIP');
      }
    });
    await check('"Avg Confidence" equals the average score of the projects shown below (rounded)', () =>
      expect(num(v.avg), `average of the ${scored.length} scored project cards is ${avgCards.toFixed(1)}; the tile shows ${v.avg} (it equals this run's score instead)`).toBe(Math.round(avgCards)));
  },

  'OBJ-011': async (ctx) => {
    await needObject(ctx);
    const { page, check } = ctx;
    const about = page.getByRole('button', { name: /about confidence object/i }).first();
    await check('"About Confidence Object" is shown', () => expect(about).toBeVisible());
    await about.hover().catch(() => undefined);
    await check('"About Confidence Object" shows an explanation text when pointed at', async () => {
      const tips = page.locator('[role="tooltip"], [data-slot="tooltip-content"], [data-radix-popper-content-wrapper], [role="dialog"], [role="status"]');
      const title = norm((await about.getAttribute('title').catch(() => '')) ?? '');
      await expect.poll(async () => {
        if (title.length > 10) return true;   // a plain browser tooltip (title attribute) is an explanation text too
        for (const t of await tips.all()) if (await t.isVisible().catch(() => false) && norm(await t.innerText().catch(() => '')).length > 10) return true;
        return false;
      }, { timeout: 8_000, message: 'no explanation text appeared' }).toBe(true);
    });
    await ctx.snap('"About Confidence Object" pointed at, explanation shown', about);
    await page.mouse.move(0, 0);
  },

  'OBJ-012': async (ctx) => {
    await needObject(ctx);
    const { page, check, note } = ctx;
    const before = await read(page);
    const bad: string[] = [];
    const seen = new Set<string>();
    const onResponse = (r: { url(): string; status(): number }): void => {
      const u = r.url();
      if (/\/(runtime-api|views-api)\//.test(u)) {
        seen.add(new URL(u).pathname.replace(/[0-9a-f-]{36}/g, '<id>'));
        if (r.status() >= 400) bad.push(`${r.status()} ${new URL(u).pathname}`);
      }
    };
    page.on('response', onResponse);
    await ctx.step('Reload the page', async () => {
      await page.reload();
      await page.getByText(/^\s*Confidence Domains\s*$/i).first().waitFor({ state: 'visible', timeout: 45_000 });
      await page.getByText(/Page \d+ of \d+/).first().waitFor({ state: 'visible', timeout: 45_000 });
    });
    // wait (poll) until the page has made its two data calls, instead of sleeping a fixed time
    await expect.poll(() => [...seen].some((x) => /\/projects$/.test(x)) && [...seen].some((x) => /latest-by-project/.test(x)), { timeout: 15_000 }).toBe(true).catch(() => undefined);
    page.off('response', onResponse);
    await ctx.snap('Confidence Object page after the reload', page.getByText(/^\s*Avg Confidence\s*$/i).first().locator('xpath=ancestor::*[contains(., "Open Risks")][1]'));
    const after = await read(page);
    note(`Data calls seen after the reload: ${[...seen].join(', ') || '(none)'}`);
    await check('The same run and page are shown after a reload', () => { expect(runId(page)).not.toBe(''); expect(page.url()).toContain('pillar=object'); });
    await check('The tiles show the same figures after the reload', () =>
      expect([after.avg, after.projects, after.validations, after.shipRate, after.openRisks]).toEqual([before.avg, before.projects, before.validations, before.shipRate, before.openRisks]));
    await check('The same project cards (names and scores) are shown after the reload', () =>
      expect(after.cards.map((c) => `${c.name}:${c.score}`)).toEqual(before.cards.map((c) => `${c.name}:${c.score}`)));
    await check('The page loads the project list and the latest run per project', () => {
      expect([...seen].some((p) => /\/projects$/.test(p)), 'projects call not seen').toBe(true);
      expect([...seen].some((p) => /latest-by-project/.test(p)), 'latest-by-project call not seen').toBe(true);
    });
    await check('No data call returned an error (4xx / 5xx)', () => expect(bad, bad.join(', ')).toEqual([]));
  },

  'OBJ-013': async (ctx) => {
    await needObject(ctx);
    const { page, check } = ctx;
    const id = runId(page);
    const back = page.getByRole('link', { name: /back to confidence engine/i }).first();
    await ctx.snap('The "Back to Confidence Engine" link', back);
    await check('"Back to Confidence Engine" is shown and goes to the engine page of this run', async () => {
      await expect(back).toBeVisible();
      await expect(back).toHaveAttribute('href', new RegExp(`runId=${id}.*pillar=engine|pillar=engine.*runId=${id}`));
    });
    await ctx.step('Click "Back to Confidence Engine"', async () => {
      await back.click();
      await page.waitForURL(/pillar=engine/, { timeout: 20_000 });
    });
    await check('The Confidence Engine page is shown again for the same run', async () => {
      await anyShown(page.getByText(/^\s*PR Confidence Analysis\s*$/i), 30_000);
      expect(runId(page)).toBe(id);
    });
    await check('The scores are still there after coming back', () => anyShown(page.getByText(/^\s*Confidence Score\s*$/i), 20_000));
  },
};
