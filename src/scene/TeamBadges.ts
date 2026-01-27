/**
 * Team Badges
 *
 * Shows team membership badges above zones.
 * Displays team icon, name, and coordinator crown if applicable.
 */

import * as THREE from 'three'
import type { Team } from '../../shared/types'

interface TeamBadge {
  sprite: THREE.Sprite
  teamId: string
  isCoordinator: boolean
}

const BADGE_SCALE = 1.8
const BADGE_HEIGHT = 4.5 // Above zone label
const CANVAS_WIDTH = 256
const CANVAS_HEIGHT = 64

export class TeamBadges {
  private badges: Map<string, TeamBadge> = new Map() // zoneId -> badge
  private scene: THREE.Scene
  private zoneElevations: Map<string, number> = new Map() // zoneId -> elevation

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  /**
   * Show or update team badge for a zone
   */
  show(zoneId: string, team: Team, sessionId: string, zonePosition: THREE.Vector3): void {
    const isCoordinator = team.coordinatorId === sessionId

    // Reuse existing badge if same team
    const existing = this.badges.get(zoneId)
    if (existing && existing.teamId === team.id && existing.isCoordinator === isCoordinator) {
      // Just update position in case zone moved
      this.updatePosition(zoneId, zonePosition)
      return
    }

    // Remove old badge if exists
    if (existing) {
      this.scene.remove(existing.sprite)
      this.badges.delete(zoneId)
    }

    // Create new badge
    const sprite = this.createBadgeSprite(team, isCoordinator)
    const elevation = this.zoneElevations.get(zoneId) || 0
    sprite.position.set(zonePosition.x, zonePosition.y + elevation + BADGE_HEIGHT, zonePosition.z)
    this.scene.add(sprite)

    this.badges.set(zoneId, {
      sprite,
      teamId: team.id,
      isCoordinator,
    })
  }

  /**
   * Remove badge for a zone
   */
  hide(zoneId: string): void {
    const badge = this.badges.get(zoneId)
    if (badge) {
      this.scene.remove(badge.sprite)
      this.badges.delete(zoneId)
    }
  }

  /**
   * Update zone elevation (called when painted hexes change)
   */
  updateZoneElevation(zoneId: string, elevation: number): void {
    this.zoneElevations.set(zoneId, elevation)

    // Update badge position
    const badge = this.badges.get(zoneId)
    if (badge) {
      badge.sprite.position.y += elevation - (this.zoneElevations.get(zoneId) || 0)
    }
  }

  /**
   * Update badge position when zone moves
   */
  private updatePosition(zoneId: string, zonePosition: THREE.Vector3): void {
    const badge = this.badges.get(zoneId)
    if (badge) {
      const elevation = this.zoneElevations.get(zoneId) || 0
      badge.sprite.position.set(
        zonePosition.x,
        zonePosition.y + elevation + BADGE_HEIGHT,
        zonePosition.z
      )
    }
  }

  /**
   * Create badge sprite
   */
  private createBadgeSprite(team: Team, isCoordinator: boolean): THREE.Sprite {
    const canvas = document.createElement('canvas')
    canvas.width = CANVAS_WIDTH
    canvas.height = CANVAS_HEIGHT
    const ctx = canvas.getContext('2d')!

    // Background with rounded corners and team color
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
    this.roundRect(ctx, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, 16)
    ctx.fill()

    // Border
    ctx.strokeStyle = '#4ac8e8' // Cyan accent
    ctx.lineWidth = 3
    this.roundRect(ctx, 2, 2, CANVAS_WIDTH - 4, CANVAS_HEIGHT - 4, 14)
    ctx.stroke()

    // Team icon (👥 for regular members, 👑 for coordinator)
    const icon = isCoordinator ? '👑' : '👥'
    ctx.font = 'bold 32px Arial'
    ctx.fillStyle = isCoordinator ? '#f59e0b' : '#4ac8e8' // Amber for coordinator, cyan for members
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(icon, 16, CANVAS_HEIGHT / 2)

    // Team name (truncate if too long)
    const maxNameLength = 15
    const teamName =
      team.name.length > maxNameLength ? team.name.slice(0, maxNameLength) + '…' : team.name
    ctx.font = 'bold 18px Arial'
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'left'
    ctx.fillText(teamName, 56, CANVAS_HEIGHT / 2)

    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    })

    const sprite = new THREE.Sprite(material)
    sprite.scale.set(BADGE_SCALE, BADGE_SCALE * (CANVAS_HEIGHT / CANVAS_WIDTH), 1)
    sprite.renderOrder = 1000 // Always on top

    return sprite
  }

  /**
   * Draw rounded rectangle
   */
  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ): void {
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.lineTo(x + width - radius, y)
    ctx.arcTo(x + width, y, x + width, y + radius, radius)
    ctx.lineTo(x + width, y + height - radius)
    ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius)
    ctx.lineTo(x + radius, y + height)
    ctx.arcTo(x, y + height, x, y + height - radius, radius)
    ctx.lineTo(x, y + radius)
    ctx.arcTo(x, y, x + radius, y, radius)
    ctx.closePath()
  }

  /**
   * Remove all badges (cleanup)
   */
  clear(): void {
    for (const [, badge] of this.badges) {
      this.scene.remove(badge.sprite)
    }
    this.badges.clear()
  }
}
