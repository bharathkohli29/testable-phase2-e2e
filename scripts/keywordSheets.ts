import * as ExcelJS from 'exceljs';
import { DATASET_HEADERS, KEYWORD_DATASETS, KEYWORD_STEPS, STEP_HEADERS } from './data/keywordData';

const key = (s: unknown): string => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const text = (v: ExcelJS.CellValue): string => {
  if (v == null) return '';
  if (typeof v === 'object') {
    const o = v as { richText?: Array<{ text: string }>; text?: unknown };
    return o.richText ? o.richText.map((r) => r.text).join('') : String(o.text ?? '');
  }
  return String(v);
};

function headerStyle(ws: ExcelJS.Worksheet, widths: number[]): void {
  const r = ws.getRow(1);
  r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
  r.alignment = { vertical: 'middle', wrapText: true };
  r.height = 24;
  ws.columns = widths.map((width) => ({ width }));
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

/**
 * Makes sure the workbook has the "Keyword Steps" and "Datasets" sheets and the seed rows of the sample keyword cases.
 * Rows that are already there are never changed: a TC ID that has ANY step row keeps exactly the rows it has, and a data set name
 * that exists keeps its rows. Returns what was added.
 */
export function ensureKeywordSheets(wb: ExcelJS.Workbook): { stepRows: number; datasetRows: number } {
  let stepRows = 0;
  let datasetRows = 0;

  let steps = wb.worksheets.find((w) => key(w.name) === key('Keyword Steps'));
  if (!steps) {
    steps = wb.addWorksheet('Keyword Steps');
    steps.addRow(STEP_HEADERS);
    headerStyle(steps, [12, 7, 18, 30, 34, 34, 52, 16, 7]);
  }
  const haveTc = new Set<string>();
  steps.eachRow((row, n) => n > 1 && haveTc.add(text(row.getCell(1).value).trim()));
  for (const r of KEYWORD_STEPS) {
    if (haveTc.has(r[0])) continue;
    const row = steps.addRow([r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], 'Y']);
    row.alignment = { vertical: 'top', wrapText: true };
    row.getCell(9).dataValidation = { type: 'list', allowBlank: false, formulae: ['"Y,N"'] };
    row.getCell(8).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Y,N"'] };
    stepRows++;
  }

  let ds = wb.worksheets.find((w) => key(w.name) === key('Datasets'));
  if (!ds) {
    ds = wb.addWorksheet('Datasets');
    ds.addRow(DATASET_HEADERS);
    headerStyle(ds, [22, 26, 22, 22, 7]);
  }
  const haveSet = new Set<string>();
  ds.eachRow((row, n) => n > 1 && haveSet.add(text(row.getCell(1).value).trim()));
  for (const r of KEYWORD_DATASETS) {
    if (haveSet.has(r[0])) continue;
    ds.addRow([r[0], r[1], r[2], r[3], 'Y']).getCell(5).dataValidation = { type: 'list', allowBlank: false, formulae: ['"Y,N"'] };
    datasetRows++;
  }
  return { stepRows, datasetRows };
}
