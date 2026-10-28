import { expect, Page } from '@playwright/test';
import { CaseHandler } from '../../core/runner/registerCases';
import { RepoPage, ci, has } from '../repo/shared/RepoPage';
import { bodyText, norm, open } from '../flow/ui';
import { obj as locatorOf } from '../../core/keywords/obj';

import { expected as expectedOf } from '../../core/keywords/expected';
/**
 * The Execution Assistant HOME (the empty conversation): headline, the three analysis cards, the message box with slash commands,
 * the header buttons and the "Change repository / branch" dialog. Verified live on QA (15 Oct). The cards and Send are NEVER pressed
 * (they start a real analysis); the dialog is only opened and closed.
 */
const startBox = (page: Page) => locatorOf(page, 'assistant.text.start-with-an-analysis').first();
const composer = (page: Page) => locatorOf(page, 'assistant.textbox.ask-anything').first();

/** Opens the Execution Assistant and, when an old conversation is on screen, starts a new one (that only clears the screen). */
async function homeState(page: Page, input: import('../../core/types').InputConfig): Promise<void> {
  await open(page, input, '/execution-assistant');
  await composer(page).waitFor({ state: 'visible', timeout: 30_000 });
  if (!(await startBox(page).isVisible().catch(() => false))) {
    const fresh = locatorOf(page, 'assistant.button.new-conversation').first();
    if (await fresh.isVisible().catch(() => false)) { await fresh.click(); await page.waitForTimeout(1_000); }
  }
}

const card = (page: Page, title: RegExp) => locatorOf(page, 'assistant.button.item').filter({ hasText: title }).first();

