/**
 * MCP Station Visuals
 *
 * Smaller, category-specific stations for dynamically discovered MCP tools.
 * These appear in an outer ring around regular stations.
 */

import * as THREE from 'three'
import type { MCPToolCategory } from '../../mcp'

/**
 * MCP category visual configurations
 */
export const MCP_STATION_CONFIGS: Record<
  MCPToolCategory,
  {
    label: string
    color: number
    icon: string // For future 2D icon overlays
  }
> = {
  browser: {
    label: 'Browser',
    color: 0x6366f1, // Indigo
    icon: '🌐',
  },
  database: {
    label: 'Database',
    color: 0x10b981, // Emerald
    icon: '🗃️',
  },
  filesystem: {
    label: 'Files',
    color: 0xf59e0b, // Amber
    icon: '📁',
  },
  search: {
    label: 'Search',
    color: 0x3b82f6, // Blue
    icon: '🔍',
  },
  memory: {
    label: 'Memory',
    color: 0x8b5cf6, // Purple
    icon: '🧠',
  },
  api: {
    label: 'API',
    color: 0x06b6d4, // Cyan
    icon: '🔌',
  },
  git: {
    label: 'Git',
    color: 0xf97316, // Orange
    icon: '📦',
  },
  ai: {
    label: 'AI',
    color: 0xec4899, // Pink
    icon: '🤖',
  },
  other: {
    label: 'MCP',
    color: 0x64748b, // Slate
    icon: '⚡',
  },
}

/**
 * Add browser automation station details (Playwright, Puppeteer, etc.)
 */
function addBrowserDetails(group: THREE.Group, color: number): void {
  const glowMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.6,
  })

  // Browser window frame
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.5, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.3 })
  )
  frame.position.set(0, 1.15, 0.3)
  group.add(frame)

  // Screen glow
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.35), glowMaterial)
  screen.position.set(0, 1.15, 0.33)
  group.add(screen)

  // Tab bar
  const tab = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.06, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x475569 })
  )
  tab.position.set(-0.05, 1.38, 0.33)
  group.add(tab)

  // Cursor icon
  const cursor = new THREE.Mesh(
    new THREE.ConeGeometry(0.04, 0.08, 4),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  )
  cursor.position.set(0.1, 1.1, 0.35)
  cursor.rotation.z = Math.PI / 4
  group.add(cursor)
}

/**
 * Add database station details
 */
function addDatabaseDetails(group: THREE.Group, color: number): void {
  const cylinderMaterial = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.4,
    roughness: 0.6,
  })

  // Stacked database cylinders
  for (let i = 0; i < 3; i++) {
    const cylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 0.15, 16),
      cylinderMaterial
    )
    cylinder.position.set(0, 1.0 + i * 0.18, 0)
    group.add(cylinder)

    // Ring separator
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.2, 0.02, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0x1e293b })
    )
    ring.position.set(0, 0.93 + i * 0.18, 0)
    ring.rotation.x = Math.PI / 2
    group.add(ring)
  }

  // Connection light
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.03, 8, 8),
    new THREE.MeshBasicMaterial({ color })
  )
  light.position.set(0.15, 1.5, 0.15)
  group.add(light)
}

/**
 * Add filesystem station details
 */
function addFilesystemDetails(group: THREE.Group, color: number): void {
  const folderMaterial = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.2,
    roughness: 0.7,
  })

  // File folder shape
  const folder = new THREE.Group()

  // Folder body
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.06), folderMaterial)
  body.position.set(0, 0, 0)
  folder.add(body)

  // Folder tab
  const tab = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.06), folderMaterial)
  tab.position.set(-0.12, 0.2, 0)
  folder.add(tab)

  folder.position.set(0, 1.1, 0.2)
  folder.rotation.x = -0.3
  group.add(folder)

  // Small file pages peeking out
  const pageMaterial = new THREE.MeshStandardMaterial({ color: 0xf1f5f9 })
  for (let i = 0; i < 2; i++) {
    const page = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.01), pageMaterial)
    page.position.set(0.02 * i, 1.05 + i * 0.02, 0.22 - i * 0.01)
    page.rotation.x = -0.3
    group.add(page)
  }
}

/**
 * Add search/documentation station details
 */
function addSearchDetails(group: THREE.Group, color: number): void {
  const lensMaterial = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.5,
    roughness: 0.3,
    transparent: true,
    opacity: 0.7,
  })

  // Magnifying glass lens
  const lens = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 8, 24), lensMaterial)
  lens.position.set(0, 1.25, 0.2)
  lens.rotation.x = 0.3
  group.add(lens)

  // Glass fill
  const glass = new THREE.Mesh(
    new THREE.CircleGeometry(0.12, 24),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    })
  )
  glass.position.set(0, 1.25, 0.2)
  glass.rotation.x = 0.3
  group.add(glass)

  // Handle
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.03, 0.25),
    new THREE.MeshStandardMaterial({ color: 0x78716c })
  )
  handle.position.set(0.12, 1.05, 0.28)
  handle.rotation.z = -Math.PI / 4
  handle.rotation.x = 0.3
  group.add(handle)
}

/**
 * Add memory/vector store station details
 */
