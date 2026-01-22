/**
 * MCP Marketplace Modal
 *
 * Browse, search, and install MCP servers from the marketplace.
 */

import { soundManager } from '../audio'
import { showToast } from './Toast'

// ============================================================================
// Types
// ============================================================================

export interface MCPServerInfo {
  id: string
  name: string
  description: string
  source: 'npm' | 'github' | 'local'
  package: string
  categories: string[]
  official?: boolean
  envVars?: string[]
  installed?: boolean
}

export interface MCPMarketplaceConfig {
  onInstall: (serverId: string, envVars?: Record<string, string>) => Promise<boolean>
  onUninstall: (serverId: string) => Promise<boolean>
  fetchServers: () => Promise<MCPServerInfo[]>
  fetchCategories: () => Promise<{ name: string; count: number }[]>
}

// ============================================================================
// State
// ============================================================================

let modal: HTMLElement | null = null
let config: MCPMarketplaceConfig | null = null
let servers: MCPServerInfo[] = []
let categories: { name: string; count: number }[] = []
let selectedCategory: string | null = null
let searchQuery = ''
let soundEnabled = true

// ============================================================================
// Public API
// ============================================================================

/**
 * Show the MCP marketplace modal
 */
export async function showMCPMarketplaceModal(cfg: MCPMarketplaceConfig): Promise<void> {
  config = cfg

  // Remove any existing modal
  hideMCPMarketplaceModal()

  // Create modal
  modal = createModalElement()
  document.body.appendChild(modal)

  // Play sound
  if (soundEnabled) {
    soundManager.play('notification')
  }

  // Animate in
  requestAnimationFrame(() => {
    modal?.classList.add('modal-visible')
  })

  // Load data
  await loadMarketplaceData()
}

/**
 * Hide the modal
 */
export function hideMCPMarketplaceModal(): void {
  if (modal) {
    modal.classList.remove('modal-visible')
    modal.classList.add('modal-hiding')

    setTimeout(() => {
      modal?.remove()
      modal = null
      config = null
    }, 200)
  }
}

/**
 * Set sound enabled state
 */
export function setMCPMarketplaceSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled
}

// ============================================================================
// DOM Creation
// ============================================================================

function createModalElement(): HTMLElement {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay mcp-marketplace-overlay'

  const content = document.createElement('div')
  content.className = 'modal-content mcp-marketplace-modal'

  // Header
  const header = document.createElement('div')
  header.className = 'modal-header'

  const title = document.createElement('h2')
  title.className = 'modal-title'
  title.textContent = '🔌 MCP Marketplace'

  const closeBtn = document.createElement('button')
  closeBtn.className = 'modal-close'
  closeBtn.setAttribute('aria-label', 'Close')
  closeBtn.textContent = '×'
  closeBtn.addEventListener('click', hideMCPMarketplaceModal)

  header.appendChild(title)
  header.appendChild(closeBtn)

  // Search bar
  const searchBar = createSearchBar()

  // Body with sidebar and main content
  const body = document.createElement('div')
  body.className = 'mcp-marketplace-body'

  const sidebar = createSidebar()
  const main = createMainContent()

  body.appendChild(sidebar)
  body.appendChild(main)

  content.appendChild(header)
  content.appendChild(searchBar)
  content.appendChild(body)
  overlay.appendChild(content)

  // Overlay click to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      hideMCPMarketplaceModal()
    }
  })

  // Escape key
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      hideMCPMarketplaceModal()
      document.removeEventListener('keydown', handleKeydown)
    }
  }
  document.addEventListener('keydown', handleKeydown)

  return overlay
}

function createSearchBar(): HTMLElement {
  const container = document.createElement('div')
  container.className = 'mcp-search-bar'

  const icon = document.createElement('span')
  icon.className = 'mcp-search-icon'
  icon.textContent = '🔍'

  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'mcp-search-input'
  input.placeholder = 'Search MCP servers...'
  input.addEventListener('input', (e) => {
    searchQuery = (e.target as HTMLInputElement).value
    renderServers()
  })

  container.appendChild(icon)
  container.appendChild(input)
  return container
}

function createSidebar(): HTMLElement {
  const sidebar = document.createElement('div')
  sidebar.className = 'mcp-sidebar'

  // Categories section
  const catTitle = document.createElement('h3')
  catTitle.className = 'mcp-sidebar-title'
  catTitle.textContent = 'Categories'
  sidebar.appendChild(catTitle)

  const catList = document.createElement('div')
  catList.className = 'mcp-category-list'
  catList.id = 'mcp-category-list'
  sidebar.appendChild(catList)

  // Installed section
  const installedTitle = document.createElement('h3')
  installedTitle.className = 'mcp-sidebar-title'
  installedTitle.textContent = 'Installed'
  sidebar.appendChild(installedTitle)

  const installedList = document.createElement('div')
  installedList.className = 'mcp-installed-list'
  installedList.id = 'mcp-installed-list'
  sidebar.appendChild(installedList)

  return sidebar
}

