/**
 * Token Stats Modal
 *
 * Displays comprehensive token usage statistics:
 * - Overview tab: Global stats and cost breakdown
 * - Sessions tab: Per-session token usage
 * - Alerts tab: Warning and critical alerts
 * - Settings tab: Configure limits
 */

import {
  tokenTrackingSystem,
  type SessionTokenStats,
  type TokenAlert,
  type TokenLimits,
  MODEL_PRICING,
} from '../systems/TokenTrackingSystem'

type TabId = 'overview' | 'sessions' | 'alerts' | 'settings'

let modalElement: HTMLElement | null = null
let activeTab: TabId = 'overview'
let unsubscribeStats: (() => void) | null = null
let unsubscribeAlerts: (() => void) | null = null

export function showTokenStatsModal(): void {
  if (modalElement) {
    closeTokenStatsModal()
    return
  }

  modalElement = createModal()
  document.body.appendChild(modalElement)

  // Subscribe to updates
  unsubscribeStats = tokenTrackingSystem.onStats(() => {
    if (modalElement) updateContent()
  })
  unsubscribeAlerts = tokenTrackingSystem.onAlert(() => {
    if (modalElement) updateContent()
  })

  // Initial render
  updateContent()

  // Close on Escape
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeTokenStatsModal()
      document.removeEventListener('keydown', handleKeydown)
    }
  }
  document.addEventListener('keydown', handleKeydown)
}

export function closeTokenStatsModal(): void {
  if (modalElement) {
    modalElement.remove()
    modalElement = null
  }
  if (unsubscribeStats) {
    unsubscribeStats()
    unsubscribeStats = null
  }
  if (unsubscribeAlerts) {
    unsubscribeAlerts()
    unsubscribeAlerts = null
  }
}

function createModal(): HTMLElement {
  const overlay = document.createElement('div')
  overlay.className = 'token-stats-overlay'
  overlay.onclick = (e) => {
    if (e.target === overlay) closeTokenStatsModal()
  }

  const modal = document.createElement('div')
  modal.className = 'token-stats-modal'

  // Header
  const header = document.createElement('div')
  header.className = 'token-stats-header'

  const title = document.createElement('h2')
  title.textContent = 'Token Usage'

  const closeBtn = document.createElement('button')
  closeBtn.className = 'token-stats-close'
  closeBtn.textContent = '×'
  closeBtn.onclick = closeTokenStatsModal

  header.appendChild(title)
  header.appendChild(closeBtn)

  // Tabs
  const tabs = document.createElement('div')
  tabs.className = 'token-stats-tabs'

  const tabIds: TabId[] = ['overview', 'sessions', 'alerts', 'settings']
  const tabLabels: Record<TabId, string> = {
    overview: '📊 Overview',
    sessions: '📋 Sessions',
    alerts: '⚠️ Alerts',
    settings: '⚙️ Settings',
  }

  for (const tabId of tabIds) {
    const tab = document.createElement('button')
    tab.className = `token-stats-tab${activeTab === tabId ? ' active' : ''}`
    tab.dataset.tab = tabId
    tab.textContent = tabLabels[tabId]
    tab.onclick = () => {
      activeTab = tabId
      updateTabs()
      updateContent()
    }
    tabs.appendChild(tab)
  }

  // Content
  const content = document.createElement('div')
  content.className = 'token-stats-content'
  content.id = 'token-stats-content'

  modal.appendChild(header)
  modal.appendChild(tabs)
  modal.appendChild(content)
  overlay.appendChild(modal)

  return overlay
}

function updateTabs(): void {
  if (!modalElement) return

  const tabs = modalElement.querySelectorAll('.token-stats-tab')
  tabs.forEach((tab) => {
    const tabEl = tab as HTMLElement
    tabEl.classList.toggle('active', tabEl.dataset.tab === activeTab)
  })
}

function updateContent(): void {
  const content = document.getElementById('token-stats-content')
  if (!content) return

  // Clear content
  content.replaceChildren()

  switch (activeTab) {
    case 'overview':
      renderOverview(content)
      break
    case 'sessions':
      renderSessions(content)
      break
    case 'alerts':
      renderAlerts(content)
      break
    case 'settings':
      renderSettings(content)
      break
  }
}

