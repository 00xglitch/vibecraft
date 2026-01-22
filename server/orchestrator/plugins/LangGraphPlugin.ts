/**
 * LangGraph Orchestrator Plugin
 *
 * Implements multi-agent orchestration using LangGraph-style graph workflows.
 * Each node in the graph can spawn a Vibecraft session with specific tools/roles.
 *
 * Note: This is a native TypeScript implementation that follows LangGraph patterns
 * without requiring the @langchain/langgraph package. For full LangGraph integration,
 * the graph execution logic can be replaced with actual LangGraph calls.
 */

import { randomUUID } from 'crypto'
import {
  type OrchestratorType,
  type OrchestratorTask,
  type OrchestratorTaskRequest,
  type OrchestratorTaskStatus,
  type OrchestratorStep,
  type IOrchestratorPlugin,
  type OrchestratorConfig,
  type WorkflowDefinition,
  type WorkflowNode,
  type WorkflowEdge,
  type AgentRole,
} from '../../../shared/orchestrator-types.js'

// ============================================================================
// Types
// ============================================================================

interface LangGraphConfig extends OrchestratorConfig {
  /** Maximum concurrent agent sessions */
  maxConcurrent?: number
  /** Timeout per step in milliseconds */
  stepTimeout?: number
  /** Whether to auto-cleanup sessions after completion */
  autoCleanup?: boolean
}

interface GraphState {
  /** Current node being executed */
  currentNode: string
  /** Accumulated data from all steps */
  data: Record<string, unknown>
  /** History of visited nodes */
  history: string[]
  /** Error state if any */
  error?: string
}

// ============================================================================
// LangGraph Plugin Class
// ============================================================================

export class LangGraphPlugin implements IOrchestratorPlugin {
  readonly id = 'langgraph-native'
  readonly type: OrchestratorType = 'langgraph'
  readonly name = 'LangGraph (Native)'

  private _ready = false
  private config: LangGraphConfig = {}
  private tasks: Map<string, OrchestratorTask> = new Map()
  private graphStates: Map<string, GraphState> = new Map()
  private stepCallbacks: Map<string, (result: unknown) => void> = new Map()

  get ready(): boolean {
    return this._ready
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  async initialize(config?: OrchestratorConfig): Promise<void> {
    this.config = {
      maxConcurrent: 3,
      stepTimeout: 300000, // 5 minutes
      autoCleanup: true,
      ...config,
    }

    this._ready = true
    console.log('[LangGraphPlugin] Initialized with config:', this.config)
  }

  async dispose(): Promise<void> {
    // Cancel all running tasks
    for (const taskId of this.tasks.keys()) {
      await this.cancelTask(taskId)
    }

    this.tasks.clear()
    this.graphStates.clear()
    this.stepCallbacks.clear()
    this._ready = false

    console.log('[LangGraphPlugin] Disposed')
  }

  // ==========================================================================
  // Task Management
  // ==========================================================================

  async submitTask(request: OrchestratorTaskRequest): Promise<string> {
    const taskId = randomUUID()
    const workflow = request.workflow

    if (!workflow) {
      throw new Error('Workflow definition required for LangGraph tasks')
    }

    // Validate workflow
    this.validateWorkflow(workflow)

    // Create task record
    const task: OrchestratorTask = {
      id: taskId,
      orchestratorType: 'langgraph',
      description: request.description,
      status: 'pending',
      steps: this.createStepsFromWorkflow(workflow),
      currentStep: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      projectId: request.projectId,
      metadata: {
        ...request.metadata,
        workflowId: workflow.id,
        workflowName: workflow.name,
      },
    }

    // Initialize graph state
    const graphState: GraphState = {
      currentNode: workflow.entryPoint,
      data: request.input || {},
      history: [],
    }

    this.tasks.set(taskId, task)
    this.graphStates.set(taskId, graphState)

    // Start execution asynchronously
    this.executeGraph(taskId, workflow).catch((error) => {
      console.error(`[LangGraphPlugin] Task ${taskId} failed:`, error)
      this.failTask(taskId, error.message)
    })

    return taskId
  }

  async getTaskStatus(taskId: string): Promise<OrchestratorTask | null> {
    return this.tasks.get(taskId) || null
  }

  async cancelTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId)
    if (!task) return false

    if (task.status === 'running' || task.status === 'pending') {
      task.status = 'cancelled'
      task.updatedAt = Date.now()

      // Cancel any pending step callbacks
      const callback = this.stepCallbacks.get(taskId)
      if (callback) {
        callback({ cancelled: true })
        this.stepCallbacks.delete(taskId)
      }

      return true
    }

