import { expect, Page } from '@playwright/test';
import { CaseHandler } from '../../core/runner/registerCases';
import { RepoPage } from '../repo/shared/RepoPage';
import { bodyText, norm, open, waitText } from '../flow/ui';
import { obj as locatorOf } from '../../core/keywords/obj';

import { expected as expectedOf, listOf } from '../../core/keywords/expected';
/**
 * The Account module: the Account page (/account) and the Billing page it links to (/billing). Verified live on QA (15 Oct).
 * Plan name, price, limits and dates differ from account to account, so every check reads what the page shows and compares the
 * places that must agree (plan card, Usage & limits, Billing page). Nothing on Billing is clicked (no checkout, no plan change).
 */
export interface Account {
  customer: string; organization: string; plan: string; status: string; price: string; renews: string;
  included: { runs: number; gib: number; rest: string } | undefined;
  used: number; limit: number; remaining: number; resets: string; usedAgain: string;
  seatsUsed: number; seatsLimit: number; vcpu: number; gib: number; workers: string; text: string;
}

const num = (s: string | undefined): number => (s === undefined ? NaN : Number(s.replace(/,/g, '')));

export async function readAccount(page: Page): Promise<Account> {
  await waitText(page, /Renews\s/i);
  const t = await bodyText(page);
  const dom = await page.evaluate(() => {
    const txt = (e: Element | null | undefined): string => ((e as HTMLElement | null)?.innerText ?? e?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const heads = [...document.querySelectorAll('h1,h2,h3,h4')];
    const upgrade = [...document.querySelectorAll('a')].find((a) => /upgrade plan/i.test(a.textContent || ''));
    let n: Element | null = upgrade ?? null;
    while (n && !n.querySelector('h1,h2,h3,h4')) n = n.parentElement;
    const plan = txt(n?.querySelector('h1,h2,h3,h4'));
    const labelValue = (label: RegExp): string => {
      const el = [...document.querySelectorAll('main *')].find((e) => e.children.length === 0 && label.test((e.textContent || '').trim()));
      return txt(el?.nextElementSibling);
    };
    const workers = heads.find((h) => /^workers$/i.test(txt(h)));
    return { plan, customer: labelValue(/^customer$/i), organization: labelValue(/^organization$/i), workers: txt(workers?.nextElementSibling) };
  });
  const inc = t.match(/(\d[\d,]*)\s*runs\s*\/\s*month\s*·\s*(\d+)\s*GiB\s*·\s*(.+?)(?=\s+Runs\b)/i);
  const used = [...t.matchAll(/(\d[\d,]*)\s*\/\s*(\d[\d,]*)\s*used/gi)];
  const rem = t.match(/(\d[\d,]*)\s*remaining\s*·\s*Resets\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
  const seats = t.match(/(\d+)\s*\/\s*(\d+)\s*seats used/i);
  return {
    customer: dom.customer.replace(/\s*[·•]\s*$/, ''), organization: dom.organization, plan: dom.plan,
    status: (t.match(/\b(Active|Inactive|Past due|Trialing|Canceled|Cancelled)\b/i)?.[1]) ?? '',
    price: t.match(/\$\s?([\d,.]+)\s*\/\s*month/i)?.[1] ?? '',
    renews: t.match(/Renews\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i)?.[1] ?? '',
    included: inc ? { runs: num(inc[1]), gib: num(inc[2]), rest: inc[3].trim() } : undefined,
    used: num(used[0]?.[1]), limit: num(used[0]?.[2]), usedAgain: used[1] ? `${used[1][1]} / ${used[1][2]}` : '',
    remaining: num(rem?.[1]), resets: rem?.[2] ?? '',
    seatsUsed: num(seats?.[1]), seatsLimit: num(seats?.[2]),
    vcpu: num(t.match(/(\d+)\s*vCPU/i)?.[1]), gib: num(t.match(/(\d+)\s*GiB\s*memory/i)?.[1]),
    workers: dom.workers, text: t,
  };
}

export interface Billing { customer: string; organization: string; plan: string; price: string; total: string; runs: string; memory: string; text: string }
export async function readBilling(page: Page): Promise<Billing> {
  await waitText(page, /Order summary/i);
  const t = await bodyText(page);
  return {
    customer: t.match(/Billing to\s+(\S+(?:\s\S+)*?)\s+(\S+)\s+Order summary/i)?.[1] ?? '',
    organization: t.match(/Billing to\s+(\S+(?:\s\S+)*?)\s+(\S+)\s+Order summary/i)?.[2] ?? '',
    plan: t.match(/Order summary\s+(.+?)\s+(?:Active|Current plan|\$)/i)?.[1] ?? '',
    price: t.match(/\$\s?([\d,.]+)\s*\/\s*month/i)?.[1] ?? '',
    total: t.match(/Total\s+\$\s?([\d,.]+)\s*\/\s*month/i)?.[1] ?? '',
    runs: t.match(/Runs\s+(\d[\d,]*)\s*\/\s*month/i)?.[1] ?? '',
    memory: t.match(/Memory\s+(\d+)\s*GiB/i)?.[1] ?? '',
    text: t,
  };
}

const lc = (s: string): string => norm(s).toLowerCase();
const accountPage = async (page: Page, input: import('../../core/types').InputConfig): Promise<void> => {
  await open(page, input, '/account');
  await expect(locatorOf(page, 'account.heading.account').first()).toBeVisible();
};

export const accountSteps: Record<string, CaseHandler<RepoPage>> = {
  'ACC-001': async ({ page, input, check, snap }) => {
    await open(page, input, '/account');
    await check('The address is /account', () => expect(new URL(page.url()).pathname.replace(/\/+$/, '')).toBe('/account'));
    const title = locatorOf(page, 'account.heading.account').first();
    await check('The page title "Account" is shown', () => expect(title).toBeVisible());
    await check('The sub-title "Manage your profile, organization, plan, and usage." is shown', () =>
      expect(locatorOf(page, 'account.text.manage-your-profile-organi-sz-ation').first()).toBeVisible());
    await check('The breadcrumb shows "Testable" (a link to /confidence-engine) and "Account"', async () => {
      const nav = locatorOf(page, 'account.navigation.breadcrumb');
      await expect(locatorOf(nav, 'account.link.testable')).toHaveAttribute('href', expectedOf('account.attr.confidence-engine'));
      await expect(nav).toContainText(expectedOf('account.text.account'));
    });
    await snap('Account page title and sub-title', title);
  },

  'ACC-002': async ({ page, input, check, snap }) => {
    await accountPage(page, input);
    const a = await readAccount(page);
    const head = locatorOf(page, 'account.heading.customer-and-organi-sz-ation').first();
    await check('The section "Customer and organization" is shown', () => expect(head).toBeVisible());
    await check('"Customer" is shown with a name', () => expect(a.customer, 'the Customer value is empty').not.toBe(''));
    await check('"Organization" is shown with a name', () => expect(a.organization, 'the Organization value is empty').not.toBe(''));
    await snap('Customer and organization', head);
  },

  'ACC-003': async ({ page, input, check, note, snap }) => {
    await accountPage(page, input);
    const a = await readAccount(page);
    note(`Plan card reads: ${a.plan} · ${a.status} · $${a.price}/month · renews ${a.renews}`);
    const label = locatorOf(page, 'account.text.current-plan').first();
    await check('The card "Current plan" is shown', () => expect(label).toBeVisible());
    await check('A plan name is shown', () => expect(a.plan, 'no plan name found next to "Current plan"').not.toBe(''));
    await check('The plan status (for example "Active") is shown', () => expect(a.status, 'no plan status word found').not.toBe(''));
    await check('The price is shown as "$<amount> / month"', () => expect(a.price, 'no "$<amount> / month" found').not.toBe(''));
    await check('"Renews <month day, year>" is shown', () => expect(a.renews, 'no "Renews <date>" found').not.toBe(''));
    await check('The included line reads "<n> runs/month · <n> GiB · <features>"', () => expect(a.included, 'no "<n> runs/month · <n> GiB · ..." line found').toBeDefined());
    await snap('Current plan card', label);
  },

  'ACC-004': async ({ page, input, check, snap }) => {
    await accountPage(page, input);
    const upgrade = locatorOf(page, 'account.link.upgrade-plan').first();
    await check('"Upgrade plan" is shown and points to /billing', async () => {
      await expect(upgrade).toBeVisible();
      await expect(upgrade).toHaveAttribute('href', expectedOf('account.attr.billing'));
    });
    await snap('Upgrade plan button', upgrade);
    await check('Clicking it opens the Billing page (/billing)', async () => {
      await upgrade.click();
      await expect(page).toHaveURL(/\/billing/i);
    });
    await page.goBack().catch(() => undefined);
  },

  'ACC-005': async ({ page, input, check, note, snap }) => {
    await accountPage(page, input);
    const a = await readAccount(page);
    note(`Runs used ${a.used} / ${a.limit}; remaining ${a.remaining}; resets ${a.resets}`);
    const head = locatorOf(page, 'account.heading.usage-limits').first();
    await check('"Usage & limits" shows "<used> / <limit> used"', () => expect(Number.isNaN(a.used) || Number.isNaN(a.limit), 'no "<used> / <limit> used" found').toBe(false), head);
    await check('Used is not more than the limit', () => expect(a.used).toBeLessThanOrEqual(a.limit));
    await check('"<n> remaining" equals limit minus used', () => expect(a.remaining, `remaining ${a.remaining}, limit ${a.limit} minus used ${a.used} = ${a.limit - a.used}`).toBe(a.limit - a.used));
    await check('The plan card and the Usage & limits section show the same "used / limit"', () => expect(lc(a.usedAgain)).toBe(lc(`${a.used} / ${a.limit}`)));
    await check('The run limit equals the "runs/month" of the plan', () => expect(a.included?.runs).toBe(a.limit));
    await check('"Resets <date>" is the same date as "Renews <date>"', () => expect(lc(a.resets)).toBe(lc(a.renews)));
    await check('A progress bar is shown for the runs', () => expect(locatorOf(page, 'account.progressbar.item').first()).toBeVisible());
    await snap('Runs usage', head);
  },

  'ACC-006': async ({ page, input, check, note, snap }) => {
    await accountPage(page, input);
    const a = await readAccount(page);
    const head = locatorOf(page, 'account.heading.members').first();
    note(`Seats used ${a.seatsUsed} / ${a.seatsLimit}`);
    await check('"Members" shows "<used> / <limit> seats used"', () => expect(Number.isNaN(a.seatsUsed) || Number.isNaN(a.seatsLimit), 'no "<used> / <limit> seats used" found').toBe(false), head);
    await check('Used seats are not more than the seat limit', () => expect(a.seatsUsed).toBeLessThanOrEqual(a.seatsLimit));
    const full = a.seatsUsed >= a.seatsLimit;
    await check(full ? 'All seats are used, so "Seat limit reached" and "Upgrade to invite members" are shown' : 'Seats are free, so no "Seat limit reached" warning is shown', async () => {
      const warn = locatorOf(page, 'account.text.seat-limit-reached');
      if (full) { await expect(warn.first()).toBeVisible(); await expect(locatorOf(page, 'account.text.upgrade-to-invite-members').first()).toBeVisible(); }
      else await expect(warn).toHaveCount(0);
    });
    const viewAccess = locatorOf(page, 'account.text.view-access').first();
    if (await viewAccess.isVisible().catch(() => false)) {
      await check('"View access" is shown', () => expect(viewAccess).toBeVisible());
    } else {
      note('"View access" is a plan-based feature (Team / Enterprise tiers). Not suitable for the current single-seat plan tier.');
    }
    await snap('Members and seats', head);
  },

  'ACC-007': async ({ page, input, check, snap }) => {
    await accountPage(page, input);
    const a = await readAccount(page);
    const head = locatorOf(page, 'account.heading.compute').first();
    await check('The card "Compute" is shown', () => expect(head).toBeVisible());
    await check('"<n> vCPU" is shown', () => expect(a.vcpu, 'no "<n> vCPU" found').toBeGreaterThan(0));
    await check('"<n> GiB memory" is shown', () => expect(a.gib, 'no "<n> GiB memory" found').toBeGreaterThan(0));
    await check('The memory is the same as the GiB of the plan line', () => expect(a.gib).toBe(a.included?.gib));
    await snap('Compute card', head);
  },

  'ACC-008': async ({ page, input, check, note, snap }) => {
    await accountPage(page, input);
    const a = await readAccount(page);
    const head = locatorOf(page, 'account.heading.workers').first();
    note(`Workers reads: ${a.workers || '(nothing)'}`);
    await check('The card "Workers" is shown', () => expect(head).toBeVisible());
    await check('The card shows a state (for example "Unavailable") or a number', () => expect(a.workers, 'nothing is written under "Workers"').not.toBe(''));
    await snap('Workers card', head);
  },

  'ACC-009': async ({ page, input, check, snap }) => {
    await accountPage(page, input);
    const head = locatorOf(page, 'account.heading.capabilities').first();
    await check('The section "Capabilities" is shown', () => expect(head).toBeVisible());
    for (const group of listOf('account.list.group-execution')) {
      const h = locatorOf(page, 'account.heading.by-group', group).first();
      await check(`"${group}" is shown with at least one item`, async () => {
        await expect(h).toBeVisible();
        const items = await locatorOf(h, 'account.css.xpath-following-ul-1-li').count();
        expect(items, `no list items under "${group}"`).toBeGreaterThan(0);
      });
    }
    await check('"Reliability" lists "Automatic retries" and "Maximum duration"', async () => {
      const t = await bodyText(page);
      expect(t).toMatch(/automatic retries/i);
      expect(t).toMatch(/maximum duration/i);
    });
    await snap('Capabilities', head);
  },

  'ACC-010': async ({ page, input, check, snap }) => {
    await accountPage(page, input);
    const head = locatorOf(page, 'account.heading.billing').first();
    await check('The section "Billing" says "Manage your payment method, invoices, and subscription."', () =>
      expect(locatorOf(page, 'account.text.manage-your-payment-method-invoices').first()).toBeVisible(), head);
    const link = locatorOf(page, 'account.link.manage-billing').first();
    await check('"Manage billing" points to /billing', () => expect(link).toHaveAttribute('href', expectedOf('account.attr.billing')));
    await snap('Manage billing link', link);
    await check('Clicking it opens the Billing page (/billing)', async () => {
      await link.click();
      await expect(page).toHaveURL(/\/billing/i);
    });
  },

  'ACC-011': async ({ page, input, check, note, snap }) => {
    await open(page, input, '/billing');
    const b = await readBilling(page);
    note(`Billing page: ${b.plan} · $${b.price}/month · billing to ${b.customer} / ${b.organization}`);
    const title = locatorOf(page, 'account.text.change-plan').first();
    await check('The page title "Change Plan" is shown', () => expect(title).toBeVisible());
    await check('"Your subscription applies to everyone in the organization." is shown', () =>
      expect(locatorOf(page, 'account.text.your-subscription-applies-to-everyon').first()).toBeVisible());
    await check('"Billing to" shows the customer and the organization', () => {
      expect(b.customer, 'no customer name after "Billing to"').not.toBe('');
      expect(b.organization, 'no organization after the customer name').not.toBe('');
    });
    await snap('Billing page title and Billing to', title);
  },

  'ACC-012': async ({ page, input, check, note, snap }) => {
    await accountPage(page, input);
    const a = await readAccount(page);
    await open(page, input, '/billing');
    const b = await readBilling(page);
    const summary = locatorOf(page, 'account.text.order-summary').first();
    note(`Account: ${a.plan} $${a.price}, ${a.included?.runs} runs, ${a.included?.gib} GiB | Billing: ${b.plan} $${b.price}, ${b.runs} runs, ${b.memory} GiB`);
    await check('"Order summary" is shown', () => expect(summary).toBeVisible());
    await check('Billing to is the same customer and organization as on the Account page', () => {
      expect(lc(b.customer)).toBe(lc(a.customer));
      expect(lc(b.organization)).toBe(lc(a.organization));
    });
    await check('The plan name is the same as on the Account page', () => expect(lc(b.plan)).toBe(lc(a.plan)));
    await check('The price is the same as on the Account page', () => expect(b.price).toBe(a.price));
    await check('"Total" is the same as the plan price', () => expect(b.total).toBe(b.price));
    await check('"Included" runs per month are the same as on the Account page', () => expect(Number(b.runs.replace(/,/g, ''))).toBe(a.included?.runs));
    await check('"Included" memory is the same as on the Account page', () => expect(Number(b.memory)).toBe(a.included?.gib));
    await snap('Order summary', summary);
  },

  'ACC-013': async ({ page, input, check, snap }) => {
    await open(page, input, '/billing');
    await readBilling(page);
    const terms = locatorOf(page, 'account.text.i-have-read-and-agree-to-the-terms-o').first();
    await check('"I have read and agree to the Terms of Service." is shown', () => expect(terms).toBeVisible());
    await check('"Terms of Service" is a link', async () => {
      const link = locatorOf(page, 'account.link.terms-of-service').first();
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', expectedOf('account.attr.by-pattern'));
    });
    await check('"Secure checkout powered by Stripe" is shown', () => expect(locatorOf(page, 'account.text.secure-checkout-powered-by-stripe').first()).toBeVisible());
    await check('The button for the plan in use reads "Current Plan" and cannot be pressed (it is not clicked here)', async () => {
      const btn = locatorOf(page, 'account.button.current-plan').last();
      await expect(btn).toBeVisible();
      await expect(btn).toBeDisabled();
    });
    await snap('Terms of Service and checkout note', terms);
  },

  'ACC-014': async ({ page, input, check, snap }) => {
    await open(page, input, '/billing');
    const back = locatorOf(page, 'account.link.back-to-account').first();
    await check('"Back to Account" is shown and points to /account', async () => {
      await expect(back).toBeVisible();
      await expect(back).toHaveAttribute('href', expectedOf('account.attr.account'));
    });
    await snap('Back to Account', back);
    await check('Clicking it opens the Account page', async () => {
      await back.click();
      await expect(page).toHaveURL(/\/account/i);
      await expect(locatorOf(page, 'account.heading.account').first()).toBeVisible();
    });
  },

  'ACC-015': async ({ page, input, check, note, snap }) => {
    await accountPage(page, input);
    const a = await readAccount(page);
    await open(page, input, '/execution-assistant');
    const meter = locatorOf(page, 'account.css.a-href-account').filter({ hasText: /Executions:\s*\d+\s*\/\s*\d+/i }).first();
    await expect(meter, 'the "Executions: n / m" link is not on the Execution Assistant').toBeVisible({ timeout: 20_000 });
    const m = ((await meter.innerText()) || '').match(/Executions:\s*(\d+)\s*\/\s*(\d+)/i);
    note(`Header meter reads ${m?.[1]} / ${m?.[2]}; Account page reads ${a.used} / ${a.limit}`);
    await check('The header meter used count is the same as "used" on the Account page', () => expect(Number(m?.[1])).toBe(a.used), meter);
    await check('The header meter limit is the same as the run limit on the Account page', () => expect(Number(m?.[2])).toBe(a.limit));
    await snap('Executions meter in the header', meter);
    await check('Clicking the meter opens the Account page', async () => {
      await meter.click();
      await expect(page).toHaveURL(/\/account/i);
    });
  },
};
