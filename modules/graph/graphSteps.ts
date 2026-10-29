import { expect, Locator, Page } from '@playwright/test';
import { closeMenus, comingSoonCard } from '../../core/pages/menus';
import { apiGet, tenantOf } from '../../core/pages/runApi';
import { CaseHandler } from '../../core/runner/registerCases';
import { inputs } from '../flow/helpers';
import { RepoPage } from '../repo/shared/RepoPage';
import { obj as locatorOf } from '../../core/keywords/obj';

import { expected as expectedOf, listOf } from '../../core/keywords/expected';
/**
 * The Confidence Graph module: every part of /confidence-engine?pillar=graph for the run that just finished.
 * Verified live. Checks use locators (roles, names, labels, text, table cells, chart elements) and the same run API calls the page
 * makes (views-api runs list, runtime-api run) - never screenshots. Nothing here starts a run, downloads a file or submits a question:
 * "Run Analysis" (title "Refresh run metrics"), "Download taxonomy report" and "Submit question" are only checked, never clicked.
 */

interface ApiRun {
  run_id: string; branch_id: string; branch_name: string; commit_sha: string; status: string; phase: string; trigger_type: string;
  overall_score: number | null; duration_seconds: number | null; started_at: string; created_at: string;
  total_tasks: number; completed_tasks: number; failed_tasks: number; skipped_tasks: number;
}

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();
const num = (s: string | undefined | null): number => Number(String(s ?? '').replace(/[^\d.\-]/g, ''));
const runId = (page: Page): string => new URL(page.url()).searchParams.get('runId') ?? '';
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The runs of the same branch as the open run, newest first (what the page lists), read from the views-api the page uses. */
async function branchRuns(page: Page): Promise<{ all: ApiRun[]; mine?: ApiRun; branchRuns: ApiRun[]; status: number }> {
  const q = new URL(page.url()).searchParams;
  const tenant = await tenantOf(page);
  const r = await apiGet(page, `/views-api/v1/runs?tenant_id=${tenant}&project_id=${q.get('projectId')}&repository_id=${q.get('repositoryId')}&limit=50`);
  const all: ApiRun[] = r.status === 200 ? ((r.json?.runs ?? []) as ApiRun[]) : [];
  const mine = all.find((x) => x.run_id === runId(page));
  return { all, mine, branchRuns: mine ? all.filter((x) => x.branch_id === mine.branch_id) : [], status: r.status };
}

/** Opens the Confidence Graph page of the run (clicks the link when the page is on another pillar). SKIPS when there is no finished run page. */
async function needGraph(ctx: Parameters<CaseHandler<RepoPage>>[0]): Promise<void> {
  const { page } = ctx;
  await closeMenus(page);
  const onEngine = /\/confidence-engine/.test(page.url()) && !!runId(page);
  if (!onEngine) ctx.skip('The Confidence Engine page of a finished run is not open (the Execution module did not get a run to its results), so the Confidence Graph cannot be opened.');
  if (!/pillar=graph/.test(page.url())) {
    await locatorOf(page, 'graph.css.a-href-confidence-engine-href-pillar').first().click();
    await page.waitForURL(/pillar=graph/, { timeout: 30_000 }).catch(() => ctx.skip('Clicking "Confidence Graph" did not open the graph page.'));
  }
  await locatorOf(page, 'graph.heading.confidence-graph').waitFor({ state: 'visible', timeout: 30_000 })
    .catch(() => ctx.skip('The Confidence Graph page did not show its title.'));
  await locatorOf(page, 'graph.table.item').first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => undefined);
}

/** The Previous / Next buttons that sit together with a pager label ("Page N of M ..."), so the two pagers of the page are never mixed up. */
const pagerOf = (label: Locator) => {
  const box = locatorOf(label.first(), 'graph.css.xpath-ancestor-button-normalize-spac');
  return { prev: locatorOf(box, 'graph.button.previous'), next: locatorOf(box, 'graph.button.next'), box };
};
const flowCard = (page: Page): Locator => locatorOf(locatorOf(page, 'graph.text.whitebox-confidence').first(), 'graph.css.xpath-ancestor-contains-translate-ab');
const clock = (page: Page, iso: string): Promise<string> =>
  page.evaluate((i) => new Date(i).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), iso);
/** Passes as soon as ANY element of the locator is visible (the first match may be a hidden duplicate); polls instead of sleeping. */
const anyShown = (loc: Locator, timeout = 10_000): Promise<void> =>
  expect.poll(async () => { for (const l of await loc.all()) if (await l.isVisible().catch(() => false)) return true; return false; }, { timeout }).toBe(true);
