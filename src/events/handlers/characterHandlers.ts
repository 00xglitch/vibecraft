/**
 * Character Movement Event Handlers
 *
 * Handles Claude character movement in response to tool use events.
 * Moves character to appropriate stations and sets context labels.
 */

import { eventBus } from '../EventBus'
import { soundManager } from '../../audio'
import { getToolContext } from '../../utils/ToolUtils'
import { getStationForTool, type StationType } from '../../../shared/types'
import { mcpRegistry } from '../../mcp'
import type {
  PreToolUseEvent,
  PostToolUseEvent,
  StopEvent,
  UserPromptSubmitEvent,
} from '../../../shared/types'

/**
 * Get station for a tool, using MCP Registry for MCP tools
 * Returns the station type AND MCP info if applicable
 */
function getStationForToolWithMCP(toolName: string): {
  station: StationType
  isMCP: boolean
  mcpServer?: string
  mcpCategory?: string
} {
  // Check if this is an MCP tool
  if (mcpRegistry.isMCPTool(toolName)) {
    // Register the tool (updates usage stats)
    const toolInfo = mcpRegistry.registerTool(toolName)
    // Get the station from MCP registry
    const station = mcpRegistry.getStationForMCPTool(toolName)
    return {
      station,
      isMCP: true,
      mcpServer: toolInfo?.server,
      mcpCategory: toolInfo?.category,
    }
  }
  // Fall back to standard tool mapping
  return {
    station: getStationForTool(toolName),
    isMCP: false,
  }
}

/**
 * Register character movement event handlers
 */
export function registerCharacterHandlers(): void {
  // Move character to station when tool starts
  eventBus.on('pre_tool_use', (event: PreToolUseEvent, ctx) => {
    if (!ctx.session) return

    const { station, isMCP, mcpServer, mcpCategory } = getStationForToolWithMCP(event.tool)

    // Handle MCP tools - create dynamic station if needed
    if (isMCP && mcpServer && mcpCategory && ctx.scene) {
      // Create or get the MCP station for this server
      const mcpStation = ctx.scene.addMCPStation(
        event.sessionId,
        mcpServer,
        mcpCategory as import('../../mcp').MCPToolCategory
      )

      if (mcpStation) {
        // Move character to MCP station
        ctx.session.claude.moveToPosition(mcpStation.position, station)
        if (ctx.soundEnabled) {
          soundManager.play('walking')
        }

        // Set context text above MCP station
        const context = getToolContext(event.tool, event.toolInput)
        if (context) {
          // MCP stations handle their own labels, but we can add context sprite
          // For now, just pulse the station to highlight activity
        }
        return
      }
    }

    // Move character to regular station (skip 'center' - those are unmapped MCP tools)
    if (station !== 'center') {
      const zoneStation = ctx.session.zone.stations.get(station)
      if (zoneStation) {
        ctx.session.claude.moveToPosition(zoneStation.position, station)
        // Play walking sound
        if (ctx.soundEnabled) {
          soundManager.play('walking')
        }
      }
    }

    // Set context text above station
    if (ctx.scene && station !== 'center') {
      const context = getToolContext(event.tool, event.toolInput)
      if (context) {
        ctx.scene.setStationContext(station, context, event.sessionId)
      }

      // Pulse station ring to highlight activity
      ctx.scene.pulseStation(event.sessionId, station)
    }
  })

  // Set idle state when tool completes (if not walking)
  // Also update mood based on tool success/failure
  eventBus.on('post_tool_use', (event: PostToolUseEvent, ctx) => {
    if (!ctx.session) return

    // Record tool result for mood tracking
    // Use the success field to update the character's mood
    ctx.session.claude.recordToolResult(event.success !== false)

    // Only set idle if character isn't walking
    if (ctx.session.claude.state !== 'walking') {
      ctx.session.claude.setState('idle')
    }
  })

  // Move character back to center when stopped
  eventBus.on('stop', (event: StopEvent, ctx) => {
    if (!ctx.session || !ctx.scene) return

    // Move to zone center
    const centerStation = ctx.session.zone.stations.get('center')
    if (centerStation) {
      ctx.session.claude.moveToPosition(centerStation.position, 'center')
    }

    // Clear station context labels
    ctx.scene.clearAllContexts(event.sessionId)
  })

  // Set thinking state when user submits prompt
  eventBus.on('user_prompt_submit', (_event: UserPromptSubmitEvent, ctx) => {
    if (!ctx.session) return
    ctx.session.claude.setState('thinking')
  })
}
