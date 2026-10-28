import { expect, Page, test as base } from '@playwright/test';
import * as path from 'path';
import { loadCases, loadInput } from '../../core/excel/readInput';
import { loadDatasets, loadKeywordSteps } from '../../core/keywords/steps';
import { loadObjects, loadRoutes } from '../../core/keywords/objects';
import { keywordHandler } from '../../core/keywords/register';
import { EVIDENCE_DIR } from '../../core/paths';
import { refreshResults } from '../../core/reporting/resultsWorkbook';
import { executeCase } from '../../core/runner/registerCases';
import { RepoPage } from '../repo/shared/RepoPage';

/**
 * THE KEYWORD MODULE (npm run test:keywords).
 * The cases are the rows of the "Keywords" sheet; their steps are the rows of the "Keyword Steps" sheet; what a step can click or check
 * is described in /objects/*.json. Nothing here knows a button or a page: change the sheets or the JSON files, not this file.
 * It uses ONE browser page for all cases and signs in once (the SignIn keyword does nothing when the browser is already signed in).
 * It is separate from "npm test" (the journey), so it never changes how the journey runs.
 */
const SHEET = 'Keywords';
const results = { PASS: 0, FAIL: 0, SKIPPED: 0, failed: [] as string[] };

const test = base.extend<object, { keywordPage: Page }>({
  keywordPage: [
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

test.describe.configure({ mode: 'serial' });

test('Keyword module (cases from the Keywords sheet)', async ({ keywordPage }) => {
  test.setTimeout(1800_000);
  const input = loadInput();
  const rows = loadCases(SHEET).filter((r) => r.run);
  console.log(`\n████████████ KEYWORD MODULE  (${rows.length} cases) ████████████`);
  const handler = keywordHandler({
    steps: loadKeywordSteps(),
    datasets: loadDatasets(),
    repo: loadObjects(),
    routes: loadRoutes(),
    stepsDir: path.join(EVIDENCE_DIR, 'steps'),
    signIn: async ({ page, input: i }) => {
      if (!i.email || !i.password) throw new Error(`${i.env}_EMAIL / ${i.env}_PASSWORD are blank (the password can also come from the environment variable ${i.env}_PASSWORD).`);
      await new RepoPage(page, i.baseUrl).signInAndOpenHome(i.email, i.password);
    },
  });
  let n = 0;
  for (const row of rows) {
    n += 1;
    console.log(`▶ [${n}/${rows.length}] ${row.id}  ${row.name}`);
    const t0 = Date.now();
    const outcome = await test.step(`${row.id} ${row.name}`, () =>
      executeCase({ sheet: SHEET, subModule: row.subModule, row, handler, page: keywordPage, pg: {}, input, deferRefresh: true }));
    results[outcome.result] += 1;
    if (outcome.result === 'FAIL') results.failed.push(row.id);
    console.log(`   ${outcome.result === 'PASS' ? '✔ PASS' : outcome.result === 'FAIL' ? '✘ FAIL' : `⏭ ${outcome.result}`}  ${row.id}  (${Math.round((Date.now() - t0) / 1000)}s)`);
  }
  await refreshResults(input.writeResultsToInput).catch((e) => console.warn(`  ⚠ results workbook not updated: ${(e as Error).message}`));
});

test('Summary (red when any keyword case failed)', async () => {
  console.log(`\n══════════ DONE: ${results.PASS} passed, ${results.FAIL} failed, ${results.SKIPPED} skipped ══════════`);
  expect(results.failed, `Keyword cases that failed: ${results.failed.join(', ')}`).toEqual([]);
});
