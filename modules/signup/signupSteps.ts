import { BrowserContext, expect, Page, Request } from '@playwright/test';
import { CaseHandler } from '../../core/runner/registerCases';
import { RepoPage } from '../repo/shared/RepoPage';
import { Ctx } from '../flow/helpers';
import { loose } from '../login/shared/text';
import { obj as locatorOf } from '../../core/keywords/obj';

import { expected as expectedOf, listOf } from '../../core/keywords/expected';
/**
 * The Sign-up module: the Register page (/auth/Register). NOTHING here may create an account:
 *   - the module installs a guard on the browser context that ABORTS every request that is not a read (POST / PUT / PATCH / DELETE),
 *     so even a perfectly valid form can never reach the server; every attempt is recorded and the case can check what the page tried to send;
 *   - the Google / Microsoft / "Continue with <SSO provider>" buttons are only looked at, never clicked;
 *   - the only e-mail typed is a made-up address on the reserved domain example.invalid.
 * Checks use locators, the page's own messages and the request the page tries to send - never screenshots.
 */

interface Attempt { method: string; url: string; body: string }
const attempts: Attempt[] = [];
const guarded = new WeakSet<BrowserContext>();

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();
const safeDecode = (u: string): string => { try { return decodeURIComponent(u); } catch { return u; } };
/** The text is somewhere in a request body, whether it is JSON, form-encoded or URL-encoded. */
const bodyHas = (body: string, text: string): boolean => [body, safeDecode(body), safeDecode(body.replace(/\+/g, ' '))].some((b) => b.includes(text));
const FAKE_EMAIL = (): string => `qa.signup.never.created.${Date.now()}@example.invalid`;
const STRONG = 'Abcdef1!xyz';

async function installGuard(page: Page): Promise<void> {
  const ctx = page.context();
  if (guarded.has(ctx)) return;
  await ctx.route('**/*', async (route) => {
    const req: Request = route.request();
    const m = req.method().toUpperCase();
    if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return route.fallback();
    attempts.push({ method: m, url: req.url(), body: req.postData() ?? '' });
    return route.abort('blockedbyclient');
  });
  guarded.add(ctx);
}

/** Opens the Register page signed out (clears a leftover session first) with the guard in place. */
async function open(ctx: Ctx, type?: 'organisation' | 'individual'): Promise<void> {
  const { page } = ctx;
  await installGuard(page);
  const url = new URL('/auth/Register', ctx.input.baseUrl).toString();
  await page.goto(url);
  if (!/\/auth\//i.test(page.url())) {
    await page.context().clearCookies();
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* ignore */ } }).catch(() => undefined);
    await page.goto(url);
  }
  if (!/\/auth\/register/i.test(page.url())) ctx.skip(`The Register page did not open (the address is ${new URL(page.url()).pathname}).`);
  await locatorOf(page, 'signup.css.fullname').waitFor({ state: 'visible', timeout: 30_000 }).catch(() => ctx.skip('The sign-up form did not load.'));
  ctx.focus(form(page)); // a failed or passed case without an element of its own is photographed on the sign-up form
  if (type) await choose(page, type);
}

/** Selects Organization / Individual by what the option SAYS (not by a hard-coded value) and returns the option's value. */
async function choose(page: Page, type: 'organisation' | 'individual'): Promise<string> {
  const sel = locatorOf(page, 'signup.css.accounttype');
  const want = type === 'organisation' ? /organi[sz]ation/i : /individual/i;
  const opts = await locatorOf(sel, 'signup.css.option').evaluateAll((os) => os.map((o) => ({ value: (o as HTMLOptionElement).value, text: o.textContent ?? '' })));
  const hit = opts.find((o) => want.test(o.text)) ?? opts.find((o) => want.test(o.value));
  const value = hit?.value ?? type;
  await sel.selectOption(value);
  return value;
}

const form = (page: Page) => locatorOf(page, 'signup.css.form').first();
const formText = async (page: Page): Promise<string> => norm(await form(page).innerText());
const submit = (page: Page) => locatorOf(form(page), 'signup.button.create-account');
const orgBox = (page: Page) => locatorOf(page, 'signup.css.organisationname');

