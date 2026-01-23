/**
 * File Browser API
 *
 * Provides file system browsing capabilities across all environments:
 * - List directory contents
 * - Get workspace directory trees
 * - Environment-aware path handling
 *
 * Used for:
 * - New session modal file picker
 * - Zone creation directory browser
 * - Workspace management
 */

import { readdirSync, statSync, existsSync } from 'fs'
import { join, basename, dirname, sep } from 'path'
import { homedir } from 'os'
import { toDisplayPath, toExecutionPath } from './pathTranslation.js'
import { getEnvironment } from './environment.js'

// ============================================================================
// Types
// ============================================================================

export interface FileEntry {
  /** File/directory name */
  name: string

  /** Full path (execution path) */
  path: string

  /** Display path (for UI) */
  displayPath: string

  /** File type */
  type: 'file' | 'directory'

  /** File size in bytes (files only) */
  size?: number

  /** Last modified timestamp */
  modified: number

  /** Is hidden file (starts with .) */
  hidden: boolean

  /** Is accessible (readable/executable) */
  accessible: boolean
}

export interface DirectoryTree {
  /** Directory path (execution path) */
  path: string

  /** Display path (for UI) */
  displayPath: string

  /** Directory entries */
  entries: FileEntry[]

  /** Subdirectory trees (if depth > 0) */
  children?: DirectoryTree[]

  /** Total number of files */
  fileCount: number

  /** Total number of directories */
  dirCount: number
}

export interface WorkspaceInfo {
  /** Workspace name */
  name: string

  /** Workspace path (execution path) */
  path: string

  /** Display path (for UI) */
  displayPath: string

  /** Is this the current working directory */
  isCurrent: boolean

  /** Is this the home directory */
  isHome: boolean

  /** Is accessible */
  accessible: boolean
}

// ============================================================================
// File System Operations
// ============================================================================

/**
 * Check if a path is accessible (readable and executable)
 */
function isAccessible(path: string): boolean {
  try {
    const stat = statSync(path)
    return stat.isDirectory() || stat.isFile()
  } catch (err) {
    return false
  }
}

/**
 * Check if a file/directory should be hidden from browser
 *
 * Hides:
 * - Dot files/directories (except .claude, .vibecraft)
 * - System directories (node_modules, .git, etc.)
 * - Temp directories
 */
function shouldHide(name: string, path: string): boolean {
  // Always show important dot directories
  const allowedDotDirs = ['.claude', '.vibecraft', '.config']
  if (allowedDotDirs.includes(name)) {
    return false
  }

  // Hide other dot files/directories
  if (name.startsWith('.')) {
    return true
  }

  // Hide system directories
  const systemDirs = [
    'node_modules',
    '__pycache__',
    '.git',
    '.next',
    'dist',
    'build',
    'out',
    '.cache',
    'tmp',
    'temp',
  ]
  if (systemDirs.includes(name.toLowerCase())) {
    return true
  }

  return false
}

/**
 * List directory contents
 *
 * @param dirPath - Directory to list (execution path)
 * @param options - Listing options
 * @returns Array of file entries
 */
export async function listDirectory(
  dirPath: string,
  options: {
    /** Include hidden files (default: false) */
    includeHidden?: boolean
    /** Include files (default: true) */
    includeFiles?: boolean
    /** Include directories (default: true) */
    includeDirs?: boolean
    /** Sort by (default: 'name') */
    sortBy?: 'name' | 'modified' | 'size' | 'type'
    /** Sort order (default: 'asc') */
    sortOrder?: 'asc' | 'desc'
  } = {}
): Promise<FileEntry[]> {
  const {
    includeHidden = false,
    includeFiles = true,
    includeDirs = true,
    sortBy = 'name',
    sortOrder = 'asc',
  } = options

  if (!existsSync(dirPath)) {
    throw new Error(`Directory not found: ${dirPath}`)
  }

  if (!isAccessible(dirPath)) {
    throw new Error(`Directory not accessible: ${dirPath}`)
  }

  try {
    const names = readdirSync(dirPath)
    const entries: FileEntry[] = []

    for (const name of names) {
      const fullPath = join(dirPath, name)

      // Check if accessible
      if (!isAccessible(fullPath)) {
        continue
      }

      const stat = statSync(fullPath)
      const isDir = stat.isDirectory()
      const isFile = stat.isFile()

      // Skip if not the right type
      if (isDir && !includeDirs) continue
      if (isFile && !includeFiles) continue

      // Check if hidden
      const hidden = shouldHide(name, fullPath)
      if (hidden && !includeHidden) {
        continue
      }

      // Get display path
      const displayPath = await toDisplayPath(fullPath)

      entries.push({
        name,
        path: fullPath,
        displayPath,
        type: isDir ? 'directory' : 'file',
        size: isFile ? stat.size : undefined,
        modified: stat.mtimeMs,
        hidden,
        accessible: true,
      })
    }

    // Sort entries
    entries.sort((a, b) => {
      let cmp = 0

      // Always put directories first
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1
      }

      // Then sort by specified field
      switch (sortBy) {
        case 'name':
          cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
          break
        case 'modified':
          cmp = a.modified - b.modified
          break
        case 'size':
          cmp = (a.size || 0) - (b.size || 0)
          break
        case 'type':
          cmp = a.type.localeCompare(b.type)
          break
      }

      return sortOrder === 'asc' ? cmp : -cmp
    })

    return entries
  } catch (err) {
    throw new Error(`Failed to list directory: ${(err as Error).message}`)
  }
}

