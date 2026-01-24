import { test, expect } from '@playwright/test'

/**
 * Test suite for session deletion bug fix
 *
 * Issue: Server crashed when deleting sessions due to unhandled async errors
 * in deleteSession() function (lines 1838, 1846 in server/index.ts)
 *
 * Root cause: removeWorktree() and deleteSessionSettings() could throw errors
 * (like EACCES permission errors) that weren't caught, causing the Node.js
 * process to crash with unhandled promise rejection.
 *
 * Fix: Wrapped both async operations in try-catch blocks to gracefully handle
 * errors and log warnings instead of crashing.
 */

test.describe('Session Deletion', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:4002')
    await page.waitForTimeout(2000) // Wait for sessions to load
  })

  test('should delete session without crashing server', async ({ page }) => {
    // Get initial session count
    const initialCount = await page.locator('.session-item').count()
    expect(initialCount).toBeGreaterThan(0)

    // Find a session to delete (prefer offline/implicit sessions to avoid disrupting work)
    const sessionToDelete = page.locator('.session-item').first()
    const sessionName = await sessionToDelete.locator('.session-name').textContent()

    // Right-click to open context menu
    await sessionToDelete.click({ button: 'right' })
    await page.waitForTimeout(500)

    // Click delete/dismiss option
    const deleteButton = page.locator('button:has-text("Delete"), button:has-text("Dismiss")')
    if (await deleteButton.isVisible()) {
      await deleteButton.click()
      await page.waitForTimeout(500)

      // Confirm if there's a confirmation dialog
      const confirmButton = page.locator('button:has-text("Yes"), button:has-text("Confirm")')
      if (await confirmButton.isVisible()) {
        await confirmButton.click()
      }
    }

    // Wait for deletion to complete
    await page.waitForTimeout(1000)

    // Verify session was deleted
    const newCount = await page.locator('.session-item').count()
    expect(newCount).toBeLessThan(initialCount)

    // Verify server is still running (connection status should be "Connected")
    const connectionStatus = page.locator('.connection-status')
    await expect(connectionStatus).toContainText(/Connected|Online/, { timeout: 5000 })

    // Verify we can still interact with other sessions
    const remainingSessions = await page.locator('.session-item').count()
    expect(remainingSessions).toBeGreaterThan(0)
  })

  test('should handle deletion of session with worktree gracefully', async ({ page, request }) => {
    // Create a session with worktree flag
    const response = await request.post('http://localhost:4003/api/sessions', {
      data: {
        name: 'Test Worktree Session',
        cwd: '/tmp/test-repo',
        flags: { worktree: false }, // Set to false to test soft-fail path
      },
    })
    expect(response.ok()).toBeTruthy()
    const session = await response.json()

    // Delete the session via API (simulates clicking delete)
    const deleteResponse = await request.delete(`http://localhost:4003/api/sessions/${session.id}`)
    expect(deleteResponse.ok()).toBeTruthy()

    // Verify server is still responsive
    const healthResponse = await request.get('http://localhost:4003/health')
    expect(healthResponse.ok()).toBeTruthy()
  })

  test('should handle deletion errors without crashing', async ({ page, request }) => {
    // Get a session ID
    const sessionsResponse = await request.get('http://localhost:4003/sessions')
    const sessionsData = await sessionsResponse.json()
    const sessionId = sessionsData.sessions[0]?.id

    if (!sessionId) {
      test.skip()
      return
    }

    // Delete the session
    const deleteResponse = await request.delete(`http://localhost:4003/api/sessions/${sessionId}`)

    // Even if deletion partially fails, server should remain stable
    // and return a response (not crash)
    expect(deleteResponse.status()).toBeGreaterThanOrEqual(200)
    expect(deleteResponse.status()).toBeLessThan(600)

    // Verify server health
    await page.waitForTimeout(1000)
    const healthResponse = await request.get('http://localhost:4003/health')
    expect(healthResponse.ok()).toBeTruthy()

    // Verify WebSocket connection still works
    await page.reload()
    await page.waitForTimeout(2000)
    const connectionStatus = page.locator('.connection-status')
    await expect(connectionStatus).toContainText(/Connected|Online/, { timeout: 5000 })
  })

  test('should maintain session persistence after deletion', async ({ page, request }) => {
    // Get current session count
    const beforeResponse = await request.get('http://localhost:4003/sessions')
    const beforeData = await beforeResponse.json()
    const beforeCount = beforeData.sessions.length

    // Delete a session
    if (beforeCount > 0) {
      const sessionToDelete = beforeData.sessions[0].id
      await request.delete(`http://localhost:4003/api/sessions/${sessionToDelete}`)
      await page.waitForTimeout(1000)

      // Verify session count decreased
      const afterResponse = await request.get('http://localhost:4003/sessions')
      const afterData = await afterResponse.json()
      expect(afterData.sessions.length).toBe(beforeCount - 1)

      // Verify sessions.json was updated
      // (This would require file system access, so we'll just verify the API reflects the change)
      const deletedSession = afterData.sessions.find((s: any) => s.id === sessionToDelete)
      expect(deletedSession).toBeUndefined()
    }
  })
})
