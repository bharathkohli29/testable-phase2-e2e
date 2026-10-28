import { expect, Page } from '@playwright/test';
import { obj as locatorOf } from '../../core/keywords/obj';

/**
 * Reads the numbers of ONE run from the four places that show them (Confidence Engine, Confidence Object, Confidence Graph, Runs Dashboard)
 * so that a case can compare them. Text is read from the visible page (the same words a person sees); every value is `undefined` when the
 * page does not show it, and the case says so in plain words.
 */
const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();
const n = (s: string | undefined): number | undefined => (s === undefined || /^n\/a$/i.test(s) ? undefined : Number(s));
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pageText = async (page: Page): Promise<string> => norm((await locatorOf(page, 'flow.css.body').innerText().catch(() => '')) || '');

export interface EngineView { score?: number; verdict?: string; whitebox?: number; total?: number; passed?: number; failed?: number; tasks?: string; breadcrumbRun?: string; header?: string }
export interface ObjectView { avg?: number; org?: number; whitebox?: number; validations?: number; risks?: number; card?: number; breadcrumbRun?: string }
export interface GraphView { org?: number; wb?: number; historyScore?: number; historyVerdict?: string; flowPercent?: number; labels: string[]; breadcrumbRun?: string; firstHistoryId?: string }
export interface DashRow { runId: string; commit: string; status: string; score: number; tasks: string }

export async function readEngine(page: Page): Promise<EngineView> {
  const t = await pageText(page);
  const sc = t.match(/Confidence Score\s+(?:commit\s+\S+\s+)?(\d{1,3})\s*\/\s*100\s*((?:(?!Whitebox|Blackbox|Validations)[A-Za-z]+)?)/i);
  const tot = t.match(/Total\s+(\d+)\s+Passed\s+(\d+)\s+Failed\s+(\d+)/i);
  return {
    score: n(sc?.[1]), verdict: sc?.[2] || undefined,
    whitebox: n(t.match(/Whitebox Confidence\s+\d+% weight\s+(\d{1,3}|N\/A)/i)?.[1]),
    total: n(tot?.[1]), passed: n(tot?.[2]), failed: n(tot?.[3]),
    tasks: t.match(/Execution Status.{0,40}?(\d+\/\d+)/i)?.[1],
    // the Confidence Engine header reads "<commit> · <run id start>"; the other screens say "· run <run id start>"
    breadcrumbRun: t.match(/·\s*run\s+([0-9a-f]{8})/i)?.[1] ?? t.match(/[0-9a-f]{7}\s*·\s*([0-9a-f]{8})/i)?.[1],
    header: t.match(/([0-9a-f]{7})\s*·\s*[0-9a-f]{8}/i)?.[1],
  };
}

export async function readObject(page: Page, repoName: string): Promise<ObjectView> {
  const t = await pageText(page);
  const r = esc(repoName);
  return {
    avg: n(t.match(/(\d{1,3})\s+Avg Confidence/i)?.[1]),
    org: n(t.match(/(\d{1,3})\s+ORG\b/i)?.[1]),
    whitebox: n(t.match(/Whitebox\s+(\d{1,3})%/i)?.[1]),
    validations: n(t.match(/(\d+)\s+Validations\b/i)?.[1]),
    risks: n(t.match(/(\d+)\s+Open Risks/i)?.[1]),
    card: n(t.match(new RegExp(`(\\d{1,3}|N/A)\\s+(?:SHIP|HOLD|BLOCK|PASS|FAIL|NOT STARTED)\\s+${r}\\s+${r}\\s+·`, 'i'))?.[1]),
    breadcrumbRun: t.match(/·\s*run\s+([0-9a-f]{8})/i)?.[1],
  };
}

export async function readGraph(page: Page, runId8: string): Promise<GraphView> {
  const t = await pageText(page);
  const hist = t.search(/Pipeline Run History/i);
  const row = (hist >= 0 ? t.slice(hist) : t).match(new RegExp(`${esc(runId8)}[\\w-]*…?[^]{0,80}?\\b(Pass|Hold|Block|Fail|Ship)\\s+(\\d{1,3})\\b`, 'i'));
  const first = t.match(/Pipeline Run History[^]*?([0-9a-f]{8})[\w-]*…?\s+\w+/i);
  const trend = t.match(/Last \d+ runs? with scores?([^]*?)(?:Latest release|Pipeline Run History|Whitebox Confidence|$)/i)?.[1] ?? '';
  return {
    org: n(t.match(/(\d{1,3})\s+Org\s+(?:\d{1,3}|N\/A)\s+WB/i)?.[1]),
    wb: n(t.match(/Org\s+(\d{1,3}|N\/A)\s+WB/i)?.[1]),
    historyVerdict: row?.[1], historyScore: n(row?.[2]),
    flowPercent: n(t.match(/CONFIDENCE\s+(\d{1,3})%\s+(?:PASS|HOLD|BLOCK|FAIL)/i)?.[1]),
    labels: [...trend.matchAll(/#([0-9a-f]{7})/gi)].map((m) => m[1]),
    breadcrumbRun: t.match(/·\s*run\s+([0-9a-f]{8})/i)?.[1],
    firstHistoryId: first?.[1],
  };
}

export async function readDashboardRow(page: Page, runId8: string): Promise<DashRow | undefined> {
  const rows = await page.evaluate(() => [...document.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((x) => (x as HTMLElement).innerText.trim())));
  const c = rows.find((r) => (r[0] ?? '').toLowerCase().startsWith(runId8.toLowerCase()));
  return c ? { runId: c[0], commit: c[4] ?? '', status: c[5] ?? '', score: Number((c[6] ?? '').replace(/[^\d.]/g, '')), tasks: c[7] ?? '' } : undefined;
}

/** Waits (up to 30 s) until `read` returns something `ok` accepts; returns the last thing read either way. */
export async function until<T>(read: () => Promise<T>, ok: (v: T) => boolean, timeout = 30_000): Promise<T> {
  const end = Date.now() + timeout;
  let v = await read();
  while (!ok(v) && Date.now() < end) { await new Promise((r) => setTimeout(r, 1_000)); v = await read(); }
  return v;
}

/** expect(actual).toBe(expected) with plain words when the page does not show the value at all. */
export function same(actual: unknown, expected: unknown, what: string): void {
  expect(actual, `${what}: the page does not show it`).not.toBeUndefined();
  expect(actual, what).toBe(expected);
}
