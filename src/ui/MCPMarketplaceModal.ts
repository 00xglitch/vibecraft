/**
 * MCP Marketplace Modal - Full-featured implementation
 *
 * Features:
 * - Browse available MCP servers from multiple registries
 * - Install/uninstall MCP servers with one click
 * - Configure environment variables for installed servers
 * - Search and filter by category
 * - View installed servers
 */

import { toast } from './Toast'
import type { ManagedSession } from '../../shared/types'

// API URL (proxied in dev, direct in prod)
const API_URL = import.meta.env.DEV
  ? '/api'
  : `http://localhost:${(window as any).VIBECRAFT_PORT || 4003}`

let modal: HTMLElement | null = null
let activeTab: 'marketplace' | 'installed' = 'marketplace'
let servers: MCPServer[] = []
let installedServers: InstalledMCPServer[] = []
let categories: string[] = []
let searchQuery = ''
let selectedCategory: string | null = null
let currentSession: ManagedSession | null = null

interface MCPServer {
  id: string
  name: string
  description: string
  source: 'npm' | 'github' | 'local'
  package: string
  categories: string[]
  official?: boolean
  envVars?: string[]
}

interface InstalledMCPServer extends MCPServer {
  installedAt: number
  status: 'installed' | 'configured' | 'running' | 'error'
  configuredEnv: Record<string, string>
}

export async function show(sessionId?: string): Promise<void> {
  if (!modal) {
    createModal()
  }

  // Fetch session if provided
  if (sessionId) {
    try {
      const res = await fetch(`/sessions/${sessionId}`)
      const data = await res.json()
      if (data.ok) {
        currentSession = data.session
      }
    } catch (err) {
      console.error('[MCPMarketplace] Failed to fetch session:', err)
    }
  } else {
    currentSession = null
  }

  // Update modal title
  const title = modal!.querySelector('.plugins-modal-title')
  if (title) {
    if (currentSession) {
      title.textContent = `🔌 MCP Servers - ${currentSession.name}`
    } else {
      title.textContent = '🔌 MCP Server Marketplace'
    }
  }

  // Fetch data
  await Promise.all([fetchServers(), fetchInstalled(), fetchCategories()])

  // Render initial view
  renderContent()

  modal!.classList.add('show')
  toast.info('MCP Marketplace', { icon: '🔌', duration: 2000 })
}

function createModal(): void {
  modal = document.createElement('div')
  modal.id = 'plugins-modal'
  modal.className = 'modal'

  const content = document.createElement('div')
  content.className = 'plugins-modal-content'

  // Header
  const header = document.createElement('div')
  header.className = 'plugins-modal-header'

  const title = document.createElement('h3')
  title.className = 'plugins-modal-title'
  title.textContent = '🔌 MCP Server Marketplace'

  const closeBtn = document.createElement('button')
  closeBtn.id = 'mcp-modal-close'
  closeBtn.className = 'plugins-modal-close'
  closeBtn.textContent = '×'
  closeBtn.addEventListener('click', hide)

  header.appendChild(title)
  header.appendChild(closeBtn)

  // Tabs
  const tabs = document.createElement('div')
  tabs.className = 'plugins-tabs'

  const marketplaceTab = document.createElement('button')
  marketplaceTab.className = 'plugins-tab active'
  marketplaceTab.dataset.tab = 'marketplace'
  marketplaceTab.textContent = 'Marketplace'
  marketplaceTab.addEventListener('click', () => switchTab('marketplace'))

  const installedTab = document.createElement('button')
  installedTab.className = 'plugins-tab'
  installedTab.dataset.tab = 'installed'
  installedTab.innerHTML = 'Installed <span class="plugins-count" id="installed-count">0</span>'
  installedTab.addEventListener('click', () => switchTab('installed'))

  tabs.appendChild(marketplaceTab)
  tabs.appendChild(installedTab)

  // Content areas
  const marketplaceContent = document.createElement('div')
  marketplaceContent.id = 'mcp-marketplace-content'
  marketplaceContent.className = 'plugins-tab-content'

  const installedContent = document.createElement('div')
  installedContent.id = 'mcp-installed-content'
  installedContent.className = 'plugins-tab-content hidden'

  content.appendChild(header)
  content.appendChild(tabs)
  content.appendChild(marketplaceContent)
  content.appendChild(installedContent)

  modal.appendChild(content)
  document.body.appendChild(modal)

  // Click outside to close
  modal.addEventListener('click', (e) => {
    if (e.target === modal) hide()
  })
}

