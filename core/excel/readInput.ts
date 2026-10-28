import * as XLSX from 'xlsx';
import * as fs from 'fs';
import { INPUT_FILE } from '../paths';
import { CREDENTIALS, credentialFromEnv, loadDotEnv } from '../env';
import { registerSecretValues } from '../secrets';
import { EnvName, InputConfig, TestCaseRow } from '../types';

const norm = (v: unknown): string => String(v ?? '').trim();
/** Keys that hold secrets (also masked in the results workbook). */
export const SECRET_KEY = /(PASSWORD|SECRET|TOKEN|ACCESS_KEY|API_KEY)/i;
const key = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function openWorkbook(): XLSX.WorkBook {
  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(`Input workbook not found: ${INPUT_FILE}\nCreate it first with:  npm run template`);
  }
  return XLSX.readFile(INPUT_FILE);
}

function sheetRows(wb: XLSX.WorkBook, name: string): unknown[][] {
  const real = wb.SheetNames.find((n) => key(n) === key(name));
  if (!real) throw new Error(`Sheet "${name}" not found in ${INPUT_FILE}. Sheets present: ${wb.SheetNames.join(', ')}`);
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[real], { header: 1, defval: '', blankrows: false });
}

/** Reads the "Input" sheet (columns: Key | Value | Notes). Keys starting with # are group headings. */
export function loadInput(): InputConfig {
  const rows = sheetRows(openWorkbook(), 'Input');
  const raw: Record<string, string> = {};
  for (const r of rows.slice(1)) {
    const k = norm(r[0]);
    if (k && !k.startsWith('#')) raw[k.toUpperCase()] = norm(r[1]);
  }

  // `npm run test:branches` runs one branch per run and hands it over here (the Input sheet stays untouched).
  if (process.env.BRANCHES_OVERRIDE) raw.BRANCHES = process.env.BRANCHES_OVERRIDE;
  if (process.env.REPO_OVERRIDE) raw.REPO = process.env.REPO_OVERRIDE;
  if (process.env.WRITE_RESULTS_TO_INPUT_OVERRIDE) raw.WRITE_RESULTS_TO_INPUT = process.env.WRITE_RESULTS_TO_INPUT_OVERRIDE;

  // Credentials (e-mail, password, AWS keys) come from the file .env (or real environment variables) - see core/env.ts.
  // A value there always wins. A credential that is still typed into the Input sheet is used only when .env has none, and is reported
  // by the Input sheet check so it can be moved.
  loadDotEnv();
  const sheetCredentials: string[] = [];
  for (const k of Object.keys(CREDENTIALS)) {
    const fromEnv = credentialFromEnv(k);
    const typedInSheet = !!raw[k] && /(EMAIL|PASSWORD|SECRET|TOKEN|ACCESS_KEY)/.test(k);
    if (typedInSheet) sheetCredentials.push(k);
    if (fromEnv !== undefined) raw[k] = fromEnv;
  }
  registerSecretValues(Object.keys(CREDENTIALS).filter((k) => /(EMAIL|PASSWORD|SECRET|TOKEN|ACCESS_KEY)/.test(k)).map((k) => raw[k] ?? ''));
  // any other secret-looking key of the sheet can also be given by a same-named environment variable
  for (const k of Object.keys(raw)) {
    if (SECRET_KEY.test(k) && process.env[k] && !(k in CREDENTIALS)) raw[k] = String(process.env[k]).trim();
  }

  const envName = (raw.ENV || 'QA').toUpperCase();
  if (envName !== 'QA' && envName !== 'DEV') throw new Error(`Input sheet: ENV must be QA or DEV (got "${raw.ENV}")`);
  const env = envName as EnvName;

  const get = (name: string): string => {
    const n = name.toUpperCase();
    return raw[n] ?? raw[`${env}_${n}`] ?? '';
  };
  const resolve = (text: string): string => text.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_m, k: string) => get(k));

  const baseUrl = get('BASE_URL').replace(/\/+$/, '');
  if (!baseUrl) throw new Error(`Input sheet: ${env}_BASE_URL is empty`);

  return {
    env,
    baseUrl,
    email: get('EMAIL'),
    password: get('PASSWORD'),
    headless: /^(y|yes|true|1)$/i.test(raw.HEADLESS || ''),
    slowMoMs: Number(raw.SLOW_MO_MS || 0) || 0,
    timeoutSec: Number(raw.TIMEOUT_SEC || 120) || 120,
    writeResultsToInput: !/^(n|no|false|0)$/i.test(raw.WRITE_RESULTS_TO_INPUT || 'Y'),
    raw,
    sheetCredentials,
    get,
    resolve,
  };
}

