/**
 * Vibecraft Event Types
 *
 * These types define the contract between:
 * - Hook scripts (produce events)
 * - WebSocket server (relay events)
 * - Three.js client (consume events)
 */

// ============================================================================
// Core Event Types
// ============================================================================

export type HookEventType =
  | 'pre_tool_use'
  | 'post_tool_use'
  | 'stop'
  | 'subagent_stop'
  | 'session_start'
  | 'session_end'
  | 'user_prompt_submit'
  | 'notification'
  | 'pre_compact'

export type ToolName =
  | 'Read'
  | 'Write'
  | 'Edit'
  | 'Bash'
  | 'Grep'
  | 'Glob'
  | 'WebFetch'
  | 'WebSearch'
  | 'Task'
  | 'TodoWrite'
  | 'AskUserQuestion'
  | 'NotebookEdit'
  | string // MCP tools and future tools

// ============================================================================
// Base Event
// ============================================================================

export interface BaseEvent {
  /** Unique event ID */
  id: string
  /** Unix timestamp in milliseconds */
  timestamp: number
  /** Event type */
  type: HookEventType
  /** Claude Code session ID */
  sessionId: string
  /** Current working directory */
  cwd: string
  /** tmux session name (for definitive session matching) */
  tmuxSession?: string
}

// ============================================================================
// Tool Events
// ============================================================================

export interface PreToolUseEvent extends BaseEvent {
  type: 'pre_tool_use'
  tool: ToolName
  toolInput: Record<string, unknown>
  toolUseId: string
  /** Assistant text that came before this tool call */
  assistantText?: string
}

export interface PostToolUseEvent extends BaseEvent {
  type: 'post_tool_use'
  tool: ToolName
  toolInput: Record<string, unknown>
  toolResponse: Record<string, unknown>
  toolUseId: string
  success: boolean
  /** Duration in milliseconds (calculated from matching pre_tool_use) */
  duration?: number
}

// ============================================================================
// Lifecycle Events
// ============================================================================

export interface StopEvent extends BaseEvent {
  type: 'stop'
  stopHookActive: boolean
  /** Claude's text response (extracted from transcript) */
  response?: string
}

export interface SubagentStopEvent extends BaseEvent {
  type: 'subagent_stop'
  stopHookActive: boolean
}

export interface SessionStartEvent extends BaseEvent {
  type: 'session_start'
  source: 'startup' | 'resume' | 'clear' | 'compact'
}

export interface SessionEndEvent extends BaseEvent {
  type: 'session_end'
  reason: 'clear' | 'logout' | 'prompt_input_exit' | 'other'
}

// ============================================================================
// User Interaction Events
// ============================================================================

export interface UserPromptSubmitEvent extends BaseEvent {
  type: 'user_prompt_submit'
  prompt: string
}

export interface NotificationEvent extends BaseEvent {
  type: 'notification'
  message: string
  notificationType:
    | 'permission_prompt'
    | 'idle_prompt'
    | 'auth_success'
    | 'elicitation_dialog'
    | string
}

// ============================================================================
// Other Events
// ============================================================================

export interface PreCompactEvent extends BaseEvent {
  type: 'pre_compact'
  trigger: 'manual' | 'auto'
  customInstructions?: string
}

// ============================================================================
// Union Type
// ============================================================================

export type ClaudeEvent =
  | PreToolUseEvent
  | PostToolUseEvent
  | StopEvent
  | SubagentStopEvent
  | SessionStartEvent
  | SessionEndEvent
  | UserPromptSubmitEvent
  | NotificationEvent
  | PreCompactEvent

// ============================================================================
// WebSocket Messages
// ============================================================================

/** Permission option (number + label) */
export interface PermissionOption {
  number: string // "1", "2", "3"
  label: string // "Yes", "Yes, and always allow...", "No"
}

/** Question data for AskUserQuestion prompts */
export interface QuestionData {
  question: string
  header: string
  options: Array<{ label: string; description?: string }>
  multiSelect: boolean
}

