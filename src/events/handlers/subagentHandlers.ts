/**
 * Subagent Event Handlers
 *
 * Handles spawning and removing subagent visualizations
 * when Task tools start and complete.
 *
 * Supports:
 * - Role-based subagent templates (researcher, coder, reviewer, etc.)
 * - Parent-child hierarchy for nested Task tools
 * - Depth tracking (max 5 levels)
 */

import { eventBus } from '../EventBus'
import { soundManager } from '../../audio'
import type { PreToolUseEvent, PostToolUseEvent } from '../../../shared/types'
import type { SubagentRole } from '../../entities/SubagentManager'

/**
 * Map subagent_type strings to SubagentRole
 * Handles common variations in Task tool input
 */
function parseSubagentRole(subagentType?: string): SubagentRole | undefined {
  if (!subagentType) return undefined

  const normalized = subagentType.toLowerCase()

  // Direct matches
  const roleMap: Record<string, SubagentRole> = {
    researcher: 'researcher',
    coder: 'coder',
    reviewer: 'reviewer',
    tester: 'tester',
    explorer: 'explorer',
    custom: 'custom',
    // Common variations
    explore: 'explorer',
    code: 'coder',
    review: 'reviewer',
    test: 'tester',
    research: 'researcher',
    'general-purpose': 'researcher',
    general: 'researcher',
    plan: 'researcher',
    planner: 'researcher',
    bash: 'coder',
  }

  // Check for exact or partial match
  if (roleMap[normalized]) {
    return roleMap[normalized]
  }

  // Check if any role name is contained in the input
  for (const [key, role] of Object.entries(roleMap)) {
    if (normalized.includes(key)) {
      return role
    }
  }

  return 'custom'
}

/**
 * Register subagent-related event handlers
 */
export function registerSubagentHandlers(): void {
  // Track active tool for hierarchy support (any tool, not just Task)
  eventBus.on('pre_tool_use', (event: PreToolUseEvent, ctx) => {
    if (!ctx.session) return

    // Set active tool use ID for hierarchy tracking
    // This allows nested Task tools to find their parent
    ctx.session.subagents.setActiveToolUse(event.toolUseId)

    if (event.tool !== 'Task') return

    // Extract role and description from Task tool input
    const input = event.toolInput as {
      description?: string
      subagent_type?: string
      prompt?: string
    }

    const description = input.description || input.prompt
    const role = parseSubagentRole(input.subagent_type)

    // Spawn subagent with hierarchy support
    // Parent is automatically determined from the active tool chain
    ctx.session.subagents.spawn(event.toolUseId, description, role)
    ctx.session.stats.activeSubagents = ctx.session.subagents.count

    // Play spawn sound
    if (ctx.soundEnabled) {
      soundManager.play('spawn')
    }
  })

  // Clear active tool and remove subagent when complete
  eventBus.on('post_tool_use', (event: PostToolUseEvent, ctx) => {
    if (!ctx.session) return

    // Check if this was the active tool
    if (ctx.session.subagents.getActiveToolUse() === event.toolUseId) {
      // Find parent to restore active context
      const subagent = ctx.session.subagents.get(event.toolUseId)
      ctx.session.subagents.setActiveToolUse(subagent?.parentToolUseId ?? null)
    }

    if (event.tool !== 'Task') return

    // Remove subagent and all its children
    ctx.session.subagents.remove(event.toolUseId, true)
    ctx.session.stats.activeSubagents = ctx.session.subagents.count

    // Play despawn sound
    if (ctx.soundEnabled) {
      soundManager.play('despawn')
    }
  })
}
