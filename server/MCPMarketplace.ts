/**
 * MCP Marketplace Service
 *
 * Fetches MCP servers from community registries, manages installation,
 * and tracks installed servers. Supports multiple registries including
 * mcp-get, smithery, and awesome-mcp.
 */

import * as fs from 'fs'
import * as path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execPromise = promisify(exec)

// ============================================================================
// Types
// ============================================================================

export interface MCPServer {
  /** Unique identifier (usually npm package name) */
  id: string
  /** Display name */
  name: string
  /** Description */
  description: string
  /** Installation source (npm, github, local) */
  source: 'npm' | 'github' | 'local'
  /** Package name or URL */
  package: string
  /** Version (latest if not specified) */
  version?: string
  /** Author/maintainer */
  author?: string
  /** Categories/tags */
  categories: string[]
  /** Number of downloads/stars (for ranking) */
  popularity?: number
  /** Official Anthropic server */
  official?: boolean
  /** Required environment variables */
  envVars?: string[]
  /** Installation command override */
  installCommand?: string
  /** Configuration example */
  configExample?: Record<string, unknown>
}

export interface InstalledMCPServer extends MCPServer {
  /** Installation timestamp */
  installedAt: number
  /** Configured environment variables */
  configuredEnv: Record<string, string>
  /** Server status */
  status: 'installed' | 'configured' | 'running' | 'error'
  /** Last error message */
  lastError?: string
}

export interface MCPRegistry {
  id: string
  name: string
  url: string
  description: string
}

// ============================================================================
// Constants
// ============================================================================

const CLAUDE_SETTINGS_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE || '~',
  '.claude',
  'settings.json'
)

const MARKETPLACE_CACHE_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE || '~',
  '.vibecraft',
  'data',
  'mcp-marketplace-cache.json'
)

const INSTALLED_SERVERS_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE || '~',
  '.vibecraft',
  'data',
  'mcp-installed.json'
)

/** Known MCP registries */
export const MCP_REGISTRIES: MCPRegistry[] = [
  {
    id: 'awesome-mcp',
    name: 'Awesome MCP',
    url: 'https://raw.githubusercontent.com/modelcontextprotocol/awesome-mcp/main/README.md',
    description: 'Curated list from MCP GitHub',
  },
  {
    id: 'smithery',
    name: 'Smithery',
    url: 'https://smithery.ai/api/servers',
    description: 'Smithery MCP server registry',
  },
  {
    id: 'mcp-get',
    name: 'MCP Get',
    url: 'https://api.mcp.run/v1/servers',
    description: 'mcp.run server catalog',
  },
]

/** Popular/featured servers (hardcoded fallback) */
export const FEATURED_SERVERS: MCPServer[] = [
  {
    id: '@anthropic/mcp-server-memory',
    name: 'Memory',
    description: 'Persistent memory storage for Claude',
    source: 'npm',
    package: '@anthropic/mcp-server-memory',
    categories: ['memory', 'storage'],
    official: true,
  },
  {
    id: '@anthropic/mcp-server-filesystem',
    name: 'Filesystem',
    description: 'Local filesystem access',
    source: 'npm',
    package: '@anthropic/mcp-server-filesystem',
    categories: ['filesystem', 'files'],
    official: true,
    configExample: {
      args: ['--allow', '/path/to/allowed/directory'],
    },
  },
  {
    id: '@anthropic/mcp-server-github',
    name: 'GitHub',
    description: 'GitHub API integration',
    source: 'npm',
    package: '@anthropic/mcp-server-github',
    categories: ['git', 'api', 'github'],
    official: true,
    envVars: ['GITHUB_TOKEN'],
  },
  {
    id: '@anthropic/mcp-server-postgres',
    name: 'PostgreSQL',
    description: 'PostgreSQL database access',
    source: 'npm',
    package: '@anthropic/mcp-server-postgres',
    categories: ['database', 'sql'],
    official: true,
    envVars: ['POSTGRES_CONNECTION_STRING'],
  },
  {
    id: '@anthropic/mcp-server-sqlite',
    name: 'SQLite',
    description: 'SQLite database access',
    source: 'npm',
    package: '@anthropic/mcp-server-sqlite',
    categories: ['database', 'sql'],
    official: true,
  },
  {
    id: '@anthropic/mcp-server-puppeteer',
    name: 'Puppeteer',
    description: 'Browser automation with Puppeteer',
    source: 'npm',
    package: '@anthropic/mcp-server-puppeteer',
    categories: ['browser', 'automation'],
    official: true,
  },
  {
    id: '@anthropic/mcp-server-brave-search',
    name: 'Brave Search',
    description: 'Web search via Brave Search API',
    source: 'npm',
    package: '@anthropic/mcp-server-brave-search',
    categories: ['search', 'web'],
    official: true,
    envVars: ['BRAVE_API_KEY'],
  },
  {
    id: '@anthropic/mcp-server-slack',
    name: 'Slack',
    description: 'Slack workspace integration',
    source: 'npm',
    package: '@anthropic/mcp-server-slack',
    categories: ['messaging', 'api'],
    official: true,
    envVars: ['SLACK_BOT_TOKEN'],
  },
  {
    id: 'mcp-obsidian',
    name: 'Obsidian',
    description: 'Obsidian vault access',
    source: 'npm',
    package: 'mcp-obsidian',
    categories: ['notes', 'markdown'],
  },
  {
    id: 'mcp-server-linear',
    name: 'Linear',
    description: 'Linear issue tracking',
    source: 'npm',
    package: 'mcp-server-linear',
    categories: ['project-management', 'api'],
    envVars: ['LINEAR_API_KEY'],
  },
]

