/**
 * SubagentManager - Manages subagent visualizations with hierarchy support
 *
 * Tracks Task tool spawns and creates mini-Claude instances for each active subagent.
 * Supports parent-child relationships for nested Task tools.
 */

import * as THREE from 'three'
import type { WorkshopScene } from '../scene/WorkshopScene'
import { Claude, type ClaudeOptions } from './Claude'

/** Subagent role templates */
export type SubagentRole = 'researcher' | 'coder' | 'reviewer' | 'tester' | 'explorer' | 'custom'

/** Template configurations for subagent roles */
export interface SubagentTemplate {
  id: SubagentRole
  name: string
  icon: string
  description: string
  color: number
  suggestedTools: string[]
}

export const SUBAGENT_TEMPLATES: SubagentTemplate[] = [
  {
    id: 'researcher',
    name: 'Researcher',
    icon: '🔍',
    description: 'Explores codebase, searches documentation',
    color: 0x3b82f6, // Blue
    suggestedTools: ['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch'],
  },
  {
    id: 'coder',
    name: 'Coder',
    icon: '💻',
    description: 'Writes and modifies code',
    color: 0x22c55e, // Green
    suggestedTools: ['Edit', 'Write', 'Bash', 'Read'],
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    icon: '👁️',
    description: 'Reviews code for issues and improvements',
    color: 0xa855f7, // Purple
    suggestedTools: ['Read', 'Grep', 'Glob'],
  },
  {
    id: 'tester',
    name: 'Tester',
    icon: '🧪',
    description: 'Writes and runs tests',
    color: 0xf59e0b, // Amber
    suggestedTools: ['Read', 'Bash', 'Edit', 'Write'],
  },
  {
    id: 'explorer',
    name: 'Explorer',
    icon: '🗺️',
    description: 'Quick codebase exploration',
    color: 0x06b6d4, // Cyan
    suggestedTools: ['Read', 'Glob', 'Grep', 'LS'],
  },
  {
    id: 'custom',
    name: 'Custom',
    icon: '⚡',
    description: 'Custom configuration',
    color: 0x64748b, // Slate
    suggestedTools: [],
  },
]

export interface Subagent {
  id: string
  toolUseId: string
  claude: Claude
  spawnTime: number
  description?: string
  /** Parent subagent's toolUseId (if this is a nested subagent) */
  parentToolUseId?: string
  /** Children toolUseIds */
  childToolUseIds: string[]
  /** Depth in hierarchy (0 = root level) */
  depth: number
  /** Role/template used */
  role?: SubagentRole
  /** Connection line to zone center or parent */
  connectionLine?: THREE.Line
  /** Zone center position (for root-level connection lines) */
  zoneCenter?: { x: number; z: number; y: number }
}

/** Hierarchy node for tree visualization */
export interface SubagentHierarchy {
  root: string // toolUseId
  children: Map<string, SubagentHierarchy>
  depth: number
}

// Different colors for subagents to distinguish them
const SUBAGENT_COLORS = [
  0x60a5fa, // Blue
  0x34d399, // Emerald
  0xf472b6, // Pink
  0xa78bfa, // Purple
  0xfbbf24, // Amber
  0x22d3ee, // Cyan
]

/** Maximum depth for subagent hierarchy */
const MAX_DEPTH = 5

/** Options for spawning a subagent with zone context */
export interface SpawnOptions {
  /** Zone color to inherit (subagent will match zone visually) */
  zoneColor?: number
  /** Zone position to spawn within */
  zonePosition?: { x: number; z: number }
  /** Zone elevation offset */
  zoneElevation?: number
}

export class SubagentManager {
  private scene: WorkshopScene
  private subagents: Map<string, Subagent> = new Map()
  private colorIndex = 0
  /** Track the currently active toolUseId to determine parent-child relationships */
  private activeToolUseId: string | null = null
  /** Callback for render loop (saved for cleanup) */
  private updateCallback: (() => void) | null = null

  constructor(scene: WorkshopScene) {
    this.scene = scene
    // Register for render updates to animate connection lines
    this.updateCallback = () => this.updateConnectionLines()
    scene.onRender(this.updateCallback)
  }

  /**
   * Set the currently active tool (for hierarchy tracking)
   * Call this when a tool starts executing
   */
  setActiveToolUse(toolUseId: string | null): void {
    this.activeToolUseId = toolUseId
  }

  /**
   * Get the currently active tool use ID
   */
  getActiveToolUse(): string | null {
    return this.activeToolUseId
  }

