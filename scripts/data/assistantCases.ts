import { CaseDef } from './loginCases';

const PRE = 'The user is signed in (the Login module worked). The Execution Assistant home (an empty conversation) is open. The analysis cards, "Send" and "Execute run" are NEVER pressed (they start a real analysis).';
const lines = (...l: string[]) => l.map((s, i) => `${i + 1}. ${s}`).join('\n');
const EA = 'Open the Execution Assistant (press "New conversation" when an old conversation is shown)';
const row = (id: string, name: string, subModule: string, steps: string[], expected: string): CaseDef =>
  ({ id, name, subModule, pre: PRE, overwrite: true, steps: lines(EA, ...steps), data: 'path=/execution-assistant', expected });

/** Rows of the "Assistant" sheet: the Execution Assistant home (QA sheet: Execution Assistant). */
export const ASSISTANT_CASES: CaseDef[] = [
  row('EAH-001', 'Home - headline', 'Home', ['Read the headline and the text under it'],
    'The headline "Know before you deploy." and "Testable analyzes your code, runtime behavior, and risks to measure production confidence." are shown, with "Start with an analysis" and "Choose one of the analyses below or ask your own question."'),
  row('EAH-002', 'Home - analysis cards', 'Home', ['Read the three cards (none is pressed)'],
    'Code analysis: "Can I safely deploy this commit?" with "Recommended" and "Review the latest changes for release blockers and confidence."; "Where are the biggest security risks?" with "Identify vulnerable code, risky dependencies, and security hotspots." Runtime analysis: "Will my application handle production traffic?" with "Coming soon" (the card is not pressed).'),
  row('EAH-003', 'Message box and slash commands', 'Composer', ['Read the message box and its buttons', 'Type "/" (nothing is sent), read the list, clear the box'],
    'The box says "Ask anything, or type / for commands…"; "Attach a file", "Open voice session" and "Send" are shown; typing "/" lists /whitebox, /rerun, /coverage, /failures and /plan with their descriptions and a counter "1 / 500" appears; the box is empty again afterwards.'),
  row('EAH-004', 'Header and connected provider', 'Header', ['Read the header and the footer of the message box'],
    'The header shows "Connected tools: <provider>", "Change repository / branch", "Repository history", "New conversation" and the meter "Executions: n / m" (link to /account); the message box footer says "<provider> connected".'),
  row('EAH-005', 'New conversation', 'Header', ['Press "New conversation"'],
    'The empty conversation is shown (headline, "Start with an analysis" and an empty message box). Nothing is started.'),
  row('EAH-006', 'Change repository / branch dialog - Close', 'Dialog', ['Press "Change repository / branch"', 'Read the dialog', 'Press "Close"'],
    'The dialog says "This updates the tenant default. Historical runs stay on the repository that produced them.", shows "1. Choose repository" with the repository in use labelled "Current", and the buttons "Connect / Import repository" and "Continue"; "Close" closes it and the "Repository ready" bar is unchanged.'),
];
