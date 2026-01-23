/**
 * Ninja - Stealthy warrior character
 *
 * Design: Classic ninja with modern flair
 * - Dark outfit with mask
 * - Glowing eyes visible through mask
 * - Katana on back
 * - Agile and quick movements
 */

import * as THREE from 'three'
import type { StationType } from '../../shared/types'
import type { WorkshopScene } from '../scene/WorkshopScene'
import type { ICharacter, CharacterOptions, CharacterState } from './ICharacter'
import { IdleBehaviorManager, WorkingBehaviorManager, type CharacterParts } from './animations'

export type NinjaOptions = CharacterOptions

const DEFAULT_OPTIONS: Required<NinjaOptions> = {
  scale: 0.95,
  color: 0x1a1a2e, // Dark ninja outfit
  statusColor: 0x4ade80,
  startStation: 'center',
}

export class Ninja implements ICharacter {
  public readonly mesh: THREE.Group
  public state: CharacterState = 'idle'
  public currentStation: StationType = 'center'
  public readonly id: string

  private scene: WorkshopScene
  private options: Required<NinjaOptions>
  private targetPosition: THREE.Vector3 | null = null
  private moveSpeed = 4.5 // Ninjas are fast!
  private bobTime = 0
  private workTime = 0
  private thinkTime = 0
  private breatheTime = 0
  private updateCallback: ((delta: number) => void) | null = null

  // Body parts
  private head: THREE.Group
  private visor: THREE.Mesh
  private leftEye: THREE.Mesh
  private rightEye: THREE.Mesh
  private body: THREE.Group
  private leftArm: THREE.Group
  private rightArm: THREE.Group
  private antenna: THREE.Group
  private statusRing: THREE.Mesh
  private scarf: THREE.Group
  private katana: THREE.Group

  // Base positions for animation reset
  private headBaseY = 0
  private bodyBaseY = 0
  private leftArmBaseY = 0
  private leftArmBaseX = 0
  private rightArmBaseY = 0
  private rightArmBaseX = 0

  // Behavior systems
  private idleBehaviorManager: IdleBehaviorManager
  private workingBehaviorManager: WorkingBehaviorManager

  constructor(scene: WorkshopScene, options: NinjaOptions = {}) {
    this.scene = scene
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.id = Math.random().toString(36).substring(2, 9)
    this.mesh = new THREE.Group()

    this.head = this.createHead()
    this.visor = this.head.getObjectByName('visor') as THREE.Mesh
    this.leftEye = this.head.getObjectByName('leftEye') as THREE.Mesh
    this.rightEye = this.head.getObjectByName('rightEye') as THREE.Mesh

    this.body = this.createBody()
    this.leftArm = this.createArm(true)
    this.rightArm = this.createArm(false)
    this.antenna = new THREE.Group()
    this.scarf = this.createScarf()
    this.katana = this.createKatana()

    this.statusRing = this.createStatusRing()

    this.mesh.add(this.head)
    this.mesh.add(this.body)
    this.mesh.add(this.leftArm)
    this.mesh.add(this.rightArm)
    this.mesh.add(this.scarf)
    this.mesh.add(this.katana)
    this.mesh.add(this.statusRing)

    // Store base positions for animation reset
    this.headBaseY = this.head.position.y
    this.bodyBaseY = this.body.position.y
    this.leftArmBaseY = this.leftArm.position.y
    this.leftArmBaseX = this.leftArm.position.x
    this.rightArmBaseY = this.rightArm.position.y
    this.rightArmBaseX = this.rightArm.position.x

    this.idleBehaviorManager = new IdleBehaviorManager()
    this.workingBehaviorManager = new WorkingBehaviorManager()

    this.mesh.scale.setScalar(this.options.scale)

    this.currentStation = this.options.startStation
    const startStation = scene.stations.get(this.options.startStation)
    if (startStation) {
      this.mesh.position.copy(startStation.position)
    }

    scene.scene.add(this.mesh)

    this.updateCallback = (delta: number) => this.update(delta)
    scene.onRender(this.updateCallback)
  }

