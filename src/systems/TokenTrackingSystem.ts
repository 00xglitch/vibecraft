/**
 * Token Tracking System
 *
 * Provides comprehensive token tracking with:
 * - Per-session current and cumulative tracking
 * - Historical stats with time-series data
 * - Cost estimates based on Claude model pricing
 * - Alerts when approaching configurable limits
 * - localStorage persistence for history
 */

// Claude API pricing (per million tokens) as of 2024
// https://www.anthropic.com/pricing
export const MODEL_PRICING = {
  'claude-3-opus': { input: 15.0, output: 75.0 },
  'claude-3-sonnet': { input: 3.0, output: 15.0 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
  'claude-3.5-sonnet': { input: 3.0, output: 15.0 },
  'claude-3.5-haiku': { input: 0.8, output: 4.0 },
  'claude-sonnet-4': { input: 3.0, output: 15.0 },
  'claude-opus-4': { input: 15.0, output: 75.0 },
  default: { input: 3.0, output: 15.0 }, // Default to Sonnet pricing
} as const

export type ModelId = keyof typeof MODEL_PRICING

export interface TokenSnapshot {
  timestamp: number
  current: number
  cumulative: number
  model?: ModelId
}

export interface SessionTokenStats {
  sessionId: string
  sessionName?: string
  model: ModelId
  current: number
  cumulative: number
  estimatedCost: number // USD
  history: TokenSnapshot[] // Time-series data
  startTime: number
  lastUpdate: number
  peakCurrent: number // Highest single-turn token count
}

export interface TokenAlert {
  type: 'warning' | 'critical'
  sessionId: string
  message: string
  currentValue: number
  limit: number
  timestamp: number
}

export interface TokenLimits {
  sessionWarning: number // Warn when session cumulative exceeds this
  sessionCritical: number // Critical alert at this level
  globalDaily: number // Daily global limit across all sessions
  turnWarning: number // Warn on large single turns
}

type AlertListener = (alert: TokenAlert) => void
type StatsListener = (stats: SessionTokenStats) => void

const STORAGE_KEY = 'vibecraft:token-history'
const MAX_HISTORY_POINTS = 100 // Max data points per session
const HISTORY_INTERVAL_MS = 30_000 // Record history every 30 seconds

class TokenTrackingSystem {
  private stats = new Map<string, SessionTokenStats>()
  private alerts: TokenAlert[] = []
  private alertListeners: AlertListener[] = []
  private statsListeners: StatsListener[] = []
  private historyTimer: ReturnType<typeof setInterval> | null = null

  // Configurable limits
  private limits: TokenLimits = {
    sessionWarning: 500_000, // 500K tokens
    sessionCritical: 1_000_000, // 1M tokens
    globalDaily: 5_000_000, // 5M tokens/day
    turnWarning: 50_000, // 50K tokens in single turn
  }

  // Track daily usage
  private dailyUsage = {
    date: this.getTodayKey(),
    total: 0,
  }

  constructor() {
    this.loadFromStorage()
    this.startHistoryRecording()
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Update token count for a session
   */
  updateSession(
    sessionId: string,
    current: number,
    cumulative: number,
    options?: { sessionName?: string; model?: ModelId }
  ): void {
    let stats = this.stats.get(sessionId)
    const now = Date.now()

    if (!stats) {
      stats = this.createStats(sessionId, options?.model || 'default')
      this.stats.set(sessionId, stats)
    }

    // Update stats
    const previousCumulative = stats.cumulative
    stats.current = current
    stats.cumulative = cumulative
    stats.lastUpdate = now
    stats.peakCurrent = Math.max(stats.peakCurrent, current)

    if (options?.sessionName) {
      stats.sessionName = options.sessionName
    }
    if (options?.model) {
      stats.model = options.model
    }

    // Recalculate cost
    stats.estimatedCost = this.calculateCost(cumulative, stats.model)

    // Update daily tracking
    this.updateDailyUsage(cumulative - previousCumulative)

    // Check for alerts
    this.checkAlerts(stats)

    // Notify listeners
    this.notifyStatsListeners(stats)

    // Persist
    this.saveToStorage()
  }

  /**
   * Get stats for a session
   */
  getSessionStats(sessionId: string): SessionTokenStats | undefined {
    return this.stats.get(sessionId)
  }

  /**
   * Get stats for all sessions
   */
  getAllStats(): SessionTokenStats[] {
    return Array.from(this.stats.values())
  }

  /**
   * Get total tokens across all sessions
   */
  getGlobalStats(): {
    totalCurrent: number
    totalCumulative: number
    totalCost: number
    sessionCount: number
    dailyUsage: number
  } {
    let totalCurrent = 0
    let totalCumulative = 0
    let totalCost = 0

    for (const stats of this.stats.values()) {
      totalCurrent += stats.current
      totalCumulative += stats.cumulative
      totalCost += stats.estimatedCost
    }

    return {
      totalCurrent,
      totalCumulative,
      totalCost,
      sessionCount: this.stats.size,
      dailyUsage: this.dailyUsage.total,
    }
  }

  /**
   * Get recent alerts
   */
  getAlerts(limit = 10): TokenAlert[] {
    return this.alerts.slice(-limit)
  }

  /**
   * Clear alerts
   */
  clearAlerts(): void {
    this.alerts = []
  }

  /**
   * Subscribe to alerts
   */
  onAlert(listener: AlertListener): () => void {
    this.alertListeners.push(listener)
    return () => {
      const idx = this.alertListeners.indexOf(listener)
      if (idx >= 0) this.alertListeners.splice(idx, 1)
    }
  }

  /**
   * Subscribe to stats updates
   */
  onStats(listener: StatsListener): () => void {
    this.statsListeners.push(listener)
    return () => {
      const idx = this.statsListeners.indexOf(listener)
      if (idx >= 0) this.statsListeners.splice(idx, 1)
    }
  }

  /**
   * Update limits
   */
  setLimits(limits: Partial<TokenLimits>): void {
    this.limits = { ...this.limits, ...limits }
  }

  /**
   * Get current limits
   */
  getLimits(): TokenLimits {
    return { ...this.limits }
  }

  /**
   * Format cost as USD string
   */
  formatCost(cost: number): string {
    if (cost < 0.01) {
      return `$${(cost * 100).toFixed(2)}¢`
    }
    return `$${cost.toFixed(2)}`
  }

  /**
   * Format tokens with K/M suffix
   */
  formatTokens(tokens: number): string {
    if (tokens >= 1_000_000) {
      return `${(tokens / 1_000_000).toFixed(1)}M`
    }
    if (tokens >= 1_000) {
      return `${(tokens / 1_000).toFixed(1)}K`
    }
    return tokens.toString()
  }

  /**
   * Get usage percentage against limit
   */
  getUsagePercent(sessionId: string): number {
    const stats = this.stats.get(sessionId)
    if (!stats) return 0
    return Math.min(100, (stats.cumulative / this.limits.sessionCritical) * 100)
  }

  /**
   * Remove session tracking
   */
  removeSession(sessionId: string): void {
    this.stats.delete(sessionId)
    this.saveToStorage()
  }

  /**
   * Clear all tracking data
   */
  clear(): void {
    this.stats.clear()
    this.alerts = []
    this.dailyUsage = { date: this.getTodayKey(), total: 0 }
    this.saveToStorage()
  }

  /**
   * Cleanup
   */
  dispose(): void {
    if (this.historyTimer) {
      clearInterval(this.historyTimer)
      this.historyTimer = null
    }
    this.alertListeners = []
    this.statsListeners = []
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private createStats(sessionId: string, model: ModelId): SessionTokenStats {
    return {
      sessionId,
      model,
      current: 0,
      cumulative: 0,
      estimatedCost: 0,
      history: [],
      startTime: Date.now(),
      lastUpdate: Date.now(),
      peakCurrent: 0,
    }
  }

  private calculateCost(tokens: number, model: ModelId): number {
    const pricing = MODEL_PRICING[model] || MODEL_PRICING.default
    // Assume ~60% input, 40% output (rough Claude Code estimate)
    const inputTokens = tokens * 0.6
    const outputTokens = tokens * 0.4
    return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000
  }

  private checkAlerts(stats: SessionTokenStats): void {
    const now = Date.now()

    // Check session cumulative limits
    if (stats.cumulative >= this.limits.sessionCritical) {
      this.addAlert({
        type: 'critical',
        sessionId: stats.sessionId,
        message: `Session "${stats.sessionName || stats.sessionId.slice(0, 8)}" has exceeded critical token limit`,
        currentValue: stats.cumulative,
        limit: this.limits.sessionCritical,
        timestamp: now,
      })
    } else if (stats.cumulative >= this.limits.sessionWarning) {
      this.addAlert({
        type: 'warning',
        sessionId: stats.sessionId,
        message: `Session "${stats.sessionName || stats.sessionId.slice(0, 8)}" is approaching token limit`,
        currentValue: stats.cumulative,
        limit: this.limits.sessionWarning,
        timestamp: now,
      })
    }

    // Check single turn warning
    if (stats.current >= this.limits.turnWarning) {
      this.addAlert({
        type: 'warning',
        sessionId: stats.sessionId,
        message: `Large token usage in single turn: ${this.formatTokens(stats.current)}`,
        currentValue: stats.current,
        limit: this.limits.turnWarning,
        timestamp: now,
      })
    }

    // Check daily limit
    if (this.dailyUsage.total >= this.limits.globalDaily) {
      this.addAlert({
        type: 'critical',
        sessionId: 'global',
        message: `Daily token limit exceeded: ${this.formatTokens(this.dailyUsage.total)}`,
        currentValue: this.dailyUsage.total,
        limit: this.limits.globalDaily,
        timestamp: now,
      })
    }
  }

  private addAlert(alert: TokenAlert): void {
    // Avoid duplicate alerts within 5 minutes
    const recent = this.alerts.filter(
      (a) =>
        a.sessionId === alert.sessionId &&
        a.type === alert.type &&
        now() - a.timestamp < 5 * 60 * 1000
    )
    if (recent.length > 0) return

    this.alerts.push(alert)
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100)
    }

    // Notify listeners
    for (const listener of this.alertListeners) {
      try {
        listener(alert)
      } catch (e) {
        console.error('Token alert listener error:', e)
      }
    }
  }

  private updateDailyUsage(delta: number): void {
    const today = this.getTodayKey()
    if (this.dailyUsage.date !== today) {
      // New day, reset
      this.dailyUsage = { date: today, total: delta }
    } else {
      this.dailyUsage.total += delta
    }
  }

  private getTodayKey(): string {
    return new Date().toISOString().split('T')[0]
  }

  private startHistoryRecording(): void {
    this.historyTimer = setInterval(() => {
      const now = Date.now()
      for (const stats of this.stats.values()) {
        // Only record if there's been activity
        if (stats.cumulative > 0) {
          stats.history.push({
            timestamp: now,
            current: stats.current,
            cumulative: stats.cumulative,
            model: stats.model,
          })

          // Trim history if too long
          if (stats.history.length > MAX_HISTORY_POINTS) {
            stats.history = stats.history.slice(-MAX_HISTORY_POINTS)
          }
        }
      }
      this.saveToStorage()
    }, HISTORY_INTERVAL_MS)
  }

  private notifyStatsListeners(stats: SessionTokenStats): void {
    for (const listener of this.statsListeners) {
      try {
        listener(stats)
      } catch (e) {
        console.error('Token stats listener error:', e)
      }
    }
  }

  private saveToStorage(): void {
    try {
      const data = {
        stats: Array.from(this.stats.entries()),
        dailyUsage: this.dailyUsage,
        limits: this.limits,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (e) {
      console.error('Failed to save token history:', e)
    }
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return

      const data = JSON.parse(raw)

      // Restore stats
      if (data.stats) {
        for (const [id, stats] of data.stats) {
          // Convert history array back and add toolCounts Map
          this.stats.set(id, {
            ...stats,
            history: stats.history || [],
          })
        }
      }

      // Restore daily usage (only if same day)
      if (data.dailyUsage && data.dailyUsage.date === this.getTodayKey()) {
        this.dailyUsage = data.dailyUsage
      }

      // Restore limits
      if (data.limits) {
        this.limits = { ...this.limits, ...data.limits }
      }
    } catch (e) {
      console.error('Failed to load token history:', e)
    }
  }
}

// Helper function to avoid Date.now() in comparison
function now(): number {
  return Date.now()
}

// Singleton instance
export const tokenTrackingSystem = new TokenTrackingSystem()
