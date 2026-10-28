import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { ROOT } from '../paths';
import { loadObjects, ObjectDef, OBJECTS_DIR } from './objects';
import { loadExpected, EXPECTED_DIR } from './expected';
import { lookup, readSiteText } from '../../scripts/checkLocators';

/**
 * DYNAMIC OBJECT REPOSITORY: "before the run, look at the site's code; if something we use was changed there, change it in /objects".
 *
 * How it decides (no guessing):
 *   1. It remembers the commit of the site's code that it saw at the last run (.state/site-commit.json).
 *   2. It reads git's own list of changed lines between that commit and the commit that is checked now.
 *   3. For every text in /objects (button name, label, placeholder...) it looks for a changed line pair "- old line / + new line" where the
 *      OLD line contains our text and the line was REPLACED by exactly one new line. The part that differs is the new text.
 *   4. It writes the new text into the JSON entry and records the change in results/object-updates_<time>.md.
 *   Anything unclear (text deleted, one line became several, text built from variables, the text is still used elsewhere, regular
 *   expressions, data-testid gone) is NOT changed: it is listed as "needs a person". After the edit the repository is validated again;
 *   if it would be invalid, the files are put back as they were.
 * It only READS the site's repository (git diff / rev-parse). It never pulls, checks out or writes there.
 */
export interface UpdateOptions {
  site: string;
  ref: string;
  srcDir: string;
  objectsDir?: string;
  expectedDir?: string;
  stateFile?: string;
  since?: string; // compare with this commit instead of the remembered one
  dry?: boolean; // report only: change no file, do not move the remembered commit
}
export interface Change { object: string; file: string; from: string; to: string; evidence: string; where: string }
export interface Review { object: string; text: string; reason: string }
export interface UpdateResult {
  status: 'baseline' | 'unchanged' | 'compared' | 'cannot-compare';
  commit: string;
  since?: string;
  changes: Change[];
  review: Review[];
  message: string;
}

