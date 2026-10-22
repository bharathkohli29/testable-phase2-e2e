import { CaseDef } from './loginCases';

const PRE = 'Signed-in account (QA_EMAIL / QA_PASSWORD) that is paid and has GitHub connected. REPO is filled in on the Input sheet.';
const PRE_BRANCH = `${PRE} BRANCHES is filled in (one or more branch names).`;
const lines = (...l: string[]) => l.map((s, i) => `${i + 1}. ${s}`).join('\n');
const REPO = 'repo={{REPO}}';
const REPO_BRANCH = 'repo={{REPO}}\nbranches={{BRANCHES}}';

/** Single source for the "Repo" sheet rows (repository connection + branch selection, after login). */
export const REPO_CASES: CaseDef[] = [
  // ───────────── Repository connection ─────────────
  {
    id: 'REPO-CON-001', name: 'Execution Assistant home opens after login', subModule: 'Repository', pre: PRE, overwrite: true,
    steps: lines('Log in with the Input-sheet account', 'Open the Execution Assistant home'),
    data: 'path=/execution-assistant',
    expected: 'URL is /execution-assistant, "Change repository / branch" is visible and enabled, "GitHub connected" and the chat box are shown.',
  },
  {
    id: 'REPO-CON-002', name: 'Change repository / branch opens the dialog', subModule: 'Repository', pre: PRE, overwrite: true,
    steps: lines('Open the Execution Assistant home', 'Click "Change repository / branch"'),
    data: '',
    expected: 'A dialog titled "Change repository / branch" opens with "1. Choose repository", the connected repositories (with GitHub URL), an enabled "Connect / Import repository" and "Continue".',
  },
  {
    id: 'REPO-CON-003', name: 'Connect / Import repository syncs the list', subModule: 'Repository', pre: PRE, overwrite: true,
    steps: lines('Open the dialog', 'Click "Connect / Import repository"', 'Wait for the sync to finish'),
    data: '',
    expected: 'The "Syncing GitHub repositories" progress card is shown, then "Synced N repositories from <org>"; a new /execution-assistant/<id> conversation is used and there is no sync error.',
  },
  {
    id: 'REPO-CON-004', name: 'GitHub connection card and repository table are shown', subModule: 'Repository', pre: PRE, overwrite: true,
    steps: lines('Open the dialog and click "Connect / Import repository"', 'Read the GitHub card and the table under it'),
    data: 'provider=GitHub',
    expected: 'The card shows Provider = GitHub, an Organization, the Repositories count (a number) and Status = Active; "Showing 5 of N repositories" with columns Repository, Visibility, Language, Recent commit and Updated.',
  },
  {
    id: 'REPO-CON-005', name: 'View all opens the repository chooser', subModule: 'Repository', pre: PRE, overwrite: true,
    steps: lines('Sync the repositories', 'Click "View all N repositories"'),
    data: '',
    expected: '"Choose a repository" opens: "Select one repository from N available.", a "Search repositories…" box, a list of rows like "Public · — · Discovered" and a Done button.',
  },
  {
    id: 'REPO-CON-006', name: 'Searching finds the configured repository', subModule: 'Repository', pre: PRE, overwrite: true,
    steps: lines('Sync the repositories and open View all', 'Type the repository name (REPO) in the search box'),
    data: REPO,
    expected: 'The repository is listed and only repositories matching the text remain.',
  },
  {
    id: 'REPO-CON-007', name: 'Searching an unknown repository finds nothing', subModule: 'Repository', pre: PRE, overwrite: true,
    steps: lines('Sync the repositories and open View all', 'Type a repository name that does not exist'),
    data: 'fake_repo=zz-no-such-repo-xyz',
    expected: 'The message "No repositories match …" is shown and no repository row is listed.',
  },
  {
    id: 'REPO-CON-008', name: 'Choosing the repository opens its configuration', subModule: 'Repository', pre: PRE, overwrite: true,
    steps: lines('Sync the repositories, open View all, search the repository', 'Click the repository row'),
    data: REPO,
    expected: 'The chooser closes and the configuration card for the repository appears with "Confirm repository".',
  },

  // ───────────── Branch selection ─────────────
  {
    id: 'REPO-BRN-001', name: 'Configure card shows the branches & triggers summary', subModule: 'Branch', pre: PRE, overwrite: true,
    steps: lines('Choose the repository (see REPO-CON-008)', 'Read the configuration card'),
    data: REPO,
    expected: '"Branches & triggers" shows the chosen Repository, a Default branch and Branches available (a number); "Confirm repository" is visible and "Choose another" is enabled.',
  },
  {
    id: 'REPO-BRN-002', name: 'Branch chips and "+N branches" are offered', subModule: 'Branch', pre: PRE, overwrite: true,
    steps: lines('Choose the repository', 'Look at the branch chips'),
    data: REPO,
    expected: 'Branch chips (radio buttons) are shown, the default branch is tagged "default" and selected at first, and the default chip matches the summary\'s Default branch, and a "+N branches" button is present.',
  },
  {
    id: 'REPO-BRN-003', name: '"+N branches" opens the branch chooser', subModule: 'Branch', pre: PRE, overwrite: true,
    steps: lines('Choose the repository', 'Click "+N branches"'),
    data: REPO,
    expected: '"Choose a branch · Select one branch to monitor · N available" opens with a "Search branches…" box, the default branch ticked and tagged "default", a "<branch> selected" footer and Done; the N available equals "Branches available" on the card.',
  },
  {
    id: 'REPO-BRN-004', name: 'Searching finds the branch', subModule: 'Branch', pre: PRE_BRANCH, overwrite: true,
    steps: lines('Choose the repository and open "+N branches"', 'Type the branch name (first of BRANCHES)'),
    data: REPO_BRANCH,
    expected: 'The branch is listed in the chooser.',
  },
  {
    id: 'REPO-BRN-005', name: 'Searching an unknown branch finds nothing', subModule: 'Branch', pre: PRE, overwrite: true,
    steps: lines('Choose the repository and open "+N branches"', 'Type a branch name that does not exist'),
    data: `${REPO}\nfake_branch=zz-no-such-branch-xyz`,
    expected: 'The message "No branches match …" is shown.',
  },
  {
    id: 'REPO-BRN-006', name: 'Selecting a branch and pressing Done applies it', subModule: 'Branch', pre: PRE_BRANCH, overwrite: true,
    steps: lines('Choose the repository and open "+N branches"', 'Search the branch, tick it (footer shows "<branch> selected")', 'Click Done'),
    data: REPO_BRANCH,
    expected: 'The chooser closes and the branch is the selected chip on the configuration card.',
  },
  {
    id: 'REPO-BRN-007', name: 'Triggers: On push is on, On PR merge can be ticked (together with or instead of On push)', subModule: 'Branch', pre: PRE_BRANCH, overwrite: true,
    steps: lines('Choose the repository and a branch', 'Look at the triggers', 'Tick "On PR merge"', 'Untick "On push" (On PR merge instead of On push), then tick "On push" again'),
    data: REPO_BRANCH,
    expected: '"On push" and "On PR merge" are shown, "On push" is ticked by default and "On PR merge" is ticked after clicking it; both can be ticked together; with "On push" unticked "On PR merge" stays ticked (selected instead of On push); "On push" is ticked again at the end so the next steps are unchanged.',
  },
  {
    id: 'REPO-BRN-008', name: 'The selected branch can be changed to another one', subModule: 'Branch', pre: `${PRE_BRANCH} At least two branches in BRANCHES.`, overwrite: true,
    steps: lines('Choose the repository', 'Select the first branch', 'Select the second branch'),
    data: REPO_BRANCH,
    expected: 'Only the second branch is selected afterwards (single selection).',
  },
  {
    id: 'REPO-BRN-011', name: 'Choose another goes back to the repository list', subModule: 'Branch', pre: PRE, overwrite: true,
    steps: lines('Choose the repository', 'Click "Choose another"'),
    data: REPO,
    expected: 'The repository list is shown again: the "GitHub connected" card, "Showing 5 of N repositories", the "Search all repositories…" box, the table of repositories and "View all N repositories".',
  },
  {
    id: 'REPO-BRN-009', name: 'Confirm repository opens Review branches', subModule: 'Branch', pre: PRE_BRANCH, overwrite: true,
    steps: lines('Choose the repository and a branch', 'Tick "On PR merge"', 'Click "Confirm repository"'),
    data: REPO_BRANCH,
    expected: '"Confirm repository" is enabled and the "Review branches" card appears. (This saves the tenant default repository / branch on the account.)',
  },
  {
    id: 'REPO-BRN-010', name: 'Review branches finishes and Continue works', subModule: 'Branch', pre: PRE_BRANCH, overwrite: true,
    steps: lines('On "Review branches" (after Confirm), wait for the review to finish', 'Check "Continue" is enabled', 'Click "Continue"'),
    data: `${REPO_BRANCH}\nwait_min=5`,
    expected: '"Review branches" finishes, "Continue" becomes enabled within the wait time, is clicked, and the Run plan opens. (The Branch module ends here; the Run plan content is the "Plan" sheet.)',
  },
];
