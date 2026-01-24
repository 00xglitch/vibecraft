/**
 * Vibecraft - Main Entry Point
 *
 * Visualize Claude Code as an interactive 3D workshop
 * Supports multiple Claude instances in separate zones
 */

import './styles/index.css'
import * as THREE from 'three'
import { WorkshopScene, ZONE_COLORS, type Zone, type CameraMode } from './scene/WorkshopScene'
// Character models
// import { Claude } from './entities/Claude'      // Original simple character
import { Claude } from './entities/ClaudeMon' // Robot buddy character (used for both Claude and OpenCode)
import { Flower } from './entities/Flower' // Flower head character
import { AfroSamurai } from './entities/AfroSamurai' // Afro Samurai character
import { Pacman } from './entities/Pacman' // Classic Pacman character
import { Rick } from './entities/Rick' // Rick Sanchez character
import { Morty } from './entities/Morty' // Morty Smith character
import { Ninja } from './entities/Ninja' // Stealthy ninja character
import { Wizard } from './entities/Wizard' // Mystical wizard character
import type { ICharacter, CharacterOptions } from './entities/ICharacter'
import { SubagentManager } from './entities/SubagentManager'
import { EventClient } from './events/EventClient'
import { eventBus, type EventContext, type EventType } from './events/EventBus'
import {
  registerAllHandlers,
  configureCommitHandlers,
  configureActivityHandlers,
  updateConfetti,
} from './events/handlers'
import {
  type ClaudeEvent,
  type PreToolUseEvent,
  type PostToolUseEvent,
  type ManagedSession,
} from '../shared/types'
import { soundManager, SOUND_CATEGORIES, SOUND_LABELS } from './audio'
import type { SoundName } from './audio'

// Expose for console testing (can remove in production)
;(window as any).soundManager = soundManager
import { setupVoiceControl, type VoiceState } from './ui/VoiceControl'
import { getToolIcon } from './utils/ToolUtils'
import { AttentionSystem } from './systems/AttentionSystem'
import { TimelineManager } from './ui/TimelineManager'
import { FeedManager, formatTokens, formatTimeAgo, escapeHtml } from './ui/FeedManager'
import { ContextMenu, type ContextMenuContext } from './ui/ContextMenu'
import { setupKeyboardShortcuts, getSessionKeybind } from './ui/KeyboardShortcuts'
import { setupKeybindSettings, updateVoiceHint } from './ui/KeybindSettings'
import {
  setupQuestionModal,
  showQuestionModal,
  hideQuestionModal,
  type QuestionData,
} from './ui/QuestionModal'
import { toast } from './ui/Toast'
import { setupZoneInfoModal, showZoneInfoModal, setZoneInfoSoundEnabled } from './ui/ZoneInfoModal'
import { setupZoneCommandModal, showZoneCommandModal } from './ui/ZoneCommandModal'
import {
  setupPermissionModal,
  showPermissionModal,
  hidePermissionModal,
} from './ui/PermissionModal'
import { setupSlashCommands, isSlashCommand } from './ui/SlashCommands'
import { setupDirectoryAutocomplete } from './ui/DirectoryAutocomplete'
import { setupNewSessionModal, type SessionFlags } from './ui/NewSessionModal'
import { fetchOpenCodeProviders } from './ui/OpenCodeProviderSelect'
import { checkForUpdates } from './ui/VersionChecker'
import { drawMode } from './ui/DrawMode'
import { setupTextLabelModal, showTextLabelModal } from './ui/TextLabelModal'
import { smartSuggestions } from './ui/SmartSuggestions'
import { createSessionAPI, type SessionAPI } from './api'
import { replayController, ReplaySceneManager, type SceneSnapshot } from './replay'
import { setupReplayControls, type ReplayControls } from './ui/ReplayControls'
import { initializePluginsInModal, pluginManager } from './plugins'
import { achievementSystem } from './systems/AchievementSystem'
import { showAchievementsModal, initAchievementNotifications } from './ui/AchievementsModal'
import { tokenTrackingSystem } from './systems/TokenTrackingSystem'
import { showTokenStatsModal } from './ui/TokenStatsModal'

// ============================================================================
// Configuration
// ============================================================================

// Injected by Vite at build time from shared/defaults.ts
declare const __VIBECRAFT_DEFAULT_PORT__: number

// Port configuration: URL param > localStorage > default from shared/defaults.ts
function getAgentPort(): number {
  const params = new URLSearchParams(window.location.search)
  const urlPort = params.get('port')
  if (urlPort) return parseInt(urlPort, 10)

  const storedPort = localStorage.getItem('vibecraft-agent-port')
  if (storedPort) return parseInt(storedPort, 10)

  return __VIBECRAFT_DEFAULT_PORT__
}

const AGENT_PORT = getAgentPort()

// In dev, Vite proxies /ws and /api to the server
// In prod (hosted), connect to localhost where user's agent runs
const WS_URL = import.meta.env.DEV
  ? `ws://${window.location.host}/ws`
  : `ws://localhost:${AGENT_PORT}`

const API_URL = import.meta.env.DEV ? '/api' : `http://localhost:${AGENT_PORT}`

// Create session API instance
const sessionAPI = createSessionAPI(API_URL)

// ============================================================================
// Character Factory
// ============================================================================

/**
 * Get the selected character type from settings
 */
function getSelectedCharacterType(): string {
  return localStorage.getItem('vibecraft-character') || 'robot'
}

/**
 * Character theme colors for robot variations
 */
const CHARACTER_THEMES = {
  robot: {
    color: 0x2a3a4a, // Dark blue-gray metal (default)
    scale: 1,
  },
  rick: {
    color: 0x7dd3fc, // Light blue-cyan (Rick's hair/skin tone)
    scale: 1.1, // Rick is slightly taller
  },
  morty: {
    color: 0xfde047, // Yellow (Morty's shirt)
    scale: 0.85, // Morty is smaller
  },
  ninja: {
    color: 0x1a1a2e, // Dark ninja outfit
    scale: 0.95,
  },
  wizard: {
    color: 0x6366f1, // Purple wizard robe
    scale: 1.05,
  },
}

/**
 * Create the appropriate character based on settings
 */
function createCharacter(scene: WorkshopScene, options: CharacterOptions): ICharacter {
  const characterType = getSelectedCharacterType()

  // Special character classes (unique designs, not robot variants)
  switch (characterType) {
    case 'flower':
      return new Flower(scene, options)
    case 'afrosamurai':
      return new AfroSamurai(scene, options)
    case 'pacman':
      return new Pacman(scene, options)
    case 'rick':
      return new Rick(scene, options)
    case 'morty':
      return new Morty(scene, options)
    case 'ninja':
      return new Ninja(scene, options)
    case 'wizard':
      return new Wizard(scene, options)
  }

  // Robot variants with theme colors
  const theme =
    CHARACTER_THEMES[characterType as keyof typeof CHARACTER_THEMES] || CHARACTER_THEMES.robot
  const themedOptions = {
    ...options,
    color: options.color ?? theme.color,
    scale: (options.scale ?? 1) * theme.scale,
  }
  return new Claude(scene, themedOptions)
}

// ============================================================================
// State
// ============================================================================

/** Per-session state */
interface SessionState {
  claude: ICharacter
  subagents: SubagentManager
  zone: Zone
  color: number
  stats: {
    toolsUsed: number
    filesTouched: Set<string>
    activeSubagents: number
  }
}

interface AppState {
  scene: WorkshopScene | null
  client: EventClient | null
  sessions: Map<string, SessionState>
  focusedSessionId: string | null // Currently focused session for camera/prompts
  eventHistory: ClaudeEvent[]
  managedSessions: ManagedSession[] // Managed sessions from server
  selectedManagedSession: string | null // Selected managed session ID for prompts
  serverCwd: string // Server's working directory
  attentionSystem: AttentionSystem | null // Manages attention queue and notifications
  timelineManager: TimelineManager | null // Manages icon timeline
  feedManager: FeedManager | null // Manages activity feed
  soundEnabled: boolean // Whether to play sounds
  hasAutoOverviewed: boolean // Whether we've done initial auto-overview for 2+ sessions
  userChangedCamera: boolean // Whether user has manually changed camera (to avoid overriding)
  voice: VoiceState | null // Voice input state and controls
  lastPrompts: Map<string, string> // Last prompt sent per Claude session ID
  promptHistory: string[] // History of sent prompts for up/down navigation
  historyIndex: number // Current position in history (-1 = not navigating)
  historyDraft: string // Saved draft when navigating history
  // Replay mode state
  replaySceneManager: ReplaySceneManager | null // Manages scene state during replay
  replayControls: ReplayControls | null // UI controls for replay
  replaySnapshot: SceneSnapshot | null // Snapshot of scene state before replay
  // Sidebar state
  showArchivedSessions: boolean // Whether to show archived sessions
  draggingSessionId: string | null // Session being dragged for reorder
  hasSeenArchivedNotice: boolean // Whether user has been notified about archived sessions
}

const state: AppState = {
  scene: null,
  client: null,
  sessions: new Map(),
  focusedSessionId: null,
  eventHistory: [],
  serverCwd: '~',
  managedSessions: [],
  selectedManagedSession: null,
  attentionSystem: null, // Initialized in init()
  timelineManager: null, // Initialized in init()
  feedManager: null, // Initialized in init()
  soundEnabled: true,
  hasAutoOverviewed: false,
  userChangedCamera: false,
  voice: null, // Initialized in setupVoiceInput()
  lastPrompts: new Map(),
  promptHistory: [],
  historyIndex: -1,
  historyDraft: '',
  // Replay state
  replaySceneManager: null,
  replayControls: null,
  replaySnapshot: null,
  // Sidebar state
  showArchivedSessions: false,
  draggingSessionId: null,
  hasSeenArchivedNotice: false,
}

// Expose for console testing (can remove in production)
;(window as any).state = state

// Track zone creation times to prevent premature orphan cleanup
// Zones created within the grace period won't be deleted even if not in session list
const zoneCreationTimes = new Map<string, number>()
const ZONE_GRACE_PERIOD_MS = 10000 // 10 seconds grace period after creation

// Track when zones first became orphaned (not in session list)
// Zones are only deleted if orphaned for longer than ORPHAN_TIMEOUT_MS
const zoneOrphanedTimes = new Map<string, number>()
const ORPHAN_TIMEOUT_MS = 120000 // 2 minutes - zones stay visible even if session is gone

// Track pending zone hints for direction-aware placement
// Maps managed session name → click position (used when zone is created)
const pendingZoneHints = new Map<string, { x: number; z: number }>()

// Track pending zones to clean up when real zone appears
// Maps managed session name → pending zone ID
const pendingZonesToCleanup = new Map<string, string>()

// Track zone creation timeouts (pendingId → timeoutId)
const pendingZoneTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

// Zone creation timeout in ms
const ZONE_CREATION_TIMEOUT = 10000

// ============================================================================
// Managed Sessions (Orchestration)
// ============================================================================

/**
 * Render the managed sessions list
 */
function renderManagedSessions(): void {
  const container = document.getElementById('managed-sessions')
  if (!container) return

  container.innerHTML = ''

  // Update "All Sessions" count
  const allCount = document.getElementById('all-sessions-count')
  if (allCount) {
    const count = state.managedSessions.length
    const working = state.managedSessions.filter((s) => s.status === 'working').length
    if (count === 0) {
      allCount.textContent = 'Click "+ New" to start'
    } else if (working > 0) {
      allCount.textContent = `${count} session${count > 1 ? 's' : ''}, ${working} working`
      allCount.className = 'session-detail working'
    } else {
      allCount.textContent = `${count} session${count > 1 ? 's' : ''}`
      allCount.className = 'session-detail'
    }
  }

  // Update "All Sessions" active state
  const allItem = document.querySelector('.session-item.all-sessions')
  if (allItem) {
    allItem.classList.toggle('active', state.selectedManagedSession === null)
  }

  // Filter: hide archived unless showArchivedSessions is true
  const visibleSessions = state.managedSessions.filter(
    (s) => !s.archived || state.showArchivedSessions
  )

  // Count archived for header
  const archivedCount = state.managedSessions.filter((s) => s.archived).length

  // Sort: pinned first, then by sortOrder (lower first), then by createdAt (oldest first)
  const sortedSessions = [...visibleSessions].sort((a, b) => {
    // Pinned items first
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    // Then by sortOrder (default to Infinity for items without sortOrder)
    const orderA = a.sortOrder ?? Infinity
    const orderB = b.sortOrder ?? Infinity
    if (orderA !== orderB) return orderA - orderB
    // Finally by createdAt (oldest first, as newer sessions should be at bottom)
    return a.createdAt - b.createdAt
  })

  // Add "Show Archived" toggle if there are archived sessions
  if (archivedCount > 0) {
    const toggleEl = document.createElement('div')
    toggleEl.className = 'session-archive-toggle'
    const toggleBtn = document.createElement('button')
    toggleBtn.className = 'archive-toggle-btn'
    toggleBtn.textContent = state.showArchivedSessions
      ? '📦 Hide Archived'
      : `📦 Show Archived (${archivedCount})`
    toggleBtn.title = `${archivedCount} archived session${archivedCount > 1 ? 's' : ''} hidden`
    toggleBtn.addEventListener('click', () => {
      state.showArchivedSessions = !state.showArchivedSessions
      renderManagedSessions()
    })
    toggleEl.appendChild(toggleBtn)
    container.appendChild(toggleEl)
  }

  sortedSessions.forEach((session, index) => {
    const el = document.createElement('div')
    el.className = 'session-item'
    el.dataset.sessionId = session.id // For targeted DOM updates (e.g., token updates)
    if (session.id === state.selectedManagedSession) {
      el.classList.add('active')
    }
    if (session.pinned) {
      el.classList.add('pinned')
    }
    if (session.archived) {
      el.classList.add('archived')
    }

    // Enable drag for reordering
    el.draggable = true
    el.addEventListener('dragstart', (e) => {
      state.draggingSessionId = session.id
      el.classList.add('dragging')
      e.dataTransfer?.setData('text/plain', session.id)
    })
    el.addEventListener('dragend', () => {
      state.draggingSessionId = null
      el.classList.remove('dragging')
    })
    el.addEventListener('dragover', (e) => {
      e.preventDefault()
      if (state.draggingSessionId && state.draggingSessionId !== session.id) {
        el.classList.add('drag-over')
      }
    })
    el.addEventListener('dragleave', () => {
      el.classList.remove('drag-over')
    })
    el.addEventListener('drop', (e) => {
      e.preventDefault()
      el.classList.remove('drag-over')
      if (state.draggingSessionId && state.draggingSessionId !== session.id) {
        reorderSession(state.draggingSessionId, session.id)
      }
    })

    // Check if session needs attention
    const needsAttention = state.attentionSystem?.needsAttention(session.id) ?? false
    if (needsAttention) {
      el.classList.add('needs-attention')
    }

    const statusClass = session.status
    const hotkey = index < 6 ? getSessionKeybind(index) : '' // 1-6 shown in UI
    // Implicit sessions (external Claude) can't be renamed/deleted/restarted via tmux
    const isImplicit = session.implicit === true

    // Time since last activity (needed for detail line)
    const lastActive = session.lastActivity ? formatTimeAgo(session.lastActivity) : ''

    // Build detail line with status and project
    const projectName = session.cwd ? session.cwd.split('/').pop() : ''
    let detail = ''
    if (needsAttention) {
      detail = '⚡ Needs attention'
    } else if (session.status === 'waiting') {
      detail = `⏳ Waiting for permission: ${session.currentTool || 'Unknown'}`
    } else if (session.currentTool) {
      detail = `Using ${session.currentTool}`
    } else if (session.status === 'offline') {
      detail = lastActive ? `Offline · was ${lastActive}` : 'Offline - click 🔄 to restart'
    } else {
      detail = projectName ? `📁 ${projectName}` : 'Ready'
    }
    const detailClass =
      session.status === 'working'
        ? 'session-detail working'
        : session.status === 'waiting'
          ? 'session-detail attention'
          : needsAttention
            ? 'session-detail attention'
            : 'session-detail'

    // Get last prompt for this session (via claudeSessionId)
    const lastPrompt = session.claudeSessionId
      ? state.lastPrompts.get(session.claudeSessionId)
      : null
    const truncatedPrompt = lastPrompt
      ? lastPrompt.length > 35
        ? lastPrompt.slice(0, 32) + '...'
        : lastPrompt
      : null

    // Token display (if available)
    const tokenDisplay = session.tokens
      ? `<div class="session-tokens">⚡ ${formatTokens(session.tokens.current)}</div>`
      : ''

    // Build detailed tooltip
    const tooltipParts = [
      `Name: ${session.name}`,
      `Status: ${session.status}`,
      session.doubleShotActive
        ? `☕ Double Shot Latte: Auto-continuing (${session.doubleShotContinues || 1}x)`
        : '',
      session.implicit ? '🔗 External Claude (no tmux control)' : `tmux: ${session.tmuxSession}`,
      session.claudeSessionId
        ? `Claude ID: ${session.claudeSessionId.slice(0, 12)}...`
        : 'Not linked yet',
      session.cwd ? `Dir: ${session.cwd}` : '',
      session.lastActivity ? `Last active: ${new Date(session.lastActivity).toLocaleString()}` : '',
      session.tokens
        ? `Tokens: ${session.tokens.current.toLocaleString()} current, ${session.tokens.cumulative.toLocaleString()} total`
        : '',
      lastPrompt ? `Last prompt: ${lastPrompt}` : '',
    ].filter(Boolean)
    el.title = tooltipParts.join('\n')

    // Build pinned indicator
    const pinnedIndicator = session.pinned ? '<span class="session-pin-indicator">📌</span>' : ''

    // Double Shot Latte badge (auto-continue active)
    const dslBadge = session.doubleShotActive
      ? `<span class="session-badge dsl" title="Double Shot Latte: Auto-continuing (${session.doubleShotContinues || 1}x)">☕</span>`
      : ''

    // Docker badge (for containerized sessions)
    const dockerBadge =
      session.runtime === 'docker'
        ? `<span class="session-badge docker" title="Docker container">🐳</span>`
        : ''

    el.innerHTML = `
      ${hotkey ? `<div class="session-hotkey">${hotkey}</div>` : ''}
      <div class="session-status ${statusClass}"></div>
      <div class="session-info">
        <div class="session-name">
          ${pinnedIndicator}${escapeHtml(session.name)}
          ${dslBadge}
          ${dockerBadge}
          ${isImplicit ? '<span class="session-badge external" title="External Claude session (no tmux control)">ext</span>' : ''}
        </div>
        <div class="${detailClass}">${detail}${!needsAttention && session.status !== 'offline' && lastActive ? ` · ${lastActive}` : ''}</div>
        ${tokenDisplay}
        ${truncatedPrompt ? `<div class="session-prompt">💬 ${escapeHtml(truncatedPrompt)}</div>` : ''}
      </div>
      <div class="session-actions">
        <button class="pin-btn" title="${session.pinned ? 'Unpin' : 'Pin to top'}">${session.pinned ? '📍' : '📌'}</button>
        <button class="archive-btn" title="${session.archived ? 'Unarchive' : 'Archive'}">${session.archived ? '📤' : '📦'}</button>
        ${session.status === 'offline' && !isImplicit ? `<button class="restart-btn" title="Restart session">🔄</button>` : ''}
        ${!isImplicit ? `<button class="rename-btn" title="Rename">✏️</button>` : ''}
        <button class="delete-btn" title="${isImplicit ? 'Remove from list' : 'Delete'}">🗑️</button>
      </div>
    `

    // Click to select and filter
    el.addEventListener('click', (e) => {
      // Ignore if clicking action buttons
      if ((e.target as HTMLElement).closest('.session-actions')) return
      selectManagedSession(session.id)
    })

    // Rename button
    el.querySelector('.rename-btn')?.addEventListener('click', (e) => {
      e.stopPropagation()
      const newName = prompt('Enter new name:', session.name)
      if (newName && newName !== session.name) {
        renameManagedSession(session.id, newName)
      }
    })

    // Delete button
    el.querySelector('.delete-btn')?.addEventListener('click', (e) => {
      e.stopPropagation()
      const confirmMsg = isImplicit
        ? `Remove "${session.name}" from the list? (This won't affect the external Claude session)`
        : `Delete session "${session.name}"?`
      if (confirm(confirmMsg)) {
        deleteManagedSession(session.id)
      }
    })

    // Restart button (only shown for offline sessions)
    el.querySelector('.restart-btn')?.addEventListener('click', (e) => {
      e.stopPropagation()
      restartManagedSession(session.id, session.name)
    })

    // Pin button
    el.querySelector('.pin-btn')?.addEventListener('click', (e) => {
      e.stopPropagation()
      togglePinSession(session.id, !session.pinned)
    })

    // Archive button
    el.querySelector('.archive-btn')?.addEventListener('click', (e) => {
      e.stopPropagation()
      toggleArchiveSession(session.id, !session.archived)
    })

    container.appendChild(el)
  })

  // Add "+ New" button at the end of the grid
  const newBtn = document.createElement('div')
  newBtn.className = 'session-item new-session-card'
  newBtn.innerHTML = `
    <div class="session-icon">➕</div>
    <div class="session-info">
      <div class="session-name">New Session</div>
      <div class="session-detail">Alt+N</div>
    </div>
  `
  newBtn.addEventListener('click', () => openNewSessionModal())
  container.appendChild(newBtn)
}

