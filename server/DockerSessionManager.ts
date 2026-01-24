import Docker from 'dockerode'
import path from 'path'
import { homedir } from 'os'
import type { ManagedSession } from '../shared/types.js'

export class DockerSessionManager {
  private docker: Docker
  private containerMap: Map<string, string> // sessionId -> containerId

  constructor() {
    // Auto-detect Docker socket (works on Linux/Mac/Windows)
    this.docker = new Docker()
    this.containerMap = new Map()
  }

  /** Create container for a session */
  async createSessionContainer(
    session: ManagedSession,
    options: {
      workspace: string // Host path to mount
      apiKey: string // ANTHROPIC_API_KEY
      network?: string // Docker network (default: vibecraft-net)
      memory?: string // Memory limit (default: 1G)
    }
  ): Promise<string> {
    // Path to session-specific settings directory
    const sessionSettingsDir = path.join(homedir(), '.vibecraft/sessions', session.id)
    const settingsPath = `/root/.vibecraft/sessions/${session.id}/settings.json`

    let container
    try {
      container = await this.docker.createContainer({
        Image: 'vibecraft-claude:latest',
        name: `vibecraft-session-${session.id}`,
        Env: [
          `ANTHROPIC_API_KEY=${options.apiKey}`,
          `VIBECRAFT_WS_NOTIFY=http://vibecraft-hub:4003/event`,
          `VIBECRAFT_DATA_DIR=/root/.vibecraft/data`,
          `SESSION_ID=${session.id}`,
          `SESSION_NAME=${session.name}`,
          `SESSION_SETTINGS_PATH=${settingsPath}`,
        ],
        HostConfig: {
          Binds: [
            `${options.workspace}:/workspace:rw`,
            'vibecraft-shared:/root/.vibecraft/data:rw',
            // Mount session-specific settings (read-only for safety)
            `${sessionSettingsDir}:/root/.vibecraft/sessions/${session.id}:ro`,
          ],
          Memory: this.parseMemory(options.memory || '1G'),
          NetworkMode: options.network || 'vibecraft-net',
          RestartPolicy: { Name: 'unless-stopped' },
        },
        WorkingDir: '/workspace',
        Tty: true,
        OpenStdin: true,
      })
    } catch (err: any) {
      // Check if it's a missing image error
      if (err.statusCode === 404 && err.message?.includes('No such image')) {
        throw new Error(
          'Docker image "vibecraft-claude:latest" not found. ' +
            'Please build the image first:\n' +
            '  docker build -f Dockerfile.claude -t vibecraft-claude:latest .\n' +
            'Or run: bash build-docker-image.sh'
        )
      }
      throw err
    }

    await container.start()
    this.containerMap.set(session.id, container.id)
    return container.id
  }

  /** Execute Claude command in container */
  async startClaudeInContainer(
    sessionId: string,
    tmuxSession: string,
    claudeCommand: string,
    args: string[]
  ): Promise<void> {
    const containerId = this.containerMap.get(sessionId)
    if (!containerId) throw new Error('Container not found')

    const container = this.docker.getContainer(containerId)

    // Start Claude in tmux inside the container with session-specific settings
    const cmd = [
      'tmux',
      'new-session',
      '-d',
      '-s',
      tmuxSession,
      'bash',
      '-c',
      `${claudeCommand} --settings "$SESSION_SETTINGS_PATH" ${args.join(' ')}`,
    ]

    const exec = await container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
    })

    await exec.start({ Detach: true })
  }

  /** Get container logs */
  async getContainerLogs(sessionId: string, tail: number = 100): Promise<string> {
    const containerId = this.containerMap.get(sessionId)
    if (!containerId) throw new Error('Container not found')

    const container = this.docker.getContainer(containerId)
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail,
      timestamps: true,
    })

    return logs.toString()
  }

  /** Check container health */
  async isContainerRunning(sessionId: string): Promise<boolean> {
    const containerId = this.containerMap.get(sessionId)
    if (!containerId) return false

    try {
      const container = this.docker.getContainer(containerId)
      const info = await container.inspect()
      return info.State.Running
    } catch {
      return false
    }
  }

  /** Stop container */
  async stopContainer(sessionId: string): Promise<void> {
    const containerId = this.containerMap.get(sessionId)
    if (!containerId) return

    const container = this.docker.getContainer(containerId)
    await container.stop({ t: 10 }) // 10 second grace period
    await container.remove({ force: true })
    this.containerMap.delete(sessionId)
  }

  /** Cleanup orphaned containers */
  async cleanupOrphanedContainers(): Promise<void> {
    const containers = await this.docker.listContainers({
      all: true,
      filters: { name: ['vibecraft-session-'] },
    })

    for (const info of containers) {
      const sessionId = this.extractSessionId(info.Names[0])
      if (!this.containerMap.has(sessionId)) {
        const container = this.docker.getContainer(info.Id)
        await container.remove({ force: true })
      }
    }
  }

  /** Get Docker instance for advanced operations */
  get dockerClient(): Docker {
    return this.docker
  }

  private parseMemory(size: string): number {
    const match = size.match(/^(\d+)([GMK]?)$/i)
    if (!match) return 1024 * 1024 * 1024 // 1GB default

    const value = parseInt(match[1], 10)
    const unit = match[2].toUpperCase()

    const multipliers: Record<string, number> = {
      G: 1024 * 1024 * 1024,
      M: 1024 * 1024,
      K: 1024,
    }
    return value * (multipliers[unit] || 1)
  }

  private extractSessionId(containerName: string): string {
    return containerName.replace('/vibecraft-session-', '')
  }
}
