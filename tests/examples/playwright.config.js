/**
 * Playwright configuration for Agentlet Core examples testing
 */

import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// Find the project root directory (contains package.json)
function findProjectRoot() {
  let projectRoot = process.cwd();
  while (projectRoot !== '/' && !fs.existsSync(path.join(projectRoot, 'package.json'))) {
    projectRoot = path.dirname(projectRoot);
  }
  return projectRoot;
}

// Port the local static server (and every test baseURL) binds to. Configurable
// via E2E_PORT so two worktrees on the same machine can each run their own
// e2e suite without one's `reuseExistingServer: true` picking up the other's
// server and silently testing the wrong checkout. CI always uses the default.
// See .github/WORKFLOWS.md for the full reasoning.
const PORT = Number(process.env.E2E_PORT) || 3030;

export default defineConfig({
  // Test directory
  testDir: './specs',
  
  // Run tests in files in parallel
  fullyParallel: true,
  
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,
  
  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // CI now runs each Playwright project (chromium/firefox/webkit) as its own
  // matrix job (see .github/workflows/test.yml), so a job only ever runs one
  // browser's ~153 tests instead of all three. That leaves the whole 4 vCPU
  // runner free for a single project, so workers go up to 4. Override with
  // E2E_WORKERS if a specific job needs a different value. See
  // .github/WORKFLOWS.md for the full reasoning.
  workers: process.env.CI ? (Number(process.env.E2E_WORKERS) || 4) : undefined,
  
  // Reporter to use
  reporter: [
    ['html', { outputFolder: 'test-results/html-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list']
  ],
  
  // Shared settings for all the projects below
  use: {
    // Base URL for tests
    baseURL: `http://localhost:${PORT}`,

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Disable video recording
    video: 'off',

    // Take screenshot on failure
    screenshot: 'only-on-failure',

    // Timeout for each action (e.g. click, fill, etc.)
    actionTimeout: 10000
  },

  // Timeout for a single test. This lived inside `use` as `testTimeout`,
  // where Playwright ignores it; it belongs at the top level.
  timeout: 30000,

  // Configure projects for major browsers.
  // A 4th "chromium-headed" project (headed Chromium with a 1s slowMo)
  // used to live here as a local debugging aid. It ran the exact same 152
  // tests as "chromium" a second time (in CI headless with no slowMo, i.e.
  // truly identical to "chromium"), which both inflated CI runtime for no
  // extra coverage and made a full local run of this file dramatically
  // slower because of the 1s-per-action slowMo. It was removed: the same
  // headed/slowed-down debugging experience is available for any project
  // via `npm run test:examples:visible` (`--headed`) and
  // `npm run test:examples:debug`. See .github/WORKFLOWS.md for details.
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        headless: process.env.CI ? true : undefined, // Force headless in CI
        launchOptions: {
          args: ['--disable-popup-blocking', '--disable-web-security']
        }
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        headless: process.env.CI ? true : undefined, // Force headless in CI
      },
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        headless: process.env.CI ? true : undefined, // Force headless in CI
      },
    }
  ],

  // Run your local dev server before starting the tests
  webServer: {
    command: `python3 -m http.server ${PORT}`,
    port: PORT,
    timeout: 10000,
    reuseExistingServer: true,
    cwd: findProjectRoot()
  },
  
  // Output directory for test artifacts
  outputDir: 'test-results/artifacts',
  
  // Global setup files
  globalSetup: require.resolve('./setup/global-setup.js'),
  
  // Test match patterns
  testMatch: '**/*.spec.js',
  
  // Timeout for the whole test run. On CI this config is now invoked once
  // per Playwright project (chromium, firefox, webkit) as a separate matrix
  // job in .github/workflows/test.yml, so a single CI run covers ~153 tests
  // rather than all 459, at 4 workers on a 4 vCPU runner: 20 minutes leaves
  // comfortable margin above the previous full-suite (3 projects, 2 workers)
  // reference point of roughly 22 minutes. Locally this file still runs all
  // three projects in one invocation, so it keeps the older, more generous
  // 45-minute budget; it's a safety net against a hung run, not a target
  // (an earlier 15-minute local budget cut the suite off mid-run). See
  // .github/WORKFLOWS.md for the full reasoning.
  globalTimeout: process.env.CI ? 1200000 : 2700000, // 20 min CI, 45 min local
  
  // Expect configuration
  expect: {
    // Default timeout for expect() assertions
    timeout: 5000
  }
});