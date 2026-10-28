import { loadInput } from './excel/readInput';
import type { InputConfig } from './types';

/**
 * Settings that used to be numbers written inside the code (how long to wait for "Review branches", for the plan, ...).
 * They now come from the Input sheet (e.g. REVIEW_WAIT_SEC); when the key is missing or blank the old value is used,
 * so a workbook that was never updated behaves exactly as before.
 */
let cache: InputConfig | undefined | null;

function input(): InputConfig | undefined {
  if (cache === undefined) {
    try {
      cache = loadInput();
    } catch {
      cache = null; // no workbook (self test, first start): the defaults apply
    }
  }
  return cache ?? undefined;
}

/** Forget what was read (a new run, or a test that changed the workbook). */
export function resetSettingsCache(): void {
  cache = undefined;
}

/** Text value of an Input key, or `fallback` when it is missing / blank. */
export function setting(name: string, fallback = ''): string {
  const v = input()?.get(name);
  return v && v.trim() ? v.trim() : fallback;
}

/** A number of seconds from the Input sheet, returned in milliseconds. Not a positive number -> the default. */
export function waitMs(name: string, defaultSec: number): number {
  const n = Number(setting(name, ''));
  return (Number.isFinite(n) && n > 0 ? n : defaultSec) * 1000;
}