function createMainContent(): HTMLElement {
  const main = document.createElement('div')
  main.className = 'mcp-main'

  const serverGrid = document.createElement('div')
  serverGrid.className = 'mcp-server-grid'
  serverGrid.id = 'mcp-server-grid'

  // Loading indicator
  const loading = document.createElement('div')
  loading.className = 'mcp-loading'
  loading.textContent = 'Loading servers...'
  serverGrid.appendChild(loading)

  main.appendChild(serverGrid)
  return main
}

// ============================================================================
// Helper: Clear children safely
// ============================================================================

function clearChildren(element: HTMLElement): void {
  while (element.firstChild) {
    element.removeChild(element.firstChild)
  }
}

// ============================================================================
// Data Loading
// ============================================================================

async function loadMarketplaceData(): Promise<void> {
  if (!config) return

  try {
    // Fetch servers and categories in parallel
    const [serverData, categoryData] = await Promise.all([
      config.fetchServers(),
      config.fetchCategories(),
    ])

    servers = serverData
    categories = categoryData

    renderCategories()
    renderInstalled()
    renderServers()
  } catch (e) {
    console.error('[MCPMarketplace] Failed to load data:', e)
    showToast('Failed to load marketplace data', 'error')
  }
}

// ============================================================================
// Rendering
// ============================================================================

function renderCategories(): void {
  const list = document.getElementById('mcp-category-list')
  if (!list) return

  clearChildren(list)

  // All category
  const allBtn = document.createElement('button')
  allBtn.className = 'mcp-category-btn' + (selectedCategory === null ? ' mcp-category-active' : '')
  allBtn.textContent = `All (${servers.length})`
  allBtn.addEventListener('click', () => {
    selectedCategory = null
    renderCategories()
    renderServers()
  })
  list.appendChild(allBtn)

  // Individual categories
  for (const cat of categories.slice(0, 10)) {
    const btn = document.createElement('button')
    btn.className =
      'mcp-category-btn' + (selectedCategory === cat.name ? ' mcp-category-active' : '')
    btn.textContent = `${cat.name} (${cat.count})`
    btn.addEventListener('click', () => {
      selectedCategory = cat.name
      renderCategories()
      renderServers()
    })
    list.appendChild(btn)
  }
}

function renderInstalled(): void {
  const list = document.getElementById('mcp-installed-list')
  if (!list) return

  clearChildren(list)

  const installed = servers.filter((s) => s.installed)

  if (installed.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'mcp-empty'
    empty.textContent = 'No servers installed'
    list.appendChild(empty)
    return
  }

  for (const server of installed) {
    const item = document.createElement('div')
    item.className = 'mcp-installed-item'

    const name = document.createElement('span')
    name.className = 'mcp-installed-name'
    name.textContent = server.name

    const uninstallBtn = document.createElement('button')
    uninstallBtn.className = 'mcp-uninstall-btn'
    uninstallBtn.textContent = '×'
    uninstallBtn.title = 'Uninstall'
    uninstallBtn.addEventListener('click', () => handleUninstall(server.id))

    item.appendChild(name)
    item.appendChild(uninstallBtn)
    list.appendChild(item)
  }
}

function renderServers(): void {
  const grid = document.getElementById('mcp-server-grid')
  if (!grid) return

  clearChildren(grid)

  // Filter servers
  let filtered = servers

  if (selectedCategory) {
    filtered = filtered.filter((s) => s.categories.includes(selectedCategory!))
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase()
    filtered = filtered.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.categories.some((c) => c.toLowerCase().includes(q))
    )
  }

  if (filtered.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'mcp-empty'
    empty.textContent = 'No servers found'
    grid.appendChild(empty)
    return
  }

  // Sort: official first, then by name
  filtered.sort((a, b) => {
    if (a.official && !b.official) return -1
    if (!a.official && b.official) return 1
    return a.name.localeCompare(b.name)
  })

  // Render server cards
  for (const server of filtered) {
    const card = createServerCard(server)
    grid.appendChild(card)
  }
}

function createServerCard(server: MCPServerInfo): HTMLElement {
  const card = document.createElement('div')
  card.className = 'mcp-server-card' + (server.installed ? ' mcp-server-installed' : '')

  // Header
  const header = document.createElement('div')
  header.className = 'mcp-server-header'

  const name = document.createElement('h4')
  name.className = 'mcp-server-name'
  name.textContent = server.name

  if (server.official) {
    const badge = document.createElement('span')
    badge.className = 'mcp-official-badge'
    badge.textContent = '✓ Official'
    name.appendChild(badge)
  }

  header.appendChild(name)

  // Description
  const desc = document.createElement('p')
  desc.className = 'mcp-server-desc'
  desc.textContent = server.description

  // Categories
  const cats = document.createElement('div')
  cats.className = 'mcp-server-categories'
  for (const cat of server.categories.slice(0, 3)) {
    const tag = document.createElement('span')
    tag.className = 'mcp-category-tag'
    tag.textContent = cat
    cats.appendChild(tag)
  }

  // Actions
  const actions = document.createElement('div')
  actions.className = 'mcp-server-actions'

  if (server.installed) {
    const configBtn = document.createElement('button')
    configBtn.className = 'mcp-btn mcp-btn-secondary'
    configBtn.textContent = 'Configure'
    configBtn.addEventListener('click', () => showConfigureModal(server))

    const uninstallBtn = document.createElement('button')
    uninstallBtn.className = 'mcp-btn mcp-btn-danger'
    uninstallBtn.textContent = 'Uninstall'
    uninstallBtn.addEventListener('click', () => handleUninstall(server.id))

    actions.appendChild(configBtn)
    actions.appendChild(uninstallBtn)
  } else {
    const installBtn = document.createElement('button')
    installBtn.className = 'mcp-btn mcp-btn-primary'
    installBtn.textContent = 'Install'
    installBtn.addEventListener('click', () => handleInstall(server))
    actions.appendChild(installBtn)
  }

  card.appendChild(header)
  card.appendChild(desc)
  card.appendChild(cats)
  card.appendChild(actions)

  return card
}

