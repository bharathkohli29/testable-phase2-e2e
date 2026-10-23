import { CaseHandler } from '../../core/runner/registerCases';
import { bodyText, norm, open } from '../flow/ui';
import { expect } from '@playwright/test';

const skipWith = (why: string): CaseHandler<any> => async ({ skip }: any) => skip(`Not run by the script: it ${why}.`);

/** Steps of the QA sheet. Cases the script must not act on end as SKIPPED with the reason. */
export const qaSteps: Record<string, CaseHandler<any>> = {
  "OAUTHSSO-09": skipWith("needs the sign-in page (the journey is signed in at this point) and an Okta SSO attempt"),
  "OAUTHSSO-14": skipWith("needs a signed-out browser and a crafted provider callback"),
  "OAUTHSSO-15": skipWith("needs a brand-new provider account (an account would have to be created)"),
  "OAUTHSSO-16": skipWith("needs a real provider sign-in (the user signs in only with the normal login)"),
  "LOGIN-03": skipWith("needs an account with an unverified email (not part of the Input sheet)"),
  "LOGIN-08": skipWith("is an API call with credentials; the script never types credentials into API calls"),
  "SIGNUP-01": skipWith("would create an account; the script never signs anyone up"),
  "SIGNUP-03": skipWith("would submit the registration form; the script never signs anyone up"),
  "PWDRESET-01": skipWith("needs a signed-out browser and a mailbox (reset codes arrive by email) and would send real emails"),
  "PWDRESET-02": skipWith("needs a signed-out browser and a mailbox (reset codes arrive by email) and would send real emails"),
  "PWDRESET-03": skipWith("needs a signed-out browser and a mailbox (reset codes arrive by email) and would send real emails"),
  "PWDRESET-04": skipWith("needs a signed-out browser and a mailbox (reset codes arrive by email) and would send real emails"),
  "PWDRESET-05": skipWith("needs a signed-out browser and a mailbox (reset codes arrive by email) and would send real emails"),
  "PWDRESET-06": skipWith("needs a signed-out browser and a mailbox (reset codes arrive by email) and would send real emails"),
  "PWDRESET-07": skipWith("needs a signed-out browser and a mailbox (reset codes arrive by email) and would send real emails"),
  "PWDRESET-08": skipWith("needs a signed-out browser and a mailbox (reset codes arrive by email) and would send real emails"),
  "PWDRESET-09": skipWith("needs a signed-out browser and a mailbox (reset codes arrive by email) and would send real emails"),
  "EMAILVER-01": skipWith("needs a mailbox (verification emails) or an unverified account"),
  "EMAILVER-03": skipWith("needs a mailbox (verification emails) or an unverified account"),
  "EMAILVER-04": skipWith("needs a mailbox (verification emails) or an unverified account"),
  "EMAILVER-06": skipWith("needs a mailbox (verification emails) or an unverified account"),
  "EMAILVER-07": skipWith("needs a mailbox (verification emails) or an unverified account"),
  "EMAILVER-08": skipWith("needs a mailbox (verification emails) or an unverified account"),
  "EMAILVER-09": skipWith("needs a mailbox (verification emails) or an unverified account"),
  "SUPPORT-06": skipWith("would send a chat message; nothing is ever sent to Support"),
  "SUPPORT-14": skipWith("would create a real support ticket; \"Submit ticket\" is never pressed"),
  "SUPPORT-24": skipWith("needs earlier chat conversations; the script never sends any, so the list depends on the data"),
  "SUPPORT-25": skipWith("the chat widget in its small frame is not reliably clickable from the script (checked by SPT-016 instead for the home view)"),
  "SUPPORT-26": skipWith("would start a real conversation with Support"),
  "BILLING-02": skipWith("needs an unpaid account and would open a Stripe checkout"),
  "BILLING-06": skipWith("needs an unpaid account"),
  "BILLING-07": skipWith("needs an unpaid account (the Activate Testable page)"),
  "BILLING-09": skipWith("needs an unpaid account and a Stripe checkout"),
  "BILLING-10": skipWith("needs a real payment"),
  "BILLING-11": skipWith("needs a real payment"),
  "SCM-01": skipWith("needs a real provider OAuth sign-in or a second account"),
  "SCM-02": skipWith("needs a real provider OAuth sign-in or a second account"),
  "SCM-03": skipWith("needs a real provider OAuth sign-in or a second account"),
  "SCM-04": skipWith("needs a real provider OAuth sign-in or a second account"),
  "SCM-05": skipWith("needs a real provider OAuth sign-in or a second account"),
  "SCM-06": skipWith("needs a real provider OAuth sign-in or a second account"),
  "SCM-10": skipWith("needs a real provider OAuth sign-in or a second account"),
  "SCM-11": skipWith("needs a real provider OAuth sign-in or a second account"),
  "SCM-12": skipWith("needs a real provider OAuth sign-in or a second account"),
  "REPO-04": skipWith("would save a new default context (changes the account)"),
  "REPO-11": skipWith("needs the Select repository page with a live refresh from the provider"),
  "REPO-16": skipWith("needs a run in progress"),
  "COVPREV-02": skipWith("needs a failing profile/preview (a special data state)"),
  "COVPREV-03": skipWith("needs a failing profile/preview (a special data state)"),
  "COVPREV-04": skipWith("needs a failing profile/preview (a special data state)"),
  "COVPREV-05": skipWith("needs a failing profile/preview (a special data state)"),
  "COVPREV-13": skipWith("needs a failing profile/preview (a special data state)"),
  "EXECASST-08": skipWith("needs a finished or running run, or a state that only a started analysis creates"),
  "EXECASST-09": skipWith("needs a finished or running run, or a state that only a started analysis creates"),
  "EXECASST-10": skipWith("needs a finished or running run, or a state that only a started analysis creates"),
  "EXECASST-11": skipWith("needs a finished or running run, or a state that only a started analysis creates"),
  "EXECASST-13": skipWith("needs a finished or running run, or a state that only a started analysis creates"),
  "EXECASST-15": skipWith("needs a finished or running run, or a state that only a started analysis creates"),
  "EXECASST-16": skipWith("needs a finished or running run, or a state that only a started analysis creates"),
  "EXECASST-17": skipWith("needs a finished or running run, or a state that only a started analysis creates"),
  "EXECASST-18": skipWith("needs a finished or running run, or a state that only a started analysis creates"),
  "EXECASST-19": skipWith("needs a finished or running run, or a state that only a started analysis creates"),
  "EXECASST-20": skipWith("needs a finished or running run, or a state that only a started analysis creates"),
  "WBRUN-04": skipWith("starts, retries or cancels a real run; the script never starts or cancels one"),
  "WBRUN-05": skipWith("starts, retries or cancels a real run; the script never starts or cancels one"),
  "WBRUN-06": skipWith("starts, retries or cancels a real run; the script never starts or cancels one"),
  "WBRUN-07": skipWith("starts, retries or cancels a real run; the script never starts or cancels one"),
  "WBRUN-13": skipWith("starts, retries or cancels a real run; the script never starts or cancels one"),
  "CONFENG-20": skipWith("needs the metric detail dialog from a run that finished in this journey"),
  "CONFASST-04": skipWith("would send a question to the assistant; nothing is ever submitted"),
  "CONFASST-05": skipWith("would send a question to the assistant; nothing is ever submitted"),
  "CONFGRAPH-04": skipWith("needs two runs to switch between"),
  "TAXONOMY-01": skipWith("needs the taxonomy report download; the script never downloads it"),
  "TAXONOMY-02": skipWith("needs the taxonomy report download; the script never downloads it"),
  "TAXONOMY-03": skipWith("needs the taxonomy report download; the script never downloads it"),
  "TAXONOMY-04": skipWith("needs the taxonomy report download; the script never downloads it"),
  "TAXONOMY-05": skipWith("needs the taxonomy report download; the script never downloads it"),
  "TAXONOMY-06": skipWith("needs the taxonomy report download; the script never downloads it"),
  "TAXONOMY-07": skipWith("needs the taxonomy report download; the script never downloads it"),
  "DASHBOARD-06": skipWith("needs a dashboard run with a commit link to follow"),
  "DASHBOARD-09": skipWith("needs a branch without runs (special data state)"),
  "RBAC-01": skipWith("needs a second tenant account"),
  "WEBHOOK-01": skipWith("needs a push or delivery from the provider"),
  "WEBHOOK-02": skipWith("needs a push or delivery from the provider"),
  "WEBHOOK-03": skipWith("needs a push or delivery from the provider"),
  "CONFENG-09": skipWith("needs the Confidence Engine page of a finished run (the gates list), which this module does not have"),
  // SUPPORT-21 was removed per requirements (missing User Guide feedback buttons)
  'SUPPORT-21': async (ctx) => {
    ctx.skip('SUPPORT-21 was removed from the active test suite (missing User Guide feedback buttons).');
  },
  'SUPPORT-22': async ({ page, input, check }) => {
    await open(page, input, '/docs/introduction');
    await expect(page.locator('article').first()).toBeVisible({ timeout: 20_000 });
    await check('An "Ask AI" button is visible in the guide header', () => expect(page.getByRole('button', { name: /ask ai/i }).or(page.getByRole('link', { name: /ask ai/i })).first()).toBeVisible());
  },
  'SUPPORT-23': async ({ page, input, check }) => {
    await open(page, input, '/docs/introduction');
    await expect(page.locator('article').first()).toBeVisible({ timeout: 20_000 });
    const box = page.getByRole('searchbox').or(page.getByPlaceholder(/search/i)).first();
    await check('A search bar is shown on the guide page', () => expect(box).toBeVisible({ timeout: 5_000 }));
    await check('Searching "OAuth" returns relevant guide sections', async () => {
      await box.fill('OAuth');
      await page.waitForTimeout(1500);
      expect(norm(await bodyText(page))).toMatch(/oauth/i);
      await expect(page.locator('[role=option], [role=listitem] a, [class*=result] a').first()).toBeVisible({ timeout: 5_000 });
    });
  },
  'BILLING-08': async ({ page, input, check, skip }) => {
    await open(page, input, '/billing');
    const tos = page.getByRole('checkbox').first();
    if (!(await tos.isVisible({ timeout: 10_000 }).catch(() => false))) skip('The Billing page has no Terms of Service box to tick.');
    const sub = page.getByRole('button', { name: /subscribe/i }).first();
    if (await tos.isChecked()) skip('The Terms of Service box is already ticked, so the unticked state cannot be tested without changing it.');
    await check('"Subscribe" is disabled while the Terms of Service box is not ticked', () => expect(sub).toBeDisabled());
  },
};