/** Server -> Client messages */
export type ServerMessage =
  | { type: 'event'; payload: ClaudeEvent }
  | { type: 'history'; payload: ClaudeEvent[] }
  | { type: 'connected'; payload: { sessionId: string } }
  | { type: 'error'; payload: { message: string } }
  | {
      type: 'tokens'
      payload: { session: string; sessionId?: string; current: number; cumulative: number }
    }
  | { type: 'sessions'; payload: ManagedSession[] }
  | { type: 'session_update'; payload: ManagedSession }
  | {
      type: 'permission_prompt'
      payload: { sessionId: string; tool: string; context: string; options: PermissionOption[] }
    }
  | { type: 'permission_resolved'; payload: { sessionId: string } }
  | {
      type: 'question_prompt'
      payload: { sessionId: string; managedSessionId: string | null; questions: QuestionData[] }
    }
  | { type: 'text_tiles'; payload: TextTile[] }
  | { type: 'workspaces'; payload: Workspace[] }
  | { type: 'workspace_update'; payload: Workspace }
  | { type: 'projects'; payload: Project[] }
  | { type: 'project_update'; payload: Project }
  | {
      type: 'orchestrator_task_update'
      payload: import('./orchestrator-types.js').OrchestratorTask
    }

/** Client -> Server messages */
export type ClientMessage =
  | { type: 'subscribe'; payload?: { sessionId?: string } }
  | { type: 'get_history'; payload?: { limit?: number } }
  | { type: 'ping' }
  | { type: 'voice_start' }
  | { type: 'voice_stop' }
  | { type: 'permission_response'; payload: { sessionId: string; response: string } }

// ============================================================================
// Visualization State
// ============================================================================

/** Represents Claude's current activity state */
export type ClaudeState =
  | 'idle' // Waiting for user input
  | 'thinking' // Processing (between tools)
  | 'working' // Using a tool
  | 'finished' // Completed response

/** Station/location in the 3D workshop */
export type StationType =
  | 'center' // Default idle position
  | 'bookshelf' // Read
  | 'desk' // Write
  | 'workbench' // Edit
  | 'terminal' // Bash
  | 'scanner' // Grep/Glob
  | 'antenna' // WebFetch/WebSearch
  | 'portal' // Task (spawning subagents)
  | 'taskboard' // TodoWrite

/** Map tools to stations */
export const TOOL_STATION_MAP: Record<ToolName, StationType> = {
  Read: 'bookshelf',
  Write: 'desk',
  Edit: 'workbench',
  Bash: 'terminal',
  Grep: 'scanner',
  Glob: 'scanner',
  WebFetch: 'antenna',
  WebSearch: 'antenna',
  Task: 'portal',
  TodoWrite: 'taskboard',
  AskUserQuestion: 'center',
  NotebookEdit: 'desk',
}

/** Get station for a tool (handles unknown/MCP tools) */
export function getStationForTool(tool: string): StationType {
  return TOOL_STATION_MAP[tool as ToolName] ?? 'center'
}

// ============================================================================
// Utility Types
// ============================================================================

/** Extract specific tool input types */
export interface BashToolInput {
  command: string
  description?: string
  timeout?: number
  run_in_background?: boolean
}

export interface WriteToolInput {
  file_path: string
  content: string
}

export interface EditToolInput {
  file_path: string
  old_string: string
  new_string: string
  replace_all?: boolean
}

export interface ReadToolInput {
  file_path: string
  offset?: number
  limit?: number
}

export interface TaskToolInput {
  description: string
  prompt: string
  subagent_type: string
}

// ============================================================================
// Session Management (Orchestration)
// ============================================================================

/** Status of a managed session */
export type SessionStatus = 'idle' | 'working' | 'waiting' | 'offline'

/** Source of auto-detected project name */
export type ProjectNameSource = 'package.json' | 'pyproject.toml' | 'git-remote' | 'directory'

/** Session type discriminator */
export type SessionType = 'claude' | 'opencode'

/** Runtime environment type */
export type EnvironmentType = 'docker' | 'wsl' | 'native'

/** Runtime type: tmux (local) or docker (container) */
export type SessionRuntime = 'tmux' | 'docker'

