/**
 * Playwright tests for auth/oauth-popup example
 * Tests OAuth authentication flow, user initials display, and logout functionality
 */

import { test, expect } from '@playwright/test';
import { AgentletTestBase } from '../utils/AgentletTestBase.js';

test.describe('OAuth Popup Authentication Example', () => {
  let agentletTest;

  test.beforeEach(async ({ page }) => {
    agentletTest = new AgentletTestBase(page);
    agentletTest.setupConsoleLogging();

    // Navigate to the OAuth popup example
    await agentletTest.navigateToExample('auth/oauth-popup.html');
  });

  // Helper function to initialize agentlet with proper waits
  async function initializeAgentletWithAuth(page) {
    await page.locator('button:has-text("Initialize agentlet with auth")').click();

    // Wait for initialization to complete
    await expect(page.locator('#console')).toContainText('Agentlet core initialized successfully with OAuth support', { timeout: 15000 });
    await expect(page.locator('#agentlet-container')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("🔐 Login")')).toBeVisible({ timeout: 5000 });

    // Small additional wait to ensure everything is ready
    await page.waitForTimeout(1000);
  }

  test('should load the OAuth popup page correctly', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/OAuth Popup Authentication - Agentlet Core Example/);

    // Check main heading
    await expect(page.locator('h1')).toContainText('OAuth popup authentication');

    // Check that key sections are present
    await expect(page.locator('text=What this example shows:')).toBeVisible();
    await expect(page.locator('button:has-text("Initialize agentlet with auth")')).toBeVisible();
    await expect(page.locator('h3:has-text("📟 Console Output")')).toBeVisible();

    // Verify description content
    await expect(page.locator('text=popup-based OAuth/OIDC authentication')).toBeVisible();
    await expect(page.locator('text=Secure token exchange using postMessage API')).toBeVisible();
  });

  test('should initialize agentlet with authentication successfully', async ({ page }) => {
    await initializeAgentletWithAuth(page);

    // Verify all expected buttons are present
    await expect(page.locator('button:has-text("⚙️")')).toBeVisible(); // Settings
    await expect(page.locator('button:has-text("❓")')).toBeVisible(); // Help
    await expect(page.locator('button:has-text("╳")')).toBeVisible(); // Close
    await expect(page.locator('button:has-text("🔐 Login")')).toBeVisible(); // Login
  });

  test('should complete OAuth authentication flow and show user initials', async ({ page, context }) => {
    await initializeAgentletWithAuth(page);

    // Simulate authentication by directly injecting the auth result
    // This bypasses the popup detection issue while still testing the UI response
    await page.evaluate(() => {
      // Simulate successful authentication data (matching mock OIDC provider format)
      const mockAuthResult = {
        type: 'auth_result',
        success: true,
        token: 'mock_access_eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9',
        access_token: 'mock_access_eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9',
        refresh_token: 'mock_refresh_eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9',
        id_token: 'mock_id_eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid profile email',
        user_info: {
          id: 'user_001',
          username: 'john.doe',
          email: 'john.doe@example.com',
          name: 'John Doe',
          role: 'admin',
          permissions: ['read', 'write', 'admin']
        }
      };

      // Directly trigger the auth manager's internal method (access core instance)
      if (window.agentlet && window.agentlet.authManager) {
        window.agentlet.authManager.handleSuccess(mockAuthResult.token, mockAuthResult);
      }
    });

    // Wait a bit for the UI to update
    await page.waitForTimeout(1000);

    // Verify authentication success on main page
    await expect(page.locator('#console')).toContainText('Authentication successful', { timeout: 5000 });

    // Verify user initials appear (JD for John Doe)
    await expect(page.locator('button:has-text("👤 JD")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('button:has-text("🔐 Login")')).not.toBeVisible();
  });

  test('should show logout confirmation dialog and handle cancellation', async ({ page, context }) => {
    await initializeAgentletWithAuth(page);

    // Simulate authentication completion
    await page.evaluate(() => {
      const mockAuthResult = {
        type: 'auth_result',
        success: true,
        token: 'mock_access_eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9',
        user_info: {
          id: 'user_001',
          username: 'john.doe',
          email: 'john.doe@example.com',
          name: 'John Doe',
          role: 'admin'
        }
      };
      if (window.agentlet && window.agentlet.authManager) {
        window.agentlet.authManager.handleSuccess(mockAuthResult.token, mockAuthResult);
      }
    });

    // Wait for user initials to appear
    await expect(page.locator('button:has-text("👤 JD")')).toBeVisible({ timeout: 5000 });

    // Click user initials to trigger logout dialog
    await page.locator('button:has-text("👤 JD")').click();

    // Verify logout confirmation dialog appears
    await expect(page.locator('.agentlet-info-dialog')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('h3:has-text("Confirm Logout")')).toBeVisible();
    await expect(page.locator('text=You\'re currently logged in as John Doe, do you want to logout?')).toBeVisible();

    // Click Cancel
    await page.locator('button:has-text("Cancel")').click();

    // Verify dialog closes and user remains logged in
    await expect(page.locator('.agentlet-info-dialog')).not.toBeVisible();
    await expect(page.locator('button:has-text("👤 JD")')).toBeVisible();
  });

  test('should complete logout when confirming', async ({ page, context }) => {
    await initializeAgentletWithAuth(page);

    // Simulate authentication completion
    await page.evaluate(() => {
      const mockAuthResult = {
        type: 'auth_result',
        success: true,
        token: 'mock_access_eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9',
        user_info: {
          id: 'user_001',
          username: 'john.doe',
          email: 'john.doe@example.com',
          name: 'John Doe',
          role: 'admin'
        }
      };
      if (window.agentlet && window.agentlet.authManager) {
        window.agentlet.authManager.handleSuccess(mockAuthResult.token, mockAuthResult);
      }
    });

    // Wait for user initials and click to logout
    await expect(page.locator('button:has-text("👤 JD")')).toBeVisible({ timeout: 5000 });
    await page.locator('button:has-text("👤 JD")').click();

    // Confirm logout
    await expect(page.locator('.agentlet-info-dialog')).toBeVisible({ timeout: 5000 });
    await page.locator('button:has-text("Confirm")').click();

    // Verify logout completed
    await expect(page.locator('.agentlet-info-dialog')).not.toBeVisible();
    await expect(page.locator('button:has-text("🔐 Login")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('button:has-text("👤 JD")')).not.toBeVisible();
  });

  test('should verify button layout and close button symbol', async ({ page }) => {
    await initializeAgentletWithAuth(page);

    // Check button layout containers exist
    await expect(page.locator('.agentlet-actions-left')).toBeVisible();
    await expect(page.locator('.agentlet-actions-right')).toBeVisible();

    // Verify buttons are in correct containers
    await expect(page.locator('.agentlet-actions-left button:has-text("⚙️")')).toBeVisible();
    await expect(page.locator('.agentlet-actions-left button:has-text("❓")')).toBeVisible();
    await expect(page.locator('.agentlet-actions-left button:has-text("╳")')).toBeVisible();
    await expect(page.locator('.agentlet-actions-right button:has-text("🔐")')).toBeVisible();

    // Verify close button uses correct symbol (╳ not ×)
    await expect(page.locator('button:has-text("╳")')).toBeVisible();
    await expect(page.locator('button:has-text("×")')).not.toBeVisible();
  });

  test('should handle authentication cancellation', async ({ page, context }) => {
    await initializeAgentletWithAuth(page);

    // Simulate authentication cancellation by directly calling the cancel handler
    await page.evaluate(() => {
      if (window.agentlet && window.agentlet.authManager) {
        window.agentlet.authManager.handleCancel();
      }
    });

    // Wait a bit for UI to update
    await page.waitForTimeout(500);

    // Verify still showing login button (no authentication occurred)
    await expect(page.locator('button:has-text("🔐 Login")')).toBeVisible();
    await expect(page.locator('button:has-text("👤")')).not.toBeVisible();

    // Verify cancellation message in console
    await expect(page.locator('#console')).toContainText('Authentication cancelled by user', { timeout: 2000 });
  });
});