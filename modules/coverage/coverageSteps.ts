import { expect, Locator, Page } from '@playwright/test';
import { CaseHandler } from '../../core/runner/registerCases';
import { inputs } from '../flow/helpers';
import { RepoPage, ci, esc, flex, has } from '../repo/shared/RepoPage';

/**
 * Step 6 of the journey: the "Coverage preview" and "Review branches" cards that appear right after "Confirm repository".
 * Verified live (C-_Stack / Scholarship-CMGroups-negative). Values depend on the repository and branch, so the checks look
 * for real values rather than fixed ones.
 */
const AREAS = [
  'Code Duplication', 'Code Quality Auditing', 'Cognitive Complexity', 'Cyclomatic Complexity', 'Dependency Risk (SCA)',
  'Lint / Rule Violations', 'Readability / Maintainability', 'Security White-box Testing', 'Static Code Analysis',
  'Static Vulnerabilities (SAST)', 'Structural Analysis',
];

/** The element right after a label (its value). */
const valueOf = (page: Page, label: string): Locator => page.getByText(ci(label)).last().locator('xpath=following-sibling::*[1]');
const txt = async (l: Locator): Promise<string> => ((await l.innerText().catch(() => '')) || '').trim();

export const coverageSteps: Record<string, CaseHandler<RepoPage>> = {
'COV-001': async (ctx) => {
    const { snap, page, check, note } = ctx;
    const title = page.getByText(ci('Coverage preview')).last();
    const badge = title.locator('xpath=following-sibling::*[1]');
    await check('The "Coverage preview" card is shown', () => expect(title).toBeVisible({ timeout: 30_000 }));
    await check('The detected stack is announced (e.g. "C# 8.0 · dotnet · MSBUILD")', () =>
      expect(page.getByText(/·\s*\S+\s*·\s*\S+/).filter({ hasNotText: /Repository ready/ }).last()).toBeVisible());
    await check('The card has a status badge', () => expect(badge).toBeVisible());
    note(`Status badge: "${await txt(badge)}"`);
    await check('The status is not "Analysis failed"', () => expect(badge).not.toHaveText(/failed/i));
    await check('"Ready for analysis" is shown', () => expect(page.getByText(ci('Ready for analysis')).last()).toBeVisible());
    await snap('Coverage preview card', title);
    await check('It says the repository "has been analyzed and is ready to continue"', () =>
      expect(page.getByText(/Your repository has been analy[sz]ed and is ready to continue/i).last()).toBeVisible());
    if (/limited/i.test(await txt(badge))) {
      await check('It warns "Some areas may have limited coverage"', () =>
        expect(page.getByText(/Some areas may have limited coverage/i).last()).toBeVisible());
    }
  },

'COV-002': async (ctx) => {
    const { snap, page, check, note } = ctx;
    const { branch } = inputs(ctx, { branches: 1 });
    await check(`Branch is "${branch}"`, () => expect(valueOf(page, 'Branch')).toHaveText(new RegExp(`^\\s*${esc(branch)}\\s*$`, 'i')));
    await check('Commit is a short commit id', () => expect(valueOf(page, 'Commit')).toHaveText(/^[0-9a-f]{6,40}$/i));
    await check('Checked says when it was analysed', () => expect(valueOf(page, 'Checked')).toHaveText(/ago|just now|today|yesterday|second|minute|hour|day|week|month/i));
    await snap('Branch, commit and checked time on the Coverage preview', valueOf(page, 'Branch'));
    const commit = await txt(valueOf(page, 'Commit'));
    note(`Checked: ${await txt(valueOf(page, 'Checked'))}`);
    await check('The top bar "Repository ready · <repo> · <branch> · <commit>" matches the card', () =>
      expect(page.getByText(/Repository ready/i).first().locator('xpath=..')).toContainText(new RegExp(`${esc(branch)}.*${esc(commit.slice(0, 7))}`, 'i')));
  },

'COV-003': async (ctx) => {
    const { snap, page, check, note } = ctx;
    const toggle = page.getByRole('button', { name: /Repository details/i }).last();
    await check('"Repository details" is offered', () => expect(toggle).toBeVisible());
    await check('Its subtitle is "Build, languages, project structure and size"', () =>
      expect(page.getByText(/Build,\s*languages,\s*project structure\s*and size/i).last()).toBeVisible());
    if (!(await page.getByText(ci('Build type')).last().isVisible().catch(() => false))) await toggle.click();
    const rows: Array<[string, RegExp]> = [
      ['Build type', /\S/], ['Language', /\S/], ['Language version', /\S/], ['Project type', /\S/],
      ['Repository size', /\d/], ['Files', /\d/],
    ];
    for (const [label, pattern] of rows) {
      await check(`"${label}" is listed with a value`, async () => {
        await expect(page.getByText(ci(label)).last()).toBeVisible();
        await expect(valueOf(page, label)).toHaveText(pattern);
        await expect(valueOf(page, label)).not.toHaveText(/^\s*(-|—|n\/a|not detected)?\s*$/i);
      });
      note(`${label}: ${await txt(valueOf(page, label))}`);
    }
    await snap('Repository details expanded', page.getByText(ci('Build type')).last());
    await check('"Repository structure" is listed', () => expect(page.getByText(ci('Repository structure')).last()).toBeVisible());
    await check('The structure shows folders with file counts', () => expect(page.getByText(/^\d+ files?$/).nth(1)).toBeVisible());
  },

'COV-004': async (ctx) => {
    const { snap, page, check, note } = ctx;
    const toggle = page.getByRole('button', { name: /What we.ll analy[sz]e/i }).last();
    await check('"What we\'ll analyze" is offered', () => expect(toggle).toBeVisible());
    if (!(await page.getByText(/Testable will evaluate your repository across/i).last().isVisible().catch(() => false))) await toggle.click();
    // the subtitle can sit inside the "What we'll analyze" button, so look for the line "A, B, C and more" in the page text
    const shown = ((await page.locator('body').innerText().catch(() => '')).split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => /,/.test(l) && /\band more\s*$/i.test(l)).pop() ?? '');
    note(`Subtitle on the page: "${shown || 'not found'}"`);
    await check('The subtitle names some analysis techniques followed by "and more" (the names may differ)', () => expect(shown, 'no subtitle like "A, B, C and more" was found').not.toBe(''));
    await check('Every technique named in the subtitle is also in the list below', async () => {
      const named = shown.replace(/\s+and more$/i, '').split(/,\s*/).map((x) => x.trim()).filter(Boolean);
      for (const n of named) await expect(page.getByText(flex(n)).last(), `"${n}"`).toBeVisible();
    });
    await check('"Testable will evaluate your repository across:" is shown', () =>
      expect(page.getByText(/Testable will evaluate your repository across/i).last()).toBeVisible());
    await snap('"What we\'ll analyze" list is open', page.getByText(/Testable will evaluate your repository across/i).last());
    for (const area of AREAS) {
      await check(`Analysis area "${area}"`, () => expect(page.getByText(flex(area)).last()).toBeVisible());
    }
  },

