import { expect } from '@playwright/test';
import { AppShell } from '../../../../core/pages/AppShell';
import { CaseHandler } from '../../../../core/runner/registerCases';
import { SsoProviderPage } from './SsoProviderPage';

export interface SsoCaseIds {
  select: string;
  redirect: string;
  login: string;
}

const hostRegex = (data: Record<string, string>): RegExp => {
  if (!data.idp_host) throw new Error('Test Data needs idp_host=<regex of the identity-provider host>');
  return new RegExp(`^(${data.idp_host})$`, 'i');
};

/**
 * The three cases every SSO identity provider has.
 *   select   – choose the provider in the SSO list: the form switches to "Authenticate with <provider>" (runs now)
 *   redirect – email + Authenticate sends the browser to the provider's host, nothing typed there
 *              (SKIPPED until an email for that provider is filled in on the Input sheet)
 *   login    – full sign-in through the provider (SKIPPED until email + password are filled in)
 */
export function ssoProviderHandlers<P extends SsoProviderPage>(ids: SsoCaseIds): Record<string, CaseHandler<P>> {
  return {
    [ids.select]: async ({ pg, page, input, check, note }) => {
      const app = new AppShell(page, input.baseUrl);
      await pg.open();
      await check(`"${pg.providerName}" is offered in the SSO list`, async () => {
        await pg.openList();
        await expect(pg.option(pg.providerName)).toBeVisible();
      });
      await pg.option(pg.providerName).click();
      await check('The list closes after choosing', () => expect(pg.list).toBeHidden());
      await check(`Submit button reads "${pg.submitLabel(pg.providerName)}"`, () =>
        expect(pg.submit).toHaveAccessibleName(new RegExp(`^${pg.submitLabel(pg.providerName)}`, 'i')));
      await check('Google / Microsoft / GitHub buttons are still shown', () => expect(pg.socialButtons).toHaveCount(3));
      note(`Google / Microsoft / GitHub buttons while "${pg.providerName}" is chosen: ${(await pg.socialButtons.evaluateAll((els) => els.map((e) => ((e as HTMLButtonElement).disabled || e.getAttribute('aria-disabled') === 'true' ? 'disabled' : 'enabled')))).join(', ')}`);
      await check('User stays on the login page, not signed in', async () => {
        await expect(page).toHaveURL(/\/auth\/login/i);
        await app.expectNotAuthenticated();
      });
    },

    [ids.redirect]: async ({ pg, data, check, step, note, skip }) => {
      const email = data.email ?? '';
      if (!email) skip(`No ${pg.providerName} email in the Input sheet - code is ready, not executed.`);
      const host = hostRegex(data);
      await pg.open();
      await pg.chooseProvider();
      let url!: URL;
      await step(`Authenticate sends the browser to ${data.idp_host} (nothing is typed there)`, async () => {
        url = await pg.submitAndCaptureIdpUrl(email, host);
      });
      note(`Identity provider URL: ${url.origin}${url.pathname}`);
      if (data.idp_path) await check(`Provider path contains "${data.idp_path}"`, () => expect(url.pathname).toContain(data.idp_path));
      if (data.callback_path) {
        await check(`The URL carries Testable's callback "${data.callback_path}"`, () =>
          expect(decodeURIComponent(url.search)).toContain(data.callback_path));
      }
    },

    [ids.login]: async ({ pg, page, input, data, check, step, skip }) => {
      const email = data.email ?? '';
      const password = data.password ?? '';
      if (!email || !password) skip(`No ${pg.providerName} test account in the Input sheet - code is ready, not executed.`);
      const app = new AppShell(page, input.baseUrl);
      const origin = new URL(input.baseUrl).origin;
      await pg.open();
      await pg.chooseProvider();
      await pg.submitAndCaptureIdpUrl(email, hostRegex(data));
      await pg.completeIdpLogin(email, password);
      await check(`After the ${pg.providerName} sign-in the browser returns to Testable and leaves /auth/`, () =>
        page.waitForURL((u) => u.origin === origin && !/\/auth\//i.test(u.pathname), { timeout: 90_000 }));
      await step('Signed-in app is shown (Sign out button visible)', () => app.expectAuthenticated());
      await app.signOut();
      await check('Sign out returns to the login page', () => expect(page).toHaveURL(/\/auth\/login/i));
    },
  };
}
