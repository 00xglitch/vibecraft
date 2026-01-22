/**
 * Plugin System
 *
 * Export all plugin-related modules and initialize default plugins.
 */

export * from './types'
export { pluginManager } from './PluginManager'
export { ModelSelectorPlugin } from './ModelSelectorPlugin'
export { ThinkingTogglePlugin } from './ThinkingTogglePlugin'
export { MCPListPlugin } from './MCPListPlugin'

import { pluginManager } from './PluginManager'
import { ModelSelectorPlugin } from './ModelSelectorPlugin'
import { ThinkingTogglePlugin } from './ThinkingTogglePlugin'
import { MCPListPlugin } from './MCPListPlugin'

/**
 * Initialize all default plugins
 */
export function initializePlugins(container: HTMLElement): void {
  pluginManager.init(container)

  const context = pluginManager.getContext()

  // Register default plugins
  pluginManager.register(new ModelSelectorPlugin(context))
  pluginManager.register(new ThinkingTogglePlugin(context))
  pluginManager.register(new MCPListPlugin(context))
}

/**
 * Get plugin by ID with type safety
 */
export function getPlugin<T>(id: string): T | undefined {
  const plugins = pluginManager.getPlugins()
  return plugins.find(p => p.id === id) as T | undefined
}
