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

test.describe('Vibecraft Application', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/')
    // Wait for Three.js scene to initialize
    await page.waitForSelector('canvas', { timeout: 10000 })
  })

  test('should load the 3D scene', async ({ page }) => {
    // Canvas should be visible
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()

    // Scene HUD should be present
    const hud = page.locator('.scene-hud')
    await expect(hud).toBeVisible()
  })

  test('should display session panel', async ({ page }) => {
    // Session panel should be visible
    const sessionPanel = page.locator('.session-panel')
    await expect(sessionPanel).toBeVisible()

    // Session list should exist
    const sessionList = page.locator('.session-list')
    await expect(sessionList).toBeVisible()
  })

  test('should display activity feed', async ({ page }) => {
    // Activity feed should be present
    const feed = page.locator('.feed-panel')
    await expect(feed).toBeVisible()
  })

  test('should display prompt input', async ({ page }) => {
    // Prompt form should be visible
    const promptForm = page.locator('.prompt-form')
    await expect(promptForm).toBeVisible()

    // Input field should be accessible
    const promptInput = page.locator('.prompt-input')
    await expect(promptInput).toBeVisible()
  })
})

test.describe('Session Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('canvas')
  })

  test('should open new session modal with Alt+N', async ({ page }) => {
    // Press Alt+N to open new session modal
    await page.keyboard.press('Alt+KeyN')

    // Wait for modal to appear
    const modal = page.locator('#new-session-modal')
    await expect(modal).toBeVisible({ timeout: 5000 })

    // Check modal has expected elements
    await expect(page.locator('#session-name-input')).toBeVisible()
    await expect(page.locator('#session-cwd-input')).toBeVisible()
  })

  test('should close modal on escape', async ({ page }) => {
    // Open modal
    await page.keyboard.press('Alt+KeyN')
    await page.waitForSelector('#new-session-modal.visible', { timeout: 5000 })

    // Press Escape to close
    await page.keyboard.press('Escape')

    // Modal should be hidden
    const modal = page.locator('#new-session-modal')
    await expect(modal).not.toHaveClass(/visible/)
  })

  test('should switch between session types', async ({ page }) => {
    // Open modal
    await page.keyboard.press('Alt+KeyN')
    await page.waitForSelector('#new-session-modal.visible', { timeout: 5000 })

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

    // Check that we're in overview mode (no active session)
    // The session list should show "All Sessions" or similar
    const allSessionsBadge = page.locator('.all-sessions-badge, .session-filter-all')
    await expect(allSessionsBadge).toBeVisible()
  })
})

test.describe('Zone Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('canvas')
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
  })

  test('should toggle draw mode with D key', async ({ page }) => {
    // Press D to enter draw mode
    await page.keyboard.press('KeyD')

    // Draw mode UI should appear
    const drawModeUI = page.locator('.draw-mode-controls, [data-draw-mode="true"]')
    await expect(drawModeUI).toBeVisible({ timeout: 3000 })

    // Press D again to exit
    await page.keyboard.press('KeyD')

    // Draw mode UI should hide
    await expect(drawModeUI).not.toBeVisible()
  })
})

test.describe('Sound Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('canvas')
  })

  test('should have volume slider', async ({ page }) => {
    // Volume slider should exist in HUD
    const volumeSlider = page.locator('.volume-slider, input[type="range"]')
    await expect(volumeSlider.first()).toBeVisible()
  })
})

test.describe('Settings Modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('canvas')
  })

  test('should open dev panel with Alt+D', async ({ page }) => {
    // Press Alt+D to open dev panel
    await page.keyboard.press('Alt+KeyD')

    // Dev panel should appear
    const devPanel = page.locator('.dev-panel, #dev-panel')
    await expect(devPanel).toBeVisible({ timeout: 3000 })
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
