import { Page } from '@playwright/test';
import { OAuthLoginPage } from '../shared/OAuthLoginPage';

export class GoogleLoginPage extends OAuthLoginPage {
  constructor(page: Page, baseUrl: string) {
    super(page, baseUrl, 'Google');
  }

  async completeProviderLogin(email: string, password: string): Promise<void> {
    const user = this.page.locator('input[type="email"]').first();
    await user.waitFor({ state: 'visible', timeout: 30_000 });
    await user.fill(email);
    await user.press('Enter');
    const pw = this.page.locator('input[type="password"]').first();
    await pw.waitFor({ state: 'visible', timeout: 30_000 });
    await pw.fill(password);
    await pw.press('Enter');
  }
}
