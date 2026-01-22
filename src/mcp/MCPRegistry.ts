/**
 * MCP Registry
 *
 * Tracks MCP servers and tools dynamically based on observed tool usage.
 * Categorizes MCP tools to appropriate stations in the 3D workshop.
 */

import type { StationType } from '../../shared/types.js'

// ============================================================================
// Types
// ============================================================================

/** Parsed MCP tool identifier */
export interface MCPToolInfo {
  /** Full tool name (e.g., "mcp__playwright__browser_click") */
  fullName: string
  /** MCP server name (e.g., "playwright") */
  server: string
  /** Tool name within the server (e.g., "browser_click") */
  tool: string
  /** Tool category for station mapping */
  category: MCPToolCategory
  /** First seen timestamp */
  firstSeen: number
  /** Last used timestamp */
  lastUsed: number
  /** Usage count */
  useCount: number
}

/** MCP server info */
export interface MCPServerInfo {
  /** Server name */
  name: string
  /** All tools from this server */
  tools: string[]
  /** Primary category for this server */
  category: MCPToolCategory
  /** First seen timestamp */
  firstSeen: number
  /** Last activity timestamp */
  lastActivity: number
}

/** Categories for MCP tools */
export type MCPToolCategory =
  | 'browser' // mcp__playwright__*, browser automation
  | 'database' // mcp__*__query*, database operations
  | 'filesystem' // mcp__serena__*, file operations
  | 'search' // mcp__context7__*, search/documentation
  | 'memory' // mcp__*memory*__*, memory/context storage
  | 'api' // mcp__*__fetch*, API calls
  | 'git' // mcp__*__git*, version control
  | 'ai' // mcp__*__complete*, AI operations
  | 'other' // uncategorized

/** Station mappings for MCP categories */
const MCP_CATEGORY_STATIONS: Record<MCPToolCategory, StationType> = {
  browser: 'center', // Future: browser station
  database: 'scanner', // Search/query operations
  filesystem: 'bookshelf', // File operations
  search: 'antenna', // External data
  memory: 'bookshelf', // Data storage
  api: 'antenna', // External APIs
  git: 'terminal', // Version control
  ai: 'portal', // AI operations
  other: 'center', // Default
}

// ============================================================================
// Category Detection Rules
// ============================================================================

interface CategoryRule {
  category: MCPToolCategory
  /** Match patterns - server name or tool name contains these */
  serverPatterns?: RegExp[]
  toolPatterns?: RegExp[]
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: 'browser',
    serverPatterns: [/playwright/i, /puppeteer/i, /browser/i, /chrome/i, /selenium/i],
    toolPatterns: [/browser_/i, /page_/i, /click/i, /navigate/i, /screenshot/i],
  },
  {
    category: 'database',
    serverPatterns: [/postgres/i, /mysql/i, /mongo/i, /redis/i, /sql/i, /database/i, /db/i],
    toolPatterns: [/query/i, /select/i, /insert/i, /update/i, /delete/i, /execute/i],
  },
  {
    category: 'filesystem',
    serverPatterns: [/serena/i, /filesystem/i, /file/i],
    toolPatterns: [/read_file/i, /write_file/i, /list_dir/i, /find_file/i, /create.*file/i],
  },
  {
    category: 'search',
    serverPatterns: [/context7/i, /search/i, /docs/i, /greptile/i],
    toolPatterns: [/search/i, /query.*docs/i, /resolve.*library/i],
  },
  {
    category: 'memory',
    serverPatterns: [/memory/i, /pinecone/i, /openmemory/i, /vector/i],
    toolPatterns: [/memory/i, /remember/i, /recall/i, /store/i, /embed/i],
  },
  {
    category: 'api',
    serverPatterns: [/api/i, /rest/i, /http/i, /firebase/i],
    toolPatterns: [/fetch/i, /request/i, /call/i, /invoke/i],
  },
  {
    category: 'git',
    serverPatterns: [/git/i, /github/i, /gitlab/i],
    toolPatterns: [/commit/i, /push/i, /pull/i, /branch/i, /merge/i, /clone/i],
  },
  {
    category: 'ai',
    serverPatterns: [/anthropic/i, /openai/i, /claude/i, /gpt/i, /llm/i],
    toolPatterns: [/complete/i, /generate/i, /chat/i, /inference/i],
  },
]

// ============================================================================
// MCP Registry Class
// ============================================================================

export class MCPRegistry {
  private servers: Map<string, MCPServerInfo> = new Map()
  private tools: Map<string, MCPToolInfo> = new Map()
  private onChange: (() => void) | null = null

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  /**
   * Set callback for registry changes
   */
  onRegistryChange(callback: () => void): void {
    this.onChange = callback
  }

  // ==========================================================================
  // Tool Parsing
  // ==========================================================================

