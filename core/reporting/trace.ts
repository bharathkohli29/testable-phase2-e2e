import { test } from '@playwright/test';
import type { Locator } from '@playwright/test';

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

/** The locator, wrapped so that its actions are reported with `label`. Chained locators (first(), nth(), locator()) keep the label. */
export function traced(loc: Locator, label: string): Locator {
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
          return reportStep(`${ACTIONS[prop]}${shown} · ${label}`, () => fn.apply(target, args) as Promise<unknown>);
        };
      }
      if (CHAIN.has(prop)) {
        return (...args: unknown[]) => {
          const r = fn.apply(target, args) as Locator;
          const part = prop === 'first' || prop === 'last' ? prop : prop === 'nth' ? `nth(${String(args[0])})` : null;
          return part ? traced(r, `${label} [${part}]`) : traced(r, label);
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
