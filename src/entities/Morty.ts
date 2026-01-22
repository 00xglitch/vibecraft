/**
 * Morty - Morty Smith from Rick and Morty
 *
 * Design: The nervous sidekick
 * - Brown curly hair
 * - Big worried eyes
 * - Round face
 * - Yellow t-shirt
 * - Blue pants
 * - Smaller, nervous build
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

export type MortyOptions = CharacterOptions

const DEFAULT_OPTIONS: Required<MortyOptions> = {
  scale: 0.85,
  color: 0xfde047,
  statusColor: 0x4ade80,
  startStation: 'center',
}

export class Morty implements ICharacter {
  public readonly mesh: THREE.Group
  public state: CharacterState = 'idle'
  public currentStation: StationType = 'center'
  public readonly id: string

  private scene: WorkshopScene
  private options: Required<MortyOptions>
  private targetPosition: THREE.Vector3 | null = null
  private moveSpeed = 2.5
  private animTime = 0
  private workTime = 0
  private nervousTime = 0
  private updateCallback: ((delta: number) => void) | null = null

  // Body parts for animation
  private head: THREE.Group
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

  constructor(scene: WorkshopScene, options: MortyOptions = {}) {
    this.scene = scene
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.id = Math.random().toString(36).substring(2, 9)
    this.mesh = new THREE.Group()

    // Create all parts
    this.head = this.createHead()
    this.leftEye = this.head.getObjectByName('leftEye') as THREE.Mesh
    this.rightEye = this.head.getObjectByName('rightEye') as THREE.Mesh

    this.body = this.createBody()
    this.leftArm = this.body.getObjectByName('leftArm') as THREE.Group
    this.rightArm = this.body.getObjectByName('rightArm') as THREE.Group

    this.antenna = new THREE.Group()
    this.statusRing = this.createStatusRing()

    this.mesh.add(this.head)
    this.mesh.add(this.body)
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

    // Round head
    const headGeometry = new THREE.SphereGeometry(0.22, 16, 16)
    const skinMaterial = new THREE.MeshStandardMaterial({
      color: 0xffe4c4,
      roughness: 0.8,
    })
    const head = new THREE.Mesh(headGeometry, skinMaterial)
    head.castShadow = true
    group.add(head)

    // Brown curly hair
    const hairMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b4513,
      roughness: 0.9,
    })

    // Hair made of overlapping spheres
    const hairPositions = [
      { x: 0, y: 0.18, z: -0.05 },
      { x: 0.08, y: 0.16, z: -0.03 },
      { x: -0.08, y: 0.16, z: -0.03 },
      { x: 0.12, y: 0.12, z: 0 },
      { x: -0.12, y: 0.12, z: 0 },
      { x: 0.05, y: 0.2, z: 0.02 },
      { x: -0.05, y: 0.2, z: 0.02 },
    ]

    hairPositions.forEach((pos) => {
      const hairGeometry = new THREE.SphereGeometry(0.06, 8, 8)
      const hairBall = new THREE.Mesh(hairGeometry, hairMaterial)
      hairBall.position.set(pos.x, pos.y, pos.z)
      group.add(hairBall)
    })

    // Big worried eyes
    const eyeGeometry = new THREE.SphereGeometry(0.05, 12, 12)
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff })
    const pupilMaterial = new THREE.MeshBasicMaterial({ color: 0x222222 })

    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial)
    leftEye.position.set(-0.07, 0.03, 0.18)
    leftEye.name = 'leftEye'
    group.add(leftEye)

    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial)
    rightEye.position.set(0.07, 0.03, 0.18)
    rightEye.name = 'rightEye'
    group.add(rightEye)

    // Pupils (smaller, scared look)
    const leftPupil = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 8, 8),
      pupilMaterial
    )
    leftPupil.position.set(-0.07, 0.03, 0.22)
    group.add(leftPupil)

    const rightPupil = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 8, 8),
      pupilMaterial
    )
    rightPupil.position.set(0.07, 0.03, 0.22)
    group.add(rightPupil)

    // Worried eyebrows (angled up in middle)
    const browGeometry = new THREE.BoxGeometry(0.04, 0.01, 0.01)
    const browMaterial = new THREE.MeshBasicMaterial({ color: 0x8b4513 })

    const leftBrow = new THREE.Mesh(browGeometry, browMaterial)
    leftBrow.position.set(-0.07, 0.09, 0.19)
    leftBrow.rotation.z = 0.3
    group.add(leftBrow)

    const rightBrow = new THREE.Mesh(browGeometry, browMaterial)
    rightBrow.position.set(0.07, 0.09, 0.19)
    rightBrow.rotation.z = -0.3
    group.add(rightBrow)

    // Small nose
    const noseGeometry = new THREE.SphereGeometry(0.025, 8, 8)
    const nose = new THREE.Mesh(noseGeometry, skinMaterial)
    nose.position.set(0, -0.02, 0.2)
    group.add(nose)

    // Nervous mouth (wavy line)
    const mouthCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-0.04, -0.08, 0.19),
      new THREE.Vector3(0, -0.1, 0.2),
      new THREE.Vector3(0.04, -0.08, 0.19)
    )
    const mouthTube = new THREE.TubeGeometry(mouthCurve, 8, 0.006, 8, false)
    const mouth = new THREE.Mesh(mouthTube, new THREE.MeshBasicMaterial({ color: 0x333333 }))
    group.add(mouth)

    // Ears
    const earGeometry = new THREE.SphereGeometry(0.04, 8, 8)
    earGeometry.scale(0.6, 1, 0.5)

    const leftEar = new THREE.Mesh(earGeometry, skinMaterial)
    leftEar.position.set(-0.2, 0, 0)
    group.add(leftEar)

    const rightEar = new THREE.Mesh(earGeometry, skinMaterial)
    rightEar.position.set(0.2, 0, 0)
    group.add(rightEar)

    group.position.y = 0.5
    return group
  }

  private createBody(): THREE.Group {
    const group = new THREE.Group()

    // Yellow t-shirt body
    const bodyGeometry = new THREE.CylinderGeometry(0.14, 0.16, 0.35, 8)
    const shirtMaterial = new THREE.MeshStandardMaterial({
      color: this.options.color,
      roughness: 0.6,
    })
    const body = new THREE.Mesh(bodyGeometry, shirtMaterial)
    body.position.y = 0.18
    body.castShadow = true
    group.add(body)

    // Blue pants
    const pantsGeometry = new THREE.CylinderGeometry(0.14, 0.1, 0.1, 8)
    const pantsMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      roughness: 0.7,
    })
    const pants = new THREE.Mesh(pantsGeometry, pantsMaterial)
    pants.position.y = 0.02
    group.add(pants)

    // Arms (in yellow sleeves)
    const armGeometry = new THREE.CylinderGeometry(0.04, 0.035, 0.2, 8)

    const leftArmGroup = new THREE.Group()
    const leftArm = new THREE.Mesh(armGeometry, shirtMaterial)
    leftArm.rotation.z = 0.4
    leftArmGroup.add(leftArm)
    leftArmGroup.position.set(-0.18, 0.22, 0)
    leftArmGroup.name = 'leftArm'
    group.add(leftArmGroup)

    const rightArmGroup = new THREE.Group()
    const rightArm = new THREE.Mesh(armGeometry, shirtMaterial)
    rightArm.rotation.z = -0.4
    rightArmGroup.add(rightArm)
    rightArmGroup.position.set(0.18, 0.22, 0)
    rightArmGroup.name = 'rightArm'
    group.add(rightArmGroup)

    return group
  }

  private createStatusRing(): THREE.Mesh {
    const geometry = new THREE.RingGeometry(0.25, 0.3, 32)
    const material = new THREE.MeshBasicMaterial({
      color: this.options.statusColor,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    })
    const ring = new THREE.Mesh(geometry, material)
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.01
    return ring
  }

  private getCharacterParts(): CharacterParts {
    return {
      head: this.head,
      leftEye: this.leftEye,
      rightEye: this.rightEye,
      leftArm: this.leftArm,
      rightArm: this.rightArm,
      antenna: this.antenna,
      body: this.body,
      mesh: this.mesh,
    }
  }

  private update(delta: number): void {
    this.animTime += delta
    this.nervousTime += delta

    // Movement
    if (this.targetPosition) {
      const direction = new THREE.Vector3()
        .subVectors(this.targetPosition, this.mesh.position)
      const distance = direction.length()

      if (distance > 0.1) {
        direction.normalize()
        const moveAmount = Math.min(this.moveSpeed * delta, distance)
        this.mesh.position.add(direction.multiplyScalar(moveAmount))

        const angle = Math.atan2(direction.x, direction.z)
        this.mesh.rotation.y = angle

        // Hurried, nervous walk
        const walkCycle = this.animTime * 6
        this.head.rotation.x = Math.sin(walkCycle) * 0.1
        this.body.rotation.z = Math.sin(walkCycle) * 0.05
      } else {
        this.mesh.position.copy(this.targetPosition)
        this.targetPosition = null
        if (this.state === 'walking') {
          this.setState('idle')
        }
      }
    }

    const parts = this.getCharacterParts()

    if (this.state === 'working') {
      this.workTime += delta
      this.workingBehaviorManager.update(parts, delta)

      // Panicked working animation
      const panic = Math.sin(this.workTime * 10) * 0.05
      this.head.rotation.y = panic
      this.leftArm.rotation.z = 0.6 + Math.sin(this.workTime * 8) * 0.2
      this.rightArm.rotation.z = -0.6 - Math.sin(this.workTime * 8) * 0.2
    } else if (this.state === 'idle') {
      this.idleBehaviorManager.update(parts, delta)

      // Nervous fidgeting
      const fidget = Math.sin(this.nervousTime * 3) * 0.02
      this.head.rotation.y = fidget
      this.head.position.y = 0.5 + Math.sin(this.nervousTime * 2) * 0.01

      // Eye darting
      const eyeDart = Math.sin(this.nervousTime * 5) * 0.01
      this.leftEye.position.x = -0.07 + eyeDart
      this.rightEye.position.x = 0.07 + eyeDart
    } else if (this.state === 'thinking') {
      // Confused thinking pose
      this.head.rotation.z = Math.sin(this.animTime * 2) * 0.1
      this.rightArm.rotation.z = -0.8
    }
  }

  public moveTo(station: StationType): void {
    const stationObj = this.scene.stations.get(station)
    if (stationObj) {
      this.moveToPosition(stationObj.position.clone(), station)
    }
  }

  public moveToPosition(position: THREE.Vector3, station: StationType): void {
    this.targetPosition = position
    this.currentStation = station
    this.setState('walking')
  }

  public setState(newState: CharacterState): void {
    if (this.state === newState) return

    const parts = this.getCharacterParts()

    if (this.state === 'working') {
      this.workingBehaviorManager.stop(parts)
    }
    if (this.state === 'thinking') {
      this.head.rotation.z = 0
      this.rightArm.rotation.z = 0
    }

    this.state = newState

    const ringMaterial = this.statusRing.material as THREE.MeshBasicMaterial
    switch (newState) {
      case 'idle':
        ringMaterial.color.setHex(0x4ade80)
        break
      case 'walking':
        ringMaterial.color.setHex(0xfbbf24)
        break
      case 'working':
        ringMaterial.color.setHex(0x60a5fa)
        this.workTime = 0
        this.workingBehaviorManager.start(this.currentStation, parts)
        break
      case 'thinking':
        ringMaterial.color.setHex(0xa855f7)
        break
    }
  }

  public dispose(): void {
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
