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
  
  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,
  
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
    actionTimeout: 10000,

    // Global test timeout
    testTimeout: 30000
  },

  // Configure projects for major browsers
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
    },
    {
      name: 'chromium-headed',
      use: { 
        ...devices['Desktop Chrome'],
        headless: process.env.CI ? true : false, // Always headless in CI, headed locally
        slowMo: process.env.CI ? 0 : 1000, // No delay in CI
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
  
  // Timeout for the whole test run
  globalTimeout: 300000, // 5 minutes
  
  // Expect configuration
  expect: {
    // Default timeout for expect() assertions
    timeout: 5000
  }
});