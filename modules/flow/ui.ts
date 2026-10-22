import { Page } from '@playwright/test';
import { InputConfig } from '../../core/types';

/** Small helpers shared by the Account, Support, Assistant home, Context and Redirects modules. */
export const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();
export const escRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const UUID0 = '00000000-0000-4000-8000-000000000000';

/** Visible text of the whole page as one line (the site writes some labels in capitals through CSS, so always match with /i). */
export async function bodyText(page: Page): Promise<string> {
  return norm((await page.locator('body').innerText().catch(() => '')) || '');
}

/** Opens a path of the site and waits until the page has loaded. */
export async function open(page: Page, input: InputConfig, path: string): Promise<void> {
  await page.goto(`${input.baseUrl}${path}`);
  await page.waitForLoadState('domcontentloaded');
}

/** Waits (up to `ms`) until the page text matches `re`; returns the text either way. */
export async function waitText(page: Page, re: RegExp, ms = 15_000): Promise<string> {
  const end = Date.now() + ms;
  let t = await bodyText(page);
  while (!re.test(t) && Date.now() < end) { await page.waitForTimeout(500); t = await bodyText(page); }
  return t;
}

/** Support menu (the round button at the bottom right of every page). */
export const supportButton = (page: Page) => page.getByRole('button', { name: /^\s*support\s*$/i }).first();
export const supportItem = (page: Page, name: RegExp) => page.getByRole('menuitem', { name }).first();

/** Closes whatever the Support button opened (menu, ticket dialog, chat window) without sending anything. */
export async function closeSupport(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    if (await page.getByRole('menu').count().catch(() => 0)) await page.keyboard.press('Escape').catch(() => undefined);
    const dlg = page.getByRole('dialog').filter({ hasText: /support ticket/i }).first();
    if (await dlg.isVisible().catch(() => false)) {
      const cancel = dlg.getByRole('button', { name: /^\s*cancel\s*$/i }).first();
      if (await cancel.isVisible().catch(() => false)) await cancel.click().catch(() => undefined);
    }
    await page.waitForTimeout(250);
  }
  await page.evaluate(() => (window as unknown as { Tawk_API?: { minimize?: () => void } }).Tawk_API?.minimize?.()).catch(() => undefined);
}
