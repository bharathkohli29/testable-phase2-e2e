# Keyword layer, object repository and locator check

Everything here is ADDITIVE. `npm test` (the 329-case journey) runs exactly as before.

## What was added
| Part | Where | Run it with |
|---|---|---|
| Object repository (button/field names in JSON, not in code) | `objects/*.json`, `objects/routes.json` | used by keyword cases |
| Keyword cases (steps written in Excel) | sheets `Keywords`, `Keyword Steps`, `Datasets` | `npm run test:keywords` |
| Data sets (same steps, many values) | sheet `Datasets`, `dataset=<name>` in Test Data | same |
| Locator check against the site's code | `scripts/checkLocators.ts` | `npm run locators:check` |
| Input sheet check, wait times from the sheet, password from environment | `core/excel/validateInput.ts`, `core/settings.ts` | automatic at start of `npm test` |

## Writing a keyword case
1. Add a row on sheet `Keywords` (TC ID, name, Run = Y).
2. Add rows on `Keyword Steps`: TC ID, Step, Keyword, Object, Data, Expected, Checkpoint (Y = screenshot).
3. Objects come from `objects/*.json`. If a label changes on the site, edit ONE line in the JSON (a name may be a list: `["Submit","OK"]`).
Keywords: Open, SignIn, Click, Fill, Press, Hover, ScrollTo, Wait, WaitVisible, WaitHidden, WaitUrl, VerifyVisible, VerifyHidden, VerifyText, VerifyExactText, VerifyMatch, VerifyCount, VerifyEnabled, VerifyDisabled, VerifyAttribute, VerifyUrl, VerifyPageText, Screenshot, Note, Skip.

## Safety rules built in
- `Fill` refuses password fields; `{{...PASSWORD/TOKEN/SECRET...}}` tokens are refused.
- `Click` refuses objects marked `danger` and anything like Cancel execution, Run Analysis, Submit ticket, Create account, Delete.
- Steps are checked before the case runs; one list of every mistake is shown.

## Credentials: in `.env`, not in the Input workbook
E-mail, password and AWS keys are read from the file `.env` in the project folder (never committed; `.env.example` lists the names).
1. Copy `.env.example` to `.env` (PowerShell: `copy .env.example .env`) and fill in `QA_EMAIL`, `QA_PASSWORD` and the AWS keys. The names `TESTABLE_EMAIL`, `TESTABLE_PASSWORD`, `TESTABLE_EMAIL_DEV`, `TESTABLE_PASSWORD_DEV` are accepted too, so the `.env` of the other project can be reused.
2. Clear the same cells on the Input sheet. A value in `.env` always wins; a credential still typed in the sheet is used only if `.env` has none, and the run prints a warning naming it (never its value).
3. A real environment variable of the same name also works and is not overwritten by `.env`.

### Automatic encryption
Type the real values into `.env` in plain text and save. They are encrypted by the script and shown as `dpapi:...` (Windows: bound to your Windows login, cannot be read on another PC or by another user) or `enc1:...` (other systems: key file outside the project). This happens at the start of every run, or the moment you save if `npm run secrets:watch` is running. During a run the values are decrypted in memory only.
- Safe: each value is decrypted again and compared before the file is changed; if that fails the file is left untouched. Comments and other lines stay.
- `npm run secrets:encrypt` encrypts now; `npm run secrets:check` shows which names can be read on this PC (names only).
- To change a value: type the new plain value over the encrypted line and save.
- If the file comes from another PC the run says which names cannot be read; type them again.
- E-mails and passwords are also removed from the results: passwords become `********`, e-mails become `b***@domain` (results workbook and case texts).

## Locator check
```
git -C "<site clone>" fetch origin
set SITE_CODE_PATH=C:\path\to\ai-testable-platform      (or put it in Input: SITE_CODE_PATH)
npm run locators:check                       (compares with origin/qa)
npm run locators:check -- --since <old ref>  (also reports labels that existed before and are gone now = CHANGED)
```
It only READS the site repository (no pull, no checkout). Report: `results/locator-check_<time>.md`. NOT FOUND is a hint to look, not proof (some texts are built from variables or come from third-party widgets).

## Dynamic object repository (automatic update from the site code)
Before the first case of every `npm test` (and `npm run test:keywords`), when `AUTO_UPDATE_OBJECTS` is not `N`, the script first runs `git fetch origin` in the site clone (`AUTO_FETCH_SITE`, default Y) and then:
1. remembers the commit of the site code it saw last time (`.state/site-commit.json`, not committed);
2. reads git's list of changed lines between that commit and the branch `SITE_CODE_REF`;
3. for every text in `/objects` (button names, labels, placeholders) that is gone from the site, looks for the line it was **replaced** on. If exactly one old line became exactly one new line, the new text is written into the object file;
4. prints what it changed and writes `results/object-updates_<time>.md` with the changed line as proof.

