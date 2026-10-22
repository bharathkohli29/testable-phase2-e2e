import { expect, Locator, Page } from '@playwright/test';
import { closeMenus, comingSoonCard, labelText } from '../../core/pages/menus';
import { apiGet, tenantOf } from '../../core/pages/runApi';
import { CaseHandler } from '../../core/runner/registerCases';
import { readDashboardRow, readEngine, readGraph, readObject, same, until } from '../flow/crossScreen';
import { RepoPage } from '../repo/shared/RepoPage';

/**
 * The Confidence Engine module: every part of /confidence-engine?pillar=engine once the run has finished.
 * Verified live (C-_Stack / WestCoastFitness-positive). Checks use locators (roles, names, labels, text, table cells) and the run API
 * calls the page itself makes - never screenshots. Nothing here starts, cancels or downloads anything, and nothing is typed.
 * The module always runs after the Execution module (it needs the finished run); when the page is not open the cases are SKIPPED.
 */

const TABS: Array<{ button: string; label: RegExp; heading: string }> = [
  { button: 'Code Intelligence', label: /^\s*code intelligence\s*$/i, heading: 'CODE INTELLIGENCE' },
  { button: 'Performance', label: /^\s*performance( testing)?\s*$/i, heading: 'PERFORMANCE TESTING' },
  { button: 'Security', label: /^\s*security\s*$/i, heading: 'SECURITY' },
  { button: 'Compliance', label: /^\s*compliance\s*$/i, heading: 'COMPLIANCE' },
];
const STAGES = [
  'Queued', 'Admitted', 'Syncing repository', 'Detecting languages & signals', 'Planning analysis',
  'Running analysis tasks', 'Scoring & taxonomy', 'Publishing projections',
];
const COLUMNS = ['Classification', 'Value', 'Execution status', 'Result', 'Coverage'];

interface Row { tab: string; category: string; gate: string; name: string; value: string; exec: string; result: string; coverage: string }
/** Filled by the four tab-walk cases, used by the row-rule case. */
const walked: { rows: Row[]; tabs: string[] } = { rows: [], tabs: [] };

const runId = (page: Page): string => new URL(page.url()).searchParams.get('runId') ?? '';
const num = (s: string | undefined | null): number => Number(String(s ?? '').replace(/[^\d.\-]/g, ''));
const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Text of a button / chip compared without caring about case or spacing. */
const exactText = (name: string): RegExp => new RegExp(`^\\s*${esc(name).replace(/\s+/g, '\\s+')}\\s*$`, 'i');
const pageTitle = (page: Page): Locator => labelText(page, 'PR Confidence Analysis').first();

async function runApi(page: Page, kind: 'summary' | 'scores' | 'taxonomy-gate'): Promise<Record<string, unknown>> {
  const tenant = await tenantOf(page);
  const r = await apiGet(page, `/views-api/v1/runs/${runId(page)}/${kind}?tenant_id=${tenant}`);
  return r.status === 200 ? (r.json as Record<string, unknown>) : { error: r.status };
}

/** SKIPS the case unless the Confidence Engine page of a finished run is open. */
async function needPage(ctx: Parameters<CaseHandler<RepoPage>>[0]): Promise<void> {
  const { page } = ctx;
  const open = /\/confidence-engine/.test(page.url()) && !!runId(page);
  if (!open) ctx.skip('The Confidence Engine page is not open (the Execution module did not get a run to its results), so there is nothing to check here.');
  await closeMenus(page);
  await pageTitle(page).waitFor({ state: 'visible', timeout: 30_000 })
    .catch(() => ctx.skip('The Confidence Engine page did not show "PR Confidence Analysis".'));
}

/** The element after a small label (value under "TOTAL", "PASSED" ...). */
const valueUnder = (page: Page, label: RegExp): Locator => page.locator('p').filter({ hasText: label }).first().locator('xpath=following-sibling::*[1]');

const tabLabel = (page: Page, t: (typeof TABS)[number]): Locator => page.locator('p').filter({ hasText: t.label }).first();
const categoryBox = (page: Page, t: (typeof TABS)[number]): Locator => tabLabel(page, t).locator('xpath=following-sibling::div[1]');
const gateBox = (page: Page, t: (typeof TABS)[number]): Locator =>
  tabLabel(page, t).locator('xpath=ancestor::div[contains(@class,"border-b")][1]/following::div[contains(@class,"flex-nowrap") and contains(@class,"items-center")][1]');
const gateHeading = (page: Page): Locator => page.locator('h3').filter({ hasText: /\sgate\s*$/i }).first();

async function openTab(page: Page, t: (typeof TABS)[number]): Promise<void> {
  await page.getByRole('button', { name: t.button, exact: true }).click();
  await expect(categoryBox(page, t)).toBeVisible({ timeout: 15_000 });
}

/** Names of the category chips plus the ones inside "More (n)". */
async function listCategories(page: Page, t: (typeof TABS)[number]): Promise<string[]> {
  const box = categoryBox(page, t);
  const names = (await box.getByRole('button').allInnerTexts()).map(norm).filter((n) => n && !/^More \(\d+\)$/.test(n));
  const more = box.getByRole('button', { name: /^More \(\d+\)/ });
  if (await more.count()) {
    await more.click();
    names.push(...(await page.getByRole('menuitem').allInnerTexts()).map(norm));
    await page.keyboard.press('Escape');
    await closeMenus(page);
  }
  return [...new Set(names)];
}

