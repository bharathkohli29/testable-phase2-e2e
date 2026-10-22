import { Locator, Page } from '@playwright/test';

/**
 * While a dropdown menu (e.g. the "More (n)" categories on the Confidence Engine) is open, the page hides every other control from
 * role-based lookups. Closing any open menu first stops one failed step from making all the following checks fail.
 */
export async function closeMenus(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    if (!(await page.locator('[role="menu"]').count().catch(() => 0))) return;
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.waitForTimeout(300);
  }
}

/** The "Closed-Loop Intel" card that says COMING SOON (the page writes the words in capitals with styling, so match any case). */
export const comingSoonCard = (page: Page): Locator =>
  page.locator('a,div,button').filter({ hasText: /Closed.?Loop Intel/i }).filter({ hasText: /coming soon/i }).last();

/** A label that the page shows in capitals but stores in normal case. Exact, any case. */
export const labelText = (page: Page, label: string): Locator =>
  page.getByText(new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'));
