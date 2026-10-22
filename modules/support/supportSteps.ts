import { expect, Frame, Locator, Page } from '@playwright/test';
import { CaseHandler } from '../../core/runner/registerCases';
import { RepoPage } from '../repo/shared/RepoPage';
import { bodyText, closeSupport, norm, open, supportButton, supportItem } from '../flow/ui';

/**
 * The Support module: the round Support button, Live Chat (tawk.to), the "Open a support ticket" dialog, the User Guide and the Support
 * centre. Verified live on QA (15 Oct). Nothing is ever SENT: no chat message, no ticket, no file. "Submit ticket" is never clicked.
 */
const TOPICS = ['Confidence Engine — run failed', 'Confidence Engine — score interpretation', 'Whitebox / Blackbox gates', 'Taxonomy or compliance mapping', 'CI/CD integration', 'API or SDK', 'Billing or account', 'Other'];
/** Same words whatever the dash, slash or spacing. */
const letters = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

const home = (page: Page, input: import('../../core/types').InputConfig) => open(page, input, '/execution-assistant').then(() => supportButton(page).waitFor({ state: 'visible' }));
const dialog = (page: Page) => page.getByRole('dialog').filter({ hasText: /support ticket/i }).first();

async function openMenu(page: Page): Promise<void> {
  await closeSupport(page);
  await supportButton(page).click();
  await expect(page.getByRole('menu')).toBeVisible();
}
async function openTicket(page: Page): Promise<void> {
  await openMenu(page);
  await supportItem(page, /submit a request/i).click();
  await expect(dialog(page)).toBeVisible();
}

/** The frame of the chat window ("Customer Support"), looked for up to `ms`. */
async function chatFrame(page: Page, ms = 20_000): Promise<Frame | undefined> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    for (const f of page.frames()) {
      if (f === page.mainFrame()) continue;
      const t = await f.locator('body').innerText({ timeout: 1_000 }).catch(() => '');
      if (/customer support/i.test(t)) return f;
    }
    await page.waitForTimeout(500);
  }
  return undefined;
}

/** The visible message box in the chat frame ("Type here and press enter.."). Tawk.to contains an invisible clone/pre-render textarea in the DOM; we target the visible one. */
const chatInput = (frame: Frame) => frame.getByPlaceholder(/type here and press enter/i).locator('visible=true').first();

/** Finds the minimise (down-arrow) control for the Live Chat widget (rendered in Tawk.to widget button iframe or header). */
async function chatMinimiseButton(page: Page, frame?: Frame): Promise<Locator | undefined> {
  for (let i = 0; i < 15; i++) {
    for (const f of page.frames()) {
      const btn = f.locator('button:has(.tawk-min-chat-icon-down), .tawk-min-chat-icon-down, button[title*="close chat" i], button.tawk-button:has(svg)').first();
      if (await btn.isVisible().catch(() => false)) return btn;
    }
    if (frame) {
      const inFrame = frame.locator('[aria-label*="minimi" i], [title*="minimi" i], [class*="minimi" i], [aria-label*="close" i], [title*="close" i]').first();
      if (await inFrame.isVisible().catch(() => false)) return inFrame;
    }
    await page.waitForTimeout(300);
  }
  return undefined;
}

