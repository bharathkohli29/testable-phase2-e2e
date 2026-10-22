import { expect } from '@playwright/test';
import { AppShell } from '../../../core/pages/AppShell';
import { CaseHandler } from '../../../core/runner/registerCases';
import { RepoPage } from '../../repo/shared/RepoPage';
import { closeSupport, norm, open, supportButton, supportItem } from '../../flow/ui';
import { ANY_AUTH_URL, LOGIN_URL, NormalLoginPage } from './normalLogin.page';

/** Extra Login cases from the QA sheets, verified live on QA (15 Oct). Password reset and e-mail verification are only LOOKED AT: no reset mail is requested. */
export const extraLoginSteps: Record<string, CaseHandler<RepoPage>> = {
  'LOGIN-NRM-022': async ({ page, input, check, snap }) => {
    await open(page, input, '/auth/login');
    const btn = supportButton(page);
    await expect(btn, 'the Support button is not on the login page').toBeVisible({ timeout: 20_000 });
    await check('The round "Support" button is shown on the login page', () => expect(btn).toBeVisible());
    await btn.click();
    const menu = page.getByRole('menu');
    await check('Pressing it opens a menu', () => expect(menu).toBeVisible());
    for (const item of ['Live Chat', 'Submit a Request', 'User Guide']) {
      await check(`The menu offers "${item}"`, () => expect(supportItem(page, new RegExp(`^\\s*${item}\\s*$`, 'i'))).toBeVisible(), menu);
    }
    await snap('Support menu on the login page', menu);
    await closeSupport(page);
  },

  'LOGIN-RST-001': async ({ page, input, check, snap }) => {
    await open(page, input, '/auth/forgot-password');
    const head = page.getByRole('heading', { name: /forgot password\??/i }).first();
    await expect(head).toBeVisible({ timeout: 20_000 });
    await check('The address is /auth/forgot-password', () => expect(new URL(page.url()).pathname.toLowerCase()).toBe('/auth/forgot-password'));
    await check('The heading "Forgot password?" is shown', () => expect(head).toBeVisible());
    await check('"Enter your work email. If an account exists, we\'ll email a verification code — then you\'ll enter it and choose a new password." is shown', () =>
      expect(page.getByText(/enter your work email/i).first()).toContainText(/if an account exists,?\s*we.ll email a verification code.*choose a new password/i));
    await check('The field "Email Address" has the placeholder "you@company.com" and accepts an e-mail (type email)', async () => {
      await expect(page.getByText(/^\s*email address\s*$/i).first()).toBeVisible();
      const box = page.getByPlaceholder(/you@company\.com/i).first();
      await expect(box).toBeVisible();
      await expect(box).toHaveAttribute('type', 'email');
    });
    await check('The "Continue" button is shown (it is not pressed: it would send a reset mail)', () => expect(page.getByRole('button', { name: /^\s*continue\s*$/i }).first()).toBeVisible());
    await snap('Forgot password page', head);
  },

  'LOGIN-RST-002': async ({ page, input, check, snap }) => {
    await open(page, input, '/auth/forgot-password');
    const link = page.getByRole('link', { name: /^\s*sign in\s*$/i }).first();
    await expect(link).toBeVisible({ timeout: 20_000 });
    await check('"Remember your password?" is shown with a "Sign in" link to /auth/login', async () => {
      await expect(page.getByText(/remember your password/i).first()).toBeVisible();
      await expect(link).toHaveAttribute('href', /\/auth\/login/i);
    });
    await snap('Sign in link on the forgot-password page', link);
    await check('Clicking "Sign in" opens the login page', async () => {
      await link.click();
      await expect(page).toHaveURL(LOGIN_URL);
    });
  },

  'LOGIN-VER-001': async ({ page, input, check, snap }) => {
    await open(page, input, `/verify-email?token=invalid-${Math.random().toString(36).slice(2, 12)}`);
    const head = page.getByText(/verification failed/i).first();
    await expect(head, 'the "Verification Failed" page did not appear').toBeVisible({ timeout: 20_000 });
    await check('A made-up verification link shows "Verification Failed"', () => expect(head).toBeVisible());
    await check('It says "Verification link is invalid or has expired"', () => expect(page.getByText(/verification link is invalid or has expired/i).first()).toBeVisible());
    await check('It explains "Enter your email and we\'ll send a fresh verification link if your account isn\'t verified yet."', () =>
      expect(page.getByText(/enter your email and we.ll send a fresh verification link/i).first()).toBeVisible());
    await check('"Resend verification email" and "Go to Sign In" are offered (nothing is pressed)', async () => {
      await expect(page.getByText(/resend verification email/i).first()).toBeVisible();
      await expect(page.getByText(/go to sign in/i).first()).toBeVisible();
    });
    await check('The user is not signed in by the made-up link', async () => expect(await new AppShell(page, input.baseUrl).signOutButton.count()).toBe(0));
    await snap('Verification Failed page', head);
  },

  'LOGIN-VER-002': async ({ page, input, check, snap }) => {
    await open(page, input, `/verify-email?token=invalid-${Math.random().toString(36).slice(2, 12)}`);
    const back = page.getByRole('link', { name: /go to sign in/i }).or(page.getByRole('button', { name: /go to sign in/i })).first();
    await expect(back).toBeVisible({ timeout: 20_000 });
    await snap('Go to Sign In', back);
    await check('"Go to Sign In" opens the login page', async () => {
      await back.click();
      await expect(page).toHaveURL(LOGIN_URL);
    });
  },

  /** After sign-in: Sign out asks for confirmation; Cancel keeps the session. */
  'LOGIN-NRM-023': async ({ page, input, check, snap }) => {
    const app = new AppShell(page, input.baseUrl);
    await open(page, input, '/execution-assistant');
    await app.expectAuthenticated();
    await app.signOutButton.click();
    const dlg = page.getByRole('alertdialog').first();
    await check('Pressing "Sign out" asks for confirmation', () => expect(dlg).toBeVisible());
    await check('The confirmation offers "Sign out" and a way to cancel', async () => {
      await expect(dlg.getByRole('button', { name: /^\s*sign out\s*$/i })).toBeVisible();
      await expect(dlg.getByRole('button', { name: /cancel|stay|no/i }).first()).toBeVisible();
    });
    await snap('Sign out confirmation', dlg);
    await check('Cancel closes the confirmation and the user stays signed in', async () => {
      await dlg.getByRole('button', { name: /cancel|stay|no/i }).first().click();
      await expect(dlg).toBeHidden();
      await app.expectAuthenticated();
      await expect(page).not.toHaveURL(ANY_AUTH_URL);
    });
    void norm;
  },

  'LOGIN-NRM-024': async ({ page, input, data, check, snap }) => {
    const app = new AppShell(page, input.baseUrl);
    const target = data.path ?? '/execution-assistant';
    await open(page, input, target);
    await app.expectAuthenticated();
    // An expired session is simulated by removing the session cookies and the browser storage of the site.
    await page.context().clearCookies();
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* ignore */ } }).catch(() => undefined);
    await page.goto(`${input.baseUrl}${target}`).catch(() => undefined);
    await check('With no valid session, opening a protected page sends the user to /auth/login', () => expect(page).toHaveURL(ANY_AUTH_URL, { timeout: 30_000 }));
    await check('The login page is shown and the signed-in app is not', async () => {
      await expect(page.getByRole('heading').first()).toBeVisible();
      await app.expectNotAuthenticated();
    });
    await snap('Login page shown after the session expired', page.getByRole('heading').first());
    // Sign in again so the rest of the journey keeps working.
    const email = data.email ?? '';
    const password = data.password ?? '';
    if (email && password) {
      await new NormalLoginPage(page, input.baseUrl).login(email, password);
      await page.waitForURL((u) => !ANY_AUTH_URL.test(u.pathname), { timeout: 30_000 }).catch(() => undefined);
    }
  },
};
