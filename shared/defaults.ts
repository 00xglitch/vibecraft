/**
 * Vibecraft - Central Configuration Defaults
 *
 * Single source of truth for default values.
 * Environment variables override these defaults.
 */

export const DEFAULTS = {
  /** WebSocket/API server port */
  SERVER_PORT: 4003,

  /** Vite dev server port */
  CLIENT_PORT: 4002,

  /**
   * Events file path.
   * Uses ~/.vibecraft/ to ensure consistent location regardless of
   * how vibecraft was installed (npx, global npm, local dev).
   * The ~ is expanded by the server at runtime.
   */
  EVENTS_FILE: '~/.vibecraft/data/events.jsonl',

  /**
   * Sessions file path.
   * Uses ~/.vibecraft/ for consistency across installations.
   */
  SESSIONS_FILE: '~/.vibecraft/data/sessions.json',

  /** Max events to keep in memory */
  MAX_EVENTS: 1000,

  /** tmux session name */
  TMUX_SESSION: 'claude',

  /** CLI command to run (e.g., 'claude' or 'happy') */
  CLAUDE_COMMAND: 'claude',

  // Memory Budget Settings
  /** Maximum total zones allowed (hard cap) */
  MAX_ZONES: 30,
  /** Maximum zones with full detail loaded simultaneously */
  MAX_LOADED_ZONES: 5,
  /** Garbage collection interval in milliseconds */
  GC_INTERVAL_MS: 30000,

  // LOD Settings
  /** Distance for HIGH detail (focused zone) */
  LOD_HIGH_DISTANCE: 25,
  /** Distance for MEDIUM detail (beyond this is LOW) */
  LOD_MEDIUM_DISTANCE: 60,
} as const

export type Defaults = typeof DEFAULTS
