import { expect, Page, test as base } from '@playwright/test';
import { loadCases, loadInput } from '../excel/readInput';
import { InputConfig, TestCaseRow } from '../types';
import { getBlocker, setBlocker } from './blockers';
import { BlockingFailure } from './checks';
import { refreshResults } from '../reporting/resultsWorkbook';
import { CaseHandler, executeCase } from './registerCases';

/**
 * The stages of the journey, in order. A BlockingFailure(key) raised by a step means "from this stage on nothing can work":
 * every later step that needs this stage (or a later one) is SKIPPED with the reason. A step that only FAILS (soft check) does
 * not block anything - the flow just carries on with the next step.
 */
export const STAGES = ['start', 'login', 'repo-list', 'configure', 'confirm', 'plan', 'execute', 'engine', 'finished'] as const;
export type Stage = (typeof STAGES)[number];
const at = (s: Stage): number => STAGES.indexOf(s);

export interface FlowStep<P> {
  /** Excel sheet and TC ID of the case this step reports to. */
  sheet: string;
  id: string;
  /** The furthest stage this step needs. Skipped when that stage - or any earlier one - is blocked. */
  stage: Stage;
  handler: CaseHandler<P>;
}

/** One entry in Test Explorer: a module of the journey. */
export interface ModuleDef<P> {
  /** Shown in Test Explorer, e.g. "1 · Login module". */
  title: string;
  timeoutSec: number;
  /** The stage the browser must already be in when this module starts (earlier modules normally got it there). */
  needs: Stage;
  /** The stage the browser is in when this module has finished without blocking. */
  provides: Stage;
  steps: FlowStep<P>[];
  /** The module ends the session (sign out / sign in again): the journey position is set to exactly `provides`. */
  resets?: boolean;
}

export interface JourneyDefinition<P> {
  createPage: (page: Page, input: InputConfig) => P;
  /** Brings the browser from stage `from` to stage `to` WITHOUT writing any result rows (used when a module is run on its own). */
  advance: (pg: P, input: InputConfig, from: Stage, to: Stage) => Promise<void>;
  /** Runs before every step on the same page (e.g. close a dialog a failed step left open). Errors are ignored. */
  beforeStep?: (pg: P) => Promise<void>;
  modules: ModuleDef<P>[];
}

/** State that lives as long as the Playwright worker: the shared browser page and how far the journey has got. */
const session: { reached: number; failed: string[]; tally: Record<string, number> } = { reached: -1, failed: [], tally: {} };

/** ONE browser page for the whole worker, so modules that run one after the other carry on from each other. */
const test = base.extend<object, { journeyPage: Page }>({
  journeyPage: [
    async ({ browser }, use) => {
      const input = loadInput();
      const context = await browser.newContext({ viewport: input.headless ? { width: 1920, height: 1080 } : null });
      const page = await context.newPage();
      page.setDefaultTimeout(15_000);
      page.setDefaultNavigationTimeout(45_000);
      await use(page);
      await context.close();
    },
    { scope: 'worker' },
  ],
});

/**
 * The journey as a few tests in Test Explorer - one per module, in order (Login, Repo, Coverage, Plan, ...). Run them all and they
 * continue from each other on the same browser page. Run one module alone and it first brings the page to the state it needs
 * (silently, without writing rows). A module never "fails" in Playwright (that would close the browser and lose the session);
 * each case is marked PASS / FAIL / SKIPPED in Excel and the last test, "Summary", turns red when any case failed.
 */
