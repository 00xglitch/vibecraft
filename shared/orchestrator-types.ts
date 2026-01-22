/**
 * Orchestrator Types
 *
 * Defines types for multi-agent orchestration systems.
 * Supports LangGraph, CrewAI, AutoGen, and custom orchestrators.
 */

// ============================================================================
// Orchestrator Types
// ============================================================================

/** Supported orchestrator types */
export type OrchestratorType = 'langgraph' | 'crewai' | 'autogen' | 'custom'

/** Orchestrator task status */
export type OrchestratorTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

/** Agent role in an orchestrated task */
export interface AgentRole {
  /** Unique role identifier */
  id: string
  /** Display name */
  name: string
  /** Description of the role's responsibilities */
  description: string
  /** Tools available to this role */
  tools?: string[]
  /** System prompt for this agent */
  systemPrompt?: string
}

/** A step in the orchestration workflow */
export interface OrchestratorStep {
  /** Step identifier */
  id: string
  /** Agent role executing this step */
  roleId: string
  /** Step description */
  description: string
  /** Input from previous steps */
  input?: Record<string, unknown>
  /** Output from this step */
  output?: Record<string, unknown>
  /** Status of this step */
  status: OrchestratorTaskStatus
  /** Start timestamp */
  startedAt?: number
  /** End timestamp */
  completedAt?: number
  /** Error message if failed */
  error?: string
  /** Associated Vibecraft session ID */
  sessionId?: string
}

/** An orchestrated task */
export interface OrchestratorTask {
  /** Unique task ID */
  id: string
  /** Orchestrator type used */
  orchestratorType: OrchestratorType
  /** Task description */
  description: string
  /** Current status */
  status: OrchestratorTaskStatus
  /** Workflow steps */
  steps: OrchestratorStep[]
  /** Current step index */
  currentStep: number
  /** Creation timestamp */
  createdAt: number
  /** Last update timestamp */
  updatedAt: number
  /** Completion timestamp */
  completedAt?: number
  /** Final result */
  result?: unknown
  /** Error message if failed */
  error?: string
  /** Associated project ID */
  projectId?: string
  /** Metadata */
  metadata?: Record<string, unknown>
}

// ============================================================================
// Workflow Definition
// ============================================================================

/** Edge condition for workflow transitions */
export interface WorkflowCondition {
  /** Type of condition */
  type: 'always' | 'if' | 'switch'
  /** Condition expression (for 'if' type) */
  expression?: string
  /** Switch cases (for 'switch' type) */
  cases?: Record<string, string>
  /** Default target (for 'switch' type) */
  default?: string
}

/** Edge in the workflow graph */
export interface WorkflowEdge {
  /** Source node ID */
  from: string
  /** Target node ID */
  to: string
  /** Condition for this edge */
  condition?: WorkflowCondition
}

/** Node in the workflow graph */
export interface WorkflowNode {
  /** Node identifier */
  id: string
  /** Node type */
  type: 'agent' | 'tool' | 'router' | 'end'
  /** Agent role ID (for agent nodes) */
  roleId?: string
  /** Tool name (for tool nodes) */
  toolName?: string
  /** Router function name (for router nodes) */
  routerFn?: string
  /** Node description */
  description?: string
}

/** Workflow definition for orchestration */
export interface WorkflowDefinition {
  /** Workflow identifier */
  id: string
  /** Workflow name */
  name: string
  /** Description */
  description: string
  /** Agent roles in this workflow */
  roles: AgentRole[]
  /** Graph nodes */
  nodes: WorkflowNode[]
  /** Graph edges */
  edges: WorkflowEdge[]
  /** Entry node ID */
  entryPoint: string
  /** Orchestrator type this workflow is for */
  orchestratorType: OrchestratorType
}

// ============================================================================
// Plugin Interface
// ============================================================================

/** Configuration for orchestrator plugins */
export interface OrchestratorConfig {
  /** Plugin-specific configuration */
  [key: string]: unknown
}