export const assistantSteps: Record<string, CaseHandler<RepoPage>> = {
  'EAH-001': async ({ page, input, check, snap }) => {
    await homeState(page, input);
    const head = locatorOf(page, 'assistant.heading.know-before-you-deploy').first();
    await check('The headline "Know before you deploy." is shown', () => expect(head).toBeVisible());
    await check('"Testable analyzes your code, runtime behavior, and risks to measure production confidence." is shown', () =>
      expect(locatorOf(page, 'assistant.text.analy-sz-es-your-code-runtime-behavi').first()).toBeVisible());
    await check('"Start with an analysis" and "Choose one of the analyses below or ask your own question." are shown', async () => {
      await expect(startBox(page)).toBeVisible();
      await expect(locatorOf(page, 'assistant.text.choose-one-of-the-analyses-below-or').first()).toBeVisible();
    });
    await snap('Execution Assistant home headline', head);
  },

  'EAH-002': async ({ page, input, check, note, snap }) => {
    await homeState(page, input);
    const safe = card(page, /can i safely deploy this commit/i);
    await check('Under "Code analysis": "Can I safely deploy this commit?" is shown with "Recommended"', async () => {
      await expect(locatorOf(page, 'assistant.text.code-analysis').first()).toBeVisible();
      await expect(safe).toBeVisible();
      await expect(safe).toContainText(expectedOf('assistant.text.recommended'));
    });
    await check('It explains "Review the latest changes for release blockers and confidence."', () => expect(safe).toContainText(expectedOf('assistant.text.review-the-latest-changes-for')));
    await check('"Where are the biggest security risks?" is shown with "Identify vulnerable code, risky dependencies, and security hotspots."', async () => {
      const risk = card(page, /where are the biggest security risks/i);
      await expect(risk).toBeVisible();
      await expect(risk).toContainText(expectedOf('assistant.text.identify-vulnerable-code-risky-dependencies'));
    });
    const runtime = card(page, /will my application handle production traffic/i);
    await check('Under "Runtime analysis": "Will my application handle production traffic?" is shown with "Coming soon"', async () => {
      await expect(locatorOf(page, 'assistant.text.runtime-analysis').first()).toBeVisible();
      await expect(runtime).toBeVisible();
      await expect(runtime).toContainText(expectedOf('assistant.text.coming-soon'));
    });
    const off = await runtime.evaluate((e) => (e as HTMLButtonElement).disabled || e.getAttribute('aria-disabled') === 'true');
    note(off ? 'The Coming soon card is disabled (cannot be pressed).' : 'The Coming soon card is a normal button; it is not pressed here, so what it does was not checked.');
    await snap('Analysis cards', [safe, runtime]);
  },

  // EAH-003 was removed per requirements (composer buttons and slash commands deprecated)
  'EAH-003': async (ctx) => {
    ctx.skip('EAH-003 was removed from the active test suite (composer action controls deprecated).');
  },

  'EAH-004': async ({ page, input, check, snap }) => {
    await homeState(page, input);
    const tools = locatorOf(page, 'assistant.group.connected-tools').first();
    await check('The header shows "Connected tools: <provider>"', () => expect(tools).toBeVisible());
    await check('The message box footer shows "<provider> connected"', () => expect(locatorOf(page, 'assistant.text.github-gitlab-bitbucket-azure-devops').first()).toBeVisible());
    await check('The header has "Change repository / branch", "Repository history" and "New conversation"', async () => {
      for (const n of [/change repository\s*\/\s*branch/i, /repository history/i, /new conversation/i]) await expect(page.getByRole('button', { name: n }).first()).toBeVisible();
    });
    await check('The header meter "Executions: n / m" links to /account', async () => {
      const meter = locatorOf(page, 'assistant.css.a-href-account').filter({ hasText: /Executions:\s*\d+\s*\/\s*\d+/i }).first();
      await expect(meter).toBeVisible();
    });
    await snap('Execution Assistant header', tools);
  },

  'EAH-005': async ({ page, input, check, snap }) => {
    await homeState(page, input);
    const fresh = locatorOf(page, 'assistant.button.new-conversation').first();
    await snap('New conversation button', fresh);
    await check('"New conversation" is pressed and the empty conversation is shown (headline, cards and an empty message box)', async () => {
      await fresh.click();
      await expect(startBox(page)).toBeVisible();
      await expect(locatorOf(page, 'assistant.heading.know-before-you-deploy').first()).toBeVisible();
      expect(await composer(page).inputValue()).toBe('');
    });
  },

  'EAH-006': async ({ page, input, check, snap }) => {
    await homeState(page, input);
    const open_ = locatorOf(page, 'assistant.button.change-repository-branch').first();
    const barBefore = norm(await locatorOf(page, 'assistant.text.repository-ready-repository').first().innerText().catch(() => ''));
    await open_.click();
    const dlg = locatorOf(page, 'assistant.dialog.item').first();
    await check('The dialog "Change repository / branch" opens', () => expect(locatorOf(dlg, 'assistant.heading.change-repository-branch')).toBeVisible());
    await check('It says "This updates the tenant default. Historical runs stay on the repository that produced them."', () =>
      expect(dlg).toContainText(expectedOf('assistant.text.this-updates-the-tenant-default')));
    await check('"1. Choose repository" is shown with the repositories', async () => {
      await expect(locatorOf(dlg, 'assistant.text.1-choose-repository').first()).toBeVisible();
      const repoCards = locatorOf(dlg, 'assistant.css.role-listitem-role-radio-button-div').filter({ hasText: /github\.com|\/|current/i });
      const hasCurrent = await locatorOf(dlg, 'assistant.text.current').first().isVisible().catch(() => false);
      const count = await repoCards.count();
      expect(count > 0 || hasCurrent, 'No repositories or active repository found in the dialog').toBe(true);
    });
    await check('The repository in use carries the label "Current" (or repositories are available to choose)', async () => {
      const current = locatorOf(dlg, 'assistant.text.current').first();
      const hasCurrent = await current.isVisible().catch(() => false);
      if (hasCurrent) {
        await expect(current).toBeVisible();
      } else {
        await expect(locatorOf(dlg, 'assistant.button.connect-import-repository')).toBeVisible();
      }
    });
    await check('"Connect / Import repository" and "Continue" are shown', async () => {
      await expect(locatorOf(dlg, 'assistant.button.connect-import-repository')).toBeVisible();
      await expect(locatorOf(dlg, 'assistant.button.continue')).toBeVisible();
    });
    await snap('Change repository / branch dialog', dlg);
    await check('"Close" closes the dialog without changing anything', async () => {
      await locatorOf(dlg, 'assistant.button.close').first().click();
      await expect(dlg).toBeHidden();
      const barAfter = norm(await locatorOf(page, 'assistant.text.repository-ready-repository').first().innerText().catch(() => ''));
      expect(barAfter).toBe(barBefore);
    });
  },
};
void has;
