import { defineJourney, FlowStep, Stage } from '../../core/runner/registerFlow';
import { loginHandlers } from '../login/loginSteps';
import { InputConfig } from '../../core/types';
import { setBlocker } from '../../core/runner/blockers';
import { nth, RepoPage } from '../repo/shared/RepoPage';
import { connectionSteps } from '../repo/connection/connectionSteps';
import { branchSteps } from '../repo/branch/branchSteps';
import { coverageSteps } from '../coverage/coverageSteps';
import { planSteps } from '../plan/planSteps';
import { executionSteps } from '../execution/executionSteps';
import { confidenceSteps } from '../confidence/confidenceSteps';
import { graphSteps } from '../graph/graphSteps';
import { dashboardSteps } from '../dashboard/dashboardSteps';
import { signupSteps } from '../signup/signupSteps';
import { objectSteps } from '../object/objectSteps';
import { latestCommitSteps } from '../latestcommit/latestCommitSteps';
import { accountSteps } from '../account/accountSteps';
import { supportSteps } from '../support/supportSteps';
import { qaSteps } from '../qa/qaSteps';
import { qaFor } from '../../scripts/data/qaCases';
import { assistantSteps } from '../assistant/assistantSteps';
import { contextSteps } from '../context/contextSteps';
import { redirectSteps } from '../redirects/redirectSteps';
import { watchTenant } from '../../core/pages/runApi';
import { loadModules } from '../../core/config/modules';
import { obj as locatorOf } from '../../core/keywords/obj';

/**
 * THE JOURNEY - modules that run in order on ONE browser page (Test Explorer shows one entry per module):
 *   1 Login  ->  2 Repo  ->  3 Coverage  ->  4 Plan  ->  5 Execution  ->  6 Confidence Engine  ->  7 Confidence Graph  ->  8 Confidence Object  ->  9 Latest commit  ->  10 Dashboard  ->  11 Sign out  ->  12 Sign up.
 * Run all of them and each continues from the previous one; run one alone and it first prepares the page (no rows written).
 * The order a user goes through the site:
 *   sign in -> Execution Assistant -> Change repository / branch -> Connect / Import repository -> choose repository ->
 *   Configure (branch, triggers) -> Confirm -> Coverage preview -> Review branches -> Continue -> Run plan.
 * A step that only FAILS is recorded and the journey carries on. A step that makes the next one impossible (cannot sign in,
 * repository list missing, Confirm refused, Run plan not opened) blocks only the steps that depend on it - those are SKIPPED
 * with the reason. "Execute run" is never clicked.
 */
