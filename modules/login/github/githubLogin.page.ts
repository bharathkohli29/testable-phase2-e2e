import { Page } from '@playwright/test';
import { OAuthLoginPage } from '../shared/OAuthLoginPage';

export class GitHubLoginPage extends OAuthLoginPage {
  constructor(page: Page, baseUrl: string) {
    super(page, baseUrl, 'GitHub');
  }

  async completeProviderLogin(email: string, password: string): Promise<void> {
    const user = this.page.locator('#login_field');
    await user.waitFor({ state: 'visible', timeout: 30_000 });
    await user.fill(email);
    await this.page.locator('#password').fill(password);
    await this.page.locator('#password').press('Enter');
    const authorize = this.page.getByRole('button', { name: /^Authorize/i });
    if (await authorize.isVisible({ timeout: 5_000 }).catch(() => false)) await authorize.click();
  }
}
