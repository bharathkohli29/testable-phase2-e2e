import { expect } from '@playwright/test';
import { AppShell } from '../../../core/pages/AppShell';
import { CaseHandler } from '../../../core/runner/registerCases';
import { ANY_AUTH_URL, LOGIN_PATH, LOGIN_URL, NormalLoginPage } from './normalLogin.page';
import { loose } from '../shared/text';
import { obj as locatorOf } from '../../../core/keywords/obj';

import { expected as expectedOf } from '../../../core/keywords/expected';
/** Text of the first error shown (never waits long, never throws - it is only a note). */
async function shownText(loc: import('@playwright/test').Locator): Promise<string> {
  return (await loc.first().innerText({ timeout: 3_000 }).catch(() => '(could not read it)')).trim();
}

/** Credentials for cases that must log in; they come from the Input sheet ({{EMAIL}} / {{PASSWORD}}). */
function creds(data: Record<string, string>): { email: string; password: string } {
  const email = data.email ?? '';
  const password = data.password ?? '';
  if (!email || !password) {
    throw new Error('Email/password are empty - fill <ENV>_EMAIL and <ENV>_PASSWORD in the Input sheet');
  }
  return { email, password };
}

const hrefRx = (href: string): RegExp => new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\/+$/, '') + '/?(\\?|#|$)', 'i');