function switchTab(tab: 'marketplace' | 'installed'): void {
  activeTab = tab

  // Update tab buttons
  modal!.querySelectorAll('.plugins-tab').forEach((btn) => {
    if (btn.getAttribute('data-tab') === tab) {
      btn.classList.add('active')
    } else {
      btn.classList.remove('active')
    }
  })

  // Update content
  const marketplaceContent = modal!.querySelector('#mcp-marketplace-content')
  const installedContent = modal!.querySelector('#mcp-installed-content')

  if (tab === 'marketplace') {
    marketplaceContent?.classList.remove('hidden')
    installedContent?.classList.add('hidden')
  } else {
    marketplaceContent?.classList.add('hidden')
    installedContent?.classList.remove('hidden')
  }

  renderContent()
}

async function fetchServers(): Promise<void> {
  try {
    const res = await fetch(`${API_URL}/mcp/servers`)
    const data = await res.json()
    servers = data.servers || []
  } catch (err) {
    console.error('[MCPMarketplace] Failed to fetch servers:', err)
    toast.error('Failed to load MCP servers')
  }
}

async function fetchInstalled(): Promise<void> {
  try {
    const res = await fetch(`${API_URL}/mcp/installed`)
    const data = await res.json()
    installedServers = data.servers || []

    // Update installed count badge
    const badge = modal?.querySelector('#installed-count')
    if (badge) {
      badge.textContent = installedServers.length.toString()
    }
  } catch (err) {
    console.error('[MCPMarketplace] Failed to fetch installed servers:', err)
  }
}

async function fetchCategories(): Promise<void> {
  try {
    const res = await fetch(`${API_URL}/mcp/categories`)
    const data = await res.json()
    categories = data.categories.map((c: { name: string }) => c.name)
  } catch (err) {
    console.error('[MCPMarketplace] Failed to fetch categories:', err)
  }
}

function renderContent(): void {
  if (activeTab === 'marketplace') {
    renderMarketplace()
  } else {
    renderInstalled()
  }
}

function renderMarketplace(): void {
  const content = modal!.querySelector('#mcp-marketplace-content')
  if (!content) return

  // Clear existing content
  content.innerHTML = ''

  // Filter servers
  let filteredServers = servers

  if (searchQuery) {
    const q = searchQuery.toLowerCase()
    filteredServers = filteredServers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.categories.some((c) => c.toLowerCase().includes(q))
    )
  }

  if (selectedCategory) {
    filteredServers = filteredServers.filter((s) => s.categories.includes(selectedCategory!))
  }

  // Create search & filter controls
  const controls = document.createElement('div')
  controls.style.cssText = 'margin-bottom: 16px; display: flex; gap: 8px;'

  const searchInput = document.createElement('input')
  searchInput.type = 'text'
  searchInput.id = 'mcp-search'
  searchInput.placeholder = 'Search servers...'
  searchInput.value = searchQuery
  searchInput.style.cssText =
    'flex: 1; padding: 8px 12px; background: rgba(30, 41, 59, 0.8); border: 1px solid rgba(100, 116, 139, 0.3); border-radius: 6px; color: #e2e8f0; font-size: 13px;'
  searchInput.addEventListener('input', (e) => {
    searchQuery = (e.target as HTMLInputElement).value
    renderContent()
  })

  const categorySelect = document.createElement('select')
  categorySelect.id = 'mcp-category'
  categorySelect.style.cssText =
    'padding: 8px 12px; background: rgba(30, 41, 59, 0.8); border: 1px solid rgba(100, 116, 139, 0.3); border-radius: 6px; color: #e2e8f0; font-size: 13px;'

  const allOption = document.createElement('option')
  allOption.value = ''
  allOption.textContent = 'All Categories'
  categorySelect.appendChild(allOption)

  categories.forEach((cat) => {
    const option = document.createElement('option')
    option.value = cat
    option.textContent = cat
    if (selectedCategory === cat) option.selected = true
    categorySelect.appendChild(option)
  })

  categorySelect.addEventListener('change', (e) => {
    const value = (e.target as HTMLSelectElement).value
    selectedCategory = value || null
    renderContent()
  })

  controls.appendChild(searchInput)
  controls.appendChild(categorySelect)
  content.appendChild(controls)

  // Separate featured and regular
  const featured = filteredServers.filter((s) => s.official)
  const regular = filteredServers.filter((s) => !s.official)

  // Render sections
  if (featured.length > 0) {
    content.appendChild(renderSection('⭐ Official Servers', featured))
  }

  if (regular.length > 0) {
    content.appendChild(renderSection('Community Servers', regular))
  }

  if (filteredServers.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'plugins-empty'
    empty.textContent = 'No servers found. Try a different search or category.'
    content.appendChild(empty)
  }
}