/**
 * Select a managed session for prompts (null = all/legacy mode)
 * Also focuses the 3D zone if available
 */
function selectManagedSession(sessionId: string | null): void {
  state.selectedManagedSession = sessionId
  renderManagedSessions()
  // Sound is played in focusSession() when the zone is focused

  // Persist selection to localStorage
  if (sessionId) {
    localStorage.setItem('vibecraft-selected-session', sessionId)
  } else {
    localStorage.removeItem('vibecraft-selected-session')
  }

  // Update feed filter to show only this session's events (or all if null)
  if (sessionId) {
    const session = state.managedSessions.find((s) => s.id === sessionId)
    // Filter by claudeSessionId if available, otherwise show nothing (session has no events yet)
    state.feedManager?.setFilter(session?.claudeSessionId ?? '__none__')

    // Focus the 3D zone if session is linked
    if (session?.claudeSessionId && state.scene) {
      state.scene.focusZone(session.claudeSessionId)
      focusSession(session.claudeSessionId)
    }
  } else {
    state.feedManager?.setFilter(null) // Show all sessions

    // Switch to overview mode showing all zones
    if (state.scene) {
      state.scene.setOverviewMode()
    }
  }

  // Update prompt target indicator for "all sessions" / null selection
  if (!sessionId) {
    const targetEl = document.getElementById('prompt-target')
    if (targetEl) {
      targetEl.innerHTML = '<span style="color: rgba(255,255,255,0.4)">all sessions</span>'
      targetEl.title = 'Select a session to send prompts'
    }
  }
  // Note: when sessionId is set, focusSession() handles the prompt target update
}

/**
 * Create a new managed session
 */
async function createManagedSession(
  name?: string,
  cwd?: string,
  flags?: SessionFlags,
  hintPosition?: { x: number; z: number },
  pendingZoneId?: string,
  runtime?: import('./api/SessionAPI').SessionRuntime,
  docker?: import('./api/SessionAPI').DockerOptions,
  shell?: string
): Promise<void> {
  const data = await sessionAPI.createSession(name, cwd, flags, runtime, docker, shell)

  if (!data.ok) {
    console.error('Failed to create session:', data.error)
    // Show offline banner if not connected, otherwise show alert
    if (!state.client?.isConnected) {
      showOfflineBanner()
    } else {
      alert(`Failed to create session: ${data.error}`)
    }
    // Clean up pending zone on failure
    if (pendingZoneId && state.scene) {
      state.scene.removePendingZone(pendingZoneId)
    }
    return
  }

  // Store hint position using the ACTUAL name from server response
  // Server auto-generates "Claude N" if no name provided, so we must use its name
  // Also store pending zone ID so we can remove it when real zone appears
  const actualName = data.session?.name
  if (actualName) {
    if (hintPosition) {
      pendingZoneHints.set(actualName, hintPosition)
    }
    if (pendingZoneId) {
      pendingZonesToCleanup.set(actualName, pendingZoneId)
    }
  }

  // DON'T remove pending zone here - keep it spinning until real zone appears
  // Session will be broadcast via WebSocket
}

/**
 * Fetch server info (cwd, etc.) and update UI
 */
async function fetchServerInfo(): Promise<void> {
  const data = await sessionAPI.getServerInfo()
  if (data.ok && data.cwd) {
    state.serverCwd = data.cwd
    // Update feed manager for path shortening
    state.feedManager?.setCwd(data.cwd)
    // Update modal display
    const cwdEl = document.getElementById('modal-default-cwd')
    if (cwdEl) {
      cwdEl.textContent = data.cwd
    }
  }
}

/**
 * Rename a managed session
 */
async function renameManagedSession(sessionId: string, name: string): Promise<void> {
  const data = await sessionAPI.renameSession(sessionId, name)
  if (!data.ok) {
    console.error('Failed to rename session:', data.error)
  }
  // Update will be broadcast via WebSocket
}

/**
 * Save zone position for a managed session (persists grid layout)
 */
async function saveZonePosition(
  sessionId: string,
  position: { q: number; r: number }
): Promise<void> {
  const data = await sessionAPI.saveZonePosition(sessionId, position)
  if (!data.ok) {
    console.error('Failed to save zone position:', data.error)
  }
}

/**
 * Delete a managed session
 */
async function deleteManagedSession(sessionId: string): Promise<void> {
  const data = await sessionAPI.deleteSession(sessionId)
  if (!data.ok) {
    console.error('Failed to delete session:', data.error)
  }
  // If we deleted the selected session, clear selection
  if (state.selectedManagedSession === sessionId) {
    state.selectedManagedSession = null
    const targetEl = document.getElementById('prompt-target')
    if (targetEl) targetEl.innerHTML = ''
  }
  // Update will be broadcast via WebSocket
}

/**
 * Restart an offline session
 */
async function restartManagedSession(sessionId: string, sessionName: string): Promise<void> {
  // Show feedback while restarting
  const statusEl = document.getElementById('connection-status')
  const originalText = statusEl?.textContent
  if (statusEl) {
    statusEl.textContent = `Restarting ${sessionName}...`
    statusEl.className = ''
  }

  const data = await sessionAPI.restartSession(sessionId)

  if (!data.ok) {
    console.error('Failed to restart session:', data.error)
    if (statusEl) {
      statusEl.textContent = `Failed: ${data.error}`
      statusEl.className = 'error'
      setTimeout(() => {
        statusEl.textContent = originalText || 'Connected'
        statusEl.className = 'connected'
      }, 3000)
    }
  } else {
    if (statusEl) {
      statusEl.textContent = `${sessionName} restarted!`
      statusEl.className = 'connected'
      setTimeout(() => {
        statusEl.textContent = originalText || 'Connected'
      }, 2000)
    }
  }
  // Update will be broadcast via WebSocket
}

/**
 * Send a prompt to the selected managed session
 */
async function sendPromptToManagedSession(
  prompt: string,
  sessionId?: string
): Promise<{ ok: boolean; error?: string }> {
  const targetSession = sessionId ?? state.selectedManagedSession
  if (!targetSession) {
    return { ok: false, error: 'No session selected' }
  }

  return sessionAPI.sendPrompt(targetSession, prompt)
}

/**
 * Toggle pin status for a session
 */
async function togglePinSession(sessionId: string, pinned: boolean): Promise<void> {
  const data = await sessionAPI.updateSession(sessionId, { pinned })
  if (!data.ok) {
    console.error('Failed to pin/unpin session:', data.error)
  }
  // Update will be broadcast via WebSocket
}

/**
 * Toggle archive status for a session
 */
async function toggleArchiveSession(sessionId: string, archived: boolean): Promise<void> {
  const data = await sessionAPI.updateSession(sessionId, { archived })
  if (!data.ok) {
    console.error('Failed to archive/unarchive session:', data.error)
  }
  // If archiving the selected session, clear selection
  if (archived && state.selectedManagedSession === sessionId) {
    selectManagedSession(null)
  }
  // Update will be broadcast via WebSocket
}

/**
 * Reorder a session by placing it before another session
 */
async function reorderSession(draggedId: string, targetId: string): Promise<void> {
  // Find the target session's sortOrder
  const targetSession = state.managedSessions.find((s) => s.id === targetId)
  const draggedSession = state.managedSessions.find((s) => s.id === draggedId)
  if (!targetSession || !draggedSession) return

  // Calculate new sortOrder: place dragged session just before target
  // Simple approach: give it a sortOrder slightly less than target
  const targetOrder = targetSession.sortOrder ?? Infinity
  const newOrder = targetOrder - 0.001

  // If they're in different pin groups, match the pin status too
  const updates: { sortOrder: number; pinned?: boolean } = { sortOrder: newOrder }
  if (targetSession.pinned !== draggedSession.pinned) {
    updates.pinned = targetSession.pinned
  }

  const data = await sessionAPI.updateSession(draggedId, updates)
  if (!data.ok) {
    console.error('Failed to reorder session:', data.error)
  }
  // Update will be broadcast via WebSocket
}

// ============================================================================
// Attention System Helpers
// ============================================================================

/** Go to the next session needing attention */
function goToNextAttention(): void {
  if (!state.attentionSystem) return

  const session = state.attentionSystem.getNext(state.managedSessions)
  if (!session) return

  // Select and focus
  state.userChangedCamera = true // User intentionally chose this view
  selectManagedSession(session.id)
  if (session.claudeSessionId && state.scene) {
    state.scene.focusZone(session.claudeSessionId)
    focusSession(session.claudeSessionId)
  }
}

/**
 * Setup managed sessions UI
 */

// Current zone hint for the open modal (set when modal opens from click)
let currentModalHint: { x: number; z: number } | null = null

/**
 * Open the new session modal (callable from anywhere)
 * @param hintPosition - Optional world position from click for direction-aware placement
 */
function openNewSessionModal(hintPosition?: { x: number; z: number }): void {
  const modal = document.getElementById('new-session-modal')
  const nameInput = document.getElementById('session-name-input') as HTMLInputElement
  const cwdInput = document.getElementById('session-cwd-input') as HTMLInputElement

  if (!modal) return

  // Store hint for when session is created
  currentModalHint = hintPosition ?? null

  // Request notification permission on first interaction
  AttentionSystem.requestPermission()

  // Reset inputs
  if (nameInput) {
    nameInput.value = ''
    nameInput.dataset.autoFilled = 'false'
  }
  if (cwdInput) cwdInput.value = ''

  modal.classList.add('visible')

  // Play modal open sound
  soundManager.play('modal_open')

  // Focus directory input after animation (it's now first)
  setTimeout(() => cwdInput?.focus(), 100)
}

function setupManagedSessions(): void {
  // Modal elements
  const modal = document.getElementById('new-session-modal')
  const nameInput = document.getElementById('session-name-input') as HTMLInputElement
  const cwdInput = document.getElementById('session-cwd-input') as HTMLInputElement
  const defaultCwdEl = document.getElementById('modal-default-cwd')
  const cancelBtn = document.getElementById('modal-cancel')
  const createBtn = document.getElementById('modal-create')

  // Session type tabs
  const claudeTab = modal?.querySelector(
    '.session-type-tab[data-type="claude"]'
  ) as HTMLButtonElement
  const opencodeTab = modal?.querySelector(
    '.session-type-tab[data-type="opencode"]'
  ) as HTMLButtonElement
  const claudeOptions = document.getElementById('claude-options')
  const opencodeOptions = document.getElementById('opencode-options')
  const opencodeModelField = document.getElementById('opencode-model-field')

  const opencodeState = setupNewSessionModal(modal!, {
    onClaudeSession: (name, cwd, flags, runtime, docker, shell) => {
      createManagedSession(
        name,
        cwd,
        flags,
        currentModalHint ?? undefined,
        `pending-${Date.now()}`,
        runtime,
        docker,
        shell
      )
      closeModal()
    },
    onOpenCodeSession: async (data) => {
      await createOpenCodeSession(data.name, data.cwd, currentModalHint)
      closeModal()
    },
  })

  // Session type description elements
  const claudeDescription = modal?.querySelector('.session-type-description.claude')
  const opencodeDescription = document.querySelector('.session-type-description.opencode')

  // Update session type descriptions when tabs are clicked
  const updateSessionTypeDescriptions = (type: 'claude' | 'opencode'): void => {
    if (type === 'claude') {
      claudeDescription?.classList.add('show')
      opencodeDescription?.classList.remove('show')
    } else {
      claudeDescription?.classList.remove('show')
      opencodeDescription?.classList.add('show')
    }
  }

  // Initialize descriptions
  updateSessionTypeDescriptions('claude')

  // Default cwd will be set by fetchServerInfo()

  // Setup directory autocomplete
  if (cwdInput) {
    setupDirectoryAutocomplete(cwdInput)
  }

  // Auto-populate name from directory when cwd changes
  if (cwdInput && nameInput) {
    cwdInput.addEventListener('input', () => {
      // Only auto-fill if name is empty or was auto-filled before
      if (nameInput.value.trim() === '' || nameInput.dataset.autoFilled === 'true') {
        const cwd = cwdInput.value.trim()
        if (cwd) {
          // Extract basename (last path component)
          const basename = cwd.replace(/\/+$/, '').split('/').pop() || ''
          if (basename) {
            // Check for duplicate names and add suffix if needed
            let name = basename
            let suffix = 1
            while (state.managedSessions.some((s) => s.name === name)) {
              suffix++
              name = `${basename} ${suffix}`
            }
            nameInput.value = name
            nameInput.dataset.autoFilled = 'true'
          }
        }
      }
    })

    // Mark as manually edited when user types in name field
    nameInput.addEventListener('input', () => {
      nameInput.dataset.autoFilled = 'false'
    })
  }

  // Toggle worktree hint visibility when checkbox changes
  const worktreeCheck = document.getElementById('session-opt-worktree') as HTMLInputElement
  const worktreeHint = document.getElementById('worktree-hint')
  if (worktreeCheck && worktreeHint) {
    worktreeCheck.addEventListener('change', () => {
      worktreeHint.style.display = worktreeCheck.checked ? 'block' : 'none'
    })
  }

  const closeModal = (): void => {
    modal?.classList.remove('visible')
    currentModalHint = null // Clear hint when modal closes
  }

  const handleCreate = (): void => {
    const name = nameInput?.value.trim() || undefined
    const cwd = cwdInput?.value.trim() || undefined

    // Capture hint before closing modal (closeModal clears it)
    const hintPosition = currentModalHint

    if (opencodeState.sessionType === 'opencode') {
      // Validate OpenCode session requires provider selection
      const modalState = opencodeState.getState()
      const providerId = modalState.providerSelect?.getValue()
      if (!providerId) {
        alert('Please select a provider for OpenCode session')
        return
      }

      // Create OpenCode session
      createOpenCodeSession(name, cwd, hintPosition)
    } else {
      // Read flag checkboxes and selects
      const modelSelect = document.getElementById('session-opt-model') as HTMLSelectElement
      const thinkingCheck = document.getElementById('session-opt-thinking') as HTMLInputElement
      const continueCheck = document.getElementById('session-opt-continue') as HTMLInputElement
      const skipPermsCheck = document.getElementById('session-opt-skip-perms') as HTMLInputElement
      const chromeCheck = document.getElementById('session-opt-chrome') as HTMLInputElement
      const worktreeCheck = document.getElementById('session-opt-worktree') as HTMLInputElement

      const flags: SessionFlags = {
        model: modelSelect?.value || undefined,
        thinking: thinkingCheck?.checked ?? false,
        continue: continueCheck?.checked ?? true,
        skipPermissions: skipPermsCheck?.checked ?? true,
        chrome: chromeCheck?.checked ?? false,
        worktree: worktreeCheck?.checked ?? false,
      }

      // Create Claude session
      createManagedSession(name, cwd, flags, hintPosition ?? undefined, `pending-${Date.now()}`)
    }

    closeModal()
  }

  // Create OpenCode session directly
  const createOpenCodeSession = async (
    name: string | undefined,
    cwd: string | undefined,
    hintPosition: { x: number; z: number } | null
  ): Promise<void> => {
    const modalState = opencodeState.getState()
    const providerId = modalState.providerSelect?.getValue() ?? null
    const modelId = modalState.modelSelect?.getValue() ?? null

    try {
      const response = await fetch('/sessions/opencode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          cwd,
          providerID: providerId ?? undefined,
          modelID: modelId ?? undefined,
        }),
      })

      const data = await response.json()

      if (!data.ok) {
        alert(`Failed to create OpenCode session: ${data.error}`)
        return
      }

      // Create pending zone for visual feedback
      const pendingId = `pending-${Date.now()}`
      if (state.scene && hintPosition) {
        state.scene.createPendingZone(pendingId, hintPosition)
      }

      // Store hint for when zone appears
      if (data.session?.name && hintPosition) {
        pendingZoneHints.set(data.session.name, hintPosition)
        pendingZonesToCleanup.set(data.session.name, pendingId)
      }
    } catch (error) {
      console.error('Failed to create OpenCode session:', error)
      alert('Failed to create OpenCode session')
    }
  }

  const handleCancel = (): void => {
    soundManager.play('modal_cancel')
    closeModal()
  }

  // New session button opens modal (no hint position from button click)
  const newBtn = document.getElementById('new-session-btn')
  if (newBtn) {
    newBtn.addEventListener('click', () => openNewSessionModal())
  }

  // Modal cancel button
  if (cancelBtn) {
    cancelBtn.addEventListener('click', handleCancel)
  }

  // Modal create button
  if (createBtn) {
    createBtn.addEventListener('click', handleCreate)
  }

  // Close on Escape key (also plays cancel sound)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal?.classList.contains('visible')) {
      soundManager.play('modal_cancel')
      closeModal()
    }
  })

  // Close on backdrop click
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal()
      }
    })
  }

  // Enter key in inputs triggers create
  const handleEnter = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' && modal?.classList.contains('visible')) {
      handleCreate()
    }
  }
  nameInput?.addEventListener('keydown', handleEnter)
  cwdInput?.addEventListener('keydown', handleEnter)

  // "All Sessions" click handler
  const allItem = document.querySelector('.session-item.all-sessions')
  if (allItem) {
    allItem.addEventListener('click', () => {
      selectManagedSession(null)
    })
  }

  // Initial render
  renderManagedSessions()
}