/** A managed session (Claude or OpenCode) */
export interface ManagedSession {
  /** Session type - 'claude' for Claude Code, 'opencode' for OpenCode */
  sessionType?: SessionType
  /** Our internal ID (UUID) */
  id: string
  /** User-friendly name ("Frontend", "Tests") */
  name: string
  /** Current status */
  status: SessionStatus
  /** Claude Code session ID (from events, may differ from our ID) */
  claudeSessionId?: string
  /** Actual tmux session name (Claude only, undefined for OpenCode) */
  tmuxSession?: string
  /** Creation timestamp */
  createdAt: number
  /** Last activity timestamp */
  lastActivity: number
  /** Working directory */
  cwd?: string
  /** Current tool being used (if working) */
  currentTool?: string
  /** Token count for this session */
  tokens?: {
    current: number
    cumulative: number
  }
  /** Git status for this session's working directory */
  gitStatus?: GitStatus
  /** Zone position in hex grid (for layout persistence) */
  zonePosition?: {
    q: number
    r: number
  }
  /** Git worktree info (if session uses isolated worktree) */
  worktree?: {
    /** Path to the worktree directory */
    path: string
    /** Branch name created for this worktree */
    branch: string
    /** Original repository path */
    originalRepo: string
  }
  /** Whether this is an implicit session (external Claude, no tmux control) */
  implicit?: boolean
  /** Whether we've linked to a real external tmux session */
  linkedTmux?: boolean
  /** Auto-detected project name (from package.json, pyproject.toml, git remote, or directory) */
  projectName?: string
  /** Source of the detected project name */
  projectSource?: ProjectNameSource
  /** Project ID (links to Project for workspace grouping) */
  projectId?: string
  /** OpenCode-specific: Port the OpenCode server is running on */
  opencodePort?: number
  /** OpenCode-specific: Session ID from OpenCode */
  opencodeSessionId?: string
  /** OpenCode-specific: Server URL */
  opencodeServerUrl?: string
  /** OpenCode-specific: Provider ID (e.g., 'anthropic', 'openai') */
  providerID?: string
  /** OpenCode-specific: Model ID being used */
  modelID?: string
  /** Zone visual customization (theme, layout, decorations) */
  zoneCustomization?: ZoneCustomization
  /** Whether session is pinned (appears at top of sidebar) */
  pinned?: boolean
  /** Sort order within pinned/unpinned group (lower = higher) */
  sortOrder?: number
  /** Whether session is archived (hidden by default) */
  archived?: boolean
  /** Double Shot Latte: auto-continue is active (stop events being evaluated) */
  doubleShotActive?: boolean
  /** Double Shot Latte: count of auto-continues in current burst */
  doubleShotContinues?: number
  /** Enabled plugin IDs for this session */
  enabledPlugins?: string[]
  /** Enabled MCP server IDs for this session */
  enabledMCPs?: string[]
  /** Runtime environment where session is running */
  environment?: {
    type: EnvironmentType // 'docker' | 'wsl' | 'native'
    isDocker: boolean
    isWSL: boolean
  }
  /** For Docker: Container ID (if known) */
  containerId?: string
  /** Runtime type: 'tmux' (local) or 'docker' (container) */
  runtime?: SessionRuntime
}

/** Git repository status */
export interface GitStatus {
  /** Current branch name */
  branch: string
  /** Commits ahead of upstream */
  ahead: number
  /** Commits behind upstream */
  behind: number
  /** Staged file counts */
  staged: {
    added: number
    modified: number
    deleted: number
  }
  /** Unstaged file counts */
  unstaged: {
    added: number
    modified: number
    deleted: number
  }
  /** Untracked file count */
  untracked: number
  /** Total changed files (staged + unstaged + untracked) */
  totalFiles: number
  /** Lines added (staged + unstaged) */
  linesAdded: number
  /** Lines removed (staged + unstaged) */
  linesRemoved: number
  /** Last commit timestamp (unix seconds) */
  lastCommitTime: number | null
  /** Last commit message (first line) */
  lastCommitMessage: string | null
  /** Whether directory is a git repo */
  isRepo: boolean
  /** Last time we checked (unix ms) */
  lastChecked: number
}

/** Known project directory for autocomplete */
export interface KnownProject {
  /** Absolute path to the directory */
  path: string
  /** Display name (defaults to directory basename) */
  name: string
  /** Last time this project was used (unix ms) */
  lastUsed: number
  /** Number of times this project has been opened */
  useCount: number
}

