/**
 * Plugin Manager
 *
 * Manages the lifecycle of Vibecraft plugins, handles registration,
 * activation, and provides the plugin context.
 */

import type { Plugin, PluginConfig, PluginContext, PluginEvents } from './types'

type EventHandler<T> = (data: T) => void

class PluginManager {
  private plugins: Map<string, Plugin> = new Map()
  private configs: Map<string, PluginConfig> = new Map()
  private eventHandlers: Map<keyof PluginEvents, Set<EventHandler<unknown>>> = new Map()
  private container: HTMLElement | null = null
  private activeSessionId: string | null = null

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initialize the plugin manager with a container
   */
  init(container: HTMLElement): void {
    this.container = container
    this.loadConfigs()
    this.renderPluginPanel()
  }

  /**
   * Load plugin configurations from localStorage
   */
  private loadConfigs(): void {
    try {
      const stored = localStorage.getItem('vibecraft:plugins')
      if (stored) {
        const configs: PluginConfig[] = JSON.parse(stored)
        for (const config of configs) {
          this.configs.set(config.id, config)
        }
      }
    } catch (e) {
      console.warn('Failed to load plugin configs:', e)
    }
  }

  /**
   * Save plugin configurations to localStorage
   */
  private saveConfigs(): void {
    try {
      const configs = Array.from(this.configs.values())
      localStorage.setItem('vibecraft:plugins', JSON.stringify(configs))
    } catch (e) {
      console.warn('Failed to save plugin configs:', e)
    }
  }

  // ===========================================================================
  // Plugin Registration
  // ===========================================================================

  /**
   * Register a plugin
   */
  register(plugin: Plugin): void {
    this.plugins.set(plugin.id, plugin)

    // Load or create config
    let config = this.configs.get(plugin.id)
    if (!config) {
      config = { id: plugin.id, enabled: plugin.enabled }
      this.configs.set(plugin.id, config)
    }

    // Apply saved enabled state
    plugin.enabled = config.enabled

    // Activate if enabled
    if (plugin.enabled) {
      plugin.onActivate?.()
    }

    this.renderPluginPanel()
  }

  /**
   * Register a plugin without triggering render
   * (for modal-based plugins that render themselves)
   */
  registerWithoutRender(plugin: Plugin): void {
    this.plugins.set(plugin.id, plugin)

    // Load or create config
    let config = this.configs.get(plugin.id)
    if (!config) {
      config = { id: plugin.id, enabled: plugin.enabled }
      this.configs.set(plugin.id, config)
    }

    // Apply saved enabled state
    plugin.enabled = config.enabled

    // Activate if enabled
    if (plugin.enabled) {
      plugin.onActivate?.()
    }
    // Note: No renderPluginPanel() call
  }

  /**
   * Unregister a plugin
   */
  unregister(pluginId: string): void {
    const plugin = this.plugins.get(pluginId)
    if (plugin) {
      plugin.onDeactivate?.()
      plugin.destroy?.()
      this.plugins.delete(pluginId)
      this.renderPluginPanel()
    }
  }

  /**
   * Get all registered plugins
   */
  getPlugins(): Plugin[] {
    return Array.from(this.plugins.values()).sort(
      (a, b) => (a.priority ?? 100) - (b.priority ?? 100)
    )
  }

  // ===========================================================================
  // Plugin State
  // ===========================================================================

  /**
   * Enable or disable a plugin
   */
  setEnabled(pluginId: string, enabled: boolean): void {
    const plugin = this.plugins.get(pluginId)
    const config = this.configs.get(pluginId)

    if (plugin && config) {
      plugin.enabled = enabled
      config.enabled = enabled
      this.saveConfigs()

      if (enabled) {
        plugin.onActivate?.()
      } else {
        plugin.onDeactivate?.()
      }

      this.renderPluginPanel()
    }
  }

  /**
   * Set active session ID (for context)
   */
  setActiveSession(sessionId: string | null): void {
    this.activeSessionId = sessionId
    // Notify all plugins of session change
    for (const plugin of this.plugins.values()) {
      if (plugin.enabled) {
        plugin.onUpdate?.({ sessionId })
      }
    }
  }

