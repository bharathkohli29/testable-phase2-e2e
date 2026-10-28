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
| Offline self test | `selftest/selftest.ts` | `npm run selftest` |

## Writing a keyword case
1. Add a row on sheet `Keywords` (TC ID, name, Run = Y).
2. Add rows on `Keyword Steps`: TC ID, Step, Keyword, Object, Data, Expected, Checkpoint (Y = screenshot).
3. Objects come from `objects/*.json`. If a label changes on the site, edit ONE line in the JSON (a name may be a list: `["Submit","OK"]`).
Keywords: Open, SignIn, Click, Fill, Press, Hover, ScrollTo, Wait, WaitVisible, WaitHidden, WaitUrl, VerifyVisible, VerifyHidden, VerifyText, VerifyExactText, VerifyMatch, VerifyCount, VerifyEnabled, VerifyDisabled, VerifyAttribute, VerifyUrl, VerifyPageText, Screenshot, Note, Skip.

## Safety rules built in
- `Fill` refuses password fields; `{{...PASSWORD/TOKEN/SECRET...}}` tokens are refused.
- `Click` refuses objects marked `danger` and anything like Cancel execution, Run Analysis, Submit ticket, Create account, Delete.
- Steps are checked before the case runs; one list of every mistake is shown.

## Password
Set the environment variable `QA_PASSWORD` (PowerShell: `setx QA_PASSWORD "..."`, then open a new window). It overrides the Input sheet, so the sheet can stay blank.

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