const step = (sheet: string, id: string, stage: Stage, handler: FlowStep<RepoPage>['handler']): FlowStep<RepoPage> => ({ sheet, id, stage, handler });
const con = (n: number, stage: Stage) => step('Repo', `REPO-CON-00${n}`, stage, connectionSteps[`REPO-CON-00${n}`]);
const brn = (id: string, stage: Stage) => step('Repo', `REPO-BRN-${id}`, stage, branchSteps[`REPO-BRN-${id}`]);
const cov = (n: number) => step('Coverage', `COV-00${n}`, 'confirm', coverageSteps[`COV-00${n}`]);
const exe = (n: number, stage: Stage) => step('Execution', `EXE-0${String(n).padStart(2, '0')}`, stage, executionSteps[`EXE-0${String(n).padStart(2, '0')}`]);
const ce = (n: number) => step('Confidence', `CE-0${String(n).padStart(2, '0')}`, 'finished', confidenceSteps[`CE-0${String(n).padStart(2, '0')}`]);
const gr = (n: number) => step('Graph', `GR-0${String(n).padStart(2, '0')}`, 'finished', graphSteps[`GR-0${String(n).padStart(2, '0')}`]);
const obj = (n: number) => step('Object', `OBJ-0${String(n).padStart(2, '0')}`, 'finished', objectSteps[`OBJ-0${String(n).padStart(2, '0')}`]);
const dsh = (n: number) => step('Dashboard', `DSH-0${String(n).padStart(2, '0')}`, 'login', dashboardSteps[`DSH-0${String(n).padStart(2, '0')}`]);
/** Sign up never creates an account. It is switched on/off in config/modules.json ("enabled"). */
const sup = (n: number) => step('Signup', `SUP-0${String(n).padStart(2, '0')}`, 'start', signupSteps[`SUP-0${String(n).padStart(2, '0')}`]);
const com = (n: number) => step('Commit', `COM-00${n}`, 'finished', latestCommitSteps[`COM-00${n}`]);
const eah = (n: number) => step('Assistant', `EAH-00${n}`, 'login', assistantSteps[`EAH-00${n}`]);
const ctx_ = (n: number) => step('Context', `CTX-00${n}`, 'plan', contextSteps[`CTX-00${n}`]);
const acc = (n: number) => step('Account', `ACC-0${String(n).padStart(2, '0')}`, 'login', accountSteps[`ACC-0${String(n).padStart(2, '0')}`]);
const spt = (n: number) => step('Support', `SPT-0${String(n).padStart(2, '0')}`, 'login', supportSteps[`SPT-0${String(n).padStart(2, '0')}`]);
const qa = (sheet: string, stage: Stage) => qaFor(sheet).map((c) => step(sheet, c.id, stage, qaSteps[c.id]));
const red = (n: number) => step('Redirects', `RED-00${n}`, 'login', redirectSteps[`RED-00${n}`]);
const plan = (n: number) => step('Plan', `PLAN-00${n}`, 'plan', planSteps[`PLAN-00${n}`]);


/** Brings the page to the state a module needs, without writing any result rows (only used when a module is run on its own). */
async function advance(pg: RepoPage, input: InputConfig, from: Stage, to: Stage): Promise<void> {
  const repo = input.get('REPO').trim();
  const branch = nth(input.get('BRANCHES'), 0);
  const wait = Number(input.get('WAIT_MIN') || 5);
  // A module that needs a FINISHED run (Confidence Engine, Graph, Object ...) can be run alone when the Input sheet has the address of a finished run
  // (CONFIDENCE_RUN_URL, e.g. https://qa-frontend.testable.cc/confidence-engine?pillar=engine&mode=whitebox&from=ea&runId=...): sign in, open it, done.
  const runUrl = (input.get('CONFIDENCE_RUN_URL') || '').trim();
  if (to === 'finished' && runUrl) {
    if (!input.email || !input.password) { setBlocker('login', 'setup', 'QA_EMAIL / QA_PASSWORD are blank on the Input sheet.'); return; }
    if (from === 'start') await pg.signInAndOpenHome(input.email, input.password);
    await pg.page.goto(runUrl);
    await locatorOf(pg.page, 'flow.text.pr-confidence-analysis-confidence-gr').first().waitFor({ state: 'visible', timeout: 60_000 });
    return;
  }
  for (const stage of STAGE_ORDER.slice(STAGE_ORDER.indexOf(from) + 1, STAGE_ORDER.indexOf(to) + 1)) {
    if (stage === 'login') {
      if (!input.email || !input.password) {
        setBlocker('login', 'setup', 'QA_EMAIL / QA_PASSWORD are blank on the Input sheet.');
        return;
      }
      await pg.signInAndOpenHome(input.email, input.password);
    } else if (stage === 'repo-list') await pg.importAndWaitForSync();
    else if (stage === 'configure') {
      if (!repo) { setBlocker('configure', 'setup', 'REPO is blank on the Input sheet.'); return; }
      await pg.chooseRepo(repo);
    } else if (stage === 'confirm') {
      if (!branch) { setBlocker('confirm', 'setup', 'BRANCHES is blank on the Input sheet.'); return; }
      await pg.selectBranch(branch);
      await pg.ensurePrMergeTicked();
      await pg.confirmAndWaitForReview();
    } else if (stage === 'plan') {
      await pg.waitForContinueEnabled(wait);
      await pg.continueAndWaitForPlan();
    }
  }
}
const STAGE_ORDER: Stage[] = ['start', 'login', 'repo-list', 'configure', 'confirm', 'plan'];

