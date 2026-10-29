import * as fs from 'fs';
import * as path from 'path';
import { ROOT } from '../paths';
import { fill } from './objects';

/**
 * EXPECTED-TEXT REPOSITORY (/expected/*.json): the texts the checks expect to see on the page, kept out of the code, like /objects.
 * One entry per line:
 *   "graph.heading.confidence-graph": { "regex": "confidence graph", "flags": "i" }      -> a pattern (same as /confidence graph/i)
 *   "graph.value.draft-only":         { "text": "draft only - not sent" }                 -> an exact text
 * Used in a check as  await expect(locator).toContainText(expectedOf('graph.heading.confidence-graph'));
 * Plain-word patterns and exact texts are updated automatically with the objects when the site's code renames them.
 */
export const EXPECTED_DIR = path.join(ROOT, 'expected');

export interface ExpectedDef { text?: string; regex?: string; flags?: string; list?: string[] }
export type ExpectedRepo = Record<string, ExpectedDef>;

export function loadExpected(dir: string = EXPECTED_DIR): ExpectedRepo {
  const repo: ExpectedRepo = {};
  const problems: string[] = [];
  if (!fs.existsSync(dir)) return repo;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    let data: Record<string, ExpectedDef>;
    try { data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { problems.push(`${f}: not valid JSON (${(e as Error).message})`); continue; }
    for (const [k, d] of Object.entries(data)) {
      if (k.startsWith('_')) continue;
      if (repo[k]) problems.push(`${f}: "${k}" is defined twice`);
      const hasText = typeof d?.text === 'string', hasRegex = typeof d?.regex === 'string', hasList = Array.isArray(d?.list);
      if (Number(hasText) + Number(hasRegex) + Number(hasList) !== 1) { problems.push(`${f}: "${k}" needs exactly one of "text", "regex" or "list"`); continue; }
      if (hasList && !d.list!.every((x) => typeof x === 'string')) { problems.push(`${f}: "${k}" list must contain only texts`); continue; }
      if (hasRegex) { try { new RegExp(d.regex!.replace(/\{\{\d+(:raw)?\}\}/g, 'x'), d.flags ?? ''); } catch (e) { problems.push(`${f}: "${k}" has an invalid pattern (${(e as Error).message})`); continue; } }
      repo[k] = d;
    }
  }
  if (problems.length) throw new Error(`Expected-text repository (/expected) has problems:\n - ${problems.join('\n - ')}`);
  return repo;
}

let cache: ExpectedRepo | undefined;
/** The expected text/pattern for a key of /expected/*.json. */
export function expected(key: string, ...args: Array<string | number>): string | RegExp {
  cache ??= loadExpected();
  const d = cache[key];
  if (!d) throw new Error(`Expected text "${key}" is not in /expected. Add it to the matching file in /expected.`);
  if (d.list) throw new Error(`"${key}" in /expected is a list: use listOf('${key}').`);
  return d.regex !== undefined ? new RegExp(fill(d.regex, args, true), d.flags ?? '') : fill(d.text!, args, false);
}
/** A list of texts for /expected (for example the buttons the header must show). */
export function listOf(key: string): string[] {
  cache ??= loadExpected();
  const d = cache[key];
  if (!d?.list) throw new Error(`List "${key}" is not in /expected (it needs a "list": [...] entry).`);
  return [...d.list];
}
export function resetExpectedCache(): void { cache = undefined; }
