# Vibecraft TODO

## Completed ✅

### PR #29 Zone Fixes (Jan 23, 2026)

- [x] Session linking via tmuxSession for race condition fix
- [x] Event isolation (filter non-Vibecraft sessions)
- [x] Zone creation race condition fixes
- [x] Session-specific cancel endpoint
- [x] Hook event filtering

### Bug Fixes (Jan 23, 2026)

- [x] Token counting enhanced with 7+ format support
- [x] Wizard hat crash fixed (hatBaseY initialization)
- [x] Debug logging for token parsing

### Character Visual Improvements (Jan 23, 2026)

- [x] Wizard eyes - increased size and visibility (0.04 → 0.06 radius)
- [x] Wizard eyes - moved forward (z: 0.24 → 0.29) to prevent embedding
- [x] Wizard eyes - enhanced glow (emissive 0.3 → 0.5)
- [x] Ninja - added base position tracking for head, body, arms
- [x] Ninja - fixed animation reset to prevent position drift
- [x] AfroSamurai - verified proper resetPose implementation

### Documentation

- [x] CHANGELOG.md created with full feature list
- [x] All merged PRs documented (#4-21, #29)

### Marketplace (Jan 23, 2026)

- [x] Plugin Marketplace modal with launch cards
- [x] MCP Marketplace modal with launch cards
- [x] Marketplace styling (marketplace.css)
- [x] Integration with Plugins modal
- [x] Dynamic imports for code splitting
- [x] Toast notifications
- [x] Infrastructure ready for API integration

## In Progress 🚧

### Task #13: Playwright E2E Tests

- 68/78 tests passing
- 10 failures (modal timing issues - non-critical)

### Task #19: Make Sessions Editable

- [ ] Edit session name inline
- [ ] Edit working directory
- [ ] Edit model selection
- [ ] Edit CLI flags
- [ ] Edit modal or inline UI

## Pending 📋

### Task #6: Session Persistence per Platform

- [ ] Save session state per platform
- [ ] Restore sessions on startup
- [ ] Handle offline sessions

### Character Visual Fixes

- [x] Wizard hat crash - FIXED
- [x] Wizard eyes - FIXED (increased size, improved visibility)
- [x] Ninja - FIXED (base position tracking added)
- [x] AfroSamurai - VERIFIED (proper resetPose implementation)

### Test Improvements

- [ ] Fix 10 failing E2E tests (modal timing)
- [ ] Add tests for new marketplace features

## Technical Debt 💳

### Token Counting

- Enhanced to support 7+ formats
- Debug logging added
- May need testing with real Claude sessions to verify patterns match

### Build Warnings

- Chunk size > 500 kB (consider code splitting)

## Future Features 🔮

### Marketplace Enhancements

- Plugin ratings/reviews
- Plugin dependencies
- Auto-update functionality
- Plugin categories/tags

### Session Management

- Bulk session operations
- Session templates
- Export/import session configs

### UI/UX

- Dark/light theme toggle
- Customizable keybinds UI
- Performance metrics dashboard

---

Last updated: 2026-01-23
