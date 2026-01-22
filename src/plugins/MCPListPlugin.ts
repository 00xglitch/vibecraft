/**
 * MCP List Plugin
 *
 * Displays connected MCP servers and their tools.
 * Allows filtering activity by MCP server.
 */

import type { Plugin, PluginContext } from './types'
import { mcpRegistry, type MCPServerInfo } from '../mcp/MCPRegistry'

export class MCPListPlugin implements Plugin {
  id = 'mcp-list'
  name = 'MCP Servers'
  icon = '🔌'
  description = 'View connected MCP servers'
  enabled = true
  priority = 30

  private context: PluginContext | null = null
  private container: HTMLElement | null = null
  private unsubscribe: (() => void) | null = null

  constructor(context: PluginContext) {
    this.context = context
  }

  render(container: HTMLElement): void {
    this.container = container
    this.updateDisplay()

    // Subscribe to registry changes
    mcpRegistry.onRegistryChange(() => {
      this.updateDisplay()
    })
  }

  private updateDisplay(): void {
    if (!this.container) return

    this.container.textContent = ''

    const servers = mcpRegistry.getServers()

    if (servers.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'mcp-empty'
      empty.textContent = 'No MCP servers detected'
      this.container.appendChild(empty)
      return
    }

    const list = document.createElement('div')
    list.className = 'mcp-server-list'

    for (const server of servers) {
      const item = this.createServerItem(server)
      list.appendChild(item)
    }

    this.container.appendChild(list)

    // Stats footer
    const stats = mcpRegistry.getStats()
    const footer = document.createElement('div')
    footer.className = 'mcp-stats'
    footer.textContent = `${stats.serverCount} servers, ${stats.toolCount} tools`
    this.container.appendChild(footer)
  }

  private createServerItem(server: MCPServerInfo): HTMLElement {
    const item = document.createElement('div')
    item.className = 'mcp-server-item'

    // Server header
    const header = document.createElement('div')
    header.className = 'mcp-server-header'

    const icon = document.createElement('span')
    icon.className = 'mcp-server-icon'
    icon.textContent = this.getCategoryIcon(server.category)
    header.appendChild(icon)

    const name = document.createElement('span')
    name.className = 'mcp-server-name'
    name.textContent = server.name
    header.appendChild(name)

    const count = document.createElement('span')
    count.className = 'mcp-tool-count'
    count.textContent = `(${server.tools.length})`
    header.appendChild(count)

    item.appendChild(header)

    // Click to select/filter
    item.addEventListener('click', () => {
      this.context?.emit('mcp:select', { server: server.name })
      // Toggle selected state
      item.classList.toggle('selected')
    })

    // Tooltip with tools
    item.title = `Tools: ${server.tools.join(', ')}`

    return item
  }

  private getCategoryIcon(category: string): string {
    const icons: Record<string, string> = {
      browser: '🌐',
      database: '🗄️',
      filesystem: '📁',
      search: '🔍',
      memory: '🧠',
      api: '⚡',
      git: '📦',
      ai: '🤖',
      other: '🔧',
    }
    return icons[category] || '🔧'
  }

  onUpdate(): void {
    this.updateDisplay()
  }

  destroy(): void {
    this.unsubscribe?.()
  }
}
