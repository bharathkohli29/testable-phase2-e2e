import * as fs from 'fs';
import * as path from 'path';
import type { Locator, Page } from '@playwright/test';
import { ROOT } from '../paths';

/**
 * THE OBJECT REPOSITORY.
 * Every button, link, field and heading that the keyword steps use is described ONCE in a JSON file under /objects and called by a short
 * name (for example "nav.dashboard"). The files are read when the run starts, so when the site changes a label ("Submit" -> "OK") you
 * change ONE line in one JSON file - no code and no test case is touched.
 *
 * One entry describes ONE way of finding the element:
 *   { "role": "button", "name": "Sign out" }                        a control by its role and visible name
 *   { "role": "link", "name": ["Submit", "OK"] }                    several accepted names (the old and the new label both work)
 *   { "testid": "floating-support-trigger" }                        the data-testid attribute (the most stable choice when the site has one)
 *   { "text": "Runs Dashboard" } / { "placeholder": "..." } / { "label": "..." } / { "css": "aside" }
 * Options:  match: "exact" (default, whole text, any case) | "contains" | "regex"
 *           within: "<another object>"   look inside that object
 *           pick: "first" (default) | "last" | "all" (no narrowing) | <number>   which one when several match
 *           danger: "<reason>"           the Click keyword refuses to press it (it would start / cancel / send / create something)
 *           note: "..."                  free text for people
 * Entries whose name starts with "_" are comments and are ignored.
 */
export interface ObjectDef {
  role?: string;
  name?: string | string[];
  testid?: string;
  text?: string | string[];
  placeholder?: string | string[];
  label?: string | string[];
  css?: string;
  match?: 'exact' | 'contains' | 'regex';
  within?: string;
  pick?: 'first' | 'last' | 'all' | number;
  danger?: string;
  note?: string;
}

export type ObjectRepo = Record<string, ObjectDef>;

export const OBJECTS_DIR = path.join(ROOT, 'objects');
export const ROUTES_FILE = path.join(OBJECTS_DIR, 'routes.json');

const KINDS = ['role', 'testid', 'text', 'placeholder', 'label', 'css'] as const;
const MATCHES = ['exact', 'contains', 'regex'];
const ROLES = new Set(['alert', 'alertdialog', 'article', 'button', 'cell', 'checkbox', 'combobox', 'dialog', 'heading', 'img', 'link', 'list', 'listitem', 'menu', 'menuitem', 'navigation', 'option', 'radio', 'row', 'searchbox', 'status', 'switch', 'tab', 'table', 'tablist', 'tabpanel', 'textbox', 'tooltip']);

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const arr = (v: string | string[] | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/** The text(s) a definition looks for (used by the locator check against the site's code). */
export function textsOf(def: ObjectDef): Array<{ text: string; regex: boolean }> {
  const regex = def.match === 'regex';
  return [...arr(def.name), ...arr(def.text), ...arr(def.placeholder), ...arr(def.label)].map((text) => ({ text, regex }));
}

/** Reads every /objects/*.json file (except routes.json) into one repository and checks it. Throws one message listing ALL mistakes. */
export function loadObjects(dir: string = OBJECTS_DIR): ObjectRepo {
  const repo: ObjectRepo = {};
  const problems: string[] = [];
  if (!fs.existsSync(dir)) return repo;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'routes.json').sort();
  const origin: Record<string, string> = {};
  for (const f of files) {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    } catch (e) {
      problems.push(`${f}: not valid JSON (${(e as Error).message})`);
      continue;
    }
    for (const [name, def] of Object.entries(data)) {
      if (name.startsWith('_')) continue;
      if (repo[name]) problems.push(`${f}: "${name}" is already defined in ${origin[name]}`);
      repo[name] = def as ObjectDef;
      origin[name] = f;
    }
  }
  for (const [name, def] of Object.entries(repo)) {
    const where = `"${name}" (${origin[name]})`;
    if (!def || typeof def !== 'object') { problems.push(`${where}: must be an object`); continue; }
    const kinds = KINDS.filter((k) => (def as ObjectDef)[k] !== undefined);
    if (kinds.length !== 1) problems.push(`${where}: needs exactly one of ${KINDS.join(' / ')} (found ${kinds.length ? kinds.join(', ') : 'none'})`);
    if (def.role !== undefined && !ROLES.has(def.role)) problems.push(`${where}: unknown role "${def.role}"`);
    if (def.name !== undefined && def.role === undefined) problems.push(`${where}: "name" is only used together with "role"`);
    if (def.match !== undefined && !MATCHES.includes(def.match)) problems.push(`${where}: match must be one of ${MATCHES.join(', ')}`);
    if (def.pick !== undefined && !(def.pick === 'first' || def.pick === 'last' || def.pick === 'all' || Number.isInteger(def.pick))) problems.push(`${where}: pick must be first, last, all or a number`);
    if (def.within !== undefined && !repo[def.within]) problems.push(`${where}: within "${def.within}" is not defined`);
    if (def.match === 'regex') {
      for (const t of arr(def.name ?? def.text ?? def.placeholder ?? def.label)) {
        try { new RegExp(t, 'i'); } catch { problems.push(`${where}: "${t}" is not a valid regular expression`); }
      }
    }
  }
  // loops: a -> within b -> within a
  for (const name of Object.keys(repo)) {
    const seen = new Set<string>();
    let cur: string | undefined = name;
    while (cur && repo[cur]) {
      if (seen.has(cur)) { problems.push(`"${name}": "within" goes round in a circle`); break; }
      seen.add(cur);
      cur = repo[cur].within;
    }
  }
  if (problems.length) throw new Error(`Object repository (${dir}) has ${problems.length} problem(s):\n  - ${problems.join('\n  - ')}`);
  return repo;
}

