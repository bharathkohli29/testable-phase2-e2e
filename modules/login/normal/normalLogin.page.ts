import { Locator, Page } from '@playwright/test';
import { loose } from '../shared/text';

export const LOGIN_PATH = '/auth/login';
export const LOGIN_URL = /\/auth\/login/i;
export const ANY_AUTH_URL = /\/auth\//i;

/**
 * Email/username + password login form. Locators verified live on /auth/login:
 *   #emailOrUsername, #password, button "Show/Hide password", button[type=submit] "Authenticate",
 *   field errors = p[role=alert], form error = div[role=alert] (the form has noValidate, so no native tooltips).
 */
export class NormalLoginPage {
  readonly page: Page;
  readonly baseUrl: string;

  readonly heading: Locator;
  readonly email: Locator;
  readonly password: Locator;
  readonly passwordToggle: Locator;
  readonly authenticate: Locator;
  readonly forgotPasswordLink: Locator;
  readonly registerLink: Locator;
  readonly fieldErrors: Locator;
  readonly formError: Locator;

  constructor(page: Page, baseUrl: string) {
    this.page = page;
    this.baseUrl = baseUrl;
    this.heading = page.getByRole('heading', { level: 1 }).first();
    this.email = page.locator('#emailOrUsername');
    this.password = page.locator('#password');
    this.passwordToggle = page.getByRole('button', { name: /(show|hide)\s*password/i });
    this.authenticate = page.locator('button[type="submit"]');
    this.forgotPasswordLink = page.getByRole('link', { name: /forgot\s*password/i }).first();
    this.registerLink = page.getByRole('link', { name: /^\s*register\s*$/i }).first();
    this.fieldErrors = page.locator('p[role="alert"]:not([id^="__next-route-announcer"])').filter({ hasText: /\S/ }); // not the (invisible) Next.js route announcer, no empty ones
    this.formError = page.locator('div[role="alert"]');
  }

  async open(): Promise<void> {
    await this.page.goto(`${this.baseUrl}${LOGIN_PATH}`);
    await this.heading.waitFor({ state: 'visible' });
  }

  /** Empty values are left untouched (so "empty field" cases work). */
  async fill(email: string, password: string): Promise<void> {
    if (email) await this.email.fill(email);
    if (password) await this.password.fill(password);
  }

  async submit(): Promise<void> {
    await this.authenticate.click();
  }

  async login(email: string, password: string): Promise<void> {
    await this.open();
    await this.fill(email, password);
    await this.submit();
  }

  fieldError(text: string): Locator {
    return this.fieldErrors.filter({ hasText: loose(text) }).first();
  }
}
