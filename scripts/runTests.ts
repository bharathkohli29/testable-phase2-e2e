import { spawnSync } from 'child_process';
import * as path from 'path';
import { RUN_DIR, ROOT } from '../core/paths'; // fixes the RUN_ID, which the test process inherits, so both use the same results folder
import { loadInput } from '../core/excel/readInput';
import { buildAllureReport } from '../core/reporting/allureBuild';

/** npm test: runs the tests (same as `playwright test modules/flow`), then builds the Allure report of that run. */
try { loadInput(); } catch { /* reported by the test run itself */ }
const extra = process.argv.slice(2);
const cli = path.join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
const r = spawnSync(process.execPath, [cli, 'test', 'modules/flow', ...extra], { stdio: 'inherit', cwd: ROOT, env: process.env });
buildAllureReport(RUN_DIR, { open: false });
process.exit(r.status ?? 1);
