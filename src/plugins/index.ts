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

// Plugin instances for direct access
let modelPlugin: ModelSelectorPlugin | null = null
let thinkingPlugin: ThinkingTogglePlugin | null = null
let mcpPlugin: MCPListPlugin | null = null

/**
 * Initialize all default plugins (legacy - for backward compatibility)
 */
export function initializePlugins(container: HTMLElement): void {
  pluginManager.init(container)

  const context = pluginManager.getContext()

  // Register default plugins
  modelPlugin = new ModelSelectorPlugin(context)
  thinkingPlugin = new ThinkingTogglePlugin(context)
  mcpPlugin = new MCPListPlugin(context)

  pluginManager.register(modelPlugin)
  pluginManager.register(thinkingPlugin)
  pluginManager.register(mcpPlugin)
}

/**
 * Create a session setting item with icon and label
 */
function createSettingItem(icon: string, label: string, contentId: string): HTMLElement {
  const section = document.createElement('div')
  section.className = 'session-setting-item'

  const header = document.createElement('div')
  header.className = 'session-setting-header'

  const iconSpan = document.createElement('span')
  iconSpan.className = 'session-setting-icon'
  iconSpan.textContent = icon
  header.appendChild(iconSpan)

  const labelSpan = document.createElement('span')
  labelSpan.className = 'session-setting-label'
  labelSpan.textContent = label
  header.appendChild(labelSpan)

  section.appendChild(header)

  const content = document.createElement('div')
  content.className = 'session-setting-content'
  content.id = contentId
  section.appendChild(content)

  return section
}

/**
 * Initialize plugins into modal tabs (new approach)
 * - Session settings tab: Model selector + Thinking toggle
 * - MCP tab: MCP server list
 */
export function initializePluginsInModal(): void {
  const sessionContainer = document.getElementById('session-settings-container')
  const mcpContainer = document.getElementById('mcp-servers-list')

  if (!sessionContainer) {
    console.warn('Could not find #session-settings-container')
    return
  }

  const context = pluginManager.getContext()

  // Create plugin instances
  modelPlugin = new ModelSelectorPlugin(context)
  thinkingPlugin = new ThinkingTogglePlugin(context)
  mcpPlugin = new MCPListPlugin(context)

  // Render session settings (Model + Thinking)
  renderSessionSettings(sessionContainer, modelPlugin, thinkingPlugin)

  // Render MCP list into its tab
  if (mcpContainer) {
    renderMCPList(mcpContainer, mcpPlugin)
  }

  // Register plugins with manager for state persistence
  pluginManager.registerWithoutRender(modelPlugin)
  pluginManager.registerWithoutRender(thinkingPlugin)
  pluginManager.registerWithoutRender(mcpPlugin)
}

/**
 * Render session settings (Model + Thinking) into container
 */
function renderSessionSettings(
  container: HTMLElement,
  modelPlugin: ModelSelectorPlugin,
  thinkingPlugin: ThinkingTogglePlugin
): void {
  container.textContent = ''

  // Model selector section
  const modelSection = createSettingItem('🤖', 'Model', 'model-plugin-content')
  container.appendChild(modelSection)

  const modelContent = modelSection.querySelector('#model-plugin-content')
  if (modelContent) {
    modelPlugin.render(modelContent as HTMLElement)
  }

  // Thinking toggle section
  const thinkingSection = createSettingItem('💭', 'Extended Thinking', 'thinking-plugin-content')
  container.appendChild(thinkingSection)

  const thinkingContent = thinkingSection.querySelector('#thinking-plugin-content')
  if (thinkingContent) {
    thinkingPlugin.render(thinkingContent as HTMLElement)
  }
}

/**
 * Render MCP list into container
 */
function renderMCPList(container: HTMLElement, mcpPlugin: MCPListPlugin): void {
  // Keep existing empty message, MCP plugin will replace it
  mcpPlugin.render(container)
}

/**
 * Refresh MCP list (called when new MCP servers are detected)
 */
export function refreshMCPList(): void {
  const mcpContainer = document.getElementById('mcp-servers-list')
  if (mcpContainer && mcpPlugin) {
    renderMCPList(mcpContainer, mcpPlugin)
  }
}

/**
 * Get plugin by ID with type safety
 */
export function getPlugin<T>(id: string): T | undefined {
  const plugins = pluginManager.getPlugins()
  return plugins.find((p) => p.id === id) as T | undefined
}
