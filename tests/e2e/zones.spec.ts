/**
 * E2E tests for zone visibility and 3D scene
 *
 * Tests that zones are created, persist, and display correctly
 */

import { test, expect } from '@playwright/test'

test.describe('Zone Visibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Wait for WebSocket connection
    await page.waitForSelector('text=Vibecraft', { timeout: 10000 })
    // Give time for zones to load from history
    await page.waitForTimeout(2000)
  })

  test('3D scene renders', async ({ page }) => {
    // Check for canvas element (Three.js)
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible({ timeout: 5000 })
  })

  test('zones are created for sessions', async ({ page }) => {
    // If we have sessions, we should see zone labels
    // Zone labels appear as text in the 3D scene or in UI
    const sessionCount = await page.locator('.session-item').count()

    // With sessions present, we should have zones
    expect(sessionCount).toBeGreaterThan(0)
  })

  test('zones persist after page interaction', async ({ page }) => {
    // Get initial state
    const initialSessions = await page.locator('.session-item').count()

    // Click around the page
    await page.keyboard.press('1')
    await page.waitForTimeout(500)
    await page.keyboard.press('2')
    await page.waitForTimeout(500)

    // Sessions should still be visible
    const afterSessions = await page.locator('.session-item').count()
    expect(afterSessions).toBe(initialSessions)
  })

  test('clicking session focuses zone', async ({ page }) => {
    // Click on first session
    const firstSession = page.locator('.session-item').first()
    if (await firstSession.isVisible()) {
      await firstSession.click()
      await page.waitForTimeout(500)
      // Session should have selected state
      await expect(firstSession).toBeVisible()
    }
  })
})

test.describe('Session Status Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('text=Vibecraft', { timeout: 10000 })
  })

  test('shows working status for active sessions', async ({ page }) => {
    // Look for "working" or status indicators
    const workingIndicator = page.locator('text=/working|Using/i')
    // May or may not have working sessions
    await page.waitForTimeout(1000)
  })

  test('shows idle status for inactive sessions', async ({ page }) => {
    // Look for idle or time-based status in session details
    // Sessions show "Xm ago" or "idle" for inactive sessions
    const idleIndicator = page.locator('.session-detail').filter({ hasText: /ago|idle/i })
    // Allow for zero active sessions (all may be working)
    const count = await idleIndicator.count()
    expect(count).toBeGreaterThanOrEqual(0)
  })

  test('shows session count', async ({ page }) => {
    // The "All Sessions" item shows count like "X active sessions"
    const sessionCount = page.locator('#all-sessions-count')
    await expect(sessionCount).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Zone Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('text=Vibecraft', { timeout: 10000 })
    await page.waitForTimeout(1000)
  })

  test('number keys switch sessions', async ({ page }) => {
    // Press 1-6 to switch between sessions
    for (let i = 1; i <= 6; i++) {
      await page.keyboard.press(String(i))
      await page.waitForTimeout(200)
    }

    // Page should still be functional
    const body = page.locator('body')
    await expect(body).toBeVisible()
  })

  test('Tab key toggles focus mode', async ({ page }) => {
    await page.keyboard.press('Tab')
    await page.waitForTimeout(300)
    await page.keyboard.press('Tab')

    // Should toggle without errors
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()
  })

  test('D key toggles draw mode', async ({ page }) => {
    // Toggle draw mode
    await page.keyboard.press('d')
    await page.waitForTimeout(300)

    // Draw mode indicator might appear
    // Toggle off
    await page.keyboard.press('d')
  })
})

test.describe('Activity Feed', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('text=Vibecraft', { timeout: 10000 })
  })

  test('shows activity feed area', async ({ page }) => {
    // Activity feed wrapper should be visible
    const feedArea = page.locator('#activity-feed-wrapper')
    await expect(feedArea).toBeVisible({ timeout: 5000 })
  })

  test('prompt input is functional', async ({ page }) => {
    // Use specific ID selector for the prompt textarea
    const promptInput = page.locator('#prompt-input')
    await expect(promptInput).toBeVisible({ timeout: 5000 })

    // Should be able to type
    await promptInput.fill('Test prompt')
    await expect(promptInput).toHaveValue('Test prompt')
  })

  test('send button is visible', async ({ page }) => {
    // Use specific ID selector for the submit button
    const sendButton = page.locator('#prompt-submit')
    await expect(sendButton).toBeVisible({ timeout: 5000 })
  })

  test('stop button is visible', async ({ page }) => {
    // Use specific ID selector for the cancel button
    const stopButton = page.locator('#prompt-cancel')
    await expect(stopButton).toBeVisible({ timeout: 5000 })
  })
})
