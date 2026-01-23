/**
 * Achievement System - Track user accomplishments in Vibecraft
 *
 * Achievements are earned by completing various tasks like:
 * - Using different tools
 * - Creating sessions
 * - Completing tasks
 * - Special events (git commits, etc.)
 */

export interface Achievement {
  id: string
  name: string
  description: string
  icon: string
  category: 'tools' | 'sessions' | 'milestones' | 'special'
  requirement: number // How many times/count needed
  points: number // Points earned
  secret?: boolean // Hidden until earned
}

export interface UserProgress {
  achievements: Record<string, { unlockedAt: number; progress: number }>
  stats: {
    totalToolUses: number
    totalSessions: number
    totalCommits: number
    totalTokens: number
    toolCounts: Record<string, number>
  }
  totalPoints: number
}

// Achievement definitions
export const ACHIEVEMENTS: Achievement[] = [
  // Tools category
  {
    id: 'first_read',
    name: 'Bookworm',
    description: 'Use the Read tool for the first time',
    icon: '📚',
    category: 'tools',
    requirement: 1,
    points: 10,
  },
  {
    id: 'read_master',
    name: 'Speed Reader',
    description: 'Use the Read tool 100 times',
    icon: '📖',
    category: 'tools',
    requirement: 100,
    points: 50,
  },
  {
    id: 'first_edit',
    name: 'Editor',
    description: 'Use the Edit tool for the first time',
    icon: '✏️',
    category: 'tools',
    requirement: 1,
    points: 10,
  },
  {
    id: 'edit_master',
    name: 'Master Editor',
    description: 'Use the Edit tool 100 times',
    icon: '🔧',
    category: 'tools',
    requirement: 100,
    points: 50,
  },
  {
    id: 'first_bash',
    name: 'Terminal Rookie',
    description: 'Use the Bash tool for the first time',
    icon: '💻',
    category: 'tools',
    requirement: 1,
    points: 10,
  },
  {
    id: 'bash_master',
    name: 'Shell Master',
    description: 'Use the Bash tool 100 times',
    icon: '🖥️',
    category: 'tools',
    requirement: 100,
    points: 50,
  },
  {
    id: 'first_search',
    name: 'Detective',
    description: 'Use Grep or Glob for the first time',
    icon: '🔍',
    category: 'tools',
    requirement: 1,
    points: 10,
  },
  {
    id: 'web_explorer',
    name: 'Web Explorer',
    description: 'Use WebFetch or WebSearch for the first time',
    icon: '🌐',
    category: 'tools',
    requirement: 1,
    points: 10,
  },
  {
    id: 'subagent_spawner',
    name: 'Multitasker',
    description: 'Spawn 10 subagents',
    icon: '👥',
    category: 'tools',
    requirement: 10,
    points: 30,
  },
  {
    id: 'tool_variety',
    name: 'Jack of All Trades',
    description: 'Use 5 different tool types',
    icon: '🛠️',
    category: 'tools',
    requirement: 5,
    points: 25,
  },

  // Sessions category
  {
    id: 'first_session',
    name: 'Getting Started',
    description: 'Create your first session',
    icon: '🚀',
    category: 'sessions',
    requirement: 1,
    points: 10,
  },
  {
    id: 'session_veteran',
    name: 'Session Veteran',
    description: 'Create 10 sessions',
    icon: '⭐',
    category: 'sessions',
    requirement: 10,
    points: 30,
  },
  {
    id: 'multi_zone',
    name: 'Zone Master',
    description: 'Have 3 active zones at once',
    icon: '🏰',
    category: 'sessions',
    requirement: 3,
    points: 25,
  },

  // Milestones category
  {
    id: 'token_thousand',
    name: 'Thousand Words',
    description: 'Use 1,000 tokens',
    icon: '📊',
    category: 'milestones',
    requirement: 1000,
    points: 15,
  },
  {
    id: 'token_ten_k',
    name: 'Heavy User',
    description: 'Use 10,000 tokens',
    icon: '📈',
    category: 'milestones',
    requirement: 10000,
    points: 30,
  },
  {
    id: 'token_hundred_k',
    name: 'Power User',
    description: 'Use 100,000 tokens',
    icon: '🏆',
    category: 'milestones',
    requirement: 100000,
    points: 100,
  },
  {
    id: 'tool_century',
    name: 'Tool Century',
    description: 'Use tools 100 times total',
    icon: '💯',
    category: 'milestones',
    requirement: 100,
    points: 25,
  },
  {
    id: 'tool_thousand',
    name: 'Tool Millennium',
    description: 'Use tools 1,000 times total',
    icon: '🌟',
    category: 'milestones',
    requirement: 1000,
    points: 75,
  },

  // Special category
  {
    id: 'first_commit',
    name: 'First Commit',
    description: 'Make your first git commit',
    icon: '✅',
    category: 'special',
    requirement: 1,
    points: 20,
  },
  {
    id: 'commit_streak',
    name: 'Commit Streak',
    description: 'Make 10 git commits',
    icon: '🔥',
    category: 'special',
    requirement: 10,
    points: 40,
  },
  {
    id: 'night_owl',
    name: 'Night Owl',
    description: 'Use Vibecraft after midnight',
    icon: '🦉',
    category: 'special',
    requirement: 1,
    points: 15,
    secret: true,
  },
  {
    id: 'early_bird',
    name: 'Early Bird',
    description: 'Use Vibecraft before 6 AM',
    icon: '🐦',
    category: 'special',
    requirement: 1,
    points: 15,
    secret: true,
  },
  {
    id: 'wizard_mode',
    name: 'Wizard Mode',
    description: 'Use the Wizard character',
    icon: '🧙',
    category: 'special',
    requirement: 1,
    points: 10,
    secret: true,
  },
  {
    id: 'samurai_mode',
    name: 'Way of the Samurai',
    description: 'Use the Afro Samurai character',
    icon: '⚔️',
    category: 'special',
    requirement: 1,
    points: 10,
    secret: true,
  },
]

