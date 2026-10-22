import * as path from 'path';

export const ROOT = path.resolve(__dirname, '..');
export const INPUT_FILE = path.resolve(ROOT, process.env.INPUT_FILE || 'input/testable-input.xlsx');

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// Set once in the main process; Playwright workers inherit it, so every file of one run shares a folder.
if (!process.env.RUN_ID) process.env.RUN_ID = stamp();

export const RUN_ID = process.env.RUN_ID as string;
// When started with `npm run test:branches`, every branch gets its own sub-folder: results/run_<ts>/<BRANCH>/
const BRANCH_DIR = (process.env.BRANCH_DIR || '').replace(/[^A-Za-z0-9_.-]+/g, '_');
export const RUN_PARENT_DIR = path.join(ROOT, 'results', `run_${RUN_ID}`);
export const RUN_DIR = BRANCH_DIR ? path.join(RUN_PARENT_DIR, BRANCH_DIR) : RUN_PARENT_DIR;
export const EVIDENCE_DIR = path.join(RUN_DIR, 'evidence');
export const RECORDS_DIR = path.join(RUN_DIR, 'records');
export const RESULTS_XLSX = path.join(RUN_DIR, 'testable-results.xlsx');
