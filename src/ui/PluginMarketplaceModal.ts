/**
 * Plugin Marketplace Modal - Full-featured implementation
 *
 * Features:
 * - Browse available Vibecraft plugins (characters, animations, sounds, themes)
 * - Install/uninstall plugins with one click
 * - Enable/disable installed plugins
 * - Search and filter by category
 * - View installed plugins
 */

import { toast } from './Toast'

let modal: HTMLElement | null = null
let activeTab: 'marketplace' | 'installed' = 'marketplace'
let plugins: Plugin[] = []
let installedPlugins: InstalledPlugin[] = []
let categories: string[] = []
let searchQuery = ''
let selectedCategory: string | null = null

interface Plugin {
  id: string
  name: string
  description: string
  version: string
  author: string
  type: 'character' | 'animation' | 'sound' | 'theme' | 'layout' | 'utility'
  categories: string[]
  official?: boolean
  featured?: boolean
  downloadUrl?: string
  githubUrl?: string
  dependencies?: string[]
  screenshots?: string[]
}

interface InstalledPlugin extends Plugin {
  installedAt: number
  installedVersion: string
  enabled: boolean
  configPath?: string
}

export async function show(): Promise<void> {
  if (!modal) {
    createModal()
  }

  // Fetch data
  await Promise.all([fetchPlugins(), fetchInstalled(), fetchCategories()])

  // Render initial view
  renderContent()

  modal!.classList.add('show')
  toast.info('Plugin Marketplace', { icon: '🔌', duration: 2000 })
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
  title.textContent = '🔌 Plugin Marketplace'

  const closeBtn = document.createElement('button')
  closeBtn.id = 'plugin-modal-close'
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
  installedTab.textContent = 'Installed '

  const installedCount = document.createElement('span')
  installedCount.className = 'plugins-count'
  installedCount.id = 'plugin-installed-count'
  installedCount.textContent = '0'
  installedTab.appendChild(installedCount)

  installedTab.addEventListener('click', () => switchTab('installed'))

  tabs.appendChild(marketplaceTab)
  tabs.appendChild(installedTab)

  // Content areas
  const marketplaceContent = document.createElement('div')
  marketplaceContent.id = 'plugin-marketplace-content'
  marketplaceContent.className = 'plugins-tab-content'

  const installedContent = document.createElement('div')
  installedContent.id = 'plugin-installed-content'
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
  const marketplaceContent = modal!.querySelector('#plugin-marketplace-content')
  const installedContent = modal!.querySelector('#plugin-installed-content')

  if (tab === 'marketplace') {
    marketplaceContent?.classList.remove('hidden')
    installedContent?.classList.add('hidden')
  } else {
    marketplaceContent?.classList.add('hidden')
    installedContent?.classList.remove('hidden')
  }

  renderContent()
}

async function fetchPlugins(): Promise<void> {
  try {
    const res = await fetch('/api/plugins')
    const data = await res.json()
    plugins = data.plugins || []
  } catch (err) {
    console.error('[PluginMarketplace] Failed to fetch plugins:', err)
    toast.error('Failed to load plugins')
  }
}

async function fetchInstalled(): Promise<void> {
  try {
    const res = await fetch('/api/plugins/installed')
    const data = await res.json()
    installedPlugins = data.plugins || []

    // Update installed count badge
    const badge = modal?.querySelector('#plugin-installed-count')
    if (badge) {
      badge.textContent = installedPlugins.length.toString()
    }
  } catch (err) {
    console.error('[PluginMarketplace] Failed to fetch installed plugins:', err)
  }
}

