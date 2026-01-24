/**
 * StreakSystem - Daily visit tracking with dual storage
 *
 * Features:
 * - Track consecutive daily visits
 * - Calculate current/longest streaks
 * - Sync between localStorage (offline) and server file (persistent)
 * - Emit events for streak milestones
 * - Calculate point multipliers for achievements
 */

export interface StreakData {
  firstVisit: number
  lastVisit: number
  currentStreak: number
  longestStreak: number
  totalVisits: number
  visitHistory: number[] // Last 90 days of visit timestamps
  lastSyncedAt: number
}

export interface StreakMilestone {
  type: 'streak'
  value: number
  message: string
  multiplier: number
}

class StreakSystem {
  private data: StreakData
  private listeners: Array<(milestone: StreakMilestone) => void> = []

  constructor() {
    this.data = this.getEmptyData()
  }

  async initialize(): Promise<void> {
    // Load from localStorage
    const localData = this.loadFromLocalStorage()

    // Fetch from server
    const serverData = await this.fetchFromServer()

    // Reconcile (server wins on conflicts)
    this.data = await this.reconcile(localData, serverData)

    // Record today's visit
    const milestone = await this.recordVisit()
    if (milestone) {
      this.emitMilestone(milestone)
    }
  }

  async recordVisit(): Promise<StreakMilestone | null> {
    const now = Date.now()
    const today = this.getDayKey(now)
    const lastDay = this.getDayKey(this.data.lastVisit)

    if (today === lastDay) {
      // Already visited today
      return null
    }

    const yesterday = this.getDayKey(now - 24 * 60 * 60 * 1000)

    if (lastDay === yesterday) {
      // Consecutive day - increment streak
      this.data.currentStreak++
    } else if (this.data.lastVisit > 0) {
      // Gap - reset streak
      this.data.currentStreak = 1
    } else {
      // First visit ever
      this.data.firstVisit = now
      this.data.currentStreak = 1
    }

    // Update longest streak
    if (this.data.currentStreak > this.data.longestStreak) {
      this.data.longestStreak = this.data.currentStreak
    }

    this.data.lastVisit = now
    this.data.totalVisits++
    this.data.visitHistory.push(now)

    // Keep only last 90 days
    this.data.visitHistory = this.data.visitHistory
      .filter((t) => now - t < 90 * 24 * 60 * 60 * 1000)
      .sort((a, b) => b - a)

    // Save to both storage
    await this.save()

    // Check for milestone
    return this.checkMilestone()
  }

  getActiveMultiplier(): number {
    const streak = this.data.currentStreak
    if (streak >= 100) return 3.0
    if (streak >= 30) return 2.5
    if (streak >= 14) return 2.0
    if (streak >= 7) return 1.5
    if (streak >= 3) return 1.25
    return 1.0
  }

  private async reconcile(local: StreakData, server: StreakData | null): Promise<StreakData> {
    if (!server || server.lastVisit === 0) {
      // Server empty - use local
      if (local.lastVisit > 0) {
        await this.pushToServer(local)
      }
      return local
    }

    if (local.lastVisit > server.lastVisit) {
      // Local is newer (offline usage)
      await this.pushToServer(local)
      return local
    } else {
      // Server is authoritative
      this.saveToLocalStorage(server)
      return server
    }
  }

  private async fetchFromServer(): Promise<StreakData | null> {
    try {
      const response = await fetch('/api/user-stats')
      if (!response.ok) return null
      const data = await response.json()
      return data.streak || null
    } catch (error) {
      console.error('Failed to fetch streak from server:', error)
      return null
    }
  }

  private async pushToServer(data: StreakData): Promise<void> {
    try {
      await fetch('/api/user-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          streak: data,
          preferences: { hasSeenWelcome: !!localStorage.getItem('vibecraft-has-seen-welcome') },
        }),
      })
      this.data.lastSyncedAt = Date.now()
      this.saveToLocalStorage(this.data)
    } catch (err) {
      console.error('Failed to sync streak to server:', err)
    }
  }

  private loadFromLocalStorage(): StreakData {
    try {
      const data = localStorage.getItem('vibecraft-streak-cache')
      if (data) return JSON.parse(data)
    } catch (error) {
      console.error('Failed to load streak from localStorage:', error)
    }

    return this.getEmptyData()
  }

  private saveToLocalStorage(data: StreakData): void {
    localStorage.setItem('vibecraft-streak-cache', JSON.stringify(data))
  }

  private async save(): Promise<void> {
    this.saveToLocalStorage(this.data)
    await this.pushToServer(this.data)
  }

  private getDayKey(timestamp: number): string {
    const date = new Date(timestamp)
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
  }

  private checkMilestone(): StreakMilestone | null {
    const milestones = [3, 7, 14, 30, 100, 365]
    if (milestones.includes(this.data.currentStreak)) {
      return {
        type: 'streak',
        value: this.data.currentStreak,
        message: `🔥 ${this.data.currentStreak} day streak!`,
        multiplier: this.getActiveMultiplier(),
      }
    }
    return null
  }

  onMilestone(callback: (milestone: StreakMilestone) => void): void {
    this.listeners.push(callback)
  }

  private emitMilestone(milestone: StreakMilestone): void {
    this.listeners.forEach((cb) => cb(milestone))
  }

  getCurrentStreak(): number {
    return this.data.currentStreak
  }

  getLongestStreak(): number {
    return this.data.longestStreak
  }

  getStats(): StreakData {
    return { ...this.data }
  }

  private getEmptyData(): StreakData {
    return {
      firstVisit: 0,
      lastVisit: 0,
      currentStreak: 0,
      longestStreak: 0,
      totalVisits: 0,
      visitHistory: [],
      lastSyncedAt: 0,
    }
  }
}

export const streakSystem = new StreakSystem()
