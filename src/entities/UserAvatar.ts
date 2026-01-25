import * as THREE from 'three'

export interface UserAvatarOptions {
  scale?: number
  color?: string // Default: #4A90E2 (professional blue)
  name?: string // Display above avatar
}

export type AvatarState = 'observing' | 'gesturing' | 'celebrating' | 'concerned'

export class UserAvatar {
  mesh: THREE.Group
  private body: THREE.Mesh
  private head: THREE.Mesh
  private leftArm: THREE.Mesh
  private rightArm: THREE.Mesh
  private platform: THREE.Mesh
  private nameLabel: THREE.Sprite
  private state: AvatarState
  private animationTime: number = 0

  constructor(options: UserAvatarOptions = {}) {
    this.mesh = new THREE.Group()
    this.state = 'observing'

    // Create elevated platform
    this.platform = this.createPlatform()
    this.mesh.add(this.platform)

    // Create human-like character
    const color = options.color || '#4A90E2'
    this.body = this.createBody(color)
    this.mesh.add(this.body)

    this.head = this.createHead()
    this.mesh.add(this.head)

    const arms = this.createArms(color)
    this.leftArm = arms.left
    this.rightArm = arms.right
    this.mesh.add(this.leftArm)
    this.mesh.add(this.rightArm)

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
      color: '#4A90E2',
      emissive: '#4A90E2',
      emissiveIntensity: 0.3,
      metalness: 0.5,
      roughness: 0.5,
    })
    const platform = new THREE.Mesh(geometry, material)
    platform.position.y = -0.15
    platform.receiveShadow = true
    platform.castShadow = false
    return platform
  }

  private createBody(color: string): THREE.Mesh {
    // Humanoid torso (cylinder)
    const geometry = new THREE.CylinderGeometry(0.3, 0.35, 1.2, 8)
    const material = new THREE.MeshStandardMaterial({ color })
    const body = new THREE.Mesh(geometry, material)
    body.position.y = 0.6
    body.castShadow = true
    return body
  }

  private createHead(): THREE.Mesh {
    // Simple head (sphere)
    const geometry = new THREE.SphereGeometry(0.25, 16, 16)
    const material = new THREE.MeshStandardMaterial({ color: '#FFD9B3' })
    const head = new THREE.Mesh(geometry, material)
    head.position.y = 1.4
    head.castShadow = true
    return head
  }

  private createArms(color: string): { left: THREE.Mesh; right: THREE.Mesh } {
    const armGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.8, 6)
    const armMaterial = new THREE.MeshStandardMaterial({ color })

    // Left arm
    const leftArm = new THREE.Mesh(armGeometry, armMaterial)
    leftArm.position.set(-0.45, 0.8, 0)
    leftArm.rotation.z = Math.PI / 6
    leftArm.castShadow = true

    // Right arm
    const rightArm = new THREE.Mesh(armGeometry, armMaterial.clone())
    rightArm.position.set(0.45, 0.8, 0)
    rightArm.rotation.z = -Math.PI / 6
    rightArm.castShadow = true

    return { left: leftArm, right: rightArm }
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

        // Arms raise up
        const angle = progress * Math.PI
        this.leftArm.rotation.z = Math.PI / 6 + Math.sin(angle) * 0.8
        this.rightArm.rotation.z = -Math.PI / 6 - Math.sin(angle) * 0.8

        // Platform pulses bright
        const pulse = 0.3 + Math.sin(progress * Math.PI * 4) * 0.2
        const platformMaterial = this.platform.material as THREE.MeshStandardMaterial
        platformMaterial.emissiveIntensity = pulse

        if (progress < 1) {
          requestAnimationFrame(animate)
        } else {
          // Reset
          this.leftArm.rotation.z = Math.PI / 6
          this.rightArm.rotation.z = -Math.PI / 6
          platformMaterial.emissiveIntensity = 0.3
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

        // Point right arm toward target
        this.rightArm.rotation.y = angle * progress
        this.rightArm.rotation.z = -Math.PI / 6 - progress * 0.5

        // Turn head toward target
        this.head.rotation.y = angle * progress * 0.5

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

              this.rightArm.rotation.y = angle * (1 - eased)
              this.rightArm.rotation.z = -Math.PI / 6 - 0.5 * (1 - eased)
              this.head.rotation.y = angle * 0.5 * (1 - eased)

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

        // Wave gesture - right arm
        const wave = Math.sin(progress * Math.PI * 3)
        this.rightArm.rotation.z = -Math.PI / 6 - wave * 0.4

        if (progress < 1) {
          requestAnimationFrame(animate)
        } else {
          this.rightArm.rotation.z = -Math.PI / 6
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

        // Head shake
        this.head.rotation.y = Math.sin(progress * Math.PI * 4) * 0.3

        if (progress < 1) {
          requestAnimationFrame(animate)
        } else {
          this.head.rotation.y = 0
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

        // Hand to chin
        this.rightArm.position.x = 0.45 + progress * -0.3
        this.rightArm.position.y = 0.8 + progress * 0.4
        this.rightArm.rotation.z = -Math.PI / 6 - progress * 0.8

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

    // Idle animation - subtle breathing motion
    if (this.state === 'observing') {
      const breathe = Math.sin(this.animationTime * 1.5) * 0.02
      this.body.scale.y = 1 + breathe

      // Gentle platform glow pulse
      const platformMaterial = this.platform.material as THREE.MeshStandardMaterial
      platformMaterial.emissiveIntensity = 0.3 + Math.sin(this.animationTime * 0.5) * 0.05
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
