/**
 * Memory Budget System
 *
 * Manages memory usage by:
 * - Tracking zone access times for LRU eviction
 * - Enforcing maximum loaded zones
 * - Running periodic garbage collection
 * - Providing memory statistics
 */

export interface MemoryBudgetConfig {
  /** Maximum total zones allowed */
  maxZones: number
  /** Maximum zones with full detail loaded */
  maxLoadedZones: number
  /** Garbage collection interval in ms */
  gcIntervalMs: number
  /** Minimum time (ms) before a zone can be unloaded */
  minZoneAge: number
}

export const DEFAULT_MEMORY_CONFIG: MemoryBudgetConfig = {
  maxZones: 30,
  maxLoadedZones: 5,
  gcIntervalMs: 30000, // 30 seconds
  minZoneAge: 10000, // 10 seconds - don't unload recently created zones
}

export interface ZoneMemoryState {
  zoneId: string
  /** When this zone was last accessed/focused */
  lastAccessTime: number
  /** When this zone was created */
  createdTime: number
  /** Whether full details are currently loaded */
  isLoaded: boolean
  /** Estimated memory usage in bytes */
  estimatedMemory: number
}

/** Memory estimates per component (rough approximations) */
const MEMORY_ESTIMATES = {
  /** Base zone (platform, ring, floor, edges) */
  zoneBase: 200 * 1024, // ~200KB
  /** All 9 stations with details */
  stationsFull: 800 * 1024, // ~800KB
  /** Station placeholders only */
  stationsPlaceholder: 50 * 1024, // ~50KB
  /** Character instance */
  character: 300 * 1024, // ~300KB
  /** Particle system */
  particles: 50 * 1024, // ~50KB
  /** Labels and sprites */
  labels: 100 * 1024, // ~100KB
}

/**
 * Manages memory budget for zones
 */
export class MemoryBudgetManager {
  private config: MemoryBudgetConfig
  private states: Map<string, ZoneMemoryState> = new Map()
  private gcTimer: number | null = null

  /** Callbacks */
  private onUnloadRequest: Array<(zoneIds: string[]) => void> = []
  private onZoneLimitReached: Array<() => void> = []

  constructor(config: MemoryBudgetConfig = DEFAULT_MEMORY_CONFIG) {
    this.config = config
  }

  /**
   * Start the garbage collection timer
   */
  start(): void {
    if (this.gcTimer) return

    this.gcTimer = window.setInterval(() => {
      this.runGC()
    }, this.config.gcIntervalMs)

    console.log(`[MemoryBudget] Started GC timer (${this.config.gcIntervalMs}ms interval)`)
  }

  /**
   * Stop the garbage collection timer
   */
  stop(): void {
    if (this.gcTimer) {
      clearInterval(this.gcTimer)
      this.gcTimer = null
    }
  }

  /**
   * Register a new zone
   */
  registerZone(zoneId: string, isLoaded: boolean = true): boolean {
    // Check if we're at the zone limit
    if (this.states.size >= this.config.maxZones) {
      console.warn(`[MemoryBudget] Zone limit reached (${this.config.maxZones})`)
      for (const callback of this.onZoneLimitReached) {
        callback()
      }
      return false
    }

    const now = performance.now()
    this.states.set(zoneId, {
      zoneId,
      lastAccessTime: now,
      createdTime: now,
      isLoaded,
      estimatedMemory: this.estimateZoneMemory(isLoaded),
    })

    return true
  }

  /**
   * Unregister a zone (when deleted)
   */
  unregisterZone(zoneId: string): void {
    this.states.delete(zoneId)
  }

  /**
   * Mark a zone as accessed (updates LRU time)
   */
  touchZone(zoneId: string): void {
    const state = this.states.get(zoneId)
    if (state) {
      state.lastAccessTime = performance.now()
    }
  }

  /**
   * Mark a zone as loaded/unloaded
   */
  setZoneLoaded(zoneId: string, isLoaded: boolean): void {
    const state = this.states.get(zoneId)
    if (state) {
      state.isLoaded = isLoaded
      state.estimatedMemory = this.estimateZoneMemory(isLoaded)
    }
  }

