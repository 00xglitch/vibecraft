/**
 * Plugin Marketplace - Vibecraft Extensions
 *
 * Manages Vibecraft-specific plugins:
 * - Character packs
 * - Animation themes
 * - Sound packs
 * - UI themes
 * - Workshop layouts
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// ============================================================================
// Types
// ============================================================================

export interface Plugin {
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

export interface InstalledPlugin extends Plugin {
  installedAt: number
  installedVersion: string
  enabled: boolean
  configPath?: string
}

export interface PluginRegistry {
  plugins: Plugin[]
  lastUpdated: number
}

// ============================================================================
// Storage Paths
// ============================================================================

const VIBECRAFT_DIR = join(homedir(), '.vibecraft')
const DATA_DIR = join(VIBECRAFT_DIR, 'data')
const PLUGINS_DIR = join(VIBECRAFT_DIR, 'plugins')
const INSTALLED_FILE = join(DATA_DIR, 'installed-plugins.json')
const REGISTRY_CACHE = join(DATA_DIR, 'plugin-registry-cache.json')

// Ensure directories exist
import { mkdirSync } from 'fs'
;[VIBECRAFT_DIR, DATA_DIR, PLUGINS_DIR].forEach((dir) => {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
})

// ============================================================================
// Featured/Official Plugins
// ============================================================================

const OFFICIAL_PLUGINS: Plugin[] = [
  {
    id: 'character-pack-wizards',
    name: 'Wizard Character Pack',
    description: 'Mystical wizard characters with purple robes and spellcasting animations',
    version: '1.0.0',
    author: 'Vibecraft Team',
    type: 'character',
    categories: ['characters', 'official'],
    official: true,
    featured: true,
    githubUrl: 'https://github.com/vibecraft/character-pack-wizards',
  },
  {
    id: 'character-pack-ninjas',
    name: 'Ninja Character Pack',
    description: 'Stealthy ninja characters with martial arts animations',
    version: '1.0.0',
    author: 'Vibecraft Team',
    type: 'character',
    categories: ['characters', 'official'],
    official: true,
    featured: true,
    githubUrl: 'https://github.com/vibecraft/character-pack-ninjas',
  },
  {
    id: 'character-pack-samurai',
    name: 'Samurai Character Pack',
    description: 'Honorable samurai characters with sword combat animations',
    version: '1.0.0',
    author: 'Vibecraft Team',
    type: 'character',
    categories: ['characters', 'official'],
    official: true,
    featured: true,
    githubUrl: 'https://github.com/vibecraft/character-pack-samurai',
  },
  {
    id: 'animation-pack-emotes',
    name: 'Emote Animation Pack',
    description: '50+ expressive emotes and reactions for characters',
    version: '1.0.0',
    author: 'Vibecraft Team',
    type: 'animation',
    categories: ['animations', 'official'],
    official: true,
    featured: true,
    githubUrl: 'https://github.com/vibecraft/animation-pack-emotes',
  },
  {
    id: 'sound-pack-cyberpunk',
    name: 'Cyberpunk Sound Pack',
    description: 'Futuristic cyberpunk-themed sound effects',
    version: '1.0.0',
    author: 'Vibecraft Team',
    type: 'sound',
    categories: ['sounds', 'official'],
    official: true,
    githubUrl: 'https://github.com/vibecraft/sound-pack-cyberpunk',
  },
  {
    id: 'sound-pack-retro',
    name: 'Retro 8-bit Sound Pack',
    description: 'Classic 8-bit style sound effects',
    version: '1.0.0',
    author: 'Vibecraft Team',
    type: 'sound',
    categories: ['sounds', 'official'],
    official: true,
    githubUrl: 'https://github.com/vibecraft/sound-pack-retro',
  },
  {
    id: 'theme-dark-mode',
    name: 'Dark Mode Theme',
    description: 'Sleek dark theme with purple/cyan accents',
    version: '1.0.0',
    author: 'Vibecraft Team',
    type: 'theme',
    categories: ['themes', 'official'],
    official: true,
    featured: true,
    githubUrl: 'https://github.com/vibecraft/theme-dark-mode',
  },
  {
    id: 'theme-light-mode',
    name: 'Light Mode Theme',
    description: 'Clean light theme with blue/green accents',
    version: '1.0.0',
    author: 'Vibecraft Team',
    type: 'theme',
    categories: ['themes', 'official'],
    official: true,
    githubUrl: 'https://github.com/vibecraft/theme-light-mode',
  },
  {
    id: 'layout-compact',
    name: 'Compact Workshop Layout',
    description: 'Tighter station spacing for smaller zones',
    version: '1.0.0',
    author: 'Vibecraft Team',
    type: 'layout',
    categories: ['layouts', 'official'],
    official: true,
    githubUrl: 'https://github.com/vibecraft/layout-compact',
  },
  {
    id: 'util-performance-monitor',
    name: 'Performance Monitor',
    description: 'Real-time FPS and memory usage overlay',
    version: '1.0.0',
    author: 'Vibecraft Team',
    type: 'utility',
    categories: ['utilities', 'official'],
    official: true,
    githubUrl: 'https://github.com/vibecraft/util-performance-monitor',
  },
]

const COMMUNITY_PLUGINS: Plugin[] = [
  {
    id: 'character-pack-robots',
    name: 'Robot Character Pack',
    description: 'Mechanical robot characters with LED animations',
    version: '1.0.0',
    author: 'CommunityDev',
    type: 'character',
    categories: ['characters', 'community'],
    githubUrl: 'https://github.com/community/character-pack-robots',
  },
  {
    id: 'character-pack-animals',
    name: 'Animal Character Pack',
    description: 'Cute animal characters with playful animations',
    version: '1.0.0',
    author: 'AnimalLover',
    type: 'character',
    categories: ['characters', 'community'],
    githubUrl: 'https://github.com/community/character-pack-animals',
  },
  {
    id: 'sound-pack-nature',
    name: 'Nature Sound Pack',
    description: 'Calming nature-themed sound effects',
    version: '1.0.0',
    author: 'NatureFan',
    type: 'sound',
    categories: ['sounds', 'community'],
    githubUrl: 'https://github.com/community/sound-pack-nature',
  },
  {
    id: 'theme-neon-city',
    name: 'Neon City Theme',
    description: 'Bright neon colors inspired by cyberpunk cities',
    version: '1.0.0',
    author: 'CyberArtist',
    type: 'theme',
    categories: ['themes', 'community'],
    githubUrl: 'https://github.com/community/theme-neon-city',
  },
  {
    id: 'layout-minimal',
    name: 'Minimal Layout',
    description: 'Ultra-minimal station layout',
    version: '1.0.0',
    author: 'MinimalDesign',
    type: 'layout',
    categories: ['layouts', 'community'],
    githubUrl: 'https://github.com/community/layout-minimal',
  },
]

// ============================================================================
// Registry Management
// ============================================================================

const cachedRegistry: PluginRegistry | null = null

/**
 * Get all available plugins (official + community)
 */
