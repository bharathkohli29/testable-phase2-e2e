# testable-phase2-e2e

Phase 2: in-depth, modular, Excel-driven Playwright tests for Testable.
(Phase 1 = `testable-merge-flow`, untouched.)

## Layout

```
input/testable-input.xlsx      ← the only file you edit: Input sheet + one sheet per module
core/                          ← shared plumbing, no test logic
  excel/readInput.ts             reads Input + module sheets
  runner/registerCases.ts        turns sheet rows into runnable cases, screenshots, records
  runner/checks.ts               builds the "Actual Result" text
  pages/AppShell.ts              signed-in frame (Sign out, "am I logged in?")
  reporting/…                    builds results/<run>/testable-results.xlsx
modules/
  login/
    normal/    normalLogin.page.ts  (locators + actions)   normalLogin.spec.ts  (test cases, assertions)
    google/ microsoft/ github/ sso/   page + spec each (no login until a test account is filled in)
    shared/    OAuthLoginPage.ts + oauthCases.ts (the cases Google/Microsoft/GitHub have in common)
    sso/       generic SSO list cases + okta/ azuread/ onelogin/ auth0/ (page + spec each) + shared/
  repo/                          (after login: repository + branch connection)
    connection/  repoConnection.spec.ts   Connect/Import, View all, search, choose repo
    branch/      branchSelection.spec.ts  Configure card, +N branches, triggers, Confirm, Review, Continue
    shared/      RepoPage.ts (locators + actions)   setup.ts (account/REPO/BRANCHES checks + sign-in)
scripts/createInputTemplate.ts ← creates the workbook (npm run template)
results/run_<time>/            ← testable-results.xlsx, evidence/*.png, playwright-report/
```

## Run

```
npm install
npx playwright install chromium     (first time only)
npm run template                    (first time only – creates input/testable-input.xlsx)
npm run sync                        (after an update: adds new test case rows / Input keys to YOUR workbook, keeps your values)
# fill the yellow cells on the Input sheet, then:
npm test                            all modules
npm run test:login                  Login module only
npm run test:login:normal           normal login only
npm run test:repo                   Repo module (repository + branch connection)
npm run test:flow                   normal login, then repo/branch - ONE run, ONE results folder (use this instead of clicking Login and Repo separately)
```

After **every test case** the results are written to two places (close the workbook in Excel while running):

1. **`input/testable-input.xlsx` itself** – the Login sheet gets *Actual Result*, *Result* (PASS / FAIL / SKIPPED), the screenshot (embedded + link) and *Executed At*. Re-running a case replaces its old result; cases you don't run keep their last result. Switch off with `WRITE_RESULTS_TO_INPUT = N` on the Input sheet.
2. **`results/run_<time>/testable-results.xlsx`** – a copy for that run only (NOT RUN for cases that weren't executed), passwords/keys masked as `********`, plus a **Summary** sheet. Screenshots are in `results/run_<time>/evidence/`.

## The Excel input

**Input sheet** – `Key | Value | Notes`. `ENV` (QA/DEV) picks the `QA_*` or `DEV_*` block.
Credentials, AWS keys, buckets, headless/slow-mo/timeout live here.

**Login sheet** (one sheet per module) – columns:
`TC ID · Test Case Name · Module · Sub Module · Preconditions · Test Steps · Test Data · Expected Result · Run · Actual Result · Result · Screenshot Evidence · Executed At`

* You write the first eight once. *Run* = `N` skips a case. The last four are filled by the automation.
* **Test Data** is `key=value` lines. `{{EMAIL}}` / `{{PASSWORD}}` (or any Input key) are filled from the Input sheet.
  Example: change `placeholder=Email or username` to what the spec says – if the site differs, the case FAILs and the sheet shows what was found.
* **Sub Module** decides which spec owns the row (Normal, Google, Microsoft, GitHub, SSO).
* A row whose TC ID has no handler in the spec is reported as **SKIPPED**. A handler can also skip itself with a reason (`skip('…')`).

## Google / Microsoft / GitHub / SSO – no test accounts yet
These run **without logging in**: button present, clicking it opens the provider's authorization URL (host, path, `client_id`,
`redirect_uri` → Testable's callback, `state`…), coming back leaves the user signed out, and for SSO the provider list and the
"Authenticate with <provider>" button. The full "login succeeds" cases (`LOGIN-GOO-004`, `-MIC-004`, `-GIT-004`, `-SSO-005`) contain the
provider sign-in code but are **SKIPPED** until the account is filled in on the Input sheet (`GOOGLE_EMAIL/PASSWORD`, `MICROSOFT_…`,
`GITHUB_USERNAME/PASSWORD`, `SSO_EMAIL/PASSWORD`). The four SSO identity providers each have their own folder and 3 cases (choose in list – runs now; Authenticate opens the provider – needs `<PROVIDER>_EMAIL`; full login – needs `<PROVIDER>_EMAIL/PASSWORD`): `OKTA_*`, `AZUREAD_*`, `ONELOGIN_*`, `AUTH0_*`. Their idp_host / idp_path are expected values to correct from the first real run. That code is not verified against the live provider pages and does not handle MFA.
Google's URL parts were verified live; Microsoft's and GitHub's `authorize_host` / `authorize_path` in Test Data are expected values – correct them in the sheet if the first run shows otherwise.

## Repo module (after login)
Flow: Change repository / branch → Connect / Import repository → View all / search → choose repo → pick branch (chips or "+N branches") →
tick On PR merge → Confirm repository → Review branches → Continue. Sheet **Repo** (REPO-CON-001…008, REPO-BRN-001…011).
Needs on the Input sheet: `QA_EMAIL`/`QA_PASSWORD` (a paid account with GitHub already connected), `REPO`, `BRANCHES` (two or more for the "change branch" case).
First-time users (sign-up → payment → connect SCM) are a separate flow, not covered here.
`REPO-BRN-009` saves the tenant default repository/branch and `REPO-BRN-010` clicks Continue (starts the analysis) – set Run = N on them if you do not want that.

## Add / automate things

* **Automate a dummy login**: add a handler `'LOGIN-GOO-002': async ({ pg, check }) => { … }` in `modules/login/google/googleLogin.spec.ts`, put the locators in its `.page.ts`.
* **New test case**: add a row to the Login sheet and a handler with the same TC ID.
* **New module** (e.g. Dashboard): copy a folder under `modules/` (page + spec), add a sheet named `Dashboard` to the workbook, and call `defineCases({ sheet: 'Dashboard', subModule: '…', … })` and register the cases with `test()` (copy the last lines of a login spec).

## Notes

* Assertions use Playwright locators + `expect`. Every `check(...)` line appears in *Actual Result* as ✔ / ✘.
* The workbook holds real credentials: it is git-ignored – don't share it.

## Keyword layer (branch keyword-driven)
See `docs/KEYWORD_LAYER.md`. Quick checks: `npm run typecheck`, `npm run selftest`, `npm run sync`, `npm run locators:check`, `npm run test:keywords`.
