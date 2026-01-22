/**
 * Zone Level of Detail (LOD) System
 *
 * Manages visual detail levels for zones based on camera distance and focus state.
 * Reduces memory and GPU load for distant/inactive zones.
 */

import * as THREE from 'three'

export type LODLevel = 'high' | 'medium' | 'low'

export interface LODConfig {
  /** Distance thresholds for LOD transitions */
  highDistance: number // 0 to this = HIGH
  mediumDistance: number // highDistance to this = MEDIUM, beyond = LOW

  /** What to show at each level */
  levels: {
    high: LODFeatures
    medium: LODFeatures
    low: LODFeatures
  }
}

export interface LODFeatures {
  /** Show detailed station meshes */
  stationsVisible: boolean
  /** Show station details (props on desks, books on shelves) */
  stationDetails: boolean
  /** Animate character */
  characterAnimated: boolean
  /** Show particles */
  particlesEnabled: boolean
  /** Show labels */
  labelsVisible: boolean
  /** Show git status */
  gitLabelVisible: boolean
  /** Enable shadows for this zone */
  shadowsEnabled: boolean
}

/** Default LOD configuration */
export const DEFAULT_LOD_CONFIG: LODConfig = {
  highDistance: 25, // Focused zone and immediate neighbors
  mediumDistance: 60, // Visible but not focused
  levels: {
    high: {
      stationsVisible: true,
      stationDetails: true,
      characterAnimated: true,
      particlesEnabled: true,
      labelsVisible: true,
      gitLabelVisible: true,
      shadowsEnabled: true,
    },
    medium: {
      stationsVisible: true,
      stationDetails: false, // Hide small props
      characterAnimated: false, // Static character pose
      particlesEnabled: false,
      labelsVisible: true,
      gitLabelVisible: false,
      shadowsEnabled: false,
    },
    low: {
      stationsVisible: false, // Hide stations entirely
      stationDetails: false,
      characterAnimated: false,
      particlesEnabled: false,
      labelsVisible: true, // Keep label for identification
      gitLabelVisible: false,
      shadowsEnabled: false,
    },
  },
}

export interface ZoneLODState {
  zoneId: string
  currentLevel: LODLevel
  distance: number
  isFocused: boolean
  lastUpdate: number
}

/**
 * Manages LOD state for all zones
 */
export class ZoneLODManager {
  private config: LODConfig
  private states: Map<string, ZoneLODState> = new Map()
  private focusedZoneId: string | null = null

  /** Callbacks for LOD changes */
  private onLODChange: Array<(zoneId: string, level: LODLevel, features: LODFeatures) => void> = []

  constructor(config: LODConfig = DEFAULT_LOD_CONFIG) {
    this.config = config
  }

  /**
   * Register a zone for LOD management
   */
  registerZone(zoneId: string): void {
    this.states.set(zoneId, {
      zoneId,
      currentLevel: 'high', // Start at high until first update
      distance: 0,
      isFocused: false,
      lastUpdate: 0,
    })
  }

  /**
   * Unregister a zone
   */
  unregisterZone(zoneId: string): void {
    this.states.delete(zoneId)
  }

  /**
   * Set the focused zone (always gets HIGH LOD)
   */
  setFocusedZone(zoneId: string | null): void {
    this.focusedZoneId = zoneId

    // Update focused state for all zones
    for (const state of Array.from(this.states.values())) {
      state.isFocused = state.zoneId === zoneId
    }
  }

  /**
   * Calculate LOD level based on distance
   */
  private calculateLevel(distance: number, isFocused: boolean): LODLevel {
    // Focused zone always gets HIGH
    if (isFocused) return 'high'

    if (distance <= this.config.highDistance) return 'high'
    if (distance <= this.config.mediumDistance) return 'medium'
    return 'low'
  }

  /**
   * Update LOD for a zone based on camera position
   */
  updateZone(zoneId: string, zonePosition: THREE.Vector3, cameraPosition: THREE.Vector3): LODLevel {
    const state = this.states.get(zoneId)
    if (!state) {
      this.registerZone(zoneId)
      return this.updateZone(zoneId, zonePosition, cameraPosition)
    }

    // Calculate distance (ignore Y for floor-based distance)
    const dx = zonePosition.x - cameraPosition.x
    const dz = zonePosition.z - cameraPosition.z
    state.distance = Math.sqrt(dx * dx + dz * dz)

    const newLevel = this.calculateLevel(state.distance, state.isFocused)

    // Emit change event if level changed
    if (newLevel !== state.currentLevel) {
      const oldLevel = state.currentLevel
      state.currentLevel = newLevel
      state.lastUpdate = performance.now()

      const features = this.config.levels[newLevel]
      for (const callback of this.onLODChange) {
        callback(zoneId, newLevel, features)
      }

      console.log(
        `[LOD] Zone ${zoneId.slice(0, 8)}: ${oldLevel} → ${newLevel} (dist: ${state.distance.toFixed(1)})`
      )
    }

    return state.currentLevel
  }

  /**
   * Update all zones at once
   */
  updateAll(
    zones: Map<string, { id: string; position: THREE.Vector3 }>,
    cameraPosition: THREE.Vector3
  ): void {
    for (const zone of Array.from(zones.values())) {
      this.updateZone(zone.id, zone.position, cameraPosition)
    }
  }

  /**
   * Get current LOD level for a zone
   */
  getLevel(zoneId: string): LODLevel {
    return this.states.get(zoneId)?.currentLevel ?? 'high'
  }

  /**
   * Get features for a zone's current LOD level
   */
  getFeatures(zoneId: string): LODFeatures {
    const level = this.getLevel(zoneId)
    return this.config.levels[level]
  }

  /**
   * Subscribe to LOD changes
   */
  onChange(callback: (zoneId: string, level: LODLevel, features: LODFeatures) => void): void {
    this.onLODChange.push(callback)
  }

  /**
   * Get statistics about LOD distribution
   */
  getStats(): { high: number; medium: number; low: number; total: number } {
    let high = 0,
      medium = 0,
      low = 0

    for (const state of Array.from(this.states.values())) {
      switch (state.currentLevel) {
        case 'high':
          high++
          break
        case 'medium':
          medium++
          break
        case 'low':
          low++
          break
      }
    }

    return { high, medium, low, total: this.states.size }
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<LODConfig>): void {
    this.config = { ...this.config, ...config }
  }
}

/** Singleton instance */
export const zoneLOD = new ZoneLODManager()
