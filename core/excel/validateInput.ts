import type { InputConfig } from '../types';

export interface InputProblem {
  level: 'error' | 'warning';
  message: string;
}

const YN = /^(y|yes|n|no|true|false|1|0)$/i;

/**
 * Checks the Input sheet BEFORE the run starts, so a typo gives a clear message instead of a confusing failure an hour later.
 * Only things that can never work are errors (the run stops); everything else is a warning (printed, the run goes on).
 * It never changes anything and never prints a password.
 */
export function validateInput(input: InputConfig): InputProblem[] {
  const out: InputProblem[] = [];
  const err = (message: string) => out.push({ level: 'error', message });
  const warn = (message: string) => out.push({ level: 'warning', message });
  const raw = input.raw;
  const get = input.get;

  if (!/^https?:\/\/[^\s/]+/i.test(input.baseUrl)) err(`${input.env}_BASE_URL (in .env) must start with http:// or https:// (it is "${input.baseUrl}").`);

  if (input.sheetCredentials?.length) warn(`Credentials are filled in on the Input sheet (${input.sheetCredentials.join(', ')}). Put them in the .env file instead and clear the cells (see .env.example); a value in .env wins over the sheet.`);
  if (!input.email) warn(`${input.env}_EMAIL is not set (put it in the .env file): the Login module cannot sign in, so every case that needs a signed-in browser is skipped.`);
  if (!input.password) warn(`${input.env}_PASSWORD is not set: put ${input.env}_PASSWORD=... in the .env file.`);

  for (const m of input.branchUrlProblems ?? []) err(`BRANCH_URL: ${m}`);
  const repo = get('REPO').trim();
  if (repo && !/^[\w.-]+(\/[\w.-]+)?$/.test(repo)) err(`REPO "${repo}" is not written as owner/name (for example Nandhini-Testable/Python_Corpus_Tool_Triggering).`);
  if (!repo) warn('BRANCH_URL is blank (write the link of the branch to run, for example https://github.com/owner/repo/tree/branch): the Repo, Coverage, Plan and Execution modules cannot choose a repository.');
  if (!get('BRANCHES').trim()) warn('The link has no branch (it needs /tree/<branch>): the modules that need a branch cannot continue.');

  for (const k of ['HEADLESS', 'WRITE_RESULTS_TO_INPUT', 'ALLOW_EXECUTE_RUN', 'ALLOW_DUMMY_COMMIT']) {
    const v = (raw[k] ?? '').trim();
    if (v && !YN.test(v)) err(`${k} must be Y or N (it is "${v}").`);
  }
  for (const k of ['SLOW_MO_MS', 'TIMEOUT_SEC', 'EXECUTION_WAIT_MIN', 'LATEST_COMMIT_WAIT_MIN', 'KEEP_LAST_RUNS', 'REVIEW_WAIT_SEC', 'PLAN_WAIT_SEC', 'SYNC_WAIT_SEC', 'CONFIGURE_WAIT_SEC']) {
    const v = (raw[k] ?? '').trim();
    if (v && !(Number.isFinite(Number(v)) && Number(v) >= 0)) err(`${k} must be a number (it is "${v}").`);
  }
  if (/^(y|yes|true|1)$/i.test(raw.ALLOW_EXECUTE_RUN ?? '')) warn('ALLOW_EXECUTE_RUN = Y: this run WILL start a real analysis and use one execution of the account.');
  return out;
}

/** Prints the problems in a short block. Returns the number of errors. */
export function reportInputProblems(problems: InputProblem[], log: (s: string) => void = console.log): number {
  if (!problems.length) return 0;
  log('\nInput sheet check:');
  for (const p of problems) log(`  ${p.level === 'error' ? '✘ ERROR  ' : '⚠ warning'}  ${p.message}`);
  log('');
  return problems.filter((p) => p.level === 'error').length;
}