function renderOverview(container: HTMLElement): void {
  const global = tokenTrackingSystem.getGlobalStats()
  const limits = tokenTrackingSystem.getLimits()

  // Stats grid
  const grid = document.createElement('div')
  grid.className = 'token-stats-grid'

  const stats = [
    {
      label: 'Current Context',
      value: tokenTrackingSystem.formatTokens(global.totalCurrent),
      sub: 'tokens in active sessions',
    },
    {
      label: 'Total Used',
      value: tokenTrackingSystem.formatTokens(global.totalCumulative),
      sub: 'cumulative tokens',
    },
    {
      label: 'Estimated Cost',
      value: tokenTrackingSystem.formatCost(global.totalCost),
      sub: 'based on model pricing',
    },
    {
      label: 'Active Sessions',
      value: global.sessionCount.toString(),
      sub: 'sessions tracked',
    },
    {
      label: 'Today',
      value: tokenTrackingSystem.formatTokens(global.dailyUsage),
      sub: `of ${tokenTrackingSystem.formatTokens(limits.globalDaily)} daily limit`,
    },
  ]

  for (const stat of stats) {
    const card = document.createElement('div')
    card.className = 'token-stat-card'

    const label = document.createElement('div')
    label.className = 'token-stat-label'
    label.textContent = stat.label

    const value = document.createElement('div')
    value.className = 'token-stat-value'
    value.textContent = stat.value

    const sub = document.createElement('div')
    sub.className = 'token-stat-sub'
    sub.textContent = stat.sub

    card.appendChild(label)
    card.appendChild(value)
    card.appendChild(sub)
    grid.appendChild(card)
  }

  container.appendChild(grid)

  // Pricing table
  const pricingSection = document.createElement('div')
  pricingSection.className = 'token-pricing-section'

  const pricingTitle = document.createElement('h3')
  pricingTitle.textContent = 'Model Pricing (per 1M tokens)'

  const table = document.createElement('table')
  table.className = 'token-pricing-table'

  const thead = document.createElement('thead')
  const headerRow = document.createElement('tr')
  ;['Model', 'Input', 'Output'].forEach((text) => {
    const th = document.createElement('th')
    th.textContent = text
    headerRow.appendChild(th)
  })
  thead.appendChild(headerRow)
  table.appendChild(thead)

  const tbody = document.createElement('tbody')
  for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
    if (model === 'default') continue
    const row = document.createElement('tr')

    const modelCell = document.createElement('td')
    modelCell.textContent = model

    const inputCell = document.createElement('td')
    inputCell.textContent = `$${pricing.input.toFixed(2)}`

    const outputCell = document.createElement('td')
    outputCell.textContent = `$${pricing.output.toFixed(2)}`

    row.appendChild(modelCell)
    row.appendChild(inputCell)
    row.appendChild(outputCell)
    tbody.appendChild(row)
  }
  table.appendChild(tbody)

  pricingSection.appendChild(pricingTitle)
  pricingSection.appendChild(table)
  container.appendChild(pricingSection)
}

function renderSessions(container: HTMLElement): void {
  const sessions = tokenTrackingSystem.getAllStats()

  if (sessions.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'token-empty'
    empty.textContent = 'No sessions tracked yet'
    container.appendChild(empty)
    return
  }

  // Sort by cumulative tokens (highest first)
  sessions.sort((a, b) => b.cumulative - a.cumulative)

  const list = document.createElement('div')
  list.className = 'token-session-list'

  for (const session of sessions) {
    const item = document.createElement('div')
    item.className = 'token-session-item'

    const header = document.createElement('div')
    header.className = 'token-session-header'

    const name = document.createElement('span')
    name.className = 'token-session-name'
    name.textContent = session.sessionName || session.sessionId.slice(0, 8)

    const model = document.createElement('span')
    model.className = 'token-session-model'
    model.textContent = session.model

    header.appendChild(name)
    header.appendChild(model)

    const stats = document.createElement('div')
    stats.className = 'token-session-stats'

    const usagePercent = tokenTrackingSystem.getUsagePercent(session.sessionId)

    const progressBar = document.createElement('div')
    progressBar.className = 'token-progress-bar'

    const progressFill = document.createElement('div')
    progressFill.className = 'token-progress-fill'
    progressFill.style.width = `${usagePercent}%`
    if (usagePercent >= 90) progressFill.classList.add('critical')
    else if (usagePercent >= 70) progressFill.classList.add('warning')

    progressBar.appendChild(progressFill)

    const details = document.createElement('div')
    details.className = 'token-session-details'

    const cumulative = document.createElement('span')
    cumulative.textContent = `${tokenTrackingSystem.formatTokens(session.cumulative)} total`

    const cost = document.createElement('span')
    cost.textContent = tokenTrackingSystem.formatCost(session.estimatedCost)

    const peak = document.createElement('span')
    peak.className = 'token-session-peak'
    peak.textContent = `Peak: ${tokenTrackingSystem.formatTokens(session.peakCurrent)}`

    details.appendChild(cumulative)
    details.appendChild(cost)
    details.appendChild(peak)

    stats.appendChild(progressBar)
    stats.appendChild(details)

    item.appendChild(header)
    item.appendChild(stats)
    list.appendChild(item)
  }

  container.appendChild(list)
}

