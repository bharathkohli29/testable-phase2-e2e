import { expect } from '@playwright/test';
import { AppShell } from '../../../core/pages/AppShell';
import { CaseHandler } from '../../../core/runner/registerCases';
import { OAuthLoginPage } from './OAuthLoginPage';

export interface OAuthCaseIds {
  button: string;
  redirect: string;
  back: string;
  login: string;
}

const hostRegex = (data: Record<string, string>): RegExp => {
  if (!data.authorize_host) throw new Error('Test Data needs authorize_host=<regex of the provider host>');
  return new RegExp(`^(${data.authorize_host})$`, 'i');
};

/**
 * The four cases every "Sign in with <provider>" button has (Google, Microsoft, GitHub).
 *   button   – the button is visible, enabled, named and has an icon
 *   redirect – clicking sends the browser to the provider's authorization URL (nothing typed there)
 *   back     – coming back without signing in leaves the user signed out
 *   login    – full sign-in through the provider (SKIPPED until a test account is filled in)
 */
export function oauthHandlers<P extends OAuthLoginPage>(ids: OAuthCaseIds): Record<string, CaseHandler<P>> {
  return {
    [ids.button]: async ({ pg, check }) => {
      await pg.open();
      await check('Button is visible', () => expect(pg.button).toBeVisible());
      await check('Button is enabled', () => expect(pg.button).toBeEnabled());
      await check(`Accessible name is "Sign in with ${pg.providerName}"`, () => expect(pg.button).toHaveAccessibleName(`Sign in with ${pg.providerName}`));
      await check(`Button text contains "${pg.providerName}"`, () => expect(pg.button).toContainText(pg.providerName));
      await check('Button shows an icon', () => expect(pg.button.locator('svg, img').first()).toBeVisible());
    },

    [ids.redirect]: async ({ pg, data, check, step, note }) => {
      const host = hostRegex(data);
      await pg.open();
      let url!: URL;
      await step(`Clicking the button sends the browser to ${data.authorize_host}`, async () => {
        url = await pg.clickAndCaptureAuthorizeUrl(host);
      });
      note(`Authorization URL: ${url.origin}${url.pathname}`);
      if (data.authorize_path) await check(`Path contains "${data.authorize_path}"`, () => expect(url.pathname).toContain(data.authorize_path));
      for (const p of (data.required_params ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
        await check(`URL carries the "${p}" parameter`, () => expect(url.searchParams.has(p)).toBe(true));
      }
      if (data.callback_path) {
        await check(`redirect_uri points at Testable's ${data.callback_path}`, () =>
          expect(decodeURIComponent(url.searchParams.get('redirect_uri') ?? '')).toContain(data.callback_path));
      }
      if (data.scope_contains) {
        await check(`scope contains "${data.scope_contains}"`, () => expect(url.searchParams.get('scope') ?? '').toContain(data.scope_contains));
      }
    },

    [ids.back]: async ({ pg, page, input, data, check, step }) => {
      const app = new AppShell(page, input.baseUrl);
      await pg.open();
      await step('Click the button and leave for the provider', () => pg.clickAndCaptureAuthorizeUrl(hostRegex(data)));
      await pg.backToTestable();
      await check("Testable's login page is shown again", () => expect(page).toHaveURL(/\/auth\/login/i));
      await check('The provider button is usable again', () => expect(pg.button).toBeEnabled());
      await check('The user is not signed in', () => app.expectNotAuthenticated());
    },

    [ids.login]: async ({ pg, page, input, data, check, step, skip }) => {
      const email = data.email ?? '';
      const password = data.password ?? '';
      if (!email || !password) skip(`No ${pg.providerName} test account in the Input sheet - code is ready, not executed.`);
      const app = new AppShell(page, input.baseUrl);
      const origin = new URL(input.baseUrl).origin;
      await pg.open();
      await pg.clickAndCaptureAuthorizeUrl(hostRegex(data));
      await pg.completeProviderLogin(email, password);
      await check(`After the ${pg.providerName} sign-in the browser returns to Testable and leaves /auth/`, () =>
        page.waitForURL((u) => u.origin === origin && !/\/auth\//i.test(u.pathname), { timeout: 90_000 }));
      await step('Signed-in app is shown (Sign out button visible)', () => app.expectAuthenticated());
      await app.signOut();
      await check('Sign out returns to the login page', () => expect(page).toHaveURL(/\/auth\/login/i));
    },
  };
}