async function selectCategory(page: Page, t: (typeof TABS)[number], name: string): Promise<void> {
  await closeMenus(page);
  const box = categoryBox(page, t);
  const chip = box.getByRole('button', { name, exact: true }).or(box.getByRole('button').filter({ hasText: exactText(name) }));
  if (await chip.count()) {
    try { await chip.first().click({ timeout: 10_000 }); } catch { await closeMenus(page); await page.waitForTimeout(500); await chip.first().click({ timeout: 10_000, force: true }); }
    return;
  }
  await box.getByRole('button', { name: /^More \(\d+\)/ }).click();
  await page.getByRole('menuitem').filter({ hasText: exactText(name) }).first().click();
}

async function listGates(page: Page, t: (typeof TABS)[number]): Promise<string[]> {
  const box = gateBox(page, t);
  if (!(await box.count())) return [];
  return (await box.getByRole('button').allInnerTexts()).map(norm).filter(Boolean);
}

async function readRows(page: Page): Promise<Array<Omit<Row, 'tab' | 'category' | 'gate'>>> {
  const rows = page.locator('table tbody tr');
  await rows.first().waitFor({ state: 'attached', timeout: 8_000 }).catch(() => undefined); // the table may still be loading
  const out: Array<Omit<Row, 'tab' | 'category' | 'gate'>> = [];
  for (let i = 0; i < (await rows.count()); i++) {
    const tds = rows.nth(i).locator('td');
    const cells = (await tds.allInnerTexts()).map(norm);
    const exec = (await tds.nth(2).locator('[aria-label]').first().getAttribute('aria-label').catch(() => null)) ?? '';
    out.push({ name: cells[0] ?? '', value: cells[1] ?? '', exec, result: (cells[3] ?? '').toUpperCase(), coverage: cells[4] ?? '' });
  }
  return out;
}

/** Walks one category tab: every category, every gate, every row. */
function walkTab(index: number): CaseHandler<RepoPage> {
  const t = TABS[index];
  return async (ctx) => {
    await needPage(ctx);
    const { page, check, note, snap } = ctx;
    let shot = false;
    await ctx.step(`Open the "${t.button}" tab`, () => openTab(page, t));
    await check(`The tab shows its heading "${t.heading}"`, () => expect(tabLabel(page, t)).toBeVisible());
    const categories = await listCategories(page, t);
    await check('At least one category is listed', () => expect(categories.length).toBeGreaterThan(0));
    let gates = 0;
    let pass = 0, fail = 0, na = 0;
    for (const cat of categories) {
      const where = `${t.button} › ${cat}`;
      try { await selectCategory(page, t, cat); } catch (e) { await closeMenus(page); await check(`${where}: the category can be opened`, async () => { throw e; }); continue; }
      const gateNames = await listGates(page, t);
      const list: Array<string | null> = gateNames.length ? gateNames : [null];
      for (const g of list) {
        if (g) {
          try { await gateBox(page, t).getByRole('button').filter({ hasText: exactText(g) }).first().click(); } catch (e) { await check(`${where} › ${g}: the gate can be opened`, async () => { throw e; }); continue; }
        }
        gates += 1;
        const heading = gateHeading(page);
        const title = g ? `${where} › ${g}` : where;
        await check(`${title}: a gate heading "<name> Gate" is shown`, () => expect(heading).toBeVisible());
        if (!shot) { shot = true; await snap(`${t.button} tab with the gate table open`, [heading, page.locator('table').first()]); }
        if (g) await check(`${title}: the heading names the gate "${g}"`, () => expect(heading).toHaveText(new RegExp(exactText(`${g} Gate`).source, 'i')));
        await check(`${title}: the gate status is "Completed"`, () =>
          expect(heading.locator('xpath=..')).toContainText(/completed/i));
        await check(`${title}: the table has the columns ${COLUMNS.join(', ')}`, async () => {
          const heads = (await page.locator('table thead th').allInnerTexts()).map((h) => norm(h).toLowerCase());
          for (const c of COLUMNS) expect(heads, `column "${c}" missing`).toContain(c.toLowerCase());
        });
        const rows = await readRows(page);
        await check(`${title}: the table has at least one classification row`, () => expect(rows.length).toBeGreaterThan(0));
        for (const r of rows) {
          walked.rows.push({ tab: t.button, category: cat, gate: g ?? '', ...r });
          if (r.result === 'PASS') pass++; else if (r.result === 'FAIL') fail++; else na++;
        }
      }
    }
    walked.tabs.push(t.button);
    note(`${t.button}: ${categories.length} categories, ${gates} gates, ${pass} PASS / ${fail} FAIL / ${na} N/A rows`);
  };
}

