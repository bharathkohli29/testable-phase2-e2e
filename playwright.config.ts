import { defineConfig } from '@playwright/test';
import * as path from 'path';
import { RUN_DIR } from './core/paths'; // also fixes the RUN_ID for this run (workers inherit it)
import { loadInput } from './core/excel/readInput';
import { getScreenSize } from './core/screen';

// Browser options come from the Input sheet. If the workbook is missing/invalid the test files
// report that with a clear message, so here we only fall back to defaults.
let headless = false;
let slowMo = 0;
let timeoutSec = 120;
const screen = getScreenSize();
try {
  const input = loadInput();
  headless = input.headless;
  slowMo = input.slowMoMs;
  timeoutSec = input.timeoutSec;
} catch {
  /* reported when the test files load */
}

export default defineConfig({
  testDir: './modules',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: timeoutSec * 1000,
  expect: { timeout: 30_000 }, // a check waits up to 30 s for its element before it is reported as failed (slow site)
  outputDir: path.join(RUN_DIR, 'playwright-artifacts'),
  reporter: [['list'], ['html', { outputFolder: path.join(RUN_DIR, 'playwright-report'), open: 'never' }]],
  globalSetup: './core/runner/globalSetup.ts',
  globalTeardown: './core/reporting/globalTeardown.ts',
  use: {
    browserName: 'chromium',
    headless,
    // Headed: the window is sized to the usable area of the real monitor (screen minus taskbar) and the page
    // follows the window (viewport: null). Headless has no monitor, so it gets a fixed full-HD size.
    viewport: headless ? { width: 1920, height: 1080 } : null,
    launchOptions: {
      slowMo,
      args: headless ? [] : ['--window-position=0,0', `--window-size=${screen.width},${screen.height}`],
    },
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    trace: 'retain-on-failure',
    screenshot: 'off', // evidence screenshots are taken by core/runner/registerCases.ts
  },
});