// ============================================================================
// Context Menu (appears at click location for create/delete actions)
// ============================================================================

let contextMenu: ContextMenu | null = null

function handleContextMenuAction(action: string, context: ContextMenuContext): void {
  if (action === 'create' && context.worldPosition) {
    openNewSessionModal({ x: context.worldPosition.x, z: context.worldPosition.z })
  } else if (action === 'command' && context.zoneId) {
    showZoneCommand(context.zoneId)
  } else if (action === 'info' && context.zoneId) {
    showZoneInfo(context.zoneId)
  } else if (action === 'delete' && context.zoneId) {
    deleteZoneBySessionId(context.zoneId)
  } else if (action === 'create_text_tile' && context.hexPosition) {
    createTextTileAtHex(context.hexPosition as { q: number; r: number })
  } else if (action === 'edit_text_tile' && context.textTileId) {
    editTextTile(context.textTileId as string)
  } else if (action === 'delete_text_tile' && context.textTileId) {
    deleteTextTile(context.textTileId as string)
  }
}

/**
 * Show the zone info modal for a session
 */
function showZoneInfo(sessionId: string): void {
  // Find the managed session
  const managed = state.managedSessions.find((s) => s.claudeSessionId === sessionId)
  if (!managed) {
    console.warn('No managed session found for zone:', sessionId)
    return
  }

  // Get session stats if available
  const sessionState = state.sessions.get(sessionId)
  const stats = sessionState?.stats

  showZoneInfoModal({
    managedSession: managed,
    stats,
  })
}

/**
 * Show the zone command modal for quick commands to a specific zone
 */
function showZoneCommand(sessionId: string): void {
  // Find the managed session
  const managed = state.managedSessions.find((s) => s.claudeSessionId === sessionId)
  if (!managed) {
    console.warn('No managed session found for zone:', sessionId)
    return
  }

  // Get zone position
  const zone = state.scene?.getZone(sessionId)
  if (!zone || !state.scene) {
    console.warn('No zone found for session:', sessionId)
    return
  }

  showZoneCommandModal({
    sessionId: managed.id,
    sessionName: managed.name,
    sessionColor: zone.color,
    zonePosition: zone.position,
    camera: state.scene.camera,
    renderer: state.scene.renderer,
    onSend: async (id: string, prompt: string) => {
      return sendPromptToManagedSession(prompt, id)
    },
  })
}

/**
 * Create a text tile at a hex position (opens modal for text)
 */
async function createTextTileAtHex(hex: { q: number; r: number }): Promise<void> {
  const text = await showTextLabelModal({
    title: 'Add Label',
    placeholder: 'Enter your label text here...\nSupports multiple lines.',
  })
  if (!text?.trim()) return

  try {
    await fetch(`${API_URL}/tiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text.trim(),
        position: hex,
      }),
    })
  } catch (e) {
    console.error('Failed to create text tile:', e)
  }
}

/**
 * Edit an existing text tile
 */
async function editTextTile(tileId: string): Promise<void> {
  const tile = state.scene?.getTextTiles().find((t) => t.id === tileId)
  if (!tile) return

  const text = await showTextLabelModal({
    title: 'Edit Label',
    placeholder: 'Enter your label text here...',
    initialText: tile.text,
  })
  if (text === null || text.trim() === tile.text) return

  try {
    await fetch(`${API_URL}/tiles/${tileId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim() }),
    })
  } catch (e) {
    console.error('Failed to update text tile:', e)
  }
}

/**
 * Delete a text tile
 */
async function deleteTextTile(tileId: string): Promise<void> {
  try {
    await fetch(`${API_URL}/tiles/${tileId}`, {
      method: 'DELETE',
    })
  } catch (e) {
    console.error('Failed to delete text tile:', e)
  }
}

/**
 * Delete a zone (finds the managed session and deletes it)
 */
async function deleteZoneBySessionId(zoneId: string): Promise<void> {
  // Find the managed session for this zone
  const managedSession = state.managedSessions.find((s) => s.claudeSessionId === zoneId)

  if (!managedSession) {
    console.warn('No managed session found for zone:', zoneId)
    return
  }

  // Use existing delete function
  await deleteManagedSession(managedSession.id)
}

function setupContextMenu(): void {
  contextMenu = new ContextMenu({
    onAction: handleContextMenuAction,
  })
}

// ============================================================================
// Keyboard Shortcuts & Camera Modes
// ============================================================================

/**
 * Setup click handler to focus session when clicking on Claude
 */
function setupClickToPrompt(): void {
  if (!state.scene) return

  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()

  // Track mousedown position to distinguish clicks from drags
  let mouseDownPos: { x: number; y: number } | null = null
  const CLICK_THRESHOLD = 5 // pixels - if moved more than this, it's a drag

  // Draw mode drag painting state
  let isDrawModeDragging = false
  const paintedThisDrag = new Set<string>() // Track hexes painted during current drag

  // Debounced save for hex art persistence (includes zone elevations)
  let hexArtSaveTimer: ReturnType<typeof setTimeout> | null = null
  const saveHexArt = () => {
    if (hexArtSaveTimer) clearTimeout(hexArtSaveTimer)
    hexArtSaveTimer = setTimeout(() => {
      if (!state.scene) return
      const hexes = state.scene.getPaintedHexes()
      const zoneElevations = state.scene.getZoneElevations()
      localStorage.setItem('vibecraft-hexart', JSON.stringify(hexes))
      localStorage.setItem('vibecraft-zone-elevations', JSON.stringify(zoneElevations))
      const elevCount = Object.keys(zoneElevations).length
      console.log(
        `Saved ${hexes.length} painted hexes and ${elevCount} zone elevations to localStorage`
      )
    }, 500) // Debounce 500ms
  }

  // Helper to paint with brush size
  const paintWithBrush = (centerHex: { q: number; r: number }, playSound: boolean) => {
    if (!state.scene) return

    const brushSize = drawMode.getBrushSize()
    const color = drawMode.getSelectedColor()
    const hexesToPaint = state.scene.hexGrid.getHexesInRadius(centerHex, brushSize)

    let anyPainted = false
    for (const hex of hexesToPaint) {
      const hexKey = `${hex.q},${hex.r}`
      if (!paintedThisDrag.has(hexKey)) {
        paintedThisDrag.add(hexKey)
        if (color === null) {
          state.scene.clearPaintedHex(hex)
        } else {
          state.scene.paintHex(hex, color)
        }
        anyPainted = true
      }
    }

    if (anyPainted && playSound && state.soundEnabled) {
      soundManager.play('click')
    }

    // Save to localStorage (debounced)
    if (anyPainted) {
      saveHexArt()
    }
  }

  // Helper to convert mouse event to normalized coordinates and raycast
  const raycastFromMouse = (event: MouseEvent) => {
    const rect = state.scene!.renderer.domElement.getBoundingClientRect()
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(mouse, state.scene!.camera)
  }

  // Helper to find which zone was clicked (returns sessionId or null)
  const findClickedZone = (): string | null => {
    for (const [sessionId, zone] of state.scene!.zones) {
      const intersects = raycaster.intersectObject(zone.group, true)
      if (intersects.length > 0) return sessionId
    }
    // Also check Claude meshes
    for (const [sessionId, session] of state.sessions) {
      const intersects = raycaster.intersectObject(session.claude.mesh, true)
      if (intersects.length > 0) return sessionId
    }
    return null
  }

  state.scene.renderer.domElement.addEventListener('mousedown', (event) => {
    mouseDownPos = { x: event.clientX, y: event.clientY }

    // Start draw mode drag painting
    if (drawMode.isEnabled() && event.button === 0) {
      isDrawModeDragging = true
      paintedThisDrag.clear()

      // Paint the initial hex(es) with brush
      raycastFromMouse(event)
      if (state.scene!.worldFloor) {
        const floorIntersects = raycaster.intersectObject(state.scene!.worldFloor)
        if (floorIntersects.length > 0) {
          const point = floorIntersects[0].point
          const hex = state.scene!.hexGrid.cartesianToHex(point.x, point.z)
          paintWithBrush(hex, true)
          // Spawn click pulse at zone elevation if clicking on a zone
          const zone = state.scene!.getZoneAtHex(hex)
          const pulseY = zone ? zone.elevation + 0.03 : 0.03
          state.scene!.spawnClickPulse(point.x, point.z, 0x4ac8e8, pulseY)
        }
      }
    }
  })

  // Stop draw mode dragging if mouse released anywhere (safety net)
  window.addEventListener('mouseup', () => {
    if (isDrawModeDragging) {
      isDrawModeDragging = false
      paintedThisDrag.clear()
    }
  })

  // Draw mode drag painting on mousemove
  state.scene.renderer.domElement.addEventListener('mousemove', (event) => {
    if (!state.scene || !isDrawModeDragging || !drawMode.isEnabled()) return

    raycastFromMouse(event)
    if (state.scene.worldFloor) {
      // Check both floor and painted hexes (for painting on top of existing)
      const floorIntersects = raycaster.intersectObject(state.scene.worldFloor)
      const paintedHexMeshes = state.scene.getPaintedHexMeshes()
      const paintedIntersects =
        paintedHexMeshes.length > 0 ? raycaster.intersectObjects(paintedHexMeshes) : []

      const allIntersects = [...floorIntersects, ...paintedIntersects].sort(
        (a, b) => a.distance - b.distance
      )

      if (allIntersects.length > 0) {
        const point = allIntersects[0].point
        const hex = state.scene.hexGrid.cartesianToHex(point.x, point.z)
        paintWithBrush(hex, true)
      }
    }
  })

  // Left-click handler
  state.scene.renderer.domElement.addEventListener('mouseup', (event) => {
    // Stop draw mode dragging
    if (isDrawModeDragging) {
      isDrawModeDragging = false
      paintedThisDrag.clear()
    }

    if (!state.scene || !mouseDownPos) return

    // Check if this was a drag (mouse moved too much)
    const dx = event.clientX - mouseDownPos.x
    const dy = event.clientY - mouseDownPos.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    mouseDownPos = null

    if (distance > CLICK_THRESHOLD) {
      // This was a drag/pan, not a click - ignore
      return
    }

    raycastFromMouse(event)

    // In draw mode, skip zone/Claude focus - painting is handled in mousedown/mousemove
    if (drawMode.isEnabled()) {
      return
    }

    // Check entire zone groups (platform, ring, stations, everything)
    // This makes clicking anywhere in a zone select it
    for (const [sessionId, zone] of state.scene.zones) {
      const intersects = raycaster.intersectObject(zone.group, true)
      if (intersects.length > 0) {
        state.userChangedCamera = true // User clicked to select
        state.scene!.focusZone(sessionId)
        focusSession(sessionId)

        // Play focus sound for zone click
        if (state.soundEnabled) {
          soundManager.play('focus')
        }

        // Select the managed session if linked, otherwise clear selection
        const managed = state.managedSessions.find((s) => s.claudeSessionId === sessionId)
        if (managed) {
          selectManagedSession(managed.id)
          state.attentionSystem?.remove(managed.id)
        } else {
          // Legacy/unlinked session - clear managed selection but filter to this session
          selectManagedSession(null)
          state.feedManager?.setFilter(sessionId)
        }
        return
      }
    }

    // Also check Claude meshes (they're not in the zone group)
    for (const [sessionId, session] of state.sessions) {
      const intersects = raycaster.intersectObject(session.claude.mesh, true)
      if (intersects.length > 0) {
        state.userChangedCamera = true // User clicked to select
        state.scene!.focusZone(sessionId)
        focusSession(sessionId)

        // Play focus sound for Claude click
        if (state.soundEnabled) {
          soundManager.play('focus')
        }

        const managed = state.managedSessions.find((s) => s.claudeSessionId === sessionId)
        if (managed) {
          selectManagedSession(managed.id)
          state.attentionSystem?.remove(managed.id)
        } else {
          // Legacy/unlinked session - clear managed selection but filter to this session
          selectManagedSession(null)
          state.feedManager?.setFilter(sessionId)
        }
        return
      }
    }

    // Nothing was clicked - check if we hit the world floor or painted hexes
    // If so, show the context menu with create/text tile options
    if (state.scene.worldFloor) {
      // Check both floor and painted hexes (painted hexes block floor raycast)
      const floorIntersects = raycaster.intersectObject(state.scene.worldFloor)
      const paintedHexMeshes = state.scene.getPaintedHexMeshes()
      const paintedIntersects =
        paintedHexMeshes.length > 0 ? raycaster.intersectObjects(paintedHexMeshes) : []

      // Use whichever hit is closest (painted hex is usually on top of floor)
      const allIntersects = [...floorIntersects, ...paintedIntersects].sort(
        (a, b) => a.distance - b.distance
      )

      if (allIntersects.length > 0) {
        const point = allIntersects[0].point

        // Get hex position
        const hex = state.scene.hexGrid.cartesianToHex(point.x, point.z)

        // Normal mode: context menu (draw mode returns early above)
        // Spawn visual pulse feedback at click location
        state.scene.spawnClickPulse(point.x, point.z)
        // Play click sound
        soundManager.play('click')

        // Check if there's already a text tile at this position
        const existingTile = state.scene.getTextTileAtHex(hex)

        if (existingTile) {
          // Show edit/delete menu for existing text tile
          contextMenu?.show(
            event.clientX,
            event.clientY,
            [
              { key: 'E', label: `Edit "${existingTile.text}"`, action: 'edit_text_tile' },
              { key: 'D', label: 'Delete label', action: 'delete_text_tile', danger: true },
            ],
            { textTileId: existingTile.id }
          )
        } else {
          // Show create menu for empty space
          contextMenu?.show(
            event.clientX,
            event.clientY,
            [
              { key: 'C', label: 'Create zone', action: 'create' },
              { key: 'T', label: 'Add text label', action: 'create_text_tile' },
            ],
            { worldPosition: { x: point.x, z: point.z }, hexPosition: hex }
          )
        }
      }
    }
  })

  // Right-click handler for zones (delete menu)
  state.scene.renderer.domElement.addEventListener('contextmenu', (event) => {
    if (!state.scene) return
    event.preventDefault() // Prevent browser context menu

    raycastFromMouse(event)
    const sessionId = findClickedZone()

    if (sessionId) {
      // Find the managed session name for display
      const managed = state.managedSessions.find((s) => s.claudeSessionId === sessionId)
      const zoneName = managed?.name || sessionId.slice(0, 8)

      // Show context menu with command, info, and delete options
      contextMenu?.show(
        event.clientX,
        event.clientY,
        [
          { key: 'C', label: `Command`, action: 'command' },
          { key: 'I', label: `Info`, action: 'info' },
          { key: 'D', label: `Dismiss "${zoneName}"`, action: 'delete', danger: true },
        ],
        { zoneId: sessionId }
      )
    }
  })
}

/**
 * Update the keybind helper UI based on current camera mode
 */
function updateKeybindHelper(mode: CameraMode): void {
  const helper = document.getElementById('keybind-helper')
  if (!helper) return

  const modeLabel = document.getElementById('camera-mode-label')
  const modeDesc = document.getElementById('camera-mode-desc')

  if (modeLabel && modeDesc) {
    switch (mode) {
      case 'focused':
        modeLabel.textContent = 'Focused'
        modeDesc.textContent = state.focusedSessionId?.slice(0, 8) || 'none'
        break
      case 'overview':
        modeLabel.textContent = 'Overview'
        modeDesc.textContent = 'all sessions'
        break
      case 'follow-active':
        modeLabel.textContent = 'Follow'
        modeDesc.textContent = 'auto-tracking'
        break
    }
  }
}

/**
 * Setup the dev panel for testing animations
 * Toggle with Alt+D
 */
