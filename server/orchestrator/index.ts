/**
 * Orchestrator Module
 *
 * Exports orchestrator manager and plugins for multi-agent coordination.
 */

export { orchestratorManager, OrchestratorManager } from './OrchestratorManager.js'
export { langGraphPlugin, LangGraphPlugin } from './plugins/LangGraphPlugin.js'
export { crewAIPlugin, CrewAIPlugin } from './plugins/CrewAIPlugin.js'
export { autoGenPlugin, AutoGenPlugin } from './plugins/AutoGenPlugin.js'

// Re-export types for convenience
export type {
  OrchestratorType,
  OrchestratorTask,
  OrchestratorTaskRequest,
  OrchestratorTaskResponse,
  OrchestratorTaskListResponse,
  IOrchestratorPlugin,
  OrchestratorConfig,
  WorkflowDefinition,
  WorkflowNode,
  WorkflowEdge,
  AgentRole,
  OrchestratorStep,
} from '../../shared/orchestrator-types.js'
