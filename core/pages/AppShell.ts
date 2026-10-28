import { expect, Locator, Page } from '@playwright/test';
import { obj as locatorOf } from '../keywords/obj';

/**
 * The signed-in application frame (sidebar etc.). Shared by every module that needs to know
 * "am I logged in?" or to sign out. Verified live: sidebar "Sign out" button -> confirm dialog.
 */
export class AppShell {
  readonly page: Page;
  readonly baseUrl: string;
  readonly signOutButton: Locator;

  constructor(page: Page, baseUrl: string) {
    this.page = page;
    this.baseUrl = baseUrl;
    this.signOutButton = locatorOf(page, 'shell.button.sign-out').first();
  }

  async goto(pathname: string): Promise<void> {
    await this.page.goto(`${this.baseUrl}${pathname}`);
  }

  /** Email/username + password sign-in through the login form (used as the precondition of every signed-in module). */
  async login(email: string, password: string): Promise<void> {
    await this.page.goto(`${this.baseUrl}/auth/login`);
    await locatorOf(this.page, 'shell.css.emailorusername').fill(email);
    await locatorOf(this.page, 'shell.css.password').fill(password);
    await locatorOf(this.page, 'shell.css.button-type-submit').click();
    await this.expectAuthenticated();
  }

  async expectAuthenticated(): Promise<void> {
    await expect(this.signOutButton).toBeVisible({ timeout: 30_000 });
  }

  async expectNotAuthenticated(): Promise<void> {
    await expect(this.signOutButton).toHaveCount(0);
  }

  async signOut(): Promise<void> {
    await this.signOutButton.click();
    await locatorOf(locatorOf(this.page, 'shell.alertdialog.item'), 'shell.button.sign-out').click();
  }
}