  private createHead(): THREE.Group {
    const group = new THREE.Group()

    // Head shape
    const headGeo = new THREE.SphereGeometry(0.25, 16, 16)
    headGeo.scale(1, 1.05, 0.95)
    const headMat = new THREE.MeshStandardMaterial({
      color: this.options.color,
      roughness: 0.8,
    })
    const head = new THREE.Mesh(headGeo, headMat)
    head.position.y = 1.15
    group.add(head)

    // Mask wrappings (lighter bands)
    const bandMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a4e,
      roughness: 0.7,
    })

    const bandGeo = new THREE.TorusGeometry(0.26, 0.02, 8, 24)
    const band1 = new THREE.Mesh(bandGeo, bandMat)
    band1.position.y = 1.2
    band1.rotation.x = Math.PI / 2
    group.add(band1)

    const band2 = new THREE.Mesh(bandGeo, bandMat)
    band2.position.y = 1.1
    band2.rotation.x = Math.PI / 2
    group.add(band2)

    // Nose (subtle, under mask)
    const skinColor = this.options.color === 0x1a1a2e ? 0xdeb887 : this.options.color
    const noseGeo = new THREE.ConeGeometry(0.03, 0.06, 6)
    const noseMat = new THREE.MeshStandardMaterial({
      color: skinColor,
      roughness: 0.9,
    })
    const nose = new THREE.Mesh(noseGeo, noseMat)
    nose.rotation.x = Math.PI / 2
    nose.position.set(0, 1.1, 0.22)
    group.add(nose)

    // Cheekbones (subtle facial definition)
    const cheekGeo = new THREE.SphereGeometry(0.08, 8, 8)
    const cheekMat = new THREE.MeshStandardMaterial({
      color: skinColor,
      transparent: true,
      opacity: 0.7,
      roughness: 0.9,
    })
    const leftCheek = new THREE.Mesh(cheekGeo, cheekMat)
    leftCheek.scale.set(0.6, 0.8, 0.5)
    leftCheek.position.set(-0.12, 1.08, 0.15)
    group.add(leftCheek)

    const rightCheek = new THREE.Mesh(cheekGeo, cheekMat.clone())
    rightCheek.scale.set(0.6, 0.8, 0.5)
    rightCheek.position.set(0.12, 1.08, 0.15)
    group.add(rightCheek)

    // Glowing eyes (the only visible part) - proper spherical shape
    const eyeGeo = new THREE.SphereGeometry(0.04, 12, 12)
    const eyeMat = new THREE.MeshBasicMaterial({
      color: 0xff4444, // Red glowing eyes
    })

    const leftEye = new THREE.Mesh(eyeGeo, eyeMat)
    leftEye.position.set(-0.08, 1.17, 0.2)
    // No scale distortion - proper sphere for realistic look
    leftEye.name = 'leftEye'
    group.add(leftEye)

    const rightEye = new THREE.Mesh(eyeGeo, eyeMat)
    rightEye.position.set(0.08, 1.17, 0.2)
    // No scale distortion - proper sphere for realistic look
    rightEye.name = 'rightEye'
    group.add(rightEye)

    // Eye glow effect
    const glowGeo = new THREE.SphereGeometry(0.06, 8, 8)
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xff4444,
      transparent: true,
      opacity: 0.3,
    })

    const leftGlow = new THREE.Mesh(glowGeo, glowMat)
    leftGlow.position.set(-0.08, 1.17, 0.18)
    group.add(leftGlow)

    const rightGlow = new THREE.Mesh(glowGeo, glowMat)
    rightGlow.position.set(0.08, 1.17, 0.18)
    group.add(rightGlow)

    // Forehead protector (metal plate)
    const plateGeo = new THREE.BoxGeometry(0.2, 0.08, 0.04)
    const plateMat = new THREE.MeshStandardMaterial({
      color: 0x4a4a6a,
      metalness: 0.7,
      roughness: 0.3,
    })
    const plate = new THREE.Mesh(plateGeo, plateMat)
    plate.position.set(0, 1.28, 0.22)
    group.add(plate)

    // Symbol on plate (simple engraving)
    const symbolGeo = new THREE.PlaneGeometry(0.08, 0.04)
    const symbolMat = new THREE.MeshBasicMaterial({
      color: 0x222244,
    })
    const symbol = new THREE.Mesh(symbolGeo, symbolMat)
    symbol.position.set(0, 1.28, 0.24)
    group.add(symbol)

    // Visor placeholder
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01))
    visor.visible = false
    visor.name = 'visor'
    group.add(visor)

    return group
  }

  private createBody(): THREE.Group {
    const group = new THREE.Group()

    // Ninja gi (outfit) - torso
    const torsoGeo = new THREE.CylinderGeometry(0.18, 0.2, 0.45, 8)
    const torsoMat = new THREE.MeshStandardMaterial({
      color: this.options.color,
      roughness: 0.8,
    })
    const torso = new THREE.Mesh(torsoGeo, torsoMat)
    torso.position.y = 0.6
    group.add(torso)

    // Belt/obi
    const beltGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.06, 8)
    const beltMat = new THREE.MeshStandardMaterial({
      color: 0x8b0000, // Dark red belt
      roughness: 0.6,
    })
    const belt = new THREE.Mesh(beltGeo, beltMat)
    belt.position.y = 0.42
    group.add(belt)

    // Legs
    const legGeo = new THREE.CylinderGeometry(0.06, 0.055, 0.35, 6)
    const legMat = new THREE.MeshStandardMaterial({
      color: this.options.color,
      roughness: 0.8,
    })

    const leftLeg = new THREE.Mesh(legGeo, legMat)
    leftLeg.position.set(-0.08, 0.18, 0)
    group.add(leftLeg)

    const rightLeg = new THREE.Mesh(legGeo, legMat)
    rightLeg.position.set(0.08, 0.18, 0)
    group.add(rightLeg)

    // Tabi boots (split-toe ninja boots)
    const bootGeo = new THREE.BoxGeometry(0.07, 0.05, 0.1)
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x111111 })

    const leftBoot = new THREE.Mesh(bootGeo, bootMat)
    leftBoot.position.set(-0.08, -0.02, 0.02)
    group.add(leftBoot)

    const rightBoot = new THREE.Mesh(bootGeo, bootMat)
    rightBoot.position.set(0.08, -0.02, 0.02)
    group.add(rightBoot)

    // Utility pouch on belt
    const pouchGeo = new THREE.BoxGeometry(0.08, 0.06, 0.05)
    const pouchMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      roughness: 0.8,
    })
    const pouch = new THREE.Mesh(pouchGeo, pouchMat)
    pouch.position.set(-0.15, 0.42, 0.12)
    pouch.rotation.y = -0.3
    group.add(pouch)

    // Shuriken holder on back
    const holderGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.15, 8)
    const holderMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.6,
    })
    const holder = new THREE.Mesh(holderGeo, holderMat)
    holder.rotation.z = Math.PI / 2
    holder.position.set(0, 0.65, -0.18)
    group.add(holder)

    // Knee guards (protective armor)
    const kneeGuardGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.06, 8)
    const kneeGuardMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      metalness: 0.3,
      roughness: 0.5,
    })

    const leftKnee = new THREE.Mesh(kneeGuardGeo, kneeGuardMat)
    leftKnee.position.set(-0.08, 0.25, 0)
    group.add(leftKnee)

    const rightKnee = new THREE.Mesh(kneeGuardGeo, kneeGuardMat.clone())
    rightKnee.position.set(0.08, 0.25, 0)
    group.add(rightKnee)

    return group
  }

  private createArm(isLeft: boolean): THREE.Group {
    const group = new THREE.Group()
    const x = isLeft ? -0.25 : 0.25

    // Arm
    const armGeo = new THREE.CylinderGeometry(0.045, 0.04, 0.3, 6)
    const armMat = new THREE.MeshStandardMaterial({
      color: this.options.color,
      roughness: 0.8,
    })
    const arm = new THREE.Mesh(armGeo, armMat)
    arm.position.y = -0.1
    group.add(arm)

    // Hand wrappings
    const handGeo = new THREE.SphereGeometry(0.04, 8, 8)
    const handMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a4e,
      roughness: 0.7,
    })
    const hand = new THREE.Mesh(handGeo, handMat)
    hand.position.y = -0.28
    group.add(hand)

    group.position.set(x, 0.7, 0)
    return group
  }

  private createScarf(): THREE.Group {
    const group = new THREE.Group()

    // Flowing scarf pieces
    const scarfMat = new THREE.MeshStandardMaterial({
      color: 0x8b0000,
      roughness: 0.7,
      side: THREE.DoubleSide,
    })

    // Left scarf tail
    const leftTailGeo = new THREE.BoxGeometry(0.08, 0.4, 0.02)
    const leftTail = new THREE.Mesh(leftTailGeo, scarfMat)
    leftTail.position.set(-0.2, 0.9, -0.15)
    leftTail.rotation.z = 0.3
    leftTail.name = 'leftTail'
    group.add(leftTail)

    // Right scarf tail
    const rightTailGeo = new THREE.BoxGeometry(0.08, 0.35, 0.02)
    const rightTail = new THREE.Mesh(rightTailGeo, scarfMat)
    rightTail.position.set(0.15, 0.95, -0.15)
    rightTail.rotation.z = -0.2
    rightTail.name = 'rightTail'
    group.add(rightTail)

    return group
  }

  private createKatana(): THREE.Group {
    const group = new THREE.Group()

    // Scabbard
    const scabbardGeo = new THREE.CylinderGeometry(0.025, 0.02, 0.6, 6)
    const scabbardMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.4,
    })
    const scabbard = new THREE.Mesh(scabbardGeo, scabbardMat)
    group.add(scabbard)

    // Handle
    const handleGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.15, 6)
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0x4a2a1a,
      roughness: 0.8,
    })
    const handle = new THREE.Mesh(handleGeo, handleMat)
    handle.position.y = 0.35
    group.add(handle)

    // Guard (tsuba)
    const guardGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.01, 8)
    const guardMat = new THREE.MeshStandardMaterial({
      color: 0x888888,
      metalness: 0.8,
    })
    const guard = new THREE.Mesh(guardGeo, guardMat)
    guard.position.y = 0.27
    group.add(guard)

    group.position.set(0.1, 0.6, -0.2)
    group.rotation.set(0.5, 0, -0.3)
    return group
  }

  private createStatusRing(): THREE.Mesh {
    const geometry = new THREE.RingGeometry(0.45, 0.5, 32)
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
    this.breatheTime += delta
    const parts = this.getCharacterParts()

    // Scarf animation (always flowing)
    const leftTail = this.scarf.getObjectByName('leftTail')
    const rightTail = this.scarf.getObjectByName('rightTail')
    if (leftTail && rightTail) {
      leftTail.rotation.x = Math.sin(this.breatheTime * 2) * 0.2
      rightTail.rotation.x = Math.sin(this.breatheTime * 2 + 0.5) * 0.15
    }

    // Eye glow pulse
    if (this.leftEye && this.rightEye) {
      const pulse = 0.8 + Math.sin(this.breatheTime * 3) * 0.2
      ;(this.leftEye.material as THREE.MeshBasicMaterial).opacity = pulse
      ;(this.rightEye.material as THREE.MeshBasicMaterial).opacity = pulse
    }

    if (this.state === 'walking' && this.targetPosition) {
      const direction = new THREE.Vector3()
        .subVectors(this.targetPosition, this.mesh.position)
        .normalize()
      const distance = this.mesh.position.distanceTo(this.targetPosition)

      if (distance > 0.1) {
        this.mesh.position.add(direction.multiplyScalar(this.moveSpeed * delta))
        // Swift ninja run - low and fast
        this.head.position.y = Math.sin(this.bobTime * 16) * 0.015
        this.body.rotation.x = 0.15 // Leaning forward
        this.leftArm.rotation.x = Math.sin(this.bobTime * 16) * 0.5
        this.rightArm.rotation.x = -Math.sin(this.bobTime * 16) * 0.5
        // Scarf flies back more when running
        if (leftTail) leftTail.rotation.x = 0.6 + Math.sin(this.bobTime * 8) * 0.3
        if (rightTail) rightTail.rotation.x = 0.5 + Math.sin(this.bobTime * 8 + 0.5) * 0.25
        const angle = Math.atan2(direction.x, direction.z)
        this.mesh.rotation.y = angle
      } else {
        this.mesh.position.copy(this.targetPosition)
        this.targetPosition = null
        this.setState('idle')
      }
    } else if (this.state === 'idle') {
      // Ready stance - slight movement
      const breathe = Math.sin(this.breatheTime * 2) * 0.01
      this.body.position.y = breathe
      this.body.rotation.x = 0
      // Arms in ready position
      this.leftArm.rotation.z = 0.1
      this.rightArm.rotation.z = -0.1
      this.idleBehaviorManager.update(parts, delta)
    } else if (this.state === 'working') {
      this.workTime += delta
      // Combat/working stance - quick precise movements
      this.leftArm.rotation.x = Math.sin(this.workTime * 12) * 0.4
      this.leftArm.rotation.z = Math.sin(this.workTime * 8) * 0.2
      this.rightArm.rotation.x = -Math.sin(this.workTime * 12 + 1) * 0.4
      this.head.rotation.y = Math.sin(this.workTime * 4) * 0.15
      this.workingBehaviorManager.update(parts, delta)
    } else if (this.state === 'thinking') {
      this.thinkTime += delta
      // Meditation pose
      this.leftArm.rotation.x = -0.3
      this.leftArm.rotation.z = 0.5
      this.rightArm.rotation.x = -0.3
      this.rightArm.rotation.z = -0.5
      this.head.rotation.x = -0.1
      // Slow breathing
      const meditate = Math.sin(this.thinkTime * 1) * 0.02
      this.body.position.y = meditate
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
    } else {
      // Reset positions and rotations to base state
      this.head.position.y = this.headBaseY
      this.head.rotation.set(0, 0, 0)
      this.body.position.y = this.bodyBaseY
      this.body.rotation.set(0, 0, 0)
      this.leftArm.position.y = this.leftArmBaseY
      this.leftArm.position.x = this.leftArmBaseX
      this.leftArm.rotation.set(0, 0, 0)
      this.rightArm.position.y = this.rightArmBaseY
      this.rightArm.position.x = this.rightArmBaseX
      this.rightArm.rotation.set(0, 0, 0)
    }

    const colors = {
      idle: 0x4ade80,
      walking: 0x60a5fa,
      working: 0xfb923c,
      thinking: 0xa78bfa,
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
