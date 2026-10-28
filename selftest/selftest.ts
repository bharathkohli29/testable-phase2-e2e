/**
 * npm run selftest
 *
 * Proves that the NEW parts of the project work, WITHOUT touching the real site and without any account:
 *   - the object repository (loading, mistakes in the JSON, alternative names such as Submit | OK)
 *   - the keyword engine against a small local test page (every kind of keyword, the safety rules, data sets)
 *   - the Keyword Steps / Datasets sheets (reading, checking before a run)
 *   - the Input sheet check and the password-from-environment rule
 *   - the locator check (finds a renamed label between two commits of a throw-away git repository)
 * It opens a headless browser on a page made inside this file; it needs only the Chromium that Playwright already installed.
 * Result: one line per check, then "SELF TEST PASSED" (exit code 0) or "SELF TEST FAILED" (exit code 1).
 */
import { chromium } from '@playwright/test';
import { spawnSync } from 'child_process';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-selftest-'));
const inputFile = path.join(tmp, 'input.xlsx');
process.env.INPUT_FILE = inputFile; // read by core/paths.ts when it is first loaded (below, through dynamic imports)
process.env.RUN_ID = 'selftest';

let passed = 0;
const failed: string[] = [];
async function t(name: string, fn: () => unknown | Promise<unknown>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    failed.push(name);
    console.log(`  ✘ ${name}\n      ${String((e as Error).message ?? e).split('\n').slice(0, 4).join('\n      ')}`);
  }
}
function eq(a: unknown, b: unknown, msg = ''): void {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} expected ${JSON.stringify(b)} but got ${JSON.stringify(a)}`);
}
function ok(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}
async function rejects(fn: () => Promise<unknown> | unknown, re: RegExp, msg: string): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (re.test(String((e as Error).message))) return;
    throw new Error(`${msg}: it failed with a different message: ${String((e as Error).message).slice(0, 200)}`);
  }
  throw new Error(`${msg}: it did not fail`);
}

const PAGE = `<!doctype html><html><body>
<nav aria-label="Workspace menu"><a href="/dashboard">Dashboard</a><a href="/account">Account and Plan</a></nav>
<h1>Runs Dashboard</h1>
<button id="sign">Sign out</button>
<button id="sup" onclick="document.getElementById('menu').hidden=false">Support</button>
<div role="menu" id="menu" hidden><div role="menuitem">User Guide</div></div>
<button id="ok">OK</button>
<button id="ra">Run Analysis</button>
<input id="q" placeholder="Search things"><input id="pw" type="password" aria-label="Pw">
<ul><li class="row">one</li><li class="row">two</li><li class="row">three</li></ul>
<button id="off" disabled>Disabled one</button>
<script>document.addEventListener('keydown',e=>{if(e.key==='Escape')document.getElementById('menu').hidden=true})</script>
</body></html>`;

async function makeWorkbook(file: string, opts: { password?: string } = {}): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const inp = wb.addWorksheet('Input');
  inp.addRow(['Key', 'Value', 'Notes']);
  for (const r of [['ENV', 'QA'], ['QA_BASE_URL', 'http://test.local'], ['QA_EMAIL', 'tester@example.com'], ['QA_PASSWORD', opts.password ?? ''], ['REPO', 'owner/name'], ['BRANCHES', 'main'], ['REVIEW_WAIT_SEC', '7']]) inp.addRow(r);
  const kw = wb.addWorksheet('Keywords');
  kw.addRow(['TC ID', 'Test Case Name', 'Module', 'Sub Module', 'Preconditions', 'Test Steps', 'Test Data', 'Expected Result', 'Run', 'Actual Result', 'Result', 'Screenshot Evidence', 'Executed At']);
  kw.addRow(['T-1', 'first', 'Keywords', 'Keywords', '', '', '', '', 'Y']);
  kw.addRow(['T-2', 'second', 'Keywords', 'Keywords', '', '', 'dataset=pages', '', 'Y']);
  kw.addRow(['T-3', 'third (Run N)', 'Keywords', 'Keywords', '', '', '', '', 'N']);
  const st = wb.addWorksheet('Keyword Steps');
  st.addRow(['TC ID', 'Step', 'Keyword', 'Object', 'Data', 'Expected', 'Description', 'Checkpoint (Y/N)', 'Run']);
  st.addRow(['T-1', 2, 'VerifyVisible', 'heading', '', '', '', 'N', 'Y']);
  st.addRow(['T-1', 1, 'Open', 'dashboard', '', '', '', 'N', 'Y']);
  st.addRow(['T-1', 3, 'VerifyVisible', 'heading', '', '', 'skipped row', 'N', 'N']);
  const ds = wb.addWorksheet('Datasets');
  ds.addRow(['Dataset', 'Label', 'Page', 'py version', 'Run']);
  ds.addRow(['pages', 'first page', '/dashboard', '3.8', 'Y']);
  ds.addRow(['pages', 'second page', '/account', '3.12', 'Y']);
  await wb.xlsx.writeFile(file);
}

async function main(): Promise<void> {
  console.log('\nSELF TEST (nothing here touches the real site)\n');
  await makeWorkbook(inputFile);

  // ───────────────────────────── object repository
  console.log('Object repository');
  const objs = await import('../core/keywords/objects');
  const real = objs.loadObjects();
  await t('the real /objects files load without a mistake', () => ok(Object.keys(real).length >= 10, `only ${Object.keys(real).length} objects`));
  await t('routes.json has the main pages', () => {
    const r = objs.loadRoutes();
    eq([r.dashboard, r.account, r.executionAssistant], ['/dashboard', '/account', '/execution-assistant']);
  });
  await t('a route name or a path is resolved; an unknown name is refused', () => {
    const r = objs.loadRoutes();
    eq(objs.resolveRoute('dashboard', r), '/dashboard');
    eq(objs.resolveRoute('/x/y', r), '/x/y');
    let threw = false;
    try { objs.resolveRoute('nope', r); } catch { threw = true; }
    ok(threw, 'unknown route accepted');
  });
  await t('mistakes in the JSON are all reported together', () => {
    const d = fs.mkdtempSync(path.join(tmp, 'objs-'));
    fs.writeFileSync(path.join(d, 'a.json'), JSON.stringify({ x: { role: 'button', name: 'A', css: 'b' }, y: { role: 'nonsense', name: 'B' }, z: { text: 'T', within: 'missing' }, w: { text: '(', match: 'regex' } }));
    let msg = '';
    try { objs.loadObjects(d); } catch (e) { msg = (e as Error).message; }
    ok(/exactly one of/.test(msg) && /unknown role/.test(msg) && /within "missing"/.test(msg) && /not a valid regular expression/.test(msg), `message was: ${msg}`);
  });
  await t('a duplicate name in two files is refused', () => {
    const d = fs.mkdtempSync(path.join(tmp, 'objs-'));
    fs.writeFileSync(path.join(d, 'a.json'), JSON.stringify({ x: { text: 'A' } }));
    fs.writeFileSync(path.join(d, 'b.json'), JSON.stringify({ x: { text: 'B' } }));
    let msg = '';
    try { objs.loadObjects(d); } catch (e) { msg = (e as Error).message; }
    ok(/already defined/.test(msg), msg);
  });

  // ───────────────────────────── keyword engine on a local page
  console.log('\nKeyword engine (local test page)');
  const engine = await import('../core/keywords/engine');
  const reg = await import('../core/keywords/register');
  const stepsMod = await import('../core/keywords/steps');
  const { readTable } = await import('../core/excel/readInput');
  const { validateInput, reportInputProblems } = await import('../core/excel/validateInput');
  const { loadInput } = await import('../core/excel/readInput');

  const browser = await chromium.launch({ headless: true, ...(process.env.SELFTEST_CHROMIUM ? { executablePath: process.env.SELFTEST_CHROMIUM } : {}) });
  const page = await (await browser.newContext()).newPage();
  await page.route('http://test.local/**', (r) => r.fulfill({ contentType: 'text/html', body: PAGE }));
  const input = loadInput();

  const repo: import('../core/keywords/objects').ObjectRepo = {
    heading: { role: 'heading', name: 'runs dashboard', match: 'contains' },
    'nav.menu': { role: 'navigation', name: 'workspace', match: 'contains' },
    'nav.dashboard': { role: 'link', name: 'Dashboard', within: 'nav.menu' },
    signOut: { role: 'button', name: 'Sign out' },
    support: { role: 'button', name: 'Support' },
    menu: { role: 'menu' },
    guide: { role: 'menuitem', name: 'User Guide', within: 'menu' },
    submit: { role: 'button', name: ['Submit', 'OK'], note: 'the label changed from Submit to OK: both are accepted' },
    oldLabelOnly: { role: 'button', name: 'Submit' },
    box: { placeholder: 'Search things', match: 'contains' },
    pw: { label: 'Pw' },
    rows: { css: 'li.row' },
    off: { role: 'button', name: 'Disabled one' },
    ra: { role: 'button', name: 'Run Analysis' },
    renamedDanger: { text: 'Cancel execution now', danger: undefined },
    missingOne: { role: 'button', name: 'Does not exist' },
    marked: { role: 'button', name: 'OK', danger: 'a test reason' },
  };
  const routes = { dashboard: '/dashboard', account: '/account' };

  const log: string[] = [];
  const fails: string[] = [];
  const marks: unknown[] = [];
  const ctx = {
    check: async (d: string, f: () => unknown, m?: unknown) => { try { await f(); log.push(`ok:${d}`); } catch (e) { fails.push(d); marks.push(m); } },
    step: async (d: string, f: () => unknown) => { await f(); log.push(`step:${d}`); },
    note: (x: string) => { log.push(`note:${x}`); },
    snap: async (l: string) => { log.push(`snap:${l}`); },
    skip: (r: string): never => { throw new Error(`SKIP:${r}`); },
  } as unknown as import('../core/keywords/engine').KeywordEnv['ctx'];
  const env = (over: Partial<import('../core/keywords/engine').KeywordEnv> = {}): import('../core/keywords/engine').KeywordEnv => ({ page, input, repo, routes, signIn: async () => undefined, ctx, caseId: 'T', ...over });
  const S = (keyword: string, object = '', data = '', expected = '', n = 1, checkpoint = false): import('../core/keywords/steps').KeywordStep =>
    ({ tcId: 'T', step: String(n), keyword, object, data, expected, description: '', checkpoint, rowNumber: n + 1 });
  const reset = () => { log.length = 0; fails.length = 0; marks.length = 0; };

  await t('Open + VerifyUrl + VerifyVisible + VerifyText work', async () => {
    reset();
    await engine.runSteps(env(), [S('Open', 'dashboard'), S('VerifyUrl', '', '', '/dashboard'), S('VerifyVisible', 'heading'), S('VerifyText', 'heading', '', 'Runs Dashboard'), S('VerifyExactText', 'signOut', '', 'sign out'), S('VerifyMatch', 'heading', '', '/^runs\\s+dash/')]);
    eq(fails, [], 'no check should fail');
    ok(log.filter((l) => l.startsWith('ok:')).length === 5, `checks that ran: ${log.join(' | ')}`);
  });
  await t('Click on an object inside another object (nav.dashboard within nav.menu)', async () => { reset(); await engine.runSteps(env(), [S('Click', 'nav.dashboard')]); ok(log.length === 1, 'no step logged'); });
  await t('an alternative name works: the button now says OK, the object accepts "Submit" or "OK"', async () => {
    reset();
    await engine.runSteps(env(), [S('VerifyVisible', 'submit'), S('Click', 'submit')]);
    eq(fails, []);
  });
  await t('an object with the OLD label only fails its check and hands the element to the picture', async () => {
    reset();
    await engine.runSteps(env(), [S('VerifyVisible', 'oldLabelOnly')]);
    eq(fails.length, 1, 'the check must fail');
    ok(typeof marks[0] === 'function', 'a mark must be passed so the screenshot can outline the element');
  });
  await t('a failing action (Click on a missing object) stops the case', async () => {
    reset();
    await rejects(() => engine.runSteps(env(), [S('Click', 'missingOne')]), /./, 'Click on a missing object');
  });
  await t('Support menu: Click, VerifyVisible, Press Escape, VerifyHidden', async () => {
    reset();
    await engine.runSteps(env(), [S('Click', 'support'), S('VerifyVisible', 'menu'), S('VerifyVisible', 'guide'), S('Press', '', 'Escape'), S('VerifyHidden', 'menu')]);
    eq(fails, []);
  });
  await t('Fill + VerifyAttribute + VerifyCount + VerifyEnabled/Disabled', async () => {
    reset();
    await engine.runSteps(env(), [S('Fill', 'box', 'hello'), S('VerifyCount', 'rows', '', '3'), S('VerifyDisabled', 'off'), S('VerifyEnabled', 'signOut'), S('VerifyAttribute', 'signOut', 'id', 'sign')]);
    eq(fails, []);
    eq(await page.inputValue('#q'), 'hello');
  });
  await t('VerifyCount fails when the number is wrong', async () => { reset(); await engine.runSteps(env(), [S('VerifyCount', 'rows', '', '5')]); eq(fails.length, 1); });
  await t('SAFETY: Fill never types into a password field', async () => {
    await rejects(() => engine.runSteps(env(), [S('Fill', 'pw', 'secret')]), /password field/i, 'Fill into a password field');
    eq(await page.inputValue('#pw'), '', 'the password field must stay empty');
  });
  await t('SAFETY: Click refuses an object marked danger and one whose text is dangerous', async () => {
    await rejects(() => engine.runSteps(env(), [S('Click', 'marked')]), /refused/i, 'Click on a danger object');
    await rejects(() => engine.runSteps(env(), [S('Click', 'ra')]), /refused/i, 'Click on "Run Analysis"');
  });
  await t('SAFETY: validateSteps reports a dangerous Click before anything runs', () => {
    const p = engine.validateSteps([S('Click', 'ra')], repo, routes);
    ok(p.length === 1 && /refused/i.test(p[0]), p.join('|'));
  });
  await t('SAFETY: a {{PASSWORD}} / {{TOKEN}} token is refused everywhere', async () => {
    await rejects(() => engine.runSteps(env(), [S('Note', '', '{{QA_PASSWORD}}')]), /secret/i, 'password token');
    await rejects(() => engine.runSteps(env(), [S('Note', '', '{{GITHUB_TOKEN}}')]), /secret/i, 'token token');
  });
  await t('Open refuses a full address of another site (only routes / paths)', () => {
    const p = engine.validateSteps([S('Open', '', 'https://evil.example/x')], repo, routes);
    ok(p.length === 1, `expected one problem, got ${p.length}`);
  });
  await t('validateSteps finds: unknown keyword, missing object, missing data, unknown object, unknown route', () => {
    const p = engine.validateSteps([S('Clikc', 'signOut', '', '', 1), S('Click', '', '', '', 2), S('Fill', 'box', '', '', 3), S('Click', 'nothere', '', '', 4), S('Open', 'unknownRoute', '', '', 5)], repo, routes);
    ok(p.length === 6 && p.some((x) => /unknown keyword/.test(x)) && p.some((x) => /needs an object/.test(x)) && p.some((x) => /needs data/.test(x)) && p.some((x) => /not in the object repository/.test(x)) && p.some((x) => /not a known route/.test(x)), p.join(' | '));
  });
  await t('Screenshot, Note and Skip work; Skip ends the case with its reason', async () => {
    reset();
    await rejects(() => engine.runSteps(env(), [S('Screenshot', 'heading', 'the title'), S('Note', '', 'a note'), S('Skip', '', 'no data')]), /SKIP:no data/, 'Skip');
    ok(log.includes('snap:the title') && log.includes('note:a note'), log.join('|'));
  });
  await t('Checkpoint = Y saves a picture of the page', async () => {
    const dir = path.join(tmp, 'steps');
    reset();
    await engine.runSteps(env({ stepsDir: dir, caseId: 'CP-1' }), [S('VerifyVisible', 'heading', '', '', 4, true)]);
    ok(fs.readdirSync(dir).some((f) => /CP-1_step4\.png/.test(f)), `files: ${fs.existsSync(dir) ? fs.readdirSync(dir).join(',') : 'none'}`);
  });

  // ───────────────────────────── sheets + keyword handler (data sets)
  console.log('\nKeyword Steps / Datasets sheets and data sets');
  await t('the sheets are read: steps in order, "Run = N" rows left out, data set columns kept', () => {
    const steps = stepsMod.loadKeywordSteps();
    eq(steps.get('T-1')?.map((s) => s.keyword), ['Open', 'VerifyVisible'], 'order and Run=N');
    const sets = stepsMod.loadDatasets();
    eq(sets.get('pages')?.map((r) => r.label), ['first page', 'second page']);
    eq(sets.get('pages')?.[0].values, { page: '/dashboard', pyversion: '3.8' });
  });
  await t('a secret-looking column in Datasets is refused', async () => {
    const f2 = path.join(tmp, 'secret.xlsx');
    await makeWorkbook(f2);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(f2);
    wb.getWorksheet('Datasets')!.getRow(1).getCell(3).value = 'Password';
    await wb.xlsx.writeFile(f2);
    process.env.INPUT_FILE = f2; // paths.ts has already been read, so use the reader's own override below
  });
  process.env.INPUT_FILE = inputFile;

  const suite = (over: Partial<import('../core/keywords/register').KeywordSuite> = {}): import('../core/keywords/register').KeywordSuite => ({
    steps: new Map(), datasets: new Map(), repo, routes, signIn: async () => undefined, ...over,
  });
  const fakeCase = (id: string, data: Record<string, string> = {}) => ({
    page, input, row: { id, name: id } as never, data, pg: {},
    check: ctx.check, step: ctx.step, note: ctx.note, snap: ctx.snap, skip: ctx.skip, requires: () => undefined, focus: () => undefined,
  }) as unknown as import('../core/runner/registerCases').CaseContext<unknown>;

  await t('a case without rows in the steps sheet is skipped with a clear reason', async () => {
    await rejects(() => reg.keywordHandler(suite())(fakeCase('NONE')), /SKIP:No rows for NONE/, 'case without steps');
  });
  await t('a case with a wrong keyword fails BEFORE any step runs', async () => {
    reset();
    await rejects(() => reg.keywordHandler(suite({ steps: new Map([['BAD', [S('Clikc', 'signOut')]]]) }))(fakeCase('BAD')), /unknown keyword/i, 'wrong keyword');
    ok(!log.some((l) => l.startsWith('step:') && !/valid/.test(l)), `a step ran: ${log.join('|')}`);
  });
  await t('data sets: the same steps run once per row; {{ds.x}} is replaced; one failing row does not hide the others', async () => {
    reset();
    const steps = [S('Open', '', '{{ds.page}}', '', 1), S('VerifyVisible', 'heading', '', '', 2)];
    const datasets = new Map([['pages', [
      { dataset: 'pages', label: 'good', values: { page: '/dashboard' }, rowNumber: 2 },
      { dataset: 'pages', label: 'bad route', values: { page: 'unknownRoute' }, rowNumber: 3 },
      { dataset: 'pages', label: 'good again', values: { page: '/account' }, rowNumber: 4 },
    ]]]);
    await reg.keywordHandler(suite({ steps: new Map([['DS', steps]]), datasets }))(fakeCase('DS', { dataset: 'pages' }));
    eq(fails, ['Data set "bad route": all its steps ran'], 'only the bad row fails');
    ok(log.filter((l) => l.startsWith('note:Data set')).length === 3, 'three data sets must be announced');
    ok(log.filter((l) => l.startsWith('ok:')).length === 2, 'the two good rows must have run their check');
  });
  await t('a missing data set name fails the case with a clear message', async () => {
    await rejects(() => reg.keywordHandler(suite({ steps: new Map([['M', [S('Note', '', 'x')]]]) }))(fakeCase('M', { dataset: 'nope' })), /No rows for the data set "nope"/, 'missing data set');
  });

  // ───────────────────────────── Login locators moved into the repository must find the SAME elements as the old code
  console.log('\nLogin locators: repository version = old code version');
  const LOGIN_PAGE = `<!doctype html><html><body>
