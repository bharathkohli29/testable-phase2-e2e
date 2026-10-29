import { expect, Locator, Page } from '@playwright/test';
import { CaseHandler } from '../../core/runner/registerCases';
import { inputs } from '../flow/helpers';
import { RepoPage, ci, esc, flex, has } from '../repo/shared/RepoPage';
import { obj as locatorOf } from '../../core/keywords/obj';

import { expected as expectedOf, listOf } from '../../core/keywords/expected';
/**
 * Step 6 of the journey: the "Coverage preview" and "Review branches" cards that appear right after "Confirm repository".
 * Verified live (C-_Stack / Scholarship-CMGroups-negative). Values depend on the repository and branch, so the checks look
 * for real values rather than fixed ones.
 */
const AREAS = listOf('coverage.list.areas');

/** The element right after a label (its value). */
const valueOf = (page: Page, label: string): Locator => locatorOf(locatorOf(page, 'coverage.text.by-label', label).last(), 'coverage.css.xpath-following-sibling-1');
const txt = async (l: Locator): Promise<string> => ((await l.innerText().catch(() => '')) || '').trim();

export const coverageSteps: Record<string, CaseHandler<RepoPage>> = {
'COV-001': async (ctx) => {
    const { snap, page, check, note } = ctx;
    const title = locatorOf(page, 'coverage.text.coverage-preview').last();
    const badge = locatorOf(title, 'coverage.css.xpath-following-sibling-1');
    await check('The "Coverage preview" card is shown', () => expect(title).toBeVisible({ timeout: 30_000 }));
    await check('The detected stack is announced (e.g. "C# 8.0 · dotnet · MSBUILD")', () =>
      expect(locatorOf(page, 'coverage.text.item').filter({ hasNotText: /Repository ready/ }).last()).toBeVisible());
    await check('The card has a status badge', () => expect(badge).toBeVisible());
    note(`Status badge: "${await txt(badge)}"`);
    await check('The status is not "Analysis failed"', () => expect(badge).not.toHaveText(expectedOf('coverage.text.failed')));
    await check('"Ready for analysis" is shown', () => expect(locatorOf(page, 'coverage.text.ready-for-analysis').last()).toBeVisible());
    await snap('Coverage preview card', title);
    await check('It says the repository "has been analyzed and is ready to continue"', () =>
      expect(locatorOf(page, 'coverage.text.your-repository-has-been-analy-sz-ed').last()).toBeVisible());
    if (/limited/i.test(await txt(badge))) {
      await check('It warns "Some areas may have limited coverage"', () =>
        expect(locatorOf(page, 'coverage.text.some-areas-may-have-limited-coverage').last()).toBeVisible());
    }
  },

'COV-002': async (ctx) => {
    const { snap, page, check, note } = ctx;
    const { branch } = inputs(ctx, { branches: 1 });
    await check(`Branch is "${branch}"`, () => expect(valueOf(page, 'Branch')).toHaveText(expectedOf('coverage.text.by-pattern-branch', branch)));
    await check('Commit is a short commit id', () => expect(valueOf(page, 'Commit')).toHaveText(expectedOf('coverage.text.by-0-9a-f-6-40')));
    await check('Checked says when it was analysed', () => expect(valueOf(page, 'Checked')).toHaveText(expectedOf('coverage.text.ago-just-now-today-yesterday')));
    await snap('Branch, commit and checked time on the Coverage preview', valueOf(page, 'Branch'));
    const commit = await txt(valueOf(page, 'Commit'));
    note(`Checked: ${await txt(valueOf(page, 'Checked'))}`);
    await check('The top bar "Repository ready · <repo> · <branch> · <commit>" matches the card', () =>
      expect(locatorOf(locatorOf(page, 'coverage.text.repository-ready').first(), 'coverage.css.xpath')).toContainText(expectedOf('coverage.text.by-pattern-branch-commit', branch, commit.slice(0, 7))));
  },

'COV-003': async (ctx) => {
    const { snap, page, check, note } = ctx;
    const toggle = locatorOf(page, 'coverage.button.repository-details').last();
    await check('"Repository details" is offered', () => expect(toggle).toBeVisible());
    await check('Its subtitle is "Build, languages, project structure and size"', () =>
      expect(locatorOf(page, 'coverage.text.build-languages-project-structure-an').last()).toBeVisible());
    if (!(await locatorOf(page, 'coverage.text.build-type').last().isVisible().catch(() => false))) await toggle.click();
    const rows: Array<[string, RegExp]> = [
      ['Build type', /\S/], ['Language', /\S/], ['Language version', /\S/], ['Project type', /\S/],
      ['Repository size', /\d/], ['Files', /\d/],
    ];
    for (const [label, pattern] of rows) {
      await check(`"${label}" is listed with a value`, async () => {
        await expect(locatorOf(page, 'coverage.text.by-label', label).last()).toBeVisible();
        await expect(valueOf(page, label)).toHaveText(pattern);
        await expect(valueOf(page, label)).not.toHaveText(expectedOf('coverage.text.n-a-not-detected'));
      });
      note(`${label}: ${await txt(valueOf(page, label))}`);
    }
    await snap('Repository details expanded', locatorOf(page, 'coverage.text.build-type').last());
    await check('"Repository structure" is listed', () => expect(locatorOf(page, 'coverage.text.repository-structure').last()).toBeVisible());
    await check('The structure shows folders with file counts', () => expect(locatorOf(page, 'coverage.text.files').nth(1)).toBeVisible());
  },

'COV-004': async (ctx) => {
    const { snap, page, check, note } = ctx;
    const toggle = locatorOf(page, 'coverage.button.what-we-ll-analy-sz-e').last();
    await check('"What we\'ll analyze" is offered', () => expect(toggle).toBeVisible());
    if (!(await locatorOf(page, 'coverage.text.testable-will-evaluate-your-reposito').last().isVisible().catch(() => false))) await toggle.click();
    // the subtitle can sit inside the "What we'll analyze" button, so look for the line "A, B, C and more" in the page text
    const shown = ((await locatorOf(page, 'coverage.css.body').innerText().catch(() => '')).split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => /,/.test(l) && /\band more\s*$/i.test(l)).pop() ?? '');
    note(`Subtitle on the page: "${shown || 'not found'}"`);
    await check('The subtitle names some analysis techniques followed by "and more" (the names may differ)', () => expect(shown, 'no subtitle like "A, B, C and more" was found').not.toBe(''));
    await check('Every technique named in the subtitle is also in the list below', async () => {
      const named = shown.replace(/\s+and more$/i, '').split(/,\s*/).map((x) => x.trim()).filter(Boolean);
      for (const n of named) await expect(locatorOf(page, 'coverage.text.by-n', n).last(), `"${n}"`).toBeVisible();
    });
    await check('"Testable will evaluate your repository across:" is shown', () =>
      expect(locatorOf(page, 'coverage.text.testable-will-evaluate-your-reposito').last()).toBeVisible());
    await snap('"What we\'ll analyze" list is open', locatorOf(page, 'coverage.text.testable-will-evaluate-your-reposito').last());
    for (const area of AREAS) {
      await check(`Analysis area "${area}"`, () => expect(locatorOf(page, 'coverage.text.by-n', area).last()).toBeVisible());
    }
  },

