import { Page } from '@playwright/test';
import { OAuthLoginPage } from '../shared/OAuthLoginPage';
import { obj as locatorOf } from '../../../core/keywords/obj';

export class GitHubLoginPage extends OAuthLoginPage {
  constructor(page: Page, baseUrl: string) {
    super(page, baseUrl, 'GitHub');
  }

  async completeProviderLogin(email: string, password: string): Promise<void> {
    const user = locatorOf(this.page, 'login.css.login-field');
    await user.waitFor({ state: 'visible', timeout: 30_000 });
    await user.fill(email);
    await locatorOf(this.page, 'login.css.password').fill(password);
    await locatorOf(this.page, 'login.css.password').press('Enter');
    const authorize = locatorOf(this.page, 'login.button.authorize');
    if (await authorize.isVisible({ timeout: 5_000 }).catch(() => false)) await authorize.click();
  }
}
