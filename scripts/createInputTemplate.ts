/**
 * Creates input/testable-input.xlsx (sheets: Input + one per module: Login, Repo).
 *   npm run template            -> refuses to overwrite an existing workbook (it holds your credentials)
 *   npm run template -- --force -> overwrite
 */
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { beautifyCaseSheet, beautifyInputSheet } from '../core/reporting/styles';
import { INPUT_ROWS } from './data/inputRows';
import { SHEETS } from './data/sheets';
import { ensureKeywordSheets } from './keywordSheets';

const OUT = path.resolve(__dirname, '..', 'input', 'testable-input.xlsx');
if (fs.existsSync(OUT) && !process.argv.includes('--force')) {
  console.log(`Already exists: ${OUT}\nNot overwritten (it may hold your credentials). Use --force to recreate it.`);
  process.exit(0);
}

const HEAD_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
const GROUP_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
const FILL_ME: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };

function header(ws: ExcelJS.Worksheet): void {
  const r = ws.getRow(1);
  r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  r.fill = HEAD_FILL;
  r.alignment = { vertical: 'middle', wrapText: true };
  r.height = 24;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

const wb = new ExcelJS.Workbook();

// ───────────── Input sheet ─────────────
const inp = wb.addWorksheet('Input');
inp.addRow(['Key', 'Value', 'Notes']);
header(inp);
inp.columns = [{ width: 28 }, { width: 46 }, { width: 80 }];

for (const [k, v, note, fillMe] of INPUT_ROWS) {
  const row = inp.addRow([k, v, note]);
  if (k.startsWith('#')) {
    row.font = { bold: true };
    row.eachCell((c) => (c.fill = GROUP_FILL));
  } else if (fillMe) {
    row.getCell(2).fill = FILL_ME;
  }
}
const rowOf = (key: string) => INPUT_ROWS.findIndex((r) => r[0] === key) + 2;
inp.getCell(`B${rowOf('ENV')}`).dataValidation = { type: 'list', allowBlank: false, formulae: ['"QA,DEV"'] };
inp.getCell(`B${rowOf('WRITE_RESULTS_TO_INPUT')}`).dataValidation = { type: 'list', allowBlank: false, formulae: ['"Y,N"'] };
inp.getCell(`B${rowOf('HEADLESS')}`).dataValidation = { type: 'list', allowBlank: false, formulae: ['"Y,N"'] };
inp.getColumn(3).alignment = { wrapText: true, vertical: 'top' };

// ───────────── module sheets (Login, Repo, ...) ─────────────
const COLS: Array<[string, number]> = [
  ['TC ID', 16], ['Test Case Name', 38], ['Module', 10], ['Sub Module', 12], ['Preconditions', 34],
  ['Test Steps', 48], ['Test Data', 38], ['Expected Result', 52], ['Run', 7],
  ['Actual Result', 60], ['Result', 12], ['Screenshot Evidence', 38], ['Executed At', 20],
];
const caseSheets: ExcelJS.Worksheet[] = [];
for (const sheet of SHEETS) {
  const ws = wb.addWorksheet(sheet.name);
  ws.addRow(COLS.map(([n]) => n));
  header(ws);
  ws.columns = COLS.map(([, width]) => ({ width }));
  for (const c of sheet.cases) {
    const row = ws.addRow([c.id, c.name, sheet.name, c.subModule, c.pre, c.steps, c.data, c.expected, 'Y', '', '', '', '']);
    row.alignment = { wrapText: true, vertical: 'top' };
  }
  ws.getColumn(9).alignment = { horizontal: 'center', vertical: 'top' };
  for (let r = 2; r <= ws.rowCount; r++) ws.getCell(`I${r}`).dataValidation = { type: 'list', allowBlank: false, formulae: ['"Y,N"'] };
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];
  ws.autoFilter = { from: 'A1', to: { row: 1, column: COLS.length } };
  caseSheets.push(ws);
}

beautifyInputSheet(inp);
for (const ws of caseSheets) beautifyCaseSheet(ws);
ensureKeywordSheets(wb);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
wb.xlsx.writeFile(OUT).then(() => console.log(`Created ${OUT}\nPut the branch link on the Input sheet (yellow cell) and your accounts / URLs in the .env file (see .env.example), then run: npm test`));
