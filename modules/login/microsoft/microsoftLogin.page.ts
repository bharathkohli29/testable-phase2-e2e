import { Page } from '@playwright/test';
import { OAuthLoginPage } from '../shared/OAuthLoginPage';
import { obj as locatorOf } from '../../../core/keywords/obj';

export class MicrosoftLoginPage extends OAuthLoginPage {
  constructor(page: Page, baseUrl: string) {
    super(page, baseUrl, 'Microsoft');
  }

  async completeProviderLogin(email: string, password: string): Promise<void> {
    const user = locatorOf(this.page, 'login.css.input-name-loginfmt');
    await user.waitFor({ state: 'visible', timeout: 30_000 });
    await user.fill(email);
    await user.press('Enter');
    const pw = locatorOf(this.page, 'login.css.input-name-passwd');
    await pw.waitFor({ state: 'visible', timeout: 30_000 });
    await pw.fill(password);
    await pw.press('Enter');
    // "Stay signed in?" prompt, when shown
    const no = locatorOf(this.page, 'login.button.no');
    if (await no.isVisible({ timeout: 5_000 }).catch(() => false)) await no.click();
  }
}
