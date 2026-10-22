import { expect, Page } from '@playwright/test';
import { CaseHandler } from '../../core/runner/registerCases';
import { RepoPage, ci, has } from '../repo/shared/RepoPage';
import { bodyText, norm, open } from '../flow/ui';

/**
 * The Execution Assistant HOME (the empty conversation): headline, the three analysis cards, the message box with slash commands,
 * the header buttons and the "Change repository / branch" dialog. Verified live on QA (15 Oct). The cards and Send are NEVER pressed
 * (they start a real analysis); the dialog is only opened and closed.
 */
const startBox = (page: Page) => page.getByText(/^\s*start with an analysis\s*$/i).first();
const composer = (page: Page) => page.getByRole('textbox', { name: /ask anything/i }).first();

/** Opens the Execution Assistant and, when an old conversation is on screen, starts a new one (that only clears the screen). */
async function homeState(page: Page, input: import('../../core/types').InputConfig): Promise<void> {
  await open(page, input, '/execution-assistant');
  await composer(page).waitFor({ state: 'visible', timeout: 30_000 });
  if (!(await startBox(page).isVisible().catch(() => false))) {
    const fresh = page.getByRole('button', { name: /new conversation/i }).first();
    if (await fresh.isVisible().catch(() => false)) { await fresh.click(); await page.waitForTimeout(1_000); }
  }
}

const card = (page: Page, title: RegExp) => page.getByRole('button').filter({ hasText: title }).first();

