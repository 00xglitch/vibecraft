import * as THREE from 'three'

export interface UserAvatarOptions {
  scale?: number
  color?: number // Default: 0x4A90E2 (professional blue)
  name?: string // Display above avatar
}

export type AvatarState = 'observing' | 'gesturing' | 'celebrating' | 'concerned'

export class UserAvatar {
  mesh: THREE.Group
  private platform: THREE.Mesh
  private holo: THREE.Group // Holographic figure
  private coreOrb: THREE.Mesh // Central glowing orb
  private rings: THREE.Mesh[] // Rotating rings
  private nameLabel: THREE.Sprite
  private state: AvatarState
  private animationTime: number = 0

  constructor(options: UserAvatarOptions = {}) {
    this.mesh = new THREE.Group()
    this.state = 'observing'
    this.rings = []

    // Create elevated platform
    this.platform = this.createPlatform()
    this.mesh.add(this.platform)

    // Create holographic figure
    const color = options.color || 0x4a90e2
    this.holo = this.createHolographicFigure(color)
    this.mesh.add(this.holo)

    // Create central orb
    this.coreOrb = this.createCoreOrb(color)
    this.mesh.add(this.coreOrb)

    // Create rotating rings
    this.createRotatingRings(color)

    // Create name label
    this.nameLabel = this.createNameLabel(options.name || 'Operator')
    this.mesh.add(this.nameLabel)

    // Position at world center, elevated
    this.mesh.position.set(0, 1.5, 0)
    this.mesh.renderOrder = 15 // Above zones (10) and Claude (10)

    // Apply scale
    if (options.scale) {
      this.mesh.scale.setScalar(options.scale)
    }
  }

  private createPlatform(): THREE.Mesh {
    const geometry = new THREE.CylinderGeometry(2.5, 2.5, 0.3, 6)
    const material = new THREE.MeshStandardMaterial({
      color: 0x4a90e2,
      emissive: 0x4a90e2,
      emissiveIntensity: 0.4,
      metalness: 0.7,
      roughness: 0.3,
      transparent: true,
      opacity: 0.8,
    })
    const platform = new THREE.Mesh(geometry, material)
    platform.position.y = -0.15
    platform.receiveShadow = true
    platform.castShadow = false
    return platform
  }

