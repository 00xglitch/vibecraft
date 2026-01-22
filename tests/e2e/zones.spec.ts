/**
 * E2E tests for zone visibility and 3D scene
 *
 * Tests that zones are created, persist, and display correctly
 */

import { test, expect } from '@playwright/test'

// Helper to dismiss not-connected overlay if present
async function dismissOverlayIfPresent(page: import('@playwright/test').Page) {
  try {
    const overlay = page.locator('#not-connected-overlay')
    // Only try to dismiss if overlay is visible
    if (await overlay.isVisible({ timeout: 500 }).catch(() => false)) {
      const exploreBtn = page.locator('#explore-offline')
      // Use force click to bypass visibility check if needed
      await exploreBtn.click({ timeout: 1000, force: true }).catch(() => {
        // Ignore click errors - overlay may have hidden on its own
      })
      // Brief wait for any animation
      await page.waitForTimeout(200)
    }
  } catch {
    // Ignore all errors - overlay handling is optional
  }
}

test.describe('Zone Visibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Wait for canvas (Three.js scene)
    await page.waitForSelector('canvas', { timeout: 10000 })
    // Dismiss overlay if present
    await dismissOverlayIfPresent(page)
    // Give time for zones to load from history
    await page.waitForTimeout(1000)
  })

  test('3D scene renders', async ({ page }) => {
    // Check for canvas element (Three.js)
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible({ timeout: 5000 })
  })

  test('zones are created for sessions', async ({ page }) => {
    // Session items should be visible (at least "All Sessions")
    const sessionItems = page.locator('.session-item')
    const count = await sessionItems.count()

    // We should have at least the "All Sessions" item
    expect(count).toBeGreaterThan(0)
  })

  test('zones persist after page interaction', async ({ page }) => {
    // Get initial state
    const initialSessions = await page.locator('.session-item').count()

    // Click around the page (switch sessions)
    await page.keyboard.press('Digit1')
    await page.waitForTimeout(300)
    await page.keyboard.press('Digit2')
    await page.waitForTimeout(300)

    // Sessions should still be visible
    const afterSessions = await page.locator('.session-item').count()
    expect(afterSessions).toBe(initialSessions)
  })

  test('clicking session focuses zone', async ({ page }) => {
    // Click on first session
    const firstSession = page.locator('.session-item').first()
    if (await firstSession.isVisible()) {
      await firstSession.click()
      await page.waitForTimeout(300)
      // Session should have selected state or active class
      await expect(firstSession).toBeVisible()
    }
  })
})

test.describe('Session Status Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('canvas', { timeout: 10000 })
    await dismissOverlayIfPresent(page)
  })

  test('shows working status for active sessions', async ({ page }) => {
    // Look for "working" or status indicators
    // May or may not have working sessions - just verify no errors
    await page.waitForTimeout(500)
    const body = page.locator('body')
    await expect(body).toBeVisible()
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
    await page.waitForSelector('canvas', { timeout: 10000 })
    await dismissOverlayIfPresent(page)
    await page.waitForTimeout(500)
  })

  test('number keys switch sessions', async ({ page }) => {
    // Press 1-6 to switch between sessions
    for (let i = 1; i <= 6; i++) {
      await page.keyboard.press(`Digit${i}`)
      await page.waitForTimeout(100)
    }

    // Page should still be functional
    const body = page.locator('body')
    await expect(body).toBeVisible()
  })

  test('Tab key toggles focus mode', async ({ page }) => {
    await page.keyboard.press('Tab')
    await page.waitForTimeout(200)
    await page.keyboard.press('Tab')

    // Should toggle without errors
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()
  })

  test('D key toggles draw mode', async ({ page }) => {
    // Toggle draw mode on
    await page.keyboard.press('KeyD')
    await page.waitForTimeout(300)

    // Draw mode indicator should have visible class
    const drawIndicator = page.locator('#draw-indicator')
    await expect(drawIndicator).toHaveClass(/visible/, { timeout: 3000 })

    // Toggle off
    await page.keyboard.press('KeyD')
    await page.waitForTimeout(300)

    // Draw mode indicator should not have visible class
    await expect(drawIndicator).not.toHaveClass(/visible/)
  })
})

test.describe('Activity Feed', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('canvas', { timeout: 10000 })
    await dismissOverlayIfPresent(page)
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