const STATE_FILE = path.join(ROOT, '.state', 'site-commit.json');
const norm = (s: string): string => s.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&apos;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();
const arr = (v: string | string[] | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

function git(site: string, args: string[]): string {
  const r = spawnSync('git', ['-C', site, ...args], { maxBuffer: 1024 * 1024 * 1024 });
  if (r.error) throw new Error(`git could not be started: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr.toString().trim()}`);
  return r.stdout.toString('utf8');
}

/** The site clone may sit one folder deeper than the folder that was given. */
export function findSiteRepo(given: string): string {
  let site = path.resolve(given);
  if (!fs.existsSync(path.join(site, '.git')) && fs.existsSync(site)) {
    const inner = fs.readdirSync(site, { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(site, d.name, '.git')));
    if (inner.length === 1) site = path.join(site, inner[0].name);
  }
  if (!fs.existsSync(site)) throw new Error(`Folder not found: ${site}`);
  return site;
}

interface Hunk { file: string; line: number; minus: string[]; plus: string[] }

export function parseDiff(diff: string): Hunk[] {
  const hunks: Hunk[] = [];
  let file = '';
  let cur: Hunk | undefined;
  for (const l of diff.split('\n')) {
    if (l.startsWith('+++ ')) { file = l.slice(4).replace(/^b\//, ''); continue; }
    if (l.startsWith('--- ') || l.startsWith('diff ') || l.startsWith('index ')) { cur = undefined; continue; }
    const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (m) { cur = { file, line: Number(m[1]), minus: [], plus: [] }; hunks.push(cur); continue; }
    if (!cur) continue;
    if (l.startsWith('-')) cur.minus.push(l.slice(1));
    else if (l.startsWith('+')) cur.plus.push(l.slice(1));
  }
  return hunks;
}

const DELIMS = '<>"\'`{}';
/** Widens [a,b) of a line to the whole text between the nearest delimiters (the text node / the string). */
function node(line: string, a: number, b: number): string {
  let l = a;
  while (l > 0 && !DELIMS.includes(line[l - 1])) l--;
  let r = b;
  while (r < line.length && !DELIMS.includes(line[r])) r++;
  return line.slice(l, r);
}
function word(line: string, a: number, b: number): [number, number] {
  let l = a;
  while (l > 0 && /[A-Za-z0-9]/.test(line[l - 1])) l--;
  let r = b;
  while (r < line.length && /[A-Za-z0-9]/.test(line[r])) r++;
  return [l, r];
}

/** For ONE old/new line pair: what did the text become? Returns undefined when it cannot be said with certainty. */
export function newTextFor(text: string, oldLine: string, newLine: string): { to: string; why: string } | undefined {
  let p = 0;
  while (p < oldLine.length && p < newLine.length && oldLine[p] === newLine[p]) p++;
  let s = 0;
  while (s < oldLine.length - p && s < newLine.length - p && oldLine[oldLine.length - 1 - s] === newLine[newLine.length - 1 - s]) s++;
  const a1 = p, b1 = oldLine.length - s, a2 = p, b2 = newLine.length - s;
  if (b1 <= a1 || b2 <= a2) return undefined; // pure insertion or deletion: not a rename
  const old1 = node(oldLine, a1, b1);
  const new1 = node(newLine, a2, b2);
  const bad = (t: string): boolean => !t.trim() || t.length > 80 || /[{}<>]/.test(t) || /\$\{/.test(t);
  if (bad(new1) || bad(old1)) return undefined;
  if (norm(old1) === norm(text)) return { to: new1.trim().replace(/\s+/g, ' '), why: `"${old1.trim()}" -> "${new1.trim()}"` };
  if (norm(old1).includes(norm(text))) {
    // our text is only a part of the changed text: replace the changed WORD(S) inside our text
    const [wl, wr] = word(oldLine, a1, b1);
    const [nl, nr] = word(newLine, a2, b2);
    const w1 = oldLine.slice(wl, wr), w2 = newLine.slice(nl, nr);
    if (!w1 || !w2 || /[{}<>]/.test(w1 + w2)) return undefined;
    const re = new RegExp(`\\b${w1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const hits = text.match(new RegExp(re.source, 'gi'));
    if (!hits || hits.length !== 1) return undefined;
    return { to: text.replace(re, w2), why: `word "${w1}" -> "${w2}" in "${old1.trim()}"` };
  }
  return undefined;
}

interface Entry { dir: string; object: string; file: string; text: string; def: ObjectDef; kind: 'text' | 'testid' }

function entriesOf(dir: string, expDir: string): Entry[] {
  const repo = loadObjects(dir);
  const origin: Record<string, string> = {};
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json') && x !== 'routes.json')) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Record<string, unknown>;
    for (const k of Object.keys(data)) origin[k] = f;
  }
  const out: Entry[] = [];
  for (const [object, def] of Object.entries(repo)) {
    for (const text of [...arr(def.name), ...arr(def.text), ...arr(def.placeholder), ...arr(def.label)]) out.push({ dir, object, file: origin[object], text, def, kind: 'text' });
    if (def.testid) out.push({ dir, object, file: origin[object], text: def.testid, def, kind: 'testid' });
  }
  // expected texts: exact texts and plain-word patterns can be updated; real patterns (with symbols) are written by people
  if (fs.existsSync(expDir)) {
    const exp = loadExpected(expDir);
    const eorigin: Record<string, string> = {};
    for (const f of fs.readdirSync(expDir).filter((x) => x.endsWith('.json'))) for (const k of Object.keys(JSON.parse(fs.readFileSync(path.join(expDir, f), 'utf8')))) eorigin[k] = f;
    for (const [object, d] of Object.entries(exp)) {
      const text = d.text ?? d.regex!;
      if (d.regex !== undefined && !/^[A-Za-z0-9 ,':&-]+$/.test(text)) continue;
      out.push({ dir: expDir, object: `expected:${object}`, file: `expected/${eorigin[object]}`, text, def: { match: 'exact' } as ObjectDef, kind: 'text' });
    }
  }
  return out;
}

function readState(file: string): { ref: string; commit: string } | undefined {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return undefined; }
}
function writeState(file: string, ref: string, commit: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ ref, commit, savedAt: new Date().toISOString() }, null, 2));
}

const NOT_TESTS = [':(exclude)*.test.*', ':(exclude)*.spec.*', ':(exclude)*__tests__*', ':(exclude)*/tests/*', ':(exclude)*/test/*'];

export function updateObjects(o: UpdateOptions): UpdateResult {
  const dir = o.objectsDir ?? OBJECTS_DIR;
  const stateFile = o.stateFile ?? STATE_FILE;
  const commit = git(o.site, ['rev-parse', `${o.ref}^{commit}`]).trim();
  const state = readState(stateFile);
  const since = o.since ?? state?.commit;
  const res: UpdateResult = { status: 'unchanged', commit, since, changes: [], review: [], message: '' };

  if (!since) {
    res.status = 'baseline';
    res.message = `First look at the site's code (${o.ref} = ${commit.slice(0, 8)}). Nothing to compare with yet; this commit is remembered for the next run.`;
    if (!o.dry) writeState(stateFile, o.ref, commit);
    return res;
  }
  try {
    git(o.site, ['cat-file', '-e', `${since}^{commit}`]);
  } catch {
    res.status = 'cannot-compare';
    res.message = `The remembered commit ${since.slice(0, 8)} is not in the site clone any more (history rewritten, or the clone is new). No comparison possible; ${commit.slice(0, 8)} is remembered now. Run npm run locators:check to see what is missing.`;
    if (!o.dry) writeState(stateFile, o.ref, commit);
    return res;
  }
  if (since === commit) {
    res.message = `The site's code has not changed since the last run (${commit.slice(0, 8)}).`;
    return res;
  }

  const hunks = parseDiff(git(o.site, ['diff', '-U0', '--no-color', '--no-ext-diff', since, commit, '--', o.srcDir, ...NOT_TESTS]));
  const now = readSiteText(o.site, commit, o.srcDir).text;
  const expDir = o.expectedDir ?? EXPECTED_DIR;
  const entries = entriesOf(dir, expDir);
  const backups = new Map<string, string>();
  const edits: Array<{ e: Entry; to: string }> = [];

  for (const e of entries) {
    if (e.kind === 'testid') {
      if (!now.includes(e.text.toLowerCase())) res.review.push({ object: e.object, text: e.text, reason: 'this data-testid is not in the site\'s code any more' });
      continue;
    }
    if (e.def.match === 'regex') continue; // regular expressions are written by people: never edited automatically
    const f = { text: e.text, regex: false, kind: 'object', where: [], uses: 1 };
    if (lookup(now, f).status !== 'NOT FOUND') continue; // still in the site's code: nothing changed for it
    // the text is gone: find the line it was replaced on
    const found = new Map<string, { why: string; where: string }>();
    let removedSomewhere = false;
    for (const h of hunks) {
      const idx = h.minus.findIndex((l) => norm(l).includes(norm(e.text)));
      if (idx < 0) continue;
      removedSomewhere = true;
      if (h.minus.length !== h.plus.length) continue;
      const r = newTextFor(e.text, h.minus[idx], h.plus[idx]);
      if (r) found.set(r.to, { why: r.why, where: `${h.file}:${h.line + idx}` });
    }
    if (found.size === 1) {
      const [to, ev] = [...found.entries()][0];
      if (norm(to) === norm(e.text)) continue; // only the spelling of upper/lower case changed: matching is case-insensitive
      res.changes.push({ object: e.object, file: e.file, from: e.text, to, evidence: ev.why, where: ev.where });
      edits.push({ e, to });
    } else if (found.size > 1) {
      res.review.push({ object: e.object, text: e.text, reason: `it was changed in several places to different texts (${[...found.keys()].map((k) => `"${k}"`).join(', ')})` });
    } else {
      res.review.push({ object: e.object, text: e.text, reason: removedSomewhere ? 'its line was changed in a way that is not a simple rename (deleted, split or rebuilt)' : 'it is not in the site\'s code and was not in the changes since the last run (a text from the server or a third party, or removed earlier)' });
    }
  }

  if (!o.dry && edits.length) {
    for (const x of edits) { const full = path.join(x.e.dir, path.basename(x.e.file)); if (!backups.has(full)) backups.set(full, fs.readFileSync(full, 'utf8')); }
    try {
      for (const { e, to } of edits) {
        const file = path.join(e.dir, path.basename(e.file));
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        const key = `"${e.object.replace(/^expected:/, '')}"`;
        const i = lines.findIndex((l) => l.trimStart().startsWith(`${key}:`));
        if (i < 0) throw new Error(`entry ${key} not found in ${e.file}`);
        const from = JSON.stringify(e.text);
        if (!lines[i].includes(from)) throw new Error(`entry ${key} in ${e.file} is not written on one line, so the text could not be replaced safely`);
        lines[i] = lines[i].replace(from, JSON.stringify(to));
        fs.writeFileSync(file, lines.join('\n'));
      }
      loadObjects(dir); // must still be valid
      if (fs.existsSync(expDir)) loadExpected(expDir);
    } catch (err) {
      for (const [f, text] of backups) fs.writeFileSync(f, text);
      res.review.push(...res.changes.map((c) => ({ object: c.object, text: c.from, reason: `the edit was undone (${(err as Error).message})` })));
      res.changes = [];
    }
  }
  res.status = 'compared';
  res.message = `Site code ${since.slice(0, 8)} -> ${commit.slice(0, 8)}: ${res.changes.length} object text(s) ${o.dry ? 'would be ' : ''}updated, ${res.review.length} need a person.`;
  if (!o.dry) writeState(stateFile, o.ref, commit);
  return res;
}

export function renderReport(r: UpdateResult, o: { ref: string; dry?: boolean }): string {
  const L: string[] = [`# Object repository update (${o.dry ? 'dry run, nothing changed' : 'applied'})`, '', `Branch checked: ${o.ref}. ${r.message}`, ''];
  L.push(`## Updated automatically (${r.changes.length})`, '');
  if (r.changes.length) { L.push('| Object | Old text | New text | Proof (changed line in the site code) |', '|---|---|---|---|'); for (const c of r.changes) L.push(`| ${c.object} (${c.file}) | ${c.from} | ${c.to} | ${c.where}: ${c.evidence} |`); } else L.push('None.');
  L.push('', `## Needs a person (${r.review.length})`, '');
  if (r.review.length) for (const v of r.review) L.push(`- **${v.object}** "${v.text}": ${v.reason}`); else L.push('None.');
  return L.join('\n') + '\n';
}