function addMemoryDetails(group: THREE.Group, color: number): void {
  const neuronMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.8,
  })

  // Central node (brain-like hub)
  const hub = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 1), neuronMaterial)
  hub.position.set(0, 1.2, 0.1)
  group.add(hub)

  // Connecting nodes (neural network style)
  const nodePositions = [
    [0.2, 1.35, 0.15],
    [-0.18, 1.3, 0.05],
    [0.15, 1.05, 0.2],
    [-0.12, 1.1, 0.15],
    [0, 1.4, 0.0],
  ]

  for (const pos of nodePositions) {
    const node = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), neuronMaterial)
    node.position.set(pos[0], pos[1], pos[2])
    group.add(node)

    // Connection line to hub
    const points = [new THREE.Vector3(0, 1.2, 0.1), new THREE.Vector3(pos[0], pos[1], pos[2])]
    const lineGeom = new THREE.BufferGeometry().setFromPoints(points)
    const line = new THREE.Line(
      lineGeom,
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.4 })
    )
    group.add(line)
  }
}

/**
 * Add API station details
 */
function addAPIDetails(group: THREE.Group, color: number): void {
  const plugMaterial = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.6,
    roughness: 0.4,
  })

  // Plug body
  const plug = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.15), plugMaterial)
  plug.position.set(0, 1.15, 0.15)
  group.add(plug)

  // Plug prongs
  const prongMaterial = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    metalness: 0.8,
  })
  for (const x of [-0.08, 0.08]) {
    const prong = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.15, 0.02), prongMaterial)
    prong.position.set(x, 1.15, 0.24)
    group.add(prong)
  }

  // Data flow indicators
  const flowMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.6,
  })
  for (let i = 0; i < 3; i++) {
    const flow = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.02), flowMaterial)
    flow.position.set(-0.08 + i * 0.08, 1.0 - i * 0.05, 0.15)
    group.add(flow)
  }
}

/**
 * Add git station details
 */
function addGitDetails(group: THREE.Group, color: number): void {
  const branchMaterial = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.3,
    roughness: 0.6,
  })

  // Branch structure
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4), branchMaterial)
  trunk.position.set(0, 1.1, 0.1)
  group.add(trunk)

  // Branch nodes (commits)
  const commitMaterial = new THREE.MeshBasicMaterial({ color })
  const commitPositions = [
    [0, 0.95],
    [0, 1.1],
    [0, 1.25],
    [0.12, 1.2],
    [-0.1, 1.0],
  ]

  for (const [x, y] of commitPositions) {
    const commit = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), commitMaterial)
    commit.position.set(x, y, 0.1)
    group.add(commit)
  }

  // Branch lines
  const lineMaterial = new THREE.LineBasicMaterial({ color, linewidth: 2 })

  // Side branch
  const branchPoints = [new THREE.Vector3(0, 1.1, 0.1), new THREE.Vector3(0.12, 1.2, 0.1)]
  const branchLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(branchPoints),
    lineMaterial
  )
  group.add(branchLine)

  // Other branch
  const otherBranchPoints = [new THREE.Vector3(0, 1.0, 0.1), new THREE.Vector3(-0.1, 1.0, 0.1)]
  const otherBranchLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(otherBranchPoints),
    lineMaterial
  )
  group.add(otherBranchLine)
}

/**
 * Add AI station details
 */
function addAIDetails(group: THREE.Group, color: number): void {
  const sparkMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.9,
  })

  // Central AI "brain" orb
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 16, 16),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.3,
      metalness: 0.5,
      roughness: 0.3,
    })
  )
  orb.position.set(0, 1.2, 0.1)
  group.add(orb)

  // Orbiting particles
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2
    const radius = 0.25
    const particle = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), sparkMaterial)
    particle.position.set(
      Math.cos(angle) * radius,
      1.2 + Math.sin(angle * 2) * 0.1,
      0.1 + Math.sin(angle) * radius * 0.5
    )
    group.add(particle)
  }

  // Glow ring
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.2, 0.015, 8, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4 })
  )
  ring.position.set(0, 1.2, 0.1)
  ring.rotation.x = Math.PI / 2
  group.add(ring)
}

/**
 * Add generic MCP station details (for uncategorized tools)
 */
function addGenericDetails(group: THREE.Group, color: number): void {
  const boltMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.9,
  })

  // Lightning bolt shape (simplified)
  const shape = new THREE.Shape()
  shape.moveTo(0, 0.25)
  shape.lineTo(0.08, 0.1)
  shape.lineTo(0.02, 0.1)
  shape.lineTo(0.06, -0.15)
  shape.lineTo(-0.02, 0.02)
  shape.lineTo(0.02, 0.02)
  shape.lineTo(-0.04, 0.25)

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.02,
    bevelEnabled: false,
  })

  const bolt = new THREE.Mesh(geometry, boltMaterial)
  bolt.position.set(0, 1.1, 0.2)
  bolt.scale.setScalar(1.2)
  group.add(bolt)

  // Circular base highlight
  const circle = new THREE.Mesh(
    new THREE.CircleGeometry(0.2, 24),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
    })
  )
  circle.position.set(0, 0.85, 0.1)
  circle.rotation.x = -Math.PI / 2
  group.add(circle)
}

/**
 * Add MCP station details based on category
 */
export function addMCPStationDetails(group: THREE.Group, category: MCPToolCategory): void {
  const config = MCP_STATION_CONFIGS[category]
  const color = config.color

  switch (category) {
    case 'browser':
      addBrowserDetails(group, color)
      break
    case 'database':
      addDatabaseDetails(group, color)
      break
    case 'filesystem':
      addFilesystemDetails(group, color)
      break
    case 'search':
      addSearchDetails(group, color)
      break
    case 'memory':
      addMemoryDetails(group, color)
      break
    case 'api':
      addAPIDetails(group, color)
      break
    case 'git':
      addGitDetails(group, color)
      break
    case 'ai':
      addAIDetails(group, color)
      break
    case 'other':
    default:
      addGenericDetails(group, color)
      break
  }
}