'COV-005': async (ctx) => {
    const { snap, page, check, note } = ctx;
    const badge = page.getByText(ci('Coverage preview')).last().locator('xpath=following-sibling::*[1]');
    const limited = /limited/i.test(await txt(badge));
    note(`Status badge: "${await txt(badge)}"`);
    if (!limited) note('Coverage is not limited for this branch, so the "uncovered areas" notice is not expected.');
    else {
      await check('"Some analysis areas aren\'t available yet" is shown', () =>
        expect(page.getByText(/Some analysis areas aren.t available yet/i).last()).toBeVisible());
      await check('"View uncovered areas" is offered', () => expect(page.getByRole('button', { name: /View uncovered areas/i }).last()).toBeVisible());
      await snap('Limited-coverage notice with "View uncovered areas"', page.getByText(/Some analysis areas aren.t available yet/i).last());
    }
  },

'COV-006': async (ctx) => {
    const { snap, page, check, note } = ctx;
    const open = page.getByRole('button', { name: /View uncovered areas/i }).last();
    if (!(await open.isVisible().catch(() => false))) {
      ctx.skip('This branch has full coverage, so there is no "View uncovered areas" to open.');
    }
    await ctx.step('"View uncovered areas" opens the panel', async () => {
      await open.click();
      await expect(page.getByText(ci('Uncovered areas')).last()).toBeVisible();
    });
    const panel = page.getByRole('dialog').filter({ hasText: /Uncovered areas/i }).last();
    await check('It explains "Analysis areas that aren\'t currently available for this repository."', () =>
      expect(panel).toContainText(/Analysis areas that aren.t currently available for this repository/i));
    await check('It shows a "Limited coverage" notice', () => expect(panel).toContainText(/Limited coverage/i));
    await check('Groups are listed with "N scoped areas"', () => expect(panel.getByText(/^\s*\d+\s+scoped areas?\s*$/i).first()).toBeVisible());
    await check('Each group has a name (e.g. Code Quality, Control Flow Testing, Static Code Analysis, Other)', async () => {
      const text = (await panel.innerText()).split('\n').map((l) => l.trim());
      const groups = text.filter((l, i) => /^\d+\s+scoped areas?$/i.test(text[i + 1] ?? '') && l.length > 0);
      expect(groups.length).toBeGreaterThan(0);
      note(`Groups: ${groups.join(', ')}`);
    });
    note(`Groups: ${((await panel.innerText().catch(() => '')) || '').split('\n').filter((l) => /scoped area/.test(l)).length} with a scoped-areas count`);
    await check('The platform-gap note is shown', () => expect(panel).toContainText(/platform gap,?\s*not a defect in this repository/i));
    await snap('"Uncovered areas" panel is open', panel);
    await check('"Close" closes the panel', async () => {
      await panel.getByRole('button', { name: /^\s*Close\s*$/i }).first().click();
      await expect(panel).toBeHidden();
    });
  },

