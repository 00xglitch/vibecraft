/**
 * New Session Modal - Complete session creation UI
 * Handles both Claude and OpenCode session types
 */

import { SearchableSelect, SelectOption } from './SearchableSelect'
import {
  fetchOpenCodeProviders,
  createProviderSelect,
  createModelSelect,
  getCachedProviders,
  type OpenCodeProvider,
} from './OpenCodeProviderSelect.js'
import { setupDirectoryAutocomplete } from './DirectoryAutocomplete'

export interface SessionFlags {
  continue?: boolean
  skipPermissions?: boolean
  chrome?: boolean
  worktree?: boolean
  model?: string // Model ID: 'sonnet', 'opus', 'haiku'
  thinking?: boolean // Enable extended thinking mode
}

export interface DockerOptions {
  workspace?: string
  memory?: string
  network?: string
}

export type SessionRuntime = 'tmux' | 'docker'

export interface NewSessionModal {
  switchSessionType(type: 'claude' | 'opencode'): void
  sessionType: 'claude' | 'opencode'
  destroy(): void
  getState(): {
    providerSelect: SearchableSelect | null
    modelSelect: SearchableSelect | null
  }
}

export function setupNewSessionModal(
  container: HTMLElement,
  callbacks: {
    onClaudeSession: (
      name: string,
      cwd: string,
      flags: SessionFlags,
      runtime?: SessionRuntime,
      docker?: DockerOptions,
      shell?: string
    ) => void
    onOpenCodeSession: (data: {
      name?: string
      cwd?: string
      providerID: string
      modelID: string
    }) => void
  }
): NewSessionModal {
  // DOM elements
  const modal = document.getElementById('new-session-modal') as HTMLElement | null
  const nameInput = document.getElementById('session-name-input') as HTMLInputElement | null
  const cwdInput = document.getElementById('session-cwd-input') as HTMLInputElement | null
  const claudeTab = modal?.querySelector(
    '.session-type-tab[data-type="claude"]'
  ) as HTMLButtonElement | null
  const opencodeTab = modal?.querySelector(
    '.session-type-tab[data-type="opencode"]'
  ) as HTMLButtonElement | null
  const claudeOptions = document.getElementById('claude-options')
  const opencodeOptions = document.getElementById('opencode-options')
  const opencodeModelField = document.getElementById('opencode-model-field')
  const claudeDescription = document.querySelector('.session-type-description.claude')
  const opencodeDescription = document.querySelector('.session-type-description.opencode')
  const cancelBtn = document.getElementById('modal-cancel')
  const createBtn = document.getElementById('modal-create')

  // State
  let sessionType: 'claude' | 'opencode' = 'claude'
  let providerSelect: SearchableSelect | null = null
  let modelSelect: SearchableSelect | null = null
  let opencodeInitialized = false

  // Initialize provider/model selects
  const initializeOpenCodeSelects = (
    onProviderSelect: (provider: OpenCodeProvider) => void
  ): void => {
    if (providerSelect && modelSelect) {
      console.log('[NewSession] Selects already initialized, reusing...')
      return
    }

    const providerContainer = document.getElementById('opencode-options')
    const modelContainer = document.getElementById('opencode-model-field')
    const opencodeModelField = document.getElementById('opencode-model-field')

    if (!providerContainer || !modelContainer) {
      console.error('[NewSession] Provider or model container not found')
      return
    }

    const handleProviderChange = (provider: OpenCodeProvider): void => {
      console.log('[NewSession] Provider selected:', provider.name)
      if (!provider) {
        modelSelect?.setOptions([{ id: '', label: '-- Select Provider First --' }])
        modelSelect?.setDisabled(true)
        opencodeModelField?.classList.add('hidden')
        return
      }

      const models = Object.values(provider.models)
      const modelOptions: SelectOption[] = [
        { id: '', label: '-- Default --' },
        ...models.map((m) => ({ id: m.id, label: `${m.name} (${m.status})` })),
      ]
      modelSelect?.setOptions(modelOptions)
      modelSelect?.setDisabled(false)
      opencodeModelField?.classList.remove('hidden')
      onProviderSelect(provider)
    }

    console.log('[NewSession] Creating provider select...')
    providerSelect = createProviderSelect(providerContainer, {
      onProviderSelect: handleProviderChange,
    })

    providerSelect.input.addEventListener('focus', () => {
      if (getCachedProviders().length === 0) {
        fetchOpenCodeProviders()
          .then((providers) => {
            if (providerSelect) {
              providerSelect.setOptions(providers.map((p) => ({ id: p.id, label: p.name })))
              providerSelect.setDisabled(false)
            }
          })
          .catch((err) => console.error('[NewSession] Failed to fetch providers:', err))
      }
    })

    console.log('[NewSession] Creating model select...')
    modelSelect = createModelSelect(modelContainer)
    console.log('[NewSession] OpenCode selects initialized')
  }

  // Update session type descriptions
  const updateSessionTypeDescriptions = (type: 'claude' | 'opencode'): void => {
    if (type === 'claude') {
      claudeDescription?.classList.add('show')
      opencodeDescription?.classList.remove('show')
    } else {
      claudeDescription?.classList.remove('show')
      opencodeDescription?.classList.add('show')
    }
  }

  // Switch between session types
  const switchSessionType = (type: 'claude' | 'opencode'): void => {
    console.log('[NewSession] Switching to type:', type)
    sessionType = type

    if (type === 'claude') {
      claudeTab?.classList.add('active')
      opencodeTab?.classList.remove('active')
      claudeOptions?.classList.remove('hidden')
      opencodeOptions?.classList.add('hidden')
      opencodeModelField?.classList.add('hidden')

      providerSelect?.setValue('')
      providerSelect?.setDisabled(true)
      modelSelect?.setValue('')
      modelSelect?.setDisabled(true)

      console.log('[NewSession] Claude options visible, OpenCode hidden and cleared')
    } else {
      claudeTab?.classList.remove('active')
      opencodeTab?.classList.add('active')
      claudeOptions?.classList.add('hidden')
      opencodeOptions?.classList.remove('hidden')
      opencodeModelField?.classList.remove('hidden')
      console.log('[NewSession] OpenCode options visible, Claude hidden')

      if (!opencodeInitialized) {
        console.log('[NewSession] First time OpenCode tab clicked, initializing...')
        initializeOpenCodeSelects(() => {})
        opencodeInitialized = true
      }

      providerSelect?.setDisabled(false)
      fetchOpenCodeProviders()
        .then((providers) => {
          console.log('[NewSession] Providers fetched:', providers.length)
          providerSelect?.setOptions(providers.map((p) => ({ id: p.id, label: p.name })))
        })
        .catch((err: unknown) => console.error('[NewSession] Failed to fetch providers:', err))
    }

    updateSessionTypeDescriptions(type)
  }

  // Handle session creation
  const handleCreate = (): void => {
    const name = nameInput?.value.trim() || undefined
    const cwd = cwdInput?.value.trim() || undefined

    if (sessionType === 'opencode') {
      // Validate OpenCode session requires provider selection
      const providerId = providerSelect?.getValue()
      if (!providerId) {
        alert('Please select a provider for OpenCode session')
        return
      }

      // Create OpenCode session
      const modelId = modelSelect?.getValue() ?? null
      callbacks.onOpenCodeSession({
        name,
        cwd,
        providerID: providerId,
        modelID: modelId ?? '',
      })
    } else {
      // Read flag checkboxes
      const continueCheck = document.getElementById('session-opt-continue') as HTMLInputElement
      const skipPermsCheck = document.getElementById('session-opt-skip-perms') as HTMLInputElement
      const chromeCheck = document.getElementById('session-opt-chrome') as HTMLInputElement
      const thinkingCheck = document.getElementById('session-opt-thinking') as HTMLInputElement
      const modelSelect = document.getElementById('session-opt-model') as HTMLSelectElement

      const flags: SessionFlags = {
        continue: continueCheck?.checked ?? true,
        skipPermissions: skipPermsCheck?.checked ?? true,
        chrome: chromeCheck?.checked ?? false,
        thinking: thinkingCheck?.checked ?? false,
        model: modelSelect?.value || undefined,
      }

      // Read runtime from active tab
      const activeRuntimeTab = document.querySelector('.runtime-tab.active') as HTMLButtonElement
      const runtime: SessionRuntime =
        (activeRuntimeTab?.dataset?.runtime as SessionRuntime) || 'tmux'

      // Read shell from appropriate dropdown based on runtime
      const shellDropdown = document.getElementById(
        runtime === 'docker' ? 'session-opt-shell-docker' : 'session-opt-shell-tmux'
      ) as HTMLSelectElement
      const shell = shellDropdown?.value || 'bash'

      // Read Docker options if Docker runtime selected
      let dockerOptions: DockerOptions | undefined
      if (runtime === 'docker') {
        const memorySelect = document.getElementById('session-opt-memory') as HTMLSelectElement
        dockerOptions = {
          workspace: cwd || undefined,
          memory: memorySelect?.value || '1G',
        }
      }

      // Create Claude session
      callbacks.onClaudeSession(name || '', cwd || '', flags, runtime, dockerOptions, shell)
    }
  }

  // Handle cancel
  const handleCancel = (): void => {
    // Play cancel sound if soundManager is available
    if (typeof window !== 'undefined' && 'soundManager' in window) {
      // @ts-expect-error - soundManager is added dynamically
      window.soundManager.play('modal_cancel')
    }
    modal?.classList.remove('visible')
  }

  // Setup event listeners
  claudeTab?.addEventListener('click', () => switchSessionType('claude'))
  opencodeTab?.addEventListener('click', () => switchSessionType('opencode'))
  cancelBtn?.addEventListener('click', handleCancel)
  createBtn?.addEventListener('click', handleCreate)

  // Setup runtime tab switching
  const runtimeTabs = document.querySelectorAll('.runtime-tab')
  const runtimePanels = document.querySelectorAll('.runtime-panel')

  runtimeTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetRuntime = (tab as HTMLButtonElement).dataset.runtime

      // Update active states on tabs
      runtimeTabs.forEach((t) => t.classList.remove('active'))
      tab.classList.add('active')

      // Show corresponding panel
      runtimePanels.forEach((panel) => {
        const panelId = panel.id
        if (panelId === `runtime-${targetRuntime}-panel`) {
          panel.classList.add('active')
        } else {
          panel.classList.remove('active')
        }
      })
    })
  })

  // Setup directory autocomplete
  if (cwdInput) {
    setupDirectoryAutocomplete(cwdInput)
  }

  // Auto-populate name from directory
  if (cwdInput && nameInput) {
    cwdInput.addEventListener('input', () => {
      // Only auto-fill if name is empty or was auto-filled before
      if (nameInput.value.trim() === '' || nameInput.dataset.autoFilled === 'true') {
        const cwd = cwdInput.value.trim()
        if (cwd) {
          // Extract basename (last path component)
          const basename = cwd.replace(/\/+$/, '').split('/').pop() || ''
          if (basename) {
            // Check for duplicate names and add suffix if needed
            const name = basename
            // Note: suffix would be used for duplicate detection
            // Note: state.managedSessions check would require passing state as parameter
            // For now, use simple duplicate prevention
            // In main.ts integration, this will be handled by the caller
            nameInput.value = name
            nameInput.dataset.autoFilled = 'true'
          }
        }
      }
    })

    // Mark as manually edited when user types in name field
    nameInput.addEventListener('input', () => {
      nameInput.dataset.autoFilled = 'false'
    })
  }

  // Initialize descriptions
  updateSessionTypeDescriptions('claude')

  return {
    switchSessionType,
    sessionType,
    destroy: () => {
      claudeTab?.removeEventListener('click', () => switchSessionType('claude'))
      opencodeTab?.removeEventListener('click', () => switchSessionType('opencode'))
      cancelBtn?.removeEventListener('click', handleCancel)
      createBtn?.removeEventListener('click', handleCreate)
    },
    getState: () => ({
      providerSelect,
      modelSelect,
    }),
  }
}
