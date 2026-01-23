/**
 * Flower - Cute flower-headed character for the workshop
 *
 * Design: Simple flower character with petals radiating from a round head
 * - Round cream-colored face with cute features
 * - Orange petal "hair" radiating outward
 * - No body - just a floating head
 */

import * as THREE from 'three'
import type { StationType } from '../../shared/types'
import type { WorkshopScene } from '../scene/WorkshopScene'
import type { ICharacter, CharacterOptions, CharacterState } from './ICharacter'
import { IdleBehaviorManager, WorkingBehaviorManager, type CharacterParts } from './animations'

export type FlowerOptions = CharacterOptions

const DEFAULT_OPTIONS: Required<FlowerOptions> = {
  scale: 1,
  color: 0xe89878, // Warm peachy orange for petals
  statusColor: 0x4ade80,
  startStation: 'center',
}

export class Flower implements ICharacter {
  public readonly mesh: THREE.Group
  public state: CharacterState = 'idle'
  public currentStation: StationType = 'center'
  public readonly id: string

  private scene: WorkshopScene
  private options: Required<FlowerOptions>
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
  private body: THREE.Group // Empty group for compatibility
  private leftArm: THREE.Group // Empty group for compatibility
  private rightArm: THREE.Group // Empty group for compatibility
  private antenna: THREE.Group // Empty group for compatibility
  private statusRing: THREE.Mesh

  // Behavior systems
  private idleBehaviorManager: IdleBehaviorManager
  private workingBehaviorManager: WorkingBehaviorManager

