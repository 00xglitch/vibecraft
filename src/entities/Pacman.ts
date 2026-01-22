/**
 * Pacman - Classic arcade character
 *
 * Design: The iconic yellow chomping character
 * - Yellow sphere with wedge mouth
 * - Animated chomping motion
 * - Simple and instantly recognizable
 */

import * as THREE from 'three'
import type { StationType } from '../../shared/types'
import type { WorkshopScene } from '../scene/WorkshopScene'
import type { ICharacter, CharacterOptions, CharacterState } from './ICharacter'
import {
  IdleBehaviorManager,
  WorkingBehaviorManager,
  type CharacterParts,
} from './animations'

export type PacmanOptions = CharacterOptions

const DEFAULT_OPTIONS: Required<PacmanOptions> = {
  scale: 1,
  color: 0xffcc00, // Classic Pacman yellow
  statusColor: 0x4ade80,
  startStation: 'center',
}

export class Pacman implements ICharacter {
  public readonly mesh: THREE.Group
  public state: CharacterState = 'idle'
  public currentStation: StationType = 'center'
  public readonly id: string

  private scene: WorkshopScene
  private options: Required<PacmanOptions>
  private targetPosition: THREE.Vector3 | null = null
  private moveSpeed = 3.5 // Pacman is speedy!
  private bobTime = 0
  private workTime = 0
  private thinkTime = 0
  private chompTime = 0
  private updateCallback: ((delta: number) => void) | null = null

  // Body parts for animation
  private head: THREE.Group
  private visor: THREE.Mesh
  private leftEye: THREE.Mesh
  private rightEye: THREE.Mesh
  private body: THREE.Group
  private leftArm: THREE.Group
  private rightArm: THREE.Group
  private antenna: THREE.Group
  private statusRing: THREE.Mesh

  // Pacman specific
  private topJaw: THREE.Mesh
  private bottomJaw: THREE.Mesh

  // Behavior systems
  private idleBehaviorManager: IdleBehaviorManager
  private workingBehaviorManager: WorkingBehaviorManager

  constructor(scene: WorkshopScene, options: PacmanOptions = {}) {
    this.scene = scene
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.id = Math.random().toString(36).substring(2, 9)
    this.mesh = new THREE.Group()

    // Create Pacman body (which is also the head)
    this.head = this.createPacmanBody()
    this.topJaw = this.head.getObjectByName('topJaw') as THREE.Mesh
    this.bottomJaw = this.head.getObjectByName('bottomJaw') as THREE.Mesh
    this.visor = this.head.getObjectByName('visor') as THREE.Mesh
    this.leftEye = this.head.getObjectByName('leftEye') as THREE.Mesh
    this.rightEye = this.head.getObjectByName('rightEye') as THREE.Mesh

    // Empty groups for compatibility
    this.body = new THREE.Group()
    this.leftArm = new THREE.Group()
    this.rightArm = new THREE.Group()
    this.antenna = new THREE.Group()

    this.statusRing = this.createStatusRing()

    this.mesh.add(this.head)
    this.mesh.add(this.statusRing)

    // Initialize behavior systems
    this.idleBehaviorManager = new IdleBehaviorManager()
    this.workingBehaviorManager = new WorkingBehaviorManager()

    // Apply scale
    this.mesh.scale.setScalar(this.options.scale)

    // Position at start station
    this.currentStation = this.options.startStation
    const startStation = scene.stations.get(this.options.startStation)
    if (startStation) {
      this.mesh.position.copy(startStation.position)
    }

    // Add to scene
    scene.scene.add(this.mesh)

    // Register update callback
    this.updateCallback = (delta: number) => this.update(delta)
    scene.onRender(this.updateCallback)
  }

