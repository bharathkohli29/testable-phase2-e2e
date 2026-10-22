import { CaseDef } from './loginCases';

const PRE = 'The user is signed in (the Login module worked). The round "Support" button is at the bottom right of every page. Nothing is ever sent: no chat message, no ticket, no file ("Submit ticket" is not pressed).';
const lines = (...l: string[]) => l.map((s, i) => `${i + 1}. ${s}`).join('\n');
const EA = 'Open the Execution Assistant';
const MENU = 'Click the round "Support" button';
const TICKET = 'Choose "Submit a Request"';
const row = (id: string, name: string, subModule: string, steps: string[], expected: string): CaseDef =>
  ({ id, name, subModule, pre: PRE, overwrite: true, steps: lines(...steps), data: 'path=/execution-assistant', expected });

/** Rows of the "Support" sheet (QA sheet: Support). */
export const SUPPORT_CASES: CaseDef[] = [
  row('SPT-001', 'Support menu on the Execution Assistant', 'Menu', [EA, MENU],
    'A menu opens with "Live Chat", "Submit a Request" and "User Guide".'),
  row('SPT-002', 'Live Chat opens the Customer Support chat', 'Live Chat', [EA, MENU, 'Choose "Live Chat"'],
    'A chat window titled "Customer Support" opens, greets with "How can we help?" and has a message box "Type here and press enter..". (Nothing is typed or sent.)'),
  row('SPT-003', 'Live Chat - quick replies and tawk.to', 'Live Chat', [EA, MENU, 'Choose "Live Chat"', 'Look at the quick replies, the message bar and the footer'],
    'The quick replies "I have a question" and "Tell me more" are offered (not pressed); an attach (paperclip) control is in the message bar; tawk.to is named ("Powered by tawk.to").'),
  row('SPT-004', 'Support ticket dialog opens', 'Ticket', [EA, MENU, TICKET],
    'A dialog "Open a support ticket" opens with "Tell us what\'s happening. We\'ll route to the right team and reply within 1 business day.", the fields Your name, Email, Topic and "What\'s going on?", and the buttons Attach file, Cancel and Submit ticket.'),
  row('SPT-005', 'Ticket - name and email are pre-filled', 'Ticket', [EA, MENU, TICKET, 'Read "Your name" and "Email"'],
    '"Your name" is filled in from the session and "Email" is filled in and looks like an e-mail address.'),
  row('SPT-006', 'Ticket - Topic list', 'Ticket', [EA, MENU, TICKET, 'Open the Topic list', 'Choose "Billing or account"'],
    'The list starts with "Select a topic" and offers: Confidence Engine — run failed; Confidence Engine — score interpretation; Whitebox / Blackbox gates; Taxonomy or compliance mapping; CI/CD integration; API or SDK; Billing or account; Other. Choosing one selects it.'),
  row('SPT-007', 'Ticket - empty description is blocked', 'Ticket', [EA, MENU, TICKET, 'Look at the description box "What\'s going on?" (Submit ticket is NOT pressed)'],
    'The description box is empty when the dialog opens and is marked required, so an empty description cannot be submitted. No ticket is created.'),
  row('SPT-008', 'Ticket - Attach file', 'Ticket', [EA, MENU, TICKET, 'Look at the "Attach file" button (no file is chosen)'],
    'The button "Attach file" is shown and a file chooser is behind it.'),
  row('SPT-009', 'Ticket - Cancel and close', 'Ticket', [EA, MENU, TICKET, 'Press "Cancel"', 'Open the dialog again and press the close (X) button'],
    'Both close the dialog without sending anything; the page behind is still the Execution Assistant.'),
  row('SPT-010', 'Ticket - My Tickets', 'Ticket', [EA, MENU, TICKET, 'Look at "My Tickets" at the bottom of the dialog'],
    '"My Tickets" is shown with "No tickets" or a count / list of tickets.'),
  row('SPT-011', 'User Guide opens from the Support menu', 'User Guide', [EA, MENU, 'Choose "User Guide"'],
    'The User Guide opens (address contains /docs/, in the same or a new tab) and is titled "Testable Platform User Guide".'),
  row('SPT-012', 'User Guide - menu and every page', 'User Guide', ['Open {BASE_URL}/docs/introduction', 'Read the menu groups', 'Open every page of the menu'],
    'The menu has the groups Getting Started, Authentication, SCM Connection, Whitebox Execution, Confidence Engine and Reference (at least 10 pages); every page opens with its article and none is a 404.'),
  row('SPT-013', 'User Guide - introduction', 'User Guide', ['Open {BASE_URL}/docs/introduction', 'Read the title, the sign-in URL and the module table', 'Click "Next →"'],
    'The title "Testable Platform User Guide" is shown; the sign-in URL is this site\'s /auth/login; the module table lists Authentication, SCM Connection, Whitebox Execution and Confidence Engine; "Next →" opens /docs/register.'),
  row('SPT-014', 'Support centre', 'Support centre', ['Open {BASE_URL}/support', 'Read the heading and the categories'],
    'The address is /support and it says "How can we help?"; "Browse by category" lists at least four categories with article counts; a "White box run book" section is shown.'),
  row('SPT-015', 'Live Chat - minimise the chat', 'Live Chat', [EA, MENU, 'Choose "Live Chat"', 'Press the minimise (down-arrow) control in the chat header'],
    'A minimise control is shown in the chat header; pressing it closes the chat window and the page stays usable. Nothing is typed or sent.'),
  row('SPT-016', 'Live Chat - chat home', 'Live Chat', [EA, MENU, 'Choose "Live Chat"', 'Press the arrow at the top left of the chat to open the chat home'],
    'The chat home greets with "Hi there", shows a "Help Center" box with "Search for answers" and "New Conversation" ("We typically reply in a few minutes"). Nothing is typed or sent.'),
  row('SPT-017', 'User Guide - article with breadcrumb, steps and Next', 'User Guide', ['Open {BASE_URL}/docs/download-report', 'Read the breadcrumb, the objectives and the steps', 'Click "Next →"'],
    'The breadcrumb is Docs › Confidence Engine › Taxonomy Report; the title, "MODULE OBJECTIVES" and numbered step-by-step instructions are shown; "Next →" opens the following article.'),
  row('SPT-018', 'User Guide - embedded walkthrough video', 'User Guide', ['Open {BASE_URL}/docs/download-report', 'Look at the video in the article'],
    'An embedded video with playing controls is shown. (It is not played.)'),
];
