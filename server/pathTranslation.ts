/**
 * Path Translation Service
 *
 * Handles path conversions between different environments:
 * - Docker container ↔ Host
 * - WSL ↔ Windows
 * - Native paths (no translation)
 *
 * Examples:
 * - Container: /workspace/project → Host: /home/user/workspace/project
 * - WSL: /mnt/c/Users/alice → Windows: C:\Users\alice
 * - Windows: C:\Projects → WSL: /mnt/c/Projects
 */

import * as path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { existsSync, readFileSync } from 'fs'
import { getEnvironment, type EnvironmentInfo } from './environment.js'

const execAsync = promisify(exec)

// ============================================================================
// Types
// ============================================================================

export interface PathMapping {
  /** Container or WSL path */
  source: string
  /** Host or Windows path */
  target: string
}

export interface PathTranslationOptions {
  /** Cache Docker volume mappings (default: true) */
  cache?: boolean
  /** Throw error if no mapping found (default: false) */
  strict?: boolean
}

// ============================================================================
// Docker Volume Detection
// ============================================================================

let cachedVolumeMappings: PathMapping[] | null = null

/**
 * Detect Docker volume mappings from docker inspect
 *
 * Parses 'docker inspect' output to find bind mounts and volumes
 */
async function detectDockerVolumeMappings(): Promise<PathMapping[]> {
  try {
    // Try to get container ID from cgroup
    const containerId = getContainerId()
    if (!containerId) {
      return []
    }

    // Run docker inspect to get volume mounts
    const { stdout } = await execAsync(`docker inspect ${containerId}`)
    const inspect = JSON.parse(stdout)

    if (!inspect || !inspect[0] || !inspect[0].Mounts) {
      return []
    }

    const mappings: PathMapping[] = []
    for (const mount of inspect[0].Mounts) {
      if (mount.Type === 'bind' && mount.Source && mount.Destination) {
        mappings.push({
          source: mount.Destination, // Container path
          target: mount.Source, // Host path
        })
      }
    }

    return mappings
  } catch (err) {
    // docker command not available or not in container
    return []
  }
}

/**
 * Get container ID from cgroup
 */
function getContainerId(): string | null {
  try {
    const cgroupPath = '/proc/self/cgroup'
    if (!existsSync(cgroupPath)) return null

    const cgroup = readFileSync(cgroupPath, 'utf8')
    // Look for docker container ID in cgroup
    const match = cgroup.match(/docker[/-]([a-f0-9]{64}|[a-f0-9]{12})/)
    return match ? match[1] : null
  } catch (err) {
    return null
  }
}

/**
 * Get Docker volume mappings (cached)
 */
async function getDockerMappings(options?: PathTranslationOptions): Promise<PathMapping[]> {
  const useCache = options?.cache !== false

  if (useCache && cachedVolumeMappings !== null) {
    return cachedVolumeMappings
  }

  const mappings = await detectDockerVolumeMappings()
  if (useCache) {
    cachedVolumeMappings = mappings
  }

  return mappings
}

// ============================================================================
// WSL Path Translation
// ============================================================================

/**
 * Convert WSL path to Windows path
 *
 * Examples:
 * - /mnt/c/Users/alice → C:\Users\alice
 * - /home/glitch → /home/glitch (no conversion)
 */
