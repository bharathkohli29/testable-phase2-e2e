export interface CaseDef {
  id: string;
  name: string;
  subModule: string;
  pre: string;
  steps: string;
  data: string;
  expected: string;
  /** Sync may refresh this row's text in an existing workbook (only while it has never been executed). */
  overwrite?: boolean;
}

const NOT_LOGGED_IN = 'Browser open, user is not logged in.';
const HAS_ACCOUNT = 'Valid account for the selected ENV is filled in the Input sheet (EMAIL / PASSWORD).';
const lines = (...l: string[]) => l.map((s, i) => `${i + 1}. ${s}`).join('\n');
const CREDS = 'email={{EMAIL}}\npassword={{PASSWORD}}';

/** Single source for the "Login" sheet rows. Expected Result is written once here; Actual/Result come from the run. */
export const LOGIN_CASES: CaseDef[] = [
  // ───────────── Extra cases from the QA sheets (Support, Password reset, E-mail verification, Logout) ─────────────
  {
    id: 'LOGIN-NRM-022', name: 'Support button on the login page', subModule: 'Normal', pre: NOT_LOGGED_IN, overwrite: true,
    steps: lines('Open the login page', 'Look for the round "Support" button at the bottom right', 'Press it'),
    data: 'path=/auth/login',
    expected: 'The Support button is shown; pressing it opens a menu with "Live Chat", "Submit a Request" and "User Guide".',
  },
  {
    id: 'LOGIN-RST-001', name: 'Forgot password page', subModule: 'Password reset', pre: NOT_LOGGED_IN, overwrite: true,
    steps: lines('Open {BASE_URL}/auth/forgot-password', 'Read the page (nothing is submitted, no reset mail is requested)'),
    data: 'path=/auth/forgot-password',
    expected: 'The heading "Forgot password?" is shown with "Enter your work email. If an account exists, we\'ll email a verification code — then you\'ll enter it and choose a new password."; the field "Email Address" (placeholder you@company.com, type email) and a "Continue" button are shown.',
  },
  {
    id: 'LOGIN-RST-002', name: 'Forgot password - Sign in link', subModule: 'Password reset', pre: NOT_LOGGED_IN, overwrite: true,
    steps: lines('Open {BASE_URL}/auth/forgot-password', 'Click "Sign in" next to "Remember your password?"'),
    data: 'path=/auth/forgot-password',
    expected: '"Remember your password?" is shown and "Sign in" opens the login page (/auth/login).',
  },
  {
    id: 'LOGIN-VER-001', name: 'Made-up verification link is rejected', subModule: 'E-mail verification', pre: NOT_LOGGED_IN, overwrite: true,
    steps: lines('Open {BASE_URL}/verify-email?token=<made-up text>', 'Read the page (nothing is pressed)'),
    data: 'path=/verify-email',
    expected: '"Verification Failed" and "Verification link is invalid or has expired" are shown with "Enter your email and we\'ll send a fresh verification link if your account isn\'t verified yet."; "Resend verification email" and "Go to Sign In" are offered; the user is not signed in.',
  },
  {
    id: 'LOGIN-VER-002', name: 'Verification failed - Go to Sign In', subModule: 'E-mail verification', pre: NOT_LOGGED_IN, overwrite: true,
    steps: lines('Open {BASE_URL}/verify-email?token=<made-up text>', 'Click "Go to Sign In"'),
    data: 'path=/verify-email',
    expected: '"Go to Sign In" opens the login page (/auth/login).',
  },
  {
    id: 'LOGIN-NRM-023', name: 'Sign out asks for confirmation; Cancel keeps the session', subModule: 'Normal', pre: 'The user is signed in.', overwrite: true,
    steps: lines('Open the Execution Assistant', 'Click "Sign out" in the left menu', 'Click "Cancel" in the confirmation'),
    data: 'path=/execution-assistant',
    expected: 'A confirmation with "Sign out" and a Cancel option is shown; Cancel closes it and the user stays signed in on the same page.',
  },
  {
    id: 'LOGIN-NRM-024', name: 'Expired session sends the user to the login page', subModule: 'Normal', pre: 'The user is signed in. (The session is "expired" by removing the site cookies and storage; the user is signed in again afterwards.)', overwrite: true,
    steps: lines('Open the Execution Assistant while signed in', 'Remove the session cookies and browser storage', 'Open the Execution Assistant again'),
    data: `path=/execution-assistant\n${CREDS}`,
    expected: 'The user is sent to /auth/login and the signed-in app is not shown.',
  },
  // ───────────── Normal (email / username + password) - automated ─────────────
  {
    id: 'LOGIN-NRM-001', name: 'Login page opens on the correct URL', subModule: 'Normal', pre: NOT_LOGGED_IN,
    steps: lines('Open {BASE_URL}/auth/login', 'Read the URL, heading and browser title'),
    data: 'path=/auth/login\nheading=Welcome Back,\ntitle=Testable',
    expected: 'URL path is /auth/login, the heading reads "Welcome Back," and the browser title contains "Testable".',
  },
  {
    id: 'LOGIN-NRM-002', name: 'Login page shows sub-heading and product tagline', subModule: 'Normal', pre: NOT_LOGGED_IN,
    steps: lines('Open the login page', 'Look at the text under the heading and the product tagline'),
    data: 'subheading=Sign in to continue to your workspace\ntagline=ConfidenceOps Control Plane',
    expected: '"Sign in to continue to your workspace" and "ConfidenceOps Control Plane" are visible.',
  },
  {
    id: 'LOGIN-NRM-003', name: 'Email box is present with the correct placeholder', subModule: 'Normal', pre: NOT_LOGGED_IN,
    steps: lines('Open the login page', 'Locate the email box (#emailOrUsername)', 'Check visibility, editability and placeholder', 'Type a sample value'),
    data: 'placeholder=Email or username',
    expected: 'Email box is visible, enabled and editable; placeholder is exactly the value in Test Data (any other placeholder = FAIL); typed text is accepted.',
  },
  {
    id: 'LOGIN-NRM-004', name: 'Password box is present with the correct placeholder', subModule: 'Normal', pre: NOT_LOGGED_IN,
    steps: lines('Open the login page', 'Locate the password box (#password)', 'Check visibility, editability and placeholder', 'Type a sample value'),
    data: 'placeholder=Password',
    expected: 'Password box is visible, enabled and editable; placeholder is exactly the value in Test Data (any other placeholder = FAIL); typed text is accepted.',
  },
  {
    id: 'LOGIN-NRM-005', name: 'Password is masked and the eye icon toggles visibility', subModule: 'Normal', pre: NOT_LOGGED_IN,
    steps: lines('Open the login page', 'Type a password', 'Check it is masked', 'Click the eye icon', 'Check it is shown', 'Click the eye icon again'),
    data: 'sample_password=Sample@123',
    expected: 'Masked by default (type=password) with a "Show password" icon; after the click it is visible (type=text) and the icon reads "Hide password"; clicking again masks it.',
  },
  {
    id: 'LOGIN-NRM-006', name: 'Authenticate button is present and enabled', subModule: 'Normal', pre: NOT_LOGGED_IN,
    steps: lines('Open the login page', 'Locate the submit button'),
    data: 'label=Authenticate',
    expected: 'The Authenticate button is visible, enabled and its text is "Authenticate".',
  },
  {
    id: 'LOGIN-NRM-007', name: 'Login with valid credentials succeeds', subModule: 'Normal', pre: `${NOT_LOGGED_IN} ${HAS_ACCOUNT}`,
    steps: lines('Open the login page', 'Enter valid email and password', 'Click Authenticate', 'Check the URL and the app frame'),
    data: CREDS,
    expected: 'The browser leaves /auth/login for an application page and the signed-in app (Sign out button) is shown.',
  },
  {
    id: 'LOGIN-NRM-008', name: 'After login the user can open other pages', subModule: 'Normal', pre: `${NOT_LOGGED_IN} ${HAS_ACCOUNT}`,
    steps: lines('Log in with valid credentials', 'Open each page listed in Test Data', 'Open up to max_links other links found in the app', 'Check each page stays signed in'),
    data: `${CREDS}\npaths=/execution-assistant\nmax_links=3`,
    expected: 'Every page opens without redirecting to a /auth/ page and the user stays signed in.',
  },
  {
    id: 'LOGIN-NRM-009', name: 'Pressing Enter in the password box logs in', subModule: 'Normal', pre: `${NOT_LOGGED_IN} ${HAS_ACCOUNT}`,
    steps: lines('Open the login page', 'Enter valid email and password', 'Press Enter (do not click the button)'),
    data: CREDS,
    expected: 'The user is signed in and taken to an application page.',
  },
  {
    id: 'LOGIN-NRM-010', name: 'Valid email with a wrong password is rejected', subModule: 'Normal', pre: `${NOT_LOGGED_IN} ${HAS_ACCOUNT}`,
    steps: lines('Open the login page', 'Enter the valid email and a wrong password', 'Click Authenticate'),
    data: 'email={{EMAIL}}\npassword=WrongPass#123',
    expected: 'An error message is shown, the user stays on /auth/login and is not signed in.',
  },
  {
    id: 'LOGIN-NRM-011', name: 'Unregistered email is rejected', subModule: 'Normal', pre: NOT_LOGGED_IN,
    steps: lines('Open the login page', 'Enter an email that has no account and any password', 'Click Authenticate'),
    data: 'email=no.such.user@example.invalid\npassword=WrongPass#123',
    expected: 'An error message is shown, the user stays on /auth/login and is not signed in.',
  },
  {
    id: 'LOGIN-NRM-012', name: 'Empty email and password show validation messages', subModule: 'Normal', pre: NOT_LOGGED_IN,
    steps: lines('Open the login page', 'Leave both boxes empty', 'Click Authenticate'),
    data: 'email_error=Email or username is required\npassword_error=Password is required',
    expected: 'Both messages are shown, both boxes are marked invalid and the user stays on /auth/login.',
  },
  {
    id: 'LOGIN-NRM-013', name: 'Empty email only shows the email message', subModule: 'Normal', pre: NOT_LOGGED_IN,
    steps: lines('Open the login page', 'Leave email empty, type a password', 'Click Authenticate'),
    data: 'password=Sample@123\nemail_error=Email or username is required',
    expected: 'Only the email message is shown and the user stays on /auth/login.',
  },
  {
    id: 'LOGIN-NRM-014', name: 'Empty password only shows the password message', subModule: 'Normal', pre: `${NOT_LOGGED_IN} ${HAS_ACCOUNT}`,
    steps: lines('Open the login page', 'Type the email, leave password empty', 'Click Authenticate'),
    data: 'email={{EMAIL}}\npassword_error=Password is required',
    expected: 'Only the password message is shown and the user stays on /auth/login.',
  },
  {
    id: 'LOGIN-NRM-015', name: 'SQL-injection style input is rejected', subModule: 'Normal', pre: NOT_LOGGED_IN,
    steps: lines('Open the login page', "Enter  ' OR '1'='1' --  as email and  ' OR '1'='1  as password", 'Click Authenticate'),
    data: "email=' OR '1'='1' --\npassword=' OR '1'='1",
    expected: 'A rejection message is shown, the user stays on /auth/login and is not signed in.',
  },
  {
    id: 'LOGIN-NRM-016', name: '"Forgot Password?" link works', subModule: 'Normal', pre: NOT_LOGGED_IN,
    steps: lines('Open the login page', 'Check the link, click it'),
    data: 'href=/auth/forgot-password',
    expected: 'The link is visible, points to /auth/forgot-password and opens that page.',
  },
  {
    id: 'LOGIN-NRM-017', name: '"Register" link works', subModule: 'Normal', pre: NOT_LOGGED_IN,
    steps: lines('Open the login page', 'Check the link, click it'),
    data: 'href=/auth/Register',
    expected: 'The link is visible, points to /auth/Register and opens that page.',
  },
  {
    id: 'LOGIN-NRM-018', name: 'Sign out returns to the login page', subModule: 'Normal', pre: `${NOT_LOGGED_IN} ${HAS_ACCOUNT}`,
    steps: lines('Log in with valid credentials', 'Click Sign out and confirm'),
    data: CREDS,
    expected: 'The browser is back on /auth/login and the signed-in app is no longer shown.',
  },
  {
    id: 'LOGIN-NRM-019', name: 'Protected page redirects to login when not signed in', subModule: 'Normal', pre: NOT_LOGGED_IN,
    steps: lines('Without logging in, open a protected page directly'),
    data: 'path=/execution-assistant',
    expected: 'The browser is redirected to a /auth/ page.',
  },
  {
    id: 'LOGIN-NRM-020', name: 'Session survives a page reload', subModule: 'Normal', pre: `${NOT_LOGGED_IN} ${HAS_ACCOUNT}`,
    steps: lines('Log in with valid credentials', 'Reload the page'),
    data: CREDS,
    expected: 'The user is still signed in after the reload.',
  },
  {
    id: 'LOGIN-NRM-021', name: 'Credentials never appear in the URL', subModule: 'Normal', pre: `${NOT_LOGGED_IN} ${HAS_ACCOUNT}`,
    steps: lines('Log in with valid credentials', 'Read the URL after sign-in'),
    data: CREDS,
    expected: 'Neither the email nor the password is part of the URL.',
  },

  // ───────────── Google / Microsoft / GitHub: automated WITHOUT logging in; full login skips until an account is filled in ─────────────
  ...oauthRows('Google', 'GOO', {
    host: 'accounts\\.google\\.com', path: '/o/oauth2/v2/auth',
    params: 'response_type,client_id,redirect_uri,scope,state', callback: '/auth/sso/callback/google', scope: 'openid',
    email: 'GOOGLE_EMAIL', password: 'GOOGLE_PASSWORD',
  }),
  ...oauthRows('Microsoft', 'MIC', {
    host: 'login\\.microsoftonline\\.com|login\\.live\\.com', path: '/oauth2/',
    params: 'response_type,client_id,redirect_uri,scope,state', callback: '/auth/sso/callback/microsoft', scope: 'openid',
    email: 'MICROSOFT_EMAIL', password: 'MICROSOFT_PASSWORD',
  }),
  ...oauthRows('GitHub', 'GIT', {
    host: 'github\\.com', path: '/login/oauth/authorize',
    params: 'client_id,redirect_uri,state', callback: '/api/v1/auth/github/callback', scope: '',
    email: 'GITHUB_USERNAME', password: 'GITHUB_PASSWORD',
  }),

  // ───────────── SSO ─────────────
  {
    id: 'LOGIN-SSO-001', name: '"Sign in with SSO" control is present and closed', subModule: 'SSO', pre: NOT_LOGGED_IN, overwrite: true,
    steps: lines('Open the login page', 'Locate the "Sign in with SSO" control'),
    data: '',
    expected: 'Control is visible and enabled, announces a list (aria-haspopup=listbox), is closed (aria-expanded=false) and the provider list is hidden.',
  },
  {
    id: 'LOGIN-SSO-002', name: 'Clicking SSO opens the list of identity providers', subModule: 'SSO', pre: NOT_LOGGED_IN, overwrite: true,
    steps: lines('Open the login page', 'Click "Sign in with SSO"', 'Read the list'),
    data: 'providers=Okta|okta.com,Azure AD|azure.microsoft.com,OneLogin|onelogin.com,Auth0|auth0.com',
    expected: 'The list opens (aria-expanded=true), is labelled "SSO Providers" and shows each provider with its domain.',
  },
  {
    id: 'LOGIN-SSO-003', name: 'Choosing a provider updates the form', subModule: 'SSO', pre: NOT_LOGGED_IN, overwrite: true,
    steps: lines('Open the login page', 'Open the SSO list and choose the provider in Test Data'),
    data: 'provider=Okta\nsocial_disabled=Y',
    expected: 'The list closes, the submit button reads "Authenticate with <provider>", the Google / Microsoft / GitHub buttons are disabled and the user stays signed out on /auth/login.',
  },
  {
    id: 'LOGIN-SSO-004', name: 'Every provider can be chosen in turn', subModule: 'SSO', pre: NOT_LOGGED_IN, overwrite: true,
    steps: lines('Open the login page', 'For each provider: open the list, choose it, read the submit button'),
    data: 'providers=Okta,Azure AD,OneLogin,Auth0',
    expected: 'For each provider the submit button reads "Authenticate with <provider>".',
  },
  {
    id: 'LOGIN-SSO-005', name: 'Login with SSO succeeds', subModule: 'SSO', pre: `${NOT_LOGGED_IN} SSO test account filled in (SSO_EMAIL, SSO_PASSWORD).`, overwrite: true,
    steps: lines('Open the login page', 'Choose the provider', 'Enter the SSO email and click Authenticate', 'Complete the identity-provider sign-in', 'Check the user lands in the app'),
    data: 'provider=Okta\nemail={{SSO_EMAIL}}\npassword={{SSO_PASSWORD}}',
    expected: 'The user is signed in through SSO and lands in the app. (SKIPPED until an SSO test account is filled in.)',
  },
  {
    id: 'LOGIN-SSO-006', name: 'SSO list closes when "Sign in with SSO" is clicked again', subModule: 'SSO', pre: NOT_LOGGED_IN, overwrite: true,
    steps: lines('Open the login page', 'Click "Sign in with SSO"', 'Click "Sign in with SSO" again'),
    data: 'path=/auth/login',
    expected: 'The first click shows the provider list; the second click hides it (aria-expanded=false).',
  },
  // ───────────── SSO providers (one block per identity provider in the SSO list) ─────────────
  ...ssoRows('Okta', 'OKT', { host: 'okta\\.com|oktapreview\\.com', path: '/oauth2/', email: 'OKTA_EMAIL', password: 'OKTA_PASSWORD' }),
  ...ssoRows('Azure AD', 'AZR', { host: 'login\\.microsoftonline\\.com', path: '/oauth2/', email: 'AZUREAD_EMAIL', password: 'AZUREAD_PASSWORD' }),
  ...ssoRows('OneLogin', 'ONE', { host: '[a-z0-9-]+\\.onelogin\\.com', path: '/oidc/', email: 'ONELOGIN_EMAIL', password: 'ONELOGIN_PASSWORD' }),
  ...ssoRows('Auth0', 'AU0', { host: '[a-z0-9.-]+\\.auth0\\.com', path: '/authorize', email: 'AUTH0_EMAIL', password: 'AUTH0_PASSWORD' }),
];

