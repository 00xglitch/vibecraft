/**
 * Model Selector Plugin
 *
 * Allows users to select which Claude model to use when creating sessions.
 * Persists the selection and applies it to new session creation.
 */

import type { Plugin, PluginContext } from './types'

export type ModelType = 'sonnet' | 'opus' | 'haiku'

interface ModelOption {
  id: ModelType
  name: string
  description: string
}

const MODEL_OPTIONS: ModelOption[] = [
  { id: 'sonnet', name: 'Sonnet', description: 'Fast & capable (default)' },
  { id: 'opus', name: 'Opus', description: 'Most powerful' },
  { id: 'haiku', name: 'Haiku', description: 'Fastest & cheapest' },
]

export class ModelSelectorPlugin implements Plugin {
  id = 'model-selector'
  name = 'Model'
  icon = '🧠'
  description = 'Select Claude model for new sessions'
  enabled = true
  priority = 10

  private context: PluginContext | null = null
  private currentModel: ModelType = 'sonnet'

  constructor(context: PluginContext) {
    this.context = context
    // Load saved model
    const settings = context.getSettings<{ model: ModelType }>(this.id)
    if (settings?.model) {
      this.currentModel = settings.model
    }
  }

  render(container: HTMLElement): void {
    const wrapper = document.createElement('div')
    wrapper.className = 'model-selector'

    const select = document.createElement('select')
    select.className = 'model-select'

    for (const option of MODEL_OPTIONS) {
      const opt = document.createElement('option')
      opt.value = option.id
      opt.textContent = option.name
      opt.title = option.description
      if (option.id === this.currentModel) {
        opt.selected = true
      }
      select.appendChild(opt)
    }

    select.addEventListener('change', () => {
      this.currentModel = select.value as ModelType
      this.context?.saveSettings(this.id, { model: this.currentModel })
      this.context?.emit('model:change', { model: this.currentModel })
    })

    wrapper.appendChild(select)
    container.appendChild(wrapper)
  }

  /**
   * Get the currently selected model
   */
  getModel(): ModelType {
    return this.currentModel
  }

  /**
   * Get CLI flag for the selected model
   */
  getModelFlag(): string {
    if (this.currentModel === 'sonnet') {
      return '' // Default, no flag needed
    }
    return `--model ${this.currentModel}`
  }

  onActivate(): void {
    // Emit current state
    this.context?.emit('model:change', { model: this.currentModel })
  }
}