// ============================================================================
// MCPMarketplace Class
// ============================================================================

export class MCPMarketplace {
  private servers: MCPServer[] = []
  private installed: Map<string, InstalledMCPServer> = new Map()
  private lastFetch: number = 0
  private cacheMaxAge: number = 3600000 // 1 hour

  constructor() {
    this.loadCache()
    this.loadInstalled()
  }

  // ==========================================================================
  // Fetching Servers
  // ==========================================================================

  /**
   * Get all available servers (cached)
   */
  async getServers(forceRefresh = false): Promise<MCPServer[]> {
    const now = Date.now()

    if (!forceRefresh && this.servers.length > 0 && now - this.lastFetch < this.cacheMaxAge) {
      return this.servers
    }

    // Try to fetch from registries
    const fetched = await this.fetchFromRegistries()

    if (fetched.length > 0) {
      this.servers = fetched
      this.lastFetch = now
      this.saveCache()
    } else if (this.servers.length === 0) {
      // Fallback to featured servers
      this.servers = [...FEATURED_SERVERS]
    }

    return this.servers
  }

  /**
   * Search servers by query
   */
  async search(query: string): Promise<MCPServer[]> {
    const servers = await this.getServers()
    const q = query.toLowerCase()

    return servers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.categories.some((c) => c.toLowerCase().includes(q))
    )
  }

  /**
   * Get servers by category
   */
  async getByCategory(category: string): Promise<MCPServer[]> {
    const servers = await this.getServers()
    return servers.filter((s) => s.categories.includes(category.toLowerCase()))
  }

  /**
   * Get featured/popular servers
   */
  async getFeatured(): Promise<MCPServer[]> {
    const servers = await this.getServers()
    return servers.filter((s) => s.official || (s.popularity && s.popularity > 1000))
  }

  /**
   * Get all categories
   */
  async getCategories(): Promise<{ name: string; count: number }[]> {
    const servers = await this.getServers()
    const counts = new Map<string, number>()

    for (const server of servers) {
      for (const cat of server.categories) {
        counts.set(cat, (counts.get(cat) || 0) + 1)
      }
    }

    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  }

  // ==========================================================================
  // Installation
  // ==========================================================================

  /**
   * Install an MCP server
   */
  async install(
    serverId: string,
    envVars?: Record<string, string>
  ): Promise<{ ok: boolean; server?: InstalledMCPServer; error?: string }> {
    const server = this.servers.find((s) => s.id === serverId)
    if (!server) {
      return { ok: false, error: 'Server not found' }
    }

    try {
      // Install the package
      const installCmd =
        server.installCommand ||
        (server.source === 'npm'
          ? `npm install -g ${server.package}`
          : `npm install -g ${server.package}`)

      console.log(`[MCPMarketplace] Installing: ${installCmd}`)
      await execPromise(installCmd, { timeout: 120000 })

      // Create installed record
      const installed: InstalledMCPServer = {
        ...server,
        installedAt: Date.now(),
        configuredEnv: envVars || {},
        status: envVars && Object.keys(envVars).length > 0 ? 'configured' : 'installed',
      }

      this.installed.set(serverId, installed)
      this.saveInstalled()

      // Add to Claude settings
      await this.addToClaudeSettings(installed)

      return { ok: true, server: installed }
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Unknown error'
      console.error(`[MCPMarketplace] Install failed: ${error}`)
      return { ok: false, error }
    }
  }

  /**
   * Uninstall an MCP server
   */
  async uninstall(serverId: string): Promise<{ ok: boolean; error?: string }> {
    const installed = this.installed.get(serverId)
    if (!installed) {
      return { ok: false, error: 'Server not installed' }
    }

    try {
      // Remove from Claude settings first
      await this.removeFromClaudeSettings(serverId)

      // Uninstall the package
      if (installed.source === 'npm') {
        await execPromise(`npm uninstall -g ${installed.package}`, { timeout: 60000 })
      }

      this.installed.delete(serverId)
      this.saveInstalled()

      return { ok: true }
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Unknown error'
      console.error(`[MCPMarketplace] Uninstall failed: ${error}`)
      return { ok: false, error }
    }
  }

  /**
   * Get installed servers
   */
  getInstalled(): InstalledMCPServer[] {
    return Array.from(this.installed.values())
  }

  /**
   * Check if a server is installed
   */
  isInstalled(serverId: string): boolean {
    return this.installed.has(serverId)
  }

  /**
   * Update server configuration (env vars)
   */
  async configure(
    serverId: string,
    envVars: Record<string, string>
  ): Promise<{ ok: boolean; error?: string }> {
    const installed = this.installed.get(serverId)
    if (!installed) {
      return { ok: false, error: 'Server not installed' }
    }

    installed.configuredEnv = envVars
    installed.status = Object.keys(envVars).length > 0 ? 'configured' : 'installed'
    this.saveInstalled()

    // Update Claude settings
    await this.addToClaudeSettings(installed)

    return { ok: true }
  }

  // ==========================================================================
  // Claude Settings Integration
  // ==========================================================================

  /**
   * Add server to Claude's settings.json
   */
  private async addToClaudeSettings(server: InstalledMCPServer): Promise<void> {
    try {
      let settings: Record<string, unknown> = {}

      if (fs.existsSync(CLAUDE_SETTINGS_PATH)) {
        settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS_PATH, 'utf8'))
      }

      // Initialize mcpServers if needed
      if (!settings.mcpServers) {
        settings.mcpServers = {}
      }

      const mcpServers = settings.mcpServers as Record<string, unknown>

      // Create server config
      const serverConfig: Record<string, unknown> = {
        command: 'npx',
        args: ['-y', server.package],
      }

      // Add environment variables
      if (Object.keys(server.configuredEnv).length > 0) {
        serverConfig.env = server.configuredEnv
      }

      // Add config example args if present
      if (server.configExample?.args) {
        serverConfig.args = ['-y', server.package, ...(server.configExample.args as string[])]
      }

      mcpServers[server.id] = serverConfig

      // Ensure directory exists
      const dir = path.dirname(CLAUDE_SETTINGS_PATH)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      fs.writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2))
      console.log(`[MCPMarketplace] Added ${server.id} to Claude settings`)
    } catch (e) {
      console.error('[MCPMarketplace] Failed to update Claude settings:', e)
    }
  }

  /**
   * Remove server from Claude's settings.json
   */
  private async removeFromClaudeSettings(serverId: string): Promise<void> {
    try {
      if (!fs.existsSync(CLAUDE_SETTINGS_PATH)) return

      const settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS_PATH, 'utf8'))

      if (settings.mcpServers && settings.mcpServers[serverId]) {
        delete settings.mcpServers[serverId]
        fs.writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2))
        console.log(`[MCPMarketplace] Removed ${serverId} from Claude settings`)
      }
    } catch (e) {
      console.error('[MCPMarketplace] Failed to update Claude settings:', e)
    }
  }

  // ==========================================================================
  // Registry Fetching
  // ==========================================================================

  /**
   * Fetch servers from all registries
   */
  private async fetchFromRegistries(): Promise<MCPServer[]> {
    const allServers: MCPServer[] = [...FEATURED_SERVERS]
    const seen = new Set(allServers.map((s) => s.id))

    // Try each registry
    for (const registry of MCP_REGISTRIES) {
      try {
        const servers = await this.fetchRegistry(registry)
        for (const server of servers) {
          if (!seen.has(server.id)) {
            allServers.push(server)
            seen.add(server.id)
          }
        }
      } catch (e) {
        console.warn(`[MCPMarketplace] Failed to fetch ${registry.name}:`, e)
      }
    }

    return allServers
  }

  /**
   * Fetch servers from a specific registry
   */
  private async fetchRegistry(registry: MCPRegistry): Promise<MCPServer[]> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    try {
      const response = await fetch(registry.url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()

      // Parse based on registry type
      if (registry.id === 'smithery') {
        return this.parseSmitheryResponse(data)
      } else if (registry.id === 'mcp-get') {
        return this.parseMCPGetResponse(data)
      }

      return []
    } finally {
      clearTimeout(timeout)
    }
  }

  private parseSmitheryResponse(data: unknown): MCPServer[] {
    if (!Array.isArray(data)) return []

    return data
      .filter((item: Record<string, unknown>) => item.name && item.package)
      .map((item: Record<string, unknown>) => ({
        id: (item.package as string) || (item.name as string),
        name: item.name as string,
        description: (item.description as string) || '',
        source: 'npm' as const,
        package: item.package as string,
        categories: (item.categories as string[]) || [],
        author: item.author as string | undefined,
        popularity: item.downloads as number | undefined,
      }))
  }

  private parseMCPGetResponse(data: unknown): MCPServer[] {
    const items = Array.isArray(data) ? data : (data as Record<string, unknown>).servers

    if (!Array.isArray(items)) return []

    return items
      .filter((item: Record<string, unknown>) => item.id || item.name)
      .map((item: Record<string, unknown>) => ({
        id: (item.id as string) || (item.name as string),
        name: item.name as string,
        description: (item.description as string) || '',
        source: 'npm' as const,
        package: (item.package as string) || (item.name as string),
        categories: (item.tags as string[]) || [],
        author: item.author as string | undefined,
        popularity: item.stars as number | undefined,
      }))
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  private loadCache(): void {
    try {
      if (fs.existsSync(MARKETPLACE_CACHE_PATH)) {
        const data = JSON.parse(fs.readFileSync(MARKETPLACE_CACHE_PATH, 'utf8'))
        this.servers = data.servers || []
        this.lastFetch = data.lastFetch || 0
      }
    } catch {
      console.warn('[MCPMarketplace] Failed to load cache')
    }
  }

  private saveCache(): void {
    try {
      const dir = path.dirname(MARKETPLACE_CACHE_PATH)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      fs.writeFileSync(
        MARKETPLACE_CACHE_PATH,
        JSON.stringify({
          servers: this.servers,
          lastFetch: this.lastFetch,
        })
      )
    } catch {
      console.warn('[MCPMarketplace] Failed to save cache')
    }
  }

  private loadInstalled(): void {
    try {
      if (fs.existsSync(INSTALLED_SERVERS_PATH)) {
        const data = JSON.parse(fs.readFileSync(INSTALLED_SERVERS_PATH, 'utf8'))
        if (Array.isArray(data.installed)) {
          for (const server of data.installed) {
            this.installed.set(server.id, server)
          }
        }
      }
    } catch {
      console.warn('[MCPMarketplace] Failed to load installed servers')
    }
  }

  private saveInstalled(): void {
    try {
      const dir = path.dirname(INSTALLED_SERVERS_PATH)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      fs.writeFileSync(
        INSTALLED_SERVERS_PATH,
        JSON.stringify({
          installed: Array.from(this.installed.values()),
          lastUpdated: Date.now(),
        })
      )
    } catch {
      console.warn('[MCPMarketplace] Failed to save installed servers')
    }
  }
}

// Singleton instance
export const mcpMarketplace = new MCPMarketplace()
