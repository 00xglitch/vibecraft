/**
 * Rick - Rick Sanchez from Rick and Morty
 *
 * Design: Genius scientist with iconic features
 * - Spiky blue-gray hair (6 spikes)
 * - Unibrow, droopy tired eyes
 * - Drool, long face
 * - White lab coat body
 * - Flask accessory when working
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

export type RickOptions = CharacterOptions

const DEFAULT_OPTIONS: Required<RickOptions> = {
  scale: 1.1,
  color: 0x9ecfff,
  statusColor: 0x4ade80,
  startStation: 'center',
}

export class Rick implements ICharacter {
  public readonly mesh: THREE.Group
  public state: CharacterState = 'idle'
  public currentStation: StationType = 'center'
  public readonly id: string

  private scene: WorkshopScene
  private options: Required<RickOptions>
  private targetPosition: THREE.Vector3 | null = null
  private moveSpeed = 2.5
  private animTime = 0
  private workTime = 0
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
  private drool: THREE.Mesh
  private flask: THREE.Group

  // Behavior systems
  private idleBehaviorManager: IdleBehaviorManager
  private workingBehaviorManager: WorkingBehaviorManager

  constructor(scene: WorkshopScene, options: RickOptions = {}) {
    this.scene = scene
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.id = Math.random().toString(36).substring(2, 9)
    this.mesh = new THREE.Group()

    // Create all parts
    this.head = this.createHead()
    this.leftEye = this.head.getObjectByName('leftEye') as THREE.Mesh
    this.rightEye = this.head.getObjectByName('rightEye') as THREE.Mesh
    this.drool = this.head.getObjectByName('drool') as THREE.Mesh

    this.body = this.createBody()
    this.leftArm = this.body.getObjectByName('leftArm') as THREE.Group
    this.rightArm = this.body.getObjectByName('rightArm') as THREE.Group

    this.antenna = new THREE.Group()
    this.flask = this.createFlask()
    this.flask.visible = false

    this.statusRing = this.createStatusRing()

    this.mesh.add(this.head)
    this.mesh.add(this.body)
    this.mesh.add(this.flask)
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

    // Head - slightly gaunt
    const headGeometry = new THREE.SphereGeometry(0.2, 16, 16)
    headGeometry.scale(1, 1.15, 0.95)
    const skinMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4c4a8,
      roughness: 0.8,
    })
    const head = new THREE.Mesh(headGeometry, skinMaterial)
    head.castShadow = true
    group.add(head)

    // Spiky blue hair
    const hairMaterial = new THREE.MeshStandardMaterial({
      color: this.options.color,
      roughness: 0.6,
    })

    const spikeAngles = [0, 45, 90, 135, 180, 225]
    spikeAngles.forEach((angle, i) => {
      const spikeGeometry = new THREE.ConeGeometry(0.06, 0.22, 6)
      const spike = new THREE.Mesh(spikeGeometry, hairMaterial)
      const rad = (angle * Math.PI) / 180
      spike.position.set(
        Math.sin(rad) * 0.12,
        0.18 + (i % 2) * 0.04,
        -Math.cos(rad) * 0.08
      )
      spike.rotation.x = -0.3 + (Math.random() - 0.5) * 0.2
      spike.rotation.z = (Math.random() - 0.5) * 0.3
      group.add(spike)
    })

    // Unibrow
    const browGeometry = new THREE.BoxGeometry(0.18, 0.025, 0.02)
    const browMaterial = new THREE.MeshStandardMaterial({ color: this.options.color })
    const unibrow = new THREE.Mesh(browGeometry, browMaterial)
    unibrow.position.set(0, 0.08, 0.18)
    group.add(unibrow)

    // Droopy eyes with dummy meshes for animation compatibility
    const leftEye = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    )
    leftEye.scale.y = 0.7
    leftEye.position.set(-0.06, 0.04, 0.17)
    leftEye.name = 'leftEye'
    group.add(leftEye)

    const rightEye = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    )
    rightEye.scale.y = 0.7
    rightEye.position.set(0.06, 0.04, 0.17)
    rightEye.name = 'rightEye'
    group.add(rightEye)

    // Pupils
    const pupilMaterial = new THREE.MeshBasicMaterial({ color: 0x222222 })
    const leftPupil = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 8), pupilMaterial)
    leftPupil.position.set(-0.06, 0.04, 0.2)
    group.add(leftPupil)

    const rightPupil = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 8), pupilMaterial)
    rightPupil.position.set(0.06, 0.04, 0.2)
    group.add(rightPupil)

    // Droopy eyelids
    const lidGeometry = new THREE.BoxGeometry(0.05, 0.02, 0.02)
    const lidMaterial = new THREE.MeshStandardMaterial({ color: 0xd4c4a8 })
    const leftLid = new THREE.Mesh(lidGeometry, lidMaterial)
    leftLid.position.set(-0.06, 0.065, 0.18)
    group.add(leftLid)

    const rightLid = new THREE.Mesh(lidGeometry, lidMaterial)
    rightLid.position.set(0.06, 0.065, 0.18)
    group.add(rightLid)

    // Nose
    const noseGeometry = new THREE.SphereGeometry(0.03, 8, 8)
    noseGeometry.scale(0.8, 1.2, 1)
    const nose = new THREE.Mesh(noseGeometry, skinMaterial)
    nose.position.set(0, -0.01, 0.18)
    group.add(nose)

    // Drool
    const droolGeometry = new THREE.CylinderGeometry(0.008, 0.003, 0.08, 8)
    const droolMaterial = new THREE.MeshBasicMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0.7,
    })
    const drool = new THREE.Mesh(droolGeometry, droolMaterial)
    drool.position.set(0.04, -0.15, 0.15)
    drool.name = 'drool'
    group.add(drool)

    // Mouth
    const mouthCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-0.05, -0.08, 0.18),
      new THREE.Vector3(0, -0.06, 0.19),
      new THREE.Vector3(0.05, -0.08, 0.18)
    )
    const mouthTube = new THREE.TubeGeometry(mouthCurve, 8, 0.008, 8, false)
    const mouth = new THREE.Mesh(mouthTube, new THREE.MeshBasicMaterial({ color: 0x333333 }))
    group.add(mouth)

    group.position.y = 0.55
    return group
  }

  private createBody(): THREE.Group {
    const group = new THREE.Group()

    // Lab coat body
    const bodyGeometry = new THREE.CylinderGeometry(0.12, 0.18, 0.4, 8)
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0xf0f8ff,
      roughness: 0.5,
    })
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
    body.position.y = 0.2
    body.castShadow = true
    group.add(body)

    // Collar
    const collarGeometry = new THREE.TorusGeometry(0.13, 0.02, 8, 16, Math.PI)
    const collar = new THREE.Mesh(collarGeometry, bodyMaterial)
    collar.position.set(0, 0.38, 0.02)
    collar.rotation.x = Math.PI / 2
    group.add(collar)

    // Brown pants
    const pantsGeometry = new THREE.CylinderGeometry(0.15, 0.1, 0.08, 8)
    const pantsMaterial = new THREE.MeshStandardMaterial({
      color: 0x654321,
      roughness: 0.8,
    })
    const pants = new THREE.Mesh(pantsGeometry, pantsMaterial)
    pants.position.y = 0.02
    group.add(pants)

    // Arms
    const armGeometry = new THREE.CylinderGeometry(0.04, 0.035, 0.25, 8)

    const leftArmGroup = new THREE.Group()
    const leftArm = new THREE.Mesh(armGeometry, bodyMaterial)
    leftArm.rotation.z = 0.3
    leftArmGroup.add(leftArm)
    leftArmGroup.position.set(-0.18, 0.25, 0)
    leftArmGroup.name = 'leftArm'
    group.add(leftArmGroup)

    const rightArmGroup = new THREE.Group()
    const rightArm = new THREE.Mesh(armGeometry, bodyMaterial)
    rightArm.rotation.z = -0.3
    rightArmGroup.add(rightArm)
    rightArmGroup.position.set(0.18, 0.25, 0)
    rightArmGroup.name = 'rightArm'
    group.add(rightArmGroup)

    return group
  }

  private createFlask(): THREE.Group {
    const group = new THREE.Group()

    const flaskGeometry = new THREE.SphereGeometry(0.06, 12, 12)
    flaskGeometry.scale(1, 1.3, 0.8)
    const flaskMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.8,
      emissive: 0x00ff88,
      emissiveIntensity: 0.3,
    })
    const flask = new THREE.Mesh(flaskGeometry, flaskMaterial)
    group.add(flask)

    const neckGeometry = new THREE.CylinderGeometry(0.015, 0.02, 0.04, 8)
    const glassMaterial = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      transparent: true,
      opacity: 0.5,
    })
    const neck = new THREE.Mesh(neckGeometry, glassMaterial)
    neck.position.y = 0.1
    group.add(neck)

    group.position.set(0.25, 0.35, 0.1)
    return group
  }

  private createStatusRing(): THREE.Mesh {
    const geometry = new THREE.RingGeometry(0.3, 0.35, 32)
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

        // Slouchy walk
        const walkCycle = this.animTime * 4
        this.head.rotation.z = Math.sin(walkCycle) * 0.05
        this.body.rotation.z = Math.sin(walkCycle) * 0.03
      } else {
        this.mesh.position.copy(this.targetPosition)
        this.targetPosition = null
        if (this.state === 'walking') {
          this.setState('idle')
        }
      }
    }

    // Drool animation
    const droolScale = 0.8 + Math.sin(this.animTime * 2) * 0.2
    this.drool.scale.y = droolScale

    const parts = this.getCharacterParts()

    if (this.state === 'working') {
      this.workTime += delta
      this.workingBehaviorManager.update(parts, delta)
      this.flask.rotation.z = Math.sin(this.workTime * 8) * 0.3
      this.flask.position.y = 0.35 + Math.sin(this.workTime * 4) * 0.02
    } else if (this.state === 'idle') {
      this.idleBehaviorManager.update(parts, delta)
      // Occasional burp
      if (Math.sin(this.animTime * 0.3) > 0.95) {
        this.head.rotation.x = -0.2
      } else {
        this.head.rotation.x = 0
      }
    } else if (this.state === 'thinking') {
      this.head.rotation.x = 0.1
      this.rightArm.rotation.z = -1.2
      this.rightArm.rotation.x = 0.3
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
      this.flask.visible = false
    }
    if (this.state === 'thinking') {
      this.rightArm.rotation.z = 0
      this.rightArm.rotation.x = 0
      this.head.rotation.x = 0
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
        this.flask.visible = true
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