/** Request to create a new session */
export interface CreateSessionRequest {
  name?: string
  cwd?: string
  /** Claude command flags */
  flags?: {
    continue?: boolean // -c (continue last conversation)
    skipPermissions?: boolean // --dangerously-skip-permissions
    chrome?: boolean // --chrome
    worktree?: boolean // Create isolated git worktree
    model?: string // --model (sonnet, opus, haiku)
    thinking?: boolean // --thinking (extended thinking mode)
  }
  /** Runtime environment: 'tmux' (local) or 'docker' (container) */
  runtime?: SessionRuntime
  /** Docker-specific options (only used when runtime='docker') */
  docker?: {
    workspace?: string // Host path to mount (defaults to cwd)
    memory?: string // Memory limit (e.g., "1G", "512M")
    network?: string // Docker network (default: vibecraft-net)
  }
}

/** Request to create an implicit session (external Claude, no tmux control) */
export interface CreateImplicitSessionRequest {
  /** Claude Code session ID from events */
  claudeSessionId: string
  /** Working directory (from event cwd) */
  cwd?: string
}

/** Request to update a session */
export interface UpdateSessionRequest {
  name?: string
  /** Working directory */
  cwd?: string
  /** Model ID (for Claude/OpenCode sessions) */
  modelID?: string
  zonePosition?: {
    q: number
    r: number
  }
  /** Zone visual customization */
  zoneCustomization?: ZoneCustomization
  /** Pin/unpin session (pinned sessions appear at top) */
  pinned?: boolean
  /** Sort order within pinned/unpinned group */
  sortOrder?: number
  /** Archive/unarchive session */
  archived?: boolean
  /** Enabled plugin IDs for this session */
  enabledPlugins?: string[]
  /** Enabled MCP server IDs for this session */
  enabledMCPs?: string[]
}

/** Request to send a prompt to a session */
export interface SessionPromptRequest {
  prompt: string
  send?: boolean
}

/** Response for session operations */
export interface SessionResponse {
  ok: boolean
  session?: ManagedSession
  error?: string
}

/** Response for listing sessions */
export interface SessionListResponse {
  ok: boolean
  sessions: ManagedSession[]
}

// ============================================================================
// Workspace and Project Organization
// ============================================================================

/** Detected project type based on file presence */
export type ProjectType =
  | 'nodejs'
  | 'python'
  | 'rust'
  | 'go'
  | 'java'
  | 'dotnet'
  | 'ruby'
  | 'unknown'

/** A project (directory with optional .claude folder) */
export interface Project {
  /** Unique project ID (UUID) */
  id: string
  /** Display name (from CLAUDE.md title or directory basename) */
  name: string
  /** Absolute path to project root */
  path: string
  /** Parent workspace ID (if grouped) */
  workspaceId?: string
  /** Session IDs associated with this project */
  sessionIds: string[]
  /** Whether .claude folder exists */
  hasClaudeFolder: boolean
  /** Whether CLAUDE.md exists */
  hasClaudeMd: boolean
  /** Description extracted from CLAUDE.md */
  description?: string
  /** Detected project type */
  projectType: ProjectType
  /** Last activity timestamp */
  lastActivity: number
  /** Creation/discovery timestamp */
  discoveredAt: number
  /** Color accent for visual grouping (hex string) */
  colorAccent?: string
}

/** A workspace (logical grouping of projects) */
export interface Workspace {
  /** Unique workspace ID (UUID) */
  id: string
  /** Display name */
  name: string
  /** Root path (optional, for auto-grouping) */
  rootPath?: string
  /** Project IDs in this workspace */
  projectIds: string[]
  /** Color for workspace identification (hex string) */
  color?: string
  /** Creation timestamp */
  createdAt: number
}

/** Request to create a workspace */
export interface CreateWorkspaceRequest {
  name: string
  rootPath?: string
  color?: string
}

/** Request to update a workspace */
export interface UpdateWorkspaceRequest {
  name?: string
  rootPath?: string
  color?: string
  projectIds?: string[]
}

/** Request to create/register a project */
export interface CreateProjectRequest {
  path: string
  name?: string
  workspaceId?: string
}

/** Request to update a project */
export interface UpdateProjectRequest {
  name?: string
  workspaceId?: string
  colorAccent?: string
}

/** Response for project/workspace operations */
export interface ProjectResponse {
  ok: boolean
  project?: Project
  workspace?: Workspace
  error?: string
}

/** Response for listing projects */
export interface ProjectListResponse {
  ok: boolean
  projects: Project[]
}

/** Response for listing workspaces */
export interface WorkspaceListResponse {
  ok: boolean
  workspaces: Workspace[]
}

// ============================================================================
// Text Tiles (Grid Labels)
// ============================================================================

