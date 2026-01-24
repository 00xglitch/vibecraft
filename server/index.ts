/**
 * Vibecraft WebSocket Server
 *
 * This server:
 * 1. Watches the events JSONL file for changes
 * 2. Accepts HTTP POST /event for real-time hook notifications
 * 3. Broadcasts events to connected WebSocket clients
 * 4. Tracks tool durations by matching pre/post events
 * 5. Proxies voice input to Deepgram for transcription
 */

// Load environment variables from .env file
import 'dotenv/config'

import { createServer, IncomingMessage, ServerResponse } from 'http'
import { WebSocketServer, WebSocket, RawData } from 'ws'
import { watch } from 'chokidar'
import {
  readFileSync,
  writeFileSync,
  existsSync,
  appendFileSync,
  mkdirSync,
  unlinkSync,
  statSync,
} from 'fs'
import { exec, execFile } from 'child_process'
import { dirname, resolve, join, extname } from 'path'
import { hostname, homedir } from 'os'
import { randomUUID, randomBytes } from 'crypto'
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk'
import type { LiveClient } from '@deepgram/sdk'
import type {
  ClaudeEvent,
  ServerMessage,
  ClientMessage,
  PreToolUseEvent,
  PostToolUseEvent,
  StopEvent,
  ManagedSession,
  CreateSessionRequest,
  CreateImplicitSessionRequest,
  UpdateSessionRequest,
  SessionPromptRequest,
  SessionStatus,
  TextTile,
  CreateTextTileRequest,
  UpdateTextTileRequest,
  CreateWorkspaceRequest,
  UpdateWorkspaceRequest,
  CreateProjectRequest,
} from '../shared/types.js'
import { DEFAULTS } from '../shared/defaults.js'
import { GitStatusManager } from './GitStatusManager.js'
import { ProjectsManager } from './ProjectsManager.js'
import { detectProjectName } from './projectDetector.js'
import { projectDiscovery } from './ProjectDiscovery.js'
import { workspaceManager } from './WorkspaceManager.js'
import { opencodeManager } from './OpenCodeProcessManager.js'
import { fileURLToPath } from 'url'
import { OpencodeClient } from '@opencode-ai/sdk'
import {
  sendPromptToOpenCodeSession,
  createOpenCodeSession,
  deleteOpenCodeSession,
  restartOpenCodeSession,
  checkOpenCodeHealth,
} from './opencode/index.js'
import { registerOpenCodeRoutes } from './opencode/routes.js'
import {
  orchestratorManager,
  langGraphPlugin,
  crewAIPlugin,
  autoGenPlugin,
  type OrchestratorTaskRequest,
} from './orchestrator/index.js'
import { ChangeTracker } from './ChangeTracker.js'
import { julesService } from './JulesService.js'
import { mcpMarketplace } from './MCPMarketplace.js'
import * as pluginMarketplace from './PluginMarketplace.js'
import {
  detectEnvironment,
  getEnvironment,
  formatEnvironmentInfo,
  getHostWorkspaces,
  type EnvironmentInfo,
} from './environment.js'
import { DockerSessionManager } from './DockerSessionManager.js'
import { SessionSettingsManager } from './SessionSettingsManager.js'
import {
  toDisplayPath,
  toExecutionPath,
  autoDetectMappings,
  wslToWindows,
  windowsToWSL,
  isWindowsPath,
  isWSLMountPath,
} from './pathTranslation.js'
import {
  listDirectory,
  getDirectoryTree,
  getWorkspaces,
  validatePath,
  getParentPath,
} from './fileBrowser.js'

// ============================================================================
// OpenCode Integration State
// ============================================================================

const opencodeSessions = new Map<
  string,
  {
    serverId: string
    eventSource?: EventSource
    abortController?: AbortController
    client?: OpencodeClient
    opencodeSessionId: string
  }
>()

// ============================================================================
// Version (read from package.json)
// ============================================================================

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function getPackageVersion(): string {
  try {
    // Try multiple locations (dev vs compiled)
    const locations = [
      resolve(__dirname, '../package.json'), // dev: server/ -> package.json
      resolve(__dirname, '../../package.json'), // compiled: dist/server/ -> package.json
    ]
    for (const loc of locations) {
      if (existsSync(loc)) {
        const pkg = JSON.parse(readFileSync(loc, 'utf-8'))
        return pkg.version || 'unknown'
      }
    }
  } catch (e) {
    // Ignore errors
  }
  return 'unknown'
}

const VERSION = getPackageVersion()

// ============================================================================
// Configuration (env vars override DEFAULTS from shared/defaults.ts)
// ============================================================================

/** Expand ~ to home directory in paths */
function expandHome(path: string): string {
  if (path.startsWith('~/') || path === '~') {
    return path.replace('~', process.env.HOME || '')
  }
  return path
}

const PORT = parseInt(process.env.VIBECRAFT_PORT ?? String(DEFAULTS.SERVER_PORT), 10)
const EVENTS_FILE = resolve(expandHome(process.env.VIBECRAFT_EVENTS_FILE ?? DEFAULTS.EVENTS_FILE))
const PENDING_PROMPT_FILE = resolve(
  expandHome(process.env.VIBECRAFT_PROMPT_FILE ?? '~/.vibecraft/data/pending-prompt.txt')
)
const MAX_EVENTS = parseInt(process.env.VIBECRAFT_MAX_EVENTS ?? String(DEFAULTS.MAX_EVENTS), 10)
const DEBUG = process.env.VIBECRAFT_DEBUG === 'true'
const TMUX_SESSION = process.env.VIBECRAFT_TMUX_SESSION ?? DEFAULTS.TMUX_SESSION
const SESSIONS_FILE = resolve(
  expandHome(process.env.VIBECRAFT_SESSIONS_FILE ?? DEFAULTS.SESSIONS_FILE)
)
const CONFIG_FILE = resolve(
  expandHome(process.env.VIBECRAFT_CONFIG_FILE ?? '~/.vibecraft/data/config.json')
)
let claudeCommand = process.env.VIBECRAFT_CLAUDE_COMMAND ?? DEFAULTS.CLAUDE_COMMAND
const TILES_FILE = resolve(
  expandHome(process.env.VIBECRAFT_TILES_FILE ?? '~/.vibecraft/data/tiles.json')
)
const WORKTREES_DIR = resolve(expandHome('~/.vibecraft/worktrees'))

/** Time before a "working" session auto-transitions to idle (failsafe for missed events) */
const WORKING_TIMEOUT_MS = 120_000 // 2 minutes

/** Maximum request body size (1MB) - prevents DoS via memory exhaustion */
const MAX_BODY_SIZE = 1024 * 1024

/** How often to check for stale "working" sessions */
const WORKING_CHECK_INTERVAL_MS = 10_000 // 10 seconds

/** Extended PATH for exec() - includes Homebrew and user paths for macOS/Linux */
const HOME = process.env.HOME || ''
const EXEC_PATH = [
  `${HOME}/.local/bin`, // User local bin (Claude CLI default location)
  '/opt/homebrew/bin', // macOS Apple Silicon Homebrew
  '/usr/local/bin', // macOS Intel Homebrew / Linux local
  process.env.PATH || '',
].join(':')

/** Options for exec() with extended PATH */
const EXEC_OPTIONS = { env: { ...process.env, PATH: EXEC_PATH } }

/** Deepgram API key from environment */
const DEEPGRAM_API_KEY_ENV = 'DEEPGRAM_API_KEY'

/** Deepgram transcription settings */
const DEEPGRAM_MODEL = 'nova-2'
const DEEPGRAM_LANGUAGE = 'en'

/**
 * Validate WebSocket origin header to prevent CSRF attacks.
 * Only browser clients should connect, so we require a valid origin.
 */
function isOriginAllowed(origin: string | undefined): boolean {
  // Require origin header - only browsers send this
  if (!origin) return false

  try {
    const url = new URL(origin)

    // Allow any port on localhost/127.0.0.1 (local development)
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return true
    }

    // Production: exact hostname match with HTTPS required
    if (url.hostname === 'vibecraft.sh' && url.protocol === 'https:') {
      return true
    }

    return false
  } catch (e) {
    return false // Invalid URL format
  }
}

/**
 * Validate and sanitize a directory path for use in shell commands.
 * Returns the resolved path if valid, throws if invalid.
 */
function validateDirectoryPath(inputPath: string): string {
  // Resolve to absolute path (handles ~, .., etc.)
  const resolved = resolve(expandHome(inputPath))

  // Check path exists and is a directory
  if (!existsSync(resolved)) {
    throw new Error(`Directory does not exist: ${inputPath}`)
  }

  const stat = statSync(resolved)
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${inputPath}`)
  }

  // Reject paths with shell metacharacters that could enable injection
  // Even with execFile, tmux passes commands to a shell
  const dangerousChars = /[;&|`$(){}[\]<>\\'"!#*?]/
  if (dangerousChars.test(resolved)) {
    throw new Error(`Directory path contains invalid characters: ${inputPath}`)
  }

  return resolved
}

/**
 * Validate a tmux session name.
 * tmux session names should only contain alphanumeric, underscore, hyphen.
 * Special case: implicit sessions use "implicit-<shortId>" pattern.
 */
function validateTmuxSession(name: string): string {
  // Allow implicit session placeholder pattern
  if (/^implicit-[a-f0-9-]+$/.test(name)) {
    return name
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(`Invalid tmux session name: ${name}`)
  }
  return name
}

/**
 * Check if a session is implicit (external Claude, no tmux control)
 */
function isImplicitSession(session: ManagedSession): boolean {
  return session.implicit === true
}

/**
 * Promisified execFile helper
 */
function execFileAsync(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, EXEC_OPTIONS, (error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

/**
 * Promisified exec helper that returns stdout
 */
function execAsync(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, EXEC_OPTIONS, (error, stdout) => {
      if (error) reject(error)
      else resolve(stdout.toString().trim())
    })
  })
}

/**
 * Check if a directory is a git repository
 */
async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await execAsync(`git -C "${dir}" rev-parse --git-dir`)
    return true
  } catch (e) {
    return false
  }
}

/**
 * Create a git worktree for isolated session work
 * @param originalRepo - Path to the original git repository
 * @param sessionId - Session ID (used for worktree directory and branch name)
 * @param sessionName - Human-readable session name (used in branch name)
 * @returns Worktree info or null if creation fails
 */
