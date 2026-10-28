import { expect, Locator, Page } from '@playwright/test';
import { AppShell } from '../../../core/pages/AppShell';
import { BlockingFailure } from '../../../core/runner/checks';
import { waitMs } from '../../../core/settings';

export const HOME_PATH = '/execution-assistant';
export const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Whole-text match that ignores upper / lower case (the site styles some labels with CSS, and case is not what we test). */
export const ci = (text: string): RegExp => new RegExp(`^\\s*${esc(text)}\\s*$`, 'i');
/** Whole-text match that also ignores spacing / hyphen differences between words ("White-box" = "White box"). */
export const flex = (text: string): RegExp => new RegExp(`^\\s*${text.trim().split(/[\s-]+/).map(esc).join('[\\s-]*')}\\s*$`, 'i');
/** Contains-match for a name (branch / repository): ignores upper / lower case. */
export const has = (text: string): RegExp => new RegExp(esc(text.trim()), 'i');

/**
 * Repository + branch connection on the Execution Assistant. Locators were checked live on QA (7 Oct):
 *
 *  Home            button "Change repository / branch"; "GitHub connected" label; chat box "Ask anything, or type / for commands…"
 *  Dialog          "Change repository / branch" -> "1. Choose repository" (connected repos with their GitHub URL),
 *                  button "Connect / Import repository", button "Continue"
 *  After import    new chat /execution-assistant/<id>: progress card ("Syncing GitHub repositories"), then
 *                  "Synced N repositories from <org>. Here are 5 to start — pick one, or open View all."
 *                  + GitHub card (PROVIDER / ORGANIZATION / REPOSITORIES / STATUS) + table of 5 + "View all N repositories"
 *  View all        dialog "Choose a repository" ("Select one repository from N available."), box "Search repositories…",
 *                  list "All repositories", empty state `No repositories match "<text>".`, button Done
 *  Configure card  branch chips (role radio, "main default"), button "+N branches", triggers "On push" / "On PR merge",
 *                  summary "Branches & triggers" (Repository / Default branch / Branches available),
 *                  buttons "Confirm repository" and "Choose another"
 *  Branch dialog   "Choose a branch" ("Select one branch to monitor · N available"), box "Search branches…", checkbox rows,
 *                  footer "<branch> selected", empty state `No branches match "<text>".`, button Done
 *  Review          "Review branches" card -> "Continue"   (taken from Phase 1, not re-checked live)
 *
 * Precondition for every case: the account is paid and its SCM (GitHub) is already connected - the first-time steps
 * (sign-up, payment, connect SCM) are separate modules.
 */
export class RepoPage {
  readonly page: Page;
  readonly baseUrl: string;
  readonly app: AppShell;

  // home
  readonly changeRepo: Locator;
  readonly scmConnected: Locator;
  readonly chatBox: Locator;
  // change repository dialog
  readonly dialog: Locator;
  readonly connectImport: Locator;
  readonly dialogContinue: Locator;
  // after Connect / Import
  readonly syncProgress: Locator;
  readonly syncedMessage: Locator;
  readonly syncFailed: Locator;
  readonly scmCard: Locator;
  readonly inlineSearch: Locator;
  readonly viewAll: Locator;
  // "Choose a repository" dialog
  readonly repoDialog: Locator;
  readonly repoSearch: Locator;
  readonly repoList: Locator;
  // Configure card
  readonly confirmRepo: Locator;
  readonly chooseAnother: Locator;
  readonly chips: Locator;
  readonly moreBranches: Locator;
  readonly onPush: Locator;
  readonly onPrMerge: Locator;
  readonly summaryCard: Locator;
  // "Choose a branch" dialog
  readonly branchDialog: Locator;
  readonly branchSearch: Locator;
  readonly branchDone: Locator;
  // review
  readonly reviewBranches: Locator;
  readonly cannotChange: Locator;
  readonly continueBtn: Locator;
  readonly blocked: Locator;

