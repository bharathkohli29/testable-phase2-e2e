import { CaseDef } from './loginCases';

const PRE = 'Signed-in account (QA_EMAIL / QA_PASSWORD) that is paid and has GitHub connected, with no run active. REPO and BRANCHES are filled in on the Input sheet.';
const lines = (...l: string[]) => l.map((s, i) => `${i + 1}. ${s}`).join('\n');
const DATA = 'repo={{REPO}}\nbranches={{BRANCHES}}\nwait_min=5';
const REACH = ['Choose the repository and a branch, tick "On PR merge"', 'Confirm repository and wait for "Review branches"', 'Click "Continue"'];

/** Rows of the "Plan" sheet: the Run plan that opens after "Continue" (the Repo / Branch module ends at Continue). */
export const PLAN_CASES: CaseDef[] = [
  {
    id: 'PLAN-001', name: 'Continue opens the Run plan', subModule: 'Run plan', pre: PRE, overwrite: true,
    steps: lines(...REACH, 'Look at the chat'),
    data: DATA,
    expected: 'The chat says "Saved your selection: <id> · <branch> · push, PR merge", then "Here\'s the Run plan for White Box Analysis — review scope and what we\'ll classify, then execute."; the header reads "Confirm whitebox plan" and a "Run plan" card is shown.',
  },
  {
    id: 'PLAN-002', name: 'Run plan card - title and introduction', subModule: 'Run plan', pre: PRE, overwrite: true,
    steps: lines(...REACH, 'Read the top of the Run plan card'),
    data: DATA,
    expected: 'The card is titled "Run plan" and says "Review scope and what we\'ll classify. Execute starts the whitebox pipeline on your repo."',
  },
  {
    id: 'PLAN-003', name: 'Run plan - project and repository', subModule: 'Run plan', pre: PRE, overwrite: true,
    steps: lines(...REACH, 'Read "Project" and "Repository"'),
    data: DATA,
    expected: 'Project is the repository name (e.g. C-_Stack) and Repository is <owner>/<repo> ending in the same name.',
  },
  {
    id: 'PLAN-004', name: 'Run plan - branch to analyze', subModule: 'Run plan', pre: PRE, overwrite: true,
    steps: lines(...REACH, 'Read "Branches to analyze"'),
    data: DATA,
    expected: '"Branches to analyze" says "Selected branch (tip SHA)." and lists exactly one selected branch: the chosen branch with its commit id (the same commit id the Coverage preview showed).',
  },
  {
    id: 'PLAN-005', name: 'Run plan - analysis axes (taxonomy) in order', subModule: 'Run plan', pre: PRE, overwrite: true,
    steps: lines(...REACH, 'Read "Analysis axes (taxonomy)"'),
    data: DATA,
    expected: 'Five numbered axes in this order: 1 Static & structural signals, 2 Security testing types, 3 Performance & reliability, 4 Compliance & policy, 5 Taxonomy rollup & score.',
  },
  {
    id: 'PLAN-006', name: 'Run plan - analysis axes descriptions', subModule: 'Run plan', pre: PRE, overwrite: true,
    steps: lines(...REACH, 'Read the line under each axis'),
    data: DATA,
    expected: 'Each axis has its description: 1 "Repo graph, language fingerprints, and static findings rolled into whitebox classifications."; 2 "Secrets, dependencies, containers, IAM-style checks - gated under security-related taxonomy rows."; 3 "Soak, spike, regression and runtime-oriented metrics where applicable to your stack."; 4 "Policy and audit-style controls mapped to compliance classifications when configured."; 5 "Task completion -> taxonomy gate -> whitebox confidence and authoritative composite."',
  },
  {
    id: 'PLAN-007', name: 'Run plan - Execute run is offered (not clicked)', subModule: 'Run plan', pre: PRE, overwrite: true,
    steps: lines(...REACH, 'Look at the bottom of the Run plan'),
    data: DATA,
    expected: 'An enabled "Execute run" button is at the end of the Run plan card. It is not clicked - it starts the whitebox pipeline.',
  },
];