/** Route names (routes.json) -> paths. A value that already starts with "/" is a path and is returned as it is. */
export function loadRoutes(file: string = ROUTES_FILE): Record<string, string> {
  if (!fs.existsSync(file)) return {};
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (!k.startsWith('_')) out[k] = v;
  return out;
}

export function resolveRoute(nameOrPath: string, routes: Record<string, string>): string {
  const v = nameOrPath.trim();
  if (v.startsWith('/')) return v;
  if (routes[v]) return routes[v];
  throw new Error(`"${v}" is not a known route (routes.json has: ${Object.keys(routes).join(', ') || 'none'}) and does not start with "/".`);
}

function matcher(text: string, mode: ObjectDef['match']): RegExp {
  if (mode === 'regex') return new RegExp(text, 'i');
  if (mode === 'contains') return new RegExp(esc(text.trim()).replace(/\s+/g, '\\s+'), 'i');
  return new RegExp(`^\\s*${esc(text.trim()).replace(/\s+/g, '\\s+')}\\s*$`, 'i'); // whole text, any case, any spacing
}

/** Builds the Playwright locator for an object. `all` ignores "pick" (used when the keyword counts or loops). */
export function locate(page: Page, repo: ObjectRepo, name: string, opts: { all?: boolean } = {}): Locator {
  const def = repo[name];
  if (!def) {
    const near = Object.keys(repo).filter((k) => k.toLowerCase().includes(name.toLowerCase().split('.').pop() ?? '')).slice(0, 5);
    throw new Error(`Object "${name}" is not in the object repository (/objects/*.json).${near.length ? ` Similar names: ${near.join(', ')}.` : ''}`);
  }
  const scope: Page | Locator = def.within ? locate(page, repo, def.within, { all: false }) : page;
  const one = (n?: string): Locator => {
    if (def.testid !== undefined) return scope.getByTestId(def.testid);
    if (def.css !== undefined) return scope.locator(def.css);
    if (def.role !== undefined) {
      const role = def.role as Parameters<Page['getByRole']>[0];
      return n === undefined ? scope.getByRole(role) : scope.getByRole(role, { name: matcher(n, def.match) });
    }
    if (def.placeholder !== undefined) return scope.getByPlaceholder(matcher(n ?? '', def.match));
    if (def.label !== undefined) return scope.getByLabel(matcher(n ?? '', def.match));
    return scope.getByText(matcher(n ?? '', def.match));
  };
  const names = arr(def.role !== undefined ? def.name : def.text ?? def.placeholder ?? def.label);
  let loc: Locator;
  if (names.length === 0) loc = one();
  else loc = names.map((n) => one(n)).reduce((a, b) => a.or(b));
  const pick = def.pick ?? 'first';
  if (opts.all || pick === 'all') return loc;
  return pick === 'first' ? loc.first() : pick === 'last' ? loc.last() : loc.nth(pick);
}
