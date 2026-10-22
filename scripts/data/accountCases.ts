import { CaseDef } from './loginCases';

const PRE = 'The user is signed in (the Login module worked). The Account page (/account) and the Billing page (/billing) are opened from the left menu "Account and Plan" and its links. Nothing on Billing is pressed (no checkout, no plan change).';
const lines = (...l: string[]) => l.map((s, i) => `${i + 1}. ${s}`).join('\n');
const row = (id: string, name: string, subModule: string, steps: string[], expected: string): CaseDef =>
  ({ id, name, subModule, pre: PRE, overwrite: true, steps: lines(...steps), data: 'path=/account', expected });
const OPEN = 'Click "Account and Plan" in the left menu';

/** Rows of the "Account" sheet: the Account page and the Billing page (QA sheets: Account, Billing & Account). The plan name / price / limits differ per account, so the checks read the page and compare the places that must agree. */
export const ACCOUNT_CASES: CaseDef[] = [
  row('ACC-001', 'Account page opens', 'Account', [OPEN, 'Read the address, the title, the sub-title and the breadcrumb'],
    'The address is /account; the title "Account" and the sub-title "Manage your profile, organization, plan, and usage." are shown; the breadcrumb shows "Testable" (link to /confidence-engine) and "Account".'),
  row('ACC-002', 'Customer and organization', 'Account', [OPEN, 'Read "Customer and organization"'],
    'The section "Customer and organization" shows a Customer name and an Organization name (neither is empty).'),
  row('ACC-003', 'Current plan card', 'Plan', [OPEN, 'Read the "Current plan" card'],
    'The card shows the plan name, its status (for example Active), the price "$<amount> / month", "Renews <date>" and the line "<n> runs/month · <n> GiB · <features>".'),
  row('ACC-004', 'Upgrade plan goes to Billing', 'Plan', [OPEN, 'Click "Upgrade plan"'],
    '"Upgrade plan" points to /billing and opens the Billing page; the browser Back button returns to the Account page.'),
  row('ACC-005', 'Runs usage', 'Usage', [OPEN, 'Read "Runs" in the plan card and in "Usage & limits"'],
    '"<used> / <limit> used" is the same in both places, used is not more than the limit, "<n> remaining" equals limit minus used, the limit equals "runs/month" of the plan, "Resets <date>" is the same date as "Renews <date>" and a progress bar is shown.'),
  row('ACC-006', 'Members and seats', 'Usage', [OPEN, 'Read "Members" and the seat warning'],
    '"<used> / <limit> seats used" is shown and used is not more than the limit. When every seat is used, "Seat limit reached" and "Upgrade to invite members" are shown; when seats are free no such warning is shown. "View access" is shown.'),
  row('ACC-007', 'Compute card', 'Usage', [OPEN, 'Read "Compute"'],
    '"<n> vCPU" and "<n> GiB memory" are shown and the memory equals the GiB of the plan line.'),
  row('ACC-008', 'Workers card', 'Usage', [OPEN, 'Read "Workers"'],
    'The card "Workers" shows a state (for example Unavailable) or a number - it is not empty.'),
  row('ACC-009', 'Capabilities', 'Usage', [OPEN, 'Read "Capabilities"'],
    '"Execution" and "Reliability" each list at least one item; "Reliability" lists "Automatic retries" and "Maximum duration".'),
  row('ACC-010', 'Manage billing goes to Billing', 'Billing', [OPEN, 'Read the "Billing" section', 'Click "Manage billing"'],
    '"Billing" says "Manage your payment method, invoices, and subscription."; "Manage billing" points to /billing and opens the Billing page.'),
  row('ACC-011', 'Billing page - title and Billing to', 'Billing', ['Open {BASE_URL}/billing'],
    'The title "Change Plan" and "Your subscription applies to everyone in the organization." are shown; "Billing to" shows the customer and the organization.'),
  row('ACC-012', 'Billing page agrees with the Account page', 'Billing', [OPEN, 'Note plan, price, runs, memory, customer and organization', 'Open {BASE_URL}/billing', 'Read "Order summary", "Included" and "Total"'],
    'Billing to, plan name, price, "Included" runs per month and memory are the same as on the Account page, and "Total" equals the plan price.'),
  row('ACC-013', 'Billing page - terms, Stripe note, current plan', 'Billing', ['Open {BASE_URL}/billing', 'Read the terms line, the button of the plan in use and the checkout note (nothing is pressed)'],
    '"I have read and agree to the Terms of Service." is shown with "Terms of Service" as a link; "Secure checkout powered by Stripe" is shown; the button of the plan in use reads "Current Plan" and is disabled.'),
  row('ACC-014', 'Back to Account', 'Billing', ['Open {BASE_URL}/billing', 'Click "Back to Account"'],
    '"Back to Account" points to /account and opens the Account page with its title.'),
  row('ACC-015', 'Executions meter agrees with the Account page', 'Usage', [OPEN, 'Note "used / limit"', 'Open the Execution Assistant and read "Executions: n / m" in its header', 'Click it'],
    'The header meter shows the same used count and the same limit as the Account page and opens /account.'),
];