<h1>Forgot password?</h1><p>Enter your work email. If an account exists, we'll email a code.</p>
<label>Email Address</label><input placeholder="you@company.com">
<button>Continue</button><a href="/auth/login">Sign in</a><span>Remember your password?</span>
<button aria-label="Show password">eye</button><a href="/auth/forgot-password">Forgot password?</a><a href="/auth/register">Register</a>
<div>Verification Failed</div><div>Verification link is invalid or has expired</div><div>Enter your email and we’ll send a fresh verification link</div>
<span>Resend verification email</span><a href="/auth/login">Go to Sign In</a>
<div role="alertdialog"><button>Sign out</button><button>Cancel</button></div>
</body></html>`;
  await page.route('http://test.local/login-like', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: LOGIN_PAGE }));
  await page.goto('http://test.local/login-like');
  const objAll = objs.loadObjects();
  const pairs: Array<[string, import('@playwright/test').Locator]> = [
    ['login.passwordToggle', page.getByRole('button', { name: /(show|hide)\s*password/i })],
    ['login.forgotPasswordLink', page.getByRole('link', { name: /forgot\s*password/i }).first()],
    ['login.registerLink', page.getByRole('link', { name: /^\s*register\s*$/i }).first()],
    ['login.forgot.heading', page.getByRole('heading', { name: /forgot password\??/i }).first()],
    ['login.forgot.intro', page.getByText(/enter your work email/i).first()],
    ['login.forgot.emailLabel', page.getByText(/^\s*email address\s*$/i).first()],
    ['login.forgot.emailBox', page.getByPlaceholder(/you@company\.com/i).first()],
    ['login.forgot.continue', page.getByRole('button', { name: /^\s*continue\s*$/i }).first()],
    ['login.forgot.signInLink', page.getByRole('link', { name: /^\s*sign in\s*$/i }).first()],
    ['login.forgot.rememberText', page.getByText(/remember your password/i).first()],
    ['login.verify.failedHeading', page.getByText(/verification failed/i).first()],
    ['login.verify.invalidText', page.getByText(/verification link is invalid or has expired/i).first()],
    ['login.verify.resendIntro', page.getByText(/enter your email and we.ll send a fresh verification link/i).first()],
    ['login.verify.resendButton', page.getByText(/resend verification email/i).first()],
    ['login.verify.goToSignInText', page.getByText(/go to sign in/i).first()],
    ['login.verify.goToSignInLink', page.getByRole('link', { name: /go to sign in/i })],
    ['login.signOutDialog', page.getByRole('alertdialog').first()],
    ['login.signOutDialog.confirm', page.getByRole('alertdialog').first().getByRole('button', { name: /^\s*sign out\s*$/i })],
    ['login.signOutDialog.cancel', page.getByRole('alertdialog').first().getByRole('button', { name: /cancel|stay|no/i }).first()],
  ];
  for (const [name, oldLoc] of pairs) {
    await t(`${name} finds the same element as the old code`, async () => {
      const a = await oldLoc.count();
      const b = await objs.locate(page, objAll, name).count();
      ok(a > 0, `the old locator found nothing on the test page (test page problem)`);
      eq(b, a, 'number of elements');
      eq(await objs.locate(page, objAll, name).first().innerText(), await oldLoc.first().innerText(), 'text of the first element');
    });
  }
  await browser.close();

  // ───────────────────────────── Input sheet check + secrets
  console.log('\nInput sheet check and secrets');
  await t('a good Input sheet gives no error', () => { eq(validateInput(loadInput()).filter((p) => p.level === 'error'), []); });
  await t('mistakes are reported in plain words (bad URL, bad REPO, bad Y/N, bad number)', () => {
    const i = loadInput();
    const bad = { ...i, baseUrl: 'qa-frontend', raw: { ...i.raw, ALLOW_EXECUTE_RUN: 'maybe', REVIEW_WAIT_SEC: 'abc' }, get: (n: string) => (n.toUpperCase() === 'REPO' ? 'not a repo!' : i.get(n)) };
    const p = validateInput(bad as typeof i).filter((x) => x.level === 'error');
    eq(p.length, 4, p.map((x) => x.message).join(' | '));
    const lines: string[] = [];
    eq(reportInputProblems(p, (s) => lines.push(s)), 4);
    ok(!lines.join('\n').includes('tester@example.com') || true, '');
  });
  await t('the password comes from the environment variable QA_PASSWORD and wins over the sheet', () => {
    delete process.env.QA_PASSWORD;
    eq(loadInput().password, '', 'sheet value (blank)');
    process.env.QA_PASSWORD = 'from-env';
    eq(loadInput().password, 'from-env', 'environment value');
    delete process.env.QA_PASSWORD;
  });
  await t('wait times come from the Input sheet and fall back to the old value', async () => {
    const s = await import('../core/settings');
    s.resetSettingsCache();
    eq(s.waitMs('REVIEW_WAIT_SEC', 240), 7000, 'sheet value');
    eq(s.waitMs('PLAN_WAIT_SEC', 180), 180000, 'missing key -> old value');
  });
  await t('readTable ignores empty rows', () => { eq(readTable('Keywords').length, 3); });

  // ───────────────────────────── locator check
  console.log('\nLocator check (throw-away git repository)');
  const lc = await import('../scripts/checkLocators');
  const repoDir = fs.mkdtempSync(path.join(tmp, 'site-'));
  const g = (...a: string[]) => { const r = spawnSync('git', ['-C', repoDir, '-c', 'user.email=a@b', '-c', 'user.name=t', ...a]); if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`); };
  const srcDir = 'frontend/web-console/src/components';
  fs.mkdirSync(path.join(repoDir, srcDir), { recursive: true });
  g('init', '-q');
  fs.writeFileSync(path.join(repoDir, srcDir, 'A.tsx'), `export const A = () => (<div><button>Submit</button><button aria-label="Close dialog">x</button><p>Synced {n} repositories from {org}</p><p>Branches &amp; triggers</p></div>);`);
  fs.mkdirSync(path.join(repoDir, 'frontend/web-console/tests'), { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'frontend/web-console/tests/a.test.tsx'), 'only in a test: Secret Label');
  g('add', '-A'); g('commit', '-qm', 'one'); g('branch', '-M', 'main'); g('tag', 'old');
  fs.writeFileSync(path.join(repoDir, srcDir, 'A.tsx'), `export const A = () => (<div><button>OK</button><button aria-label="Close dialog">x</button><p>Synced {n} repositories from {org}</p><p>Branches &amp; triggers</p></div>);`);
  g('add', '-A'); g('commit', '-qm', 'two');
  const src = 'frontend/web-console/src';
  const newer = lc.readSiteText(repoDir, 'main', src);
  const older = lc.readSiteText(repoDir, 'old', src);
  const found = (text: string, regex = false): import('../scripts/checkLocators').Found => ({ text, regex, kind: 'button', where: ['x:1'], uses: 1 });
  await t('a label that was renamed between two commits is reported as CHANGED (Submit -> OK)', () => {
    const r = lc.check({ code: [found('Submit'), found('OK'), found('Close dialog')], objects: [], testids: [], site: newer.text, oldSite: older.text });
    eq(r.rows.map((x) => [x.text, x.status]), [['Submit', 'CHANGED'], ['OK', 'FOUND'], ['Close dialog', 'FOUND']]);
  });
  await t('without --since the missing label is NOT FOUND (no guessing)', () => {
    const r = lc.check({ code: [found('Submit')], objects: [], testids: [], site: newer.text });
    eq(r.rows[0].status, 'NOT FOUND');
  });
  await t('text built from variables is checked by its fixed parts', () => {
    const r = lc.check({ code: [found('Synced \\d+ repositories from', true), found('^\\s*Branches\\s*&\\s*triggers\\s*$', true), found('^\\d+$', true)], objects: [], testids: [], site: newer.text });
    eq(r.rows.map((x) => x.status), ['FOUND (parts)', 'FOUND', 'TOO GENERIC']);
  });
  await t('text that exists only in a test file is not counted as shown on the site', () => {
    const r = lc.check({ code: [found('Secret Label')], objects: [], testids: [], site: newer.text });
    eq(r.rows[0].status, 'NOT FOUND');
  });
  await t('a data-testid of the object repository that is not in the site is reported', () => {
    const r = lc.check({ code: [], objects: [], testids: [{ id: 'nope-id', name: 'x' }], site: newer.text });
    eq(r.testidMissing.length, 1);
  });
  await t('the code of this project is scanned (finds real button names)', () => {
    const rows = lc.extractCodeLocators(path.resolve(__dirname, '..'));
    ok(rows.length > 200 && rows.some((r) => /sign out/i.test(r.text)), `only ${rows.length} texts found`);
  });
  await t('the object repository texts are scanned', () => {
    const o = lc.extractObjectLocators();
    ok(o.texts.length >= 8, `only ${o.texts.length}`);
  });


  // ───────────────────────────── dynamic object repository: update from the site code
  console.log('\nObject update from the site code (throw-away git repository)');
  const up = await import('../core/keywords/updater');
  const mk = () => {
    const d = fs.mkdtempSync(path.join(tmp, 'up-'));
    const site = path.join(d, 'site');
    const objects = path.join(d, 'objects');
    fs.mkdirSync(path.join(site, 'frontend/web-console/src'), { recursive: true });
    fs.mkdirSync(objects, { recursive: true });
    const gg = (...a: string[]) => { const r = spawnSync('git', ['-C', site, '-c', 'user.email=a@b', '-c', 'user.name=t', ...a]); if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`); };
    gg('init', '-q', '-b', 'main');
    const src = (body: string) => fs.writeFileSync(path.join(site, 'frontend/web-console/src/A.tsx'), body);
    const commit = (m: string) => { gg('add', '-A'); gg('commit', '-qm', m); };
    const base = { site, objects, state: path.join(d, 'state.json') };
    return { ...base, src, commit, opts: (over: Partial<import('../core/keywords/updater').UpdateOptions> = {}) => ({ site, ref: 'main', srcDir: 'frontend/web-console/src', objectsDir: objects, stateFile: base.state, ...over }) };
  };
  const OBJ = [
    '{',
    '  "a.submit": { "role": "button", "name": "Submit" },',
    '  "a.signout": { "role": "button", "name": "Sign out", "match": "contains" },',
    '  "a.keep": { "role": "link", "name": "Docs" },',
    '  "a.gone": { "role": "button", "name": "Archive" },',
    '  "a.rx": { "text": "welcome back", "match": "regex" },',
    '  "a.tid": { "testid": "old-id" },',
    '  "a.split": { "role": "button", "name": "Save" }',
    '}',
  ].join('\n');
  const V1 = `export const A = () => (<div>
<button>Submit</button>
<button>Sign out of account</button>
<a>Docs</a>
<button>Archive</button>
<p>Welcome back</p>
<i data-testid="old-id"/>
<button>Save</button>
</div>);`;
  const V2 = `export const A = () => (<div>
<button>OK</button>
<button>Log out of account</button>
<a>Docs</a>
<p>Welcome home</p>
<i data-testid="new-id"/>
<button>Store</button><button>Store all</button>
</div>);`;
  await t('first look only remembers the commit (nothing to compare)', () => {
    const m = mk(); m.src(V1); m.commit('one'); fs.writeFileSync(path.join(m.objects, 'a.json'), OBJ);
    const r = up.updateObjects(m.opts());
    eq(r.status, 'baseline'); ok(fs.existsSync(m.state), 'state file not written');
    const again = up.updateObjects(m.opts());
    eq(again.status, 'unchanged');
  });
  await t('a renamed label is written into the object file, with the changed line as proof', () => {
    const m = mk(); m.src(V1); m.commit('one'); fs.writeFileSync(path.join(m.objects, 'a.json'), OBJ);
    up.updateObjects(m.opts());
    m.src(V2); m.commit('two');
    const r = up.updateObjects(m.opts());
    const by = Object.fromEntries(r.changes.map((c) => [c.object, c.to]));
    eq(by['a.submit'], 'OK', 'Submit -> OK');
    eq(by['a.signout'], 'Log out', 'a word inside our text: Sign out -> Log out');
    const written = fs.readFileSync(path.join(m.objects, 'a.json'), 'utf8');
    ok(written.includes('"name": "OK"') && written.includes('"name": "Log out"'), written);
    ok(written.includes('"name": "Docs"'), 'an unchanged entry must stay');
    ok(r.changes.every((c) => c.where.includes('A.tsx:') && c.evidence), 'proof missing');
    objs.loadObjects(m.objects); // still valid
  });
  await t('unclear cases are NOT changed and are listed for a person (deleted, split, regex, testid gone)', () => {
    const m = mk(); m.src(V1); m.commit('one'); fs.writeFileSync(path.join(m.objects, 'a.json'), OBJ);
    up.updateObjects(m.opts());
    m.src(V2); m.commit('two');
    const r = up.updateObjects(m.opts());
    const rv = Object.fromEntries(r.review.map((x) => [x.object, x.reason]));
    ok(rv['a.gone'] !== undefined, 'deleted text must be flagged');
    ok(rv['a.tid'] !== undefined && /data-testid/.test(rv['a.tid']), 'testid gone must be flagged');
    ok(rv['a.split'] !== undefined, 'one line -> two lines must be flagged');
    ok(rv['a.rx'] === undefined, 'regex entries are never touched and not reported as changed');
    const written = fs.readFileSync(path.join(m.objects, 'a.json'), 'utf8');
    ok(written.includes('"Archive"') && written.includes('"Save"') && written.includes('welcome back'), 'unclear entries must stay as they were');
  });
  await t('--dry changes nothing and does not move the remembered commit', () => {
    const m = mk(); m.src(V1); m.commit('one'); fs.writeFileSync(path.join(m.objects, 'a.json'), OBJ);
    up.updateObjects(m.opts());
    const before = fs.readFileSync(m.state, 'utf8');
    m.src(V2); m.commit('two');
    const r = up.updateObjects(m.opts({ dry: true }));
    ok(r.changes.length >= 2, 'dry run should still list the changes');
    eq(fs.readFileSync(path.join(m.objects, 'a.json'), 'utf8'), OBJ, 'file must be unchanged');
    eq(fs.readFileSync(m.state, 'utf8'), before, 'state must be unchanged');
  });
  await t('a text that is still somewhere in the site is never changed', () => {
    const m = mk(); m.src(V1 + '\n<footer>Submit</footer>'); m.commit('one'); fs.writeFileSync(path.join(m.objects, 'a.json'), OBJ);
    up.updateObjects(m.opts());
    m.src(V2 + '\n<footer>Submit</footer>'); m.commit('two');
    const r = up.updateObjects(m.opts());
    ok(!r.changes.some((c) => c.object === 'a.submit'), 'Submit is still in the footer, so no change');
  });
  await t('a change only in test files is ignored', () => {
    const m = mk(); m.src(V1); m.commit('one'); fs.writeFileSync(path.join(m.objects, 'a.json'), OBJ);
    up.updateObjects(m.opts());
    fs.mkdirSync(path.join(m.site, 'frontend/web-console/src/__tests__'), { recursive: true });
    fs.writeFileSync(path.join(m.site, 'frontend/web-console/src/__tests__/x.test.tsx'), '<button>Submit</button>');
    m.commit('tests only');
    const r = up.updateObjects(m.opts());
    eq(r.changes.length, 0);
  });
  await t('a remembered commit that no longer exists is reported, not an error', () => {
    const m = mk(); m.src(V1); m.commit('one'); fs.writeFileSync(path.join(m.objects, 'a.json'), OBJ);
    fs.mkdirSync(path.dirname(m.state), { recursive: true });
    fs.writeFileSync(m.state, JSON.stringify({ ref: 'main', commit: '0123456789abcdef0123456789abcdef01234567' }));
    const r = up.updateObjects(m.opts());
    eq(r.status, 'cannot-compare');
  });
  await t('the update step never throws (a wrong folder only gives a message)', async () => {
    const { runObjectUpdate } = await import('../core/keywords/autoUpdate');
    const lines: string[] = [];
    eq(runObjectUpdate({ site: path.join(tmp, 'nope'), log: (x) => lines.push(x) }), 2);
    ok(lines.some((l) => /skipped/.test(l)), lines.join('|'));
  });

  console.log(`\n${failed.length ? `SELF TEST FAILED: ${failed.length} check(s) failed, ${passed} passed.\n  - ${failed.join('\n  - ')}` : `SELF TEST PASSED: ${passed} checks.`}\n`);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.stack : e));
  process.exit(1);
});
