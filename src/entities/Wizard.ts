/**
 * Wizard - Mystical spellcaster character
 *
 * Design: Classic wizard with magical elements
 * - Tall pointed hat with stars
 * - Long flowing beard
 * - Sweeping robes
 * - Glowing staff with orb
 * - Magical particle effects while working
 */

import * as THREE from 'three'
import type { StationType } from '../../shared/types'
import type { WorkshopScene } from '../scene/WorkshopScene'
import type { ICharacter, CharacterOptions, CharacterState } from './ICharacter'
import { IdleBehaviorManager, WorkingBehaviorManager, type CharacterParts } from './animations'

export type WizardOptions = CharacterOptions

const DEFAULT_OPTIONS: Required<WizardOptions> = {
  scale: 1.05, // Slightly taller
  color: 0x4a148c, // Deep purple for robes
  statusColor: 0x4ade80,
  startStation: 'center',
}

export class Wizard implements ICharacter {
  public readonly mesh: THREE.Group
  public state: CharacterState = 'idle'
  public currentStation: StationType = 'center'
  public readonly id: string

  private scene: WorkshopScene
  private options: Required<WizardOptions>
  private targetPosition: THREE.Vector3 | null = null
  private moveSpeed = 2.5 // Wizards are dignified, not rushing
  private bobTime = 0
  private workTime = 0
  private thinkTime = 0
  private magicTime = 0
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

  // Wizard specific
  private hat: THREE.Group
  private beard: THREE.Group
  private staff: THREE.Group
  private staffOrb: THREE.Mesh
  private magicParticles: THREE.Group

  // Base positions for animation
  private bodyBaseY = 0
  private beardBaseY = 0
  private hatBaseY = 0

  // Behavior systems
  private idleBehaviorManager: IdleBehaviorManager
  private workingBehaviorManager: WorkingBehaviorManager