function setupDevPanel(): void {
  const devPanel = document.getElementById('dev-panel')
  const animationsContainer = document.getElementById('dev-animations')
  if (!devPanel || !animationsContainer) return

  // Helper to get target Claude
  const getTargetClaude = (): ICharacter | null => {
    if (state.focusedSessionId) {
      const claude = state.sessions.get(state.focusedSessionId)?.claude
      if (claude) return claude
    }
    for (const session of state.sessions.values()) {
      return session.claude
    }
    return null
  }

  // We need to wait for a session to exist to get the behavior names
  const checkForSession = () => {
    let claude: ICharacter | null = null
    for (const session of state.sessions.values()) {
      claude = session.claude
      break
    }

    if (!claude) {
      setTimeout(checkForSession, 1000)
      return
    }

    animationsContainer.innerHTML = ''

    // --- Idle Behaviors Section ---
    const idleHeader = document.createElement('div')
    idleHeader.className = 'dev-section-header'
    idleHeader.textContent = 'Idle'
    animationsContainer.appendChild(idleHeader)

    // Dev panel uses Claude-specific methods (cast for dev-only functionality)
    const claudeRef = claude as Claude
    const behaviors = claudeRef.getIdleBehaviorNames()
    for (const name of behaviors) {
      const btn = document.createElement('button')
      btn.className = 'dev-anim-btn'
      btn.textContent = name
      btn.addEventListener('click', () => {
        const target = getTargetClaude() as Claude | null
        if (target) {
          target.playIdleBehavior(name)
          document.querySelectorAll('.dev-anim-btn').forEach((b) => b.classList.remove('playing'))
          btn.classList.add('playing')
          setTimeout(() => btn.classList.remove('playing'), 2000)
        }
      })
      animationsContainer.appendChild(btn)
    }

    // --- Working Behaviors Section ---
    const workingHeader = document.createElement('div')
    workingHeader.className = 'dev-section-header'
    workingHeader.textContent = 'Working (by station)'
    animationsContainer.appendChild(workingHeader)

    // Check if character has working behavior methods
    const hasWorkingBehaviors = 'getWorkingBehaviorStations' in claude

    if (hasWorkingBehaviors) {
      const stations = (
        claude as unknown as { getWorkingBehaviorStations: () => string[] }
      ).getWorkingBehaviorStations()
      for (const station of stations) {
        const btn = document.createElement('button')
        btn.className = 'dev-anim-btn dev-anim-btn-working'
        btn.textContent = station
        btn.addEventListener('click', () => {
          const target = getTargetClaude()
          if (target && 'playWorkingBehavior' in target) {
            ;(target as { playWorkingBehavior: (station: string) => void }).playWorkingBehavior(
              station
            )
            document.querySelectorAll('.dev-anim-btn').forEach((b) => b.classList.remove('playing'))
            btn.classList.add('playing')
            // Working behaviors loop, so keep playing indicator longer
            setTimeout(() => btn.classList.remove('playing'), 4000)
          }
        })
        animationsContainer.appendChild(btn)
      }
    } else {
      const noBehaviors = document.createElement('div')
      noBehaviors.className = 'dev-section-empty'
      noBehaviors.textContent = 'No working behaviors available for this character'
      animationsContainer.appendChild(noBehaviors)
    }

    // --- Stop Button ---
    const stopBtn = document.createElement('button')
    stopBtn.className = 'dev-anim-btn dev-anim-btn-stop'
    stopBtn.textContent = '⏹ Stop → Idle'
    stopBtn.addEventListener('click', () => {
      const target = getTargetClaude()
      if (target) {
        target.setState('idle')
        document.querySelectorAll('.dev-anim-btn').forEach((b) => b.classList.remove('playing'))
      }
    })
    animationsContainer.appendChild(stopBtn)
  }

  checkForSession()
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Get or create a session for a given sessionId
 * Returns null if the session can't be linked to a managed session
 * If an unlinked session arrives, creates an implicit session on the server
 */
/** Map Claude sessionIds to managed session IDs */
const claudeToManagedLink = new Map<string, string>()

/** Track pending implicit session creations to avoid duplicate requests */
const pendingImplicitCreations = new Set<string>()

function getOrCreateSession(sessionId: string, eventCwd?: string): SessionState | null {
  let session = state.sessions.get(sessionId)
  if (session) return session

  if (!state.scene) {
    throw new Error('Scene not initialized')
  }

  // Try to link to an existing managed session first
  let linkedManagedSession = tryLinkToSession(sessionId)

  // If no existing managed session, check if server needs to create an implicit one
  if (!linkedManagedSession) {
    // Check if this session is already known to any managed session (including implicit ones)
    const alreadyKnown = state.managedSessions.some((m) => m.claudeSessionId === sessionId)
    if (!alreadyKnown) {
      // Unlinked external session - create an implicit session on the server
      // The server will broadcast the new session, and subsequent events will link properly
      if (!pendingImplicitCreations.has(sessionId)) {
        pendingImplicitCreations.add(sessionId)
        console.log(`Creating implicit session for external Claude ${sessionId.slice(0, 8)}`)
        sessionAPI.createImplicitSession(sessionId, eventCwd).then((result) => {
          pendingImplicitCreations.delete(sessionId)
          if (!result.ok) {
            console.error(`Failed to create implicit session: ${result.error}`)
          }
          // Server will broadcast sessions, which will trigger zone creation
        })
      }
      return null
    }
    // Session is known (from server broadcast) but not yet linked locally
    // Try to find and link it
    const managed = state.managedSessions.find((m) => m.claudeSessionId === sessionId)
    if (managed) {
      claudeToManagedLink.set(sessionId, managed.id)
      linkedManagedSession = managed
    } else {
      // Shouldn't happen, but handle gracefully
      console.log(`Session ${sessionId.slice(0, 8)} known but not found, waiting...`)
      return null
    }
  }

  // Look up hint position: first check saved zone position, then pending hints
  let hintPosition: { x: number; z: number } | undefined
  if (linkedManagedSession) {
    // Check for saved zone position from server
    if (linkedManagedSession.zonePosition) {
      // Convert hex coords back to cartesian for hint
      const cartesian = state.scene.hexGrid.axialToCartesian(linkedManagedSession.zonePosition)
      hintPosition = { x: cartesian.x, z: cartesian.z }
      console.log(
        `Restoring zone position for "${linkedManagedSession.name}" at hex`,
        linkedManagedSession.zonePosition
      )
    } else {
      // Fall back to pending hints (from modal click)
      hintPosition = pendingZoneHints.get(linkedManagedSession.name)
      if (hintPosition) {
        pendingZoneHints.delete(linkedManagedSession.name)
      }
    }
  }

  // Create zone in the 3D scene with direction-aware placement
  const zone = state.scene.createZone(sessionId, { hintPosition })

  // Track zone creation time for grace period protection
  zoneCreationTimes.set(sessionId, Date.now())

  // Clean up pending zone now that real zone exists
  if (linkedManagedSession) {
    const pendingZoneId = pendingZonesToCleanup.get(linkedManagedSession.name)
    if (pendingZoneId && state.scene) {
      state.scene.removePendingZone(pendingZoneId)
      pendingZonesToCleanup.delete(linkedManagedSession.name)
      // Clear the timeout since zone was created successfully
      const timeoutId = pendingZoneTimeouts.get(pendingZoneId)
      if (timeoutId) {
        clearTimeout(timeoutId)
        pendingZoneTimeouts.delete(pendingZoneId)
      }
    }
  }

  // Play zone creation sound
  if (state.soundEnabled) {
    soundManager.play('zone_create', { zoneId: sessionId })
  }

  // Track active zones for achievements
  achievementSystem.trackActiveZones(state.sessions.size)

  if (linkedManagedSession) {
    // Update the zone label with the managed session name and keybind
    // Use projectName for display, branch from gitStatus
    const keybindIndex = state.managedSessions.indexOf(linkedManagedSession)
    const keybind = keybindIndex >= 0 ? getSessionKeybind(keybindIndex) : undefined
    const labelName = linkedManagedSession.projectName || linkedManagedSession.name
    const branch = linkedManagedSession.gitStatus?.branch
    state.scene.updateZoneLabel(sessionId, labelName, keybind, branch)
    const sessionType = linkedManagedSession.sessionType === 'opencode' ? 'OpenCode' : 'Claude'
    console.log(
      `Linked ${sessionType} session ${sessionId.slice(0, 8)} to "${linkedManagedSession.name}"`
    )

    // Save zone position to server if not already saved
    if (!linkedManagedSession.zonePosition) {
      const hexPos = state.scene.getZoneHexPosition(sessionId)
      if (hexPos) {
        saveZonePosition(linkedManagedSession.id, hexPos)
      }
    }
  }

  // Create character with matching color, positioned at zone center
  // OpenCode sessions get special indigo/purple colors
  const isOpenCode = linkedManagedSession?.sessionType === 'opencode'
  const character = createCharacter(state.scene, {
    color: isOpenCode ? 0x6366f1 : zone.color, // OpenCode indigo or zone color
    statusColor: isOpenCode ? 0x8b5cf6 : undefined, // OpenCode purple accent
    startStation: 'center',
  })

  // Position character at the zone's center station
  const centerStation = zone.stations.get('center')
  if (centerStation) {
    character.mesh.position.copy(centerStation.position)
  }

  // Create subagent manager
  const subagents = new SubagentManager(state.scene)

  session = {
    claude: character as Claude,
    subagents,
    zone,
    color: zone.color,
    stats: {
      toolsUsed: 0,
      filesTouched: new Set(),
      activeSubagents: 0,
    },
  }

  state.sessions.set(sessionId, session)
  console.log(
    `Created session ${sessionId.slice(0, 8)} (color: #${zone.color.toString(16)}, position: ${zone.position.x}, ${zone.position.z})`
  )

  // Focus on first session
  if (state.sessions.size === 1) {
    focusSession(sessionId)
  }

  updateSessionList()
  return session
}

// ============================================================================
// Replay Mode
// ============================================================================

/**
 * Enter replay mode - fetch history and start replay
 */
async function enterReplayMode(): Promise<void> {
  if (!state.scene || !state.timelineManager || !state.feedManager) {
    console.error('Cannot enter replay mode: scene not initialized')
    return
  }

  // Already in replay mode
  if (replayController.getState().mode !== 'live') {
    console.warn('Already in replay mode')
    return
  }

  // Fetch all history from server
  try {
    const response = await fetch(`${API_URL}/history`)
    if (!response.ok) {
      throw new Error(`Failed to fetch history: ${response.status}`)
    }
    const events: ClaudeEvent[] = await response.json()

    if (events.length === 0) {
      toast.info('No events to replay')
      return
    }

    // Initialize replay scene manager if not already done
    if (!state.replaySceneManager) {
      state.replaySceneManager = new ReplaySceneManager(
        state.scene,
        // Type assertion: ICharacter is compatible with Claude for replay purposes
        ((sessionId: string) => state.sessions.get(sessionId)) as any,
        ((sessionId: string, cwd: string) => {
          const result = getOrCreateSession(sessionId, cwd)
          if (!result) throw new Error('Failed to create session')
          return result
        }) as any
      )
      state.replaySceneManager.setManagers(state.timelineManager, state.feedManager)
    }

    // Capture current scene state
    state.replaySnapshot = state.replaySceneManager.captureSnapshot()

    // Disconnect from live events
    state.client?.disconnect()

    // Reset scene for replay
    state.replaySceneManager.resetForReplay()

    // Clear timeline and feed
    state.timelineManager.clear()
    state.feedManager.clear()
    state.sessions.clear()

    // Start replay
    replayController.enterReplay(events)

    // Show replay controls
    const replayPanel = document.getElementById('replay-panel')
    if (replayPanel) {
      replayPanel.classList.remove('hidden')
    }

    // Update UI
    updateStatus(true, 'Replay Mode')
    updateActivity('Replaying session history...')

    console.log(`Entered replay mode with ${events.length} events`)
    toast.success(`Replaying ${events.length} events`)
  } catch (error) {
    console.error('Failed to enter replay mode:', error)
    toast.error('Failed to load history for replay')
  }
}

/**
 * Exit replay mode - restore scene state and resume live
 */
function exitReplayMode(): void {
  if (replayController.getState().mode === 'live') {
    console.warn('Not in replay mode')
    return
  }

  // Stop replay
  replayController.exitReplay()

  // Hide replay controls
  const replayPanel = document.getElementById('replay-panel')
  if (replayPanel) {
    replayPanel.classList.add('hidden')
  }

  // Restore scene state if we have a snapshot
  if (state.replaySnapshot && state.replaySceneManager && state.scene) {
    // Clear replay state first
    state.replaySceneManager.resetForReplay()
    state.sessions.clear()

    // Restore from snapshot
    state.replaySceneManager.restoreSnapshot(state.replaySnapshot)
    state.replaySnapshot = null
  }

  // Clear and reconnect
  state.timelineManager?.clear()
  state.feedManager?.clear()

  // Reconnect to live events
  if (state.client) {
    state.client.connect()
  }

  // Update UI
  updateActivity('Resumed live mode')

  console.log('Exited replay mode, returned to live')
  toast.success('Returned to live mode')
}

/**
 * Try to link a session to a managed session
 * Uses timing: looks for unlinked managed sessions created in the last 30 seconds
 */
function tryLinkToSession(sessionId: string): ManagedSession | null {
  const now = Date.now()
  const LINK_WINDOW_MS = 30_000 // 30 seconds

  // Check if already linked
  if (claudeToManagedLink.has(sessionId)) {
    const managedId = claudeToManagedLink.get(sessionId)!
    return state.managedSessions.find((s) => s.id === managedId) || null
  }

  // Find unlinked managed sessions created recently
  for (const managed of state.managedSessions) {
    // Skip if already linked
    if (managed.claudeSessionId) continue

    // Check if created recently
    const age = now - managed.createdAt
    if (age < LINK_WINDOW_MS) {
      // Link them!
      claudeToManagedLink.set(sessionId, managed.id)
      managed.claudeSessionId = sessionId

      // Notify server about the link
      linkSessionOnServer(managed.id, sessionId)

      return managed
    }
  }

  return null
}

/**
 * Notify server about session linking
 */
async function linkSessionOnServer(managedId: string, claudeSessionId: string): Promise<void> {
  await sessionAPI.linkSession(managedId, claudeSessionId)
}

/**
 * Create an implicit managed session for an external Claude instance.
 * This allows unmanaged Claude sessions (started in a regular terminal) to get 3D zones.
 */
function createImplicitManagedSession(claudeSessionId: string, cwd?: string): ManagedSession {
  const shortId = claudeSessionId.slice(0, 8)
  const managed: ManagedSession = {
    id: `implicit-${claudeSessionId}`,
    name: `Claude ${shortId}`,
    tmuxSession: '', // Unknown - not spawned by Vibecraft
    status: 'working',
    claudeSessionId,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    cwd: cwd || '~',
  }
  state.managedSessions.push(managed)
  claudeToManagedLink.set(claudeSessionId, managed.id)

  // Re-render sessions list to show the new implicit session
  renderManagedSessions()

  console.log(`Created implicit managed session for external Claude ${shortId}`)
  return managed
}

/**
 * Sync zone labels with managed session names
 * Uses explicit links first, then falls back to index matching
 * Labels show: "branch · projectName" (branch first since it changes most often)
 */
function syncZoneLabels(): void {
  if (!state.scene) return

  const zones = Array.from(state.scene.zones.entries())
  const managedSessions = state.managedSessions

  // First pass: update zones that have explicit claudeSessionId links
  for (let i = 0; i < managedSessions.length; i++) {
    const managed = managedSessions[i]
    if (managed.claudeSessionId) {
      const keybind = getSessionKeybind(i)
      const labelName = managed.projectName || managed.name
      const branch = managed.gitStatus?.branch
      state.scene.updateZoneLabel(managed.claudeSessionId, labelName, keybind, branch)
    }
  }

  // Second pass: for unlinked zones, try to match by index
  // Get zones that aren't linked to any managed session
  const linkedClaudeIds = new Set(
    managedSessions.filter((m) => m.claudeSessionId).map((m) => m.claudeSessionId)
  )
  const unlinkedZones = zones.filter(([id]) => !linkedClaudeIds.has(id))

  // Get managed sessions that don't have a claudeSessionId link
  const unlinkedManaged = managedSessions.filter((m) => !m.claudeSessionId)

  // Match by index (first unlinked zone → first unlinked managed, etc.)
  for (let i = 0; i < Math.min(unlinkedZones.length, unlinkedManaged.length); i++) {
    const [zoneId] = unlinkedZones[i]
    const managed = unlinkedManaged[i]

    // Update the zone label with keybind
    const managedIndex = managedSessions.indexOf(managed)
    const keybind = managedIndex >= 0 ? getSessionKeybind(managedIndex) : undefined
    const labelName = managed.projectName || managed.name
    const branch = managed.gitStatus?.branch
    state.scene.updateZoneLabel(zoneId, labelName, keybind, branch)

    // Also create the link for future use
    claudeToManagedLink.set(zoneId, managed.id)
    managed.claudeSessionId = zoneId

    // Notify server about the link
    linkSessionOnServer(managed.id, zoneId)

    console.log(`Auto-linked zone ${zoneId.slice(0, 8)} to managed session "${managed.name}"`)
  }
}

/**
 * Focus camera and UI on a specific session
 */
function focusSession(sessionId: string): void {
  const session = state.sessions.get(sessionId)
  if (!session || !state.scene) return

  state.focusedSessionId = sessionId
  state.scene.focusZone(sessionId)

  // Update plugin manager with active session
  pluginManager.setActiveSession(sessionId)

  // Play focus sound
  if (state.soundEnabled) {
    soundManager.play('focus')
  }

  // Play a random idle animation when zone becomes active (if Claude is idle)
  if (session.claude.state === 'idle' && 'playRandomIdleBehavior' in session.claude) {
    ;(session.claude as { playRandomIdleBehavior: () => void }).playRandomIdleBehavior()
  }

  // Update HUD
  const sessionEl = document.getElementById('session-id')
  if (sessionEl) {
    const shortId = sessionId.slice(0, 8)
    sessionEl.textContent = shortId
    sessionEl.title = `Session: ${sessionId}`
    sessionEl.style.color = `#${session.color.toString(16).padStart(6, '0')}`
  }

  // Update prompt target indicator
  updatePromptTarget(sessionId, session.color)

  updateStats()
}

/**
 * Update the prompt target indicator to show which session will receive prompts
 */
function updatePromptTarget(sessionId: string, color: number): void {
  const targetEl = document.getElementById('prompt-target')
  if (!targetEl) return

  // Look up managed session to get name and index
  const managed = state.managedSessions.find((s) => s.claudeSessionId === sessionId)
  const colorHex = `#${color.toString(16).padStart(6, '0')}`

  if (managed) {
    const index = state.managedSessions.indexOf(managed) + 1
    targetEl.innerHTML = `
      <span class="target-badge" style="background: ${colorHex}">${index}</span>
      <span style="color: ${colorHex}">${escapeHtml(managed.name)}</span>
    `
    targetEl.title = `Prompts will be sent to ${managed.name}`
  } else {
    targetEl.innerHTML = `
      <span class="target-dot" style="background: ${colorHex}"></span>
      <span>→ ${sessionId.slice(0, 8)}</span>
    `
    targetEl.title = `Prompts will be sent to session ${sessionId}`
  }
}

/**
 * Update session list in UI (for multi-session)
 */
function updateSessionList(): void {
  // Could add a session picker dropdown here later
  const count = state.sessions.size
  const sessionEl = document.getElementById('session-id')
  if (sessionEl && count > 1) {
    sessionEl.title += ` (${count} sessions)`
  }
}

// ============================================================================
// UI Updates
// ============================================================================

function updateStatus(connected: boolean, text?: string) {
  const dot = document.getElementById('status-dot')
  const textEl = document.getElementById('status-text')

  if (dot) {
    // Add 'working' class when actively working, 'connected' when idle, nothing when disconnected
    if (connected && text === 'Working') {
      dot.className = 'working'
    } else if (connected) {
      dot.className = 'connected'
    } else {
      dot.className = ''
    }
  }

  if (textEl) {
    // Only show text when disconnected or connecting
    if (!connected || text === 'Connecting...') {
      textEl.textContent = ` · ${text || 'Disconnected'}`
    } else {
      textEl.textContent = ''
    }
  }
}

function updateActivity(activity: string) {
  const el = document.getElementById('current-activity')
  if (el) {
    el.textContent = activity
  }
}

function updateAttentionBadge() {
  const badge = document.getElementById('attention-badge')
  if (!badge || !state.scene) return

  const needsAttention = state.scene.getZonesNeedingAttention()
  const count = needsAttention.length

  if (count > 0) {
    badge.textContent = String(count)
    badge.classList.remove('hidden')
  } else {
    badge.classList.add('hidden')
  }
}

function updateStats() {
  const toolsEl = document.getElementById('stat-tools')
  const filesEl = document.getElementById('stat-files')
  const subagentsEl = document.getElementById('stat-subagents')

  // Aggregate stats from all sessions
  let totalTools = 0
  let totalSubagents = 0
  const allFiles = new Set<string>()

  for (const session of state.sessions.values()) {
    totalTools += session.stats.toolsUsed
    totalSubagents += session.stats.activeSubagents
    for (const file of session.stats.filesTouched) {
      allFiles.add(file)
    }
  }

  if (toolsEl) {
    toolsEl.textContent = totalTools.toString()
  }

  if (filesEl) {
    filesEl.textContent = allFiles.size.toString()
  }

  if (subagentsEl) {
    subagentsEl.textContent = totalSubagents.toString()
  }
}

// ============================================================================
// Event Handling
// ============================================================================

function handleEvent(event: ClaudeEvent, isHistory = false) {
  // Get or create session for this event
  // Returns null if the session isn't linked to a managed session
  // Pass event.cwd so we can create implicit sessions with the correct directory
  const session = getOrCreateSession(event.sessionId, event.cwd)

  state.eventHistory.push(event)

  // Dispatch to EventBus (new decoupled handlers)
  // This runs in parallel with the old switch statement during migration
  const eventContext: EventContext = {
    scene: state.scene,
    feedManager: state.feedManager,
    timelineManager: state.timelineManager,
    soundEnabled: state.soundEnabled,
    isHistory,
    session: session
      ? {
          id: event.sessionId,
          color: session.color,
          claude: session.claude,
          subagents: session.subagents,
          zone: session.zone,
          stats: session.stats,
        }
      : null,
  }
  eventBus.emit(event.type as EventType, event as any, eventContext)

  // Process event for smart suggestions (skip history events to avoid stale suggestions)
  if (!isHistory) {
    smartSuggestions.processEvent(event)
  }

  // If no session (unlinked), still add to feed/timeline with default color but skip 3D updates
  const eventColor = session?.color ?? 0x888888
  state.timelineManager?.add(event, eventColor)
  state.feedManager?.add(event, eventColor)

  // Skip 3D scene updates for unlinked sessions
  if (!session) {
    return
  }

  // Pulse the zone to indicate activity
  if (state.scene && (event.type === 'pre_tool_use' || event.type === 'user_prompt_submit')) {
    state.scene.pulseZone(event.sessionId)
    // Set working status when tools start (except for AskUserQuestion which sets attention)
    if (event.type === 'pre_tool_use') {
      const toolEvent = event as PreToolUseEvent
      if (toolEvent.tool !== 'AskUserQuestion') {
        state.scene.setZoneStatus(event.sessionId, 'working')
      }
    }
  }

  switch (event.type) {
    case 'pre_tool_use': {
      const e = event as PreToolUseEvent

      // [Sound, character movement, context text handled by EventBus]
      // [Thinking indicator handled by EventBus: feedHandlers.ts]

      // Track tool use for achievements (skip during history replay)
      if (!isHistory) {
        achievementSystem.trackToolUse(e.tool)
      }

      // Update stats after subagent spawn (EventBus handles spawn itself)
      if (e.tool === 'Task') {
        updateStats()
      }

      // AskUserQuestion needs attention and shows modal
      // (zone attention and AttentionSystem queue are handled by showQuestionModal)
      if (e.tool === 'AskUserQuestion') {
        const toolInput = e.toolInput as { questions?: QuestionData['questions'] }
        if (toolInput.questions && toolInput.questions.length > 0) {
          // Find the managed session for this Claude session
          const managedSession = state.managedSessions.find(
            (s) => s.claudeSessionId === event.sessionId
          )
          showQuestionModal({
            sessionId: event.sessionId,
            managedSessionId: managedSession?.id || null,
            questions: toolInput.questions,
          })
          updateAttentionBadge()
        }
      }

      updateActivity(`Using ${e.tool}...`)
      updateStatus(true, 'Working')

      // Track file access
      const filePath = (e.toolInput as { file_path?: string }).file_path
      if (filePath) {
        session.stats.filesTouched.add(filePath)
      }
      break
    }

    case 'post_tool_use': {
      const e = event as PostToolUseEvent
      session.stats.toolsUsed++

      // [Sound, notifications, character state handled by EventBus]
      // [Subagent removal handled by EventBus: subagentHandlers.ts]

      // Hide question modal when AskUserQuestion completes
      if (e.tool === 'AskUserQuestion') {
        hideQuestionModal()
      }

      updateStats()
      updateActivity(e.success ? `${e.tool} complete` : `${e.tool} failed`)
      break
    }

    case 'stop': {
      // [Sound, character, context, zone status handled by EventBus]
      // [Thinking indicator handled by EventBus: feedHandlers.ts]

      // Update UI badge (zone attention set by zoneHandlers)
      updateAttentionBadge()
      updateActivity('Idle')
      updateStatus(true, 'Ready')
      break
    }

    case 'user_prompt_submit': {
      const e = event as import('../shared/types').UserPromptSubmitEvent
      // Store last prompt for this session
      state.lastPrompts.set(event.sessionId, e.prompt)
      renderManagedSessions()

      // [Sound, zone status, character state handled by EventBus]

      // Show thinking indicator AFTER feedManager.add() to ensure correct order
      // (prompt appears first, then thinking indicator)
      // Skip during history replay - ephemeral UI that doesn't need to be restored
      if (!isHistory) {
        state.feedManager?.showThinking(event.sessionId, session.color)
      }

      // Update UI badge (zone attention cleared by zoneHandlers)
      updateAttentionBadge()
      updateActivity('Processing prompt...')
      updateStatus(true, 'Thinking')
      break
    }

    case 'session_start':
      // Reset stats for this session
      session.stats.toolsUsed = 0
      session.stats.filesTouched.clear()
      updateStats()
      updateActivity('Session started')
      // Track session for achievements (skip during history replay)
      if (!isHistory) {
        achievementSystem.trackSessionCreated()
      }
      break

    case 'notification':
      // [Sound handled by EventBus: soundHandlers.ts]
      // Could trigger visual notification in 3D scene
      break
  }
}

// ============================================================================
// Prompt Submission
// ============================================================================

const PROMPT_URL = `${API_URL}/prompt`
const CONFIG_URL = `${API_URL}/config`

async function fetchConfig() {
  try {
    const response = await fetch(CONFIG_URL)
    const data = await response.json()
    const usernameEl = document.getElementById('username')
    if (usernameEl && data.username) {
      usernameEl.textContent = data.username
    }
  } catch (e) {
    console.log('Could not fetch config:', e)
  }
}

/**
 * Interrupt (Ctrl+C) the currently selected session
 * Called from keyboard shortcut handler
 */
async function interruptSession(sessionId: string, sessionName: string): Promise<void> {
  // Show toast immediately
  toast.info(`Interrupt sent to ${sessionName}`, {
    icon: '⛔',
    duration: 2500,
    html: true,
  })

  try {
    const data = await sessionAPI.cancelSession(sessionId)

    if (!data.ok) {
      toast.error(data.error || 'Interrupt failed', {
        icon: '❌',
        duration: 3000,
      })
    }
  } catch (error) {
    toast.error('Connection error', {
      icon: '❌',
      duration: 3000,
    })
  }
}

function setupPromptForm() {
  const form = document.getElementById('prompt-form') as HTMLFormElement | null
  const input = document.getElementById('prompt-input') as HTMLTextAreaElement | null
  const button = document.getElementById('prompt-submit') as HTMLButtonElement | null
  const cancelBtn = document.getElementById('prompt-cancel') as HTMLButtonElement | null
  const status = document.getElementById('prompt-status')

  if (!form || !input || !button) return

  // Auto-expand textarea as user types
  const autoExpand = () => {
    input.style.height = 'auto'
    input.style.height = Math.min(input.scrollHeight, 200) + 'px'
  }
  input.addEventListener('input', () => {
    autoExpand()
    // Reset history navigation when user types
    state.historyIndex = -1
    state.historyDraft = ''
  })

  // Setup slash command autocomplete
  setupSlashCommands(input)

  // Setup smart suggestions
  smartSuggestions.init('smart-suggestions', (prompt) => {
    input.value = prompt
    autoExpand()
    input.focus()
    // Optional: auto-submit if suggestion is a simple action
    if (prompt.length < 20) {
      form.requestSubmit()
    }
  })

  // Keyboard handling: Enter to send, Up/Down for history
  // Note: Skip if slash commands already handled the event
  input.addEventListener('keydown', (e) => {
    // Enter to send (Ctrl+Enter for newline)
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.defaultPrevented) {
      e.preventDefault()
      form.requestSubmit()
      return
    }

    // Up arrow: navigate to older history
    if (e.key === 'ArrowUp' && !e.defaultPrevented) {
      // Only handle if cursor is at start of input (or input is single line)
      const atStart = input.selectionStart === 0 && input.selectionEnd === 0
      const isSingleLine = !input.value.includes('\n')
      if (!atStart && !isSingleLine) return

      if (state.promptHistory.length === 0) return

      e.preventDefault()

      // Save current input as draft when starting navigation
      if (state.historyIndex === -1) {
        state.historyDraft = input.value
      }

      // Move back in history
      const newIndex = Math.min(state.historyIndex + 1, state.promptHistory.length - 1)
      if (newIndex !== state.historyIndex) {
        state.historyIndex = newIndex
        input.value = state.promptHistory[state.promptHistory.length - 1 - newIndex]
        autoExpand()
      }
      return
    }

    // Down arrow: navigate to newer history
    if (e.key === 'ArrowDown' && !e.defaultPrevented) {
      // Only handle if navigating history
      if (state.historyIndex === -1) return

      // Only handle if cursor is at end of input (or input is single line)
      const atEnd = input.selectionStart === input.value.length
      const isSingleLine = !input.value.includes('\n')
      if (!atEnd && !isSingleLine) return

      e.preventDefault()

      // Move forward in history
      state.historyIndex--

      if (state.historyIndex === -1) {
        // Back to draft
        input.value = state.historyDraft
      } else {
        input.value = state.promptHistory[state.promptHistory.length - 1 - state.historyIndex]
      }
      autoExpand()
    }
  })

  // Cancel button handler
  if (cancelBtn) {
    cancelBtn.addEventListener('click', async () => {
      // Get the currently selected session
      const sessionId = state.selectedManagedSession
      if (!sessionId) {
        if (status) {
          status.textContent = 'No session selected'
          status.className = 'error'
        }
        return
      }

      if (status) {
        status.textContent = 'Cancelling...'
        status.className = ''
      }
      try {
        const data = await sessionAPI.cancelSession(sessionId)
        if (status) {
          if (data.ok) {
            status.textContent = 'Cancelled!'
            status.className = 'success'
          } else {
            status.textContent = data.error || 'Cancel failed'
            status.className = 'error'
          }
        }
      } catch (error) {
        if (status) {
          status.textContent = 'Connection error'
          status.className = 'error'
        }
      }
    })
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault()

    // If voice recording is active, stop it first and wait for transcript
    if (state.voice?.isRecording) {
      const transcript = await state.voice.stop()
      if (transcript) {
        const existing = input.value.trim()
        input.value = existing ? existing + ' ' + transcript : transcript
      }
    }

    const prompt = input.value.trim()
    if (!prompt) return

    // Always send prompts to Claude Code
    const isCommand = isSlashCommand(prompt)
    const send = true

    button.disabled = true
    if (status) {
      status.textContent = send ? 'Sending to Claude...' : 'Saving...'
      status.className = ''
    }

    try {
      let data: { ok: boolean; error?: string; sent?: boolean; saved?: string; tmuxError?: string }

      // If a managed session is selected, use the session API
      if (state.selectedManagedSession && send) {
        const session = state.managedSessions.find((s) => s.id === state.selectedManagedSession)
        data = await sendPromptToManagedSession(prompt)
        if (data.ok && status) {
          status.textContent = `Sent to ${session?.name || 'session'}!`
          status.className = 'success'
          // Add to history and reset navigation
          state.promptHistory.push(prompt)
          state.historyIndex = -1
          state.historyDraft = ''
          input.value = ''
          input.style.height = 'auto'
          state.feedManager?.scrollToBottom()
        } else if (!data.ok && status) {
          status.textContent = data.error || 'Failed to send'
          status.className = 'error'
        }
      } else {
        // Legacy: send to default tmux session
        const response = await fetch(PROMPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, send }),
        })
        data = await response.json()

        if (data.ok) {
          // Add to history and reset navigation
          state.promptHistory.push(prompt)
          state.historyIndex = -1
          state.historyDraft = ''
          input.value = ''
          input.style.height = 'auto' // Reset height after submit
          state.feedManager?.scrollToBottom()
          if (status) {
            if (data.sent) {
              status.textContent = 'Sent to Claude!'
            } else if (data.tmuxError) {
              status.textContent = `Saved (tmux error: ${data.tmuxError})`
              status.className = 'error'
              return
            } else {
              status.textContent = `Saved to ${data.saved}`
            }
            status.className = 'success'
          }
        } else {
          if (status) {
            status.textContent = data.error || 'Failed to send'
            status.className = 'error'
          }
        }
      }
    } catch (error) {
      if (status) {
        status.textContent = 'Connection error'
        status.className = 'error'
      }
    } finally {
      button.disabled = false
    }
  })

  // Auto-focus input when tab/window becomes active
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      input.focus()
    }
  })

  window.addEventListener('focus', () => {
    input.focus()
  })

  // Focus when hovering over the right panel (activity feed area)
  const feedPanel = document.getElementById('feed-panel')
  if (feedPanel) {
    feedPanel.addEventListener('mouseenter', () => {
      input.focus()
    })
  }

  // Focus on initial load
  input.focus()
}

