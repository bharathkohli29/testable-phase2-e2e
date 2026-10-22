import { CaseDef } from './loginCases';

const PRE = 'The Execution module has finished: the run is complete and its Confidence Engine page is open. The Confidence Graph page is opened by clicking "Confidence Graph" (pillar=graph). (SKIPPED when no finished run page is open.)';
const lines = (...l: string[]) => l.map((s, i) => `${i + 1}. ${s}`).join('\n');
const OPEN = 'Click "Confidence Graph" to open the graph page of the finished run';
const DATA = 'repo={{REPO}}\nbranches={{BRANCHES}}';
const row = (id: string, name: string, subModule: string, steps: string[], expected: string): CaseDef =>
  ({ id, name, subModule, pre: PRE, overwrite: true, steps: lines(OPEN, ...steps), data: DATA, expected });

/** Rows of the "Graph" sheet: every part of the Confidence Graph page (pillar=graph) - locators, the page's own run API calls. */
export const GRAPH_CASES: CaseDef[] = [
  row('GR-001', 'Opening the Confidence Graph', 'Page', ['Read the address, the title and the breadcrumb'],
    'The address is /confidence-engine with pillar=graph, the same run id, a projectId, a repositoryId and the branch; the page is not sent to login; the title "Confidence Graph" and the breadcrumb with the start of the run id are shown; no error message appears.'),
  row('GR-002', 'Left menu, executions meter, top links and header', 'Page', ['Look at the left menu, the executions meter, the buttons and the top links'],
    'Links Dashboard, Confidence Engine, Execution Assistant and Account and Plan are shown with the right addresses and "Confidence Engine" is the current page; "Executions: N / M" links to /account; Sign out, Notifications and Support are shown; the links Confidence Object / Graph / Engine point to this run; Closed-Loop Intel is marked COMING SOON; the header shows the commit and the start of the run id.'),
  row('GR-003', 'Question box and chat thread', 'Chat', ['Look at "Ask a confidence question" and type a draft (it is not sent)', 'Look at "Submit question", the chat thread and the "Branch run" selector'],
    'The question box is shown with its hint, can be typed in and cleared; "Submit question" is shown (not clicked); the chat still says the run is complete; the "Branch run" selector shows this run.'),
  row('GR-004', 'Run Analysis button', 'Run Analysis', ['Look at the "Run Analysis" button (it is not clicked)'],
    'The button is shown next to the title, is enabled and its tooltip says what it does ("Refresh run metrics"). It is not clicked because a click could start a new analysis.'),
  row('GR-005', 'Confidence Trend header', 'Confidence Trend', ['Read "Confidence Trend", "N run(s) with score" and the figures Org, WB and BB'],
    'N equals the number of runs of this branch that have a score (run API); Org, WB and BB are shown, are 0-100 or N/A, and Org equals this run\'s score; with one scored run the change figure is "—".'),
  row('GR-006', 'Trend chart', 'Confidence Trend', ['Look at the chart: line, vertical axis, points and their labels'],
    'The chart is shown with a drawn line and the axis 100, 80, 60, 40, 20, 0; there is one point for every scored run of the branch, each labelled with its commit (#xxxxxxx) and sitting inside the chart; the rating word (Hold ...) is shown.'),
  row('GR-007', 'Download taxonomy report button', 'Confidence Trend', ['Look at "Download taxonomy report" (it is not clicked)'],
    'The "Download taxonomy report" button is shown and enabled.'),
  row('GR-008', 'Whitebox Confidence flow card', 'Whitebox Confidence', ['Read the card: run time, CODE, STATIC SIGNALS, CONFIDENCE and the note under it'],
    'The card shows the run time (DD-MM-YYYY HH:MM), CODE with the run\'s commit, STATIC SIGNALS with the branch and the start of the run id, CONFIDENCE with a percentage equal to the run score and a rating word; the "Pipeline run failed" note is shown exactly when the runs list says the status is "failed".'),
  row('GR-009', 'Whitebox pipeline pager', 'Whitebox Confidence', ['Read "Page N of M · whitebox pipeline" and its buttons'],
    'The page label is shown; Previous is disabled on page 1; Next is disabled when there is only one page; button 1 is enabled; the pager lists no more page buttons than there are pages.'),
  row('GR-010', 'Pipeline Run History table', 'Run History', ['Read the table: columns and every row', 'Compare each row with the runs list API'],
    'The table has the columns Run ID, Trigger, Story, Time, Duration, Status and Score; one row for every run of this branch, newest first; for each run the id is shortened with "…", Trigger, Time (HH:MM), Duration (not "—", about the duration in the API), a rating word in Status and the Score match the run API.'),
  row('GR-011', 'Run History pager', 'Run History', ['Read "Page N of M · X runs" and its buttons'],
    'X equals the number of runs of this branch; M fits X (10 per page); Previous is disabled on page 1; Next is disabled when there is only one page.'),
  row('GR-012', 'Search by story ID', 'Run History', ['Click "Search by story ID…" and type a story id that exists, then one that does not exist, then clear it'],
    'The box is shown and can be typed in; a story id that exists keeps only the runs with that story; a story id that does not exist shows no run rows; clearing the box shows the runs again.'),
  row('GR-013', 'Run APIs agree with each other', 'Data', ['Read the runs list API and the run API the page uses', 'Compare the two for this run'],
    'Both APIs answer 200 and contain this run; same commit, branch, phase "completed" and overall score; the duration is filled in for the finished run; completed + failed + skipped tasks = total.'),
  row('GR-014', 'Data calls and errors while the page is open', 'Data', ['Watch the page\'s data calls for 30 seconds'],
    'No views-api or runtime-api call returns 4xx/5xx; the page makes no more than 60 data calls in 30 seconds; the title and the table are still shown afterwards.'),
  row('GR-015', 'About Confidence Graph and Back to Confidence Engine', 'Page', ['Point at "About Confidence Graph"', 'Click "Back to Confidence Engine"'],
    '"About Confidence Graph" shows an explanation text; "Back to Confidence Engine" goes to the engine page of this run and the page shows "PR Confidence Analysis" and the scores for the same run.'),
  row('GR-016', 'Graph scope: repository, result, release and period', 'Page', ['Look at the strip under the trend (repository name, result, release scope, period)', 'Look for "All Epics" and "All Stories"'],
    'The address has pillar=graph; the repository name of the Input sheet, a result word (Pass / Hold / Block / Fail), "Latest release version" and "Last 30 days" are shown. Whether "All Epics" / "All Stories" filters exist (QA sheet step 43.1) is only written to the Actual Result - they are not part of the pass / fail.'),
];
