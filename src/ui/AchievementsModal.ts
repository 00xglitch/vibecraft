/**
 * Achievements Modal - Trophy Board Display
 *
 * A visual "unlockables board" with grid layout, rarity tiers, and glow effects.
 * Note: innerHTML usage is safe here as all content is from hardcoded achievement
 * definitions, not user input.
 */

import {
  achievementSystem,
  type Achievement,
  ACHIEVEMENTS,
  RARITY_CONFIG,
  type AchievementRarity,
} from '../systems/AchievementSystem'
import { soundManager } from '../audio/SoundManager'

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
      <div class="modal-header achievements-header">
        <div class="achievements-title-row">
          <span class="achievements-trophy">🏆</span>
          <h3>Trophy Board</h3>
        </div>
        <button type="button" class="achievements-close-btn" id="achievements-close">&times;</button>
      </div>

      <div class="achievements-tabs">
        <button class="achievements-tab active" data-tab="all">All</button>
        <button class="achievements-tab" data-tab="tools">🛠️ Tools</button>
        <button class="achievements-tab" data-tab="sessions">📍 Sessions</button>
        <button class="achievements-tab" data-tab="milestones">📊 Milestones</button>
        <button class="achievements-tab" data-tab="special">✨ Special</button>
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

      <div class="achievements-rarity-legend">
        <span class="rarity-badge rarity-common">Common</span>
        <span class="rarity-badge rarity-rare">Rare</span>
        <span class="rarity-badge rarity-epic">Epic</span>
        <span class="rarity-badge rarity-legendary">Legendary</span>
      </div>

      <div class="achievements-board" id="achievements-board">
        <!-- Achievements will be populated here in a grid -->
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
      renderAchievementsBoard(tab.getAttribute('data-tab') || 'all')
    })
  })

  return div
}

/**
 * Get rarity class name
 */
function getRarityClass(rarity: AchievementRarity): string {
  return `rarity-${rarity}`
}

/**
 * Render the achievements in a grid board layout
 * Note: All content is from hardcoded ACHIEVEMENTS array, safe for innerHTML
 */
function renderAchievementsBoard(filter: string = 'all'): void {
  const boardEl = document.getElementById('achievements-board')
  if (!boardEl) return

  const achievements = achievementSystem.getAllAchievements()
  const filtered =
    filter === 'all' ? achievements : achievements.filter((a) => a.category === filter)

  // Sort by rarity (legendary first), then by unlocked status, then by points
  const rarityOrder: Record<AchievementRarity, number> = {
    legendary: 0,
    epic: 1,
    rare: 2,
    common: 3,
  }

  filtered.sort((a, b) => {
    // Unlocked always first
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1
    // Then by rarity
    if (rarityOrder[a.rarity] !== rarityOrder[b.rarity]) {
      return rarityOrder[a.rarity] - rarityOrder[b.rarity]
    }
    // Then by points
    return b.points - a.points
  })

  boardEl.innerHTML = filtered
    .map((achievement) => {
      const isSecret = achievement.secret && !achievement.unlocked
      const progressPercent = achievementSystem.getProgressPercent(achievement.id)
      const rarityClass = getRarityClass(achievement.rarity)
      const rarityConfig = RARITY_CONFIG[achievement.rarity]

      const glowStyle = achievement.unlocked
        ? `box-shadow: 0 0 20px ${rarityConfig.glow}, inset 0 0 15px ${rarityConfig.glow};`
        : ''

      return `
      <div class="achievement-card ${achievement.unlocked ? 'unlocked' : 'locked'} ${isSecret ? 'secret' : ''} ${rarityClass}"
           style="${glowStyle}"
           title="${isSecret ? 'Secret Achievement' : achievement.description}">
        <div class="achievement-card-rarity" style="background: ${rarityConfig.color};">
          ${rarityConfig.label}
        </div>
        <div class="achievement-card-icon">${isSecret ? '❓' : achievement.icon}</div>
        <div class="achievement-card-name">${isSecret ? '???' : achievement.name}</div>
        ${
          !achievement.unlocked && !isSecret
            ? `
          <div class="achievement-card-progress">
            <div class="achievement-card-progress-bar" style="width: ${progressPercent}%; background: ${rarityConfig.color};"></div>
          </div>
          <div class="achievement-card-progress-text">${Math.round(progressPercent)}%</div>
        `
            : ''
        }
        ${
          achievement.unlocked
            ? `<div class="achievement-card-points" style="color: ${rarityConfig.color};">+${achievement.points}</div>`
            : `<div class="achievement-card-points-locked">${achievement.points} pts</div>`
        }
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
  renderAchievementsBoard('all')

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
 * Show achievement toast notification with sound
 * Note: All content is from hardcoded ACHIEVEMENTS array, safe for innerHTML
 */
export function showAchievementToast(achievement: Achievement): void {
  if (!toastContainer) {
    toastContainer = document.createElement('div')
    toastContainer.id = 'achievement-toast-container'
    document.body.appendChild(toastContainer)
  }

  // Play achievement sound
  try {
    soundManager.play('stop') // Celebratory sound
  } catch {
    // Sound not initialized, skip
  }

  const rarityConfig = RARITY_CONFIG[achievement.rarity]

  const toast = document.createElement('div')
  toast.className = `achievement-toast rarity-${achievement.rarity}`
  toast.style.borderColor = rarityConfig.color
  toast.style.boxShadow = `0 10px 40px rgba(0, 0, 0, 0.4), 0 0 30px ${rarityConfig.glow}`

  toast.innerHTML = `
    <div class="achievement-toast-icon">${achievement.icon}</div>
    <div class="achievement-toast-content">
      <div class="achievement-toast-title" style="color: ${rarityConfig.color};">
        ${rarityConfig.label} Achievement!
      </div>
      <div class="achievement-toast-name">${achievement.name}</div>
      <div class="achievement-toast-points">+${achievement.points} points</div>
    </div>
  `

  toastContainer.appendChild(toast)

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('visible')
  })

  // Remove after delay (longer for rarer achievements)
  const duration =
    achievement.rarity === 'legendary' ? 6000 : achievement.rarity === 'epic' ? 5000 : 4000

  setTimeout(() => {
    toast.classList.remove('visible')
    setTimeout(() => toast.remove(), 300)
  }, duration)
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