async function put(page: Page, v: { org?: string; name?: string; email?: string; pw?: string }): Promise<void> {
  if (v.org !== undefined && (await orgBox(page).isVisible())) await orgBox(page).fill(v.org);
  if (v.name !== undefined) await locatorOf(page, 'signup.css.fullname').fill(v.name);
  if (v.email !== undefined) await locatorOf(page, 'signup.css.workemail').fill(v.email);
  if (v.pw !== undefined) await locatorOf(page, 'signup.css.password').fill(v.pw);
}

/** Press Create Account and let the page react. */
async function send(page: Page): Promise<string> {
  await submit(page).click();
  return settled(page);
}

/** Reads the form text once it has stopped changing (the messages appear a moment after the click). */
async function settled(page: Page): Promise<string> {
  let last = await formText(page);
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(150);
    const now = await formText(page);
    if (now === last && i >= 1) return now;
    last = now;
  }
  return last;
}

const NAME_MIN = loose('Full name must be at least 2 characters');
const ORG_MIN = loose('Organization name is required (min 2 characters)');
const BAD_EMAIL = loose('Please enter a valid email address');

async function sentNothing(check: Ctx['check']): Promise<void> {
  await check('The page did NOT try to send anything to the server (the form was stopped on the page)', () => expect(attempts).toHaveLength(0));
}

