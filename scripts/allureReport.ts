import * as fs from 'fs';
import * as path from 'path';
import { loadInput } from '../core/excel/readInput';
import { buildAllureReport } from '../core/reporting/allureBuild';
import { ROOT } from '../core/paths';

/**
 * npm run report                 builds the Allure report of the NEWEST run and opens it
 * npm run report -- <run folder> builds it for that run (for example results\run_2026-10-28_194257)
 * npm run report -- --no-open    only builds it
 */
try { loadInput(); } catch { /* only needed to know the secret values; the report is still built */ }
const args = process.argv.slice(2);
const open = !args.includes('--no-open');
const given = args.find((a) => !a.startsWith('--'));
const resultsDir = path.join(ROOT, 'results');
let runDir = given ? path.resolve(given) : '';
if (!runDir) {
  const runs = fs.existsSync(resultsDir) ? fs.readdirSync(resultsDir).filter((n) => /^run_\d{4}-\d{2}-\d{2}_\d{6}$/.test(n) && fs.existsSync(path.join(resultsDir, n, 'allure-results'))).sort() : [];
  if (!runs.length) { console.error('No run with Allure results found in results/. Run the tests first (npm test).'); process.exit(1); }
  runDir = path.join(resultsDir, runs[runs.length - 1]);
}
const html = buildAllureReport(runDir, { open });
process.exit(html ? 0 : 1);