/** A text label tile on the hex grid */
export interface TextTile {
  /** Unique ID (UUID) */
  id: string
  /** The label text */
  text: string
  /** Hex grid position */
  position: {
    q: number
    r: number
  }
  /** Optional color (hex string, default white) */
  color?: string
  /** Creation timestamp */
  createdAt: number
}

/** Request to create a text tile */
export interface CreateTextTileRequest {
  text: string
  position: {
    q: number
    r: number
  }
  color?: string
}

/** Request to update a text tile */
export interface UpdateTextTileRequest {
  text?: string
  position?: {
    q: number
    r: number
  }
  color?: string
}

// ============================================================================
// Zone Themes and Layouts
// ============================================================================

/** Available zone color themes */
export type ZoneThemeId =
  | 'icy-default'
  | 'warm-ember'
  | 'deep-ocean'
  | 'forest-code'
  | 'neon-purple'
  | 'sunset-gold'

/** Zone theme color configuration */
export interface ZoneTheme {
  id: ZoneThemeId
  name: string
  /** Primary accent color (hex) */
  primary: number
  /** Secondary color for highlights (hex) */
  secondary: number
  /** Station ring color (hex) */
  stationRing: number
  /** Floor glow color (hex) */
  floorGlow: number
  /** Character status ring idle color (hex) */
  characterIdle: number
}

/** Predefined zone themes */
export const ZONE_THEMES: Record<ZoneThemeId, ZoneTheme> = {
  'icy-default': {
    id: 'icy-default',
    name: 'Icy Default',
    primary: 0x22d3ee, // Cyan
    secondary: 0x06b6d4, // Teal
    stationRing: 0x22d3ee,
    floorGlow: 0x22d3ee,
    characterIdle: 0x4ade80,
  },
  'warm-ember': {
    id: 'warm-ember',
    name: 'Warm Ember',
    primary: 0xf97316, // Orange
    secondary: 0xfbbf24, // Amber
    stationRing: 0xfbbf24,
    floorGlow: 0xf97316,
    characterIdle: 0xfbbf24,
  },
  'deep-ocean': {
    id: 'deep-ocean',
    name: 'Deep Ocean',
    primary: 0x3b82f6, // Blue
    secondary: 0x1d4ed8, // Dark blue
    stationRing: 0x60a5fa,
    floorGlow: 0x3b82f6,
    characterIdle: 0x60a5fa,
  },
  'forest-code': {
    id: 'forest-code',
    name: 'Forest Code',
    primary: 0x22c55e, // Green
    secondary: 0x16a34a, // Dark green
    stationRing: 0x4ade80,
    floorGlow: 0x22c55e,
    characterIdle: 0x86efac,
  },
  'neon-purple': {
    id: 'neon-purple',
    name: 'Neon Purple',
    primary: 0xa855f7, // Purple
    secondary: 0x8b5cf6, // Violet
    stationRing: 0xc084fc,
    floorGlow: 0xa855f7,
    characterIdle: 0xd8b4fe,
  },
  'sunset-gold': {
    id: 'sunset-gold',
    name: 'Sunset Gold',
    primary: 0xeab308, // Yellow
    secondary: 0xf59e0b, // Amber
    stationRing: 0xfde047,
    floorGlow: 0xeab308,
    characterIdle: 0xfef08a,
  },
}

/** Available zone layout presets */
export type ZoneLayoutId = 'standard' | 'minimal' | 'web-focused' | 'backend-focused'

/** Which stations are enabled in a layout */
export interface ZoneLayout {
  id: ZoneLayoutId
  name: string
  description: string
  /** Stations included in this layout */
  stations: StationType[]
  /** Custom station positions (overrides defaults) */
  customPositions?: Partial<Record<StationType, { x: number; z: number }>>
}