'COV-007': async (ctx) => {
    const { snap, page, check } = ctx;
    const { branch } = inputs(ctx, { branches: 1 });
    const card = page.getByRole('button', { name: /^\s*Continue\s*$/i }).last().locator('xpath=ancestor::*[contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "review branches")][1]');
    // The "Review branches" card is at the very bottom of the chat and the page does not scroll there by itself: scroll down until it shows.
    for (let i = 0; i < 15 && !(await card.isVisible().catch(() => false)); i++) {
      await page.mouse.move(700, 500);
      await page.mouse.wheel(0, 2500);
      await page.waitForTimeout(700);
    }
    await card.scrollIntoViewIfNeeded().catch(() => undefined);
    await check('"Review branches · 1 branch" is shown', () => expect(card).toContainText(/1\s+branch/i));
    await check('"Ready — continue to build the run plan, or change the branch first." is shown', () =>
      expect(card).toContainText(/continue to build the run plan,?\s*or change the branch first/i));
    const row = card.getByRole('listitem').first();
    await check(`The branch row shows the correct branch name "${branch}"`, () => expect(row).toContainText(has(branch)));
    await check('The branch row has a tick mark and a branch icon', async () => {
      await expect(row.locator('svg').first()).toBeVisible();
      expect(await row.locator('svg').count()).toBeGreaterThanOrEqual(2);
    });
    await check('It shows the same status as the Coverage preview', async () => {
      const status = await txt(page.getByText(ci('Coverage preview')).last().locator('xpath=following-sibling::*[1]'));
      await expect(card).toContainText(has(status.replace(/\s+/g, ' ')));
    });
    await check('"Change branch" is offered', () => expect(card.getByRole('button', { name: ci('Change branch') })).toBeVisible());
    await check('"Continue" is enabled', () => expect(card.getByRole('button', { name: /^\s*Continue\s*$/i })).toBeEnabled());
    await snap('Review branches card', card);
  },
};