async function createWorktree(
  originalRepo: string,
  sessionId: string,
  sessionName: string
): Promise<{ path: string; branch: string; originalRepo: string } | null> {
  try {
    // Ensure worktrees directory exists
    if (!existsSync(WORKTREES_DIR)) {
      mkdirSync(WORKTREES_DIR, { recursive: true })
    }

    // Create safe branch name from session name (lowercase, replace spaces with hyphens)
    const safeName = sessionName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    const shortId = sessionId.slice(0, 8)
    const branchName = `vibecraft/${safeName}-${shortId}`
    const worktreePath = join(WORKTREES_DIR, sessionId)

    // Check if worktree path already exists
    if (existsSync(worktreePath)) {
      log(`Worktree path already exists: ${worktreePath}`)
      return null
    }

    // Create the worktree with a new branch
    // -b creates a new branch, -d allows creating from detached HEAD
    await execAsync(`git -C "${originalRepo}" worktree add -b "${branchName}" "${worktreePath}"`)

    log(`Created worktree: ${worktreePath} on branch ${branchName}`)
    return {
      path: worktreePath,
      branch: branchName,
      originalRepo,
    }
  } catch (error) {
    log(`Failed to create worktree: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

/**
 * Remove a git worktree
 * @param worktreePath - Path to the worktree directory
 * @param originalRepo - Path to the original repository (for git worktree remove)
 * @param branchName - Branch name to delete after removing worktree
 */
async function removeWorktree(
  worktreePath: string,
  originalRepo: string,
  branchName: string
): Promise<void> {
  try {
    // Remove the worktree
    await execAsync(`git -C "${originalRepo}" worktree remove "${worktreePath}" --force`)
    log(`Removed worktree: ${worktreePath}`)

    // Delete the branch (optional, user might want to keep it)
    try {
      await execAsync(`git -C "${originalRepo}" branch -D "${branchName}"`)
      log(`Deleted branch: ${branchName}`)
    } catch (e) {
      // Branch deletion is optional - might fail if it has unmerged changes
      log(`Could not delete branch ${branchName} (may have unmerged changes)`)
    }
  } catch (error) {
    log(`Failed to remove worktree: ${error instanceof Error ? error.message : String(error)}`)
    // Try to clean up the directory manually if git worktree remove fails
    try {
      if (existsSync(worktreePath)) {
        await execAsync(`rm -rf "${worktreePath}"`)
        log(`Manually cleaned up worktree directory: ${worktreePath}`)
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Safely collect request body with size limit to prevent DoS.
 * Returns a promise that resolves with the body string or rejects on error/oversized.
 */
function collectRequestBody(
  req: IncomingMessage,
  maxSize: number = MAX_BODY_SIZE
): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    let size = 0

    req.on('data', (chunk: Buffer | string) => {
      size += chunk.length
      if (size > maxSize) {
        req.destroy()
        reject(new Error('Request body too large'))
        return
      }
      body += chunk
    })

    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

/**
 * Safely send text to a tmux session using load-buffer + paste-buffer.
 * Uses execFile with proper arguments to prevent shell injection.
 */
async function sendToTmuxSafe(tmuxSession: string, text: string): Promise<void> {
  // Validate session name
  validateTmuxSession(tmuxSession)

  // Create temp file with cryptographically secure random name
  const tempFile = `/tmp/vibecraft-prompt-${Date.now()}-${randomBytes(16).toString('hex')}.txt`
  writeFileSync(tempFile, text)

  try {
    // Load text into tmux buffer
    await execFileAsync('tmux', ['load-buffer', tempFile])
    // Paste buffer into session
    await execFileAsync('tmux', ['paste-buffer', '-t', tmuxSession])
    // Send Enter to submit
    await new Promise((r) => setTimeout(r, 100)) // Small delay like original
    await execFileAsync('tmux', ['send-keys', '-t', tmuxSession, 'Enter'])
  } finally {
    // Clean up temp file
    try {
      unlinkSync(tempFile)
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

// ============================================================================
// State
// ============================================================================

/** All events in memory */
const events: ClaudeEvent[] = []

/** Track seen event IDs to prevent duplicates (from file watcher + POST) */
const seenEventIds = new Set<string>()

/** Track in-flight tool uses for duration calculation */
const pendingToolUses = new Map<string, PreToolUseEvent>()

/** Connected WebSocket clients */
const clients = new Set<WebSocket>()

/** Last read position in file */
let lastFileSize = 0

/** Token tracking per session */
interface SessionTokens {
  lastSeen: number // Last token count seen in output
  cumulative: number // Running total (estimated)
  lastUpdate: number // Timestamp
}
const sessionTokens = new Map<string, SessionTokens>()

/** Last parsed tmux output (to detect changes) - per-session to avoid collision */
const sessionTmuxHash = new Map<string, string>()

/** Track pending permission prompts per session */
interface PermissionOption {
  number: string // "1", "2", "3"
  label: string // "Yes", "Yes, and always allow...", "No"
}

interface PermissionPrompt {
  tool: string
  context: string // The full prompt text
  options: PermissionOption[] // Available choices
  detectedAt: number
}
const pendingPermissions = new Map<string, PermissionPrompt>()

/** Track sessions that have had the bypass permissions warning handled */
const bypassWarningHandled = new Set<string>()

/** Managed sessions registry */
const managedSessions = new Map<string, ManagedSession>()

/** Text tiles (grid labels) */
const textTiles = new Map<string, TextTile>()

/** Git status tracker for managed sessions */
const gitStatusManager = new GitStatusManager()

/** Project directories manager */
const projectsManager = new ProjectsManager()

/** Docker container session manager */
const dockerSessionManager = new DockerSessionManager()

/** Session settings manager for per-session MCP/plugin configuration */
const sessionSettingsManager = new SessionSettingsManager()

/** File change tracker for rollback functionality */
const changeTracker = new ChangeTracker({
  dataDir: resolve(expandHome('~/.vibecraft/data')),
})

/** Active voice transcription sessions (WebSocket client → Deepgram connection) */
const voiceSessions = new Map<WebSocket, LiveClient>()

/** Deepgram API key (loaded on startup) */
let deepgramApiKey: string | null = null

/** Load Deepgram API key from environment */
function loadDeepgramKey(): string | null {
  const key = process.env[DEEPGRAM_API_KEY_ENV]?.trim()
  if (key) {
    log('Deepgram API key loaded from environment')
    return key
  }
  log(`${DEEPGRAM_API_KEY_ENV} not set - voice input disabled`)
  return null
}

/** Map Claude Code session IDs to our managed session IDs */
const claudeToManagedMap = new Map<string, string>()

/** Reverse lookup: tmux session name -> managed session ID (avoids linear search in pollTokens) */
const tmuxToManagedMap = new Map<string, string>()

/** Counter for generating session names */
let sessionCounter = 0

// ============================================================================
// Logging
// ============================================================================

function log(...args: unknown[]) {
  console.log(`[${new Date().toISOString()}]`, ...args)
}

function debug(...args: unknown[]) {
  if (DEBUG) {
    console.log(`[DEBUG ${new Date().toISOString()}]`, ...args)
  }
}

// ============================================================================
// Token Tracking
// ============================================================================

/**
 * Parse token count from Claude Code output
 * Patterns:
 *   ↓ 879 tokens
 *   ↓ 1,234 tokens
 *   ↓ 12.5k tokens
 *   ↓ 12k tokens
 */
function parseTokensFromOutput(output: string): number | null {
  // Match multiple token display formats from Claude Code:
  // - "↓ 879 tokens" (classic)
  // - "Input: 1,234 | Output: 567" (newer)
  // - "Tokens: 12.5k" (compact)
  // - "⚡ 879 tokens" (with emoji)
  // - "Input: 1234 tokens, Output: 5678 tokens" (verbose)
  // - "1234/5678 tokens" (compact ratio)
  const patterns = [
    /(?:↓|⚡)\s*([0-9,]+)\s*tokens?/gi, // ↓ 879 tokens, ⚡ 1,234 tokens
    /(?:↓|⚡)\s*([0-9.]+)k\s*tokens?/gi, // ↓ 12.5k tokens, ⚡ 12k tokens
    /(?:Input|Output):\s*([0-9,]+)/gi, // Input: 1,234 | Output: 567
    /Input:\s*([0-9,]+)\s*tokens?,?\s*Output:\s*([0-9,]+)\s*tokens?/gi, // Input: 1234 tokens, Output: 5678 tokens
    /([0-9,]+)\/([0-9,]+)\s*tokens?/gi, // 1234/5678 tokens
    /Tokens?:\s*([0-9,]+)/gi, // Tokens: 879
    /Tokens?:\s*([0-9.]+)k/gi, // Tokens: 12.5k
    /\[([0-9,]+)\s*tokens?\]/gi, // [879 tokens]
    /\(([0-9,]+)\s*tokens?\)/gi, // (879 tokens)
  ]

  let maxTokens = 0

  // Try all patterns
  for (const pattern of patterns) {
    const matches = output.matchAll(pattern)
    for (const match of matches) {
      let num = 0
      const value = match[1]
      const value2 = match[2] // For patterns with 2 capture groups (input/output)

      // Handle 'k' suffix (thousands)
      if (value.includes('.') && pattern.source.includes('k')) {
        num = Math.round(parseFloat(value) * 1000)
      } else {
        num = parseInt(value.replace(/,/g, ''), 10)
      }

      // If there's a second capture group, add it (input + output)
      if (value2) {
        const num2 = parseInt(value2.replace(/,/g, ''), 10)
        if (!isNaN(num2)) {
          num += num2
        }
      }

      if (!isNaN(num) && num > maxTokens) {
        maxTokens = num
      }
    }
  }

  // Debug log if no tokens found
  if (maxTokens === 0 && DEBUG) {
    debug('Token parse failed. Last 200 chars:', output.slice(-200))
  }

  return maxTokens > 0 ? maxTokens : null
}

/**
 * Poll tmux output for token counts
 */
function pollTokens(tmuxSession: string): void {
  try {
    validateTmuxSession(tmuxSession)
  } catch (e) {
    debug(`Invalid tmux session for token polling: ${tmuxSession}`)
    return
  }

  execFile(
    'tmux',
    ['capture-pane', '-t', tmuxSession, '-p', '-S', '-50'],
    { ...EXEC_OPTIONS, maxBuffer: 1024 * 1024 },
    (error, stdout) => {
      if (error) {
        debug(`Token poll failed: ${error.message}`)
        return
      }

      // Debug: Log output details
      if (DEBUG) {
        debug(`[Token Debug] Session ${tmuxSession}:`, {
          outputLength: stdout.length,
          outputPreview: stdout.slice(-200),
        })
      }

      // Simple hash to detect changes (per-session to avoid collision between sessions)
      const hash = stdout.slice(-500)
      if (hash === sessionTmuxHash.get(tmuxSession)) return
      sessionTmuxHash.set(tmuxSession, hash)

      const tokens = parseTokensFromOutput(stdout)

      // Debug: Log parsed result
      if (DEBUG) {
        if (tokens) {
          debug(`[Token Debug] Parsed ${tokens} tokens from ${tmuxSession}`)
        } else {
          debug(`[Token Debug] No tokens parsed from ${tmuxSession}`)
        }
      }

      if (tokens === null) return

      // Update session tokens (use TMUX_SESSION as session ID for now)
      let session = sessionTokens.get(tmuxSession)
      if (!session) {
        session = { lastSeen: 0, cumulative: 0, lastUpdate: Date.now() }
        sessionTokens.set(tmuxSession, session)
      }

      // If we see a higher token count, update cumulative
      if (tokens > session.lastSeen) {
        const delta = tokens - session.lastSeen
        session.cumulative += delta
        session.lastSeen = tokens
        session.lastUpdate = Date.now()

        debug(`Tokens updated: ${tokens} (cumulative: ${session.cumulative})`)

        // Find managed session ID for this tmux session (O(1) lookup via reverse map)
        const managedSessionId = tmuxToManagedMap.get(tmuxSession)

        // Broadcast token update
        broadcast({
          type: 'tokens',
          payload: {
            session: tmuxSession,
            sessionId: managedSessionId,
            current: tokens,
            cumulative: session.cumulative,
          },
        } as ServerMessage)
      } else if (tokens < session.lastSeen && tokens > 0) {
        // Token count dropped - likely new conversation, reset tracking
        session.lastSeen = tokens
        session.lastUpdate = Date.now()
        debug(`Token count reset detected: ${tokens}`)
      }
    }
  )
}

/**
 * Start polling for tokens
 */
function startTokenPolling(): void {
  // Poll every 2 seconds - poll all managed sessions
  setInterval(() => {
    const polledSessions: string[] = []
    for (const session of managedSessions.values()) {
      // Skip OpenCode sessions - they don't have tmux to poll
      // Note: We DO poll external/implicit sessions if they have tmux
      if (session.sessionType === 'opencode') continue
      if (session.status !== 'offline' && session.tmuxSession) {
        polledSessions.push(`${session.name}(${session.tmuxSession})`)
        pollTokens(session.tmuxSession)
      }
    }
    // Also poll the default session for backwards compatibility
    if (!managedSessions.size) {
      polledSessions.push(`default(${TMUX_SESSION})`)
      pollTokens(TMUX_SESSION)
    }

    // Debug: Show which sessions were polled
    if (DEBUG && polledSessions.length > 0) {
      debug(
        `[Token Debug] Polling ${polledSessions.length} session(s): ${polledSessions.join(', ')}`
      )
    }
  }, 2000)
  log(`Token polling started`)
}

// ============================================================================
// Permission Prompt Detection
// ============================================================================

/**
 * Parse tmux output to detect Claude Code permission prompts.
 *
 * Claude Code prompts look like:
 *   ● Bash(rm /tmp/test.txt)
 *   ⎿  Running PreToolUse hook…
 *   ─────────────────────────────
 *   Bash command
 *
 *      rm /tmp/test.txt
 *
 *   Do you want to proceed?
 *   ❯ 1. Yes
 *     2. Yes, and always allow access to tmp/ from this project
 *     3. No
 *
 *   Esc to cancel · Tab to add additional instructions
 *
 * OR (plan mode):
 *   · Bash(prompt: run TypeScript compiler)
 *   Would you like to proceed?
 *
 *     1. Yes, and bypass permissions
 *   ❯ 2. Yes, and manually approve edits
 *     3. Type here to tell Claude what to change
 *
 *   ctrl-g to edit in Vim · ~/.claude/plans/...
 */
function detectPermissionPrompt(
  output: string
): { tool: string; context: string; options: PermissionOption[] } | null {
  const lines = output.split('\n')

  // Look for "Do you want to proceed?" OR "Would you like to proceed?" in recent output
  let proceedLineIdx = -1
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 30); i--) {
    if (/(Do you want|Would you like) to proceed\?/i.test(lines[i])) {
      proceedLineIdx = i
      break
    }
  }

  if (proceedLineIdx === -1) return null

  // CRITICAL: Verify this is a real Claude Code prompt by checking for the footer
  // "Esc to cancel · Tab to add additional instructions" OR "ctrl-g to edit in Vim"
  let hasFooter = false
  let hasSelector = false
  for (let i = proceedLineIdx + 1; i < Math.min(lines.length, proceedLineIdx + 15); i++) {
    if (/Esc to cancel|ctrl-g to edit/i.test(lines[i])) {
      hasFooter = true
      break
    }
    // Also check for the ❯ selector arrow which indicates the interactive menu
    if (/^\s*❯/.test(lines[i])) {
      hasSelector = true
    }
  }

  // Must have either the footer or the selector arrow to be a real prompt
  if (!hasFooter && !hasSelector) {
    debug('Skipping false positive: no "Esc to cancel"/"ctrl-g" footer or ❯ selector found')
    return null
  }

  // Parse numbered options below the "Do you want to proceed?" line
  const options: PermissionOption[] = []
  for (let i = proceedLineIdx + 1; i < Math.min(lines.length, proceedLineIdx + 10); i++) {
    const line = lines[i]

    // Stop if we hit the footer
    if (/Esc to cancel/i.test(line)) break

    // Match options like "❯ 1. Yes" or "  2. Yes, and always..."
    // The arrow (❯) indicates current selection, but we want all options
    const optionMatch = line.match(/^\s*[❯>]?\s*(\d+)\.\s+(.+)$/)
    if (optionMatch) {
      options.push({
        number: optionMatch[1],
        label: optionMatch[2].trim(),
      })
    }
  }

  // Need at least 2 options to be valid
  if (options.length < 2) return null

  // Find the tool name - look backwards for "● ToolName(...)" or "Bash command" header
  let tool = 'Unknown'
  for (let i = proceedLineIdx; i >= Math.max(0, proceedLineIdx - 20); i--) {
    // Match tool header like "● Bash(rm /tmp/test.txt)" or "· Bash(prompt: ...)"
    // ● = bullet, ◐ = half-filled circle, · = middle dot (plan mode)
    const toolMatch = lines[i].match(/[●◐·]\s*(\w+)\s*\(/)
    if (toolMatch) {
      tool = toolMatch[1]
      break
    }
    // Also match standalone tool type like "Bash command" or "Read file"
    const cmdMatch = lines[i].match(
      /^\s*(Bash|Read|Write|Edit|Grep|Glob|Task|WebFetch|WebSearch)\s+\w+/i
    )
    if (cmdMatch) {
      tool = cmdMatch[1]
      break
    }
  }

  // Build context from the prompt area (between tool header and options)
  const contextStart = Math.max(0, proceedLineIdx - 10)
  const contextEnd = proceedLineIdx + 1 + options.length
  const context = lines.slice(contextStart, contextEnd).join('\n').trim()

  debug(
    `Detected permission prompt: tool=${tool}, options=${options.map((o) => o.number + ':' + o.label).join(', ')}`
  )

  return { tool, context, options }
}

/**
 * Detect the bypass permissions warning that appears on first use of --dangerously-skip-permissions.
 * Returns true if the warning is detected and needs to be accepted.
 *
 * The warning looks like:
 *   ╭──────────────────────────────────────────────────────────────────────────────╮
 *   │                                  WARNING                                     │
 *   │                                                                              │
 *   │  You are entering Bypass Permissions mode. In this mode:                     │
 *   │   • All tool calls will be auto-approved                                     │
 *   │   ...                                                                        │
 *   │                                                                              │
 *   │  Are you sure you want to continue?                                          │
 *   │                                                                              │
 *   │      1. No, exit Claude Code                                                 │
 *   │    ❯ 2. Yes, I understand and accept the risks                               │
 *   ╰──────────────────────────────────────────────────────────────────────────────╯
 */
function detectBypassWarning(output: string): boolean {
  // Must have both WARNING and Bypass Permissions mode
  return output.includes('WARNING') && output.includes('Bypass Permissions mode')
}

/**
 * Poll a session for permission prompts
 */
function pollPermissions(sessionId: string, tmuxSession: string): void {
  try {
    validateTmuxSession(tmuxSession)
  } catch (e) {
    debug(`Invalid tmux session for permission polling: ${tmuxSession}`)
    return
  }

  execFile(
    'tmux',
    ['capture-pane', '-t', tmuxSession, '-p', '-S', '-50'],
    { ...EXEC_OPTIONS, maxBuffer: 1024 * 1024 },
    (error, stdout) => {
      if (error) {
        debug(`Permission poll failed for ${tmuxSession}: ${error.message}`)
        return
      }

      // Check for bypass permissions warning (first-time use of --dangerously-skip-permissions)
      if (detectBypassWarning(stdout) && !bypassWarningHandled.has(sessionId)) {
        log(`Bypass permissions warning detected for session ${sessionId}, auto-accepting...`)
        bypassWarningHandled.add(sessionId)
        // Send "2" to accept the warning
        execFile('tmux', ['send-keys', '-t', tmuxSession, '2'], EXEC_OPTIONS, (err) => {
          if (err) {
            log(`Failed to auto-accept bypass warning: ${err.message}`)
          } else {
            log(`Bypass permissions warning accepted for session ${sessionId}`)
          }
        })
        return // Don't process further this poll cycle
      }

      const prompt = detectPermissionPrompt(stdout)
      const existing = pendingPermissions.get(sessionId)

      if (prompt && !existing) {
        // New permission prompt detected
        pendingPermissions.set(sessionId, {
          tool: prompt.tool,
          context: prompt.context,
          options: prompt.options,
          detectedAt: Date.now(),
        })

        log(
          `Permission prompt detected for session ${sessionId}: ${prompt.tool} (${prompt.options.length} options)`
        )

        // Broadcast to clients with options
        broadcast({
          type: 'permission_prompt',
          payload: {
            sessionId,
            tool: prompt.tool,
            context: prompt.context,
            options: prompt.options,
          },
        } as ServerMessage)

        // Update session status
        const session = managedSessions.get(sessionId)
        if (session) {
          session.status = 'waiting'
          session.currentTool = prompt.tool
          broadcastSessions()
        }
      } else if (!prompt && existing) {
        // Permission prompt was resolved (user responded in terminal or elsewhere)
        pendingPermissions.delete(sessionId)
        log(`Permission prompt resolved for session ${sessionId}`)

        // Broadcast resolution
        broadcast({
          type: 'permission_resolved',
          payload: { sessionId },
        } as ServerMessage)

        // Reset session status
        const session = managedSessions.get(sessionId)
        if (session && session.status === 'waiting') {
          session.status = 'working'
          session.currentTool = undefined
          broadcastSessions()
        }
      }
    }
  )
}

/**
 * Start polling for permission prompts
 */
function startPermissionPolling(): void {
  // Poll every 1 second (more frequent than tokens since permissions are time-sensitive)
  setInterval(() => {
    for (const session of managedSessions.values()) {
      // Skip OpenCode sessions - they don't have tmux to poll
      // Note: We DO poll external/implicit sessions if they have tmux
      if (session.sessionType === 'opencode') continue
      if (session.status !== 'offline' && session.tmuxSession) {
        pollPermissions(session.id, session.tmuxSession)
      }
    }
  }, 1000)
  log(`Permission polling started`)
}

/**
 * Send a permission response to a session.
 * The response should be the option number ("1", "2", "3", etc.)
 */
function sendPermissionResponse(sessionId: string, optionNumber: string): boolean {
  const session = managedSessions.get(sessionId)
  if (!session) {
    log(`Cannot send permission response: session ${sessionId} not found`)
    return false
  }

  if (session.sessionType === 'opencode') {
    log(`Cannot send permission response: OpenCode sessions handle permissions differently`)
    return false
  }

  if (!session.tmuxSession) {
    log(`Cannot send permission response: session has no tmux session`)
    return false
  }

  // Validate it's a number
  if (!/^\d+$/.test(optionNumber)) {
    log(`Invalid permission response: ${optionNumber} (expected number)`)
    return false
  }

  // Validate tmux session name
  try {
    validateTmuxSession(session.tmuxSession)
  } catch (e) {
    log(`Invalid tmux session name: ${session.tmuxSession}`)
    return false
  }

  // Send the option number to tmux - Claude Code expects just the number
  execFile(
    'tmux',
    ['send-keys', '-t', session.tmuxSession, optionNumber],
    EXEC_OPTIONS,
    (error) => {
      if (error) {
        log(`Failed to send permission response: ${error.message}`)
        return
      }

      log(`Sent permission response to ${session.name}: option ${optionNumber}`)

      // Clear the pending permission
      pendingPermissions.delete(sessionId)

      // Update session status
      session.status = 'working'
      session.currentTool = undefined
      broadcastSessions()
    }
  )

  return true
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Generate a short ID for tmux session names
 */
function shortId(): string {
  return randomUUID().slice(0, 8)
}

/**
 * Create a new managed session
 */
/**
 * Create a new Claude session (routes to tmux or Docker based on runtime)
 */
async function createSession(options: CreateSessionRequest = {}): Promise<ManagedSession> {
  const runtime = options.runtime || 'tmux' // Default to tmux for backward compatibility

  if (runtime === 'docker') {
    return createDockerSession(options)
  } else {
    return createTmuxSession(options)
  }
}

/**
 * Create a Docker container session
 */
async function createDockerSession(options: CreateSessionRequest): Promise<ManagedSession> {
  const id = randomUUID()
  sessionCounter++
  const tmuxSession = `vibecraft-${shortId()}`

  // Workspace defaults to cwd or current directory
  const workspace = options.docker?.workspace || options.cwd || process.cwd()

  // Validate API key
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY required for Docker sessions')
  }

  // Detect project name
  let projectInfo: Awaited<ReturnType<typeof detectProjectName>> | null = null
  try {
    projectInfo = await detectProjectName(workspace)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log(`Error detecting project name for workspace "${workspace}": ${message}`)
  }

  const name = options.name || projectInfo?.name || `Claude ${sessionCounter}`

  // Build Claude args
  const flags = options.flags || {}
  const claudeArgs: string[] = []

  if (flags.continue !== false) {
    claudeArgs.push('-c')
  }
  if (flags.skipPermissions !== false) {
    claudeArgs.push('--permission-mode=bypassPermissions')
    claudeArgs.push('--dangerously-skip-permissions')
  }
  if (flags.chrome) {
    claudeArgs.push('--chrome')
  }
  if (flags.model) {
    claudeArgs.push('--model', flags.model)
  }
  if (flags.thinking) {
    claudeArgs.push('--thinking')
  }

  // Create container
  const containerId = await dockerSessionManager.createSessionContainer(
    { id, name } as ManagedSession,
    {
      workspace,
      apiKey,
      memory: options.docker?.memory,
      network: options.docker?.network,
    }
  )

  // Start Claude inside container
  await dockerSessionManager.startClaudeInContainer(id, tmuxSession, claudeCommand, claudeArgs)

  const env = getEnvironment()
  const session: ManagedSession = {
    id,
    name,
    sessionType: 'claude',
    tmuxSession,
    status: 'idle',
    createdAt: Date.now(),
    lastActivity: Date.now(),
    cwd: workspace,
    runtime: 'docker',
    containerId,
    environment: {
      type: 'docker',
      isDocker: true,
      isWSL: env.isWSL,
    },
    projectName: projectInfo?.name,
    projectSource: projectInfo?.source,
  }

  managedSessions.set(id, session)
  tmuxToManagedMap.set(tmuxSession, id)

  log(
    `Created Docker session: ${session.name} (${id.slice(0, 8)}) -> container:${containerId.slice(0, 12)}`
  )

  // Track git status if applicable
  if (workspace) {
    gitStatusManager.track(id, workspace)
    projectsManager.addProject(workspace, name)
  }

  // Generate session-specific settings
  await sessionSettingsManager.generateSessionSettings(session)

  broadcastSessions()
  saveSessions()

  return session
}

/**
 * Create a tmux session (local)
 */
async function createTmuxSession(options: CreateSessionRequest = {}): Promise<ManagedSession> {
  const id = randomUUID()
  sessionCounter++
  const tmuxSession = `vibecraft-${shortId()}`

  // Validate cwd to prevent command injection
  let cwd = validateDirectoryPath(options.cwd || process.cwd())

  // Store original cwd for reference
  const originalCwd = cwd

  // Detect project name from cwd (for auto-naming and display)
  let projectInfo: Awaited<ReturnType<typeof detectProjectName>> | null = null
  try {
    projectInfo = await detectProjectName(cwd)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log(`Error detecting project name for cwd "${cwd}": ${message}`)
    // Continue with null projectInfo rather than failing session creation
  }

  // Use user-provided name, or detected project name, or fallback to counter
  const name = options.name || projectInfo?.name || `Claude ${sessionCounter}`

  // Detect runtime environment
  const env = getEnvironment()
  const environmentInfo = {
    type: env.type,
    isDocker: env.isDocker,
    isWSL: env.isWSL,
  }
  log(`Creating session in ${env.type} environment`)

  // Handle worktree creation if requested
  const flags = options.flags || {}
  let worktreeInfo: { path: string; branch: string; originalRepo: string } | undefined

  if (flags.worktree) {
    // Check if directory is a git repo
    const isRepo = await isGitRepo(cwd)
    if (!isRepo) {
      // SOFT-FAIL: Log warning and skip worktree creation
      log(
        `Warning: Cannot create worktree - ${cwd} is not a git repository. Proceeding without worktree.`
      )

      // Send notification to client (will appear as toast)
      broadcast({
        type: 'event',
        payload: {
          id: randomUUID(),
          timestamp: Date.now(),
          type: 'notification',
          sessionId: id,
          cwd,
          message: `Worktree skipped: ${cwd} is not a git repository`,
          notificationType: 'warning',
        },
      })

      // Skip worktree creation - continue with regular session
    } else {
      // Create worktree
      const worktree = await createWorktree(cwd, id, name)
      if (!worktree) {
        // Also soft-fail if worktree creation fails (git command error)
        log(`Warning: Failed to create worktree for ${cwd}. Proceeding without worktree.`)
        broadcast({
          type: 'event',
          payload: {
            id: randomUUID(),
            timestamp: Date.now(),
            type: 'notification',
            sessionId: id,
            cwd,
            message: `Worktree creation failed. Using original directory.`,
            notificationType: 'warning',
          },
        })
      } else {
        // Success - use worktree path as the working directory
        worktreeInfo = worktree
        cwd = worktree.path
        log(`Session will use worktree: ${cwd} (branch: ${worktree.branch})`)
      }
    }
  }

  // Build claude command with flags
  const claudeArgs: string[] = []

  // Defaults: continue=true, skipPermissions=true, chrome=false
  if (flags.continue !== false) {
    claudeArgs.push('-c')
  }
  if (flags.skipPermissions !== false) {
    // --permission-mode=bypassPermissions skips the workspace trust dialog
    // --dangerously-skip-permissions skips tool permission prompts
    claudeArgs.push('--permission-mode=bypassPermissions')
    claudeArgs.push('--dangerously-skip-permissions')
  }
  if (flags.chrome) {
    claudeArgs.push('--chrome')
  }
  if (flags.model) {
    claudeArgs.push('--model', flags.model)
  }
  if (flags.thinking) {
    claudeArgs.push('--thinking')
  }

  // Add session-specific settings path
  const sessionSettingsPath = join(homedir(), '.vibecraft/sessions', id, 'settings.json')
  claudeArgs.push('--settings', sessionSettingsPath)

  const claudeCmd =
    claudeArgs.length > 0 ? `${claudeCommand} ${claudeArgs.join(' ')}` : claudeCommand

  // Spawn tmux session with claude using execFile to prevent shell injection
  // NOTE: Must wrap in bash -c to ensure PATH is properly exported.
  // Without this, tmux uses /bin/sh which doesn't handle PATH=... cmd syntax correctly.
  return new Promise((resolve, reject) => {
    execFile(
      'tmux',
      [
        'new-session',
        '-d',
        '-s',
        tmuxSession,
        '-c',
        cwd,
        `bash -c 'export PATH="${EXEC_PATH}"; ${claudeCmd}'`,
      ],
      EXEC_OPTIONS,
      (error) => {
        if (error) {
          log(`Failed to spawn session: ${error.message}`)
          // Clean up worktree if session spawn failed
          if (worktreeInfo) {
            removeWorktree(worktreeInfo.path, worktreeInfo.originalRepo, worktreeInfo.branch).catch(
              () => {}
            ) // Ignore cleanup errors
          }
          reject(new Error(`Failed to spawn session: ${error.message}`))
          return
        }

        const session: ManagedSession = {
          id,
          name,
          sessionType: 'claude',
          tmuxSession,
          status: 'idle',
          createdAt: Date.now(),
          lastActivity: Date.now(),
          cwd,
          worktree: worktreeInfo,
          projectName: projectInfo?.name,
          projectSource: projectInfo?.source,
          environment: environmentInfo,
          runtime: 'tmux', // Default to tmux runtime for local sessions
        }

        managedSessions.set(id, session)
        tmuxToManagedMap.set(tmuxSession, id)
        log(
          `Created session: ${name} (${id.slice(0, 8)}) -> tmux:${tmuxSession} project:${projectInfo?.name ?? 'unknown'} (${projectInfo?.source ?? 'none'})${worktreeInfo ? ` [worktree: ${worktreeInfo.branch}]` : ''}`
        )

        // Track git status for this session
        if (cwd) {
          gitStatusManager.track(id, cwd)
          // Remember the original directory for future autocomplete (not the worktree)
          projectsManager.addProject(originalCwd, name)
        }

        // Generate session-specific settings
        sessionSettingsManager
          .generateSessionSettings(session)
          .then(() => {
            // Broadcast and persist
            broadcastSessions()
            saveSessions()

            resolve(session)
          })
          .catch((err) => {
            log(`Warning: Failed to generate session settings: ${err}`)
            // Continue anyway - settings generation shouldn't block session creation
            broadcastSessions()
            saveSessions()

            resolve(session)
          })
      }
    )
  })
}

/**
 * Check if a path is a double-shot-latte directory (DSL hook's working directory)
 * These sessions are ephemeral and shouldn't be tracked as implicit sessions.
 */
function isDoubleeShotLatteDirectory(cwd: string | undefined): boolean {
  if (!cwd) return false
  return cwd.includes('double-shot-latte') || cwd.includes('.claude/hooks')
}

/**
 * Create an implicit managed session for external Claude instances.
 * These sessions have no tmux control - they just track events from external Claude.
 * Returns null for DSL sessions which shouldn't be tracked.
 */
function createImplicitSession(options: CreateImplicitSessionRequest): ManagedSession | null {
  const { claudeSessionId, cwd } = options

  // Skip creating sessions for double-shot-latte (ephemeral hook sessions)
  if (isDoubleeShotLatteDirectory(cwd)) {
    debug(`Skipping implicit session for DSL directory: ${cwd}`)
    return null
  }

  // Check if already exists
  const existing = findManagedSession(claudeSessionId)
  if (existing) {
    log(`Implicit session already exists for Claude ${claudeSessionId.slice(0, 8)}`)
    return existing
  }

  const id = randomUUID()
  sessionCounter++

  // Generate name from cwd or use generic "External Claude N"
  const dirName = cwd ? cwd.split('/').pop() || cwd : null
  const name = dirName ? `${dirName} (ext)` : `External ${sessionCounter}`

  // Use placeholder tmux session name (won't be used for actual tmux operations)
  const tmuxSession = `implicit-${claudeSessionId.slice(0, 8)}`

  // Detect runtime environment
  const env = getEnvironment()
  const environmentInfo = {
    type: env.type,
    isDocker: env.isDocker,
    isWSL: env.isWSL,
  }

  const session: ManagedSession = {
    id,
    name,
    tmuxSession,
    status: 'working', // External sessions are actively working when we first see them
    claudeSessionId,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    cwd,
    implicit: true, // Mark as implicit - no tmux control
    environment: environmentInfo,
    runtime: 'tmux', // Default to tmux runtime
  }

  managedSessions.set(id, session)
  claudeToManagedMap.set(claudeSessionId, id)

  log(
    `Created implicit session: ${name} (${id.slice(0, 8)}) for Claude ${claudeSessionId.slice(0, 8)}`
  )

  // Track git status if cwd is provided
  if (cwd) {
    gitStatusManager.track(id, cwd)
  }

  // Broadcast and persist
  broadcastSessions()
  saveSessions()

  return session
}

/**
 * Get all managed sessions
 */
function getSessions(): ManagedSession[] {
  return Array.from(managedSessions.values()).map((session) => {
    // Merge live token data from sessionTokens map
    const tokens = session.tmuxSession ? sessionTokens.get(session.tmuxSession) : undefined
    return {
      ...session,
      tokens: tokens ? { current: tokens.lastSeen, cumulative: tokens.cumulative } : session.tokens,
      gitStatus: gitStatusManager.getStatus(session.id) ?? undefined,
    }
  })
}

/**
 * Get a session by ID
 */
function getSession(id: string): ManagedSession | undefined {
  return managedSessions.get(id)
}

/**
 * Update a session
 */
function updateSession(id: string, updates: UpdateSessionRequest): ManagedSession | null {
  const session = managedSessions.get(id)
  if (!session) return null

  if (updates.name) {
    session.name = updates.name
  }
  if (updates.zonePosition) {
    session.zonePosition = updates.zonePosition
  }
  if (updates.pinned !== undefined) {
    session.pinned = updates.pinned
  }
  if (updates.sortOrder !== undefined) {
    session.sortOrder = updates.sortOrder
  }
  if (updates.archived !== undefined) {
    session.archived = updates.archived
  }

  log(`Updated session: ${session.name} (${id.slice(0, 8)})`)
  broadcastSessions()
  saveSessions()
  return session
}

/**
 * Delete/kill a session
 */
async function deleteSession(id: string): Promise<boolean> {
  const session = managedSessions.get(id)
  if (!session) {
    return false
  }

  return new Promise((resolve) => {
    // Helper to clean up and resolve
    const cleanup = async () => {
      // Clean up Docker container if this is a Docker session
      if (session.runtime === 'docker' && session.containerId) {
        log(`Stopping Docker container for session ${session.name}...`)
        try {
          await dockerSessionManager.stopContainer(id)
        } catch (err) {
          log(`Warning: Failed to stop Docker container: ${err}`)
        }
      }

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

      // Clean up all session maps
      if (session.tmuxSession) {
        tmuxToManagedMap.delete(session.tmuxSession)
        sessionTokens.delete(session.tmuxSession)
        sessionTmuxHash.delete(session.tmuxSession)
      }
      managedSessions.delete(id)
      gitStatusManager.untrack(id)
      for (const [claudeId, managedId] of claudeToManagedMap) {
        if (managedId === id) {
          claudeToManagedMap.delete(claudeId)
        }
      }

      log(
        `Deleted session: ${session.name} (${id.slice(0, 8)})${session.worktree ? ' [worktree cleaned up]' : ''}`
      )
      broadcastSessions()
      saveSessions()
      resolve(true)
    }

    // Skip tmux kill for implicit sessions (no tmux to kill)
    if (isImplicitSession(session)) {
      cleanup()
      return
    }

    if (session.sessionType === 'opencode') {
      deleteOpenCodeSession(id, {
        managedSessions,
        opencodeSessions,
        opencodeManager,
        gitStatusManager,
        log,
        broadcastSessions,
        saveSessions,
      })
        .then(resolve)
        .catch(() => resolve(false))
      return
    }

    if (!session.tmuxSession) {
      resolve(false)
      return
    }

    // Kill the tmux session using execFile to prevent shell injection
    try {
      validateTmuxSession(session.tmuxSession)
    } catch (e) {
      log(`Invalid tmux session name: ${session.tmuxSession}`)
      resolve(false)
      return
    }

    execFile('tmux', ['kill-session', '-t', session.tmuxSession], EXEC_OPTIONS, (error) => {
      if (error) {
        log(`Warning: Failed to kill tmux session: ${error.message}`)
      }
      cleanup()
    })
  })
}

/**
 * Send a prompt to a specific session
 */
async function sendPromptToSession(
  id: string,
  prompt: string
): Promise<{ ok: boolean; error?: string }> {
  const session = managedSessions.get(id)
  if (!session) {
    return { ok: false, error: 'Session not found' }
  }

  // Handle OpenCode sessions
  if (session.sessionType === 'opencode') {
    return sendPromptToOpenCodeSession(session, prompt, { opencodeSessions, log })
  }

  // Implicit sessions don't have tmux control - suggest restart to adopt
  if (isImplicitSession(session)) {
    // Check if Docker environment - Docker sessions don't need tmux adoption
    if (session.environment?.isDocker) {
      return {
        ok: false,
        error:
          'Cannot send prompts to external Docker sessions. Adopt the session or create a new managed container.',
      }
    }

    return {
      ok: false,
      error: 'External session has no tmux control. Click restart (🔄) to adopt it.',
    }
  }

  if (!session.tmuxSession) {
    return { ok: false, error: 'Session has no tmux session' }
  }

  try {
    await sendToTmuxSafe(session.tmuxSession, prompt)
    session.lastActivity = Date.now()
    log(`Prompt sent to ${session.name}: ${prompt.slice(0, 50)}...`)
    return { ok: true }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    log(`Failed to send prompt to ${session.name}: ${msg}`)
    return { ok: false, error: msg }
  }
}

/**
 * Check if tmux sessions are still alive and update status
 * Enhanced: Also verifies Claude is running in the pane, not just that tmux session exists
 */
function checkSessionHealth(): void {
  // Skip OpenCode sessions - they have their own health check
  const claudeSessions = Array.from(managedSessions.values()).filter(
    (s) => s.sessionType !== 'opencode'
  )

  if (claudeSessions.length === 0) return

  // Split sessions by runtime
  const tmuxSessions = claudeSessions.filter((s) => s.runtime !== 'docker')
  const dockerSessions = claudeSessions.filter((s) => s.runtime === 'docker')

  // Check tmux sessions
  if (tmuxSessions.length > 0) {
    checkTmuxSessionHealth(tmuxSessions)
  }

  // Check Docker sessions
  if (dockerSessions.length > 0) {
    checkDockerSessionHealth(dockerSessions)
  }
}

function checkTmuxSessionHealth(sessions: ManagedSession[]): void {
  // Get detailed pane info: session name, current command, and PID
  exec(
    'tmux list-panes -a -F "#{session_name}|#{pane_current_command}|#{pane_pid}"',
    EXEC_OPTIONS,
    (error, stdout) => {
      if (error) {
        // tmux might not be running - mark non-implicit Claude sessions as offline
        for (const session of sessions) {
          // Skip implicit sessions - they don't have tmux, so can't be "offline" in that sense
          if (isImplicitSession(session)) continue
          if (session.status !== 'offline') {
            session.status = 'offline'
          }
        }
        return
      }

      // Parse pane info: Map<sessionName, { command: string, pid: string }>
      const paneInfo = new Map<string, { command: string; pid: string }>()
      for (const line of stdout.trim().split('\n')) {
        const [sessionName, command, pid] = line.split('|')
        if (sessionName) {
          paneInfo.set(sessionName, { command: command || '', pid: pid || '' })
        }
      }

      let changed = false

      for (const session of sessions) {
        // Skip implicit sessions - they don't have tmux to check
        if (isImplicitSession(session)) continue

        const info = session.tmuxSession ? paneInfo.get(session.tmuxSession) : undefined
        const tmuxExists = !!info
        // Check if claude (or happy, or custom command) is running
        const claudeRunning =
          info?.command?.toLowerCase().includes('claude') ||
          info?.command?.toLowerCase().includes('happy') ||
          info?.command === claudeCommand

        let newStatus: SessionStatus
        if (!tmuxExists) {
          // Session is gone
          newStatus = 'offline'
        } else if (session.status === 'working' || session.status === 'waiting') {
          // Don't change working/waiting status based on health check
          // These are event-driven states
          newStatus = session.status
        } else if (claudeRunning) {
          // Claude is running - session is alive and idle (ready for input)
          newStatus = 'idle'
        } else {
          // tmux exists but claude exited - could be shell prompt
          // This might happen if Claude crashed or user exited
          // Keep as idle for now, user can restart if needed
          newStatus = session.status === 'offline' ? 'idle' : session.status
        }

        if (session.status !== newStatus) {
          if (newStatus === 'offline') {
            log(`Session "${session.name}" went offline (tmux session gone)`)
          } else if (session.status === 'offline' && newStatus === 'idle') {
            log(`Session "${session.name}" came back online`)
          }
          session.status = newStatus
          changed = true
        }
      }

      if (changed) {
        broadcastSessions()
        saveSessions() // Persist state changes
      }
    }
  )
}

async function checkDockerSessionHealth(sessions: ManagedSession[]): Promise<void> {
  let changed = false

  for (const session of sessions) {
    if (!session.containerId) continue

    const isRunning = await dockerSessionManager.isContainerRunning(session.id)

    if (!isRunning && session.status !== 'offline') {
      session.status = 'offline'
      log(`Docker session "${session.name}" went offline (container stopped)`)
      changed = true
    } else if (isRunning && session.status === 'offline') {
      // Container running but session offline - check tmux inside
      const hasActiveTmux = await checkTmuxInContainer(session)
      if (hasActiveTmux) {
        session.status = 'idle'
        log(`Docker session "${session.name}" came back online`)
        changed = true
      }
    }
  }

  if (changed) {
    broadcastSessions()
    saveSessions()
  }
}

async function checkTmuxInContainer(session: ManagedSession): Promise<boolean> {
  try {
    const containerId = session.containerId
    if (!containerId) return false

    const container = dockerSessionManager.dockerClient.getContainer(containerId)
    const exec = await container.exec({
      Cmd: ['tmux', 'list-sessions'],
      AttachStdout: true,
      AttachStderr: true,
    })

    const stream = await exec.start({ Detach: false })
    const output = await streamToString(stream)

    return output.includes(session.tmuxSession || '')
  } catch {
    return false
  }
}

function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', (chunk: Buffer) => chunks.push(chunk))
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    stream.on('error', reject)
  })
}

/**
 * Check for stale "working" sessions and transition them to idle
 * This is a failsafe for missed stop events
 */
function checkWorkingTimeout(): void {
  const now = Date.now()
  let changed = false

  for (const session of managedSessions.values()) {
    if (session.status === 'working') {
      const timeSinceActivity = now - session.lastActivity
      if (timeSinceActivity > WORKING_TIMEOUT_MS) {
        log(
          `Session "${session.name}" timed out after ${Math.round(timeSinceActivity / 1000)}s of no activity`
        )
        session.status = 'idle'
        session.currentTool = undefined
        changed = true
      }
    }
  }

  if (changed) {
    broadcastSessions()
    saveSessions()
  }
}

/**
 * Save sessions to disk for persistence across restarts
 */
function saveSessions(): void {
  try {
    // Merge token data into sessions before saving
    const sessionsWithTokens = Array.from(managedSessions.values()).map((session) => {
      const tokens = session.tmuxSession ? sessionTokens.get(session.tmuxSession) : undefined
      return {
        ...session,
        tokens: tokens
          ? { current: tokens.lastSeen, cumulative: tokens.cumulative }
          : session.tokens,
      }
    })

    // Save with metadata for smart restoration
    const env = getEnvironment()
    const data = {
      version: VERSION,
      savedAt: Date.now(),
      environment: {
        type: env.type,
        platform: env.platform,
        homeDir: env.homeDir,
      },
      sessions: sessionsWithTokens,
      claudeToManagedMap: Array.from(claudeToManagedMap.entries()),
      sessionCounter,
    }

    writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2))
    debug(`Saved ${managedSessions.size} sessions to ${SESSIONS_FILE}`)
  } catch (e) {
    console.error('Failed to save sessions:', e)
  }
}

/**
 * Load sessions from disk on startup with smart restoration
 */
async function loadSessions(): Promise<void> {
  if (!existsSync(SESSIONS_FILE)) {
    debug('No saved sessions file found')
    return
  }

  try {
    const content = readFileSync(SESSIONS_FILE, 'utf-8')
    const data = JSON.parse(content)

    // Check environment compatibility
    const currentEnv = getEnvironment()
    let environmentChanged = false

    if (data.environment) {
      const savedEnv = data.environment
      if (savedEnv.type !== currentEnv.type || savedEnv.platform !== currentEnv.platform) {
        log(
          `Environment changed: ${savedEnv.type}/${savedEnv.platform} → ${currentEnv.type}/${currentEnv.platform}`
        )
        environmentChanged = true
      }
    }

    // Restore sessions
    if (Array.isArray(data.sessions)) {
      for (const session of data.sessions) {
        // Mark all as offline initially - health check will update
        session.status = 'offline'
        session.currentTool = undefined

        // Path translation if environment changed
        if (environmentChanged && session.cwd) {
          try {
            // Try to translate path from saved environment to current environment
            const translatedPath = await toExecutionPath(session.cwd)
            if (translatedPath !== session.cwd) {
              log(
                `Translated path for session "${session.name}": ${session.cwd} → ${translatedPath}`
              )
              session.cwd = translatedPath
            }
          } catch (err) {
            debug(
              `Failed to translate path for session "${session.name}": ${(err as Error).message}`
            )
            // Keep original path, health check will mark as offline if invalid
          }
        }

        managedSessions.set(session.id, session)

        // Populate reverse lookup map
        if (session.tmuxSession) {
          tmuxToManagedMap.set(session.tmuxSession, session.id)
        }

        // Track git status if session has a cwd
        if (session.cwd) {
          gitStatusManager.track(session.id, session.cwd)
        }
      }
    }

    // Restore linking map
    if (Array.isArray(data.claudeToManagedMap)) {
      for (const [claudeId, managedId] of data.claudeToManagedMap) {
        claudeToManagedMap.set(claudeId, managedId)
      }
    }

    // Restore counter
    if (typeof data.sessionCounter === 'number') {
      sessionCounter = data.sessionCounter
    }

    // Log restoration info
    const savedAt = data.savedAt ? new Date(data.savedAt).toLocaleString() : 'unknown'
    const version = data.version || 'unknown'
    log(`Loaded ${managedSessions.size} sessions from ${SESSIONS_FILE}`)
    log(`  Saved: ${savedAt} (version ${version})`)
    if (environmentChanged) {
      log(`  Environment changed - paths may need verification`)
    }
  } catch (e) {
    console.error('Failed to load sessions:', e)
  }
}

/**
 * Save config to disk for persistence across restarts
 */
function saveConfig(): void {
  try {
    const data = { cliCommand: claudeCommand }
    writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2))
    debug(`Saved config to ${CONFIG_FILE}`)
  } catch (e) {
    console.error('Failed to save config:', e)
  }
}

/**
 * Load config from disk on startup
 */
function loadConfig(): void {
  if (!existsSync(CONFIG_FILE)) {
    debug('No saved config file found')
    return
  }

  try {
    const content = readFileSync(CONFIG_FILE, 'utf-8')
    const data = JSON.parse(content)

    // Only apply saved config if no env var override
    if (!process.env.VIBECRAFT_CLAUDE_COMMAND && typeof data.cliCommand === 'string') {
      claudeCommand = data.cliCommand
      log(`Loaded CLI command from config: ${claudeCommand}`)
    }
  } catch (e) {
    console.error('Failed to load config:', e)
  }
}

/**
 * Broadcast current sessions to all clients
 */
function broadcastSessions(): void {
  broadcast({
    type: 'sessions',
    payload: getSessions(),
  })
}

/**
 * Broadcast projects to all connected clients
 */
function broadcastProjects(): void {
  broadcast({
    type: 'projects',
    payload: projectDiscovery.getProjects(),
  })
}

/**
 * Broadcast workspaces to all connected clients
 */
function broadcastWorkspaces(): void {
  broadcast({
    type: 'workspaces',
    payload: workspaceManager.getWorkspaces(),
  })
}

// ============================================================================
// Text Tiles (Grid Labels)
// ============================================================================

/**
 * Get all text tiles
 */
function getTiles(): TextTile[] {
  return Array.from(textTiles.values())
}

/**
 * Save text tiles to disk
 */
function saveTiles(): void {
  try {
    const data = Array.from(textTiles.values())
    writeFileSync(TILES_FILE, JSON.stringify(data, null, 2))
    debug(`Saved ${textTiles.size} tiles to ${TILES_FILE}`)
  } catch (e) {
    console.error('Failed to save tiles:', e)
  }
}

/**
 * Load text tiles from disk
 */
function loadTiles(): void {
  if (!existsSync(TILES_FILE)) {
    debug('No saved tiles file found')
    return
  }

  try {
    const content = readFileSync(TILES_FILE, 'utf-8')
    const data = JSON.parse(content) as TextTile[]

    for (const tile of data) {
      textTiles.set(tile.id, tile)
    }

    log(`Loaded ${textTiles.size} tiles from ${TILES_FILE}`)
  } catch (e) {
    console.error('Failed to load tiles:', e)
  }
}

/**
 * Broadcast text tiles to all clients
 */
function broadcastTiles(): void {
  broadcast({
    type: 'text_tiles',
    payload: getTiles(),
  })
}

// ============================================================================
// Voice Transcription (Deepgram)
// ============================================================================

/**
 * Start a voice transcription session for a WebSocket client
 */
function startVoiceSession(ws: WebSocket): boolean {
  if (!deepgramApiKey) {
    ws.send(
      JSON.stringify({ type: 'voice_error', payload: { error: 'Voice input not configured' } })
    )
    return false
  }

  // Clean up any existing session
  stopVoiceSession(ws)

  try {
    const deepgram = createClient(deepgramApiKey)
    const connection = deepgram.listen.live({
      model: DEEPGRAM_MODEL,
      language: DEEPGRAM_LANGUAGE,
      smart_format: true,
      interim_results: true,
      utterance_end_ms: 1000,
      vad_events: true,
      encoding: 'linear16',
      sample_rate: 16000,
    })

    connection.on(LiveTranscriptionEvents.Open, () => {
      ws.send(JSON.stringify({ type: 'voice_ready', payload: {} }))
    })

    connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      const transcript = data.channel?.alternatives?.[0]?.transcript
      if (transcript) {
        ws.send(
          JSON.stringify({
            type: 'voice_transcript',
            payload: { transcript, isFinal: data.is_final },
          })
        )
      }
    })

    connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
      ws.send(JSON.stringify({ type: 'voice_utterance_end', payload: {} }))
    })

    connection.on(LiveTranscriptionEvents.Error, (error) => {
      log(`Deepgram error: ${error}`)
      ws.send(JSON.stringify({ type: 'voice_error', payload: { error: String(error) } }))
    })

    connection.on(LiveTranscriptionEvents.Close, () => {
      voiceSessions.delete(ws)
    })

    voiceSessions.set(ws, connection)
    debug('Voice session started')
    return true
  } catch (e) {
    log(`Failed to start voice session: ${e}`)
    ws.send(JSON.stringify({ type: 'voice_error', payload: { error: String(e) } }))
    return false
  }
}

/**
 * Stop a voice transcription session
 */
function stopVoiceSession(ws: WebSocket): void {
  const connection = voiceSessions.get(ws)
  if (connection) {
    try {
      connection.requestClose()
    } catch (e) {
      // Ignore close errors
    }
    voiceSessions.delete(ws)
    debug('Voice session stopped')
  }
}

/**
 * Send audio data to Deepgram for transcription
 */
function sendVoiceAudio(ws: WebSocket, audioData: Buffer): void {
  const connection = voiceSessions.get(ws)
  if (!connection) return

  try {
    // Convert Node.js Buffer to ArrayBuffer for Deepgram SDK
    const arrayBuffer = audioData.buffer.slice(
      audioData.byteOffset,
      audioData.byteOffset + audioData.byteLength
    )
    connection.send(arrayBuffer)
  } catch (e) {
    debug(`Error sending audio: ${e}`)
  }
}

/**
 * Link a Claude Code session ID to a managed session
 */
function linkClaudeSession(claudeSessionId: string, managedSessionId: string): void {
  claudeToManagedMap.set(claudeSessionId, managedSessionId)
}

/**
 * Find managed session by Claude Code session ID
 */
function findManagedSession(claudeSessionId: string): ManagedSession | undefined {
  const managedId = claudeToManagedMap.get(claudeSessionId)
  if (managedId) {
    return managedSessions.get(managedId)
  }
  return undefined
}

// ============================================================================
// Event Processing
// ============================================================================

/** Maps toolUseId to changeId for file change tracking */
const pendingFileChanges = new Map<string, string>()

/** File-modifying tools that should be tracked for rollback */
const FILE_MODIFYING_TOOLS = ['Edit', 'Write', 'NotebookEdit']

function processEvent(event: ClaudeEvent, opts?: { skipChangeTracking?: boolean }): ClaudeEvent {
  // Track pre_tool_use for duration calculation
  if (event.type === 'pre_tool_use') {
    const preEvent = event as PreToolUseEvent
    pendingToolUses.set(preEvent.toolUseId, preEvent)
    debug(`Tracking tool use: ${preEvent.tool} (${preEvent.toolUseId})`)

    // Track file changes for Edit/Write tools (skip during historical load)
    if (!opts?.skipChangeTracking && FILE_MODIFYING_TOOLS.includes(preEvent.tool)) {
      const toolInput = preEvent.toolInput as Record<string, string> | undefined
      const filePath = toolInput?.file_path || toolInput?.notebook_path
      if (filePath) {
        try {
          const managedSession = findManagedSession(preEvent.sessionId)
          const changeId = changeTracker.recordBefore({
            sessionId: managedSession?.id || preEvent.sessionId,
            claudeSessionId: preEvent.sessionId,
            toolUseId: preEvent.toolUseId,
            tool: preEvent.tool,
            path: filePath,
          })
          pendingFileChanges.set(preEvent.toolUseId, changeId)
          debug(`Tracking file change: ${filePath} (changeId: ${changeId})`)
        } catch (e) {
          debug(`Failed to track file change for ${filePath}: ${e}`)
        }
      }
    }
  }

  // Calculate duration for post_tool_use
  if (event.type === 'post_tool_use') {
    const postEvent = event as PostToolUseEvent
    const preEvent = pendingToolUses.get(postEvent.toolUseId)
    if (preEvent) {
      postEvent.duration = postEvent.timestamp - preEvent.timestamp
      pendingToolUses.delete(postEvent.toolUseId)
      debug(`Tool ${postEvent.tool} took ${postEvent.duration}ms`)
    }

    // Complete file change tracking for Edit/Write tools (skip during historical load)
    if (!opts?.skipChangeTracking) {
      const changeId = pendingFileChanges.get(postEvent.toolUseId)
      if (changeId) {
        // Generate description from the event
        const preEventForDesc = preEvent || pendingToolUses.get(postEvent.toolUseId)
        let description = `${postEvent.tool} tool`
        const toolInputForDesc = preEventForDesc?.toolInput as Record<string, string> | undefined
        if (toolInputForDesc?.file_path) {
          const fileName = toolInputForDesc.file_path.split('/').pop()
          description = `${postEvent.tool}: ${fileName}`
        }

        changeTracker.recordAfter(changeId, description)
        pendingFileChanges.delete(postEvent.toolUseId)
        debug(`Completed file change tracking: ${changeId}`)
      }
    }
  }

  return event
}

function addEvent(event: ClaudeEvent) {
  // Skip duplicates (hook writes to file AND posts to server)
  if (seenEventIds.has(event.id)) {
    debug(`Skipping duplicate event: ${event.id}`)
    return
  }
  seenEventIds.add(event.id)

  // Trim old IDs to prevent memory leak (keep last 2x MAX_EVENTS)
  if (seenEventIds.size > MAX_EVENTS * 2) {
    const idsToKeep = [...seenEventIds].slice(-MAX_EVENTS)
    seenEventIds.clear()
    idsToKeep.forEach((id) => seenEventIds.add(id))
  }

  const processed = processEvent(event)
  events.push(processed)

  // Trim old events if over limit
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS)
  }

  // Update managed session status based on event
  // First try by claudeSessionId, then by tmuxSession for auto-linking
  let managedSession = findManagedSession(event.sessionId)

  // If not found by claudeSessionId but event has tmuxSession, try tmuxSession-based matching
  if (!managedSession && event.tmuxSession) {
    const managedIdFromTmux = tmuxToManagedMap.get(event.tmuxSession)
    if (managedIdFromTmux) {
      managedSession = managedSessions.get(managedIdFromTmux)
      if (managedSession && !managedSession.claudeSessionId) {
        // Auto-link: we found the session by tmux name, link the claudeSessionId
        managedSession.claudeSessionId = event.sessionId
        claudeToManagedMap.set(event.sessionId, managedIdFromTmux)
        log(`Auto-linked session via tmuxSession: ${event.sessionId} -> ${managedSession.name}`)
        broadcastSessions()
        saveSessions()
      }
    }
  }

  if (managedSession) {
    const prevStatus = managedSession.status
    managedSession.lastActivity = Date.now() // Use current time for accurate timeout tracking
    managedSession.cwd = event.cwd

    // Update status based on event type
    switch (event.type) {
      case 'pre_tool_use':
        managedSession.status = 'working'
        managedSession.currentTool = (event as PreToolUseEvent).tool
        break

      case 'post_tool_use':
        // Tool completed - update activity time but stay "working"
        // (Claude might be using more tools, stop event marks idle)
        managedSession.currentTool = undefined
        break

      case 'user_prompt_submit':
        // User submitted prompt - Claude is now processing
        managedSession.status = 'working'
        managedSession.currentTool = undefined
        break

      case 'stop': {
        const stopEvent = event as StopEvent
        if (stopEvent.stopHookActive) {
          // Double Shot Latte (or similar stop hook) is active
          // Claude may auto-continue - mark DSL as active
          managedSession.doubleShotActive = true
          managedSession.doubleShotContinues = (managedSession.doubleShotContinues || 0) + 1
          debug(
            `DSL active for ${managedSession.name}, continues: ${managedSession.doubleShotContinues}`
          )
          // Keep working status - DSL will evaluate
        } else {
          // Normal stop - Claude finished
          managedSession.status = 'idle'
          managedSession.currentTool = undefined
          // Reset DSL state
          managedSession.doubleShotActive = false
          managedSession.doubleShotContinues = 0
        }
        break
      }

      case 'session_end':
        managedSession.status = 'idle'
        managedSession.currentTool = undefined
        // Reset DSL state
        managedSession.doubleShotActive = false
        managedSession.doubleShotContinues = 0
        break
    }

    // Broadcast and persist if status changed
    if (managedSession.status !== prevStatus) {
      broadcastSessions()
      saveSessions()
    }
  }

  // Broadcast to all clients
  broadcast({ type: 'event', payload: processed })
}

// ============================================================================
// File Watching
// ============================================================================

function loadEventsFromFile() {
  if (!existsSync(EVENTS_FILE)) {
    debug(`Events file not found: ${EVENTS_FILE}`)
    return
  }

  const content = readFileSync(EVENTS_FILE, 'utf-8')
  const lines = content.trim().split('\n').filter(Boolean)

  // Skip change tracking during historical load - changes are already persisted
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as ClaudeEvent
      processEvent(event, { skipChangeTracking: true })
      events.push(event)
    } catch (e) {
      debug(`Failed to parse event line: ${line}`)
    }
  }

  lastFileSize = content.length
  log(`Loaded ${events.length} events from file`)
}

function watchEventsFile() {
  // Ensure directory exists
  const dir = dirname(EVENTS_FILE)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  // Create file if it doesn't exist
  if (!existsSync(EVENTS_FILE)) {
    appendFileSync(EVENTS_FILE, '')
  }

  const watcher = watch(EVENTS_FILE, {
    persistent: true,
    usePolling: true,
    interval: 100,
  })

  watcher.on('change', () => {
    try {
      const content = readFileSync(EVENTS_FILE, 'utf-8')

      // Only process new content
      if (content.length > lastFileSize) {
        const newContent = content.slice(lastFileSize)
        const newLines = newContent.trim().split('\n').filter(Boolean)

        for (const line of newLines) {
          try {
            const event = JSON.parse(line) as ClaudeEvent
            addEvent(event)
            debug(`New event from file: ${event.type}`)
          } catch (e) {
            debug(`Failed to parse new event: ${line}`)
          }
        }

        lastFileSize = content.length
      }
    } catch (e) {
      debug(`Error reading events file: ${e}`)
    }
  })

  log(`Watching events file: ${EVENTS_FILE}`)
}

// ============================================================================
// WebSocket
// ============================================================================

function broadcast(message: ServerMessage) {
  const data = JSON.stringify(message)
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data)
    }
  }
}

function handleClientMessage(ws: WebSocket, message: ClientMessage) {
  switch (message.type) {
    case 'subscribe':
      debug('Client subscribed')
      break

    case 'get_history': {
      const limit = message.payload?.limit ?? 100
      const history = events.slice(-limit)
      const response: ServerMessage = { type: 'history', payload: history }
      ws.send(JSON.stringify(response))
      debug(`Sent ${history.length} historical events`)
      break
    }

    case 'ping':
      // Just acknowledge, no response needed
      break

    case 'voice_start':
      startVoiceSession(ws)
      break

    case 'voice_stop':
      stopVoiceSession(ws)
      break

    case 'permission_response': {
      const { sessionId, response } = message.payload
      sendPermissionResponse(sessionId, response)
      break
    }

    default:
      debug(`Unknown message type: ${(message as { type: string }).type}`)
  }
}

// ============================================================================
// HTTP Server (for hook notifications)
// ============================================================================

function handleHttpRequest(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin

  // CORS headers - only allow specific origins
  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  }

  if (req.method === 'OPTIONS') {
    // Preflight: reject if origin not allowed
    if (!origin || !isOriginAllowed(origin)) {
      res.writeHead(403)
      res.end()
      return
    }
    res.writeHead(204)
    res.end()
    return
  }

  // OpenCode routes
  registerOpenCodeRoutes(req, res, {
    opencodeManager,
    managedSessions,
    opencodeSessions,
    createOpenCodeSession: (options) =>
      createOpenCodeSession(options, {
        managedSessions,
        opencodeSessions,
        opencodeManager,
        gitStatusManager,
        projectsManager,
        addEvent,
        broadcastSessions,
        saveSessions,
        log,
        debug,
      }),
    deleteOpenCodeSession: (id) =>
      deleteOpenCodeSession(id, {
        managedSessions,
        opencodeSessions,
        opencodeManager,
        gitStatusManager,
        log,
        broadcastSessions,
        saveSessions,
      }),
    restartOpenCodeSession: (id) =>
      restartOpenCodeSession(id, {
        managedSessions,
        opencodeSessions,
        opencodeManager,
        log,
        broadcastSessions,
        saveSessions,
      }),
    debug,
  })

  // If OpenCode routes handled the request, stop here
  if (req.url?.startsWith('/opencode') || req.url?.startsWith('/sessions/opencode')) {
    return
  }

  if (req.method === 'POST' && req.url === '/event') {
    collectRequestBody(req)
      .then((body) => {
        try {
          const event = JSON.parse(body) as ClaudeEvent
          addEvent(event)
          debug(`Received event via HTTP: ${event.type}`)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        } catch (e) {
          debug(`Failed to parse HTTP event: ${e}`)
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid JSON' }))
        }
      })
      .catch(() => {
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Request body too large' }))
      })
    return
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        ok: true,
        version: VERSION,
        clients: clients.size,
        events: events.length,
        voiceEnabled: !!deepgramApiKey,
      })
    )
    return
  }

  // Environment info
  if (req.method === 'GET' && req.url === '/api/environment') {
    const env = getEnvironment()
    const workspaces = getHostWorkspaces(env)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        ok: true,
        environment: env,
        workspaces,
      })
    )
    return
  }

  // Path translation - translate to display path
  if (req.method === 'POST' && req.url === '/api/path/to-display') {
    collectRequestBody(req)
      .then(async (body) => {
        try {
          if (!body) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'Request body required' }))
            return
          }
          const { path: sourcePath } = JSON.parse(body)
          if (!sourcePath) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'path is required' }))
            return
          }
          const displayPath = await toDisplayPath(sourcePath)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, displayPath }))
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: (e as Error).message }))
        }
      })
      .catch(() => {
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Request body too large' }))
      })
    return
  }

  // Path translation - translate to execution path
  if (req.method === 'POST' && req.url === '/api/path/to-execution') {
    collectRequestBody(req)
      .then(async (body) => {
        try {
          if (!body) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'Request body required' }))
            return
          }
          const { path: displayPath } = JSON.parse(body)
          if (!displayPath) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'path is required' }))
            return
          }
          const executionPath = await toExecutionPath(displayPath)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, executionPath }))
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: (e as Error).message }))
        }
      })
      .catch(() => {
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Request body too large' }))
      })
    return
  }

  // Path mappings - get all auto-detected mappings
  if (req.method === 'GET' && req.url === '/api/path/mappings') {
    const env = getEnvironment()
    autoDetectMappings(env)
      .then((mappings) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            ok: true,
            mappings,
          })
        )
      })
      .catch((e) => {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: (e as Error).message }))
      })
    return
  }

  // File browser - list directory
  if (req.method === 'GET' && req.url?.startsWith('/api/files/list')) {
    const url = new URL(req.url, `http://${req.headers.host}`)
    const path = url.searchParams.get('path')
    const includeHidden = url.searchParams.get('includeHidden') === 'true'

    if (!path) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'path query parameter is required' }))
      return
    }

    // Validate path
    const validation = validatePath(path)
    if (!validation.valid) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: validation.error }))
      return
    }

    listDirectory(path, { includeHidden })
      .then((entries) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, entries, path }))
      })
      .catch((e) => {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: (e as Error).message }))
      })
    return
  }

  // File browser - get directory tree
  if (req.method === 'GET' && req.url?.startsWith('/api/files/tree')) {
    const url = new URL(req.url, `http://${req.headers.host}`)
    const path = url.searchParams.get('path')
    const depth = parseInt(url.searchParams.get('depth') || '1', 10)
    const includeHidden = url.searchParams.get('includeHidden') === 'true'

    if (!path) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'path query parameter is required' }))
      return
    }

    // Validate depth
    if (depth < 0 || depth > 5) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'depth must be between 0 and 5' }))
      return
    }

    // Validate path
    const validation = validatePath(path)
    if (!validation.valid) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: validation.error }))
      return
    }

    getDirectoryTree(path, depth, { includeHidden })
      .then((tree) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, tree }))
      })
      .catch((e) => {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: (e as Error).message }))
      })
    return
  }

  // File browser - get workspaces
  if (req.method === 'GET' && req.url === '/api/workspaces') {
    getWorkspaces()
      .then((workspaces) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, workspaces }))
      })
      .catch((e) => {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: (e as Error).message }))
      })
    return
  }

  // Config (username, etc)
  if (req.method === 'GET' && req.url === '/config') {
    const username = process.env.USER || process.env.USERNAME || 'claude-user'
    const host = hostname()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        username,
        hostname: host,
        tmuxSession: TMUX_SESSION,
      })
    )
    return
  }

  // Stats
  if (req.method === 'GET' && req.url === '/stats') {
    const toolCounts: Record<string, number> = {}
    const toolDurations: Record<string, number[]> = {}

    for (const event of events) {
      if (event.type === 'post_tool_use') {
        const e = event as PostToolUseEvent
        toolCounts[e.tool] = (toolCounts[e.tool] ?? 0) + 1
        if (e.duration !== undefined) {
          toolDurations[e.tool] = toolDurations[e.tool] ?? []
          toolDurations[e.tool].push(e.duration)
        }
      }
    }

    const avgDurations: Record<string, number> = {}
    for (const [tool, durations] of Object.entries(toolDurations)) {
      avgDurations[tool] = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    }

    // Collect token data
    const tokens: Record<string, { current: number; cumulative: number }> = {}
    for (const [session, data] of sessionTokens) {
      tokens[session] = { current: data.lastSeen, cumulative: data.cumulative }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        totalEvents: events.length,
        toolCounts,
        avgDurations,
        tokens,
      })
    )
    return
  }

  // History - return all events for replay
  if (req.method === 'GET' && req.url === '/history') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(events))
    return
  }

  // Submit prompt from browser
  if (req.method === 'POST' && req.url === '/prompt') {
    collectRequestBody(req)
      .then((body) => {
        try {
          const { prompt, send } = JSON.parse(body) as { prompt: string; send?: boolean }
          if (!prompt || typeof prompt !== 'string') {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Prompt is required' }))
            return
          }

          // Write prompt to file
          const dir = dirname(PENDING_PROMPT_FILE)
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true })
          }
          writeFileSync(PENDING_PROMPT_FILE, prompt, 'utf-8')
          log(`Prompt saved: ${prompt.slice(0, 50)}...`)

          // If send=true, inject into tmux session
          if (send) {
            // Use safe helper to prevent command injection
            sendToTmuxSafe(TMUX_SESSION, prompt)
              .then(() => {
                log(`Prompt sent to tmux session: ${TMUX_SESSION}`)
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ ok: true, saved: PENDING_PROMPT_FILE, sent: true }))
              })
              .catch((error) => {
                log(`tmux send failed: ${error.message}`)
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(
                  JSON.stringify({
                    ok: true,
                    saved: PENDING_PROMPT_FILE,
                    sent: false,
                    tmuxError: error.message,
                  })
                )
              })
            return
          }

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, saved: PENDING_PROMPT_FILE }))
        } catch (e) {
          debug(`Failed to save prompt: ${e}`)
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid JSON' }))
        }
      })
      .catch(() => {
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Request body too large' }))
      })
    return
  }

  // Get pending prompt
  if (req.method === 'GET' && req.url === '/prompt') {
    if (existsSync(PENDING_PROMPT_FILE)) {
      const prompt = readFileSync(PENDING_PROMPT_FILE, 'utf-8')
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ prompt, file: PENDING_PROMPT_FILE }))
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ prompt: null }))
    }
    return
  }

  // Clear pending prompt
  if (req.method === 'DELETE' && req.url === '/prompt') {
    if (existsSync(PENDING_PROMPT_FILE)) {
      unlinkSync(PENDING_PROMPT_FILE)
      log('Pending prompt cleared')
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  // Get tmux output (Claude's responses)
  if (req.method === 'GET' && req.url === '/tmux-output') {
    try {
      validateTmuxSession(TMUX_SESSION)
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'Invalid tmux session name', output: '' }))
      return
    }

    // Capture last 100 lines from tmux pane
    execFile(
      'tmux',
      ['capture-pane', '-t', TMUX_SESSION, '-p', '-S', '-100'],
      { ...EXEC_OPTIONS, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: error.message, output: '' }))
          return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, output: stdout }))
      }
    )
    return
  }

  // Cancel - send Ctrl+C to tmux (legacy, for backwards compat)
  if (req.method === 'POST' && req.url === '/cancel') {
    try {
      validateTmuxSession(TMUX_SESSION)
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'Invalid tmux session name' }))
      return
    }

    execFile('tmux', ['send-keys', '-t', TMUX_SESSION, 'C-c'], EXEC_OPTIONS, (error) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      if (error) {
        log(`Cancel failed: ${error.message}`)
        res.end(JSON.stringify({ ok: false, error: error.message }))
      } else {
        log(`Sent Ctrl+C to tmux session: ${TMUX_SESSION}`)
        res.end(JSON.stringify({ ok: true }))
      }
    })
    return
  }

  // ============================================================================
  // Session Management Endpoints
  // ============================================================================

  // Get server info (cwd, etc.)
  if (req.method === 'GET' && req.url === '/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, cwd: process.cwd() }))
    return
  }

  // Get server config
  if (req.method === 'GET' && req.url === '/config') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, cliCommand: claudeCommand }))
    return
  }

  // Update server config
  if (req.method === 'PATCH' && req.url === '/config') {
    collectRequestBody(req)
      .then((body) => {
        try {
          const data = body ? JSON.parse(body) : {}
          if (typeof data.cliCommand === 'string' && data.cliCommand.trim()) {
            claudeCommand = data.cliCommand.trim()
            log(`CLI command updated to: ${claudeCommand}`)
            saveConfig()
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, cliCommand: claudeCommand }))
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }))
        }
      })
      .catch(() => {
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Request body too large' }))
      })
    return
  }

  // List all sessions
  if (req.method === 'GET' && req.url === '/sessions') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, sessions: getSessions() }))
    return
  }

  // Force refresh sessions (trigger health check)
  if (req.method === 'POST' && req.url === '/sessions/refresh') {
    log('Manual session refresh requested')
    checkSessionHealth()
    // Return current sessions (health check updates async, but we give immediate response)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, sessions: getSessions() }))
    return
  }

  // Create an implicit session (external Claude, no tmux control)
  if (req.method === 'POST' && req.url === '/sessions/implicit') {
    collectRequestBody(req)
      .then((body) => {
        try {
          if (!body) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'Request body required' }))
            return
          }
          const options = JSON.parse(body) as CreateImplicitSessionRequest
          if (!options.claudeSessionId) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'claudeSessionId is required' }))
            return
          }
          const session = createImplicitSession(options)
          if (!session) {
            // DSL sessions are skipped - return 200 OK with null session
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true, session: null, skipped: 'double-shot-latte' }))
            return
          }
          res.writeHead(201, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, session }))
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: (e as Error).message }))
        }
      })
      .catch(() => {
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Request body too large' }))
      })
    return
  }

  // Create a new session
  if (req.method === 'POST' && req.url === '/sessions') {
    collectRequestBody(req)
      .then(async (body) => {
        try {
          const options = body ? (JSON.parse(body) as CreateSessionRequest) : {}
          const session = await createSession(options)
          res.writeHead(201, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, session }))
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: (e as Error).message }))
        }
      })
      .catch(() => {
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Request body too large' }))
      })
    return
  }

  // Clean up old offline implicit sessions (especially double-shot-latte orphans)
  if (req.method === 'POST' && req.url === '/sessions/cleanup') {
    const now = Date.now()
    const MAX_AGE_MS = 30 * 60 * 1000 // 30 minutes

    const toDelete: string[] = []
    for (const [id, session] of managedSessions) {
      // Only clean up implicit sessions that are offline and old
      if (
        session.implicit &&
        session.status === 'offline' &&
        now - session.lastActivity > MAX_AGE_MS
      ) {
        toDelete.push(id)
      }
    }

    // Delete them
    for (const id of toDelete) {
      const session = managedSessions.get(id)
      if (session) {
        // Remove from maps
        if (session.claudeSessionId) {
          claudeToManagedMap.delete(session.claudeSessionId)
        }
        managedSessions.delete(id)
        log(`Cleaned up old implicit session: ${session.name} (${id.slice(0, 8)})`)
      }
    }

    if (toDelete.length > 0) {
      broadcastSessions()
      saveSessions()
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, deleted: toDelete.length }))
    return
  }

  // ============================================================================
  // Projects API (known directories for autocomplete)
  // ============================================================================

  // List all known projects
  if (req.method === 'GET' && req.url === '/projects') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, projects: projectsManager.getProjects() }))
    return
  }

  // Autocomplete path
  if (req.method === 'GET' && req.url?.startsWith('/projects/autocomplete')) {
    const url = new URL(req.url, `http://localhost:${PORT}`)
    const query = url.searchParams.get('q') || ''
    const results = projectsManager.autocomplete(query)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, results }))
    return
  }

  // Remove a project from the list
  if (req.method === 'DELETE' && req.url?.startsWith('/projects/')) {
    const path = decodeURIComponent(req.url.slice('/projects/'.length))
    projectsManager.removeProject(path)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  // Discover git projects in a directory
  if (req.method === 'POST' && req.url === '/projects/discover') {
    collectRequestBody(req)
      .then((body) => {
        try {
          const request = JSON.parse(body) as {
            path: string
            maxDepth?: number
            addToKnown?: boolean
          }
          const rootPath = request.path || homedir()
          const maxDepth = request.maxDepth ?? 2
          const discovered = projectsManager.discoverProjects(rootPath, maxDepth)

          // Optionally add to known projects
          if (request.addToKnown) {
            projectsManager.addDiscoveredProjects(discovered)
          }

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, projects: discovered }))
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: String(err) }))
        }
      })
      .catch(() => {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Invalid request body' }))
      })
    return
  }

  // Add a project to the known list
  if (req.method === 'POST' && req.url === '/projects') {
    collectRequestBody(req)
      .then((body) => {
        try {
          const request = JSON.parse(body) as { path: string; name?: string }
          if (!request.path) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'path is required' }))
            return
          }
          projectsManager.addProject(request.path, request.name)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: String(err) }))
        }
      })
      .catch(() => {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Invalid request body' }))
      })
    return
  }

  // ============================================================================
  // Workspace & Project Organization API
  // ============================================================================

  // List all workspaces
  if (req.method === 'GET' && req.url === '/api/workspaces') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, workspaces: workspaceManager.getWorkspaces() }))
    return
  }

  // Create a workspace
  if (req.method === 'POST' && req.url === '/api/workspaces') {
    collectRequestBody(req)
      .then((body) => {
        try {
          const request = JSON.parse(body) as CreateWorkspaceRequest
          if (!request.name) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'Name is required' }))
            return
          }
          const workspace = workspaceManager.createWorkspace(request)
          res.writeHead(201, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, workspace }))
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }))
        }
      })
      .catch(() => {
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Request body too large' }))
      })
    return
  }

  // Workspace-specific endpoints: /api/workspaces/:id
  const workspaceMatch = req.url?.match(/^\/api\/workspaces\/([a-f0-9-]+)(?:\/(.+))?$/)
  if (workspaceMatch) {
    const workspaceId = workspaceMatch[1]
    const action = workspaceMatch[2]

    // GET /api/workspaces/:id - Get workspace details
    if (req.method === 'GET' && !action) {
      const workspace = workspaceManager.getWorkspace(workspaceId)
      if (workspace) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, workspace }))
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Workspace not found' }))
      }
      return
    }

    // PATCH /api/workspaces/:id - Update workspace
    if (req.method === 'PATCH' && !action) {
      collectRequestBody(req)
        .then((body) => {
          try {
            const updates = JSON.parse(body) as UpdateWorkspaceRequest
            const workspace = workspaceManager.updateWorkspace(workspaceId, updates)
            if (workspace) {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: true, workspace }))
            } else {
              res.writeHead(404, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: false, error: 'Workspace not found' }))
            }
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }))
          }
        })
        .catch(() => {
          res.writeHead(413, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Request body too large' }))
        })
      return
    }

    // DELETE /api/workspaces/:id - Delete workspace
    if (req.method === 'DELETE' && !action) {
      const deleted = workspaceManager.deleteWorkspace(workspaceId)
      if (deleted) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Workspace not found' }))
      }
      return
    }

    // GET /api/workspaces/:id/projects - Get projects in workspace
    if (req.method === 'GET' && action === 'projects') {
      const projects = workspaceManager.getProjectsInWorkspace(workspaceId)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, projects }))
      return
    }

    // POST /api/workspaces/:id/projects/:projectId - Add project to workspace
    const projectActionMatch = action?.match(/^projects\/([a-f0-9-]+)$/)
    if (req.method === 'POST' && projectActionMatch) {
      const projectId = projectActionMatch[1]
      const success = workspaceManager.addProjectToWorkspace(workspaceId, projectId)
      res.writeHead(success ? 200 : 404, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          ok: success,
          error: success ? undefined : 'Workspace or project not found',
        })
      )
      return
    }

    // DELETE /api/workspaces/:id/projects/:projectId - Remove project from workspace
    if (req.method === 'DELETE' && projectActionMatch) {
      const projectId = projectActionMatch[1]
      const success = workspaceManager.removeProjectFromWorkspace(workspaceId, projectId)
      res.writeHead(success ? 200 : 404, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          ok: success,
          error: success ? undefined : 'Workspace or project not found',
        })
      )
      return
    }
  }

  // List all discovered projects
  if (req.method === 'GET' && req.url === '/api/projects') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, projects: projectDiscovery.getProjects() }))
    return
  }

  // Get ungrouped projects (not in any workspace)
  if (req.method === 'GET' && req.url === '/api/projects/ungrouped') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, projects: workspaceManager.getUngroupedProjects() }))
    return
  }

  // Suggest workspaces based on project paths
  if (req.method === 'GET' && req.url === '/api/projects/suggest-workspaces') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, suggestions: workspaceManager.suggestWorkspaces() }))
    return
  }

  // Register a project manually
  if (req.method === 'POST' && req.url === '/api/projects') {
    collectRequestBody(req)
      .then(async (body) => {
        try {
          const request = JSON.parse(body) as CreateProjectRequest
          if (!request.path) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'Path is required' }))
            return
          }
          const project = await projectDiscovery.registerProject(request.path)
          if (request.workspaceId) {
            workspaceManager.addProjectToWorkspace(request.workspaceId, project.id)
          }
          res.writeHead(201, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, project }))
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: (e as Error).message }))
        }
      })
      .catch(() => {
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Request body too large' }))
      })
    return
  }

  // Project-specific endpoints: /api/projects/:id
  const projectMatch = req.url?.match(/^\/api\/projects\/([a-f0-9-]+)$/)
  if (projectMatch) {
    const projectId = projectMatch[1]

    // GET /api/projects/:id - Get project details
    if (req.method === 'GET') {
      const project = projectDiscovery.getProject(projectId)
      if (project) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, project }))
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Project not found' }))
      }
      return
    }
  }

  // ============================================================================
  // Orchestrator API
  // ============================================================================

  // List available orchestrator plugins
  if (req.method === 'GET' && req.url === '/api/orchestrator/plugins') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, plugins: orchestratorManager.listPlugins() }))
    return
  }

  // List workflow templates
  if (req.method === 'GET' && req.url === '/api/orchestrator/workflows') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, templates: orchestratorManager.getWorkflowTemplates() }))
    return
  }

  // List orchestrated tasks
  if (req.method === 'GET' && req.url?.startsWith('/api/orchestrator/tasks')) {
    const url = new URL(req.url, `http://localhost:${PORT}`)
    const filter: {
      orchestratorType?: 'langgraph' | 'crewai' | 'autogen' | 'custom'
      status?: string
      projectId?: string
    } = {}
    const typeParam = url.searchParams.get('type')
    if (typeParam)
      filter.orchestratorType = typeParam as 'langgraph' | 'crewai' | 'autogen' | 'custom'
    if (url.searchParams.get('status')) filter.status = url.searchParams.get('status')!
    if (url.searchParams.get('projectId')) filter.projectId = url.searchParams.get('projectId')!

    orchestratorManager.listTasks(filter).then((result) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
    })
    return
  }

  // Submit new orchestrated task
  if (req.method === 'POST' && req.url === '/api/orchestrator/tasks') {
    collectRequestBody(req)
      .then(async (body) => {
        try {
          const request = JSON.parse(body) as OrchestratorTaskRequest
          if (!request.description) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'Description is required' }))
            return
          }
          const result = await orchestratorManager.submitTask(request)
          res.writeHead(result.ok ? 201 : 400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: (e as Error).message }))
        }
      })
      .catch(() => {
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Request body too large' }))
      })
    return
  }

  // Task-specific endpoints: /api/orchestrator/tasks/:id
  const taskMatch = req.url?.match(/^\/api\/orchestrator\/tasks\/([a-f0-9-]+)(?:\/(.+))?$/)
  if (taskMatch) {
    const taskId = taskMatch[1]
    const action = taskMatch[2]

    // GET /api/orchestrator/tasks/:id - Get task status
    if (req.method === 'GET' && !action) {
      orchestratorManager.getTaskStatus(taskId).then((result) => {
        if (result.ok) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        }
      })
      return
    }

    // POST /api/orchestrator/tasks/:id/cancel - Cancel task
    if (req.method === 'POST' && action === 'cancel') {
      orchestratorManager.cancelTask(taskId).then((result) => {
        res.writeHead(result.ok ? 200 : 404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      })
      return
    }
  }

  // ==========================================================================
  // File Changes / Rollback API
  // ==========================================================================

  // GET /api/changes - Get recent file changes
  if (req.method === 'GET' && req.url === '/api/changes') {
    const changes = changeTracker.getRecentChanges(50)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, changes }))
    return
  }

  // GET /api/changes/session/:id - Get changes for a session
  const changesSessionMatch = req.url?.match(/^\/api\/changes\/session\/([a-f0-9-]+)$/)
  if (req.method === 'GET' && changesSessionMatch) {
    const sessionId = changesSessionMatch[1]
    const changes = changeTracker.getChangesForSession(sessionId)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, changes }))
    return
  }

  // GET /api/changes/:id - Get a specific change
  const changeMatch = req.url?.match(/^\/api\/changes\/([a-f0-9-]+)$/)
  if (req.method === 'GET' && changeMatch) {
    const changeId = changeMatch[1]
    const change = changeTracker.getChange(changeId)
    if (change) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, change }))
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'Change not found' }))
    }
    return
  }

  // POST /api/changes/:id/rollback - Rollback a change
  const rollbackMatch = req.url?.match(/^\/api\/changes\/([a-f0-9-]+)\/rollback$/)
  if (req.method === 'POST' && rollbackMatch) {
    const changeId = rollbackMatch[1]
    const result = changeTracker.rollback(changeId)
    if (result.success) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, changeId }))
      log(`File change rolled back: ${changeId}`)
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: result.error }))
    }
    return
  }

  // GET /api/changes/stats - Get change statistics
  if (req.method === 'GET' && req.url === '/api/changes/stats') {
    const stats = changeTracker.getStats()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, stats }))
    return
  }

  // ==========================================================================
  // Google Jules API
  // ==========================================================================

  // GET /api/jules/status - Check if Jules CLI is installed
  if (req.method === 'GET' && req.url === '/api/jules/status') {
    julesService.checkInstalled().then((installed) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, installed }))
    })
    return
  }

  // GET /api/jules/tasks - Get all Jules tasks
  if (req.method === 'GET' && req.url === '/api/jules/tasks') {
    const tasks = julesService.getTasks()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, tasks }))
    return
  }

  // POST /api/jules/tasks - Create a new Jules task
  if (req.method === 'POST' && req.url === '/api/jules/tasks') {
    collectRequestBody(req)
      .then(async (body) => {
        try {
          const { repo, description } = JSON.parse(body)
          if (!description) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'Description required' }))
            return
          }

          const result = await julesService.createTask(repo || '', description)
          res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }))
        }
      })
      .catch(() => {
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Request body too large' }))
      })
    return
  }

  // GET /api/jules/tasks/:id - Get a specific Jules task
  const julesTaskMatch = req.url?.match(/^\/api\/jules\/tasks\/(\d+)$/)
  if (req.method === 'GET' && julesTaskMatch) {
    const sessionId = julesTaskMatch[1]
    const task = julesService.getTask(sessionId)
    if (task) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, task }))
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'Task not found' }))
    }
    return
  }

  // ==========================================================================
  // MCP Marketplace API
  // ==========================================================================

  // GET /api/mcp/servers - List all available MCP servers
  if (req.method === 'GET' && req.url === '/api/mcp/servers') {
    mcpMarketplace
      .getServers()
      .then((servers) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, servers }))
      })
      .catch((err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: err.message }))
      })
    return
  }

  // GET /api/mcp/servers/featured - Get featured/popular servers
  if (req.method === 'GET' && req.url === '/api/mcp/servers/featured') {
    mcpMarketplace
      .getFeatured()
      .then((servers) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, servers }))
      })
      .catch((err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: err.message }))
      })
    return
  }

  // GET /api/mcp/categories - Get all categories
  if (req.method === 'GET' && req.url === '/api/mcp/categories') {
    mcpMarketplace
      .getCategories()
      .then((categories) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, categories }))
      })
      .catch((err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: err.message }))
      })
    return
  }

  // GET /api/mcp/installed - Get installed MCP servers
  if (req.method === 'GET' && req.url === '/api/mcp/installed') {
    const installed = mcpMarketplace.getInstalled()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, servers: installed }))
    return
  }

  // GET /api/mcp/search?q=query - Search for MCP servers
  if (req.method === 'GET' && req.url?.startsWith('/api/mcp/search')) {
    const urlObj = new URL(req.url, `http://localhost:${PORT}`)
    const query = urlObj.searchParams.get('q') || ''
    mcpMarketplace
      .search(query)
      .then((servers) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, servers }))
      })
      .catch((err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: err.message }))
      })
    return
  }

  // POST /api/mcp/install - Install an MCP server
  if (req.method === 'POST' && req.url === '/api/mcp/install') {
    collectRequestBody(req)
      .then(async (body) => {
        try {
          const { serverId, envVars } = JSON.parse(body)
          if (!serverId) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'serverId is required' }))
            return
          }
          const result = await mcpMarketplace.install(serverId, envVars)
          res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }))
        }
      })
      .catch(() => {
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Request body too large' }))
      })
    return
  }

  // POST /api/mcp/uninstall - Uninstall an MCP server
  if (req.method === 'POST' && req.url === '/api/mcp/uninstall') {
    collectRequestBody(req)
      .then(async (body) => {
        try {
          const { serverId } = JSON.parse(body)
          if (!serverId) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'serverId is required' }))
            return
          }
          const result = await mcpMarketplace.uninstall(serverId)
          res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }))
        }
      })
      .catch(() => {
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Request body too large' }))
      })
    return
  }

  // POST /api/mcp/configure - Configure an installed MCP server
  if (req.method === 'POST' && req.url === '/api/mcp/configure') {
    collectRequestBody(req)
      .then(async (body) => {
        try {
          const { serverId, envVars } = JSON.parse(body)
          if (!serverId) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'serverId is required' }))
            return
          }
          const result = await mcpMarketplace.configure(serverId, envVars || {})
          res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }))
        }
      })
      .catch(() => {
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Request body too large' }))
      })
    return
  }

  // ==========================================================================
  // Plugin Marketplace API
  // ==========================================================================

  // GET /api/plugins - List all available plugins
  if (req.method === 'GET' && req.url === '/api/plugins') {
    const plugins = pluginMarketplace.getAllPlugins()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, plugins }))
    return
  }

  // GET /api/plugins/featured - Get featured plugins
  if (req.method === 'GET' && req.url === '/api/plugins/featured') {
    const plugins = pluginMarketplace.getFeaturedPlugins()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, plugins }))
    return
  }

  // GET /api/plugins/official - Get official plugins
  if (req.method === 'GET' && req.url === '/api/plugins/official') {
    const plugins = pluginMarketplace.getOfficialPlugins()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, plugins }))
    return
  }

  // GET /api/plugins/community - Get community plugins
  if (req.method === 'GET' && req.url === '/api/plugins/community') {
    const plugins = pluginMarketplace.getCommunityPlugins()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, plugins }))
    return
  }

  // GET /api/plugins/categories - Get all plugin categories
  if (req.method === 'GET' && req.url === '/api/plugins/categories') {
    const categories = pluginMarketplace.getCategories()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, categories }))
    return
  }

  // GET /api/plugins/installed - Get installed plugins
  if (req.method === 'GET' && req.url === '/api/plugins/installed') {
    const installed = pluginMarketplace.getInstalledPlugins()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, plugins: installed }))
    return
  }

  // GET /api/plugins/search?q=query - Search for plugins
  if (req.method === 'GET' && req.url?.startsWith('/api/plugins/search')) {
    const urlObj = new URL(req.url, `http://localhost:${PORT}`)
    const query = urlObj.searchParams.get('q') || ''
    const results = pluginMarketplace.searchPlugins(query)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, plugins: results }))
    return
  }

  // POST /api/plugins/install - Install a plugin
  if (req.method === 'POST' && req.url === '/api/plugins/install') {
    collectRequestBody(req)
      .then(async (body) => {
        try {
          const { pluginId } = JSON.parse(body)
          if (!pluginId) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'pluginId is required' }))
            return
          }
          const result = await pluginMarketplace.installPlugin(pluginId)
          res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }))
        }
      })
      .catch(() => {
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Request body too large' }))
      })
    return
  }

  // POST /api/plugins/uninstall - Uninstall a plugin
  if (req.method === 'POST' && req.url === '/api/plugins/uninstall') {
    collectRequestBody(req)
      .then(async (body) => {
        try {
          const { pluginId } = JSON.parse(body)
          if (!pluginId) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'pluginId is required' }))
            return
          }
          const result = await pluginMarketplace.uninstallPlugin(pluginId)
          res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }))
        }
      })
      .catch(() => {
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Request body too large' }))
      })
    return
  }

  // POST /api/plugins/toggle - Enable/disable a plugin
  if (req.method === 'POST' && req.url === '/api/plugins/toggle') {
    collectRequestBody(req)
      .then(async (body) => {
        try {
          const { pluginId, enabled } = JSON.parse(body)
          if (!pluginId || enabled === undefined) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'pluginId and enabled are required' }))
            return
          }
          const result = await pluginMarketplace.togglePlugin(pluginId, enabled)
          res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }))
        }
      })
      .catch(() => {
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Request body too large' }))
      })
    return
  }

  // Session-specific endpoints: /sessions/:id
  const sessionMatch = req.url?.match(/^\/sessions\/([a-f0-9-]+)(?:\/(.+))?$/)
  if (sessionMatch) {
    const sessionId = sessionMatch[1]
    const action = sessionMatch[2] // e.g., "prompt", "cancel"

    // GET /sessions/:id - Get session details
    if (req.method === 'GET' && !action) {
      const session = getSession(sessionId)
      if (session) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, session }))
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Session not found' }))
      }
      return
    }

    // PATCH /sessions/:id - Update session (rename)
    if (req.method === 'PATCH' && !action) {
      collectRequestBody(req)
        .then((body) => {
          try {
            const updates = JSON.parse(body) as UpdateSessionRequest
            const session = updateSession(sessionId, updates)
            if (session) {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: true, session }))
            } else {
              res.writeHead(404, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: false, error: 'Session not found' }))
            }
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }))
          }
        })
        .catch(() => {
          res.writeHead(413, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Request body too large' }))
        })
      return
    }

    // PATCH /sessions/:id - Update session properties
    if (req.method === 'PATCH' && !action) {
      collectRequestBody(req)
        .then((body) => {
          try {
            if (!body) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: false, error: 'Request body required' }))
              return
            }

            const updates = JSON.parse(body) as UpdateSessionRequest
            const session = getSession(sessionId)

            if (!session) {
              res.writeHead(404, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: false, error: 'Session not found' }))
              return
            }

            // Update allowed properties
            if (updates.name !== undefined) {
              session.name = updates.name
            }
            if (updates.cwd !== undefined) {
              session.cwd = updates.cwd
            }
            if (updates.modelID !== undefined) {
              session.modelID = updates.modelID
            }
            if (updates.zoneCustomization !== undefined) {
              session.zoneCustomization = updates.zoneCustomization
            }
            if (updates.zonePosition !== undefined) {
              session.zonePosition = updates.zonePosition
            }
            if (updates.pinned !== undefined) {
              session.pinned = updates.pinned
            }
            if (updates.sortOrder !== undefined) {
              session.sortOrder = updates.sortOrder
            }
            if (updates.archived !== undefined) {
              session.archived = updates.archived
            }
            if (updates.enabledPlugins !== undefined) {
              session.enabledPlugins = updates.enabledPlugins
            }
            if (updates.enabledMCPs !== undefined) {
              session.enabledMCPs = updates.enabledMCPs
            }

            // Regenerate settings if MCP/plugin config changed
            const settingsChanged =
              updates.enabledMCPs !== undefined || updates.enabledPlugins !== undefined
            if (settingsChanged) {
              sessionSettingsManager.updateSessionSettings(session).catch((err) => {
                log(`Warning: Failed to update session settings: ${err}`)
              })
            }

            // Save sessions to disk
            saveSessions()

            // Broadcast updated sessions to all clients
            broadcastSessions()

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true, session }))
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: (e as Error).message }))
          }
        })
        .catch(() => {
          res.writeHead(413, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Request body too large' }))
        })
      return
    }

    // DELETE /sessions/:id - Kill session
    if (req.method === 'DELETE' && !action) {
      deleteSession(sessionId).then((deleted) => {
        if (deleted) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'Session not found' }))
        }
      })
      return
    }

    // POST /sessions/:id/prompt - Send prompt to specific session
    if (req.method === 'POST' && action === 'prompt') {
      collectRequestBody(req)
        .then(async (body) => {
          try {
            const { prompt } = JSON.parse(body) as SessionPromptRequest
            if (!prompt) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: false, error: 'Prompt is required' }))
              return
            }
            const result = await sendPromptToSession(sessionId, prompt)
            res.writeHead(result.ok ? 200 : 404, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(result))
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }))
          }
        })
        .catch(() => {
          res.writeHead(413, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Request body too large' }))
        })
      return
    }

    // POST /sessions/:id/cancel - Send Ctrl+C to specific session
    if (req.method === 'POST' && action === 'cancel') {
      const session = getSession(sessionId)
      if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Session not found' }))
        return
      }

      if (session.sessionType === 'opencode') {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Cannot cancel OpenCode sessions via tmux' }))
        return
      }

      if (!session.tmuxSession) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Session has no tmux session' }))
        return
      }

      try {
        validateTmuxSession(session.tmuxSession)
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Invalid tmux session name' }))
        return
      }

      execFile('tmux', ['send-keys', '-t', session.tmuxSession, 'C-c'], EXEC_OPTIONS, (error) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        if (error) {
          res.end(JSON.stringify({ ok: false, error: error.message }))
        } else {
          log(`Sent Ctrl+C to ${session.name}`)
          res.end(JSON.stringify({ ok: true }))
        }
      })
      return
    }

    // POST /sessions/:id/permission - Respond to a permission prompt
    if (req.method === 'POST' && action === 'permission') {
      const session = getSession(sessionId)
      if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Session not found' }))
        return
      }

      collectRequestBody(req)
        .then((body) => {
          try {
            const { response } = JSON.parse(body) as { response: string }
            if (!response) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: false, error: 'Missing response field' }))
              return
            }

            sendPermissionResponse(sessionId, response)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true }))
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }))
          }
        })
        .catch(() => {
          res.writeHead(413, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Request body too large' }))
        })
      return
    }

    // POST /sessions/:id/restart - Restart an offline session
    if (req.method === 'POST' && action === 'restart') {
      const session = getSession(sessionId)
      if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Session not found' }))
        return
      }

      if (session.sessionType === 'opencode') {
        restartOpenCodeSession(sessionId, {
          managedSessions,
          opencodeSessions,
          opencodeManager,
          log,
          broadcastSessions,
          saveSessions,
        }).then((result) => {
          res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        })
        return
      }

      // Handle implicit (external) sessions - "adopt" them by creating a real tmux session
      const isImplicit = isImplicitSession(session)
      let tmuxSession: string

      if (isImplicit) {
        // Generate a new proper tmux session name for this external session
        const baseName = session.name.replace(/\s*\(ext\)$/, '').replace(/[^a-zA-Z0-9_-]/g, '-')
        tmuxSession = `vibe-${baseName}-${Date.now().toString(36).slice(-4)}`
        log(
          `Adopting external session ${session.id.slice(0, 8)} with new tmux session: ${tmuxSession}`
        )
      } else {
        if (!session.tmuxSession) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'Session has no tmux session' }))
          return
        }
        tmuxSession = session.tmuxSession

        // Validate inputs to prevent command injection
        try {
          validateTmuxSession(tmuxSession)
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'Invalid tmux session name' }))
          return
        }
      }

      let cwd: string
      try {
        cwd = validateDirectoryPath(session.cwd || process.cwd())
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            ok: false,
            error: `Invalid directory: ${err instanceof Error ? err.message : err}`,
          })
        )
        return
      }

      // Function to spawn the tmux session
      const spawnTmuxSession = () => {
        // Respawn tmux session with claude using execFile
        // NOTE: Must wrap in bash -c to ensure PATH is properly exported.
        execFile(
          'tmux',
          [
            'new-session',
            '-d',
            '-s',
            tmuxSession,
            '-c',
            cwd,
            `bash -c 'export PATH="${EXEC_PATH}"; ${claudeCommand} -c --permission-mode=bypassPermissions --dangerously-skip-permissions'`,
          ],
          EXEC_OPTIONS,
          (error: Error | null) => {
            if (error) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: false, error: `Failed to restart: ${error.message}` }))
              return
            }

            // Update session state
            session.status = 'idle'
            session.lastActivity = Date.now()
            session.claudeSessionId = undefined // Will be re-linked when events come in
            session.currentTool = undefined
            session.tmuxSession = tmuxSession // Update tmux session name

            // Clear implicit flag if adopting external session
            if (isImplicit) {
              session.implicit = false
              // Update name to remove (ext) suffix
              session.name = session.name.replace(/\s*\(ext\)$/, '')
              log(
                `Adopted external session ${session.id.slice(0, 8)} - now managed with tmux: ${tmuxSession}`
              )
            }

            // Clear old linking
            for (const [claudeId, managedId] of claudeToManagedMap) {
              if (managedId === session.id) {
                claudeToManagedMap.delete(claudeId)
              }
            }

            log(`Restarted session: ${session.name} (${session.id.slice(0, 8)})`)
            broadcastSessions()
            saveSessions()

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true, session }))
          }
        )
      }

      // For implicit sessions, directly spawn (no existing tmux to kill)
      // For regular sessions, kill existing tmux first, then spawn
      if (isImplicit) {
        spawnTmuxSession()
      } else {
        execFile('tmux', ['kill-session', '-t', tmuxSession], EXEC_OPTIONS, () => {
          spawnTmuxSession()
        })
      }
      return
    }

    // POST /sessions/:id/link - Link Claude session ID to managed session
    if (req.method === 'POST' && action === 'link') {
      collectRequestBody(req)
        .then((body) => {
          try {
            const { claudeSessionId } = JSON.parse(body) as { claudeSessionId: string }
            if (!claudeSessionId) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: false, error: 'claudeSessionId is required' }))
              return
            }
            const session = getSession(sessionId)
            if (!session) {
              res.writeHead(404, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: false, error: 'Session not found' }))
              return
            }
            linkClaudeSession(claudeSessionId, sessionId)
            session.claudeSessionId = claudeSessionId
            log(`Linked Claude session ${claudeSessionId.slice(0, 8)} to ${session.name}`)
            broadcastSessions()
            saveSessions()
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true, session }))
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }))
          }
        })
        .catch(() => {
          res.writeHead(413, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Request body too large' }))
        })
      return
    }
  }

  // -------------------------------------------------------------------------
  // Text Tiles API
  // -------------------------------------------------------------------------

  // GET /tiles - List all text tiles
  if (req.method === 'GET' && req.url === '/tiles') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, tiles: getTiles() }))
    return
  }

  // POST /tiles - Create a new text tile
  if (req.method === 'POST' && req.url === '/tiles') {
    collectRequestBody(req)
      .then((body) => {
        try {
          const data = JSON.parse(body) as CreateTextTileRequest

          if (!data.text || !data.position) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'Missing text or position' }))
            return
          }

          const tile: TextTile = {
            id: crypto.randomUUID(),
            text: data.text,
            position: data.position,
            color: data.color,
            createdAt: Date.now(),
          }

          textTiles.set(tile.id, tile)
          saveTiles()
          broadcastTiles()

          log(`Created text tile: "${tile.text}" at (${tile.position.q}, ${tile.position.r})`)
          res.writeHead(201, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, tile }))
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }))
        }
      })
      .catch(() => {
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Request body too large' }))
      })
    return
  }

  // Handle /tiles/:id routes
  const tilesIdMatch = req.url?.match(/^\/tiles\/([^/?]+)/)
  if (tilesIdMatch) {
    const tileId = tilesIdMatch[1]
    const tile = textTiles.get(tileId)

    // PUT /tiles/:id - Update a text tile
    if (req.method === 'PUT') {
      if (!tile) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Tile not found' }))
        return
      }

      collectRequestBody(req)
        .then((body) => {
          try {
            const data = JSON.parse(body) as UpdateTextTileRequest

            if (data.text !== undefined) tile.text = data.text
            if (data.position !== undefined) tile.position = data.position
            if (data.color !== undefined) tile.color = data.color

            saveTiles()
            broadcastTiles()

            log(`Updated text tile: "${tile.text}"`)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true, tile }))
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }))
          }
        })
        .catch(() => {
          res.writeHead(413, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Request body too large' }))
        })
      return
    }

    // DELETE /tiles/:id - Delete a text tile
    if (req.method === 'DELETE') {
      if (!tile) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Tile not found' }))
        return
      }

      textTiles.delete(tileId)
      saveTiles()
      broadcastTiles()

      log(`Deleted text tile: "${tile.text}"`)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return
    }
  }

  // Static file serving for frontend (production mode)
  serveStaticFile(req, res)
}

