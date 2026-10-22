const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const PDF_OUT = path.resolve(__dirname, '..', 'Testable_E2E_Complete_User_Guide.pdf');
const ARTIFACT_DIR = 'C:/Users/SAKTHI SUDHARSHAN/.gemini/antigravity-ide/brain/607e177e-1bfb-404b-8bd4-a90b70772935';
const ARTIFACT_PDF = path.join(ARTIFACT_DIR, 'Testable_E2E_Complete_User_Guide.pdf');

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Testable Phase 2 E2E Automation - Complete User Guide & Pipeline Workflow</title>
  <style>
    @page {
      size: A4;
      margin: 12mm 12mm 14mm 12mm;
      @bottom-right {
        content: "Page " counter(page) " of " counter(pages);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 8pt;
        color: #64748B;
        font-weight: 600;
      }
      @bottom-left {
        content: "Testable Phase 2 E2E Automation · Executive User & Pipeline Guide";
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 8pt;
        color: #64748B;
      }
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #0F172A;
      line-height: 1.48;
      font-size: 9pt;
      background: #FFFFFF;
    }

    /* Cover / Header */
    .header-banner {
      background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%);
      color: #FFFFFF;
      padding: 22px 20px;
      border-radius: 8px;
      margin-bottom: 16px;
      border-left: 6px solid #2563EB;
    }

    .header-banner h1 {
      font-size: 18pt;
      font-weight: 700;
      letter-spacing: -0.4px;
      margin-bottom: 4px;
      color: #F8FAFC;
    }

    .header-banner .subtitle {
      font-size: 10pt;
      color: #94A3B8;
      margin-bottom: 12px;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      border-top: 1px solid #334155;
      padding-top: 10px;
      font-size: 8pt;
    }

    .meta-item strong {
      display: block;
      color: #CBD5E1;
      text-transform: uppercase;
      font-size: 7pt;
      letter-spacing: 0.5px;
      margin-bottom: 1px;
    }

    .meta-item span {
      color: #38BDF8;
      font-weight: 600;
    }

    /* Headings */
    h2 {
      font-size: 12pt;
      font-weight: 700;
      color: #0F172A;
      margin-top: 18px;
      margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 1.5px solid #E2E8F0;
      display: flex;
      align-items: center;
      page-break-after: avoid;
    }

    h2 .num {
      background: #2563EB;
      color: #FFFFFF;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 8.5pt;
      margin-right: 7px;
    }

    h3 {
      font-size: 10pt;
      font-weight: 700;
      color: #1E293B;
      margin-top: 12px;
      margin-bottom: 4px;
      page-break-after: avoid;
    }

    p {
      margin-bottom: 6px;
    }

    /* Lists */
    ul, ol {
      margin-left: 18px;
      margin-bottom: 8px;
    }

    li {
      margin-bottom: 3px;
    }

    /* Code Blocks */
    pre {
      background: #0F172A;
      color: #E2E8F0;
      padding: 8px 12px;
      border-radius: 5px;
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 8pt;
      margin: 6px 0 10px 0;
      overflow-x: hidden;
      white-space: pre-wrap;
      word-break: break-all;
      border-left: 3.5px solid #38BDF8;
      page-break-inside: avoid;
    }

    code {
      font-family: 'Consolas', 'Courier New', monospace;
      background: #F1F5F9;
      color: #0F172A;
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 8pt;
    }

    pre code {
      background: transparent;
      color: inherit;
      padding: 0;
    }

    /* Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0 12px 0;
      font-size: 8pt;
    }

    thead {
      display: table-header-group;
    }

    tr {
      page-break-inside: avoid;
    }

    th, td {
      padding: 6px 8px;
      text-align: left;
      border: 1px solid #E2E8F0;
      vertical-align: top;
    }

    th {
      background: #F8FAFC;
      color: #0F172A;
      font-weight: 700;
      border-bottom: 2px solid #CBD5E1;
    }

    tr:nth-child(even) td {
      background: #F8FAFC;
    }

    /* Callout Boxes */
    .callout {
      padding: 8px 12px;
      border-radius: 5px;
      margin: 8px 0 10px 0;
      font-size: 8pt;
      page-break-inside: avoid;
    }

    .callout-tip {
      background: #F0FDF4;
      border-left: 4px solid #16A34A;
      color: #166534;
    }

    .callout-warning {
      background: #FFFBEB;
      border-left: 4px solid #D97706;
      color: #92400E;
    }

    .callout-important {
      background: #EFF6FF;
      border-left: 4px solid #2563EB;
      color: #1E40AF;
    }

    .callout strong {
      display: inline-block;
      margin-bottom: 2px;
      font-size: 8.5pt;
    }

    /* Badges */
    .badge {
      display: inline-block;
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 7pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .badge-pass { background: #DCFCE7; color: #15803D; }
    .badge-fail { background: #FEE2E2; color: #B91C1C; }
    .badge-skip { background: #FEF3C7; color: #B45309; }

    /* Diagrams */
    .diagram-container {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 6px;
      padding: 10px;
      margin: 8px 0 12px 0;
      text-align: center;
      page-break-inside: avoid;
    }

    .diagram-title {
      font-size: 8pt;
      font-weight: 700;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }
  </style>
</head>
<body>

  <!-- HEADER BANNER -->
  <div class="header-banner">
    <h1>Testable Phase 2 E2E Automation</h1>
    <div class="subtitle">Complete User Manual, Installation Guide & Pipeline Workflow Architecture</div>
    <div class="meta-grid">
      <div class="meta-item">
        <strong>Engine</strong>
        <span>Playwright + TypeScript</span>
      </div>
      <div class="meta-item">
        <strong>Data Driver</strong>
        <span>Excel (testable-input.xlsx)</span>
      </div>
      <div class="meta-item">
        <strong>Target Platform</strong>
        <span>Testable Cloud (QA / DEV)</span>
      </div>
      <div class="meta-item">
        <strong>Standard</strong>
        <span>Automated E2E QA Specification</span>
      </div>
    </div>
  </div>

  <!-- SECTION 1 -->
  <h2><span class="num">1</span> Executive Overview & Core Architecture</h2>
  <p>
    The <strong>Testable Phase 2 E2E Test Suite</strong> is an enterprise-grade, modular, Excel-driven end-to-end automation framework built for the <strong>Testable Platform</strong> (SaaS whitebox testing, code intelligence, and confidence scoring).
  </p>
  <p>
    Unlike conventional UI automation suites that launch isolated browser contexts per test, this framework executes a <strong>unified, serialized user journey across 17 distinct modules</strong> within a single persistent browser worker, maintaining session state across all screens.
  </p>

  <div class="diagram-container">
    <div class="diagram-title">System Architecture & Bidirectional Data Flow</div>
    <svg viewBox="0 0 760 190" width="100%" height="190" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="blueGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1E293B"/>
          <stop offset="100%" stop-color="#0F172A"/>
        </linearGradient>
      </defs>
      
      <!-- Excel Input Box -->
      <rect x="20" y="25" width="165" height="135" rx="6" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1.5"/>
      <rect x="20" y="25" width="165" height="26" rx="6" fill="#16A34A"/>
      <text x="102" y="42" fill="#FFFFFF" font-size="9" font-weight="700" text-anchor="middle">EXCEL INPUT WORKBOOK</text>
      <text x="102" y="70" fill="#1E293B" font-size="8.5" font-weight="600" text-anchor="middle">input/testable-input.xlsx</text>
      <text x="102" y="88" fill="#64748B" font-size="7.5" text-anchor="middle">• Credentials (QA/DEV)</text>
      <text x="102" y="103" fill="#64748B" font-size="7.5" text-anchor="middle">• Target REPO & BRANCHES</text>
      <text x="102" y="118" fill="#64748B" font-size="7.5" text-anchor="middle">• ALLOW_EXECUTE_RUN Flag</text>
      <text x="102" y="133" fill="#64748B" font-size="7.5" text-anchor="middle">• 17 Module Sheets (Run Y/N)</text>

      <!-- Arrow right -->
      <path d="M 188 92 L 232 92" stroke="#2563EB" stroke-width="2" fill="none"/>
      <polygon points="232,92 224,88 224,96" fill="#2563EB"/>
      <text x="210" y="85" fill="#2563EB" font-size="7" font-weight="600" text-anchor="middle">readInput</text>

      <!-- Test Runner Engine -->
      <rect x="235" y="15" width="240" height="155" rx="6" fill="url(#blueGrad)" stroke="#38BDF8" stroke-width="1.5"/>
      <text x="355" y="36" fill="#38BDF8" font-size="9.5" font-weight="700" text-anchor="middle">CORE TEST RUNNER ENGINE</text>
      <rect x="250" y="47" width="210" height="26" rx="4" fill="#334155"/>
      <text x="355" y="63" fill="#F8FAFC" font-size="8" font-weight="600" text-anchor="middle">registerFlow.ts (9-Stage State Machine)</text>
      <rect x="250" y="78" width="210" height="26" rx="4" fill="#334155"/>
      <text x="355" y="94" fill="#F8FAFC" font-size="8" font-weight="600" text-anchor="middle">checks.ts (Soft ✔/✘ & Visual Highlighting)</text>
      <rect x="250" y="109" width="210" height="48" rx="4" fill="#334155"/>
      <text x="355" y="126" fill="#F8FAFC" font-size="8" font-weight="600" text-anchor="middle">Playwright Persistent Browser Worker</text>
      <text x="355" y="142" fill="#94A3B8" font-size="7" text-anchor="middle">Headed Mode · API Introspection · runApi.ts</text>

      <!-- Arrow right -->
      <path d="M 478 92 L 522 92" stroke="#2563EB" stroke-width="2" fill="none"/>
      <polygon points="522,92 514,88 514,96" fill="#2563EB"/>
      <text x="500" y="85" fill="#2563EB" font-size="7" font-weight="600" text-anchor="middle">records</text>

      <!-- Deliverables Box -->
      <rect x="525" y="25" width="215" height="135" rx="6" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1.5"/>
      <rect x="525" y="25" width="215" height="26" rx="6" fill="#2563EB"/>
      <text x="632" y="42" fill="#FFFFFF" font-size="9" font-weight="700" text-anchor="middle">TEST ARTIFACTS & REPORTS</text>
      <text x="632" y="68" fill="#1E293B" font-size="8" font-weight="600" text-anchor="middle">results/run_&lt;ts&gt;/testable-results.xlsx</text>
      <text x="632" y="85" fill="#64748B" font-size="7" text-anchor="middle">• Summary Tab & Pass Rates</text>
      <text x="632" y="99" fill="#64748B" font-size="7.5" text-anchor="middle">• Passwords Masked as ********</text>
      <text x="632" y="113" fill="#64748B" font-size="7.5" text-anchor="middle">• Embedded Screenshots in Excel</text>
      <text x="632" y="127" fill="#64748B" font-size="7.5" text-anchor="middle">• Playwright HTML Report & Evidence PNGs</text>

      <!-- Feedback Arrow (bottom) -->
      <path d="M 525 150 L 188 150" stroke="#16A34A" stroke-width="1.5" stroke-dasharray="3,3" fill="none"/>
      <polygon points="188,150 196,146 196,154" fill="#16A34A"/>
      <text x="355" y="182" fill="#16A34A" font-size="7" font-weight="600" text-anchor="middle">Direct in-place flush to input/testable-input.xlsx (Actuals + Results + Evidence Links)</text>
    </svg>
  </div>

  <!-- SECTION 2 -->
  <h2><span class="num">2</span> Things to Install & Setup Commands</h2>
  <p>To run this suite from scratch, perform these three installation steps in your terminal:</p>

  <h3>2.1 Install Node.js Dependencies</h3>
  <pre><code>npm install</code></pre>
  <p><em>Packages Installed:</em> <code>@playwright/test</code> (Playwright test harness), <code>typescript</code> & <code>ts-node</code> (TypeScript execution), <code>exceljs</code> (Excel styling and image embedding), <code>xlsx</code> (Workbook reading), and <code>@types/node</code>.</p>

  <h3>2.2 Download Playwright Chromium Browser Binaries</h3>
  <pre><code>npx playwright install chromium</code></pre>
  <div class="callout callout-important">
    <strong>Browser Binary Path:</strong> Chromium installs to <code>%LOCALAPPDATA%\\ms-playwright\\chromium-&lt;version&gt;\\chrome-win64\\chrome.exe</code>. If this step is omitted, tests fail with: <code>Executable doesn't exist at chrome.exe</code>.
  </div>

  <h3>2.3 Install VS Code / Antigravity Testing Extension (For Manual UI Testing)</h3>
  <ol>
    <li>Press <code>Ctrl + Shift + X</code> (Extensions Marketplace).</li>
    <li>Search for: <code>ms-playwright.playwright</code> (Playwright Test for VS Code by Microsoft).</li>
    <li>Click <strong>Install</strong>.</li>
    <li>The <strong>Testing Beaker Icon (🧪)</strong> will appear in the left Activity Bar with the full interactive test tree.</li>
  </ol>

  <!-- SECTION 3 -->
  <h2><span class="num">3</span> Complete Command Reference</h2>
  <table>
    <thead>
      <tr>
        <th style="width: 28%;">Command</th>
        <th style="width: 32%;">Action Performed</th>
        <th style="width: 40%;">When & How to Use</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><code>npm run template</code></td>
        <td>Creates <code>input/testable-input.xlsx</code> from scratch.</td>
        <td>Run once on a fresh machine. Refuses to overwrite existing files to protect saved passwords. Add <code>-- --force</code> to recreate.</td>
      </tr>
      <tr>
        <td><code>npm run sync</code></td>
        <td>Synchronizes existing Excel workbook with code.</td>
        <td>Run after pulling new git updates. Safely adds new test case rows while keeping your existing passwords untouched.</td>
      </tr>
      <tr>
        <td><code>npm test</code><br><em>or</em> <code>npm run test:flow</code></td>
        <td>Executes the complete 17-module serialized journey.</td>
        <td>Main E2E command. Signs in, connects repository, executes pipeline, and audits all screens in one continuous run.</td>
      </tr>
      <tr>
        <td><code>npm run test:branches</code></td>
        <td>Executes test matrix across multiple Git branches.</td>
        <td>Spawns sequential runs for every branch specified in the <code>BRANCHES</code> key. Creates separate results folders per branch.</td>
      </tr>
      <tr>
        <td><code>npx playwright test --ui</code></td>
        <td>Launches Playwright Interactive Desktop GUI.</td>
        <td>Best for manual visual debugging. Allows running individual test cases, DOM inspection, and time-travel tracing.</td>
      </tr>
      <tr>
        <td><code>npm run report</code></td>
        <td>Opens Playwright HTML Report in the browser.</td>
        <td>Run after any test execution to inspect visual step execution logs and traces.</td>
      </tr>
    </tbody>
  </table>

  <!-- SECTION 4 -->
  <h2><span class="num">4</span> Configuration & Credentials Setup</h2>
  <p>
    All configuration resides in one file: <code>input/testable-input.xlsx</code> on the <strong>Input</strong> sheet:
  </p>

  <table>
    <thead>
      <tr>
        <th style="width: 25%;">Key Name</th>
        <th style="width: 25%;">Default / Example</th>
        <th style="width: 50%;">Description & Impact</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><code>ENV</code></td>
        <td><code>QA</code></td>
        <td>Selects <code>QA</code> or <code>DEV</code> environment blocks.</td>
      </tr>
      <tr>
        <td><code>QA_BASE_URL</code></td>
        <td><code>https://qa-frontend.testable.cc</code></td>
        <td>Frontend base URL for the QA deployment.</td>
      </tr>
      <tr>
        <td><code>QA_EMAIL</code></td>
        <td><em>your-email@example.com</em></td>
        <td>Your normal test account email for QA login.</td>
      </tr>
      <tr>
        <td><code>QA_PASSWORD</code></td>
        <td><em>your-password</em></td>
        <td>Account password (masked as <code>********</code> in results).</td>
      </tr>
      <tr>
        <td><code>HEADLESS</code></td>
        <td><code>N</code></td>
        <td><code>N</code> = Opens real browser window so you see the test live; <code>Y</code> = Runs invisibly in the background.</td>
      </tr>
      <tr>
        <td><code>SLOW_MO_MS</code></td>
        <td><code>0</code> (Set to <code>300</code>-<code>500</code>)</td>
        <td>Slows down browser actions by X ms so you can follow clicks and typing visually.</td>
      </tr>
      <tr>
        <td><code>REPO</code></td>
        <td><code>VISVANTHA/CE-Platform-Stack</code></td>
        <td>The target repository to import, select, and analyze.</td>
      </tr>
      <tr>
        <td><code>BRANCHES</code></td>
        <td><code>main,feature-branch</code></td>
        <td>Comma-separated branches. Provide at least 2 branches if testing the branch switcher.</td>
      </tr>
      <tr>
        <td><code>ALLOW_EXECUTE_RUN</code></td>
        <td><code>N</code> (Change to <code>Y</code>)</td>
        <td><code>Y</code> = Clicks "Execute run" (starts real whitebox pipeline); <code>N</code> = Stops at plan stage to save execution credits.</td>
      </tr>
      <tr>
        <td><code>ALLOW_DUMMY_COMMIT</code></td>
        <td><code>N</code></td>
        <td><code>Y</code> = Clones repo, pushes a dummy README commit, and validates "Analyze latest commit" flow.</td>
      </tr>
    </tbody>
  </table>

  <div class="callout callout-warning">
    <strong>Critical Golden Rule:</strong> Always <strong>save and close</strong> <code>testable-input.xlsx</code> in Microsoft Excel before running any test. Windows file locking will prevent the runner from writing test results back into the sheet.
  </div>

  <!-- SECTION 5 -->
  <h2><span class="num">5</span> Pipeline Workflow & State Machine</h2>
  <p>
    The runner utilizes an ordered state machine (<code>registerFlow.ts</code>). If an early milestone fails catastrophically, subsequent dependent tests are gracefully marked <code>SKIPPED ("Blocked by &lt;id&gt;")</code> rather than cascading into false failures.
  </p>

  <div class="diagram-container">
    <div class="diagram-title">The 9 Internal Journey Stages & Cascading Blocker Architecture</div>
    <svg viewBox="0 0 740 105" width="100%" height="105" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(10, 20)">
        <!-- 1. Start -->
        <rect x="0" y="0" width="65" height="34" rx="4" fill="#E2E8F0" stroke="#94A3B8"/>
        <text x="32" y="21" fill="#0F172A" font-size="8" font-weight="700" text-anchor="middle">start</text>
        <path d="M 67 17 L 78 17" stroke="#64748B" stroke-width="1.5"/>
        
        <!-- 2. Login -->
        <rect x="80" y="0" width="65" height="34" rx="4" fill="#DBEAFE" stroke="#3B82F6"/>
        <text x="112" y="21" fill="#1E3A8A" font-size="8" font-weight="700" text-anchor="middle">login</text>
        <path d="M 147 17 L 158 17" stroke="#64748B" stroke-width="1.5"/>

        <!-- 3. repo-list -->
        <rect x="160" y="0" width="70" height="34" rx="4" fill="#DBEAFE" stroke="#3B82F6"/>
        <text x="195" y="21" fill="#1E3A8A" font-size="8" font-weight="700" text-anchor="middle">repo-list</text>
        <path d="M 232 17 L 243 17" stroke="#64748B" stroke-width="1.5"/>

        <!-- 4. configure -->
        <rect x="245" y="0" width="75" height="34" rx="4" fill="#DBEAFE" stroke="#3B82F6"/>
        <text x="282" y="21" fill="#1E3A8A" font-size="8" font-weight="700" text-anchor="middle">configure</text>
        <path d="M 322 17 L 333 17" stroke="#64748B" stroke-width="1.5"/>

        <!-- 5. confirm -->
        <rect x="335" y="0" width="70" height="34" rx="4" fill="#DBEAFE" stroke="#3B82F6"/>
        <text x="370" y="21" fill="#1E3A8A" font-size="8" font-weight="700" text-anchor="middle">confirm</text>
        <path d="M 407 17 L 418 17" stroke="#64748B" stroke-width="1.5"/>

        <!-- 6. plan -->
        <rect x="420" y="0" width="65" height="34" rx="4" fill="#DBEAFE" stroke="#3B82F6"/>
        <text x="452" y="21" fill="#1E3A8A" font-size="8" font-weight="700" text-anchor="middle">plan</text>
        <path d="M 487 17 L 498 17" stroke="#64748B" stroke-width="1.5"/>

        <!-- 7. execute -->
        <rect x="500" y="0" width="70" height="34" rx="4" fill="#FEF3C7" stroke="#F59E0B"/>
        <text x="535" y="21" fill="#78350F" font-size="8" font-weight="700" text-anchor="middle">execute</text>
        <path d="M 572 17 L 583 17" stroke="#64748B" stroke-width="1.5"/>

        <!-- 8. engine -->
        <rect x="585" y="0" width="65" height="34" rx="4" fill="#DCFCE7" stroke="#10B981"/>
        <text x="617" y="21" fill="#064E3B" font-size="8" font-weight="700" text-anchor="middle">engine</text>
        <path d="M 652 17 L 663 17" stroke="#64748B" stroke-width="1.5"/>

        <!-- 9. finished -->
        <rect x="665" y="0" width="65" height="34" rx="4" fill="#DCFCE7" stroke="#10B981"/>
        <text x="697" y="21" fill="#064E3B" font-size="8" font-weight="700" text-anchor="middle">finished</text>
      </g>
      <text x="370" y="78" fill="#64748B" font-size="7.5" text-anchor="middle">
        A BlockingFailure on stage "execute" automatically sets blocker → Later stages (engine, finished) are gracefully SKIPPED.
      </text>
      <text x="370" y="92" fill="#2563EB" font-size="7.5" font-weight="600" text-anchor="middle">
        Individual checks (✔ / ✘) only record soft errors; the journey carries on uninterrupted.
      </text>
    </svg>
  </div>

  <!-- SECTION 6 -->
  <h2><span class="num">6</span> Step-by-Step Walkthrough of the 17 Modules</h2>
  <table>
    <thead>
      <tr>
        <th style="width: 4%;">#</th>
        <th style="width: 24%;">Module Name</th>
        <th style="width: 14%;">Stage Needed</th>
        <th style="width: 58%;">Operations Performed & Assertions Made</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>1</strong></td>
        <td><strong>Login Module</strong></td>
        <td><code>start</code></td>
        <td>Validates pre-auth UI elements, performs credentialed login, verifies authentication cookies, and confirms post-login landing on <code>/execution-assistant</code>.</td>
      </tr>
      <tr>
        <td><strong>2</strong></td>
        <td><strong>Assistant Home</strong></td>
        <td><code>login</code></td>
        <td>Validates Execution Assistant homepage, headline greeting, analysis cards, composer slash command menu, and header elements.</td>
      </tr>
      <tr>
        <td><strong>3</strong></td>
        <td><strong>Repo Connection</strong></td>
        <td><code>login</code></td>
        <td>Opens "Change repository / branch", chooses configured REPO from GitHub list, selects primary branch, ticks "On PR merge", and clicks Confirm.</td>
      </tr>
      <tr>
        <td><strong>4</strong></td>
        <td><strong>Coverage Preview</strong></td>
        <td><code>confirm</code></td>
        <td>Validates language detection, signal profile breakdown, test readiness cards, and advances through "Continue".</td>
      </tr>
      <tr>
        <td><strong>5</strong></td>
        <td><strong>Run Plan</strong></td>
        <td><code>plan</code></td>
        <td>Verifies generated Run plan, task checklist, taxonomy execution matrix, and configuration summary.</td>
      </tr>
      <tr>
        <td><strong>6</strong></td>
        <td><strong>Context Module</strong></td>
        <td><code>plan</code></td>
        <td>Inspects the Repository ready status bar, Source details drawer (commit SHA, branch availability), and configuration change history.</td>
      </tr>
      <tr>
        <td><strong>7</strong></td>
        <td><strong>Execution Pipeline</strong></td>
        <td><code>plan</code></td>
        <td>Triggered if <code>ALLOW_EXECUTE_RUN = Y</code>. Clicks "Execute run", monitors the live 8-stage pipeline progression (Queued → Publishing), and waits for completion (~15-20 min).</td>
      </tr>
      <tr>
        <td><strong>8</strong></td>
        <td><strong>Confidence Engine</strong></td>
        <td><code>finished</code></td>
        <td>Validates Confidence Score (/100), Verdict (Pass/Hold/Block), Whitebox score breakdown, tool execution cards, taxonomy gates, and tab drilldowns.</td>
      </tr>
      <tr>
        <td><strong>9</strong></td>
        <td><strong>Confidence Graph</strong></td>
        <td><code>finished</code></td>
        <td>Audits interactive SVG flow graph, historical score trend lines, node connections, and pipeline metrics.</td>
      </tr>
      <tr>
        <td><strong>10</strong></td>
        <td><strong>Confidence Object</strong></td>
        <td><code>finished</code></td>
        <td>Validates organization-level aggregations, repository risk summaries, open risks, and status pills.</td>
      </tr>
      <tr>
        <td><strong>11</strong></td>
        <td><strong>Latest Commit</strong></td>
        <td><code>finished</code></td>
        <td>If enabled, clones repository, pushes a dummy README commit, clicks "Analyze latest commit", and verifies incremental analysis.</td>
      </tr>
      <tr>
        <td><strong>12</strong></td>
        <td><strong>Runs Dashboard</strong></td>
        <td><code>login</code></td>
        <td>Inspects Runs Dashboard, historical table rows, pagination, branch filter dropdowns, and search controls.</td>
      </tr>
      <tr>
        <td><strong>13</strong></td>
        <td><strong>Account & Billing</strong></td>
        <td><code>login</code></td>
        <td>Checks user profile, organization details, token quotas, and Stripe checkout entry points (without performing payments).</td>
      </tr>
      <tr>
        <td><strong>14</strong></td>
        <td><strong>Support & Chat</strong></td>
        <td><code>login</code></td>
        <td>Tests Help Center menu, Customer Support chat widget triggers, ticket modal, and User Guide links without spamming support.</td>
      </tr>
      <tr>
        <td><strong>15</strong></td>
        <td><strong>Redirects & Security</strong></td>
        <td><code>login</code></td>
        <td>Tests route protection, 404 handlers, legacy address redirects, SCM integration paths, and invalid run ID shielding.</td>
      </tr>
      <tr>
        <td><strong>16</strong></td>
        <td><strong>Sign Out</strong></td>
        <td><code>login</code></td>
        <td>Opens sidebar user menu, clicks Sign Out, confirms alert dialog, and verifies session cookies are cleared.</td>
      </tr>
      <tr>
        <td><strong>17</strong></td>
        <td><strong>Sign Up Module</strong></td>
        <td><code>start</code></td>
        <td>Tests form validation and error handling on <code>/auth/register</code> without creating phantom user accounts.</td>
      </tr>
    </tbody>
  </table>

  <!-- SECTION 7 -->
  <h2><span class="num">7</span> Visual Evidence & Reporting Deliverables</h2>
  <p>Every test run automatically produces deliverables in two locations:</p>

  <h3>7.1 Timestamped Run Deliverable Folder: <code>results/run_&lt;timestamp&gt;/</code></h3>
  <ul>
    <li><strong><code>testable-results.xlsx</code></strong>: Fully formatted Excel report containing a dedicated <strong>Summary Tab</strong> (pass rates per module), with all passwords/secrets masked as <code>********</code>, and embedded screenshot thumbnails.</li>
    <li><strong><code>evidence/*.png</code></strong>: Full-resolution PNG screenshots. Every captured image features a <strong>green outline</strong> (passing check) or <strong>red outline</strong> (failed check), plus a bottom banner stating the exact Case ID and step.</li>
    <li><strong><code>playwright-report/index.html</code></strong>: Official Playwright interactive visual report.</li>
  </ul>

  <h3>7.2 In-Place Update to: <code>input/testable-input.xlsx</code></h3>
  <p>
    When <code>WRITE_RESULTS_TO_INPUT = Y</code>, the module sheets in your local input file (<code>Login</code>, <code>Repo</code>, etc.) are directly populated with the latest <strong>Actual Result</strong> text (✔/✘), <strong>Result</strong> (PASS/FAIL/SKIPPED), and screenshot links.
  </p>

  <!-- SECTION 8 -->
  <h2><span class="num">8</span> Troubleshooting & FAQ</h2>
  <table>
    <thead>
      <tr>
        <th style="width: 28%;">Symptom / Error</th>
        <th style="width: 28%;">Root Cause</th>
        <th style="width: 44%;">Exact Solution</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><code>'ts-node' is not recognized</code></td>
        <td><code>node_modules</code> dependencies not installed yet.</td>
        <td>Run <code>npm install</code> in your terminal from the project root directory.</td>
      </tr>
      <tr>
        <td><code>Executable doesn't exist at ...\\chrome.exe</code></td>
        <td>Playwright Chromium browser binaries missing.</td>
        <td>Run <code>npx playwright install chromium</code> to download the required binaries.</td>
      </tr>
      <tr>
        <td><code>Could not replace input/testable-input.xlsx - is it open in Excel?</code></td>
        <td>Windows file lock prevents writing while Excel has the file open.</td>
        <td>Save and close Microsoft Excel before running <code>npm test</code>.</td>
      </tr>
      <tr>
        <td>Downstream tests marked <code>SKIPPED (Blocked by EXE-001)</code></td>
        <td><code>ALLOW_EXECUTE_RUN</code> is set to <code>N</code>.</td>
        <td>Change <code>ALLOW_EXECUTE_RUN</code> to <code>Y</code> on the <code>Input</code> sheet to permit running real pipelines.</td>
      </tr>
      <tr>
        <td>Runs Dashboard shows <code>422</code> or 0 runs</td>
        <td>Configured repository/branch has never run an analysis before.</td>
        <td>Perform at least one full pipeline run (<code>ALLOW_EXECUTE_RUN = Y</code>). The Dashboard will automatically populate.</td>
      </tr>
      <tr>
        <td>Testing icon (🧪) not visible in editor sidebar</td>
        <td>Playwright extension not installed or icon hidden.</td>
        <td>Install <code>ms-playwright.playwright</code> via Extensions (Ctrl+Shift+X), or launch <code>npx playwright test --ui</code>.</td>
      </tr>
    </tbody>
  </table>

  <!-- FOOTER -->
  <div style="margin-top: 24px; padding-top: 8px; border-top: 1px solid #E2E8F0; text-align: center; color: #94A3B8; font-size: 7.5pt;">
    Testable Phase 2 E2E Automation Framework · Generated for Antigravity & VS Code Pair Programming Environment
  </div>

</body>
</html>
`;

async function generatePdf() {
  console.log('Launching Chromium to render PDF...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.setContent(htmlContent, { waitUntil: 'load' });
  await page.waitForTimeout(800); // let fonts and SVG settle

  console.log('Printing to PDF:', PDF_OUT);
  await page.pdf({
    path: PDF_OUT,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '12mm',
      bottom: '14mm',
      left: '12mm',
      right: '12mm',
    },
  });

  await browser.close();

  // Copy to artifacts directory
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.copyFileSync(PDF_OUT, ARTIFACT_PDF);
  console.log('Copied to artifact path:', ARTIFACT_PDF);
  console.log('PDF generation complete!');
}

generatePdf().catch((err) => {
  console.error('Error generating PDF:', err);
  process.exit(1);
});
