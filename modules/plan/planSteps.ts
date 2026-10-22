import { expect, Locator, Page } from '@playwright/test';
import { CaseHandler } from '../../core/runner/registerCases';
import { inputs } from '../flow/helpers';
import { RepoPage, ci, esc, has } from '../repo/shared/RepoPage';

/**
 * Last step of the journey: the Run plan that opens after "Continue" on "Review branches" (header "Confirm whitebox plan").
 * "Execute run" starts the real pipeline, so it is never clicked. Everything is checked through locators, not screenshots.
 */
const AXES: Array<[string, string]> = [
  ['Static & structural signals', 'Repo graph, language fingerprints, and static findings rolled into whitebox classifications.'],
  ['Security testing types', 'Secrets, dependencies, containers, IAM-style checks - gated under security-related taxonomy rows.'],
  ['Performance & reliability', 'Soak, spike, regression and runtime-oriented metrics where applicable to your stack.'],
  ['Compliance & policy', 'Policy and audit-style controls mapped to compliance classifications when configured.'],
  ['Taxonomy rollup & score', 'Task completion -> taxonomy gate -> whitebox confidence and authoritative composite.'],
];

/** The Run plan card: the nearest ancestor of its title that also holds the "Execute run" button. */
const planCard = (page: Page): Locator =>
  page.getByText(/^\s*Run plan\s*$/i).last().locator('xpath=ancestor::*[.//button[normalize-space()="Execute run"]][1]');

/** The element right after a label inside the card (its value). Labels are CSS-uppercased, so match case-insensitively. */
const valueOf = (card: Locator, label: RegExp): Locator => card.getByText(label).first().locator('xpath=following-sibling::*[1]');

/** Letters and digits only, lower case: arrows, dashes, quotes and spacing never decide a result. */
const norm = (t: string): string => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** The commit id the Coverage preview showed (the Run plan must show the same tip SHA). */
const commitShown = async (page: Page): Promise<string> =>
  ((await page.getByText(/^\s*Commit\s*$/i).last().locator('xpath=following-sibling::*[1]').innerText().catch(() => '')) || '').trim();