Not changed (listed as "needs a person"): text deleted, one line split into several, text built from variables, a text that is still used elsewhere in the site, regular expressions, a `data-testid` that is gone. If an edit would make the files invalid, it is undone.
Run it by hand: `npm run objects:update -- --dry` (only show), `npm run objects:update` (apply), `--fetch` (git fetch first), `--since <commit>` (compare with a chosen commit).
First run only remembers the commit. Changes then show up in `git diff objects/` so they can be reviewed and committed.

## What already uses the repository
The new keyword cases and the Login module (`modules/login/normal`: login page, forgot password, verification, sign-out confirmation), in `objects/login.json`. Other modules still have their locators in code and are moved one module at a time. In code: `obj(page, 'login.forgotPasswordLink')` (`core/keywords/obj.ts`).

## Parameterization: what lives where

| What | Where | Used as |
|---|---|---|
| Locators of every module (button names, labels, placeholders, test ids) | `objects/<module>.json` (one entry per line) | `locatorOf(page, 'repo.button.confirm')` |
| Locators with a changing part (a menu name, a branch, a run id ...) | `objects/<module>.templates.json`, with `{{0}}`, `{{1}}` in the text | `locatorOf(menu, 'object.link.by-name', name)` |
| Order of the modules, titles, timeouts, on/off, and the list of cases each module runs | `config/modules.json` | read by `modules/flow/journey.spec.ts` |
| Expected texts and patterns the checks compare with | `expected/<module>.json`, `.patterns.json` | `expectedOf('graph.value.draft-only-not-sent')` |
| Expected patterns with a changing part | `expected/<module>.patterns.json` (`{{0}}`) | `expectedOf('object.attr.by-runid-id', id)` |
| Lists of texts a check goes through (header buttons, menu groups, table columns ...) | `expected/<module>.lists.json` | `for (const b of listOf('graph.list.b-sign-out'))` |
| Credentials | `.env` (encrypted automatically) | never in code or Excel |

How a `{{0}}` is filled: the value comes from the call. In a regular expression it is escaped automatically (`{{0}}`); `{{0:raw}}` is put in as it is.

* Change the order, the cases of a module, or switch a module off: edit `config/modules.json` only (the test names, e.g. `-g "1 · Login module"`, come from its `title`). The case ids and the code that runs each case stay in `modules/**`.
* Before every run the site's code is compared with the last run. Renamed texts are changed in `objects/`, in `expected/` (exact texts, plain-word patterns) and in the lists. Entries with `{{ }}` and patterns with symbols are written by people and are never edited automatically.
* What stays in the code on purpose: values that come from the Excel sheet or from the run itself (branch, run id, commit), counts and numbers a check computes, and the code that performs each case.

## Where the settings live (Input sheet vs .env)

* **`.env` (this machine / environment, never committed):** `TEST_ENV` (QA or DEV), `QA_BASE_URL` / `DEV_BASE_URL`, `QA_S3_BUCKET` / `DEV_S3_BUCKET`, `AWS_*`, the accounts (`QA_EMAIL`, `QA_PASSWORD`, ...; encrypted automatically), `SITE_CODE_PATH`, `SITE_CODE_REF`, `AUTO_UPDATE_OBJECTS`, `AUTO_FETCH_SITE`. Any name written in `.env` wins over a cell of the Input sheet with the same name.
* **Input sheet (what changes per run):** `BRANCH_URL` (the link of the branch to run, for example `https://github.com/owner/repo/tree/branch`; the repository and the branch are taken from it), browser switches, waits, `ALLOW_*` switches.
* A link with several branches of the SAME repository (comma or new line) runs the first branch; `npm run test:branches` runs them one after another. The older `REPO` / `BRANCHES` cells still work when `BRANCH_URL` is empty.

## Allure report (what ran, every locator, every screenshot)

`npm test` runs the journey and then builds ONE html file: `results/run_<time>/allure-report/index.html`
(double-click it, or mail it - the screenshots are inside). `npm run report` rebuilds it for the newest run
(`npm run report -- results\run_<time>` for another one). It shows, per module: the cases with PASS / FAIL / SKIPPED,
every check and step, every locator action (`Click · <repository key> — <what it finds>`), the expected result,
the actual result and the screenshot of each case. Passwords, keys and e-mails are replaced by ******** in the text.