// ============================================================================
// Terminal Output Panel
// ============================================================================

const TMUX_URL = `${API_URL}/tmux-output`

let terminalPollInterval: number | null = null

function setupTerminalToggle() {
  const toggle = document.getElementById('terminal-toggle')
  const panel = document.getElementById('terminal-panel')
  const output = document.getElementById('terminal-output')

  if (!toggle || !panel || !output) return

  toggle.addEventListener('click', () => {
    const isHidden = panel.classList.toggle('hidden')
    toggle.classList.toggle('active', !isHidden)

    if (!isHidden) {
      // Start polling when visible
      fetchTerminalOutput()
      terminalPollInterval = window.setInterval(fetchTerminalOutput, 2000)
    } else {
      // Stop polling when hidden
      if (terminalPollInterval) {
        clearInterval(terminalPollInterval)
        terminalPollInterval = null
      }
    }
  })

  async function fetchTerminalOutput() {
    if (!output || !panel) return
    try {
      const response = await fetch(TMUX_URL)
      const data = await response.json()
      if (data.ok && data.output) {
        // Strip ANSI codes and clean up
        const cleaned = data.output
          .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '') // Remove ANSI codes
          .replace(/\r/g, '') // Remove carriage returns
        output.textContent = cleaned
        // Auto-scroll to bottom
        panel.scrollTop = panel.scrollHeight
      } else if (data.error) {
        output.textContent = `Error: ${data.error}`
      }
    } catch (e) {
      output.textContent = 'Failed to connect to server'
    }
  }
}

// ============================================================================
// Audio Initialization
// ============================================================================

let audioInitialized = false

/**
 * Initialize audio on first user interaction (required by Web Audio API)
 */
async function initAudioOnInteraction(): Promise<void> {
  if (audioInitialized) return
  audioInitialized = true

  try {
    await soundManager.init()
    console.log('Audio initialized on user interaction')
    // Play jazzy intro sound on first interaction
    soundManager.play('intro')
  } catch (e) {
    console.error('Failed to initialize audio:', e)
  }
}

/**
 * Setup settings modal
 */
