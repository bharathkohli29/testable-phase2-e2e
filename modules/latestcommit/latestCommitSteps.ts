import { expect, Page } from '@playwright/test';
import { RUN_DIR } from '../../core/paths';
import { apiGet, tenantOf } from '../../core/pages/runApi';
import { BlockingFailure } from '../../core/runner/checks';
import { CaseHandler } from '../../core/runner/registerCases';
import { labelText } from '../../core/pages/menus';
import { inputs } from '../flow/helpers';
import { readDashboardRow, readEngine, readGraph, readObject, same, until } from '../flow/crossScreen';
import { RepoPage } from '../repo/shared/RepoPage';
import { pushDummyCommit } from './dummyCommit';
import { obj as locatorOf } from '../../core/keywords/obj';
import { listOf } from '../../core/keywords/expected';

import { expected as expectedOf } from '../../core/keywords/expected';
/**
 * The Latest commit module: add a "Dummy PR" line to the README of the branch under test, push it, and the platform has a newer tip.
 * Then click "Analyze latest commit" (this starts a REAL run and uses one execution), stay on the Confidence Engine page and wait for
 * the run to finish. Only what is new in a live run is checked here - the scores, tabs and graph were already checked in the
 * Confidence Engine and Graph modules. Everything is switched by ALLOW_DUMMY_COMMIT on the Input sheet (N = nothing is pushed or clicked).
 */
const STAGES = listOf('latestcommit.list.stages');

const st = {
  oldRun: '', oldSha: '', newSha: '', newRun: '', meterBefore: NaN, badCalls: [] as string[], wired: false,
  finished: false, longestStallMin: 0, waitedNote: '',
};

const runIdOf = (page: Page): string => new URL(page.url()).searchParams.get('runId') ?? '';
const num = (s: unknown): number => Number(String(s ?? '').replace(/[^\d.\-]/g, ''));
const bodyText = async (page: Page): Promise<string> => (await locatorOf(page, 'latestcommit.css.body').innerText().catch(() => '')) || '';
const meter = async (page: Page): Promise<number> => num((await bodyText(page)).match(/Executions:\s*(\d+)\s*\/\s*\d+/i)?.[1]);
/** The Confidence Score shown on the page (whitespace-agnostic: "Confidence Score commit 5beda03 85 /100 Pass"). */
const shownScore = async (page: Page): Promise<string> => ((await bodyText(page)).replace(/\s+/g, ' ').match(/Confidence Score\s*(?:commit\s*\S+\s*)?(\d{1,3})\s*\/\s*100/i)?.[1]) ?? '';
const refreshBtn = (page: Page) => locatorOf(page, 'latestcommit.button.refresh').first();
const pageTitle = (page: Page) => labelText(page, 'PR Confidence Analysis').first();

async function summary(page: Page, runId: string): Promise<Record<string, any>> {
  const tenant = await tenantOf(page);
  const r = await apiGet(page, `/views-api/v1/runs/${runId}/summary?tenant_id=${tenant}`);
  return r.status === 200 ? (r.json as Record<string, any>) : { error: r.status };
}

/** Full "owner/repo": the REPO value of the Input sheet, or (name only) the owner shown in the page. */
async function fullRepo(page: Page, repo: string): Promise<string> {
  if (repo.includes('/')) return repo;
  const m = (await bodyText(page)).match(new RegExp(`([A-Za-z0-9_.-]+)\\/${repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`));
  return m ? `${m[1]}/${repo}` : repo;
}

const analyseButton = (page: Page) => locatorOf(page, 'latestcommit.button.analy-sz-e-latest-commit').last();

