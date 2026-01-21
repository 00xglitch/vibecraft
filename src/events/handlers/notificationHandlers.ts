/**
 * Zone Notification Event Handlers
 *
 * Shows floating notifications above zones when tools complete.
 * Uses ZoneNotifications system for tool-specific styling.
 * Also handles Claude Code notification events (permission prompts, etc).
 */

import { eventBus } from '../EventBus'
import {
  formatFileChange,
  formatCommandResult,
  formatSearchResult,
} from '../../scene/ZoneNotifications'
import { showToast, type ToastType } from '../../ui/Toast'
import type { PostToolUseEvent, NotificationEvent } from '../../../shared/types'
import { getStationForTool } from '../../../shared/types'

/**
 * Map notification types to toast styling
 */
function getNotificationStyle(notificationType: string): { type: ToastType; icon: string } {
  switch (notificationType) {
    case 'permission_prompt':
      return { type: 'warning', icon: '🔐' }
    case 'idle_prompt':
      return { type: 'info', icon: '💤' }
    case 'auth_success':
      return { type: 'success', icon: '✅' }
    case 'elicitation_dialog':
      return { type: 'info', icon: '💬' }
    default:
      return { type: 'info', icon: '🔔' }
  }
}

/**
 * Register notification-related event handlers
 */
export function registerNotificationHandlers(): void {
  // Tool completion notifications
  eventBus.on('post_tool_use', (event: PostToolUseEvent, ctx) => {
    // Skip ephemeral notifications during history replay - zones may not exist yet
    // and old notifications don't make sense (they're 3-second transient feedback)
    // Also need a linked session to show zone notifications
    if (!event.success || !ctx.scene || ctx.isHistory || !ctx.session) return

    const input = event.toolInput as Record<string, unknown>
    let notificationText: string | null = null

    switch (event.tool) {
      case 'Edit': {
        const filePath = input.file_path as string | undefined
        if (filePath) {
          const fileName = filePath.split('/').pop() || filePath
          const oldStr = input.old_string as string | undefined
          const newStr = input.new_string as string | undefined
          if (oldStr && newStr) {
            const oldLines = (oldStr.match(/\n/g) || []).length + 1
            const newLines = (newStr.match(/\n/g) || []).length + 1
            const added = Math.max(0, newLines - oldLines)
            const removed = Math.max(0, oldLines - newLines)
            notificationText = formatFileChange(fileName, { added, removed })
          } else {
            notificationText = fileName
          }
        }
        break
      }
      case 'Write': {
        const filePath = input.file_path as string | undefined
        if (filePath) {
          const fileName = filePath.split('/').pop() || filePath
          const content = input.content as string | undefined
          if (content) {
            const lines = (content.match(/\n/g) || []).length + 1
            notificationText = formatFileChange(fileName, { lines })
          } else {
            notificationText = fileName
          }
        }
        break
      }
      case 'Read': {
        const filePath = input.file_path as string | undefined
        if (filePath) {
          notificationText = filePath.split('/').pop() || filePath
        }
        break
      }
      case 'Bash': {
        const command = input.command as string | undefined
        if (command) {
          notificationText = formatCommandResult(command)
        }
        break
      }
      case 'Grep':
      case 'Glob': {
        const pattern = input.pattern as string | undefined
        if (pattern) {
          notificationText = formatSearchResult(pattern)
        }
        break
      }
      case 'WebFetch':
      case 'WebSearch': {
        const url = input.url as string | undefined
        const query = input.query as string | undefined
        if (url) {
          // Extract domain from URL
          try {
            const domain = new URL(url).hostname
            notificationText = domain
          } catch {
            notificationText = url.slice(0, 30)
          }
        } else if (query) {
          notificationText = formatSearchResult(query)
        }
        break
      }
      case 'Task': {
        const description = input.description as string | undefined
        if (description) {
          notificationText = description.slice(0, 25)
        }
        break
      }
      case 'TodoWrite': {
        const todos = input.todos as Array<{ content?: string }> | undefined
        if (todos && todos.length > 0) {
          notificationText = `${todos.length} items`
        }
        break
      }
    }

    // Show notification using zone notifications system
    if (notificationText) {
      ctx.scene.zoneNotifications.showForTool(event.sessionId, event.tool, notificationText)

      // Also update station panels with tool history
      const station = getStationForTool(event.tool)
      if (station !== 'center') {
        ctx.scene.stationPanels.addToolUse(event.sessionId, station, {
          text: notificationText,
          success: event.success,
        })
      }
    }
  })

  // Claude Code notification events (permission prompts, idle prompts, etc.)
  eventBus.on('notification', (event, ctx) => {
    // Skip during history replay
    if (ctx.isHistory) return

    const notifEvent = event as unknown as NotificationEvent
    const { message, notificationType } = notifEvent
    const style = getNotificationStyle(notificationType)

    // Show toast notification for global visibility
    showToast(message, {
      type: style.type,
      icon: style.icon,
      duration: 5000, // Longer duration for system notifications
    })

    // Also show zone notification if we have a linked session
    if (ctx.scene && ctx.session) {
      ctx.scene.zoneNotifications.show(ctx.session.id, {
        text: message.slice(0, 40),
        icon: style.icon,
        style: style.type === 'warning' ? 'warning' : style.type === 'error' ? 'error' : 'info',
        duration: 4,
      })
    }
  })
}
