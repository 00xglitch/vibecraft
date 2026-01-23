/**
 * AfroSamurai - Cool samurai character with iconic afro
 *
 * Design: Stylish Black samurai warrior with large afro and traditional outfit
 * - Large spherical afro hairstyle (dark brown/black)
 * - Determined eyes with red headband
 * - Realistic brown skin tone
 * - Traditional samurai kimono with detailed obi
 * - Visible skin at neck/hands/arm openings
 * - Katana on back
 */

import * as THREE from 'three'
import type { StationType } from '../../shared/types'
import type { WorkshopScene } from '../scene/WorkshopScene'
import type { ICharacter, CharacterOptions, CharacterState } from './ICharacter'
import { IdleBehaviorManager, WorkingBehaviorManager, type CharacterParts } from './animations'

export type AfroSamuraiOptions = CharacterOptions

const DEFAULT_OPTIONS: Required<AfroSamuraiOptions> = {
  scale: 1,
  color: 0x1a0f0a, // Very dark brown for afro
  statusColor: 0x4ade80,
  startStation: 'center',
}

// Color palette
const COLORS = {
  skin: 0x8b5a3c, // Rich brown skin tone
  skinDark: 0x6b4530, // Darker shade for shadows
  afro: 0x1a0f0a, // Very dark brown/black afro
  kimono: 0x1a1a2e, // Dark navy kimono
  kimonoAccent: 0x2d2d44, // Lighter accent for folds
  obi: 0x8b0000, // Deep red obi (belt)
  obiAccent: 0xc41e3a, // Brighter red accent
  headband: 0xcc2222, // Red headband
  gold: 0xc9a227, // Gold accents
  leather: 0x3d2817, // Dark leather for scabbard
  wood: 0x5c3a21, // Wood handle
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
  private animTime = 0
  private updateCallback: ((delta: number) => void) | null = null

  // Body parts for animation - store base positions
  private head: THREE.Group
  private headBaseY = 0 // Track base Y position for head
  private visor: THREE.Mesh
  private leftEye: THREE.Mesh
  private rightEye: THREE.Mesh
  private body: THREE.Group
  private leftArm: THREE.Group
  private rightArm: THREE.Group
  private leftLeg: THREE.Group
  private rightLeg: THREE.Group
  private antenna: THREE.Group
  private statusRing: THREE.Mesh

  // Behavior systems
  private idleBehaviorManager: IdleBehaviorManager
  private workingBehaviorManager: WorkingBehaviorManager

  // Speech bubble system (3D)
  private speechBubble: THREE.Group | null = null
  private speechTimeout: number | null = null

  // Personality phrases for different situations
  private static readonly PHRASES = {
    idle: [
      '⚔️ The path of code is long...',
      "🧘 Patience is the warrior's virtue",
      '💭 I sense a bug nearby...',
      '🍵 Tea break? Nah, more coding!',
      '⚡ My katana thirsts for bugs!',
    ],
    working: [
      '🔥 Slicing through this code!',
      '⚔️ One clean cut!',
      '💪 Focus... breathe... code!',
      '🎯 Target acquired!',
    ],
    thinking: [
      '🤔 Hmm, let me meditate on this...',
      '💭 The answer lies within...',
      '🧠 Processing at samurai speed!',
    ],
    success: [
      '✨ Another bug vanquished!',
      '🎉 Victory is mine!',
      '⚔️ Clean as a katana strike!',
      '💯 Nailed it!',
    ],
    error: ['😤 This bug dishonors me!', "🤺 We'll meet again, bug...", '💀 A worthy opponent...'],
  }

  constructor(scene: WorkshopScene, options: AfroSamuraiOptions = {}) {
    this.scene = scene
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.id = Math.random().toString(36).substring(2, 9)
    this.mesh = new THREE.Group()

    // Create all parts
    this.body = this.createBody()
    this.head = this.createHead()
    this.leftArm = this.createArm(true)
    this.rightArm = this.createArm(false)
    this.leftLeg = this.createLeg(true)
    this.rightLeg = this.createLeg(false)
    this.antenna = new THREE.Group() // Empty for compatibility
    this.statusRing = this.createStatusRing()

    // Get references to animatable parts
    this.visor = this.head.getObjectByName('visor') as THREE.Mesh
    this.leftEye = this.head.getObjectByName('leftEye') as THREE.Mesh
    this.rightEye = this.head.getObjectByName('rightEye') as THREE.Mesh

    // Add to mesh group in correct order
    this.mesh.add(this.body)
    this.mesh.add(this.leftLeg)
    this.mesh.add(this.rightLeg)
    this.mesh.add(this.leftArm)
    this.mesh.add(this.rightArm)
    this.mesh.add(this.head)
    this.mesh.add(this.statusRing)

    // Store head base position for animation reference
    this.headBaseY = this.head.position.y

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

    // Neck (connects head to body - extended to reach shoulders)
    const neckGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.25, 8)
    const skinMat = new THREE.MeshStandardMaterial({
      color: COLORS.skin,
      roughness: 0.8,
    })
    const neck = new THREE.Mesh(neckGeo, skinMat)
    neck.position.y = -0.2
    group.add(neck)

    // Face/Head (proper brown skin) - positioned forward of afro
    const faceGeo = new THREE.SphereGeometry(0.26, 16, 12)
    const face = new THREE.Mesh(faceGeo, skinMat)
    face.position.y = 0.1
    face.position.z = 0.18 // Push face forward to prevent Z-fighting with afro
    face.scale.set(1, 1.1, 0.9) // Slightly elongated, flatter in z
    group.add(face)

    // Afro (large dark sphere positioned behind face)
    const afroGeo = new THREE.SphereGeometry(0.45, 24, 20)
    const afroMat = new THREE.MeshStandardMaterial({
      color: COLORS.afro,
      roughness: 1,
      metalness: 0,
    })
    const afro = new THREE.Mesh(afroGeo, afroMat)
    afro.position.y = 0.28
    afro.position.z = -0.18 // Push afro back to increase separation from face
    group.add(afro)

    // Afro texture bumps (small spheres for volume) - adjusted to new afro position
    for (let i = 0; i < 12; i++) {
      const bumpGeo = new THREE.SphereGeometry(0.08 + Math.random() * 0.05, 8, 8)
      const bump = new THREE.Mesh(bumpGeo, afroMat)
      const angle = (i / 12) * Math.PI * 2
      const radius = 0.38
      bump.position.set(
        Math.cos(angle) * radius * (0.8 + Math.random() * 0.4),
        0.28 + Math.random() * 0.15,
        Math.sin(angle) * radius * 0.5 - 0.18 // Match new afro z position (-0.18)
      )
      group.add(bump)
    }

    // Headband (red cloth wrapped around forehead)
    const headbandGeo = new THREE.TorusGeometry(0.32, 0.025, 8, 32)
    const headbandMat = new THREE.MeshStandardMaterial({
      color: COLORS.headband,
      roughness: 0.6,
    })
    const headband = new THREE.Mesh(headbandGeo, headbandMat)
    headband.position.y = 0.22
    headband.rotation.x = Math.PI / 2
    group.add(headband)

    // Headband tails (flowing behind)
    const tailMat = new THREE.MeshStandardMaterial({
      color: COLORS.headband,
      roughness: 0.7,
      side: THREE.DoubleSide,
    })

    const tail1Geo = new THREE.PlaneGeometry(0.06, 0.35)
    const tail1 = new THREE.Mesh(tail1Geo, tailMat)
    tail1.position.set(-0.28, 0.05, -0.15)
    tail1.rotation.set(0.3, 0.2, 0.4)
    group.add(tail1)

    const tail2Geo = new THREE.PlaneGeometry(0.05, 0.3)
    const tail2 = new THREE.Mesh(tail2Geo, tailMat)
    tail2.position.set(-0.32, 0.02, -0.12)
    tail2.rotation.set(0.4, 0.3, 0.5)
    group.add(tail2)

    // Eyes - simplified 3-layer design (outer, iris+pupil, highlight)
    const eyeWhiteGeo = new THREE.SphereGeometry(0.045, 12, 10)
    const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xfaf8f5 })

    // Combined iris+pupil geometry (single mesh for performance)
    const irisGeo = new THREE.SphereGeometry(0.032, 10, 10)
    const irisMat = new THREE.MeshStandardMaterial({
      color: 0x4a2511, // Brown iris
      emissive: 0x1a0a05, // Subtle emissive for depth
      emissiveIntensity: 0.3,
    })

    // Eye shine/highlight
    const shineGeo = new THREE.SphereGeometry(0.008, 8, 8)
    const shineMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.5,
    })

    // Left eye assembly (3 layers)
    const leftEyeWhite = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat)
    leftEyeWhite.position.set(-0.085, 0.13, 0.32)
    leftEyeWhite.scale.set(1, 0.8, 0.6)
    group.add(leftEyeWhite)

    const leftEye = new THREE.Mesh(irisGeo, irisMat)
    leftEye.position.set(-0.085, 0.125, 0.365)
    leftEye.name = 'leftEye'
    group.add(leftEye)

    const leftShine = new THREE.Mesh(shineGeo, shineMat)
    leftShine.position.set(-0.075, 0.14, 0.385)
    group.add(leftShine)

    // Right eye assembly (3 layers)
    const rightEyeWhite = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat)
    rightEyeWhite.position.set(0.085, 0.13, 0.32)
    rightEyeWhite.scale.set(1, 0.8, 0.6)
    group.add(rightEyeWhite)

    const rightEye = new THREE.Mesh(irisGeo, irisMat.clone())
    rightEye.position.set(0.085, 0.125, 0.365)
    rightEye.name = 'rightEye'
    group.add(rightEye)

    const rightShine = new THREE.Mesh(shineGeo, shineMat.clone())
    rightShine.position.set(0.095, 0.14, 0.385)
    group.add(rightShine)

    // Eyelids (for expression)
    const eyelidGeo = new THREE.SphereGeometry(0.05, 8, 4, 0, Math.PI * 2, 0, Math.PI / 3)
    const eyelidMat = new THREE.MeshStandardMaterial({ color: COLORS.skin })

    const leftEyelid = new THREE.Mesh(eyelidGeo, eyelidMat)
    leftEyelid.position.set(-0.085, 0.15, 0.33)
    leftEyelid.rotation.x = Math.PI
    leftEyelid.scale.set(1, 0.5, 0.6)
    group.add(leftEyelid)

    const rightEyelid = new THREE.Mesh(eyelidGeo, eyelidMat)
    rightEyelid.position.set(0.085, 0.15, 0.33)
    rightEyelid.rotation.x = Math.PI
    rightEyelid.scale.set(1, 0.5, 0.6)
    group.add(rightEyelid)

    // Eyebrows - thick, expressive
    const browGeo = new THREE.BoxGeometry(0.08, 0.022, 0.025)
    const browMat = new THREE.MeshStandardMaterial({ color: COLORS.afro })

    const leftBrow = new THREE.Mesh(browGeo, browMat)
    leftBrow.position.set(-0.08, 0.21, 0.32)
    leftBrow.rotation.z = 0.15
    group.add(leftBrow)

    const rightBrow = new THREE.Mesh(browGeo, browMat)
    rightBrow.position.set(0.08, 0.21, 0.32)
    rightBrow.rotation.z = -0.15
    group.add(rightBrow)

    // Nose - detailed with nostrils
    const noseGeo = new THREE.SphereGeometry(0.04, 8, 8)
    const nose = new THREE.Mesh(noseGeo, skinMat)
    nose.position.set(0, 0.06, 0.38)
    nose.scale.set(0.9, 1.1, 0.65)
    group.add(nose)

    // Nostrils
    const nostrilGeo = new THREE.SphereGeometry(0.012, 6, 6)
    const nostrilMat = new THREE.MeshStandardMaterial({ color: COLORS.skinDark })

    const leftNostril = new THREE.Mesh(nostrilGeo, nostrilMat)
    leftNostril.position.set(-0.018, 0.03, 0.4)
    group.add(leftNostril)

    const rightNostril = new THREE.Mesh(nostrilGeo, nostrilMat)
    rightNostril.position.set(0.018, 0.03, 0.4)
    group.add(rightNostril)

    // Mouth with natural smile curve (using shape for better control)
    const mouthShape = new THREE.Shape()
    mouthShape.moveTo(-0.08, 0)
    mouthShape.quadraticCurveTo(0, -0.04, 0.08, 0) // Gentle smile curve
    const mouthGeo = new THREE.ShapeGeometry(mouthShape)
    const mouthMat = new THREE.MeshStandardMaterial({
      color: 0x6b3a2a, // Darker lip color
      side: THREE.DoubleSide,
    })
    const mouth = new THREE.Mesh(mouthGeo, mouthMat)
    mouth.position.set(0, -0.015, 0.365)
    group.add(mouth)

    // Lip thickness (subtle 3D effect)
    const lipThicknessGeo = new THREE.BoxGeometry(0.15, 0.012, 0.008)
    const lipThicknessMat = new THREE.MeshStandardMaterial({
      color: 0x8b4a3a, // Slightly lighter for top lip
    })
    const lipThickness = new THREE.Mesh(lipThicknessGeo, lipThicknessMat)
    lipThickness.position.set(0, -0.01, 0.36)
    group.add(lipThickness)

    // Teeth (visible in smile)
    const teethGeo = new THREE.BoxGeometry(0.05, 0.015, 0.01)
    const teethMat = new THREE.MeshStandardMaterial({ color: 0xfffef8 })
    const teeth = new THREE.Mesh(teethGeo, teethMat)
    teeth.position.set(0, -0.015, 0.36)
    group.add(teeth)

    // Mouth interior
    const mouthInteriorGeo = new THREE.SphereGeometry(0.03, 8, 8)
    const mouthInteriorMat = new THREE.MeshStandardMaterial({ color: 0x4a1818 })
    const mouthInterior = new THREE.Mesh(mouthInteriorGeo, mouthInteriorMat)
    mouthInterior.position.set(0, -0.015, 0.34)
    mouthInterior.scale.set(1.2, 0.5, 0.5)
    group.add(mouthInterior)

    // Chin definition
    const chinGeo = new THREE.SphereGeometry(0.05, 8, 8)
    const chin = new THREE.Mesh(chinGeo, skinMat)
    chin.position.set(0, -0.08, 0.32)
    chin.scale.set(1, 0.6, 0.7)
    group.add(chin)

    // Cheekbones
    const cheekGeo = new THREE.SphereGeometry(0.04, 8, 8)

    const leftCheek = new THREE.Mesh(cheekGeo, skinMat)
    leftCheek.position.set(-0.12, 0.04, 0.3)
    leftCheek.scale.set(0.8, 0.6, 0.5)
    group.add(leftCheek)

    const rightCheek = new THREE.Mesh(cheekGeo, skinMat)
    rightCheek.position.set(0.12, 0.04, 0.3)
    rightCheek.scale.set(0.8, 0.6, 0.5)
    group.add(rightCheek)

    // Ears
    const earGeo = new THREE.SphereGeometry(0.04, 8, 8)

    const leftEar = new THREE.Mesh(earGeo, skinMat)
    leftEar.position.set(-0.24, 0.1, 0.05)
    leftEar.scale.set(0.5, 0.8, 0.4)
    group.add(leftEar)

    const rightEar = new THREE.Mesh(earGeo, skinMat)
    rightEar.position.set(0.24, 0.1, 0.05)
    rightEar.scale.set(0.5, 0.8, 0.4)
    group.add(rightEar)

    // Visor placeholder for animation compatibility
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01))
    visor.visible = false
    visor.name = 'visor'
    group.add(visor)

    // Position head group (raised to sit properly above body)
    group.position.y = 1.1

    return group
  }

  private createBody(): THREE.Group {
    const group = new THREE.Group()

    const kimonoMat = new THREE.MeshStandardMaterial({
      color: COLORS.kimono,
      roughness: 0.85,
    })

    const kimonoAccentMat = new THREE.MeshStandardMaterial({
      color: COLORS.kimonoAccent,
      roughness: 0.8,
    })

    // Upper torso (V-neck showing skin)
    const torsoGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.35, 8)
    const torso = new THREE.Mesh(torsoGeo, kimonoMat)
    torso.position.y = 0.62
    group.add(torso)

    // Chest skin visible at V-neck
    const chestGeo = new THREE.SphereGeometry(0.12, 8, 8)
    const skinMat = new THREE.MeshStandardMaterial({
      color: COLORS.skin,
      roughness: 0.8,
    })
    const chest = new THREE.Mesh(chestGeo, skinMat)
    chest.position.set(0, 0.72, 0.08)
    chest.scale.set(1, 0.8, 0.5)
    group.add(chest)

    // Kimono collar/lapels (crossing V-shape)
    const collarGeo = new THREE.BoxGeometry(0.08, 0.25, 0.04)

    const leftCollar = new THREE.Mesh(collarGeo, kimonoAccentMat)
    leftCollar.position.set(-0.06, 0.7, 0.12)
    leftCollar.rotation.z = -0.3
    leftCollar.rotation.y = 0.2
    group.add(leftCollar)

    const rightCollar = new THREE.Mesh(collarGeo, kimonoAccentMat)
    rightCollar.position.set(0.06, 0.7, 0.12)
    rightCollar.rotation.z = 0.3
    rightCollar.rotation.y = -0.2
    group.add(rightCollar)

    // Lower torso
    const lowerTorsoGeo = new THREE.CylinderGeometry(0.22, 0.2, 0.2, 8)
    const lowerTorso = new THREE.Mesh(lowerTorsoGeo, kimonoMat)
    lowerTorso.position.y = 0.38
    group.add(lowerTorso)

    // Obi (wide decorative belt)
    const obiGeo = new THREE.CylinderGeometry(0.23, 0.24, 0.12, 12)
    const obiMat = new THREE.MeshStandardMaterial({
      color: COLORS.obi,
      roughness: 0.5,
    })
    const obi = new THREE.Mesh(obiGeo, obiMat)
    obi.position.y = 0.42
    group.add(obi)

    // Obi knot at back
    const knotGeo = new THREE.BoxGeometry(0.12, 0.1, 0.08)
    const knotMat = new THREE.MeshStandardMaterial({
      color: COLORS.obiAccent,
      roughness: 0.6,
    })
    const knot = new THREE.Mesh(knotGeo, knotMat)
    knot.position.set(0, 0.42, -0.22)
    group.add(knot)

    // Obi ribbon
    const ribbonGeo = new THREE.PlaneGeometry(0.08, 0.2)
    const ribbonMat = new THREE.MeshStandardMaterial({
      color: COLORS.obiAccent,
      roughness: 0.7,
      side: THREE.DoubleSide,
    })
    const ribbon = new THREE.Mesh(ribbonGeo, ribbonMat)
    ribbon.position.set(0, 0.3, -0.22)
    ribbon.rotation.x = 0.3
    group.add(ribbon)

    // Katana on back
    this.addKatana(group)

    // Shoulder pads (kimono puffs)
    const shoulderGeo = new THREE.SphereGeometry(0.1, 8, 8)

    const leftShoulder = new THREE.Mesh(shoulderGeo, kimonoMat)
    leftShoulder.position.set(-0.22, 0.72, 0)
    leftShoulder.scale.set(1, 0.8, 0.9)
    group.add(leftShoulder)

    const rightShoulder = new THREE.Mesh(shoulderGeo, kimonoMat)
    rightShoulder.position.set(0.22, 0.72, 0)
    rightShoulder.scale.set(1, 0.8, 0.9)
    group.add(rightShoulder)

    return group
  }

  private addKatana(group: THREE.Group): void {
    const katanaGroup = new THREE.Group()

    // Scabbard (saya)
    const scabbardGeo = new THREE.CylinderGeometry(0.025, 0.02, 0.65, 8)
    const scabbardMat = new THREE.MeshStandardMaterial({
      color: COLORS.leather,
      roughness: 0.4,
    })
    const scabbard = new THREE.Mesh(scabbardGeo, scabbardMat)
    katanaGroup.add(scabbard)

    // Scabbard tip (kojiri)
    const tipGeo = new THREE.SphereGeometry(0.025, 6, 6)
    const goldMat = new THREE.MeshStandardMaterial({
      color: COLORS.gold,
      metalness: 0.8,
      roughness: 0.2,
    })
    const tip = new THREE.Mesh(tipGeo, goldMat)
    tip.position.y = -0.32
    tip.scale.set(1, 0.5, 1)
    katanaGroup.add(tip)

    // Guard (tsuba)
    const guardGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.012, 12)
    const guard = new THREE.Mesh(guardGeo, goldMat)
    guard.position.y = 0.28
    katanaGroup.add(guard)

    // Handle wrap (tsuka)
    const handleGeo = new THREE.CylinderGeometry(0.028, 0.025, 0.16, 8)
    const handleMat = new THREE.MeshStandardMaterial({
      color: COLORS.wood,
      roughness: 0.9,
    })
    const handle = new THREE.Mesh(handleGeo, handleMat)
    handle.position.y = 0.38
    katanaGroup.add(handle)

    // Handle wrapping pattern (diamond pattern)
    const wrapMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.8,
    })
    for (let i = 0; i < 4; i++) {
      const wrapGeo = new THREE.BoxGeometry(0.06, 0.02, 0.04)
      const wrap = new THREE.Mesh(wrapGeo, wrapMat)
      wrap.position.y = 0.32 + i * 0.04
      wrap.rotation.y = (i % 2) * 0.5
      katanaGroup.add(wrap)
    }

    // Pommel (kashira)
    const pommelGeo = new THREE.SphereGeometry(0.03, 8, 8)
    const pommel = new THREE.Mesh(pommelGeo, goldMat)
    pommel.position.y = 0.47
    pommel.scale.set(1, 0.6, 1)
    katanaGroup.add(pommel)

    // Position katana diagonally on back
    katanaGroup.position.set(0.08, 0.65, -0.18)
    katanaGroup.rotation.x = 0.5
    katanaGroup.rotation.z = 0.35

    group.add(katanaGroup)
  }

  private createArm(isLeft: boolean): THREE.Group {
    const group = new THREE.Group()
    const x = isLeft ? -0.28 : 0.28

    const kimonoMat = new THREE.MeshStandardMaterial({
      color: COLORS.kimono,
      roughness: 0.85,
    })

    const skinMat = new THREE.MeshStandardMaterial({
      color: COLORS.skin,
      roughness: 0.8,
    })

    // Upper arm (sleeve)
    const upperArmGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.18, 6)
    const upperArm = new THREE.Mesh(upperArmGeo, kimonoMat)
    upperArm.position.y = 0
    group.add(upperArm)

    // Sleeve opening showing skin
    const skinShowGeo = new THREE.CylinderGeometry(0.055, 0.06, 0.05, 6)
    const skinShow = new THREE.Mesh(skinShowGeo, skinMat)
    skinShow.position.y = -0.12
    group.add(skinShow)

    // Lower arm (forearm - skin visible)
    const forearmGeo = new THREE.CylinderGeometry(0.045, 0.05, 0.16, 6)
    const forearm = new THREE.Mesh(forearmGeo, skinMat)
    forearm.position.y = -0.22
    group.add(forearm)

    // Hand
    const handGeo = new THREE.SphereGeometry(0.05, 8, 8)
    const hand = new THREE.Mesh(handGeo, skinMat)
    hand.position.y = -0.32
    hand.scale.set(1, 1.2, 0.8)
    group.add(hand)

    // Fingers suggestion
    const fingerGeo = new THREE.CylinderGeometry(0.015, 0.012, 0.06, 4)
    for (let i = 0; i < 4; i++) {
      const finger = new THREE.Mesh(fingerGeo, skinMat)
      const angle = ((i - 1.5) / 3) * 0.6
      finger.position.set(Math.sin(angle) * 0.03, -0.38, Math.cos(angle) * 0.02)
      finger.rotation.x = 0.3
      group.add(finger)
    }

    // Position arm at shoulder
    group.position.set(x, 0.68, 0)

    return group
  }

  private createLeg(isLeft: boolean): THREE.Group {
    const group = new THREE.Group()
    const x = isLeft ? -0.1 : 0.1

    const kimonoMat = new THREE.MeshStandardMaterial({
      color: COLORS.kimono,
      roughness: 0.85,
    })

    // Hakama-style pants (wide at top, narrow at bottom)
    const legGeo = new THREE.CylinderGeometry(0.06, 0.05, 0.35, 6)
    const leg = new THREE.Mesh(legGeo, kimonoMat)
    leg.position.y = 0.17
    group.add(leg)

    // Foot/sandal
    const footGeo = new THREE.BoxGeometry(0.08, 0.03, 0.12)
    const footMat = new THREE.MeshStandardMaterial({
      color: COLORS.wood,
      roughness: 0.9,
    })
    const foot = new THREE.Mesh(footGeo, footMat)
    foot.position.set(0, 0.01, 0.02)
    group.add(foot)

    // Sandal strap
    const strapGeo = new THREE.TorusGeometry(0.04, 0.008, 4, 8, Math.PI)
    const strapMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a })
    const strap = new THREE.Mesh(strapGeo, strapMat)
    strap.position.set(0, 0.03, 0.04)
    strap.rotation.x = Math.PI / 2
    group.add(strap)

    group.position.set(x, 0, 0)

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

  private resetPose(): void {
    // Reset head to base position
    this.head.position.y = this.headBaseY
    this.head.rotation.set(0, 0, 0)

    // Reset body
    this.body.position.y = 0
    this.body.rotation.set(0, 0, 0)

    // Reset arms
    this.leftArm.rotation.set(0, 0, 0)
    this.rightArm.rotation.set(0, 0, 0)

    // Reset legs
    this.leftLeg.rotation.set(0, 0, 0)
    this.rightLeg.rotation.set(0, 0, 0)
  }

  update(delta: number): void {
    this.animTime += delta
    const parts = this.getCharacterParts()

    if (this.state === 'walking' && this.targetPosition) {
      const direction = new THREE.Vector3()
        .subVectors(this.targetPosition, this.mesh.position)
        .normalize()
      const distance = this.mesh.position.distanceTo(this.targetPosition)

      if (distance > 0.1) {
        this.mesh.position.add(direction.multiplyScalar(this.moveSpeed * delta))

        // Dynamic walking animation
        const walkCycle = this.animTime * 10

        // Head bob (relative to base position)
        this.head.position.y = this.headBaseY + Math.sin(walkCycle) * 0.02

        // Arm swing
        this.leftArm.rotation.x = Math.sin(walkCycle) * 0.5
        this.rightArm.rotation.x = -Math.sin(walkCycle) * 0.5

        // Leg movement
        this.leftLeg.rotation.x = -Math.sin(walkCycle) * 0.3
        this.rightLeg.rotation.x = Math.sin(walkCycle) * 0.3

        // Slight body lean forward
        this.body.rotation.x = 0.05

        // Face movement direction
        const angle = Math.atan2(direction.x, direction.z)
        this.mesh.rotation.y = angle
      } else {
        this.mesh.position.copy(this.targetPosition)
        this.targetPosition = null
        this.resetPose()
        this.setState('idle')
      }
    } else if (this.state === 'idle') {
      // Subtle breathing and stance
      const breathe = Math.sin(this.animTime * 1.5) * 0.01
      this.body.position.y = breathe
      this.head.position.y = this.headBaseY + breathe * 0.5

      // Slight arm sway
      this.leftArm.rotation.z = Math.sin(this.animTime * 0.8) * 0.02 + 0.1
      this.rightArm.rotation.z = -Math.sin(this.animTime * 0.8) * 0.02 - 0.1

      // Update idle behaviors
      this.idleBehaviorManager.update(parts, delta)
    } else if (this.state === 'working') {
      // Update working behaviors
      this.workingBehaviorManager.update(parts, delta)
    } else if (this.state === 'thinking') {
      // Samurai contemplation pose
      const thinkCycle = this.animTime * 0.5
      this.head.rotation.z = Math.sin(thinkCycle) * 0.08
      this.head.rotation.x = -0.1

      // Arms crossed or relaxed
      this.leftArm.rotation.x = -0.3
      this.leftArm.rotation.z = 0.4
      this.rightArm.rotation.x = -0.3
      this.rightArm.rotation.z = -0.4
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

    // Reset pose when changing states (except to walking)
    if (state !== 'walking') {
      this.resetPose()
    }

    this.state = state

    if (state === 'working') {
      this.workingBehaviorManager.start(this.currentStation, parts)
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
  }

  playIdleBehavior(name: string): void {
    if (this.state !== 'idle') {
      this.setState('idle')
    }
    this.idleBehaviorManager.forcePlay(name, this.getCharacterParts())
  }

  /**
   * Make the samurai say something with a 3D speech bubble
   */
  say(text: string, duration = 3000): void {
    this.clearSpeechBubble()

    this.speechBubble = new THREE.Group()

    // Main bubble body (rounded box shape made from primitives)
    const bubbleWidth = Math.min(1.2, 0.3 + text.length * 0.025)
    const bubbleHeight = 0.35
    const bubbleDepth = 0.15

    // White bubble body
    const bodyGeo = new THREE.BoxGeometry(bubbleWidth, bubbleHeight, bubbleDepth)
    const bubbleMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.3,
      metalness: 0.05,
    })
    const body = new THREE.Mesh(bodyGeo, bubbleMat)
    this.speechBubble.add(body)

    // Rounded edges (cylinders at corners)
    const edgeRadius = 0.06
    const edgeGeo = new THREE.CylinderGeometry(edgeRadius, edgeRadius, bubbleDepth, 8)
    edgeGeo.rotateX(Math.PI / 2)

    const corners = [
      [-bubbleWidth / 2 + edgeRadius, bubbleHeight / 2 - edgeRadius, 0],
      [bubbleWidth / 2 - edgeRadius, bubbleHeight / 2 - edgeRadius, 0],
      [-bubbleWidth / 2 + edgeRadius, -bubbleHeight / 2 + edgeRadius, 0],
      [bubbleWidth / 2 - edgeRadius, -bubbleHeight / 2 + edgeRadius, 0],
    ]

    corners.forEach(([x, y, z]) => {
      const edge = new THREE.Mesh(edgeGeo, bubbleMat)
      edge.position.set(x, y, z)
      this.speechBubble!.add(edge)
    })

    // Speech bubble tail (cone pointing down)
    const tailGeo = new THREE.ConeGeometry(0.08, 0.2, 4)
    const tail = new THREE.Mesh(tailGeo, bubbleMat)
    tail.position.set(0, -bubbleHeight / 2 - 0.1, 0)
    tail.rotation.z = Math.PI
    this.speechBubble.add(tail)

    // Border/outline
    const borderMat = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.8,
    })
    const borderGeo = new THREE.BoxGeometry(
      bubbleWidth + 0.03,
      bubbleHeight + 0.03,
      bubbleDepth - 0.02
    )
    const border = new THREE.Mesh(borderGeo, borderMat)
    border.position.z = -0.01
    this.speechBubble.add(border)

    // Text as canvas texture on a plane
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    canvas.width = 512
    canvas.height = 128

    ctx.fillStyle = 'transparent'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.fillStyle = '#1a1a1a'
    ctx.font = 'bold 32px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // Word wrap
    const words = text.split(' ')
    let line = ''
    const lines: string[] = []
    const maxWidth = canvas.width - 40

    for (const word of words) {
      const testLine = line + word + ' '
      const metrics = ctx.measureText(testLine)
      if (metrics.width > maxWidth && line !== '') {
        lines.push(line.trim())
        line = word + ' '
      } else {
        line = testLine
      }
    }
    lines.push(line.trim())

    const lineHeight = 36
    const startY = canvas.height / 2 - ((lines.length - 1) * lineHeight) / 2
    lines.forEach((l, i) => {
      ctx.fillText(l, canvas.width / 2, startY + i * lineHeight)
    })

    const textTexture = new THREE.CanvasTexture(canvas)
    const textMat = new THREE.MeshBasicMaterial({
      map: textTexture,
      transparent: true,
      depthWrite: false,
    })
    const textPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(bubbleWidth - 0.1, bubbleHeight - 0.08),
      textMat
    )
    textPlane.position.z = bubbleDepth / 2 + 0.01
    this.speechBubble.add(textPlane)

    // Position bubble above head
    this.speechBubble.position.set(0, 2.2, 0.3)

    // Make bubble always face camera (billboarding) - set in update
    this.mesh.add(this.speechBubble)

    // Auto-clear after duration
    this.speechTimeout = window.setTimeout(() => {
      this.clearSpeechBubble()
    }, duration)
  }

  /**
   * Say a random phrase for the current mood
   */
  sayRandom(mood: 'idle' | 'working' | 'thinking' | 'success' | 'error' = 'idle'): void {
    const phrases = AfroSamurai.PHRASES[mood]
    const phrase = phrases[Math.floor(Math.random() * phrases.length)]
    this.say(phrase)
  }

  /**
   * Clear the speech bubble
   */
  private clearSpeechBubble(): void {
    if (this.speechTimeout) {
      clearTimeout(this.speechTimeout)
      this.speechTimeout = null
    }
    if (this.speechBubble) {
      this.mesh.remove(this.speechBubble)
      // Dispose all geometries and materials in the group
      this.speechBubble.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose()
          if (child.material instanceof THREE.Material) {
            if ((child.material as THREE.MeshBasicMaterial).map) {
              ;(child.material as THREE.MeshBasicMaterial).map?.dispose()
            }
            child.material.dispose()
          }
        }
      })
      this.speechBubble = null
    }
  }

  dispose(): void {
    this.clearSpeechBubble()
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
