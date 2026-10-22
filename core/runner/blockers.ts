import * as fs from 'fs';
import * as path from 'path';
import { RUN_DIR } from '../paths';

/**
 * Run-level "prerequisite is broken" markers (one small file per key in the run folder; a failed test restarts the
 * Playwright worker, so memory would not survive). A new run has a new folder, so nothing carries over.
 */
const dir = path.join(RUN_DIR, 'blockers');
const file = (key: string) => path.join(dir, `${key.replace(/[^A-Za-z0-9_-]+/g, '_')}.json`);

export function setBlocker(key: string, caseId: string, reason: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file(key), JSON.stringify({ caseId, reason }));
}

export function getBlocker(key: string): { caseId: string; reason: string } | undefined {
  try {
    return JSON.parse(fs.readFileSync(file(key), 'utf8'));
  } catch {
    return undefined;
  }
}