export const confidenceSteps: Record<string, CaseHandler<RepoPage>> = {
  'CE-001': async (ctx) => {
    await needPage(ctx);
    const { page, check, note, snap } = ctx;
    const id = runId(page);
    await snap('Confidence Engine page header', pageTitle(page));
    await check('The address is /confidence-engine with pillar=engine, mode=whitebox and from=ea', () => {
      const u = new URL(page.url());
      expect(u.pathname).toBe('/confidence-engine');
      expect(u.searchParams.get('pillar')).toBe('engine');
      expect(u.searchParams.get('mode')).toBe('whitebox');
      expect(u.searchParams.get('from')).toBe('ea');
    });
    await check('The breadcrumb shows "Confidence Engine"', () => expect(labelText(page, 'Confidence Engine').first()).toBeVisible());
    await check('The page title "PR Confidence Analysis" is shown', () => expect(pageTitle(page)).toBeVisible());
    await check('The sub-title explains "Evidence-based scoring across pipeline, whitebox, and blackbox gates."', () =>
      expect(page.getByText(/Evidence-based scoring across pipeline, whitebox,? and blackbox gates/i).first()).toBeVisible());
    await check('The header shows the commit (7 hex characters) and the start of the run id', async () => {
      const text = await page.locator('body').innerText();
      expect(text).toMatch(/[0-9a-f]{7}\s*·\s*[0-9a-f]{8}…?/i);
      expect(text.toLowerCase()).toContain(id.slice(0, 8).toLowerCase());
    });
    for (const [name, pillar] of [['Confidence Object', 'object'], ['Confidence Graph', 'graph'], ['Confidence Engine', 'engine']] as const) {
      await check(`The top link "${name}" points to this run with pillar=${pillar}`, async () => {
        const link = page.locator(`a[href*="/confidence-engine"][href*="pillar=${pillar}"]:visible`).first();
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('href', new RegExp(`runId=${id}`));
      });
    }
    await check('"Closed-Loop Intel" is marked COMING SOON', () => expect(comingSoonCard(page)).toBeVisible());
    note(`Run ${id}`);
  },

  'CE-002': async (ctx) => {
    await needPage(ctx);
    const { page, check, snap } = ctx;
    await snap('Left menu links', page.getByRole('link', { name: exactText('Confidence Engine') }).first());
    for (const [name, href] of [['Dashboard', '/dashboard'], ['Confidence Engine', '/confidence-engine'], ['Execution Assistant', '/execution-assistant'], ['Account and Plan', '/account']] as const) {
      await check(`Left menu link "${name}" is shown and goes to ${href}`, async () => {
        const link = page.getByRole('link', { name: exactText(name) }).first();
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('href', new RegExp(href));
      });
    }
    await check('The executions meter ("Executions: used / limit") is shown, links to /account and used is not above the limit', async () => {
      const meter = page.locator('a[href="/account"]').filter({ hasText: /Executions:\s*\d+\s*\/\s*\d+/i }).first();
      await expect(meter).toBeVisible();
      const m = norm(await meter.innerText()).match(/Executions:\s*(\d+)\s*\/\s*(\d+)/i)!;
      expect(num(m[1])).toBeLessThanOrEqual(num(m[2]));
    });
    await check('Left menu "Sign out" button is shown', () => expect(page.getByRole('button', { name: /sign out/i }).first()).toBeVisible());
    await check('The "Notifications" button is shown', () => expect(page.getByRole('button', { name: /notifications/i }).first()).toBeVisible());
    await check('The "Support" button is shown', () => expect(page.getByRole('button', { name: /support/i }).first()).toBeVisible());
    await check('The "Submit question" button is shown', () => expect(page.getByRole('button', { name: /submit question/i }).first()).toBeVisible());
  },

  'CE-003': async (ctx) => {
    await needPage(ctx);
    const { page, check, note, snap } = ctx;
    const selector = page.getByRole('combobox', { name: /branch run/i }).first();
    await check('The "Branch run" selector is shown', () => expect(selector).toBeVisible());
    await check('It shows a branch name, a commit (7 hex) and the start of the run id', async () => {
      const t = norm(await selector.innerText());
      expect(t).toMatch(/[0-9a-f]{7}/i);
      expect(t.toLowerCase()).toContain(runId(page).slice(0, 8).toLowerCase());
    });
    await selector.click({ timeout: 10_000 }).catch(() => note('The "Branch run" selector could not be clicked.'));
    const options = page.getByRole('option');
    await check('Opening the selector lists at least one run', () => expect(options.first()).toBeVisible());
    await snap('Branch run selector open with the list of runs', [selector, page.getByRole('listbox').first()]);
    await check('The current run is among the options', async () => {
      const all = (await options.allInnerTexts()).map(norm).join(' | ');
      expect(all.toLowerCase()).toContain(runId(page).slice(0, 8).toLowerCase());
    });
    note(`Options: ${(await options.allInnerTexts().catch(() => [])).map(norm).join(' | ')}`);
    await page.keyboard.press('Escape');
    await check('The list closes without changing the run', async () => {
      await expect(options.first()).toBeHidden();
      expect(runId(page)).not.toBe('');
    });
  },

  'CE-004': async (ctx) => {
    await needPage(ctx);
    const { page, check, note, snap } = ctx;
    const body = norm(await page.locator('body').innerText());
    await snap('Score cards', [labelText(page, 'Confidence Score').first(), labelText(page, 'Validations Passed').first()]);
    for (const label of ['Confidence Score', 'Whitebox Score', 'Blackbox Score', 'Validations Passed']) {
      await check(`The "${label}" card is shown`, () => expect(labelText(page, label).first()).toBeVisible());
    }
    // each card is read on its own, so extra text between the cards does not matter
    const cs = body.match(/Confidence Score\s*(?:commit\s*([0-9a-f]{7,40}))?\s*(\d{1,3})\s*\/\s*100\s*((?:(?!Whitebox|Blackbox|Validations)[A-Za-z]+\s?)*)/i);
    const wb = body.match(/Whitebox Score\s*(\d{1,3})\s*\/\s*50/i);
    const bb = body.match(/Blackbox Score\s*(\d{1,3}|N\/A)\s*(?:\/\s*50)?/i);
    await check('The cards could be read (Confidence /100, Whitebox /50, Blackbox /50 or N/A)', () => { expect(cs, 'Confidence Score card not readable').not.toBeNull(); expect(wb, 'Whitebox Score card not readable').not.toBeNull(); expect(bb, 'Blackbox Score card not readable').not.toBeNull(); });
    if (cs) {
      await check('Confidence Score is 0 to 100', () => { expect(num(cs[2])).toBeGreaterThanOrEqual(0); expect(num(cs[2])).toBeLessThanOrEqual(100); });
      await check('A rating label is shown next to the Confidence Score (not "In progress")', () => { expect(cs[3].trim(), 'no rating label').not.toBe(''); expect(cs[3].trim()).not.toMatch(/^(in progress|—)$/i); });
      if (cs[1]) await check('The commit on the Confidence Score card is the commit of the header', () => expect(body).toMatch(new RegExp(`${cs[1]}\\s*·`, 'i')));
      note(`Confidence ${cs[2]}/100 (${cs[3].trim()})`);
    }
    if (wb) {
      await check('Whitebox Score is 0 to 50', () => { expect(num(wb[1])).toBeGreaterThanOrEqual(0); expect(num(wb[1])).toBeLessThanOrEqual(50); });
      note(`Whitebox ${wb[1]}/50`);
    }
    if (bb) {
      await check('Blackbox Score is a number 0 to 50 or N/A', () => { if (!/^n\/a$/i.test(bb[1])) { expect(num(bb[1])).toBeGreaterThanOrEqual(0); expect(num(bb[1])).toBeLessThanOrEqual(50); } });
      note(`Blackbox ${bb[1]}`);
    }
    const val = body.match(/Validations Passed\s*(\d+)\s*\/\s*(\d+)\s*\(?(\d+)\s*%/i);
    await check('Validations Passed shows "passed/total" and a percentage', () => expect(val).not.toBeNull());
    if (val) await check('The percentage equals passed / total (rounded)', () => expect(Math.abs(num(val[3]) - Math.round((num(val[1]) / num(val[2])) * 100))).toBeLessThanOrEqual(1));
    await check('No score card still says "In progress"', () => expect(labelText(page, 'In progress')).toHaveCount(0));
    const scores = await runApi(page, 'scores');
    await check('The scores API answers for this run', () => expect(scores.error).toBeUndefined());
    await check('The score status from the API is OK', () => expect(String(scores.score_status).toUpperCase()).toBe('OK'));
  },

  'CE-005': async (ctx) => {
    await needPage(ctx);
    const { page, check, note, snap } = ctx;
    const toggle = page.getByRole('button', { name: /Execution Status/i }).first();
    await check('"Execution Status" is shown with a final timer (for example "14m 27s")', async () => {
      await expect(toggle).toBeVisible();
      await expect(toggle).toContainText(/\d+m \d{2}s|\d+s/);
    });
    const start = await toggle.getAttribute('aria-expanded');
    await toggle.click();
    await check('Clicking "Execution Status" opens or closes the stage list', async () => {
      await expect(toggle).toHaveAttribute('aria-expanded', start === 'true' ? 'false' : 'true');
    });
    await toggle.click();
    await check('Clicking it again returns to the first state', () => expect(toggle).toHaveAttribute('aria-expanded', start ?? 'false'));
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    await snap('Execution Status panel open with the stage list', [toggle, labelText(page, STAGES[0]).first()]);
    for (const s of STAGES) await check(`Stage "${s}" is listed`, () => expect(labelText(page, s).first()).toBeVisible());
    const counter = (await toggle.innerText()).match(/(\d+)\s*\/\s*(\d+)/);
    await check('A task counter "done/total" is shown', () => expect(counter).not.toBeNull());
    const sum = await runApi(page, 'summary');
    await check('The run is finished according to the API (phase "completed")', () => expect(sum.phase).toBe('completed'));
    if (counter) {
      note(`Panel says ${counter[1]}/${counter[2]}; API says completed ${String(sum.completed_tasks)}, failed ${String(sum.failed_tasks)}, skipped ${String(sum.skipped_tasks)} of ${String(sum.total_tasks)}`);
      await check('The counter total equals the API total tasks', () => expect(num(counter[2])).toBe(num(String(sum.total_tasks))));
      await check('The counter shows the number of completed tasks from the API', () => expect(num(counter[1])).toBe(num(String(sum.completed_tasks))));
      await check('Completed + failed + skipped tasks add up to the total (the counter only counts the completed ones)', () =>
        expect(num(String(sum.completed_tasks)) + num(String(sum.failed_tasks)) + num(String(sum.skipped_tasks))).toBe(num(String(sum.total_tasks))));
    }
  },

  'CE-006': async (ctx) => {
    await needPage(ctx);
    const { page, check, note, snap } = ctx;
    await check('"Gate Analysis" is shown', () => expect(labelText(page, 'Gate Analysis').first()).toBeVisible());
    await snap('Gate Analysis with weights and figures', labelText(page, 'Gate Analysis').first());
    for (const gate of ['Pipeline Gate', 'Whitebox Confidence', 'Blackbox Confidence']) {
      await check(`"${gate}" shows a weight in %`, async () =>
        expect(norm(await page.locator('body').innerText())).toMatch(new RegExp(`${gate}\\s*\\d+\\s*%\\s*weight`, 'i')));
    }
    const read: Record<string, string> = {};
    for (const label of ['Total', 'Passed', 'Failed', 'Coverage', 'Retries', 'Loop', 'Pass Rate']) {
      await check(`The "${label.toUpperCase()}" figure is shown`, async () => {
        const v = valueUnder(page, exactText(label));
        await expect(v).toBeVisible();
        read[label] = norm(await v.innerText());
        expect(read[label]).not.toBe('');
      });
    }
    await check('TOTAL, PASSED and FAILED are whole numbers and PASSED + FAILED = TOTAL', () => {
      expect(read.Total).toMatch(/^\d+$/); expect(read.Passed).toMatch(/^\d+$/); expect(read.Failed).toMatch(/^\d+$/);
      expect(num(read.Passed) + num(read.Failed)).toBe(num(read.Total));
    });
    await check('COVERAGE and PASS RATE are percentages from 0 to 100', () => {
      for (const k of ['Coverage', 'Pass Rate']) { expect(read[k]).toMatch(/^\d{1,3}(\.\d+)?\s*%$/); expect(num(read[k])).toBeLessThanOrEqual(100); }
    });
    await check('RETRIES is a whole number', () => expect(read.Retries).toMatch(/^\d+$/));
    await check('LOOP shows a state word (for example "Stable")', () => expect(read.Loop).toMatch(/^[A-Za-z][A-Za-z \-]*$/));
    note(`Figures: ${Object.entries(read).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  },

  'CE-007': walkTab(0),
  'CE-008': walkTab(1),
  'CE-009': walkTab(2),
  'CE-010': walkTab(3),

  'CE-011': async (ctx) => {
    const { check, note, skip } = ctx;
    if (!walked.rows.length) skip('No table rows were read (the four tab cases CE-007 to CE-010 did not run), so there is nothing to compare.');
    const bad = (label: string, rows: Row[], expectFn: (r: Row) => boolean): Promise<void> =>
      check(label, () => {
        const wrong = rows.filter((r) => !expectFn(r));
        expect(wrong.map((r) => `${r.tab} › ${r.category}${r.gate ? ' › ' + r.gate : ''} › ${r.name} (${r.value} → ${r.result})`), 'rows that break the rule').toEqual([]);
      });
    const rows = walked.rows;
    const withLimit = rows.filter((r) => /^-?\d+(\.\d+)?\s*[≤≥<>]=?\s*-?\d+(\.\d+)?$/.test(r.value));
    await bad('Every Result is PASS, FAIL, WARN or N/A', rows, (r) => /^(PASS|FAIL|WARN|WARNING|N\/A)$/i.test(r.result));
    await bad('Every Coverage is a percentage or N/A', rows, (r) => /^(\d{1,3}(\.\d+)?\s*%|N\/A)$/i.test(r.coverage));
    await bad('Every Execution status icon that has a label says "Execution completed" or "Not Applicable" (or that the check was not executed)', rows, (r) => r.exec === '' || /^\s*(Execution completed|Not Applicable|Not executed|Execution not applicable)\s*$/i.test(r.exec));
    note(`Execution status labels seen: ${[...new Set(rows.map((r) => r.exec || '(no label)'))].join(' | ')}`);
    await bad('Rows with the value N/A or "—" have the result N/A', rows, (r) => !/^(N\/A|—)$/i.test(r.value) || r.result === 'N/A');
    await bad('Rows with a number as value have the result PASS, FAIL or WARN', rows, (r) => !/^-?\d/.test(r.value) || /^(PASS|FAIL|WARN|WARNING)$/i.test(r.result));
    await bad('Where a limit is shown ("43.91 ≥ 80") the result agrees with the comparison', withLimit, (r) => {
      const m = r.value.match(/^(-?\d+(?:\.\d+)?)\s*([≤≥<>]=?)\s*(-?\d+(?:\.\d+)?)$/)!;
      const [v, op, lim] = [Number(m[1]), m[2], Number(m[3])];
      const ok = op === '≤' || op === '<=' ? v <= lim : op === '≥' || op === '>=' ? v >= lim : op === '<' ? v < lim : v > lim;
      return r.result === (ok ? 'PASS' : 'FAIL');
    });
    const by = (res: string) => rows.filter((r) => r.result === res).length;
    note(`${rows.length} rows read in ${walked.tabs.length} tabs (${withLimit.length} with a limit): ${by('PASS')} PASS, ${by('FAIL')} FAIL, ${by('WARN')} WARN, ${by('N/A')} N/A`);
  },

  'CE-012': async (ctx) => {
    await needPage(ctx);
    const { page, check, note, snap } = ctx;
    let tipShot = false;
    const info = page.getByRole('button', { name: /^About /i });
    const infoIcon = (n: string): Locator => page.locator('table').getByLabel(exactText(`About ${n}`)).first();
    await check('The three "About ..." buttons next to the top links are shown', async () => {
      for (const n of ['About Confidence Object', 'About Confidence Graph', 'About Confidence Engine']) await expect(page.getByRole('button', { name: exactText(n) }).first()).toBeVisible();
    });
    const tipBox = () => page.locator('[data-slot="tooltip-content"]:visible, [role="tooltip"]:visible, [role="dialog"]:visible').first();
    const texts: string[] = [];
    for (const n of ['About Confidence Object', 'About Confidence Graph', 'About Confidence Engine']) {
      const b = page.getByRole('button', { name: exactText(n) }).first();
      await b.hover({ timeout: 5_000 }).catch(() => undefined);
      await check(`"${n}" shows an explanation text when pointed at`, async () => {
        const tip = tipBox();
        await expect(tip).toBeVisible({ timeout: 5_000 });
        const t = norm(await tip.innerText());
        expect(t.length).toBeGreaterThan(10);
        texts.push(t);
      });
      if (!tipShot) { tipShot = true; await snap(`Explanation tooltip of "${n}" while it is visible`, [b, tipBox()]); }
      await page.mouse.move(0, 0);
    }
    note(new Set(texts).size === texts.length ? 'The three explanation texts are different from each other.' : `Two of the three "About ..." explanation texts are the same: ${texts.map((x) => x.slice(0, 40)).join(' | ')}`);
    note(`"About ..." buttons on the page: ${await info.count()}`);
    await ctx.step('Open the "Code Intelligence" tab', () => openTab(page, TABS[0]));
    await page.locator('table tbody tr').first().waitFor({ state: 'attached', timeout: 10_000 }).catch(() => undefined);
    await check('Every classification row has an "About <name>" info icon', async () => {
      const names = (await page.locator('table tbody tr td:first-child').allInnerTexts()).map(norm).filter(Boolean);
      expect(names.length).toBeGreaterThan(0);
      for (const n of names) await expect(infoIcon(n), `no "About ${n}" icon`).toBeAttached();
    });
    // pointing at the info icon of the rows of the open table shows the explanation of that classification
    const rowNames = (await page.locator('table tbody tr td:first-child').allInnerTexts()).map(norm).filter(Boolean).slice(0, 6);
    for (const name of rowNames) {
      const icon = infoIcon(name);
      await icon.hover({ timeout: 5_000 }).catch(() => undefined);
      await check(`Pointing at the info icon of "${name}" shows an explanation text`, async () => {
        const tip = tipBox();
        await expect(tip).toBeVisible({ timeout: 5_000 });
        expect(norm(await tip.innerText()).length).toBeGreaterThan(5);
      });
      await page.mouse.move(0, 0);
    }
  },

  'CE-013': async (ctx) => {
    await needPage(ctx);
    const { page, check, snap } = ctx;
    for (const name of ['Notifications', 'Support']) {
      const b = page.getByRole('button', { name: new RegExp(`^\\s*${name}\\b`, 'i') }).first();
      await check(`"${name}" is shown and closed to begin with`, async () => { await expect(b).toBeVisible(); await expect(b).not.toHaveAttribute('aria-expanded', 'true'); });
      // An open panel hides the rest of the page from role queries, so the button is grabbed ONCE (before the click) and the same
      // element is read afterwards instead of searching for it again.
      const handle = await b.elementHandle({ timeout: 5_000 }).catch(() => null);
      const expanded = async (): Promise<string> => (handle ? await handle.evaluate((el) => el.getAttribute('aria-expanded') ?? '') : 'button not found');
      await check(`Clicking "${name}" opens it`, async () => { await b.click({ timeout: 5_000 }); await expect.poll(expanded, { timeout: 5_000 }).toBe('true'); });
      if (name === 'Notifications') await snap('Notifications panel open', [b, page.locator('[role="dialog"]:visible, [data-state="open"]:visible').first()]);
      await page.keyboard.press('Escape');
      await check(`Pressing Escape closes "${name}"`, () => expect.poll(expanded, { timeout: 5_000 }).toBe('false'));
    }
  },

  'CE-014': async (ctx) => {
    await needPage(ctx);
    const { page, check, note, snap } = ctx;
    const report = page.getByRole('button', { name: /Download full taxonomy gate report/i }).first();
    await check('"Download full taxonomy gate report" is shown', () => expect(report).toBeVisible());
    await check('The report button is enabled', () => expect(report).toBeEnabled());
    await snap('Download full taxonomy gate report button (not clicked)', report);
    note('The button is only checked, not clicked (a click would download a file to the computer).');
  },

  'CE-015': async (ctx) => {
    await needPage(ctx);
    const { page, check, note, snap } = ctx;
    const sha = (norm(await page.locator('body').innerText()).match(/\b([0-9a-f]{7})\s*·\s*[0-9a-f]{8}/i) ?? [])[1] ?? '';
    await check('The chat says execution finished ("Execution finished — scores and evidence are ready on the right.")', () =>
      expect(page.getByText(/Execution finished/i).last()).toBeVisible());
    await check('The chat says "Run complete — review scores, taxonomy evidence, and gate analysis ..."', () =>
      expect(page.getByText(/Run complete/i).last()).toBeVisible());
    await snap('Chat messages saying the run is complete', page.getByText(/Run complete/i).last());
    const analyzed = page.getByText(/This commit is already analy[sz]ed/i);
    if (await analyzed.count()) {
      await check('The "already analyzed" message names the same commit as the header', () => expect(analyzed.last()).toContainText(new RegExp(sha, 'i')));
      await check('"Analyze latest commit" is offered and enabled', async () => {
        const b = page.getByRole('button', { name: /analy[sz]e latest commit/i }).last();
        await expect(b).toBeVisible();
        await expect(b).toBeEnabled();
      });
    } else note('No "already analyzed" message is shown (the commit may have a newer tip); the button was not checked.');
    note('"Analyze latest commit" is only checked, never clicked.');
  },

  'CE-016': async (ctx) => {
    await needPage(ctx);
    const { page, check, snap } = ctx;
    const before = { id: runId(page), url: page.url() };
    const scoreText = async () => norm((await page.locator('body').innerText()).match(/Confidence Score[\s\S]{0,60}?\d{1,3}\s*\/\s*100/i)?.[0] ?? '');
    const first = await scoreText();
    await page.getByRole('button', { name: /^\s*refresh\s*$/i }).first().click();
    await check('The page stays on the same run after Refresh', async () => { await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined); expect(runId(page)).toBe(before.id); });
    await check('The scores are the same after Refresh', async () => { await expect.poll(scoreText, { timeout: 30_000 }).toBe(first); });
    await check('No error message appears after Refresh', () => expect(page.getByText(/something went wrong|failed to load|error loading|unable to load/i)).toHaveCount(0));
    await check('The page title is still shown after Refresh', () => expect(pageTitle(page)).toBeVisible());
    await snap('Scores after Refresh', labelText(page, 'Confidence Score').first());
  },

  'CE-017': async (ctx) => {
    await needPage(ctx);
    const { page, check, snap } = ctx;
    const id = runId(page);
    const home = page.url();
    for (const [name, pillar] of [['Confidence Object', 'object'], ['Confidence Graph', 'graph']] as const) {
      // a page that does not open is a failed check, the next page is still tried
      await check(`"${name}" opens (pillar=${pillar})`, async () => {
        await page.locator(`a[href*="/confidence-engine"][href*="pillar=${pillar}"]:visible`).first().click({ timeout: 15_000 });
        await page.waitForURL(new RegExp(`pillar=${pillar}`), { timeout: 20_000 });
      });
      await check(`"${name}": the address keeps the same run id`, () => expect(runId(page)).toBe(id));
      await check(`"${name}": the page is not sent to the login page`, () => expect(page).not.toHaveURL(/\/auth\//));
      await check(`"${name}": no error message is shown`, () => expect(page.getByText(/something went wrong|failed to load|unable to load|page not found|404 (error|not found)|error 404/i)).toHaveCount(0));
    }
    await ctx.step('Go back to "Confidence Engine"', async () => {
      if (!/pillar=engine/.test(page.url())) {
        const link = page.locator('a[href*="/confidence-engine"][href*="pillar=engine"]:visible').first();
        if (await link.count()) { await link.click(); await page.waitForURL(/pillar=engine/, { timeout: 20_000 }); } else await page.goto(home);
      }
    });
    await check('The Confidence Engine page is shown again for the same run', async () => {
      await expect(pageTitle(page)).toBeVisible({ timeout: 30_000 });
      expect(runId(page)).toBe(id);
    });
    await check('The scores are still there after coming back', () => expect(labelText(page, 'Confidence Score').first()).toBeVisible());
    await snap('Confidence Engine page after coming back', labelText(page, 'Confidence Score').first());
  },

  'CE-018': async (ctx) => {
    await needPage(ctx);
    const { page, check, note, snap } = ctx;
    const repo = ctx.input.get('REPO').trim(); // only used to find the project card (a note, not a check)
    const repoName = repo.split('/').pop() ?? repo;
    const id = runId(page);
    const id8 = id.slice(0, 8);
    const home = page.url();
    const eng = await until(() => readEngine(page), (v) => v.score !== undefined);
    await snap('Confidence Engine score card (the numbers compared with the other pages)', labelText(page, 'Confidence Score').first());
    note(`Confidence Engine shows: score ${String(eng.score)} (${String(eng.verdict)}), Whitebox gate ${String(eng.whitebox)}, validations ${String(eng.passed)} passed of ${String(eng.total)}, ${String(eng.failed)} failed, tasks ${String(eng.tasks)}.`);
    await check('The Confidence Engine shows a score and a result for this run', () => { same(typeof eng.score, 'number', 'Confidence Score'); expect(eng.verdict ?? '', 'result word').toMatch(/\w/); });

    const open = async (what: string, click: () => Promise<void>, url: RegExp): Promise<boolean> => {
      try { await click(); await page.waitForURL(url, { timeout: 30_000 }); return true; } catch { note(`${what} could not be opened.`); return false; }
    };

    // Confidence Object
    let obj: Awaited<ReturnType<typeof readObject>> = {};
    if (await open('Confidence Object', () => page.locator('a[href*="/confidence-engine"][href*="pillar=object"]').first().click(), /pillar=object/)) {
      obj = await until(() => readObject(page, repoName), (v) => v.org !== undefined);
    }
    await check(`Confidence Object: "Avg Confidence" and the ORG score are the Confidence Engine score (${String(eng.score)})`, () => { same(obj.avg, eng.score, 'Avg Confidence'); same(obj.org, eng.score, 'ORG score'); });
    await check(`Confidence Object: the Whitebox figure is the Whitebox gate of the Confidence Engine (${String(eng.whitebox)})`, () => same(obj.whitebox, eng.whitebox, 'Whitebox'));
    await check(`Confidence Object: Validations (${String(eng.total)}) and Open Risks (${String(eng.failed)}) are the Total and Failed of the Confidence Engine`, () => { same(obj.validations, eng.total, 'Validations'); same(obj.risks, eng.failed, 'Open Risks'); });
    if (obj.card !== undefined) note(`Confidence Object: the "${repoName}" project card shows ${obj.card} (Confidence Engine ${String(eng.score)})${obj.card === eng.score ? '' : ' - DIFFERENT'}.`);
    else note(`The "${repoName}" project card was not found on the Confidence Object page, so it was not compared.`);

    // Confidence Graph
    let gr = { labels: [] as string[] } as Awaited<ReturnType<typeof readGraph>>;
    if (await open('Confidence Graph', () => page.locator('a[href*="/confidence-engine"][href*="pillar=graph"]').first().click(), /pillar=graph/)) {
      gr = await until(() => readGraph(page, id8), (v) => v.org !== undefined && v.historyScore !== undefined);
    }
    await check(`Confidence Graph: the Org score is the Confidence Engine score (${String(eng.score)})`, () => same(gr.org, eng.score, 'Org score'));
    await check(`Confidence Graph: the WB score is the Whitebox gate of the Confidence Engine (${String(eng.whitebox)})`, () => same(gr.wb, eng.whitebox, 'WB score'));
    await check(`Confidence Graph: the Pipeline Run History row of this run shows the same score and result (${String(eng.score)} ${String(eng.verdict)})`, () => {
      same(gr.historyScore, eng.score, 'history score');
      expect((gr.historyVerdict ?? '').toLowerCase(), 'history result').toBe((eng.verdict ?? '').toLowerCase());
    });

    // Runs Dashboard
    let row: Awaited<ReturnType<typeof readDashboardRow>>;
    if (await open('Dashboard', () => page.locator('a[href="/dashboard"]').first().click(), /\/dashboard/)) {
      await page.locator('tbody tr').first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => undefined);
      row = await until(() => readDashboardRow(page, id8), (v) => v !== undefined, 20_000);
    }
    await check(`Runs Dashboard: this run (${id8}) is listed`, () => expect(row, 'the run is not in the table').toBeDefined());
    await check(`Runs Dashboard: its score is the Confidence Engine score (${String(eng.score)}, the table shows one decimal)`, () => same(row === undefined ? undefined : Math.round(row.score), eng.score, 'Dashboard score'));
    await check(`Runs Dashboard: its result word is the Confidence Engine result (${String(eng.verdict)})`, () => expect((row?.status ?? '').toLowerCase(), 'Dashboard result').toBe((eng.verdict ?? '').toLowerCase()));
    await check(`Runs Dashboard: its tasks are the Confidence Engine tasks (${String(eng.tasks)})`, () => same(row?.tasks, eng.tasks, 'Dashboard tasks'));

    // back to where the next cases expect to be
    await ctx.step('Go back to the Confidence Engine page of this run', async () => {
      const link = page.locator(`a[href*="runId=${id}"][href*="pillar=engine"]:visible`).first();
      if (await link.count()) await link.click(); else await page.goto(home);
      await expect(pageTitle(page)).toBeVisible({ timeout: 30_000 });
    });
  },

  'CE-019': async (ctx) => {
    await needPage(ctx);
    const { page, check, note, snap } = ctx;
    const text = norm(await page.locator('body').innerText());
    const cut = text.search(/TESTABLE\s*(>|Code)/i);
    const pane = cut > 0 ? text.slice(0, cut) : text;
    note(`Left pane starts: ${pane.slice(0, 220)}`);
    await check('The top of the left pane says "Whitebox complete"', () => expect(pane).toMatch(/whitebox complete/i));
    await check('It names the repository and branch and says to continue the Execution Assistant thread while reviewing results', () =>
      expect(pane).toMatch(/\S+\/\S+\s*·\s*\S+.*continue the execution assistant thread/i));
    await check('The thread has the final messages "Execution finished" and "Run complete" in this order', () => {
      const a = pane.search(/execution finished/i), b = pane.search(/run complete/i);
      expect(a, '"Execution finished" is not in the thread').toBeGreaterThanOrEqual(0);
      expect(b, '"Run complete" is not in the thread').toBeGreaterThanOrEqual(0);
      expect(b).toBeGreaterThan(a);
    });
    await check('Every message has a time (for example 4:22 PM) and the times never go backwards', () => {
      const mins = [...pane.matchAll(/\b(\d{1,2}):(\d{2})\s?(AM|PM)\b/gi)].map((m) => ((Number(m[1]) % 12) + (/pm/i.test(m[3]) ? 12 : 0)) * 60 + Number(m[2]));
      expect(mins.length, 'no message time was found').toBeGreaterThan(0);
      mins.forEach((v, i) => { if (i) expect(v, `message ${i + 1} is earlier than the one before`).toBeGreaterThanOrEqual(mins[i - 1]); });
    });
    await snap('Chat pane of the finished run', page.getByText(/whitebox complete/i).first());
  },

  'CE-020': async (ctx) => {
    await needPage(ctx);
    const { page, check, snap } = ctx;
    const box = page.getByPlaceholder(/ask a confidence question/i).first();
    const handle = page.locator('[role="separator"], [aria-label*="resize" i], [class*="resize" i], [class*="drag-handle" i], [class*="divider" i]').filter({ has: page.locator('svg') }).first()
      .or(page.locator('[role="separator"]').first());
    await expect(handle, 'no handle between the chat pane and the results was found').toBeVisible({ timeout: 10_000 });
    const before = (await box.boundingBox())?.width ?? 0;
    const hb = await handle.boundingBox();
    if (!hb) throw new Error('the handle has no size');
    await snap('Handle between the chat pane and the results', handle);
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2 + 120, hb.y + hb.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    const after = (await box.boundingBox())?.width ?? 0;
    await check('Dragging the handle changes the width of the chat pane', () => expect(Math.abs(after - before), `the chat box stayed ${before}px wide`).toBeGreaterThan(20));
    await check('Both panels stay readable after the resize (the score title and the question box are visible)', async () => {
      await expect(pageTitle(page)).toBeVisible();
      await expect(box).toBeVisible();
    });
    // put the pane back where it was
    const hb2 = await handle.boundingBox();
    if (hb2) {
      await page.mouse.move(hb2.x + hb2.width / 2, hb2.y + hb2.height / 2);
      await page.mouse.down();
      await page.mouse.move(hb2.x + hb2.width / 2 - 120, hb2.y + hb2.height / 2, { steps: 8 });
      await page.mouse.up();
    }
  },
};
