import { CaseDef } from './loginCases';

const PRE = 'The Execution module has finished: the run is complete and the Confidence Engine page of that run is open, and the chat says "This commit is already analyzed (<commit>)" with an "Analyze latest commit" button. ALLOW_DUMMY_COMMIT = Y on the Input sheet (it PUSHES a commit to the repository and starts a REAL run that uses one execution), and git on this computer can push to REPO. (SKIPPED when ALLOW_DUMMY_COMMIT is not Y.)';
const lines = (...l: string[]) => l.map((s, i) => `${i + 1}. ${s}`).join('\n');
const DATA = 'repo={{REPO}}\nbranches={{BRANCHES}}\nwait_min={{LATEST_COMMIT_WAIT_MIN}}';
const row = (id: string, name: string, subModule: string, steps: string[], expected: string): CaseDef =>
  ({ id, name, subModule, pre: PRE, overwrite: true, steps: lines(...steps), data: DATA, expected });

/** Rows of the "Commit" sheet: dummy README commit -> newer tip -> "Analyze latest commit" -> new run -> wait on the Confidence Engine page. */
export const COMMIT_CASES: CaseDef[] = [
  row('COM-001', 'Dummy PR commit is pushed to the branch', 'New commit',
    ['Note the commit the chat says is already analyzed and the executions used', 'Clone REPO into the run folder (branch from BRANCHES)', 'Add the line "Dummy PR - <current date and time>" to the README, commit and push it to the same branch', 'Read the new commit id from git and from GitHub'],
    'The clone, commit and push all work; the new commit id is a 40-character id; GitHub reports it as the tip of the branch; it is not the commit the platform had already analyzed. (SKIPPED unless ALLOW_DUMMY_COMMIT = Y; FAIL with git\'s own message when the push is refused.)'),
  row('COM-002', 'The page recognises the new commit', 'New commit',
    ['Stay on the Confidence Engine page and wait (the page is refreshed once and reloaded once if it does not notice)', 'Read the "Analyze latest commit" card in the chat'],
    'The first 7 characters of the new commit id appear on the page within 4 minutes, and "Analyze latest commit" is offered and enabled. The text of the card is written to the Actual Result.'),
  row('COM-003', 'Analyze latest commit starts a new run', 'New run',
    ['Click "Analyze latest commit" (this starts a real run)', 'Wait for "White Box Analysis is underway" or the new run page', 'Read the address, the "Branch run" selector and the page header'],
    'A new run starts by itself like Execute run (a new run id, different from the previous one); the address names the branch; the "Branch run" selector shows the new commit and the start of the new run id; the header shows "Executing…" and "Cancel execution" is offered (not clicked). "Couldn\'t start the run" or nothing happening in 2 minutes is a FAIL.'),
  row('COM-004', 'Live progress of the new run', 'New run',
    ['Stay on the Confidence Engine page of the new run', 'Open "Execution Status" and read the timer, the counter and the stages twice, 15 seconds apart'],
    'The elapsed timer moves while the run is going, a task counter (N/total) is shown and the eight stages are listed in order: Queued, Admitted, Syncing repository, Detecting languages & signals, Planning analysis, Running analysis tasks, Scoring & taxonomy, Publishing projections.'),
  row('COM-005', 'The new run finishes and keeps moving', 'New run',
    ['Stay on the Confidence Engine page and wait until the run finishes (LATEST_COMMIT_WAIT_MIN)', 'Click "Refresh" and read the chat and the score'],
    'The run reaches phase "completed" within the wait time; the number of finished tasks never stands still for more than 5 minutes; the chat says "Run complete"; a final score (not "—") is shown within 3 minutes. (status passed / failed is the branch verdict, not a problem.)'),
  row('COM-006', 'Result of the new run', 'New run',
    ['Read the run summary of the new run (run API) and compare it with the page', 'Read the executions meter and the chat card again'],
    'The summary is the new run, for the branch under test and for the dummy commit; completed + failed + skipped = total tasks; phase is "completed"; the Confidence Score equals the API score (rounded); the header shows the new commit; the chat says the new commit is already analyzed; the executions meter went up by 1; no run API call returned an error.'),
  row('COM-007', 'New run shows on every screen (no stale data)', 'New run',
    ['Open Confidence Engine, Confidence Object, Confidence Graph and the Runs Dashboard for the new run', 'Compare run id, commit and score with the run summary of the new run'],
    'Confidence Engine, Confidence Object and Confidence Graph each show the new run id (not the previous one) and the new score; the Graph trend ends with the new commit and its Pipeline Run History lists the new run with the new score; the Runs Dashboard lists the new run first with the new commit and score and still lists the previous run.'),
];
