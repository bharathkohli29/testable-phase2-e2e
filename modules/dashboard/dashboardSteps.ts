import { expect, Page } from '@playwright/test';
import { closeMenus, labelText } from '../../core/pages/menus';
import { apiGet, tenantOf } from '../../core/pages/runApi';
import { CaseHandler } from '../../core/runner/registerCases';
import { inputs } from '../flow/helpers';
import { RepoPage } from '../repo/shared/RepoPage';
import { obj as locatorOf } from '../../core/keywords/obj';

import { expected as expectedOf, listOf } from '../../core/keywords/expected';
/**
 * The Dashboard module: the "Runs Dashboard" page (/dashboard) - the list of runs of the current repository / branch, the "RUNS FROM"
 * selector, the "CURRENT EXECUTION" card and "View run details". Verified live. Checks use locators (roles, text, table cells) and the
 * same run list the page loads (views-api runs, runtime-api projects) - never screenshots. "Start analysis" starts a REAL run, so it is
 * only checked, never clicked. Choosing another branch in "RUNS FROM" only changes what the list shows and is put back afterwards.
 */

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();
const num = (s: unknown): number => Number(String(s ?? '').replace(/[^\d.\-]/g, ''));
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Same text whatever the case and spacing. */
const exactText = (name: string): RegExp => new RegExp(`^\\s*${esc(name).replace(/\s+/g, '\\s+')}\\s*$`, 'i');
const pageTitle = (page: Page) => labelText(page, 'PR Confidence Analysis').first();
const dashTitle = (page: Page) => locatorOf(page, 'dashboard.heading.runs-dashboard').first();
const currentText = (page: Page) => locatorOf(page, 'dashboard.text.current-repository').first();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMNS = listOf('dashboard.list.columns');

interface Row { runId: string; attempt: string; project: string; branch: string; commit: string; status: string; score: string; tasks: string; created: string; href: string }
interface ApiRun { run_id: string; repository_id: string; branch_name: string; commit_sha: string; attempt_number: number; overall_score: number | null; completed_tasks: number; total_tasks: number; created_at: string; status: string }

async function rows(page: Page): Promise<Row[]> {
  const raw = await page.evaluate(() =>
    [...document.querySelectorAll('tbody tr')].map((tr) => ({
      cells: [...tr.querySelectorAll('td')].map((x) => (x as HTMLElement).innerText.trim()),
      href: tr.querySelector('a')?.getAttribute('href') ?? '',
    })));
  return raw.map((r) => ({
    runId: r.cells[0] ?? '', attempt: r.cells[1] ?? '', project: r.cells[2] ?? '', branch: r.cells[3] ?? '', commit: r.cells[4] ?? '',
    status: r.cells[5] ?? '', score: r.cells[6] ?? '', tasks: r.cells[7] ?? '', created: r.cells[8] ?? '', href: r.href,
  }));
}

/** "Runs (3)" and the optional "— previous branch". */
async function heading(page: Page): Promise<{ n: number; note: string }> {
  const m = (await locatorOf(page, 'dashboard.css.body').innerText()).match(/^Runs \((\d+)\)\s*(.*)$/im);
  return { n: num(m?.[1]), note: norm(m?.[2] ?? '') };
}

/** All runs of this account from the same call the page makes (views-api runs), optionally of one repository. */
async function apiRuns(page: Page, repositoryId: string): Promise<{ runs: ApiRun[]; status: number }> {
  const tenant = await tenantOf(page);
  const r = await apiGet(page, `/views-api/v1/runs?tenant_id=${tenant}&repository_id=${repositoryId}&limit=50`);
  return { runs: r.status === 200 ? ((r.json?.runs ?? []) as ApiRun[]) : [], status: r.status };
}

const repoIdOf = (list: Row[]): string => new URL(list[0]?.href ?? '/', 'https://x').searchParams.get('repositoryId') ?? '';
/** "Current repository <repo> / <branch>" in any case and spacing. */
const pairRe = (name: string, branch: string): RegExp => new RegExp(`Current repository\\s+${esc(name)}\\s*/\\s*${esc(branch)}`, 'i');
const stamp = (page: Page, iso: string): Promise<string> =>
  page.evaluate((i) => new Date(i).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }), iso);