export const supportSteps: Record<string, CaseHandler<RepoPage>> = {
  'SPT-001': async ({ page, input, check, snap }) => {
    await home(page, input);
    const btn = supportButton(page);
    await check('The round "Support" button is shown on the Execution Assistant', () => expect(btn).toBeVisible());
    await btn.click();
    const menu = page.getByRole('menu');
    await check('Pressing it opens a menu', () => expect(menu).toBeVisible());
    for (const item of ['Live Chat', 'Submit a Request', 'User Guide']) {
      await check(`The menu offers "${item}"`, () => expect(supportItem(page, new RegExp(`^\\s*${item}\\s*$`, 'i'))).toBeVisible(), menu);
    }
    await snap('Support menu', menu);
    await closeSupport(page);
  },

  'SPT-002': async ({ page, input, check, note, snap }) => {
    await home(page, input);
    await openMenu(page);
    await supportItem(page, /live chat/i).click();
    const frame = await chatFrame(page);
    await check('A chat window titled "Customer Support" opens', () => expect(frame, 'no chat window with the text "Customer Support" appeared').toBeDefined());
    if (frame) {
      const t = norm(await frame.locator('body').innerText().catch(() => ''));
      note(`Chat window text: ${t.slice(0, 200)}`);
      await check('The chat greets the user ("How can we help?")', () => expect(t).toMatch(/how can we help/i));
      const msgBox = chatInput(frame);
      await check('The message box says "Type here and press enter.."', () => expect(msgBox).toBeVisible());
      await snap('Customer Support chat window', msgBox);
    }
    await closeSupport(page);
  },

  'SPT-003': async ({ page, input, check, snap }) => {
    await home(page, input);
    await openMenu(page);
    await supportItem(page, /live chat/i).click();
    const frame = await chatFrame(page);
    if (!frame) { await check('A chat window opens', () => expect(frame, 'no chat window appeared').toBeDefined()); await closeSupport(page); return; }
    for (const reply of ['I have a question', 'Tell me more']) {
      await check(`The quick reply "${reply}" is offered (it is not pressed, so nothing is sent)`, () => expect(frame.getByText(new RegExp(`^\\s*${reply}\\s*$`, 'i')).first()).toBeVisible());
    }
    await check('A paperclip (attach file) button is shown in the message bar', async () => {
      const n = await frame.locator('[aria-label*="attach" i], [title*="attach" i], [class*="attach" i], input[type="file"]').count();
      expect(n, 'no attach control found in the chat message bar').toBeGreaterThan(0);
    });
    await snap('Quick replies', frame.getByText(/^\s*I have a question\s*$/i).first());
    await check('"tawk.to" is named on the page ("Powered by tawk.to" / "Visit tawk.to")', async () => {
      const inFrame = /tawk\.to/i.test(await frame.locator('body').innerText().catch(() => ''));
      const inPage = (await page.locator('iframe[title*="tawk" i], a[href*="tawk.to"]').count()) > 0 || /tawk\.to/i.test(await page.evaluate(() => document.body.innerHTML.slice(0, 200000)).catch(() => ''));
      expect(inFrame || inPage, 'tawk.to is not named anywhere').toBe(true);
    });
    await closeSupport(page);
  },

  'SPT-004': async ({ page, input, check, snap }) => {
    await home(page, input);
    await openTicket(page);
    const dlg = dialog(page);
    await check('The dialog is titled "Open a support ticket"', () => expect(dlg.getByRole('heading', { name: /open a support ticket/i })).toBeVisible());
    await check('It says "Tell us what\'s happening. We\'ll route to the right team and reply within 1 business day."', () =>
      expect(dlg).toContainText(/Tell us what.s happening.*route to the right team.*within 1 business day/i));
    for (const label of ['Your name', 'Email', 'Topic', "What's going on?"]) {
      await check(`The field "${label}" is shown`, () => expect(dlg.getByText(new RegExp(`^\\s*${label.replace(/[?']/g, '.?')}\\s*$`, 'i')).first()).toBeVisible());
    }
    for (const b of ['Attach file', 'Cancel', 'Submit ticket']) {
      await check(`The button "${b}" is shown`, () => expect(dlg.getByRole('button', { name: new RegExp(`^\\s*${b}\\s*$`, 'i') }).first()).toBeVisible());
    }
    await snap('Support ticket dialog', dlg);
    await closeSupport(page);
  },

  'SPT-005': async ({ page, input, check, note, snap }) => {
    await home(page, input);
    await openTicket(page);
    const dlg = dialog(page);
    const name = dlg.locator('input[type="text"], input:not([type])').first();
    const email = dlg.locator('input[type="email"]').first();
    const nameV = await name.inputValue().catch(() => '');
    const emailV = await email.inputValue().catch(() => '');
    note(`Name box: "${nameV}"; Email box: "${emailV}"; signed in as ${input.email || '(EMAIL not filled)'}`);
    await check('"Your name" is already filled in from the session', () => expect(nameV.trim(), 'the name box is empty').not.toBe(''), name);
    await check('"Email" is already filled in from the session and looks like an email address', () => expect(emailV).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/), email);
    await snap('Name and email already filled in', [name, email]);
    await closeSupport(page);
  },

  'SPT-006': async ({ page, input, check, note, snap }) => {
    await home(page, input);
    await openTicket(page);
    const dlg = dialog(page);
    const topic = dlg.getByRole('combobox').first();
    const options = (await topic.locator('option').allInnerTexts()).map(norm);
    note(`Topic options: ${options.join(' | ')}`);
    await check('The Topic list starts with "Select a topic"', () => expect(letters(options[0] ?? '')).toBe(letters('Select a topic')), topic);
    for (const t of TOPICS) await check(`The Topic list offers "${t}"`, () => expect(options.map(letters)).toContain(letters(t)));
    await check('Choosing "Billing or account" selects it', async () => {
      await topic.selectOption({ label: options.find((o) => /billing or account/i.test(o)) ?? 'Billing or account' });
      expect(letters(await topic.evaluate((e: HTMLSelectElement) => e.selectedOptions[0]?.textContent ?? ''))).toBe(letters('Billing or account'));
    });
    await snap('Topic list', topic);
    await closeSupport(page);
  },

  'SPT-007': async ({ page, input, check, note, snap }) => {
    await home(page, input);
    await openTicket(page);
    const dlg = dialog(page);
    const box = dlg.locator('textarea').first();
    const submit = dlg.getByRole('button', { name: /^\s*submit ticket\s*$/i }).first();
    await check('The description box ("What\'s going on?") is empty when the dialog opens', async () => expect(await box.inputValue()).toBe(''), box);
    await check('The description box is marked required, so an empty description cannot be submitted', async () => {
      const required = await box.evaluate((e: HTMLTextAreaElement) => e.required || e.getAttribute('aria-required') === 'true');
      expect(required, 'the box is not marked required (nothing stops an empty submit)').toBe(true);
    }, box);
    note('"Submit ticket" is never pressed, so no ticket is created.');
    await snap('Empty description box and the Submit ticket button', [box, submit]);
    await closeSupport(page);
  },

  'SPT-008': async ({ page, input, check, snap }) => {
    await home(page, input);
    await openTicket(page);
    const dlg = dialog(page);
    const attach = dlg.getByRole('button', { name: /^\s*attach file\s*$/i }).first();
    await check('The button "Attach file" is shown', () => expect(attach).toBeVisible());
    await check('A file chooser is behind it (a file input exists; no file is chosen)', async () => expect(await dlg.locator('input[type="file"]').count()).toBeGreaterThan(0));
    await snap('Attach file button', attach);
    await closeSupport(page);
  },

  'SPT-009': async ({ page, input, check, snap }) => {
    await home(page, input);
    await openTicket(page);
    const dlg = dialog(page);
    const cancel = dlg.getByRole('button', { name: /^\s*cancel\s*$/i }).first();
    await snap('Cancel button of the ticket dialog', cancel);
    await check('"Cancel" closes the dialog', async () => { await cancel.click(); await expect(dlg).toBeHidden(); });
    await openTicket(page);
    await check('The close (X) button closes the dialog', async () => {
      await dialog(page).getByRole('button', { name: /^\s*close\s*$/i }).first().click();
      await expect(dialog(page)).toBeHidden();
    });
    await check('The page behind is still the Execution Assistant', () => expect(new URL(page.url()).pathname).toMatch(/execution-assistant/i));
    await closeSupport(page);
  },

  'SPT-010': async ({ page, input, check, note, snap }) => {
    await home(page, input);
    await openTicket(page);
    const dlg = dialog(page);
    const tickets = dlg.getByText(/^\s*my tickets\s*$/i).first();
    await check('"My Tickets" is shown at the bottom of the dialog', () => expect(tickets).toBeVisible());
    const t = norm(await dlg.innerText().catch(() => ''));
    const after = t.match(/my tickets\s+(.{0,40})/i)?.[1] ?? '';
    note(`My Tickets reads: ${after || '(nothing after it)'}`);
    await check('It shows "No tickets" or a count / list of tickets', () => expect(after, 'nothing is written next to "My Tickets"').not.toBe(''));
    await snap('My Tickets', tickets);
    await closeSupport(page);
  },

  'SPT-011': async ({ page, input, check, note, snap }) => {
    await home(page, input);
    await openMenu(page);
    const item = supportItem(page, /user guide/i);
    const popupP = page.context().waitForEvent('page', { timeout: 10_000 }).catch(() => undefined);
    await item.click();
    const popup = await popupP;
    const target = popup ?? page;
    await target.waitForLoadState('domcontentloaded').catch(() => undefined);
    await target.waitForURL(/\/docs\//i, { timeout: 15_000 }).catch(() => undefined);
    note(popup ? 'The User Guide opened in a new tab.' : 'The User Guide opened in the same tab.');
    await check('The User Guide opens (address contains /docs/)', () => expect(target.url()).toMatch(/\/docs\//i));
    await check('The page is titled "Testable Platform User Guide"', () => expect(target.getByRole('heading', { name: /testable platform user guide/i }).first()).toBeVisible());
    await snap('User Guide opened from the Support menu', target.getByRole('heading', { name: /testable platform user guide/i }).first());
    if (popup) await popup.close().catch(() => undefined);
    else await open(page, input, '/execution-assistant');
  },

  'SPT-012': async ({ page, input, check, note, snap }) => {
    await open(page, input, '/docs/introduction');
    const nav = page.locator('aside').first();
    await expect(nav).toBeVisible({ timeout: 20_000 });
    const groups = ['Getting Started', 'Authentication', 'SCM Connection', 'Whitebox Execution', 'Confidence Engine', 'Reference'];
    for (const g of groups) await check(`The guide menu has the group "${g}"`, () => expect(nav.getByText(new RegExp(`^\\s*${g}\\s*$`, 'i')).first()).toBeVisible());
    const hrefs = [...new Set(await nav.locator('a[href^="/docs/"]').evaluateAll((els) => els.map((e) => e.getAttribute('href') || '')))];
    note(`Guide pages in the menu: ${hrefs.length}`);
    await check('The guide menu lists at least 10 pages', () => expect(hrefs.length).toBeGreaterThanOrEqual(10));
    await snap('User Guide menu', nav);
    for (const href of hrefs) {
      await check(`${href} opens a guide page (not a 404)`, async () => {
        const res = await page.goto(`${input.baseUrl}${href}`);
        expect(res?.status() ?? 200).toBeLessThan(400);
        await expect(page.locator('article').first()).toBeVisible();
        expect(await page.title()).not.toMatch(/^404/);
        expect(await bodyText(page)).not.toMatch(/this page could not be found/i);
      });
    }
  },

  'SPT-013': async ({ page, input, check, snap }) => {
    await open(page, input, '/docs/introduction');
    const article = page.locator('article').first();
    await expect(article).toBeVisible({ timeout: 20_000 });
    await check('The title "Testable Platform User Guide" is shown', () => expect(article.getByRole('heading', { name: /testable platform user guide/i }).first()).toBeVisible());
    await check('The sign-in URL on the page is this site\'s /auth/login', async () => {
      const link = article.getByRole('link', { name: /\/auth\/login/i }).first();
      await expect(link).toBeVisible();
      expect(((await link.getAttribute('href')) ?? '').replace(/\/+$/, '').toLowerCase()).toBe(`${input.baseUrl.replace(/\/+$/, '')}/auth/login`.toLowerCase());
    });
    await check('The module table lists Authentication, SCM Connection, Whitebox Execution and Confidence Engine', async () => {
      const t = norm(await article.locator('table').first().innerText());
      for (const m of ['Authentication', 'SCM Connection', 'Whitebox Execution', 'Confidence Engine']) expect(t, m).toMatch(new RegExp(m, 'i'));
    });
    await snap('User Guide introduction', article.getByRole('heading', { name: /testable platform user guide/i }).first());
    await check('"Next →" opens the next guide page (/docs/register)', async () => {
      await page.getByRole('link', { name: /^\s*next\b/i }).first().click();
      await expect(page).toHaveURL(/\/docs\/register/i);
    });
  },

  'SPT-014': async ({ page, input, check, snap }) => {
    await open(page, input, '/support');
    const t = await (async () => { await page.waitForTimeout(1_500); return bodyText(page); })();
    await check('The Support centre opens (address /support) with "How can we help?"', async () => {
      expect(new URL(page.url()).pathname.replace(/\/+$/, '')).toBe('/support');
      expect(t).toMatch(/how can we help/i);
    });
    await check('"Browse by category" lists at least four categories with article counts', () => expect([...t.matchAll(/\d+\s+articles/gi)].length).toBeGreaterThanOrEqual(4));
    await check('A "White box run book" section is shown', () => expect(t).toMatch(/white\s*box run\s*book/i));
    await snap('Support centre', page.getByText(/how can we help/i).first());
    await open(page, input, '/execution-assistant');
  },

  'SPT-015': async ({ page, input, check, note, snap }) => {
    await home(page, input);
    await openMenu(page);
    await supportItem(page, /live chat/i).click();
    const frame = await chatFrame(page);
    if (!frame) { await check('A chat window opens', () => expect(frame, 'no chat window appeared').toBeDefined()); await closeSupport(page); return; }
    const minimise = (await chatMinimiseButton(page, frame)) ?? frame.locator('[aria-label*="minimi" i], [title*="minimi" i], [class*="minimi" i], [aria-label*="close" i], [title*="close" i]').first();
    await check('A minimise (down-arrow) control is shown for the chat', () => expect(minimise, 'no minimise control found for the chat window').toBeVisible({ timeout: 5_000 }));
    await snap('Chat minimise (down-arrow) control', minimise);
    const opened = await frame.locator('body').innerText().catch(() => '');
    await check('Pressing it minimises the chat window and the page behind it is still usable (nothing is sent)', async () => {
      await minimise.click({ timeout: 5_000, force: true });
      await page.waitForTimeout(1_000);
      const stillOpen = await chatInput(frame).isVisible().catch(() => false);
      expect(stillOpen, 'the chat window is still open after pressing minimise').toBe(false);
      await expect(page).not.toHaveURL(/\/auth\//i);
    });
    note(`Chat text before minimising: ${norm(opened).slice(0, 120)}`);
    await closeSupport(page);
  },

  'SPT-016': async ({ page, input, check, note, snap }) => {
    await home(page, input);
    await openMenu(page);
    await supportItem(page, /live chat/i).click();
    const frame = await chatFrame(page);
    if (!frame) { await check('A chat window opens', () => expect(frame, 'no chat window appeared').toBeDefined()); await closeSupport(page); return; }
    // the chat opens inside a conversation; the arrow at the top left leads to the chat home
    const byLabel = frame.locator('[aria-label*="back" i], [title*="back" i]').first();
    if (await byLabel.count()) await byLabel.click().catch(() => undefined);
    else {
      const box = await (await frame.frameElement()).boundingBox();
      if (box) await page.mouse.click(box.x + 47, box.y + 49);
    }
    await page.waitForTimeout(1_000);
    const t = norm(await frame.locator('body').innerText().catch(() => ''));
    note(`Chat home text: ${t.slice(0, 220)}`);
    await check('The chat home greets the user ("Hi there")', () => expect(t).toMatch(/hi there/i));
    await check('A "Help Center" box with the field "Search for answers" is shown', async () => {
      expect(t).toMatch(/help center/i);
      await expect(frame.getByPlaceholder(/search for answers/i).first()).toBeVisible();
    });
    await check('"New Conversation" with "We typically reply in a few minutes" is shown (it is not pressed)', () => {
      expect(t).toMatch(/new conversation/i);
      expect(t).toMatch(/typically reply in a few minutes/i);
    });
    await snap('Chat home', frame.getByPlaceholder(/search for answers/i).first());
    await closeSupport(page);
  },

  'SPT-017': async ({ page, input, check, snap }) => {
    await open(page, input, '/docs/download-report');
    const article = page.locator('article').first();
    await expect(article, 'the guide article did not open').toBeVisible({ timeout: 20_000 });
    const t = norm(await article.innerText());
    await check('The breadcrumb reads "Docs › Confidence Engine › Taxonomy Report"', () => expect(t).toMatch(/docs\s*›\s*confidence engine\s*›\s*taxonomy report/i));
    await check('The title "Download Taxonomy Report" is shown', () => expect(article.getByRole('heading', { name: /download taxonomy report/i }).first()).toBeVisible());
    await check('"MODULE OBJECTIVES" are listed', () => expect(t).toMatch(/module objectives/i));
    await check('"Step-by-step" instructions are shown with numbered steps ("Step 1 —" ...)', () => {
      expect(t).toMatch(/step-by-step/i);
      expect([...t.matchAll(/step \d+\s*—/gi)].length).toBeGreaterThanOrEqual(3);
    });
    await snap('User Guide article', article.getByRole('heading', { name: /download taxonomy report/i }).first());
    const next = page.getByRole('link', { name: /^\s*next\b/i }).first();
    await check('"Next →" is offered and opens another guide article', async () => {
      await expect(next).toBeVisible();
      const href = (await next.getAttribute('href')) ?? '';
      await next.click();
      await expect(page).toHaveURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 15_000 });
      await expect(page.locator('article').first()).toBeVisible();
    });
  },

  'SPT-018': async ({ page, input, check, snap }) => {
    await open(page, input, '/docs/download-report');
    const article = page.locator('article').first();
    await expect(article, 'the guide article did not open').toBeVisible({ timeout: 20_000 });
    const video = article.locator('video, iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="loom"]').first();
    await video.scrollIntoViewIfNeeded().catch(() => undefined);
    await check('An embedded walkthrough video is shown in the article', () => expect(video, 'no video is embedded in the article').toBeVisible({ timeout: 10_000 }));
    await check('The video has playing controls (it is not played)', async () => {
      const tag = await video.evaluate((e) => e.tagName.toLowerCase());
      if (tag === 'video') expect(await video.evaluate((e: HTMLVideoElement) => e.controls)).toBe(true);
    });
    await snap('Embedded video', video);
  },
};
