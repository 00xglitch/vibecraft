/**
 * Activity Handlers - Track zone activity metrics
 *
 * Tracks tool usage per session/zone for:
 * - Dynamic zone prominence
 * - Activity-based visual feedback
 * - Grid optimization decisions
 */

import { eventBus } from '../EventBus'
import { zoneActivitySystem } from '../../systems/ZoneActivitySystem'
import type { PreToolUseEvent } from '../../../shared/types'
import type { WorkshopScene } from '../../scene/WorkshopScene'

let sceneRef: WorkshopScene | null = null

/**
 * Configure activity handlers with scene reference
 * Must be called after scene is initialized
 */
export function configureActivityHandlers(scene: WorkshopScene): void {
  sceneRef = scene

  // Subscribe to activity updates and apply visual changes
  zoneActivitySystem.onActivity((sessionId, metrics) => {
    if (sceneRef) {
      sceneRef.updateZoneActivityLevel(sessionId, metrics.activityScore)
    }
  })
}

export function registerActivityHandlers(): void {
  // Track tool usage for activity scoring
  eventBus.on('pre_tool_use', (event: PreToolUseEvent, ctx) => {
    if (!ctx.session) return

    // Track this tool use
    zoneActivitySystem.trackToolUse(event.sessionId, event.tool)
  })
}
