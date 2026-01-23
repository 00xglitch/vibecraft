/**
 * Environment Detection - Auto-detect runtime environment
 *
 * Detects whether Vibecraft is running in:
 * - Docker container
 * - Windows Subsystem for Linux (WSL)
 * - Native macOS/Linux/Windows
 *
 * This information is used for:
 * - Path translation (container/host, WSL/Windows)
 * - File browser behavior
 * - UI indicators
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

// ============================================================================
// Types
// ============================================================================

export type EnvironmentType = 'docker' | 'wsl' | 'native'
export type Platform = 'linux' | 'darwin' | 'win32'

export interface EnvironmentInfo {
  /** Environment type (docker, wsl, native) */
  type: EnvironmentType

  /** OS platform (linux, darwin, win32) */
  platform: Platform

  /** True if running in Docker container */
  isDocker: boolean

  /** True if running in WSL */
  isWSL: boolean

  /** True if running on Windows natively */
  isWindows: boolean

  /** True if running on macOS */
  isMac: boolean

  /** True if running on Linux natively */
  isLinux: boolean

  /** OS release string */
  release: string

  /** Home directory */
  homeDir: string

  /** Docker-specific info (if applicable) */
  docker?: {
    /** Docker volume mounts detected */
    volumeMounts: Array<{ source: string; target: string }>
  }

  /** WSL-specific info (if applicable) */
  wsl?: {
    /** WSL distro name */
    distroName?: string
    /** Windows host detected */
    windowsHost: boolean
  }
}

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Check if running in Docker container
 *
 * Methods:
 * 1. Check for /.dockerenv file
 * 2. Check /proc/1/cgroup for "docker" string
 */
export function checkDocker(): boolean {
  // Method 1: Check for /.dockerenv
  if (fs.existsSync('/.dockerenv')) {
    return true
  }

  // Method 2: Check cgroup for docker
  try {
    const cgroupPath = '/proc/1/cgroup'
    if (fs.existsSync(cgroupPath)) {
      const cgroup = fs.readFileSync(cgroupPath, 'utf8')
      if (cgroup.includes('docker')) {
        return true
      }
    }
  } catch (err) {
    // Ignore errors (file may not exist on non-Linux)
  }

  return false
}

/**
 * Check if running in Windows Subsystem for Linux
 *
 * Methods:
 * 1. Check WSL_DISTRO_NAME environment variable
 * 2. Check /proc/version for "Microsoft" or "WSL"
 */
export function checkWSL(): boolean {
  // Method 1: Check WSL_DISTRO_NAME env var
  if (process.env.WSL_DISTRO_NAME) {
    return true
  }

  // Method 2: Check /proc/version
  try {
    const versionPath = '/proc/version'
    if (fs.existsSync(versionPath)) {
      const version = fs.readFileSync(versionPath, 'utf8').toLowerCase()
      if (version.includes('microsoft') || version.includes('wsl')) {
        return true
      }
    }
  } catch (err) {
    // Ignore errors
  }

  return false
}

/**
 * Detect Docker volume mounts from /proc/mounts
 *
 * Parses mount points to find Docker volumes
 */
function detectDockerVolumes(): Array<{ source: string; target: string }> {
  const volumes: Array<{ source: string; target: string }> = []

  try {
    const mountsPath = '/proc/mounts'
    if (!fs.existsSync(mountsPath)) return volumes

    const mounts = fs.readFileSync(mountsPath, 'utf8')
    const lines = mounts.split('\n')

    for (const line of lines) {
      const parts = line.split(' ')
      if (parts.length < 2) continue

      const [source, target] = parts
      // Docker volumes typically mounted under /var/lib/docker/volumes
      // or bind mounts from host
      if (
        source.startsWith('/') &&
        !source.startsWith('/dev') &&
        !source.startsWith('/sys') &&
        !source.startsWith('/proc') &&
        target.startsWith('/')
      ) {
        volumes.push({ source, target })
      }
    }
  } catch (err) {
    // Ignore errors
  }

  return volumes
}

/**
 * Get WSL distro name and detect Windows host
 */
function getWSLInfo(): { distroName?: string; windowsHost: boolean } {
  const distroName = process.env.WSL_DISTRO_NAME

  // Check if /mnt/c exists (typical Windows C: drive mount)
  const windowsHost = fs.existsSync('/mnt/c')

  return { distroName, windowsHost }
}