export const planSteps: Record<string, CaseHandler<RepoPage>> = {
'PLAN-001': async (ctx) => {
    const { snap, page, check } = ctx;
    const { branch } = inputs(ctx, { branches: 1 });
    await check('"Saved your selection" is shown', () => expect(page.getByText(/Saved your selection/i).last()).toBeVisible());
    const saved = await page.evaluate(() => {
      const t = document.body.innerText;
      const i = t.toLowerCase().lastIndexOf('saved your selection');
      if (i < 0) return '';
      const m = /Here.s the/i.exec(t.slice(i));
      return t.slice(i, i + (m && m.index > 0 ? m.index : 400)).replace(/\s+/g, ' ').trim();
    });
    ctx.note(`Saved selection reads: ${saved || '(not found)'}`);
    await check(`It names the branch "${branch}"`, () => expect(saved).toMatch(has(branch)));
    await check('It lists the trigger "push"', () => expect(saved).toMatch(/\bpush\b/i));
    const prMergeTrigger = page.getByRole('button', { name: /on pr merge/i }).or(page.getByText(/on pr merge/i)).last();
    await check('It lists the trigger "PR merge" (under Triggers on Configure card or in saved selection)', async () => {
      const inSaved = /PR\s*merge/i.test(saved);
      const onCard = await prMergeTrigger.isVisible().catch(() => false);
      expect(inSaved || onCard, 'trigger "PR merge" was not found under Triggers or in saved selection').toBe(true);
    }, prMergeTrigger);
    await check('"Here\'s the Run plan for White Box Analysis - review scope and what we\'ll classify, then execute." is shown', () =>
      expect(page.getByText(/Here.s the\s*Run plan\s*for White Box Analysis/i).last()).toContainText(/review scope and what we.ll classify,?\s*then execute/i));
    await check('The header reads "Confirm whitebox plan"', () => expect(page.getByText(/Confirm white\s*box plan/i).first()).toBeVisible());
    await check('The "Run plan" card is shown', () => expect(planCard(page)).toBeVisible());
    await snap('Saved selection and Run plan', page.getByText(/Saved your selection/i).last());
  },

'PLAN-002': async (ctx) => {
    const { snap, page, check } = ctx;
    const card = planCard(ctx.page);
    await check('The card is titled "Run plan"', () => expect(page.getByText(/^\s*Run plan\s*$/i).last()).toBeVisible());
    await check('It says "Review scope and what we\'ll classify. Execute starts the whitebox pipeline on your repo."', () =>
      expect(card).toContainText(/Review scope and what we.ll classify\.?\s*Execute starts the white\s*box pipeline on your repo/i));
    await snap('Run plan card title and subtitle', card);
  },

'PLAN-003': async (ctx) => {
    const { snap, check, note } = ctx;
    const { repo } = inputs(ctx, { repo: true });
    const card = planCard(ctx.page);
    const short = repo.split('/').pop() as string;
    const escaped = esc(short);
    await check('"Project" is shown', () => expect(card.getByText(ci('Project')).first()).toBeVisible());
    await check(`The project is "${short}"`, () => expect(valueOf(card, ci('Project'))).toHaveText(new RegExp(`^\\s*${escaped}\\s*$`, 'i')));
    await check('"Repository" is shown', () => expect(card.getByText(ci('Repository')).first()).toBeVisible());
    await check(`The repository is "<owner>/${short}" (the owner can differ: two repos are named ${short})`, () =>
      expect(valueOf(card, ci('Repository'))).toHaveText(new RegExp(`^\\s*[^/]+/${escaped}\\s*$`, 'i')));
    await snap('Project and repository on the Run plan', card.getByText(ci('Project')).first());
    note(`Repository shown: ${((await valueOf(card, ci('Repository')).innerText().catch(() => '')) || '').trim()}`);
  },

'PLAN-004': async (ctx) => {
    const { snap, check } = ctx;
    const { branch } = inputs(ctx, { branches: 1 });
    const card = planCard(ctx.page);
    const commit = await commitShown(ctx.page);
    const group = card.getByRole('radiogroup', { name: /Branch(es)? to analy[sz]e/i });
    await check('"Branches to analyze" is shown', () => expect(card.getByText(ci('Branches to analyze')).first()).toBeVisible());
    await check('It says "Selected branch (tip SHA)."', () => expect(card).toContainText(/Selected branch\s*\(tip SHA\)/i));
    await check('The "Branch to analyze" group is shown', () => expect(group).toBeVisible());
    await check('It lists exactly one branch', () => expect(group.getByRole('radio')).toHaveCount(1));
    await check('That branch is selected', () => expect(group.getByRole('radio').first()).toBeChecked());
    await check(`The branch is "${branch}"`, () => expect(group.getByRole('radio').first()).toContainText(has(branch)));
    await check('Its tip SHA is a commit id', () => expect(group.getByRole('radio').first()).toHaveText(/[0-9a-f]{7,40}\s*$/i));
    await check(`The tip SHA is the one the Coverage preview showed (${commit})`, () => expect(group.getByRole('radio').first()).toContainText(has(commit)));
    await snap('Branch to analyze with its tip SHA', group);
  },

'PLAN-005': async (ctx) => {
    const { snap, check } = ctx;
    const card = planCard(ctx.page);
    await check('"Analysis axes (taxonomy)" is shown', () => expect(card.getByText(ci('Analysis axes (taxonomy)')).first()).toBeVisible());
    const items = card.getByRole('listitem').filter({ hasText: /\S/ });
    for (let i = 0; i < AXES.length; i++) {
      const [title] = AXES[i];
      const item = card.getByRole('listitem').filter({ hasText: title }).last();
      await check(`Axis ${i + 1} is "${title}"`, async () => {
        await expect(item).toBeVisible();
        await expect(item).toContainText(new RegExp(`^\\s*${i + 1}`));
      });
    }
    await snap('Analysis axes (taxonomy) list', card.getByText(ci('Analysis axes (taxonomy)')).first());
    await check('The axes are in the right order (1 to 5)', async () => {
      const text = (await card.innerText()).replace(/\s+/g, ' ').toLowerCase(); // the page may show capitals through CSS
      const at = AXES.map(([t]) => text.indexOf(t.toLowerCase()));
      expect(at.every((n) => n >= 0)).toBe(true);
      expect([...at].sort((a, b) => a - b)).toEqual(at);
    });
    void items;
  },

'PLAN-006': async (ctx) => {
    const { snap, check } = ctx;
    const card = planCard(ctx.page);
    await snap('Analysis axes with their descriptions', card.getByRole('listitem').filter({ hasText: AXES[0][0] }).last());
    for (const [title, description] of AXES) {
      await check(`"${title}" is described ("${description.slice(0, 40)}...")`, async () => {
        const shown = await card.getByRole('listitem').filter({ hasText: title }).last().innerText();
        expect(norm(shown), `the line under the axis reads: ${shown.replace(/\s+/g, ' ').trim()}`).toContain(norm(description));
      });
    }
  },

'PLAN-007': async (ctx) => {
    const { snap, page, check, note } = ctx;
    const card = planCard(ctx.page);
    const execute = card.getByRole('button', { name: ci('Execute run') });
    await check('"Execute run" is shown in the Run plan card', () => expect(execute).toBeVisible());
    await check('"Execute run" is enabled', () => expect(execute).toBeEnabled());
    await snap('"Execute run" button on the Run plan', execute);
    note(`Buttons in the card: ${await card.getByRole('button').count()}`);
    note('"Execute run" is NOT clicked - it starts the whitebox pipeline.');
    void page;
  },
};
