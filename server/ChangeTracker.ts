/**
 * ChangeTracker - Tracks file changes for rollback functionality
 *
 * Records before/after states of files when Edit/Write tools are used,
 * enabling users to revert changes if needed.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { join, dirname, resolve } from 'path'
import { randomUUID } from 'crypto'

// ============================================================================
// Types
// ============================================================================

export interface FileChange {
  /** Unique change ID */
  id: string
  /** Session that made this change */
  sessionId: string
  /** Claude session ID if available */
  claudeSessionId?: string
  /** Tool use ID from the event */
  toolUseId: string
  /** Tool that made the change (Edit, Write, etc.) */
  tool: string
  /** Absolute file path */
  path: string
  /** File content before the change (null if file was created) */
  before: string | null
  /** File content after the change */
  after: string
  /** Timestamp of the change */
  timestamp: number
  /** Whether this change has been rolled back */
  rolledBack: boolean
  /** Optional description */
  description?: string
}

export interface ChangeTrackerOptions {
  /** Directory to store change history */
  dataDir: string
  /** Maximum changes to keep per session */
  maxChangesPerSession?: number
  /** Maximum total changes to store */
  maxTotalChanges?: number
}

// ============================================================================
// ChangeTracker Class
// ============================================================================

export class ChangeTracker {
  private dataDir: string
  private changesFile: string
  private changes: Map<string, FileChange> = new Map()
  private maxChangesPerSession: number
  private maxTotalChanges: number

