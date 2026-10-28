import { Locator, Page, Request } from '@playwright/test';
import { obj as locatorOf } from '../../../core/keywords/obj';

/**
 * Base for the "Sign in with <Google|Microsoft|GitHub>" buttons on /auth/login.
 * Verified live: the button's accessible name is "Sign in with <Provider>"; clicking it asks the Testable API for an
 * authorization URL and sends the browser to the provider (same tab). All buttons are disabled while that happens.
 * Provider-specific sign-in screens live in the subclasses (completeProviderLogin).
 */
export abstract class OAuthLoginPage {
  readonly page: Page;
  readonly baseUrl: string;
  readonly providerName: string;
  readonly button: Locator;
  readonly heading: Locator;

  constructor(page: Page, baseUrl: string, providerName: string) {
    this.page = page;
    this.baseUrl = baseUrl;
    this.providerName = providerName;
    this.button = page.getByRole('button', { name: `Sign in with ${providerName}` });
    this.heading = locatorOf(page, 'login.heading.item-2');
  }

  async open(): Promise<void> {
    await this.page.goto(`${this.baseUrl}/auth/login`);
    await this.heading.waitFor({ state: 'visible' });
  }

  /**
   * Clicks the button and returns the first navigation request that goes to the provider's authorization host.
   * Works whether the site redirects the tab or opens a popup (listens on the whole browser context).
   * Nothing is typed on the provider's page.
   */
  async clickAndCaptureAuthorizeUrl(host: RegExp, timeoutMs = 30_000): Promise<URL> {
    const wanted = this.page
      .context()
      .waitForEvent('request', { predicate: (r: Request) => r.isNavigationRequest() && host.test(new URL(r.url()).host), timeout: timeoutMs });
    await this.button.click();
    return new URL((await wanted).url());
  }

  /** Leaves the provider (closes a popup, or goes Back in the same tab) and waits for Testable's login page. */
  async backToTestable(): Promise<void> {
    for (const p of this.page.context().pages()) {
      if (p !== this.page) await p.close().catch(() => undefined);
    }
    if (!this.page.url().startsWith(this.baseUrl)) await this.page.goBack({ timeout: 15_000 }).catch(() => undefined);
    const onLogin = await this.page.waitForURL(/\/auth\/login/i, { timeout: 10_000 }).then(() => true, () => false);
    if (!onLogin) await this.page.goto(`${this.baseUrl}/auth/login`); // Back did not work (long history): open Testable's login page directly
    await this.page.reload(); // a restored page can keep the buttons disabled
    await this.heading.waitFor({ state: 'visible' });
  }

  /** The provider's own sign-in screens. Only called when a test account is filled in on the Input sheet. */
  abstract completeProviderLogin(email: string, password: string): Promise<void>;
}
