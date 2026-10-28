import * as fs from 'fs';
import * as path from 'path';
import { RUN_DIR } from '../paths';
import { loadInput } from '../excel/readInput';
import { runObjectUpdate } from '../keywords/autoUpdate';
import { reportInputProblems, validateInput } from '../excel/validateInput';

/**
 * Every launch starts with no "blockers": a note written by an earlier launch into the same results folder (for example "Execute run
 * is not allowed" from a launch with ALLOW_EXECUTE_RUN = N) must never stop the cases of this launch.
 * It also checks the Input sheet once and prints what is wrong in plain words (see core/excel/validateInput.ts).
 */
export default async function globalSetup(): Promise<void> {
  try {
    fs.rmSync(path.join(RUN_DIR, 'blockers'), { recursive: true, force: true });
  } catch {
    /* nothing to clear */
  }

  let input;
  try {
    input = loadInput();
  } catch {
    return; // missing / unreadable workbook: the spec files report that with their own clear message
  }
  const errors = reportInputProblems(validateInput(input));
  if (errors > 0) throw new Error(`The Input sheet has ${errors} error(s) (listed above). Fix them and run again.`);

  // Dynamic object repository: BEFORE the first case starts, look at the site's code (after a git fetch) and bring changed labels into /objects.
  // Never stops the run; a problem is only printed.
  if (input.get('AUTO_UPDATE_OBJECTS').trim().toUpperCase() !== 'N') {
    if (!input.get('SITE_CODE_PATH').trim() && !process.env.SITE_CODE_PATH) {
      console.log('Object update: SITE_CODE_PATH is empty on the Input sheet, so the site code is NOT checked before this run. Fill it to make the repository follow the site.');
    } else {
      runObjectUpdate({ fetch: input.get('AUTO_FETCH_SITE').trim().toUpperCase() !== 'N', log: console.log });
    }
  }
}