function setupSettingsModal(): void {
  const settingsBtn = document.getElementById('settings-btn')
  const modal = document.getElementById('settings-modal')
  const closeBtn = document.getElementById('settings-close')
  const volumeSlider = document.getElementById('settings-volume') as HTMLInputElement | null
  const volumeValue = document.getElementById('settings-volume-value')
  const spatialCheckbox = document.getElementById(
    'settings-spatial-audio'
  ) as HTMLInputElement | null
  const streamingCheckbox = document.getElementById(
    'settings-streaming-mode'
  ) as HTMLInputElement | null
  const characterSelect = document.getElementById('settings-character') as HTMLSelectElement | null
  const gridSizeSlider = document.getElementById('settings-grid-size') as HTMLInputElement | null
  const gridSizeValue = document.getElementById('settings-grid-size-value')
  const refreshBtn = document.getElementById('settings-refresh-sessions')

  if (!modal) return

  // Setup keybind settings UI
  setupKeybindSettings()
  updateVoiceHint()

  // Initialize draw mode UI
  drawMode.init()

  // Wire up draw mode clear callback
  drawMode.onClear(() => {
    state.scene?.clearAllPaintedHexes()
    // Clear from localStorage too
    localStorage.removeItem('vibecraft-hexart')
    localStorage.removeItem('vibecraft-zone-elevations')
    console.log('Cleared hex art and zone elevations from localStorage')
  })

  // Port input
  const portInput = document.getElementById('settings-port') as HTMLInputElement | null
  const portStatus = document.getElementById('settings-port-status')

  // CLI command input
  const cliCommandInput = document.getElementById('settings-cli-command') as HTMLInputElement | null

  // Load saved volume from localStorage
  const savedVolume = localStorage.getItem('vibecraft-volume')
  if (savedVolume !== null) {
    const vol = parseInt(savedVolume, 10) / 100
    soundManager.setVolume(vol)
    if (volumeSlider) volumeSlider.value = savedVolume
    if (volumeValue) volumeValue.textContent = `${savedVolume}%`
  }

  // Load saved grid size from localStorage
  const savedGridSize = localStorage.getItem('vibecraft-grid-size')
  if (savedGridSize !== null) {
    const size = parseInt(savedGridSize, 10)
    state.scene?.setGridRange(size)
    if (gridSizeSlider) gridSizeSlider.value = savedGridSize
    if (gridSizeValue) gridSizeValue.textContent = savedGridSize
  }

  // Load saved spatial audio setting from localStorage
  const savedSpatial = localStorage.getItem('vibecraft-spatial-audio')
  if (savedSpatial !== null) {
    const enabled = savedSpatial === 'true'
    soundManager.setSpatialEnabled(enabled)
    if (spatialCheckbox) spatialCheckbox.checked = enabled
  }

  // Load saved streaming mode setting from localStorage
  const savedStreaming = localStorage.getItem('vibecraft-streaming-mode')
  if (savedStreaming !== null) {
    const enabled = savedStreaming === 'true'
    if (streamingCheckbox) streamingCheckbox.checked = enabled
    applyStreamingMode(enabled)
  }

  // Load saved character setting from localStorage
  const savedCharacter = localStorage.getItem('vibecraft-character')
  if (savedCharacter !== null) {
    if (characterSelect) characterSelect.value = savedCharacter
  }

  // ============================================
  // Sound Preferences Setup
  // ============================================
  const soundPrefsToggle = document.getElementById('sound-prefs-toggle')
  const soundPrefsContainer = document.getElementById('sound-prefs-container')

  // Load saved muted sounds from localStorage
  const savedMutedSounds = localStorage.getItem('vibecraft-muted-sounds')
  if (savedMutedSounds !== null) {
    try {
      const mutedSounds = JSON.parse(savedMutedSounds) as SoundName[]
      soundManager.setMutedSounds(mutedSounds)
    } catch {
      // Invalid JSON, ignore
    }
  }

  // Populate sound preferences UI
  if (soundPrefsContainer) {
    // Helper to update category checkbox state based on individual sounds
    const updateCategoryCheckbox = (categoryCheckbox: HTMLInputElement, sounds: SoundName[]) => {
      const mutedCount = sounds.filter((s) => soundManager.isSoundMuted(s)).length
      if (mutedCount === 0) {
        categoryCheckbox.checked = true
        categoryCheckbox.indeterminate = false
      } else if (mutedCount === sounds.length) {
        categoryCheckbox.checked = false
        categoryCheckbox.indeterminate = false
      } else {
        categoryCheckbox.checked = false
        categoryCheckbox.indeterminate = true
      }
    }

    // Helper to save muted sounds to localStorage
    const saveMutedSounds = () => {
      const mutedSounds = soundManager.getMutedSounds()
      localStorage.setItem('vibecraft-muted-sounds', JSON.stringify(mutedSounds))
    }

    for (const [categoryKey, category] of Object.entries(SOUND_CATEGORIES)) {
      const categoryDiv = document.createElement('div')
      categoryDiv.className = 'sound-prefs-category'

      // Category header with toggle-all checkbox
      const header = document.createElement('div')
      header.className = 'sound-prefs-category-header'

      const categoryCheckbox = document.createElement('input')
      categoryCheckbox.type = 'checkbox'
      categoryCheckbox.id = `sound-category-${categoryKey}`
      updateCategoryCheckbox(categoryCheckbox, category.sounds)

      const categoryLabel = document.createElement('label')
      categoryLabel.className = 'sound-prefs-category-label'
      categoryLabel.htmlFor = `sound-category-${categoryKey}`
      categoryLabel.textContent = category.label

      header.appendChild(categoryCheckbox)
      header.appendChild(categoryLabel)
      categoryDiv.appendChild(header)

      // Category checkbox toggles all sounds in category
      categoryCheckbox.addEventListener('change', () => {
        const shouldMute = !categoryCheckbox.checked
        for (const soundName of category.sounds) {
          soundManager.setSoundMuted(soundName, shouldMute)
          const soundCheckbox = document.getElementById(
            `sound-pref-${soundName}`
          ) as HTMLInputElement | null
          if (soundCheckbox) soundCheckbox.checked = !shouldMute
        }
        categoryCheckbox.indeterminate = false
        saveMutedSounds()
      })

      const grid = document.createElement('div')
      grid.className = 'sound-prefs-grid'

      for (const soundName of category.sounds) {
        const item = document.createElement('div')
        item.className = 'sound-pref-item'

        const checkbox = document.createElement('input')
        checkbox.type = 'checkbox'
        checkbox.id = `sound-pref-${soundName}`
        checkbox.checked = !soundManager.isSoundMuted(soundName)

        checkbox.addEventListener('change', () => {
          soundManager.setSoundMuted(soundName, !checkbox.checked)
          updateCategoryCheckbox(categoryCheckbox, category.sounds)
          saveMutedSounds()
        })

        const label = document.createElement('label')
        label.htmlFor = `sound-pref-${soundName}`
        label.textContent = SOUND_LABELS[soundName] || soundName

        item.appendChild(checkbox)
        item.appendChild(label)
        grid.appendChild(item)
      }

      categoryDiv.appendChild(grid)
      soundPrefsContainer.appendChild(categoryDiv)
    }
  }

  // Toggle sound preferences visibility
  soundPrefsToggle?.addEventListener('click', () => {
    const isExpanded = soundPrefsToggle.classList.toggle('expanded')
    soundPrefsContainer?.classList.toggle('visible', isExpanded)
  })

  // Apply streaming mode (hide/show username)
  function applyStreamingMode(enabled: boolean) {
    const usernameEl = document.getElementById('username')
    if (usernameEl) {
      if (enabled) {
        usernameEl.dataset.realName = usernameEl.textContent || ''
        usernameEl.textContent = '...'
      } else {
        usernameEl.textContent = usernameEl.dataset.realName || usernameEl.textContent
      }
    }
  }

  // Open modal
  settingsBtn?.addEventListener('click', () => {
    // Sync slider/checkbox states with current settings
    if (volumeSlider) {
      const currentVol = Math.round(soundManager.getVolume() * 100)
      volumeSlider.value = String(currentVol)
      if (volumeValue) volumeValue.textContent = `${currentVol}%`
    }
    // Sync grid size slider
    if (gridSizeSlider && state.scene) {
      const currentSize = state.scene.getGridRange()
      gridSizeSlider.value = String(currentSize)
      if (gridSizeValue) gridSizeValue.textContent = String(currentSize)
    }
    // Sync spatial audio checkbox
    if (spatialCheckbox) {
      spatialCheckbox.checked = soundManager.isSpatialEnabled()
    }
    // Sync streaming mode checkbox
    if (streamingCheckbox) {
      streamingCheckbox.checked = localStorage.getItem('vibecraft-streaming-mode') === 'true'
    }
    // Sync character select
    if (characterSelect) {
      characterSelect.value = localStorage.getItem('vibecraft-character') || 'robot'
    }
    // Sync sound preferences checkboxes (individual and category)
    for (const [categoryKey, category] of Object.entries(SOUND_CATEGORIES)) {
      let mutedCount = 0
      for (const soundName of category.sounds) {
        const checkbox = document.getElementById(
          `sound-pref-${soundName}`
        ) as HTMLInputElement | null
        if (checkbox) {
          const isMuted = soundManager.isSoundMuted(soundName)
          checkbox.checked = !isMuted
          if (isMuted) mutedCount++
        }
      }
      // Update category checkbox
      const categoryCheckbox = document.getElementById(
        `sound-category-${categoryKey}`
      ) as HTMLInputElement | null
      if (categoryCheckbox) {
        if (mutedCount === 0) {
          categoryCheckbox.checked = true
          categoryCheckbox.indeterminate = false
        } else if (mutedCount === category.sounds.length) {
          categoryCheckbox.checked = false
          categoryCheckbox.indeterminate = false
        } else {
          categoryCheckbox.checked = false
          categoryCheckbox.indeterminate = true
        }
      }
    }
    // Sync port input
    if (portInput) portInput.value = String(AGENT_PORT)
    // Update port status
    if (portStatus) {
      const connected = state.client?.isConnected ?? false
      portStatus.textContent = connected ? '● Connected' : '○ Disconnected'
      portStatus.className = `port-status ${connected ? 'connected' : 'disconnected'}`
    }
    // Fetch current CLI command from server
    if (cliCommandInput) {
      fetch(`${API_URL}/config`)
        .then((res) => res.json())
        .then((data) => {
          if (data.ok && data.cliCommand) {
            cliCommandInput.value = data.cliCommand
          }
        })
        .catch(() => {
          // Keep default value on error
        })
    }
    modal.classList.add('visible')
  })

  // Close modal
  const closeModal = () => modal.classList.remove('visible')
  closeBtn?.addEventListener('click', closeModal)
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal()
  })

  // Volume slider - plays pitch-modulated tick on every change
  volumeSlider?.addEventListener('input', () => {
    const vol = parseInt(volumeSlider.value, 10)
    soundManager.setVolume(vol / 100)
    if (volumeValue) volumeValue.textContent = `${vol}%`
    localStorage.setItem('vibecraft-volume', String(vol))
    // Play tick with pitch based on slider position
    if (state.soundEnabled) {
      soundManager.playSliderTick(vol / 100)
    }
  })

  // Grid size slider - rebuilds hex grid on change
  gridSizeSlider?.addEventListener('input', () => {
    const size = parseInt(gridSizeSlider.value, 10)
    if (gridSizeValue) gridSizeValue.textContent = String(size)
    state.scene?.setGridRange(size)
    localStorage.setItem('vibecraft-grid-size', String(size))
    // Play tick with pitch based on slider position (normalized 5-80 to 0-1)
    if (state.soundEnabled) {
      soundManager.playSliderTick((size - 5) / 75)
    }
  })

  // Spatial audio checkbox
  spatialCheckbox?.addEventListener('change', () => {
    const enabled = spatialCheckbox.checked
    soundManager.setSpatialEnabled(enabled)
    localStorage.setItem('vibecraft-spatial-audio', String(enabled))
  })

  // Streaming mode checkbox
  streamingCheckbox?.addEventListener('change', () => {
    const enabled = streamingCheckbox.checked
    localStorage.setItem('vibecraft-streaming-mode', String(enabled))
    applyStreamingMode(enabled)
  })

  // Character select - instantly swap all characters
  characterSelect?.addEventListener('change', () => {
    localStorage.setItem('vibecraft-character', characterSelect.value)

    // Track character selection for achievements
    achievementSystem.trackCharacterSelected(characterSelect.value)

    // Swap all existing characters to the new type
    if (state.scene) {
      for (const [sessionId, session] of state.sessions) {
        // Save current character state
        const oldCharacter = session.claude
        const position = oldCharacter.mesh.position.clone()
        const rotation = oldCharacter.mesh.rotation.clone()
        const currentState = oldCharacter.state
        const currentStation = oldCharacter.currentStation

        // Dispose old character
        oldCharacter.dispose()

        // Create new character of selected type
        const newCharacter = createCharacter(state.scene, {
          color: session.color,
          startStation: currentStation,
        })

        // Restore position and rotation
        newCharacter.mesh.position.copy(position)
        newCharacter.mesh.rotation.copy(rotation)

        // Restore state
        if (currentState !== 'idle') {
          newCharacter.setState(currentState)
        }

        // Update session reference
        session.claude = newCharacter
      }
    }
  })

  // Port change - save to localStorage and prompt refresh
  portInput?.addEventListener('change', () => {
    const newPort = parseInt(portInput.value, 10)
    if (newPort && newPort > 0 && newPort <= 65535 && newPort !== AGENT_PORT) {
      localStorage.setItem('vibecraft-agent-port', String(newPort))
      if (confirm(`Port changed to ${newPort}. Reload page to connect to new port?`)) {
        window.location.reload()
      }
    }
  })

  // CLI command - save to server
  const saveCliCommand = () => {
    const newCommand = cliCommandInput?.value.trim()
    if (newCommand) {
      fetch(`${API_URL}/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliCommand: newCommand }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.ok) {
            toast.success(`CLI command set to "${data.cliCommand}"`, { duration: 2000 })
          }
        })
        .catch((err) => {
          console.error('Failed to update CLI command:', err)
          toast.error('Failed to save CLI command', { duration: 3000 })
        })
    }
  }

  cliCommandInput?.addEventListener('change', saveCliCommand)
  cliCommandInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveCliCommand()
      cliCommandInput.blur()
    }
  })

  // Refresh sessions button
  refreshBtn?.addEventListener('click', async () => {
    await sessionAPI.refreshSessions()
    closeModal()
  })

  // Replay history button
  const replayBtn = document.getElementById('settings-replay-history')
  replayBtn?.addEventListener('click', async () => {
    closeModal()
    await enterReplayMode()
  })

  // Escape to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('visible')) {
      closeModal()
    }
  })
}

// Question Modal and Permission Modal moved to src/ui/QuestionModal.ts and src/ui/PermissionModal.ts

// ============================================================================
// About Modal
// ============================================================================

function setupAboutModal(): void {
  const aboutBtn = document.getElementById('about-btn')
  const modal = document.getElementById('about-modal')
  const closeBtn = document.getElementById('about-close')

  if (!modal) return

  // Open modal
  aboutBtn?.addEventListener('click', () => {
    // Fetch and display version
    const versionEl = document.getElementById('about-version')
    if (versionEl) {
      fetch('/health')
        .then((res) => res.json())
        .then((health) => {
          versionEl.textContent = `v${health.version || 'unknown'}`
        })
        .catch(() => {
          versionEl.textContent = 'v?'
        })
    }
    modal.classList.add('visible')
  })

  // Close modal
  const closeModal = () => modal.classList.remove('visible')
  closeBtn?.addEventListener('click', closeModal)
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal()
  })
}

// ============================================================================
// Connection Overlay
// ============================================================================

function setupNotConnectedOverlay(): void {
  const overlay = document.getElementById('not-connected-overlay')
  const retryBtn = document.getElementById('retry-connection')
  const exploreBtn = document.getElementById('explore-offline')
  const offlineBanner = document.getElementById('offline-banner')
  const bannerDismiss = document.getElementById('offline-banner-dismiss')

  if (!overlay) return

  retryBtn?.addEventListener('click', () => {
    window.location.reload()
  })

  // Explore button: dismiss overlay, show offline banner
  exploreBtn?.addEventListener('click', () => {
    overlay.classList.remove('visible')
    offlineBanner?.classList.remove('hidden')
  })

  // Dismiss offline banner
  bannerDismiss?.addEventListener('click', () => {
    offlineBanner?.classList.add('hidden')
  })
}

function showOfflineBanner(): void {
  const banner = document.getElementById('offline-banner')
  banner?.classList.remove('hidden')
}

function setupZoneTimeoutModal(): void {
  const modal = document.getElementById('zone-timeout-modal')
  const closeBtn = document.getElementById('zone-timeout-close')

  if (!modal) return

  closeBtn?.addEventListener('click', () => {
    modal.classList.remove('visible')
  })

  // Close on clicking backdrop
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('visible')
    }
  })

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('visible')) {
      modal.classList.remove('visible')
    }
  })
}

function showZoneTimeoutModal(): void {
  const modal = document.getElementById('zone-timeout-modal')
  modal?.classList.add('visible')
}

function showNotConnectedOverlay(): void {
  const overlay = document.getElementById('not-connected-overlay')
  overlay?.classList.add('visible')
}

function hideNotConnectedOverlay(): void {
  const overlay = document.getElementById('not-connected-overlay')
  overlay?.classList.remove('visible')
}

// ============================================================================
// Achievements
// ============================================================================

function setupAchievementsButton(): void {
  // Create achievements button in the unified HUD (next to settings, plugins, help buttons)
  const hudButtons = document.querySelector('.unified-hud')
  if (!hudButtons) {
    console.warn('Could not find .unified-hud for achievements button')
    return
  }

  const btn = createAchievementsButton()

  // Insert before the settings button
  const settingsBtn = document.getElementById('settings-btn')
  if (settingsBtn) {
    hudButtons.insertBefore(btn, settingsBtn)
  } else {
    hudButtons.appendChild(btn)
  }
}

function createAchievementsButton(): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.className = 'hud-btn achievements-btn'
  btn.id = 'achievements-btn'
  btn.innerHTML = `🏆 <span class="points-badge">${achievementSystem.getTotalPoints()}</span>`
  btn.title = 'Achievements'
  btn.addEventListener('click', () => {
    console.log('[Achievements] Button clicked, showing modal')
    showAchievementsModal()
  })

  // Update points badge when achievements unlock
  achievementSystem.onUnlock(() => {
    const badge = btn.querySelector('.points-badge')
    if (badge) {
      badge.textContent = achievementSystem.getTotalPoints().toString()
    }
  })

  return btn
}

// ============================================================================
// Plugins Button
// ============================================================================

function setupPluginsButton(): void {
  const pluginsBtn = document.getElementById('plugins-btn')
  const modal = document.getElementById('plugins-modal')
  const closeBtn = document.getElementById('plugins-close')
  const refreshBtn = document.getElementById('plugins-refresh')

  if (!pluginsBtn || !modal) return

  // Show modal on click
  pluginsBtn.addEventListener('click', () => {
    modal.classList.add('visible')
    updateMcpServersList()
  })

  // Close button
  closeBtn?.addEventListener('click', () => {
    modal.classList.remove('visible')
  })

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('visible')
  })

  // Refresh button
  refreshBtn?.addEventListener('click', () => {
    updateMcpServersList()
  })

  // Marketplace buttons
  const pluginMarketplaceBtn = document.getElementById('open-plugin-marketplace')
  const mcpMarketplaceBtn = document.getElementById('open-mcp-marketplace')

  pluginMarketplaceBtn?.addEventListener('click', async () => {
    const { show: showPluginMarketplace } = await import('./ui/PluginMarketplaceModal')
    showPluginMarketplace()
  })

  mcpMarketplaceBtn?.addEventListener('click', async () => {
    const { show: showMCPMarketplace } = await import('./ui/MCPMarketplaceModal')
    showMCPMarketplace()
  })

  // Tab switching
  const tabs = modal.querySelectorAll('.plugins-tab')
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-tab')
      if (!tabName) return

      // Update active tab
      tabs.forEach((t) => t.classList.remove('active'))
      tab.classList.add('active')

      // Show corresponding content
      modal.querySelectorAll('.plugins-tab-content').forEach((content) => {
        content.classList.add('hidden')
      })
      const targetContent = document.getElementById(`plugins-tab-${tabName}`)
      targetContent?.classList.remove('hidden')
    })
  })
}

// Update MCP servers list in the modal
function updateMcpServersList(): void {
  const listEl = document.getElementById('mcp-servers-list')
  const countEl = document.getElementById('mcp-count')
  if (!listEl) return

  // Get MCP servers from the registry (if available)
  const mcpRegistry = (
    window as unknown as { mcpRegistry?: Map<string, { tools: string[]; lastSeen: number }> }
  ).mcpRegistry

  if (!mcpRegistry || mcpRegistry.size === 0) {
    listEl.innerHTML =
      '<div class="plugins-empty">No MCP servers detected yet. They appear as Claude uses MCP tools.</div>'
    if (countEl) countEl.textContent = '0'
    return
  }

  // Build list of MCP servers
  let html = ''
  mcpRegistry.forEach((server, name) => {
    const toolCount = server.tools.length
    const lastSeenAgo = Math.floor((Date.now() - server.lastSeen) / 1000)
    const lastSeenText = lastSeenAgo < 60 ? 'just now' : `${Math.floor(lastSeenAgo / 60)}m ago`

    html += `
      <div class="plugin-modal-item">
        <div class="plugin-modal-icon">🔧</div>
        <div class="plugin-modal-info">
          <div class="plugin-modal-name">${escapeHtml(name)}</div>
          <div class="plugin-modal-tools">${toolCount} tool${toolCount !== 1 ? 's' : ''} • Last used ${lastSeenText}</div>
        </div>
        <span class="plugin-modal-status active">Active</span>
      </div>
    `
  })

  listEl.innerHTML = html
  if (countEl) countEl.textContent = String(mcpRegistry.size)
}

// ============================================================================
// Help Button
// ============================================================================

function setupHelpButton(): void {
  const helpBtn = document.getElementById('help-btn')
  if (!helpBtn) return

  helpBtn.addEventListener('click', showHelpModal)
}

function showHelpModal(): void {
  // Check if modal already exists
  let modal = document.getElementById('help-modal')
  if (modal) {
    modal.classList.add('visible')
    return
  }

  // Create modal using safe DOM methods
  modal = document.createElement('div')
  modal.id = 'help-modal'
  modal.className = 'modal'

  const content = document.createElement('div')
  content.className = 'modal-content help-modal-content'

  const header = document.createElement('div')
  header.className = 'modal-header'

  const title = document.createElement('h3')
  title.textContent = '❓ Keyboard Shortcuts'
  header.appendChild(title)

  const closeBtn = document.createElement('button')
  closeBtn.type = 'button'
  closeBtn.className = 'modal-close-btn'
  closeBtn.textContent = '×'
  closeBtn.addEventListener('click', () => modal?.classList.remove('visible'))
  header.appendChild(closeBtn)

  content.appendChild(header)

  // Help content
  const helpContent = document.createElement('div')
  helpContent.className = 'help-content'

  const shortcuts: Array<{ section: string; items: Array<{ keys: string; desc: string }> }> = [
    {
      section: 'Navigation',
      items: [
        { keys: '1-6', desc: 'Switch to session 1-6' },
        { keys: 'Tab', desc: 'Toggle Workshop / Feed focus' },
        { keys: 'Esc', desc: 'Toggle focus / close modal' },
        { keys: '` or 0', desc: 'Overview (all sessions)' },
        { keys: 'Alt+N', desc: 'New session' },
        { keys: 'Alt+A', desc: 'Next session needing attention' },
      ],
    },
    {
      section: 'Tools & Features',
      items: [
        { keys: 'D', desc: 'Toggle draw mode' },
        { keys: 'P', desc: 'Toggle station panels' },
        { keys: 'F', desc: 'Toggle follow-active mode' },
        { keys: 'Alt+D', desc: 'Toggle dev panel' },
        { keys: 'Alt+R', desc: 'Toggle voice recording' },
        { keys: 'Alt+Space', desc: 'Expand recent "show more"' },
      ],
    },
    {
      section: 'Draw Mode',
      items: [
        { keys: '1-6', desc: 'Select color' },
        { keys: '0', desc: 'Eraser' },
        { keys: 'Q/E', desc: 'Brush size -/+' },
        { keys: 'R', desc: 'Toggle 3D stacking' },
        { keys: 'X', desc: 'Clear all hexes' },
      ],
    },
    {
      section: 'Session Actions',
      items: [
        { keys: 'Ctrl+C', desc: 'Copy / Interrupt session' },
        { keys: 'Right-click zone', desc: 'Zone info / commands' },
        { keys: 'Click empty floor', desc: 'Create new session' },
      ],
    },
  ]

  for (const section of shortcuts) {
    const sectionDiv = document.createElement('div')
    sectionDiv.className = 'help-section'

    const sectionTitle = document.createElement('h4')
    sectionTitle.textContent = section.section
    sectionDiv.appendChild(sectionTitle)

    const shortcutsDiv = document.createElement('div')
    shortcutsDiv.className = 'help-shortcuts'

    for (const item of section.items) {
      const shortcut = document.createElement('div')
      shortcut.className = 'help-shortcut'

      const kbd = document.createElement('kbd')
      kbd.textContent = item.keys
      shortcut.appendChild(kbd)

      const desc = document.createElement('span')
      desc.textContent = item.desc
      shortcut.appendChild(desc)

      shortcutsDiv.appendChild(shortcut)
    }

    sectionDiv.appendChild(shortcutsDiv)
    helpContent.appendChild(sectionDiv)
  }

  content.appendChild(helpContent)
  modal.appendChild(content)

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('visible')
  })

  // Add CSS if not already added
  if (!document.getElementById('help-modal-styles')) {
    const style = document.createElement('style')
    style.id = 'help-modal-styles'
    style.textContent = `
      #help-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.75);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.2s, visibility 0.2s;
      }
      #help-modal.visible {
        opacity: 1;
        visibility: visible;
      }
      .help-modal-content {
        width: 500px;
        max-width: 90vw;
        max-height: 80vh;
        overflow-y: auto;
        background: rgba(15, 23, 42, 0.98);
        border: 1px solid rgba(100, 116, 139, 0.3);
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      }
      .help-content {
        padding: 16px;
      }
      .help-section {
        margin-bottom: 16px;
      }
      .help-section:last-child {
        margin-bottom: 0;
      }
      .help-section h4 {
        font-size: 12px;
        font-weight: 600;
        color: #a78bfa;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 8px;
        padding-bottom: 4px;
        border-bottom: 1px solid rgba(100, 116, 139, 0.2);
      }
      .help-shortcuts {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .help-shortcut {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 12px;
        color: #94a3b8;
        padding: 4px 0;
      }
      .help-shortcut kbd {
        display: inline-block;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 4px;
        padding: 2px 6px;
        font-family: monospace;
        font-size: 11px;
        color: #fff;
        min-width: 24px;
        text-align: center;
      }
      .modal-close-btn {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.3);
        border-radius: 6px;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        color: #ef4444;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .modal-close-btn:hover {
        background: rgba(239, 68, 68, 0.2);
        border-color: rgba(239, 68, 68, 0.5);
      }
    `
    document.head.appendChild(style)
  }

  document.body.appendChild(modal)

  // Show after adding to DOM
  requestAnimationFrame(() => modal.classList.add('visible'))
}

