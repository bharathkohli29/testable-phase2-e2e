import { test } from '@playwright/test';
import type { Locator } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { RUN_DIR } from '../paths';

/**
 * REPORT STEPS. Every click / fill / press on an element of the object repository becomes a step in the Allure report that names the element
 * ("Click · repo.button.confirm — button "Confirm""), so the report shows WHAT was clicked, not only "Click". Values typed into fields are never
 * written (passwords). Outside a test (scripts) nothing is recorded and everything works as before.
 */
const ACTIONS: Record<string, string> = {
  click: 'Click', dblclick: 'Double-click', fill: 'Fill', type: 'Type', pressSequentially: 'Type', press: 'Press', check: 'Check', uncheck: 'Uncheck',
  setChecked: 'Set checked', hover: 'Hover', selectOption: 'Select option', focus: 'Focus', clear: 'Clear', setInputFiles: 'Upload file', tap: 'Tap',
  dragTo: 'Drag', scrollIntoViewIfNeeded: 'Scroll into view', waitFor: 'Wait for',
};
const CHAIN = new Set(['first', 'last', 'nth', 'filter', 'locator', 'getByRole', 'getByText', 'getByLabel', 'getByPlaceholder', 'getByTestId', 'getByAltText', 'getByTitle', 'and', 'or']);

/** Runs `fn` as a named step when a test is running, otherwise just runs it. The error of `fn` is passed on unchanged. */
export async function reportStep<T>(title: string, fn: () => Promise<T> | T): Promise<T> {
  let inTest = true;
  try { test.info(); } catch { inTest = false; }
  if (!inTest) return fn();
  return test.step(title, async () => fn(), { box: false });
}

/** A second way of finding the same element (the "fallback" list of an object-repository entry). */
export interface Fallback { loc: Locator; label: string }

const healedKeys = new Map<string, number>(); // label -> index of the fallback that worked in this process (so the next use does not wait again)
const SELF_HEAL_OFF = /^(off|n|no|false|0)$/i.test(process.env.SELF_HEAL ?? '');

function recordHeal(label: string, index: number, fb: Fallback): void {
  try {
    fs.mkdirSync(RUN_DIR, { recursive: true });
    fs.appendFileSync(path.join(RUN_DIR, 'healed.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), element: label, fallbackNumber: index + 1, used: fb.label })}\n`);
  } catch { /* the report is still correct without this file */ }
}

/**
 * The locator, wrapped so that its actions are reported with `label`. Chained locators (first(), nth(), locator()) keep the label.
 * SELF-HEALING: when the entry has fallbacks and an ACTION (click, fill, ...) fails because the element is not on the page, the same action is
 * tried with each fallback. A fallback that works is reported as a "Healed" step and written to results/run_<time>/healed.jsonl, so a person can
 * decide to make it the main locator. Nothing changes for entries without fallbacks. SELF_HEAL=off switches it off.
 */
export function traced(loc: Locator, label: string, fallbacks: Fallback[] = []): Locator {
  return new Proxy(loc, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, target) as unknown;
      if (typeof v !== 'function') return v;
      // symbols (util.inspect.custom, toPrimitive) and everything else Playwright reads for its messages: run on the real locator, never wrapped
      if (typeof prop !== 'string') return (v as (...a: unknown[]) => unknown).bind(target);
      const fn = v as (...a: unknown[]) => unknown;
      if (Object.prototype.hasOwnProperty.call(ACTIONS, prop)) {
        return (...args: unknown[]) => {
          const shown = prop === 'press' && typeof args[0] === 'string' && args[0].length > 1 ? ` ${args[0]}` : '';
          const title = `${ACTIONS[prop]}${shown} \u00b7 ${label}`;
          const run = async (): Promise<unknown> => {
            if (!fallbacks.length || SELF_HEAL_OFF) return fn.apply(target, args);
            const known = healedKeys.get(label);
            if (known !== undefined && (await target.count()) === 0) return heal(known);
            try {
              return await fn.apply(target, args);
            } catch (e) {
              const timedOut = (e as Error)?.name === 'TimeoutError';
              if (!timedOut || (await target.count().catch(() => 1)) > 0) throw e;
              for (let i = 0; i < fallbacks.length; i++) {
                if ((await fallbacks[i].loc.count().catch(() => 0)) > 0) return heal(i, e);
              }
              throw e;
            }
          };
          const heal = async (i: number, original?: unknown): Promise<unknown> => {
            const fb = fallbacks[i];
            try {
              const out = await reportStep(`Healed \u00b7 ${label} not found, used fallback ${i + 1}: ${fb.label}`, () => (fb.loc as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[prop](...args));
              healedKeys.set(label, i);
              recordHeal(label, i, fb);
              return out;
            } catch (e2) {
              throw original ?? e2;
            }
          };
          return reportStep(title, run);
        };
      }
      if (CHAIN.has(prop)) {
        return (...args: unknown[]) => {
          const r = fn.apply(target, args) as Locator;
          const part = prop === 'first' || prop === 'last' ? prop : prop === 'nth' ? `nth(${String(args[0])})` : null;
          const fbs = fallbacks.map((f) => ({ loc: (f.loc as unknown as Record<string, (...a: unknown[]) => Locator>)[prop](...args), label: f.label }));
          return part ? traced(r, `${label} [${part}]`, fbs) : traced(r, label, fbs);
        };
      }
      void receiver;
      return fn.bind(target);
    },
  });
}

/** Adds a text to the current report step (the case). Nothing happens outside a test. Secrets are removed by the caller / by the report build. */
export async function attachText(name: string, body: string): Promise<void> {
  try { await test.info().attach(name, { body, contentType: 'text/plain' }); } catch { /* not in a test */ }
}
/** Adds a picture / file to the current report step. */
export async function attachFile(name: string, file: string, contentType: string): Promise<void> {
  try { await test.info().attach(name, { path: file, contentType }); } catch { /* not in a test, or the file is missing */ }
}
