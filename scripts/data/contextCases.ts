import { CaseDef } from './loginCases';

const PRE = 'Signed-in account with GitHub connected, no run active. REPO and BRANCHES are filled in on the Input sheet; the Run plan is open (the Repo and Coverage modules ran). The panels are only opened and closed.';
const lines = (...l: string[]) => l.map((s, i) => `${i + 1}. ${s}`).join('\n');
const REACH = ['Choose the repository and a branch and "Confirm repository"', 'Wait for "Review branches" and press "Continue" (the Run plan opens)'];
const DATA = 'repo={{REPO}}\nbranches={{BRANCHES}}';
const row = (id: string, name: string, subModule: string, steps: string[], expected: string): CaseDef =>
  ({ id, name, subModule, pre: PRE, overwrite: true, steps: lines(...REACH, ...steps), data: DATA, expected });

/** Rows of the "Context" sheet: the repository context of the Execution Assistant (QA sheets: Repository Management, Repository Context). */
export const CONTEXT_CASES: CaseDef[] = [
  row('CTX-001', 'Repository ready bar', 'Status bar', ['Read the "Repository ready" bar above the chat'],
    'The bar reads "Repository ready · <repository> · <branch> · <commit> · <source availability>" with the repository and branch of the Input sheet, a commit id of 7 characters or more, and a "Details" button.'),
  row('CTX-002', 'Source details panel', 'Status bar', ['Press "Details" on the bar', 'Read the panel and close it'],
    'The panel "Source details" shows Repository and Branch of the Input sheet, the same Commit as the bar, Availability "Repository: Available · Branch: Available", Elapsed (mm:ss), Status "Repository ready" and "Technical details"; it can be closed.'),
  row('CTX-003', 'Repository history', 'History', ['Press "Repository history"', 'Read the panel and close it'],
    'The panel says "Configuration changes for this tenant. Historical execution evidence is not moved."; the newest entry is the chosen repository and branch, labelled "Current", with its date, "From ..." and "Changed by <e-mail>"; it can be closed.'),
];