    return false
  }

  async listTasks(): Promise<OrchestratorTask[]> {
    return Array.from(this.tasks.values())
  }

  // ==========================================================================
  // Graph Execution
  // ==========================================================================

  /**
   * Execute the workflow graph
   */
  private async executeGraph(taskId: string, workflow: WorkflowDefinition): Promise<void> {
    const task = this.tasks.get(taskId)!
    const state = this.graphStates.get(taskId)!

    task.status = 'running'
    task.updatedAt = Date.now()

    const nodeMap = new Map(workflow.nodes.map((n) => [n.id, n]))
    const roleMap = new Map(workflow.roles.map((r) => [r.id, r]))

    while (true) {
      // Check for cancellation (re-fetch task status as it may have been modified)
      const currentTask = this.tasks.get(taskId)
      if (!currentTask || currentTask.status === 'cancelled') {
        break
      }

      const currentNode = nodeMap.get(state.currentNode)
      if (!currentNode) {
        this.failTask(taskId, `Node '${state.currentNode}' not found`)
        break
      }

      // Record in history
      state.history.push(state.currentNode)

      // Handle end node
      if (currentNode.type === 'end') {
        task.status = 'completed'
        task.completedAt = Date.now()
        task.updatedAt = Date.now()
        task.result = state.data
        break
      }

      // Find step for this node
      const stepIndex = task.steps.findIndex((s) => s.id === currentNode.id)
      if (stepIndex >= 0) {
        task.currentStep = stepIndex
      }

      // Execute node
      try {
        const result = await this.executeNode(taskId, currentNode, roleMap, state)

        // Update step
        if (stepIndex >= 0) {
          task.steps[stepIndex].status = 'completed'
          task.steps[stepIndex].completedAt = Date.now()
          task.steps[stepIndex].output = result as Record<string, unknown>
        }

        // Merge result into state
        if (result && typeof result === 'object') {
          state.data = { ...state.data, ...result }
        }

        // Find next node
        const nextNodeId = this.findNextNode(currentNode.id, workflow.edges, state)
        if (!nextNodeId) {
          this.failTask(taskId, `No outgoing edge from node '${currentNode.id}'`)
          break
        }

        state.currentNode = nextNodeId
        task.updatedAt = Date.now()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'

        if (stepIndex >= 0) {
          task.steps[stepIndex].status = 'failed'
          task.steps[stepIndex].error = message
          task.steps[stepIndex].completedAt = Date.now()
        }

        this.failTask(taskId, message)
        break
      }
    }
  }

  /**
   * Execute a single node
   */
  private async executeNode(
    taskId: string,
    node: WorkflowNode,
    roleMap: Map<string, AgentRole>,
    state: GraphState
  ): Promise<unknown> {
    const task = this.tasks.get(taskId)!
    const stepIndex = task.steps.findIndex((s) => s.id === node.id)

    if (stepIndex >= 0) {
      task.steps[stepIndex].status = 'running'
      task.steps[stepIndex].startedAt = Date.now()
    }

    switch (node.type) {
      case 'agent': {
        const role = node.roleId ? roleMap.get(node.roleId) : undefined
        return this.executeAgentNode(taskId, node, role, state)
      }

      case 'tool': {
        return this.executeToolNode(node, state)
      }

      case 'router': {
        return this.executeRouterNode(node, state)
      }

      default:
        throw new Error(`Unknown node type: ${node.type}`)
    }
  }

  /**
   * Execute an agent node (spawn a session)
   */
  private async executeAgentNode(
    taskId: string,
    node: WorkflowNode,
    role: AgentRole | undefined,
    state: GraphState
  ): Promise<unknown> {
    // In a full implementation, this would:
    // 1. Spawn a new Claude session via SessionManager
    // 2. Send the agent's task with role-specific system prompt
    // 3. Wait for completion and capture output

    // For now, simulate the agent execution
    console.log(`[LangGraphPlugin] Executing agent node: ${node.id}`, {
      role: role?.name,
      tools: role?.tools,
      input: state.data,
    })

    // Placeholder: In production, replace with actual session orchestration
    return new Promise((resolve) => {
      // Store callback for external completion signal
      this.stepCallbacks.set(taskId, resolve)

      // Simulate async completion (remove in production)
      setTimeout(
        () => {
          if (this.stepCallbacks.has(taskId)) {
            this.stepCallbacks.delete(taskId)
            resolve({
              agentId: node.id,
              roleId: role?.id,
              completedAt: Date.now(),
              // In production: actual agent output
              output: `Simulated output from ${role?.name || node.id}`,
            })
          }
        },
        1000 + Math.random() * 2000
      )
    })
  }

  /**
   * Execute a tool node directly
   */
  private async executeToolNode(node: WorkflowNode, state: GraphState): Promise<unknown> {
    console.log(`[LangGraphPlugin] Executing tool node: ${node.id}`, {
      tool: node.toolName,
      input: state.data,
    })

    // Placeholder for direct tool execution
    return {
      toolName: node.toolName,
      executedAt: Date.now(),
    }
  }

  /**
   * Execute a router node (conditional branching)
   */
  private async executeRouterNode(node: WorkflowNode, state: GraphState): Promise<unknown> {
    console.log(`[LangGraphPlugin] Executing router node: ${node.id}`, {
      router: node.routerFn,
      data: state.data,
    })

    // Router nodes don't produce output, they just determine next edge
    return { routed: true }
  }

  /**
   * Find the next node based on edges and conditions
   */
  private findNextNode(
    currentNodeId: string,
    edges: WorkflowEdge[],
    state: GraphState
  ): string | null {
    const outgoingEdges = edges.filter((e) => e.from === currentNodeId)

    if (outgoingEdges.length === 0) {
      return null
    }

    // Find first matching edge
    for (const edge of outgoingEdges) {
      if (!edge.condition || edge.condition.type === 'always') {
        return edge.to
      }

      if (edge.condition.type === 'if' && edge.condition.expression) {
        // Simple expression evaluation (in production, use a proper evaluator)
        try {
          const result = this.evaluateCondition(edge.condition.expression, state.data)
          if (result) {
            return edge.to
          }
        } catch {
          // Condition failed, try next edge
        }
      }

      if (edge.condition.type === 'switch' && edge.condition.cases) {
        // Find matching case
        const switchValue = String(state.data['_switch'] || '')
        if (edge.condition.cases[switchValue]) {
          return edge.condition.cases[switchValue]
        }
        if (edge.condition.default) {
          return edge.condition.default
        }
      }
    }

    // No condition matched, return first edge as fallback
    return outgoingEdges[0].to
  }

  /**
   * Simple condition evaluator
   */
  private evaluateCondition(expression: string, data: Record<string, unknown>): boolean {
    // Very basic evaluation - in production use a proper expression parser
    // Supports: "field == value", "field != value", "field"

    const eqMatch = expression.match(/^(\w+)\s*==\s*['"]?(.+?)['"]?$/)
    if (eqMatch) {
      return data[eqMatch[1]] === eqMatch[2]
    }

    const neqMatch = expression.match(/^(\w+)\s*!=\s*['"]?(.+?)['"]?$/)
    if (neqMatch) {
      return data[neqMatch[1]] !== neqMatch[2]
    }

    // Truthy check
    return Boolean(data[expression])
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Validate workflow definition
   */
  private validateWorkflow(workflow: WorkflowDefinition): void {
    if (!workflow.entryPoint) {
      throw new Error('Workflow must have an entryPoint')
    }

    if (!workflow.nodes || workflow.nodes.length === 0) {
      throw new Error('Workflow must have at least one node')
    }

    const nodeIds = new Set(workflow.nodes.map((n) => n.id))

    if (!nodeIds.has(workflow.entryPoint)) {
      throw new Error(`Entry point '${workflow.entryPoint}' not found in nodes`)
    }

    // Validate edges reference valid nodes
    for (const edge of workflow.edges || []) {
      if (!nodeIds.has(edge.from)) {
        throw new Error(`Edge references unknown source node '${edge.from}'`)
      }
      if (!nodeIds.has(edge.to)) {
        throw new Error(`Edge references unknown target node '${edge.to}'`)
      }
    }

    // Validate agent nodes have valid roles
    const roleIds = new Set(workflow.roles?.map((r) => r.id) || [])
    for (const node of workflow.nodes) {
      if (node.type === 'agent' && node.roleId && !roleIds.has(node.roleId)) {
        throw new Error(`Agent node '${node.id}' references unknown role '${node.roleId}'`)
      }
    }
  }

  /**
   * Create steps from workflow nodes
   */
  private createStepsFromWorkflow(workflow: WorkflowDefinition): OrchestratorStep[] {
    return workflow.nodes
      .filter((node) => node.type !== 'end')
      .map((node) => ({
        id: node.id,
        roleId: node.roleId || '',
        description: node.description || `Execute ${node.type} node`,
        status: 'pending' as OrchestratorTaskStatus,
      }))
  }

  /**
   * Mark task as failed
   */
  private failTask(taskId: string, error: string): void {
    const task = this.tasks.get(taskId)
    if (task) {
      task.status = 'failed'
      task.error = error
      task.updatedAt = Date.now()

      const state = this.graphStates.get(taskId)
      if (state) {
        state.error = error
      }
    }
  }

  // ==========================================================================
  // External Integration Points
  // ==========================================================================

  /**
   * Signal that an agent step has completed (called by session manager)
   */
  signalStepComplete(taskId: string, result: unknown): void {
    const callback = this.stepCallbacks.get(taskId)
    if (callback) {
      this.stepCallbacks.delete(taskId)
      callback(result)
    }
  }

  /**
   * Get current graph state for a task
   */
  getGraphState(taskId: string): GraphState | undefined {
    return this.graphStates.get(taskId)
  }
}

// Export singleton instance
export const langGraphPlugin = new LangGraphPlugin()