  // ===========================================================================
  // Plugin Context
  // ===========================================================================

  /**
   * Get the plugin context
   */
  getContext(): PluginContext {
    return {
      emit: <K extends keyof PluginEvents>(event: K, data: PluginEvents[K]) => {
        this.emit(event, data)
      },
      on: <K extends keyof PluginEvents>(event: K, handler: (data: PluginEvents[K]) => void) => {
        return this.on(event, handler)
      },
      getActiveSessionId: () => this.activeSessionId,
      getSettings: <T>(pluginId: string): T | null => {
        const config = this.configs.get(pluginId)
        return (config?.settings as T) ?? null
      },
      saveSettings: <T>(pluginId: string, settings: T): void => {
        const config = this.configs.get(pluginId)
        if (config) {
          config.settings = settings as Record<string, unknown>
          this.saveConfigs()
        }
      },
    }
  }

  // ===========================================================================
  // Event System
  // ===========================================================================

  /**
   * Emit an event
   */
  emit<K extends keyof PluginEvents>(event: K, data: PluginEvents[K]): void {
    const handlers = this.eventHandlers.get(event)
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data)
        } catch (e) {
          console.error(`Plugin event handler error for ${event}:`, e)
        }
      }
    }
  }

  /**
   * Subscribe to an event
   */
  on<K extends keyof PluginEvents>(event: K, handler: (data: PluginEvents[K]) => void): () => void {
    let handlers = this.eventHandlers.get(event)
    if (!handlers) {
      handlers = new Set()
      this.eventHandlers.set(event, handlers)
    }
    handlers.add(handler as EventHandler<unknown>)

    return () => {
      handlers?.delete(handler as EventHandler<unknown>)
    }
  }

  // ===========================================================================
  // Rendering
  // ===========================================================================

  /**
   * Render the plugin panel
   */
  private renderPluginPanel(): void {
    if (!this.container) return

    this.container.textContent = ''

    const plugins = this.getPlugins()
    if (plugins.length === 0) return

    // Create plugin panel
    const panel = document.createElement('div')
    panel.className = 'plugin-panel'

    // Header
    const header = document.createElement('div')
    header.className = 'plugin-panel-header'
    const title = document.createElement('span')
    title.className = 'plugin-panel-title'
    title.textContent = 'Plugins'
    header.appendChild(title)
    panel.appendChild(header)

    // Plugin list
    const list = document.createElement('div')
    list.className = 'plugin-list'

    for (const plugin of plugins) {
      const item = document.createElement('div')
      item.className = `plugin-item ${plugin.enabled ? 'enabled' : 'disabled'}`

      // Plugin header with toggle
      const itemHeader = document.createElement('div')
      itemHeader.className = 'plugin-item-header'

      const icon = document.createElement('span')
      icon.className = 'plugin-icon'
      icon.textContent = plugin.icon
      itemHeader.appendChild(icon)

      const name = document.createElement('span')
      name.className = 'plugin-name'
      name.textContent = plugin.name
      itemHeader.appendChild(name)

      const toggleBtn = document.createElement('button')
      toggleBtn.className = 'plugin-toggle'
      toggleBtn.title = plugin.enabled ? 'Disable' : 'Enable'
      toggleBtn.textContent = plugin.enabled ? '✓' : '○'
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        this.setEnabled(plugin.id, !plugin.enabled)
      })
      itemHeader.appendChild(toggleBtn)

      item.appendChild(itemHeader)

      // Plugin content (only if enabled)
      if (plugin.enabled) {
        const content = document.createElement('div')
        content.className = 'plugin-content'
        plugin.render(content)
        item.appendChild(content)
      }

      list.appendChild(item)
    }

    panel.appendChild(list)
    this.container.appendChild(panel)
  }

  /**
   * Force re-render of plugin panel
   */
  refresh(): void {
    this.renderPluginPanel()
  }
}

// Singleton instance
export const pluginManager = new PluginManager()
