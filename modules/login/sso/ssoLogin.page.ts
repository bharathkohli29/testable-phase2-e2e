import { Locator, Page } from '@playwright/test';
import { obj as locatorOf } from '../../../core/keywords/obj';

/**
 * "Sign in with SSO". Verified live on /auth/login:
 *   trigger  = button[aria-label="Sign in with SSO"] (aria-haspopup=listbox, aria-expanded false/true)
 *   list     = #sso-provider-list [role=listbox, aria-label="SSO Providers"] with role=option rows "<Name> <domain>"
 *   choosing a provider closes the list, turns the submit button into "Authenticate with <Name>" and disables the
 *   Google / Microsoft / GitHub buttons.
 */
export class SsoLoginPage {
  readonly page: Page;
  readonly baseUrl: string;
  readonly heading: Locator;
  readonly trigger: Locator;
  readonly list: Locator;
  readonly options: Locator;
  readonly email: Locator;
  readonly submit: Locator;
  readonly socialButtons: Locator;

  constructor(page: Page, baseUrl: string) {
    this.page = page;
    this.baseUrl = baseUrl;
    this.heading = locatorOf(page, 'login.heading.item-2');
    this.trigger = locatorOf(page, 'login.button.sign-in-with-sso');
    this.list = locatorOf(page, 'login.css.sso-provider-list');
    this.options = locatorOf(this.list, 'login.option.item');
    this.email = locatorOf(page, 'login.css.emailorusername');
    this.submit = locatorOf(page, 'login.button.authenticate'); // role + name: works whatever the button's type attribute is
    this.socialButtons = locatorOf(page, 'login.button.sign-in-with-google-microsoft-github');
  }

  async open(): Promise<void> {
    await this.page.goto(`${this.baseUrl}/auth/login`);
    await this.heading.waitFor({ state: 'visible' });
  }

  option(name: string): Locator {
    return this.options.filter({ has: this.page.getByText(name, { exact: true }) });
  }

  async openList(): Promise<void> {
    await this.trigger.click();
    await this.list.waitFor({ state: 'visible' });
  }

  async choose(name: string): Promise<void> {
    await this.openList();
    await this.option(name).click();
  }

  submitLabel(provider: string): string {
    return `Authenticate with ${provider}`;
  }

  /** Not run until SSO_EMAIL / SSO_PASSWORD are filled in. Generic identity-provider screens: adjust to your IdP. */
  async completeIdpLogin(email: string, password: string): Promise<void> {
    const origin = new URL(this.baseUrl).origin;
    await this.page.waitForURL((u) => u.origin !== origin, { timeout: 30_000 });
    const user = locatorOf(this.page, 'login.css.input-type-email-input-name-identifi')
      .first();
    await user.fill(email);
    await user.press('Enter');
    const pw = locatorOf(this.page, 'login.css.input-type-password').first();
    await pw.waitFor({ state: 'visible', timeout: 30_000 });
    await pw.fill(password);
    await pw.press('Enter');
  }
}
