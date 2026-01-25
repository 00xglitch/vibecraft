import { eventBus } from '../EventBus'
import * as THREE from 'three'
import type {
  UserPromptSubmitEvent,
  PostToolUseEvent,
  StopEvent,
  PreToolUseEvent,
} from '../../../shared/types'

/**
 * User Avatar Event Handlers
 *
 * React to events with avatar gestures:
 * - Point at zones when sending prompts with @mentions
 * - Celebrate on git commits
 * - Show concern on errors
 * - Return to observing on stop
 */
export function registerUserAvatarHandlers(): void {
  // User sends prompt → check for @mention and point at target zone
  eventBus.on('user_prompt_submit', (event: UserPromptSubmitEvent, ctx) => {
    if (!ctx.userAvatar || !ctx.scene) return

    // Check if prompt targets specific session (@SessionName)
    const match = event.prompt.match(/^@(\S+)/)
    if (match) {
      const targetName = match[1].toLowerCase()

      // Find zone by searching zones map for matching session
      for (const [sessionId, zone] of ctx.scene.zones.entries()) {
        // We need to look up the session name from somewhere
        // For now, skip this until we have managed sessions accessible
        // TODO: Add managed sessions to EventContext or find zone by session name
      }
    }
  })

  // Tool completes successfully → subtle approval nod
  eventBus.on('post_tool_use', (event: PostToolUseEvent, ctx) => {
    if (!ctx.userAvatar || !event.success) return

    // Very subtle - just update state
    // (breathing animation continues, no explicit gesture)
  })

  // Git commit detected → celebration
  eventBus.on('pre_tool_use', (event: PreToolUseEvent, ctx) => {
    if (!ctx.userAvatar) return

    const command = event.toolInput?.command
    if (event.tool === 'Bash' && typeof command === 'string' && command.includes('git commit')) {
      ctx.userAvatar.celebrate()
    }
  })

  // Error → concern gesture
  eventBus.on('post_tool_use', (event: PostToolUseEvent, ctx) => {
    if (!event.success && ctx.userAvatar) {
      ctx.userAvatar.concernShake()
    }
  })

  // Stop → return to observing
  eventBus.on('stop', (event: StopEvent, ctx) => {
    ctx.userAvatar?.setState('observing')
  })

  // New subagent spawned → beckon gesture
  eventBus.on('pre_tool_use', (event: PreToolUseEvent, ctx) => {
    if (!ctx.userAvatar) return

    if (event.tool === 'Task') {
      ctx.userAvatar.beckon()
    }
  })
}
