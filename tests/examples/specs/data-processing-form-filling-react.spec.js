/**
 * Playwright tests for data-processing/form-filling-react example
 * Covers window.agentlet.forms.fill() writing into a React 18 controlled
 * form (loaded from a CDN) through the native property setter, so React's
 * own change detection picks up the new value.
 *
 * Also exercises the "naive fill" control on the page, which reproduces the
 * bug FormFiller had before it started using the native setter (plain
 * `element.value = x` plus manually-dispatched events): that path must
 * still leave the React state untouched, proving the contrast is real and
 * that `agentlet.forms.fill()` is doing something the plain DOM API does
 * not.
 *
 * Skipped (not failed) when the React CDN is unreachable from the test
 * environment, since that is an environment/network condition rather than a
 * bug in the example or in FormFiller.
 */

import { test, expect } from '@playwright/test';
import { AgentletTestBase } from '../utils/AgentletTestBase.js';

test.describe('Fill a React Controlled Form Example', () => {
  let agentletTest;

  test.beforeEach(async ({ page }) => {
    agentletTest = new AgentletTestBase(page);
    agentletTest.setupConsoleLogging();
    await agentletTest.navigateToExample('data-processing/form-filling-react.html');

    const reactAvailable = await page.waitForFunction(
      () => !!(window.React && window.ReactDOM),
      { timeout: 5000 }
    ).then(() => true).catch(() => false);

    test.skip(!reactAvailable, 'React CDN (cdnjs.cloudflare.com) unreachable from this environment');
  });

  test('should load the form-filling-react page correctly', async ({ page }) => {
    await expect(page).toHaveTitle(/Fill a React controlled form - Agentlet Core Example/);
    await expect(page.locator('h1')).toContainText('Fill a React controlled form');
    await expect(page.locator('#initBtn')).toBeVisible();
    await expect(page.locator('#fillBuggyBtn')).toBeVisible();
    await expect(page.locator('#fillCorrectBtn')).toBeVisible();
  });

  test('agentlet.forms.fill() updates the React controlled form state', async ({ page }) => {
    await page.locator('#initBtn').click();
    await agentletTest.waitForAgentletCore();

    await expect(page.locator('#reactControlledForm')).toBeVisible();

    // Starts empty/unchecked.
    await expect(page.locator('#reactName')).toHaveValue('');
    await expect(page.locator('#reactSubscribe')).not.toBeChecked();

    await page.locator('#fillCorrectBtn').click();

    // The DOM reflects the fill...
    await expect(page.locator('#reactName')).toHaveValue('Jordan Rivers');
    await expect(page.locator('#reactBio')).toHaveValue('Loves testing controlled forms.');
    await expect(page.locator('#reactRating')).toHaveValue('gold');
    await expect(page.locator('#reactSubscribe')).toBeChecked();

    // ...and, crucially, so does React's own state (printed via a
    // useEffect that only runs when state actually changes), proving the
    // update went through React's change detection and not just the DOM.
    await expect(page.locator('#reactStateOutput')).toContainText('Jordan Rivers');
    await expect(page.locator('#reactStateOutput')).toContainText('Loves testing controlled forms.');
    await expect(page.locator('#reactStateOutput')).toContainText('"rating": "gold"');
    await expect(page.locator('#reactStateOutput')).toContainText('"subscribe": true');
  });

  test('a naive plain-DOM fill (the pre-fix behavior) leaves the React state untouched', async ({ page }) => {
    await page.locator('#initBtn').click();
    await agentletTest.waitForAgentletCore();

    await expect(page.locator('#reactControlledForm')).toBeVisible();

    await page.locator('#fillBuggyBtn').click();

    // The plain DOM assignment does land in the input's .value / .checked...
    await expect(page.locator('#reactName')).toHaveValue('Naive Nelson');
    await expect(page.locator('#reactSubscribe')).toBeChecked();

    // ...but React's own state (the source of truth for a controlled
    // component) never saw the change, since the instance-level value
    // tracker React installs absorbed the plain assignment. This is
    // exactly the bug that used to affect window.agentlet.forms.fill()
    // before it started writing through the native property setter (and,
    // for the checkbox, before it started also dispatching a "click" event).
    await expect(page.locator('#reactStateOutput')).not.toContainText('Naive Nelson');
    await expect(page.locator('#reactStateOutput')).toContainText('"name": ""');
    await expect(page.locator('#reactStateOutput')).toContainText('"bio": ""');
    await expect(page.locator('#reactStateOutput')).toContainText('"subscribe": false');
  });
});
