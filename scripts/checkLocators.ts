/**
 * npm run locators:check
 *
 * Compares EVERY text our script looks for (button names, labels, placeholders in modules/ and core/, and every entry of /objects)
 * with the text that is really in the website's source code. It answers one question: "which of the words we look for are no longer
 * in the site?" - so a label that changed (Submit -> OK) is found BEFORE a run fails, and a failure that is NOT on this list is not a
 * renamed label (it is a real problem or a script problem).
 *
 *   npm run locators:check                         reads SITE_CODE_PATH / SITE_CODE_REF from the Input sheet (or environment variables)
 *   npm run locators:check -- --fetch              runs "git fetch origin" in the site clone first (the working folder is never changed)
 *   npm run locators:check -- --since <old ref>    ALSO reports texts that WERE in the site at <old ref> and are gone at the checked ref
 *   npm run locators:check -- --ref origin/dev     check another branch
 *   npm run locators:check -- --strict             exit code 1 when something is missing (for a build server)
 *
 * It only READS the site's repository (git ls-tree / cat-file); it never checks anything out, pulls, or writes there.
 * No guessing: a text is either in the code or it is not. Texts that the site builds from variables ("Synced ${n} repositories")
 * are checked by their fixed parts and marked "parts".
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_SRC = 'frontend/web-console/src';

export interface Found {
  text: string;
  regex: boolean;
  kind: string; // button, link, getByText, ...
  where: string[]; // file:line (up to 3)
  uses: number;
}
export type Status = 'FOUND' | 'FOUND (parts)' | 'NOT FOUND' | 'CHANGED' | 'TOO GENERIC';
export interface Row extends Found {
  status: Status;
  hits: number;
}

// ────────────────────────────────────────── git
function git(site: string, args: string[], input?: string): Buffer {
  const r = spawnSync('git', ['-C', site, ...args], { input, maxBuffer: 1024 * 1024 * 1024 });
  if (r.error) throw new Error(`git could not be started: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr.toString().trim()}`);
  return r.stdout;
}

/** All source files of the site at `ref` as one normalised lower-case text (test files are left out: they are not what users see). */
export function readSiteText(site: string, ref: string, srcDir: string): { text: string; files: number } {
  const names = git(site, ['ls-tree', '-r', '--name-only', ref, srcDir]).toString('utf8').split('\n')
    .filter((f) => /\.(tsx?|jsx?|json)$/.test(f) && !/(\.test\.|\.spec\.|\/__tests__\/|\/tests?\/)/.test(f));
  if (names.length === 0) throw new Error(`No source files under "${srcDir}" at ${ref}. Is SITE_CODE_SRC right?`);
  const out = git(site, ['cat-file', '--batch'], names.map((n) => `${ref}:${n}`).join('\n') + '\n');
  const parts: string[] = [];
  let pos = 0;
  while (pos < out.length) {
    const nl = out.indexOf(0x0a, pos);
    if (nl < 0) break;
    const header = out.subarray(pos, nl).toString('utf8').split(' ');
    pos = nl + 1;
    if (header[1] === 'missing') continue;
    const size = Number(header[2]);
    parts.push(out.subarray(pos, pos + size).toString('utf8'));
    pos += size + 1;
  }
  return { text: normaliseSite(parts.join('\n')), files: names.length };
}

