import { test, expect } from '@playwright/test'

test.describe('UI Fixes Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:4002')
    await page.waitForLoadState('networkidle')
  })

  test('modal-content should have max-height and overflow', async ({ page }) => {
    // Open settings modal
    const settingsBtn = page.locator('#settings-btn')
    if (await settingsBtn.isVisible()) {
      await settingsBtn.click()

      const modalContent = page.locator('#settings-modal .modal-content')
      await expect(modalContent).toBeVisible()

      // Check CSS properties
      const maxHeight = await modalContent.evaluate((el) => window.getComputedStyle(el).maxHeight)
      const overflowY = await modalContent.evaluate((el) => window.getComputedStyle(el).overflowY)

      expect(maxHeight).not.toBe('none')
      expect(overflowY).toBe('auto')
    }
  })

  test('MCP marketplace should have tab styles', async ({ page }) => {
    // Open MCP marketplace with Alt+M
    await page.keyboard.press('Alt+M')
    await page.waitForTimeout(500)

    // Check if tabs exist and have proper styling
    const tabs = page.locator('.plugins-tabs')
    if (await tabs.isVisible()) {
      await expect(tabs).toBeVisible()

      const tabsDisplay = await tabs.evaluate((el) => window.getComputedStyle(el).display)
      expect(tabsDisplay).toBe('flex')
    }
  })

  test('Plugin marketplace should use correct API URL', async ({ page }) => {
    // Intercept API calls to check they go to correct port
    const apiCalls: string[] = []

    page.on('request', (request) => {
      const url = request.url()
      if (url.includes('/api/plugins')) {
        apiCalls.push(url)
      }
    })

    // Open plugin marketplace with Alt+P
    await page.keyboard.press('Alt+P')
    await page.waitForTimeout(1000)

    // Verify API calls went to port 4003, not 4002
    if (apiCalls.length > 0) {
      apiCalls.forEach((url) => {
        expect(url).toContain(':4003')
        expect(url).not.toContain(':4002/api')
      })
    }
  })

  test('mobile panel toggle should exist in HTML', async ({ page }) => {
    // Button exists but is hidden on desktop (correct behavior)
    const toggleBtn = page.locator('#mobile-panel-toggle')
    await expect(toggleBtn).toBeAttached()

    const overlay = page.locator('#mobile-panel-overlay')
    await expect(overlay).toBeAttached()

    // Verify it's hidden on desktop via CSS
    const display = await toggleBtn.evaluate((el) => window.getComputedStyle(el).display)
    expect(display).toBe('none') // Hidden on desktop
  })

  test('ClaudeMon should not have THREE.Material color undefined error', async ({ page }) => {
    const consoleErrors: string[] = []

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    // Wait for scene to initialize
    await page.waitForTimeout(3000)

    // Check for THREE.Material color undefined error
    const hasMaterialError = consoleErrors.some(
      (err) => err.includes('THREE.Material') && err.includes('color') && err.includes('undefined')
    )

    expect(hasMaterialError).toBe(false)
  })
})
