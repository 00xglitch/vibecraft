/**
 * Zone Info Modal - Displays detailed information about a session/zone
 *
 * Shows session stats, git status, token usage, files touched, etc.
 * For OpenCode sessions, also includes provider/model configuration.
 */

import type { ManagedSession, GitStatus, OpenCodeSession } from '../../shared/types'
import { soundManager } from '../audio'
import { formatTimeAgo } from './FeedManager'
import {
  SearchableSelect,
  type SelectOption,
} from './SearchableSelect'
import {
  fetchOpenCodeProviders,
  fetchModelsForProvider,
  createProviderSelect,
  createModelSelect,
  populateModelDropdown,
  createLoadingProviderSelect,
  getCachedProviders,
  type OpenCodeProvider,
  type OpenCodeModel,
} from './OpenCodeProviderSelect'

// ============================================================================
// Types
// ============================================================================

export interface ZoneInfoData {
  /** The managed session data */
  managedSession: ManagedSession
  /** Session-specific stats from main.ts state */
  stats?: {
    toolsUsed: number
    filesTouched: Set<string>
    activeSubagents: number
  }
}

// ============================================================================
// State
// ============================================================================

let modal: HTMLElement | null = null
let soundEnabled = true

// Provider/Model configuration state
let currentSessionId: string | null = null
let providerSelect: SearchableSelect | null = null
let modelSelect: SearchableSelect | null = null
let currentProviderId: string | null = null
let currentModelId: string | null = null

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialize the zone info modal
 */
export function setupZoneInfoModal(options: { soundEnabled: boolean }): void {
  soundEnabled = options.soundEnabled
  modal = document.getElementById('zone-info-modal')

  const closeBtn = document.getElementById('zone-info-close')
  closeBtn?.addEventListener('click', hideZoneInfoModal)

  // Close on backdrop click
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      hideZoneInfoModal()
    }
  })

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal?.classList.contains('visible')) {
      hideZoneInfoModal()
    }
  })
}

/**
 * Show the zone info modal with session data
 */
export function showZoneInfoModal(data: ZoneInfoData): void {
  if (!modal) return

  if (soundEnabled) {
    soundManager.play('modal_open')
  }

  renderContent(data)
  modal.classList.add('visible')

  // Fetch providers for OpenCode sessions
  if (data.managedSession.sessionType === 'opencode') {
    currentSessionId = data.managedSession.id
    currentProviderId = (data.managedSession as OpenCodeSession).providerID ?? null
    currentModelId = (data.managedSession as OpenCodeSession).modelID ?? null
    fetchProviders()
  }
}

/**
 * Hide the zone info modal
 */
export function hideZoneInfoModal(): void {
  if (!modal) return

  if (soundEnabled) {
    soundManager.play('modal_cancel')
  }

  modal.classList.remove('visible')
  currentSessionId = null

  // Clean up SearchableSelect instances
  providerSelect?.destroy()
  modelSelect?.destroy()
  providerSelect = null
  modelSelect = null
}

// ============================================================================
// API
// ============================================================================

async function fetchProviders(): Promise<void> {
  try {
    const providers = await fetchOpenCodeProviders()

    if (providers.length > 0) {
      updateProviderDropdown()
    }

    if (providerSelect && providers.length > 0) {
      const providerContainer = document.getElementById('zone-info-provider-container')
      if (providerContainer) {
        providerSelect.destroy()

        providerSelect = createProviderSelect(providerContainer, {
          onProviderSelect: async (provider) => {
            currentProviderId = provider.id
            await handleModelLoad(provider.id)
            document.getElementById('zone-info-save')?.removeAttribute('disabled')
          },
          defaultProviderId: currentProviderId,
        })

        if (currentProviderId) {
          await handleModelLoad(currentProviderId)
        }
      }
    }
  } catch (error) {
    console.error('Failed to fetch providers:', error)
    if (providerSelect) {
      providerSelect.setOptions([{ id: '', label: 'Failed to load providers', disabled: true }])
      providerSelect.setDisabled(true)
    }
  }
}