async function fetchCategories(): Promise<void> {
  try {
    const res = await fetch('/api/plugins/categories')
    const data = await res.json()
    categories = data.categories.map((c: { name: string }) => c.name)
  } catch (err) {
    console.error('[PluginMarketplace] Failed to fetch categories:', err)
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
  const content = modal!.querySelector('#plugin-marketplace-content')
  if (!content) return

  // Clear existing content
  content.innerHTML = ''

  // Filter plugins
  let filteredPlugins = plugins

  if (searchQuery) {
    const q = searchQuery.toLowerCase()
    filteredPlugins = filteredPlugins.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.categories.some((c) => c.toLowerCase().includes(q)) ||
        p.type.toLowerCase().includes(q)
    )
  }

  if (selectedCategory) {
    filteredPlugins = filteredPlugins.filter((p) => p.categories.includes(selectedCategory!))
  }

  // Create search & filter controls
  const controls = document.createElement('div')
  controls.style.cssText = 'margin-bottom: 16px; display: flex; gap: 8px;'

  const searchInput = document.createElement('input')
  searchInput.type = 'text'
  searchInput.id = 'plugin-search'
  searchInput.placeholder = 'Search plugins...'
  searchInput.value = searchQuery
  searchInput.style.cssText =
    'flex: 1; padding: 8px 12px; background: rgba(30, 41, 59, 0.8); border: 1px solid rgba(100, 116, 139, 0.3); border-radius: 6px; color: #e2e8f0; font-size: 13px;'
  searchInput.addEventListener('input', (e) => {
    searchQuery = (e.target as HTMLInputElement).value
    renderContent()
  })

  const categorySelect = document.createElement('select')
  categorySelect.id = 'plugin-category'
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
  const featured = filteredPlugins.filter((p) => p.featured)
  const official = filteredPlugins.filter((p) => p.official && !p.featured)
  const community = filteredPlugins.filter((p) => !p.official && !p.featured)

  // Render sections
  if (featured.length > 0) {
    content.appendChild(renderSection('⭐ Featured Plugins', featured))
  }

  if (official.length > 0) {
    content.appendChild(renderSection('Official Plugins', official))
  }

  if (community.length > 0) {
    content.appendChild(renderSection('Community Plugins', community))
  }

  if (filteredPlugins.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'plugins-empty'
    empty.textContent = 'No plugins found. Try a different search or category.'
    content.appendChild(empty)
  }
}

function renderSection(title: string, plugins: Plugin[]): HTMLElement {
  const section = document.createElement('div')
  section.className = 'plugins-section'

  const header = document.createElement('div')
  header.className = 'plugins-section-header'

  const titleEl = document.createElement('div')
  titleEl.className = 'plugins-section-title'
  titleEl.textContent = title

  const count = document.createElement('div')
  count.className = 'plugins-count'
  count.textContent = plugins.length.toString()

  header.appendChild(titleEl)
  header.appendChild(count)

  const list = document.createElement('div')
  list.className = 'plugins-list'

  plugins.forEach((plugin) => {
    list.appendChild(createPluginItem(plugin))
  })

  section.appendChild(header)
  section.appendChild(list)

  return section
}

function createPluginItem(plugin: Plugin): HTMLElement {
  const isInstalled = installedPlugins.some((p) => p.id === plugin.id)

  const item = document.createElement('div')
  item.className = 'plugin-modal-item'

  // Icon based on type
  const iconMap: Record<Plugin['type'], string> = {
    character: '👤',
    animation: '🎭',
    sound: '🔊',
    theme: '🎨',
    layout: '📐',
    utility: '🔧',
  }
  const icon = document.createElement('div')
  icon.className = 'plugin-modal-icon'
  icon.textContent = iconMap[plugin.type] || '🔌'

  const info = document.createElement('div')
  info.className = 'plugin-modal-info'

  const name = document.createElement('div')
  name.className = 'plugin-modal-name'
  name.textContent = plugin.name

  const desc = document.createElement('div')
  desc.className = 'plugin-modal-desc'
  desc.textContent = plugin.description

  const meta = document.createElement('div')
  meta.className = 'plugin-modal-tools'
  meta.textContent = `v${plugin.version} · ${plugin.author} · ${plugin.type}`

  info.appendChild(name)
  info.appendChild(desc)
  info.appendChild(meta)

  item.appendChild(icon)
  item.appendChild(info)

  if (isInstalled) {
    const status = document.createElement('div')
    status.className = 'plugin-modal-status active'
    status.textContent = '✓ Installed'
    item.appendChild(status)
  } else {
    const btn = document.createElement('button')
    btn.className = 'marketplace-btn'
    btn.textContent = 'Install'
    btn.addEventListener('click', () => installPlugin(plugin.id))
    item.appendChild(btn)
  }

  return item
}

function renderInstalled(): void {
  const content = modal!.querySelector('#plugin-installed-content')
  if (!content) return

  content.innerHTML = ''

  if (installedPlugins.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'plugins-empty'
    empty.textContent = 'No plugins installed yet. Browse the marketplace to get started!'
    content.appendChild(empty)
    return
  }

  const list = document.createElement('div')
  list.className = 'plugins-list'

  installedPlugins.forEach((plugin) => {
    list.appendChild(createInstalledItem(plugin))
  })

  content.appendChild(list)
}