/**
 * Get directory tree with specified depth
 *
 * @param dirPath - Root directory (execution path)
 * @param depth - How many levels deep to traverse (0 = just this dir)
 * @param options - Listing options
 * @returns Directory tree
 */
export async function getDirectoryTree(
  dirPath: string,
  depth: number = 1,
  options: {
    includeHidden?: boolean
    maxFiles?: number
  } = {}
): Promise<DirectoryTree> {
  const { includeHidden = false, maxFiles = 1000 } = options

  if (!existsSync(dirPath)) {
    throw new Error(`Directory not found: ${dirPath}`)
  }

  const displayPath = await toDisplayPath(dirPath)
  const entries = await listDirectory(dirPath, {
    includeHidden,
    includeDirs: true,
    includeFiles: true,
  })

  let fileCount = 0
  let dirCount = 0
  const children: DirectoryTree[] = []

  // Count files and directories
  for (const entry of entries) {
    if (entry.type === 'file') {
      fileCount++
    } else {
      dirCount++
    }
  }

  // Recurse into subdirectories if depth > 0
  if (depth > 0) {
    let totalFiles = fileCount

    for (const entry of entries) {
      if (entry.type === 'directory' && totalFiles < maxFiles) {
        try {
          const subtree = await getDirectoryTree(entry.path, depth - 1, {
            includeHidden,
            maxFiles: maxFiles - totalFiles,
          })
          children.push(subtree)

          totalFiles += subtree.fileCount
          dirCount += subtree.dirCount
          fileCount += subtree.fileCount

          // Stop if we've hit the max files limit
          if (totalFiles >= maxFiles) {
            break
          }
        } catch (err) {
          // Skip inaccessible subdirectories
          continue
        }
      }
    }
  }

  return {
    path: dirPath,
    displayPath,
    entries,
    children: children.length > 0 ? children : undefined,
    fileCount,
    dirCount,
  }
}

/**
 * Get available workspaces
 *
 * Returns common workspace locations:
 * - Current working directory
 * - Home directory
 * - Environment-specific locations
 */
export async function getWorkspaces(): Promise<WorkspaceInfo[]> {
  const env = getEnvironment()
  const cwd = process.cwd()
  const home = homedir()
  const workspaces: WorkspaceInfo[] = []

  // Add current directory
  if (isAccessible(cwd)) {
    workspaces.push({
      name: basename(cwd),
      path: cwd,
      displayPath: await toDisplayPath(cwd),
      isCurrent: true,
      isHome: cwd === home,
      accessible: true,
    })
  }

  // Add home directory (if different from cwd)
  if (home !== cwd && isAccessible(home)) {
    workspaces.push({
      name: '~',
      path: home,
      displayPath: await toDisplayPath(home),
      isCurrent: false,
      isHome: true,
      accessible: true,
    })
  }

  // Add Docker volume mounts (if in Docker)
  if (env.docker && env.docker.volumeMounts) {
    for (const mount of env.docker.volumeMounts) {
      const mountPath = mount.target
      if (isAccessible(mountPath) && mountPath !== cwd && mountPath !== home) {
        workspaces.push({
          name: basename(mountPath) || 'Volume',
          path: mountPath,
          displayPath: await toDisplayPath(mountPath),
          isCurrent: false,
          isHome: false,
          accessible: true,
        })
      }
    }
  }

  // Add WSL drive mounts (if in WSL)
  if (env.isWSL) {
    const drives = ['c', 'd', 'e', 'f']
    for (const drive of drives) {
      const mountPath = `/mnt/${drive}`
      if (isAccessible(mountPath)) {
        // Don't add if already in list
        if (workspaces.some((ws) => ws.path === mountPath)) {
          continue
        }

        workspaces.push({
          name: `${drive.toUpperCase()}:`,
          path: mountPath,
          displayPath: await toDisplayPath(mountPath),
          isCurrent: false,
          isHome: false,
          accessible: true,
        })
      }
    }
  }

  return workspaces
}

/**
 * Get parent directory path
 */
export function getParentPath(path: string): string | null {
  const parent = dirname(path)
  if (parent === path) {
    return null // Already at root
  }
  return parent
}

/**
 * Validate a path (check if it exists and is accessible)
 */
export function validatePath(path: string): { valid: boolean; error?: string } {
  if (!path || path.trim() === '') {
    return { valid: false, error: 'Path is empty' }
  }

  if (!existsSync(path)) {
    return { valid: false, error: 'Path does not exist' }
  }

  if (!isAccessible(path)) {
    return { valid: false, error: 'Path is not accessible (permission denied)' }
  }

  return { valid: true }
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(ms: number): string {
  const date = new Date(ms)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return 'Today'
  } else if (diffDays === 1) {
    return 'Yesterday'
  } else if (diffDays < 7) {
    return `${diffDays} days ago`
  } else {
    return date.toLocaleDateString()
  }
}
