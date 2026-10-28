import type { CaseHandler } from '../runner/registerCases';
import { BlockingFailure } from '../runner/checks';
import { runSteps, validateSteps, type KeywordEnv } from './engine';
import type { ObjectRepo } from './objects';
import type { DatasetRow, KeywordStep } from './steps';

export interface KeywordSuite {
  steps: Map<string, KeywordStep[]>;
  datasets: Map<string, DatasetRow[]>;
  repo: ObjectRepo;
  routes: Record<string, string>;
  /** Signs in with the Input sheet account on the given page. */
  signIn: (env: Pick<KeywordEnv, 'page' | 'input'>) => Promise<void>;
  /** Where checkpoint pictures go (the run's evidence/steps folder). */
  stepsDir?: string;
}

/**
 * Turns the rows of the "Keywords" sheet into runnable cases: the steps come from the "Keyword Steps" sheet (matched by TC ID), the
 * optional data sets from the "Datasets" sheet (the case row says dataset=<name> in its Test Data cell).
 * A case with several data sets runs all its steps once per data set; a data set that fails is written as one line of the Actual
 * Result and the next data set still runs, so one bad branch / version does not hide the others.
 */
export function keywordHandler(suite: KeywordSuite): CaseHandler<unknown> {
  return async (c) => {
    const steps = suite.steps.get(c.row.id) ?? [];
    if (steps.length === 0) c.skip(`No rows for ${c.row.id} in the "Keyword Steps" sheet.`);

    // 1. Everything wrong with the rows is reported BEFORE the first step runs (never a half-run case).
    const problems = validateSteps(steps, suite.repo, suite.routes);
    if (problems.length) {
      await c.step('The keyword steps are valid', () => {
        throw new Error(`${problems.length} problem(s) in the Keyword Steps sheet:\n  - ${problems.join('\n  - ')}`);
      });
    }

    const env: KeywordEnv = {
      page: c.page,
      input: c.input,
      repo: suite.repo,
      routes: suite.routes,
      signIn: () => suite.signIn({ page: c.page, input: c.input }),
      ctx: { check: c.check, step: c.step, note: c.note, snap: c.snap, skip: c.skip },
      stepsDir: suite.stepsDir,
      caseId: c.row.id,
    };

    // 2. One run, or one run per data set.
    const setName = (c.data.dataset ?? '').trim();
    if (!setName) return runSteps(env, steps);
    const rows = suite.datasets.get(setName);
    if (!rows || rows.length === 0) {
      await c.step(`The data set "${setName}" exists in the "Datasets" sheet`, () => {
        throw new Error(`No rows for the data set "${setName}" in the "Datasets" sheet.`);
      });
      return;
    }
    for (const [i, row] of rows.entries()) {
      c.note(`Data set ${i + 1} of ${rows.length}: ${row.label} (${Object.entries(row.values).map(([k, v]) => `${k}=${v}`).join(', ')})`);
      try {
        await runSteps({ ...env, caseId: `${c.row.id}_${row.label}` }, steps, row.values);
      } catch (e) {
        if (e instanceof BlockingFailure) throw e;
        const msg = (e as Error).message.split('\n')[0];
        await c.check(`Data set "${row.label}": all its steps ran`, () => {
          throw new Error(msg);
        });
      }
    }
  };
}