interface SsoDef { host: string; path: string; email: string; password: string }

/** The three cases every SSO identity provider gets (same wording, provider name filled in). */
function ssoRows(p: string, code: string, d: SsoDef): CaseDef[] {
  const id = (n: number) => `LOGIN-${code}-00${n}`;
  const sub = `SSO ${p}`;
  const acct = `${p} test account filled in (${d.email}, ${d.password}).`;
  return [
    {
      id: id(1), name: `Choose ${p} in the SSO list`, subModule: sub, pre: NOT_LOGGED_IN, overwrite: true,
      steps: lines('Open the login page', 'Open the "Sign in with SSO" list', `Choose "${p}"`),
      data: '',
      expected: `"${p}" is offered; after choosing it the list closes, the submit button reads "Authenticate with ${p}", Google / Microsoft / GitHub are disabled and the user stays signed out on /auth/login.`,
    },
    {
      id: id(2), name: `${p} Authenticate opens the ${p} sign-in (no login)`, subModule: sub, pre: `${NOT_LOGGED_IN} ${acct}`, overwrite: true,
      steps: lines('Open the login page', `Choose "${p}"`, `Enter the ${p} email and click "Authenticate with ${p}"`, 'Read the URL the browser is sent to (nothing is typed on the provider page)'),
      data: `email={{${d.email}}}\nidp_host=${d.host}\nidp_path=${d.path}\ncallback_path=/auth/sso/callback`,
      expected: `The browser is sent to ${p}'s sign-in (host and path as in Test Data) carrying Testable's callback. (SKIPPED until ${d.email} is filled in.)`,
    },
    {
      id: id(3), name: `Login with ${p} succeeds`, subModule: sub, pre: `${NOT_LOGGED_IN} ${acct}`, overwrite: true,
      steps: lines('Open the login page', `Choose "${p}"`, 'Enter the email and click Authenticate', `Complete the ${p} sign-in`, 'Check the user lands in the app', 'Sign out'),
      data: `email={{${d.email}}}\npassword={{${d.password}}}\nidp_host=${d.host}`,
      expected: `The user is signed in through ${p} and lands in the app; Sign out returns to the login page. (SKIPPED until the ${p} test account is filled in.)`,
    },
  ];
}

