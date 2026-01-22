/**
 * Thinking Toggle Plugin
 *
 * Toggles extended thinking mode for Claude sessions.
 * When enabled, adds --thinking flag to session creation.
 */

import type { Plugin, PluginContext } from './types'

export class ThinkingTogglePlugin implements Plugin {
  id = 'thinking-toggle'
  name = 'Thinking'
  icon = '💭'
  description = 'Enable extended thinking mode'
  enabled = true
  priority = 20

  private context: PluginContext | null = null
  private thinkingEnabled = false

  constructor(context: PluginContext) {
    this.context = context
    // Load saved state
    const settings = context.getSettings<{ enabled: boolean }>(this.id)
    if (settings?.enabled !== undefined) {
      this.thinkingEnabled = settings.enabled
    }
  }

  render(container: HTMLElement): void {
    const wrapper = document.createElement('div')
    wrapper.className = 'thinking-toggle'

    const label = document.createElement('label')
    label.className = 'thinking-label'

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.className = 'thinking-checkbox'
    checkbox.checked = this.thinkingEnabled

    checkbox.addEventListener('change', () => {
      this.thinkingEnabled = checkbox.checked
      this.context?.saveSettings(this.id, { enabled: this.thinkingEnabled })
      this.context?.emit('thinking:toggle', { enabled: this.thinkingEnabled })
      this.updateLabel(labelText)
    })

    const labelText = document.createElement('span')
    labelText.className = 'thinking-text'
    this.updateLabel(labelText)

    label.appendChild(checkbox)
    label.appendChild(labelText)
    wrapper.appendChild(label)
    container.appendChild(wrapper)
  }

  private updateLabel(element: HTMLElement): void {
    element.textContent = this.thinkingEnabled ? 'Extended thinking ON' : 'Extended thinking OFF'
  }

  /**
   * Check if thinking mode is enabled
   */
  isEnabled(): boolean {
    return this.thinkingEnabled
  }

  /**
   * Get CLI flag for thinking mode
   */
  getThinkingFlag(): string {
    return this.thinkingEnabled ? '--thinking' : ''
  }

  onActivate(): void {
    this.context?.emit('thinking:toggle', { enabled: this.thinkingEnabled })
  }
}
