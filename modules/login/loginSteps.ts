import { expect } from '@playwright/test';
import { AppShell } from '../../core/pages/AppShell';
import { setBlocker } from '../../core/runner/blockers';
import { BlockingFailure } from '../../core/runner/checks';
import { CaseHandler } from '../../core/runner/registerCases';
import { ANY_AUTH_URL, LOGIN_URL, NormalLoginPage } from './normal/normalLogin.page';
import { normalHandlers } from './normal/normalSteps';
import { RepoPage } from '../repo/shared/RepoPage';
import { adapt, Ctx } from '../flow/helpers';
import { extraLoginSteps } from './normal/extraSteps';

/**
 * Login part of the journey. Everything that can be checked BEFORE pressing "Authenticate" runs first (page, fields, validation,
 * links, social / SSO buttons, rejected logins); then the real sign-in; then the checks that need a signed-in user.
 * Only the normal (email + password) login is part of the journey.
 */
const normal = (id: string): CaseHandler<RepoPage> => adapt((c: Ctx) => new NormalLoginPage(c.page, c.input.baseUrl), normalHandlers[id]);

/** Address the browser landed on right after Authenticate (the credentials-in-URL check reads this, not a page visited later). */
let landingUrl = '';

/** The real sign-in: presses Authenticate (retrying when the site says "unable to sign you in right now"). Failing it blocks the whole journey. */
const signIn: CaseHandler<RepoPage> = async (ctx) => {
  const { page, data, input, check, note, snap } = ctx;
  const email = data.email ?? '';
  const password = data.password ?? '';
  if (!email || !password) {
    const reason = 'QA_EMAIL / QA_PASSWORD are blank on the Input sheet.';
    setBlocker('login', ctx.row.id, reason);
    ctx.skip(reason);
  }
  const pg = new NormalLoginPage(page, input.baseUrl);
  const app = new AppShell(page, input.baseUrl);
  let last = '';
  for (let n = 1; n <= 4; n++) {
    await pg.login(email, password);
    const left = await page.waitForURL((u) => !ANY_AUTH_URL.test(u.pathname), { timeout: 30_000 }).then(() => true, () => false);
    if (left) { last = ''; break; }
    const temporary = await page.getByText(/unable to sign you in right now|try again in a few moments/i).first().isVisible().catch(() => false);
    last = temporary ? 'the site said "unable to sign you in right now"' : ((await pg.formError.first().innerText().catch(() => '')) || 'the page stayed on the login screen').trim();
    if (!temporary) break;
    await page.waitForTimeout(15_000 * n);
  }
  if (last) throw new BlockingFailure('login', `Authenticate did not sign in: ${last}. Nothing after this can run.`);
  landingUrl = page.url();
  note(`Landed on ${new URL(page.url()).pathname}`);
  await check('Browser leaves /auth/login for an application page', () => expect(page).not.toHaveURL(LOGIN_URL));
  await check('Signed-in app is shown (Sign out button visible)', () => app.expectAuthenticated());
  await snap('Signed-in app after Authenticate (Sign out button visible)', app.signOutButton);
};

/** Credentials must not be in the URL of the page the user landed on (checked on the current page, no second login). */
const noCredentialsInUrl: CaseHandler<RepoPage> = async ({ page, data, input, check, snap }) => {
  await snap('Signed-in app after login (address carries no credentials)', new AppShell(page, input.baseUrl).signOutButton);
  const safeDecode = (u: string): string => { try { return decodeURIComponent(u); } catch { return u; } };
  const urls = [...new Set([landingUrl, page.url()].filter(Boolean))].flatMap((u) => [u, safeDecode(u), safeDecode(u.replace(/\+/g, ' '))]);
  const none = (secret: string | undefined) => !secret || urls.every((u) => !u.includes(secret));
  await check('The email is not part of the address after sign-in', () => expect(none(data.email)).toBe(true));
  await check('The password is not part of the address after sign-in', () => expect(none(data.password)).toBe(true));
};

/** After login the user can open other pages (the journey is already signed in, so there is no second login). */
const otherPages: CaseHandler<RepoPage> = async ({ page, data, input, check, note, snap }) => {
  const app = new AppShell(page, input.baseUrl);
  const listed = (data.paths ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  const hrefs = await page.locator('a[href^="/"]').evaluateAll((els) => els.map((e) => e.getAttribute('href') || ''));
  const discovered = [...new Set(hrefs)]
    .filter((h) => h && h !== '/' && !/^\/auth\//i.test(h) && !listed.includes(h))
    .slice(0, Number(data.max_links || 3));
  const targets = [...listed, ...discovered];
  note(`Pages visited: ${targets.join(', ') || '(none found)'}`);
  for (const target of targets) {
    await check(`${target} opens without sending the user to a /auth/ page and the user stays signed in`, async () => {
      await app.goto(target);
      await app.expectAuthenticated();
      await expect(page).not.toHaveURL(ANY_AUTH_URL);
    });
  }
  await snap('Last visited page, still signed in', app.signOutButton);
};

/** The session survives a page reload. */
const reloadKeepsSession: CaseHandler<RepoPage> = async ({ page, input, check, snap }) => {
  const app = new AppShell(page, input.baseUrl);
  await check('After a page reload the user is still signed in', async () => {
    await page.reload();
    await expect(page).not.toHaveURL(ANY_AUTH_URL);
    await app.expectAuthenticated();
  });
  await snap('Still signed in after the reload', app.signOutButton);
};

/** Sign out of the app (the journey is over), then the login page must show again. */
const signOut: CaseHandler<RepoPage> = async ({ page, input, check, step, snap }) => {
  const app = new AppShell(page, input.baseUrl);
  await app.goto('/execution-assistant').catch(() => undefined);
  await step('Click Sign out and confirm', () => app.signOut());
  await check('After Sign out the browser is back on the login page', () => expect(page).toHaveURL(/\/auth\/login/i));
  await check('The signed-in app is no longer shown', () => app.expectNotAuthenticated());
  await snap('Login page shown again after Sign out', page.getByRole('heading').first());
};

export const loginHandlers = {
  preAuth: [
    ...['001', '002', '003', '004', '005', '006', '012', '013', '014', '016', '017', '019'].map((n) => ({ id: `LOGIN-NRM-${n}`, handler: normal(`LOGIN-NRM-${n}`) })),
    ...['010', '011', '015'].map((n) => ({ id: `LOGIN-NRM-${n}`, handler: normal(`LOGIN-NRM-${n}`) })),
    ...['LOGIN-NRM-022', 'LOGIN-RST-001', 'LOGIN-RST-002', 'LOGIN-VER-001', 'LOGIN-VER-002'].map((id) => ({ id, handler: extraLoginSteps[id] })),
  ],
  signIn: { id: 'LOGIN-NRM-007', handler: signIn },
  afterAuth: [
    { id: 'LOGIN-NRM-008', handler: otherPages },
    { id: 'LOGIN-NRM-020', handler: reloadKeepsSession },
    { id: 'LOGIN-NRM-021', handler: noCredentialsInUrl },
    { id: 'LOGIN-NRM-023', handler: extraLoginSteps['LOGIN-NRM-023'] },
  ],
  atEnd: [
    { id: 'LOGIN-NRM-024', handler: extraLoginSteps['LOGIN-NRM-024'] },
    { id: 'LOGIN-NRM-018', handler: signOut },
    { id: 'LOGIN-NRM-009', handler: normal('LOGIN-NRM-009') },
  ],
};
