import { CaseDef } from './loginCases';

const PRE = 'The user is signed in (the Login module worked). The Runs Dashboard (/dashboard) is opened from the left menu "Dashboard". REPO and BRANCHES are filled in on the Input sheet and that branch already has at least one run. (SKIPPED when the user is not signed in.)';
const lines = (...l: string[]) => l.map((s, i) => `${i + 1}. ${s}`).join('\n');
const OPEN = 'Click "Dashboard" in the left menu';
const DATA = 'repo={{REPO}}\nbranches={{BRANCHES}}';
const row = (id: string, name: string, subModule: string, steps: string[], expected: string): CaseDef =>
  ({ id, name, subModule, pre: PRE, overwrite: true, steps: lines(OPEN, ...steps), data: DATA, expected });

/** Rows of the "Dashboard" sheet: every part of the Runs Dashboard page - locators and the run list the page itself loads. */
export const DASHBOARD_CASES: CaseDef[] = [
  row('DSH-001', 'Opening the Runs Dashboard', 'Page', ['Read the address, the breadcrumb, the title and the "Current repository" text'],
    'The address is /dashboard (not sent to login); the breadcrumb reads TESTABLE > RUNS DASHBOARD; the title "Runs Dashboard" is shown; the text says "Current repository <repo> / <branch>" with the repository and branch of the Input sheet and explains that the list defaults to this pair; no error message appears.'),
  row('DSH-002', 'Left menu and buttons', 'Page', ['Look at the left menu, the logo, Sign out, Support and Refresh'],
    'Dashboard, Confidence Engine, Execution Assistant and Account and Plan are shown with the right addresses; the Testable logo goes to the Confidence Engine; Sign out, Support and Refresh are shown and Refresh is enabled.'),
  row('DSH-003', 'Current execution card', 'Current execution', ['Read the "CURRENT EXECUTION" card (Start analysis is NOT clicked)'],
    '"CURRENT EXECUTION" names the current pair; "Start analysis" is shown and enabled (not clicked: it starts a real run); the text says Start analysis always uses the current pair and that other branches appear only when they already have a run.'),
  row('DSH-004', 'Refresh', 'Page', ['Click "Refresh" and watch the page\'s data call'],
    'Refresh loads the run list again (a views-api runs call that returns 200), the same runs are listed afterwards with the same status, score and tasks, the "RUNS FROM" selection is not changed and the page stays on the Dashboard with the same current pair.'),
  row('DSH-005', 'RUNS FROM selector', 'Runs from', ['Read the selector, open it and read every option, then press Escape'],
    'The selector shows "Current: <repo> / <branch>"; the list has the groups "<repo> — branches with runs" and "Other repositories"; branch options read "<repo> / <branch>" and are exactly the other branches of this repository that already have a run; every other project is listed under "Other repositories" and none is listed twice; Escape closes the list.'),
  row('DSH-006', 'Choosing another branch', 'Runs from', ['Open the selector and choose another branch that has runs', 'Read the text, the heading and the table', 'Choose the current pair again'],
    'The page says "Showing runs for a previously selected branch. Start analysis still uses the current pair."; the heading reads "Runs (N) — previous branch" with N equal to that branch\'s runs in the run list; every row is of that branch; "CURRENT EXECUTION" still shows the current pair; choosing the current pair again brings back the original list. Nothing is started.'),
  row('DSH-007', 'Runs table - structure and formats', 'Runs table', ['Read the heading "Runs (N)", the columns and every row'],
    'N equals the number of rows; the columns are Run ID, Attempt, Project, Branch, Commit, Status, Score, Tasks, Created; Run ID and Commit are hexadecimal (8 characters); Attempt reads "Attempt N"; Project and Branch are the current pair; Score has at most one decimal (0-100); Tasks reads done/total; Created reads like "Oct 7, 05:15 PM"; no run is listed twice.'),
  row('DSH-008', 'Runs table agrees with the run list', 'Runs table', ['Read the run list from the page\'s own data call (views-api runs)', 'Compare every row with it'],
    'The number of runs and their order (newest first) are the same; for each run the attempt, commit, score, tasks (completed / total) and created time (in this computer\'s time zone) match the run list.'),
  row('DSH-009', 'Status words follow the score', 'Runs table', ['Compare the Status words with the Score of each run'],
    'A higher score never has a worse status word; runs with the same score show the same word. The backend status of each run is written to the Actual Result for comparison (it is the branch verdict, the table word follows the score).'),
  row('DSH-010', 'Reload keeps the list and the data calls work', 'Data', ['Note the runs', 'Reload the page', 'Watch the data calls (runtime-api / views-api)'],
    'The Dashboard is shown again (not sent to login) with the same current pair and the same runs and scores; the run list is loaded again; no data call returns an error (4xx / 5xx).'),
  row('DSH-011', 'View run details', 'Runs table', ['Look at "View run details" in every row', 'Click it for the first run', 'Come back with the left menu "Dashboard"'],
    'Every row has the button and its link goes to /confidence-engine with the run\'s id, a projectId, a repositoryId and the branch; clicking it opens the Confidence Engine of that run showing the same score as the table (rounded); the left menu brings back the Dashboard with the same runs. Nothing is started.'),
  row('DSH-012', 'Open the run of the last row', 'Runs table', ['Click the open icon ("View run details") at the end of the last row', 'Come back with the left menu "Dashboard"'],
    'Opening the run of the last (oldest) row shows the Confidence Engine of that run (its id is in the address and "PR Confidence Analysis" is shown); the left menu brings back the Dashboard. Nothing is started. (The Run ID text itself is not a link on this page; the open icon at the end of the row is.)'),
];
