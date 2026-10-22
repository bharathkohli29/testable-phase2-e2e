import { Page } from '@playwright/test';
import { OAuthLoginPage } from '../shared/OAuthLoginPage';

export class MicrosoftLoginPage extends OAuthLoginPage {
  constructor(page: Page, baseUrl: string) {
    super(page, baseUrl, 'Microsoft');
  }

  async completeProviderLogin(email: string, password: string): Promise<void> {
    const user = this.page.locator('input[name="loginfmt"]');
    await user.waitFor({ state: 'visible', timeout: 30_000 });
    await user.fill(email);
    await user.press('Enter');
    const pw = this.page.locator('input[name="passwd"]');
    await pw.waitFor({ state: 'visible', timeout: 30_000 });
    await pw.fill(password);
    await pw.press('Enter');
    // "Stay signed in?" prompt, when shown
    const no = this.page.getByRole('button', { name: /^No$/ });
    if (await no.isVisible({ timeout: 5_000 }).catch(() => false)) await no.click();
  }
}