/** Orchestrator plugin interface */
export interface IOrchestratorPlugin {
  /** Plugin identifier */
  readonly id: string
  /** Orchestrator type */
  readonly type: OrchestratorType
  /** Plugin display name */
  readonly name: string
  /** Whether the plugin is ready */
  readonly ready: boolean

  /**
   * Initialize the plugin
   */
  initialize(config?: OrchestratorConfig): Promise<void>

  /**
   * Submit a task to the orchestrator
   */
  submitTask(task: OrchestratorTaskRequest): Promise<string>

  /**
   * Get task status
   */
  getTaskStatus(taskId: string): Promise<OrchestratorTask | null>

  /**
   * Cancel a running task
   */
  cancelTask(taskId: string): Promise<boolean>

  /**
   * List all tasks
   */
  listTasks(): Promise<OrchestratorTask[]>

  /**
   * Clean up resources
   */
  dispose(): Promise<void>
}

// ============================================================================
// API Types
// ============================================================================

/** Request to create an orchestrated task */
export interface OrchestratorTaskRequest {
  /** Orchestrator type to use */
  orchestratorType: OrchestratorType
  /** Task description */
  description: string
  /** Workflow to use (optional, uses default if not specified) */
  workflowId?: string
  /** Custom workflow definition (overrides workflowId) */
  workflow?: WorkflowDefinition
  /** Initial input */
  input?: Record<string, unknown>
  /** Project ID to associate with */
  projectId?: string
  /** Additional metadata */
  metadata?: Record<string, unknown>
}

/** Response from task operations */
export interface OrchestratorTaskResponse {
  ok: boolean
  task?: OrchestratorTask
  taskId?: string
  error?: string
}

/** Response from listing tasks */
export interface OrchestratorTaskListResponse {
  ok: boolean
  tasks: OrchestratorTask[]
}

// ============================================================================
// Predefined Workflows
// ============================================================================

/** Predefined workflow templates */
export const WORKFLOW_TEMPLATES: Record<string, Partial<WorkflowDefinition>> = {
  'research-implement': {
    name: 'Research & Implement',
    description: 'Research a topic, then implement the solution',
    roles: [
      {
        id: 'researcher',
        name: 'Researcher',
        description: 'Researches the codebase and gathers information',
        tools: ['Read', 'Grep', 'Glob', 'WebSearch'],
      },
      {
        id: 'implementer',
        name: 'Implementer',
        description: 'Implements the solution based on research',
        tools: ['Read', 'Edit', 'Write', 'Bash'],
      },
    ],
  },
  'code-review': {
    name: 'Code Review',
    description: 'Review code changes with multiple perspectives',
    roles: [
      {
        id: 'security-reviewer',
        name: 'Security Reviewer',
        description: 'Reviews code for security vulnerabilities',
        tools: ['Read', 'Grep'],
      },
      {
        id: 'quality-reviewer',
        name: 'Quality Reviewer',
        description: 'Reviews code quality and best practices',
        tools: ['Read', 'Grep'],
      },
      {
        id: 'summarizer',
        name: 'Summarizer',
        description: 'Summarizes review findings',
        tools: ['Read'],
      },
    ],
  },
  'test-driven': {
    name: 'Test-Driven Development',
    description: 'Write tests first, then implement',
    roles: [
      {
        id: 'test-writer',
        name: 'Test Writer',
        description: 'Writes tests based on requirements',
        tools: ['Read', 'Write', 'Bash'],
      },
      {
        id: 'implementer',
        name: 'Implementer',
        description: 'Implements code to pass tests',
        tools: ['Read', 'Edit', 'Write', 'Bash'],
      },
      {
        id: 'refactorer',
        name: 'Refactorer',
        description: 'Refactors implementation while keeping tests green',
        tools: ['Read', 'Edit', 'Bash'],
      },
    ],
  },
}
