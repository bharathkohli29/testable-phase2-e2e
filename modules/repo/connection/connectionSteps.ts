import { expect } from '@playwright/test';
import { setBlocker } from '../../../core/runner/blockers';
import { BlockingFailure } from '../../../core/runner/checks';
import { CaseHandler } from '../../../core/runner/registerCases';
import { inputs } from '../../flow/helpers';
import { HOME_PATH, RepoPage, ci, esc } from '../shared/RepoPage';

/**
 * Steps 1-3 of the journey: sign in -> Execution Assistant home -> Change repository / branch -> Connect / Import repository ->
 * repository list -> View all -> search -> choose the repository. Every step carries on from the previous one on the same page.
 */
export const connectionSteps: Record<string, CaseHandler<RepoPage>> = {
  'REPO-CON-001': async (ctx) => {
    const { snap, pg, page, data, input, check, skip } = ctx;
    if (!input.email || !input.password) {
      const reason = 'QA_EMAIL / QA_PASSWORD are blank on the Input sheet.';
      setBlocker('login', ctx.row.id, reason);
      skip(reason);
    }
    // The journey has already pressed Authenticate (LOGIN-NRM-007); only sign in again when run on its own.
    const alreadyIn = !/\/auth\//i.test(page.url()) && (await pg.app.signOutButton.isVisible().catch(() => false));
    if (alreadyIn) await pg.openHome().catch(async () => pg.signInAndOpenHome(input.email, input.password));
    else await pg.signInAndOpenHome(input.email, input.password); // BlockingFailure('login') when it cannot sign in
    await check(`Home is on ${data.path ?? HOME_PATH}`, () => expect(page).toHaveURL(new RegExp(data.path ?? HOME_PATH)));
    await check('"Change repository / branch" is visible and enabled', async () => {
      await expect(pg.changeRepo).toBeVisible();
      await expect(pg.changeRepo).toBeEnabled();
    });
    await check('"GitHub connected" status is shown', () => expect(pg.scmConnected).toBeVisible());
    await check('The chat box is shown', () => expect(pg.chatBox).toBeVisible());
    await snap('Execution Assistant home page', pg.changeRepo);
  },

  'REPO-CON-002': async (ctx) => {
    const { snap, pg, check } = ctx;
    await ctx.step('"Change repository / branch" can be clicked', () => pg.changeRepo.click());
    await check('A dialog opens', () => expect(pg.dialog).toBeVisible());
    await check('Dialog title is "Change repository / branch"', () => expect(pg.dialog.getByText(/Change repository\s*\/\s*branch/i).first()).toBeVisible());
    await check('Step "1. Choose repository" is shown', () => expect(pg.dialog.getByText(/1\.\s*Choose repository/i).first()).toBeVisible());
    await check('Connected repositories are listed with their GitHub URL', () =>
      expect(pg.dialog.getByText(/https:\/\/github\.com\//i).first()).toBeVisible());
    await check('"Connect / Import repository" is visible and enabled', async () => {
      await expect(pg.connectImport).toBeVisible();
      await expect(pg.connectImport).toBeEnabled();
    });
    await check('"Continue" is shown', () => expect(pg.dialogContinue).toBeVisible());
    await snap('"Change repository / branch" dialog is open', pg.dialog);
  },

  'REPO-CON-003': async (ctx) => {
    const { snap, pg, check, note } = ctx;
    await pg.openRepoDialog();
    await pg.connectImport.click();
    // the progress card can disappear before it is looked at when the sync is quick: "already synced" counts as having seen it
    await check('The sync progress card ("Syncing GitHub repositories") is shown', () =>
      expect(pg.syncProgress.or(pg.syncedMessage)).toBeVisible({ timeout: 20_000 }));
    await check('Sync finishes with "Synced N repositories from <org>"', () => expect(pg.syncedMessage).toBeVisible({ timeout: 120_000 }));
    await snap('Sync finished ("Synced N repositories")', pg.syncedMessage);
    await check('No "Repository sync failed" message', () => expect(pg.syncFailed).toBeHidden());
    await check('A new conversation URL /execution-assistant/<id> is used', () => expect(pg.page).toHaveURL(/\/execution-assistant\/[0-9a-z-]{8,}/i));
    if (!(await pg.syncedMessage.isVisible().catch(() => false))) {
      throw new BlockingFailure('repo-list', 'The repository list did not load (the sync did not finish) - QA sync problem or SCM not connected.');
    }
    note(`Message: ${(await pg.syncedMessage.innerText()).replace(/\s+/g, ' ').trim()}`);
  },

  'REPO-CON-004': async (ctx) => {
    const { snap, pg, data, check, note } = ctx;
    await check('GitHub card shows Provider = GitHub', () => expect(pg.scmValue('Provider')).toHaveText(ci(data.provider ?? 'GitHub')));
    await check('GitHub card shows an Organization', () => expect(pg.scmValue('Organization')).not.toHaveText(''));
    await check('GitHub card shows the Repositories count', () => expect(pg.scmValue('Repositories')).toHaveText(/^\d+$/));
    await check('GitHub card shows Status = Active', () => expect(pg.scmValue('Status')).toHaveText(ci('Active'))); // upper / lower case does not matter
    const showing = pg.page.getByText(/Showing \d+ of \d+ repositories/).last();
    await check('The first rows are shown ("Showing 5 of N repositories")', () => expect(showing).toBeVisible());
    await snap('GitHub card with the repository table', pg.scmCard);
    for (const col of ['Repository', 'Visibility', 'Language', 'Recent commit', 'Updated']) {
      await check(`Table column "${col}" is shown`, () => expect(pg.page.getByText(ci(col)).and(pg.page.locator(':visible')).first()).toBeVisible());
    }
    note(`Header: ${(await showing.innerText().catch(() => '')).trim()}`);
  },

  'REPO-CON-005': async (ctx) => {
    const { snap, pg, check } = ctx;
    await check('"View all N repositories" button is shown', () => expect(pg.viewAll).toBeVisible());
    await ctx.step('"View all" opens the dialog', () => pg.openViewAll());
    await check('"Choose a repository" dialog opens', () => expect(pg.repoDialog.getByText(/Choose a repository/i).first()).toBeVisible());
    await check('It says "Select one repository from N available."', () => expect(pg.repoDialog.getByText(/Select one repository from\s+\d+\s+available/i).first()).toBeVisible());
    await check('It has a "Search repositories…" box', () => expect(pg.repoSearch).toBeVisible());
    await check('It lists repositories (list "All repositories")', () => expect(pg.repoList.getByRole('listitem').first()).toBeVisible());
    await check('Each row shows visibility and status (e.g. "Public · — · Discovered")', () =>
      expect(pg.repoList.getByText(/(Public|Private|Internal)\s*·\s*.+\s*·\s*(Imported|Discovered)/i).first()).toBeVisible());
    await check('"Done" button is shown', () => expect(pg.repoDialog.getByRole('button', { name: ci('Done') })).toBeVisible());
    await snap('"Choose a repository" dialog is open', pg.repoDialog);
  },

  'REPO-CON-006': async (ctx) => {
    const { snap, pg, check, note } = ctx;
    const { repo } = inputs(ctx, { repo: true });
    const name = repo.split('/').pop() ?? repo;
    await pg.openViewAll();
    await pg.repoSearch.fill(name);
    await check(`Searching "${name}" lists the repository`, () => expect(pg.repoRow(repo).first()).toBeVisible({ timeout: 15_000 }));
    await snap('Repository search result in the dialog', pg.repoDialog);
    await check('Only matching repositories remain in the list', async () => {
      for (const t of await pg.repoList.getByRole('listitem').allInnerTexts()) expect(t.toLowerCase()).toContain(name.toLowerCase());
    });
    note(`Row: ${((await pg.repoRow(repo).first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim()}`);
  },

  'REPO-CON-007': async (ctx) => {
    const { snap, pg, data, check } = ctx;
    const fake = data.fake_repo || 'zz-no-such-repo-xyz';
    await pg.openViewAll();
    await pg.repoSearch.fill(fake);
    await check(`Searching "${fake}" shows "No repositories match …"`, () => expect(pg.repoDialog.getByText(/No repositories match/i).first()).toBeVisible());
    await check('No repository row is listed', () => expect(pg.repoRow(fake)).toHaveCount(0));
    await snap('"No repositories match" message', pg.repoDialog.getByText(/No repositories match/i).first());
  },

  'REPO-CON-008': async (ctx) => {
    const { snap, pg, check, note } = ctx;
    const { repo } = inputs(ctx, { repo: true });
    const name = repo.split('/').pop() ?? repo;
    await ctx.step(`Choosing "${repo}" opens its configuration (Confirm repository appears)`, () => pg.chooseRepo(repo));
    note(`Repository named on the card: ${(await pg.page.getByText(new RegExp(`/${esc(name)}\\s*$`, 'i')).last().innerText().catch(() => '')).trim() || 'not found'}`);
    await check('The "Choose a repository" dialog is closed', () => expect(pg.repoDialog).toBeHidden());
    await check('"Confirm repository" is shown on the configuration card', () => expect(pg.confirmRepo).toBeVisible());
    await snap('Configuration card with "Confirm repository"', pg.confirmRepo);
  },
};