  constructor(page: Page, baseUrl: string) {
    this.page = page;
    this.baseUrl = baseUrl;
    this.app = new AppShell(page, baseUrl);

    this.changeRepo = page.getByRole('button', { name: ci('Change repository / branch') });
    this.scmConnected = page.getByText(/GitHub connected/i).first();
    this.chatBox = page.getByPlaceholder(/Ask anything/i);

    this.dialog = page.getByRole('dialog');
    this.connectImport = this.dialog.getByRole('button', { name: ci('Connect / Import repository') });
    this.dialogContinue = this.dialog.getByRole('button', { name: ci('Continue') });

    this.syncProgress = page.getByText(/Syncing GitHub repositories/i).first();
    this.syncedMessage = page.getByText(/Synced \d+ repositories from/i).first();
    this.syncFailed = page.getByText(/Repository sync failed|couldn.t reach source control|Testable service issue/i).last();
    this.scmCard = page.getByText(ci('Organization')).last();
    this.inlineSearch = page.getByPlaceholder(/Search all repositories/i).last(); // every sync / "Choose another" adds another table
    this.viewAll = page.getByRole('button', { name: /^View all \d+ repositories$/ }).last();

    this.repoDialog = page.getByRole('dialog').filter({ hasText: /Choose a repository/i });
    this.repoSearch = this.repoDialog.getByPlaceholder(/Search repositories/i);
    this.repoList = this.repoDialog.getByRole('list', { name: /All repositories/i });

    this.confirmRepo = page.getByRole('button', { name: ci('Confirm repository') }).last();
    this.chooseAnother = page.getByRole('button', { name: ci('Choose another') }).last();
    this.chips = page.getByRole('radio');
    this.moreBranches = page.getByRole('button', { name: /^\+\d+ branches?$/ }).last();
    this.onPush = page.getByRole('button', { name: ci('On push') }).last();
    this.onPrMerge = page.getByRole('button', { name: ci('On PR merge') }).last();
    this.summaryCard = page.getByText(/Branches\s*&\s*triggers/i).last();

    this.branchDialog = page.getByRole('dialog').filter({ hasText: /Choose a branch/i });
    this.branchSearch = this.branchDialog.getByPlaceholder(/Search branches/i);
    this.branchDone = this.branchDialog.getByRole('button', { name: ci('Done') });

    this.reviewBranches = page.getByText(/review branches/i).last();
    this.cannotChange = page.getByText(/repository cannot be changed/i).last(); // "...while a run is active" (checked live)
    this.continueBtn = page.getByRole('button', { name: ci('Continue') }).last();
    this.blocked = page.getByText(/Analysis is blocked on/i).last();
  }

  // ───────────── navigation ─────────────
  /**
   * Signs in and opens the Execution Assistant home. The site sometimes answers "We're unable to sign you in right now.
   * Please try again in a few moments." (a temporary error, e.g. after many quick sign-ins): that is retried up to 4 times with a
   * growing wait before it counts as a real failure that blocks the other cases.
   */
  async signInAndOpenHome(email: string, password: string): Promise<void> {
    const attempts = 4;
    let last = '';
    for (let n = 1; n <= attempts; n++) {
      try {
        if (await this.app.signOutButton.isVisible().catch(() => false)) {
          await this.openHome();
          return;
        }
        await this.app.login(email, password);
        await this.openHome();
        return;
      } catch (e) {
        last = (e as Error).message.split('\n')[0];
        const temporary = await this.page.getByText(/unable to sign you in right now|try again in a few moments/i).first().isVisible().catch(() => false);
        if (!temporary || n === attempts) break;
        await this.page.waitForTimeout(15_000 * n);
      }
    }
    throw new BlockingFailure('login', `Sign-in / Execution Assistant home did not open - ${last}`);
  }

