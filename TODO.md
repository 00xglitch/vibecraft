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

### Documentation

- [x] CHANGELOG.md created with full feature list
- [x] All merged PRs documented (#4-21, #29)

## In Progress 🚧

### Task #13: Playwright E2E Tests

- 68/78 tests passing
- 10 failures (modal timing issues - non-critical)

### Task #18: Plugin & MCP Marketplace

- [ ] Plugin store UI modal
- [ ] MCP marketplace UI modal
- [ ] Fetch plugin list from registry/API
- [ ] Fetch MCP server list from registry
- [ ] Search and filtering
- [ ] Install/enable functionality
- [ ] Integration with existing PluginManager

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
- [x] Wizard eyes - exist but may need validation
- [ ] AfroSamurai - needs review
- [ ] Ninja - needs review

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