  constructor(scene: WorkshopScene, options: WizardOptions = {}) {
    this.scene = scene
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.id = Math.random().toString(36).substring(2, 9)
    this.mesh = new THREE.Group()

    // Create all parts
    this.head = this.createHead()
    this.visor = this.head.getObjectByName('visor') as THREE.Mesh
    this.leftEye = this.head.getObjectByName('leftEye') as THREE.Mesh
    this.rightEye = this.head.getObjectByName('rightEye') as THREE.Mesh

    this.hat = this.createHat()
    this.beard = this.createBeard()
    this.body = this.createBody()
    this.leftArm = this.createArm(true)
    this.rightArm = this.createArm(false)
    this.staff = this.createStaff()
    this.staffOrb = this.staff.getObjectByName('staffOrb') as THREE.Mesh
    this.magicParticles = this.createMagicParticles()
    this.antenna = new THREE.Group() // Empty for compatibility

    this.statusRing = this.createStatusRing()

    this.mesh.add(this.head)
    this.mesh.add(this.hat)
    this.mesh.add(this.beard)
    this.mesh.add(this.body)
    this.mesh.add(this.leftArm)
    this.mesh.add(this.rightArm)
    this.mesh.add(this.staff)
    this.mesh.add(this.magicParticles)
    this.mesh.add(this.statusRing)

    // Store base positions for animation
    this.bodyBaseY = this.body.position.y
    this.beardBaseY = this.beard.position.y
    this.hatBaseY = this.hat.position.y

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

    // Face (aged skin tone)
    const faceGeo = new THREE.SphereGeometry(0.28, 16, 12)
    const faceMat = new THREE.MeshStandardMaterial({
      color: 0xdeb887, // Burlywood - aged skin
      roughness: 0.9,
    })
    const face = new THREE.Mesh(faceGeo, faceMat)
    face.position.y = 1.15
    group.add(face)

    // Bushy eyebrows
    const browGeo = new THREE.BoxGeometry(0.15, 0.05, 0.06)
    const browMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc, // Gray
      roughness: 1,
    })

    const leftBrow = new THREE.Mesh(browGeo, browMat)
    leftBrow.position.set(-0.1, 1.25, 0.22)
    leftBrow.rotation.z = 0.15
    group.add(leftBrow)

    const rightBrow = new THREE.Mesh(browGeo, browMat)
    rightBrow.position.set(0.1, 1.25, 0.22)
    rightBrow.rotation.z = -0.15
    group.add(rightBrow)

    // Eyes - wise and knowing
    const eyeGeo = new THREE.SphereGeometry(0.04, 8, 8)
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0x4169e1, // Royal blue - magical eyes
      emissive: 0x1a1aff,
      emissiveIntensity: 0.3,
    })

    const leftEye = new THREE.Mesh(eyeGeo, eyeMat)
    leftEye.position.set(-0.1, 1.18, 0.24)
    leftEye.name = 'leftEye'
    group.add(leftEye)

    const rightEye = new THREE.Mesh(eyeGeo, eyeMat)
    rightEye.position.set(0.1, 1.18, 0.24)
    rightEye.name = 'rightEye'
    group.add(rightEye)

    // Nose (prominent wizard nose)
    const noseGeo = new THREE.ConeGeometry(0.04, 0.12, 6)
    const noseMat = new THREE.MeshStandardMaterial({
      color: 0xdeb887,
      roughness: 0.9,
    })
    const nose = new THREE.Mesh(noseGeo, noseMat)
    nose.position.set(0, 1.12, 0.28)
    nose.rotation.x = -Math.PI / 2
    group.add(nose)

    // Visor placeholder for animation compatibility
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01))
    visor.visible = false
    visor.name = 'visor'
    group.add(visor)

    return group
  }

  private createHat(): THREE.Group {
    const group = new THREE.Group()

    const hatColor = this.options.color

    // Hat brim
    const brimGeo = new THREE.CylinderGeometry(0.4, 0.42, 0.06, 16)
    const hatMat = new THREE.MeshStandardMaterial({
      color: hatColor,
      roughness: 0.7,
    })
    const brim = new THREE.Mesh(brimGeo, hatMat)
    brim.position.y = 1.35
    group.add(brim)

    // Hat cone (tall and pointy)
    const coneGeo = new THREE.ConeGeometry(0.3, 0.7, 16)
    const cone = new THREE.Mesh(coneGeo, hatMat)
    cone.position.y = 1.7
    // Slight tilt for character
    cone.rotation.z = 0.1
    group.add(cone)

    // Stars on the hat
    const starMat = new THREE.MeshStandardMaterial({
      color: 0xffd700, // Gold
      emissive: 0xffd700,
      emissiveIntensity: 0.5,
    })

    // Create simple star shapes as small pyramids
    for (let i = 0; i < 5; i++) {
      const starGeo = new THREE.TetrahedronGeometry(0.04)
      const star = new THREE.Mesh(starGeo, starMat)
      const angle = (i / 5) * Math.PI * 2
      const height = 1.5 + Math.random() * 0.3
      const radius = 0.2 + Math.random() * 0.08
      star.position.set(Math.sin(angle) * radius, height, Math.cos(angle) * radius)
      star.rotation.set(Math.random(), Math.random(), Math.random())
      group.add(star)
    }

    // Crescent moon decoration
    const moonGeo = new THREE.TorusGeometry(0.06, 0.015, 8, 12, Math.PI)
    const moon = new THREE.Mesh(moonGeo, starMat)
    moon.position.set(0, 1.9, 0.15)
    moon.rotation.z = Math.PI / 4
    group.add(moon)

    return group
  }

  private createBeard(): THREE.Group {
    const group = new THREE.Group()

    const beardMat = new THREE.MeshStandardMaterial({
      color: 0xe8e8e8, // Silver-white
      roughness: 1,
    })

    // Main beard (layered spheres for fluffy look)
    const beardLayers = [
      { y: 1.0, z: 0.15, scale: 0.18 },
      { y: 0.85, z: 0.12, scale: 0.2 },
      { y: 0.7, z: 0.08, scale: 0.18 },
      { y: 0.55, z: 0.05, scale: 0.15 },
      { y: 0.42, z: 0.02, scale: 0.1 },
    ]

    beardLayers.forEach((layer) => {
      const geo = new THREE.SphereGeometry(layer.scale, 10, 8)
      const mesh = new THREE.Mesh(geo, beardMat)
      mesh.position.set(0, layer.y, layer.z)
      mesh.scale.set(1, 1.2, 0.8)
      group.add(mesh)
    })

    // Mustache
    const mustacheGeo = new THREE.BoxGeometry(0.25, 0.04, 0.08)
    const mustache = new THREE.Mesh(mustacheGeo, beardMat)
    mustache.position.set(0, 1.08, 0.2)
    group.add(mustache)

    // Mustache curls
    const curlGeo = new THREE.SphereGeometry(0.035, 8, 8)

    const leftCurl = new THREE.Mesh(curlGeo, beardMat)
    leftCurl.position.set(-0.14, 1.06, 0.18)
    group.add(leftCurl)

    const rightCurl = new THREE.Mesh(curlGeo, beardMat)
    rightCurl.position.set(0.14, 1.06, 0.18)
    group.add(rightCurl)

    return group
  }

  private createBody(): THREE.Group {
    const group = new THREE.Group()

    const robeColor = this.options.color

    // Robe body (wider at bottom for flowing effect)
    const robeGeo = new THREE.CylinderGeometry(0.2, 0.4, 0.8, 12)
    const robeMat = new THREE.MeshStandardMaterial({
      color: robeColor,
      roughness: 0.8,
    })
    const robe = new THREE.Mesh(robeGeo, robeMat)
    robe.position.y = 0.4
    group.add(robe)

    // Robe trim (gold)
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0xdaa520, // Goldenrod
      metalness: 0.5,
      roughness: 0.4,
    })

    // Collar
    const collarGeo = new THREE.TorusGeometry(0.22, 0.03, 8, 16)
    const collar = new THREE.Mesh(collarGeo, trimMat)
    collar.position.y = 0.8
    collar.rotation.x = Math.PI / 2
    group.add(collar)

    // Belt
    const beltGeo = new THREE.TorusGeometry(0.28, 0.025, 8, 16)
    const belt = new THREE.Mesh(beltGeo, trimMat)
    belt.position.y = 0.5
    belt.rotation.x = Math.PI / 2
    group.add(belt)

    // Belt buckle (mystical symbol)
    const buckleGeo = new THREE.CircleGeometry(0.05, 6) // Hexagon
    const buckleMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      metalness: 0.8,
      roughness: 0.2,
      side: THREE.DoubleSide,
    })
    const buckle = new THREE.Mesh(buckleGeo, buckleMat)
    buckle.position.set(0, 0.5, 0.28)
    group.add(buckle)

    // Robe hem decorations (arcane symbols)
    const symbolMat = new THREE.MeshBasicMaterial({
      color: 0xdaa520,
      side: THREE.DoubleSide,
    })

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2
      const symbolGeo = new THREE.RingGeometry(0.02, 0.035, 6)
      const symbol = new THREE.Mesh(symbolGeo, symbolMat)
      symbol.position.set(Math.sin(angle) * 0.38, 0.05, Math.cos(angle) * 0.38)
      symbol.rotation.x = -Math.PI / 2
      group.add(symbol)
    }

    return group
  }

  private createArm(isLeft: boolean): THREE.Group {
    const group = new THREE.Group()
    const x = isLeft ? -0.28 : 0.28

    const robeColor = this.options.color

    // Sleeve
    const sleeveGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.4, 8)
    const sleeveMat = new THREE.MeshStandardMaterial({
      color: robeColor,
      roughness: 0.8,
    })
    const sleeve = new THREE.Mesh(sleeveGeo, sleeveMat)
    sleeve.position.y = -0.15
    group.add(sleeve)

    // Hand
    const handGeo = new THREE.SphereGeometry(0.06, 8, 8)
    const handMat = new THREE.MeshStandardMaterial({
      color: 0xdeb887,
      roughness: 0.9,
    })
    const hand = new THREE.Mesh(handGeo, handMat)
    hand.position.y = -0.38
    group.add(hand)

    group.position.set(x, 0.7, 0)

    // Right arm holds the staff in initial position
    if (!isLeft) {
      group.rotation.x = -0.2
      group.rotation.z = -0.3
    }

    return group
  }

  private createStaff(): THREE.Group {
    const group = new THREE.Group()

    // Staff shaft (twisted wood)
    const shaftGeo = new THREE.CylinderGeometry(0.03, 0.04, 1.4, 8)
    const shaftMat = new THREE.MeshStandardMaterial({
      color: 0x4a3728, // Dark wood
      roughness: 0.9,
    })
    const shaft = new THREE.Mesh(shaftGeo, shaftMat)
    shaft.position.y = 0.7
    group.add(shaft)

    // Staff head (twisted branches holding orb)
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x5d4e37,
      roughness: 0.8,
    })

    // Branch prongs
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2
      const prongGeo = new THREE.CylinderGeometry(0.015, 0.02, 0.15, 6)
      const prong = new THREE.Mesh(prongGeo, headMat)
      prong.position.set(Math.sin(angle) * 0.04, 1.45, Math.cos(angle) * 0.04)
      prong.rotation.x = Math.sin(angle) * 0.4
      prong.rotation.z = Math.cos(angle) * 0.4
      group.add(prong)
    }

    // Magic orb
    const orbGeo = new THREE.SphereGeometry(0.08, 16, 12)
    const orbMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff, // Cyan
      emissive: 0x00aaaa,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.9,
    })
    const orb = new THREE.Mesh(orbGeo, orbMat)
    orb.position.y = 1.5
    orb.name = 'staffOrb'
    group.add(orb)

    // Inner glow
    const innerGeo = new THREE.SphereGeometry(0.04, 12, 8)
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.6,
    })
    const inner = new THREE.Mesh(innerGeo, innerMat)
    inner.position.y = 1.5
    group.add(inner)

    // Position staff in right hand
    group.position.set(0.45, 0, 0.1)
    group.rotation.z = 0.15

    return group
  }

  private createMagicParticles(): THREE.Group {
    const group = new THREE.Group()
    group.visible = false // Only visible when working

    // Create floating particle meshes
    const particleMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.7,
    })

    for (let i = 0; i < 12; i++) {
      const size = 0.02 + Math.random() * 0.02
      const geo = new THREE.TetrahedronGeometry(size)
      const particle = new THREE.Mesh(geo, particleMat.clone())

      // Random positions around the staff orb
      const angle = (i / 12) * Math.PI * 2
      const radius = 0.15 + Math.random() * 0.1
      particle.position.set(
        Math.sin(angle) * radius + 0.45,
        1.5 + (Math.random() - 0.5) * 0.3,
        Math.cos(angle) * radius + 0.1
      )

      particle.userData.angle = angle
      particle.userData.radius = radius
      particle.userData.speed = 0.5 + Math.random() * 0.5
      particle.userData.yOffset = Math.random() * Math.PI * 2

      group.add(particle)
    }

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
    this.magicTime += delta
    const parts = this.getCharacterParts()

    // Staff orb always pulses gently
    const orbPulse = 0.8 + Math.sin(this.magicTime * 2) * 0.2
    const orbMat = this.staffOrb.material as THREE.MeshStandardMaterial
    orbMat.emissiveIntensity = orbPulse

    if (this.state === 'walking' && this.targetPosition) {
      const direction = new THREE.Vector3()
        .subVectors(this.targetPosition, this.mesh.position)
        .normalize()
      const distance = this.mesh.position.distanceTo(this.targetPosition)

      if (distance > 0.1) {
        this.mesh.position.add(direction.multiplyScalar(this.moveSpeed * delta))

        // Dignified walking - robes sway, staff moves
        const sway = Math.sin(this.bobTime * 6) * 0.02
        this.body.rotation.y = sway

        // Head bob (rotation only for walking)
        this.head.rotation.x = Math.sin(this.bobTime * 8) * 0.03
        this.hat.rotation.x = this.head.rotation.x * 0.5

        // Beard sways
        this.beard.rotation.z = Math.sin(this.bobTime * 6) * 0.05

        // Staff moves slightly
        this.staff.rotation.z = 0.15 + Math.sin(this.bobTime * 6) * 0.05

        // Face movement direction
        const angle = Math.atan2(direction.x, direction.z)
        this.mesh.rotation.y = angle
      } else {
        this.mesh.position.copy(this.targetPosition)
        this.targetPosition = null
        this.setState('idle')
        this.body.rotation.y = 0
        this.beard.rotation.z = 0
      }
    } else if (this.state === 'idle') {
      // Gentle breathing and presence
      const breathe = Math.sin(this.bobTime * 1.5) * 0.015
      this.body.position.y = this.bodyBaseY + breathe
      this.beard.position.y = this.beardBaseY + breathe * 0.5

      // Head subtle movement (rotation only, not position)
      this.head.rotation.x = breathe * 0.3
      this.head.rotation.z = Math.sin(this.bobTime * 0.8) * 0.02

      // Hat follows head
      this.hat.rotation.x = this.head.rotation.x * 0.5
      this.hat.rotation.z = this.head.rotation.z

      // Hat stars twinkle
      this.hat.children.forEach((child, i) => {
        if (child instanceof THREE.Mesh && child.geometry instanceof THREE.TetrahedronGeometry) {
          child.rotation.y += delta * (0.5 + i * 0.1)
        }
      })

      // Occasional staff adjustment
      this.staff.rotation.z = 0.15 + Math.sin(this.bobTime * 0.5) * 0.02

      // Update idle behaviors
      this.idleBehaviorManager.update(parts, delta)
    } else if (this.state === 'working') {
      this.workTime += delta

      // Magic particles become visible and animate
      this.magicParticles.visible = true

      // Animate particles
      this.magicParticles.children.forEach((particle) => {
        const p = particle as THREE.Mesh
        const data = p.userData
        const newAngle = data.angle + this.workTime * data.speed

        p.position.x = Math.sin(newAngle) * data.radius + 0.45
        p.position.z = Math.cos(newAngle) * data.radius + 0.1
        p.position.y = 1.5 + Math.sin(this.workTime * 2 + data.yOffset) * 0.15

        p.rotation.x += delta * 2
        p.rotation.y += delta * 3

        // Pulse opacity
        const mat = p.material as THREE.MeshBasicMaterial
        mat.opacity = 0.5 + Math.sin(this.workTime * 3 + data.yOffset) * 0.3
      })

      // Staff orb glows brighter
      orbMat.emissiveIntensity = 1.2 + Math.sin(this.workTime * 4) * 0.3

      // Wizard sways while casting
      this.body.rotation.y = Math.sin(this.workTime * 2) * 0.1

      // Arms move as if conducting
      this.leftArm.rotation.x = Math.sin(this.workTime * 2) * 0.3
      this.leftArm.rotation.z = 0.2 + Math.sin(this.workTime * 1.5) * 0.1
      this.rightArm.rotation.x = -0.2 + Math.sin(this.workTime * 2 + 1) * 0.2

      // Beard waves with magical energy
      this.beard.rotation.z = Math.sin(this.workTime * 3) * 0.08

      // Update working behaviors
      this.workingBehaviorManager.update(parts, delta)
    } else if (this.state === 'thinking') {
      this.thinkTime += delta

      // Hide particles when thinking
      this.magicParticles.visible = false

      // Stroke beard contemplatively
      this.leftArm.rotation.x = -0.5
      this.leftArm.rotation.z = 0.3 + Math.sin(this.thinkTime * 0.8) * 0.1

      // Head tilted in thought
      this.head.rotation.z = Math.sin(this.thinkTime * 0.3) * 0.08
      this.head.rotation.x = -0.1

      // Eyes slightly unfocused (looking up)
      this.leftEye.position.y = 1.19
      this.rightEye.position.y = 1.19

      // Staff orb dims during contemplation
      orbMat.emissiveIntensity = 0.4 + Math.sin(this.thinkTime * 1) * 0.2
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

    // Hide magic particles when not working
    if (state !== 'working') {
      this.magicParticles.visible = false
    }

    if (state === 'working') {
      this.workingBehaviorManager.start(this.currentStation, parts)
    } else if (state === 'idle') {
      // Reset all positions and rotations
      this.head.rotation.set(0, 0, 0)
      this.hat.position.y = this.hatBaseY
      this.hat.rotation.set(0, 0, 0)
      this.body.position.y = this.bodyBaseY
      this.body.rotation.set(0, 0, 0)
      this.beard.position.y = this.beardBaseY
      this.beard.rotation.set(0, 0, 0)
      this.leftArm.rotation.set(0, 0, 0)
      this.rightArm.rotation.set(-0.2, 0, -0.3)
      this.staff.rotation.z = 0.15
      this.leftEye.position.y = 1.18
      this.rightEye.position.y = 1.18
    }

    // Update status ring color
    const colors = {
      idle: 0x4ade80, // green
      walking: 0x60a5fa, // blue
      working: 0xfb923c, // orange
      thinking: 0xa78bfa, // purple
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

    // Wizard's special idle: wave the staff with a burst of particles
    this.magicParticles.visible = true

    // Brief magic burst
    setTimeout(() => {
      if (this.state === 'idle') {
        this.magicParticles.visible = false
      }
    }, 1500)
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
