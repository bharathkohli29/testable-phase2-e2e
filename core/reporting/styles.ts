import * as ExcelJS from 'exceljs';

/** One look for every workbook this project writes (template, input write-back, run copy). */
export const FONT = 'Segoe UI';

export const C = {
  navy: 'FF1F2A44', // header
  white: 'FFFFFFFF',
  ink: 'FF1F2937', // body text
  muted: 'FF667085',
  line: 'FFD0D5DD', // borders
  band: 'FFF8FAFC', // zebra row
  groupFill: 'FFE0E7FF', // Input sheet group headings
  groupInk: 'FF1E3A8A',
  fillMe: 'FFFEF3C7', // cells the user must fill in
  green: 'FF05603A',
  red: 'FFB42318',
  amber: 'FFB54708',
};

export const STATUS: Record<string, { fill: string; font: string }> = {
  PASS: { fill: 'FFD1FADF', font: C.green },
  FAIL: { fill: 'FFFEE4E2', font: C.red },
  SKIPPED: { fill: 'FFFEF0C7', font: C.amber },
  'NOT RUN': { fill: 'FFF2F4F7', font: 'FF475467' },
};

const side = { style: 'thin' as const, color: { argb: C.line } };
const BORDER: Partial<ExcelJS.Borders> = { top: side, left: side, bottom: side, right: side };
const solid = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const key = (s: unknown): string => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Gives the cell its own, fresh style object (ExcelJS may share one object between cells of a column). */
function paint(
  cell: ExcelJS.Cell,
  style: { font?: Partial<ExcelJS.Font>; fill?: ExcelJS.Fill; border?: Partial<ExcelJS.Borders>; alignment?: Partial<ExcelJS.Alignment> },
): void {
  cell.style = JSON.parse(JSON.stringify(style)) as ExcelJS.Style;
}

export function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value as unknown;
  if (v == null) return '';
  if (typeof v === 'object') {
    const o = v as { richText?: Array<{ text: string }>; text?: unknown; result?: unknown };
    if (o.richText) return o.richText.map((r) => r.text).join('');
    if (o.text != null) return String(o.text);
    if (o.result != null) return String(o.result);
    return '';
  }
  return String(v);
}

/** Actual Result text -> coloured lines: ✔ green, ✘ red, • grey. */
export function actualRichText(text: string): ExcelJS.CellRichTextValue {
  const lines = text.split('\n');
  return {
    richText: lines.map((line, i) => {
      const color = line.startsWith('✔') ? C.green : line.startsWith('✘') ? C.red : C.muted;
      return {
        text: i < lines.length - 1 ? `${line}\n` : line,
        font: { name: FONT, size: 10, color: { argb: color }, bold: line.startsWith('✘') },
      };
    }),
  };
}

/** Rough wrapped-text height in points for a cell in a column of the given width. */
function textHeight(text: string, colWidth: number): number {
  if (!text) return 0;
  const perLine = Math.max(8, Math.floor(colWidth * 1.05));
  const lines = text.split('\n').reduce((n, p) => n + Math.max(1, Math.ceil(p.length / perLine)), 0);
  return lines * 13.5 + 8;
}

const CASE_WIDTHS: Record<string, number> = {
  tcid: 17, testcasename: 36, module: 10, submodule: 12, preconditions: 32, teststeps: 46,
  testdata: 36, expectedresult: 48, run: 7, actualresult: 62, result: 12, screenshotevidence: 40, executedat: 21,
};
const CENTERED = new Set(['module', 'submodule', 'run', 'result', 'executedat']);

/** Header, widths, fonts, borders, zebra rows, status colours and row heights for a test-case sheet. */
export function beautifyCaseSheet(ws: ExcelJS.Worksheet): void {
  const cols: Record<string, number> = {};
  ws.getRow(1).eachCell((cell, n) => (cols[key(cell.value)] = n));
  const colOf = (k: string) => cols[k] || 0;

  // header
  const head = ws.getRow(1);
  head.height = 32;
  head.eachCell((cell) => {
    paint(cell, {
      font: { name: FONT, size: 10, bold: true, color: { argb: C.white } },
      fill: solid(C.navy),
      alignment: { vertical: 'middle', horizontal: 'center', wrapText: true },
      border: BORDER,
    });
  });
  for (const [k, w] of Object.entries(CASE_WIDTHS)) if (colOf(k)) ws.getColumn(colOf(k)).width = w;

  const idCol = colOf('tcid');
  const shotCol = colOf('screenshotevidence');
    if (!idCol) return;

  let seq = 0;
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (!cellText(row.getCell(idCol)).trim()) continue;
    seq++;
    let need = 0;

    row.eachCell({ includeEmpty: true }, (cell, n) => {
      if (n > head.cellCount) return;
      const name = Object.keys(cols).find((k) => cols[k] === n) || '';
      const st = name === 'result' ? STATUS[cellText(cell).trim().toUpperCase()] : undefined;
      paint(cell, {
        font: { name: FONT, size: 10, bold: n === idCol || !!st, color: { argb: st ? st.font : C.ink } },
        fill: solid(st ? st.fill : seq % 2 === 0 ? C.band : C.white),
        border: BORDER,
        alignment: { vertical: 'top', horizontal: CENTERED.has(name) ? 'center' : 'left', wrapText: true },
      });
      if (n !== shotCol) need = Math.max(need, textHeight(cellText(cell), ws.getColumn(n).width || 12));
    });

    const hasShot = !!shotCol && !!cellText(row.getCell(shotCol)).trim();
    if (shotCol) {
      const cell = row.getCell(shotCol);
      paint(cell, {
        font: { name: FONT, size: 8, color: { argb: 'FF2563EB' }, underline: true },
        fill: solid(seq % 2 === 0 ? C.band : C.white),
        border: BORDER,
        alignment: { vertical: 'bottom', horizontal: 'left', wrapText: false },
      });
    }
    row.height = Math.min(409, Math.max(hasShot ? 124 : 30, need));
  }
}