  constructor(scene: WorkshopScene, options: FlowerOptions = {}) {
    this.scene = scene
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.id = Math.random().toString(36).substring(2, 9)
    this.mesh = new THREE.Group()

    // Create head with flower petals
    this.head = this.createHead()
    this.visor = this.head.getObjectByName('visor') as THREE.Mesh
    this.leftEye = this.head.getObjectByName('leftEye') as THREE.Mesh
    this.rightEye = this.head.getObjectByName('rightEye') as THREE.Mesh

    // Empty groups for body parts (for animation compatibility)
    this.body = new THREE.Group()
    this.leftArm = new THREE.Group()
    this.rightArm = new THREE.Group()
    this.antenna = new THREE.Group()

    // Status ring on floor (colored by zone)
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

  private createHead(): THREE.Group {
    const group = new THREE.Group()

    // Create distinct rounded petals like a sun/flower
    const innerRadius = 0.22 // Where petals meet the head

    // 12 petals - balanced widths with some variation
    // Gap/part around 11-12 o'clock (80°-110° area)
    const petals = [
      { angle: 355, length: 0.31, width: 0.48 }, // 1 - wide
      { angle: 25, length: 0.34, width: 0.44 }, // 2 - wide
      { angle: 55, length: 0.29, width: 0.36 }, // 3 - medium-narrow
      // GAP (~50°) - the "part" around 11-12 o'clock
      { angle: 105, length: 0.16, width: 0.32 }, // 4 - medium
      { angle: 130, length: 0.18, width: 0.3 }, // 5 - medium-narrow
      { angle: 155, length: 0.21, width: 0.4 }, // 6 - wide
      { angle: 180, length: 0.18, width: 0.38 }, // 7 - wide
      { angle: 205, length: 0.16, width: 0.34 }, // 8 - medium
      { angle: 235, length: 0.1, width: 0.28 }, // 9 - medium-narrow
      { angle: 265, length: 0.07, width: 0.24 }, // 10 - narrow (tiny petal)
      { angle: 295, length: 0.1, width: 0.28 }, // 11 - medium-narrow
      { angle: 325, length: 0.21, width: 0.42 }, // 12 - wide
    ]

    const flowerShape = new THREE.Shape()

    // Start at the first petal's right edge on the inner circle
    const firstPetal = petals[0]
    const startAngle =
      (firstPetal.angle - firstPetal.width * 0.5 * (180 / Math.PI)) * (Math.PI / 180)
    flowerShape.moveTo(Math.cos(startAngle) * innerRadius, Math.sin(startAngle) * innerRadius)

    // Draw each petal as a straight-sided stem with rounded tip
    for (let i = 0; i < petals.length; i++) {
      const petal = petals[i]
      const nextPetal = petals[(i + 1) % petals.length]

      const angleRad = petal.angle * (Math.PI / 180)
      const nextAngleRad = nextPetal.angle * (Math.PI / 180)

      // Petal width (half-width for each side)
      const halfWidth = petal.width * 0.12

      // Angles for left and right edges (parallel sides)
      const leftAngle = angleRad - halfWidth
      const rightAngle = angleRad + halfWidth

      // Tip radius
      const tipRadius = innerRadius + petal.length

      // Tip points (same width as base for straight sides)
      const tipLeftX = Math.cos(leftAngle) * tipRadius
      const tipLeftY = Math.sin(leftAngle) * tipRadius
      const tipRightX = Math.cos(rightAngle) * tipRadius
      const tipRightY = Math.sin(rightAngle) * tipRadius
      const tipCenterX = Math.cos(angleRad) * (tipRadius + 0.015)
      const tipCenterY = Math.sin(angleRad) * (tipRadius + 0.015)

      // Valley between this petal and next
      let valleyAngle = angleRad + (nextAngleRad - angleRad) / 2
      if (nextAngleRad < angleRad)
        valleyAngle = angleRad + (nextAngleRad + Math.PI * 2 - angleRad) / 2
      const valleyX = Math.cos(valleyAngle) * innerRadius
      const valleyY = Math.sin(valleyAngle) * innerRadius

      // Draw straight stem with rounded tip
      // Left side - straight line to tip
      flowerShape.lineTo(tipLeftX, tipLeftY)
      // Rounded tip
      flowerShape.quadraticCurveTo(tipCenterX, tipCenterY, tipRightX, tipRightY)
      // Right side - straight line back to valley
      flowerShape.lineTo(valleyX, valleyY)
    }

    flowerShape.closePath()

    // Cut out center hole for the face
    const holePath = new THREE.Path()
    holePath.absarc(0, 0, innerRadius - 0.01, 0, Math.PI * 2, true)
    flowerShape.holes.push(holePath)

    // Extrude the flower shape
    const extrudeSettings = {
      depth: 0.02,
      bevelEnabled: true,
      bevelThickness: 0.005,
      bevelSize: 0.005,
      bevelSegments: 1,
    }

    const flowerGeometry = new THREE.ExtrudeGeometry(flowerShape, extrudeSettings)
    const flowerMaterial = new THREE.MeshStandardMaterial({
      color: 0xe89878,
      roughness: 0.7,
      metalness: 0.0,
      emissive: 0x884433,
      emissiveIntensity: 0.8,
    })

    const flower = new THREE.Mesh(flowerGeometry, flowerMaterial)
    flower.position.z = -0.02
    flower.castShadow = true
    group.add(flower)

    // Main head - same color as petals
    const headGeometry = new THREE.SphereGeometry(0.24, 32, 32)
    const headMaterial = new THREE.MeshStandardMaterial({
      color: 0xe89878,
      roughness: 0.7,
      metalness: 0.0,
      emissive: 0x884433,
      emissiveIntensity: 0.8,
    })
    const head = new THREE.Mesh(headGeometry, headMaterial)
    head.castShadow = true
    group.add(head)

    // Visor (invisible but kept for animation compatibility)
    const visorGeometry = new THREE.PlaneGeometry(0.01, 0.01)
    const visorMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
    })
    const visor = new THREE.Mesh(visorGeometry, visorMaterial)
    visor.name = 'visor'
    visor.position.set(0, 0.02, 0.25)
    group.add(visor)