/** Reads one module sheet (e.g. "Login") into test case rows. Blank TC ID rows are ignored. */
export function loadCases(sheetName: string): TestCaseRow[] {
  const rows = sheetRows(openWorkbook(), sheetName);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => key(norm(h)));
  const col = (...names: string[]): number => header.findIndex((h) => names.map(key).includes(h));

  const c = {
    id: col('TC ID', 'Test Case Number', 'TC No'),
    name: col('Test Case Name', 'Name'),
    module: col('Module'),
    sub: col('Sub Module', 'Submodule'),
    pre: col('Preconditions', 'Precondition'),
    steps: col('Test Steps', 'Steps'),
    data: col('Test Data'),
    exp: col('Expected Result', 'Expected'),
    run: col('Run'),
  };
  if (c.id < 0) throw new Error(`Sheet "${sheetName}": no "TC ID" column in row 1`);

  const at = (r: unknown[], i: number): string => (i >= 0 ? norm(r[i]) : '');
  const out: TestCaseRow[] = [];
  rows.slice(1).forEach((r, i) => {
    const id = at(r, c.id);
    if (!id) return;
    const runCell = at(r, c.run);
    out.push({
      rowNumber: i + 2,
      id,
      name: at(r, c.name),
      module: at(r, c.module),
      subModule: at(r, c.sub),
      preconditions: at(r, c.pre),
      steps: at(r, c.steps),
      testData: at(r, c.data),
      expected: at(r, c.exp),
      run: !/^(n|no|false|0|skip)$/i.test(runCell),
    });
  });
  return out;
}

/** "key=value" lines (or ;-separated) from the Test Data cell. {{TOKENS}} are filled from the Input sheet. */
export function parseTestData(text: string, input: InputConfig): Record<string, string> {
  const data: Record<string, string> = {};
  for (const part of text.split(/[;\n]/)) {
    const p = part.trim();
    const eq = p.indexOf('=');
    if (!p || eq < 1) continue;
    data[p.slice(0, eq).trim().toLowerCase()] = input.resolve(p.slice(eq + 1).trim());
  }
  return data;
}

/** True when the workbook has a sheet with this name (any case / spacing). */
export function sheetExists(name: string): boolean {
  return openWorkbook().SheetNames.some((n) => key(n) === key(name));
}

/**
 * Reads any sheet as a table: row 1 is the header, every later row becomes an object keyed by the header text in lower case without
 * spaces ("Test Steps" -> teststeps). Empty rows are dropped. Used by the Keyword Steps and Datasets sheets.
 */
export function readTable(name: string): Array<Record<string, string> & { __row: string }> {
  const rows = sheetRows(openWorkbook(), name);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => key(norm(h)));
  const out: Array<Record<string, string> & { __row: string }> = [];
  rows.slice(1).forEach((r, i) => {
    if (r.every((c) => norm(c) === '')) return;
    const o: Record<string, string> = { __row: String(i + 2) };
    header.forEach((h, n) => {
      if (h) o[h] = norm(r[n]);
    });
    out.push(o as Record<string, string> & { __row: string });
  });
  return out;
}
