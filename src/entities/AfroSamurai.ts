/**
 * AfroSamurai - Cool samurai character with iconic afro
 *
 * Design: Stylish character with large afro and samurai elements
 * - Large spherical afro hairstyle
 * - Determined eyes with headband
 * - Slim body with simple katana
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

export type AfroSamuraiOptions = CharacterOptions

const DEFAULT_OPTIONS: Required<AfroSamuraiOptions> = {
  scale: 1,
  color: 0x2d1810, // Dark brown for afro
  statusColor: 0x4ade80,
  startStation: 'center',
}

export class AfroSamurai implements ICharacter {
  public readonly mesh: THREE.Group
  public state: CharacterState = 'idle'
  public currentStation: StationType = 'center'
  public readonly id: string

  private scene: WorkshopScene
  private options: Required<AfroSamuraiOptions>
  private targetPosition: THREE.Vector3 | null = null
  private moveSpeed = 3
  private bobTime = 0
  private workTime = 0
  private thinkTime = 0
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

  // Behavior systems
  private idleBehaviorManager: IdleBehaviorManager
  private workingBehaviorManager: WorkingBehaviorManager

  constructor(scene: WorkshopScene, options: AfroSamuraiOptions = {}) {
    this.scene = scene
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.id = Math.random().toString(36).substring(2, 9)
    this.mesh = new THREE.Group()

    // Create all parts
    this.head = this.createHead()
    this.visor = this.head.getObjectByName('visor') as THREE.Mesh
    this.leftEye = this.head.getObjectByName('leftEye') as THREE.Mesh
    this.rightEye = this.head.getObjectByName('rightEye') as THREE.Mesh

    this.body = this.createBody()
    this.leftArm = this.createArm(true)
    this.rightArm = this.createArm(false)
    this.antenna = new THREE.Group() // Empty for compatibility

    this.statusRing = this.createStatusRing()

    this.mesh.add(this.head)
    this.mesh.add(this.body)
    this.mesh.add(this.leftArm)
    this.mesh.add(this.rightArm)
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

  private createHead(): THREE.Group {
    const group = new THREE.Group()

    // Face (tan skin)
    const faceGeo = new THREE.SphereGeometry(0.35, 16, 12)
    const faceMat = new THREE.MeshStandardMaterial({
      color: 0xc4956a,
      roughness: 0.8,
    })
    const face = new THREE.Mesh(faceGeo, faceMat)
    face.position.y = 1.2
    group.add(face)

    // Afro (large dark sphere)
    const afroGeo = new THREE.SphereGeometry(0.55, 20, 16)
    const afroMat = new THREE.MeshStandardMaterial({
      color: this.options.color,
      roughness: 1,
    })
    const afro = new THREE.Mesh(afroGeo, afroMat)
    afro.position.y = 1.35
    afro.position.z = -0.05
    group.add(afro)

    // Headband (red)
    const headbandGeo = new THREE.TorusGeometry(0.38, 0.04, 8, 24)
    const headbandMat = new THREE.MeshStandardMaterial({
      color: 0xcc2222,
      roughness: 0.5,
    })
    const headband = new THREE.Mesh(headbandGeo, headbandMat)
    headband.position.y = 1.25
    headband.rotation.x = Math.PI / 2
    group.add(headband)

    // Headband tail
    const tailGeo = new THREE.BoxGeometry(0.08, 0.3, 0.02)
    const tail = new THREE.Mesh(tailGeo, headbandMat)
    tail.position.set(-0.35, 1.1, 0)
    tail.rotation.z = 0.3
    group.add(tail)

    // Eyes - determined look
    const eyeGeo = new THREE.SphereGeometry(0.06, 8, 8)
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111 })

    const leftEye = new THREE.Mesh(eyeGeo, eyeMat)
    leftEye.position.set(-0.12, 1.22, 0.28)
    leftEye.name = 'leftEye'
    group.add(leftEye)

    const rightEye = new THREE.Mesh(eyeGeo, eyeMat)
    rightEye.position.set(0.12, 1.22, 0.28)
    rightEye.name = 'rightEye'
    group.add(rightEye)

    // Eyebrows - serious/determined
    const browGeo = new THREE.BoxGeometry(0.12, 0.03, 0.02)
    const browMat = new THREE.MeshStandardMaterial({ color: 0x111111 })

    const leftBrow = new THREE.Mesh(browGeo, browMat)
    leftBrow.position.set(-0.12, 1.32, 0.3)
    leftBrow.rotation.z = 0.2
    group.add(leftBrow)

    const rightBrow = new THREE.Mesh(browGeo, browMat)
    rightBrow.position.set(0.12, 1.32, 0.3)
    rightBrow.rotation.z = -0.2
    group.add(rightBrow)

    // Visor placeholder for animation compatibility
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01))
    visor.visible = false
    visor.name = 'visor'
    group.add(visor)

    return group
  }

  private createBody(): THREE.Group {
    const group = new THREE.Group()

    // Torso (dark kimono/robe)
    const torsoGeo = new THREE.CylinderGeometry(0.22, 0.28, 0.5, 8)
    const torsoMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.9,
    })
    const torso = new THREE.Mesh(torsoGeo, torsoMat)
    torso.position.y = 0.6
    group.add(torso)

    // Belt/obi
    const beltGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.08, 8)
    const beltMat = new THREE.MeshStandardMaterial({
      color: 0x333355,
      roughness: 0.6,
    })
    const belt = new THREE.Mesh(beltGeo, beltMat)
    belt.position.y = 0.45
    group.add(belt)

    // Katana on back
    const katanaGroup = new THREE.Group()

    // Scabbard
    const scabbardGeo = new THREE.CylinderGeometry(0.03, 0.025, 0.7, 6)
    const scabbardMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.4,
    })
    const scabbard = new THREE.Mesh(scabbardGeo, scabbardMat)
    katanaGroup.add(scabbard)

    // Handle wrap
    const handleGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.18, 6)
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0x8b4513,
      roughness: 0.8,
    })
    const handle = new THREE.Mesh(handleGeo, handleMat)
    handle.position.y = 0.4
    katanaGroup.add(handle)

    // Guard (tsuba)
    const guardGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.015, 8)
    const guardMat = new THREE.MeshStandardMaterial({
      color: 0xc9a227,
      metalness: 0.7,
      roughness: 0.3,
    })
    const guard = new THREE.Mesh(guardGeo, guardMat)
    guard.position.y = 0.3
    katanaGroup.add(guard)

    katanaGroup.position.set(0, 0.75, -0.2)
    katanaGroup.rotation.x = 0.4
    katanaGroup.rotation.z = 0.2
    group.add(katanaGroup)

    // Legs
    const legGeo = new THREE.CylinderGeometry(0.08, 0.06, 0.35, 6)
    const legMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.9,
    })

    const leftLeg = new THREE.Mesh(legGeo, legMat)
    leftLeg.position.set(-0.12, 0.18, 0)
    group.add(leftLeg)

    const rightLeg = new THREE.Mesh(legGeo, legMat)
    rightLeg.position.set(0.12, 0.18, 0)
    group.add(rightLeg)

    return group
  }

  private createArm(isLeft: boolean): THREE.Group {
    const group = new THREE.Group()
    const x = isLeft ? -0.32 : 0.32

    // Arm
    const armGeo = new THREE.CylinderGeometry(0.06, 0.05, 0.35, 6)
    const armMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.9,
    })
    const arm = new THREE.Mesh(armGeo, armMat)
    arm.position.y = -0.1
    group.add(arm)

    // Hand (skin color)
    const handGeo = new THREE.SphereGeometry(0.06, 8, 8)
    const handMat = new THREE.MeshStandardMaterial({
      color: 0xc4956a,
      roughness: 0.8,
    })
    const hand = new THREE.Mesh(handGeo, handMat)
    hand.position.y = -0.3
    group.add(hand)

    group.position.set(x, 0.7, 0)
    return group
  }

  private createStatusRing(): THREE.Mesh {
    const geometry = new THREE.RingGeometry(0.5, 0.55, 32)
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
    const parts = this.getCharacterParts()

    if (this.state === 'walking' && this.targetPosition) {
      const direction = new THREE.Vector3()
        .subVectors(this.targetPosition, this.mesh.position)
        .normalize()
      const distance = this.mesh.position.distanceTo(this.targetPosition)

      if (distance > 0.1) {
        this.mesh.position.add(direction.multiplyScalar(this.moveSpeed * delta))
        // Walking animation
        this.head.position.y = Math.sin(this.bobTime * 12) * 0.03
        this.leftArm.rotation.x = Math.sin(this.bobTime * 12) * 0.4
        this.rightArm.rotation.x = -Math.sin(this.bobTime * 12) * 0.4
        // Face movement direction
        const angle = Math.atan2(direction.x, direction.z)
        this.mesh.rotation.y = angle
      } else {
        this.mesh.position.copy(this.targetPosition)
        this.targetPosition = null
        this.setState('idle')
        this.head.position.y = 0
        this.leftArm.rotation.x = 0
        this.rightArm.rotation.x = 0
      }
    } else if (this.state === 'idle') {
      // Subtle breathing
      const breathe = Math.sin(this.bobTime * 2) * 0.015
      this.body.position.y = breathe
      this.head.position.y = breathe * 0.5

      // Update idle behaviors
      this.idleBehaviorManager.update(parts, delta)
    } else if (this.state === 'working') {
      this.workTime += delta
      // Update working behaviors
      this.workingBehaviorManager.update(parts, delta)
    } else if (this.state === 'thinking') {
      this.thinkTime += delta
      // Head tilted, contemplating
      this.head.rotation.z = Math.sin(this.thinkTime * 0.5) * 0.1
      this.head.rotation.x = -0.15
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
    this.idleBehaviorManager.forcePlayRandom(this.getCharacterParts())
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