export const latestCommitSteps: Record<string, CaseHandler<RepoPage>> = {
  'COM-001': async (ctx) => {
    const { page, input, check, note, snap } = ctx;
    const { repo, branch } = inputs(ctx, { repo: true, branches: 1 });
    if (!/^y/i.test(input.get('ALLOW_DUMMY_COMMIT').trim())) {
      const reason = 'ALLOW_DUMMY_COMMIT is not Y on the Input sheet - this module pushes a commit to the repository and then starts a real run (uses an execution), so nothing was done.';
      ctx.skip(reason);
    }
    if (!/\/confidence-engine/.test(page.url()) || !runIdOf(page)) ctx.skip('The Confidence Engine page of the finished run is not open, so there is no "already analyzed" state to start from.');
    Object.assign(st, { oldRun: runIdOf(page), newSha: '', newRun: '', badCalls: [], finished: false, longestStallMin: 0, waitedNote: '' });
    st.oldSha = ((await bodyText(page)).match(/already analyzed\s*\(([0-9a-f]{7,40})\)/i)?.[1]) ?? '';
    st.meterBefore = await meter(page);
    if (!st.wired) {
      page.on('response', (r) => {
        if (/\/(runtime-api|views-api)\/v1\/runs\//.test(r.url()) && r.status() >= 400) st.badCalls.push(`${r.status()} ${new URL(r.url()).pathname}`);
      });
      st.wired = true;
    }
    await snap('Confidence Engine page of the analyzed commit, before the new commit is pushed', locatorOf(page, 'latestcommit.text.already-analy-sz-ed').last());
    note(`Before: the chat says the commit "${st.oldSha || '(not shown)'}" is already analyzed; run ${st.oldRun}; executions used ${Number.isNaN(st.meterBefore) ? '?' : st.meterBefore}.`);
    const full = await fullRepo(page, repo);
    let made: Awaited<ReturnType<typeof pushDummyCommit>>;
    try {
      made = await pushDummyCommit({ repo: full, branch, baseDir: RUN_DIR });
    } catch (e) {
      throw new BlockingFailure('newcommit', `The dummy commit could not be pushed to ${full} (${branch}). ${(e as Error).message}`);
    }
    st.newSha = made.sha;
    note(`Cloned ${full} (branch ${branch}) into the run folder, added "${made.line}" to ${made.readme}, committed and pushed. New commit: ${made.sha.slice(0, 7)}.`);
    await check('The new commit id is a full 40-character commit id', () => expect(made.sha).toMatch(/^[0-9a-f]{40}$/i));
    await check('GitHub now reports the new commit as the tip of the branch', () => expect(made.remoteHead.toLowerCase()).toBe(made.sha.toLowerCase()));
    await check('The new commit is not the commit the platform had already analyzed', () => expect(made.sha.toLowerCase().startsWith(st.oldSha.toLowerCase()) && st.oldSha !== '').toBe(false));
  },

  'COM-002': async (ctx) => {
    ctx.requires('newcommit');
    const { page, check, note, snap } = ctx;
    if (!st.newSha) ctx.skip('No dummy commit was made in this run.');
    const short = st.newSha.slice(0, 7);
    // The page may need a moment (or a refresh) to notice a new commit: wait up to 4 minutes, nudge it at 1 and 2 minutes.
    let seen = false;
    const t0 = Date.now();
    let nudged = 0;
    while (Date.now() - t0 < 240_000) {
      if ((await bodyText(page)).toLowerCase().includes(short.toLowerCase())) { seen = true; break; }
      const sec = (Date.now() - t0) / 1000;
      if (sec > 60 && nudged === 0) { nudged = 1; await refreshBtn(page).click().catch(() => undefined); }
      if (sec > 120 && nudged === 1) { nudged = 2; await page.reload().catch(() => undefined); }
      await page.waitForTimeout(5_000);
    }
    const card = ((await locatorOf(locatorOf(page, 'latestcommit.text.already-analyzed-newer-tip-new-commi').last(), 'latestcommit.css.xpath-ancestor-button-normalize-spac').innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    note(`The "Analyze latest commit" card now says: ${card.slice(0, 200) || '(card not found)'}`);
    await check(`The page shows the new commit id (${short}) after the push (waited ${Math.round((Date.now() - t0) / 1000)} s)`, () =>
      expect(seen, `${short} did not appear on the page within 4 minutes (refreshed once and reloaded once)`).toBe(true));
    await check('"Analyze latest commit" is offered and enabled', async () => {
      await expect(analyseButton(page)).toBeVisible();
      await expect(analyseButton(page)).toBeEnabled();
    });
    await snap('"Analyze latest commit" offered for the new commit', analyseButton(page));
  },

  'COM-003': async (ctx) => {
    ctx.requires('newcommit');
    const { page, check, note, snap } = ctx;
    const { branch } = inputs(ctx, { branches: 1 });
    if (!st.newSha) ctx.skip('No dummy commit was made in this run.');
    const short = st.newSha.slice(0, 7);
    await ctx.step('"Analyze latest commit" is shown and enabled', async () => {
      await expect(analyseButton(page)).toBeVisible({ timeout: 20_000 });
      await expect(analyseButton(page)).toBeEnabled();
    });
    await analyseButton(page).click();
    note('"Analyze latest commit" was clicked. This starts a real run.');
    const underway = locatorOf(page, 'latestcommit.text.white-box-analysis-is-underway').last();
    const failed = locatorOf(page, 'latestcommit.text.couldn-t-start-the-run').last();
    const which = await Promise.race([
      underway.waitFor({ state: 'visible', timeout: 120_000 }).then(() => 'underway' as const),
      failed.waitFor({ state: 'visible', timeout: 120_000 }).then(() => 'failed' as const),
      page.waitForURL((u) => (u.searchParams.get('runId') ?? st.oldRun) !== st.oldRun, { timeout: 120_000 }).then(() => 'newrun' as const),
    ]).catch(() => '' as const);
    if (which === 'failed') throw new BlockingFailure('newrun', `The platform said: ${((await failed.innerText().catch(() => '')) || "Couldn't start the run").replace(/\s+/g, ' ').slice(0, 200)}`);
    if (!which) throw new BlockingFailure('newrun', 'Nothing happened within 2 minutes of clicking "Analyze latest commit": no "White Box Analysis is underway" message and no new run.');
    // The new run's page: follow "Open Confidence Engine" when the platform stays in the chat.
    if (runIdOf(page) === st.oldRun) {
      const open = locatorOf(page, 'latestcommit.button.open-confidence-engine').last();
      await open.click({ timeout: 30_000 }).catch(() => undefined);
      await page.waitForURL((u) => (u.searchParams.get('runId') ?? st.oldRun) !== st.oldRun, { timeout: 60_000 }).catch(() => undefined);
    }
    st.newRun = runIdOf(page);
    note(`New run id: ${st.newRun || '(none)'}`);
    await check('A new run was started (its run id is different from the previous run)', () => expect(st.newRun !== '' && st.newRun !== st.oldRun).toBe(true));
    if (!st.newRun || st.newRun === st.oldRun) throw new BlockingFailure('newrun', 'The Confidence Engine page still shows the previous run, so the new run cannot be followed.');
    await check(`The address names the branch "${branch}"`, () => expect((new URL(page.url()).searchParams.get('branch') ?? '').toLowerCase()).toBe(branch.toLowerCase()));
    await check(`The "Branch run" selector shows the new commit (${short}) and the start of the new run id`, async () => {
      const sel = locatorOf(page, 'latestcommit.combobox.branch-run').first();
      await expect(sel).toContainText(new RegExp(short, 'i'), { timeout: 30_000 });
      await expect(sel).toContainText(new RegExp(st.newRun.slice(0, 8), 'i'));
    });
    await check('The page header shows that the run is executing ("Executing…")', () => expect(locatorOf(page, 'latestcommit.text.executing-running-in-progress-underw').first()).toBeVisible({ timeout: 45_000 }));
    await check('"Cancel execution" is offered (it is not clicked)', () => expect(locatorOf(page, 'latestcommit.button.cancel').first()).toBeVisible({ timeout: 45_000 }));
    await snap('New run page while it is executing', [locatorOf(page, 'latestcommit.combobox.branch-run').first(), locatorOf(page, 'latestcommit.button.cancel').first()]);
  },

  'COM-004': async (ctx) => {
    ctx.requires('newcommit');
    ctx.requires('newrun');
    const { page, check, note, snap } = ctx;
    if (!st.newRun) ctx.skip('No new run was started in this run.');
    const toggle = locatorOf(page, 'latestcommit.button.execution-status').first();
    await ctx.step('"Execution Status" is shown for the new run', () => expect(toggle).toBeVisible({ timeout: 30_000 }));
    if (!(await labelText(page, 'Queued').first().isVisible().catch(() => false))) await toggle.click().catch(() => undefined);
    const readTimer = async (): Promise<number> => {
      const m = ((await toggle.innerText().catch(() => '')) || '').match(/(?:(\d+)m\s*)?(\d+)s/);
      return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : NaN;
    };
    const t1 = await readTimer();
    const running = !/Run complete/i.test(await bodyText(page));
    // polled instead of a fixed 15 s sleep: the timer is read again until it has moved (or 45 s have passed)
    if (running) await check('The elapsed timer is moving while the run is going', () => expect.poll(readTimer, { timeout: 45_000, message: `timer first read ${t1}s` }).toBeGreaterThan(t1));
    else note('The run had already finished, so the moving timer could not be observed.');
    await check('A task counter (N/total) is shown', () => expect(toggle).toContainText(expectedOf('latestcommit.text.by-pattern')));
    await snap('Execution Status of the new run with the stage list', [toggle, labelText(page, STAGES[0]).first()]);
    for (const stage of STAGES) await check(`Stage "${stage}" is listed`, () => expect(labelText(page, stage).first()).toBeVisible());
    await check('The stages are listed in the right order', async () => {
      // each stage is searched after the previous one, starting at the "Execution Status" line, so the same words in the chat do not count
      const text = (await bodyText(page)).toLowerCase();
      let from = Math.max(0, text.indexOf('execution status'));
      const missing: string[] = [];
      for (const stage of STAGES) {
        const i = text.indexOf(stage.toLowerCase(), from);
        if (i < 0) missing.push(stage); else from = i + 1;
      }
      expect(missing, 'stages missing or listed out of order').toEqual([]);
    });
    note(`Status line: ${((await toggle.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim()}`);
  },

  'COM-005': async (ctx) => {
    ctx.requires('newcommit');
    ctx.requires('newrun');
    const { page, input, check, note, snap } = ctx;
    if (!st.newRun) ctx.skip('No new run was started in this run.');
    const wait = Number(input.get('LATEST_COMMIT_WAIT_MIN') || 25);
    const started = Date.now();
    let lastDone = -1, lastChange = Date.now(), longest = 0;
    let last: Record<string, any> = {};
    while (Date.now() - started < wait * 60_000) {
      last = await summary(page, st.newRun).catch(() => ({}));
      const done = num(last.completed_tasks) + num(last.failed_tasks) + num(last.skipped_tasks);
      // the stall clock only runs while the analysis tasks are being worked on (not while queued / planning, and not once all are done)
      if (done !== lastDone || !(num(last.total_tasks) > 0) || done >= num(last.total_tasks)) { lastDone = done; lastChange = Date.now(); }
      longest = Math.max(longest, (Date.now() - lastChange) / 60_000);
      if (last.phase === 'completed' || String(last.status) === 'cancelled') { st.finished = true; break; } // phase "completed" is the goal; status passed / failed is the branch verdict
      await page.waitForTimeout(10_000);
    }
    st.longestStallMin = Math.round(longest * 10) / 10;
    const minutes = Math.round((Date.now() - started) / 6000) / 10;
    st.waitedNote = `${minutes} min of waiting; run duration ${String(last.duration_seconds ?? '?')} s`;
    note(`Waited ${minutes} min on the Confidence Engine page. Last API state: status=${String(last.status)}, phase=${String(last.phase)}, finished tasks=${lastDone}/${String(last.total_tasks)}.`);
    await check(`The new run finishes within ${wait} minutes`, () => expect(st.finished, `still "${String(last.status)}" / "${String(last.phase)}" after ${wait} min`).toBe(true));
    await check('Progress never stood still for more than 5 minutes', () =>
      expect(st.longestStallMin, `the number of finished tasks did not change for ${st.longestStallMin} min`).toBeLessThanOrEqual(5));
    if (!st.finished) throw new BlockingFailure('newrunfinished', `The new run did not finish within ${wait} min - the result checks cannot be made.`);
    await refreshBtn(page).click().catch(() => undefined);
    await check('The chat says "Run complete"', () => expect(locatorOf(page, 'latestcommit.text.run-complete').last()).toBeVisible({ timeout: 60_000 }));
    await check('The page shows a final score (not "—") within 3 minutes', async () => {
      await expect.poll(() => shownScore(page), { timeout: 180_000 }).toMatch(/^\d+$/);
    });
    await snap('Finished run with its final score', labelText(page, 'Confidence Score').first());
  },

  'COM-006': async (ctx) => {
    ctx.requires('newcommit');
    ctx.requires('newrun');
    ctx.requires('newrunfinished');
    const { page, check, note, snap } = ctx;
    const { branch } = inputs(ctx, { branches: 1 });
    if (!st.newRun) ctx.skip('No new run was started in this run.');
    const short = st.newSha.slice(0, 7);
    const s = await summary(page, st.newRun);
    note(`New run: status=${String(s.status)}, phase=${String(s.phase)}, tasks done/failed/skipped/total=${String(s.completed_tasks)}/${String(s.failed_tasks)}/${String(s.skipped_tasks)}/${String(s.total_tasks)}, score=${String(s.overall_score)}; ${st.waitedNote}`);
    await check('The run summary can be read', () => expect(s.error).toBeUndefined());
    await check('It is the new run (not the previous one)', () => { expect(s.run_id).toBe(st.newRun); expect(st.newRun).not.toBe(st.oldRun); });
    await check(`It is for the branch "${branch}"`, () => expect(String(s.branch_name).toLowerCase()).toBe(branch.toLowerCase()));
    await check(`It analysed the dummy commit (${short})`, () => expect(String(s.commit_sha ?? '')).toMatch(new RegExp(`^${short}`, 'i')));
    await check('completed + failed + skipped tasks = total tasks', () => expect(num(s.completed_tasks) + num(s.failed_tasks) + num(s.skipped_tasks)).toBe(num(s.total_tasks)));
    await check('The run phase is "completed"', () => expect(s.phase).toBe('completed'));
    await snap('Confidence Score of the new run', labelText(page, 'Confidence Score').first());
    await check('The Confidence Score on the page equals the score in the run summary (rounded)', async () => {
      const shown = num(await shownScore(page));
      expect(shown, `API score ${String(s.overall_score)}`).toBe(Math.round(num(s.overall_score)));
    });
    await check('The page header and selector show the new commit', () =>
      expect(locatorOf(page, 'latestcommit.combobox.branch-run').first()).toContainText(new RegExp(short, 'i')));
    await check('The chat now says the new commit is already analyzed', async () => {
      await expect.poll(async () => (await bodyText(page)).match(/already analyzed\s*\(([0-9a-f]{7,40})\)/i)?.[1] ?? '', { timeout: 60_000 }).toMatch(new RegExp(`^${short}`, 'i'));
    });
    await check('One more execution was used (the executions meter went up by 1)', async () => {
      // the meter may be refreshed a little after the run ends: read it again for up to a minute (Refresh is clicked once)
      let after = await meter(page);
      if (after !== st.meterBefore + 1) { await locatorOf(page, 'latestcommit.button.refresh-2').first().click({ timeout: 5_000 }).catch(() => undefined); }
      const end = Date.now() + 60_000;
      while (after !== st.meterBefore + 1 && Date.now() < end) { await page.waitForTimeout(3_000); after = await meter(page); }
      expect(after, `meter before ${st.meterBefore}, after ${after}`).toBe(st.meterBefore + 1);
    });
    await check('No run API call returned an error (4xx / 5xx)', () => expect(st.badCalls, st.badCalls.join(', ')).toEqual([]));
    note(`Run result (status): ${String(s.status)} - this is the branch's pass / fail verdict, not a problem with the run itself.`);
  },

  'COM-007': async (ctx) => {
    ctx.requires('newcommit');
    ctx.requires('newrun');
    ctx.requires('newrunfinished');
    const { page, check, note, snap } = ctx;
    const repo = ctx.input.get('REPO').trim(); // only needed to find the project card in the reader, no check depends on it
    const repoName = repo.split('/').pop() ?? repo;
    if (!st.newRun) ctx.skip('No new run was started in this run.');
    const id8 = st.newRun.slice(0, 8);
    const old8 = st.oldRun.slice(0, 8);
    const short = st.newSha.slice(0, 7);
    const home = page.url();
    const s = await summary(page, st.newRun);
    const expected = Math.round(num(s.overall_score));
    note(`New run ${id8} (commit ${short}) has score ${String(s.overall_score)} in the run summary; the old run was ${old8}.`);
    // the header of Object / Graph may not print the run id: then the run id in the address is used
    const urlRun = (): string => runIdOf(page).slice(0, 8);
    const noOld = (shown: string | undefined, where: string) => expect((shown ?? '').toLowerCase(), `${where} still shows the previous run (${old8}) in its header`).not.toBe(old8.toLowerCase());
    const open = async (what: string, click: () => Promise<void>, url: RegExp): Promise<boolean> => {
      try { await click(); await page.waitForURL(url, { timeout: 30_000 }); return true; } catch { note(`${what} could not be opened.`); return false; }
    };

    const eng = await until(() => readEngine(page), (v) => v.score !== undefined);
    await snap('Confidence Engine score card of the new run (the numbers compared with the other pages)', labelText(page, 'Confidence Score').first());
    await check(`Confidence Engine: the run in the page header is the new run (${id8}), not the previous one`, () => { same((eng.breadcrumbRun ?? urlRun()).toLowerCase(), id8.toLowerCase(), 'run id of the page'); noOld(eng.breadcrumbRun ?? urlRun(), 'Confidence Engine'); });
    await check(`Confidence Engine: the score is the new score (${expected})`, () => same(eng.score, expected, 'Confidence Score'));

    let obj: Awaited<ReturnType<typeof readObject>> = {};
    if (await open('Confidence Object', () => locatorOf(page, 'latestcommit.css.a-href-confidence-engine-href-pillar').first().click(), /pillar=object/)) {
      obj = await until(() => readObject(page, repoName), (v) => v.org !== undefined);
    }
    await check(`Confidence Object: the page is for the new run (${id8}), not the previous one`, () => { same((obj.breadcrumbRun ?? urlRun()).toLowerCase(), id8.toLowerCase(), 'run id of the page'); noOld(obj.breadcrumbRun ?? urlRun(), 'Confidence Object'); });
    await check(`Confidence Object: the ORG score is the new score (${expected})`, () => same(obj.org, expected, 'ORG score'));

    let gr = { labels: [] as string[] } as Awaited<ReturnType<typeof readGraph>>;
    if (await open('Confidence Graph', () => locatorOf(page, 'latestcommit.css.a-href-confidence-engine-href-pillar-2').first().click(), /pillar=graph/)) {
      gr = await until(() => readGraph(page, id8), (v) => v.org !== undefined && v.historyScore !== undefined);
    }
    await check(`Confidence Graph: the page is for the new run (${id8}), not the previous one`, () => { same((gr.breadcrumbRun ?? urlRun()).toLowerCase(), id8.toLowerCase(), 'run id of the page'); noOld(gr.breadcrumbRun ?? urlRun(), 'Confidence Graph'); });
    await check(`Confidence Graph: the Org score is the new score (${expected})`, () => same(gr.org, expected, 'Org score'));
    await check(`Confidence Graph: the trend ends with the new commit (#${short})`, () => expect((gr.labels[gr.labels.length - 1] ?? '').toLowerCase(), `trend labels: ${gr.labels.join(', ')}`).toBe(short.toLowerCase()));
    await check(`Confidence Graph: the Pipeline Run History lists the new run with the new score (${expected})`, () => same(gr.historyScore, expected, 'history score of the new run'));

    let row: Awaited<ReturnType<typeof readDashboardRow>>;
    let first = '';
    if (await open('Dashboard', () => locatorOf(page, 'latestcommit.css.a-href-dashboard').first().click(), /\/dashboard/)) {
      await locatorOf(page, 'latestcommit.css.tbody-tr').first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => undefined);
      row = await until(() => readDashboardRow(page, id8), (v) => v !== undefined, 20_000);
      first = ((await locatorOf(locatorOf(page, 'latestcommit.css.tbody-tr').first(), 'latestcommit.css.td').first().innerText().catch(() => '')) || '').trim();
    }
    await check(`Runs Dashboard: the new run (${id8}) is listed`, () => expect(row, 'the new run is not in the table').toBeDefined());
    await check('Runs Dashboard: the new run is the first (newest) row', () => expect(first.toLowerCase(), `first row: ${first}`).toContain(id8.toLowerCase()));
    await check(`Runs Dashboard: the new run's commit is ${short} and its score is ${expected}`, () => {
      expect((row?.commit ?? '').toLowerCase().startsWith(short.toLowerCase()), `commit shown: ${row?.commit ?? '(none)'}`).toBe(true);
      same(row === undefined ? undefined : Math.round(row.score), expected, 'Dashboard score');
    });
    await check(`Runs Dashboard: the previous run (${old8}) is still listed`, async () => expect(await readDashboardRow(page, old8), 'the previous run disappeared').toBeDefined());

    await ctx.step('Go back to the Confidence Engine page of the new run', async () => {
      const link = locatorOf(page, 'latestcommit.css.by-a-href-runid-st', st.newRun).first();
      if (await link.count()) await link.click(); else await page.goto(home);
      await expect(pageTitle(page)).toBeVisible({ timeout: 30_000 });
    });
  },
};
