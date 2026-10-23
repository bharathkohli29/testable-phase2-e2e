import type { Locator, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { EVIDENCE_DIR, RUN_DIR } from '../paths';

const ANSI = /\u001b\[[0-9;]*m/g;

/** Short, readable one-liner from a Playwright error (strips colour codes and call logs). */
export function cleanError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg
    .replace(ANSI, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 6)
    .join(' | ')
    .slice(0, 500);
}

/**
 * Plain-language reason for a failed assertion (what was expected, what was found), for the Actual Result column.
 * The raw Playwright text is only used when the message is not recognised.
 */
export function explain(e: unknown): string {
  const raw = (e instanceof Error ? e.message : String(e)).replace(ANSI, '');
  const loc = /Locator:\s*(.+)/.exec(raw)?.[1]?.trim();
  const where = loc ? ` (looked for: ${loc.slice(0, 160)})` : '';
  const expected = /Expected(?: string| pattern| substring)?:\s*(.+)/.exec(raw)?.[1]?.trim();
  const received = /Received(?: string)?:\s*(.+)/.exec(raw)?.[1]?.trim();
  const m = /expect\(.*?\)\.(?:not\.)?(\w+)\(/.exec(raw)?.[1] ?? /expect\(\w+\)\.(?:not\.)?(\w+)/.exec(raw)?.[1];
  if (/\.(toEqual|toStrictEqual)\(/.test(raw) && /\+ Received/.test(raw)) {
    const take = (sign: string) => raw.split('\n').filter((l) => new RegExp(`^\\s*\\${sign}\\s`).test(l) && !/^\s*[+-]\s+(Expected|Received)\b/.test(l) && !/^\s*[+-]\s*(Array \[\]|Array \[|\]|Object \{|\}|,)\s*$/.test(l))
      .map((l) => l.replace(new RegExp(`^\\s*\\${sign}\\s*`), '').trim().replace(/,$/, '')).filter(Boolean).join(' ; ');
    const got = take('+');
    const want = take('-');
    const custom = raw.split('\n')[0].startsWith('expect(') ? '' : `${raw.split('\n')[0].trim()}: `;
    return `${custom}the page showed ${got || '(nothing)'}${want ? ` but expected ${want}` : ''}`.slice(0, 1200);
  }
  const strict = /strict mode violation.*?resolved to (\d+) elements/s.exec(raw);
  if (strict) return `The page has ${strict[1]} matching elements where the test expected exactly one - the test's selector is too broad (a test-code issue, not necessarily an app bug)${where}`;
  if (/element\(s\) not found/.test(raw)) {
    return `The element was not found on the page, so the check could not be made - it is missing, named differently, or a different type of control${where}`;
  }
  if (/Test timeout of/.test(raw)) return 'The test ran out of time before this finished (the page or site was too slow, or a step never completed).';
  if (/Timeout \d+ms exceeded|waiting for/.test(raw) && !expected) return `Waited but the expected state never appeared${where}`;
  if (expected && received) return `Expected ${expected} but the page showed ${received}${where}`;
  if (expected) return `Expected ${expected}, which did not happen${where}`;
  return cleanError(e);
}

/** Thrown by ctx.skip(): the case is reported as SKIPPED (with the reason) instead of PASS/FAIL. */
export class SkipCase extends Error {}

/**
 * What a failed check should show in its picture: an element, several elements, or a function that is run AFTER the failure
 * and brings the page to the failing element (opens the right tab, row ...) and returns it.
 */
export type Mark = Locator | Locator[] | (() => Promise<Locator | Locator[] | undefined | void>);

/**
 * Thrown when something that every later step (or later test case) depends on did not work
 * (sign-in, repository list, Configure card ...). The case FAILS, stops, and the cases that need the same
 * prerequisite are reported as SKIPPED ("Blocked by ...") instead of failing one by one.
 */
export class BlockingFailure extends Error {
  constructor(readonly key: string, message: string) {
    super(message);
  }
}


/**
 * Waits (at most `maxMs`) until the page looks settled before a picture is taken: the document is loaded and no spinner, skeleton
 * or "busy" element is visible any more. Never throws; after the time limit the picture is taken anyway (the page may really be stuck).
 */
export async function settle(page: Page, maxMs = 6_000): Promise<boolean> {
  const end = Date.now() + maxMs;
  const busy = (): Promise<boolean> => page.evaluate(() => {
    if (document.readyState !== 'complete') return true;
    const vis = (e: Element): boolean => { const r = (e as HTMLElement).getBoundingClientRect(); const st = getComputedStyle(e as HTMLElement); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'; };
    return [...document.querySelectorAll('.animate-spin, .animate-pulse, [aria-busy="true"], [role="progressbar"], [class*="spinner"], [class*="skeleton"]')].some(vis);
  }).catch(() => false);
  let calm = 0;
  while (Date.now() < end) {
    if (await busy()) calm = 0; else if (++calm >= 2) return true; // calm twice in a row (about half a second)
    await page.waitForTimeout(250).catch(() => undefined);
  }
  return false;
}

/**
 * Collects the "Actual Result" text for the sheet: one line per check.
 *   ✔ passed check      ✘ failed check → reason      • note
 */
export class Checks {
  readonly lines: string[] = [];

  constructor(private readonly page?: Page, private readonly caseId = '') {}

  /** Relative path of the picture taken at the FIRST failed check (red outline on the element + red banner naming the check). */
  failureShot = '';
  /** Relative path of the picture of the MAIN step of the case (green outline on the element + green banner), taken by snap() or at the end of a passed case. */
  mainShot = '';
  /** Elements the picture should show: set by focus(), or taken from the first check() that names an element. */
  private focusTargets: Locator[] = [];
  private caseName = '';

  setCaseName(name: string): void { this.caseName = name; }

  /** Tells the evidence picture which element is the point of the case (it is scrolled to the middle of the screen and outlined). */
  focus(...targets: Locator[]): void { this.focusTargets = targets; }

  /**
   * Takes the evidence picture of the MAIN step right now (e.g. while the dialog / tooltip / tab being tested is open):
   * the element is scrolled into view and outlined in green, a green bar at the BOTTOM says what the picture shows.
   * The first snap() of a case is the picture kept for a passed case; a failed case keeps the picture of its first failed check.
   */
  async snap(label: string, target?: Locator | Locator[]): Promise<void> {
    if (this.mainShot) return;
    const t = target ? (Array.isArray(target) ? target : [target]) : this.focusTargets;
    // a failed check that names no element of its own is photographed on the element this case is about
    if (this.focusTargets.length === 0 && t.length > 0) this.focusTargets = t;
    this.mainShot = await this.capture('pass', label, t, `${this.caseId}`);
  }

  /** Picture for a case that passed and never called snap(): the focus element when known, otherwise the top of the page. */
  async finalShot(): Promise<string> {
    if (this.mainShot) return this.mainShot;
    this.mainShot = await this.capture('pass', this.caseName ? this.caseName : 'main step', this.focusTargets, `${this.caseId}`);
    return this.mainShot;
  }

  /**
   * One picture: outlines the element(s) (green = ok, red = failed), scrolls it to the middle of the screen (or, when no element is
   * known, every scrolled area of the page back to the top so the page title is in the picture), adds a bar at the bottom with the
   * case id and what is shown, takes the screenshot and puts the page back exactly as it was. A problem here never changes a result.
   */
  private async capture(kind: 'pass' | 'fail', text: string, targets: Locator[], fileId: string): Promise<string> {
    const page = this.page;
    if (!page || !this.caseId) return '';
    try {
      await settle(page, kind === 'fail' ? 2_500 : 6_000); // do not photograph a loading spinner
      for (const t of targets) await t.first().waitFor({ state: 'visible', timeout: kind === 'fail' ? 800 : 3_000 }).catch(() => undefined);
      let marked = 0;
      const colour = kind === 'fail' ? '#E11D48' : '#16A34A';
      const tint = kind === 'fail' ? 'rgba(225,29,72,0.12)' : 'rgba(22,163,74,0.10)';
      for (const t of targets) {
        const ok = await t.first().evaluate((el, [c, bg]) => {
          const e = el as HTMLElement;
          e.scrollIntoView({ block: 'center', inline: 'nearest' });
          e.dataset.e2ePrev = `${e.style.outline}|${e.style.outlineOffset}|${e.style.backgroundColor}`;
          e.style.outline = `4px solid ${c}`;
          e.style.outlineOffset = '3px';
          e.style.backgroundColor = bg;
          return true;
        }, [colour, tint] as [string, string], { timeout: 2_000 }).catch(() => false);
        if (ok) marked++;
      }
      if (marked === 0) {
        // no element to show: put every scrolled area back to the top, so the page title and the top of the page are in the picture
        await page.evaluate(() => {
          window.scrollTo(0, 0);
          document.querySelectorAll<HTMLElement>('*').forEach((e) => { if (e.scrollTop > 0) e.scrollTop = 0; });
        }).catch(() => undefined);
      }
      const missing = targets.length > 0 && marked === 0;
      const warn = kind === 'pass' && missing;
      const icon = kind === 'fail' ? '✘ FAILED CHECK' : warn ? '⚠ MAIN STEP - ELEMENT NOT FOUND' : '✔ MAIN STEP';
      if (warn) this.lines.push(`• The picture could not outline "${text.slice(0, 100)}" because that element was not on the page at that moment - it shows the top of the page instead.`);
      await page.evaluate(([bar, bg]) => {
        const b = document.createElement('div');
        b.id = '__e2e_banner';
        b.textContent = bar;
        b.style.cssText = `position:fixed;bottom:0;left:0;right:0;z-index:2147483647;background:${bg};color:#fff;font:600 15px Segoe UI,Arial,sans-serif;padding:10px 16px;box-shadow:0 -2px 8px rgba(0,0,0,.3)`;
        document.body.appendChild(b);
      }, [`${icon} · ${this.caseId}${this.caseName ? ` · ${this.caseName}` : ''}${text && text !== this.caseName ? ` — ${text.slice(0, 150)}` : ''}${kind === 'fail' && missing ? '  (the element it looked for is not on the page)' : ''}`, kind === 'fail' ? '#B42318' : warn ? '#B45309' : '#15803D'] as [string, string]);
      await page.waitForTimeout(150); // let scrolling and the outline settle
      fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
      const file = path.join(EVIDENCE_DIR, `${fileId.replace(/[^A-Za-z0-9_.-]+/g, '_')}.png`);
      await page.screenshot({ path: file, timeout: 10_000 });
      await page.evaluate(() => {
        document.getElementById('__e2e_banner')?.remove();
        document.querySelectorAll<HTMLElement>('[data-e2e-prev]').forEach((e) => {
          const [o, oo, bg] = (e.dataset.e2ePrev ?? '||').split('|');
          e.style.outline = o; e.style.outlineOffset = oo; e.style.backgroundColor = bg;
          delete e.dataset.e2ePrev;
        });
      }).catch(() => undefined);
      return path.relative(RUN_DIR, file).split(path.sep).join('/');
    } catch {
      return ''; /* the picture is a bonus - never fail a case because of it */
    }
  }

  /** Red picture for a case that stopped with an unexpected error (not a failed check): shows the page at that moment. */
  async errorShot(message: string): Promise<void> {
    if (this.failureShot || !this.page || !this.caseId) return;
    this.failureShot = await this.capture('fail', message, this.focusTargets, this.caseId);
  }

  private async markFailure(description: string, mark?: Mark): Promise<void> {
    if (this.failureShot || !this.page || !this.caseId) return;
    let m: Locator | Locator[] | undefined;
    if (typeof mark === 'function') { try { m = (await mark()) || undefined; } catch { m = undefined; } } else m = mark;
    const targets = Array.isArray(m) ? m : m ? [m] : this.focusTargets;
    this.failureShot = await this.capture('fail', description, targets, this.caseId);
  }

  /** First error of a failed soft check (the case is marked FAIL at the end, the other checks still run). */
  firstFailure: unknown;
  failedCount = 0;

  /**
   * An assertion that does NOT stop the case: a failure is logged as ✘, the case will be FAIL,
   * and the following checks / steps still run (they do not depend on it).
   */
  async check(description: string, fn: () => unknown | Promise<unknown>, mark?: Mark): Promise<void> {
    if (mark && typeof mark !== 'function' && this.focusTargets.length === 0) this.focusTargets = Array.isArray(mark) ? mark : [mark];
    try {
      await fn();
      this.lines.push(`✔ ${description}`);
    } catch (e) {
      if (e instanceof BlockingFailure || e instanceof SkipCase) throw e;
      this.lines.push(`✘ ${description} → ${explain(e)}`);
      await this.markFailure(description, mark);
      this.failedCount++;
      this.firstFailure ??= e;
    }
  }

  /** A step the rest of the case depends on: on failure it is logged and the case stops (FAIL). */
  async step(description: string, fn: () => unknown | Promise<unknown>): Promise<void> {
    try {
      await fn();
      this.lines.push(`✔ ${description}`);
    } catch (e) {
      if (!(e instanceof SkipCase)) {
        this.lines.push(`✘ ${description} → ${explain(e)}`);
        this.failedCount++;
        await this.markFailure(description);
      }
      throw e;
    }
  }

  note(text: string): void {
    this.lines.push(`• ${text}`);
  }

  get failed(): boolean {
    return this.lines.some((l) => l.startsWith('✘'));
  }

  get text(): string {
    return this.lines.join('\n');
  }
}
