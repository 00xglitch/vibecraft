# Changelog

All notable changes to Vibecraft are documented in this file.

## [Unreleased] - Combined Feature Branch

This release combines multiple PRs and adds significant new features.

### New Features

#### Achievement System

- **Trophy Board** with 25+ unlockable achievements
- **Rarity tiers**: Common, Uncommon, Rare, Epic, Legendary
- **Progress tracking** for multi-step achievements
- **Toast notifications** when achievements unlock
- **Points system** with total score tracking
- Categories: Tools, Sessions, Milestones, Special (including secret achievements)

#### Token Tracking System

- **Real-time token monitoring** per session via tmux pane capture
- **Token Stats Modal** showing usage across sessions
- **Session tokens** displayed in sidebar tooltips
- **Cumulative tracking** persisted across restarts

#### Smart Grid System

- **Zone Activity Tracking** with color-coded attention states
- **Auto-compact zones** to fill gaps when sessions end
- **Improved zone positioning** with spiral honeycomb layout

#### Multi-Character Support

- 8 unique character models: ClaudeMon, Wizard, Ninja, Pacman, Afro Samurai, Rick, Morty, Flower
- Character selection in Settings modal
- Character-specific animations and behaviors
- Afro Samurai with speech bubbles and contextual phrases

#### Plugin System

- **Model Selector** - Choose Claude model (Sonnet/Opus/Haiku)
- **Thinking Toggle** - Enable extended thinking mode (`--thinking` flag)
- **MCP List** - View connected MCP servers and their tools
- Plugins moved to modal with new Session tab in Settings

#### MCP Registry

- Dynamic tracking of MCP servers based on observed tool usage
- Server categorization (filesystem, web, database, AI/ML, etc.)
- Tool→server mapping for unknown MCP tools

#### Docker Support

- Complete Docker deployment configuration
- Hot reload for development
- Mount points for data persistence
- tmux support inside containers

#### Project Discovery & Workspaces

- Automatic project discovery (git repos, package.json, etc.)
- Workspace grouping for organizing projects
- Directory autocomplete in new session modal
- Project suggestions based on recent activity

#### File Change Rollback

- Track Edit/Write changes with before/after content
- Rollback API (`/api/changes/:id/rollback`)
- Change history per session

#### Google Jules Integration

- Integration with Google's async coding agent
- Task creation and monitoring via `/api/jules/*` endpoints
- PR URL tracking when tasks complete

#### Orchestrator System

- Multi-agent coordination for complex tasks
- Task dependency management
- Parallel agent execution

### Merged PRs

#### PR #21: OpenCode Support (DanceMore)

- OpenCode session management integration
- Provider selection (OpenAI, Anthropic, etc.)
- OpenCodeProcessManager for lifecycle handling
- OpenCodeEventAdapter for event handling

#### PR #17: CI/CD Infrastructure (wolfiesch)

- GitHub Actions workflows
- Automated testing pipeline
- Build and deployment automation

#### PR #16: tmux PATH Handling

- Fix session creation failing due to PATH issues
- Cross-platform PATH setup in hook script

#### PR #15: Token Usage Display

- Surface context window usage per session
- Token polling from tmux panes

#### PR #12: Session Replay

- Event replay system
- Historical event processing

#### PR #11: Smart Auto-naming & Commit Celebrations

- Auto-generate session names from directory
- Confetti animation on git commits
- Git commit sound effect

#### PR #10: External Claude Zones

- Implicit sessions for external Claude instances
- "ext" badge for external sessions
- Automatic zone creation for non-Vibecraft Claude

#### PR #9: Rust Hook

- High-performance Rust hook (7-10x faster than bash)
- Pre-compiled binaries for macOS/Linux
- Fallback to bash for unsupported platforms

#### PR #7: Replay Improvements

- Skip ephemeral UI during replay
- Merge result sounds

#### PR #6: Git Worktree Isolation

- Support for git worktrees
- Session isolation per worktree

#### PR #5: New Session Button

- Quick session creation button
- Improved new session UX

#### PR #4: Character Selection

- Character selector in Settings
- Persistent character preference

### Bug Fixes

#### PR #29 Zone Fixes

- **Session linking race condition** - Use tmuxSession for definitive matching
- **Event isolation** - Filter events from non-Vibecraft sessions
- **Zone creation race** - pendingZoneHints and cleanup logic
- **Cancel endpoint** - Session-specific `/sessions/:id/cancel`
- **Hook improvements** - Early exit for non-tmux and non-Vibecraft sessions

#### Other Fixes

- Fix TypeScript build errors
- Fix E2E test selectors
- Fix permission buttons showing as numbers instead of pills
- Fix fundkom-web connection issues
- Fix achievements modal not opening
- Fix plugin button clickability
- Improved session liveness health checks

### UI/UX Improvements

- Polished visual design with enhanced styling
- Settings modal reorganization
- Improved session sidebar with pinning and drag-drop
- Station panels toggle (P key)
- Station glow pulse on tool use
- Zone Command modal for quick prompts
- Toast notification system
- Loading spinner during initialization

### Performance

- Performance optimization systems
- Reduced shadow map complexity
- Single hemisphere light (removed point lights)
- Efficient event deduplication

### Documentation

- Comprehensive CLAUDE.md technical docs
- GAMEPLAY.md guide
- SOUND.md audio system reference
- STORAGE.md data persistence guide
- ORCHESTRATION.md multi-session API
- SETUP.md detailed setup instructions

### Testing

- Playwright E2E tests
- MCP Marketplace tests
- Overlay dismiss helper

---

## Previous Versions

See git history for earlier changes.
