import { readTable, sheetExists, SECRET_KEY } from '../excel/readInput';

export const STEPS_SHEET = 'Keyword Steps';
export const DATASETS_SHEET = 'Datasets';

/** One row of the "Keyword Steps" sheet: what to do, on which object, with which data, and what to expect. */
export interface KeywordStep {
  tcId: string;
  /** Step number as written in the sheet (used to order and to name checkpoint pictures). */
  step: string;
  keyword: string;
  object: string;
  data: string;
  expected: string;
  /** Optional sentence for the Actual Result column; a readable one is made when blank. */
  description: string;
  /** Y = also save a full picture of the page after this step (evidence/steps/<TC ID>_<step>.png). */
  checkpoint: boolean;
  rowNumber: number;
}

/** One row of the "Datasets" sheet: the values of ONE run of a case (for example one Python version / branch). */
export interface DatasetRow {
  dataset: string;
  label: string;
  values: Record<string, string>;
  rowNumber: number;
}

const isNo = (v: string): boolean => /^(n|no|false|0|skip)$/i.test(v.trim());

/** Reads the "Keyword Steps" sheet, grouped by TC ID, in step order. A missing sheet means no keyword cases. */
export function loadKeywordSteps(): Map<string, KeywordStep[]> {
  const out = new Map<string, KeywordStep[]>();
  if (!sheetExists(STEPS_SHEET)) return out;
  for (const r of readTable(STEPS_SHEET)) {
    const tcId = (r.tcid ?? '').trim();
    if (!tcId || isNo(r.run ?? '')) continue;
    const list = out.get(tcId) ?? [];
    list.push({
      tcId,
      step: (r.step ?? '').trim() || String(list.length + 1),
      keyword: (r.keyword ?? '').trim(),
      object: (r.object ?? '').trim(),
      data: r.data ?? '',
      expected: r.expected ?? '',
      description: r.description ?? '',
      checkpoint: /^(y|yes|true|1)$/i.test((r.checkpoint ?? '').trim()),
      rowNumber: Number(r.__row),
    });
    out.set(tcId, list);
  }
  for (const list of out.values()) list.sort((a, b) => Number(a.step) - Number(b.step) || a.rowNumber - b.rowNumber);
  return out;
}

/** Reads the "Datasets" sheet: column "Dataset" names the group, "Label" names the row, every other column is a value ({{ds.column}}). */
export function loadDatasets(): Map<string, DatasetRow[]> {
  const out = new Map<string, DatasetRow[]>();
  if (!sheetExists(DATASETS_SHEET)) return out;
  for (const r of readTable(DATASETS_SHEET)) {
    const dataset = (r.dataset ?? '').trim();
    if (!dataset || isNo(r.run ?? '')) continue;
    const values: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) {
      if (['__row', 'dataset', 'label', 'run'].includes(k)) continue;
      if (SECRET_KEY.test(k)) throw new Error(`Datasets sheet, row ${r.__row}: column "${k}" looks like a secret. Passwords and keys are never put into data sets.`);
      values[k] = v;
    }
    const list = out.get(dataset) ?? [];
    list.push({ dataset, label: (r.label ?? '').trim() || `row ${list.length + 1}`, values, rowNumber: Number(r.__row) });
    out.set(dataset, list);
  }
  return out;
}