    // Simple dark eyes
    const eyeGeometry = new THREE.SphereGeometry(0.035, 16, 16)
    const eyeMaterial = new THREE.MeshBasicMaterial({
      color: 0x222222,
    })

    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial.clone())
    leftEye.name = 'leftEye'
    leftEye.position.set(-0.07, 0.03, 0.21)
    group.add(leftEye)

    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial.clone())
    rightEye.name = 'rightEye'
    rightEye.position.set(0.07, 0.03, 0.21)
    group.add(rightEye)

    // Rosy cheeks
    const cheekGeometry = new THREE.CircleGeometry(0.04, 16)
    const cheekMaterial = new THREE.MeshBasicMaterial({
      color: 0xffb6c1, // Light pink
    })

    const leftCheek = new THREE.Mesh(cheekGeometry, cheekMaterial)
    leftCheek.position.set(-0.12, -0.02, 0.22)
    group.add(leftCheek)

    const rightCheek = new THREE.Mesh(cheekGeometry, cheekMaterial)
    rightCheek.position.set(0.12, -0.02, 0.22)
    group.add(rightCheek)

    // Happy smile using a thick curved line
    const smileCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-0.05, -0.04, 0.22),
      new THREE.Vector3(0, -0.08, 0.23),
      new THREE.Vector3(0.05, -0.04, 0.22)
    )
    const smileTube = new THREE.TubeGeometry(smileCurve, 12, 0.01, 8, false)
    const smileMaterial = new THREE.MeshBasicMaterial({
      color: 0x333333,
    })
    const smile = new THREE.Mesh(smileTube, smileMaterial)
    group.add(smile)

    // Position the head floating (no body)
    group.position.y = 0.3
    return group
  }

  private createStatusRing(): THREE.Mesh {
    const geometry = new THREE.RingGeometry(0.28, 0.32, 32)
    const material = new THREE.MeshBasicMaterial({
      color: this.options.color,
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
    // Move toward target if set
    if (this.targetPosition) {
      const direction = new THREE.Vector3().subVectors(this.targetPosition, this.mesh.position)

      const distance = direction.length()

      if (distance > 0.1) {
        direction.normalize()
        const moveAmount = Math.min(this.moveSpeed * delta, distance)
        this.mesh.position.add(direction.multiplyScalar(moveAmount))

        // Face movement direction
        const angle = Math.atan2(direction.x, direction.z)
        this.mesh.rotation.y = angle
      } else {
        this.mesh.position.copy(this.targetPosition)
        this.targetPosition = null
        if (this.state === 'walking') {
          this.setState('idle')
        }
      }
    }

    // Gentle floating bob animation
    this.bobTime += delta
    const bobAmount = Math.sin(this.bobTime * 2) * 0.02
    this.head.position.y = 0.3 + bobAmount

    // Run behavior animations
    const parts = this.getCharacterParts()

    if (this.state === 'working') {
      this.workTime += delta
      this.workingBehaviorManager.update(parts, delta)
    } else if (this.state === 'idle') {
      this.idleBehaviorManager.update(parts, delta)
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

    // Reset previous state animations
    if (this.state === 'working') {
      this.workingBehaviorManager.stop(parts)
    }

    this.state = newState

    // Update status ring color
    const colors = {
      idle: 0x4ade80,
      walking: 0x60a5fa,
      working: 0xfb923c,
      thinking: 0xa78bfa,
    }
    const ring = this.statusRing.material as THREE.MeshBasicMaterial
    ring.color.setHex(colors[newState])

    // Initialize new state
    if (newState === 'working') {
      this.workTime = 0
      this.workingBehaviorManager.start(this.currentStation, parts)
    }
  }

  public setStatusColor(color: number): void {
    const ring = this.statusRing.material as THREE.MeshBasicMaterial
    ring.color.setHex(color)
  }

  public playRandomIdleBehavior(): void {
    if (this.state !== 'idle') {
      this.setState('idle')
    }
    this.idleBehaviorManager.forcePlayRandom(this.getCharacterParts())
  }

  public playIdleBehavior(name: string): void {
    if (this.state !== 'idle') {
      this.setState('idle')
    }
    this.idleBehaviorManager.forcePlay(name, this.getCharacterParts())
  }

  public dispose(): void {
    if (this.updateCallback) {
      this.scene.offRender(this.updateCallback)
    }
    this.scene.scene.remove(this.mesh)

    // Dispose geometries and materials
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