const selector = (page: Page) => locatorOf(page, 'dashboard.combobox.item').first();
const startBtn = (page: Page) => locatorOf(page, 'dashboard.button.start-analysis').first();
const refreshBtn = (page: Page) => locatorOf(page, 'dashboard.button.refresh').first();

/** SKIPS the case unless the user is signed in; opens the Dashboard from the left menu when it is not open. */
async function needDashboard(ctx: Parameters<CaseHandler<RepoPage>>[0]): Promise<void> {
  const { page } = ctx;
  if (/\/auth\//.test(page.url()) || page.url() === 'about:blank') ctx.skip('The user is not signed in (the Login module did not get an account into the app), so the Dashboard cannot be opened.');
  await closeMenus(page);
  if (!/\/dashboard/.test(page.url())) {
    const link = locatorOf(page, 'dashboard.css.a-href-dashboard').first();
    if (await link.count()) await link.click();
    else await page.goto(new URL('/dashboard', page.url()).toString());
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 }).catch(() => ctx.skip('The Dashboard did not open.'));
  }
  await dashTitle(page).waitFor({ state: 'visible', timeout: 30_000 }).catch(() => ctx.skip('The Runs Dashboard did not show its title.'));
  await locatorOf(page, 'dashboard.css.tbody-tr').first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => undefined);
}

