import { expect, Locator, Page } from '@playwright/test';
import { setBlocker } from '../../core/runner/blockers';
import { BlockingFailure } from '../../core/runner/checks';
import { CaseHandler } from '../../core/runner/registerCases';
import { closeMenus, comingSoonCard, labelText } from '../../core/pages/menus';
import { apiGet, tenantOf } from '../../core/pages/runApi';
import { inputs } from '../flow/helpers';
import { RepoPage, ci, flex, has } from '../repo/shared/RepoPage';

/**
 * The Execution module: Run plan -> "Execute run" -> "White Box execution" card -> "Open Confidence Engine" -> wait for the run to
 * finish -> results. Verified live (C-_Stack / WestCoastFitness-positive, run took ~14 min). Checks use locators (roles / names /
 * text) and the run API calls the page itself makes (read from inside the page, same session) - never screenshots.
 * "Execute run" starts a REAL pipeline, so it is clicked ONLY when ALLOW_EXECUTE_RUN = Y on the Input sheet.
 */
const STAGES = [
  'Queued', 'Admitted', 'Syncing repository', 'Detecting languages & signals', 'Planning analysis',
  'Running analysis tasks', 'Scoring & taxonomy', 'Publishing projections',
];
const TABS: Array<[string, string]> = [
  ['Code Intelligence', 'CODE INTELLIGENCE'], ['Performance', 'PERFORMANCE TESTING'], ['Security', 'SECURITY'], ['Compliance', 'COMPLIANCE'],
];

/** State shared by the steps of this module (they run one after another in the same worker). */
const run = { id: '', commit: '', badCalls: [] as string[], finished: false, durationNote: '', longestStallMin: 0, wired: false };

const bodyText = async (page: Page): Promise<string> => (await page.locator('body').innerText().catch(() => '')) || '';
const num = (s: string | undefined): number => Number(s ?? NaN);
/** The elements of a locator that are really on screen (a hidden copy in another tab is ignored). */
const onScreen = (l: Locator): Locator => l.locator('visible=true').first();

/** The element after a label inside the same card (its value). */
const chatCard = (page: Page): Locator =>
  page.getByText(ci('White Box execution')).last().locator('xpath=ancestor::*[.//button[normalize-space()="Open Confidence Engine"]][1]');

/** Reads one of the run API calls the page makes (same origin, same session). tenant_id is taken from a call the page already made. */
async function runApi(page: Page, what: 'summary' | 'scores' | 'taxonomy-gate'): Promise<Record<string, unknown>> {
  const tenant = await tenantOf(page);
  const r = await apiGet(page, `/views-api/v1/runs/${run.id}/${what}?tenant_id=${tenant}`);
  return r.status === 200 ? (r.json as Record<string, unknown>) : { error: r.status };
}

