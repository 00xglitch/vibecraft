/**
 * Orchestrator Manager
 *
 * Plugin system for managing multiple AI orchestration backends.
 * Supports LangGraph, CrewAI, AutoGen, and custom orchestrators.
 */

import { randomUUID } from 'crypto'
import {
  type OrchestratorType,
  type OrchestratorTask,
  type OrchestratorTaskRequest,
  type OrchestratorTaskResponse,
  type OrchestratorTaskListResponse,
  type IOrchestratorPlugin,
  type OrchestratorConfig,
  type WorkflowDefinition,
  type WorkflowNode,
  WORKFLOW_TEMPLATES,
} from '../../shared/orchestrator-types.js'

// ============================================================================
// Orchestrator Manager Class
// ============================================================================

export class OrchestratorManager {
  private plugins: Map<OrchestratorType, IOrchestratorPlugin> = new Map()
  private tasks: Map<string, OrchestratorTask> = new Map()
  private onChange: ((task: OrchestratorTask) => void) | null = null
  private defaultType: OrchestratorType = 'langgraph'

  // ==========================================================================
  // Plugin Registration
  // ==========================================================================

  /**
   * Register an orchestrator plugin
   */
  registerPlugin(plugin: IOrchestratorPlugin): void {
    this.plugins.set(plugin.type, plugin)
    console.log(`[OrchestratorManager] Registered plugin: ${plugin.name} (${plugin.type})`)
  }

  /**
   * Get a registered plugin by type
   */
  getPlugin(type: OrchestratorType): IOrchestratorPlugin | undefined {
    return this.plugins.get(type)
  }

  /**
   * List all registered plugins
   */
  listPlugins(): { type: OrchestratorType; name: string; ready: boolean }[] {
    return Array.from(this.plugins.values()).map((plugin) => ({
      type: plugin.type,
      name: plugin.name,
      ready: plugin.ready,
    }))
  }

