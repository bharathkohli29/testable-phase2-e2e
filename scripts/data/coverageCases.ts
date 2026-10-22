import { CaseDef } from './loginCases';

const PRE = 'Signed-in account (QA_EMAIL / QA_PASSWORD) that is paid and has GitHub connected, with no run active. REPO is filled in on the Input sheet.';
const PRE_BRANCH = `${PRE} BRANCHES is filled in (one or more branch names).`;
const lines = (...l: string[]) => l.map((s, i) => `${i + 1}. ${s}`).join('\n');
const REPO_BRANCH = 'repo={{REPO}}\nbranches={{BRANCHES}}';

/** Rows of the "Coverage" sheet: the Coverage preview and Review branches cards that open after "Confirm repository". */
export const COVERAGE_CASES: CaseDef[] = [
  {
    id: 'COV-001', name: 'Coverage preview opens after Confirm repository', subModule: 'Coverage', pre: PRE_BRANCH, overwrite: true,
    steps: lines('Choose the repository and a branch, tick "On PR merge"', 'Click "Confirm repository"', 'Look at the chat'),
    data: REPO_BRANCH,
    expected: 'The assistant shows the detected stack (e.g. "C# 8.0 · dotnet · MSBUILD") and what it can measure, then a "Coverage preview" card with a status badge (e.g. "Limited coverage"), "Ready for analysis" and "Your repository has been analyzed and is ready to continue. Some areas may have limited coverage." - not "Analysis failed".',
  },
  {
    id: 'COV-002', name: 'Coverage preview - branch, commit and checked time', subModule: 'Coverage', pre: PRE_BRANCH, overwrite: true,
    steps: lines('Choose the repository and a branch and click "Confirm repository"', 'Read Branch / Commit / Checked on the Coverage preview'),
    data: REPO_BRANCH,
    expected: 'Branch is the chosen branch, Commit is a short commit id (the same one as in the "Repository ready · <repo> · <branch> · <commit>" bar at the top) and Checked shows when it was analysed (e.g. "about 23 hours ago").',
  },
  {
    id: 'COV-003', name: 'Coverage preview - repository details', subModule: 'Coverage', pre: PRE_BRANCH, overwrite: true,
    steps: lines('Choose the repository and a branch and click "Confirm repository"', 'Open "Repository details"'),
    data: REPO_BRANCH,
    expected: '"Repository details" (subtitle "Build, languages, project structure and size") lists Build type, Language, Language version, Project type, Repository size and Files, each with a real value (not "-" / "Not detected"), and a "Repository structure" list of folders with file counts.',
  },
  {
    id: 'COV-004', name: 'Coverage preview - what we\'ll analyze', subModule: 'Coverage', pre: PRE_BRANCH, overwrite: true,
    steps: lines('Choose the repository and a branch and click "Confirm repository"', 'Open "What we\'ll analyze"'),
    data: REPO_BRANCH,
    expected: 'The subtitle names some analysis techniques followed by "and more" (the names may differ) and each of them is in the list; "Testable will evaluate your repository across:" lists the analysis techniques - at least: Code Duplication, Code Quality Auditing, Cognitive Complexity, Cyclomatic Complexity, Dependency Risk (SCA), Lint / Rule Violations, Readability / Maintainability, Security White-box Testing, Static Code Analysis, Static Vulnerabilities (SAST), Structural Analysis (other techniques may also be listed).',
  },
  {
    id: 'COV-005', name: 'Coverage preview - uncovered areas notice', subModule: 'Coverage', pre: PRE_BRANCH, overwrite: true,
    steps: lines('Choose the repository and a branch and click "Confirm repository"', 'Read the coverage notice on the card'),
    data: REPO_BRANCH,
    expected: 'When coverage is limited the card says "Some analysis areas aren\'t available yet" and offers "View uncovered areas".',
  },
  {
    id: 'COV-006', name: 'Coverage preview - View uncovered areas', subModule: 'Coverage', pre: PRE_BRANCH, overwrite: true,
    steps: lines('Choose the repository and a branch and click "Confirm repository"', 'Click "View uncovered areas"', 'Click "Close"'),
    data: REPO_BRANCH,
    expected: 'An "Uncovered areas" panel opens: "Analysis areas that aren\'t currently available for this repository.", a "Limited coverage" notice, groups such as Code Quality / Control Flow Testing / Readability / Maintainability / Static Code Analysis / Other each with "N scoped areas", and the note "Scores marked not available yet are a platform gap, not a defect in this repository." Close closes it.',
  },
  {
    id: 'COV-007', name: 'Review branches repeats the Coverage preview result', subModule: 'Coverage', pre: PRE_BRANCH, overwrite: true,
    steps: lines('Choose the repository and a branch and click "Confirm repository"', 'Read the "Review branches" card under the Coverage preview'),
    data: REPO_BRANCH,
    expected: '"Review branches · 1 branch" says "Ready — continue to build the run plan, or change the branch first.", lists the chosen branch (correct, full name) with a tick mark and branch icon and the same status as the Coverage preview (e.g. "Limited coverage") and offers "Change branch" and "Continue".',
  },
];
