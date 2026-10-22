import { Page } from '@playwright/test';
import { SsoLoginPage } from '../ssoLogin.page';

/** Base for one identity provider in the "Sign in with SSO" list (Okta, Azure AD, OneLogin, Auth0). */
export abstract class SsoProviderPage extends SsoLoginPage {
  readonly providerName: string;

  protected constructor(page: Page, baseUrl: string, providerName: string) {
    super(page, baseUrl);
    this.providerName = providerName;
  }

  /** Opens the SSO list and chooses this provider. */
  async chooseProvider(): Promise<void> {
    await this.choose(this.providerName);
  }

  /** Types the email, presses Authenticate and returns the first navigation to the identity provider's host (nothing is typed there). */
  async submitAndCaptureIdpUrl(email: string, host: RegExp, timeoutMs = 30_000): Promise<URL> {
    await this.email.fill(email);
    const wanted = this.page
      .context()
      .waitForEvent('request', { predicate: (r) => r.isNavigationRequest() && host.test(new URL(r.url()).host), timeout: timeoutMs });
    await this.submit.click();
    return new URL((await wanted).url());
  }
}