export function getAllPlugins(): Plugin[] {
  return [...OFFICIAL_PLUGINS, ...COMMUNITY_PLUGINS]
}

/**
 * Get featured plugins
 */
export function getFeaturedPlugins(): Plugin[] {
  return getAllPlugins().filter((p) => p.featured)
}

/**
 * Get official plugins
 */
export function getOfficialPlugins(): Plugin[] {
  return OFFICIAL_PLUGINS
}

/**
 * Get community plugins
 */
export function getCommunityPlugins(): Plugin[] {
  return COMMUNITY_PLUGINS
}

/**
 * Get plugins by type
 */
export function getPluginsByType(type: Plugin['type']): Plugin[] {
  return getAllPlugins().filter((p) => p.type === type)
}

/**
 * Get all plugin categories
 */
export function getCategories(): Array<{ name: string; count: number }> {
  const allPlugins = getAllPlugins()
  const categoryCount = new Map<string, number>()

  for (const plugin of allPlugins) {
    for (const cat of plugin.categories) {
      categoryCount.set(cat, (categoryCount.get(cat) || 0) + 1)
    }
  }

  return Array.from(categoryCount.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}

/**
 * Search plugins by query
 */
export function searchPlugins(query: string): Plugin[] {
  const lowerQuery = query.toLowerCase()
  return getAllPlugins().filter(
    (p) =>
      p.name.toLowerCase().includes(lowerQuery) ||
      p.description.toLowerCase().includes(lowerQuery) ||
      p.categories.some((c) => c.toLowerCase().includes(lowerQuery)) ||
      p.author.toLowerCase().includes(lowerQuery)
  )
}

/**
 * Get plugin by ID
 */
export function getPluginById(id: string): Plugin | undefined {
  return getAllPlugins().find((p) => p.id === id)
}

// ============================================================================
// Installation Management
// ============================================================================

/**
 * Load installed plugins from disk
 */
function loadInstalledPlugins(): InstalledPlugin[] {
  if (!existsSync(INSTALLED_FILE)) {
    return []
  }

  try {
    const data = readFileSync(INSTALLED_FILE, 'utf8')
    return JSON.parse(data)
  } catch (err) {
    console.error('[PluginMarketplace] Failed to load installed plugins:', err)
    return []
  }
}

/**
 * Save installed plugins to disk
 */
function saveInstalledPlugins(plugins: InstalledPlugin[]): void {
  try {
    writeFileSync(INSTALLED_FILE, JSON.stringify(plugins, null, 2), 'utf8')
  } catch (err) {
    console.error('[PluginMarketplace] Failed to save installed plugins:', err)
  }
}

/**
 * Get all installed plugins
 */
export function getInstalledPlugins(): InstalledPlugin[] {
  return loadInstalledPlugins()
}

/**
 * Check if a plugin is installed
 */
export function isPluginInstalled(pluginId: string): boolean {
  return getInstalledPlugins().some((p) => p.id === pluginId)
}

/**
 * Install a plugin
 */
export async function installPlugin(pluginId: string): Promise<{ ok: boolean; error?: string }> {
  const plugin = getPluginById(pluginId)
  if (!plugin) {
    return { ok: false, error: 'Plugin not found' }
  }

  if (isPluginInstalled(pluginId)) {
    return { ok: false, error: 'Plugin already installed' }
  }

  try {
    // TODO: Actual plugin installation logic
    // For now, just mark as installed
    const installed = loadInstalledPlugins()
    const installedPlugin: InstalledPlugin = {
      ...plugin,
      installedAt: Date.now(),
      installedVersion: plugin.version,
      enabled: true,
    }

    installed.push(installedPlugin)
    saveInstalledPlugins(installed)

    console.log(`[PluginMarketplace] Installed plugin: ${plugin.name}`)
    return { ok: true }
  } catch (err) {
    console.error('[PluginMarketplace] Installation failed:', err)
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * Uninstall a plugin
 */
export async function uninstallPlugin(pluginId: string): Promise<{ ok: boolean; error?: string }> {
  if (!isPluginInstalled(pluginId)) {
    return { ok: false, error: 'Plugin not installed' }
  }

  try {
    // TODO: Actual plugin uninstallation logic
    // For now, just remove from installed list
    const installed = loadInstalledPlugins()
    const filtered = installed.filter((p) => p.id !== pluginId)
    saveInstalledPlugins(filtered)

    console.log(`[PluginMarketplace] Uninstalled plugin: ${pluginId}`)
    return { ok: true }
  } catch (err) {
    console.error('[PluginMarketplace] Uninstallation failed:', err)
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * Enable/disable a plugin
 */
export async function togglePlugin(
  pluginId: string,
  enabled: boolean
): Promise<{ ok: boolean; error?: string }> {
  const installed = loadInstalledPlugins()
  const plugin = installed.find((p) => p.id === pluginId)

  if (!plugin) {
    return { ok: false, error: 'Plugin not installed' }
  }

  try {
    plugin.enabled = enabled
    saveInstalledPlugins(installed)

    console.log(`[PluginMarketplace] ${enabled ? 'Enabled' : 'Disabled'} plugin: ${plugin.name}`)
    return { ok: true }
  } catch (err) {
    console.error('[PluginMarketplace] Toggle failed:', err)
    return { ok: false, error: (err as Error).message }
  }
}
