import type { CaseDef } from './loginCases';

const SIGNED_IN = 'Valid account for the selected ENV is filled in the Input sheet (EMAIL, and PASSWORD or the environment variable <ENV>_PASSWORD). The first case signs in.';
const lines = (...l: string[]) => l.map((s, i) => `${i + 1}. ${s}`).join('\n');

/**
 * Rows of the "Keywords" sheet: the cases of the keyword-driven module. The Test Steps column is only a readable summary - the steps that
 * RUN are the rows of the "Keyword Steps" sheet (same TC ID). Add a case = add one row here + its rows there. No code.
 */
export const KEYWORD_CASES: CaseDef[] = [
  {
    id: 'KW-001', name: 'Sign in and open the Execution Assistant', subModule: 'Keywords', pre: SIGNED_IN, overwrite: true,
    steps: lines('SignIn', 'Check the address is /execution-assistant', 'Check the Sign out button is visible'),
    data: '',
    expected: 'The browser is signed in on the Execution Assistant and the Sign out button is shown.',
  },
  {
    id: 'KW-002', name: 'Left menu opens every workspace page (one case, four data sets)', subModule: 'Keywords', pre: SIGNED_IN, overwrite: true,
    steps: lines('Open the Execution Assistant', 'Click the left-menu link {{ds.page}}', 'Check the address contains {{ds.path}}', 'Check the Sign out button is visible', '(repeated for every row of the data set "workspace-pages")'),
    data: 'dataset=workspace-pages',
    expected: 'Each left-menu link (Dashboard, Confidence Engine, Execution Assistant, Account and Plan) opens its page and the browser stays signed in.',
  },
  {
    id: 'KW-003', name: 'Support menu opens and closes (nothing is sent)', subModule: 'Keywords', pre: SIGNED_IN, overwrite: true,
    steps: lines('Open the Execution Assistant', 'Click the Support button', 'Check the menu and "User Guide" are visible', 'Press Escape', 'Check the menu is gone'),
    data: '',
    expected: 'Pressing Support opens a menu that offers "User Guide"; Escape closes it. No chat, ticket or message is started.',
  },
  {
    id: 'KW-004', name: 'Account page opens', subModule: 'Keywords', pre: SIGNED_IN, overwrite: true,
    steps: lines('Open the Account page', 'Check the address contains /account', 'Check the title "Account" is visible'),
    data: '',
    expected: 'The Account page opens with the title "Account".',
  },
  {
    id: 'KW-005', name: 'Runs Dashboard opens', subModule: 'Keywords', pre: SIGNED_IN, overwrite: true,
    steps: lines('Open the Dashboard', 'Check the title "Runs Dashboard" is visible', 'Check the address contains /dashboard'),
    data: '',
    expected: 'The Runs Dashboard opens with its title.',
  },
];
