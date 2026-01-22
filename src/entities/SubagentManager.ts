/**
 * SubagentManager - Manages subagent visualizations with hierarchy support
 *
 * Tracks Task tool spawns and creates mini-Claude instances for each active subagent.
 * Supports parent-child relationships for nested Task tools.
 */

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

export class SubagentManager {
  private scene: WorkshopScene
  private subagents: Map<string, Subagent> = new Map()
  private colorIndex = 0
  /** Track the currently active toolUseId to determine parent-child relationships */
  private activeToolUseId: string | null = null

  constructor(scene: WorkshopScene) {
    this.scene = scene
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
   */
  spawn(
    toolUseId: string,
    description?: string,
    role?: SubagentRole,
    parentToolUseId?: string
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

    // Get color from role template or cycle through colors
    let color: number
    if (role) {
      const template = SUBAGENT_TEMPLATES.find((t) => t.id === role)
      color = template?.color ?? SUBAGENT_COLORS[this.colorIndex % SUBAGENT_COLORS.length]
    } else {
      color = SUBAGENT_COLORS[this.colorIndex % SUBAGENT_COLORS.length]
    }
    this.colorIndex++

    // Scale gets smaller with depth
    const baseScale = 0.6
    const depthScale = Math.max(0.3, baseScale - depth * 0.08)

    // Create mini-Claude at portal station (or near parent)
    const options: ClaudeOptions = {
      scale: depthScale,
      color: color,
      statusColor: color,
      startStation: 'portal',
    }

    const claude = new Claude(this.scene, options)
    claude.setState('thinking')

    // Position based on hierarchy
    if (parent) {
      // Children orbit around parent
      const siblingIndex = parent.childToolUseIds.length
      const orbitRadius = 1.5 + depth * 0.3
      const angleOffset =
        (siblingIndex / Math.max(1, parent.childToolUseIds.length + 1)) * Math.PI * 2
      const angle = angleOffset + Math.PI / 4

      const parentPos = parent.claude.mesh.position
      claude.mesh.position.x = parentPos.x + Math.sin(angle) * orbitRadius
      claude.mesh.position.z = parentPos.z + Math.cos(angle) * orbitRadius
    } else {
      // Root level subagents fan out from portal
      const rootCount = this.getRootSubagents().length
      const offset = rootCount * 0.8
      const angle = rootCount * Math.PI * 0.3
      claude.mesh.position.x += Math.sin(angle) * offset
      claude.mesh.position.z += Math.cos(angle) * offset
    }

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
    }

    // Register as child of parent
    if (parent) {
      parent.childToolUseIds.push(toolUseId)
    }

    this.subagents.set(toolUseId, subagent)
    console.log(
      `Subagent spawned: ${toolUseId} (depth: ${depth}, parent: ${actualParent ?? 'none'})`,
      description
    )

    return subagent
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

    // Clean up
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
    for (const subagent of this.subagents.values()) {
      subagent.claude.dispose()
    }
    this.subagents.clear()
    this.activeToolUseId = null
  }
}