  private createHolographicFigure(color: number): THREE.Group {
    const group = new THREE.Group()

    // Wireframe humanoid silhouette
    const material = new THREE.MeshBasicMaterial({
      color,
      wireframe: true,
      transparent: true,
      opacity: 0.6,
    })

    // Torso
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 1.0, 8, 1), material)
    torso.position.y = 0.8
    group.add(torso)

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), material)
    head.position.y = 1.5
    group.add(head)

    // Shoulders
    const shoulderBar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 4), material)
    shoulderBar.rotation.z = Math.PI / 2
    shoulderBar.position.y = 1.2
    group.add(shoulderBar)

    return group
  }

  private createCoreOrb(color: number): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(0.15, 16, 16)
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.7,
      metalness: 0.9,
      roughness: 0.1,
    })
    const orb = new THREE.Mesh(geometry, material)
    orb.position.y = 1.5 // At head level
    orb.castShadow = false
    return orb
  }

  private createRotatingRings(color: number): void {
    // Create 3 orbital rings around the figure
    const ringMaterial = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.4,
    })

    for (let i = 0; i < 3; i++) {
      const radius = 0.8 + i * 0.2
      const points: THREE.Vector3[] = []
      const segments = 32
      for (let j = 0; j <= segments; j++) {
        const angle = (j / segments) * Math.PI * 2
        points.push(new THREE.Vector3(Math.cos(angle) * radius, 0.8, Math.sin(angle) * radius))
      }

      const geometry = new THREE.BufferGeometry().setFromPoints(points)
      const ring = new THREE.Line(geometry, ringMaterial)
      ring.rotation.x = Math.PI / 2 + (i * Math.PI) / 12 // Slight tilt each
      this.rings.push(ring as any)
      this.mesh.add(ring)
    }
  }

  private createNameLabel(name: string): THREE.Sprite {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')!
    canvas.width = 256
    canvas.height = 64

    context.font = 'bold 24px Arial'
    context.fillStyle = '#FFFFFF'
    context.textAlign = 'center'
    context.fillText(name, 128, 40)

    const texture = new THREE.CanvasTexture(canvas)
    const material = new THREE.SpriteMaterial({ map: texture })
    const sprite = new THREE.Sprite(material)
    sprite.scale.set(2, 0.5, 1)
    sprite.position.y = 2
    sprite.renderOrder = 20 // Always on top

    return sprite
  }

  // ============================================================================
  // Animation Methods
  // ============================================================================

  async celebrate(): Promise<void> {
    this.state = 'celebrating'
    const duration = 2000
    const startTime = Date.now()

    return new Promise<void>((resolve) => {
      const animate = () => {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / duration, 1)

        // Holo figure rises and spins
        const rise = Math.sin(progress * Math.PI) * 0.5
        this.holo.position.y = rise
        this.holo.rotation.y = progress * Math.PI * 2

        // Core orb pulses bright
        const pulse = 0.8 + Math.sin(progress * Math.PI * 6) * 0.3
        const orbMaterial = this.coreOrb.material as THREE.MeshStandardMaterial
        orbMaterial.emissiveIntensity = pulse

        // Rings spin faster
        this.rings.forEach((ring, i) => {
          ring.rotation.z = progress * Math.PI * 2 * (i + 1)
        })

        // Platform pulses
        const platformPulse = 0.4 + Math.sin(progress * Math.PI * 4) * 0.2
        const platformMaterial = this.platform.material as THREE.MeshStandardMaterial
        platformMaterial.emissiveIntensity = platformPulse

        if (progress < 1) {
          requestAnimationFrame(animate)
        } else {
          // Reset
          this.holo.position.y = 0
          this.holo.rotation.y = 0
          orbMaterial.emissiveIntensity = 0.8
          platformMaterial.emissiveIntensity = 0.4
          this.state = 'observing'
          resolve()
        }
      }
      animate()
    })
  }

  async directionGesture(targetPosition: THREE.Vector3): Promise<void> {
    this.state = 'gesturing'
    const duration = 1000
    const startTime = Date.now()

    // Calculate direction to target
    const direction = new THREE.Vector3().subVectors(targetPosition, this.mesh.position).normalize()
    const angle = Math.atan2(direction.x, direction.z)

    return new Promise<void>((resolve) => {
      const animate = () => {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / duration, 1)

        // Holo figure leans and points toward target
        this.holo.rotation.y = angle * progress

        // Orb brightens in direction
        const orbMaterial = this.coreOrb.material as THREE.MeshStandardMaterial
        orbMaterial.emissiveIntensity = 0.8 + progress * 0.4

        if (progress < 1) {
          requestAnimationFrame(animate)
        } else {
          // Hold for 500ms then reset
          setTimeout(() => {
            const resetDuration = 500
            const resetStart = Date.now()
            const resetAnimate = () => {
              const elapsed = Date.now() - resetStart
              const progress = Math.min(elapsed / resetDuration, 1)
              const eased = 1 - Math.pow(1 - progress, 3)

              this.holo.rotation.y = angle * (1 - eased)
              orbMaterial.emissiveIntensity = 1.2 - progress * 0.4

              if (progress < 1) {
                requestAnimationFrame(resetAnimate)
              } else {
                this.state = 'observing'
                resolve()
              }
            }
            resetAnimate()
          }, 500)
        }
      }
      animate()
    })
  }

  async beckon(): Promise<void> {
    this.state = 'gesturing'
    const duration = 1500
    const startTime = Date.now()

    return new Promise<void>((resolve) => {
      const animate = () => {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / duration, 1)

        // Rings pulse outward
        const scale = 1 + Math.sin(progress * Math.PI * 3) * 0.3
        this.rings.forEach((ring) => {
          ring.scale.setScalar(scale)
        })

        if (progress < 1) {
          requestAnimationFrame(animate)
        } else {
          this.rings.forEach((ring) => ring.scale.setScalar(1))
          this.state = 'observing'
          resolve()
        }
      }
      animate()
    })
  }

  async concernShake(): Promise<void> {
    this.state = 'concerned'
    const duration = 800
    const startTime = Date.now()

    return new Promise<void>((resolve) => {
      const animate = () => {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / duration, 1)

        // Holo figure shakes side to side
        this.holo.position.x = Math.sin(progress * Math.PI * 4) * 0.2

        // Orb flickers red
        const orbMaterial = this.coreOrb.material as THREE.MeshStandardMaterial
        const flicker = Math.random() > 0.5 ? 1 : 0
        orbMaterial.color.setHex(flicker ? 0xff4444 : 0x4a90e2)

        if (progress < 1) {
          requestAnimationFrame(animate)
        } else {
          this.holo.position.x = 0
          orbMaterial.color.setHex(0x4a90e2)
          this.state = 'observing'
          resolve()
        }
      }
      animate()
    })
  }

  async thinkingPose(): Promise<void> {
    this.state = 'gesturing'
    const duration = 1000
    const startTime = Date.now()

    return new Promise<void>((resolve) => {
      const animate = () => {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / duration, 1)

        // Orb rotates and dims slightly
        this.coreOrb.rotation.y = progress * Math.PI * 2
        const orbMaterial = this.coreOrb.material as THREE.MeshStandardMaterial
        orbMaterial.emissiveIntensity = 0.8 - progress * 0.2

        if (progress < 1) {
          requestAnimationFrame(animate)
        } else {
          // Hold pose
          setTimeout(() => {
            this.state = 'observing'
            resolve()
          }, 2000)
        }
      }
      animate()
    })
  }

  // ============================================================================
  // Core Interface Methods
  // ============================================================================

  update(deltaTime: number): void {
    this.animationTime += deltaTime

    // Idle animation when observing
    if (this.state === 'observing') {
      // Holo figure subtle float
      const float = Math.sin(this.animationTime * 1.2) * 0.03
      this.holo.position.y = float

      // Core orb gentle pulse
      const pulse = Math.sin(this.animationTime * 0.8) * 0.1
      const orbMaterial = this.coreOrb.material as THREE.MeshStandardMaterial
      orbMaterial.emissiveIntensity = 0.8 + pulse

      // Rings slow rotation
      this.rings.forEach((ring, i) => {
        ring.rotation.z += deltaTime * (0.2 + i * 0.1)
      })

      // Gentle platform glow pulse
      const platformMaterial = this.platform.material as THREE.MeshStandardMaterial
      platformMaterial.emissiveIntensity = 0.4 + Math.sin(this.animationTime * 0.5) * 0.05
    }
  }

  getPosition(): THREE.Vector3 {
    return this.mesh.position.clone()
  }

  setState(state: AvatarState): void {
    this.state = state
  }

  getState(): AvatarState {
    return this.state
  }
}
