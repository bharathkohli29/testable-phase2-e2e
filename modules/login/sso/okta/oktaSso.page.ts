import { Page } from '@playwright/test';
import { SsoProviderPage } from '../shared/SsoProviderPage';

export class OktaSsoPage extends SsoProviderPage {
  constructor(page: Page, baseUrl: string) {
    super(page, baseUrl, 'Okta');
  }
}
