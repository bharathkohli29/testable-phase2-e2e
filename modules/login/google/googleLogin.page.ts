import { Page } from '@playwright/test';
import { OAuthLoginPage } from '../shared/OAuthLoginPage';
import { obj as locatorOf } from '../../../core/keywords/obj';

export class GoogleLoginPage extends OAuthLoginPage {
  constructor(page: Page, baseUrl: string) {
    super(page, baseUrl, 'Google');
  }

  async completeProviderLogin(email: string, password: string): Promise<void> {
    const user = locatorOf(this.page, 'login.css.input-type-email').first();
    await user.waitFor({ state: 'visible', timeout: 30_000 });
    await user.fill(email);
    await user.press('Enter');
    const pw = locatorOf(this.page, 'login.css.input-type-password').first();
    await pw.waitFor({ state: 'visible', timeout: 30_000 });
    await pw.fill(password);
    await pw.press('Enter');
  }
}