export const signupSteps: Record<string, CaseHandler<RepoPage>> = {
  'SUP-001': async (ctx) => {
    const { page, check, note } = ctx;
    await installGuard(page);
    await page.goto(new URL('/auth/login', ctx.input.baseUrl).toString());
    if (!/\/auth\//i.test(page.url())) {
      await page.context().clearCookies();
      await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* ignore */ } }).catch(() => undefined);
      await page.goto(new URL('/auth/login', ctx.input.baseUrl).toString());
    }
    await check('The login page shows a "Register" link', () => expect(locatorOf(page, 'signup.link.register').first()).toBeVisible());
    await locatorOf(page, 'signup.link.register').first().click().catch(() => undefined);
    await check('Clicking "Register" opens the sign-up page (/auth/Register)', () => expect(page).toHaveURL(/\/auth\/register/i));
    await locatorOf(page, 'signup.css.fullname').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
    await check('The browser title contains "Testable"', () => expect(page).toHaveTitle(/testable/i));
    await check('The heading "Create Account" is shown', () => expect(locatorOf(page, 'signup.text.create-account').first()).toBeVisible());
    await check('The sub-heading "Start shipping better code in under a minute" is shown', () => expect(locatorOf(page, 'signup.text.start-shipping-better-code-in-under').first()).toBeVisible());
    await check('The product panel "Ship with confidence." is shown', () => expect(locatorOf(page, 'signup.text.ship-with-confidence').first()).toBeVisible());
    await check('"Already have an account?" is shown', () => expect(locatorOf(page, 'signup.text.already-have-an-account').first()).toBeVisible());
    await check('The legal line "By signing up, you agree to our Terms and Privacy Policy" is shown', () => expect(locatorOf(page, 'signup.text.by-signing-up-you-agree-to-our').first()).toBeVisible());
    note(`Opened ${new URL(page.url()).pathname}`);
  },

  'SUP-002': async (ctx) => {
    await open(ctx);
    const { page, check, note } = ctx;
    const sel = locatorOf(page, 'signup.css.accounttype');
    await check('The account type selector is shown and enabled', async () => { await expect(sel).toBeVisible(); await expect(sel).toBeEnabled(); });
    const options = (await locatorOf(sel, 'signup.css.option').allInnerTexts()).map(norm);
    note(`Account type options: ${options.join(' | ')}`);
    await check('The options are "Select account type", "Organization" and "Individual" (nothing else)', () =>
      expect(options.map((o) => o.toLowerCase().replace(/[^a-z]/g, '').replace('organisation', 'organization'))).toEqual(['selectaccounttype', 'organization', 'individual']));
    await check('"Organization" is selected when the page opens', async () => expect(norm(await locatorOf(sel, 'signup.css.option-checked').innerText())).toMatch(/organi[sz]ation/i));
    await check('Choosing "Individual" and then "Organization" works', async () => {
      const ind = await choose(page, 'individual');
      await expect(sel).toHaveValue(ind);
      const org = await choose(page, 'organisation');
      await expect(sel).toHaveValue(org);
    });
  },

  'SUP-003': async (ctx) => {
    await open(ctx, 'organisation');
    const { page, check } = ctx;
    for (const [id, ph, type] of [['organisationName', 'Organization name', 'text'], ['fullName', 'Full name', 'text'], ['workEmail', 'Work email', 'email'], ['password', 'Password', 'password']] as const) {
      const box = locatorOf(page, 'signup.css.by-id', id);
      await check(`"${ph}" box is shown, enabled, empty, of type ${type} and has the placeholder "${ph}"`, async () => {
        await expect(box).toBeVisible();
        await expect(box).toBeEnabled();
        await expect(box).toBeEditable();
        await expect(box).toHaveValue('');
        await expect(box).toHaveAttribute('type', type);
        await expect(box).toHaveAttribute('placeholder', loose(ph, { exact: true }));
      });
    }
    await check('Typed text is accepted in every box', async () => {
      await put(page, { org: 'Sample Org', name: 'Sample Person', email: FAKE_EMAIL(), pw: 'typed-only' });
      await expect(locatorOf(page, 'signup.css.organisationname')).toHaveValue(expectedOf('signup.value.sample-org'));
      await expect(locatorOf(page, 'signup.css.fullname')).toHaveValue(expectedOf('signup.value.sample-person'));
      await expect(locatorOf(page, 'signup.css.workemail')).not.toHaveValue('');
      await expect(locatorOf(page, 'signup.css.password')).toHaveValue(expectedOf('signup.value.typed-only'));
    });
    await check('The "Create Account" button is shown and enabled', async () => { await expect(submit(page)).toBeVisible(); await expect(submit(page)).toBeEnabled(); });
  },

  'SUP-004': async (ctx) => {
    await open(ctx, 'individual');
    const { page, check } = ctx;
    await check('For "Individual" the Organization name box is not shown', () => expect(orgBox(page)).toBeHidden());
    for (const [id, ph] of [['fullName', 'Full name'], ['workEmail', 'Email'], ['password', 'Password']] as const) {
      await check(`"${id === 'workEmail' ? 'Email' : ph}" box is shown, enabled and has the placeholder "${ph}"`, async () => {
        await expect(locatorOf(page, 'signup.css.by-id', id)).toBeVisible();
        await expect(locatorOf(page, 'signup.css.by-id', id)).toBeEnabled();
        await expect(locatorOf(page, 'signup.css.by-id', id)).toHaveAttribute('placeholder', loose(ph, { exact: true }));
      });
    }
    await check('Switching back to "Organization" shows the Organization name box again', async () => {
      await choose(page, 'organisation');
      await expect(orgBox(page)).toBeVisible();
    });
    await check('Switching to "Individual" again hides it again', async () => {
      await choose(page, 'individual');
      await expect(orgBox(page)).toBeHidden();
    });
  },

  'SUP-005': async (ctx) => {
    await open(ctx, 'organisation');
    const { page, check } = ctx;
    attempts.length = 0;
    const text = await send(page);
    await check('"Organization name is required" is shown for the empty Organization name', () => expect(text).toMatch(loose('Organization name is required')));
    await check('"Full name is required" is shown for the empty Full name', () => expect(text).toMatch(loose('Full name is required')));
    await check('"Email is required" is shown for the empty Email', () => expect(text).toMatch(loose('Email is required')));
    await check('"Password is required" is shown for the empty Password', () => expect(text).toMatch(loose('Password is required')));
    await check('The page stays on the Register page', () => expect(page).toHaveURL(/\/auth\/register/i));
    await sentNothing(check);
  },

  'SUP-006': async (ctx) => {
    await open(ctx, 'individual');
    const { page, check } = ctx;
    attempts.length = 0;
    const text = await send(page);
    await check('"Full name is required" is shown', () => expect(text).toMatch(loose('Full name is required')));
    await check('"Email is required" is shown', () => expect(text).toMatch(loose('Email is required')));
    await check('"Password is required" is shown', () => expect(text).toMatch(loose('Password is required')));
    await check('No Organization name message is shown for an Individual', () => expect(text).not.toMatch(loose('Organization name')));
    await sentNothing(check);
  },

  'SUP-007': async (ctx) => {
    await open(ctx, 'organisation');
    const { page, check } = ctx;
    attempts.length = 0;
    for (const bad of ['   ', 'A']) {
      // e-mail is left wrong on purpose so the form can never be sent, even if a name were accepted
      await put(page, { org: bad, name: bad, email: 'not-an-email', pw: STRONG });
      const text = await send(page);
      await check(`Organization name "${bad.trim() || 'only spaces'}" shows "Organization name is required (min 2 characters)"`, () => expect(text).toMatch(ORG_MIN));
      await check(`Full name "${bad.trim() || 'only spaces'}" shows "Full name must be at least 2 characters"`, () => expect(text).toMatch(NAME_MIN));
    }
    await put(page, { org: 'AB', name: 'AB', email: 'not-an-email', pw: STRONG });
    const ok = await send(page);
    await check('Two-character names are accepted (no name message)', () => { expect(ok).not.toMatch(ORG_MIN); expect(ok).not.toMatch(NAME_MIN); });
    await sentNothing(check);
  },

  'SUP-008': async (ctx) => {
    await open(ctx, 'individual');
    const { page, check, note } = ctx;
    attempts.length = 0;
    await put(page, { name: 'Test Person', email: '', pw: STRONG });
    const blank = await send(page);
    await check('A blank Email shows "Email is required"', () => expect(blank).toMatch(loose('Email is required')));
    for (const bad of ['notanemail', 'a@b', '@b.co', 'a b@c.co', 'a@@b.co', 'a@b..co']) {
      await put(page, { email: bad });
      const text = await send(page);
      await check(`"${bad}" shows "Please enter a valid email address"`, () => expect(text).toMatch(BAD_EMAIL));
    }
    await put(page, { email: 'someone@example.invalid', pw: 'x' });
    const good = await send(page);
    await check('A well-formed address shows no e-mail message', () => expect(good).not.toMatch(BAD_EMAIL));
    note(`Requests the page tried to send during this case: ${attempts.length} (always blocked)`);
  },

  'SUP-009': async (ctx) => {
    await open(ctx, 'individual');
    const { page, check, note } = ctx;
    attempts.length = 0;
    const rules: Array<[string, string, RegExp]> = [
      ['"abc" (too short)', 'abc', loose('Password must be at least 8 characters')],
      ['no capital letter ("abcdefgh1!")', 'abcdefgh1!', loose('at least one uppercase letter')],
      ['no number ("Abcdefgh!!")', 'Abcdefgh!!', loose('at least one number')],
      ['no special character ("Abcdefgh12")', 'Abcdefgh12', loose('at least one special character')],
      ['65 characters', `Aa1!${'x'.repeat(61)}`, loose('Password must not exceed 64 characters')],
    ];
    for (const [label, pw, msg] of rules) {
      await put(page, { name: 'Test Person', email: 'not-an-email', pw });
      const text = await send(page);
      await check(`Password ${label} shows its message`, () => expect(text).toMatch(msg));
    }
    for (const [label, pw] of [['exactly 8 characters ("Abcdef1!")', 'Abcdef1!'], ['exactly 64 characters', `Aa1!${'x'.repeat(60)}`]] as Array<[string, string]>) {
      await put(page, { name: 'Test Person', email: 'not-an-email', pw });
      const text = await send(page);
      await check(`Password ${label} shows no password message`, () => expect(text).not.toMatch(/password (must|is)/i));
    }
    note(`Requests the page tried to send during this case: ${attempts.length} (the e-mail is wrong on purpose, so 0 is expected)`);
  },

  'SUP-010': async (ctx) => {
    await open(ctx, 'organisation');
    const { page, check, step } = ctx;
    const pw = locatorOf(page, 'signup.css.password');
    await pw.fill('Visible1!');
    await check('The password is hidden at first (type=password)', () => expect(pw).toHaveAttribute('type', expectedOf('signup.attr.password')));
    await check('The eye button is named "Show password"', () => expect(locatorOf(page, 'signup.button.show-password').first()).toBeVisible());
    await step('Click the eye button', () => locatorOf(page, 'signup.button.show-password').first().click());
    await check('After the click the password is readable (type=text) with the same text', async () => { await expect(pw).toHaveAttribute('type', expectedOf('signup.attr.text')); await expect(pw).toHaveValue(expectedOf('signup.value.visible1')); });
    await check('The eye button is now named "Hide password"', () => expect(locatorOf(page, 'signup.button.hide-password').first()).toBeVisible());
    await step('Click the eye button again', () => locatorOf(page, 'signup.button.hide-password').first().click());
    await check('Clicking again hides the password again', () => expect(pw).toHaveAttribute('type', expectedOf('signup.attr.password')));
  },

  'SUP-011': async (ctx) => {
    await open(ctx, 'organisation');
    const { page, check } = ctx;
    attempts.length = 0;
    const first = await send(page);
    await check('Before correcting, the "required" messages are shown', () => expect(first).toMatch(loose('Full name is required')));
    await put(page, { org: 'Sample Org', name: 'Sample Person', pw: STRONG });
    const second = await send(page);
    await check('The Organization name, Full name and Password messages are gone once those boxes are correct', () => {
      expect(second).not.toMatch(loose('Organization name is required'));
      expect(second).not.toMatch(loose('Full name is required'));
      expect(second).not.toMatch(loose('Password is required'));
    });
    await check('The Email message is still shown because the e-mail is still empty', () => expect(second).toMatch(loose('Email is required')));
    await sentNothing(check);
  },

  'SUP-012': async (ctx) => {
    const { check, note } = ctx;
    for (const type of ['organisation', 'individual'] as const) {
      await open(ctx, type);
      const { page } = ctx;
      attempts.length = 0;
      const email = FAKE_EMAIL();
      await put(page, { org: 'QA Never Created Org', name: 'QA Never Created', email, pw: STRONG });
      await submit(page).click();
      await expect.poll(() => attempts.length, { timeout: 10_000 }).toBeGreaterThan(0).catch(() => undefined);
      await settled(page);
      const label = type === 'organisation' ? 'Organization' : 'Individual';
      await check(`${label}: a valid form makes the page send exactly one sign-up request (it was BLOCKED by the test, so no account exists)`, () => expect(attempts).toHaveLength(1));
      const a = attempts[0];
      if (!a) continue;
      await check(`${label}: the request is a POST to the register endpoint over https`, () => {
        expect(a.method).toBe('POST');
        expect(a.url).toMatch(/^https:\/\/.*(register|sign-?up)/i);
      });
      await check(`${label}: the request carries the typed name, e-mail and password`, () => {
        expect(bodyHas(a.body, 'QA Never Created')).toBe(true);
        expect(bodyHas(a.body, email)).toBe(true);
        expect(bodyHas(a.body, STRONG)).toBe(true);
      });
      await check(`${label}: ${type === 'organisation' ? 'the Organization name is sent' : 'no Organization name is sent'}`, () =>
        expect(bodyHas(a.body, 'QA Never Created Org')).toBe(type === 'organisation'));
      await check(`${label}: the account type is sent as "${type === 'organisation' ? 'Organization' : 'Individual'}"`, () => expect(a.body.toLowerCase()).toMatch(type === 'organisation' ? /organi[sz]ation/ : /individual/));
      note(`${label}: ${a.method} ${a.url}`);
    }
  },

  'SUP-013': async (ctx) => {
    await open(ctx);
    const { page, check, note } = ctx;
    for (const name of listOf('signup.list.name-google')) {
      await check(`The "${name}" sign-up button is shown and enabled (not clicked)`, async () => {
        const b = locatorOf(page, 'signup.button.by-name', name).first();
        await expect(b).toBeVisible();
        await expect(b).toBeEnabled();
      });
    }
    await check('The "Sign up with SSO" button is shown and enabled (not clicked)', async () => {
      await expect(locatorOf(page, 'signup.button.sign-up-with-sso')).toBeVisible();
      await expect(locatorOf(page, 'signup.button.sign-up-with-sso')).toBeEnabled();
    });
    await check('The "or" divider separates the buttons from the form', () => expect(locatorOf(page, 'signup.text.or').first()).toBeVisible());
    const github = await locatorOf(page, 'signup.button.github').count();
    note(github ? 'A GitHub sign-up button IS offered.' : 'No GitHub sign-up button is offered (only Google, Microsoft and SSO), unlike the login page.');
  },

  'SUP-014': async (ctx) => {
    await open(ctx);
    const { page, check, step } = ctx;
    const providers: Array<[string, string, string]> = [['Okta', 'okta.com', 'Okta'], ['Azure AD', 'azure.microsoft.com', 'Azure AD'], ['OneLogin', 'onelogin.com', 'OneLogin'], ['Auth0', 'auth0.com', 'Auth0']];
    const provider = (name: string) => locatorOf(page, 'signup.option.by-name', name).or(locatorOf(page, 'signup.button.by-name-2', name));
    await check('Before opening, the SSO providers are not listed', () => expect(locatorOf(page, 'signup.text.okta-com').first()).toBeHidden());
    await step('Click "Sign up with SSO"', () => locatorOf(page, 'signup.button.sign-up-with-sso').click());
    for (const [name, domain] of providers) {
      await check(`"${name}" is listed with "${domain}"`, async () => {
        const b = provider(name).first();
        await expect(b).toBeVisible();
        await expect(b).toContainText(domain);
      });
    }
    for (const [name, , label] of providers) {
      if (!(await provider(name).count())) await locatorOf(page, 'signup.button.sign-up-with-sso').click().catch(() => undefined);
      await provider(name).first().click().catch(() => undefined);
      await check(`Choosing "${name}" shows a "Continue with ${label}" button (not clicked)`, () => expect(locatorOf(page, 'signup.button.by-continue-with-label', label).first()).toBeVisible());
    }
    await check('The page is still the Register page (nothing was started)', () => expect(page).toHaveURL(/\/auth\/register/i));
    await sentNothing(check);
  },

  'SUP-015': async (ctx) => {
    await open(ctx);
    const { page, check } = ctx;
    for (const [name, path] of [['Terms', 'terms-of-service'], ['Privacy Policy', 'privacy-policy']] as const) {
      await check(`"${name}" link is shown, opens in a new tab and goes to the testable.io ${path} page (not opened)`, async () => {
        const a = locatorOf(page, 'signup.link.by-name', name).first();
        await expect(a).toBeVisible();
        await expect(a).toHaveAttribute('href', expectedOf('signup.attr.by-https-www-testable-io-path', path));
        await expect(a).toHaveAttribute('target', expectedOf('signup.attr.blank'));
        expect(((await a.getAttribute('rel')) ?? '').toLowerCase()).toContain('noopener');
      });
    }
  },

  'SUP-016': async (ctx) => {
    await open(ctx);
    const { page, check, step } = ctx;
    const signIn = locatorOf(page, 'signup.link.sign-in').first();
    await check('"Sign in" link is shown and goes to /auth/login', async () => {
      await expect(signIn).toBeVisible();
      await expect(signIn).toHaveAttribute('href', expectedOf('signup.attr.auth-login'));
    });
    await step('Click "Sign in"', () => signIn.click());
    await check('Clicking it opens the login page ("Welcome Back,")', async () => {
      await expect(page).toHaveURL(/\/auth\/login/i);
      await expect(locatorOf(page, 'signup.text.welcome-back').first()).toBeVisible();
    });
    await check('The login page offers "Register" again', () => expect(locatorOf(page, 'signup.link.register').first()).toBeVisible());
  },

  'SUP-017': async (ctx) => {
    const { check } = ctx;
    const { page } = ctx;
    for (const type of ['organisation', 'individual'] as const) {
      await open(ctx, type);
      attempts.length = 0;
      await send(page);
      await put(page, { org: 'A', name: 'A', email: 'bad', pw: 'abc' });
      await send(page);
      await put(page, { org: 'Sample Org', name: 'Sample Person', email: 'bad', pw: STRONG });
      await send(page);
      await put(page, { org: 'Sample Org', name: 'Sample Person', email: 'someone@example.invalid', pw: 'weakpass' });
      await send(page);
      await check(`${type === 'organisation' ? 'Organization' : 'Individual'}: empty, too-short, bad e-mail and weak-password forms are all stopped on the page (0 requests)`, () => expect(attempts).toHaveLength(0));
    }
  },

  'SUP-018': async (ctx) => {
    await open(ctx, 'organisation');
    const { page, check } = ctx;
    await check('Full name asks the browser for autocomplete "name"', () => expect(locatorOf(page, 'signup.css.fullname')).toHaveAttribute('autocomplete', expectedOf('signup.attr.name')));
    await check('Email asks for autocomplete "email" and is an e-mail box', async () => {
      await expect(locatorOf(page, 'signup.css.workemail')).toHaveAttribute('autocomplete', expectedOf('signup.attr.email'));
      await expect(locatorOf(page, 'signup.css.workemail')).toHaveAttribute('type', expectedOf('signup.attr.email'));
    });
    await check('Password asks for autocomplete "new-password" and is hidden', async () => {
      await expect(locatorOf(page, 'signup.css.password')).toHaveAttribute('autocomplete', expectedOf('signup.attr.new-password'));
      await expect(locatorOf(page, 'signup.css.password')).toHaveAttribute('type', expectedOf('signup.attr.password'));
    });
    attempts.length = 0;
    const email = FAKE_EMAIL();
    await put(page, { org: 'A', name: 'Sample Person', email, pw: 'Secret1!shouldnotleak' });
    await send(page);
    await check('The typed e-mail and password are not in the address after pressing Create Account', () => {
      const url = safeDecode(page.url());
      expect(url).not.toContain(email);
      expect(url).not.toContain('shouldnotleak');
    });
    await check('The page is not sent to the sign-in screen or the app by an invalid form', () => expect(page).toHaveURL(/\/auth\/register/i));
  },

  'SUP-019': async (ctx) => {
    await open(ctx, 'organisation');
    const { page, check } = ctx;
    attempts.length = 0;
    await check('Tab order inside the form is Account type → Organization name → Full name → Work email → Password', async () => {
      await locatorOf(page, 'signup.css.accounttype').focus();
      const order: string[] = [];
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('Tab');
        order.push(await page.evaluate(() => document.activeElement?.id ?? ''));
      }
      expect(order.slice(0, 4)).toEqual(['organisationName', 'fullName', 'workEmail', 'password']);
    });
    await check('Pressing Enter in the Password box submits the form (the "required" messages appear)', async () => {
      await locatorOf(page, 'signup.css.password').focus();
      await page.keyboard.press('Enter');
      await expect.poll(async () => formText(page), { timeout: 10_000 }).toMatch(loose('Full name is required'));
    });
    await sentNothing(check);
  },

  'SUP-020': async (ctx) => {
    await open(ctx, 'individual');
    const { page, check } = ctx;
    attempts.length = 0;
    await put(page, { name: 'Sample Person', email: FAKE_EMAIL(), pw: 'Typed1!value' });
    await send(page);
    await page.reload();
    await locatorOf(page, 'signup.css.fullname').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
    await check('After a reload the boxes are empty again (nothing typed is kept)', async () => {
      await expect(locatorOf(page, 'signup.css.fullname')).toHaveValue('');
      await expect(locatorOf(page, 'signup.css.workemail')).toHaveValue('');
      await expect(locatorOf(page, 'signup.css.password')).toHaveValue('');
    });
    await check('After a reload no old error message is shown', async () => expect(await formText(page)).not.toMatch(/is required|must be|valid email/i));
    await check('After a reload the account type is "Organization" again', () => expect(locatorOf(page, 'signup.css.accounttype-option-checked')).toHaveText(expectedOf('signup.text.organi-sz-ation')));
    await sentNothing(check);
  },
};
