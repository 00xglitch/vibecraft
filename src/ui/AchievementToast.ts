/**
 * Achievement Toast - Celebratory notifications
 *
 * Special toast for achievements like git commits.
 * Larger, more prominent, with celebration styling.
 */

export interface CommitAchievementOptions {
  /** Commit number (e.g., 47) */
  commitNumber: number
  /** Commit message (optional, will be truncated if too long) */
  message?: string
  /** Project name (optional) */
  projectName?: string
  /** Duration in milliseconds (default: 4000) */
  duration?: number
}

const DEFAULT_DURATION = 4000
const FADE_OUT_DURATION = 300
const MAX_MESSAGE_LENGTH = 50

let achievementContainer: HTMLElement | null = null

/**
 * Get or create the achievement toast container
 * Positioned differently from regular toasts - more prominent
 */
function getAchievementContainer(): HTMLElement {
  if (!achievementContainer) {
    achievementContainer = document.getElementById('achievement-container')
    if (!achievementContainer) {
      achievementContainer = document.createElement('div')
      achievementContainer.id = 'achievement-container'
      document.body.appendChild(achievementContainer)
    }
  }
  return achievementContainer
}

/**
 * Truncate message if too long
 */
function truncateMessage(message: string, maxLength: number = MAX_MESSAGE_LENGTH): string {
  if (message.length <= maxLength) return message
  return message.slice(0, maxLength - 3) + '...'
}

/**
 * Show a commit achievement toast
 */
export function showCommitAchievement(options: CommitAchievementOptions): HTMLElement {
  const {
    commitNumber,
    message,
    projectName,
    duration = DEFAULT_DURATION,
  } = options

  const toast = document.createElement('div')
  toast.className = 'achievement-toast achievement-commit'

  // Build toast content
  let content = `
    <div class="achievement-icon">🎉</div>
    <div class="achievement-content">
      <div class="achievement-title">Commit #${commitNumber}</div>
  `

  if (message) {
    const truncatedMessage = truncateMessage(message)
    content += `<div class="achievement-message">${escapeHtml(truncatedMessage)}</div>`
  }

  if (projectName) {
    content += `<div class="achievement-project">${escapeHtml(projectName)}</div>`
  }

  content += `</div>`

  // Add confetti decorations
  content += `
    <div class="achievement-confetti">
      <span class="confetti-piece" style="--delay: 0s; --x: -20px;">🎊</span>
      <span class="confetti-piece" style="--delay: 0.1s; --x: 10px;">✨</span>
      <span class="confetti-piece" style="--delay: 0.2s; --x: 25px;">🎊</span>
    </div>
  `

  toast.innerHTML = content

  // Add to container
  const container = getAchievementContainer()
  container.appendChild(toast)

  // Trigger entrance animation
  requestAnimationFrame(() => {
    toast.classList.add('achievement-in')
  })

  // Auto-remove after duration
  setTimeout(() => {
    removeAchievement(toast)
  }, duration)

  return toast
}

/**
 * Remove an achievement toast with animation
 */
function removeAchievement(toast: HTMLElement): void {
  if (!toast.parentElement) return

  toast.classList.remove('achievement-in')
  toast.classList.add('achievement-out')

  setTimeout(() => {
    toast.remove()
  }, FADE_OUT_DURATION)
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// Export type for tracking commits
export interface CommitTracker {
  /** Increment and get the new commit count */
  increment(sessionId: string): number
  /** Get current count for a session */
  getCount(sessionId: string): number
  /** Reset count for a session */
  reset(sessionId: string): void
}

// Simple commit counter per session
const commitCounts = new Map<string, number>()

export const commitTracker: CommitTracker = {
  increment(sessionId: string): number {
    const current = commitCounts.get(sessionId) || 0
    const newCount = current + 1
    commitCounts.set(sessionId, newCount)
    return newCount
  },

  getCount(sessionId: string): number {
    return commitCounts.get(sessionId) || 0
  },

  reset(sessionId: string): void {
    commitCounts.delete(sessionId)
  },
}
