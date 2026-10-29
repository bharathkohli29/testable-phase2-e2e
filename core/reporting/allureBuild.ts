import { spawnSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { ROOT } from '../paths';
import { scrub } from '../secrets';

/**
 * ALLURE REPORT of one run (results/run_<time>/):
 *   1. cleans the raw results: every secret value (password, e-mail, keys) is replaced by ******** in step names, errors and texts;
 *   2. gives every case step the status the run recorded (PASS / FAIL / SKIPPED) and every module its overall status;
 *   3. builds ONE html file: results/run_<time>/allure-report/index.html (double-click it; it can be mailed as it is - the screenshots are inside).
 * Nothing here can change a test result.
 */
type Json = { [k: string]: unknown };
interface RecordFile { id: string; result: 'PASS' | 'FAIL' | 'SKIPPED'; actual?: string }

const scrubDeep = (v: unknown): unknown => {
  if (typeof v === 'string') return scrub(v);
  if (Array.isArray(v)) return v.map(scrubDeep);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Json).map(([k, x]) => [k, scrubDeep(x)]));
  return v;
};

function readRecords(runDir: string): Map<string, RecordFile> {
  const dir = path.join(runDir, 'records');
  const out = new Map<string, RecordFile>();
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    try { const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as RecordFile; if (r.id) out.set(r.id, r); } catch { /* ignore */ }
  }
  return out;
}

const STATUS = { PASS: 'passed', FAIL: 'failed', SKIPPED: 'skipped' } as const;
const firstLine = (t: string | undefined, prefer: RegExp): string => {
  const lines = (t ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  return (lines.find((l) => prefer.test(l)) ?? lines[0] ?? '').slice(0, 400);
};

/** Cleans and completes the raw results. Returns how many module results were processed. */
export function prepareResults(runDir: string): number {
  const dir = path.join(runDir, 'allure-results');
  if (!fs.existsSync(dir)) return 0;
  const records = readRecords(runDir);
  let modules = 0;
  for (const f of fs.readdirSync(dir)) {
    const file = path.join(dir, f);
    if (f.endsWith('-attachment.txt') || f.endsWith('-attachment.md') || f.endsWith('.properties')) {
      fs.writeFileSync(file, scrub(fs.readFileSync(file, 'utf8')));
      continue;
    }
    if (!f.endsWith('-result.json')) continue;
    const test = scrubDeep(JSON.parse(fs.readFileSync(file, 'utf8'))) as Json;
    const steps = (test.steps as Json[] | undefined) ?? [];
    let failed = 0, skipped = 0, passed = 0;
    const failedIds: string[] = [];
    for (const st of steps) {
      const m = /^(\S+)\s/.exec(String(st.name ?? ''));
      const rec = m ? records.get(m[1]) : undefined;
      if (!rec) continue;
      st.status = STATUS[rec.result];
      if (rec.result === 'FAIL') { failed++; failedIds.push(rec.id); st.statusDetails = { message: scrub(firstLine(rec.actual, /^✘/)) }; }
      else if (rec.result === 'SKIPPED') { skipped++; st.statusDetails = { message: scrub(firstLine(rec.actual, /Blocked|skipped|not automated/i)) }; }
      else passed++;
    }
    if (failed + skipped + passed > 0) {
      modules++;
      if (failed > 0) { test.status = 'failed'; test.statusDetails = { message: `${failed} case(s) failed: ${failedIds.join(', ')}` }; }
      else if (passed === 0) test.status = 'skipped';
      else test.status = 'passed';
    }
    fs.writeFileSync(file, JSON.stringify(test));
  }
  return modules;
}

function allureCommand(): { cmd: string; shell: boolean } {
  const bin = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'allure.cmd' : 'allure');
  return { cmd: bin, shell: process.platform === 'win32' };
}

export function openFile(file: string): void {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', file]] : process.platform === 'darwin' ? ['open', [file]] : ['xdg-open', [file]];
  try { spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref(); } catch { /* the path is printed anyway */ }
}

/** Builds results/run_<time>/allure-report/index.html. Returns the path, or '' when nothing could be built (a message is printed). */
export function buildAllureReport(runDir: string, opts: { open?: boolean; log?: (s: string) => void } = {}): string {
  const log = opts.log ?? console.log;
  const results = path.join(runDir, 'allure-results');
  if (!fs.existsSync(results) || fs.readdirSync(results).filter((f) => f.endsWith('-result.json')).length === 0) {
    log(`Allure report: no results found in ${results}. Run the tests first (npm test).`);
    return '';
  }
  try {
    const n = prepareResults(runDir);
    const out = path.join(runDir, 'allure-report');
    fs.rmSync(out, { recursive: true, force: true });
    const { cmd, shell } = allureCommand();
    const r = spawnSync(cmd, ['awesome', results, '-o', out, '--single-file', '--report-name', `Testable E2E - ${path.basename(runDir)}`], { shell, encoding: 'utf8', cwd: ROOT });
    const html = path.join(out, 'index.html');
    if (r.status !== 0 || !fs.existsSync(html)) {
      log(`Allure report could not be built (${(r.stderr || r.stdout || r.error?.message || 'unknown error').toString().split('\n').filter(Boolean).slice(-3).join(' | ')}).`);
      return '';
    }
    log(`\n  Allure report (${n} module(s), every case with its screenshot): ${html}`);
    if (opts.open) openFile(html);
    return html;
  } catch (e) {
    log(`Allure report could not be built: ${(e as Error).message}`);
    return '';
  }
}