  /**
   * Set the default orchestrator type
   */
  setDefaultType(type: OrchestratorType): void {
    if (!this.plugins.has(type)) {
      console.warn(`[OrchestratorManager] Plugin ${type} not registered, keeping current default`)
      return
    }
    this.defaultType = type
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize all registered plugins
   */
  async initialize(configs?: Record<OrchestratorType, OrchestratorConfig>): Promise<void> {
    const initPromises: Promise<void>[] = []

    for (const [type, plugin] of this.plugins) {
      const config = configs?.[type]
      initPromises.push(
        plugin.initialize(config).catch((error) => {
          console.error(`[OrchestratorManager] Failed to initialize ${type}:`, error)
        })
      )
    }

    await Promise.all(initPromises)
    console.log(`[OrchestratorManager] Initialized ${this.plugins.size} plugins`)
  }

  /**
   * Dispose all plugins
   */
  async dispose(): Promise<void> {
    const disposePromises: Promise<void>[] = []

    for (const plugin of this.plugins.values()) {
      disposePromises.push(
        plugin.dispose().catch((error) => {
          console.error(`[OrchestratorManager] Error disposing ${plugin.type}:`, error)
        })
      )
    }

    await Promise.all(disposePromises)
    this.plugins.clear()
    this.tasks.clear()
    console.log('[OrchestratorManager] Disposed')
  }

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  /**
   * Set callback for task changes
   */
  onTaskChange(callback: (task: OrchestratorTask) => void): void {
    this.onChange = callback
  }

  // ==========================================================================
  // Task Management
  // ==========================================================================

  /**
   * Submit a new task to an orchestrator
   */
  async submitTask(request: OrchestratorTaskRequest): Promise<OrchestratorTaskResponse> {
    const type = request.orchestratorType || this.defaultType
    const plugin = this.plugins.get(type)

    if (!plugin) {
      return {
        ok: false,
        error: `Orchestrator type '${type}' not registered`,
      }
    }

    if (!plugin.ready) {
      return {
        ok: false,
        error: `Orchestrator '${type}' is not ready`,
      }
    }

    try {
      // Resolve workflow if needed
      const workflow = this.resolveWorkflow(request)
      const taskRequest = { ...request, workflow }

      // Submit to plugin
      const taskId = await plugin.submitTask(taskRequest)

      // Get initial task state
      const task = await plugin.getTaskStatus(taskId)

      if (task) {
        this.tasks.set(taskId, task)
        this.onChange?.(task)

        return {
          ok: true,
          taskId,
          task,
        }
      }

      return {
        ok: true,
        taskId,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return {
        ok: false,
        error: `Failed to submit task: ${message}`,
      }
    }
  }

  /**
   * Get task status
   */
  async getTaskStatus(taskId: string): Promise<OrchestratorTaskResponse> {
    // First check local cache
    const cachedTask = this.tasks.get(taskId)
    if (!cachedTask) {
      return {
        ok: false,
        error: 'Task not found',
      }
    }

    // Get fresh status from plugin
    const plugin = this.plugins.get(cachedTask.orchestratorType)
    if (!plugin) {
      return {
        ok: true,
        task: cachedTask,
      }
    }

    try {
      const task = await plugin.getTaskStatus(taskId)
      if (task) {
        this.tasks.set(taskId, task)

        // Notify if status changed
        if (task.status !== cachedTask.status) {
          this.onChange?.(task)
        }

        return {
          ok: true,
          task,
        }
      }

      return {
        ok: true,
        task: cachedTask,
      }
    } catch (error) {
      // Return cached on error
      return {
        ok: true,
        task: cachedTask,
      }
    }
  }

  /**
   * Cancel a running task
   */
  async cancelTask(taskId: string): Promise<OrchestratorTaskResponse> {
    const task = this.tasks.get(taskId)
    if (!task) {
      return {
        ok: false,
        error: 'Task not found',
      }
    }

    const plugin = this.plugins.get(task.orchestratorType)
    if (!plugin) {
      return {
        ok: false,
        error: `Plugin '${task.orchestratorType}' not found`,
      }
    }

    try {
      const success = await plugin.cancelTask(taskId)

      if (success) {
        task.status = 'cancelled'
        task.updatedAt = Date.now()
        this.onChange?.(task)
      }

      return {
        ok: success,
        task,
        error: success ? undefined : 'Failed to cancel task',
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return {
        ok: false,
        error: `Cancel failed: ${message}`,
      }
    }
  }

  /**
   * List all tasks
   */
  async listTasks(
    filter?: Partial<{ orchestratorType: OrchestratorType; status: string; projectId: string }>
  ): Promise<OrchestratorTaskListResponse> {
    let tasks = Array.from(this.tasks.values())

    // Apply filters
    if (filter?.orchestratorType) {
      tasks = tasks.filter((t) => t.orchestratorType === filter.orchestratorType)
    }
    if (filter?.status) {
      tasks = tasks.filter((t) => t.status === filter.status)
    }
    if (filter?.projectId) {
      tasks = tasks.filter((t) => t.projectId === filter.projectId)
    }

    // Sort by creation time (newest first)
    tasks.sort((a, b) => b.createdAt - a.createdAt)

    return {
      ok: true,
      tasks,
    }
  }

  /**
   * Get task by ID (synchronous, from cache)
   */
  getTask(taskId: string): OrchestratorTask | undefined {
    return this.tasks.get(taskId)
  }

  // ==========================================================================
  // Workflow Resolution
  // ==========================================================================

  /**
   * Resolve workflow from request (template or custom)
   */
  private resolveWorkflow(request: OrchestratorTaskRequest): WorkflowDefinition | undefined {
    // Custom workflow takes precedence
    if (request.workflow) {
      return request.workflow
    }

    // Look up template
    if (request.workflowId) {
      const template = WORKFLOW_TEMPLATES[request.workflowId]
      if (template) {
        return this.expandWorkflowTemplate(request.workflowId, template, request.orchestratorType)
      }
    }

    return undefined
  }

  /**
   * Expand a workflow template into a full definition
   */
  private expandWorkflowTemplate(
    id: string,
    template: Partial<WorkflowDefinition>,
    orchestratorType: OrchestratorType
  ): WorkflowDefinition {
    const roles = template.roles || []

    // Create nodes from roles
    const nodes: WorkflowNode[] = roles.map((role) => ({
      id: `node_${role.id}`,
      type: 'agent' as const,
      roleId: role.id,
      description: role.description,
    }))

    // Add end node
    nodes.push({
      id: 'end',
      type: 'end' as const,
      description: 'Workflow complete',
    })

    // Create sequential edges
    const edges = nodes.slice(0, -1).map((node, index) => ({
      from: node.id,
      to: nodes[index + 1].id,
      condition: { type: 'always' as const },
    }))

    return {
      id,
      name: template.name || id,
      description: template.description || '',
      roles,
      nodes,
      edges,
      entryPoint: nodes[0]?.id || 'end',
      orchestratorType,
    }
  }

  // ==========================================================================
  // Workflow Templates
  // ==========================================================================

  /**
   * Get available workflow templates
   */
  getWorkflowTemplates(): { id: string; name: string; description: string }[] {
    return Object.entries(WORKFLOW_TEMPLATES).map(([id, template]) => ({
      id,
      name: template.name || id,
      description: template.description || '',
    }))
  }
}

// Singleton instance
export const orchestratorManager = new OrchestratorManager()