  private createPacmanBody(): THREE.Group {
    const group = new THREE.Group()

    const pacmanColor = this.options.color

    // Create Pacman using two hemisphere-like shapes for chomping
    // Top half
    const topGeo = new THREE.SphereGeometry(0.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)
    const pacmanMat = new THREE.MeshStandardMaterial({
      color: pacmanColor,
      roughness: 0.4,
      side: THREE.DoubleSide,
    })
    const topJaw = new THREE.Mesh(topGeo, pacmanMat)
    topJaw.position.y = 0.6
    topJaw.name = 'topJaw'
    group.add(topJaw)

    // Bottom half
    const bottomGeo = new THREE.SphereGeometry(0.5, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)
    const bottomJaw = new THREE.Mesh(bottomGeo, pacmanMat)
    bottomJaw.position.y = 0.6
    bottomJaw.name = 'bottomJaw'
    group.add(bottomJaw)

    // Inner mouth (dark)
    const mouthGeo = new THREE.CircleGeometry(0.45, 24)
    const mouthMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      side: THREE.DoubleSide,
    })
    const mouth = new THREE.Mesh(mouthGeo, mouthMat)
    mouth.position.set(0, 0.6, 0.01)
    mouth.rotation.y = Math.PI / 2
    group.add(mouth)

    // Eye (classic Pacman has one visible eye from the side)
    const eyeGeo = new THREE.SphereGeometry(0.08, 12, 12)
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111 })

    const leftEye = new THREE.Mesh(eyeGeo, eyeMat)
    leftEye.position.set(-0.15, 0.85, 0.35)
    leftEye.name = 'leftEye'
    group.add(leftEye)

    // Second eye (optional, makes it cuter)
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat)
    rightEye.position.set(0.15, 0.85, 0.35)
    rightEye.name = 'rightEye'
    group.add(rightEye)

    // Eye shine
    const shineGeo = new THREE.SphereGeometry(0.025, 8, 8)
    const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff })

    const leftShine = new THREE.Mesh(shineGeo, shineMat)
    leftShine.position.set(-0.12, 0.88, 0.4)
    group.add(leftShine)

    const rightShine = new THREE.Mesh(shineGeo, shineMat)
    rightShine.position.set(0.18, 0.88, 0.4)
    group.add(rightShine)

    // Visor placeholder for animation compatibility
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01))
    visor.visible = false
    visor.name = 'visor'
    group.add(visor)

    return group
  }

  private createStatusRing(): THREE.Mesh {
    const geometry = new THREE.RingGeometry(0.55, 0.6, 32)
    const material = new THREE.MeshBasicMaterial({
      color: this.options.statusColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
    })
    const ring = new THREE.Mesh(geometry, material)
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.01
    return ring
  }

  private getCharacterParts(): CharacterParts {
    return {
      head: this.head,
      body: this.body,
      leftArm: this.leftArm,
      rightArm: this.rightArm,
      antenna: this.antenna,
      leftEye: this.leftEye,
      rightEye: this.rightEye,
      mesh: this.mesh,
    }
  }

  update(delta: number): void {
    this.bobTime += delta
    this.chompTime += delta

    if (this.state === 'walking' && this.targetPosition) {
      const direction = new THREE.Vector3()
        .subVectors(this.targetPosition, this.mesh.position)
        .normalize()
      const distance = this.mesh.position.distanceTo(this.targetPosition)

      if (distance > 0.1) {
        this.mesh.position.add(direction.multiplyScalar(this.moveSpeed * delta))

        // Face movement direction
        const angle = Math.atan2(direction.x, direction.z)
        this.mesh.rotation.y = angle

        // CHOMP CHOMP animation while moving!
        const chompAngle = Math.abs(Math.sin(this.chompTime * 15)) * 0.4
        this.topJaw.rotation.x = -chompAngle
        this.bottomJaw.rotation.x = chompAngle
      } else {
        this.mesh.position.copy(this.targetPosition)
        this.targetPosition = null
        this.setState('idle')
        // Close mouth
        this.topJaw.rotation.x = 0
        this.bottomJaw.rotation.x = 0
      }
    } else if (this.state === 'idle') {
      // Gentle bobbing and occasional small chomp
      this.head.position.y = Math.sin(this.bobTime * 2) * 0.02

      // Occasional idle chomp
      if (Math.sin(this.bobTime * 0.5) > 0.95) {
        const smallChomp = Math.abs(Math.sin(this.bobTime * 8)) * 0.15
        this.topJaw.rotation.x = -smallChomp
        this.bottomJaw.rotation.x = smallChomp
      } else {
        this.topJaw.rotation.x *= 0.9
        this.bottomJaw.rotation.x *= 0.9
      }
    } else if (this.state === 'working') {
      this.workTime += delta
      // Working = eating! Fast chomping
      const chompAngle = Math.abs(Math.sin(this.workTime * 12)) * 0.35
      this.topJaw.rotation.x = -chompAngle
      this.bottomJaw.rotation.x = chompAngle

      // Slight rotation back and forth
      this.head.rotation.y = Math.sin(this.workTime * 3) * 0.2
    } else if (this.state === 'thinking') {
      this.thinkTime += delta
      // Thinking = slow contemplative chomps
      const thinkChomp = Math.abs(Math.sin(this.thinkTime * 2)) * 0.2
      this.topJaw.rotation.x = -thinkChomp
      this.bottomJaw.rotation.x = thinkChomp

      // Look up as if thinking
      this.head.rotation.x = -0.2
    }
  }

  moveTo(station: StationType): void {
    const target = this.scene.stations.get(station)
    if (target) {
      this.moveToPosition(target.position.clone(), station)
    }
  }

  moveToPosition(position: THREE.Vector3, station: StationType): void {
    this.targetPosition = position
    this.currentStation = station
    this.setState('walking')
  }

  setState(state: CharacterState): void {
    if (this.state === state) return

    const parts = this.getCharacterParts()

    // Stop previous working animation if switching away
    if (this.state === 'working') {
      this.workingBehaviorManager.stop(parts)
    }

    this.state = state

    if (state === 'working') {
      this.workingBehaviorManager.start(this.currentStation, parts)
    } else if (state === 'idle') {
      this.head.rotation.set(0, 0, 0)
    }

    // Update status ring color
    const colors = {
      idle: 0x4ade80,    // green
      walking: 0x60a5fa, // blue
      working: 0xfb923c, // orange
      thinking: 0xa78bfa // purple
    }
    const ring = this.statusRing.material as THREE.MeshBasicMaterial
    ring.color.setHex(colors[state])
  }

  setStatusColor(color: number): void {
    const ring = this.statusRing.material as THREE.MeshBasicMaterial
    ring.color.setHex(color)
  }

  playRandomIdleBehavior(): void {
    if (this.state !== 'idle') {
      this.setState('idle')
    }
    // Pacman's random idle: big chomp!
    const parts = this.getCharacterParts()
    this.idleBehaviorManager.forcePlayRandom(parts)

    // Also do a big chomp
    const bigChomp = () => {
      const startTime = this.bobTime
      const duration = 0.5
      const animate = () => {
        const elapsed = this.bobTime - startTime
        if (elapsed < duration) {
          const t = elapsed / duration
          const angle = Math.sin(t * Math.PI) * 0.5
          this.topJaw.rotation.x = -angle
          this.bottomJaw.rotation.x = angle
          requestAnimationFrame(animate)
        } else {
          this.topJaw.rotation.x = 0
          this.bottomJaw.rotation.x = 0
        }
      }
      animate()
    }
    bigChomp()
  }

  playIdleBehavior(name: string): void {
    if (this.state !== 'idle') {
      this.setState('idle')
    }
    this.idleBehaviorManager.forcePlay(name, this.getCharacterParts())
  }

  dispose(): void {
    if (this.updateCallback) {
      this.scene.offRender(this.updateCallback)
    }
    this.scene.scene.remove(this.mesh)
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose())
        } else {
          child.material.dispose()
        }
      }
    })
  }
}