function renderSection(title: string, servers: MCPServer[]): HTMLElement {
  const section = document.createElement('div')
  section.className = 'plugins-section'

  const header = document.createElement('div')
  header.className = 'plugins-section-header'

  const titleEl = document.createElement('div')
  titleEl.className = 'plugins-section-title'
  titleEl.textContent = title

  const count = document.createElement('div')
  count.className = 'plugins-count'
  count.textContent = servers.length.toString()

  header.appendChild(titleEl)
  header.appendChild(count)

  const list = document.createElement('div')
  list.className = 'plugins-list'

  servers.forEach((server) => {
    list.appendChild(createServerItem(server))
  })

  section.appendChild(header)
  section.appendChild(list)

  return section
}

function createServerItem(server: MCPServer): HTMLElement {
  const isInstalled = installedServers.some((s) => s.id === server.id)
  const isEnabledForSession = currentSession && currentSession.enabledMCPs?.includes(server.id)

  const item = document.createElement('div')
  item.className = 'plugin-modal-item'

  const icon = document.createElement('div')
  icon.className = 'plugin-modal-icon'
  icon.textContent = server.official ? '⭐' : '🔌'

  const info = document.createElement('div')
  info.className = 'plugin-modal-info'

  const name = document.createElement('div')
  name.className = 'plugin-modal-name'
  name.textContent = server.name

  const desc = document.createElement('div')
  desc.className = 'plugin-modal-desc'
  desc.textContent = server.description

  info.appendChild(name)
  info.appendChild(desc)

  if (server.envVars && server.envVars.length > 0) {
    const tools = document.createElement('div')
    tools.className = 'plugin-modal-tools'
    tools.textContent = `Requires: ${server.envVars.join(', ')}`
    info.appendChild(tools)
  }

  item.appendChild(icon)
  item.appendChild(info)

  // Actions container
  const actions = document.createElement('div')
  actions.style.cssText = 'display: flex; flex-direction: column; gap: 8px; align-items: flex-end;'

  if (isInstalled) {
    // Show installed status
    const status = document.createElement('div')
    status.className = 'plugin-modal-status active'
    status.textContent = '✓ Installed'
    actions.appendChild(status)

    // If we're in session mode, show enable/disable toggle
    if (currentSession) {
      const toggleBtn = document.createElement('button')
      toggleBtn.className = 'marketplace-btn'
      if (isEnabledForSession) {
        toggleBtn.textContent = 'Disable for Session'
        toggleBtn.style.cssText =
          'background: rgba(234, 179, 8, 0.15); border-color: rgba(234, 179, 8, 0.3); color: #fbbf24;'
      } else {
        toggleBtn.textContent = 'Enable for Session'
        toggleBtn.style.cssText =
          'background: rgba(34, 197, 94, 0.15); border-color: rgba(34, 197, 94, 0.3); color: #4ade80;'
      }
      toggleBtn.addEventListener('click', () =>
        toggleMCPForSession(server.id, !isEnabledForSession)
      )
      actions.appendChild(toggleBtn)
    }
  } else {
    const btn = document.createElement('button')
    btn.className = 'marketplace-btn'
    btn.textContent = 'Install'
    btn.addEventListener('click', () => installServer(server.id))
    actions.appendChild(btn)
  }

  item.appendChild(actions)

  return item
}

function renderInstalled(): void {
  const content = modal!.querySelector('#mcp-installed-content')
  if (!content) return

  content.innerHTML = ''

  if (installedServers.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'plugins-empty'
    empty.textContent = 'No MCP servers installed yet. Browse the marketplace to get started!'
    content.appendChild(empty)
    return
  }

  const list = document.createElement('div')
  list.className = 'plugins-list'

  installedServers.forEach((server) => {
    list.appendChild(createInstalledItem(server))
  })

  content.appendChild(list)
}