/** Runs the whole waiting loop once (EXE-006) and leaves the result in `run`. Shared so later steps can re-use a finished run. */
export const executionSteps: Record<string, CaseHandler<RepoPage>> = {
  'EXE-001': async (ctx) => {
    const { snap, page, input, check, note } = ctx;
    const { branch } = inputs(ctx, { branches: 1 });
    if (!/^y/i.test(input.get('ALLOW_EXECUTE_RUN').trim())) {
      const reason = 'ALLOW_EXECUTE_RUN is not Y on the Input sheet - "Execute run" starts a real pipeline and uses an execution, so it was not clicked.';
      setBlocker('execute', ctx.row.id, reason);
      ctx.skip(reason);
    }
    Object.assign(run, { id: '', commit: '', badCalls: [], finished: false, durationNote: '', longestStallMin: 0 });
    if (!run.wired) {
      page.on('response', (r) => {
        if (/\/(runtime-api|views-api)\/v1\/runs\//.test(r.url()) && r.status() >= 400) run.badCalls.push(`${r.status()} ${new URL(r.url()).pathname}`);
      });
      run.wired = true;
    }
    const execute = page.getByRole('button', { name: /^Execute run$/ }).last();
    await ctx.step('"Execute run" is shown and enabled on the Run plan', async () => {
      await expect(execute).toBeVisible({ timeout: 20_000 });
      await expect(execute).toBeEnabled();
    });
    await execute.click();
    // Two things can happen: a NEW run starts ("White Box Analysis is underway ..."), or the commit was already analysed and the
    // platform shows the EARLIER finished result straight away (nothing new is started, no execution is used).
    const underway = page.getByText(/White Box Analysis is underway for/i).last();
    const earlier = page.getByText(/Run finished|Run complete|Execution complete|Finished with (failures|errors)/i).last();
    const which = await Promise.race([
      underway.waitFor({ state: 'visible', timeout: 90_000 }).then(() => 'new' as const),
      earlier.waitFor({ state: 'visible', timeout: 90_000 }).then(() => 'earlier' as const),
    ]).catch(() => '' as const);
    if (!which) {
      const err = ((await page.getByText(/could not|unavailable|not allowed|limit/i).last().innerText().catch(() => '')) || 'no message appeared').trim().slice(0, 200);
      throw new BlockingFailure('execute', `Execute run did not start a run and showed no earlier result: ${err}`);
    }
    if (which === 'earlier') {
      note('No new run was started: this commit was already analysed, so the platform showed the earlier finished result straight away (no execution was used).');
      await check('The chat shows the finished result ("Run finished ..." / "Run complete ...")', () => expect(earlier).toBeVisible());
      await check('The page header says the execution is complete', () => expect(page.getByText(/Execution complete/i).first()).toBeVisible());
      await check('"Open Confidence Engine" is offered', () => expect(page.getByRole('button', { name: /Open Confidence Engine/i }).last()).toBeVisible());
      await snap('Earlier finished result with "Open Confidence Engine"', page.getByRole('button', { name: /Open Confidence Engine/i }).last());
      return;
    }
    await check('The chat shows "Execute whitebox run"', () => expect(page.getByText(/Execute white\s*box run/i).last()).toBeVisible());
    await check(`"White Box Analysis is underway" names the branch "${branch}"`, () =>
      expect(page.getByText(/White Box Analysis is underway for/i).last()).toContainText(has(branch)));
    await check('The page header shows "Executing…"', () => expect(page.getByText(/^\s*Executing/i).first()).toBeVisible());
    await check('"Cancel execution" is offered', () => expect(page.getByRole('button', { name: /Cancel execution/i }).first()).toBeVisible());
    await snap('Run started ("White Box Analysis is underway")', page.getByText(/White Box Analysis is underway for/i).last());
    note('"Cancel execution" is NOT clicked.');
  },

  'EXE-002': async (ctx) => {
    const { snap, page, check, note } = ctx;
    const { branch } = inputs(ctx, { branches: 1 });
    const card = chatCard(page);
    await ctx.step('The "White Box execution" card appears', () => expect(card).toBeVisible({ timeout: 60_000 }));
    await check('The card names the repository as <owner>/<repo>', () => expect(card).toContainText(/[\w.-]+\/[\w.-]+/));
    await check('It shows "N/1 branches"', () => expect(card).toContainText(/\d+\s*\/\s*1\s+branch/i));
    await check('It has "Execution status" with a status', async () => {
      await expect(card.getByText(/^\s*Execution status\s*$/i).first()).toBeVisible();
      await expect(card).toContainText(/Execution status\s*:?\s*\S+/i); // any status word (IN PROGRESS, STARTING, ...)
    });
    await check(`It lists the branch "${branch}"`, () => expect(card).toContainText(has(branch)));
    await check('It shows a shortened run id (8 characters and "…")', () => expect(card).toContainText(/[0-9a-f]{8}\s*(…|\.{2,3})/i));
    await check('"Open Confidence Engine" is visible and enabled', async () => {
      await expect(card.getByRole('button', { name: /Open Confidence Engine/i })).toBeVisible();
      await expect(card.getByRole('button', { name: /Open Confidence Engine/i })).toBeEnabled();
    });
    await snap('"White Box execution" card', card);
    note(`Card text: ${((await card.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim().slice(0, 200)}`);
  },

  'EXE-003': async (ctx) => {
    const { snap, page, check, note } = ctx;
    const { branch } = inputs(ctx, { branches: 1 });
    await chatCard(page).getByRole('button', { name: /Open Confidence Engine/i }).click();
    try {
      await page.waitForURL(/\/confidence-engine\?/, { timeout: 30_000 });
    } catch {
      throw new BlockingFailure('engine', '"Open Confidence Engine" did not open the Confidence Engine page.');
    }
    const url = new URL(page.url());
    run.id = url.searchParams.get('runId') ?? '';
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    await check('The address has from=ea', () => expect(url.searchParams.get('from')).toBe('ea'));
    await check('The address has mode=whitebox', () => expect(url.searchParams.get('mode')).toBe('whitebox'));
    await check('The address has pillar=engine', () => expect(url.searchParams.get('pillar')).toBe('engine'));
    await check('The address has a runId (a UUID)', () => expect(run.id).toMatch(uuid));
    await check('The address has a projectId (a UUID)', () => expect(url.searchParams.get('projectId') ?? '').toMatch(uuid));
    await check('The address has a repositoryId (a UUID)', () => expect(url.searchParams.get('repositoryId') ?? '').toMatch(uuid));
    const selector = page.getByRole('combobox', { name: /Branch run/i });
    await check('The "Branch run" selector is shown', () => expect(selector).toBeVisible({ timeout: 30_000 }));
    await check(`It shows the branch "${branch.slice(0, 20)}…"`, () => expect(selector).toContainText(has(branch.slice(0, 20))));
    await check('It shows the commit id and the first 8 characters of the run id', () =>
      expect(selector).toContainText(new RegExp(`[0-9a-f]{7}.*${run.id.slice(0, 8)}`, 'i')));
    run.commit = (((await selector.innerText().catch(() => '')) || '').match(/\b([0-9a-f]{7})\b/i)?.[1]) ?? '';
    await check('The Execution Assistant thread is shown on the left', () =>
      expect(page.getByText(/Execution Assistant thread/i).first()).toBeVisible());
    await snap('Confidence Engine page of the run (Branch run selector)', selector);
    note(`Run id: ${run.id}; commit: ${run.commit}`);
  },

  'EXE-004': async (ctx) => {
    const { snap, page, check } = ctx;
    for (const name of ['Dashboard', 'Confidence Engine', 'Execution Assistant', 'Account and Plan']) {
      await check(`Left menu link "${name}"`, () => expect(page.getByRole('link', { name: flex(name) }).first()).toBeVisible());
    }
    await check('Left menu "Sign out"', () => expect(page.getByRole('button', { name: /Sign out/i }).first()).toBeVisible());
    for (const [name, pillar] of [['Confidence Object', 'object'], ['Confidence Graph', 'graph']] as const) {
      await check(`Top tab "${name}"`, () => expect(page.locator(`a[href*="/confidence-engine"][href*="pillar=${pillar}"]`).first()).toBeVisible());
    }
    await check('Top tab "Confidence Engine"', () => expect(page.getByText(ci('Confidence Engine')).first()).toBeVisible());
    await snap('Confidence Engine page: menu, tabs and score cards', page.getByText(ci('Confidence Engine')).first());
    await check('"Closed-Loop Intel" is shown as COMING SOON', () => expect(comingSoonCard(page)).toBeVisible());
    for (const label of ['Confidence Score', 'Whitebox Score', 'Blackbox Score', 'Validations Passed']) {
      await check(`Score card "${label}"`, () => expect(page.getByText(flex(label)).first()).toBeVisible());
    }
    for (const [tab] of TABS) {
      await check(`Category tab "${tab}"`, () => expect(page.getByRole('button', { name: flex(tab) }).first()).toBeVisible());
    }
  },

  'EXE-005': async (ctx) => {
    const { snap, page, check, note } = ctx;
    const toggle = page.getByRole('button', { name: /Execution Status/i }).first();
    await ctx.step('"Execution Status" is shown', () => expect(toggle).toBeVisible());
    if (!(await page.getByText('Queued', { exact: true }).first().isVisible().catch(() => false))) await toggle.click().catch(() => undefined);
    await check('A timer is shown (e.g. "2m 01s")', () => expect(toggle).toContainText(/\d+m \d{2}s|\d+s/));
    await check('A task counter is shown (N/total)', () => expect(toggle).toContainText(/\d+\/\d+/));
    for (const stage of STAGES) {
      await check(`Stage "${stage}"`, () => expect(onScreen(page.getByText(flex(stage)))).toBeVisible());
    }
    await check('The stages are in the right order', async () => {
      // read only the block that holds the stages (the chat above may mention some of the same words)
      const list = page.getByText(flex(STAGES[0])).first().locator('xpath=ancestor::*[.//*[contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "publishing projections")]][1]');
      const text = ((await list.innerText().catch(() => '')) || (await bodyText(page))).toLowerCase(); // capitals may come from CSS
      const at = STAGES.map((s) => text.indexOf(s.toLowerCase()));
      expect(at.every((n) => n >= 0)).toBe(true);
      expect([...at].sort((a, b) => a - b)).toEqual(at);
    });
    await snap('Execution Status with the stages', toggle);
    note(`Status line: ${((await toggle.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim()}`);
  },

  'EXE-006': async (ctx) => {
    const { snap, page, data, check, note } = ctx;
    const wait = Number(data.wait_min || ctx.input.get('EXECUTION_WAIT_MIN') || 20);
    if (!run.id) throw new BlockingFailure('engine', 'No run id (the Confidence Engine page was not opened), so there is nothing to wait for.');
    const started = Date.now();
    let lastDone = -1;
    let lastChange = Date.now();
    let longest = 0;
    let last: Record<string, unknown> = {};
    while (Date.now() - started < wait * 60_000) {
      last = await runApi(page, 'summary').catch(() => ({}));
      const done = num(String(last.completed_tasks ?? '')) + num(String(last.failed_tasks ?? '')) + num(String(last.skipped_tasks ?? ''));
      if (done !== lastDone) { lastDone = done; lastChange = Date.now(); }
      longest = Math.max(longest, (Date.now() - lastChange) / 60_000);
      if (last.phase === 'completed' || String(last.status) === 'cancelled') { run.finished = true; break; } // phase 'completed' is the goal; status 'passed' / 'failed' is the branch verdict
      await page.waitForTimeout(10_000);
    }
    run.longestStallMin = Math.round(longest * 10) / 10;
    const minutes = Math.round((Date.now() - started) / 6000) / 10;
    run.durationNote = `${minutes} min of waiting; run duration ${String(last.duration_seconds ?? '?')} s`;
    note(`Waited ${minutes} min. Last API state: status=${String(last.status)}, phase=${String(last.phase)}, finished tasks=${lastDone}/${String(last.total_tasks)}`);
    await check(`The run finishes within ${wait} minutes`, () => expect(run.finished, `still "${String(last.status)}" / "${String(last.phase)}" after ${wait} min`).toBe(true));
    await check('Progress never stood still for more than 5 minutes', () =>
      expect(run.longestStallMin, `the number of finished tasks did not change for ${run.longestStallMin} min`).toBeLessThanOrEqual(5));
    if (!run.finished) throw new BlockingFailure('finished', `The run did not finish within ${wait} min - the result checks cannot be made.`);
    await page.getByRole('button', { name: 'Refresh', exact: true }).click().catch(() => undefined);
    await check('The chat says "Run complete"', () => expect(page.getByText(/Run complete/i).last()).toBeVisible({ timeout: 60_000 }));
    await check('The page shows the final scores (a Confidence Score number out of 100) within 3 minutes', () =>
      expect.poll(() => bodyText(page), { timeout: 180_000, intervals: [2_000] }).toMatch(/Confidence Score[\s\S]*?\n\s*\d{1,3}\s*\n\s*\/\s*100/i));
    await snap('Final scores on the Confidence Engine page', page.getByText(flex('Confidence Score')).first());
  },

  'EXE-007': async (ctx) => {
    const { snap, page, check, note } = ctx;
    await expect.poll(() => bodyText(page), { timeout: 120_000, intervals: [2_000] }).toMatch(/Confidence Score[\s\S]*?\n\s*\d{1,3}\s*\n\s*\/\s*100/i).catch(() => undefined);
    const text = await bodyText(page);
    const score = text.match(/Confidence Score[\s\S]*?\n\s*(\d{1,3}|—)\s*\n\s*\/\s*100\s*\n\s*([^\n]+)/i);
    const wb = text.match(/Whitebox Score\s*\n+\s*(\d{1,2}|N\/A|—)\s*(?:\n+\s*\/\s*50)?/i);
    const bb = text.match(/Blackbox Score\s*\n+\s*(\d{1,3}(?:\.\d+)?|N\/A|—)\s*(?:\n+\s*\/\s*\d+)?/i);
    const val = text.match(/Validations Passed\s*\n+\s*(\d+)\s*\/\s*(\d+)\s*\n+\s*(\d+)\s*%/i);
    note(`Confidence ${score?.[1]}/100 "${score?.[2]?.trim()}"; Whitebox ${wb?.[1]}/50; Blackbox ${bb?.[1]}/50; Validations ${val?.[1]}/${val?.[2]} (${val?.[3]}%)`);
    await snap('Score cards (Confidence, Whitebox, Blackbox, Validations)', page.getByText(flex('Confidence Score')).first());
    await check('Confidence Score is a number out of 100', () => { expect(score?.[1]).toMatch(/^\d+$/); expect(num(score?.[1])).toBeLessThanOrEqual(100); });
    await check('A label is shown next to the score (e.g. Hold)', () => expect((score?.[2] ?? '').trim()).not.toMatch(/^(In progress|—|)$/i));
    await check('Whitebox Score is a number out of 50', () => expect(wb?.[1]).toMatch(/^\d+$/));
    await check('Whitebox Score is about half of the Confidence Score (within 1)', () =>
      expect(Math.abs(num(wb?.[1]) - num(score?.[1]) / 2)).toBeLessThanOrEqual(1));
    await check('Blackbox Score is a number or N/A', () => expect(bb?.[1]).toMatch(/^(\d+(\.\d+)?|N\/A)$/i));
    await check('Validations Passed shows "passed/total"', () => expect(val).not.toBeNull());
    await check('The validations percentage is passed / total', () => expect(Math.abs(num(val?.[3]) - (num(val?.[1]) / num(val?.[2])) * 100)).toBeLessThan(1));
    await check('No score card still says "In progress"', () => {
      const cards = text.match(/Confidence Score[\s\S]*?Validations Passed[\s\S]{0,60}/i)?.[0] ?? '';
      expect(cards).not.toMatch(/in progress/i);
    });
  },

  'EXE-008': async (ctx) => {
    const { snap, page, check, note } = ctx;
    await check('"Gate Analysis" is shown', () => expect(page.getByText(ci('Gate Analysis')).first()).toBeVisible());
    for (const gate of ['Pipeline Gate', 'Whitebox Confidence', 'Blackbox Confidence']) {
      await check(`Gate "${gate}" is shown with its weight`, async () => {
        await expect(page.getByText(flex(gate)).first()).toBeVisible();
        await expect(page.getByText(flex(gate)).first().locator('xpath=following-sibling::*[1]')).toContainText(/\d+\s*%\s*weight/i);
      });
    }
    for (const label of ['TOTAL', 'PASSED', 'FAILED', 'COVERAGE', 'RETRIES', 'LOOP', 'PASS RATE']) {
      await check(`Metric "${label}" is shown`, () => expect(labelText(page, label).first()).toBeVisible());
    }
    await snap('Gate Analysis and run metrics', page.getByText(ci('Gate Analysis')).first());
    const t = await bodyText(page);
    const m = t.match(/TOTAL\s*\n+\s*(\d+)\s*\n+\s*PASSED\s*\n+\s*(\d+)\s*\n+\s*FAILED\s*\n+\s*(\d+)\s*\n+\s*COVERAGE\s*\n+\s*(\d+)%\s*\n+\s*RETRIES\s*\n+\s*(\d+)\s*\n+\s*LOOP\s*\n+\s*(\w[^\n]*)\s*\n+\s*PASS RATE\s*\n+\s*(\d+)%/i);
    const val = t.match(/Validations Passed\s*\n+\s*(\d+)\s*\/\s*(\d+)/i);
    note(`TOTAL ${m?.[1]}, PASSED ${m?.[2]}, FAILED ${m?.[3]}, COVERAGE ${m?.[4]}%, RETRIES ${m?.[5]}, LOOP ${m?.[6]}, PASS RATE ${m?.[7]}%`);
    const weights = [...t.matchAll(/(Pipeline Gate|Whitebox Confidence|Blackbox Confidence)\s*\n+\s*(\d+)% weight/g)].map((x) => num(x[2]));
    note(`Gate weights shown: ${weights.join('% + ')}% = ${weights.reduce((a, b) => a + b, 0)}%`);
    await check('The metrics could be read', () => expect(m).not.toBeNull());
    await check('PASSED + FAILED = TOTAL', () => expect(num(m?.[2]) + num(m?.[3])).toBe(num(m?.[1])));
    await check('PASS RATE = PASSED / TOTAL', () => expect(Math.abs(num(m?.[7]) - (num(m?.[2]) / num(m?.[1])) * 100)).toBeLessThan(1));
    await check('TOTAL equals the total of the "Validations Passed" card', () => expect(num(m?.[1])).toBe(num(val?.[2])));
    await check('PASSED equals the passed count of the "Validations Passed" card', () => expect(num(m?.[2])).toBe(num(val?.[1])));
    // Pipeline Gate is a gate (shown dimmed, score 0); the score itself is made of Whitebox + Blackbox
    if (weights.length === 3 && weights[1] + weights[2] !== 100) note(`Whitebox + Blackbox weights read ${weights[1] + weights[2]}% (informational, not a check).`);
    if (weights.length === 3 && weights[0] + weights[1] + weights[2] !== 100) note(`Pipeline Gate also shows its own ${weights[0]}% weight, so all three together read ${weights[0] + weights[1] + weights[2]}% (informational).`);
  },

  'EXE-009': async (ctx) => {
    const { snap, page, check } = ctx;
    await closeMenus(page);
    let snapped = false;
    for (const [tab, heading] of TABS) {
      const head = onScreen(page.locator('p').filter({ hasText: new RegExp(`^\\s*${tab}`, 'i') }));
      await check(`${tab}: the tab opens`, async () => {
        await page.getByRole('button', { name: flex(tab) }).first().click();
        await expect(head).toBeVisible({ timeout: 15_000 });
      });
      await check(`${tab}: the heading "${heading}" is shown`, () => expect(head).toBeVisible());
      await check(`${tab}: at least one gate says COMPLETED`, () => expect(onScreen(page.getByText(/^\s*COMPLETED\s*$/i))).toBeVisible());
      for (const col of ['Classification', 'Value', 'Execution status', 'Result', 'Coverage']) {
        await check(`${tab}: table column "${col}"`, () => expect(onScreen(page.getByText(new RegExp(`^\\s*${col}\\s*$`, 'i')))).toBeVisible());
      }
      await check(`${tab}: results are PASS, FAIL or N/A`, () => expect(onScreen(page.getByText(/^\s*(PASS|PASSED|FAIL|FAILED|N\/A)\s*$/i))).toBeVisible());
      if (!snapped) { snapped = true; await snap(`${tab} tab: results table`, head); }
    }
    await page.getByRole('button', { name: flex('Code Intelligence') }).first().click().catch(() => undefined);
  },

  'EXE-010': async (ctx) => {
    const { snap, page, check, note } = ctx;
    const branch = inputs(ctx, { branches: 1 }).branch;
    const summary = await runApi(page, 'summary');
    const scores = await runApi(page, 'scores');
    const gate = await runApi(page, 'taxonomy-gate');
    note(`summary: status=${String(summary.status)}, phase=${String(summary.phase)}, tasks done/failed/skipped/total=${String(summary.completed_tasks)}/${String(summary.failed_tasks)}/${String(summary.skipped_tasks)}/${String(summary.total_tasks)}, score=${String(summary.overall_score)}; ${run.durationNote}`);
    await check('The run summary can be read', () => expect(summary.error).toBeUndefined());
    await check('It is the same run id as in the address', () => expect(summary.run_id).toBe(run.id));
    await check(`It is for the branch "${branch}"`, () => expect(String(summary.branch_name ?? '').toLowerCase()).toBe(branch.toLowerCase()));
    await check('Its commit matches the commit on the page', () => expect(String(summary.commit_sha ?? '')).toMatch(new RegExp(`^${run.commit.replace(/[^0-9a-f]/gi, '')}`, 'i')));
    await check('completed + failed + skipped tasks = total tasks', () =>
      expect(num(String(summary.completed_tasks)) + num(String(summary.failed_tasks)) + num(String(summary.skipped_tasks))).toBe(num(String(summary.total_tasks))));
    await check('The score in the run summary equals the Confidence Score on the page', async () => {
      const t = await bodyText(page);
      const shown = num(t.match(/Confidence Score[\s\S]*?\n\s*(\d{1,3})\s*\n\s*\/\s*100/i)?.[1]);
      // the page shows a whole number, the API a decimal (84.1): compare after rounding
      expect(shown, `API score ${String(summary.overall_score)}`).toBe(Math.round(num(String(summary.overall_score))));
    });
    await snap('Confidence Score on the page (compared with the run summary)', page.getByText(flex('Confidence Score')).first());
    await check('The score status is OK', () => expect(scores.score_status).toBe('OK'));
    await check('The taxonomy gate is completed with a saved score snapshot', async () => {
      expect(gate.gate_status).toBe('completed');
      expect(gate.snapshot_missing).not.toBe(true);
    });
    await check('The run phase is "completed"', () => expect(summary.phase).toBe('completed'));
    await check('The run has a final result (status is not still "pending" or "running")', () => expect(String(summary.status)).not.toMatch(/^(pending|running|queued|executing)$/i));
    note(`Run result (status): ${String(summary.status)} - this is the branch's pass / fail verdict, not a problem with the run itself.`);
    await check('No run API call returned an error (4xx / 5xx)', () => expect(run.badCalls, run.badCalls.join(', ')).toEqual([]));
  },
};
