import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { INPUT_FILE, RECORDS_DIR, RESULTS_XLSX, RUN_DIR, RUN_ID } from '../paths';
import { CaseRecord } from '../types';
import { actualRichText, beautifyCaseSheet, beautifyInputSheet, styleSummary } from './styles';

const key = (s: unknown): string => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const SECRET_KEY = /(PASSWORD|SECRET|TOKEN|ACCESS_KEY|API_KEY)/i;

interface WriteOptions {
  dest: string;
  /** Run copy: blank out passwords/keys, rows not run in this run show NOT RUN, add a Summary sheet. */
  runCopy: boolean;
}

function stamp(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function readRecords(): CaseRecord[] {
  if (!fs.existsSync(RECORDS_DIR)) return [];
  return fs
    .readdirSync(RECORDS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(RECORDS_DIR, f), 'utf8')) as CaseRecord);
}

/** The results copy must not carry real passwords / keys. */
function maskSecrets(ws: ExcelJS.Worksheet): void {
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const k = String(row.getCell(1).value ?? '');
    const v = row.getCell(2);
    if (SECRET_KEY.test(k) && v.value) v.value = '********';
  });
}

function columnOf(ws: ExcelJS.Worksheet, name: string): number {
  let found = 0;
  ws.getRow(1).eachCell((cell, n) => {
    if (key(cell.value) === key(name)) found = n;
  });
  return found;
}

/** Removes embedded screenshots from one column (all rows, or only the given rows) so re-runs don't stack images. */
function clearImages(ws: ExcelJS.Worksheet, shotCol: number, rows: Set<number> | 'all'): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = ws as any;
  if (!Array.isArray(w._media)) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  w._media = w._media.filter((m: any) => {
    const tl = m?.range?.tl;
    if (!tl) return true;
    const col = Math.floor(tl.nativeCol ?? tl.col ?? -1);
    const row = Math.floor(tl.nativeRow ?? tl.row ?? -1) + 1;
    if (col !== shotCol - 1) return true;
    return rows === 'all' ? false : !rows.has(row);
  });
}

function fillSheet(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, records: Map<string, CaseRecord>, opt: WriteOptions): void {
  const c = {
    id: columnOf(ws, 'TC ID'),
    actual: columnOf(ws, 'Actual Result'),
    result: columnOf(ws, 'Result'),
    shot: columnOf(ws, 'Screenshot Evidence'),
    at: columnOf(ws, 'Executed At'),
  };
  if (!c.id || !c.actual || !c.result) return;

  // which rows get new results from this run
  const touched = new Set<number>();
  for (let r = 2; r <= ws.rowCount; r++) {
    const id = String(ws.getCell(r, c.id).value ?? '').trim();
    if (id && records.has(id)) touched.add(r);
  }
  if (c.shot) clearImages(ws, c.shot, opt.runCopy ? 'all' : touched);

  for (let r = 2; r <= ws.rowCount; r++) {
    const id = String(ws.getCell(r, c.id).value ?? '').trim();
    if (!id) continue;
    const rec = records.get(id);

    if (!rec) {
      if (!opt.runCopy) continue; // input workbook: keep what an earlier run wrote
      ws.getCell(r, c.actual).value = '';
      if (c.at) ws.getCell(r, c.at).value = '';
      if (c.shot) ws.getCell(r, c.shot).value = '';
    }

    const status = rec ? rec.result : 'NOT RUN';
    if (rec) {
      ws.getCell(r, c.actual).value = rec.actual ? actualRichText(rec.actual) : '';
      if (c.at) ws.getCell(r, c.at).value = stamp(rec.executedAt);
    }

    ws.getCell(r, c.result).value = status;

    if (rec && c.shot) {
      const shotCell = ws.getCell(r, c.shot);
      shotCell.value = null;
      const file = rec.screenshot ? path.join(RUN_DIR, rec.screenshot) : '';
      if (file && fs.existsSync(file)) {
        const rel = path.relative(path.dirname(opt.dest), file).split(path.sep).join('/');
        shotCell.value = { text: path.basename(file), hyperlink: rel };
        const img = wb.addImage({ filename: file, extension: 'png' });
        ws.addImage(img, { tl: { col: c.shot - 1 + 0.05, row: r - 1 + 0.05 }, ext: { width: 240, height: 150 }, editAs: 'oneCell' });
      }
    }
  }
}

