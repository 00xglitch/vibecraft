/**
 * Project Discovery Service
 *
 * Detects and tracks projects with .claude folders, parses CLAUDE.md,
 * and monitors Claude Code's project cache at ~/.claude/projects/
 */

import * as fs from 'fs'
import * as path from 'path'
import chokidar, { type FSWatcher } from 'chokidar'
import { randomUUID } from 'crypto'
import { type Project, type ProjectType } from '../shared/types.js'

// ============================================================================
// Constants
// ============================================================================

/** Claude Code's project cache directory */
const CLAUDE_PROJECTS_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || '~',
  '.claude',
  'projects'
)

/** Files that indicate project type */
const PROJECT_TYPE_FILES: Record<string, ProjectType> = {
  'package.json': 'nodejs',
  'pyproject.toml': 'python',
  'setup.py': 'python',
  'requirements.txt': 'python',
  'Cargo.toml': 'rust',
  'go.mod': 'go',
  'pom.xml': 'java',
  'build.gradle': 'java',
  '*.csproj': 'dotnet',
  '*.sln': 'dotnet',
  Gemfile: 'ruby',
}

// ============================================================================
// Project Discovery Class
// ============================================================================

export class ProjectDiscovery {
  private projects: Map<string, Project> = new Map()
  private pathToId: Map<string, string> = new Map()
  private watcher: FSWatcher | null = null
  private onChange: ((project: Project) => void) | null = null
  private onRemove: ((projectId: string) => void) | null = null
  private persistPath: string

