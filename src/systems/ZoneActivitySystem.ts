/**
 * Zone Activity System - Tracks activity metrics per zone/session
 *
 * Provides:
 * - Tool usage counts per session
 * - Activity scoring for dynamic zone prominence
 * - Decay over time for fair comparisons
 * - Events for UI updates
 */

export interface ZoneActivityMetrics {
  sessionId: string
  toolCounts: Map<string, number>
  totalTools: number
  recentActivity: number // Activity in last N seconds (decays)
  lastActivityTime: number
  activityScore: number // Normalized 0-1 score relative to other zones
}

interface ActivityEvent {
  sessionId: string
  tool: string
  timestamp: number
}

type ActivityListener = (sessionId: string, metrics: ZoneActivityMetrics) => void

class ZoneActivitySystem {
  private metrics = new Map<string, ZoneActivityMetrics>()
  private recentEvents: ActivityEvent[] = []
  private listeners: ActivityListener[] = []

  // Configuration
  private readonly RECENT_WINDOW_MS = 60_000 // 60 second window for "recent" activity
  private readonly DECAY_INTERVAL_MS = 5_000 // Decay check every 5 seconds
  private readonly MAX_RECENT_EVENTS = 1000 // Cap stored events

  private decayTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.startDecayTimer()
  }

  /**
   * Track a tool use for a session
   */
  trackToolUse(sessionId: string, tool: string): void {
    const now = Date.now()

    // Get or create metrics for this session
    let m = this.metrics.get(sessionId)
    if (!m) {
      m = this.createMetrics(sessionId)
      this.metrics.set(sessionId, m)
    }

    // Update tool counts
    const currentCount = m.toolCounts.get(tool) ?? 0
    m.toolCounts.set(tool, currentCount + 1)
    m.totalTools++
    m.lastActivityTime = now

    // Add to recent events
    this.recentEvents.push({ sessionId, tool, timestamp: now })
    if (this.recentEvents.length > this.MAX_RECENT_EVENTS) {
      this.recentEvents.shift()
    }

    // Recalculate recent activity and scores
    this.recalculateScores()

    // Notify listeners
    this.notifyListeners(sessionId, m)
  }

  /**
   * Get metrics for a session
   */
  getMetrics(sessionId: string): ZoneActivityMetrics | undefined {
    return this.metrics.get(sessionId)
  }

  /**
   * Get all sessions sorted by activity score (most active first)
   */
  getByActivity(): ZoneActivityMetrics[] {
    return Array.from(this.metrics.values()).sort((a, b) => b.activityScore - a.activityScore)
  }

  /**
   * Get the most active session
   */
  getMostActive(): ZoneActivityMetrics | undefined {
    let best: ZoneActivityMetrics | undefined
    let bestScore = -1

    for (const m of this.metrics.values()) {
      if (m.activityScore > bestScore) {
        bestScore = m.activityScore
        best = m
      }
    }

    return best
  }

  /**
   * Register a session (call when zone is created)
   */
  registerSession(sessionId: string): void {
    if (!this.metrics.has(sessionId)) {
      this.metrics.set(sessionId, this.createMetrics(sessionId))
    }
  }

  /**
   * Unregister a session (call when zone is removed)
   */
  unregisterSession(sessionId: string): void {
    this.metrics.delete(sessionId)
    // Remove events for this session
    this.recentEvents = this.recentEvents.filter((e) => e.sessionId !== sessionId)
    this.recalculateScores()
  }

  /**
   * Subscribe to activity updates
   */
  onActivity(listener: ActivityListener): () => void {
    this.listeners.push(listener)
    return () => {
      const idx = this.listeners.indexOf(listener)
      if (idx >= 0) this.listeners.splice(idx, 1)
    }
  }

  /**
   * Get activity level as a string for UI
   */
  getActivityLevel(sessionId: string): 'high' | 'medium' | 'low' | 'idle' {
    const m = this.metrics.get(sessionId)
    if (!m) return 'idle'

    if (m.activityScore >= 0.7) return 'high'
    if (m.activityScore >= 0.3) return 'medium'
    if (m.activityScore > 0) return 'low'
    return 'idle'
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.metrics.clear()
    this.recentEvents = []
  }

  /**
   * Cleanup
   */
  dispose(): void {
    if (this.decayTimer) {
      clearInterval(this.decayTimer)
      this.decayTimer = null
    }
    this.listeners = []
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private createMetrics(sessionId: string): ZoneActivityMetrics {
    return {
      sessionId,
      toolCounts: new Map(),
      totalTools: 0,
      recentActivity: 0,
      lastActivityTime: 0,
      activityScore: 0,
    }
  }

  private recalculateScores(): void {
    const now = Date.now()
    const cutoff = now - this.RECENT_WINDOW_MS

    // Prune old events
    this.recentEvents = this.recentEvents.filter((e) => e.timestamp > cutoff)

    // Count recent activity per session
    const recentCounts = new Map<string, number>()
    for (const event of this.recentEvents) {
      const count = recentCounts.get(event.sessionId) ?? 0
      // Weight more recent events higher
      const age = (now - event.timestamp) / this.RECENT_WINDOW_MS
      const weight = 1 - age * 0.5 // 1.0 for new, 0.5 for oldest
      recentCounts.set(event.sessionId, count + weight)
    }

    // Update metrics
    for (const [sessionId, m] of this.metrics) {
      m.recentActivity = recentCounts.get(sessionId) ?? 0
    }

    // Normalize to 0-1 scores
    let maxRecent = 0
    for (const m of this.metrics.values()) {
      if (m.recentActivity > maxRecent) maxRecent = m.recentActivity
    }

    if (maxRecent > 0) {
      for (const m of this.metrics.values()) {
        m.activityScore = m.recentActivity / maxRecent
      }
    } else {
      // No recent activity, all scores are 0
      for (const m of this.metrics.values()) {
        m.activityScore = 0
      }
    }
  }

  private startDecayTimer(): void {
    this.decayTimer = setInterval(() => {
      this.recalculateScores()
      // Notify all listeners of potential score changes
      for (const m of this.metrics.values()) {
        this.notifyListeners(m.sessionId, m)
      }
    }, this.DECAY_INTERVAL_MS)
  }

  private notifyListeners(sessionId: string, metrics: ZoneActivityMetrics): void {
    for (const listener of this.listeners) {
      try {
        listener(sessionId, metrics)
      } catch (e) {
        console.error('ZoneActivitySystem listener error:', e)
      }
    }
  }
}

// Singleton instance
export const zoneActivitySystem = new ZoneActivitySystem()