export function defineJourney<P>(def: JourneyDefinition<P>): void {
  test.describe.configure({ mode: 'serial' });

  def.modules.forEach((mod) => {
    test(mod.title, async ({ journeyPage }) => {
      test.setTimeout(mod.timeoutSec * 1000);
      const input = loadInput();
      const pg = def.createPage(journeyPage, input);
      const rowsBySheet = new Map<string, TestCaseRow[]>();
      const rowOf = (sheet: string, id: string): TestCaseRow | undefined => {
        if (!rowsBySheet.has(sheet)) rowsBySheet.set(sheet, loadCases(sheet));
        return rowsBySheet.get(sheet)!.find((r) => r.id === id);
      };

      // 1. Make sure the browser is where this module expects it (only does work when this module is run on its own).
      if (at(mod.needs) > 0 && session.reached < at(mod.needs)) {
        const from = STAGES[Math.max(session.reached, 0)];
        console.log(`\n… preparing: bringing the browser from "${session.reached < 0 ? 'nothing' : from}" to "${mod.needs}" (no rows written)`);
        try {
          await def.advance(pg, input, session.reached < 0 ? 'start' : from, mod.needs);
          session.reached = at(mod.needs);
        } catch (e) {
          const key = e instanceof BlockingFailure ? e.key : mod.needs;
          setBlocker(key, 'setup', `Could not get ready for "${mod.title}": ${(e as Error).message.split('\n')[0]}`);
        }
      }

      // 2. Run the module's cases in order.
      const total = mod.steps.filter((st) => rowOf(st.sheet, st.id)?.run).length;
      let n = 0;
      let group = '';
      console.log(`\n████████████ ${mod.title.toUpperCase()}  (${total} cases) ████████████`);
      for (const step of mod.steps) {
        const row = rowOf(step.sheet, step.id);
        if (!row) {
          console.warn(`  ⚠ ${step.sheet}/${step.id}: no row in the sheet - step skipped`);
          continue;
        }
        if (!row.run) continue; // Run = N: stays NOT RUN
        const label = `${step.sheet.toUpperCase()} › ${row.subModule}`;
        if (label !== group) {
          group = label;
          console.log(`\n══════════ ${label} ══════════`);
        }
        n += 1;
        console.log(`▶ [${n}/${total}] ${step.id}  ${row.name}`);
        const t0 = Date.now();
        await def.beforeStep?.(pg).catch(() => undefined);

        const need = at(step.stage);
        const blockedBy = () => {
          for (const stage of STAGES.slice(0, need + 1)) {
            const b = getBlocker(stage);
            if (b) return b;
          }
          return undefined;
        };
        const outcome = await test.step(`${step.id} ${row.name}`, () =>
          executeCase({ sheet: step.sheet, subModule: row.subModule, row, handler: step.handler, page: journeyPage, pg, input, blockedBy, deferRefresh: true }));
        if (outcome.result === 'FAIL') session.failed.push(step.id);
        session.tally[outcome.result] = (session.tally[outcome.result] ?? 0) + 1;
        const icon = outcome.result === 'PASS' ? '✔ PASS' : outcome.result === 'FAIL' ? '✘ FAIL' : `⏭ ${outcome.result}`;
        console.log(`   ${icon}  ${step.id}  (${Math.round((Date.now() - t0) / 1000)}s)`);
      }

      // Rebuild the workbooks once for this module (every case already has its own record file).
      const t1 = Date.now();
      await refreshResults(input.writeResultsToInput).catch((e) => console.warn(`  ⚠ results workbook not updated: ${(e as Error).message}`));
      console.log(`   (workbooks updated in ${Math.round((Date.now() - t1) / 1000)}s)`);

      // 3. Remember how far the journey got (only when nothing up to this module's last stage is blocked).
      const clean = STAGES.slice(0, at(mod.provides) + 1).every((s) => !getBlocker(s));
      if (mod.resets) session.reached = clean ? at(mod.provides) : -1;
      else if (clean) session.reached = Math.max(session.reached, at(mod.provides));
      console.log(`\n── ${mod.title}: finished; journey is at "${session.reached < 0 ? 'start' : STAGES[session.reached]}" ──`);
    });
  });

  test('Summary (red when any case failed)', async () => {
    await refreshResults(loadInput().writeResultsToInput).catch(() => undefined);
    const t = session.tally;
    console.log(`\n══════════ DONE: ${t.PASS ?? 0} passed, ${t.FAIL ?? 0} failed, ${t.SKIPPED ?? 0} skipped ══════════`);
    expect(session.failed, `Cases that failed (the journey still carried on): ${session.failed.join(', ')}`).toEqual([]);
  });
}

/** Called by a module that ends the session (sign out) so a later module signs in again. */
export function resetJourney(): void {
  session.reached = -1;
}
