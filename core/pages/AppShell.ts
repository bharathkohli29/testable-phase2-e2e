import { expect, Locator, Page } from '@playwright/test';

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
    this.signOutButton = page.getByRole('button', { name: 'Sign out', exact: true }).first();
  }

  async goto(pathname: string): Promise<void> {
    await this.page.goto(`${this.baseUrl}${pathname}`);
  }

  /** Email/username + password sign-in through the login form (used as the precondition of every signed-in module). */
  async login(email: string, password: string): Promise<void> {
    await this.page.goto(`${this.baseUrl}/auth/login`);
    await this.page.locator('#emailOrUsername').fill(email);
    await this.page.locator('#password').fill(password);
    await this.page.locator('button[type="submit"]').click();
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
    await this.page.getByRole('alertdialog').getByRole('button', { name: 'Sign out', exact: true }).click();
  }
}