  constructor(options: ChangeTrackerOptions) {
    this.dataDir = options.dataDir
    this.changesFile = join(options.dataDir, 'file-changes.json')
    this.maxChangesPerSession = options.maxChangesPerSession ?? 50
    this.maxTotalChanges = options.maxTotalChanges ?? 500

    // Ensure data directory exists
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true })
    }

    this.loadChanges()
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  private loadChanges(): void {
    try {
      if (existsSync(this.changesFile)) {
        const data = JSON.parse(readFileSync(this.changesFile, 'utf-8'))
        this.changes = new Map(Object.entries(data.changes || {}))
        console.log(`[ChangeTracker] Loaded ${this.changes.size} changes from disk`)
      }
    } catch (e) {
      console.error('[ChangeTracker] Error loading changes:', e)
      this.changes = new Map()
    }
  }

  private saveChanges(): void {
    try {
      const data = {
        changes: Object.fromEntries(this.changes),
        savedAt: Date.now(),
      }
      writeFileSync(this.changesFile, JSON.stringify(data, null, 2))
    } catch (e) {
      console.error('[ChangeTracker] Error saving changes:', e)
    }
  }

  // ==========================================================================
  // Change Tracking
  // ==========================================================================

  /**
   * Record a file change before a tool executes
   * Returns a change ID to be used when recording the 'after' state
   */
  recordBefore(params: {
    sessionId: string
    claudeSessionId?: string
    toolUseId: string
    tool: string
    path: string
  }): string {
    const { sessionId, claudeSessionId, toolUseId, tool, path } = params

    // Read current file content (or null if it doesn't exist)
    let before: string | null = null
    try {
      const absolutePath = resolve(path)
      if (existsSync(absolutePath)) {
        before = readFileSync(absolutePath, 'utf-8')
      }
    } catch {
      // File doesn't exist or can't be read - that's ok
    }

    const change: FileChange = {
      id: randomUUID(),
      sessionId,
      claudeSessionId,
      toolUseId,
      tool,
      path: resolve(path),
      before,
      after: '', // Will be filled in by recordAfter
      timestamp: Date.now(),
      rolledBack: false,
    }

    this.changes.set(change.id, change)
    this.pruneOldChanges()
    this.saveChanges()

    return change.id
  }

  /**
   * Record the 'after' state of a file change
   */
  recordAfter(changeId: string, description?: string): boolean {
    const change = this.changes.get(changeId)
    if (!change) {
      console.warn(`[ChangeTracker] Change ${changeId} not found for recordAfter`)
      return false
    }

    // Read current file content
    try {
      if (existsSync(change.path)) {
        change.after = readFileSync(change.path, 'utf-8')
      } else {
        // File was deleted - store empty string
        change.after = ''
      }
    } catch (e) {
      console.error(`[ChangeTracker] Error reading file after change:`, e)
      return false
    }

    if (description) {
      change.description = description
    }

    this.saveChanges()
    return true
  }

  /**
   * Record a complete change (before + after in one call)
   * Useful when we already know both states
   */
  recordChange(params: {
    sessionId: string
    claudeSessionId?: string
    toolUseId: string
    tool: string
    path: string
    before: string | null
    after: string
    description?: string
  }): FileChange {
    const change: FileChange = {
      id: randomUUID(),
      sessionId: params.sessionId,
      claudeSessionId: params.claudeSessionId,
      toolUseId: params.toolUseId,
      tool: params.tool,
      path: resolve(params.path),
      before: params.before,
      after: params.after,
      timestamp: Date.now(),
      rolledBack: false,
      description: params.description,
    }

    this.changes.set(change.id, change)
    this.pruneOldChanges()
    this.saveChanges()

    return change
  }

  // ==========================================================================
  // Rollback
  // ==========================================================================

  /**
   * Rollback a specific change
   */
  rollback(changeId: string): { success: boolean; error?: string } {
    const change = this.changes.get(changeId)
    if (!change) {
      return { success: false, error: 'Change not found' }
    }

    if (change.rolledBack) {
      return { success: false, error: 'Change already rolled back' }
    }

    // Restore the file to its previous state
    try {
      if (change.before === null) {
        // File was created - delete it
        if (existsSync(change.path)) {
          unlinkSync(change.path)
        }
      } else {
        // Restore original content
        const dir = dirname(change.path)
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true })
        }
        writeFileSync(change.path, change.before, 'utf-8')
      }

      change.rolledBack = true
      this.saveChanges()
      return { success: true }
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Unknown error'
      return { success: false, error }
    }
  }

  // ==========================================================================
  // Queries
  // ==========================================================================

  /**
   * Get a specific change by ID
   */
  getChange(changeId: string): FileChange | undefined {
    return this.changes.get(changeId)
  }

  /**
   * Get all changes for a session
   */
  getChangesForSession(sessionId: string): FileChange[] {
    return Array.from(this.changes.values())
      .filter((c) => c.sessionId === sessionId)
      .sort((a, b) => b.timestamp - a.timestamp)
  }

  /**
   * Get recent changes across all sessions
   */
  getRecentChanges(limit: number = 20): FileChange[] {
    return Array.from(this.changes.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
  }

  /**
   * Get changes for a specific file
   */
  getChangesForFile(path: string): FileChange[] {
    const absolutePath = resolve(path)
    return Array.from(this.changes.values())
      .filter((c) => c.path === absolutePath)
      .sort((a, b) => b.timestamp - a.timestamp)
  }

  /**
   * Get change statistics
   */
  getStats(): {
    totalChanges: number
    rollbackCount: number
    fileCount: number
    sessionCount: number
  } {
    const changes = Array.from(this.changes.values())
    const files = new Set(changes.map((c) => c.path))
    const sessions = new Set(changes.map((c) => c.sessionId))

    return {
      totalChanges: changes.length,
      rollbackCount: changes.filter((c) => c.rolledBack).length,
      fileCount: files.size,
      sessionCount: sessions.size,
    }
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  private pruneOldChanges(): void {
    // Remove oldest changes if we exceed max total
    if (this.changes.size > this.maxTotalChanges) {
      const sorted = Array.from(this.changes.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      )

      const toRemove = sorted.slice(0, this.changes.size - this.maxTotalChanges)
      for (const [id] of toRemove) {
        this.changes.delete(id)
      }
    }
  }

  /**
   * Clear all changes for a session
   */
  clearSessionChanges(sessionId: string): void {
    for (const [id, change] of this.changes) {
      if (change.sessionId === sessionId) {
        this.changes.delete(id)
      }
    }
    this.saveChanges()
  }

  /**
   * Clear all changes
   */
  clearAll(): void {
    this.changes.clear()
    this.saveChanges()
  }
}