const STORAGE_KEY = 'vibecraft_achievements'

export class AchievementSystem {
  private progress: UserProgress
  private listeners: Set<(achievement: Achievement) => void> = new Set()

  constructor() {
    this.progress = this.loadProgress()
  }

  private loadProgress(): UserProgress {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (e) {
      console.error('Failed to load achievements:', e)
    }

    return {
      achievements: {},
      stats: {
        totalToolUses: 0,
        totalSessions: 0,
        totalCommits: 0,
        totalTokens: 0,
        toolCounts: {},
      },
      totalPoints: 0,
    }
  }

  private saveProgress(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.progress))
    } catch (e) {
      console.error('Failed to save achievements:', e)
    }
  }

  /**
   * Track a tool use event
   */
  trackToolUse(toolName: string): void {
    this.progress.stats.totalToolUses++
    this.progress.stats.toolCounts[toolName] = (this.progress.stats.toolCounts[toolName] || 0) + 1

    // Check tool-specific achievements
    const toolLower = toolName.toLowerCase()

    if (toolLower === 'read') {
      this.checkAndUnlock('first_read', 1)
      this.checkAndUnlock('read_master', this.progress.stats.toolCounts[toolName])
    } else if (toolLower === 'edit') {
      this.checkAndUnlock('first_edit', 1)
      this.checkAndUnlock('edit_master', this.progress.stats.toolCounts[toolName])
    } else if (toolLower === 'bash') {
      this.checkAndUnlock('first_bash', 1)
      this.checkAndUnlock('bash_master', this.progress.stats.toolCounts[toolName])
    } else if (toolLower === 'grep' || toolLower === 'glob') {
      this.checkAndUnlock('first_search', 1)
    } else if (toolLower === 'webfetch' || toolLower === 'websearch') {
      this.checkAndUnlock('web_explorer', 1)
    } else if (toolLower === 'task') {
      const taskCount = this.progress.stats.toolCounts['Task'] || 0
      this.checkAndUnlock('subagent_spawner', taskCount)
    }

    // Check variety achievement
    const uniqueTools = Object.keys(this.progress.stats.toolCounts).length
    this.checkAndUnlock('tool_variety', uniqueTools)

    // Check total tool achievements
    this.checkAndUnlock('tool_century', this.progress.stats.totalToolUses)
    this.checkAndUnlock('tool_thousand', this.progress.stats.totalToolUses)

    this.saveProgress()
  }

  /**
   * Track session creation
   */
  trackSessionCreated(): void {
    this.progress.stats.totalSessions++
    this.checkAndUnlock('first_session', 1)
    this.checkAndUnlock('session_veteran', this.progress.stats.totalSessions)
    this.saveProgress()
  }

  /**
   * Track active zones count
   */
  trackActiveZones(count: number): void {
    this.checkAndUnlock('multi_zone', count)
    this.saveProgress()
  }

  /**
   * Track git commit
   */
  trackGitCommit(): void {
    this.progress.stats.totalCommits++
    this.checkAndUnlock('first_commit', 1)
    this.checkAndUnlock('commit_streak', this.progress.stats.totalCommits)
    this.saveProgress()
  }

  /**
   * Track token usage
   */
  trackTokens(count: number): void {
    this.progress.stats.totalTokens += count
    this.checkAndUnlock('token_thousand', this.progress.stats.totalTokens)
    this.checkAndUnlock('token_ten_k', this.progress.stats.totalTokens)
    this.checkAndUnlock('token_hundred_k', this.progress.stats.totalTokens)
    this.saveProgress()
  }

  /**
   * Track character selection
   */
  trackCharacterSelected(character: string): void {
    if (character === 'wizard') {
      this.checkAndUnlock('wizard_mode', 1)
    } else if (character === 'afrosamurai') {
      this.checkAndUnlock('samurai_mode', 1)
    }
    this.saveProgress()
  }

  /**
   * Check time-based achievements
   */
  checkTimeAchievements(): void {
    const hour = new Date().getHours()
    if (hour >= 0 && hour < 5) {
      this.checkAndUnlock('night_owl', 1)
    }
    if (hour >= 5 && hour < 6) {
      this.checkAndUnlock('early_bird', 1)
    }
    this.saveProgress()
  }

  private checkAndUnlock(achievementId: string, currentValue: number): boolean {
    // Already unlocked
    if (this.progress.achievements[achievementId]?.unlockedAt) {
      return false
    }

    const achievement = ACHIEVEMENTS.find((a) => a.id === achievementId)
    if (!achievement) return false

    // Update progress
    if (!this.progress.achievements[achievementId]) {
      this.progress.achievements[achievementId] = { unlockedAt: 0, progress: 0 }
    }
    this.progress.achievements[achievementId].progress = currentValue

    // Check if requirement met
    if (currentValue >= achievement.requirement) {
      this.progress.achievements[achievementId].unlockedAt = Date.now()
      this.progress.totalPoints += achievement.points

      // Notify listeners
      this.listeners.forEach((listener) => listener(achievement))

      console.log(`Achievement unlocked: ${achievement.name}!`)
      return true
    }

    return false
  }

  /**
   * Get all achievements with unlock status
   */
  getAllAchievements(): Array<Achievement & { unlocked: boolean; progress: number }> {
    return ACHIEVEMENTS.map((achievement) => {
      const progressData = this.progress.achievements[achievement.id]
      return {
        ...achievement,
        unlocked: !!progressData?.unlockedAt,
        progress: progressData?.progress || 0,
      }
    })
  }

  /**
   * Get only unlocked achievements
   */
  getUnlockedAchievements(): Achievement[] {
    return ACHIEVEMENTS.filter((a) => this.progress.achievements[a.id]?.unlockedAt)
  }

  /**
   * Get total points
   */
  getTotalPoints(): number {
    return this.progress.totalPoints
  }

  /**
   * Get stats
   */
  getStats(): UserProgress['stats'] {
    return { ...this.progress.stats }
  }

  /**
   * Subscribe to achievement unlocks
   */
  onUnlock(callback: (achievement: Achievement) => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  /**
   * Get progress as percentage for an achievement
   */
  getProgressPercent(achievementId: string): number {
    const achievement = ACHIEVEMENTS.find((a) => a.id === achievementId)
    if (!achievement) return 0

    const progress = this.progress.achievements[achievementId]?.progress || 0
    return Math.min(100, (progress / achievement.requirement) * 100)
  }
}

// Singleton instance
export const achievementSystem = new AchievementSystem()