function createInstalledItem(server: InstalledMCPServer): HTMLElement {
  const item = document.createElement('div')
  item.className = 'plugin-modal-item'

  const icon = document.createElement('div')
  icon.className = 'plugin-modal-icon'
  icon.textContent = server.official ? '⭐' : '🔌'

  const info = document.createElement('div')
  info.className = 'plugin-modal-info'

  const name = document.createElement('div')
  name.className = 'plugin-modal-name'
  name.textContent = server.name

  const desc = document.createElement('div')
  desc.className = 'plugin-modal-desc'
  desc.textContent = server.description

  const pkg = document.createElement('div')
  pkg.className = 'plugin-modal-tools'
  const code = document.createElement('code')
  code.style.cssText = 'font-family: monospace; font-size: 11px;'
  code.textContent = server.package
  pkg.textContent = 'Package: '
  pkg.appendChild(code)

  info.appendChild(name)
  info.appendChild(desc)
  info.appendChild(pkg)

  if (Object.keys(server.configuredEnv).length > 0) {
    const configured = document.createElement('div')
    configured.className = 'plugin-modal-tools'
    configured.textContent = `Configured: ${Object.keys(server.configuredEnv).join(', ')}`
    info.appendChild(configured)
  }

  const actions = document.createElement('div')
  actions.style.cssText = 'display: flex; flex-direction: column; gap: 8px; align-items: flex-end;'

  const statusColor =
    server.status === 'configured' || server.status === 'running'
      ? 'active'
      : server.status === 'error'
        ? 'error'
        : 'inactive'

  const status = document.createElement('div')
  status.className = `plugin-modal-status ${statusColor}`
  status.textContent = server.status

  const uninstallBtn = document.createElement('button')
  uninstallBtn.className = 'marketplace-btn'
  uninstallBtn.style.cssText =
    'background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.3); color: #f87171;'
  uninstallBtn.textContent = 'Uninstall'
  uninstallBtn.addEventListener('click', () => uninstallServer(server.id))

  actions.appendChild(status)
  actions.appendChild(uninstallBtn)

  item.appendChild(icon)
  item.appendChild(info)
  item.appendChild(actions)

  return item
}

async function toggleMCPForSession(serverId: string, enable: boolean): Promise<void> {
  if (!currentSession) return

  const server = servers.find((s) => s.id === serverId)
  if (!server) return

  try {
    // Update session's enabled MCPs
    const enabledMCPs = currentSession.enabledMCPs || []
    const updatedMCPs = enable
      ? [...enabledMCPs, serverId]
      : enabledMCPs.filter((id) => id !== serverId)

    const res = await fetch(`/sessions/${currentSession.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabledMCPs: updatedMCPs }),
    })

    const data = await res.json()

    if (data.ok && data.session) {
      currentSession = data.session
      toast.success(`${server.name} ${enable ? 'enabled' : 'disabled'} for ${data.session.name}`)
      renderContent()
    } else {
      toast.error(`Failed to ${enable ? 'enable' : 'disable'} MCP: ${data.error}`)
    }
  } catch (err) {
    console.error('[MCPMarketplace] Toggle failed:', err)
    toast.error('Toggle failed')
  }
}

async function installServer(serverId: string): Promise<void> {
  const server = servers.find((s) => s.id === serverId)
  if (!server) return

  // Check if env vars are required
  if (server.envVars && server.envVars.length > 0) {
    const message = `This server requires environment variables:\n\n${server.envVars.join('\n')}\n\nConfigure them in ~/.claude/settings.json after installation.`
    if (!confirm(message)) {
      return
    }
  }

  try {
    toast.info(`Installing ${server.name}...`, { duration: 5000 })

    const res = await fetch(`${API_URL}/mcp/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serverId }),
    })

    const data = await res.json()

    if (data.ok) {
      toast.success(`${server.name} installed successfully!`)
      await fetchInstalled()

      // Auto-enable for current session if in session mode
      if (currentSession) {
        await toggleMCPForSession(serverId, true)
      }

      renderContent()
    } else {
      toast.error(`Installation failed: ${data.error}`)
    }
  } catch (err) {
    console.error('[MCPMarketplace] Install failed:', err)
    toast.error('Installation failed')
  }
}

async function uninstallServer(serverId: string): Promise<void> {
  const server = installedServers.find((s) => s.id === serverId)
  if (!server) return

  if (!confirm(`Uninstall ${server.name}?`)) {
    return
  }

  try {
    toast.info(`Uninstalling ${server.name}...`)

    const res = await fetch(`${API_URL}/mcp/uninstall`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serverId }),
    })

    const data = await res.json()

    if (data.ok) {
      toast.success(`${server.name} uninstalled`)
      await fetchInstalled()
      renderContent()
    } else {
      toast.error(`Uninstall failed: ${data.error}`)
    }
  } catch (err) {
    console.error('[MCPMarketplace] Uninstall failed:', err)
    toast.error('Uninstall failed')
  }
}

export function hide(): void {
  if (modal) modal.classList.remove('show')
}