function addSummary(wb: ExcelJS.Workbook, records: CaseRecord[]): void {
  const ws = wb.addWorksheet('Summary');
  ws.addRow(['Test run summary']);
  ws.addRow(['Run ID', RUN_ID]);
  ws.addRow(['Input workbook', path.basename(INPUT_FILE)]);
  ws.addRow([]);
  const tableRow = ws.rowCount + 1;
  ws.addRow(['Module', 'Total', 'PASS', 'FAIL', 'SKIPPED', 'Pass rate']);

  // One row per module (sheet), in flow order - no sub-module split.
  const order = ['login', 'repo', 'coverage', 'plan', 'execution', 'confidence', 'graph', 'object', 'commit', 'dashboard', 'signup', 'assistant', 'context', 'account', 'support', 'redirects'];
  const groups = new Map<string, CaseRecord[]>();
  for (const r of records) groups.set(r.sheet, [...(groups.get(r.sheet) ?? []), r]);
  const rank = (s: string) => { const i = order.indexOf(s.toLowerCase()); return i < 0 ? order.length : i; };
  const rate = (pass: number, skip: number, n: number) => (n - skip > 0 ? `${Math.round((pass / (n - skip)) * 100)}%` : '-');
  const total = { n: 0, pass: 0, fail: 0, skip: 0 };
  for (const [sheet, list] of [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0]))) {
    const pass = list.filter((r) => r.result === 'PASS').length;
    const fail = list.filter((r) => r.result === 'FAIL').length;
    const skip = list.filter((r) => r.result === 'SKIPPED').length;
    ws.addRow([sheet, list.length, pass, fail, skip, rate(pass, skip, list.length)]);
    total.n += list.length; total.pass += pass; total.fail += fail; total.skip += skip;
  }
  ws.addRow(['TOTAL', total.n, total.pass, total.fail, total.skip, rate(total.pass, total.skip, total.n)]);
  styleSummary(ws, tableRow);
}

async function writeWorkbook(records: CaseRecord[], opt: WriteOptions): Promise<void> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(INPUT_FILE);

  const bySheet = new Map<string, Map<string, CaseRecord>>();
  for (const r of records) {
    const k = key(r.sheet);
    if (!bySheet.has(k)) bySheet.set(k, new Map());
    bySheet.get(k)!.set(r.id, r);
  }

  for (const ws of [...wb.worksheets]) {
    if (key(ws.name) === 'input') {
      if (opt.runCopy) maskSecrets(ws);
      beautifyInputSheet(ws);
    } else if (key(ws.name) === 'summary') {
      if (opt.runCopy) wb.removeWorksheet(ws.id);
    } else if (bySheet.has(key(ws.name))) {
      fillSheet(wb, ws, bySheet.get(key(ws.name))!, opt);
      beautifyCaseSheet(ws);
    }
  }
  if (opt.runCopy) addSummary(wb, records);

  fs.mkdirSync(path.dirname(opt.dest), { recursive: true });
  const tmp = `${opt.dest}.tmp`;
  fs.rmSync(tmp, { force: true }); // a leftover from an earlier failed write
  await wb.xlsx.writeFile(tmp);
  try {
    fs.renameSync(tmp, opt.dest);
  } catch (e) {
    fs.rmSync(tmp, { force: true }); // never leave the half-written copy behind
    throw e;
  }
}

let warnedInputLocked = false;

/**
 * Rebuilds the results from every record written so far in this run. Called after EVERY test case
 * (so it also works from VS Code's Test Explorer, which skips global teardown) and once more at the end.
 *   1. results/run_<time>/testable-results.xlsx  – this run only, secrets masked, plus Summary
 *   2. the input workbook itself (unless WRITE_RESULTS_TO_INPUT = N) – Actual Result / Result / screenshot / time
 * A problem here (e.g. the workbook is open in Excel) is reported but never fails a test.
 */
export async function refreshResults(writeToInput: boolean): Promise<void> {
  const records = readRecords();
  if (records.length === 0) return;

  try {
    await writeWorkbook(records, { dest: RESULTS_XLSX, runCopy: true });
  } catch (e) {
    console.warn(`  ⚠ Could not write ${RESULTS_XLSX}: ${(e as Error).message}`);
  }
  if (writeToInput) {
    try {
      await writeWorkbook(records, { dest: INPUT_FILE, runCopy: false });
    } catch (e) {
      if (!warnedInputLocked) {
        warnedInputLocked = true; // say it once per run, not after every test
        console.warn(
          `  ⚠ Could not write results into ${INPUT_FILE} - it is open in Excel (or read-only). Close it and run again.\n` +
            `    This run's results are still saved in ${RESULTS_XLSX}. (${(e as Error).message})`,
        );
      }
    }
  }
}
