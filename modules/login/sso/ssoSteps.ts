import { expect } from '@playwright/test';
import { AppShell } from '../../../core/pages/AppShell';
import { CaseHandler } from '../../../core/runner/registerCases';
import { SsoLoginPage } from './ssoLogin.page';

/** "Okta|okta.com,Azure AD|azure.microsoft.com" -> [{ name, domain }] */
function providers(text: string | undefined): Array<{ name: string; domain: string }> {
  return (text ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [name, domain = ''] = p.split('|').map((x) => x.trim());
      return { name, domain };
    });
}

export const ssoHandlers: Record<string, CaseHandler<SsoLoginPage>> = {
  'LOGIN-SSO-001': async ({ pg, check, snap }) => {
    await pg.open();
    await snap('"Sign in with SSO" control (closed)', pg.trigger);
    await check('"Sign in with SSO" control is visible', () => expect(pg.trigger).toBeVisible());
    await check('Control is enabled', () => expect(pg.trigger).toBeEnabled());
    await check('It announces a list (aria-haspopup=listbox)', () => expect(pg.trigger).toHaveAttribute('aria-haspopup', 'listbox'));
    await check('The list is closed at first (aria-expanded=false)', () => expect(pg.trigger).toHaveAttribute('aria-expanded', 'false'));
    await check('The provider list is not shown yet', () => expect(pg.list).toBeHidden());
  },

  'LOGIN-SSO-002': async ({ pg, data, check, note, snap }) => {
    const expected = providers(data.providers);
    await pg.open();
    await pg.trigger.click();
    await snap('SSO provider list open', [pg.trigger, pg.list]);
    await check('Clicking opens the list (aria-expanded=true)', () => expect(pg.trigger).toHaveAttribute('aria-expanded', 'true'));
    await check('Provider list is visible and labelled "SSO Providers"', async () => {
      await expect(pg.list).toBeVisible();
      await expect(pg.list).toHaveAttribute('aria-label', 'SSO Providers');
    });
    await check(`List has ${expected.length} providers`, () => expect(pg.options).toHaveCount(expected.length));
    for (const p of expected) {
      await check(`"${p.name}" is listed with its domain "${p.domain}"`, async () => {
        await expect(pg.option(p.name)).toBeVisible();
        await expect(pg.option(p.name)).toContainText(p.domain);
      });
    }
    note(`Providers shown: ${(await pg.options.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).join(' / ')}`);
  },

  'LOGIN-SSO-003': async ({ pg, page, input, data, check, note, snap }) => {
    const provider = data.provider ?? 'Okta';
    const app = new AppShell(page, input.baseUrl);
    await pg.open();
    await pg.choose(provider);
    await snap(`Form after choosing ${provider} (submit button changed)`, pg.submit);
    await check('The list closes after choosing', () => expect(pg.list).toBeHidden());
    await check(`Submit button now reads "${pg.submitLabel(provider)}"`, () =>
      expect(pg.submit).toHaveAccessibleName(new RegExp(`^${pg.submitLabel(provider)}`, 'i')));
    if (/^y/i.test(data.social_disabled ?? '')) {
      await check('Google / Microsoft / GitHub buttons are disabled while an SSO provider is chosen', async () => {
        await expect(pg.socialButtons).toHaveCount(3);
        for (const b of await pg.socialButtons.all()) await expect(b).toBeDisabled();
      });
    }
    await check('User stays on the login page, not signed in', async () => {
      await expect(page).toHaveURL(/\/auth\/login/i);
      await app.expectNotAuthenticated();
    });
  },

  'LOGIN-SSO-004': async ({ pg, data, check, focus }) => {
    const names = providers(data.providers).map((p) => p.name);
    await pg.open();
    focus(pg.submit);
    for (const name of names) {
      await check(`Choosing "${name}" changes the button to "${pg.submitLabel(name)}"`, async () => {
        await pg.choose(name);
        await expect(pg.submit).toHaveAccessibleName(new RegExp(`^${pg.submitLabel(name)}`, 'i'));
      });
    }
  },

  'LOGIN-SSO-006': async ({ pg, check, focus }) => {
    await pg.open();
    focus(pg.trigger);
    await pg.trigger.click();
    await check('The first click opens the provider list', () => expect(pg.list).toBeVisible());
    await pg.trigger.click();
    await check('Clicking "Sign in with SSO" again hides the provider list', async () => {
      await expect(pg.list).toBeHidden();
      await expect(pg.trigger).toHaveAttribute('aria-expanded', 'false');
    });
  },

  'LOGIN-SSO-005': async ({ pg, page, input, data, check, step, skip, focus }) => {
    const email = data.email ?? '';
    const password = data.password ?? '';
    if (!email || !password) skip('No SSO test account in the Input sheet (SSO_EMAIL / SSO_PASSWORD) - code is ready, not executed.');
    const app = new AppShell(page, input.baseUrl);
    const origin = new URL(input.baseUrl).origin;
    focus(app.signOutButton);
    await pg.open();
    await pg.choose(data.provider ?? 'Okta');
    await pg.email.fill(email);
    await pg.submit.click();
    await pg.completeIdpLogin(email, password);
    await check('After the identity-provider sign-in the browser returns to Testable and leaves /auth/', () =>
      page.waitForURL((u) => u.origin === origin && !/\/auth\//i.test(u.pathname), { timeout: 90_000 }));
    await step('Signed-in app is shown (Sign out button visible)', () => app.expectAuthenticated());
  },
};
