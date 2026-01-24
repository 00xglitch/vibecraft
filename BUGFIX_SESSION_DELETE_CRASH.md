# Bug Fix: Server Crash on Session Deletion

## Issue Summary

**Problem**: Server crashed when deleting/dismissing zones, causing all zones to disappear from the UI.

**User Report**: "i dismissed one zone and the whole thing became empty"

**Root Cause**: The `deleteSession()` function in `server/index.ts` had unhandled async operations that could throw errors, causing the Node.js process to crash with unhandled promise rejections.

## Technical Details

### Affected Code (server/index.ts, lines 1836-1846)

**Before (BUGGY):**

```typescript
// Clean up worktree if this session used one
if (session.worktree) {
  log(`Cleaning up worktree for session ${session.name}...`)
  await removeWorktree(
    session.worktree.path,
    session.worktree.originalRepo,
    session.worktree.branch
  )
}

// Delete session settings
await sessionSettingsManager.deleteSessionSettings(id)
```

**Problem**:

- `removeWorktree()` and `deleteSessionSettings()` are async functions that can throw errors
- Common errors include:
  - `EACCES` - Permission denied (if ~/.vibecraft/sessions/ owned by root)
  - `ENOENT` - File/directory not found
  - `EBUSY` - Resource busy
- These errors were not caught, causing unhandled promise rejections that crashed the entire Node.js process

**After (FIXED):**

```typescript
// Clean up worktree if this session used one
if (session.worktree) {
  log(`Cleaning up worktree for session ${session.name}...`)
  try {
    await removeWorktree(
      session.worktree.path,
      session.worktree.originalRepo,
      session.worktree.branch
    )
  } catch (err) {
    log(`Warning: Failed to remove worktree: ${err}`)
  }
}

// Delete session settings
try {
  await sessionSettingsManager.deleteSessionSettings(id)
} catch (err) {
  log(`Warning: Failed to delete session settings: ${err}`)
}
```

**Solution**:

- Wrapped both async operations in try-catch blocks
- Errors are now logged as warnings instead of crashing the server
- Session deletion continues even if cleanup fails
- Server remains stable and responsive

## Symptoms

1. User dismisses a zone via right-click → "Dismiss" or clicks delete button in session list
2. Server attempts to clean up session resources (worktree, settings files)
3. Cleanup operation throws an error (e.g., EACCES permission error)
4. Server crashes with unhandled promise rejection
5. All zones disappear from UI because WebSocket connection is lost
6. Server tries to restart but may fail with EADDRINUSE port conflict

## Testing

Created comprehensive test suite: `tests/e2e/session-deletion.spec.ts`

All tests verify that:

- ✅ Server remains stable during session deletion
- ✅ No crashes occur even if cleanup operations fail
- ✅ Health checks pass after deletion attempts
- ✅ WebSocket connection remains active

## Related Issues

This fix also prevents crashes from:

- Permission errors when cleaning up session settings
- Git worktree removal failures
- Docker container cleanup errors (already had try-catch)

## Files Modified

- `server/index.ts` - Added error handling to `deleteSession()` function (lines 1838-1854)
- `tests/e2e/session-deletion.spec.ts` - Added test suite (new file)

## Verification

Run the following to verify the fix:

```bash
# Start the dev server
npm run dev

# In another terminal, test deletion via API
curl -X DELETE http://localhost:4003/api/sessions/<session-id>

# Verify server is still running
curl http://localhost:4003/health

# Run tests
npx playwright test tests/e2e/session-deletion.spec.ts
```

**Expected**: Server remains running, no crashes in logs, health check passes.

## Impact

**Before**: Critical - Server crashes when deleting sessions, requiring manual restart
**After**: Stable - Deletion errors are logged but don't crash server

## Date Fixed

2026-01-24
