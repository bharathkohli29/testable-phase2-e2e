export type EnvName = 'QA' | 'DEV';
export type Result = 'PASS' | 'FAIL' | 'SKIPPED';

/** Everything from the "Input" sheet, with the QA/DEV block already selected. */
export interface InputConfig {
  env: EnvName;
  baseUrl: string;
  email: string;
  password: string;
  headless: boolean;
  slowMoMs: number;
  timeoutSec: number;
  /** Also write Actual Result / Result / screenshot into the input workbook itself (default Y). */
  writeResultsToInput: boolean;
  raw: Record<string, string>;
  /** Names of credentials that are filled in on the Input sheet (they belong in .env). */
  sheetCredentials?: string[];
  /** Looks up KEY, then <ENV>_KEY (e.g. get('EMAIL') -> QA_EMAIL when ENV=QA). */
  get(name: string): string;
  /** Replaces {{KEY}} tokens with values from the Input sheet. */
  resolve(text: string): string;
}

/** One row of a module sheet (e.g. the "Login" sheet). */
export interface TestCaseRow {
  rowNumber: number;
  id: string;
  name: string;
  module: string;
  subModule: string;
  preconditions: string;
  steps: string;
  testData: string;
  expected: string;
  run: boolean;
}

/** What one executed test case writes back to the results workbook. */
export interface CaseRecord {
  sheet: string;
  id: string;
  subModule: string;
  result: Result;
  actual: string;
  screenshot: string; // path relative to the run folder, '' when none
  executedAt: string; // ISO
  durationMs: number;
}
