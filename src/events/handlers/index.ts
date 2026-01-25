/**
 * Event Handlers - Barrel Export
 *
 * Import and call registerAllHandlers() to set up EventBus handlers.
 */

import { registerSoundHandlers } from './soundHandlers'
import { registerNotificationHandlers } from './notificationHandlers'
import { registerCharacterHandlers } from './characterHandlers'
import { registerSubagentHandlers } from './subagentHandlers'
import { registerZoneHandlers } from './zoneHandlers'
import { registerFeedHandlers } from './feedHandlers'
import { registerAnimationHandlers } from './animationHandlers'
import { registerCommitHandlers } from './commitHandlers'
import { registerActivityHandlers } from './activityHandlers'
import { registerUserAvatarHandlers } from './userAvatarHandlers'

/**
 * Register all EventBus handlers
 * Call this once during app initialization
 */
export function registerAllHandlers(): void {
  registerSoundHandlers()
  registerNotificationHandlers()
  registerCharacterHandlers()
  registerSubagentHandlers()
  registerZoneHandlers()
  registerFeedHandlers()
  registerAnimationHandlers()
  registerCommitHandlers()
  registerActivityHandlers()
  registerUserAvatarHandlers()
}

// Re-export individual registrations for testing
export {
  registerSoundHandlers,
  registerNotificationHandlers,
  registerCharacterHandlers,
  registerSubagentHandlers,
  registerZoneHandlers,
  registerFeedHandlers,
  registerAnimationHandlers,
  registerCommitHandlers,
  registerActivityHandlers,
  registerUserAvatarHandlers,
}

// Re-export commit handler configuration for main.ts
export { configureCommitHandlers, setConfettiEnabled, updateConfetti } from './commitHandlers'

// Re-export activity handler configuration
export { configureActivityHandlers } from './activityHandlers'
