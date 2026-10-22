import { CaseDef } from './loginCases';

const PRE = 'The user is signed in (the Login module worked). Nothing is changed or started; "Connect Provider" is only looked at.';
const lines = (...l: string[]) => l.map((s, i) => `${i + 1}. ${s}`).join('\n');
const row = (id: string, name: string, subModule: string, steps: string[], expected: string): CaseDef =>
  ({ id, name, subModule, pre: PRE, overwrite: true, steps: lines(...steps), data: 'path=/', expected });

/** Rows of the "Redirects" sheet (QA sheets: Misc Pages & Redirects, RBAC & Multi-Tenancy, SCM Connect). */
export const REDIRECT_CASES: CaseDef[] = [
  row('RED-001', 'Unknown address shows a 404 page', 'Pages', ['Open {BASE_URL}/this-page-does-not-exist-<random>'],
    'The answer is HTTP 404 and the page says "404" and "This page could not be found."; no application data is shown.'),
  row('RED-002', 'Admin address is a 404 on the customer site', 'Pages', ['Open {BASE_URL}/admin'],
    'The answer is HTTP 404 and the page says "404" and "This page could not be found."'),
  row('RED-003', 'Old /scm/connect address is a 404', 'Pages', ['Open {BASE_URL}/scm/connect'],
    'The answer is HTTP 404 and the page says "404" and "This page could not be found."'),
  row('RED-004', 'Old /repos/select address goes to the Execution Assistant', 'Pages', ['Open {BASE_URL}/repos/select'],
    'The browser ends on /execution-assistant and the user is still signed in.'),
  row('RED-005', 'SCM integrations page', 'SCM integrations', ['Open {BASE_URL}/scm-integrations', 'Read the page (Connect Provider is NOT pressed)'],
    '"SCM Integrations" and "Manage your connected source control providers" are shown with a "Connect Provider" button; the page lists the connected providers and shows no error such as "No organization specified."'),
  row('RED-006', 'SCM integrations - Back to Home', 'SCM integrations', ['Open {BASE_URL}/scm-integrations', 'Press "Back to Home"'],
    '"Back to Home" opens the Execution Assistant.'),
  row('RED-007', 'Left menu opens every page', 'Menu', ['Open the Execution Assistant', 'Press Dashboard, Confidence Engine, Execution Assistant and Account and Plan in turn'],
    'Each item opens its page (/dashboard, /confidence-engine, /execution-assistant, /account) and the user stays signed in.'),
  row('RED-008', 'A run id of another organization is refused', 'Protection', ['Open the Execution Assistant', 'From the page ask for the run summary (views-api) and for the run (runtime-api) with the id 00000000-0000-4000-8000-000000000000, which belongs to no run of this organization'],
    'Both calls are refused (HTTP 403 or 404, never 200 and never a server error) and no run data (scores, tasks) is returned.'),
];
