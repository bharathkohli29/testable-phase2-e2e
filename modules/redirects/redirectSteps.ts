import { expect, Page } from '@playwright/test';
import { apiGet, tenantOf } from '../../core/pages/runApi';
import { CaseHandler } from '../../core/runner/registerCases';
import { RepoPage } from '../repo/shared/RepoPage';
import { bodyText, norm, open, UUID0 } from '../flow/ui';

/**
 * The Redirects module: pages that do not exist, old addresses, the SCM integrations page, the left menu and the "run id of someone
 * else" protection. Verified live on QA (15 Oct). Nothing is changed or started; "Connect Provider" is only looked at, never pressed.
 */
const rand = (): string => Math.random().toString(36).slice(2, 10);

async function expect404(page: Page, input: import('../../core/types').InputConfig, path: string, check: (d: string, f: () => unknown | Promise<unknown>) => Promise<void>): Promise<void> {
  const res = await page.goto(`${input.baseUrl}${path}`);
  await page.waitForLoadState('domcontentloaded');
  await check(`${path} answers with the 404 status`, () => expect(res?.status()).toBe(404));
  await check('The page says "404" and "This page could not be found."', async () => {
    await expect(page.getByText(/this page could not be found/i).first()).toBeVisible();
    expect(await bodyText(page)).toMatch(/\b404\b/);
  });
  await check('No application data (scores, runs) is shown on the 404 page', async () => expect(await bodyText(page)).not.toMatch(/confidence score|runs dashboard/i));
}

export const redirectSteps: Record<string, CaseHandler<RepoPage>> = {
  'RED-001': async ({ page, input, check, snap }) => {
    await expect404(page, input, `/this-page-does-not-exist-${rand()}`, check);
    await snap('404 page for an unknown address', page.getByText(/this page could not be found/i).first());
  },
  'RED-002': async ({ page, input, check, snap }) => {
    await expect404(page, input, '/admin', check);
    await snap('404 page for /admin', page.getByText(/this page could not be found/i).first());
  },
  'RED-003': async ({ page, input, check, snap }) => {
    await expect404(page, input, '/scm/connect', check);
    await snap('404 page for the old /scm/connect address', page.getByText(/this page could not be found/i).first());
  },
  'RED-004': async ({ page, input, check, note, snap }) => {
    await page.goto(`${input.baseUrl}/repos/select`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForURL((u) => !/\/repos\/select/i.test(u.pathname), { timeout: 15_000 }).catch(() => undefined);
    note(`The old address /repos/select ended on ${new URL(page.url()).pathname}`);
    await check('The old address /repos/select sends the user to the Execution Assistant (/execution-assistant)', () => expect(new URL(page.url()).pathname).toMatch(/\/execution-assistant/i));
    await check('The user is still signed in (the Sign out button is shown)', () => expect(page.getByRole('button', { name: 'Sign out', exact: true }).first()).toBeVisible());
    await snap('Execution Assistant after the old address', page.getByRole('button', { name: 'Sign out', exact: true }).first());
  },
  'RED-005': async ({ page, input, check, note, snap }) => {
    await open(page, input, '/scm-integrations');
    const title = page.getByText(/^\s*scm integrations\s*$/i).first();
    await expect(title).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(2_000);
    const t = await bodyText(page);
    note(`Page text: ${t.slice(0, 200)}`);
    await check('The page title "SCM Integrations" and "Manage your connected source control providers" are shown', async () => {
      await expect(title).toBeVisible();
      await expect(page.getByText(/manage your connected source control providers/i).first()).toBeVisible();
    });
    await check('A "Connect Provider" button is shown (it is not pressed: it starts a sign-in with GitHub / GitLab / ...)', () => expect(page.getByRole('button', { name: /connect provider/i }).first()).toBeVisible());
    await check('The page lists the connected providers instead of an error', async () => {
      const err = page.getByText(/no organi[sz]ation specified|something went wrong|failed to load/i).first();
      expect(await err.isVisible().catch(() => false), `the page shows an error instead of the connections: "${norm(await err.innerText().catch(() => ''))}"`).toBe(false);
    }, page.getByText(/no organi[sz]ation specified/i).first());
    await snap('SCM integrations page', title);
  },
  'RED-006': async ({ page, input, check, snap }) => {
    await open(page, input, '/scm-integrations');
    const back = page.getByRole('button', { name: /back to home/i }).first();
    await expect(back).toBeVisible({ timeout: 20_000 });
    await snap('Back to Home button', back);
    await check('"Back to Home" opens the Execution Assistant', async () => {
      await back.click();
      await expect(page).toHaveURL(/\/execution-assistant/i);
    });
  },
  'RED-007': async ({ page, input, check, snap }) => {
    await open(page, input, '/execution-assistant');
    const menu = page.getByRole('navigation', { name: /workspace/i }).first();
    await expect(menu).toBeVisible({ timeout: 20_000 });
    const items: Array<[string, RegExp]> = [['Dashboard', /\/dashboard/], ['Confidence Engine', /\/confidence-engine/], ['Execution Assistant', /\/execution-assistant/], ['Account and Plan', /\/account/]];
    await snap('Left menu', menu);
    for (const [name, path] of items) {
      await check(`The left menu item "${name}" opens ${path.source.replace(/\\/g, '')}`, async () => {
        await menu.getByRole('link', { name: new RegExp(`^\\s*${name}\\s*$`, 'i') }).click();
        await expect(page).toHaveURL(path);
        await expect(page.getByRole('button', { name: 'Sign out', exact: true }).first()).toBeVisible();
      });
    }
    await open(page, input, '/execution-assistant');
  },
  'RED-008': async ({ page, input, check, note, snap }) => {
    await open(page, input, '/execution-assistant');
    const tenant = await tenantOf(page);
    const mine = tenant ? `?tenant_id=${tenant}` : '';
    const a = await apiGet(page, `/views-api/v1/runs/${UUID0}/summary${mine}`);
    const b = await apiGet(page, `/runtime-api/v1/runs/${UUID0}`);
    note(`views-api summary of an unknown run id: HTTP ${a.status}; runtime-api run: HTTP ${b.status}`);
    await check('Asking for the summary of a run id this organization does not own is refused (HTTP 403 or 404)', () => expect([403, 404], `the answer was HTTP ${a.status}`).toContain(a.status));
    await check('No run data is returned for it (no scores, no tasks)', () => expect(JSON.stringify(a.json ?? {})).not.toMatch(/overall_score|completed_tasks|"tasks"/i));
    await check('Asking for the run itself by that id is refused (HTTP 403 or 404)', () => expect([403, 404], `the answer was HTTP ${b.status}`).toContain(b.status));
    await check('The refusal names a not-found error and not a server error', () => expect(a.status).toBeLessThan(500));
    await snap('Execution Assistant (the refused calls were made from this page)', page.getByRole('button', { name: 'Sign out', exact: true }).first());
  },
};
