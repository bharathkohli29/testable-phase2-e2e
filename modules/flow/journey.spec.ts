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
/** Every case handler by its case id. The cases of a module and their order are listed in config/modules.json. */
const HANDLERS: Record<string, FlowStep<RepoPage>['handler']> = {};
const register = (records: Record<string, unknown>[]): void => {
  for (const rec of records) for (const [id, h] of Object.entries(rec)) {
    if (HANDLERS[id]) throw new Error(`Case id "${id}" has two handlers.`);
    HANDLERS[id] = h as FlowStep<RepoPage>['handler'];
  }
};
register([
  connectionSteps, branchSteps, coverageSteps, planSteps, contextSteps, executionSteps, confidenceSteps, graphSteps, objectSteps, latestCommitSteps,
  dashboardSteps, accountSteps, supportSteps, redirectSteps, assistantSteps, signupSteps, qaSteps,
  Object.fromEntries([...loginHandlers.preAuth, loginHandlers.signIn, ...loginHandlers.afterAuth, ...loginHandlers.atEnd].map((x) => [x.id, x.handler])),
]);

/** "Sheet:CASE-ID@stage" -> a step; "qa:Sheet@stage" -> all extra QA cases of that sheet. */
function stepsOf(tokens: string[], moduleKey: string): FlowStep<RepoPage>[] {
  const out: FlowStep<RepoPage>[] = [];
  for (const t of tokens) {
    const [left, stage] = t.split('@');
    if (left.startsWith('qa:')) {
      const sheet = left.slice(3);
      for (const c of qaFor(sheet)) out.push({ sheet, id: c.id, stage: stage as Stage, handler: HANDLERS[c.id] });
      continue;
    }
    const [sheet, id] = left.split(':');
    if (!HANDLERS[id]) throw new Error(`config/modules.json: module "${moduleKey}" lists case "${id}" but there is no code for it.`);
    out.push({ sheet, id, stage: stage as Stage, handler: HANDLERS[id] });
  }
  return out;
}

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

defineJourney<RepoPage>({
  createPage: (page, input) => new RepoPage(page, input.baseUrl),
  beforeStep: (pg) => { watchTenant(pg.page); return pg.closeDialogs(); },
  advance,
  modules: loadModules().map((m) => ({
    title: m.title, timeoutSec: m.timeoutSec, needs: m.needs as Stage, provides: m.provides as Stage, resets: m.resets, steps: stepsOf(m.steps, m.key),
  })),
});