export const assistantSteps: Record<string, CaseHandler<RepoPage>> = {
  'EAH-001': async ({ page, input, check, snap }) => {
    await homeState(page, input);
    const head = page.getByRole('heading', { name: /know before you deploy/i }).first();
    await check('The headline "Know before you deploy." is shown', () => expect(head).toBeVisible());
    await check('"Testable analyzes your code, runtime behavior, and risks to measure production confidence." is shown', () =>
      expect(page.getByText(/analy[sz]es your code,?\s*runtime behavio(u)?r,?\s*and risks to measure production confidence/i).first()).toBeVisible());
    await check('"Start with an analysis" and "Choose one of the analyses below or ask your own question." are shown', async () => {
      await expect(startBox(page)).toBeVisible();
      await expect(page.getByText(/choose one of the analyses below or ask your own question/i).first()).toBeVisible();
    });
    await snap('Execution Assistant home headline', head);
  },

  'EAH-002': async ({ page, input, check, note, snap }) => {
    await homeState(page, input);
    const safe = card(page, /can i safely deploy this commit/i);
    await check('Under "Code analysis": "Can I safely deploy this commit?" is shown with "Recommended"', async () => {
      await expect(page.getByText(/^\s*code analysis\s*$/i).first()).toBeVisible();
      await expect(safe).toBeVisible();
      await expect(safe).toContainText(/recommended/i);
    });
    await check('It explains "Review the latest changes for release blockers and confidence."', () => expect(safe).toContainText(/review the latest changes for release blockers and confidence/i));
    await check('"Where are the biggest security risks?" is shown with "Identify vulnerable code, risky dependencies, and security hotspots."', async () => {
      const risk = card(page, /where are the biggest security risks/i);
      await expect(risk).toBeVisible();
      await expect(risk).toContainText(/identify vulnerable code,?\s*risky dependencies,?\s*and security hotspots/i);
    });
    const runtime = card(page, /will my application handle production traffic/i);
    await check('Under "Runtime analysis": "Will my application handle production traffic?" is shown with "Coming soon"', async () => {
      await expect(page.getByText(/^\s*runtime analysis\s*$/i).first()).toBeVisible();
      await expect(runtime).toBeVisible();
      await expect(runtime).toContainText(/coming soon/i);
    });
    const off = await runtime.evaluate((e) => (e as HTMLButtonElement).disabled || e.getAttribute('aria-disabled') === 'true');
    note(off ? 'The Coming soon card is disabled (cannot be pressed).' : 'The Coming soon card is a normal button; it is not pressed here, so what it does was not checked.');
    await snap('Analysis cards', [safe, runtime]);
  },

  'EAH-003': async ({ page, input, check, note, snap }) => {
    await homeState(page, input);
    const box = composer(page);
    await check('The message box says "Ask anything, or type / for commands…"', () => expect(box).toHaveAttribute('placeholder', /ask anything,?\s*or type \/ for commands/i));
    await check('"Attach a file", "Open voice session" and "Send" are shown', async () => {
      for (const n of [/attach a file/i, /open voice session/i, /^\s*send\s*$/i]) await expect(page.getByRole('button', { name: n }).first()).toBeVisible();
    });
    await box.click();
    await box.fill('/');
    const cmds = [['/whitebox', 'Inspect code paths and branch coverage'], ['/rerun', 'One-click re-run with previous configuration'], ['/coverage', 'Show requirement → test case mapping score'], ['/failures', 'Explain recent failures and suggest fixes'], ['/plan', 'Preview tools before anything runs']];
    const t = await bodyText(page);
    note(`After typing "/": ${cmds.filter(([c]) => t.includes(c)).length} of ${cmds.length} commands listed`);
    for (const [c, d] of cmds) {
      await check(`Typing "/" lists ${c} - "${d}"`, () => {
        expect(t, `${c} is not listed`).toContain(c);
        expect(t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')).toContain(d.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''));
      });
    }
    await check('A character counter shows "<typed> / 500"', () => expect(t).toMatch(/\b1\s*\/\s*500\b/));
    await snap('Slash commands in the message box', [box]);
    await box.fill('');
    await page.keyboard.press('Escape').catch(() => undefined);
    await check('The message box is empty again (nothing was sent)', async () => expect(await box.inputValue().catch(() => '')).toBe(''));
  },

  'EAH-004': async ({ page, input, check, snap }) => {
    await homeState(page, input);
    const tools = page.getByRole('group', { name: /connected tools/i }).first();
    await check('The header shows "Connected tools: <provider>"', () => expect(tools).toBeVisible());
    await check('The message box footer shows "<provider> connected"', () => expect(page.getByText(/\b(github|gitlab|bitbucket|azure devops)\s+connected\b/i).first()).toBeVisible());
    await check('The header has "Change repository / branch", "Repository history" and "New conversation"', async () => {
      for (const n of [/change repository\s*\/\s*branch/i, /repository history/i, /new conversation/i]) await expect(page.getByRole('button', { name: n }).first()).toBeVisible();
    });
    await check('The header meter "Executions: n / m" links to /account', async () => {
      const meter = page.locator('a[href="/account"]').filter({ hasText: /Executions:\s*\d+\s*\/\s*\d+/i }).first();
      await expect(meter).toBeVisible();
    });
    await snap('Execution Assistant header', tools);
  },

  'EAH-005': async ({ page, input, check, snap }) => {
    await homeState(page, input);
    const fresh = page.getByRole('button', { name: /new conversation/i }).first();
    await snap('New conversation button', fresh);
    await check('"New conversation" is pressed and the empty conversation is shown (headline, cards and an empty message box)', async () => {
      await fresh.click();
      await expect(startBox(page)).toBeVisible();
      await expect(page.getByRole('heading', { name: /know before you deploy/i }).first()).toBeVisible();
      expect(await composer(page).inputValue()).toBe('');
    });
  },

  'EAH-006': async ({ page, input, check, snap }) => {
    await homeState(page, input);
    const open_ = page.getByRole('button', { name: /change repository\s*\/\s*branch/i }).first();
    const barBefore = norm(await page.getByText(/repository ready|repository/i).first().innerText().catch(() => ''));
    await open_.click();
    const dlg = page.getByRole('dialog').first();
    await check('The dialog "Change repository / branch" opens', () => expect(dlg.getByRole('heading', { name: /change repository\s*\/\s*branch/i })).toBeVisible());
    await check('It says "This updates the tenant default. Historical runs stay on the repository that produced them."', () =>
      expect(dlg).toContainText(/this updates the tenant default\.?\s*historical runs stay on the repository that produced them/i));
    await check('"1. Choose repository" is shown with the repositories as a list', async () => {
      await expect(dlg.getByText(/1\.?\s*choose repository/i).first()).toBeVisible();
      expect(await dlg.getByRole('listitem').count(), 'the repository list is empty').toBeGreaterThan(0);
    });
    await check('The repository in use carries the label "Current"', () => expect(dlg.getByText(ci('Current')).first()).toBeVisible());
    await check('"Connect / Import repository" and "Continue" are shown', async () => {
      await expect(dlg.getByRole('button', { name: /connect\s*\/\s*import repository/i })).toBeVisible();
      await expect(dlg.getByRole('button', { name: /^\s*continue\s*$/i })).toBeVisible();
    });
    await snap('Change repository / branch dialog', dlg);
    await check('"Close" closes the dialog without changing anything', async () => {
      await dlg.getByRole('button', { name: /^\s*close\s*$/i }).first().click();
      await expect(dlg).toBeHidden();
      const barAfter = norm(await page.getByText(/repository ready|repository/i).first().innerText().catch(() => ''));
      expect(barAfter).toBe(barBefore);
    });
  },
};
void has;