  /**
   * Estimate memory usage for a zone
   */
  private estimateZoneMemory(isLoaded: boolean): number {
    if (isLoaded) {
      return (
        MEMORY_ESTIMATES.zoneBase +
        MEMORY_ESTIMATES.stationsFull +
        MEMORY_ESTIMATES.character +
        MEMORY_ESTIMATES.particles +
        MEMORY_ESTIMATES.labels
      )
    } else {
      return (
        MEMORY_ESTIMATES.zoneBase + MEMORY_ESTIMATES.stationsPlaceholder + MEMORY_ESTIMATES.labels
      )
    }
  }

  /**
   * Get zones that should be unloaded (LRU beyond max loaded)
   */
  getZonesToUnload(focusedZoneId: string | null): string[] {
    const loadedZones = Array.from(this.states.values())
      .filter((s) => s.isLoaded)
      .filter((s) => s.zoneId !== focusedZoneId) // Never unload focused zone

    // If under limit, nothing to unload
    if (loadedZones.length <= this.config.maxLoadedZones) {
      return []
    }

    const now = performance.now()

    // Sort by last access time (oldest first)
    const sortedByLRU = loadedZones
      .filter((s) => now - s.createdTime > this.config.minZoneAge) // Skip recently created
      .sort((a, b) => a.lastAccessTime - b.lastAccessTime)

    // Return zones beyond the limit
    const countToUnload = loadedZones.length - this.config.maxLoadedZones
    return sortedByLRU.slice(0, countToUnload).map((s) => s.zoneId)
  }

  /**
   * Run garbage collection
   */
  runGC(focusedZoneId: string | null = null): void {
    const zonesToUnload = this.getZonesToUnload(focusedZoneId)

    if (zonesToUnload.length > 0) {
      console.log(`[MemoryBudget] GC: Requesting unload of ${zonesToUnload.length} zones`)
      for (const callback of this.onUnloadRequest) {
        callback(zonesToUnload)
      }
    }
  }

  /**
   * Check if we can add more zones
   */
  canAddZone(): boolean {
    return this.states.size < this.config.maxZones
  }

  /**
   * Get the number of currently loaded zones
   */
  getLoadedCount(): number {
    let count = 0
    for (const state of Array.from(this.states.values())) {
      if (state.isLoaded) count++
    }
    return count
  }

  /**
   * Get memory statistics
   */
  getStats(): {
    totalZones: number
    loadedZones: number
    estimatedMemoryMB: number
    maxZones: number
    maxLoadedZones: number
  } {
    let totalMemory = 0
    let loadedCount = 0

    for (const state of Array.from(this.states.values())) {
      totalMemory += state.estimatedMemory
      if (state.isLoaded) loadedCount++
    }

    return {
      totalZones: this.states.size,
      loadedZones: loadedCount,
      estimatedMemoryMB: Math.round((totalMemory / 1024 / 1024) * 10) / 10,
      maxZones: this.config.maxZones,
      maxLoadedZones: this.config.maxLoadedZones,
    }
  }

  /**
   * Subscribe to unload requests
   */
  onUnload(callback: (zoneIds: string[]) => void): void {
    this.onUnloadRequest.push(callback)
  }

  /**
   * Subscribe to zone limit reached
   */
  onLimitReached(callback: () => void): void {
    this.onZoneLimitReached.push(callback)
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<MemoryBudgetConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Get browser memory info (if available)
   */
  getBrowserMemory(): { usedMB: number; totalMB: number } | null {
    // @ts-expect-error - performance.memory is Chrome-only
    const memory = performance.memory
    if (!memory) return null

    return {
      usedMB: Math.round(memory.usedJSHeapSize / 1024 / 1024),
      totalMB: Math.round(memory.totalJSHeapSize / 1024 / 1024),
    }
  }
}

/** Singleton instance */
export const memoryBudget = new MemoryBudgetManager()
