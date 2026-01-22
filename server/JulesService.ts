/**
 * JulesService - Integration with Google Jules async coding agent
 *
 * Jules runs tasks in remote VMs and creates pull requests when complete.
 * CLI: npm install -g @google/jules
 *
 * @see https://jules.google/docs/cli/reference/
 */

import { exec } from 'child_process'
import { promisify } from 'util'

const execPromise = promisify(exec)

// ============================================================================
// Types
// ============================================================================

export interface JulesTask {
  /** Session ID from Jules */
  sessionId: string
  /** Repository name (owner/repo) */
  repo: string
  /** Task description */
  description: string
  /** Task status */
  status: 'pending' | 'running' | 'completed' | 'failed'
  /** Created timestamp */
  createdAt: number
  /** Updated timestamp */
  updatedAt: number
  /** PR URL if completed */
  prUrl?: string
  /** Error message if failed */
  error?: string
}

export interface JulesServiceOptions {
  /** Polling interval for task status (ms) */
  pollInterval?: number
  /** Max tasks to track */
  maxTasks?: number
}

// ============================================================================
// JulesService Class
// ============================================================================

export class JulesService {
  private tasks = new Map<string, JulesTask>()
  private pollInterval: number
  private maxTasks: number
  private pollTimer: NodeJS.Timeout | null = null
  private isInstalled: boolean | null = null
  private onChange: ((tasks: JulesTask[]) => void) | null = null

  constructor(options: JulesServiceOptions = {}) {
    this.pollInterval = options.pollInterval ?? 30000 // 30 seconds
    this.maxTasks = options.maxTasks ?? 50
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Start the service (begins polling for task status)
   */
  async start(): Promise<boolean> {
    this.isInstalled = await this.checkInstalled()
    if (!this.isInstalled) {
      console.log('[Jules] CLI not installed. Install with: npm install -g @google/jules')
      return false
    }

    console.log('[Jules] Service started')
    this.startPolling()
    return true
  }

  /**
   * Stop the service
   */
  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    console.log('[Jules] Service stopped')
  }

  /**
   * Set callback for task changes
   */
  onTaskChange(callback: (tasks: JulesTask[]) => void): void {
    this.onChange = callback
  }

  // ==========================================================================
  // Installation Check
  // ==========================================================================

  /**
   * Check if Jules CLI is installed
   */
  async checkInstalled(): Promise<boolean> {
    try {
      const { stdout } = await execPromise('jules --version', { timeout: 5000 })
      console.log(`[Jules] CLI version: ${stdout.trim()}`)
      return true
    } catch {
      return false
    }
  }

  // ==========================================================================
  // Task Management
  // ==========================================================================

  /**
   * Create a new Jules task
   */
  async createTask(
    repo: string,
    description: string
  ): Promise<{ ok: boolean; task?: JulesTask; error?: string }> {
    if (!this.isInstalled) {
      return { ok: false, error: 'Jules CLI not installed' }
    }

    try {
      // Run: jules new --repo owner/repo "description"
      const cmd = repo
        ? `jules new --repo "${repo}" "${description.replace(/"/g, '\\"')}"`
        : `jules new "${description.replace(/"/g, '\\"')}"`

      console.log(`[Jules] Creating task: ${cmd}`)
      const { stdout } = await execPromise(cmd, { timeout: 30000 })

      // Parse session ID from output
      // Expected: "Created session: 123456" or similar
      const sessionMatch = stdout.match(/session[:\s]+(\d+)/i) || stdout.match(/(\d{6,})/i)
      if (!sessionMatch) {
        console.error(`[Jules] Failed to parse session ID from: ${stdout}`)
        return { ok: false, error: 'Failed to parse session ID' }
      }

      const sessionId = sessionMatch[1]
      const task: JulesTask = {
        sessionId,
        repo: repo || 'current',
        description,
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      this.tasks.set(sessionId, task)
      this.pruneOldTasks()
      this.notifyChange()

      console.log(`[Jules] Task created: ${sessionId}`)
      return { ok: true, task }
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Unknown error'
      console.error(`[Jules] Failed to create task: ${error}`)
      return { ok: false, error }
    }
  }

  /**
   * Get a specific task
   */
  getTask(sessionId: string): JulesTask | undefined {
    return this.tasks.get(sessionId)
  }

  /**
   * Get all tasks
   */
  getTasks(): JulesTask[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt)
  }

  /**
   * Get tasks for a specific repo
   */
  getTasksForRepo(repo: string): JulesTask[] {
    return this.getTasks().filter((t) => t.repo === repo || t.repo === 'current')
  }

  // ==========================================================================
  // Status Polling
  // ==========================================================================

  private startPolling(): void {
    this.pollTimer = setInterval(() => {
      this.pollTaskStatuses()
    }, this.pollInterval)
  }

  private async pollTaskStatuses(): Promise<void> {
    const pendingTasks = Array.from(this.tasks.values()).filter(
      (t) => t.status === 'pending' || t.status === 'running'
    )

    if (pendingTasks.length === 0) return

    try {
      // Run: jules remote list --session
      const { stdout } = await execPromise('jules remote list --session', { timeout: 30000 })

      // Parse the output for session statuses
      // This is a simplified parser - actual format may vary
      const lines = stdout.split('\n')
      let changed = false

      for (const task of pendingTasks) {
        const matchingLine = lines.find((line) => line.includes(task.sessionId))
        if (matchingLine) {
          const prevStatus = task.status

          if (
            matchingLine.toLowerCase().includes('completed') ||
            matchingLine.toLowerCase().includes('done')
          ) {
            task.status = 'completed'
            // Try to extract PR URL
            const prMatch = matchingLine.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/i)
            if (prMatch) {
              task.prUrl = prMatch[0]
            }
          } else if (
            matchingLine.toLowerCase().includes('running') ||
            matchingLine.toLowerCase().includes('active')
          ) {
            task.status = 'running'
          } else if (
            matchingLine.toLowerCase().includes('failed') ||
            matchingLine.toLowerCase().includes('error')
          ) {
            task.status = 'failed'
            task.error = 'Task failed'
          }

          if (task.status !== prevStatus) {
            task.updatedAt = Date.now()
            changed = true
            console.log(`[Jules] Task ${task.sessionId} status: ${prevStatus} → ${task.status}`)
          }
        }
      }

      if (changed) {
        this.notifyChange()
      }
    } catch (e) {
      console.error('[Jules] Failed to poll task statuses:', e)
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private pruneOldTasks(): void {
    if (this.tasks.size > this.maxTasks) {
      const sorted = Array.from(this.tasks.entries()).sort(
        (a, b) => a[1].createdAt - b[1].createdAt
      )

      const toRemove = sorted.slice(0, this.tasks.size - this.maxTasks)
      for (const [id] of toRemove) {
        this.tasks.delete(id)
      }
    }
  }

  private notifyChange(): void {
    this.onChange?.(this.getTasks())
  }
}

// Singleton instance
export const julesService = new JulesService()