/** The Pipeline Run History table (the one with the "Run ID" column) and its run rows (a "no results" row has no run id). */
const historyTable = (page: Page): Locator => locatorOf(page, 'graph.css.table').filter({ has: page.locator('th', { hasText: /run id/i }) }).first();
const runRows = (page: Page): Locator => locatorOf(historyTable(page), 'graph.css.tbody-tr').filter({ hasText: /[0-9a-f]{8}-/i });
/** Seconds from a duration text like "45s", "2m 10s" or "1h 5m 3s". */
const seconds = (txt: string): number => {
  const g = (re: RegExp): number => num(txt.match(re)?.[1] ?? '0');
  return /[hms]/i.test(txt) ? g(/(\d+)\s*h/i) * 3600 + g(/(\d+)\s*m(?!s)/i) * 60 + g(/(\d+)\s*s/i) : num(txt);
};

export const graphSteps: Record<string, CaseHandler<RepoPage>> = {
  'GR-001': async (ctx) => {
    await needGraph(ctx);
    const { page, check, snap } = ctx;
    const id = runId(page);
    await snap('Confidence Graph page title and breadcrumb', locatorOf(page, 'graph.heading.confidence-graph'));
    await check('The address is /confidence-engine with pillar=graph for the same run id', () => {
      const u = new URL(page.url());
      expect(u.pathname).toBe('/confidence-engine');
      expect(u.searchParams.get('pillar')).toBe('graph');
      expect(u.searchParams.get('runId')).toBe(id);
    });
    await check('The address also carries a projectId, a repositoryId and the branch', () => {
      const u = new URL(page.url());
      expect(u.searchParams.get('projectId') ?? '').toMatch(/^[0-9a-f-]{36}$/);
      expect(u.searchParams.get('repositoryId') ?? '').toMatch(/^[0-9a-f-]{36}$/);
      expect(u.searchParams.get('branch') ?? '').not.toBe('');
    });
    await check('The page is not sent to the login page', () => expect(page).not.toHaveURL(/\/auth\//));
    await check('The page title "Confidence Graph" is shown', () => expect(locatorOf(page, 'graph.heading.confidence-graph')).toBeVisible());
    await check('The breadcrumb shows "Confidence Graph" and the start of the run id', async () => {
      const crumb = locatorOf(page, 'graph.navigation.breadcrumb');
      await expect(crumb).toContainText(expectedOf('graph.text.confidence-graph'));
      expect(norm(await locatorOf(page, 'graph.css.body').innerText())).toMatch(new RegExp(`run\\s*${id.slice(0, 8)}`, 'i'));
    });
    await check('No error message is shown', () => expect(locatorOf(page, 'graph.text.something-went-wrong-failed-to-load')).toHaveCount(0));
  },

  'GR-002': async (ctx) => {
    await needGraph(ctx);
    const { page, check, snap } = ctx;
    const menu = locatorOf(page, 'graph.navigation.workspace');
    await snap('Left menu of the Confidence Graph page', menu);
    for (const [name, href] of [['Dashboard', '/dashboard'], ['Confidence Engine', '/confidence-engine'], ['Execution Assistant', '/execution-assistant'], ['Account and Plan', '/account']] as const) {
      await check(`Left menu link "${name}" is shown and goes to ${href}`, async () => {
        const link = locatorOf(menu, 'graph.link.by-name', name).first();
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('href', new RegExp(href));
      });
    }
    await check('"Confidence Engine" is the current page in the left menu (aria-current)', () => expect(locatorOf(menu, 'graph.link.confidence-engine').first()).toHaveAttribute('aria-current', expectedOf('graph.attr.page')));
    await check('The executions meter ("Executions: used / limit") is shown, links to /account and used is not above the limit', async () => {
      const meter = locatorOf(page, 'graph.css.a-href-account').filter({ hasText: /Executions:\s*\d+\s*\/\s*\d+/ }).first();
      await expect(meter).toBeVisible();
      const m = norm(await meter.innerText()).match(/Executions:\s*(\d+)\s*\/\s*(\d+)/)!;
      expect(num(m[1])).toBeLessThanOrEqual(num(m[2]));
    });
    for (const b of listOf('graph.list.b-sign-out')) await check(`The "${b}" button is shown`, () => expect(locatorOf(page, 'graph.button.by-b', b).first()).toBeVisible());
    for (const [name, pillar] of [['Confidence Object', 'object'], ['Confidence Graph', 'graph'], ['Confidence Engine', 'engine']] as const) {
      await check(`The top link "${name}" points to this run with pillar=${pillar}`, async () => {
        const link = locatorOf(page, 'graph.css.by-a-href-confidence-engine-href', pillar).first();
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('href', expectedOf('graph.attr.by-runid-runId', runId(page)));
      });
    }
    await check('"Closed-Loop Intel" is marked COMING SOON', () => expect(comingSoonCard(page).first()).toBeVisible());
    await check('The header shows the start of the run id ("run fc4e0e16…") and the branch picker shows the branch with the commit (7 hex)', async () => {
      const t = norm(await locatorOf(page, 'graph.css.body').innerText());
      expect(t, 'run id start in the header').toMatch(new RegExp(`run\\s*${runId(page).slice(0, 8)}`, 'i'));
      expect(t, 'branch · commit in the branch picker').toMatch(/\S+\s*·\s*[0-9a-f]{7}\b/i);
    }, [locatorOf(page, 'graph.text.run-0-9a-f-6').first(), locatorOf(page, 'graph.button.0-9a-f-7').first()]);
  },

  'GR-003': async (ctx) => {
    await needGraph(ctx);
    const { page, check, note, snap } = ctx;
    const box = locatorOf(page, 'graph.textbox.ask-a-confidence-question');
    await snap('The question box "Ask a confidence question"', box);
    await check('The question box "Ask a confidence question" is shown with its hint', async () => {
      await expect(box).toBeVisible();
      await expect(box).toHaveAttribute('placeholder', expectedOf('graph.attr.ask-a-confidence-question'));
    });
    await check('The question box can be typed in', () => expect(box).toBeEditable());
    await check('Typed text stays in the box and can be cleared', async () => {
      await box.fill('draft only - not sent');
      await expect(box).toHaveValue(expectedOf('graph.value.draft-only-not-sent'));
      await box.fill('');
      await expect(box).toHaveValue('');
    });
    await check('The "Submit question" button is shown', () => expect(locatorOf(page, 'graph.button.submit-question')).toBeVisible());
    await check('The chat thread of the run is still shown on the left (it says the run is complete)', () => anyShown(locatorOf(page, 'graph.text.run-is-complete')));
    await check('The "Branch run" selector is shown with this run', async () => {
      const s = locatorOf(page, 'graph.combobox.branch-run');
      await expect(s).toBeVisible();
      await expect(s).toContainText(expectedOf('graph.text.by-pattern-runId', runId(page).slice(0, 8)));
    });
    note('"Submit question" is only checked, never clicked (a click would send a question).');
  },

  'GR-004': async (ctx) => {
    await needGraph(ctx);
    const { page, check, note } = ctx;
    const btn = locatorOf(page, 'graph.button.run-analysis');
    await ctx.snap('The "Run Analysis" button next to the page title', btn);
    await check('The "Run Analysis" button is shown', () => expect(btn).toBeVisible());
    await check('The "Run Analysis" button is enabled', () => expect(btn).toBeEnabled());
    await check('Its tooltip (title) says what it does ("Refresh run metrics")', () => expect(btn).toHaveAttribute('title', expectedOf('graph.attr.refresh-run-metrics')));
    await check('The "Run Analysis" button sits next to the page title "Confidence Graph"', async () => {
      const head = locatorOf(page, 'graph.heading.confidence-graph');
      await expect(head).toBeVisible();
      const [h, b] = [await head.boundingBox(), await btn.boundingBox()];
      expect(h && b && Math.abs(h.y - b.y) < 80, 'the button is not next to the section title').toBe(true);
    });
    note('The button is labelled "Run Analysis" but its tooltip says "Refresh run metrics"; it is not clicked because a click could start a new analysis.');
  },

  'GR-005': async (ctx) => {
    await needGraph(ctx);
    const { page, check, note } = ctx;
    const { mine, branchRuns: list } = await branchRuns(page);
    const scored = list.filter((r) => r.overall_score !== null);
    await check('"Confidence Trend" is shown', () => anyShown(locatorOf(page, 'graph.text.confidence-trend')));
    const count = locatorOf(page, 'graph.text.runs-with-scores').first();
    await ctx.snap('Confidence Trend header with the Org / WB / BB figures', count);
    await check('The line "Last N runs with scores" is shown', () => expect(count).toBeVisible());
    await check('N equals the number of runs of this branch that have a score (run API)', async () =>
      expect(num((await count.innerText()).match(/(\d+)\s+runs?/i)?.[1]), 'N in "Last N runs with scores"').toBe(scored.length));
    const text = norm(await locatorOf(page, 'graph.css.body').innerText());
    // "<change> <Org> Org <WB> WB <BB> BB", e.g. "+10 pts 85 Org 85 WB N/A BB"; the change figure is optional text before the Org figure
    const m = text.match(/runs?\s+with\s+scores?\s+(?:(.*?)\s+)?(\S+)\s+Org\s+(\S+)\s+WB\s+(\S+)\s+BB/i);
    await check('The three figures "Org", "WB" and "BB" are shown', () => expect(m).not.toBeNull());
    if (m) {
      const fig = /^(\d{1,3}(\.\d+)?%?|N\/A|—|-)$/i;
      note(`Header figures: change ${m[1] ?? '(none)'}, Org ${m[2]}, WB ${m[3]}, BB ${m[4]}`);
      await check('Org is a score from 0 to 100 (or N/A)', () => { expect(m[2]).toMatch(fig); if (/\d/.test(m[2])) expect(num(m[2])).toBeLessThanOrEqual(100); });
      await check('WB and BB are a score from 0 to 100 or N/A', () => { expect(m[3]).toMatch(fig); expect(m[4]).toMatch(fig); });
      if (mine?.overall_score != null) await check('Org equals the score of this run in the runs list (rounded)', () => expect(Math.abs(num(m[2]) - mine.overall_score!)).toBeLessThanOrEqual(1));
      if (scored.length < 2) await check('With only one scored run the change figure is "—" (nothing to compare with)', () => expect((m[1] ?? '').trim()).toMatch(/^[—–-]$/));
    }
  },

  'GR-006': async (ctx) => {
    await needGraph(ctx);
    const { page, check, note } = ctx;
    const { branchRuns: list } = await branchRuns(page);
    const scored = list.filter((r) => r.overall_score !== null);
    // The trend chart is the BIGGEST drawing on the page that has points (circles); the page also has small icons that contain circles.
    await page.evaluate(() => {
      document.querySelectorAll('[data-e2e-chart]').forEach((e) => e.removeAttribute('data-e2e-chart'));
      let best: Element | null = null; let area = 0;
      document.querySelectorAll('svg').forEach((sv) => {
        if (!sv.querySelector('circle')) return;
        const r = sv.getBoundingClientRect();
        if (r.width * r.height > area) { area = r.width * r.height; best = sv; }
      });
      (best as Element | null)?.setAttribute('data-e2e-chart', '1');
    });
    const chart = locatorOf(page, 'graph.css.svg-data-e2e-chart-1');
    const card = locatorOf(chart, 'graph.css.xpath-ancestor-contains-confidence-t');
    await check('The trend chart is shown', () => expect(chart).toBeVisible());
    await ctx.snap('The Confidence Trend chart card', card);
    const facts = await chart.evaluate((sv) => {
      const big = [...sv.querySelectorAll('circle')].filter((c) => c.getBoundingClientRect().width >= 5);
      const lines = [...sv.querySelectorAll('path')].filter((p) => { const st = getComputedStyle(p); return st.stroke !== 'none' && parseFloat(st.strokeWidth) > 0 && (p.getAttribute('d') ?? '').length > 20; });
      // each point may be drawn as several circles (a dot and a ring), so count the different places
      const places = new Set(big.map((c) => { const b = c.getBoundingClientRect(); return `${Math.round((b.x + b.width / 2) / 4)}`; }));
      return { points: places.size, lines: lines.length, texts: [...sv.querySelectorAll('text')].map((t) => (t.textContent ?? '').trim()) };
    }).catch(() => ({ points: 0, lines: 0, texts: [] as string[] }));
    const cardText = norm(await card.innerText().catch(() => ''));
    note(`Chart drawing: ${facts.lines} line(s), ${facts.points} point(s), ${facts.texts.length} text label(s) inside the drawing.`);
    await check('The chart has a drawn line', () => expect(facts.lines, 'no drawn line (path with a stroke) in the chart').toBeGreaterThanOrEqual(1));
    await check('The vertical axis shows 100, 80, 60, 40, 20, 0', () => {
      const words = `${facts.texts.join(' ')} ${cardText}`.split(/\s+/);
      for (const v of ['100', '80', '60', '40', '20', '0']) expect(words, `axis value ${v}`).toContain(v);
    });
    await check('There is one point on the chart for every scored run of this branch', () => expect(facts.points).toBe(scored.length));
    await check('Every point is labelled with its commit (#xxxxxxx) matching the runs list', () => {
      const labels = `${facts.texts.join(' ')} ${cardText}`;
      for (const r of scored) expect(labels.toLowerCase(), `commit ${r.commit_sha.slice(0, 7)}`).toContain(`#${r.commit_sha.slice(0, 7).toLowerCase()}`);
    });
    await check('Every point sits inside the chart area', async () => {
      const box = await chart.boundingBox();
      for (const c of await locatorOf(chart, 'graph.css.circle').all()) {
        const b = await c.boundingBox();
        if (!b || b.width < 5) continue;
        const [cx, cy] = [b.x + b.width / 2, b.y + b.height / 2];   // the centre of the point (its edge ring may touch the border)
        expect(box && cx >= box.x - 2 && cx <= box.x + box.width + 2 && cy >= box.y - 2 && cy <= box.y + box.height + 2, 'a point is outside the chart').toBe(true);
      }
    });
    await check('The rating label under the chart ("Hold", "Pass" etc.) is shown', () => anyShown(locatorOf(page, 'graph.text.hold-pass-fail-go-no-go-ship-block')));
    note(`${scored.length} scored run(s) on this branch: ${scored.map((r) => `#${r.commit_sha.slice(0, 7)}=${r.overall_score}`).join(', ')}`);
  },

  'GR-007': async (ctx) => {
    await needGraph(ctx);
    const { page, check, note } = ctx;
    const report = locatorOf(page, 'graph.button.download-taxonomy-report');
    await ctx.snap('The "Download taxonomy report" button', report);
    await check('"Download taxonomy report" is shown', () => expect(report).toBeVisible(), report);
    await check('"Download taxonomy report" is enabled', () => expect(report).toBeEnabled(), report);
    note('The report button is only checked, not clicked (a click downloads a file). The chart filters are not tested.');
  },

  'GR-008': async (ctx) => {
    await needGraph(ctx);
    const { page, check, note } = ctx;
    const { mine } = await branchRuns(page);
    const card = flowCard(page);
    await ctx.snap('The Whitebox Confidence flow card', card);
    await check('The "Whitebox Confidence" flow card is shown', () => expect(card).toBeVisible());
    const t = norm(await card.innerText().catch(() => ''));
    await check('"Run time · DD-MM-YYYY HH:MM" is shown', () => expect(t).toMatch(/Run time\s*·\s*\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}/));
    await check('The CODE step shows the commit of the run', () => expect(t).toMatch(new RegExp(`CODE\\s*#${(mine?.commit_sha ?? '').slice(0, 7) || '[0-9a-f]{7}'}`, 'i')));
    await check('The STATIC SIGNALS step shows the branch and the start of the run id', () => {
      expect(t).toMatch(/STATIC SIGNALS/i);
      // a long branch name may be cut short by the card, so the start of the branch is enough
      if (mine) { expect(t.toLowerCase()).toContain(mine.branch_name.slice(0, 12).toLowerCase()); expect(t.toLowerCase()).toContain(mine.run_id.slice(0, 8).toLowerCase()); }
    });
    const conf = t.match(/CONFIDENCE\s*(\d{1,3})\s*%\s*([A-Za-z-]+)/i);
    await check('The CONFIDENCE step shows a percentage and a rating word', () => expect(conf).not.toBeNull());
    if (conf && mine?.overall_score != null) await check('The percentage equals the run score (rounded)', () => expect(Math.abs(num(conf[1]) - mine.overall_score!)).toBeLessThanOrEqual(1));
    if (mine) {
      const failedNote = locatorOf(page, 'graph.text.pipeline-run-failed');
      await check('The "Pipeline run failed" note is shown exactly when the runs list says the run status is "failed"', async () =>
        expect((await failedNote.count()) > 0).toBe(mine.status === 'failed'));
      note(`Run status in the runs list: ${mine.status}, phase: ${mine.phase}`);
    }
  },

  'GR-009': async (ctx) => {
    await needGraph(ctx);
    const { page, check, note } = ctx;
    const label = locatorOf(page, 'graph.text.page-of-whitebox-pipeline').first();
    const p = pagerOf(label);
    await ctx.snap('The whitebox pipeline pager', label);
    await check('"Page N of M · whitebox pipeline" is shown', () => expect(label).toBeVisible());
    const m = norm(await label.innerText().catch(() => '')).match(/Page (\d+) of (\d+)/i);
    await check('The current page is between 1 and the number of pages', () => { expect(num(m?.[1])).toBeGreaterThanOrEqual(1); expect(num(m?.[1])).toBeLessThanOrEqual(num(m?.[2])); });
    await check('"Previous" is disabled on the first page', async () => { if (num(m?.[1]) <= 1) await expect(p.prev.first()).toBeDisabled(); });
    await check('"Next" is disabled when there is only one page', async () => { if (num(m?.[2]) <= 1) await expect(p.next.first()).toBeDisabled(); });
    // only the buttons of THIS pager (the one under the whitebox pipeline), not the run-history pager further down
    const box = locatorOf(label, 'graph.css.xpath-ancestor-button-normalize-spac-2');
    await check('The button for page 1 is enabled', () => expect(locatorOf(box, 'graph.button.1').first()).toBeEnabled());
    const numbers = (await locatorOf(box, 'graph.button.item').evaluateAll((els) => els.map((e) => e.textContent))).length;
    await check('The pager does not list more pages than there are', () => expect(numbers, `${numbers} page buttons for ${m?.[2]} page(s)`).toBeLessThanOrEqual(Math.max(num(m?.[2]), 1)), box);
    note(`Pager: page ${m?.[1]} of ${m?.[2]}`);
  },

  'GR-010': async (ctx) => {
    await needGraph(ctx);
    const { page, check, note } = ctx;
    const { branchRuns: list } = await branchRuns(page);
    await ctx.snap('The Pipeline Run History table', historyTable(page));
    await check('"Pipeline Run History" is shown', () => anyShown(locatorOf(page, 'graph.text.pipeline-run-history')));
    note(`The "N recent executions" line on the page reads: ${norm(await locatorOf(page, 'graph.text.recent-executions').first().innerText().catch(() => '(not found)'))}; the runs list API has ${list.length} run(s) on this branch.`);
    await check('The table has the columns Run ID, Trigger, Story, Time, Duration, Status and Score', async () => {
      const heads = (await locatorOf(historyTable(page), 'graph.css.thead-th').allInnerTexts()).map((h) => norm(h).toLowerCase());
      for (const c of listOf('graph.list.c-run-id')) expect(heads.some((h) => h.includes(c.toLowerCase())), `column ${c} (columns: ${heads.join(', ')})`).toBe(true);
    });
    const rows = runRows(page);
    await check('There is one row for every run of this branch (up to one page)', async () => expect(await rows.count()).toBe(Math.min(list.length, 10)));
    await check('The newest run is first (same order as the runs list)', async () => {
      const ids = (await rows.evaluateAll((trs) => trs.map((r) => (r.querySelector('td')?.textContent ?? '').trim().slice(0, 8).toLowerCase())));
      expect(ids).toEqual(list.slice(0, ids.length).map((r) => r.run_id.slice(0, 8).toLowerCase()));
    });
    for (const r of list.slice(0, 10)) {
      const row = rows.filter({ hasText: r.run_id.slice(0, 8) }).first();
      const label = `Run ${r.run_id.slice(0, 8)}`;
      await check(`${label}: the row is shown with a shortened id ending in "…"`, async () => { await expect(row).toBeVisible(); await expect(locatorOf(row, 'graph.css.td').nth(0)).toContainText(expectedOf('graph.text.by-pattern')); }, row);
      await check(`${label}: Trigger is "${r.trigger_type}"`, async () => {
        const got = (await locatorOf(row, 'graph.css.td').nth(1).innerText()).toLowerCase().replace(/[^a-z0-9]/g, '');
        expect(got, 'Trigger cell').toContain(r.trigger_type.toLowerCase().replace(/[^a-z0-9]/g, ''));
      }, locatorOf(row, 'graph.css.td').nth(1));
      await check(`${label}: Time is the start time (HH:MM)`, async () => {
        const want = [await clock(page, r.started_at), await clock(page, r.created_at)];
        const got = norm(await locatorOf(row, 'graph.css.td').nth(3).innerText());
        expect(want.some((w) => got.includes(w)), `shows ${got}, expected one of ${want.join(' / ')}`).toBe(true);
      }, locatorOf(row, 'graph.css.td').nth(3));
      await check(`${label}: Duration is shown (not "—")`, async () => {
        const got = norm(await locatorOf(row, 'graph.css.td').nth(4).innerText());
        expect(got, 'Duration column is empty').not.toMatch(/^(—|–|-|)$/);
      }, locatorOf(row, 'graph.css.td').nth(4));
      await check(`${label}: Duration is about the ${r.duration_seconds ?? '?'} s in the run API`, async () => {
        const got = norm(await locatorOf(row, 'graph.css.td').nth(4).innerText());
        expect(Math.abs(seconds(got) - (r.duration_seconds ?? 0)), `shows "${got}"`).toBeLessThanOrEqual(60);
      }, locatorOf(row, 'graph.css.td').nth(4));
      await check(`${label}: Status shows a rating word`, () => expect(locatorOf(row, 'graph.css.td').nth(5)).toHaveText(expectedOf('graph.text.by-pattern-2')), locatorOf(row, 'graph.css.td').nth(5));
      if (r.overall_score !== null) await check(`${label}: Score is ${Math.round(r.overall_score)} (the runs list says ${r.overall_score})`, async () =>
        expect(Math.abs(num(await locatorOf(row, 'graph.css.td').nth(6).innerText()) - r.overall_score!)).toBeLessThanOrEqual(1), locatorOf(row, 'graph.css.td').nth(6));
    }
    note(`${list.length} run(s) on this branch in the API; Story column shows: ${(await locatorOf(rows.first(), 'graph.css.td').nth(2).innerText().catch(() => '')).trim() || '(empty)'}`);
  },

  'GR-011': async (ctx) => {
    await needGraph(ctx);
    const { page, check, note } = ctx;
    const { branchRuns: list } = await branchRuns(page);
    const label = locatorOf(page, 'graph.text.page-of-runs').first();
    const p = pagerOf(label);
    await ctx.snap('The run history pager under the table', label);
    await check('"Page N of M · X run(s)" is shown under the table', () => expect(label).toBeVisible());
    const m = norm(await label.innerText().catch(() => '')).match(/Page (\d+) of (\d+)\s*·?\s*(\d+) runs?/i);
    await check('X equals the number of runs of this branch', () => expect(num(m?.[3])).toBe(list.length));
    await check('The number of pages fits the number of runs (10 per page)', () => expect(num(m?.[2])).toBe(Math.max(1, Math.ceil(list.length / 10))));
    await check('"Previous" is disabled on the first page', async () => { if (num(m?.[1]) <= 1) await expect(p.prev.first()).toBeDisabled(); });
    await check('"Next" is disabled when there is only one page', async () => { if (num(m?.[2]) <= 1) await expect(p.next.first()).toBeDisabled(); });
    note(`History pager: ${m?.[0] ?? 'not read'}`);
  },

  'GR-012': async (ctx) => {
    await needGraph(ctx);
    const { page, check, note } = ctx;
    const box = locatorOf(page, 'graph.placeholder.search-by-story-id');
    await check('The box "Search by story ID…" is shown', () => expect(box).toBeVisible(), box);
    // many pages keep a search box read-only until it is clicked (to stop the browser auto-filling it), so click it first - and again while it loads
    for (let i = 0; i < 5 && !(await box.isEditable().catch(() => false)); i++) { await box.click({ timeout: 3_000 }).catch(() => undefined); await page.waitForTimeout(1_500); }
    const storyCount = await page.evaluate(() => {
      const t = [...document.querySelectorAll('table')].find((x) => [...x.querySelectorAll('th')].some((h) => /run id/i.test(h.textContent ?? '')));
      if (!t) return 0;
      const col = [...t.querySelectorAll('th')].findIndex((h) => /story/i.test(h.textContent ?? ''));
      return [...t.querySelectorAll('tbody tr')].filter((r) => { const x = (r.querySelectorAll('td')[col]?.textContent ?? '').trim(); return x.length >= 2 && !/^[—–-]+$/.test(x); }).length;
    });
    if (!(await box.isEditable().catch(() => false)) && storyCount === 0) {
      note('The search box is read-only and no run of this branch has a story id (the Story column shows "—" everywhere), so there is nothing to search; the search could not be tested on this data.');
      return;
    }
    await check('The search box can be typed in', () => expect(box).toBeEditable({ timeout: 3_000 }), box);
    if (!(await box.isEditable().catch(() => false))) { note('The search box stayed read-only even after clicking it for several seconds, so searching could not be tested.'); return; }
    const rows = runRows(page);
    const before = await rows.count();
    // a story id that really is in the table
    const stories = await page.evaluate(() => {
      const t = [...document.querySelectorAll('table')].find((x) => [...x.querySelectorAll('th')].some((h) => /run id/i.test(h.textContent ?? '')));
      if (!t) return [] as string[];
      const col = [...t.querySelectorAll('th')].findIndex((h) => /story/i.test(h.textContent ?? ''));
      return [...t.querySelectorAll('tbody tr')].map((r) => (r.querySelectorAll('td')[col]?.textContent ?? '').trim()).filter((x) => x.length >= 2 && !/^[—–-]+$/.test(x));
    });
    if (stories.length) {
      const wanted = stories[0];
      await box.fill(wanted);
      await ctx.snap('Search box with an existing story id typed and the filtered runs', box);
      await check(`Typing a story id that exists ("${wanted}") keeps the runs with that story`, async () => {
        await expect.poll(async () => {
          const texts = (await rows.allInnerTexts()).map((x) => x.toLowerCase());
          return texts.length >= 1 && texts.every((x) => x.includes(wanted.toLowerCase()));
        }, { timeout: 10_000, message: 'rows without that story id are still shown, or no rows are shown for an existing story id' }).toBe(true);
      }, box);
    } else note('No run in the table has a story id, so a search for an existing story could not be tested.');
    await box.fill('zzz-no-such-story');
    await ctx.snap('Search box with a story id that does not exist', box);
    await check('A story id that does not exist shows no run rows', () => expect.poll(() => rows.count(), { timeout: 10_000 }).toBe(0), box);
    await box.fill('');
    await check('Clearing the box shows the runs again', () => expect.poll(() => rows.count(), { timeout: 10_000 }).toBe(before), box);
  },

  'GR-013': async (ctx) => {
    await needGraph(ctx);
    const { page, check, note } = ctx;
    const id = runId(page);
    const { mine, status } = await branchRuns(page);
    const tenant = await tenantOf(page);
    const rt = await apiGet(page, `/runtime-api/v1/runs/${id}`);
    await ctx.snap('Confidence Graph page of the run checked against the APIs', locatorOf(page, 'graph.heading.confidence-graph'));
    await check('The runs list API answers (200)', () => expect(status).toBe(200));
    await check('The run API answers (200) for this run', () => expect(rt.status).toBe(200));
    await check('This run is in the runs list', () => expect(mine).toBeDefined());
    if (mine && rt.status === 200) {
      const run = rt.json as Record<string, unknown>;
      note(`Runs list: status ${mine.status}, phase ${mine.phase}, score ${mine.overall_score}; run API: status ${String(run.status)}, phase ${String(run.phase)}, score ${String(run.overall_score)}`);
      await check('Both APIs give the same commit', () => expect(String(run.commit_sha)).toBe(mine.commit_sha));
      await check('Both APIs give the same branch', () => expect(String(run.branch_id)).toBe(mine.branch_id));
      await check('Both APIs say the run phase is "completed"', () => { expect(mine.phase).toBe('completed'); expect(run.phase).toBe('completed'); });
      await check('Both APIs give the same overall score', () => expect(Number(run.overall_score), `run API says ${String(run.overall_score)}, runs list says ${mine.overall_score}`).toBe(Number(mine.overall_score)));
      await check('The duration is filled in the runs list for a finished run', () => expect(mine.duration_seconds ?? 0).toBeGreaterThan(0));
      await check('The tasks add up (completed + failed + skipped = total)', () =>
        expect(mine.completed_tasks + mine.failed_tasks + mine.skipped_tasks).toBe(mine.total_tasks));
    }
    note(tenant ? 'The tenant id was read from the page\'s own requests.' : 'The tenant id could not be read.');
  },

  'GR-014': async (ctx) => {
    await needGraph(ctx);
    const { page, check, note } = ctx;
    const calls: Record<string, number> = {};
    const bad: string[] = [];
    const onResponse = (r: import('@playwright/test').Response) => {
      const u = new URL(r.url());
      if (!/\/(views-api|runtime-api)\//.test(u.pathname)) return;
      const key = u.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id');
      calls[key] = (calls[key] ?? 0) + 1;
      if (r.status() >= 400) bad.push(`${r.status()} ${key}`);
    };
    page.on('response', onResponse);
    await page.waitForTimeout(30_000);
    page.off('response', onResponse);
    const total = Object.values(calls).reduce((a, b) => a + b, 0);
    note(`In 30 s the page made ${total} data calls: ${Object.entries(calls).map(([k, v]) => `${v}× ${k}`).join(', ') || 'none'}`);
    await check('No data call returned an error (4xx / 5xx) in 30 seconds', () => expect(bad).toEqual([]));
    await check('The page does not call the data APIs more than 60 times in 30 seconds', () => expect(total).toBeLessThanOrEqual(60));
    await ctx.snap('The page still showing its title and run history after 30 seconds', historyTable(page));
    await check('The page still shows its data after the calls (title and table)', async () => {
      await expect(locatorOf(page, 'graph.heading.confidence-graph')).toBeVisible();
      await expect(runRows(page).first()).toBeVisible();
    });
  },

  'GR-015': async (ctx) => {
    await needGraph(ctx);
    const { page, check } = ctx;
    const id = runId(page);
    const about = locatorOf(page, 'graph.button.about-confidence-graph');
    await check('"About Confidence Graph" is shown', () => expect(about).toBeVisible());
    await about.hover().catch(() => undefined);
    await check('"About Confidence Graph" shows an explanation text when pointed at', async () => {
      const tips = locatorOf(page, 'graph.css.role-tooltip-data-slot-tooltip-conte');
      const title = norm((await about.getAttribute('title').catch(() => '')) ?? '');
      await expect.poll(async () => {
        if (title.length > 10) return true;   // a plain browser tooltip (title attribute) is an explanation text too
        for (const t of await tips.all()) if (await t.isVisible().catch(() => false) && norm(await t.innerText().catch(() => '')).length > 10) return true;
        return false;
      }, { timeout: 8_000, message: 'no explanation text appeared' }).toBe(true);
    });
    await ctx.snap('"About Confidence Graph" pointed at, explanation shown', about);
    await page.mouse.move(0, 0);
    const back = locatorOf(page, 'graph.link.back-to-confidence-engine');
    await check('"Back to Confidence Engine" is shown and goes to the engine page of this run', async () => {
      await expect(back).toBeVisible();
      await expect(back).toHaveAttribute('href', expectedOf('graph.attr.by-runid-pillar-engine-pillar-engine-id', id));
    });
    await ctx.step('Click "Back to Confidence Engine"', async () => {
      await back.click();
      await page.waitForURL(/pillar=engine/, { timeout: 20_000 });
    });
    await check('The Confidence Engine page is shown again for the same run', async () => {
      await anyShown(locatorOf(page, 'graph.text.pr-confidence-analysis'), 30_000);
      expect(runId(page)).toBe(id);
    });
    await check('The scores are still there after coming back', () => anyShown(locatorOf(page, 'graph.text.confidence-score'), 20_000));
  },

  'GR-016': async (ctx) => {
    await needGraph(ctx);
    const { page, check, note } = ctx;
    const { repo } = inputs(ctx, { repo: true });
    // the Input sheet may hold "owner/name", a URL or "name.git": the page shows the plain repository name
    const repoName = repo.trim().replace(/\/+$/, '').replace(/\.git$/i, '').split(/[\/:]/).pop() ?? repo;
    const bodyHas = (re: RegExp): Promise<void> =>
      expect.poll(async () => norm(await locatorOf(page, 'graph.css.body').innerText()), { timeout: 10_000 }).toMatch(re);
    await check('The address has pillar=graph', () => expect(new URL(page.url()).searchParams.get('pillar')).toBe('graph'));
    await check(`The graph is for the repository "${repoName}" (its name is shown with the trend)`, () => bodyHas(new RegExp(esc(repoName), 'i')));
    await check('A result word (Pass / Hold / Block / Fail) is shown with the trend', () => bodyHas(/\b(Pass|Hold|Block|Fail)\b/i));
    await check('The scope "Latest release version" is shown', () => bodyHas(/Latest release version/i));
    await check('The period "Last 30 days" is shown', () => bodyHas(/Last 30 days/i));
    await ctx.snap('Graph header with repository, result word, scope and period', locatorOf(page, 'graph.text.last-30-days').first());
    const bodyNow = norm(await locatorOf(page, 'graph.css.body').innerText());
    const epics = /All Epics/i.test(bodyNow) ? 1 : 0;
    const stories = /All Stories/i.test(bodyNow) ? 1 : 0;
    note(`The QA sheet (step 43.1) expects "All Epics" and "All Stories" filters on this page: "All Epics" ${epics ? 'is shown' : 'is NOT on the page'}, "All Stories" ${stories ? 'is shown' : 'is NOT on the page'}.`);
  },
};
