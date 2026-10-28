import { expect, Page } from '@playwright/test';
import { CaseHandler } from '../../core/runner/registerCases';
import { inputs } from '../flow/helpers';
import { RepoPage, has } from '../repo/shared/RepoPage';
import { bodyText, escRe, norm } from '../flow/ui';
import { obj as locatorOf } from '../../core/keywords/obj';

import { expected as expectedOf } from '../../core/keywords/expected';
/**
 * The repository context of the Execution Assistant once the Run plan is open: the "Repository ready" bar, the "Details" panel
 * (Source details) and "Repository history". Verified live on QA (15 Oct). Panels are only opened and closed.
 */
const repoName = (full: string): string => full.trim().replace(/\.git$/i, '').split('/').pop() ?? '';
const bar = (page: Page) => locatorOf(page, 'context.text.repository-ready').first();
const detailsBtn = (page: Page) => locatorOf(page, 'context.button.details').first();
const panel = (page: Page, title: RegExp) => locatorOf(page, 'context.dialog.item').filter({ hasText: title }).first();

async function closePanel(page: Page, title: RegExp): Promise<void> {
  const p = panel(page, title);
  if (!(await p.isVisible().catch(() => false))) return;
  await page.keyboard.press('Escape').catch(() => undefined);
  if (await p.isVisible().catch(() => false)) await locatorOf(p, 'context.css.button').first().click().catch(() => undefined);
  await p.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => undefined);
}

/** "Repository ready · <repo> · <branch> · <sha> · <availability>" as read from the bar. */
async function readBar(page: Page): Promise<{ text: string; repo: string; branch: string; sha: string }> {
  const t = norm(await locatorOf(bar(page), 'context.css.xpath-ancestor-contains-1').innerText().catch(() => ''));
  const parts = t.split('·').map((x) => x.trim());
  return { text: t, repo: parts[1] ?? '', branch: parts[2] ?? '', sha: parts[3] ?? '' };
}

export const contextSteps: Record<string, CaseHandler<RepoPage>> = {
  'CTX-001': async (ctx) => {
    const { page, check, note, snap } = ctx;
    const { repo, branch } = inputs(ctx, { repo: true, branches: 1 });
    await expect(bar(page), 'the "Repository ready" bar is not on the page').toBeVisible({ timeout: 20_000 });
    const b = await readBar(page);
    note(`Bar reads: ${b.text}`);
    await check('The bar says "Repository ready"', () => expect(bar(page)).toBeVisible());
    await check(`It names the repository "${repoName(repo)}"`, () => expect(b.repo).toMatch(has(repoName(repo))));
    await check(`It names the branch "${branch}"`, () => expect(b.branch).toMatch(has(branch)));
    await check('It shows a commit id (7 characters or more)', () => expect(b.sha).toMatch(/^[0-9a-f]{7,40}$/i));
    await check('It says whether the source is available (for example "Source already available")', () => expect(b.text).toMatch(/source/i));
    await check('A "Details" button is next to it', () => expect(detailsBtn(page)).toBeVisible());
    await snap('Repository ready bar', bar(page));
  },

  'CTX-002': async (ctx) => {
    const { page, check, note, snap } = ctx;
    const { repo, branch } = inputs(ctx, { repo: true, branches: 1 });
    const b = await readBar(page);
    await detailsBtn(page).click();
    const p = panel(page, /source details/i);
    await check('"Details" opens the panel "Source details"', () => expect(p).toBeVisible());
    const t = norm(await p.innerText().catch(() => ''));
    note(`Source details: ${t}`);
    const val = (label: string): string => {
      if (/^availability$/i.test(label)) {
        return t.match(/availability\s+(.+?)(?=\s+(?:elapsed|status|technical details)\b|$)/i)?.[1]?.trim() ?? '';
      }
      return t.match(new RegExp(`${label}\\s+(.+?)(?=\\s+(?:Repository|Branch|Commit|Availability|Elapsed|Status|Technical details)\\b|$)`, 'i'))?.[1]?.trim() ?? '';
    };
    await check(`Repository is "${repoName(repo)}"`, () => expect(val('Repository')).toMatch(has(repoName(repo))));
    await check(`Branch is "${b.branch || branch}"`, () => expect(val('Branch')).toMatch(has(b.branch || branch)));
    await check('Commit is the same as on the bar', () => expect(val('Commit').toLowerCase()).toContain(b.sha.slice(0, 7).toLowerCase()));
    await check('Availability says the repository and the branch are "Available"', () => expect(val('Availability')).toMatch(/repository:\s*available.*branch:\s*available/i));
    await check('"Elapsed" shows a time (for example 1s or 00:00)', () => expect(val('Elapsed')).toMatch(/\d{1,2}:\d{2}|\d+\s*(s|sec|m|min|h)\b/i)); // the site writes it as "1s" (or 00:00)
    await check('"Status" is "Repository ready"', () => expect(val('Status')).toMatch(/repository ready/i));
    await check('"Technical details" is offered', () => expect(locatorOf(p, 'context.text.technical-details').first()).toBeVisible());
    await snap('Source details panel', p);
    await closePanel(page, /source details/i);
    await check('The panel can be closed', () => expect(p).toBeHidden());
  },

  'CTX-003': async (ctx) => {
    const { page, check, note, snap } = ctx;
    const { repo, branch } = inputs(ctx, { repo: true, branches: 1 });
    const b = await readBar(page);
    const activeBranch = b.branch || branch;
    await locatorOf(page, 'context.button.repository-history').first().click();
    const p = panel(page, /repository history/i);
    await check('"Repository history" opens a panel', () => expect(p).toBeVisible());
    await check('It says "Configuration changes for this tenant. Historical execution evidence is not moved."', () =>
      expect(p).toContainText(expectedOf('context.text.configuration-changes-for-this-tenant')));
    // Wait for the asynchronous history entries to load into the panel
    await locatorOf(p, 'context.css.text-1-2-1-2-4-text-current-i-text-c').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
    const t = norm(await p.innerText().catch(() => ''));
    note(`History panel: ${t.slice(0, 300)}`);
    await check(`The newest entry is the chosen repository "${repo}" / branch "${activeBranch}"`, () => {
      // each entry starts with its date, e.g. "10/23/2026, 2:08:00 PM"; the first one is the newest
      const entry = (t.match(/\d{1,2}\/\d{1,2}\/\d{4},?\s*\d{1,2}:\d{2}[\s\S]*?(?=\d{1,2}\/\d{1,2}\/\d{4},?\s*\d{1,2}:\d{2}|$)/) ?? [''])[0];
      expect(entry, 'no history entry with a date was found').not.toBe('');
      expect(entry).toMatch(new RegExp(escRe(repoName(repo)), 'i'));
      if (activeBranch) {
        expect(entry).toMatch(new RegExp(escRe(activeBranch), 'i'));
      }
    });
    await check('That entry is labelled "Current"', () => expect(locatorOf(p, 'context.text.current').first()).toBeVisible());
    await check('The entry says "From ..." and "Changed by <email>"', () => {
      expect(t).toMatch(/\bfrom\b/i);
      expect(t).toMatch(/changed by\s+[^\s@]+@[^\s@]+/i);
    });
    await snap('Repository history', p);
    await closePanel(page, /repository history/i);
    await check('The panel can be closed', () => expect(p).toBeHidden());
    void bodyText;
  },
};