function renderAlerts(container: HTMLElement): void {
  const alerts = tokenTrackingSystem.getAlerts(20)

  if (alerts.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'token-empty'
    empty.textContent = 'No alerts'
    container.appendChild(empty)
    return
  }

  const list = document.createElement('div')
  list.className = 'token-alert-list'

  // Show newest first
  for (const alert of [...alerts].reverse()) {
    const item = document.createElement('div')
    item.className = `token-alert-item ${alert.type}`

    const icon = document.createElement('span')
    icon.className = 'token-alert-icon'
    icon.textContent = alert.type === 'critical' ? '🚨' : '⚠️'

    const content = document.createElement('div')
    content.className = 'token-alert-content'

    const message = document.createElement('div')
    message.className = 'token-alert-message'
    message.textContent = alert.message

    const time = document.createElement('div')
    time.className = 'token-alert-time'
    time.textContent = formatTime(alert.timestamp)

    content.appendChild(message)
    content.appendChild(time)

    item.appendChild(icon)
    item.appendChild(content)
    list.appendChild(item)
  }

  container.appendChild(list)

  // Clear button
  const clearBtn = document.createElement('button')
  clearBtn.className = 'token-clear-alerts'
  clearBtn.textContent = 'Clear Alerts'
  clearBtn.onclick = () => {
    tokenTrackingSystem.clearAlerts()
    updateContent()
  }
  container.appendChild(clearBtn)
}

function renderSettings(container: HTMLElement): void {
  const limits = tokenTrackingSystem.getLimits()

  const form = document.createElement('div')
  form.className = 'token-settings-form'

  const limitFields: Array<{ key: keyof TokenLimits; label: string; description: string }> = [
    {
      key: 'sessionWarning',
      label: 'Session Warning',
      description: 'Warn when a session exceeds this token count',
    },
    {
      key: 'sessionCritical',
      label: 'Session Critical',
      description: 'Critical alert at this token count',
    },
    {
      key: 'globalDaily',
      label: 'Daily Limit',
      description: 'Daily limit across all sessions',
    },
    {
      key: 'turnWarning',
      label: 'Turn Warning',
      description: 'Warn on large single turns',
    },
  ]

  for (const field of limitFields) {
    const group = document.createElement('div')
    group.className = 'token-setting-group'

    const label = document.createElement('label')
    label.textContent = field.label

    const input = document.createElement('input')
    input.type = 'number'
    input.value = limits[field.key].toString()
    input.min = '0'
    input.step = '10000'
    input.onchange = () => {
      const value = parseInt(input.value, 10)
      if (!isNaN(value) && value >= 0) {
        tokenTrackingSystem.setLimits({ [field.key]: value })
      }
    }

    const desc = document.createElement('div')
    desc.className = 'token-setting-desc'
    desc.textContent = field.description

    group.appendChild(label)
    group.appendChild(input)
    group.appendChild(desc)
    form.appendChild(group)
  }

  container.appendChild(form)

  // Clear data button
  const dangerZone = document.createElement('div')
  dangerZone.className = 'token-danger-zone'

  const dangerTitle = document.createElement('h4')
  dangerTitle.textContent = 'Danger Zone'

  const clearBtn = document.createElement('button')
  clearBtn.className = 'token-clear-data'
  clearBtn.textContent = 'Clear All Token Data'
  clearBtn.onclick = () => {
    if (confirm('Are you sure you want to clear all token tracking data?')) {
      tokenTrackingSystem.clear()
      updateContent()
    }
  }

  dangerZone.appendChild(dangerTitle)
  dangerZone.appendChild(clearBtn)
  container.appendChild(dangerZone)
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
