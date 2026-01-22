/**
 * Plugin System Types
 *
 * Defines the interface for Vibecraft plugins that extend the UI
 * with additional controls and functionality.
 */

export interface Plugin {
  /** Unique plugin identifier */
  id: string
  /** Display name */
  name: string
  /** Icon (emoji or SVG) */
  icon: string
  /** Plugin description */
  description: string
  /** Whether plugin is enabled */
  enabled: boolean
  /** Plugin priority (lower = higher in list) */
  priority?: number

  /**
   * Render the plugin UI into the container
   * @param container The DOM element to render into
   */
  render(container: HTMLElement): void

  /**
   * Called when plugin is activated/enabled
   */
  onActivate?(): void

  /**
   * Called when plugin is deactivated/disabled
   */
  onDeactivate?(): void

  /**
   * Called when plugin should update its display
   * @param data Optional data to update with
   */
  onUpdate?(data?: unknown): void

  /**
   * Cleanup when plugin is destroyed
   */
  destroy?(): void
}

/** Plugin configuration stored in localStorage */
export interface PluginConfig {
  id: string
  enabled: boolean
  settings?: Record<string, unknown>
}

/** Events emitted by plugins */
export interface PluginEvents {
  /** Model changed */
  'model:change': { model: 'sonnet' | 'opus' | 'haiku' }
  /** Thinking mode toggled */
  'thinking:toggle': { enabled: boolean }
  /** MCP server selected */
  'mcp:select': { server: string }
}

/** Plugin context provided to plugins */
export interface PluginContext {
  /** Emit an event */
  emit<K extends keyof PluginEvents>(event: K, data: PluginEvents[K]): void
  /** Subscribe to an event */
  on<K extends keyof PluginEvents>(event: K, handler: (data: PluginEvents[K]) => void): () => void
  /** Get current session ID */
  getActiveSessionId(): string | null
  /** Get plugin settings */
  getSettings<T>(pluginId: string): T | null
  /** Save plugin settings */
  saveSettings<T>(pluginId: string, settings: T): void
}