'COV-005': async (ctx) => {
    const { snap, page, check, note } = ctx;
    const badge = locatorOf(locatorOf(page, 'coverage.text.coverage-preview').last(), 'coverage.css.xpath-following-sibling-1');
    const limited = /limited/i.test(await txt(badge));
    note(`Status badge: "${await txt(badge)}"`);
    if (!limited) note('Coverage is not limited for this branch, so the "uncovered areas" notice is not expected.');
    else {
      await check('"Some analysis areas aren\'t available yet" is shown', () =>
        expect(locatorOf(page, 'coverage.text.some-analysis-areas-aren-t-available').last()).toBeVisible());
      await check('"View uncovered areas" is offered', () => expect(locatorOf(page, 'coverage.button.view-uncovered-areas').last()).toBeVisible());
      await snap('Limited-coverage notice with "View uncovered areas"', locatorOf(page, 'coverage.text.some-analysis-areas-aren-t-available').last());
    }
  },

'COV-006': async (ctx) => {
    const { snap, page, check, note } = ctx;
    const open = locatorOf(page, 'coverage.button.view-uncovered-areas').last();
    if (!(await open.isVisible().catch(() => false))) {
      ctx.skip('This branch has full coverage, so there is no "View uncovered areas" to open.');
    }
    await ctx.step('"View uncovered areas" opens the panel', async () => {
      await open.click();
      await expect(locatorOf(page, 'coverage.text.uncovered-areas').last()).toBeVisible();
    });
    const panel = locatorOf(page, 'coverage.dialog.item').filter({ hasText: /Uncovered areas/i }).last();
    await check('It explains "Analysis areas that aren\'t currently available for this repository."', () =>
      expect(panel).toContainText(expectedOf('coverage.text.analysis-areas-that-aren-t')));
    await check('It shows a "Limited coverage" notice', () => expect(panel).toContainText(expectedOf('coverage.text.limited-coverage')));
    await check('Groups are listed with "N scoped areas"', () => expect(locatorOf(panel, 'coverage.text.scoped-areas').first()).toBeVisible());
    await check('Each group has a name (e.g. Code Quality, Control Flow Testing, Static Code Analysis, Other)', async () => {
      const text = (await panel.innerText()).split('\n').map((l) => l.trim());
      const groups = text.filter((l, i) => /^\d+\s+scoped areas?$/i.test(text[i + 1] ?? '') && l.length > 0);
      expect(groups.length).toBeGreaterThan(0);
      note(`Groups: ${groups.join(', ')}`);
    });
    note(`Groups: ${((await panel.innerText().catch(() => '')) || '').split('\n').filter((l) => /scoped area/.test(l)).length} with a scoped-areas count`);
    await check('The platform-gap note is shown', () => expect(panel).toContainText(expectedOf('coverage.text.platform-gap-not-a-defect')));
    await snap('"Uncovered areas" panel is open', panel);
    await check('"Close" closes the panel', async () => {
      await locatorOf(panel, 'coverage.button.close').first().click();
      await expect(panel).toBeHidden();
    });
  },