export const normalHandlers: Record<string, CaseHandler<NormalLoginPage>> = {
  // ───────────── page & field presence ─────────────
  'LOGIN-NRM-001': async ({ pg, page, data, check, snap }) => {
    const expectedPath = data.path ?? LOGIN_PATH;
    await pg.open();
    await snap('Login page heading', pg.heading);
    const stripSlash = (p: string) => p.toLowerCase().replace(/\/+$/, '');
    await check(`URL path is "${expectedPath}" (capital letters ignored)`, () =>
      expect(stripSlash(new URL(page.url()).pathname)).toBe(stripSlash(expectedPath)));
    await check(`Heading reads "${data.heading}" (capital letters and punctuation ignored)`, () => expect(pg.heading).toHaveText(loose(data.heading ?? 'Welcome Back,')));
    await check(`Browser title contains "${data.title}" (capital letters ignored)`, () => expect(page).toHaveTitle(loose(data.title ?? 'Testable')));
  },

  'LOGIN-NRM-002': async ({ pg, page, data, check, snap }) => {
    await pg.open();
    await snap('Login page sub-heading and tagline', page.getByText(loose(data.subheading ?? '')).and(locatorOf(page, 'login.css.visible')).first());
    await check(`Sub-heading "${data.subheading}" is visible`, () =>
      expect(page.getByText(loose(data.subheading ?? '')).and(locatorOf(page, 'login.css.visible')).first()).toBeVisible());
    await check(`Tagline "${data.tagline}" is visible`, () =>
      expect(page.getByText(loose(data.tagline ?? '')).and(locatorOf(page, 'login.css.visible')).first()).toBeVisible());
  },

  'LOGIN-NRM-003': async ({ pg, data, check, snap }) => {
    await pg.open();
    await check('Email box is visible', () => expect(pg.email).toBeVisible());
    await check('Email box is enabled and editable', () => expect(pg.email).toBeEditable());
    await check(`Email placeholder is "${data.placeholder}" (capital letters and punctuation ignored)`, () =>
      expect(pg.email).toHaveAttribute('placeholder', loose(data.placeholder ?? '', { exact: true })));
    await check('Email box accepts typed text', async () => {
      await pg.email.fill('sample@example.com');
      await expect(pg.email).toHaveValue(expectedOf('login.value.sample-example-com'));
    });
    await snap('Email box with sample text typed', pg.email);
  },

  'LOGIN-NRM-004': async ({ pg, data, check, snap }) => {
    await pg.open();
    await check('Password box is visible', () => expect(pg.password).toBeVisible());
    await check('Password box is enabled and editable', () => expect(pg.password).toBeEditable());
    await check(`Password placeholder is "${data.placeholder}" (capital letters and punctuation ignored)`, () =>
      expect(pg.password).toHaveAttribute('placeholder', loose(data.placeholder ?? '', { exact: true })));
    await check('Password box accepts typed text', async () => {
      await pg.password.fill('Sample@123');
      await expect(pg.password).toHaveValue(expectedOf('login.value.sample-123'));
    });
    await snap('Password box with the typed text hidden as dots', pg.password);
  },

  'LOGIN-NRM-005': async ({ pg, data, check, step, snap }) => {
    await pg.open();
    await pg.password.fill(data.sample_password ?? 'Sample@123');
    await check('Password is masked by default (type=password)', () => expect(pg.password).toHaveAttribute('type', expectedOf('login.attr.password')));
    await check('A "Show password" eye icon is visible', async () => {
      await expect(pg.passwordToggle).toBeVisible();
      await expect(pg.passwordToggle).toHaveAccessibleName(/show\s*password/i);
    });
    await snap('Password box (hidden) with its eye icon', [pg.password, pg.passwordToggle]);
    await step('Click the eye icon', () => pg.passwordToggle.click());
    await check('After clicking the eye icon the password is visible (type=text)', () =>
      expect(pg.password).toHaveAttribute('type', expectedOf('login.attr.text')));
    await check('The icon now reads "Hide password"', () => expect(pg.passwordToggle).toHaveAccessibleName(/hide\s*password/i));
    await step('Click the eye icon again', () => pg.passwordToggle.click());
    await check('Clicking again masks the password (type=password)', () => expect(pg.password).toHaveAttribute('type', expectedOf('login.attr.password')));
  },

  'LOGIN-NRM-006': async ({ pg, data, check, snap }) => {
    await pg.open();
    await snap('The Authenticate button', pg.authenticate);
    await check('Authenticate button is visible', () => expect(pg.authenticate).toBeVisible());
    await check('Authenticate button is enabled', () => expect(pg.authenticate).toBeEnabled());
    await check(`Authenticate button text is "${data.label}" (capital letters ignored)`, () => expect(pg.authenticate).toContainText(loose(data.label ?? 'Authenticate')));
  },

  // ───────────── successful login ─────────────
  'LOGIN-NRM-007': async ({ pg, page, data, input, check, note, snap }) => {
    const { email, password } = creds(data);
    const app = new AppShell(page, input.baseUrl);
    await pg.login(email, password);
    await check('Browser leaves the /auth/ pages after Authenticate', () =>
      expect(page).not.toHaveURL(ANY_AUTH_URL, { timeout: 30_000 }));
    note(`Landed on ${new URL(page.url()).pathname}`);
    await check('Signed-in app is shown (Sign out button visible)', () => app.expectAuthenticated());
    await snap('Signed-in app after Authenticate (Sign out button visible)', app.signOutButton);
  },

  'LOGIN-NRM-008': async ({ pg, page, data, input, check, note, snap }) => {
    const { email, password } = creds(data);
    const app = new AppShell(page, input.baseUrl);
    await pg.login(email, password);
    await app.expectAuthenticated();

    const listed = (data.paths ?? '').split(',').map((p) => p.trim()).filter(Boolean);
    const hrefs = await locatorOf(page, 'login.css.a-href').evaluateAll((els) =>
      els.map((e) => e.getAttribute('href') || ''));
    const max = Number(data.max_links || 3);
    const discovered = [...new Set(hrefs)]
      .filter((h) => h && h !== '/' && !/^\/auth\//i.test(h) && !listed.includes(h))
      .slice(0, max);
    const targets = [...listed, ...discovered];
    note(`Pages visited: ${targets.join(', ') || '(none found)'}`);

    for (const target of targets) {
      await check(`${target} opens without sending the user back to login`, async () => {
        await app.goto(target);
        await expect(page).not.toHaveURL(ANY_AUTH_URL);
        await app.expectAuthenticated();
      });
    }
    await snap('Last visited page, still signed in', app.signOutButton);
  },

  'LOGIN-NRM-009': async ({ pg, page, data, input, check, snap }) => {
    const { email, password } = creds(data);
    const app = new AppShell(page, input.baseUrl);
    await pg.open();
    await pg.fill(email, password);
    await pg.password.press('Enter');
    await check('Pressing Enter in the password box signs the user in', async () => {
      await expect(page).not.toHaveURL(ANY_AUTH_URL, { timeout: 30_000 });
      await app.expectAuthenticated();
    });
    await snap('Signed-in app after pressing Enter', app.signOutButton);
  },

  // ───────────── rejected logins ─────────────
  'LOGIN-NRM-010': async ({ pg, page, data, input, check, note, snap }) => {
    const app = new AppShell(page, input.baseUrl);
    await pg.login(data.email ?? '', data.password ?? '');
    await check('An error message is shown', () => expect(pg.formError.first()).toBeVisible());
    await snap('The error message on the login form', pg.formError.first());
    note(`Error text: "${await shownText(pg.formError)}"`);
    await check('User stays on the login page', () => expect(page).toHaveURL(LOGIN_URL));
    await check('User is not signed in', () => app.expectNotAuthenticated());
  },

  'LOGIN-NRM-011': async ({ pg, page, data, input, check, note, snap }) => {
    const app = new AppShell(page, input.baseUrl);
    await pg.login(data.email ?? '', data.password ?? '');
    await check('An error message is shown', () => expect(pg.formError.first()).toBeVisible());
    await snap('The error message on the login form', pg.formError.first());
    note(`Error text: "${await shownText(pg.formError)}"`);
    await check('User stays on the login page', () => expect(page).toHaveURL(LOGIN_URL));
    await check('User is not signed in', () => app.expectNotAuthenticated());
  },

  // ───────────── empty-field validation ─────────────
  'LOGIN-NRM-012': async ({ pg, page, data, check, snap }) => {
    await pg.open();
    await pg.submit();
    await check(`Message "${data.email_error}" is shown`, () => expect(pg.fieldError(data.email_error ?? '')).toBeVisible());
    await check(`Message "${data.password_error}" is shown`, () => expect(pg.fieldError(data.password_error ?? '')).toBeVisible());
    await snap('Both required-field messages under the empty boxes', [pg.fieldError(data.email_error ?? ''), pg.fieldError(data.password_error ?? '')]);
    await check('Email box is marked invalid', () => expect(pg.email).toHaveAttribute('aria-invalid', expectedOf('login.attr.true')));
    await check('Password box is marked invalid', () => expect(pg.password).toHaveAttribute('aria-invalid', expectedOf('login.attr.true')));
    await check('User stays on the login page', () => expect(page).toHaveURL(LOGIN_URL));
  },

  'LOGIN-NRM-013': async ({ pg, page, data, check, snap }) => {
    await pg.open();
    await pg.fill('', data.password ?? '');
    await pg.submit();
    await check(`Message "${data.email_error}" is shown`, () => expect(pg.fieldError(data.email_error ?? '')).toBeVisible());
    await snap('The email message under the empty email box', pg.fieldError(data.email_error ?? ''));
    await check('Only the email message is shown (no password message)', () => expect(pg.fieldErrors).toHaveCount(1));
    await check('User stays on the login page', () => expect(page).toHaveURL(LOGIN_URL));
  },

  'LOGIN-NRM-014': async ({ pg, page, data, check, snap }) => {
    await pg.open();
    await pg.fill(data.email ?? '', '');
    await pg.submit();
    await check(`Message "${data.password_error}" is shown`, () => expect(pg.fieldError(data.password_error ?? '')).toBeVisible());
    await snap('The password message under the empty password box', pg.fieldError(data.password_error ?? ''));
    await check('Only the password message is shown (no email message)', () => expect(pg.fieldErrors).toHaveCount(1));
    await check('User stays on the login page', () => expect(page).toHaveURL(LOGIN_URL));
  },

  'LOGIN-NRM-015': async ({ pg, page, data, input, check, note, snap }) => {
    const app = new AppShell(page, input.baseUrl);
    await pg.login(data.email ?? '', data.password ?? '');
    await check('Some rejection is shown (form error or field error)', () =>
      expect(pg.formError.or(pg.fieldErrors).first()).toBeVisible());
    await snap('The rejection message on the login form', pg.formError.or(pg.fieldErrors).first());
    note(`Message: "${await shownText(pg.formError.or(pg.fieldErrors))}"`);
    await check('User stays on the login page', () => expect(page).toHaveURL(LOGIN_URL));
    await check('User is not signed in', () => app.expectNotAuthenticated());
  },

  // ───────────── links on the form ─────────────
  'LOGIN-NRM-016': async ({ pg, page, data, check, snap }) => {
    await pg.open();
    await check('"Forgot Password?" link is visible', () => expect(pg.forgotPasswordLink).toBeVisible());
    await check(`Link points to ${data.href} (capital letters ignored)`, () => expect(pg.forgotPasswordLink).toHaveAttribute('href', hrefRx(data.href ?? 'forgot-password')));
    await snap('The "Forgot Password?" link on the login form', pg.forgotPasswordLink);
    await check('Clicking it opens the forgot-password page', async () => {
      await pg.forgotPasswordLink.click();
      await expect(page).toHaveURL(hrefRx(data.href ?? 'forgot-password'));
    });
  },

  'LOGIN-NRM-017': async ({ pg, page, data, check, snap }) => {
    await pg.open();
    await check('"Register" link is visible', () => expect(pg.registerLink).toBeVisible());
    await check(`Link points to ${data.href} (capital letters ignored)`, () => expect(pg.registerLink).toHaveAttribute('href', hrefRx(data.href ?? 'register')));
    await snap('The "Register" link on the login form', pg.registerLink);
    await check('Clicking it opens the register page', async () => {
      await pg.registerLink.click();
      await expect(page).toHaveURL(hrefRx(data.href ?? 'register'));
    });
  },

  // ───────────── session behaviour ─────────────
  'LOGIN-NRM-018': async ({ pg, page, data, input, check, snap }) => {
    const { email, password } = creds(data);
    const app = new AppShell(page, input.baseUrl);
    await pg.login(email, password);
    await app.expectAuthenticated();
    await app.signOut();
    await check('After Sign out the browser is back on the login page', () => expect(page).toHaveURL(LOGIN_URL));
    await check('The signed-in app is no longer shown', () => app.expectNotAuthenticated());
    await snap('Login page shown again after Sign out', pg.heading);
  },

  'LOGIN-NRM-019': async ({ page, data, input, check, snap }) => {
    const target = data.path ?? '/execution-assistant';
    await page.goto(`${input.baseUrl}${target}`);
    await check(`Opening ${target} without logging in redirects to /auth/`, () => expect(page).toHaveURL(ANY_AUTH_URL));
    await snap('Login page shown instead of the protected page', locatorOf(page, 'login.heading.item').first());
  },

  'LOGIN-NRM-020': async ({ pg, page, data, input, check, snap }) => {
    const { email, password } = creds(data);
    const app = new AppShell(page, input.baseUrl);
    await pg.login(email, password);
    await app.expectAuthenticated();
    await page.reload();
    await check('After a page reload the user is still signed in', async () => {
      await expect(page).not.toHaveURL(ANY_AUTH_URL);
      await app.expectAuthenticated();
    });
    await snap('Still signed in after the reload', app.signOutButton);
  },

  'LOGIN-NRM-021': async ({ pg, page, data, input, check, snap }) => {
    const { email, password } = creds(data);
    await pg.login(email, password);
    await expect(page).not.toHaveURL(ANY_AUTH_URL, { timeout: 30_000 });
    await snap('Signed-in app after Authenticate (no credentials in the address)', new AppShell(page, input.baseUrl).signOutButton);
    const url = decodeURIComponent(page.url());
    await check('Email is not present in the URL', () => expect(url).not.toContain(email));
    await check('Password is not present in the URL', () => expect(url).not.toContain(password));
  },
};
