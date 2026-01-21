import { spawn, type ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import * as nodeProcess from 'process'

const OPENCODE_DEFAULT_PORT = 4096
const OPENCODE_HEALTH_CHECK_TIMEOUT = 10000

export interface OpenCodeServer {
  url: string
  port: number
  process: ChildProcess
}

export interface OpenCodeStartOptions {
  port?: number
  hostname?: string
  cwd?: string
  logLevel?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
}

export interface OpenCodeHealthResponse {
  healthy: boolean
  version: string
}

export class OpenCodeProcessManager {
  private servers = new Map<string, OpenCodeServer>()
  private portCounter = OPENCODE_DEFAULT_PORT + 1

  async startServer(options: OpenCodeStartOptions = {}): Promise<OpenCodeServer> {
    const port = options.port ?? OPENCODE_DEFAULT_PORT
    const hostname = options.hostname ?? '127.0.0.1'
    const cwd = options.cwd ?? nodeProcess.cwd()

    // Check if server already running on default port
    if (port === OPENCODE_DEFAULT_PORT) {
      try {
        const response = await fetch(`http://${hostname}:${port}/global/health`)
        if (response.ok) {
          const server: OpenCodeServer = {
            url: `http://${hostname}:${port}`,
            port,
            process: null as any,
          }
          return server
        }
      } catch {
        // Server not running, will start new one
      }
    }

    return new Promise((resolve, reject) => {
      const args = [
        'serve',
        '--port', port.toString(),
        '--hostname', hostname,
      ]

      if (options.logLevel) {
        args.push('--log-level', options.logLevel)
      }

      const childProcess = spawn('opencode', args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...nodeProcess.env,
          OPENCODE_AUTO_START: 'true',
        },
      })

      const serverId = randomUUID()
      let started = false

      const cleanup = () => {
        if (!started && childProcess.pid) {
          try {
            nodeProcess.kill(childProcess.pid)
          } catch {
            // Process may already be dead
          }
        }
      }

      childProcess.stdout?.on('data', (data: Buffer) => {
        const output = data.toString()
        if (output.includes('listening on') && !started) {
          started = true
          const server: OpenCodeServer = {
            url: `http://${hostname}:${port}`,
            port,
            process: childProcess,
          }
          this.servers.set(serverId, server)
          resolve(server)
        }
      })

      childProcess.stderr?.on('data', (data: Buffer) => {
        console.error('[OpenCode]', data.toString().trim())
      })

      childProcess.on('error', (error: Error) => {
        cleanup()
        reject(new Error(`Failed to start OpenCode server: ${error.message}`))
      })

      childProcess.on('exit', (code: number | null) => {
        if (!started && code !== 0) {
          reject(new Error(`OpenCode server exited with code ${code}`))
        }
        this.servers.delete(serverId)
      })

      setTimeout(() => {
        if (!started) {
          cleanup()
          reject(new Error('OpenCode server failed to start within timeout'))
        }
      }, OPENCODE_HEALTH_CHECK_TIMEOUT)
    })
  }

  async stopServer(serverId: string): Promise<void> {
    const server = this.servers.get(serverId)
    if (server) {
      await this.stopServerByRef(server)
      this.servers.delete(serverId)
    }
  }

  async stopServerByRef(server: OpenCodeServer): Promise<void> {
    return new Promise((resolve) => {
      try {
        if (server.process.pid) {
          nodeProcess.kill(server.process.pid)
        }
      } catch {
        // Process may already be dead
      }

      server.process.on('exit', () => {
        resolve()
      })

      setTimeout(() => {
        resolve()
      }, 2000)
    })
  }

  async stopAllServers(): Promise<void> {
    const promises = Array.from(this.servers.keys()).map(id => this.stopServer(id))
    await Promise.all(promises)
  }

  async healthCheck(server: OpenCodeServer): Promise<OpenCodeHealthResponse> {
    try {
      const response = await fetch(`${server.url}/global/health`)
      if (response.ok) {
        return await response.json() as OpenCodeHealthResponse
      }
      return { healthy: false, version: 'unknown' }
    } catch {
      return { healthy: false, version: 'unknown' }
    }
  }

  getServer(serverId: string): OpenCodeServer | undefined {
    return this.servers.get(serverId)
  }

  getAllServers(): Map<string, OpenCodeServer> {
    return new Map(this.servers)
  }

  private getNextPort(): number {
    while (this.isPortInUse(this.portCounter)) {
      this.portCounter++
    }
    return this.portCounter++
  }

  private isPortInUse(port: number): boolean {
    return Array.from(this.servers.values()).some(s => s.port === port)
  }
}

export const opencodeManager = new OpenCodeProcessManager()
