/**
 * Achievements Modal - Display user achievements and leaderboard
 */

import { achievementSystem, type Achievement, ACHIEVEMENTS } from '../systems/AchievementSystem'

let modal: HTMLElement | null = null
let toastContainer: HTMLElement | null = null

/**
 * Create the achievements modal HTML
 */
function createModal(): HTMLElement {
  const div = document.createElement('div')
  div.id = 'achievements-modal'
  div.className = 'modal'
  div.innerHTML = `
    <div class="modal-content achievements-modal-content">
      <div class="modal-header">
        <h3>🏆 Achievements</h3>
        <button type="button" class="achievements-close-btn" id="achievements-close">&times;</button>
      </div>

      <div class="achievements-tabs">
        <button class="achievements-tab active" data-tab="all">All</button>
        <button class="achievements-tab" data-tab="tools">Tools</button>
        <button class="achievements-tab" data-tab="sessions">Sessions</button>
        <button class="achievements-tab" data-tab="milestones">Milestones</button>
        <button class="achievements-tab" data-tab="special">Special</button>
      </div>

      <div class="achievements-stats">
        <div class="achievements-stat">
          <span class="stat-value" id="ach-total-points">0</span>
          <span class="stat-label">Points</span>
        </div>
        <div class="achievements-stat">
          <span class="stat-value" id="ach-unlocked-count">0</span>
          <span class="stat-label">Unlocked</span>
        </div>
        <div class="achievements-stat">
          <span class="stat-value" id="ach-completion">0%</span>
          <span class="stat-label">Complete</span>
        </div>
      </div>

      <div class="achievements-list" id="achievements-list">
        <!-- Achievements will be populated here -->
      </div>
    </div>
  `

  // Close button handler
  div.querySelector('#achievements-close')?.addEventListener('click', hideAchievementsModal)

  // Close on backdrop click
  div.addEventListener('click', (e) => {
    if (e.target === div) {
      hideAchievementsModal()
    }
  })

  // Tab handlers
  div.querySelectorAll('.achievements-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      div.querySelectorAll('.achievements-tab').forEach((t) => t.classList.remove('active'))
      tab.classList.add('active')
      renderAchievementsList(tab.getAttribute('data-tab') || 'all')
    })
  })

  return div
}

/**
 * Render the achievements list
 */
function renderAchievementsList(filter: string = 'all'): void {
  const listEl = document.getElementById('achievements-list')
  if (!listEl) return

  const achievements = achievementSystem.getAllAchievements()
  const filtered =
    filter === 'all' ? achievements : achievements.filter((a) => a.category === filter)

  // Sort: unlocked first, then by points
  filtered.sort((a, b) => {
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1
    return b.points - a.points
  })

  listEl.innerHTML = filtered
    .map((achievement) => {
      const isSecret = achievement.secret && !achievement.unlocked
      const progressPercent = achievementSystem.getProgressPercent(achievement.id)

      return `
      <div class="achievement-item ${achievement.unlocked ? 'unlocked' : 'locked'} ${isSecret ? 'secret' : ''}">
        <div class="achievement-icon">${isSecret ? '❓' : achievement.icon}</div>
        <div class="achievement-info">
          <div class="achievement-name">${isSecret ? 'Secret Achievement' : achievement.name}</div>
          <div class="achievement-desc">${isSecret ? 'Keep exploring to discover this!' : achievement.description}</div>
          ${
            !achievement.unlocked && !isSecret
              ? `
            <div class="achievement-progress">
              <div class="achievement-progress-bar" style="width: ${progressPercent}%"></div>
            </div>
          `
              : ''
          }
        </div>
        <div class="achievement-points">${achievement.unlocked ? `+${achievement.points}` : achievement.points} pts</div>
      </div>
    `
    })
    .join('')
}

/**
 * Update the stats display
 */
function updateStats(): void {
  const achievements = achievementSystem.getAllAchievements()
  const unlocked = achievements.filter((a) => a.unlocked)
  const totalPoints = achievementSystem.getTotalPoints()
  const completion = Math.round(
    (unlocked.length / ACHIEVEMENTS.filter((a) => !a.secret).length) * 100
  )

  const pointsEl = document.getElementById('ach-total-points')
  const unlockedEl = document.getElementById('ach-unlocked-count')
  const completionEl = document.getElementById('ach-completion')

  if (pointsEl) pointsEl.textContent = totalPoints.toLocaleString()
  if (unlockedEl) unlockedEl.textContent = `${unlocked.length}/${ACHIEVEMENTS.length}`
  if (completionEl) completionEl.textContent = `${completion}%`
}

/**
 * Show the achievements modal
 */
export function showAchievementsModal(): void {
  if (!modal) {
    modal = createModal()
    document.body.appendChild(modal)
  }

  updateStats()
  renderAchievementsList('all')

  // Reset to all tab
  modal.querySelectorAll('.achievements-tab').forEach((t) => t.classList.remove('active'))
  modal.querySelector('.achievements-tab[data-tab="all"]')?.classList.add('active')

  modal.classList.add('visible')
}

/**
 * Hide the achievements modal
 */
export function hideAchievementsModal(): void {
  modal?.classList.remove('visible')
}

/**
 * Show achievement toast notification
 */
export function showAchievementToast(achievement: Achievement): void {
  if (!toastContainer) {
    toastContainer = document.createElement('div')
    toastContainer.id = 'achievement-toast-container'
    document.body.appendChild(toastContainer)
  }

  const toast = document.createElement('div')
  toast.className = 'achievement-toast'
  toast.innerHTML = `
    <div class="achievement-toast-icon">${achievement.icon}</div>
    <div class="achievement-toast-content">
      <div class="achievement-toast-title">Achievement Unlocked!</div>
      <div class="achievement-toast-name">${achievement.name}</div>
      <div class="achievement-toast-points">+${achievement.points} points</div>
    </div>
  `

  toastContainer.appendChild(toast)

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('visible')
  })

  // Remove after delay
  setTimeout(() => {
    toast.classList.remove('visible')
    setTimeout(() => toast.remove(), 300)
  }, 4000)
}

/**
 * Initialize achievement notifications
 */
export function initAchievementNotifications(): void {
  achievementSystem.onUnlock((achievement) => {
    showAchievementToast(achievement)
  })

  // Check time-based achievements on load
  achievementSystem.checkTimeAchievements()
}
