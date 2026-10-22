import { CaseDef } from './loginCases';

const PRE = 'The Execution module has finished: the run is complete and the Confidence Engine page of that run is open. The Confidence Object page is opened by clicking "Confidence Object" (pillar=object). (SKIPPED when no finished run page is open.)';
const lines = (...l: string[]) => l.map((s, i) => `${i + 1}. ${s}`).join('\n');
const OPEN = 'Click "Confidence Object" to open the overview page of the finished run';
const DATA = 'repo={{REPO}}\nbranches={{BRANCHES}}';
const row = (id: string, name: string, subModule: string, steps: string[], expected: string): CaseDef =>
  ({ id, name, subModule, pre: PRE, overwrite: true, steps: lines(OPEN, ...steps), data: DATA, expected });

/** Rows of the "Object" sheet: every part of the Confidence Object page (pillar=object) - locators and the data calls the page itself makes. */
export const OBJECT_CASES: CaseDef[] = [
  row('OBJ-001', 'Opening the Confidence Object', 'Page', ['Read the address, the breadcrumb, the "Branch run" selector and the bottom link'],
    'The address is /confidence-engine with pillar=object, the same run id, a projectId, a repositoryId and the branch; the page is not sent to login; the breadcrumb shows "Confidence Object" and the start of the run id; the "Branch run" selector shows the branch, commit and run id; "Back to Confidence Engine" is shown; no error message appears.'),
  row('OBJ-002', 'Left menu, executions meter, top links and header', 'Page', ['Look at the left menu, the executions meter, the buttons and the three top links'],
    'Dashboard, Confidence Engine, Execution Assistant and Account and Plan are shown with the right addresses; "Executions: N / M" links to /account with N not above M; Sign out, Notifications, Support and Submit question are shown; the links Confidence Object / Graph / Engine point to this run and each has its "About ..." button; Closed-Loop Intel is marked COMING SOON.'),
  row('OBJ-003', 'Chat panel next to the Confidence Object', 'Chat', ['Look at the question box, "Submit question", the chat thread and "Analyze latest commit" (none is clicked)'],
    'The question box and "Submit question" are shown; the chat still says the run is complete; "Analyze latest commit" is offered and enabled.'),
  row('OBJ-004', 'Summary tiles', 'Summary', ['Read the five tiles: Avg Confidence, Projects, Validations, Ship Rate, Open Risks', 'Read the score of this run from the run API'],
    'Avg Confidence is 0-100 with a rating word; Projects, Validations, Ship Rate (0-100%) and Open Risks are numbers; Open Risks is not above Validations; Ship Rate = (Validations - Open Risks) / Validations; Avg Confidence equals the Confidence Score of this run (rounded).'),
  row('OBJ-005', 'Confidence Domains', 'Domains', ['Read "Confidence Domains", the ORG score and the five domains'],
    '"Weighted accumulation → Org Score" is shown; the ORG score is 0-100 and equals the Avg Confidence tile; Whitebox, Blackbox, Performance, Security and Compliance each show a percentage (0-100%) or N/A.'),
  row('OBJ-006', 'Whitebox Trend', 'Trend', ['Look at the "Whitebox Trend" header, the axis, the "<n> WB" marker and the chart labels'],
    'The change figure reads like "0 pts"; the axis shows 100, 80, 60, 40, 20, 0; the "<n> WB" marker is 0-100; a chart is drawn; the labels under the chart are the same testing types as the "Testing Type" list.'),
  row('OBJ-007', 'Testing Type list', 'Testing Type', ['Read "Testing Type", its average and every row'],
    'Every testing type has a score 0-100; they are listed from highest to lowest; none is repeated; "testing-type avg" equals the average of the listed scores (rounded).'),
  row('OBJ-008', 'Projects domain breakdown - cards and counter', 'Projects', ['Read "Projects domain breakdown", the page counter and every project card', 'Read the project list from the page\'s own data call (runtime-api projects)'],
    '"Page N of M · X projects" is shown and X equals the Projects tile and the project list; with one page the number of cards equals X; every card shows a score or N/A, a status word, the project name and the five domains; a card with no run says NOT STARTED, N/A everywhere and "no executions yet"; a card with a run shows its branch and how long ago; no project appears twice.'),
  row('OBJ-009', 'Project cards agree with the latest run of each project', 'Projects', ['Read the latest run of every project from the page\'s own data call (views-api runs/latest-by-project)', 'Compare each card with its project\'s latest run'],
    'Both data calls work; every project has a card and every card is a project; each project with a run shows the score (rounded) and the branch of its latest run; a project without a run is NOT STARTED; on a scored card the Whitebox figure equals the card score.'),
  row('OBJ-010', 'Workspace figures follow the project cards', 'Projects', ['Compare the status words, the Avg Confidence tile and the average of the scored cards'],
    'Every scored card has a status word; a higher score never has a worse status; the rating word of the Avg Confidence tile follows the same rule; "Avg Confidence" equals the average score of the projects shown below (rounded). Both numbers are written to the Actual Result.'),
  row('OBJ-011', 'About Confidence Object', 'Page', ['Point at "About Confidence Object"'],
    'The "About Confidence Object" button is shown and an explanation text appears when it is pointed at.'),
  row('OBJ-012', 'Reload keeps the figures and the data calls work', 'Data', ['Note the tiles and cards', 'Reload the page and wait for it to load', 'Watch the data calls (runtime-api / views-api)'],
    'The same run and page are shown; the tiles and the project cards (names and scores) are the same; the page loads the project list and the latest run per project; no data call returns an error (4xx / 5xx).'),
  row('OBJ-013', 'Back to Confidence Engine', 'Page', ['Click "Back to Confidence Engine" at the bottom'],
    'The link goes to the engine page of the same run; the Confidence Engine page opens for the same run id and still shows its scores.'),
];
