/**
 * Runs the whole flow once per repo+branch, one after another (never at the same time).
 *   npm run test:branches                 -> every entry of BRANCHES on the Input sheet
 *   npm run test:branches -- A owner/repo2:B  -> only the entries given here
 * An entry is one of:
 *   BRANCH                         -> uses REPO from the Input sheet
 *   owner/repo:BRANCH              -> a different repository
 *   https://github.com/owner/repo/tree/BRANCH   -> the same, as a link
 * Output:  results/run_<time>/<repo>__<BRANCH>/{testable-results.xlsx, evidence, records, playwright-report}  +  results/run_<time>/summary.json
 * The Input workbook is only read (results are not written back into it). A failing run never stops the next one.
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { RUN_ID, RUN_PARENT_DIR, ROOT } from '../core/paths';
import { loadInput } from '../core/excel/readInput';

interface Job { repo: string; branch: string }
const input = loadInput();
const defaultRepo = input.get('REPO').trim();

function parse(entry: string): Job {
  const link = entry.match(/^(?:https?:\/\/)?(?:www\.)?(?:github\.com\/)?([^/\s:]+\/[^/\s:]+?)(?:\.git)?\/tree\/(.+?)\/?$/i);
  if (link) return { repo: link[1], branch: decodeURIComponent(link[2]) };
  const pair = entry.match(/^([^/\s:]+\/[^/\s:]+):(.+)$/);
  if (pair) return { repo: pair[1], branch: pair[2].trim() };
  return { repo: defaultRepo, branch: entry };
}
const split = (s: string): string[] => s.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);

const cli = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const seen = new Set<string>();
const jobs = (cli.length ? cli.flatMap(split) : split(input.get('BRANCHES'))).map(parse).filter((j) => {
  const k = `${j.repo}:${j.branch}`; if (seen.has(k)) return false; seen.add(k); return true;
});
if (!jobs.length) { console.error('Nothing to run: fill BRANCHES on the Input sheet (comma separated) or pass entries after "--".'); process.exit(1); }
if (jobs.some((j) => !j.repo)) { console.error('An entry has no repository: fill REPO on the Input sheet or write the entry as owner/repo:BRANCH.'); process.exit(1); }

fs.mkdirSync(RUN_PARENT_DIR, { recursive: true });
console.log(`\nRun ${RUN_ID}: ${jobs.length} run(s), one after another:\n${jobs.map((j) => `  ${j.repo} : ${j.branch}`).join('\n')}\n`);

const pw = path.join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
const clean = (s: string): string => s.replace(/[^A-Za-z0-9_.-]+/g, '_');
const summary: { repo: string; branch: string; exitCode: number; started: string; finished: string; folder: string }[] = [];

jobs.forEach((job, i) => {
  const folder = `${clean(job.repo.split('/').pop() || job.repo)}__${clean(job.branch)}`;
  console.log(`\n=== Run ${i + 1}/${jobs.length}: ${job.repo} : ${job.branch} ===`);
  const started = new Date().toISOString();
  // this branch first; the other branches of the SAME repo follow, so the "change branch" case can still use a second one
  const ordered = [job.branch, ...jobs.filter((j) => j.repo === job.repo && j.branch !== job.branch).map((j) => j.branch)].join(',');
  const r = spawnSync(process.execPath, [pw, 'test', 'modules/flow'], {
    cwd: ROOT, stdio: 'inherit',
    env: { ...process.env, RUN_ID, BRANCH_DIR: folder, REPO_OVERRIDE: job.repo, BRANCHES_OVERRIDE: ordered, WRITE_RESULTS_TO_INPUT_OVERRIDE: 'N' },
  });
  summary.push({ ...job, exitCode: r.status ?? -1, started, finished: new Date().toISOString(), folder });
  fs.writeFileSync(path.join(RUN_PARENT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
});

console.log('\nAll runs done:');
for (const s of summary) console.log(`  ${s.exitCode === 0 ? 'OK     ' : 'FAILED '} ${s.repo} : ${s.branch}  ->  results/run_${RUN_ID}/${s.folder}`);
