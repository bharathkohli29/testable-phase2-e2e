import { CaseDef } from './loginCases';

const PRE = 'The Execution module has finished: the run is complete and the Confidence Engine page (/confidence-engine, pillar=engine) of that run is open. (ALLOW_EXECUTE_RUN = Y on the Input sheet; SKIPPED when no finished run is open.)';
const lines = (...l: string[]) => l.map((s, i) => `${i + 1}. ${s}`).join('\n');
const OPEN = 'Open the Confidence Engine page of the finished run';
const DATA = 'repo={{REPO}}\nbranches={{BRANCHES}}';
const TAB = (name: string, id: string, order: string, sub: string, heading: string): CaseDef => ({
  id, name: `${name} tab - every category, gate and table row`, subModule: sub, pre: PRE, overwrite: true,
  steps: lines(OPEN, `Open the "${name}" tab`, 'Open every category (the chips and the ones inside "More (n)")', 'Open every gate of each category', 'Read the gate heading, status, table columns and rows'),
  data: DATA,
  expected: `${heading} heading is shown. Every category and gate opens; each gate shows its heading "<name> Gate", the status Completed, the columns Classification, Value, Execution status, Result and Coverage, and at least one row. The counts of PASS / FAIL / N/A rows are written to the Actual Result (${order}).`,
});

