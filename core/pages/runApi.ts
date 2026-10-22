import { Page } from '@playwright/test';

/**
 * The run API calls the page itself makes (views-api / runtime-api) can be read again from inside the page (same session).
 * They need the tenant_id the page sends. The browser keeps only the last ~250 requests in memory, so the tenant_id is remembered
 * from the page's own requests as they happen (watchTenant), with the browser memory as a fallback.
 */
const tenants = new WeakMap<Page, string>();
const wired = new WeakSet<Page>();

/** Call once per page (safe to call again). */
export function watchTenant(page: Page): void {
  if (wired.has(page)) return;
  wired.add(page);
  page.on('request', (r) => {
    const m = r.url().match(/[?&]tenant_id=([0-9a-f-]{36})/i);
    if (m) tenants.set(page, m[1]);
  });
}

export async function tenantOf(page: Page, timeoutMs = 30_000): Promise<string> {
  watchTenant(page);
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const known = tenants.get(page);
    if (known) return known;
    const fromMemory = await page
      .evaluate(() => {
        const n = performance.getEntriesByType('resource').map((e) => e.name).find((x) => /tenant_id=/.test(x));
        return n ? new URL(n, location.origin).searchParams.get('tenant_id') || '' : '';
      })
      .catch(() => '');
    if (fromMemory) { tenants.set(page, fromMemory); return fromMemory; }
    await page.waitForTimeout(500);
  }
  return '';
}

export interface ApiReply { status: number; json: any; ms: number }

/** GET a same-origin path from inside the page. */
export async function apiGet(page: Page, path: string): Promise<ApiReply> {
  return page.evaluate(async (p) => {
    const t0 = performance.now();
    const r = await fetch(p);
    let json: unknown = null;
    try { json = await r.json(); } catch { /* not JSON */ }
    return { status: r.status, json, ms: Math.round(performance.now() - t0) };
  }, path);
}