// ============================================================================
// Initialization
// ============================================================================

function init() {
  const container = document.getElementById('canvas-container')
  if (!container) {
    console.error('Canvas container not found')
    return
  }

  // Create scene (zones and Claudes created dynamically per session)
  state.scene = new WorkshopScene(container)

  // Set up spatial audio resolvers
  soundManager.setZonePositionResolver((zoneId: string) => {
    return state.scene?.getZoneWorldPosition(zoneId) ?? null
  })
  soundManager.setFocusedZoneResolver(() => {
    return state.scene?.focusedZoneId ?? null
  })

  // Update spatial audio listener position periodically (every 100ms)
  setInterval(() => {
    if (state.scene) {
      const camera = state.scene.camera
      soundManager.updateListener(camera.position.x, camera.position.z, camera.rotation.y)
    }
  }, 100)

  // Load saved hex art from localStorage
  const savedHexArt = localStorage.getItem('vibecraft-hexart')
  if (savedHexArt) {
    try {
      const hexes = JSON.parse(savedHexArt)
      state.scene.loadPaintedHexes(hexes)
      console.log(`Loaded ${hexes.length} painted hexes from localStorage`)
    } catch (e) {
      console.warn('Failed to load hex art from localStorage:', e)
    }
  }

  // Load saved zone elevations from localStorage
  const savedZoneElevations = localStorage.getItem('vibecraft-zone-elevations')
  if (savedZoneElevations) {
    try {
      const elevations = JSON.parse(savedZoneElevations)
      state.scene.loadZoneElevations(elevations)
      console.log(`Loaded ${Object.keys(elevations).length} zone elevations from localStorage`)
    } catch (e) {
      console.warn('Failed to load zone elevations from localStorage:', e)
    }
  }

  // Make canvas focusable for Tab switching
  state.scene.renderer.domElement.tabIndex = 0
  state.scene.renderer.domElement.style.outline = 'none'

  // Start rendering
  state.scene.start()

  // Initialize attention system
  state.attentionSystem = new AttentionSystem({
    onQueueChange: () => renderManagedSessions(),
  })

  // Make attention badge clickable
  const attentionBadge = document.getElementById('attention-badge')
  if (attentionBadge) {
    attentionBadge.style.cursor = 'pointer'
    attentionBadge.title = 'Go to next session needing attention (Alt+A)'
    attentionBadge.addEventListener('click', goToNextAttention)
  }

  // Initialize timeline manager
  state.timelineManager = new TimelineManager()

  // Initialize feed manager
  state.feedManager = new FeedManager()
  state.feedManager.setupScrollButton()

  // Initialize replay controls
  state.replayControls = setupReplayControls({
    onExit: exitReplayMode,
  })

  // Subscribe to replay events - process events during replay playback
  replayController.onEvent((event) => {
    // Process event through the normal handler during replay
    handleEvent(event)
  })

  // Update timeline highlighting when replay state changes
  // (ReplayControls updates itself automatically via internal subscription)
  replayController.onStateChange((replayState) => {
    if (state.timelineManager) {
      if (replayState.mode !== 'live') {
        state.timelineManager.highlightIcon(replayState.currentIndex)
      } else {
        state.timelineManager.clearHighlight()
      }
    }
  })

  // Register EventBus handlers (decoupled event handling)
  registerAllHandlers()

  // Initialize plugin system (now renders into Plugins modal tabs)
  initializePluginsInModal()

  // Listen for plugin events
  pluginManager.getContext().on('model:change', ({ model }) => {
    console.log('Plugin: Model changed to', model)
    // Store selected model for new sessions
    localStorage.setItem('vibecraft:default-model', model)
  })

  pluginManager.getContext().on('thinking:toggle', ({ enabled }) => {
    console.log('Plugin: Thinking mode', enabled ? 'enabled' : 'disabled')
    // Store thinking preference for new sessions
    localStorage.setItem('vibecraft:thinking-enabled', String(enabled))
  })

  pluginManager.getContext().on('mcp:select', ({ server }) => {
    console.log('Plugin: MCP server selected', server)
    // Could filter activity feed by MCP server here
  })

  // Configure commit celebration handlers (confetti + achievement toast)
  configureCommitHandlers({
    scene: state.scene.scene,
    getZonePosition: (sessionId: string) => {
      const zone = state.scene?.zones.get(sessionId)
      if (!zone) return null
      return new THREE.Vector3(zone.position.x, zone.elevation || 0, zone.position.z)
    },
    getProjectName: (sessionId: string) => {
      const managed = state.managedSessions.find((m) => m.claudeSessionId === sessionId)
      return managed?.projectName
    },
  })

  // Initialize streak system
  const { streakSystem } = await import('./systems/StreakSystem')
  await streakSystem.initialize()

  // Track current streak for achievements
  achievementSystem.trackStreak(streakSystem.getCurrentStreak())

  // Show welcome toast on first visit
  const hasSeenWelcome = localStorage.getItem('vibecraft-has-seen-welcome')
  if (!hasSeenWelcome) {
    localStorage.setItem('vibecraft-has-seen-welcome', 'true')
    const { toast } = await import('./ui/Toast')
    setTimeout(() => {
      toast.info(
        `Welcome to Vibecraft! 🎨\n\nTrack Claude Code's activity in real-time as a 3D workshop.\n\n• Earn achievements for milestones\n• Build daily streaks for bonus points\n• Unlock special characters and content\n\nPress Alt+A to view achievements anytime!`,
        { duration: 15000 }
      )
    }, 1000)
  }

  // Listen for streak milestones
  streakSystem.onMilestone((milestone) => {
    import('./ui/Toast').then(({ toast }) => {
      toast.success(milestone.message, { icon: '🔥', duration: 5000 })
    })

    // Track streak for achievements
    achievementSystem.trackStreak(milestone.value)

    // Play victory animation on Claude
    const sessions = Array.from(state.sessions.values())
    if (sessions.length > 0 && sessions[0].claude) {
      sessions[0].claude.playIdleBehavior('victoryDance')
    }
  })

  // Hook confetti updates into render loop
  state.scene.onRender((delta) => {
    updateConfetti(delta)
  })

  // Configure activity tracking for dynamic zone prominence
  configureActivityHandlers(state.scene)

  // Connect to event server
  state.client = new EventClient({
    url: WS_URL,
    debug: true,
  })

  // Track if we've ever connected
  let hasConnected = false

  state.client.onConnection((connected) => {
    updateStatus(connected, connected ? 'Connected' : 'Disconnected')
    console.log('Connection status:', connected)

    if (connected) {
      hasConnected = true
      hideNotConnectedOverlay()
    }
  })

  // Show not-connected overlay after timeout if never connected (production only)
  if (!import.meta.env.DEV) {
    setTimeout(() => {
      if (!hasConnected) {
        console.log('Connection timeout - showing overlay')
        showNotConnectedOverlay()
      }
    }, 3000) // 3 seconds to connect before showing overlay
  }

  state.client.onEvent(handleEvent)

  // Handle history batch - pre-scan for completions before rendering
  state.client.onHistory((events) => {
    // First pass: collect all completed tool use IDs (across all sessions)
    for (const event of events) {
      if (event.type === 'post_tool_use') {
        const e = event as PostToolUseEvent
        state.timelineManager?.markCompleted(e.toolUseId)
      }
    }
    // Second pass: process all events (sessions created dynamically)
    // Mark as history so ephemeral UI (notifications) is skipped
    for (const event of events) {
      handleEvent(event, true)
    }
  })

  // Handle token updates
  state.client.onTokens((data) => {
    // Track tokens for achievements
    if (data.current > 0) {
      achievementSystem.trackTokens(data.current)
    }

    // Track in token tracking system (per-session with history)
    if (data.sessionId) {
      const session = state.managedSessions.find((s) => s.id === data.sessionId)
      tokenTrackingSystem.updateSession(data.sessionId, data.current, data.cumulative, {
        sessionName: session?.name,
        model:
          session?.modelID === 'opus'
            ? 'claude-opus-4'
            : session?.modelID === 'haiku'
              ? 'claude-3.5-haiku'
              : 'claude-sonnet-4',
      })
    }

    // Update feed panel stat
    const tokensEl = document.getElementById('stat-tokens')
    if (tokensEl) {
      tokensEl.textContent = data.cumulative.toLocaleString()
    }
    // Update top-left HUD with formatted display
    const tokenCounter = document.getElementById('token-counter')
    if (tokenCounter) {
      tokenCounter.textContent = `⚡ ${formatTokens(data.cumulative)}`
      tokenCounter.title = `${data.cumulative.toLocaleString()} tokens used`
    }

    // Update managed session tokens if sessionId is provided
    // Uses targeted DOM update instead of full re-render for performance
    if (data.sessionId) {
      const session = state.managedSessions.find((s) => s.id === data.sessionId)
      if (session) {
        session.tokens = { current: data.current, cumulative: data.cumulative }

        // Targeted DOM update: only update the token element for this session
        const sessionEl = document.querySelector(
          `.session-item[data-session-id="${data.sessionId}"]`
        ) as HTMLElement | null
        if (sessionEl) {
          let tokensEl = sessionEl.querySelector('.session-tokens')
          if (!tokensEl) {
            // Create token element if it doesn't exist
            tokensEl = document.createElement('div')
            tokensEl.className = 'session-tokens'
            const infoEl = sessionEl.querySelector('.session-info')
            const promptEl = sessionEl.querySelector('.session-prompt')
            if (promptEl) {
              infoEl?.insertBefore(tokensEl, promptEl)
            } else {
              infoEl?.appendChild(tokensEl)
            }
          }
          tokensEl.textContent = `⚡ ${formatTokens(data.current)}`

          // Update tooltip with new token info
          const tooltipParts = sessionEl.title.split('\n')
          const tokenLineIdx = tooltipParts.findIndex((l: string) => l.startsWith('Tokens:'))
          const tokenLine = `Tokens: ${data.current.toLocaleString()} current, ${data.cumulative.toLocaleString()} total`
          if (tokenLineIdx >= 0) {
            tooltipParts[tokenLineIdx] = tokenLine
          } else {
            tooltipParts.push(tokenLine)
          }
          sessionEl.title = tooltipParts.join('\n')
        }
      }
    }
  })

  // Handle managed sessions updates
  state.client.onSessions((sessions) => {
    // Reconcile local link map with server's authoritative data
    // Server is the source of truth for session linking
    claudeToManagedLink.clear()
    for (const session of sessions) {
      if (session.sessionType === 'claude' && session.claudeSessionId) {
        claudeToManagedLink.set(session.claudeSessionId, session.id)

        // Proactively create zone if it doesn't exist yet
        // This handles sessions that have no recent events in history
        if (state.scene && !state.scene.zones.has(session.claudeSessionId)) {
          // Use saved position if available, then check pendingZoneHints from click
          let hintPosition: { x: number; z: number } | undefined
          if (session.zonePosition) {
            const cartesian = state.scene.hexGrid.axialToCartesian(session.zonePosition)
            hintPosition = { x: cartesian.x, z: cartesian.z }
            console.log(
              `Restoring zone for "${session.name}" at saved position`,
              session.zonePosition
            )
          } else {
            // Check pendingZoneHints for click position (race condition fix)
            const pendingHint = pendingZoneHints.get(session.name)
            if (pendingHint) {
              hintPosition = pendingHint
              pendingZoneHints.delete(session.name)
            } else {
              console.log(
                `Creating zone for session "${session.name}" (no recent events in history)`
              )
            }
          }
          const zone = state.scene.createZone(session.claudeSessionId, { hintPosition })

          // Track zone creation time for grace period protection
          zoneCreationTimes.set(session.claudeSessionId, Date.now())

          // Play zone creation sound
          if (state.soundEnabled) {
            soundManager.play('zone_create', { zoneId: session.claudeSessionId })
          }

          // Clean up pending zone now that real zone exists (race condition fix)
          const pendingZoneId = pendingZonesToCleanup.get(session.name)
          if (pendingZoneId) {
            state.scene.removePendingZone(pendingZoneId)
            pendingZonesToCleanup.delete(session.name)
            // Clear the timeout since zone was created successfully
            const timeoutId = pendingZoneTimeouts.get(pendingZoneId)
            if (timeoutId) {
              clearTimeout(timeoutId)
              pendingZoneTimeouts.delete(pendingZoneId)
            }
          }

          // Create character entity for this zone
          // Note: This block is inside sessionType === 'claude', so character uses zone color
          const claude = createCharacter(state.scene, {
            color: zone.color,
            startStation: 'center',
          })
          const centerStation = zone.stations.get('center')
          if (centerStation) {
            claude.mesh.position.copy(centerStation.position)
          }

          const subagents = new SubagentManager(state.scene)

          const sessionState: SessionState = {
            claude,
            subagents,
            zone,
            color: zone.color,
            stats: {
              toolsUsed: 0,
              filesTouched: new Set(),
              activeSubagents: 0,
            },
          }
          state.sessions.set(session.claudeSessionId, sessionState)

          // Update zone label with session name, project, and branch
          const keybindIndex = sessions.indexOf(session)
          const keybind = keybindIndex >= 0 ? getSessionKeybind(keybindIndex) : undefined
          const labelName = session.projectName || session.name
          const branch = session.gitStatus?.branch
          state.scene.updateZoneLabel(session.claudeSessionId, labelName, keybind, branch)
        }

        // Update zone floor status based on session status
        if (state.scene) {
          // Map managed session status to zone status
          const zoneStatus =
            session.status === 'working'
              ? 'working'
              : session.status === 'waiting'
                ? 'waiting'
                : session.status === 'offline'
                  ? 'offline'
                  : 'idle'
          state.scene.setZoneStatus(session.claudeSessionId, zoneStatus)
        }
      } else if (session.sessionType === 'opencode') {
        // Handle OpenCode sessions
        const zoneId = session.id

        if (state.scene && !state.scene.zones.has(zoneId)) {
          // Use saved position if available
          let hintPosition: { x: number; z: number } | undefined
          if (session.zonePosition) {
            const cartesian = state.scene.hexGrid.axialToCartesian(session.zonePosition)
            hintPosition = { x: cartesian.x, z: cartesian.z }
            console.log(
              `Restoring zone for OpenCode session "${session.name}" at saved position`,
              session.zonePosition
            )
          } else {
            console.log(`Creating zone for OpenCode session "${session.name}"`)
          }
          const zone = state.scene.createZone(zoneId, { hintPosition })

          // Track zone creation time for grace period protection
          zoneCreationTimes.set(zoneId, Date.now())

          // Play zone creation sound
          if (state.soundEnabled) {
            soundManager.play('zone_create', { zoneId })
          }

          // Create OpenCode entity for this zone using ClaudeMon with OpenCode colors
          const opencode = new Claude(state.scene, {
            color: 0x6366f1, // OpenCode indigo
            statusColor: 0x8b5cf6, // Purple accent
            startStation: 'center',
          })
          const centerStation = zone.stations.get('center')
          if (centerStation) {
            opencode.mesh.position.copy(centerStation.position)
          }

          const subagents = new SubagentManager(state.scene)

          const sessionState: SessionState = {
            claude: opencode,
            subagents,
            zone,
            color: zone.color,
            stats: {
              toolsUsed: 0,
              filesTouched: new Set(),
              activeSubagents: 0,
            },
          }
          state.sessions.set(zoneId, sessionState)

          // Update zone label with session name
          const keybindIndex = sessions.indexOf(session)
          const keybind = keybindIndex >= 0 ? getSessionKeybind(keybindIndex) : undefined
          state.scene.updateZoneLabel(zoneId, session.name, keybind)
        }

        // Update zone floor status based on session status
        if (state.scene) {
          const zoneStatus =
            session.status === 'working'
              ? 'working'
              : session.status === 'waiting'
                ? 'waiting'
                : session.status === 'offline'
                  ? 'offline'
                  : 'idle'
          state.scene.setZoneStatus(zoneId, zoneStatus)
        }
      }
    }

    // Clean up orphaned zones (zones not linked to any managed session)
    // Uses a multi-stage approach to prevent zones from disappearing prematurely:
    // 1. Recently created zones (< 10s) are never deleted
    // 2. Zones must be orphaned for 2+ minutes before deletion
    // 3. If a zone becomes linked again, its orphan timer resets
    if (state.scene) {
      const activeZoneIds = new Set(
        sessions.map((s) => (s.sessionType === 'claude' ? s.claudeSessionId : s.id)).filter(Boolean)
      )
      const zonesToDelete: string[] = []
      const now = Date.now()

      for (const [zoneId] of state.scene.zones) {
        if (activeZoneIds.has(zoneId)) {
          // Zone is active - clear any orphan tracking
          if (zoneOrphanedTimes.has(zoneId)) {
            console.log(`Zone ${zoneId.slice(0, 8)} is no longer orphaned`)
            zoneOrphanedTimes.delete(zoneId)
          }
          continue
        }

        // Zone is not in active list - check if it should be deleted

        // Check 1: Don't delete recently created zones
        const createdAt = zoneCreationTimes.get(zoneId)
        if (createdAt && now - createdAt < ZONE_GRACE_PERIOD_MS) {
          continue
        }

        // Check 2: Track when zone first became orphaned
        if (!zoneOrphanedTimes.has(zoneId)) {
          zoneOrphanedTimes.set(zoneId, now)
          console.log(
            `Zone ${zoneId.slice(0, 8)} became orphaned - will delete in ${ORPHAN_TIMEOUT_MS / 1000}s if still orphaned`
          )
          continue
        }

        // Check 3: Only delete if orphaned for long enough
        const orphanedAt = zoneOrphanedTimes.get(zoneId)!
        if (now - orphanedAt < ORPHAN_TIMEOUT_MS) {
          // Not orphaned long enough yet
          continue
        }

        // Zone has been orphaned for 2+ minutes - safe to delete
        zonesToDelete.push(zoneId)
      }

      for (const zoneId of zonesToDelete) {
        // Clean up session state (Claude entity, subagents)
        const sessionState = state.sessions.get(zoneId)
        if (sessionState) {
          sessionState.claude.dispose()
          state.sessions.delete(zoneId)
        }
        // Play zone deletion sound BEFORE deleting (so position is still available)
        if (state.soundEnabled) {
          soundManager.play('zone_delete', { zoneId })
        }

        // Delete the 3D zone
        state.scene.deleteZone(zoneId)

        // Clean up tracking
        zoneCreationTimes.delete(zoneId)
        zoneOrphanedTimes.delete(zoneId)

        console.log(
          `Cleaned up orphaned zone: ${zoneId.slice(0, 8)} (orphaned for ${ORPHAN_TIMEOUT_MS / 1000}s)`
        )
      }
    }

    // Detect status changes (working → idle) and notify
    if (state.attentionSystem) {
      const newlyIdle = state.attentionSystem.processStatusChanges(sessions)

      // Auto-focus first newly idle session if user hasn't overridden camera
      if (newlyIdle.length > 0 && !state.userChangedCamera) {
        const workingSessions = sessions.filter((s) => s.status === 'working')
        if (workingSessions.length === 0) {
          const session = newlyIdle[0]
          const zoneId = session.sessionType === 'claude' ? session.claudeSessionId : session.id
          if (zoneId && state.scene) {
            state.scene.focusZone(zoneId)
            selectManagedSession(session.id)
          }
        }
      }
    }

    state.managedSessions = sessions
    renderManagedSessions()

    // One-time toast if archived sessions exist
    const archivedCount = sessions.filter((s) => s.archived).length
    if (archivedCount > 0 && !state.hasSeenArchivedNotice) {
      state.hasSeenArchivedNotice = true
      import('./ui/Toast').then(({ toast }) => {
        toast.info(
          `${archivedCount} archived session${archivedCount > 1 ? 's' : ''} hidden. Click "Show Archived" to view.`,
          {
            duration: 5000,
          }
        )
      })
    }

    // Sync zone labels with managed session names
    syncZoneLabels()

    // Update git status displays on zones
    if (state.scene) {
      for (const session of sessions) {
        if (session.claudeSessionId && session.gitStatus) {
          state.scene.updateZoneGitStatus(session.claudeSessionId, session.gitStatus)
        }
      }
    }

    // Restore or auto-select session
    if (!state.selectedManagedSession && sessions.length > 0) {
      // Try to restore from localStorage
      const savedSessionId = localStorage.getItem('vibecraft-selected-session')
      const savedSession = savedSessionId ? sessions.find((s) => s.id === savedSessionId) : null

      if (savedSession) {
        selectManagedSession(savedSession.id)
      } else {
        // Fall back to first session
        selectManagedSession(sessions[0].id)
      }
    }

    // Auto-overview once when first reaching 2+ sessions (but respect user's manual changes)
    if (
      sessions.length >= 2 &&
      state.scene &&
      !state.hasAutoOverviewed &&
      !state.userChangedCamera
    ) {
      state.hasAutoOverviewed = true
      state.scene.setOverviewMode()
    }
  })

  // Handle permission prompts, question prompts, and text tiles
  state.client.onRawMessage((message) => {
    if (message.type === 'permission_prompt') {
      const { sessionId, tool, context, options } = message.payload as {
        sessionId: string
        tool: string
        context: string
        options: Array<{ number: string; label: string }>
      }
      showPermissionModal(sessionId, tool, context, options)
    } else if (message.type === 'permission_resolved') {
      hidePermissionModal()
    } else if (message.type === 'question_prompt') {
      // Handle AskUserQuestion prompts
      const { sessionId, managedSessionId, questions } = message.payload as {
        sessionId: string
        managedSessionId: string | null
        questions: Array<{
          question: string
          header: string
          options: Array<{ label: string; description?: string }>
          multiSelect: boolean
        }>
      }

      import('./ui/QuestionModal').then(({ showQuestionModal }) => {
        showQuestionModal({
          sessionId,
          managedSessionId,
          questions,
        })
      })
    } else if (message.type === 'text_tiles') {
      // Update text tiles in scene
      const tiles = message.payload as import('../shared/types').TextTile[]
      if (state.scene) {
        state.scene.setTextTiles(tiles)
      }
    }
  })

  state.client.connect()

  // Setup prompt form
  setupPromptForm()

  // Setup terminal toggle
  setupTerminalToggle()

  // Setup managed sessions (orchestration)
  setupManagedSessions()

  // Fetch server info (cwd, etc.)
  fetchServerInfo()

  // Setup keyboard shortcuts
  setupKeyboardShortcuts({
    getScene: () => state.scene,
    getManagedSessions: () => state.managedSessions,
    getFocusedSessionId: () => state.focusedSessionId,
    getSelectedManagedSession: () =>
      state.selectedManagedSession
        ? (state.managedSessions.find((s) => s.id === state.selectedManagedSession) ?? null)
        : null,
    onSelectManagedSession: selectManagedSession,
    onFocusSession: focusSession,
    onGoToNextAttention: goToNextAttention,
    onUpdateAttentionBadge: updateAttentionBadge,
    onSetUserChangedCamera: (value) => {
      state.userChangedCamera = value
    },
    onInterruptSession: interruptSession,
  })

  // Shift+R to toggle replay mode
  document.addEventListener('keydown', async (e) => {
    if (e.shiftKey && (e.key === 'r' || e.key === 'R')) {
      const inInput =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if (inInput) return

      e.preventDefault()
      const currentMode = replayController.getState().mode
      if (currentMode === 'live') {
        await enterReplayMode()
      } else {
        exitReplayMode()
      }
    }
  })

  // Shift+C to compact zones (fill gaps in grid)
  document.addEventListener('keydown', async (e) => {
    if (e.shiftKey && (e.key === 'c' || e.key === 'C')) {
      const inInput =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if (inInput) return
      if (!state.scene) return

      e.preventDefault()
      if (state.scene.canCompactZones()) {
        console.log('Compacting zones...')
        await state.scene.compactZones()
        // Save updated zone positions to server
        for (const [sessionId] of state.sessions) {
          const hexPos = state.scene.getZoneHexPosition(sessionId)
          const managed = state.managedSessions.find((m) => m.claudeSessionId === sessionId)
          if (hexPos && managed) {
            saveZonePosition(managed.id, hexPos)
          }
        }
      } else {
        console.log('Zones are already compact')
      }
    }
  })

  // Shift+T to open token stats modal
  document.addEventListener('keydown', (e) => {
    if (e.shiftKey && (e.key === 't' || e.key === 'T')) {
      const inInput =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if (inInput) return

      e.preventDefault()
      showTokenStatsModal()
    }
  })

  // Setup click-to-prompt and context menu
  setupContextMenu()
  setupClickToPrompt()

  // Register camera mode change callback
  state.scene.onCameraMode(updateKeybindHelper)

  // Register zone elevation change callback (to move Claude with zone)
  state.scene.onZoneElevation((sessionId, elevation) => {
    const session = state.sessions.get(sessionId)
    if (session) {
      // Update Claude's Y position to match zone elevation
      // The base station Y is 0.3 (from createZoneStations), so add that offset
      const stationYOffset = 0.3
      session.claude.mesh.position.y = elevation + stationYOffset
    }
  })

  // Fetch config (username, etc.)
  fetchConfig()

  // Setup settings modal
  setupSettingsModal()

  // Setup about modal
  setupAboutModal()

  // Setup dev panel (animation testing, Alt+D to toggle)
  setupDevPanel()

  // Setup question modal (for AskUserQuestion)
  setupQuestionModal({
    scene: state.scene,
    soundEnabled: state.soundEnabled,
    apiUrl: API_URL,
    attentionSystem: state.attentionSystem,
  })

  // Setup permission modal (for tool permissions)
  setupPermissionModal({
    scene: state.scene,
    soundEnabled: state.soundEnabled,
    apiUrl: API_URL,
    attentionSystem: state.attentionSystem,
    getManagedSessions: () => state.managedSessions,
  })

  // Setup zone info modal (for session details)
  setupZoneInfoModal({
    soundEnabled: state.soundEnabled,
  })

  // Setup text label modal (for hex text labels)
  setupTextLabelModal()

  // Setup zone command modal (quick command input near zone)
  setupZoneCommandModal()

  // Setup zone timeout modal (shown when zone creation takes too long)
  setupZoneTimeoutModal()

  // Setup not-connected overlay
  setupNotConnectedOverlay()

  // Setup voice input
  // On vibecraft.sh: voice is always available via cloud proxy, set up immediately
  // On localhost: needs client connected and voice enabled on server
  const isHostedSite = window.location.hostname === 'vibecraft.sh'
  const voiceControl = document.getElementById('voice-control')

  if (isHostedSite) {
    // Hosted mode - voice always available via cloud proxy
    if (voiceControl) voiceControl.classList.remove('disabled')
    state.voice = setupVoiceControl({
      client: state.client,
      soundEnabled: () => state.soundEnabled,
    })
  } else {
    // Local mode - check server health for voice availability
    state.client.onConnection(async (connected) => {
      if (connected && state.client) {
        try {
          const res = await fetch('/health')
          const health = await res.json()
          if (!health.voiceEnabled) {
            if (voiceControl) {
              voiceControl.classList.add('disabled')
              voiceControl.title = 'Voice disabled - set DEEPGRAM_API_KEY in .env'
            }
            return
          }
        } catch {
          if (voiceControl) {
            voiceControl.classList.add('disabled')
            voiceControl.title = 'Voice unavailable - server connection failed'
          }
          return
        }
        // Voice is enabled, set it up
        if (voiceControl) voiceControl.classList.remove('disabled')
        state.voice = setupVoiceControl({
          client: state.client,
          soundEnabled: () => state.soundEnabled,
        })
      }
    })
  }

  // Initialize audio on first user interaction
  const initAudioOnce = () => {
    initAudioOnInteraction()
    document.removeEventListener('click', initAudioOnce)
    document.removeEventListener('keydown', initAudioOnce)
  }
  document.addEventListener('click', initAudioOnce)
  document.addEventListener('keydown', initAudioOnce)

  // Initial UI state
  updateStatus(false, 'Connecting...')
  updateActivity('Waiting for connection...')
  updateStats()

  // Check for updates (non-blocking)
  checkForUpdates()

  // Initialize achievement notifications
  initAchievementNotifications()

  // Initialize token alert notifications
  tokenTrackingSystem.onAlert((alert) => {
    if (alert.type === 'critical') {
      toast.error(alert.message, { duration: 5000 })
    } else {
      toast.warning(alert.message, { duration: 4000 })
    }
  })

  // Set up achievements button in header
  setupAchievementsButton()

  // Set up plugins and help buttons
  setupPluginsButton()
  setupHelpButton()

  // Hide loading screen
  const loader = document.getElementById('app-loader')
  if (loader) {
    loader.classList.add('hidden')
    // Remove from DOM after transition
    setTimeout(() => loader.remove(), 500)
  }

  console.log('Vibecraft initialized (multi-session enabled)')
}

// ============================================================================
// Cleanup
// ============================================================================

function cleanup() {
  state.client?.disconnect()
  // Dispose all sessions
  for (const session of state.sessions.values()) {
    session.claude.dispose()
  }
  state.sessions.clear()
  state.scene?.dispose()
}

// ============================================================================
// Start
// ============================================================================

window.addEventListener('load', init)
window.addEventListener('beforeunload', cleanup)

// Export for debugging
;(window as unknown as { vibecraft: AppState }).vibecraft = state