/** Rows of the "Confidence Engine" sheet: every part of the Confidence Engine page after the run has finished (locators + the run API). */
export const CONFIDENCE_CASES: CaseDef[] = [
  {
    id: 'CE-001', name: 'Page header, breadcrumb and top links', subModule: 'Page', pre: PRE, overwrite: true,
    steps: lines(OPEN, 'Read the address, the breadcrumb, the title and the top links'),
    data: DATA,
    expected: 'The address is /confidence-engine with pillar=engine, mode=whitebox and from=ea; the breadcrumb shows "Confidence Engine"; the title "PR Confidence Analysis" and its sub-title are shown; the header shows the commit and the start of the run id; the links Confidence Object, Confidence Graph and Confidence Engine point to this run; "Closed-Loop Intel" is marked COMING SOON.',
  },
  {
    id: 'CE-002', name: 'Left menu, executions meter and utility buttons', subModule: 'Page', pre: PRE, overwrite: true,
    steps: lines(OPEN, 'Look at the left menu, the "Executions: used / limit" meter and the buttons Notifications, Support and Submit question'),
    data: DATA,
    expected: 'Links Dashboard, Confidence Engine, Execution Assistant and Account and Plan are shown with the right addresses; "Executions: N / M" is shown, links to /account and N is not above M; the buttons Sign out, Notifications, Support and Submit question are shown.',
  },
  {
    id: 'CE-003', name: 'Branch run selector', subModule: 'Page', pre: PRE, overwrite: true,
    steps: lines(OPEN, 'Read the "Branch run" selector', 'Open it and read the options', 'Press Escape'),
    data: DATA,
    expected: 'The selector shows the branch, a commit and the start of the run id; the list contains the current run; Escape closes it and the run does not change.',
  },
  {
    id: 'CE-004', name: 'Score cards', subModule: 'Scores', pre: PRE, overwrite: true,
    steps: lines(OPEN, 'Read Confidence Score, Whitebox Score, Blackbox Score and Validations Passed', 'Read the scores the run API returns'),
    data: DATA,
    expected: 'All four cards are shown; Confidence Score is 0-100 with a rating label (e.g. Hold) and the commit of the header; Whitebox is 0-50; Blackbox is 0-50 or N/A; Validations Passed shows passed/total and a matching percentage; no card says "In progress"; the scores API answers with score_status OK.',
  },
  {
    id: 'CE-005', name: 'Execution Status panel after the run has finished', subModule: 'Scores', pre: PRE, overwrite: true,
    steps: lines(OPEN, 'Click "Execution Status" to close and open it', 'Read the stages, the timer and the task counter', 'Read the run summary from the run API'),
    data: DATA,
    expected: 'The panel shows a final timer and all 8 stages (Queued ... Publishing projections); it opens and closes; the API says phase "completed"; the counter total equals the API total tasks and its done number equals the API completed tasks (failed and skipped tasks are not counted as done, so completed + failed + skipped = total).',
  },
  {
    id: 'CE-006', name: 'Gate Analysis figures', subModule: 'Gate Analysis', pre: PRE, overwrite: true,
    steps: lines(OPEN, 'Read "Gate Analysis"', 'Read TOTAL, PASSED, FAILED, COVERAGE, RETRIES, LOOP and PASS RATE'),
    data: DATA,
    expected: 'Pipeline Gate, Whitebox Confidence and Blackbox Confidence show a weight; the seven figures are shown; TOTAL, PASSED and FAILED are whole numbers and PASSED + FAILED = TOTAL; COVERAGE and PASS RATE are percentages up to 100; RETRIES is a whole number; LOOP shows a state word.',
  },
  TAB('Code Intelligence', 'CE-007', 'Code Intelligence', 'Taxonomy tabs', 'The CODE INTELLIGENCE'),
  TAB('Performance', 'CE-008', 'Performance Testing', 'Taxonomy tabs', 'The PERFORMANCE TESTING'),
  TAB('Security', 'CE-009', 'Security', 'Taxonomy tabs', 'The SECURITY'),
  TAB('Compliance', 'CE-010', 'Compliance', 'Taxonomy tabs', 'The COMPLIANCE'),
  {
    id: 'CE-011', name: 'Every classification row is consistent', subModule: 'Taxonomy tabs', pre: PRE, overwrite: true,
    steps: lines('Use all the table rows read in CE-007 to CE-010', 'Compare Value, limit, Execution status, Result and Coverage in every row'),
    data: DATA,
    expected: 'Every Result is PASS, FAIL, WARN or N/A; every Coverage is a percentage or N/A; every Execution status icon says "Execution completed" or "Not Applicable"; N/A values have the result N/A; numeric values have PASS, FAIL or WARN; where a limit is shown ("43.91 ≥ 80") the result agrees with the comparison. (SKIPPED when CE-007 to CE-010 did not run.)',
  },
  {
    id: 'CE-012', name: 'Info ("About ...") buttons', subModule: 'Page', pre: PRE, overwrite: true,
    steps: lines(OPEN, 'Point at "About Confidence Object", "About Confidence Graph" and "About Confidence Engine"', 'Look at the info icon of every classification row', 'Point at the info icon of the first rows of the open table'),
    data: DATA,
    expected: 'Each "About ..." button shows an explanation text when pointed at; every classification row has an "About <name>" info icon; pointing at the info icon of a row shows an explanation text.',
  },
  {
    id: 'CE-013', name: 'Notifications and Support open and close', subModule: 'Page', pre: PRE, overwrite: true,
    steps: lines(OPEN, 'Click "Notifications", then press Escape', 'Click "Support", then press Escape'),
    data: DATA,
    expected: 'Each button starts closed, opens when clicked and closes with Escape.',
  },
  {
    id: 'CE-014', name: 'Download taxonomy gate report button', subModule: 'Page', pre: PRE, overwrite: true,
    steps: lines(OPEN, 'Look at "Download full taxonomy gate report" (it is not clicked)'),
    data: DATA,
    expected: 'The button is shown and enabled.',
  },
  {
    id: 'CE-015', name: 'Chat messages after the run and "Analyze latest commit"', subModule: 'Chat', pre: PRE, overwrite: true,
    steps: lines(OPEN, 'Read the last messages in the chat on the left', 'Look at "Analyze latest commit" (it is not clicked)'),
    data: DATA,
    expected: 'The chat shows "Execution finished" and "Run complete"; where it says "This commit is already analyzed", the commit is the one in the header and "Analyze latest commit" is offered and enabled.',
  },
  {
    id: 'CE-016', name: 'Refresh keeps the run and the scores', subModule: 'Page', pre: PRE, overwrite: true,
    steps: lines(OPEN, 'Read the Confidence Score', 'Click "Refresh"', 'Read the address and the Confidence Score again'),
    data: DATA,
    expected: 'The run id in the address and the Confidence Score do not change, no error message appears and the title "PR Confidence Analysis" is still shown.',
  },
  {
    id: 'CE-017', name: 'Confidence Object and Confidence Graph open and return', subModule: 'Page', pre: PRE, overwrite: true,
    steps: lines(OPEN, 'Click "Confidence Object"', 'Click "Confidence Graph"', 'Click "Confidence Engine"'),
    data: DATA,
    expected: 'Each page opens with pillar=object / graph for the same run id, is not sent to the login page and shows no error; going back to Confidence Engine shows "PR Confidence Analysis" and the scores for the same run.',
  },
  {
    id: 'CE-018', name: 'Same score and result on every screen', subModule: 'Page', pre: PRE, overwrite: true,
    steps: lines(OPEN, 'Read the Confidence Score, result, Whitebox gate, Total / Failed validations and tasks', 'Open Confidence Object and read the scores, Validations and Open Risks', 'Open Confidence Graph and read the Org / WB scores and the Pipeline Run History row of this run', 'Open the Runs Dashboard and read the row of this run', 'Go back to the Confidence Engine'),
    data: DATA,
    expected: 'Confidence Object shows the Confidence Engine score as Avg Confidence and ORG, the same Whitebox figure, Validations = Total and Open Risks = Failed; Confidence Graph shows the same Org and WB scores and its Pipeline Run History row of this run has the same score and result; the Runs Dashboard row of this run has the same score (rounded), result word and tasks. Nothing is clicked except the page links.',
  },
  {
    id: 'CE-019', name: 'Chat pane - header and run history', subModule: 'Chat pane', pre: PRE, overwrite: true,
    steps: lines(OPEN, 'Read the top of the left chat pane', 'Scroll the thread and read the messages and their times'),
    data: DATA,
    expected: 'The pane says "Whitebox complete" with the repository and branch and a note to continue the Execution Assistant thread; the thread ends with "Execution finished" and "Run complete"; every message has a time and the times are in order.',
  },
  {
    id: 'CE-020', name: 'Chat pane - resize', subModule: 'Chat pane', pre: PRE, overwrite: true,
    steps: lines(OPEN, 'Drag the handle between the chat pane and the results to the right', 'Drag it back'),
    data: DATA,
    expected: 'The chat pane and the results resize and both stay readable (the question box and the score title are still shown).',
  },
];
