import { CaseDef } from './loginCases';

const PRE = 'Signed-in account (QA_EMAIL / QA_PASSWORD) that is paid and has GitHub connected, with no run active and executions left. REPO and BRANCHES are filled in on the Input sheet. ALLOW_EXECUTE_RUN = Y on the Input sheet (it starts a REAL whitebox pipeline and uses one execution).';
const lines = (...l: string[]) => l.map((s, i) => `${i + 1}. ${s}`).join('\n');
const DATA = 'repo={{REPO}}\nbranches={{BRANCHES}}\nwait_min={{EXECUTION_WAIT_MIN}}';
const REACH = ['Open the Run plan (choose repository and branch, Confirm, Continue)'];
const RUN = [...REACH, 'Click "Execute run"'];
const ENGINE = [...RUN, 'Click "Open Confidence Engine" in the "White Box execution" card'];

/** Rows of the "Execution" sheet: Execute run -> "White Box execution" card -> Open Confidence Engine -> wait for the run -> results. */
export const EXECUTION_CASES: CaseDef[] = [
  {
    id: 'EXE-001', name: 'Execute run starts the whitebox run', subModule: 'Execute run', pre: PRE, overwrite: true,
    steps: lines(...REACH, 'Click "Execute run"', 'Look at the chat and the page header'),
    data: DATA,
    expected: 'The chat shows "Execute whitebox run" and "White Box Analysis is underway for <branch>"; the page header shows "Executing…" and a "Cancel execution" button. (SKIPPED unless ALLOW_EXECUTE_RUN = Y.)',
  },
  {
    id: 'EXE-002', name: '"White Box execution" card in the chat', subModule: 'Execute run', pre: PRE, overwrite: true,
    steps: lines(...RUN, 'Read the "White Box execution" card'),
    data: DATA,
    expected: 'The card shows the repository (<owner>/<repo>), "N/1 branches", "Execution status" with a status (e.g. IN PROGRESS), the branch name with its status (e.g. STARTING), a shortened run id, and an enabled "Open Confidence Engine" button.',
  },
  {
    id: 'EXE-003', name: 'Open Confidence Engine opens the run', subModule: 'Confidence Engine', pre: PRE, overwrite: true,
    steps: lines(...ENGINE, 'Read the address and the header'),
    data: DATA,
    expected: 'The browser opens /confidence-engine with from=ea, mode=whitebox, pillar=engine, a runId, projectId and repositoryId in the address; the "Branch run" selector shows the chosen branch, its commit and the same run id; the Execution Assistant thread is shown on the left.',
  },
  {
    id: 'EXE-004', name: 'Confidence Engine page - layout', subModule: 'Confidence Engine', pre: PRE, overwrite: true,
    steps: lines(...ENGINE, 'Look at the left menu, the top tabs, the score cards and the four category tabs'),
    data: DATA,
    expected: 'Left menu: Dashboard, Confidence Engine, Execution Assistant, Account and Plan, Sign out. Top tabs: Confidence Object, Confidence Graph, Confidence Engine, Closed-Loop Intel (COMING SOON). Cards: Confidence Score, Whitebox Score, Blackbox Score, Validations Passed. Category tabs: Code Intelligence, Performance, Security, Compliance.',
  },
  {
    id: 'EXE-005', name: 'Execution Status - stages while the run is going', subModule: 'Confidence Engine', pre: PRE, overwrite: true,
    steps: lines(...ENGINE, 'Open "Execution Status" and read the stages'),
    data: DATA,
    expected: 'A timer and a task counter (N/total) are shown with the stages in this order: Queued, Admitted, Syncing repository, Detecting languages & signals, Planning analysis, Running analysis tasks, Scoring & taxonomy, Publishing projections.',
  },
  {
    id: 'EXE-006', name: 'The run completes in time and keeps moving', subModule: 'Confidence Engine', pre: PRE, overwrite: true,
    steps: lines(...ENGINE, 'Wait for the run to finish (checked every 10 seconds on the page and the run API)'),
    data: DATA,
    expected: 'The run finishes within the wait time (EXECUTION_WAIT_MIN), the number of finished tasks never stands still for more than 5 minutes, the chat says "Run complete" and the page shows the final scores.',
  },
  {
    id: 'EXE-007', name: 'Final scores', subModule: 'Results', pre: PRE, overwrite: true,
    steps: lines(...ENGINE, 'Wait for the run to finish', 'Read the four score cards'),
    data: DATA,
    expected: 'Confidence Score is a number out of 100 with a label (e.g. Hold); Whitebox Score is a number out of 50 that matches the Confidence Score; Blackbox Score is a number or N/A; Validations Passed shows "passed/total" and the percentage is correct; no card still says "In progress".',
  },
  {
    id: 'EXE-008', name: 'Gate Analysis numbers add up', subModule: 'Results', pre: PRE, overwrite: true,
    steps: lines(...ENGINE, 'Wait for the run to finish', 'Read "Gate Analysis"'),
    data: DATA,
    expected: 'Pipeline Gate, Whitebox Confidence and Blackbox Confidence are listed with weights; TOTAL, PASSED, FAILED, COVERAGE, RETRIES, LOOP and PASS RATE are shown; PASSED + FAILED = TOTAL, PASS RATE matches PASSED / TOTAL and TOTAL and PASSED match the Validations Passed card.',
  },
  {
    id: 'EXE-009', name: 'Category tabs show gate tables', subModule: 'Results', pre: PRE, overwrite: true,
    steps: lines(...ENGINE, 'Wait for the run to finish', 'Open Code Intelligence, Performance, Security and Compliance in turn'),
    data: DATA,
    expected: 'Each tab shows its heading, at least one gate with the status COMPLETED, a table with the columns Classification, Value, Execution status, Result and Coverage, and results that are PASS, FAIL or N/A.',
  },
  {
    id: 'EXE-010', name: 'Run API agrees with the page', subModule: 'Results', pre: PRE, overwrite: true,
    steps: lines(...ENGINE, 'Wait for the run to finish', 'Read the run summary, scores and taxonomy-gate calls the page makes'),
    data: DATA,
    expected: 'The run summary is for the same run id, branch and commit; completed + failed + skipped tasks equal the total; its score equals the score on the page; the score status is OK and the taxonomy gate has a saved snapshot; the run phase is "completed" and the status is a final result (passed or failed is the branch result, not a problem with the run); no run call returned an error (4xx / 5xx).',
  },
];
