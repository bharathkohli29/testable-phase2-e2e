import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Makes the "dummy PR" commit: clones the repository into the run folder, adds one line with the current date and time to the
 * README, commits and pushes it to the SAME branch. Runs on the computer that runs the tests, with whatever git sign-in that
 * computer already has - no password or token is ever read, typed or stored here (a prompt is switched off, so a missing
 * sign-in fails at once with git's own message instead of hanging).
 */
export interface DummyCommit {
  sha: string;
  message: string;
  dir: string;
  readme: string;
  line: string;
  remoteHead: string;
}

const run = (args: string[], cwd?: string, timeoutMs = 180_000, interactive = false): Promise<string> =>
  new Promise((resolve, reject) => {
    // interactive = false: a missing sign-in fails at once. interactive = true: git's own credential manager may open ITS sign-in
    // window (the person signs in there; nothing is typed or read by the tests).
    const env = interactive ? { ...process.env } : { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' };
    execFile('git', args, { cwd, timeout: timeoutMs, windowsHide: false, env }, (err, stdout, stderr) => {
      if (err) {
        const text = `${stderr || ''} ${stdout || ''} ${err.message}`.replace(/https:\/\/[^@\s/]+@/g, 'https://').replace(/\s+/g, ' ').trim();
        reject(new Error(`git ${args[0]} failed: ${text.slice(0, 400)}`));
      } else resolve(String(stdout).trim());
    });
  });

const two = (n: number): string => String(n).padStart(2, '0');
export const stamp = (d = new Date()): string =>
  `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;

export async function pushDummyCommit(o: { repo: string; branch: string; baseDir: string }): Promise<DummyCommit> {
  const dir = path.join(o.baseDir, 'clone');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(o.baseDir, { recursive: true });
  await run(['--version']);
  await run(['clone', '--quiet', '--depth', '1', '--single-branch', '--branch', o.branch, /^(https?:|file:|\/|[A-Za-z]:\\)/.test(o.repo) ? o.repo : `https://github.com/${o.repo}.git`, dir]);

  const found = fs.readdirSync(dir).find((f) => /^readme(\.md|\.markdown|\.txt)?$/i.test(f));
  const readme = found ?? 'README.md';
  const line = `Dummy PR - ${stamp()}`;
  fs.appendFileSync(path.join(dir, readme), `${fs.existsSync(path.join(dir, readme)) ? '\n\n' : ''}${line}\n`);

  await run(['add', readme], dir);
  const identity = (await run(['config', 'user.email'], dir).catch(() => '')) ? [] : ['-c', 'user.name=Testable Phase2 E2E', '-c', 'user.email=phase2-e2e@users.noreply.github.com'];
  const message = line;
  await run([...identity, 'commit', '--quiet', '-m', message], dir);
  const sha = await run(['rev-parse', 'HEAD'], dir);
  const push = ['push', '--quiet', 'origin', `HEAD:refs/heads/${o.branch}`];
  try {
    await run(push, dir);
  } catch (e) {
    if (!/prompts? disabled|interactivity|could not read (username|password)|authentication failed|terminal prompt/i.test((e as Error).message)) throw e;
    // no saved git sign-in: let git's credential manager ask once (a sign-in window may appear - sign in with the account that has push access)
    console.log('  ↪ git has no saved sign-in for GitHub - waiting up to 4 minutes for you to sign in in the window git opens ...');
    await run(push, dir, 240_000, true);
  }
  const remoteHead = (await run(['ls-remote', 'origin', `refs/heads/${o.branch}`], dir)).split(/\s+/)[0] ?? '';
  return { sha, message, dir, readme, line, remoteHead };
}