/** Input sheet: banner rows for groups, bold keys, grey notes, yellow cells to fill in. */
export function beautifyInputSheet(ws: ExcelJS.Worksheet): void {
  ws.getColumn(1).width = 30;
  ws.getColumn(2).width = 48;
  ws.getColumn(3).width = 90;

  const head = ws.getRow(1);
  head.height = 28;
  head.eachCell((cell) => {
    paint(cell, {
      font: { name: FONT, size: 10, bold: true, color: { argb: C.white } },
      fill: solid(C.navy),
      alignment: { vertical: 'middle', horizontal: 'left' },
      border: BORDER,
    });
  });

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const k = cellText(row.getCell(1)).trim();
    if (!k) continue;
    const isGroup = k.startsWith('#');
    for (let n = 1; n <= 3; n++) {
      const cell = row.getCell(n);
      const alignment = { vertical: 'middle' as const, wrapText: n === 3, horizontal: 'left' as const };
      if (isGroup) {
        paint(cell, { font: { name: FONT, size: 10, bold: true, color: { argb: C.groupInk } }, fill: solid(C.groupFill), border: BORDER, alignment });
      } else if (n === 1) {
        paint(cell, { font: { name: FONT, size: 10, bold: true, color: { argb: C.ink } }, fill: solid(C.white), border: BORDER, alignment });
      } else if (n === 2) {
        const fillMe = /(EMAIL|PASSWORD|ACCESS_KEY|SECRET|USERNAME)/i.test(k) && !/(DOMAIN)/i.test(k);
        paint(cell, { font: { name: FONT, size: 10, color: { argb: C.ink } }, fill: solid(fillMe ? C.fillMe : C.white), border: BORDER, alignment });
      } else {
        paint(cell, { font: { name: FONT, size: 9, italic: true, color: { argb: C.muted } }, fill: solid(C.white), border: BORDER, alignment });
      }
    }
    row.height = isGroup ? 24 : Math.max(22, textHeight(cellText(row.getCell(3)), 90));
  }
}

/** Summary sheet written for each run. */
export function styleSummary(ws: ExcelJS.Worksheet, firstTableRow: number): void {
  ws.getColumn(1).width = 20;
  for (let n = 2; n <= 6; n++) ws.getColumn(n).width = 12;
  ws.getCell('A1').font = { name: FONT, size: 16, bold: true, color: { argb: C.navy } };
  ws.getRow(1).height = 28;
  for (const r of [2, 3]) {
    ws.getCell(`A${r}`).font = { name: FONT, size: 10, bold: true, color: { argb: C.muted } };
    ws.getCell(`B${r}`).font = { name: FONT, size: 10, color: { argb: C.ink } };
  }
  const head = ws.getRow(firstTableRow);
  head.height = 24;
  head.eachCell((cell) => {
    paint(cell, {
      font: { name: FONT, size: 10, bold: true, color: { argb: C.white } },
      fill: solid(C.navy),
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: BORDER,
    });
  });
  for (let r = firstTableRow + 1; r <= ws.rowCount; r++) {
    const total = String(ws.getCell(`A${r}`).value) === 'TOTAL';
    const num = (col: string) => Number(ws.getCell(`${col}${r}`).value) || 0;
    const colour: Record<number, string> = {};
    if (num('C') > 0) colour[3] = C.green;
    if (num('D') > 0) colour[4] = C.red;
    if (num('E') > 0) colour[5] = C.amber;
    for (let n = 1; n <= 6; n++) {
      paint(ws.getRow(r).getCell(n), {
        font: { name: FONT, size: 10, bold: total || n in colour, color: { argb: colour[n] || C.ink } },
        fill: solid(total ? STATUS['NOT RUN'].fill : C.white),
        border: BORDER,
        alignment: { horizontal: n <= 1 ? 'left' : 'center', vertical: 'middle' },
      });
    }
  }
}
