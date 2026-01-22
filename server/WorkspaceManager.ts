/**
 * Workspace Manager Service
 *
 * Manages workspace groupings of projects and provides API endpoints
 * for workspace/project CRUD operations.
 */

import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'
import {
  type Workspace,
  type Project,
  type CreateWorkspaceRequest,
  type UpdateWorkspaceRequest,
  type CreateProjectRequest,
  type UpdateProjectRequest,
} from '../shared/types.js'
import { projectDiscovery } from './ProjectDiscovery.js'

// ============================================================================
// Workspace Manager Class
// ============================================================================

export class WorkspaceManager {
  private workspaces: Map<string, Workspace> = new Map()
  private onChange: ((workspace: Workspace) => void) | null = null
  private onRemove: ((workspaceId: string) => void) | null = null
  private persistPath: string

  constructor(persistPath?: string) {
    this.persistPath =
      persistPath ||
      path.join(
        process.env.HOME || process.env.USERPROFILE || '~',
        '.vibecraft',
        'data',
        'workspaces.json'
      )
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Start the workspace manager
   */
  async start(): Promise<void> {
    // Load persisted workspaces
    await this.loadPersisted()

    // Listen to project discovery events
    projectDiscovery.onProjectChange((project: Project) => {
      this.autoGroupProject(project)
    })

    console.log(`[WorkspaceManager] Started with ${this.workspaces.size} workspaces`)
  }

  /**
   * Stop the workspace manager
   */
  stop(): void {
    console.log('[WorkspaceManager] Stopped')
  }

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  /**
   * Set callback for workspace changes (add/update)
   */
  onWorkspaceChange(callback: (workspace: Workspace) => void): void {
    this.onChange = callback
  }

  /**
   * Set callback for workspace removal
   */
  onWorkspaceRemove(callback: (workspaceId: string) => void): void {
    this.onRemove = callback
  }

  // ==========================================================================
  // Workspace CRUD
  // ==========================================================================

  /**
   * Get all workspaces
   */
  getWorkspaces(): Workspace[] {
    return Array.from(this.workspaces.values())
  }

  /**
   * Get workspace by ID
   */
  getWorkspace(id: string): Workspace | undefined {
    return this.workspaces.get(id)
  }

  /**
   * Create a new workspace
   */
  createWorkspace(request: CreateWorkspaceRequest): Workspace {
    const workspace: Workspace = {
      id: randomUUID(),
      name: request.name,
      rootPath: request.rootPath,
      projectIds: [],
      color: request.color,
      createdAt: Date.now(),
    }

    this.workspaces.set(workspace.id, workspace)
    this.persist()
    this.onChange?.(workspace)

    // Auto-add projects if rootPath is specified
    if (workspace.rootPath) {
      this.autoAddProjectsFromRoot(workspace)
    }

    return workspace
  }

  /**
   * Update a workspace
   */
  updateWorkspace(id: string, request: UpdateWorkspaceRequest): Workspace | null {
    const workspace = this.workspaces.get(id)
    if (!workspace) return null

    if (request.name !== undefined) workspace.name = request.name
    if (request.rootPath !== undefined) workspace.rootPath = request.rootPath
    if (request.color !== undefined) workspace.color = request.color
    if (request.projectIds !== undefined) {
      // Update project references
      const oldProjectIds = workspace.projectIds
      const newProjectIds = request.projectIds

      // Remove workspace reference from removed projects
      for (const projectId of oldProjectIds) {
        if (!newProjectIds.includes(projectId)) {
          const project = projectDiscovery.getProject(projectId)
          if (project) {
            project.workspaceId = undefined
          }
        }
      }

      // Add workspace reference to new projects
      for (const projectId of newProjectIds) {
        const project = projectDiscovery.getProject(projectId)
        if (project) {
          project.workspaceId = id
        }
      }

      workspace.projectIds = newProjectIds
    }

    this.persist()
    this.onChange?.(workspace)

    return workspace
  }

  /**
   * Delete a workspace
   */
  deleteWorkspace(id: string): boolean {
    const workspace = this.workspaces.get(id)
    if (!workspace) return false

    // Remove workspace reference from all projects
    for (const projectId of workspace.projectIds) {
      const project = projectDiscovery.getProject(projectId)
      if (project) {
        project.workspaceId = undefined
      }
    }

    this.workspaces.delete(id)
    this.persist()
    this.onRemove?.(id)

    return true
  }

  // ==========================================================================
  // Project-Workspace Linking
  // ==========================================================================

  /**
   * Add a project to a workspace
   */
  addProjectToWorkspace(workspaceId: string, projectId: string): boolean {
    const workspace = this.workspaces.get(workspaceId)
    const project = projectDiscovery.getProject(projectId)

    if (!workspace || !project) return false

    // Remove from previous workspace if any
    if (project.workspaceId && project.workspaceId !== workspaceId) {
      this.removeProjectFromWorkspace(project.workspaceId, projectId)
    }

    if (!workspace.projectIds.includes(projectId)) {
      workspace.projectIds.push(projectId)
      project.workspaceId = workspaceId

      this.persist()
      this.onChange?.(workspace)
    }

    return true
  }

  /**
   * Remove a project from a workspace
   */
  removeProjectFromWorkspace(workspaceId: string, projectId: string): boolean {
    const workspace = this.workspaces.get(workspaceId)
    if (!workspace) return false

    const index = workspace.projectIds.indexOf(projectId)
    if (index === -1) return false

    workspace.projectIds.splice(index, 1)

    const project = projectDiscovery.getProject(projectId)
    if (project) {
      project.workspaceId = undefined
    }

    this.persist()
    this.onChange?.(workspace)

    return true
  }

  /**
   * Get projects in a workspace
   */
  getProjectsInWorkspace(workspaceId: string): Project[] {
    const workspace = this.workspaces.get(workspaceId)
    if (!workspace) return []

    return workspace.projectIds
      .map((id: string) => projectDiscovery.getProject(id))
      .filter((p: Project | undefined): p is Project => p !== undefined)
  }

  /**
   * Get ungrouped projects (not in any workspace)
   */
  getUngroupedProjects(): Project[] {
    return projectDiscovery.getProjects().filter((p: Project) => !p.workspaceId)
  }

  // ==========================================================================
  // Auto-Grouping Logic
  // ==========================================================================

  /**
   * Auto-group a project based on its path
   */
  private autoGroupProject(project: Project): void {
    // Skip if already in a workspace
    if (project.workspaceId) return

    // Check if project path matches any workspace's rootPath
    for (const workspace of this.workspaces.values()) {
      if (workspace.rootPath && project.path.startsWith(workspace.rootPath + path.sep)) {
        this.addProjectToWorkspace(workspace.id, project.id)
        console.log(`[WorkspaceManager] Auto-grouped ${project.name} into ${workspace.name}`)
        return
      }
    }
  }

  /**
   * Auto-add projects from a workspace's root path
   */
  private autoAddProjectsFromRoot(workspace: Workspace): void {
    if (!workspace.rootPath) return

    for (const project of projectDiscovery.getProjects()) {
      if (project.path.startsWith(workspace.rootPath + path.sep)) {
        this.addProjectToWorkspace(workspace.id, project.id)
      }
    }
  }

  /**
   * Suggest workspaces based on project paths
   */
  suggestWorkspaces(): { path: string; projectCount: number }[] {
    const pathCounts = new Map<string, number>()
    const projects = projectDiscovery.getProjects()

    // Count projects by parent directory
    for (const project of projects) {
      const parent = path.dirname(project.path)
      pathCounts.set(parent, (pathCounts.get(parent) || 0) + 1)
    }

    // Return paths with 2+ projects, sorted by count
    return Array.from(pathCounts.entries())
      .filter(([_, count]) => count >= 2)
      .map(([dirPath, count]) => ({ path: dirPath, projectCount: count }))
      .sort((a, b) => b.projectCount - a.projectCount)
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  /**
   * Load persisted workspaces
   */
  private async loadPersisted(): Promise<void> {
    try {
      if (fs.existsSync(this.persistPath)) {
        const data = JSON.parse(fs.readFileSync(this.persistPath, 'utf8'))

        if (Array.isArray(data.workspaces)) {
          for (const workspace of data.workspaces as Workspace[]) {
            this.workspaces.set(workspace.id, workspace)
          }
        }

        console.log(`[WorkspaceManager] Loaded ${this.workspaces.size} persisted workspaces`)
      }
    } catch (error) {
      console.error('[WorkspaceManager] Error loading persisted workspaces:', error)
    }
  }

  /**
   * Persist workspaces to file
   */
  private persist(): void {
    try {
      const dir = path.dirname(this.persistPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      const data = {
        workspaces: Array.from(this.workspaces.values()),
        lastUpdated: Date.now(),
      }

      fs.writeFileSync(this.persistPath, JSON.stringify(data, null, 2))
    } catch (error) {
      console.error('[WorkspaceManager] Error persisting workspaces:', error)
    }
  }
}

// Singleton instance
export const workspaceManager = new WorkspaceManager()