/**
 * Detect current environment
 *
 * @returns EnvironmentInfo with all detection results
 */
export function detectEnvironment(): EnvironmentInfo {
  const platform = process.platform as Platform
  const isDocker = checkDocker()
  const isWSL = checkWSL()

  // Determine environment type (priority: docker > wsl > native)
  let type: EnvironmentType = 'native'
  if (isDocker) {
    type = 'docker'
  } else if (isWSL) {
    type = 'wsl'
  }

  const info: EnvironmentInfo = {
    type,
    platform,
    isDocker,
    isWSL,
    isWindows: platform === 'win32',
    isMac: platform === 'darwin',
    isLinux: platform === 'linux' && !isWSL && !isDocker,
    release: os.release(),
    homeDir: os.homedir(),
  }

  // Add Docker-specific info
  if (isDocker) {
    info.docker = {
      volumeMounts: detectDockerVolumes(),
    }
  }

  // Add WSL-specific info
  if (isWSL) {
    info.wsl = getWSLInfo()
  }

  return info
}

/**
 * Get available workspace directories
 *
 * Returns common workspace locations based on environment:
 * - Docker: Look for volume mounts
 * - WSL: Include /mnt/c/Users, /mnt/d, etc.
 * - Native: Home directory and common project locations
 */
export function getHostWorkspaces(env?: EnvironmentInfo): string[] {
  const envInfo = env || detectEnvironment()
  const workspaces: string[] = []

  if (envInfo.isDocker && envInfo.docker) {
    // Docker: Add volume mount targets
    for (const mount of envInfo.docker.volumeMounts) {
      // Only include mounts that look like workspace directories
      if (
        mount.target.includes('workspace') ||
        mount.target.includes('projects') ||
        mount.target.includes('src') ||
        mount.target.includes('code')
      ) {
        workspaces.push(mount.target)
      }
    }
  }

  if (envInfo.isWSL) {
    // WSL: Add Windows drive mounts
    const drives = ['c', 'd', 'e', 'f']
    for (const drive of drives) {
      const mountPoint = `/mnt/${drive}`
      if (fs.existsSync(mountPoint)) {
        workspaces.push(mountPoint)

        // Add common Windows directories
        const usersPath = path.join(mountPoint, 'Users')
        if (fs.existsSync(usersPath)) {
          try {
            const users = fs.readdirSync(usersPath)
            for (const user of users) {
              const userPath = path.join(usersPath, user)
              const stat = fs.statSync(userPath)
              if (stat.isDirectory()) {
                workspaces.push(userPath)
              }
            }
          } catch (err) {
            // Ignore permission errors
          }
        }
      }
    }
  }

  // Always include home directory
  workspaces.push(envInfo.homeDir)

  // Add current working directory
  workspaces.push(process.cwd())

  // Deduplicate and sort
  return Array.from(new Set(workspaces)).sort()
}

/**
 * Format environment info for display
 */
export function formatEnvironmentInfo(env: EnvironmentInfo): string {
  const lines: string[] = []

  lines.push(`Environment: ${env.type}`)
  lines.push(`Platform: ${env.platform}`)
  lines.push(`Release: ${env.release}`)
  lines.push(`Home: ${env.homeDir}`)

  if (env.docker) {
    lines.push(`Docker Volumes: ${env.docker.volumeMounts.length}`)
  }

  if (env.wsl) {
    lines.push(`WSL Distro: ${env.wsl.distroName || 'unknown'}`)
    lines.push(`Windows Host: ${env.wsl.windowsHost}`)
  }

  return lines.join('\n')
}

// ============================================================================
// Singleton Instance
// ============================================================================

let cachedEnvironment: EnvironmentInfo | null = null

/**
 * Get cached environment info (or detect if not cached)
 */
export function getEnvironment(): EnvironmentInfo {
  if (!cachedEnvironment) {
    cachedEnvironment = detectEnvironment()
  }
  return cachedEnvironment
}

/**
 * Force re-detection of environment
 */
export function refreshEnvironment(): EnvironmentInfo {
  cachedEnvironment = detectEnvironment()
  return cachedEnvironment
}