async function saveSettings(): Promise<boolean> {
  const providerId = providerSelect?.getValue() ?? null
  const modelId = modelSelect?.getValue() ?? null

  if (!currentSessionId) return false

  try {
    const response = await fetch(`/sessions/${currentSessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerID: providerId ?? undefined, modelID: modelId ?? undefined }),
    })

    if (!response.ok) {
      throw new Error('Failed to save settings')
    }

    return true
  } catch (error) {
    console.error('Failed to save settings:', error)
    return false
  }
}

function updateProviderDropdown(): void {
  if (providerSelect) {
    const providers = getCachedProviders()
    if (providers.length > 0) {
      providerSelect.setOptions(providers.map(p => ({ id: p.id, label: p.name })))
      providerSelect.setDisabled(false)
    }
  }
}

function updateModelInfo(model: OpenCodeModel | null): void {
  const infoDiv = document.getElementById('zone-info-model-info')
  if (!infoDiv) return

  if (!model) {
    infoDiv.classList.add('hidden')
    return
  }

  infoDiv.classList.remove('hidden')

  const capabilitiesDiv = infoDiv.querySelector('.zone-info-capabilities')
  if (capabilitiesDiv) {
    const caps = capabilitiesDiv.querySelectorAll('.zone-info-capability')
    caps[0]?.classList.toggle('active', model.capabilities?.reasoning ?? false)
    caps[1]?.classList.toggle('active', model.capabilities?.tool_call ?? false)
    caps[2]?.classList.toggle('active', model.capabilities?.attachment ?? false)
  }

  const inputCost = model.cost?.input ?? 0
  const outputCost = model.cost?.output ?? 0
  const contextLimit = model.limit?.context ?? 0
  const outputLimit = model.limit?.output ?? 0

  const inputEl = document.getElementById('zone-info-cost-input')
  const outputEl = document.getElementById('zone-info-cost-output')
  const contextEl = document.getElementById('zone-info-limit-context')
  const outputLimitEl = document.getElementById('zone-info-limit-output')

  inputEl && (inputEl.textContent = inputCost > 0 ? `$${inputCost}/1M` : 'Free')
  outputEl && (outputEl.textContent = outputCost > 0 ? `$${outputCost}/1M` : 'Free')
  contextEl && (contextEl.textContent = contextLimit > 0 ? formatNumber(contextLimit) : 'N/A')
  outputLimitEl && (outputLimitEl.textContent = outputLimit > 0 ? formatNumber(outputLimit) : 'N/A')
}

async function handleModelLoad(providerId: string): Promise<void> {
  const models = await fetchModelsForProvider(providerId)
  const provider = getCachedProviders().find(p => p.id === providerId)
  const selectedModelId = modelSelect?.getValue() ?? currentModelId

  populateModelDropdown(modelSelect!, models, selectedModelId)

  if (selectedModelId) {
    const model = provider?.models[selectedModelId]
    updateModelInfo(model || null)
  } else {
    updateModelInfo(models[0] || null)
  }
}

function setupProviderModelDropdowns(session: OpenCodeSession): void {
  providerSelect?.destroy()
  modelSelect?.destroy()
  providerSelect = null
  modelSelect = null

  const providerContainer = document.getElementById('zone-info-provider-container')
  const modelContainer = document.getElementById('zone-info-model-container')

  currentProviderId = session.providerID ?? null
  currentModelId = session.modelID ?? null

  if (providerContainer) {
    const providers = getCachedProviders()
    if (providers.length > 0) {
      providerSelect = createProviderSelect(providerContainer, {
        onProviderSelect: async (provider) => {
          currentProviderId = provider.id
          await handleModelLoad(provider.id)
          document.getElementById('zone-info-save')?.removeAttribute('disabled')
        },
        defaultProviderId: currentProviderId,
      })
    } else {
      providerSelect = createLoadingProviderSelect(providerContainer)
    }
  }

  if (modelContainer) {
    modelSelect = createModelSelect(modelContainer, (model) => {
      currentModelId = model?.id ?? null
      if (currentProviderId) {
        const provider = getCachedProviders().find(p => p.id === currentProviderId)
        const fullModel = model ? provider?.models[model.id] : null
        updateModelInfo(fullModel || null)
      }
      document.getElementById('zone-info-save')?.removeAttribute('disabled')
    })
  }

  document.getElementById('zone-info-save')?.addEventListener('click', async () => {
    const success = await saveSettings()
    if (success) {
      const currentProviderEl = document.getElementById('zone-info-current-provider')
      const currentModelEl = document.getElementById('zone-info-current-model')
      const providerId = providerSelect?.getValue() ?? null
      const modelId = modelSelect?.getValue() ?? null

      if (currentProviderEl) {
        currentProviderEl.textContent = providerId ?? 'Default'
      }
      if (currentModelEl) {
        currentModelEl.textContent = modelId ?? 'Default'
      }
    }
  })
}

/**
 * Update sound enabled state
 */
export function setZoneInfoSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled
}

// ============================================================================
// Rendering
// ============================================================================

function renderContent(data: ZoneInfoData): void {
  const content = document.getElementById('zone-info-content')
  if (!content) return

  const { managedSession: s, stats } = data
  const filesTouched = stats?.filesTouched ? Array.from(stats.filesTouched) : []
  const isOpenCode = s.sessionType === 'opencode'
  const opencodeSession = s as OpenCodeSession

  content.innerHTML = `
    <!-- Header -->
    <div class="zone-info-header">
      <div class="zone-info-name">${escapeHtml(s.name)}</div>
      <div class="zone-info-status zone-info-status--${s.status}">${s.status}</div>
    </div>

    <!-- Basic Info -->
    <div class="zone-info-section">
      <div class="zone-info-row">
        <span class="zone-info-label">Directory</span>
        <span class="zone-info-value zone-info-mono">${escapeHtml(s.cwd || '~')}</span>
      </div>
      <div class="zone-info-row">
        <span class="zone-info-label">Session Type</span>
        <span class="zone-info-value">${isOpenCode ? 'OpenCode' : 'Claude'}</span>
      </div>
      ${s.tmuxSession ? `
      <div class="zone-info-row">
        <span class="zone-info-label">tmux Session</span>
        <span class="zone-info-value zone-info-mono">${escapeHtml(s.tmuxSession)}</span>
      </div>
      ` : ''}
      <div class="zone-info-row">
        <span class="zone-info-label">Created</span>
        <span class="zone-info-value">${formatTimeAgo(s.createdAt)}</span>
      </div>
      <div class="zone-info-row">
        <span class="zone-info-label">Last Activity</span>
        <span class="zone-info-value">${formatTimeAgo(s.lastActivity)}</span>
      </div>
      ${s.currentTool ? `
      <div class="zone-info-row">
        <span class="zone-info-label">Current Tool</span>
        <span class="zone-info-value zone-info-highlight">${escapeHtml(s.currentTool)}</span>
      </div>
      ` : ''}
    </div>

    <!-- Stats -->
    <div class="zone-info-section">
      <div class="zone-info-section-title">Statistics</div>
      <div class="zone-info-stats-grid">
        <div class="zone-info-stat">
          <div class="zone-info-stat-value">${stats?.toolsUsed ?? 0}</div>
          <div class="zone-info-stat-label">Tools Used</div>
        </div>
        <div class="zone-info-stat">
          <div class="zone-info-stat-value">${filesTouched.length}</div>
          <div class="zone-info-stat-label">Files Touched</div>
        </div>
        <div class="zone-info-stat">
          <div class="zone-info-stat-value">${stats?.activeSubagents ?? 0}</div>
          <div class="zone-info-stat-label">Subagents</div>
        </div>
      </div>
    </div>

    <!-- Tokens -->
    ${s.tokens ? `
    <div class="zone-info-section">
      <div class="zone-info-section-title">Token Usage</div>
      <div class="zone-info-tokens">
        <div class="zone-info-token-row">
          <span>Current Conversation</span>
          <span class="zone-info-token-value">${formatNumber(s.tokens.current)}</span>
        </div>
        <div class="zone-info-token-row">
          <span>Cumulative (Session)</span>
          <span class="zone-info-token-value">${formatNumber(s.tokens.cumulative)}</span>
        </div>
      </div>
    </div>
    ` : ''}

    <!-- Git Status -->
    ${s.gitStatus?.isRepo ? renderGitStatus(s.gitStatus) : `
    <div class="zone-info-section">
      <div class="zone-info-section-title">Git Status</div>
      <div class="zone-info-muted">Not a git repository</div>
    </div>
    `}

    ${isOpenCode ? `
    <!-- Provider & Model Configuration -->
    <div class="zone-info-section">
      <div class="zone-info-section-title">Provider & Model Configuration</div>

      <div class="zone-info-config-row">
        <span class="zone-info-label">Current Provider</span>
        <span class="zone-info-value" id="zone-info-current-provider">${opencodeSession.providerID ?? 'Default'}</span>
      </div>
      <div class="zone-info-config-row">
        <span class="zone-info-label">Current Model</span>
        <span class="zone-info-value" id="zone-info-current-model">${opencodeSession.modelID ?? 'Default'}</span>
      </div>

      <div class="zone-info-config-field">
        <label class="zone-info-field-label">Provider</label>
        <div id="zone-info-provider-container" class="zone-info-select-container"></div>
      </div>

      <div class="zone-info-config-field">
        <label class="zone-info-field-label">Model</label>
        <div id="zone-info-model-container" class="zone-info-select-container"></div>
      </div>

      <div id="zone-info-model-info" class="modal-field hidden">
        <div class="zone-info-capabilities">
          <span class="zone-info-capability">Reasoning</span>
          <span class="zone-info-capability">Tools</span>
          <span class="zone-info-capability">Attachments</span>
        </div>
        <div class="zone-info-cost">
          Input: <span id="zone-info-cost-input">-</span> | Output: <span id="zone-info-cost-output">-</span>
        </div>
        <div class="zone-info-limit">
          Context: <span id="zone-info-limit-context">-</span> | Output: <span id="zone-info-limit-output">-</span>
        </div>
      </div>

      <div class="zone-info-actions">
        <button type="button" class="modal-btn zone-info-btn zone-info-btn-primary" id="zone-info-save" disabled>Save Configuration</button>
      </div>
    </div>
    ` : ''}

    <!-- Files Touched -->
    ${filesTouched.length > 0 ? `
    <div class="zone-info-section">
      <div class="zone-info-section-title">Files Touched (${filesTouched.length})</div>
      <div class="zone-info-files">
        ${filesTouched.slice(0, 10).map(f => `
          <div class="zone-info-file">${escapeHtml(shortenPath(f))}</div>
        `).join('')}
        ${filesTouched.length > 10 ? `
          <div class="zone-info-file zone-info-muted">... and ${filesTouched.length - 10} more</div>
        ` : ''}
      </div>
    </div>
    ` : ''}

    <!-- IDs (for debugging) -->
    <div class="zone-info-section zone-info-ids">
      <div class="zone-info-section-title">Identifiers</div>
      <div class="zone-info-row">
        <span class="zone-info-label">Managed ID</span>
        <span class="zone-info-value zone-info-mono zone-info-small">${s.id}</span>
      </div>
      ${isOpenCode ? `
      <div class="zone-info-row">
        <span class="zone-info-label">OpenCode Session</span>
        <span class="zone-info-value zone-info-mono zone-info-small">${s.opencodeSessionId}</span>
      </div>
      ` : (s.claudeSessionId ? `
      <div class="zone-info-row">
        <span class="zone-info-label">Claude Session</span>
        <span class="zone-info-value zone-info-mono zone-info-small">${s.claudeSessionId}</span>
      </div>
      ` : '')}
    </div>
  `

  // Initialize provider/model dropdowns for OpenCode sessions
  if (isOpenCode) {
    setupProviderModelDropdowns(opencodeSession)
  }
}

function renderGitStatus(git: GitStatus): string {
  const stagedTotal = git.staged.added + git.staged.modified + git.staged.deleted
  const unstagedTotal = git.unstaged.added + git.unstaged.modified + git.unstaged.deleted
  const isDirty = stagedTotal > 0 || unstagedTotal > 0 || git.untracked > 0

  return `
    <div class="zone-info-section">
      <div class="zone-info-section-title">Git Status</div>

      <!-- Branch -->
      <div class="zone-info-git-branch">
        <span class="zone-info-branch-icon">⎇</span>
        <span class="zone-info-branch-name">${escapeHtml(git.branch)}</span>
        ${git.ahead > 0 ? `<span class="zone-info-branch-ahead">↑${git.ahead}</span>` : ''}
        ${git.behind > 0 ? `<span class="zone-info-branch-behind">↓${git.behind}</span>` : ''}
        ${isDirty ? `<span class="zone-info-branch-dirty">●</span>` : `<span class="zone-info-branch-clean">✓</span>`}
      </div>

      <!-- Changes -->
      ${stagedTotal > 0 ? `
      <div class="zone-info-git-changes">
        <span class="zone-info-changes-label">Staged</span>
        <span class="zone-info-changes-detail">
          ${git.staged.added > 0 ? `<span class="zone-info-added">+${git.staged.added}</span>` : ''}
          ${git.staged.modified > 0 ? `<span class="zone-info-modified">~${git.staged.modified}</span>` : ''}
          ${git.staged.deleted > 0 ? `<span class="zone-info-deleted">-${git.staged.deleted}</span>` : ''}
        </span>
      </div>
      ` : ''}

      ${unstagedTotal > 0 ? `
      <div class="zone-info-git-changes">
        <span class="zone-info-changes-label">Unstaged</span>
        <span class="zone-info-changes-detail">
          ${git.unstaged.added > 0 ? `<span class="zone-info-added">+${git.unstaged.added}</span>` : ''}
          ${git.unstaged.modified > 0 ? `<span class="zone-info-modified">~${git.unstaged.modified}</span>` : ''}
          ${git.unstaged.deleted > 0 ? `<span class="zone-info-deleted">-${git.unstaged.deleted}</span>` : ''}
        </span>
      </div>
      ` : ''}

      ${git.untracked > 0 ? `
      <div class="zone-info-git-changes">
        <span class="zone-info-changes-label">Untracked</span>
        <span class="zone-info-changes-detail zone-info-muted">${git.untracked} files</span>
      </div>
      ` : ''}

      ${!isDirty ? `
      <div class="zone-info-git-clean">Working tree clean</div>
      ` : ''}

      <!-- Lines changed -->
      ${(git.linesAdded > 0 || git.linesRemoved > 0) ? `
      <div class="zone-info-git-lines">
        ${git.linesAdded > 0 ? `<span class="zone-info-added">+${git.linesAdded}</span>` : ''}
        ${git.linesRemoved > 0 ? `<span class="zone-info-deleted">-${git.linesRemoved}</span>` : ''}
        <span class="zone-info-muted">lines</span>
      </div>
      ` : ''}

      <!-- Last commit -->
      ${git.lastCommitMessage ? `
      <div class="zone-info-git-commit">
        <span class="zone-info-commit-msg">${escapeHtml(git.lastCommitMessage)}</span>
        ${git.lastCommitTime ? `
        <span class="zone-info-commit-time">${formatTimeAgo(git.lastCommitTime * 1000)}</span>
        ` : ''}
      </div>
      ` : ''}
    </div>
  `
}

// ============================================================================
// Utilities
// ============================================================================

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n.toString()
}

function shortenPath(path: string): string {
  // Show last 2-3 path segments
  const parts = path.split('/')
  if (parts.length <= 3) return path
  return '.../' + parts.slice(-3).join('/')
}
