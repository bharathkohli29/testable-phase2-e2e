import { expect } from '@playwright/test';
import { BlockingFailure } from '../../../core/runner/checks';
import { CaseHandler } from '../../../core/runner/registerCases';
import { inputs } from '../../flow/helpers';
import { RepoPage, ci, esc, has } from '../shared/RepoPage';

/**
 * Steps 4-5 of the journey: the repository's Configure card (summary, branch chips, "Choose a branch" dialog, triggers),
 * "Choose another", and finally "Confirm repository" (which opens the Coverage preview + Review branches).
 * Each step carries on from the page the previous step left behind.
 */
export const branchSteps: Record<string, CaseHandler<RepoPage>> = {
  'REPO-BRN-001': async (ctx) => {
    const { snap, pg, check, note } = ctx;
    const { repo } = inputs(ctx, { repo: true });
    await check('"Branches & triggers" summary card is shown', () => expect(pg.summaryCard).toBeVisible());
    const name = repo.split('/').pop() ?? repo;
    await check(`Summary Repository is "${repo}"`, () => expect(pg.summaryValue('Repository')).toContainText(has(name)));
    await check('Summary shows a Default branch', () => expect(pg.summaryValue('Default branch')).not.toHaveText(''));
    await check('Summary shows Branches available as a number', () => expect(pg.summaryValue('Branches available')).toHaveText(/^\d+$/));
    await check('"Confirm repository" is shown', () => expect(pg.confirmRepo).toBeVisible());
    await check('"Choose another" is shown and enabled', () => expect(pg.chooseAnother).toBeEnabled());
    await snap('Branches & triggers summary card', pg.summaryCard);
    note(`Chips: ${(await pg.chips.allInnerTexts()).map((t) => t.trim()).join(' | ')}`);
  },

  'REPO-BRN-002': async (ctx) => {
    const { snap, pg, check, note } = ctx;
    const defaultChip = pg.page.getByRole('radio', { name: /default\s*$/i }).last(); // last = the newest Configure card in the chat
    await check('Branch chips are offered (radio buttons)', () => expect(pg.chips.last()).toBeVisible());
    await check('One chip is marked "default"', () => expect(defaultChip).toBeVisible());
    await check('The default branch is the selected one at first', () => expect(defaultChip).toBeChecked());
    await snap('Branch chips with the default branch selected', defaultChip);
    await check('"+N branches" opens more', () => expect(pg.moreBranches).toBeVisible());
    await check('The chip of the default branch is the one named in the summary', async () => {
      const def = (await pg.summaryValue('Default branch').innerText()).trim();
      await expect(pg.chip(def)).toBeVisible();
    });
    note(`More button: ${(await pg.moreBranches.innerText().catch(() => '')).trim()}`);
  },

  'REPO-BRN-003': async (ctx) => {
    const { snap, pg, check } = ctx;
    const available = (await pg.summaryValue('Branches available').innerText()).trim();
    await pg.openBranchDialog();
    await check('"Choose a branch" title is shown', () => expect(pg.branchDialog.getByText(/Choose a branch/i).first()).toBeVisible());
    await check('It says "Select one branch to monitor · N available"', () => expect(pg.branchDialog.getByText(/Select one branch to monitor\s*·\s*\d+\s+available/i).first()).toBeVisible());
    await check('It has a "Search branches…" box', () => expect(pg.branchSearch).toBeVisible());
    await check(`The count in the chooser matches "Branches available" (${available})`, () =>
      expect(pg.branchDialog.getByText(new RegExp(`Select one branch to monitor\\s*·\\s*${available}\\s+available`, 'i')).first()).toBeVisible());
    await check('The default branch is ticked and tagged "default"', async () => {
      await expect(pg.branchDialog.getByText(ci('default')).first()).toBeVisible();
      // the rows may be radio buttons or checkboxes
      await expect(pg.branchDialog.getByRole('radio').or(pg.branchDialog.getByRole('checkbox')).first()).toBeChecked();
    });
    await check('Footer shows "<branch> selected"', () => expect(pg.branchDialog.getByText(/\sselected\s*$/i).first()).toBeVisible());
    await check('"Done" is shown', () => expect(pg.branchDone).toBeVisible());
    await snap('"Choose a branch" dialog is open', pg.branchDialog);
  },

  'REPO-BRN-004': async (ctx) => {
    const { snap, pg, check } = ctx;
    const { branch } = inputs(ctx, { branches: 1 });
    await pg.openBranchDialog(); // (re)open: BRN-003 left it open or closed
    await pg.branchSearch.fill(branch);
    await check(`Searching "${branch}" lists the branch`, () => expect(pg.branchDialog.getByText(has(branch)).first()).toBeVisible({ timeout: 15_000 }));
    await snap('Branch search result in the dialog', pg.branchDialog);
  },

  'REPO-BRN-005': async (ctx) => {
    const { snap, pg, data, check } = ctx;
    const fake = data.fake_branch || 'zz-no-such-branch-xyz';
    await pg.openBranchDialog();
    await pg.branchSearch.fill(fake);
    await check(`Searching "${fake}" shows "No branches match …"`, () => expect(pg.branchDialog.getByText(/No branches match/i).first()).toBeVisible());
    await snap('"No branches match" message', pg.branchDialog.getByText(/No branches match/i).first());
    await pg.branchSearch.fill(''); // leave the list clean for the next step
  },

  'REPO-BRN-006': async (ctx) => {
    const { snap, pg, check } = ctx;
    const { branch } = inputs(ctx, { branches: 1 });
    await ctx.step(`"${branch}" is searched, ticked and Done is pressed`, () => pg.selectBranchViaDialog(branch));
    await check('Dialog closes after Done', () => expect(pg.branchDialog).toBeHidden());
    await check(`"${branch}" is the selected branch`, () => pg.expectBranchSelected(branch));
    await snap('Selected branch on the Configure card', pg.chip(branch).or(pg.summaryCard).first());
  },

  'REPO-BRN-007': async (ctx) => {
    const { snap, pg, check } = ctx;
    const { branch } = inputs(ctx, { branches: 1 });
    await ctx.step(`Branch "${branch}" is selected`, () => pg.selectBranch(branch));
    await check('Triggers "On push" and "On PR merge" are shown', async () => {
      await expect(pg.onPush).toBeVisible();
      await expect(pg.onPrMerge).toBeVisible();
    });
    await check('"On push" is ticked by default', () => expect(pg.onPush).toHaveAttribute('aria-pressed', 'true'));
    await check('"On PR merge" can be ticked', () => pg.ensurePrMergeTicked());
    await check('Both triggers can be selected together ("On push" and "On PR merge" are both ticked)', async () => {
      await expect(pg.onPush).toHaveAttribute('aria-pressed', 'true');
      await expect(pg.onPrMerge).toHaveAttribute('aria-pressed', 'true');
    });
    await snap('Both triggers ticked', [pg.onPush, pg.onPrMerge]);
    // "On PR merge" instead of "On push": untick On push, look, then put it back so the rest of the journey is unchanged
    await pg.onPush.click().catch(() => undefined);
    await check('"On PR merge" can be selected instead of "On push" (unticking "On push" leaves "On PR merge" ticked)', async () => {
      await expect(pg.onPush).toHaveAttribute('aria-pressed', 'false');
      await expect(pg.onPrMerge).toHaveAttribute('aria-pressed', 'true');
    });
    if ((await pg.onPush.getAttribute('aria-pressed').catch(() => 'true')) !== 'true') await pg.onPush.click().catch(() => undefined);
    await check('"On push" is ticked again at the end (nothing was changed for the next steps)', async () => {
      await expect(pg.onPush).toHaveAttribute('aria-pressed', 'true');
      await expect(pg.onPrMerge).toHaveAttribute('aria-pressed', 'true');
    });
  },

  'REPO-BRN-008': async (ctx) => {
    const { snap, pg, check } = ctx;
    const { branch, branch2 } = inputs(ctx, { branches: 2 });
    await ctx.step(`Select "${branch}"`, () => pg.selectBranch(branch));
    await check(`Change the selection to "${branch2}"`, () => pg.selectBranch(branch2));
    await check(`"${branch2}" is the selected branch and "${branch}" is not`, async () => {
      await pg.expectBranchSelected(branch2);
      // the first branch may not be one of the chips shown; when it is, it must not be ticked any more
      if (await pg.chip(branch).isVisible().catch(() => false)) await expect(pg.chip(branch)).not.toBeChecked();
    });
    await snap('Newly selected branch', pg.chip(branch2).or(pg.chips.last()).first());
    await pg.selectBranch(branch).catch(() => undefined); // go back to the branch the rest of the journey uses
  },

  'REPO-BRN-011': async (ctx) => {
    const { snap, pg, page, check } = ctx;
    const { repo, branch } = inputs(ctx, { repo: true, branches: 1 });
    await pg.chooseAnother.click();
    await check('The "GitHub connected" card is shown again', () => expect(page.getByText(/GitHub connected/i).last()).toBeVisible({ timeout: 15_000 }));
    await check('The table says "Showing 5 of N repositories"', () => expect(page.getByText(/Showing \d+ of \d+ repositories/).last()).toBeVisible());
    await check('The "Search all repositories…" box is shown', () => expect(pg.inlineSearch).toBeVisible());
    await check('The table of repositories is shown (repositories with their Public / Private visibility)', async () =>
      expect(await page.getByText(/^\s*(Public|Private|Internal)\s*$/i).count()).toBeGreaterThanOrEqual(1));
    const listed = await page.getByText(new RegExp(`^\\s*${esc(repo.split('/').pop() as string)}\\s*$`, 'i')).last().isVisible().catch(() => false);
    ctx.note(listed ? `"${repo}" is one of the 5 listed rows.` : `"${repo}" is not among the 5 listed rows (the list shows only the first 5 of all repositories; the search box and "View all" reach the rest).`);
    await check('"View all N repositories" is shown', () => expect(pg.viewAll).toBeVisible());
    await snap('Repository table ("Showing 5 of N repositories")', page.getByText(/Showing \d+ of \d+ repositories/).last());
    // go back to the Configure card so the journey can continue
    await ctx.step(`Choose "${repo}" again`, () => pg.chooseRepo(repo));
    await ctx.step(`Select "${branch}" again`, () => pg.selectBranch(branch));
  },

  'REPO-BRN-009': async (ctx) => {
    const { snap, pg, page, check, note } = ctx;
    const { branch } = inputs(ctx, { branches: 1 });
    await check(`Branch "${branch}" is selected`, () => pg.selectBranch(branch));
    await check('"On PR merge" is ticked', () => pg.ensurePrMergeTicked());
    // a late re-draw of the card could undo the tick: tick again (polling, no fixed wait) just before Confirm
    await pg.ensurePrMergeTicked().catch(() => undefined);
    note(`Just before Confirm: "On push" ${await pg.onPush.getAttribute('aria-pressed') === 'true' ? 'ticked' : 'NOT ticked'}, "On PR merge" ${await pg.onPrMerge.getAttribute('aria-pressed') === 'true' ? 'ticked' : 'NOT ticked'}.`);
    await check('"Confirm repository" is enabled', () => expect(pg.confirmRepo).toBeEnabled());
    await ctx.step('The "Review branches" card appears after Confirm', () => pg.confirmAndWaitForReview()); // refused / timeout => blocks the rest
    await snap('Review branches card after Confirm repository', pg.reviewBranches);
  },

  'REPO-BRN-010': async (ctx) => {
    const { snap, pg, data, check, note } = ctx;
    const minutes = Number(data.wait_min || 5);
    try {
      await pg.waitForContinueEnabled(minutes);
    } catch (e) {
      throw new BlockingFailure('plan', `The review did not finish, so "Continue" cannot be used: ${(e as Error).message}`);
    }
    await check('"Continue" is enabled', () => expect(pg.continueBtn).toBeEnabled());
    await ctx.step('"Continue" is clicked and the Run plan opens', () => pg.continueAndWaitForPlan());
    await snap('Run plan opened after Continue', pg.page.getByText(/^\s*Run plan\s*$/i).last());
    note('The Run plan itself is checked by the "Plan" sheet. "Execute run" is never clicked.');
  },
};