  async openHome(): Promise<void> {
    if (!this.page.url().includes(HOME_PATH)) {
      await this.page.goto(`${this.baseUrl}${HOME_PATH}`);
    }
    await expect(this.changeRepo).toBeVisible({ timeout: 45_000 });
  }

  async openRepoDialog(): Promise<void> {
    await this.changeRepo.click();
    await expect(this.connectImport).toBeVisible({ timeout: 15_000 });
  }

  /** "Connect / Import repository" and wait for "Synced N repositories…" (retries the QA sync a few times). */
  async importAndWaitForSync(): Promise<void> {
    await this.openRepoDialog();
    await this.connectImport.click();
    const wait = [20, 40, 60];
    for (let attempt = 0; ; attempt++) {
      const outcome = await Promise.race([
        this.syncedMessage.waitFor({ state: 'visible', timeout: waitMs('SYNC_WAIT_SEC', 120) }).then(() => 'ready' as const),
        this.syncFailed.waitFor({ state: 'visible', timeout: waitMs('SYNC_WAIT_SEC', 120) }).then(() => 'failed' as const),
      ]).catch(() => 'timeout' as const);
      if (outcome === 'ready') return;
      if (attempt >= wait.length) {
        throw new BlockingFailure('repo-list', `Repository list did not load (last outcome: ${outcome}) - QA sync problem or SCM not connected.`);
      }
      await this.page.waitForTimeout(wait[attempt] * 1000);
      await this.openRepoDialog();
      await this.connectImport.click();
    }
  }

  /** Opens the "Choose a repository" dialog (does nothing when it is already open). */
  async openViewAll(): Promise<void> {
    if (await this.repoDialog.isVisible().catch(() => false)) return;
    await expect(this.viewAll).toBeVisible({ timeout: 15_000 });
    await this.viewAll.click();
    await expect(this.repoDialog).toBeVisible();
  }

