import { expect, Locator, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { RUN_DIR } from '../../core/paths';
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
    await snap('Left menu with the Workspace links', page.getByRole('navigation', { name: 'Workspace' }));
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
    // only the four score cards are read (the chat title on the left may say "In progress" - that is checked by CE-019)
    await check('No score card still says "In progress"', () => expect(body.match(/Confidence Score[\s\S]*?Validations Passed[\s\S]{0,60}/i)?.[0] ?? '').not.toMatch(/in progress/i));
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
    const { page } = ctx;
    if (await page.locator('table').first().isVisible().catch(() => false)) await ctx.snap('A classification table (all rows of the four tabs were compared)', page.locator('table').first());
    // Shows the FAILING rows in the picture: opens the tab, category and gate of the first wrong row and outlines every wrong row of that table.
    const showRows = async (wrong: Row[]): Promise<Locator[] | undefined> => {
      const first = wrong[0];
      const t = TABS.find((x) => x.button === first?.tab);
      if (!first || !t || !/\/confidence-engine/.test(page.url())) return undefined;
      await openTab(page, t);
      await selectCategory(page, t, first.category);
      if (first.gate) await gateBox(page, t).getByRole('button').filter({ hasText: exactText(first.gate) }).first().click();
      await page.locator('table tbody tr').first().waitFor({ state: 'attached', timeout: 8_000 });
      const names = new Set(wrong.filter((r) => r.tab === first.tab && r.category === first.category && r.gate === first.gate).map((r) => r.name));
      const rowsHere = page.locator('table tbody tr').filter({ has: page.locator('td:first-child').filter({ hasText: new RegExp(`^\\s*(${[...names].map(esc).join('|')})\\s*$`) }) });
      const n = await rowsHere.count();
      return n ? Array.from({ length: Math.min(n, 8) }, (_, i) => rowsHere.nth(i)) : [page.locator('table').first()];
    };
    const bad = async (label: string, rows: Row[], expectFn: (r: Row) => boolean): Promise<void> => {
      const wrong = rows.filter((r) => !expectFn(r));
      await check(label, () => {
        expect(wrong.map((r) => `${r.tab} › ${r.category}${r.gate ? ' › ' + r.gate : ''} › ${r.name} (${r.value} → ${r.result})`), 'rows that break the rule').toEqual([]);
      }, () => showRows(wrong));
    };
    const rows = walked.rows;
    const withLimit = rows.filter((r) => /^-?\d+(\.\d+)?\s*[≤≥<>]=?\s*-?\d+(\.\d+)?$/.test(r.value));
    await bad('Every Result is PASS, FAIL, WARN or N/A', rows, (r) => /^(PASS|FAIL|WARN|WARNING|N\/A)$/i.test(r.result));
    await bad('Every Coverage is a percentage or N/A', rows, (r) => /^(\d{1,3}(\.\d+)?\s*%|N\/A)$/i.test(r.coverage));
    await bad('Every Execution status icon that has a label says "Execution completed" or "Not Applicable" (or "Not Started" / "Not Scheduled" / not executed, which go with an N/A result)', rows, (r) => r.exec === '' || /^\s*(Execution completed|Not Applicable|Execution not applicable)\s*$/i.test(r.exec) || (/^\s*(Not Started|Not Scheduled|Not executed|Not Run|Mutation Not Run|Not .*)\s*$/i.test(r.exec) && r.result === 'N/A'));
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
    await check('The thread has the final message "Run complete" (and "Execution finished" before it when that line is there)', () => {
      const a = text.search(/execution finished/i), b = text.search(/run complete/i); // the whole page text: the left pane cut can lose the end of the thread
      expect(b, '"Run complete" is not in the thread').toBeGreaterThanOrEqual(0);
      if (a >= 0) expect(b, '"Run complete" comes before "Execution finished"').toBeGreaterThan(a);
      else note('The thread shows "Run complete" as the final message; the older "Execution finished" line is not in the thread of this run (it only appears when the run was watched live).');
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


// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Search box, metric dialog, assistant question and the taxonomy report.
// A case is SKIPPED only when it cannot be reached or carried out (no finished run open, report not downloaded...).
// When it can be carried out and the page does not do what the sheet says, it FAILS.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The downloaded taxonomy report, shared by TAXONOMY-01 .. 07. */
const report: { file: string; html: string; text: string; runId: string } = { file: '', html: '', text: '', runId: '' };
const DOWNLOAD_BUTTON = (page: Page): Locator => page.getByRole('button', { name: /Download full taxonomy gate report/i }).first();

/** Opens the downloaded HTML report in a second tab (file://) and returns it; the caller closes it. */
async function openReport(page: Page): Promise<Page> {
  const rp = await page.context().newPage();
  await rp.goto(pathToFileURL(report.file).href);
  return rp;
}

/**
 * Clicks "Download full taxonomy gate report", saves the file under results/run_<time>/downloads/ and reads it.
 * Every taxonomy case calls this itself (the file of the same run is downloaded again, so each case stands on its own).
 */
async function downloadReport(page: Page): Promise<{ file: string; name: string }> {
  const btn = DOWNLOAD_BUTTON(page);
  await expect(btn, '"Download full taxonomy gate report" is not on the page').toBeVisible({ timeout: 15_000 });
  const dir = path.join(RUN_DIR, 'downloads');
  fs.mkdirSync(dir, { recursive: true });
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), btn.click()]);
  const name = dl.suggestedFilename();
  const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}_${name}`);
  await dl.saveAs(file);
  report.file = file; report.runId = runId(page);
  report.html = fs.readFileSync(file, 'utf8');
  return { file, name };
}

/** A taxonomy case: downloads the report (a failed download FAILS the case), opens the saved file in a second tab and checks inside it. */
const reportCase = (fn: (ctx: Parameters<CaseHandler<RepoPage>>[0], rp: Page) => Promise<void>): CaseHandler<RepoPage> => async (ctx) => {
  await needPage(ctx);
  const { page, check, note, snap } = ctx;
  await snap('Download full taxonomy gate report button', DOWNLOAD_BUTTON(page));
  let name = '';
  await check('Clicking "Download full taxonomy gate report" downloads the report file', async () => { name = (await downloadReport(page)).name; }, DOWNLOAD_BUTTON(page));
  if (!name) return; // nothing was downloaded, so nothing inside it can be checked (the failed check above makes the case FAIL)
  note(`Downloaded ${name} and opened the saved file to check inside it`);
  const rp = await openReport(page);
  try { report.text = norm(await rp.locator('body').innerText()); await fn(ctx, rp); } finally { await rp.close().catch(() => undefined); }
};

export const reportSteps: Record<string, CaseHandler<RepoPage>> = {
  'CONFENG-09': async (ctx) => {
    await needPage(ctx);
    const { page, check, note, snap } = ctx;
    await ctx.step('Open the "Code Intelligence" tab', () => openTab(page, TABS[0]));
    const box = page.getByRole('searchbox').or(page.getByPlaceholder(/search/i)).or(page.locator('input[type="search"]')).first();
    await snap('Confidence Engine gates area (looking for the search box)', box.or(gateBox(page, TABS[0])).first());
    await check('A search box for the gates is shown on the Confidence Engine page', () => expect(box).toBeVisible({ timeout: 5_000 }));
    if (!(await box.isVisible().catch(() => false))) return;
    const gates = await listGates(page, TABS[0]);
    const term = (gates[0] ?? walked.rows[0]?.name ?? 'Coverage').split(/\s+/)[0];
    const countBefore = (await gateBox(page, TABS[0]).getByRole('button').count().catch(() => 0)) || (await page.locator('table tbody tr').count());
    await box.fill(term);
    await page.waitForTimeout(800);
    note(`Searched for "${term}"; items before: ${countBefore}`);
    await check(`Typing "${term}" keeps only the gates / rows that match it`, async () => {
      const shown = (await gateBox(page, TABS[0]).getByRole('button').allInnerTexts().catch(() => [])).map(norm).filter(Boolean);
      const rows = (await page.locator('table tbody tr td:first-child').allInnerTexts()).map(norm).filter(Boolean);
      const items = shown.length ? shown : rows;
      expect(items.length, 'nothing is left after the search').toBeGreaterThan(0);
      expect(items.filter((t) => !new RegExp(esc(term), 'i').test(t)), `items that do not contain "${term}"`).toEqual([]);
    }, box);
    await box.fill('');
    await page.waitForTimeout(500);
    await check('Clearing the search box shows all gates again', async () => {
      const n = (await gateBox(page, TABS[0]).getByRole('button').count().catch(() => 0)) || (await page.locator('table tbody tr').count());
      expect(n).toBe(countBefore);
    }, box);
  },

  'CONFENG-20': async (ctx) => {
    await needPage(ctx);
    const { page, check, note, snap } = ctx;
    await ctx.step('Open the "Code Intelligence" tab', () => openTab(page, TABS[0]));
    await page.locator('table tbody tr').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
    const rows = page.locator('table tbody tr');
    if ((await rows.count()) === 0) ctx.skip('The metric table has no rows on this page, so there is no chevron to click.');
    // prefer a row that has a value
    let idx = 0;
    const n = await rows.count();
    for (let i = 0; i < n; i++) if (!/^(—|N\/A|)$/i.test(norm(await rows.nth(i).locator('td').nth(1).innerText()))) { idx = i; break; }
    const row = rows.nth(idx);
    const name = norm(await row.locator('td').first().innerText());
    note(`Clicked the chevron of "${name}"`);
    await ctx.step(`Click the chevron of "${name}"`, async () => { await row.scrollIntoViewIfNeeded(); await row.locator('td').last().click(); });
    const dlg = page.getByRole('dialog').first();
    await check('A dialog opens', () => expect(dlg).toBeVisible({ timeout: 10_000 }), row);
    if (!(await dlg.isVisible().catch(() => false))) return;
    await snap(`Metric detail dialog of "${name}"`, dlg);
    await check(`The dialog names the metric "${name}"`, () => expect(dlg).toContainText(new RegExp(esc(name), 'i')));
    await check('The dialog shows the gate name', () => expect(norm(String(dlg.innerText())).length).toBeGreaterThan(name.length + 5));
    for (const label of ['Value', 'Status', 'Coverage']) await check(`The dialog shows "${label}"`, () => expect(dlg.getByText(new RegExp(`^\\s*${label}\\s*$`, 'i')).first()).toBeVisible());
    await check('The dialog shows a coverage bar', () => expect(dlg.locator('[role="progressbar"], [class*="progress" i], [class*="bar" i]').first()).toBeVisible());
    await check('The dialog has a "Leaf metrics" table with the columns metric, value, result and coverage', async () => {
      await expect(dlg.getByText(/leaf metrics/i).first()).toBeVisible();
      const heads = (await dlg.locator('th').allInnerTexts()).map((h) => norm(h).toLowerCase());
      for (const c of ['metric', 'value', 'result', 'coverage']) expect(heads.some((h) => h.includes(c)), `column ${c} (columns: ${heads.join(', ')})`).toBe(true);
    });
    await check('The X button closes the dialog', async () => {
      await dlg.getByRole('button', { name: /close|×|x/i }).first().click();
      await expect(dlg).toBeHidden({ timeout: 5_000 });
    });
  },

  'CONFASST-04': async (ctx) => {
    await needPage(ctx);
    const { page, check, note, snap } = ctx;
    const box = page.getByRole('textbox', { name: /ask a confidence question/i }).or(page.getByPlaceholder(/ask a confidence question/i)).first();
    const question = 'Which gates failed for this run?';
    await snap('The question box', box);
    await check('The question box "Ask a confidence question" is shown', () => expect(box).toBeVisible());
    if (!(await box.isVisible().catch(() => false))) return;
    const before = norm(await page.locator('body').innerText()).length;
    await box.fill(question);
    await box.press('Enter');
    note(`Sent the question: "${question}"`);
    await check('The question appears in the thread', () => expect(page.getByText(question, { exact: false }).first()).toBeVisible({ timeout: 15_000 }), box);
    await check('A reply follows the question (new text appears below it within 2 minutes)', async () => {
      await expect.poll(async () => norm(await page.locator('body').innerText()).length, { timeout: 120_000, intervals: [2_000] }).toBeGreaterThan(before + question.length + 40);
    }, page.getByText(question, { exact: false }).last());
  },

  'CONFASST-05': async (ctx) => {
    await needPage(ctx);
    const { page, check, note, snap } = ctx;
    const text0 = norm(await page.locator('body').innerText());
    if (!/which gates failed for this run/i.test(text0)) ctx.skip('The question of CONFASST-04 was not sent in this run (CONFASST-04 did not run), so there is no reply to read.');
    const scores = await runApi(page, 'scores');
    const thread = norm(await page.locator('body').innerText());
    const after = thread.slice(thread.toLowerCase().lastIndexOf('which gates failed for this run') + 30);
    await snap('The reply to the question', page.getByText(/which gates failed for this run/i).last());
    note(`Reply starts: ${after.slice(0, 300)}`);
    await check('The reply names a gate, testing type, score or metric of this run', () => {
      const names = [...TABS.map((t) => t.button), ...walked.rows.slice(0, 200).map((r) => r.name), String(scores.overall_score ?? '')].filter((x) => x && x.length > 2);
      expect(names.some((n) => new RegExp(esc(n), 'i').test(after)), 'the reply mentions none of the gates, scores or metrics shown on the page').toBe(true);
    });
  },

  'TAXONOMY-01': async (ctx) => {
    await needPage(ctx);
    const { page, check, note, snap } = ctx;
    const id = runId(page);
    await snap('Download full taxonomy gate report button', DOWNLOAD_BUTTON(page));
    let got: { file: string; name: string } | undefined;
    await check('Clicking "Download full taxonomy gate report" downloads a file', async () => { got = await downloadReport(page); note(`Downloaded ${got.name}`); }, DOWNLOAD_BUTTON(page));
    if (!got) return;
    const { name } = got;
    await check(`The file is named taxonomy-gate-${id}.html`, () => expect(name).toMatch(new RegExp(`^taxonomy-gate-${esc(id)}\\.html$`, 'i')));
    const rp = await openReport(page);
    try {
      report.text = norm(await rp.locator('body').innerText());
      await check('The saved file opens as an HTML page with a title', async () => { expect(report.text.length, 'empty report').toBeGreaterThan(20); expect(report.html).toMatch(/<title>[^<]+<\/title>|<h1[\s>]/i); });
      await check('The report shows a generated timestamp', () => expect(report.text).toMatch(/generated[^]{0,40}\d{4}|\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}|\d{1,2}\/\d{1,2}\/\d{4}/i));
    } finally { await rp.close().catch(() => undefined); }
  },

  'TAXONOMY-02': reportCase(async (ctx, rp) => {
    const { page, check, note } = ctx;
    const t = norm(await rp.locator('body').innerText());
    const id = runId(page);
    const summary = await runApi(page, 'summary');
    const scores = await runApi(page, 'scores');
    const head = norm(await page.locator('body').innerText());
    const commit = (head.match(/\b([0-9a-f]{7})\s*·\s*[0-9a-f]{8}/i) ?? [])[1] ?? '';
    const { repo, branch } = { repo: String((ctx as unknown as { input: { repo?: string } }).input?.repo ?? ''), branch: new URL(page.url()).searchParams.get('branch') ?? '' };
    note(`Report text starts: ${t.slice(0, 300)}`);
    await check('The report shows the Run ID', () => expect(t.toLowerCase()).toContain(id.toLowerCase().slice(0, 8)));
    await check('The report shows the commit of the run', () => expect(t.toLowerCase()).toContain(commit.toLowerCase()));
    await check('The report shows the repository', () => expect(t).toMatch(new RegExp(esc((repo || String(summary.repo_name ?? summary.repository ?? '')).split('/').pop() ?? ''), 'i')));
    if (branch) await check('The report shows the branch', () => expect(t).toContain(branch));
    await check('The report shows the run status (completed)', () => expect(t).toMatch(/completed/i));
    for (const label of [/gate status/i, /pipeline gate/i, /whitebox confidence/i, /blackbox confidence/i, /weighted/i, /unweighted/i])
      await check(`The report has "${String(label).slice(1, -2)}"`, () => expect(t).toMatch(label));
    await check('The Whitebox Confidence in the report (unweighted) equals the Whitebox figure of the Confidence Engine', () => {
      const wb = (head.match(/Whitebox Score\s*(\d+(?:\.\d+)?)/i) ?? [])[1] ?? String(scores.whitebox_score ?? '');
      expect(wb, 'Whitebox figure not found on the page').not.toBe('');
      expect(t, `the report does not contain the Whitebox figure ${wb}`).toContain(String(Math.round(Number(wb))));
    });
  }),

  'TAXONOMY-03': reportCase(async (ctx, rp) => {
    const { check } = ctx;
    const t = norm(await rp.locator('body').innerText());
    if (!walked.rows.length) ctx.skip('The Confidence Engine tables were not read in this run (CE-007 to CE-010 did not run), so there is nothing to compare with.');
    for (const tab of TABS) await check(`The report has a section for "${tab.button}" with a score out of 100`, () => {
      expect(t).toMatch(new RegExp(esc(tab.button), 'i'));
      expect(t).toMatch(/\d+(\.\d+)?\s*\/\s*100/);
    });
    await check('The report has tables with the columns Classification, Value, Execution status, Result and Coverage', async () => {
      const heads = (await rp.locator('th').allInnerTexts()).map((h) => norm(h).toLowerCase());
      for (const c of COLUMNS) expect(heads.some((h) => h.includes(c.toLowerCase())), `column ${c}`).toBe(true);
    });
    await check('Every classification read from the Confidence Engine is in the report', () => {
      const missing = [...new Set(walked.rows.map((r) => r.name))].filter((n) => !t.toLowerCase().includes(n.toLowerCase()));
      expect(missing, 'classifications missing from the report').toEqual([]);
    });
  }),

  'TAXONOMY-04': reportCase(async (ctx, rp) => {
    const { check, note } = ctx;
    if (!walked.rows.length) ctx.skip('The Confidence Engine tables were not read in this run (CE-007 to CE-010 did not run), so there is nothing to compare with.');
    const reportRows = (await rp.locator('table tbody tr').evaluateAll((trs) => trs.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').replace(/\s+/g, ' ').trim())))).filter((r) => r.length >= 4);
    const unique = new Map(walked.rows.map((r) => [`${r.name}|${r.result}`, r]));
    note(`${walked.rows.length} rows read in the UI (${unique.size} different classification + result pairs); ${reportRows.length} rows in the report. The "Metric Analysis" sheet is not part of this suite, so the UI is compared with the report only.`);
    await check('The report has table rows', () => expect(reportRows.length).toBeGreaterThan(0));
    await check('Every UI classification has a report row with the same Result', () => {
      const bad = [...unique.values()].filter((r) => !reportRows.some((c) => c[0]?.toLowerCase() === r.name.toLowerCase() && c.some((x) => x.toUpperCase() === r.result))).map((r) => `${r.name} (${r.result})`);
      expect(bad.slice(0, 15), 'classifications whose Result differs or is missing in the report').toEqual([]);
    });
  }),

  'TAXONOMY-05': reportCase(async (ctx, rp) => {
    const { check, note, skip } = ctx;
    const failRows = rp.locator('table tbody tr').filter({ hasText: /\bFAIL\b/ });
    if ((await failRows.count()) === 0) skip('The report of this run has no FAIL row, so there is no evidence link to look for.');
    note(`${await failRows.count()} FAIL rows in the report`);
    await check('A FAIL row has evidence links', () => expect(failRows.first().locator('a[href]').first()).toBeVisible());
    await check('The evidence links give a file path and a line number', async () => {
      const t = norm(await failRows.first().innerText());
      const hrefs = await failRows.first().locator('a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
      expect(t + ' ' + hrefs.join(' ')).toMatch(/[\w./-]+\.\w+[:#L]+\d+|#L\d+/);
    }, failRows.first());
  }),

  'TAXONOMY-06': reportCase(async (ctx, rp) => {
    const { page, check, note, skip } = ctx;
    const links = await rp.locator('a[href*="github.com"]').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
    if (links.length === 0) skip('The report has no GitHub evidence link, so there is nothing to open.');
    const head = norm(await page.locator('body').innerText());
    const commit = (head.match(/\b([0-9a-f]{7})\s*·\s*[0-9a-f]{8}/i) ?? [])[1] ?? '';
    note(`${links.length} GitHub links; first: ${links[0]}`);
    await check('The evidence link points to a file at the analysed commit', () => expect(links[0].toLowerCase()).toContain(commit.toLowerCase()));
    await check('The evidence link names a line to highlight (#L<number>)', () => expect(links[0]).toMatch(/#L\d+/));
    note('The link is checked by its address; GitHub itself is not opened (the repository may need a GitHub sign-in).');
  }),

  'TAXONOMY-07': reportCase(async (ctx, rp) => {
    const { check, note, skip } = ctx;
    const naRows = rp.locator('table tbody tr').filter({ hasText: /\bN\/A\b/ });
    if ((await naRows.count()) === 0) skip('The report of this run has no N/A row, so there is nothing "not measured" to look for.');
    note(`${await naRows.count()} rows with N/A in the report`);
    await check('A row with the value N/A also has the Result N/A', async () => {
      const cells = (await naRows.first().locator('td').allInnerTexts()).map(norm);
      expect(cells.filter((c) => /^N\/A$/i.test(c)).length, `cells: ${cells.join(' | ')}`).toBeGreaterThanOrEqual(2);
    }, naRows.first());
    await check('The report says the classification was not measured', async () => {
      const t = norm(await rp.locator('body').innerText());
      expect(t).toMatch(/not measured|not executed|not applicable|not run/i);
    });
  }),
};