  /**
   * Spawn a new subagent when a Task tool starts
   * @param toolUseId - Unique ID for this Task invocation
   * @param description - Task description
   * @param role - Optional role template
   * @param parentToolUseId - Optional parent (for nested Tasks)
   * @param options - Zone context for positioning and styling
   */
  spawn(
    toolUseId: string,
    description?: string,
    role?: SubagentRole,
    parentToolUseId?: string,
    options?: SpawnOptions
  ): Subagent {
    // Don't spawn duplicates
    if (this.subagents.has(toolUseId)) {
      return this.subagents.get(toolUseId)!
    }

    // Determine parent (explicit or from active tool)
    const actualParent = parentToolUseId ?? this.findParentSubagent()
    const parent = actualParent ? this.subagents.get(actualParent) : undefined

    // Calculate depth
    const depth = parent ? Math.min(parent.depth + 1, MAX_DEPTH) : 0

    // Get color: prefer zone color, fall back to role template, then cycle through defaults
    let color: number
    if (options?.zoneColor !== undefined) {
      // Use zone color with slight brightness variation based on depth
      // Deeper subagents get slightly dimmer to show hierarchy
      color = this.adjustColorBrightness(options.zoneColor, 1 - depth * 0.1)
    } else if (role) {
      const template = SUBAGENT_TEMPLATES.find((t) => t.id === role)
      color = template?.color ?? SUBAGENT_COLORS[this.colorIndex % SUBAGENT_COLORS.length]
      this.colorIndex++
    } else {
      color = SUBAGENT_COLORS[this.colorIndex % SUBAGENT_COLORS.length]
      this.colorIndex++
    }

    // Scale gets smaller with depth
    const baseScale = 0.6
    const depthScale = Math.max(0.3, baseScale - depth * 0.08)

    // Create mini-Claude - position will be set after based on zone context
    const claudeOptions: ClaudeOptions = {
      scale: depthScale,
      color: color,
      statusColor: color,
      startStation: 'portal', // Default, will be overridden if zone position provided
    }

    const claude = new Claude(this.scene, claudeOptions)
    claude.setState('thinking')

    // Position based on zone context and hierarchy
    const hasZonePosition = options?.zonePosition !== undefined
    const zoneElevation = options?.zoneElevation ?? 0

    if (parent) {
      // Children orbit around parent (regardless of zone)
      const siblingIndex = parent.childToolUseIds.length
      const orbitRadius = 1.2 + depth * 0.25
      const angleOffset =
        (siblingIndex / Math.max(1, parent.childToolUseIds.length + 1)) * Math.PI * 2
      const angle = angleOffset + Math.PI / 4

      const parentPos = parent.claude.mesh.position
      claude.mesh.position.x = parentPos.x + Math.sin(angle) * orbitRadius
      claude.mesh.position.z = parentPos.z + Math.cos(angle) * orbitRadius
      claude.mesh.position.y = parentPos.y // Match parent elevation
    } else if (hasZonePosition) {
      // Root level subagents spawn within their zone
      const zonePos = options!.zonePosition!
      const rootCount = this.getRootSubagents().length

      // Spiral outward from zone center, staying within zone radius (~5.5 units)
      const spiralAngle = rootCount * Math.PI * 0.6 // Golden angle-ish spacing
      const spiralRadius = 1.5 + rootCount * 0.4 // Start near center, expand outward
      const clampedRadius = Math.min(spiralRadius, 4.5) // Stay within zone bounds

      claude.mesh.position.x = zonePos.x + Math.sin(spiralAngle) * clampedRadius
      claude.mesh.position.z = zonePos.z + Math.cos(spiralAngle) * clampedRadius
      claude.mesh.position.y = zoneElevation // Match zone elevation
    } else {
      // Fallback: fan out from portal (legacy behavior)
      const rootCount = this.getRootSubagents().length
      const offset = rootCount * 0.8
      const angle = rootCount * Math.PI * 0.3
      claude.mesh.position.x += Math.sin(angle) * offset
      claude.mesh.position.z += Math.cos(angle) * offset
    }

    // Create connection line from subagent to zone center or parent
    const connectionLine = this.createConnectionLine(
      claude.mesh.position,
      parent?.claude.mesh.position ??
        (hasZonePosition
          ? new THREE.Vector3(options!.zonePosition!.x, zoneElevation, options!.zonePosition!.z)
          : null),
      color
    )

    const subagent: Subagent = {
      id: claude.id,
      toolUseId,
      claude,
      spawnTime: Date.now(),
      description,
      parentToolUseId: actualParent,
      childToolUseIds: [],
      depth,
      role,
      connectionLine: connectionLine ?? undefined,
      zoneCenter: hasZonePosition
        ? { x: options!.zonePosition!.x, z: options!.zonePosition!.z, y: zoneElevation }
        : undefined,
    }

    // Register as child of parent
    if (parent) {
      parent.childToolUseIds.push(toolUseId)
    }

    this.subagents.set(toolUseId, subagent)
    console.log(
      `Subagent spawned: ${toolUseId} (depth: ${depth}, parent: ${actualParent ?? 'none'}, zoneColor: ${options?.zoneColor?.toString(16)})`,
      description
    )

    return subagent
  }