/** What each module runs. The ORDER, titles, timeouts and on/off live in config/modules.json. */
const STEPS: Record<string, () => FlowStep<RepoPage>[]> = {
  login: () => [
        ...loginHandlers.preAuth.map((x) => step('Login', x.id, 'start', x.handler)),
        step('Login', loginHandlers.signIn.id, 'start', loginHandlers.signIn.handler),
        ...loginHandlers.afterAuth.map((x) => step('Login', x.id, 'login', x.handler)),
      ],
  assistant: () => [...[1, 2, 4, 5, 6].map(eah), ...qa('Assistant', 'login')],
  repo: () => [
        con(1, 'login'), con(2, 'login'), con(3, 'login'),
        con(4, 'repo-list'), con(5, 'repo-list'), con(6, 'repo-list'), con(7, 'repo-list'), con(8, 'repo-list'),
        ...['001', '002', '003', '004', '005', '006', '007', '008', '011'].map((id) => brn(id, 'configure')),
        brn('009', 'configure'),
        ...qa('Repo', 'configure'),
      ],
  coverage: () => [...[1, 2, 3, 4, 5, 6, 7].map(cov), brn('010', 'confirm'), ...qa('Coverage', 'confirm')],
  plan: () => [1, 2, 3, 4, 5, 6, 7].map(plan),
  context: () => [1, 2, 3].map(ctx_),
  execution: () => [exe(1, 'plan'), exe(2, 'execute'), exe(3, 'execute'), exe(4, 'engine'), exe(5, 'engine'), exe(6, 'engine'),
        exe(7, 'finished'), exe(8, 'finished'), exe(9, 'finished'), exe(10, 'finished'), ...qa('Execution', 'finished')],
  confidence: () => [...Array.from({ length: 20 }, (_, i) => ce(i + 1)), ...qa('Confidence', 'finished')],
  graph: () => [...Array.from({ length: 16 }, (_, i) => gr(i + 1)), ...qa('Graph', 'finished')],
  object: () => Array.from({ length: 13 }, (_, i) => obj(i + 1)),
  latestcommit: () => [1, 2, 3, 4, 5, 6, 7].map(com),
  dashboard: () => [...Array.from({ length: 12 }, (_, i) => dsh(i + 1)), ...qa('Dashboard', 'login')],
  account: () => [...Array.from({ length: 15 }, (_, i) => acc(i + 1)), ...qa('Account', 'login')],
  support: () => [...Array.from({ length: 18 }, (_, i) => spt(i + 1)), ...qa('Support', 'login')],
  redirects: () => Array.from({ length: 8 }, (_, i) => red(i + 1)),
  signout: () => [...loginHandlers.atEnd.map((x) => step('Login', x.id, 'login', x.handler)), ...qa('Login', 'login')],
  signup: () => [...Array.from({ length: 20 }, (_, i) => sup(i + 1)), ...qa('Signup', 'start')],
};

defineJourney<RepoPage>({
  createPage: (page, input) => new RepoPage(page, input.baseUrl),
  beforeStep: (pg) => { watchTenant(pg.page); return pg.closeDialogs(); },
  advance,
  modules: loadModules().map((m) => {
    const steps = STEPS[m.key];
    if (!steps) throw new Error(`config/modules.json: module "${m.key}" has no step list in modules/flow/journey.spec.ts`);
    return { title: m.title, timeoutSec: m.timeoutSec, needs: m.needs as Stage, provides: m.provides as Stage, resets: m.resets, steps: steps() };
  }),
});
