import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { ROOT } from '../paths';
import { findSiteRepo, renderReport, updateObjects } from './updater';

export interface AutoOptions {
  dry?: boolean;
  fetch?: boolean;
  since?: string;
  ref?: string;
  site?: string;
  log: (s: string) => void;
}

function inputValue(key: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { loadInput } = require('../excel/readInput') as typeof import('../excel/readInput');
    return loadInput().get(key).trim();
  } catch {
    return '';
  }
}

/** Runs the update and prints a short summary. Returns an exit code (0 ok, 2 not set up). NEVER throws: a problem here must not stop a test run. */
export function runObjectUpdate(o: AutoOptions): number {
  try {
    const siteArg = o.site || process.env.SITE_CODE_PATH || inputValue('SITE_CODE_PATH');
    const ref = o.ref || process.env.SITE_CODE_REF || inputValue('SITE_CODE_REF') || 'origin/qa';
    const srcDir = process.env.SITE_CODE_SRC || 'frontend/web-console/src';
    if (!siteArg) {
      o.log('Object update: SITE_CODE_PATH is empty, so the site code is not checked.');
      return 2;
    }
    const site = findSiteRepo(siteArg);
    if (o.fetch) {
      const r = spawnSync('git', ['-C', site, 'fetch', 'origin'], { encoding: 'utf8' });
      if (r.status !== 0) o.log(`Object update: git fetch failed (${(r.stderr || '').trim().slice(0, 200)}); using what the clone already has.`);
    }
    const res = updateObjects({ site, ref, srcDir, since: o.since, dry: o.dry });
    o.log(`Object update (${ref}): ${res.message}`);
    for (const c of res.changes) o.log(`  ${o.dry ? 'would change' : 'changed'} ${c.object}: "${c.from}" -> "${c.to}"   (${c.where})`);
    for (const v of res.review) o.log(`  needs a person: ${v.object} "${v.text}" - ${v.reason}`);
    if (res.changes.length || res.review.length) {
      const dir = path.join(ROOT, 'results');
      fs.mkdirSync(dir, { recursive: true });
      const d = new Date();
      const p = (n: number): string => String(n).padStart(2, '0');
      const file = path.join(dir, `object-updates_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.md`);
      fs.writeFileSync(file, renderReport(res, { ref, dry: o.dry }));
      o.log(`  report: ${file}`);
    }
    return 0;
  } catch (e) {
    o.log(`Object update skipped: ${(e as Error).message.split('\n')[0]}`);
    return 2;
  }
}
