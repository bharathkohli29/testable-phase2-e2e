import { Page } from '@playwright/test';
import { SsoProviderPage } from '../shared/SsoProviderPage';

export class AzureAdSsoPage extends SsoProviderPage {
  constructor(page: Page, baseUrl: string) {
    super(page, baseUrl, 'Azure AD');
  }
}
