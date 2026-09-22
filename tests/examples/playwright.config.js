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

export default defineConfig({
  // Test directory
  testDir: './specs',
  
  // Run tests in files in parallel
  fullyParallel: true,
  
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,
  
  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Limit parallelism on CI (shared runners), but don't fully serialize:
  // with 152 tests per project this keeps total wall-clock time within
  // globalTimeout. See .github/WORKFLOWS.md for the full reasoning.
  workers: process.env.CI ? 2 : undefined,
  
  // Reporter to use
  reporter: [
    ['html', { outputFolder: 'test-results/html-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list']
  ],
  
  // Shared settings for all the projects below
  use: {
    // Base URL for tests
    baseURL: 'http://localhost:3030',

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
    command: 'python3 -m http.server 3030',
    port: 3030,
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
  
  // Timeout for the whole test run: 3 projects (chromium, firefox, webkit)
  // x 153 tests each = 459 tests. Measured at roughly 23 minutes with two
  // workers, which is what both a 4-core CI runner and a typical developer
  // machine end up using. This is a safety net against a hung run, not a
  // target, so the budget is deliberately generous and identical everywhere
  // (an earlier 15-minute local budget cut the suite off mid-run). See
  // .github/WORKFLOWS.md for the full reasoning.
  globalTimeout: 2700000, // 45 minutes
  
  // Expect configuration
  expect: {
    // Default timeout for expect() assertions
    timeout: 5000
  }
});