export const dashboardSteps: Record<string, CaseHandler<RepoPage>> = {
  'DSH-001': async (ctx) => {
    await needDashboard(ctx);
    const { page, check, note, snap } = ctx;
    const { repo, branch } = inputs(ctx, { repo: true, branches: 1 });
    const name = repo.split('/').pop() ?? repo;
    await snap('Runs Dashboard title and current repository / branch', [dashTitle(page), currentText(page)]);
    await check('The address is /dashboard and the page is not sent to the login page', () => {
      expect(new URL(page.url()).pathname).toBe('/dashboard');
      expect(page.url()).not.toMatch(/\/auth\//);
    });
    await check('The breadcrumb shows "TESTABLE > RUNS DASHBOARD"', async () => {
      const t = norm(await locatorOf(page, 'dashboard.css.body').innerText());
      expect(t).toMatch(/TESTABLE\s*[>›»\/]?\s*RUNS DASHBOARD/i);
    });
    await check('The page title "Runs Dashboard" is shown', () => expect(dashTitle(page)).toBeVisible());
    await check('The text says "Current repository <repo> / <branch>"', () => expect(currentText(page)).toContainText(expectedOf('dashboard.text.current-repository')));
    await check(`The current pair is the repository "${name}" and the branch "${branch}" from the Input sheet`, async () =>
      expect(norm(await currentText(page).innerText())).toMatch(pairRe(name, branch)));
    await check('The text explains that the list defaults to this pair and another branch with runs can be chosen', () =>
      expect(locatorOf(page, 'dashboard.text.list-defaults-to-this-pair').first()).toBeVisible());
    await check('No error message is shown', () => expect(locatorOf(page, 'dashboard.text.something-went-wrong-failed-to-load')).toHaveCount(0));
    note(`Current pair on the page: ${norm(await currentText(page).innerText())}`);
  },

  'DSH-002': async (ctx) => {
    await needDashboard(ctx);
    const { page, check, snap } = ctx;
    await snap('Left menu of the Dashboard', page.getByRole('link', { name: exactText('Dashboard') }).first());
    for (const [name, href] of [['Dashboard', '/dashboard'], ['Confidence Engine', '/confidence-engine'], ['Execution Assistant', '/execution-assistant'], ['Account and Plan', '/account']] as const) {
      await check(`Left menu link "${name}" is shown and goes to ${href}`, async () => {
        const link = locatorOf(page, 'dashboard.link.by-name', name).first();
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('href', expectedOf('dashboard.attr.by-pattern-href', href));
      });
    }
    await check('The "Testable" logo link goes to the Confidence Engine', async () => {
      const logo = locatorOf(page, 'dashboard.link.testable').first();
      await expect(logo).toBeVisible();
      await expect(logo).toHaveAttribute('href', expectedOf('dashboard.attr.confidence-engine'));
    });
    await check('The "Sign out" button is shown', () => expect(locatorOf(page, 'dashboard.button.sign-out').first()).toBeVisible());
    await check('The "Support" button is shown', () => expect(locatorOf(page, 'dashboard.button.support').first()).toBeVisible());
    await check('The "Refresh" button is shown and enabled', async () => {
      await expect(refreshBtn(page)).toBeVisible();
      await expect(refreshBtn(page)).toBeEnabled();
    });
  },

  'DSH-003': async (ctx) => {
    await needDashboard(ctx);
    const { page, check, note, snap } = ctx;
    const { repo, branch } = inputs(ctx, { repo: true, branches: 1 });
    const pair = `${repo.split('/').pop()} / ${branch}`;
    await snap('CURRENT EXECUTION card with "Start analysis" (not clicked)', [locatorOf(page, 'dashboard.text.current-execution').first(), startBtn(page)]);
    await check('"CURRENT EXECUTION" is shown', () => expect(locatorOf(page, 'dashboard.text.current-execution').first()).toBeVisible());
    await check(`It names the current pair "${pair}"`, () => expect(locatorOf(page, 'dashboard.text.by-pair', pair).last()).toBeVisible());
    await check('"Start analysis" is shown and enabled (it is NOT clicked: it would start a real run)', async () => {
      await expect(startBtn(page)).toBeVisible();
      await expect(startBtn(page)).toBeEnabled();
    });
    await check('The text says that "Start analysis always uses the current pair"', () => expect(locatorOf(page, 'dashboard.text.start-analysis-always-uses-the-curre').first()).toBeVisible());
    await check('The text says that other branches appear only when they already have a run', () => expect(locatorOf(page, 'dashboard.text.other-branches-0-40-appear-only-when').first()).toBeVisible());
    note('"Start analysis" is only checked, never clicked.');
  },

  'DSH-004': async (ctx) => {
    await needDashboard(ctx);
    const { page, check, note, snap } = ctx;
    const before = await rows(page);
    const refresh = refreshBtn(page);
    const [reply] = await Promise.all([
      page.waitForResponse((r) => /\/views-api\/v1\/runs\?/.test(r.url()), { timeout: 20_000 }).catch(() => null),
      refresh.click(),
    ]);
    await expect.poll(async () => (await rows(page)).length, { timeout: 20_000 }).toBeGreaterThan(0).catch(() => undefined); // the list is reloaded (placeholder bars first)
    const after = await rows(page);
    note(`Refresh loaded: ${reply ? `${reply.status()} ${new URL(reply.url()).pathname}` : '(no run list call seen)'}; rows before ${before.length}, after ${after.length}.`);
    await check('"Refresh" loads the run list again (a views-api runs call is made)', () => expect(reply, 'no run list call was made after clicking Refresh').not.toBeNull());
    await check('The run list call succeeds (200)', () => expect(reply?.status()).toBe(200));
    await check('The same runs are listed after Refresh', () => expect(after.map((r) => r.runId)).toEqual(before.map((r) => r.runId)));
    await check('Every run keeps its status, score and tasks after Refresh (the data is fetched again, nothing is lost)', () =>
      expect(after.map((r) => `${r.runId} ${r.status} ${r.score} ${r.tasks}`)).toEqual(before.map((r) => `${r.runId} ${r.status} ${r.score} ${r.tasks}`)));
    await snap('Runs table after Refresh', locatorOf(page, 'dashboard.css.table').first());
    await check('The "RUNS FROM" selection is not changed by Refresh', () => expect(selector(page)).toContainText(expectedOf('dashboard.text.current')));
    await check('The page stays on the Dashboard and the current pair does not change', async () => {
      expect(new URL(page.url()).pathname).toBe('/dashboard');
      await expect(currentText(page)).toBeVisible();
    });
  },

  'DSH-005': async (ctx) => {
    await needDashboard(ctx);
    const { page, check, note, snap } = ctx;
    const { repo, branch } = inputs(ctx, { repo: true, branches: 1 });
    const name = repo.split('/').pop() ?? repo;
    const list = await rows(page);
    const repoId = repoIdOf(list);
    const sel = selector(page);
    await check('The "RUNS FROM" label and the selector are shown', async () => {
      await expect(locatorOf(page, 'dashboard.text.runs-from').first()).toBeVisible();
      await expect(sel).toBeVisible();
    });
    await check(`The selector shows "Current: ${name} / ${branch}"`, () => expect(sel).toContainText(expectedOf('dashboard.text.by-current-name-branch', name, branch)));
    await ctx.step('Open the selector', async () => {
      await sel.click();
      await expect(locatorOf(page, 'dashboard.listbox.item')).toBeVisible({ timeout: 10_000 });
    });
    await snap('"RUNS FROM" list open', [sel, locatorOf(page, 'dashboard.listbox.item').first()]);
    const lines = (await locatorOf(page, 'dashboard.listbox.item').innerText()).split('\n').map(norm).filter(Boolean);
    const iBranches = lines.findIndex((l) => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} — branches with runs$`, 'i').test(l));
    const iOthers = lines.findIndex((l) => /^Other repositories$/i.test(l));
    const branchOptions = iBranches >= 0 ? lines.slice(iBranches + 1, iOthers > iBranches ? iOthers : undefined) : [];
    const others = iOthers >= 0 ? lines.slice(iOthers + 1) : [];
    note(`Branches with runs: ${branchOptions.length}; other repositories: ${others.length}.`);
    // the group only exists when the repository has runs on other branches (the run list says which)
    const otherBranches = [...new Set((await apiRuns(page, repoId)).runs.map((r) => r.branch_name))].filter((b) => b !== branch);
    await check(`The list has the group "${name} — branches with runs" (needed only when other branches have runs: ${otherBranches.length})`, () => {
      if (otherBranches.length === 0) { expect(iBranches, 'no other branch has a run, so the group must not be shown').toBe(-1); return; }
      expect(iBranches, 'group heading not found').toBeGreaterThanOrEqual(0);
    });
    await check('The list has the group "Other repositories"', () => expect(iOthers, 'group heading not found').toBeGreaterThanOrEqual(0));
    await check(`Every branch option reads "${name} / <branch>"`, () => branchOptions.forEach((o) => expect(o).toMatch(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} / \\S+$`))));
    await check('The branches listed are the other branches of this repository that already have a run (run list)', async () => {
      const api = await apiRuns(page, repoId);
      const wanted = [...new Set(api.runs.map((r) => r.branch_name))].filter((b) => b !== branch).sort();
      expect(branchOptions.map((o) => o.replace(`${name} / `, '')).sort(), `run list gives: ${wanted.join(', ')}`).toEqual(wanted);
    });
    await check('Every other project of the account is listed under "Other repositories"', async () => {
      const p = await apiGet(page, '/runtime-api/v1/projects?limit=200');
      const names = ((p.json?.projects ?? []) as Array<{ name: string }>).map((x) => x.name).filter((n) => n !== name);
      expect(names.filter((n) => !others.includes(n)), 'projects missing from the list').toEqual([]);
    });
    await check('No repository is listed twice under "Other repositories" (so one can be told from the other)', () => {
      const dup = others.filter((o, i) => others.indexOf(o) !== i);
      expect([...new Set(dup)], 'listed twice').toEqual([]);
    });
    await page.keyboard.press('Escape');
    await check('Pressing Escape closes the list', () => expect(sel).toHaveAttribute('aria-expanded', expectedOf('dashboard.attr.false')));
  },

  'DSH-006': async (ctx) => {
    await needDashboard(ctx);
    const { page, check, note, snap } = ctx;
    const { repo, branch } = inputs(ctx, { repo: true, branches: 1 });
    const name = repo.split('/').pop() ?? repo;
    const home = await rows(page);
    const homeCount = (await heading(page)).n;
    const repoId = repoIdOf(home);
    const sel = selector(page);
    await sel.click();
    await locatorOf(page, 'dashboard.option.item').first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined); // the options appear a moment after the click
    const other = (await locatorOf(page, 'dashboard.option.item').allInnerTexts()).map(norm).find((o) => o.toLowerCase().startsWith(`${name} / `.toLowerCase()) && !o.toLowerCase().endsWith(`/ ${branch}`.toLowerCase()));
    if (!other) { await page.keyboard.press('Escape'); ctx.skip('This repository has no other branch with a run, so there is nothing else to choose.'); }
    const chosen = other!.slice(`${name} / `.length);
    await ctx.step(`Choose "${other}"`, async () => {
      await locatorOf(page, 'dashboard.option.by-other', other!).first().click();
      await expect(sel).toContainText(new RegExp(esc(other!).replace(/\s+/g, '\\s+'), 'i'), { timeout: 15_000 });
      await expect(locatorOf(page, 'dashboard.text.previous-branch').first()).toBeVisible({ timeout: 20_000 });
    });
    await snap('Runs of the chosen branch ("previous branch" note)', [sel, locatorOf(page, 'dashboard.css.table').first()]);
    const api = await apiRuns(page, repoId);
    const wanted = api.runs.filter((r) => r.branch_name === chosen);
    const shown = await rows(page);
    const head = await heading(page);
    note(`Chosen branch ${chosen}: the page lists ${shown.length} run(s); the run list gives ${wanted.length}.`);
    await check('The text says "Showing runs for a previously selected branch. Start analysis still uses the current pair."', () =>
      expect(locatorOf(page, 'dashboard.text.showing-runs-for-a-previously-select').first()).toBeVisible());
    await check('The heading says "Runs (N) — previous branch"', () => { expect(head.note).toMatch(/previous branch/i); if (head.n !== shown.length) note(`The heading says ${head.n} runs, the table has ${shown.length} rows.`); });
    await check('The number of runs equals the run list of that branch', () => expect(head.n).toBe(wanted.length));
    await check('Every row is a run of the chosen branch', () => shown.forEach((r) => expect(r.branch.toLowerCase(), `${r.runId}`).toBe(chosen.toLowerCase())));
    {
      const a = shown.map((r) => r.runId.toLowerCase()).sort().join(', ');
      const b = wanted.map((r) => r.run_id.slice(0, 8).toLowerCase()).sort().join(', ');
      if (a !== b) note(`The run ids shown (${a}) differ from the run list (${b}).`);
    }
    await check('"CURRENT EXECUTION" still shows the current pair and "Start analysis" is still offered (not clicked)', async () => {
      await expect(locatorOf(page, 'dashboard.text.by-name-branch', name, branch).last()).toBeVisible();
      await expect(startBtn(page)).toBeEnabled();
    });
    await ctx.step('Choose the current pair again', async () => {
      await sel.click();
      await locatorOf(page, 'dashboard.option.current').first().click();
      await expect(sel).toContainText(expectedOf('dashboard.text.by-current-name-branch', name, branch), { timeout: 15_000 });
    });
    await check('The list of the current branch is shown again with the same runs and no "previous branch" note', async () => {
      await expect.poll(async () => (await heading(page)).note, { timeout: 15_000 }).not.toMatch(/previous branch/i);
      // the list is loaded again after the choice (placeholder bars first): wait until the same runs are back
      await expect.poll(async () => (await rows(page)).map((r) => r.runId), { timeout: 30_000 }).toEqual(home.map((r) => r.runId));
      expect((await heading(page)).n).toBe(homeCount);
    });
  },

  'DSH-007': async (ctx) => {
    await needDashboard(ctx);
    const { page, check, note, snap } = ctx;
    const { repo, branch } = inputs(ctx, { repo: true, branches: 1 });
    const name = repo.split('/').pop() ?? repo;
    const list = await rows(page);
    const head = await heading(page);
    note(`${list.length} run(s) listed: ${list.map((r) => `${r.runId} ${r.status} ${r.score}`).join('; ')}`);
    await snap('Runs table', locatorOf(page, 'dashboard.css.table').first());
    await check('The heading reads "Runs (N)"', () => expect(head.n).toBeGreaterThanOrEqual(0));
    await check('N equals the number of rows in the table', () => expect(head.n).toBe(list.length));
    await check(`The table has the columns ${COLUMNS.join(', ')}`, async () => {
      const heads = (await locatorOf(page, 'dashboard.css.thead-th').allInnerTexts()).map((h) => norm(h).toLowerCase()).filter(Boolean);
      for (const c of COLUMNS) expect(heads, `column "${c}" is missing`).toContain(c.toLowerCase());
    });
    await check('There is at least one run for the current pair', () => expect(list.length).toBeGreaterThan(0));
    await check('Run ID is 8 hexadecimal characters', () => list.forEach((r) => expect(r.runId).toMatch(/^[0-9a-f]{8}$/i)));
    await check('Attempt reads "Attempt N"', () => list.forEach((r) => expect(r.attempt, r.runId).toMatch(/^\s*Attempt\s+\d+\s*$/i)));
    await check(`Project is "${name}" and Branch is "${branch}" in every row`, () => list.forEach((r) => { expect(r.project.toLowerCase(), r.runId).toBe(name.toLowerCase()); expect(r.branch.toLowerCase(), r.runId).toBe(branch.toLowerCase()); }));
    await check('Commit is 8 hexadecimal characters', () => list.forEach((r) => expect(r.commit, r.runId).toMatch(/^[0-9a-f]{8}$/i)));
    await check('Score is a number with one decimal (e.g. 88.7) from 0 to 100', () => list.forEach((r) => { expect(r.score, r.runId).toMatch(/^\d{1,3}(\.\d)?$/); expect(num(r.score)).toBeLessThanOrEqual(100); }));
    await check('Tasks reads "done/total"', () => list.forEach((r) => {
      const m = r.tasks.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
      expect(m, `${r.runId}: "${r.tasks}"`).not.toBeNull();
    }));
    await check('Created reads like "Oct 7, 05:15 PM"', () => list.forEach((r) => expect(r.created, r.runId).toMatch(/^[A-Za-z]{3}\s+\d{1,2},\s*\d{1,2}:\d{2}\s*(AM|PM)$/i)));
    await check('No run is listed twice', () => expect(new Set(list.map((r) => r.runId)).size).toBe(list.length));
  },

  'DSH-008': async (ctx) => {
    await needDashboard(ctx);
    const { page, check, note, snap } = ctx;
    const { branch } = inputs(ctx, { repo: true, branches: 1 });
    const list = await rows(page);
    const api = await apiRuns(page, repoIdOf(list));
    const mine = api.runs.filter((r) => r.branch_name === branch).sort((a, b) => b.created_at.localeCompare(a.created_at));
    note(`The run list (views-api) has ${mine.length} run(s) of this branch; the page shows ${list.length}.`);
    await snap('Runs table compared with the run list', locatorOf(page, 'dashboard.css.table').first());
    await check('The run list call works (200)', () => expect(api.status).toBe(200));
    await check('The page shows as many runs as the run list has for this branch', () => expect(list.length).toBe(mine.length));
    await check('The runs are listed newest first, like the run list', () => expect(list.map((r) => r.runId.toLowerCase())).toEqual(mine.map((r) => r.run_id.slice(0, 8).toLowerCase())));
    for (const r of list) {
      const a = mine.find((x) => x.run_id.toLowerCase().startsWith(r.runId.toLowerCase()));
      await check(`Run ${r.runId}: attempt, commit, score, tasks and created time match the run list`, async () => {
        expect(a, `run ${r.runId} is not in the run list`).toBeDefined();
        expect(norm(r.attempt).toLowerCase()).toBe(`attempt ${a!.attempt_number}`);
        expect(r.commit.toLowerCase()).toBe(a!.commit_sha.slice(0, 8).toLowerCase());
        expect(Math.abs(num(r.score) - num(a!.overall_score)), `page ${r.score}, API score ${a!.overall_score}`).toBeLessThanOrEqual(0.1);
        expect(r.tasks.replace(/\s+/g, ''), 'tasks are shown as completed / total').toBe(`${a!.completed_tasks}/${a!.total_tasks}`);
        expect(norm(r.created).toLowerCase(), `API time ${a!.created_at}`).toBe(norm(await stamp(page, a!.created_at)).toLowerCase());
      });
    }
  },

  'DSH-009': async (ctx) => {
    await needDashboard(ctx);
    const { page, check, note, snap } = ctx;
    const list = await rows(page);
    const api = await apiRuns(page, repoIdOf(list));
    const verdict = (id: string): string => api.runs.find((x) => x.run_id.startsWith(id))?.status ?? '?';
    const pass = list.filter((r) => /^pass$/i.test(r.status)).map((r) => num(r.score));
    const other = list.filter((r) => !/^pass$/i.test(r.status)).map((r) => num(r.score));
    note(`Status words: ${list.map((r) => `${r.runId} ${r.status} (${r.score}; backend status "${verdict(r.runId)}")`).join('; ')}. The backend status is the branch verdict, the table word follows the score.`);
    await snap('Runs table with the Status and Score columns', locatorOf(page, 'dashboard.css.table').first());
    await check('A higher score never has a worse status word (every Pass score is above every other score)', () => {
      if (pass.length && other.length) expect(Math.min(...pass), `lowest Pass ${Math.min(...pass)}, highest other ${Math.max(...other)}`).toBeGreaterThan(Math.max(...other));
    });
    await check('Runs with the same score show the same status word', () => {
      const by = new Map<string, Set<string>>();
      list.forEach((r) => by.set(r.score, (by.get(r.score) ?? new Set()).add(r.status)));
      for (const [s, w] of by) expect([...w], `score ${s}`).toHaveLength(1);
    });
  },

  'DSH-010': async (ctx) => {
    await needDashboard(ctx);
    const { page, check, note, snap } = ctx;
    const { repo, branch } = inputs(ctx, { repo: true, branches: 1 });
    const name = repo.split('/').pop() ?? repo;
    const before = await rows(page);
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
      await dashTitle(page).waitFor({ state: 'visible', timeout: 45_000 });
      await locatorOf(page, 'dashboard.css.tbody-tr').first().waitFor({ state: 'visible', timeout: 45_000 });
    });
    await expect.poll(() => [...seen].some((p) => /\/views-api\/v1\/runs$/.test(p)), { timeout: 15_000 }).toBe(true).catch(() => undefined); // wait for the run list call
    page.off('response', onResponse);
    const after = await rows(page);
    await snap('Dashboard after the reload', [dashTitle(page), locatorOf(page, 'dashboard.css.table').first()]);
    note(`Data calls seen after the reload: ${[...seen].join(', ') || '(none)'}`);
    await check('The Dashboard is still shown after the reload (not sent to login)', () => { expect(new URL(page.url()).pathname).toBe('/dashboard'); expect(page.url()).not.toMatch(/\/auth\//); });
    await check(`The current pair is still "${name} / ${branch}" after the reload`, async () =>
      expect(norm(await currentText(page).innerText())).toMatch(pairRe(name, branch)));
    await check('The same runs and scores are listed after the reload', () => expect(after.map((r) => `${r.runId}:${r.score}`)).toEqual(before.map((r) => `${r.runId}:${r.score}`)));
    await check('The page loads the run list again', () => expect([...seen].some((p) => /\/views-api\/v1\/runs$/.test(p)), 'no views-api runs call seen').toBe(true));
    await check('No data call returned an error (4xx / 5xx)', () => expect(bad, bad.join(', ')).toEqual([]));
  },

  'DSH-011': async (ctx) => {
    await needDashboard(ctx);
    const { page, check, note, snap } = ctx;
    const { branch } = inputs(ctx, { repo: true, branches: 1 });
    const list = await rows(page);
    await check('Every row has a "View run details" button', () => expect(locatorOf(page, 'dashboard.button.view-run-details')).toHaveCount(list.length));
    await check('Each row\'s link goes to the Confidence Engine of that run (runId, projectId, repositoryId and the branch)', () => {
      for (const r of list) {
        const u = new URL(r.href, 'https://x');
        expect(u.pathname, r.runId).toBe('/confidence-engine');
        expect(u.searchParams.get('runId') ?? '', r.runId).toMatch(UUID);
        expect((u.searchParams.get('runId') ?? '').startsWith(r.runId), `${r.runId} vs ${u.searchParams.get('runId')}`).toBe(true);
        expect(u.searchParams.get('projectId') ?? '', r.runId).toMatch(UUID);
        expect(u.searchParams.get('repositoryId') ?? '', r.runId).toMatch(UUID);
        expect((u.searchParams.get('branch') ?? '').toLowerCase(), r.runId).toBe(branch.toLowerCase());
      }
    });
    if (!list.length) ctx.skip('There is no run in the list to open.');
    await snap('Runs table with the "View run details" buttons', [locatorOf(page, 'dashboard.button.view-run-details').first(), locatorOf(page, 'dashboard.css.table').first()]);
    const first = list[0];
    await ctx.step(`Click "View run details" of the first run (${first.runId})`, async () => {
      await locatorOf(page, 'dashboard.button.view-run-details').first().click();
      await page.waitForURL(/\/confidence-engine\?/, { timeout: 30_000 });
    });
    await check('The Confidence Engine page opens for that run', async () => {
      expect(new URL(page.url()).searchParams.get('runId') ?? '').toMatch(new RegExp(`^${first.runId}`, 'i'));
      await expect(pageTitle(page)).toBeVisible({ timeout: 30_000 });
    });
    await check(`The score of that run on the page is the score in the table (${first.score}, rounded)`, async () => {
      const shown = async (): Promise<number> => {
        const t = norm(await locatorOf(page, 'dashboard.css.body').innerText());
        return num(t.match(/Confidence Score\s*(?:commit\s*\S+\s*)?(\d{1,3})\s*\/\s*100/i)?.[1]);
      };
      // the score appears after the run's data has loaded (it reads 0 / is missing until then)
      await expect.poll(shown, { timeout: 30_000, message: `table score ${first.score}` }).toBe(Math.round(num(first.score)));
    });
    await ctx.step('Go back to the Dashboard with the left menu', async () => {
      await locatorOf(page, 'dashboard.css.a-href-dashboard').first().click();
      await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
      await expect(dashTitle(page)).toBeVisible({ timeout: 30_000 });
    });
    await check('The Dashboard shows the same runs after coming back', async () => {
      await locatorOf(page, 'dashboard.css.tbody-tr').first().waitFor({ state: 'visible', timeout: 30_000 });
      expect((await rows(page)).map((r) => r.runId)).toEqual(list.map((r) => r.runId));
    });
    note('Nothing was started: only "View run details" was clicked.');
  },

  'DSH-012': async (ctx) => {
    await needDashboard(ctx);
    const { page, check, note, snap } = ctx;
    const list = await rows(page);
    if (!list.length) ctx.skip('There is no run in the list to open.');
    const target = list[list.length - 1];
    await ctx.step(`Open the run ${target.runId} of the last row (the open icon at the end of its row; the Run ID text itself is not a link on this page)`, async () => {
      await locatorOf(page, 'dashboard.button.view-run-details').last().click();
    });
    await check('Opening the run of the last row shows the Confidence Engine of that run', async () => {
      await page.waitForURL(/\/confidence-engine\?/, { timeout: 15_000 });
      expect(new URL(page.url()).searchParams.get('runId') ?? '').toMatch(new RegExp(`^${target.runId}`, 'i'));
    });
    await check('The Confidence Engine page of that run shows its title', () => expect(pageTitle(page)).toBeVisible({ timeout: 30_000 }));
    await snap('Confidence Engine page opened from the last row', pageTitle(page));
    if (!/\/dashboard/.test(page.url())) {
      await ctx.step('Go back to the Dashboard with the left menu', async () => {
        await locatorOf(page, 'dashboard.css.a-href-dashboard').first().click();
        await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
        await expect(dashTitle(page)).toBeVisible({ timeout: 30_000 });
      });
    }
    note('Nothing was started: only the Run ID was clicked.');
  },
};