function createInstalledItem(plugin: InstalledPlugin): HTMLElement {
  const item = document.createElement('div')
  item.className = 'plugin-modal-item'

  // Icon based on type
  const iconMap: Record<Plugin['type'], string> = {
    character: '👤',
    animation: '🎭',
    sound: '🔊',
    theme: '🎨',
    layout: '📐',
    utility: '🔧',
  }
  const icon = document.createElement('div')
  icon.className = 'plugin-modal-icon'
  icon.textContent = iconMap[plugin.type] || '🔌'

  const info = document.createElement('div')
  info.className = 'plugin-modal-info'

  const name = document.createElement('div')
  name.className = 'plugin-modal-name'
  name.textContent = plugin.name

  const desc = document.createElement('div')
  desc.className = 'plugin-modal-desc'
  desc.textContent = plugin.description

  const meta = document.createElement('div')
  meta.className = 'plugin-modal-tools'
  const versionText = document.createElement('span')
  versionText.textContent = `v${plugin.installedVersion} · ${plugin.type}`
  meta.appendChild(versionText)

  info.appendChild(name)
  info.appendChild(desc)
  info.appendChild(meta)

  const actions = document.createElement('div')
  actions.style.cssText = 'display: flex; flex-direction: column; gap: 8px; align-items: flex-end;'

  // Enable/Disable toggle
  const toggleBtn = document.createElement('button')
  toggleBtn.className = 'marketplace-btn'
  toggleBtn.textContent = plugin.enabled ? 'Disable' : 'Enable'
  toggleBtn.style.cssText = plugin.enabled
    ? 'background: rgba(234, 179, 8, 0.15); border-color: rgba(234, 179, 8, 0.3); color: #fbbf24;'
    : 'background: rgba(34, 197, 94, 0.15); border-color: rgba(34, 197, 94, 0.3); color: #4ade80;'
  toggleBtn.addEventListener('click', () => togglePlugin(plugin.id, !plugin.enabled))

  const uninstallBtn = document.createElement('button')
  uninstallBtn.className = 'marketplace-btn'
  uninstallBtn.style.cssText =
    'background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.3); color: #f87171;'
  uninstallBtn.textContent = 'Uninstall'
  uninstallBtn.addEventListener('click', () => uninstallPlugin(plugin.id))

  actions.appendChild(toggleBtn)
  actions.appendChild(uninstallBtn)

  item.appendChild(icon)
  item.appendChild(info)
  item.appendChild(actions)

  return item
}

async function installPlugin(pluginId: string): Promise<void> {
  const plugin = plugins.find((p) => p.id === pluginId)
  if (!plugin) return

  try {
    toast.info(`Installing ${plugin.name}...`, { duration: 5000 })

    const res = await fetch('/api/plugins/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pluginId }),
    })

    const data = await res.json()

    if (data.ok) {
      toast.success(`${plugin.name} installed successfully!`)
      await fetchInstalled()
      renderContent()
    } else {
      toast.error(`Installation failed: ${data.error}`)
    }
  } catch (err) {
    console.error('[PluginMarketplace] Install failed:', err)
    toast.error('Installation failed')
  }
}

async function uninstallPlugin(pluginId: string): Promise<void> {
  const plugin = installedPlugins.find((p) => p.id === pluginId)
  if (!plugin) return

  if (!confirm(`Uninstall ${plugin.name}?`)) {
    return
  }

  try {
    toast.info(`Uninstalling ${plugin.name}...`)

    const res = await fetch('/api/plugins/uninstall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pluginId }),
    })

    const data = await res.json()

    if (data.ok) {
      toast.success(`${plugin.name} uninstalled`)
      await fetchInstalled()
      renderContent()
    } else {
      toast.error(`Uninstall failed: ${data.error}`)
    }
  } catch (err) {
    console.error('[PluginMarketplace] Uninstall failed:', err)
    toast.error('Uninstall failed')
  }
}

async function togglePlugin(pluginId: string, enabled: boolean): Promise<void> {
  const plugin = installedPlugins.find((p) => p.id === pluginId)
  if (!plugin) return

  try {
    const res = await fetch('/api/plugins/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pluginId, enabled }),
    })

    const data = await res.json()

    if (data.ok) {
      toast.success(`${plugin.name} ${enabled ? 'enabled' : 'disabled'}`)
      await fetchInstalled()
      renderContent()
    } else {
      toast.error(`Toggle failed: ${data.error}`)
    }
  } catch (err) {
    console.error('[PluginMarketplace] Toggle failed:', err)
    toast.error('Toggle failed')
  }
}

export function hide(): void {
  if (modal) modal.classList.remove('show')
}
