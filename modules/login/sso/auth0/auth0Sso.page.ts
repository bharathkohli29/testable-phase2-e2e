import { Page } from '@playwright/test';
import { SsoProviderPage } from '../shared/SsoProviderPage';

export class Auth0SsoPage extends SsoProviderPage {
  constructor(page: Page, baseUrl: string) {
    super(page, baseUrl, 'Auth0');
  }
}
