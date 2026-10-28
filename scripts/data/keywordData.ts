/** One row of the "Keyword Steps" sheet: [TC ID, Step, Keyword, Object, Data, Expected, Description, Checkpoint]. */
export type StepRow = [string, number, string, string, string, string, string, string];

export const STEP_HEADERS = ['TC ID', 'Step', 'Keyword', 'Object', 'Data', 'Expected', 'Description', 'Checkpoint (Y/N)', 'Run'];
export const DATASET_HEADERS = ['Dataset', 'Label', 'page', 'path', 'Run'];

export const KEYWORD_STEPS: StepRow[] = [
  ['KW-001', 1, 'SignIn', '', '', '', 'Sign in with the account of the Input sheet', 'Y'],
  ['KW-001', 2, 'Open', 'executionAssistant', '', '', 'Open the Execution Assistant', 'N'],
  ['KW-001', 3, 'VerifyUrl', '', '', '/execution-assistant', 'The address is /execution-assistant', 'N'],
  ['KW-001', 4, 'VerifyVisible', 'shell.signOut', '', '', 'The Sign out button is shown (the browser is signed in)', 'N'],
  ['KW-001', 5, 'Screenshot', 'shell.signOut', 'Signed in: the Sign out button', '', '', 'N'],

  ['KW-002', 1, 'SignIn', '', '', '', 'Make sure the browser is signed in', 'N'],
  ['KW-002', 2, 'Open', 'executionAssistant', '', '', 'Start from the Execution Assistant', 'N'],
  ['KW-002', 3, 'Click', 'nav.{{ds.page}}', '', '', 'Click the left-menu link "{{ds.page}}"', 'N'],
  ['KW-002', 4, 'VerifyUrl', '', '', '{{ds.path}}', 'The address contains {{ds.path}}', 'Y'],
  ['KW-002', 5, 'VerifyVisible', 'shell.signOut', '', '', 'The Sign out button is still shown', 'N'],

  ['KW-003', 1, 'SignIn', '', '', '', 'Make sure the browser is signed in', 'N'],
  ['KW-003', 2, 'Open', 'executionAssistant', '', '', 'Open the Execution Assistant', 'N'],
  ['KW-003', 3, 'Click', 'shell.supportButton', '', '', 'Press the round Support button', 'N'],
  ['KW-003', 4, 'VerifyVisible', 'shell.supportMenu', '', '', 'A menu opens', 'N'],
  ['KW-003', 5, 'VerifyVisible', 'support.menu.userGuide', '', '', 'The menu offers "User Guide"', 'N'],
  ['KW-003', 6, 'Screenshot', 'shell.supportMenu', 'Support menu', '', '', 'N'],
  ['KW-003', 7, 'Press', '', 'Escape', '', 'Close the menu with Escape', 'N'],
  ['KW-003', 8, 'VerifyHidden', 'shell.supportMenu', '', '', 'The menu is gone', 'N'],

  ['KW-004', 1, 'SignIn', '', '', '', 'Make sure the browser is signed in', 'N'],
  ['KW-004', 2, 'Open', 'account', '', '', 'Open the Account page', 'N'],
  ['KW-004', 3, 'VerifyUrl', '', '', '/account', 'The address contains /account', 'N'],
  ['KW-004', 4, 'VerifyVisible', 'account.title', '', '', 'The title "Account" is shown', 'N'],
  ['KW-004', 5, 'Screenshot', 'account.title', 'Account page title', '', '', 'N'],

  ['KW-005', 1, 'SignIn', '', '', '', 'Make sure the browser is signed in', 'N'],
  ['KW-005', 2, 'Open', 'dashboard', '', '', 'Open the Runs Dashboard', 'N'],
  ['KW-005', 3, 'VerifyVisible', 'dashboard.title', '', '', 'The title "Runs Dashboard" is shown', 'N'],
  ['KW-005', 4, 'VerifyUrl', '', '', '/dashboard', 'The address contains /dashboard', 'N'],
  ['KW-005', 5, 'Screenshot', 'dashboard.title', 'Runs Dashboard title', '', '', 'N'],
];

/** Rows of the "Datasets" sheet: [Dataset, Label, page, path]. */
export const KEYWORD_DATASETS: Array<[string, string, string, string]> = [
  ['workspace-pages', 'Dashboard', 'dashboard', '/dashboard'],
  ['workspace-pages', 'Confidence Engine', 'confidenceEngine', '/confidence-engine'],
  ['workspace-pages', 'Execution Assistant', 'executionAssistant', '/execution-assistant'],
  ['workspace-pages', 'Account and Plan', 'accountAndPlan', '/account'],
];