  /**
   * Adjust color brightness for hierarchy depth variation
   * @param color - Base color as hex number
   * @param factor - Brightness multiplier (0.0-1.0+)
   */
  private adjustColorBrightness(color: number, factor: number): number {
    const r = Math.min(255, Math.floor(((color >> 16) & 0xff) * factor))
    const g = Math.min(255, Math.floor(((color >> 8) & 0xff) * factor))
    const b = Math.min(255, Math.floor((color & 0xff) * factor))
    return (r << 16) | (g << 8) | b
  }

  /**
   * Create a glowing connection line from subagent to target (zone center or parent)
   * @param from - Subagent position
   * @param to - Target position (zone center or parent position), null if no connection needed
   * @param color - Line color (matches subagent/zone color)
   */
  private createConnectionLine(
    from: THREE.Vector3,
    to: THREE.Vector3 | null,
    color: number
  ): THREE.Line | null {
    if (!to) return null

    // Create geometry with two points (will be updated each frame)
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(6) // 2 points * 3 coords
    positions[0] = from.x
    positions[1] = from.y + 0.5 // Slight offset so line doesn't clip floor
    positions[2] = from.z
    positions[3] = to.x
    positions[4] = to.y + 0.1 // Lower at center
    positions[5] = to.z
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    // Create glowing dashed line material
    const material = new THREE.LineDashedMaterial({
      color: color,
      transparent: true,
      opacity: 0.4,
      dashSize: 0.3,
      gapSize: 0.2,
      linewidth: 2,
    })

    const line = new THREE.Line(geometry, material)
    line.computeLineDistances() // Required for dashed lines
    this.scene.scene.add(line)

    return line
  }

  /**
   * Update connection line positions (call each frame for smooth animation)
   */
  updateConnectionLines(): void {
    for (const subagent of this.subagents.values()) {
      if (!subagent.connectionLine) continue

      const positions = subagent.connectionLine.geometry.attributes
        .position as THREE.BufferAttribute

      // Update 'from' position (subagent)
      positions.setXYZ(
        0,
        subagent.claude.mesh.position.x,
        subagent.claude.mesh.position.y + 0.5,
        subagent.claude.mesh.position.z
      )

      // Update 'to' position (parent or zone center)
      if (subagent.parentToolUseId) {
        const parent = this.subagents.get(subagent.parentToolUseId)
        if (parent) {
          positions.setXYZ(
            1,
            parent.claude.mesh.position.x,
            parent.claude.mesh.position.y + 0.5,
            parent.claude.mesh.position.z
          )
        }
      } else if (subagent.zoneCenter) {
        positions.setXYZ(
          1,
          subagent.zoneCenter.x,
          subagent.zoneCenter.y + 0.1,
          subagent.zoneCenter.z
        )
      }

      positions.needsUpdate = true
      subagent.connectionLine.computeLineDistances()
    }
  }

  /**
   * Find the parent subagent based on currently active tool
   */
  private findParentSubagent(): string | undefined {
    if (!this.activeToolUseId) return undefined

    // Check if the active tool is a subagent
    if (this.subagents.has(this.activeToolUseId)) {
      return this.activeToolUseId
    }

    return undefined
  }

  /**
   * Get root-level subagents (no parent)
   */
  getRootSubagents(): Subagent[] {
    return Array.from(this.subagents.values()).filter((s) => !s.parentToolUseId)
  }

  /**
   * Get children of a subagent
   */
  getChildren(toolUseId: string): Subagent[] {
    const parent = this.subagents.get(toolUseId)
    if (!parent) return []

    return parent.childToolUseIds
      .map((id) => this.subagents.get(id))
      .filter((s): s is Subagent => s !== undefined)
  }

  /**
   * Get the full hierarchy tree starting from a root
   */
  getHierarchy(toolUseId: string): SubagentHierarchy | null {
    const subagent = this.subagents.get(toolUseId)
    if (!subagent) return null

    const buildTree = (id: string, depth: number): SubagentHierarchy => {
      const agent = this.subagents.get(id)!
      const children = new Map<string, SubagentHierarchy>()

      for (const childId of agent.childToolUseIds) {
        children.set(childId, buildTree(childId, depth + 1))
      }

      return { root: id, children, depth }
    }

    return buildTree(toolUseId, 0)
  }