  /**
   * Check if a tool name is an MCP tool
   */
  isMCPTool(toolName: string): boolean {
    return toolName.startsWith('mcp__')
  }

  /**
   * Parse MCP tool name into components
   * Format: mcp__servername__toolname
   */
  parseToolName(toolName: string): { server: string; tool: string } | null {
    if (!this.isMCPTool(toolName)) {
      return null
    }

    // Split on double underscore
    const parts = toolName.split('__')
    if (parts.length < 3) {
      return null
    }

    // mcp__server__tool or mcp__plugin_namespace_server__tool
    const server = parts[1]
    const tool = parts.slice(2).join('__') // Rejoin in case tool name has __

    return { server, tool }
  }

  /**
   * Detect category for an MCP tool
   */
  detectCategory(server: string, tool: string): MCPToolCategory {
    for (const rule of CATEGORY_RULES) {
      // Check server patterns
      if (rule.serverPatterns) {
        for (const pattern of rule.serverPatterns) {
          if (pattern.test(server)) {
            return rule.category
          }
        }
      }

      // Check tool patterns
      if (rule.toolPatterns) {
        for (const pattern of rule.toolPatterns) {
          if (pattern.test(tool)) {
            return rule.category
          }
        }
      }
    }

    return 'other'
  }

  // ==========================================================================
  // Registration
  // ==========================================================================

  /**
   * Register an MCP tool (called when tool is used)
   */
  registerTool(fullToolName: string): MCPToolInfo | null {
    const parsed = this.parseToolName(fullToolName)
    if (!parsed) {
      return null
    }

    const { server, tool } = parsed
    const category = this.detectCategory(server, tool)
    const now = Date.now()

    // Update or create tool info
    let toolInfo = this.tools.get(fullToolName)
    if (toolInfo) {
      toolInfo.lastUsed = now
      toolInfo.useCount++
    } else {
      toolInfo = {
        fullName: fullToolName,
        server,
        tool,
        category,
        firstSeen: now,
        lastUsed: now,
        useCount: 1,
      }
      this.tools.set(fullToolName, toolInfo)
    }

    // Update server info
    let serverInfo = this.servers.get(server)
    if (serverInfo) {
      if (!serverInfo.tools.includes(tool)) {
        serverInfo.tools.push(tool)
      }
      serverInfo.lastActivity = now
    } else {
      serverInfo = {
        name: server,
        tools: [tool],
        category,
        firstSeen: now,
        lastActivity: now,
      }
      this.servers.set(server, serverInfo)
    }

    this.onChange?.()
    return toolInfo
  }

  // ==========================================================================
  // Queries
  // ==========================================================================

  /**
   * Get station type for an MCP tool
   */
  getStationForMCPTool(toolName: string): StationType {
    const toolInfo = this.tools.get(toolName)
    if (toolInfo) {
      return MCP_CATEGORY_STATIONS[toolInfo.category]
    }

    // Parse and detect on the fly
    const parsed = this.parseToolName(toolName)
    if (parsed) {
      const category = this.detectCategory(parsed.server, parsed.tool)
      return MCP_CATEGORY_STATIONS[category]
    }

    return 'center'
  }

  /**
   * Get all registered servers
   */
  getServers(): MCPServerInfo[] {
    return Array.from(this.servers.values())
  }

  /**
   * Get server by name
   */
  getServer(name: string): MCPServerInfo | undefined {
    return this.servers.get(name)
  }

  /**
   * Get all registered tools
   */
  getTools(): MCPToolInfo[] {
    return Array.from(this.tools.values())
  }

  /**
   * Get tools for a specific server
   */
  getToolsForServer(serverName: string): MCPToolInfo[] {
    return Array.from(this.tools.values()).filter((t) => t.server === serverName)
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: MCPToolCategory): MCPToolInfo[] {
    return Array.from(this.tools.values()).filter((t) => t.category === category)
  }

  /**
   * Get statistics
   */
  getStats(): {
    serverCount: number
    toolCount: number
    categoryCounts: Record<MCPToolCategory, number>
    mostUsedTools: MCPToolInfo[]
  } {
    const tools = this.getTools()
    const categoryCounts: Record<MCPToolCategory, number> = {
      browser: 0,
      database: 0,
      filesystem: 0,
      search: 0,
      memory: 0,
      api: 0,
      git: 0,
      ai: 0,
      other: 0,
    }

    for (const tool of tools) {
      categoryCounts[tool.category]++
    }

    const mostUsedTools = [...tools].sort((a, b) => b.useCount - a.useCount).slice(0, 10)

    return {
      serverCount: this.servers.size,
      toolCount: this.tools.size,
      categoryCounts,
      mostUsedTools,
    }
  }

  /**
   * Clear all registered data
   */
  clear(): void {
    this.servers.clear()
    this.tools.clear()
    this.onChange?.()
  }
}

// Singleton instance
export const mcpRegistry = new MCPRegistry()