export function normaliseSite(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&apos;|&#39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

// ────────────────────────────────────────── what our script looks for
const LITERAL = /(getByRole\('(\w+)',\s*\{\s*name:\s*|getByText\(|getByPlaceholder\(|getByLabel\(|\bci\(|\bflex\(|\bhas\()\s*('((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|\/((?:[^\/\\\n]|\\.)+)\/([gimsuy]*))/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'results') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Every literal text / pattern that the script's code looks for (getByRole name, getByText, getByPlaceholder, ci(), flex(), has()). */
export function extractCodeLocators(root: string): Found[] {
  const map = new Map<string, Found>();
  for (const dir of ['modules', 'core']) {
    const base = path.join(root, dir);
    if (!fs.existsSync(base)) continue;
    for (const file of walk(base)) {
      const rel = path.relative(root, file).split(path.sep).join('/');
      fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, i) => {
        for (const m of line.matchAll(LITERAL)) {
          const kind = m[2] ?? m[1].replace(/\($/, '').replace(/^\\b/, '');
          const isRegex = m[6] !== undefined;
          const text = isRegex ? m[6] : (m[4] ?? m[5] ?? '').replace(/\\'/g, "'").replace(/\\"/g, '"');
          if (!text.trim()) continue;
          const k = `${isRegex ? 'r' : 's'}:${text}`;
          const f = map.get(k) ?? { text, regex: isRegex, kind, where: [], uses: 0 };
          f.uses += 1;
          if (f.where.length < 3) f.where.push(`${rel}:${i + 1}`);
          map.set(k, f);
        }
      });
    }
  }
  return [...map.values()];
}

/** The texts and test ids of every object of the repository (/objects). */
export function extractObjectLocators(): { texts: Found[]; testids: Array<{ id: string; name: string }> } {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { loadObjects, textsOf } = require('../core/keywords/objects') as typeof import('../core/keywords/objects');
  const repo = loadObjects();
  const texts: Found[] = [];
  const testids: Array<{ id: string; name: string }> = [];
  for (const [name, def] of Object.entries(repo)) {
    if (def.testid) testids.push({ id: def.testid, name });
    for (const t of textsOf(def)) texts.push({ text: t.text, regex: t.regex, kind: def.role ?? 'text', where: [`objects:${name}`], uses: 1 });
  }
  return { texts, testids };
}

// ────────────────────────────────────────── matching
const unescape = (s: string): string => s.replace(/\\(.)/g, '$1');

/** Fixed pieces of a pattern with its variable parts (\d+, \s*, .+, [a-f]{7}, (a|b) ...) cut out. */
export function fixedParts(source: string): string[] {
  const cut = source
    .replace(/\(\?[:=!]/g, '(')
    .replace(/(?<!\\)\((?:[^()\\]|\\.)*\)[?*+]?(\{\d+(,\d*)?\})?/g, '\u0000')
    .replace(/(?<!\\)\[(?:[^\]\\]|\\.)*\][?*+]?(\{\d+(,\d*)?\})?/g, '\u0000')
    .replace(/\\[dDsSwWbB][?*+]?(\{\d+(,\d*)?\})?/g, '\u0000')
    .replace(/\.[?*+]/g, '\u0000')
    .replace(/[\^$]/g, '');
  return cut.split('\u0000').map((p) => unescape(p).replace(/\s+/g, ' ').trim().toLowerCase()).filter((p) => p.length >= 4);
}

function countOf(hay: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  for (let i = hay.indexOf(needle); i >= 0 && n < 999; i = hay.indexOf(needle, i + needle.length)) n++;
  return n;
}

/** Is this text in the site's code? Returns the status and how many times it was seen. */
export function lookup(site: string, f: Found): { status: Exclude<Status, 'CHANGED'>; hits: number } {
  if (!f.regex) {
    const needle = f.text.replace(/\s+/g, ' ').trim().toLowerCase();
    const hits = countOf(site, needle);
    return { status: hits > 0 ? 'FOUND' : 'NOT FOUND', hits };
  }
  let source = f.text.replace(/\(\?<[^>]+>/g, '(?:').replace(/\\\//g, '/');
  source = source.replace(/(^|\|)\^/g, '$1').replace(/\$(\||$)/g, '$1').replace(/\\s\*(?=$)/, '').replace(/^\\s\*/, '');
  try {
    const hits = [...site.matchAll(new RegExp(source, 'gi'))].length;
    if (hits > 0) return { status: 'FOUND', hits };
  } catch {
    /* fall through to the fixed parts */
  }
  const parts = fixedParts(f.text);
  if (parts.length === 0) return { status: 'TOO GENERIC', hits: 0 };
  const all = parts.every((p) => site.includes(p));
  return { status: all ? 'FOUND (parts)' : 'NOT FOUND', hits: all ? 1 : 0 };
}

export interface CheckInput {
  code: Found[];
  objects: Found[];
  testids: Array<{ id: string; name: string }>;
  site: string;
  oldSite?: string;
}

export function check(i: CheckInput): { rows: Row[]; testidMissing: Array<{ id: string; name: string }> } {
  const rows: Row[] = [];
  for (const f of [...i.objects, ...i.code]) {
    const now = lookup(i.site, f);
    let status: Status = now.status;
    if (i.oldSite && now.status === 'NOT FOUND' && lookup(i.oldSite, f).status !== 'NOT FOUND') status = 'CHANGED';
    rows.push({ ...f, status, hits: now.hits });
  }
  const testidMissing = i.testids.filter((t) => !i.site.includes(t.id.toLowerCase()));
  return { rows, testidMissing };
}

// ────────────────────────────────────────── report
function render(rows: Row[], testidMissing: Array<{ id: string; name: string }>, meta: { ref: string; since?: string; commit: string; files: number }): string {
  const by = (s: Status) => rows.filter((r) => r.status === s);
  const line = (r: Row) => `| ${r.status} | ${r.regex ? '/' + r.text.replace(/\|/g, '\\|') + '/' : r.text.replace(/\|/g, '\\|')} | ${r.kind} | ${r.where.join(', ')}${r.uses > 3 ? ` (+${r.uses - 3} more)` : ''} | ${r.hits} |`;
  const section = (title: string, list: Row[], note: string) => (list.length ? `\n## ${title} (${list.length})\n${note}\n\n| Status | Text | Kind | Where in our script | Seen in site |\n|---|---|---|---|---|\n${list.map(line).join('\n')}\n` : '');
  return [
    `# Locator check`,
    `Site branch: **${meta.ref}** at commit \`${meta.commit}\` (${meta.files} source files)${meta.since ? ` · compared with **${meta.since}**` : ''}`,
    `Texts checked: ${rows.length} · FOUND ${by('FOUND').length} · FOUND (parts) ${by('FOUND (parts)').length} · NOT FOUND ${by('NOT FOUND').length} · CHANGED ${by('CHANGED').length} · TOO GENERIC ${by('TOO GENERIC').length}`,
    section('CHANGED since ' + (meta.since ?? '-'), by('CHANGED'), 'These texts were in the site at the old branch and are gone now: the label was renamed or removed. Update them (the "Where" column says which file and line).'),
    section('NOT FOUND', by('NOT FOUND'), 'Not in the site\'s code. Possible reasons: renamed (use --since to prove it), text that comes from the server or a third-party widget (support chat, the framework\'s 404 page), or text built from variables the check could not follow.'),
    testidMissing.length ? `\n## data-testid values of the object repository that are NOT in the site (${testidMissing.length})\n${testidMissing.map((t) => `- \`${t.id}\` (object ${t.name})`).join('\n')}\n` : '',
    section('FOUND (parts)', by('FOUND (parts)'), 'The text is built from variables; every fixed piece of it is in the site.'),
    section('TOO GENERIC', by('TOO GENERIC'), 'Patterns made only of variable parts (numbers, spaces): nothing fixed to look for.'),
  ].join('\n');
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : undefined;
}

function fromInput(key: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { loadInput } = require('../core/excel/readInput') as typeof import('../core/excel/readInput');
    return loadInput().get(key).trim();
  } catch {
    return '';
  }
}

export async function main(): Promise<number> {
  const siteArg = arg('--site') || process.env.SITE_CODE_PATH || fromInput('SITE_CODE_PATH');
  const ref = arg('--ref') || process.env.SITE_CODE_REF || fromInput('SITE_CODE_REF') || 'origin/qa';
  const srcDir = process.env.SITE_CODE_SRC || DEFAULT_SRC;
  const since = arg('--since');
  if (!siteArg) {
    console.error('The site code folder is not set. Fill SITE_CODE_PATH on the Input sheet (the local clone of the Testable platform repository), or run with --site "<folder>".');
    return 2;
  }
  // the clone may sit one folder deeper than the folder that was given
  let site = path.resolve(siteArg);
  if (!fs.existsSync(path.join(site, '.git')) && fs.existsSync(site)) {
    const inner = fs.readdirSync(site, { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(site, d.name, '.git')));
    if (inner.length === 1) site = path.join(site, inner[0].name);
  }
  if (!fs.existsSync(site)) { console.error(`Folder not found: ${site}`); return 2; }

  if (process.argv.includes('--fetch')) {
    console.log('git fetch origin ...');
    git(site, ['fetch', 'origin']);
  }
  let commit = '';
  try {
    commit = git(site, ['rev-parse', '--short', `${ref}^{commit}`]).toString().trim();
  } catch {
    console.error(`Branch "${ref}" does not exist in ${site}. Run with --fetch, or set SITE_CODE_REF (for example origin/qa).`);
    return 2;
  }
  const now = readSiteText(site, ref, srcDir);
  const old = since ? readSiteText(site, since, srcDir) : undefined;

  const objs = extractObjectLocators();
  const { rows, testidMissing } = check({ code: extractCodeLocators(ROOT), objects: objs.texts, testids: objs.testids, site: now.text, oldSite: old?.text });

  const md = render(rows, testidMissing, { ref, since, commit, files: now.files });
  const dir = path.join(ROOT, 'results');
  fs.mkdirSync(dir, { recursive: true });
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  fs.writeFileSync(path.join(dir, `locator-check_${stamp}.md`), md);
  fs.writeFileSync(path.join(dir, `locator-check_${stamp}.json`), JSON.stringify({ ref, since, commit, rows, testidMissing }, null, 2));

  const count = (s: Status) => rows.filter((r) => r.status === s).length;
  console.log(`\nLocator check against ${ref} (${commit}, ${now.files} source files)`);
  console.log(`  checked ${rows.length} texts: FOUND ${count('FOUND')}, FOUND (parts) ${count('FOUND (parts)')}, NOT FOUND ${count('NOT FOUND')}, CHANGED ${count('CHANGED')}, TOO GENERIC ${count('TOO GENERIC')}`);
  for (const r of rows.filter((x) => x.status === 'CHANGED' || x.status === 'NOT FOUND')) console.log(`  ${r.status === 'CHANGED' ? '✘ CHANGED  ' : '⚠ NOT FOUND'} ${r.regex ? '/' + r.text + '/' : r.text}   ← ${r.where[0]}`);
  if (testidMissing.length) console.log(`  ✘ ${testidMissing.length} data-testid value(s) of the object repository are not in the site: ${testidMissing.map((t) => t.id).join(', ')}`);
  console.log(`  Report: results/locator-check_${stamp}.md`);
  const bad = count('NOT FOUND') + count('CHANGED') + testidMissing.length;
  return process.argv.includes('--strict') && bad > 0 ? 1 : 0;
}

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exit(2); });
}