  /**
   * Get all hierarchies (multiple roots possible)
   */
  getAllHierarchies(): SubagentHierarchy[] {
    return this.getRootSubagents()
      .map((s) => this.getHierarchy(s.toolUseId))
      .filter((h): h is SubagentHierarchy => h !== null)
  }

  /**
   * Get ancestors of a subagent (parent chain)
   */
  getAncestors(toolUseId: string): Subagent[] {
    const ancestors: Subagent[] = []
    let current = this.subagents.get(toolUseId)

    while (current?.parentToolUseId) {
      const parent = this.subagents.get(current.parentToolUseId)
      if (parent) {
        ancestors.push(parent)
        current = parent
      } else {
        break
      }
    }

    return ancestors
  }

  /**
   * Remove a subagent when its Task completes
   * @param toolUseId - The subagent to remove
   * @param removeChildren - If true, also removes all descendants
   */
  remove(toolUseId: string, removeChildren = true): void {
    const subagent = this.subagents.get(toolUseId)
    if (!subagent) return

    // Remove children first if requested
    if (removeChildren) {
      for (const childId of [...subagent.childToolUseIds]) {
        this.remove(childId, true)
      }
    } else {
      // Orphan children - make them root level
      for (const childId of subagent.childToolUseIds) {
        const child = this.subagents.get(childId)
        if (child) {
          child.parentToolUseId = undefined
          child.depth = 0
        }
      }
    }

    // Remove from parent's children list
    if (subagent.parentToolUseId) {
      const parent = this.subagents.get(subagent.parentToolUseId)
      if (parent) {
        const index = parent.childToolUseIds.indexOf(toolUseId)
        if (index !== -1) {
          parent.childToolUseIds.splice(index, 1)
        }
      }
    }

    // Clean up connection line
    if (subagent.connectionLine) {
      this.scene.scene.remove(subagent.connectionLine)
      subagent.connectionLine.geometry.dispose()
      ;(subagent.connectionLine.material as THREE.Material).dispose()
    }

    // Clean up claude
    subagent.claude.dispose()
    this.subagents.delete(toolUseId)
    console.log(`Subagent removed: ${toolUseId} (depth: ${subagent.depth})`)
  }

  /**
   * Get a subagent by toolUseId
   */
  get(toolUseId: string): Subagent | undefined {
    return this.subagents.get(toolUseId)
  }

  /**
   * Get all active subagents
   */
  getAll(): Subagent[] {
    return Array.from(this.subagents.values())
  }

  /**
   * Get subagents by depth
   */
  getByDepth(depth: number): Subagent[] {
    return Array.from(this.subagents.values()).filter((s) => s.depth === depth)
  }

  /**
   * Get maximum current depth
   */
  getMaxDepth(): number {
    let max = 0
    for (const subagent of this.subagents.values()) {
      max = Math.max(max, subagent.depth)
    }
    return max
  }

  /**
   * Get count of active subagents
   */
  get count(): number {
    return this.subagents.size
  }

  /**
   * Get hierarchy stats
   */
  getStats(): {
    total: number
    rootCount: number
    maxDepth: number
    byRole: Record<SubagentRole | 'none', number>
  } {
    const byRole: Record<SubagentRole | 'none', number> = {
      researcher: 0,
      coder: 0,
      reviewer: 0,
      tester: 0,
      explorer: 0,
      custom: 0,
      none: 0,
    }

    for (const subagent of this.subagents.values()) {
      const role = subagent.role ?? 'none'
      byRole[role]++
    }

    return {
      total: this.subagents.size,
      rootCount: this.getRootSubagents().length,
      maxDepth: this.getMaxDepth(),
      byRole,
    }
  }

  /**
   * Clean up all subagents
   */
  dispose(): void {
    // Unregister from render loop
    if (this.updateCallback) {
      this.scene.offRender(this.updateCallback)
      this.updateCallback = null
    }

    for (const subagent of this.subagents.values()) {
      // Clean up connection line
      if (subagent.connectionLine) {
        this.scene.scene.remove(subagent.connectionLine)
        subagent.connectionLine.geometry.dispose()
        ;(subagent.connectionLine.material as THREE.Material).dispose()
      }
      subagent.claude.dispose()
    }
    this.subagents.clear()
    this.activeToolUseId = null
  }
}