/** MIME types for static files */
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

/** Serve static files from dist/ directory */
function serveStaticFile(req: IncomingMessage, res: ServerResponse): void {
  // Determine the dist directory (relative to this file when compiled)
  // Compiled server is at: dist/server/server/index.js
  // So ../../ gets us to dist/
  const distDir = resolve(dirname(new URL(import.meta.url).pathname), '../..')

  // Parse the URL path
  let urlPath = req.url?.split('?')[0] ?? '/'
  if (urlPath === '/') urlPath = '/index.html'

  // Security: prevent directory traversal
  // 1. Decode URL-encoded characters to catch %2e%2e (encoded ..)
  // 2. Resolve to absolute path
  // 3. Verify result is within distDir
  let decodedPath: string
  try {
    decodedPath = decodeURIComponent(urlPath)
  } catch (e) {
    // Invalid URL encoding
    res.writeHead(400)
    res.end('Bad request')
    return
  }

  const filePath = resolve(distDir, '.' + decodedPath)

  // Check for path traversal: resolved path must start with distDir
  if (!filePath.startsWith(distDir + '/') && filePath !== distDir) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  // Check if file exists
  if (!existsSync(filePath)) {
    // For SPA, serve index.html for non-API routes
    const indexPath = join(distDir, 'index.html')
    if (existsSync(indexPath) && !decodedPath.startsWith('/api')) {
      const content = readFileSync(indexPath)
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(content)
      return
    }
    res.writeHead(404)
    res.end('Not found')
    return
  }

  // Serve the file
  const ext = extname(filePath).toLowerCase()
  const contentType = MIME_TYPES[ext] || 'application/octet-stream'
  const content = readFileSync(filePath)
  res.writeHead(200, { 'Content-Type': contentType })
  res.end(content)
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  log('Starting Vibecraft server...')

  // Detect runtime environment
  const env = detectEnvironment()
  log('\nEnvironment detected:')
  log(formatEnvironmentInfo(env))
  log('')

  // Log available workspaces
  const workspaces = getHostWorkspaces(env)
  if (workspaces.length > 0) {
    log(`Available workspaces (${workspaces.length}):`)
    workspaces.slice(0, 5).forEach((ws) => log(`  - ${ws}`))
    if (workspaces.length > 5) {
      log(`  ... and ${workspaces.length - 5} more`)
    }
    log('')
  }

  // Load Deepgram API key for voice transcription
  deepgramApiKey = loadDeepgramKey()

  // Load existing events
  loadEventsFromFile()

  // Load saved sessions (for persistence across restarts)
  await loadSessions()

  // Cleanup orphaned Docker containers
  try {
    await dockerSessionManager.cleanupOrphanedContainers()
    log('Docker cleanup completed')
  } catch (err) {
    log(`Warning: Docker cleanup failed - ${err}`)
  }

  // Load saved config (CLI command, etc.)
  loadConfig()

  // Load saved text tiles
  loadTiles()

  // Start git status tracking
  gitStatusManager.setUpdateHandler(({ sessionId, status }) => {
    const session = managedSessions.get(sessionId)
    if (session) {
      debug(
        `Git status updated for ${session.name}: ${status.branch} +${status.linesAdded}/-${status.linesRemoved}`
      )
      // Broadcast updated sessions to all clients
      broadcastSessions()
    }
  })
  gitStatusManager.start()

  // Start project discovery and workspace manager
  projectDiscovery.onProjectChange((project) => {
    debug(`Project updated: ${project.name} (${project.path})`)
    broadcastProjects()
  })
  projectDiscovery.onProjectRemove((projectId) => {
    debug(`Project removed: ${projectId}`)
    broadcastProjects()
  })
  await projectDiscovery.start()

  workspaceManager.onWorkspaceChange((workspace) => {
    debug(`Workspace updated: ${workspace.name}`)
    broadcastWorkspaces()
  })
  workspaceManager.onWorkspaceRemove((workspaceId) => {
    debug(`Workspace removed: ${workspaceId}`)
    broadcastWorkspaces()
  })
  await workspaceManager.start()

  // Initialize orchestrator system
  orchestratorManager.registerPlugin(langGraphPlugin)
  orchestratorManager.registerPlugin(crewAIPlugin)
  orchestratorManager.registerPlugin(autoGenPlugin)
  orchestratorManager.onTaskChange((task) => {
    debug(`Orchestrator task updated: ${task.id} (${task.status})`)
    broadcast({ type: 'orchestrator_task_update', payload: task })
  })
  await orchestratorManager.initialize()

  // Watch for new events
  watchEventsFile()

  // Create HTTP server
  const httpServer = createServer(handleHttpRequest)

  // Create WebSocket server
  const wss = new WebSocketServer({ server: httpServer })

  wss.on('connection', (ws, req) => {
    // CSRF protection: validate Origin header
    const origin = req.headers.origin
    if (!isOriginAllowed(origin)) {
      log(`Rejected WebSocket connection from origin: ${origin}`)
      ws.close(1008, 'Origin not allowed')
      return
    }

    clients.add(ws)
    log(`Client connected (${clients.size} total)${origin ? ` from ${origin}` : ''}`)

    // Send connection confirmation
    const connectMsg: ServerMessage = {
      type: 'connected',
      payload: { sessionId: events[events.length - 1]?.sessionId ?? 'unknown' },
    }
    ws.send(JSON.stringify(connectMsg))

    // IMPORTANT: Send sessions BEFORE history so client can link events to sessions
    const sessionsMsg: ServerMessage = {
      type: 'sessions',
      payload: getSessions(),
    }
    ws.send(JSON.stringify(sessionsMsg))

    // Send text tiles
    const tilesMsg: ServerMessage = {
      type: 'text_tiles',
      payload: getTiles(),
    }
    ws.send(JSON.stringify(tilesMsg))

    // Send workspaces
    const workspacesMsg: ServerMessage = {
      type: 'workspaces',
      payload: workspaceManager.getWorkspaces(),
    }
    ws.send(JSON.stringify(workspacesMsg))

    // Send projects
    const projectsMsg: ServerMessage = {
      type: 'projects',
      payload: projectDiscovery.getProjects(),
    }
    ws.send(JSON.stringify(projectsMsg))

    // Send recent history from ALL sessions, not just managed ones.
    // This enables "external Claude" support: Claude instances started outside Vibecraft
    // (in a regular terminal) will have their events included, allowing the client to
    // create implicit managed sessions and 3D zones for them.
    // Note: This may include events from unrelated/stale sessions, but the client handles
    // deduplication and the benefit of supporting external Claude outweighs the extra data.
    const recentHistory = events.slice(-100)
    const historyMsg: ServerMessage = {
      type: 'history',
      payload: recentHistory,
    }
    ws.send(JSON.stringify(historyMsg))

    ws.on('message', (data: RawData, isBinary: boolean) => {
      // Handle binary audio data for voice transcription
      if (isBinary) {
        const audioBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)
        sendVoiceAudio(ws, audioBuffer)
        return
      }

      // Handle JSON messages
      try {
        const message = JSON.parse(data.toString()) as ClientMessage
        handleClientMessage(ws, message)
      } catch (e) {
        debug(`Failed to parse client message: ${e}`)
      }
    })

    ws.on('close', () => {
      stopVoiceSession(ws) // Clean up any voice session
      clients.delete(ws)
      log(`Client disconnected (${clients.size} total)`)
    })

    ws.on('error', (error) => {
      debug(`WebSocket error: ${error}`)
      stopVoiceSession(ws) // Clean up any voice session
      clients.delete(ws)
    })
  })

  httpServer.listen(PORT, () => {
    log(`Server running on port ${PORT}`)
    log(``)
    log(`Open https://vibecraft.sh to view your workshop`)
    log(``)
    log(`Local API endpoints:`)
    log(`  WebSocket: ws://localhost:${PORT}`)
    log(`  Events: http://localhost:${PORT}/event`)
    log(`  Prompt: http://localhost:${PORT}/prompt`)
    log(`  Health: http://localhost:${PORT}/health`)
    log(`  Stats: http://localhost:${PORT}/stats`)
    log(`  Sessions: http://localhost:${PORT}/sessions`)

    // Start token polling after server is ready
    startTokenPolling()

    // Start permission prompt polling
    startPermissionPolling()

    // Start session health checking (every 5 seconds)
    setInterval(checkSessionHealth, 5000)

    // Start Jules service (async coding agent integration)
    julesService.start().then((started) => {
      if (started) {
        log('Jules integration active (npm install -g @google/jules to use)')
      }
    })

    // Start working timeout checking (every 10 seconds)
    setInterval(checkWorkingTimeout, WORKING_CHECK_INTERVAL_MS)

    // Start OpenCode health checking (every 5 seconds)
    setInterval(
      () => checkOpenCodeHealth({ managedSessions, opencodeManager, broadcastSessions }),
      5000
    )

    // Run initial health check to update session statuses
    checkSessionHealth()
  })
}

main()

// Cleanup on process exit
process.on('SIGINT', async () => {
  log('Shutting down...')

  // Stop all Docker sessions
  for (const session of managedSessions.values()) {
    if (session.runtime === 'docker') {
      try {
        await dockerSessionManager.stopContainer(session.id)
        log(`Stopped Docker container for session "${session.name}"`)
      } catch (err) {
        log(`Error stopping container for ${session.name}: ${err}`)
      }
    }
  }

  process.exit(0)
})

process.on('SIGTERM', async () => {
  log('Received SIGTERM, shutting down gracefully...')

  // Stop all Docker sessions
  for (const session of managedSessions.values()) {
    if (session.runtime === 'docker') {
      try {
        await dockerSessionManager.stopContainer(session.id)
      } catch (err) {
        log(`Error stopping container for ${session.name}: ${err}`)
      }
    }
  }

  process.exit(0)
})
