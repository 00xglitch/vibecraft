import type {
  ClaudeEvent,
  OpenCodeEvent,
  PreToolUseEvent,
  PostToolUseEvent,
  StopEvent,
  NotificationEvent,
} from '../../shared/types.js'
import {
  mapOpenCodeToolToVibecraft,
  getStationForOpenCodeTool,
} from '../../shared/types.js'

export class OpenCodeEventAdapter {
  static adaptEvent(opencodeEvent: OpenCodeEvent, sessionId: string, cwd: string): ClaudeEvent | null {
    const timestamp = Date.now()

    switch (opencodeEvent.type) {
      case 'message.part.updated':
        return this.handleMessagePartUpdated(opencodeEvent, timestamp, sessionId, cwd)

      case 'message.updated':
        return this.handleMessageUpdated(opencodeEvent, timestamp, sessionId, cwd)

      case 'session.status':
        return null // Skip status updates

      case 'session.updated':
        return null // Skip session update events

      case 'session.diff':
        return this.handleSessionDiff(opencodeEvent, timestamp, sessionId, cwd)

      case 'session.error':
        return this.handleSessionError(opencodeEvent, timestamp, sessionId, cwd)

      case 'session.idle':
        return this.handleSessionIdle(opencodeEvent, timestamp, sessionId, cwd)

      case 'permission.asked':
        return this.handlePermissionAsked(opencodeEvent, timestamp, sessionId, cwd)

      case 'server.connected':
      case 'server.heartbeat':
      case 'session.created':
      case 'file.watcher.updated':
        return null

      default:
        console.warn(`[OpenCodeEventAdapter] Unknown event type: ${opencodeEvent.type}`)
        return null
    }
  }

  private static handleMessageUpdated(
    event: OpenCodeEvent,
    timestamp: number,
    sessionId: string,
    cwd: string
  ): ClaudeEvent | null {
    const message = event.properties?.message
    if (!message) return null

    const content = message.content
    if (!content) return null

    const parts = content.parts
    if (!parts || !Array.isArray(parts)) return null

    for (const part of parts) {
      if (part.type === 'tool') {
        return this.handleToolEvent(part, timestamp, sessionId, cwd)
      }
    }

    // Text response
    const text = content.text || parts.map((p: any) => p.text || '').join('')
    if (text) {
      return {
        id: this.generateId(),
        timestamp,
        type: 'stop',
        sessionId,
        cwd,
        stopHookActive: false,
        response: text,
      }
    }

    return null
  }

  private static handleSessionDiff(
    event: OpenCodeEvent,
    timestamp: number,
    sessionId: string,
    cwd: string
  ): ClaudeEvent | null {
    const diff = event.properties?.diff
    if (!diff) return null

    return {
      id: this.generateId(),
      timestamp,
      type: 'user_prompt_submit',
      sessionId,
      cwd,
      prompt: diff.summary || 'OpenCode diff',
    }
  }

  private static handleMessagePartUpdated(
    event: OpenCodeEvent,
    timestamp: number,
    sessionId: string,
    cwd: string
  ): ClaudeEvent | null {
    const part = event.properties?.part
    if (!part) return null

    switch (part.type) {
      case 'tool':
        return this.handleToolEvent(part, timestamp, sessionId, cwd)

      case 'reasoning':
        return {
          id: this.generateId(),
          timestamp,
          type: 'user_prompt_submit',
          sessionId,
          cwd,
          prompt: part.text || 'Reasoning',
        }

      case 'step-start':
        return {
          id: this.generateId(),
          timestamp,
          type: 'user_prompt_submit',
          sessionId,
          cwd,
          prompt: part.text || 'OpenCode step started',
        }

      case 'step-finish':
      case 'text':
        if (part.state?.status === 'completed' || part.time?.end) {
          return {
            id: this.generateId(),
            timestamp,
            type: 'stop',
            sessionId,
            cwd,
            stopHookActive: false,
            response: part.text || 'OpenCode step completed',
          }
        }
        return null

      default:
        return null
    }
  }

  private static handleToolEvent(
    part: Record<string, unknown>,
    timestamp: number,
    sessionId: string,
    cwd: string
  ): ClaudeEvent | null {
    const tool = part.tool as string | undefined
    const state = part.state as Record<string, unknown> | undefined

    if (!tool) return null

    const vibecraftTool = mapOpenCodeToolToVibecraft(tool)
    const toolInput = state?.input as Record<string, unknown> ?? {}
    const toolUseId = (part.id as string) ?? this.generateId()

    if (state?.status === 'started') {
      return {
        id: this.generateId(),
        timestamp,
        type: 'pre_tool_use',
        sessionId,
        cwd,
        tool: vibecraftTool,
        toolInput,
        toolUseId,
      } as PreToolUseEvent
    }

    if (state?.status === 'completed' || state?.status === 'failed') {
      return {
        id: this.generateId(),
        timestamp,
        type: 'post_tool_use',
        sessionId,
        cwd,
        tool: vibecraftTool,
        toolInput,
        toolResponse: (state.output as Record<string, unknown>) ?? {},
        toolUseId,
        success: state.status !== 'failed',
      } as PostToolUseEvent
    }

    return null
  }

  private static handleSessionError(
    event: OpenCodeEvent,
    timestamp: number,
    sessionId: string,
    cwd: string
  ): NotificationEvent {
    const error = event.properties?.error
    return {
      id: this.generateId(),
      timestamp,
      type: 'notification',
      sessionId,
      cwd,
      message: error?.message || 'OpenCode session error',
      notificationType: 'error',
    }
  }

  private static handleSessionIdle(
    event: OpenCodeEvent,
    timestamp: number,
    sessionId: string,
    cwd: string
  ): StopEvent {
    return {
      id: this.generateId(),
      timestamp,
      type: 'stop',
      sessionId,
      cwd,
      stopHookActive: false,
      response: 'Session completed',
    }
  }

  private static handlePermissionAsked(
    event: OpenCodeEvent,
    timestamp: number,
    sessionId: string,
    cwd: string
  ): NotificationEvent {
    const permission = event.properties?.permission
    return {
      id: this.generateId(),
      timestamp,
      type: 'notification',
      sessionId,
      cwd,
      message: `Permission required: ${permission?.permission} (${permission?.patterns?.join(', ')})`,
      notificationType: 'permission_prompt',
    }
  }

  static getStationForOpenCodeTool(tool: string): string {
    return getStationForOpenCodeTool(tool)
  }

  private static generateId(): string {
    return `opencode-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
  }
}