/** Predefined zone layouts */
export const ZONE_LAYOUTS: Record<ZoneLayoutId, ZoneLayout> = {
  standard: {
    id: 'standard',
    name: 'Standard',
    description: 'All 9 stations for full functionality',
    stations: [
      'center',
      'bookshelf',
      'desk',
      'workbench',
      'terminal',
      'scanner',
      'antenna',
      'portal',
      'taskboard',
    ],
  },
  minimal: {
    id: 'minimal',
    name: 'Minimal',
    description: '5 core stations for simple projects',
    stations: ['center', 'bookshelf', 'workbench', 'terminal', 'portal'],
  },
  'web-focused': {
    id: 'web-focused',
    name: 'Web Focused',
    description: 'Enhanced for web development with larger antenna/scanner areas',
    stations: ['center', 'bookshelf', 'desk', 'workbench', 'terminal', 'scanner', 'antenna'],
  },
  'backend-focused': {
    id: 'backend-focused',
    name: 'Backend Focused',
    description: 'Enhanced for backend development with prominent terminal/workbench',
    stations: ['center', 'bookshelf', 'workbench', 'terminal', 'scanner', 'portal', 'taskboard'],
  },
}

/** Zone customization options (stored per session) */
export interface ZoneCustomization {
  /** Theme ID */
  themeId?: ZoneThemeId
  /** Layout ID */
  layoutId?: ZoneLayoutId
  /** Custom decorations (future: furniture, plants, etc.) */
  decorations?: ZoneDecoration[]
}

/** A decoration placed in a zone */
export interface ZoneDecoration {
  /** Decoration type ID */
  typeId: string
  /** Position relative to zone center */
  position: { x: number; y: number; z: number }
  /** Rotation in radians */
  rotation?: number
  /** Scale multiplier */
  scale?: number
}

// ============================================================================
// Configuration
// ============================================================================

export interface VibecraftConfig {
  /** WebSocket server port */
  serverPort: number
  /** Path to events JSONL file */
  eventsFile: string
  /** Maximum events to keep in memory */
  maxEventsInMemory: number
  /** Enable debug logging */
  debug: boolean
}

export const DEFAULT_CONFIG: VibecraftConfig = {
  serverPort: 4003,
  eventsFile: './data/events.jsonl',
  maxEventsInMemory: 1000,
  debug: false,
}

// ============================================================================
// OpenCode Integration
// ============================================================================

// Note: OpenCode sessions use the same ManagedSession interface with sessionType='opencode'
// and the opencode* fields populated. Claude sessions have sessionType='claude' (or undefined
// for backwards compatibility) with tmuxSession populated.

export type OpenCodeEventType =
  | 'message.part.updated'
  | 'message.updated'
  | 'session.status'
  | 'session.created'
  | 'session.updated'
  | 'session.diff'
  | 'session.error'
  | 'session.idle'
  | 'permission.asked'
  | 'server.connected'
  | 'server.heartbeat'
  | 'file.watcher.updated'

export interface OpenCodeEvent {
  type: OpenCodeEventType
  properties?: {
    sessionID?: string
    message?: {
      content?: {
        parts?: Array<{
          type: string
          text?: string
          tool?: string
        }>
        text?: string
      }
    }
    part?: {
      id?: string
      type: 'text' | 'tool' | 'reasoning' | 'step-start' | 'step-finish'
      tool?: string
      state?: {
        status: 'started' | 'completed' | 'failed'
        input?: Record<string, unknown>
        output?: Record<string, unknown>
        success?: boolean
      }
      text?: string
      time?: {
        start?: number
        end?: number
      }
    }
    diff?: {
      summary?: string
    }
    error?: {
      message?: string
    }
    permission?: {
      permission: string
      patterns?: string[]
    }
    cwd?: string
  }
}

export const OPENCODE_TOOL_STATION_MAP: Record<string, StationType> = {
  read: 'bookshelf',
  write: 'desk',
  edit: 'workbench',
  bash: 'terminal',
  glob: 'scanner',
  grep: 'scanner',
  websearch: 'antenna',
  webfetch: 'antenna',
  task: 'portal',
  todowrite: 'taskboard',
  notebookedit: 'desk',
}

export function getStationForOpenCodeTool(tool: string): StationType {
  return OPENCODE_TOOL_STATION_MAP[tool.toLowerCase()] ?? 'center'
}

export function mapOpenCodeToolToVibecraft(opencodeTool: string): ToolName {
  const mapping: Record<string, ToolName> = {
    read: 'Read',
    write: 'Write',
    edit: 'Edit',
    bash: 'Bash',
    glob: 'Glob',
    grep: 'Grep',
    websearch: 'WebSearch',
    webfetch: 'WebFetch',
    task: 'Task',
    todowrite: 'TodoWrite',
    notebookedit: 'NotebookEdit',
  }
  return mapping[opencodeTool.toLowerCase()] ?? (opencodeTool as ToolName)
}
