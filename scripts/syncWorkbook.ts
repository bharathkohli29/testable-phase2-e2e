/**
 * npm run sync
 * Brings an EXISTING input/testable-input.xlsx up to date with the project, without touching your values:
 *   - Input sheet: adds keys that are missing (your existing values are never changed)
 *   - Module sheets (Login, Repo): add test case rows that are missing; refreshes the text of rows marked "overwrite"
 *     (Google / Microsoft / GitHub / SSO) only while they have never been executed
 * Close the workbook in Excel first.
 */
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import { INPUT_FILE } from '../core/paths';
import { beautifyCaseSheet, beautifyInputSheet } from '../core/reporting/styles';
import { INPUT_ROWS } from './data/inputRows';
import { RETIRED_SHEETS, SHEETS } from './data/sheets';
import { ensureKeywordSheets } from './keywordSheets';

const key = (s: unknown): string => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const text = (v: ExcelJS.CellValue): string => {
  if (v == null) return '';
  if (typeof v === 'object') {
    const o = v as { richText?: Array<{ text: string }>; text?: unknown };
    return o.richText ? o.richText.map((r) => r.text).join('') : String(o.text ?? '');
  }
  return String(v);
};

/** `npm run sync -- --refresh-text`: also rewrites the TEXT columns (name, steps, expected ...) of rows that were already executed. Results, Actual Result, Run and evidence are never touched. */
const REFRESH_TEXT = process.argv.includes('--refresh-text');

async function main(): Promise<void> {
  if (!fs.existsSync(INPUT_FILE)) {
    console.log(`No workbook at ${INPUT_FILE} - run "npm run template" first.`);
    return;
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(INPUT_FILE);

  // ── Input sheet: add missing keys ──
  const inp = wb.worksheets.find((w) => key(w.name) === 'input');
  let addedKeys = 0;
  if (inp) {
    const have = new Set<string>();
    inp.eachRow((row, n) => n > 1 && have.add(text(row.getCell(1).value).trim().toUpperCase()));
    for (const [k, v, note] of INPUT_ROWS) {
      if (k.startsWith('#') || have.has(k.toUpperCase())) continue;
      inp.addRow([k, v, note]);
      addedKeys++;
    }
    beautifyInputSheet(inp);
  }

  let removed = 0;
  // ── sheets that were dropped on purpose are deleted ──
  for (const w of [...wb.worksheets]) {
    if (RETIRED_SHEETS.some((n) => key(n) === key(w.name))) { wb.removeWorksheet(w.id); removed++; }
  }

  // ── module sheets (Login, Repo, ...): add / refresh rows ──
  let added = 0;
  let refreshed = 0;
  for (const sheet of SHEETS) {
    let login = wb.worksheets.find((w) => key(w.name) === key(sheet.name));
    if (!login) {
      // a sheet for a new module: copy the header row of an existing module sheet
      const model = wb.worksheets.find((w) => SHEETS.some((x) => key(x.name) === key(w.name)));
      if (!model) continue;
      login = wb.addWorksheet(sheet.name);
      model.getRow(1).eachCell((c, n) => (login!.getCell(1, n).value = c.value));
      login.columns = model.columns.map((c) => ({ width: c.width }));
      login.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];
    }
    const col: Record<string, number> = {};
    login.getRow(1).eachCell((c, n) => (col[key(c.value)] = n));
    const need = ['tcid', 'testcasename', 'module', 'submodule', 'preconditions', 'teststeps', 'testdata', 'expectedresult', 'run', 'result'];
    const missing = need.filter((k) => !col[k]);
    if (missing.length) throw new Error(`${sheet.name} sheet is missing columns: ${missing.join(', ')}`);


    const rowOf = new Map<string, number>();
    for (let r = 2; r <= login.rowCount; r++) rowOf.set(text(login.getCell(r, col.tcid).value).trim(), r);

    for (const c of sheet.cases) {
      const r = rowOf.get(c.id);
      if (!r) {
        const row = login.addRow([]);
        row.getCell(col.tcid).value = c.id;
        row.getCell(col.testcasename).value = c.name;
        row.getCell(col.module).value = sheet.name;
        row.getCell(col.submodule).value = c.subModule;
        row.getCell(col.preconditions).value = c.pre;
        row.getCell(col.teststeps).value = c.steps;
        row.getCell(col.testdata).value = c.data;
        row.getCell(col.expectedresult).value = c.expected;
        row.getCell(col.run).value = 'Y';
        row.getCell(col.run).dataValidation = { type: 'list', allowBlank: false, formulae: ['"Y,N"'] };
        added++;
        continue;
      }
      const executed = !['', 'NOT RUN'].includes(text(login.getCell(r, col.result).value).trim().toUpperCase());
      if (c.overwrite && (!executed || REFRESH_TEXT)) {
        login.getCell(r, col.testcasename).value = c.name;
        login.getCell(r, col.submodule).value = c.subModule;
        login.getCell(r, col.preconditions).value = c.pre;
        login.getCell(r, col.teststeps).value = c.steps;
        login.getCell(r, col.testdata).value = c.data;
        login.getCell(r, col.expectedresult).value = c.expected;
        refreshed++;
      }
    }
    beautifyCaseSheet(login);
  }

  // ── keyword-driven sheets: "Keyword Steps" and "Datasets" (existing rows are never changed) ──
  const kw = ensureKeywordSheets(wb);

  const tmp = `${INPUT_FILE}.tmp`;
  await wb.xlsx.writeFile(tmp);
  try {
    fs.renameSync(tmp, INPUT_FILE);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`Could not replace ${INPUT_FILE} - is it open in Excel? Close it and run again. (${(e as Error).message})`);
  }
  console.log(`Workbook updated: ${added} test case rows added, ${refreshed} refreshed, ${removed} sheet(s) removed, ${addedKeys} Input keys added, ${kw.stepRows} keyword step rows and ${kw.datasetRows} data set rows added. Your values were not changed.`);
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
