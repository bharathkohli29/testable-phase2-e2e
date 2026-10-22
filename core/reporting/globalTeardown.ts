import * as fs from 'fs';
import * as path from 'path';
import { loadInput } from '../excel/readInput';
import { RESULTS_XLSX, ROOT, RUN_PARENT_DIR } from '../paths';
import { refreshResults } from './resultsWorkbook';

/** Keeps only the newest `keep` run folders in results/ (KEEP_LAST_RUNS on the Input sheet, 0 = keep all). The current run is never removed. */
function removeOldRuns(keep: number): void {
  if (!(keep > 0)) return;
  const dir = path.join(ROOT, 'results');
  if (!fs.existsSync(dir)) return;
  const runs = fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^run_\d{4}-\d{2}-\d{2}_\d{6}$/.test(d.name))
    .map((d) => d.name)
    .sort(); // the name starts with the date and time, so the oldest comes first
  const current = path.basename(RUN_PARENT_DIR);
  const old = runs.filter((n) => n !== current).slice(0, Math.max(0, runs.length - keep));
  let freed = 0;
  for (const n of old) {
    try {
      fs.rmSync(path.join(dir, n), { recursive: true, force: true });
      freed++;
    } catch (e) {
      console.log(`  Could not remove old run ${n}: ${(e as Error).message}`);
    }
  }
  if (freed) console.log(`  Old runs removed: ${freed} (the newest ${keep} are kept)`);
}

/** Final rebuild after a full `npm test` run. (VS Code's Test Explorer skips this, which is why every test case also refreshes.) */
export default async function globalTeardown(): Promise<void> {
  const input = loadInput();
  await refreshResults(input.writeResultsToInput);
  console.log(`\n  Results workbook: ${RESULTS_XLSX}`);
  removeOldRuns(Number(input.raw.KEEP_LAST_RUNS ?? 3));
}