interface OAuthDef { host: string; path: string; params: string; callback: string; scope: string; email: string; password: string }

/** The four cases every OAuth button gets (the same wording for Google, Microsoft and GitHub). */
function oauthRows(p: 'Google' | 'Microsoft' | 'GitHub', code: string, d: OAuthDef): CaseDef[] {
  const id = (n: number) => `LOGIN-${code}-00${n}`;
  const auth = `authorize_host=${d.host}\nauthorize_path=${d.path}`;
  return [
    {
      id: id(1), name: `"Sign in with ${p}" button is present and enabled`, subModule: p, pre: NOT_LOGGED_IN, overwrite: true,
      steps: lines('Open the login page', `Locate the "Sign in with ${p}" button`),
      data: '',
      expected: `The button is visible, enabled, its accessible name is "Sign in with ${p}", its text contains "${p}" and it shows an icon.`,
    },
    {
      id: id(2), name: `Clicking ${p} opens the ${p} sign-in (no login)`, subModule: p, pre: NOT_LOGGED_IN, overwrite: true,
      steps: lines('Open the login page', `Click "Sign in with ${p}"`, 'Read the URL the browser is sent to (nothing is typed on the provider page)'),
      data: `${auth}\nrequired_params=${d.params}\ncallback_path=${d.callback}${d.scope ? `\nscope_contains=${d.scope}` : ''}`,
      expected: `The browser is sent to the ${p} authorization URL (host and path as in Test Data) carrying the required parameters, and the redirect_uri points at Testable's ${d.callback}.`,
    },
    {
      id: id(3), name: `Coming back from ${p} leaves the user signed out`, subModule: p, pre: NOT_LOGGED_IN, overwrite: true,
      steps: lines('Open the login page', `Click "Sign in with ${p}"`, 'Go back without signing in'),
      data: auth,
      expected: "Testable's login page is shown again, the provider button is usable and the user is not signed in.",
    },
    {
      id: id(4), name: `Login with ${p} succeeds`, subModule: p, pre: `${NOT_LOGGED_IN} ${p} test account filled in (${d.email}, ${d.password}).`, overwrite: true,
      steps: lines('Open the login page', `Click "Sign in with ${p}"`, `Complete the ${p} sign-in`, 'Check the user lands in the app', 'Sign out'),
      data: `${auth}\nemail={{${d.email}}}\npassword={{${d.password}}}`,
      expected: `The user is signed in through ${p}, lands in the app and can sign out. (SKIPPED until a ${p} test account is filled in.)`,
    },
  ];
}