'COV-007': async (ctx) => {
    const { snap, page, check } = ctx;
    const { branch } = inputs(ctx, { branches: 1 });
    const card = locatorOf(locatorOf(page, 'coverage.button.continue').last(), 'coverage.css.xpath-ancestor-contains-translate-no');
    // The "Review branches" card is at the very bottom of the chat and the page does not scroll there by itself: scroll down until it shows.
    for (let i = 0; i < 15 && !(await card.isVisible().catch(() => false)); i++) {
      await page.mouse.move(700, 500);
      await page.mouse.wheel(0, 2500);
      await page.waitForTimeout(700);
    }
    await card.scrollIntoViewIfNeeded().catch(() => undefined);
    await check('"Review branches · 1 branch" is shown', () => expect(card).toContainText(expectedOf('coverage.text.1-branch')));
    await check('"Ready — continue to build the run plan, or change the branch first." is shown', () =>
      expect(card).toContainText(expectedOf('coverage.text.continue-to-build-the-run')));
    const row = locatorOf(card, 'coverage.listitem.item').first();
    await check(`The branch row shows the correct branch name "${branch}"`, () => expect(row).toContainText(expectedOf('coverage.text.by-pattern-branch-2', branch)));
    await check('The branch row has a tick mark and a branch icon', async () => {
      await expect(locatorOf(row, 'coverage.css.svg').first()).toBeVisible();
      expect(await locatorOf(row, 'coverage.css.svg').count()).toBeGreaterThanOrEqual(2);
    });
    await check('It shows the same status as the Coverage preview', async () => {
      const status = await txt(locatorOf(locatorOf(page, 'coverage.text.coverage-preview').last(), 'coverage.css.xpath-following-sibling-1'));
      await expect(card).toContainText(expectedOf('coverage.text.by-pattern-status', status.replace(/\s+/g, ' ')));
    });
    await check('"Change branch" is offered', () => expect(locatorOf(card, 'coverage.button.change-branch')).toBeVisible());
    await check('"Continue" is enabled', () => expect(locatorOf(card, 'coverage.button.continue')).toBeEnabled());
    await snap('Review branches card', card);
  },
};
