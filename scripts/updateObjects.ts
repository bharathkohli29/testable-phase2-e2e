/**
 * npm run objects:update
 *
 * Looks at the site's code (SITE_CODE_PATH, branch SITE_CODE_REF) and, where a text that the /objects files use was renamed there,
 * writes the new text into the /objects file. See core/keywords/updater.ts for exactly how it decides.
 *
 *   npm run objects:update                    compare with the commit seen at the last run, apply the changes
 *   npm run objects:update -- --dry           only show what would change
 *   npm run objects:update -- --fetch         "git fetch origin" in the site clone first (its working folder is never changed)
 *   npm run objects:update -- --since <ref>   compare with this commit / tag instead of the remembered one
 *   npm run objects:update -- --ref origin/dev
 * The same step also runs by itself at the start of npm test when SITE_CODE_PATH is set and AUTO_UPDATE_OBJECTS = Y.
 */
import { runObjectUpdate } from '../core/keywords/autoUpdate';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : undefined;
}

const code = runObjectUpdate({ dry: process.argv.includes('--dry'), fetch: process.argv.includes('--fetch'), since: arg('--since'), ref: arg('--ref'), site: arg('--site'), log: console.log });
process.exit(code);