// ============================================================================
// Actions
// ============================================================================

async function handleInstall(server: MCPServerInfo): Promise<void> {
  if (!config) return

  // Check if env vars are required
  if (server.envVars && server.envVars.length > 0) {
    showEnvVarsModal(server)
    return
  }

  // Install directly
  try {
    showToast(`Installing ${server.name}...`, 'info')
    const success = await config.onInstall(server.id)

    if (success) {
      server.installed = true
      showToast(`${server.name} installed successfully`, 'success')
      if (soundEnabled) soundManager.play('success')
      renderServers()
      renderInstalled()
    } else {
      showToast(`Failed to install ${server.name}`, 'error')
      if (soundEnabled) soundManager.play('error')
    }
  } catch (e) {
    console.error('[MCPMarketplace] Install failed:', e)
    showToast(`Failed to install ${server.name}`, 'error')
  }
}

async function handleUninstall(serverId: string): Promise<void> {
  if (!config) return

  const server = servers.find((s) => s.id === serverId)
  if (!server) return

  try {
    showToast(`Uninstalling ${server.name}...`, 'info')
    const success = await config.onUninstall(serverId)

    if (success) {
      server.installed = false
      showToast(`${server.name} uninstalled`, 'success')
      renderServers()
      renderInstalled()
    } else {
      showToast(`Failed to uninstall ${server.name}`, 'error')
    }
  } catch (e) {
    console.error('[MCPMarketplace] Uninstall failed:', e)
    showToast(`Failed to uninstall ${server.name}`, 'error')
  }
}

function showEnvVarsModal(server: MCPServerInfo): void {
  if (!config || !server.envVars) return

  // Create simple env var input modal
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay mcp-env-overlay'

  const content = document.createElement('div')
  content.className = 'modal-content mcp-env-modal'

  const title = document.createElement('h3')
  title.textContent = `Configure ${server.name}`
  content.appendChild(title)

  const desc = document.createElement('p')
  desc.className = 'mcp-env-desc'
  desc.textContent = 'Enter required environment variables:'
  content.appendChild(desc)

  const inputs: { key: string; input: HTMLInputElement }[] = []

  for (const envVar of server.envVars) {
    const group = document.createElement('div')
    group.className = 'mcp-env-group'

    const label = document.createElement('label')
    label.textContent = envVar

    const input = document.createElement('input')
    input.type = 'password'
    input.className = 'mcp-env-input'
    input.placeholder = `Enter ${envVar}`

    group.appendChild(label)
    group.appendChild(input)
    content.appendChild(group)

    inputs.push({ key: envVar, input })
  }

  const actions = document.createElement('div')
  actions.className = 'mcp-env-actions'

  const cancelBtn = document.createElement('button')
  cancelBtn.className = 'mcp-btn mcp-btn-secondary'
  cancelBtn.textContent = 'Cancel'
  cancelBtn.addEventListener('click', () => overlay.remove())

  const installBtn = document.createElement('button')
  installBtn.className = 'mcp-btn mcp-btn-primary'
  installBtn.textContent = 'Install'
  installBtn.addEventListener('click', async () => {
    const envVars: Record<string, string> = {}
    for (const { key, input } of inputs) {
      envVars[key] = input.value
    }

    overlay.remove()

    try {
      showToast(`Installing ${server.name}...`, 'info')
      const success = await config!.onInstall(server.id, envVars)

      if (success) {
        server.installed = true
        showToast(`${server.name} installed successfully`, 'success')
        if (soundEnabled) soundManager.play('success')
        renderServers()
        renderInstalled()
      } else {
        showToast(`Failed to install ${server.name}`, 'error')
      }
    } catch (e) {
      console.error('[MCPMarketplace] Install failed:', e)
      showToast(`Failed to install ${server.name}`, 'error')
    }
  })

  actions.appendChild(cancelBtn)
  actions.appendChild(installBtn)
  content.appendChild(actions)
  overlay.appendChild(content)

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove()
  })

  document.body.appendChild(overlay)
}

function showConfigureModal(server: MCPServerInfo): void {
  // Similar to env vars modal but for updating config
  if (!server.envVars || server.envVars.length === 0) {
    showToast('No configuration options available', 'info')
    return
  }

  showEnvVarsModal(server)
}