  constructor(persistPath?: string) {
    this.persistPath =
      persistPath ||
      path.join(
        process.env.HOME || process.env.USERPROFILE || '~',
        '.vibecraft',
        'data',
        'projects.json'
      )
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Start the discovery service
   */
  async start(): Promise<void> {
    // Load persisted projects
    await this.loadPersisted()

    // Initial scan of Claude's project cache
    await this.scanClaudeProjectsDir()

    // Watch for changes
    this.startWatching()

    console.log(`[ProjectDiscovery] Started with ${this.projects.size} projects`)
  }

  /**
   * Stop the discovery service
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
    console.log('[ProjectDiscovery] Stopped')
  }

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  /**
   * Set callback for project changes (add/update)
   */
  onProjectChange(callback: (project: Project) => void): void {
    this.onChange = callback
  }

  /**
   * Set callback for project removal
   */
  onProjectRemove(callback: (projectId: string) => void): void {
    this.onRemove = callback
  }

  // ==========================================================================
  // Project Management
  // ==========================================================================

  /**
   * Get all discovered projects
   */
  getProjects(): Project[] {
    return Array.from(this.projects.values())
  }

  /**
   * Get project by ID
   */
  getProject(id: string): Project | undefined {
    return this.projects.get(id)
  }

  /**
   * Get project by path
   */
  getProjectByPath(projectPath: string): Project | undefined {
    const normalized = path.resolve(projectPath)
    const id = this.pathToId.get(normalized)
    return id ? this.projects.get(id) : undefined
  }

  /**
   * Manually register a project (e.g., when session starts in a directory)
   */
  async registerProject(projectPath: string): Promise<Project> {
    const normalized = path.resolve(projectPath)

    // Check if already registered
    const existingId = this.pathToId.get(normalized)
    if (existingId) {
      const existing = this.projects.get(existingId)!
      // Refresh its info
      return this.refreshProject(existing)
    }

    // Create new project
    const project = await this.createProjectFromPath(normalized)
    this.projects.set(project.id, project)
    this.pathToId.set(normalized, project.id)

    this.persist()
    this.onChange?.(project)

    return project
  }

  /**
   * Update project activity timestamp
   */
  touchProject(projectId: string): void {
    const project = this.projects.get(projectId)
    if (project) {
      project.lastActivity = Date.now()
      this.persist()
      this.onChange?.(project)
    }
  }

  /**
   * Link a session to a project
   */
  linkSession(projectId: string, sessionId: string): void {
    const project = this.projects.get(projectId)
    if (project && !project.sessionIds.includes(sessionId)) {
      project.sessionIds.push(sessionId)
      project.lastActivity = Date.now()
      this.persist()
      this.onChange?.(project)
    }
  }

  /**
   * Unlink a session from a project
   */
  unlinkSession(projectId: string, sessionId: string): void {
    const project = this.projects.get(projectId)
    if (project) {
      project.sessionIds = project.sessionIds.filter((id: string) => id !== sessionId)
      this.persist()
      this.onChange?.(project)
    }
  }

  // ==========================================================================
  // Discovery Logic
  // ==========================================================================

  /**
   * Scan Claude's project cache directory
   */
  private async scanClaudeProjectsDir(): Promise<void> {
    if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) {
      console.log('[ProjectDiscovery] Claude projects directory does not exist')
      return
    }

    try {
      const entries = fs.readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true })

      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Each subdirectory is a project
          const projectCacheDir = path.join(CLAUDE_PROJECTS_DIR, entry.name)
          await this.processProjectCacheDir(projectCacheDir)
        }
      }
    } catch (error) {
      console.error('[ProjectDiscovery] Error scanning Claude projects:', error)
    }
  }

  /**
   * Process a project cache directory (e.g., ~/.claude/projects/-home-user-myproject)
   */
  private async processProjectCacheDir(cacheDir: string): Promise<void> {
    try {
      // The directory name is the encoded path
      const dirName = path.basename(cacheDir)
      // Convert back to real path: -home-user-project → /home/user/project
      const realPath = '/' + dirName.replace(/^-/, '').replace(/-/g, '/')

      // Verify the real path exists
      if (!fs.existsSync(realPath)) {
        return
      }

      // Register if not already known
      if (!this.pathToId.has(realPath)) {
        await this.registerProject(realPath)
      }
    } catch (error) {
      console.error(`[ProjectDiscovery] Error processing cache dir ${cacheDir}:`, error)
    }
  }

  /**
   * Create a project record from a path
   */
  private async createProjectFromPath(projectPath: string): Promise<Project> {
    const hasClaudeFolder = fs.existsSync(path.join(projectPath, '.claude'))
    const claudeMdPath = path.join(projectPath, 'CLAUDE.md')
    const hasClaudeMd = fs.existsSync(claudeMdPath)

    // Parse CLAUDE.md for title and description
    let name = path.basename(projectPath)
    let description: string | undefined

    if (hasClaudeMd) {
      const parsed = this.parseClaudeMd(claudeMdPath)
      if (parsed.title) name = parsed.title
      if (parsed.description) description = parsed.description
    }

    // Detect project type
    const projectType = this.detectProjectType(projectPath)

    return {
      id: randomUUID(),
      name,
      path: projectPath,
      sessionIds: [],
      hasClaudeFolder,
      hasClaudeMd,
      description,
      projectType,
      lastActivity: Date.now(),
      discoveredAt: Date.now(),
    }
  }

  /**
   * Refresh a project's information
   */
  private async refreshProject(project: Project): Promise<Project> {
    const hasClaudeFolder = fs.existsSync(path.join(project.path, '.claude'))
    const claudeMdPath = path.join(project.path, 'CLAUDE.md')
    const hasClaudeMd = fs.existsSync(claudeMdPath)

    project.hasClaudeFolder = hasClaudeFolder
    project.hasClaudeMd = hasClaudeMd

    if (hasClaudeMd) {
      const parsed = this.parseClaudeMd(claudeMdPath)
      if (parsed.title) project.name = parsed.title
      if (parsed.description) project.description = parsed.description
    }

    project.projectType = this.detectProjectType(project.path)
    project.lastActivity = Date.now()

    this.persist()
    this.onChange?.(project)

    return project
  }

  /**
   * Parse CLAUDE.md for title and description
   */
  private parseClaudeMd(filePath: string): { title?: string; description?: string } {
    try {
      const content = fs.readFileSync(filePath, 'utf8')
      const lines = content.split('\n')

      let title: string | undefined
      let description: string | undefined

      // Find first H1 heading for title
      for (const line of lines) {
        const h1Match = line.match(/^#\s+(.+)$/)
        if (h1Match) {
          title = h1Match[1].trim()
          break
        }
      }

      // Find first paragraph after title for description
      let foundTitle = false
      const descLines: string[] = []
      for (const line of lines) {
        if (line.match(/^#\s+/)) {
          foundTitle = true
          continue
        }
        if (foundTitle && line.trim()) {
          // Skip if it's another heading
          if (line.match(/^##?\s+/)) break
          descLines.push(line.trim())
          // Take first paragraph (up to 200 chars)
          if (descLines.join(' ').length > 200) break
        }
        if (foundTitle && !line.trim() && descLines.length > 0) {
          break
        }
      }

      if (descLines.length > 0) {
        description = descLines.join(' ').slice(0, 200)
        if (description.length === 200) description += '...'
      }

      return { title, description }
    } catch (error) {
      return {}
    }
  }

  /**
   * Detect project type from file presence
   */
  private detectProjectType(projectPath: string): ProjectType {
    try {
      const files = fs.readdirSync(projectPath)

      for (const file of files) {
        // Check exact matches
        if (PROJECT_TYPE_FILES[file]) {
          return PROJECT_TYPE_FILES[file]
        }

        // Check pattern matches (*.csproj, *.sln)
        for (const [pattern, type] of Object.entries(PROJECT_TYPE_FILES)) {
          if (pattern.startsWith('*.')) {
            const ext = pattern.slice(1) // e.g., '.csproj'
            if (file.endsWith(ext)) {
              return type
            }
          }
        }
      }

      return 'unknown'
    } catch {
      return 'unknown'
    }
  }

  // ==========================================================================
  // File Watching
  // ==========================================================================

  /**
   * Start watching Claude's project cache directory
   */
  private startWatching(): void {
    if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) {
      // Create directory if it doesn't exist
      try {
        fs.mkdirSync(CLAUDE_PROJECTS_DIR, { recursive: true })
      } catch {
        console.warn('[ProjectDiscovery] Could not create Claude projects directory')
        return
      }
    }

    this.watcher = chokidar.watch(CLAUDE_PROJECTS_DIR, {
      depth: 1, // Only watch immediate subdirectories
      ignoreInitial: true,
    })

    this.watcher.on('addDir', async (dirPath) => {
      // New project cache directory added
      if (path.dirname(dirPath) === CLAUDE_PROJECTS_DIR) {
        console.log(`[ProjectDiscovery] New project detected: ${dirPath}`)
        await this.processProjectCacheDir(dirPath)
      }
    })

    this.watcher.on('unlinkDir', (dirPath) => {
      // Project cache directory removed
      if (path.dirname(dirPath) === CLAUDE_PROJECTS_DIR) {
        const dirName = path.basename(dirPath)
        const realPath = '/' + dirName.replace(/^-/, '').replace(/-/g, '/')
        const projectId = this.pathToId.get(realPath)

        if (projectId) {
          console.log(`[ProjectDiscovery] Project removed: ${realPath}`)
          this.projects.delete(projectId)
          this.pathToId.delete(realPath)
          this.persist()
          this.onRemove?.(projectId)
        }
      }
    })

    console.log(`[ProjectDiscovery] Watching ${CLAUDE_PROJECTS_DIR}`)
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  /**
   * Load persisted projects
   */
  private async loadPersisted(): Promise<void> {
    try {
      if (fs.existsSync(this.persistPath)) {
        const data = JSON.parse(fs.readFileSync(this.persistPath, 'utf8'))

        if (Array.isArray(data.projects)) {
          for (const project of data.projects as Project[]) {
            // Verify path still exists
            if (fs.existsSync(project.path)) {
              this.projects.set(project.id, project)
              this.pathToId.set(project.path, project.id)
            }
          }
        }

        console.log(`[ProjectDiscovery] Loaded ${this.projects.size} persisted projects`)
      }
    } catch (error) {
      console.error('[ProjectDiscovery] Error loading persisted projects:', error)
    }
  }

  /**
   * Persist projects to file
   */
  private persist(): void {
    try {
      const dir = path.dirname(this.persistPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      const data = {
        projects: Array.from(this.projects.values()),
        lastUpdated: Date.now(),
      }

      fs.writeFileSync(this.persistPath, JSON.stringify(data, null, 2))
    } catch (error) {
      console.error('[ProjectDiscovery] Error persisting projects:', error)
    }
  }
}

// Singleton instance
export const projectDiscovery = new ProjectDiscovery()