export function wslToWindows(wslPath: string): string {
  // Check if it's a /mnt/* path
  const match = wslPath.match(/^\/mnt\/([a-z])(\/.*)?$/)
  if (!match) {
    return wslPath // Not a Windows mount
  }

  const [, drive, pathPart] = match
  const windowsDrive = drive.toUpperCase()
  const windowsPath = (pathPart || '').replace(/\//g, '\\')

  return `${windowsDrive}:${windowsPath || '\\'}`
}

/**
 * Convert Windows path to WSL path
 *
 * Examples:
 * - C:\Users\alice → /mnt/c/Users/alice
 * - D:\Projects → /mnt/d/Projects
 */
export function windowsToWSL(windowsPath: string): string {
  // Check if it's a Windows path (C:\...)
  const match = windowsPath.match(/^([A-Za-z]):(\\.*)?$/)
  if (!match) {
    return windowsPath // Not a Windows path
  }

  const [, drive, pathPart] = match
  const wslDrive = drive.toLowerCase()
  const wslPath = (pathPart || '').replace(/\\/g, '/')

  return `/mnt/${wslDrive}${wslPath || '/'}`
}

// ============================================================================
// Docker Path Translation
// ============================================================================

/**
 * Convert container path to host path
 *
 * Uses Docker volume mappings to translate paths
 *
 * Examples:
 * - /workspace/project → /home/user/workspace/project
 * - /app → /app (no mapping)
 */
export async function containerToHost(
  containerPath: string,
  options?: PathTranslationOptions
): Promise<string> {
  const mappings = await getDockerMappings(options)

  // Find longest matching prefix (most specific mount)
  let bestMatch: PathMapping | null = null
  let bestMatchLength = 0

  for (const mapping of mappings) {
    if (containerPath.startsWith(mapping.source)) {
      const matchLength = mapping.source.length
      if (matchLength > bestMatchLength) {
        bestMatch = mapping
        bestMatchLength = matchLength
      }
    }
  }

  if (!bestMatch) {
    if (options?.strict) {
      throw new Error(`No Docker volume mapping found for container path: ${containerPath}`)
    }
    return containerPath // No mapping found, return as-is
  }

  // Replace container path prefix with host path
  const relativePath = containerPath.slice(bestMatch.source.length)
  return path.join(bestMatch.target, relativePath)
}

/**
 * Convert host path to container path
 *
 * Uses Docker volume mappings to translate paths
 *
 * Examples:
 * - /home/user/workspace/project → /workspace/project
 * - /tmp → /tmp (no mapping)
 */
export async function hostToContainer(
  hostPath: string,
  options?: PathTranslationOptions
): Promise<string> {
  const mappings = await getDockerMappings(options)

  // Find longest matching prefix
  let bestMatch: PathMapping | null = null
  let bestMatchLength = 0

  for (const mapping of mappings) {
    if (hostPath.startsWith(mapping.target)) {
      const matchLength = mapping.target.length
      if (matchLength > bestMatchLength) {
        bestMatch = mapping
        bestMatchLength = matchLength
      }
    }
  }

  if (!bestMatch) {
    if (options?.strict) {
      throw new Error(`No Docker volume mapping found for host path: ${hostPath}`)
    }
    return hostPath // No mapping found, return as-is
  }

  // Replace host path prefix with container path
  const relativePath = hostPath.slice(bestMatch.target.length)
  return path.join(bestMatch.source, relativePath)
}

// ============================================================================
// Smart Path Translation (Environment-Aware)
// ============================================================================

/**
 * Translate path for display (container/WSL → host/Windows)
 *
 * Automatically detects environment and applies correct translation:
 * - Docker: container → host
 * - WSL: WSL → Windows
 * - Native: no translation
 */
export async function toDisplayPath(
  sourcePath: string,
  options?: PathTranslationOptions
): Promise<string> {
  const env = getEnvironment()

  if (env.isDocker) {
    // Docker: Translate container → host
    const hostPath = await containerToHost(sourcePath, options)

    // If host is WSL, also translate to Windows
    if (env.isWSL) {
      return wslToWindows(hostPath)
    }

    return hostPath
  }

  if (env.isWSL) {
    // WSL: Translate to Windows for display
    return wslToWindows(sourcePath)
  }

  // Native: No translation
  return sourcePath
}

/**
 * Translate path for execution (host/Windows → container/WSL)
 *
 * Automatically detects environment and applies correct translation:
 * - Docker: host → container
 * - WSL: Windows → WSL
 * - Native: no translation
 */
export async function toExecutionPath(
  displayPath: string,
  options?: PathTranslationOptions
): Promise<string> {
  const env = getEnvironment()

  if (env.isDocker) {
    // If input is Windows path, convert to WSL first
    let hostPath = displayPath
    if (displayPath.match(/^[A-Za-z]:/)) {
      hostPath = windowsToWSL(displayPath)
    }

    // Docker: Translate host → container
    return await hostToContainer(hostPath, options)
  }

  if (env.isWSL) {
    // WSL: Translate Windows to WSL
    return windowsToWSL(displayPath)
  }

  // Native: No translation
  return displayPath
}

/**
 * Normalize path separators to forward slashes
 */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/')
}

/**
 * Check if a path is a Windows path (C:\...)
 */
export function isWindowsPath(p: string): boolean {
  return /^[A-Za-z]:/.test(p)
}

/**
 * Check if a path is a WSL mount path (/mnt/c/...)
 */
export function isWSLMountPath(p: string): boolean {
  return /^\/mnt\/[a-z]\//.test(p)
}

// ============================================================================
// Auto-Detect Mappings (for debugging/UI)
// ============================================================================

/**
 * Get all available path mappings for current environment
 *
 * Returns:
 * - Docker volume mappings (if in Docker)
 * - WSL drive mappings (if in WSL)
 * - Empty array (if native)
 */
export async function autoDetectMappings(
  env?: EnvironmentInfo
): Promise<Array<{ type: string; source: string; target: string }>> {
  const envInfo = env || getEnvironment()
  const mappings: Array<{ type: string; source: string; target: string }> = []

  if (envInfo.isDocker) {
    const dockerMappings = await getDockerMappings()
    for (const mapping of dockerMappings) {
      mappings.push({
        type: 'docker-volume',
        source: mapping.source,
        target: mapping.target,
      })
    }
  }

  if (envInfo.isWSL) {
    // Add WSL drive mappings
    const drives = ['c', 'd', 'e', 'f']
    for (const drive of drives) {
      const mountPoint = `/mnt/${drive}`
      const windowsDrive = `${drive.toUpperCase()}:\\`
      if (existsSync(mountPoint)) {
        mappings.push({
          type: 'wsl-drive',
          source: mountPoint,
          target: windowsDrive,
        })
      }
    }
  }

  return mappings
}

/**
 * Clear cached Docker volume mappings
 */
export function clearCache(): void {
  cachedVolumeMappings = null
}
