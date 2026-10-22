import { test, Locator, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { loadCases, loadInput, parseTestData } from '../excel/readInput';
import { EVIDENCE_DIR, RECORDS_DIR, RUN_DIR } from '../paths';
import { CaseRecord, InputConfig, Result, TestCaseRow } from '../types';
import { refreshResults } from '../reporting/resultsWorkbook';
import { getBlocker, setBlocker } from './blockers';
import { BlockingFailure, Checks, cleanError, explain, SkipCase } from './checks';

export interface CaseContext<P> {
  /** The module's page object (locators + actions). */
  pg: P;
  page: Page;
  row: TestCaseRow;
  /** "key=value" pairs from the Test Data cell ({{TOKENS}} already filled). Keys are lower-case. */
  data: Record<string, string>;
  input: InputConfig;
  /**
   * Run an assertion and log it in the Actual Result column. A failing check marks the case FAIL but the case
   * CONTINUES with its next checks (use it for anything the following steps do not depend on).
   */
  check: (description: string, fn: () => unknown | Promise<unknown>, mark?: Locator | Locator[]) => Promise<void>;
  /** Like check, but for a step the rest of the case depends on: when it fails the case stops (FAIL). */
  step: (description: string, fn: () => unknown | Promise<unknown>) => Promise<void>;
  /** SKIPPED ("Blocked by <case>") when an earlier case in this run proved the prerequisite is broken (e.g. 'login'). */
  requires: (key: string) => void;
  /** Add an informational line to the Actual Result column. */
  note: (text: string) => void;
  /**
   * Evidence picture of the MAIN step, taken right now (call it while the thing being tested is on screen: the dialog, the tooltip,
   * the open tab, the new page). The element is scrolled to the middle and outlined in green; a green bar at the bottom says what it shows.
   * The first snap of a case is kept for a passed case. A failed case keeps the picture of its first failed check (red).
   */
  snap: (label: string, target?: Locator | Locator[]) => Promise<void>;
  /** Names the element that is the point of the case, so the evidence picture shows it (when snap is not used). */
  focus: (...targets: Locator[]) => void;
  /** Stop this case and report it as SKIPPED with a reason (e.g. no test account filled in). Never returns. */
  skip: (reason: string) => never;
}

export type CaseHandler<P> = (ctx: CaseContext<P>) => Promise<void>;

export interface ModuleDefinition<P> {
  /** Excel sheet that holds the test cases, e.g. 'Login'. */
  sheet: string;
  /** Value of the "Sub Module" column this spec file owns, e.g. 'Normal'. */
  subModule: string;
  createPage: (page: Page, input: InputConfig) => P;
  /** Longer time limit (seconds) for flows that sync / wait on the site; default is TIMEOUT_SEC from the Input sheet. */
  timeoutSec?: number;
  /** TC ID -> automation. A row with no handler is reported as SKIPPED (dummy). */
  handlers: Record<string, CaseHandler<P>>;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const safe = (s: string) => s.replace(/[^A-Za-z0-9_.-]+/g, '_');

function writeRecord(rec: CaseRecord): void {
  fs.mkdirSync(RECORDS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RECORDS_DIR, `${safe(rec.sheet)}__${safe(rec.id)}.json`), JSON.stringify(rec, null, 2));
}

async function takeEvidence(page: Page, id: string): Promise<string> {
  try {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    const file = path.join(EVIDENCE_DIR, `${safe(id)}.png`);
    await page.screenshot({ path: file, timeout: 10_000 });
    return path.relative(RUN_DIR, file).split(path.sep).join('/');
  } catch {
    return '';
  }
}

export interface DefinedCase {
  id: string;
  /** Test title: "<TC ID> <name>". */
  title: string;
  /** Call from the spec file: test(c.title, ({ page }) => c.run(page)). */
  run: (page: Page) => Promise<void>;
}

/**
 * Turns the rows of one sub module in the Excel sheet into runnable cases. The spec file registers them with
 * Playwright's test() itself (so VS Code's Test Explorer groups them under that spec file).
 * Each case: runs the handler, takes a screenshot, writes a record that the results workbook is built from.
 */
/** What running one case returns (nothing is thrown: the caller decides what a failure means for the rest). */
export interface CaseOutcome {
  result: Result;
  /** Set when the case FAILED. */
  failure?: unknown;
}

export interface ExecuteOptions<P> {
  /** true = do not rebuild the workbooks after this case (the caller does it once per module); the record file is always written. */
  deferRefresh?: boolean;
  sheet: string;
  subModule: string;
  row: TestCaseRow;
  handler?: CaseHandler<P>;
  page: Page;
  pg: P;
  input: InputConfig;
  /**
   * Flow stage this case needs (see registerFlow). When an earlier case proved this stage (or an earlier one) is broken,
   * the case is reported as SKIPPED "Blocked by <id>: reason" without running.
   */
  blockedBy?: () => { caseId: string; reason: string } | undefined;
}

/**
 * Runs ONE case on the page it is given and writes its record (Actual Result, Result, screenshot) + refreshes the workbooks.
 * Shared by defineCases (a fresh browser page per case) and defineFlow (one page for the whole journey).
 */
export async function executeCase<P>(o: ExecuteOptions<P>): Promise<CaseOutcome> {
  const { row, handler, page, pg, input } = o;
  const started = Date.now();
  const base = { sheet: o.sheet, id: row.id, subModule: o.subModule, executedAt: new Date().toISOString() };

  if (!handler) {
    writeRecord({ ...base, result: 'SKIPPED', actual: 'Not automated yet (dummy placeholder).', screenshot: '', durationMs: 0 });
    if (!o.deferRefresh) await refreshResults(input.writeResultsToInput);
    return { result: 'SKIPPED' };
  }

  const checks = new Checks(page, row.id);
  checks.setCaseName(row.name);
  let failure: unknown;
  let skipReason = '';
  try {
    const blocked = o.blockedBy?.();
    if (blocked) throw new SkipCase(`Blocked by ${blocked.caseId}: ${blocked.reason}`);
    await handler({
      pg,
      page,
      row,
      data: parseTestData(row.testData, input),
      input,
      check: (d, f, m) => checks.check(d, f, m),
      step: (d, f) => checks.step(d, f),
      requires: (key) => {
        const b = getBlocker(key);
        if (b) throw new SkipCase(`Blocked by ${b.caseId}: ${b.reason}`);
      },
      note: (t) => checks.note(t),
      snap: (label, target) => checks.snap(label, target),
      focus: (...t) => checks.focus(...t),
      skip: (reason) => {
        throw new SkipCase(reason);
      },
    });
  } catch (e) {
    if (e instanceof SkipCase) {
      skipReason = e.message;
    } else {
      failure = e;
      if (!checks.failed) checks.note(`Error: ${explain(e)}`);
      if (e instanceof BlockingFailure) {
        setBlocker(e.key, row.id, cleanError(e));
        checks.note(`Later steps that need "${e.key}" are skipped as blocked.`);
      }
    }
  }
  // checks that failed but did not stop the case: the case is FAIL, everything else already ran
  if (!failure && checks.failedCount > 0) {
    failure = new Error(`${checks.failedCount} check(s) failed - first: ${cleanError(checks.firstFailure)}`);
  }
  if (failure && !checks.failureShot) await checks.errorShot(cleanError(failure));
  if (failure) {
    checks.lines.unshift(
      `TEST: ${row.name}`,
      `RESULT: FAIL - ${checks.failedCount || 1} problem(s) found (marked ✘ below). Everything else was still checked.`,
      '',
    );
  }

  if (skipReason) {
    checks.note(skipReason);
    // a skipped case did nothing on the page, so a picture of it only costs space - no screenshot
    writeRecord({ ...base, result: 'SKIPPED', actual: checks.text, screenshot: '', durationMs: Date.now() - started });
    if (!o.deferRefresh) await refreshResults(input.writeResultsToInput);
    return { result: 'SKIPPED' };
  }

  const result: Result = failure ? 'FAIL' : 'PASS';
  const screenshot: string = failure && checks.failureShot ? checks.failureShot : failure ? await takeEvidence(page, row.id) : (await checks.finalShot()) || (await takeEvidence(page, row.id));
  writeRecord({ ...base, result, actual: checks.text, screenshot, durationMs: Date.now() - started });
  if (!o.deferRefresh) await refreshResults(input.writeResultsToInput);
  return { result, failure };
}

/** Turns the rows of one sub module in the Excel sheet into runnable cases (one fresh browser page per case; used by the Login module). */
export function defineCases<P>(def: ModuleDefinition<P>): DefinedCase[] {
  const input = loadInput();
  const rows = loadCases(def.sheet).filter((r) => same(r.subModule, def.subModule));
  const known = new Set(rows.map((r) => r.id));
  for (const id of Object.keys(def.handlers)) {
    if (!known.has(id)) console.warn(`  ⚠ ${def.sheet}/${def.subModule}: handler ${id} has no row in the sheet`);
  }

  return rows
    .filter((row) => row.run) // Run = N: left as NOT RUN in the results workbook
    .map((row) => ({
      id: row.id,
      title: `${row.id} ${row.name}`,
      run: async (page: Page) => {
        if (def.timeoutSec) test.setTimeout(Math.max(def.timeoutSec * 1000, test.info().timeout));
        const outcome = await executeCase<P>({
          sheet: def.sheet,
          subModule: def.subModule,
          row,
          handler: def.handlers[row.id],
          page,
          pg: def.createPage(page, input),
          input,
        });
        if (outcome.result === 'SKIPPED') test.skip(true, 'skipped - see Actual Result');
        else if (outcome.failure) throw outcome.failure;
      },
    }));
}
