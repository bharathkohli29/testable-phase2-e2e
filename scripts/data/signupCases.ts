import { CaseDef } from './loginCases';

const PRE = 'Browser open, user is not signed in. SAFETY: no account is ever created - the test blocks every request that would send the form to the server, never clicks Google / Microsoft / SSO "Continue with" buttons, and only uses a made-up e-mail on example.invalid.';
const lines = (...l: string[]) => l.map((s, i) => `${i + 1}. ${s}`).join('\n');
const row = (id: string, name: string, subModule: string, steps: string[], expected: string, data = 'no account is created'): CaseDef =>
  ({ id, name, subModule, pre: PRE, overwrite: true, steps: lines(...steps), data, expected });

/** Rows of the "Signup" sheet: every part of the Register page. Nothing here may create an account. */
export const SIGNUP_CASES: CaseDef[] = [
  row('SUP-001', 'Opening the sign-up page from the login page', 'Page', ['Open the login page', 'Click "Register"', 'Read the address, title, heading, texts'],
    'The login page has a "Register" link; clicking it opens /auth/Register; the browser title contains "Testable"; "Create Account", "Start shipping better code in under a minute", the panel "Ship with confidence.", "Already have an account?" and the legal line are shown.'),
  row('SUP-002', 'Account type selector', 'Account type', ['Open the sign-up page', 'Read the selector and its options', 'Choose Individual, then Organization'],
    'The selector is shown and enabled with exactly "Select account type", "Organization", "Individual"; Organization is selected when the page opens; both choices can be selected.'),
  row('SUP-003', 'Organization form - boxes', 'Organization', ['Choose Organization', 'Look at every box, placeholder and type', 'Type a sample value in each'],
    'Organization name, Full name, Work email and Password boxes are shown, enabled, empty with the right placeholders; the e-mail box is type email and the password box type password; typed text is accepted; "Create Account" is shown and enabled.'),
  row('SUP-004', 'Individual form - boxes', 'Individual', ['Choose Individual', 'Look at the boxes and placeholders', 'Switch to Organization and back'],
    'For Individual the Organization name box is hidden and Full name, Email and Password are shown with their placeholders; switching to Organization shows the Organization name box again and switching back hides it.'),
  row('SUP-005', 'Organization - empty form', 'Validation', ['Choose Organization', 'Leave every box empty', 'Click Create Account'],
    'A message is shown for every empty box: Organization name is required, Full name is required, Email is required, Password is required; the page stays on the Register page and nothing is sent to the server.'),
  row('SUP-006', 'Individual - empty form', 'Validation', ['Choose Individual', 'Leave every box empty', 'Click Create Account'],
    'Full name, Email and Password "is required" messages are shown, no Organization name message appears, and nothing is sent to the server.'),
  row('SUP-007', 'Names - spaces and one character', 'Validation', ['Type only spaces, then one letter, in Organization name and Full name (e-mail left wrong on purpose)', 'Click Create Account each time', 'Type two letters'],
    'Spaces and one character show "Organization name is required (min 2 characters)" and "Full name must be at least 2 characters"; two characters show no name message; nothing is sent to the server.'),
  row('SUP-008', 'E-mail - blank and wrong formats', 'Validation', ['Choose Individual', 'Leave the e-mail blank, then type notanemail, a@b, @b.co, "a b@c.co", a@@b.co, a@b..co', 'Click Create Account each time', 'Type a well-formed address'],
    'A blank e-mail shows "Email is required"; every wrong format shows "Please enter a valid email address"; a well-formed address shows no e-mail message.'),
  row('SUP-009', 'Password rules', 'Validation', ['Choose Individual', 'Try: abc, abcdefgh1!, Abcdefgh!!, Abcdefgh12, a 65-character password, "Abcdef1!" (8) and a 64-character password (e-mail wrong on purpose)', 'Click Create Account each time'],
    'Too short -> "Password must be at least 8 characters"; no capital -> "at least one uppercase letter"; no number -> "at least one number"; no special character -> "at least one special character"; 65 characters -> "Password must not exceed 64 characters"; exactly 8 and exactly 64 characters show no password message.'),
  row('SUP-010', 'Show / hide password', 'Password', ['Type a password', 'Click the eye button', 'Click it again'],
    'The password is hidden at first; the eye button reads "Show password"; after the click the same text is readable and the button reads "Hide password"; clicking again hides it.'),
  row('SUP-011', 'Messages go away when corrected', 'Validation', ['Click Create Account with empty boxes', 'Fill Organization name, Full name and Password (leave e-mail empty)', 'Click Create Account again'],
    'The first click shows the "required" messages; after correcting, the Organization name, Full name and Password messages are gone and only "Email is required" remains; nothing is sent.'),
  row('SUP-012', 'A valid form is sent correctly (and blocked by the test)', 'Submit', ['For Organization and for Individual: fill every box with valid made-up data (e-mail on example.invalid)', 'Click Create Account', 'Read the request the page tried to send - the test BLOCKS it'],
    'Exactly one POST over https to the register endpoint is attempted; it carries the typed name, e-mail and password; Organization also sends the Organization name, Individual does not; the account type is sent. The request never reaches the server, so no account is created.'),
  row('SUP-013', 'Google, Microsoft and SSO buttons', 'Social / SSO', ['Look at the buttons above the form', 'Do NOT click them'],
    'Google, Microsoft and "Sign up with SSO" are shown and enabled; the "or" divider separates them from the form. (Whether a GitHub button exists is written to the Actual Result.)'),
  row('SUP-014', 'SSO providers', 'Social / SSO', ['Click "Sign up with SSO"', 'Read the providers', 'Choose each provider', 'Do NOT click "Continue with ..."'],
    'Before the click no provider is listed; after it Okta (okta.com), Azure AD (azure.microsoft.com), OneLogin (onelogin.com) and Auth0 (auth0.com) are listed; choosing one shows "Continue with <provider>"; the page stays on Register and nothing is sent.'),
  row('SUP-015', 'Terms and Privacy Policy links', 'Links', ['Read the Terms and Privacy Policy links (not opened)'],
    'Terms goes to testable.io/terms-of-service and Privacy Policy to testable.io/privacy-policy, both open in a new tab with rel noopener.'),
  row('SUP-016', 'Sign in link', 'Links', ['Click "Sign in" at the bottom', 'Look at the login page'],
    '"Sign in" goes to /auth/login, the login page ("Welcome Back,") opens and offers "Register" again.'),
  row('SUP-017', 'Invalid forms never reach the server', 'Submit', ['For Organization and Individual: submit empty, too-short, wrong e-mail and weak-password forms', 'Count the requests the page tries to send'],
    'The page stops every invalid form itself: 0 requests are attempted.'),
  row('SUP-018', 'Field attributes and nothing in the address', 'Safety', ['Read the autocomplete / type of the boxes', 'Press Create Account with a typed e-mail and password (invalid form)', 'Read the address'],
    'Full name -> autocomplete name; Email -> autocomplete email and type email; Password -> autocomplete new-password and type password; the typed e-mail and password never appear in the address; the page stays on Register.'),
  row('SUP-019', 'Keyboard: Tab order and Enter', 'Keyboard', ['Press Tab from the account type selector four times', 'Focus the Password box and press Enter with empty boxes'],
    'Focus goes Organization name -> Full name -> Work email -> Password; Enter submits the form and shows the "required" messages; nothing is sent.'),
  row('SUP-020', 'Reload clears the form', 'Page', ['Type values and submit an invalid form', 'Reload the page'],
    'After the reload the boxes are empty, no old message is shown, the account type is Organization again and nothing was sent.'),
];
