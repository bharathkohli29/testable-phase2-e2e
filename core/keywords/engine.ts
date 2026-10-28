import { expect, type Locator, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { SECRET_KEY } from '../excel/readInput';
import type { CaseContext } from '../runner/registerCases';
import type { InputConfig } from '../types';
import { locate, resolveRoute, textsOf, type ObjectDef, type ObjectRepo } from './objects';
import type { KeywordStep } from './steps';

/**
 * THE KEYWORD ENGINE.
 * A test case is a list of rows (Keyword | Object | Data | Expected) in the "Keyword Steps" sheet. This file is the only place that knows
 * what each keyword DOES; the sheet only says WHICH keyword, on WHICH object (a name from /objects), with WHAT data.
 *
 *   action keywords   Open, SignIn, Click, Fill, Press, Hover, ScrollTo, Wait, WaitVisible, WaitHidden, WaitUrl
 *                     -> the case needs them: when one fails the case stops (FAIL)
 *   check keywords    VerifyVisible, VerifyHidden, VerifyText, VerifyExactText, VerifyMatch, VerifyCount, VerifyEnabled, VerifyDisabled,
 *                     VerifyAttribute, VerifyUrl, VerifyPageText
 *                     -> a failed check is written to the Actual Result and the case carries on; the element is outlined in the picture
 *   evidence / flow   Screenshot, Note, Skip
 *
 * Safety (built in, cannot be switched off from the sheet):
 *   - Click refuses any object marked "danger" in /objects, and any object whose text says cancel execution / execute run / run analysis /
 *     submit ticket / start analysis / create account / delete / sign up.
 *   - Fill refuses a password field, and {{...}} tokens that point at a password / token / key are refused everywhere.
 *   - Open only goes to a route name or a path of the site under test.
 */

export type KeywordEnv = {
  page: Page;
  input: InputConfig;
  repo: ObjectRepo;
  routes: Record<string, string>;
  /** Signs in with the account of the Input sheet (the credentials never pass through the sheet). */
  signIn: () => Promise<void>;
  ctx: Pick<CaseContext<unknown>, 'check' | 'step' | 'note' | 'snap' | 'skip'>;
  /** Folder for checkpoint pictures; undefined = no checkpoint pictures. */
  stepsDir?: string;
  caseId: string;
};

type Kind = 'action' | 'check' | 'misc';
interface KeywordDef {
  kind: Kind;
  needsObject: boolean;
  needsData?: boolean;
  needsExpected?: boolean;
  /** Objects (and routes) that the keyword touches must exist: checked before the case runs. */
  help: string;
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DENY = /(cancel\s+execution|execute\s+run|run\s+analysis|submit\s+(a\s+)?(ticket|question)|start\s+analysis|create\s+account|delete|sign\s*up)/i;

export const KEYWORDS: Record<string, KeywordDef> = {
  open: { kind: 'action', needsObject: false, help: 'Open | <route name or /path>' },
  signin: { kind: 'action', needsObject: false, help: 'SignIn' },
  click: { kind: 'action', needsObject: true, help: 'Click | <object>' },
  fill: { kind: 'action', needsObject: true, needsData: true, help: 'Fill | <object> | <text>' },
  press: { kind: 'action', needsObject: false, needsData: true, help: 'Press | | <key, e.g. Escape>' },
  hover: { kind: 'action', needsObject: true, help: 'Hover | <object>' },
  scrollto: { kind: 'action', needsObject: true, help: 'ScrollTo | <object>' },
  wait: { kind: 'action', needsObject: false, needsData: true, help: 'Wait | | <milliseconds, at most 60000>' },
  waitvisible: { kind: 'action', needsObject: true, help: 'WaitVisible | <object> | <seconds, default 30>' },
  waithidden: { kind: 'action', needsObject: true, help: 'WaitHidden | <object> | <seconds, default 30>' },
  waiturl: { kind: 'action', needsObject: false, needsExpected: true, help: 'WaitUrl | | <seconds> | <text or /regex/ of the address>' },
  verifyvisible: { kind: 'check', needsObject: true, help: 'VerifyVisible | <object>' },
  verifyhidden: { kind: 'check', needsObject: true, help: 'VerifyHidden | <object>' },
  verifytext: { kind: 'check', needsObject: true, needsExpected: true, help: 'VerifyText | <object> | | <text it contains>' },
  verifyexacttext: { kind: 'check', needsObject: true, needsExpected: true, help: 'VerifyExactText | <object> | | <whole text>' },
  verifymatch: { kind: 'check', needsObject: true, needsExpected: true, help: 'VerifyMatch | <object> | | <regular expression>' },
  verifycount: { kind: 'check', needsObject: true, needsExpected: true, help: 'VerifyCount | <object> | | <number>' },
  verifyenabled: { kind: 'check', needsObject: true, help: 'VerifyEnabled | <object>' },
  verifydisabled: { kind: 'check', needsObject: true, help: 'VerifyDisabled | <object>' },
  verifyattribute: { kind: 'check', needsObject: true, needsData: true, needsExpected: true, help: 'VerifyAttribute | <object> | <attribute> | <value or /regex/>' },
  verifyurl: { kind: 'check', needsObject: false, needsExpected: true, help: 'VerifyUrl | | | <text or /regex/ of the address>' },
  verifypagetext: { kind: 'check', needsObject: false, needsExpected: true, help: 'VerifyPageText | | | <text somewhere on the page>' },
  screenshot: { kind: 'misc', needsObject: false, help: 'Screenshot | <optional object> | <label>' },
  note: { kind: 'misc', needsObject: false, needsData: true, help: 'Note | | <text>' },
  skip: { kind: 'misc', needsObject: false, needsData: true, help: 'Skip | | <reason>' },
};

/** Replaces {{ds.key}} with the data-set value and {{KEY}} with the Input sheet value. Secrets are never substituted. */
export function fillTokens(text: string, input: InputConfig, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (_m, k: string) => {
    if (SECRET_KEY.test(k)) throw new Error(`The token {{${k}}} points at a secret. Keyword steps never use passwords, tokens or keys.`);
    if (k.toLowerCase().startsWith('ds.')) {
      const key = norm(k.slice(3));
      if (!(key in vars)) throw new Error(`The token {{${k}}} has no value: the data set has no column "${k.slice(3)}".`);
      return vars[key];
    }
    return input.get(k);
  });
}

function asRegex(expected: string, whole = false): RegExp {
  const m = expected.trim().match(/^\/(.+)\/([a-z]*)$/i);
  if (m) return new RegExp(m[1], m[2].includes('i') ? m[2] : `${m[2]}i`);
  const body = esc(expected.trim()).replace(/\s+/g, '\\s+');
  return new RegExp(whole ? `^\\s*${body}\\s*$` : body, 'i');
}

export function isDangerous(def: ObjectDef): string | undefined {
  if (def.danger) return def.danger;
  const hit = textsOf(def).find((t) => DENY.test(t.text));
  return hit ? `its text "${hit.text}" matches an action the keyword steps never press (start / cancel / send / create / delete)` : undefined;
}

/** Everything that can be found wrong with a case's rows BEFORE any step runs (unknown keyword, missing object / data, bad route ...). */
export function validateSteps(steps: KeywordStep[], repo: ObjectRepo, routes: Record<string, string>): string[] {
  const out: string[] = [];
  for (const s of steps) {
    const at = `row ${s.rowNumber} (step ${s.step}, ${s.keyword || 'no keyword'})`;
    const def = KEYWORDS[norm(s.keyword)];
    if (!def) { out.push(`${at}: unknown keyword. Known: ${Object.values(KEYWORDS).map((d) => d.help.split(' ')[0]).join(', ')}`); continue; }
    if (def.needsObject && !s.object) out.push(`${at}: needs an object. Format: ${def.help}`);
    if (def.needsData && !s.data) out.push(`${at}: needs data. Format: ${def.help}`);
    if (def.needsExpected && !s.expected) out.push(`${at}: needs an expected value. Format: ${def.help}`);
    if (s.object && !s.object.includes('{{') && !repo[s.object]) out.push(`${at}: object "${s.object}" is not in the object repository`);
    const kw = norm(s.keyword);
    if (kw === 'open') {
      const target = s.object || s.data;
      if (!target) out.push(`${at}: needs a route name or a path`);
      else if (!target.includes('{{')) { try { resolveRoute(target, routes); } catch (e) { out.push(`${at}: ${(e as Error).message}`); } }
    }
    if (kw === 'click' && s.object && !s.object.includes('{{') && repo[s.object]) {
      const why = isDangerous(repo[s.object]);
      if (why) out.push(`${at}: Click is refused for "${s.object}": ${why}`);
    }
  }
  return out;
}

function describe(s: KeywordStep, input: InputConfig, vars: Record<string, string>): string {
  if (s.description.trim()) return fillTokens(s.description, input, vars);
  const parts = [s.keyword, s.object, s.data, s.expected].filter((x) => x.trim() !== '').map((x) => fillTokens(x, input, vars));
  return parts.join(' · ');
}

/** Runs the rows of one case (for one data set) in order. */
export async function runSteps(env: KeywordEnv, steps: KeywordStep[], vars: Record<string, string> = {}): Promise<void> {
  const { page, input, repo, routes, ctx } = env;
  for (const s of steps) {
    const kw = norm(s.keyword);
    const def = KEYWORDS[kw];
    if (!def) throw new Error(`Unknown keyword "${s.keyword}" (row ${s.rowNumber})`);
    const objName = fillTokens(s.object, input, vars);
    const data = fillTokens(s.data, input, vars);
    const expected = fillTokens(s.expected, input, vars);
    const text = describe(s, input, vars);
    const loc = (all = false): Locator => locate(page, repo, objName, { all });
    const mark = async (): Promise<Locator> => loc();

    const act = (fn: () => Promise<unknown>) => ctx.step(text, async () => { await fn(); });
    const chk = (fn: () => Promise<unknown>) => ctx.check(text, async () => { await fn(); }, mark);

    try {
      switch (kw) {
        case 'open':
          await act(async () => {
            const target = resolveRoute(fillTokens(s.object || s.data, input, vars), routes);
            await page.goto(`${input.baseUrl}${target}`);
            await page.waitForLoadState('domcontentloaded');
          });
          break;
        case 'signin': await act(() => env.signIn()); break;
        case 'click':
          await act(async () => {
            const why = isDangerous(repo[objName] ?? {});
            if (why) throw new Error(`Click refused for "${objName}": ${why}`);
            await loc().click();
          });
          break;
        case 'fill':
          await act(async () => {
            const l = loc();
            await l.waitFor({ state: 'visible', timeout: 15_000 });
            const type = ((await l.getAttribute('type')) ?? '').toLowerCase();
            const auto = ((await l.getAttribute('autocomplete')) ?? '').toLowerCase();
            if (type === 'password' || auto.includes('password')) throw new Error(`Fill refused for "${objName}": it is a password field. The keyword steps never type passwords.`);
            await l.fill(data);
          });
          break;
        case 'press': await act(() => page.keyboard.press(data)); break;
        case 'hover': await act(() => loc().hover()); break;
        case 'scrollto': await act(() => loc().scrollIntoViewIfNeeded()); break;
        case 'wait': await act(() => page.waitForTimeout(Math.min(Math.max(Number(data) || 0, 0), 60_000))); break;
        case 'waitvisible': await act(() => loc().waitFor({ state: 'visible', timeout: (Number(data) || 30) * 1000 })); break;
        case 'waithidden': await act(() => loc().waitFor({ state: 'hidden', timeout: (Number(data) || 30) * 1000 })); break;
        case 'waiturl': await act(() => page.waitForURL(asRegex(expected), { timeout: (Number(data) || 30) * 1000 })); break;

        case 'verifyvisible': await chk(() => expect(loc()).toBeVisible()); break;
        case 'verifyhidden': await chk(() => expect(loc()).toBeHidden()); break;
        case 'verifytext': await chk(() => expect(loc()).toContainText(asRegex(expected))); break;
        case 'verifyexacttext': await chk(() => expect(loc()).toHaveText(asRegex(expected, true))); break;
        case 'verifymatch': await chk(() => expect(loc()).toHaveText(new RegExp(expected.trim().replace(/^\/|\/[a-z]*$/g, ''), 'i'))); break;
        case 'verifycount': await chk(() => expect(loc(true)).toHaveCount(Number(expected))); break;
        case 'verifyenabled': await chk(() => expect(loc()).toBeEnabled()); break;
        case 'verifydisabled': await chk(() => expect(loc()).toBeDisabled()); break;
        case 'verifyattribute': await chk(() => expect(loc()).toHaveAttribute(data, asRegex(expected))); break;
        case 'verifyurl': await ctx.check(text, async () => { await expect(page).toHaveURL(asRegex(expected)); }); break;
        case 'verifypagetext': await ctx.check(text, async () => { await expect(page.locator('body')).toContainText(asRegex(expected)); }); break;

        case 'screenshot': await ctx.snap(data || text, objName ? loc() : undefined); break;
        case 'note': ctx.note(data); break;
        case 'skip': ctx.skip(data); break;
        default: throw new Error(`Keyword "${s.keyword}" is known but not implemented`);
      }
    } finally {
      if (s.checkpoint && env.stepsDir && kw !== 'skip') await checkpoint(env, s);
    }
  }
}

async function checkpoint(env: KeywordEnv, s: KeywordStep): Promise<void> {
  try {
    fs.mkdirSync(env.stepsDir!, { recursive: true });
    const file = path.join(env.stepsDir!, `${env.caseId}_step${s.step}.png`.replace(/[^A-Za-z0-9_.-]+/g, '_'));
    await env.page.screenshot({ path: file, timeout: 10_000 });
    env.ctx.note(`Checkpoint picture after step ${s.step}: evidence/steps/${path.basename(file)}`);
  } catch {
    /* a missing picture must never fail a case */
  }
}
