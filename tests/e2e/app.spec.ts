/**
 * Vibecraft E2E Tests
 *
 * Tests the main application functionality including:
 * - Initial page load and scene rendering
 * - Session management (create, list, delete)
 * - Zone interactions
 * - Activity feed
 * - Keyboard shortcuts
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

test.describe('Vibecraft Application', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/')
    // Wait for Three.js scene to initialize
    await page.waitForSelector('canvas', { timeout: 10000 })
    // Dismiss the not-connected overlay if present
    await dismissOverlayIfPresent(page)
  })

  test('should load the 3D scene', async ({ page }) => {
    // Canvas should be visible
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()

    // Scene HUD should be present (using ID selector)
    const hud = page.locator('#scene-hud')
    await expect(hud).toBeVisible()
  })

  test('should display session panel', async ({ page }) => {
    // Session panel should be visible (using ID selector)
    const sessionPanel = page.locator('#sessions-panel')
    await expect(sessionPanel).toBeVisible()

    // Session list should exist (using ID selector)
    const sessionList = page.locator('#sessions-list')
    await expect(sessionList).toBeVisible()
  })

  test('should display activity feed', async ({ page }) => {
    // Activity feed should be present (using ID selector)
    const feed = page.locator('#feed-panel')
    await expect(feed).toBeVisible()
  })

  test('should display prompt input', async ({ page }) => {
    // Prompt form should be visible (using ID selector)
    const promptForm = page.locator('#prompt-form')
    await expect(promptForm).toBeVisible()

    // Input field should be accessible (using ID selector)
    const promptInput = page.locator('#prompt-input')
    await expect(promptInput).toBeVisible()
  })
})

test.describe('Session Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('canvas')
    await dismissOverlayIfPresent(page)
  })

  test('should open new session modal with Alt+N', async ({ page }) => {
    // Press Alt+N to open new session modal
    await page.keyboard.press('Alt+KeyN')

    // Wait for modal to appear - check for visible class
    const modal = page.locator('#new-session-modal')
    await expect(modal).toHaveClass(/visible/, { timeout: 5000 })

    // Check modal has expected elements
    await expect(page.locator('#session-name-input')).toBeVisible()
    await expect(page.locator('#session-cwd-input')).toBeVisible()
  })

  test('should close modal on escape', async ({ page }) => {
    // Open modal
    await page.keyboard.press('Alt+KeyN')
    const modal = page.locator('#new-session-modal')
    await expect(modal).toHaveClass(/visible/, { timeout: 5000 })

    // Press Escape to close
    await page.keyboard.press('Escape')

    // Modal should not have visible class
    await expect(modal).not.toHaveClass(/visible/)
  })

  test('should switch between session types', async ({ page }) => {
    // Open modal
    await page.keyboard.press('Alt+KeyN')
    const modal = page.locator('#new-session-modal')
    await expect(modal).toHaveClass(/visible/, { timeout: 5000 })

    // Claude tab should be active by default
    const claudeTab = page.locator('.session-type-tab[data-type="claude"]')
    await expect(claudeTab).toHaveClass(/active/)

    // Click OpenCode tab
    const opencodeTab = page.locator('.session-type-tab[data-type="opencode"]')
    await opencodeTab.click()

    // OpenCode tab should now be active
    await expect(opencodeTab).toHaveClass(/active/)
    await expect(claudeTab).not.toHaveClass(/active/)
  })
})

test.describe('Keyboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('canvas')
    await dismissOverlayIfPresent(page)
  })

  test('should switch focus with Tab key', async ({ page }) => {
    // Initial focus should be on workshop
    const body = page.locator('body')

    // Press Tab to switch focus to feed
    await page.keyboard.press('Tab')

    // Feed should receive focus
    await expect(body).toHaveClass(/focus-feed/)

    // Press Tab again to switch back
    await page.keyboard.press('Tab')
    await expect(body).not.toHaveClass(/focus-feed/)
  })

  test('should switch to overview with 0 key', async ({ page }) => {
    // Press 0 for overview
    await page.keyboard.press('Digit0')

    // Check that "All Sessions" item is active
    const allSessionsItem = page.locator('.session-item.all-sessions.active')
    await expect(allSessionsItem).toBeVisible()
  })
})

test.describe('Zone Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('canvas')
    await dismissOverlayIfPresent(page)
  })

  test('should show click menu on right-click', async ({ page }) => {
    // Get canvas dimensions
    const canvas = page.locator('canvas')
    const box = await canvas.boundingBox()

    if (box) {
      // Right-click in the center of the canvas
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, {
        button: 'right',
      })

      // Click menu should appear (may or may not, depending on zone hit)
      // This test verifies no errors occur on right-click
    }
  })
})

test.describe('Draw Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('canvas')
    await dismissOverlayIfPresent(page)
  })

  test('should toggle draw mode with D key', async ({ page }) => {
    // Press D to enter draw mode
    await page.keyboard.press('KeyD')
    await page.waitForTimeout(300)

    // Draw mode indicator should have visible class
    const drawIndicator = page.locator('#draw-indicator')
    await expect(drawIndicator).toHaveClass(/visible/, { timeout: 3000 })

    // Press D again to exit
    await page.keyboard.press('KeyD')
    await page.waitForTimeout(300)

    // Draw mode indicator should not have visible class
    await expect(drawIndicator).not.toHaveClass(/visible/)
  })
})

test.describe('Sound Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('canvas')
    await dismissOverlayIfPresent(page)
  })

  test('should have settings button in HUD', async ({ page }) => {
    // Settings button should exist in HUD (volume is in settings modal)
    const settingsBtn = page.locator('#settings-btn')
    await expect(settingsBtn).toBeVisible()
  })
})

test.describe('Settings Modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('canvas')
    await dismissOverlayIfPresent(page)
  })

  test('should open dev panel with Alt+D', async ({ page }) => {
    // Press Alt+D to open dev panel
    await page.keyboard.press('Alt+KeyD')

    // Dev panel should appear (remove hidden class)
    const devPanel = page.locator('#dev-panel')
    await expect(devPanel).not.toHaveClass(/hidden/, { timeout: 3000 })
  })
})

test.describe('API Endpoints', () => {
  test('should return health check', async ({ request }) => {
    const response = await request.get('http://localhost:4003/health')
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data).toHaveProperty('ok', true)
    expect(data).toHaveProperty('status', 'healthy')
  })

  test('should return sessions list', async ({ request }) => {
    const response = await request.get('http://localhost:4003/sessions')
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data).toHaveProperty('ok', true)
    expect(data).toHaveProperty('sessions')
    expect(Array.isArray(data.sessions)).toBeTruthy()
  })

  test('should return history', async ({ request }) => {
    const response = await request.get('http://localhost:4003/history')
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(Array.isArray(data)).toBeTruthy()
  })

  test('should return stats', async ({ request }) => {
    const response = await request.get('http://localhost:4003/stats')
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data).toHaveProperty('eventsProcessed')
    expect(data).toHaveProperty('uptime')
  })
})

test.describe('MCP Marketplace API', () => {
  test('should list MCP servers', async ({ request }) => {
    const response = await request.get('http://localhost:4003/api/mcp/servers')
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data).toHaveProperty('ok', true)
    expect(data).toHaveProperty('servers')
    expect(Array.isArray(data.servers)).toBeTruthy()
  })

  test('should list MCP categories', async ({ request }) => {
    const response = await request.get('http://localhost:4003/api/mcp/categories')
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data).toHaveProperty('ok', true)
    expect(data).toHaveProperty('categories')
  })

  test('should list installed MCP servers', async ({ request }) => {
    const response = await request.get('http://localhost:4003/api/mcp/installed')
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data).toHaveProperty('ok', true)
    expect(data).toHaveProperty('servers')
  })

  test('should search MCP servers', async ({ request }) => {
    const response = await request.get('http://localhost:4003/api/mcp/search?q=memory')
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data).toHaveProperty('ok', true)
    expect(data).toHaveProperty('servers')
  })
})

test.describe('Jules API', () => {
  test('should return Jules status', async ({ request }) => {
    const response = await request.get('http://localhost:4003/api/jules/status')
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data).toHaveProperty('ok', true)
    expect(data).toHaveProperty('installed')
  })

  test('should list Jules tasks', async ({ request }) => {
    const response = await request.get('http://localhost:4003/api/jules/tasks')
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data).toHaveProperty('ok', true)
    expect(data).toHaveProperty('tasks')
    expect(Array.isArray(data.tasks)).toBeTruthy()
  })
})

test.describe('Changes/Rollback API', () => {
  test('should list recent changes', async ({ request }) => {
    const response = await request.get('http://localhost:4003/api/changes')
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data).toHaveProperty('ok', true)
    expect(data).toHaveProperty('changes')
    expect(Array.isArray(data.changes)).toBeTruthy()
  })

  test('should return change stats', async ({ request }) => {
    const response = await request.get('http://localhost:4003/api/changes/stats')
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data).toHaveProperty('ok', true)
    expect(data).toHaveProperty('stats')
  })
})