  /** Closes any dialog that is open (Escape, then its Close / Done button). Used between the steps of the flow. */
  async closeDialogs(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      const dialog = this.page.getByRole('dialog').first();
      if (!(await dialog.isVisible().catch(() => false))) return;
      await this.page.keyboard.press('Escape');
      await this.page.waitForTimeout(400);
      if (!(await dialog.isVisible().catch(() => false))) return;
      await dialog.getByRole('button', { name: /^(Close|Done)$/i }).first().click({ timeout: 3_000 }).catch(() => undefined);
      await this.page.waitForTimeout(400);
    }
  }

  /** A repository row in the "Choose a repository" dialog (or in the table of 5). Name only, owner prefix is ignored. */
  repoRow(repo: string): Locator {
    const name = repo.split('/').pop() ?? repo;
    return this.page.getByRole('button', { name: new RegExp(`^${esc(name)}\\s+(Public|Private|Internal)\\b`, 'i') });
  }

  /** View all -> search -> click the repository -> wait for the Configure card (the repository list is already loaded). */
  async chooseRepo(repo: string): Promise<void> {
    try {
      await this.openViewAll();
      await this.repoSearch.fill(repo.split('/').pop() ?? repo);
      const row = this.repoRow(repo).first();
      await expect(row).toBeVisible({ timeout: 15_000 });
      await row.click();
      await expect(this.confirmRepo).toBeVisible({ timeout: waitMs('CONFIGURE_WAIT_SEC', 120) });
    } catch (e) {
      throw new BlockingFailure('configure', `Could not open the configuration of "${repo}" (is REPO correct?) - ${(e as Error).message.split('\n')[0]}`);
    }
  }

  /** Sync -> View all -> search -> click the repo -> wait for the Configure card. */
  async openConfigure(repo: string): Promise<void> {
    await this.importAndWaitForSync();
    await this.openViewAll();
    await this.repoSearch.fill(repo.split('/').pop() ?? repo);
    const row = this.repoRow(repo).first();
    try {
      await expect(row).toBeVisible({ timeout: 15_000 });
      await row.click();
      await expect(this.confirmRepo).toBeVisible({ timeout: waitMs('CONFIGURE_WAIT_SEC', 120) });
    } catch (e) {
      throw new BlockingFailure('configure', `Could not open the configuration of "${repo}" (is REPO correct?) - ${(e as Error).message.split('\n')[0]}`);
    }
  }

  /** Value next to a label of the GitHub card (Provider / Organization / Repositories / Status). The labels are capitalised by CSS only. */
  scmValue(label: string): Locator {
    return this.page.getByText(ci(label)).last().locator('xpath=following-sibling::*[1]');
  }

  /** Value next to a label of the "Branches & triggers" summary (Repository / Default branch / Branches available). */
  summaryValue(label: string): Locator {
    return this.page.getByText(ci(label)).last().locator('xpath=following-sibling::*[1]');
  }

  // ───────────── branches ─────────────
  /** Branch chip on the Configure card. Its accessible name is "<branch>" or "<branch>default" (the tag has no space - checked live). */
  chip(branch: string): Locator {
    return this.page.getByRole('radio', { name: new RegExp(`^\\s*${esc(branch)}(\\s*default)?\\s*$`, 'i') }).last();
  }

  async openBranchDialog(): Promise<void> {
    await expect(this.moreBranches).toBeVisible({ timeout: 15_000 });
    await this.moreBranches.click();
    await expect(this.branchDialog).toBeVisible();
  }

  /** Selects a branch through "+N branches" -> search -> tick -> Done. */
  async selectBranchViaDialog(branch: string): Promise<void> {
    await this.openBranchDialog();
    await this.branchSearch.fill(branch);
    const row = this.branchDialog.getByText(new RegExp(`^\\s*${esc(branch)}\\s*$`, 'i')).first();
    await expect(row, `branch ${branch} is found by the search`).toBeVisible({ timeout: 15_000 });
    await row.click();
    await expect(this.branchDialog.getByText(new RegExp(`${esc(branch)}\\s+selected`, 'i')).first()).toBeVisible();
    await this.branchDone.click();
    await expect(this.branchDialog).toBeHidden();
  }

  /** Branch already shown as a chip: click it. Otherwise use the dialog. */
  async selectBranch(branch: string): Promise<void> {
    const chip = this.chip(branch);
    if (await chip.isVisible().catch(() => false)) {
      if ((await chip.getAttribute('aria-checked')) !== 'true') await chip.click();
      return;
    }
    await this.selectBranchViaDialog(branch);
  }

  /** The branch is the selected one: its chip is checked, or (when it is not one of the chips shown) the chooser says "<branch> selected". */
  async expectBranchSelected(branch: string): Promise<void> {
    const chip = this.chip(branch);
    if (await chip.isVisible().catch(() => false)) {
      await expect(chip).toBeChecked();
      return;
    }
    await this.openBranchDialog();
    await expect(this.branchDialog.getByText(new RegExp(`${esc(branch)}\\s+selected`, 'i')).first()).toBeVisible();
    await this.branchDone.click();
    await expect(this.branchDialog).toBeHidden();
  }

  /**
   * Clicks "Confirm repository" and waits for the "Review branches" card.
   * The site can refuse ("Repository cannot be changed while a run is active"): that is a blocking failure, because
   * nothing after it (review, Continue) can happen until the active run on the account has finished.
   */
  /**
   * Waits for one of several elements, looking again every 30 s (each look returns the moment the element is there) and printing
   * "still waiting" in the terminal so a long wait can be seen. Returns the name of the element that appeared, or 'timeout'.
   */
  private async waitEvery30s<K extends string>(what: string, targets: Record<K, Locator>, totalMs: number): Promise<K | 'timeout'> {
    const names = Object.keys(targets) as K[];
    const start = Date.now();
    while (Date.now() - start < totalMs) {
      const slice = Math.min(30_000, totalMs - (Date.now() - start));
      const hit = await Promise.race(names.map((n) => targets[n].waitFor({ state: 'visible', timeout: slice }).then(() => n))).catch(() => undefined);
      if (hit) return hit;
      console.log(`… still waiting for ${what} (${Math.round((Date.now() - start) / 1000)}s of ${Math.round(totalMs / 1000)}s)`);
    }
    return 'timeout';
  }

  async confirmAndWaitForReview(timeoutMs = waitMs('REVIEW_WAIT_SEC', 240)): Promise<void> {
    await this.confirmRepo.click();
    const outcome = await this.waitEvery30s('"Review branches" after Confirm', { review: this.reviewBranches, refused: this.cannotChange }, timeoutMs);
    if (outcome === 'review') return;
    if (outcome === 'refused') {
      const msg = (await this.cannotChange.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      throw new BlockingFailure('confirm', `The site refused to confirm: "${msg}". A run is active on this account - wait until it finishes (or use another account) and run again.`);
    }
    // say what the page showed instead, so the reason is visible in the Actual Result (and show the end of the chat in the picture)
    const tail = (await this.page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    const alerts = (await this.page.locator('[role="alert"], [role="status"], [data-sonner-toast], [class*="toast" i]').allInnerTexts().catch(() => [])).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | ');
    await this.confirmRepo.scrollIntoViewIfNeeded().catch(() => undefined);
    const cards = await this.confirmRepo.count().catch(() => 0);
    throw new BlockingFailure('confirm', `"Review branches" did not appear within ${timeoutMs / 1000}s after Confirm repository. Notices on the page: ${alerts || '(none)'}. "Confirm repository" buttons still on the page: ${cards}. The page text ends with: "${tail.slice(-450)}"`);
  }

  async ensurePrMergeTicked(): Promise<void> {
    await this.onPrMerge.scrollIntoViewIfNeeded();
    if ((await this.onPrMerge.getAttribute('aria-pressed')) !== 'true') await this.onPrMerge.click();
    await expect(this.onPrMerge).toHaveAttribute('aria-pressed', 'true');
  }

  async waitForContinueEnabled(minutes: number): Promise<void> {
    const end = Date.now() + minutes * 60_000;
    while (Date.now() < end) {
      if (await this.blocked.isVisible().catch(() => false)) {
        throw new Error(`Site says: ${(await this.blocked.locator('xpath=..').innerText()).replace(/\s+/g, ' ').slice(0, 200)}`);
      }
      if (await this.continueBtn.isEnabled().catch(() => false)) return;
      await this.page.mouse.wheel(0, 2000).catch(() => undefined);
      await this.page.waitForTimeout(1_000);
    }
    throw new Error(`"Continue" stayed disabled for ${minutes} min`);
  }

  /**
   * Clicks "Continue" on Review branches and waits for the Run plan card. When the site cannot build the plan
   * ("Could not build plan" / "Plan unavailable") nothing after it can be checked, so that is a blocking failure.
   */
  async continueAndWaitForPlan(timeoutMs = waitMs('PLAN_WAIT_SEC', 180)): Promise<void> {
    await this.continueBtn.click();
    const plan = this.page.getByText(/^\s*Run plan\s*$/i).last();
    const failed = this.page.getByText(/Could not build plan|Plan unavailable|couldn't build the White Box run plan/i).last();
    const outcome = await this.waitEvery30s('the Run plan after Continue', { plan, failed }, timeoutMs);
    if (outcome === 'plan') return;
    const msg = outcome === 'failed' ? (await failed.locator('xpath=..').innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 200) : 'the Run plan did not appear';
    throw new BlockingFailure('plan', `Continue did not open the Run plan: ${msg}`);
  }
}

/** n-th item of a comma separated Input value such as BRANCHES (also accepts ".../tree/<branch>" links). */
export function nth(list: string | undefined, n: number): string {
  const items = (list ?? '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.replace(/^.*\/tree\//, ''));
  return items[n] ?? '';
}
