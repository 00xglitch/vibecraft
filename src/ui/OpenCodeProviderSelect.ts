/**
 * OpenCode Provider Select - Shared provider/model selection utilities
 *
 * Consolidates provider fetching, dropdown creation, and model selection
 * for both New Zone modal and Zone Info modal.
 */

import { SearchableSelect, SelectOption } from './SearchableSelect'

export interface OpenCodeProvider {
  id: string
  name: string
  models: Record<string, OpenCodeModel>
}

export interface OpenCodeModel {
  id: string
  name: string
  status: string
  capabilities?: {
    reasoning: boolean
    tool_call: boolean
    attachment: boolean
  }
  cost?: {
    input: number
    output: number
    cache?: {
      read: number
      write: number
    }
  }
  limit?: {
    context: number
    output: number
  }
}

let cachedProviders: OpenCodeProvider[] = []

export function getCachedProviders(): OpenCodeProvider[] {
  return cachedProviders
}

export function clearProviderCache(): void {
  cachedProviders = []
}

export async function fetchOpenCodeProviders(forceRefresh = false): Promise<OpenCodeProvider[]> {
  if (cachedProviders.length > 0 && !forceRefresh) {
    return cachedProviders
  }

  const response = await fetch('/opencode/providers')
  if (!response.ok) {
    throw new Error(`Failed to fetch providers: ${response.status}`)
  }

  const data = await response.json()
  const providersList = data.all ?? []

  if (providersList.length === 0) {
    cachedProviders = []
    return []
  }

  cachedProviders = providersList.map((p: any) => ({
    id: p.id,
    name: p.name,
    models: p.models,
  }))

  return cachedProviders
}

export async function fetchModelsForProvider(providerId: string): Promise<OpenCodeModel[]> {
  const response = await fetch(`/opencode/providers/${providerId}/models`)
  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status}`)
  }

  const data = await response.json()
  return data.models ?? []
}

export interface ProviderSelectCallbacks {
  onProviderSelect: (provider: OpenCodeProvider) => void
  onModelSelect?: (model: OpenCodeModel | null) => void
  defaultProviderId?: string | null
  defaultModelId?: string | null
}

export function createProviderSelect(
  container: HTMLElement,
  callbacks: ProviderSelectCallbacks
): SearchableSelect {
  container.innerHTML = ''
  container.style.position = 'relative'
  container.classList.add('searchable-select-container')

  const select = new SearchableSelect({
    container,
    placeholder: 'Select Provider...',
    options: cachedProviders.map(p => ({ id: p.id, label: p.name })),
    onSelect: async (option) => {
      const provider = cachedProviders.find(p => p.id === option.id)
      if (provider) {
        callbacks.onProviderSelect(provider)
      }
    },
    disabled: cachedProviders.length === 0,
  })

  if (callbacks.defaultProviderId && cachedProviders.some(p => p.id === callbacks.defaultProviderId)) {
    select.setValue(callbacks.defaultProviderId)
    const provider = cachedProviders.find(p => p.id === callbacks.defaultProviderId)
    if (provider) {
      callbacks.onProviderSelect(provider)
    }
  }

  return select
}

export function createModelSelect(
  container: HTMLElement,
  onSelect?: (model: OpenCodeModel | null) => void,
  initialModelId?: string | null
): SearchableSelect {
  container.innerHTML = ''
  container.style.position = 'relative'
  container.classList.add('searchable-select-container')

  return new SearchableSelect({
    container,
    placeholder: 'Select Provider First',
    options: [{ id: '', label: '-- Select Provider First --' }],
    onSelect: (option) => {
      if (onSelect) {
        onSelect(option.id ? { id: option.id, name: option.label, status: 'unknown' } : null)
      }
    },
    disabled: true,
  })
}

export function populateModelDropdown(
  modelSelect: SearchableSelect,
  models: OpenCodeModel[],
  selectedModelId?: string | null
): void {
  const modelOptions: SelectOption[] = [
    { id: '', label: '-- Default --' },
    ...models.map(m => ({ id: m.id, label: `${m.name} (${m.status})` })),
  ]

  modelSelect.setOptions(modelOptions)
  modelSelect.setDisabled(false)

  if (selectedModelId && models.some(m => m.id === selectedModelId)) {
    modelSelect.setValue(selectedModelId)
  }
}

export function createLoadingProviderSelect(container: HTMLElement): SearchableSelect {
  container.innerHTML = ''
  container.style.position = 'relative'
  container.classList.add('searchable-select-container')

  return new SearchableSelect({
    container,
    placeholder: 'Loading providers...',
    options: [{ id: '', label: 'Loading providers...', disabled: true }],
    onSelect: () => {},
    disabled: true,
  })
}
