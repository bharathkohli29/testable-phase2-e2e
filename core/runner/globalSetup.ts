import * as fs from 'fs';
import * as path from 'path';
import { RUN_DIR } from '../paths';

/**
 * Every launch starts with no "blockers": a note written by an earlier launch into the same results folder (for example "Execute run
 * is not allowed" from a launch with ALLOW_EXECUTE_RUN = N) must never stop the cases of this launch.
 */
export default async function globalSetup(): Promise<void> {
  try {
    fs.rmSync(path.join(RUN_DIR, 'blockers'), { recursive: true, force: true });
  } catch {
    /* nothing to clear */
  }
}
