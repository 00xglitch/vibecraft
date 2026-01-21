import { randomUUID } from 'crypto'
import { resolve } from 'path'
import { createOpencodeClient, OpencodeClient } from '@opencode-ai/sdk'
import type { ManagedSession, CreateSessionRequest } from '../../shared/types.js'
import { GitStatusManager } from '../GitStatusManager.js'
import { ProjectsManager } from '../ProjectsManager.js'
import { OpenCodeEventAdapter } from '../../src/api/OpenCodeEventAdapter.js'
import type { OpenCodeServer, OpenCodeProcessManager, OpenCodeHealthResponse } from '../OpenCodeProcessManager.js'

export interface OpenCodeSessionData {
  serverId: string
  eventSource?: EventSource
  abortController?: AbortController
  client?: OpencodeClient
  opencodeSessionId: string
}

export interface OpenCodeSessionDependencies {
  opencodeManager: OpenCodeProcessManager
  managedSessions: Map<string, ManagedSession>
  opencodeSessions: Map<string, OpenCodeSessionData>
  gitStatusManager: GitStatusManager
  projectsManager: ProjectsManager
  addEvent: (event: any) => void
  broadcastSessions: () => void
  saveSessions: () => void
  log: (message: string) => void
  debug: (message: string) => void
}

export async function sendPromptToOpenCodeSession(
  session: ManagedSession,
  prompt: string,
  dependencies: Pick<OpenCodeSessionDependencies, 'opencodeSessions' | 'log'>
): Promise<{ ok: boolean; error?: string }> {
  const sessionData = dependencies.opencodeSessions.get(session.id)
  if (!sessionData?.client) {
    return { ok: false, error: 'OpenCode client not initialized' }
  }

  const opencodeSession = session as ManagedSession & { providerID?: string; modelID?: string }

  try {
    const promptBody: any = {
      parts: [
        { type: 'text', text: prompt }
      ]
    }

    if (opencodeSession.providerID && opencodeSession.modelID) {
      promptBody.model = { providerID: opencodeSession.providerID, modelID: opencodeSession.modelID }
    } else if (opencodeSession.providerID) {
      promptBody.model = { providerID: opencodeSession.providerID }
    }

    await sessionData.client.session.prompt({
      path: { id: sessionData.opencodeSessionId },
      body: promptBody
    })
    session.lastActivity = Date.now()
    dependencies.log(`Prompt sent to OpenCode session ${session.name}: ${prompt.slice(0, 50)}...`)
    return { ok: true }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    dependencies.log(`Failed to send prompt to OpenCode session ${session.name}: ${msg}`)
    return { ok: false, error: msg }
  }
}

async function createOpencodeSessionInternal(
  serverUrl: string,
  title: string,
  dependencies: { debug: (message: string) => void }
): Promise<string> {
  try {
    const client = createOpencodeClient({ baseUrl: serverUrl })
    const session = await client.session.create({
      body: { title },
    })
    if (!session.data?.id) {
      throw new Error('Session created but no ID returned')
    }
    return session.data.id
  } catch (error) {
    dependencies.debug(`[OpenCode] Failed to create session: ${error}`)
    throw error
  }
}

async function subscribeToOpenCodeEvents(
  managedSessionId: string,
  serverUrl: string,
  opencodeSessionId: string,
  dependencies: {
    opencodeSessions: Map<string, OpenCodeSessionData>
    addEvent: (event: any) => void
    debug: (message: string) => void
  }
): Promise<void> {
  try {
    const client = createOpencodeClient({ baseUrl: serverUrl })
    const sessionData = dependencies.opencodeSessions.get(managedSessionId)
    if (sessionData) {
      sessionData.client = client
      sessionData.opencodeSessionId = opencodeSessionId
    }

    const result = await client.event.subscribe()
    const stream = result.stream

    const processStream = async () => {
      try {
        for await (const eventData of stream) {
          try {
            const vibecraftEvent = OpenCodeEventAdapter.adaptEvent(eventData as any, managedSessionId, '')
            if (vibecraftEvent) {
              dependencies.addEvent(vibecraftEvent)
            }
          } catch (e) {
            dependencies.debug(`Failed to parse OpenCode event: ${e}`)
          }
        }
      } catch (error) {
        console.error('[OpenCode] Event stream error:', error)
      }
    }

    processStream().catch((error) => {
      console.error('[OpenCode] Event stream processing failed:', error)
    })

  } catch (error) {
    console.error('[OpenCode] Failed to subscribe to events:', error)
  }
}

export async function createOpenCodeSession(
  options: CreateSessionRequest & { providerID?: string; modelID?: string },
  dependencies: OpenCodeSessionDependencies
): Promise<ManagedSession> {
  const id = randomUUID()
  let sessionCounter = 0
  const name = options.name || `OpenCode ${++sessionCounter}`

  const validateDirectoryPath = (path: string): string => {
    const resolved = resolve(path)
    return resolved
  }

  let cwd: string
  try {
    cwd = validateDirectoryPath(options.cwd || process.cwd())
  } catch (err) {
    throw err
  }

  try {
    const server = await dependencies.opencodeManager.startServer({
      cwd,
      hostname: '127.0.0.1',
    })

    const opencodeSessionId = await createOpencodeSessionInternal(server.url, name, { debug: dependencies.debug })

    const session: ManagedSession = {
      id,
      name,
      sessionType: 'opencode',
      opencodePort: server.port,
      opencodeSessionId,
      opencodeServerUrl: server.url,
      status: 'idle',
      createdAt: Date.now(),
      lastActivity: Date.now(),
      cwd,
      providerID: options.providerID,
      modelID: options.modelID,
    }

    dependencies.managedSessions.set(id, session)
    dependencies.opencodeSessions.set(id, { serverId: server.url, opencodeSessionId })

    await subscribeToOpenCodeEvents(id, server.url, opencodeSessionId, {
      opencodeSessions: dependencies.opencodeSessions,
      addEvent: dependencies.addEvent,
      debug: dependencies.debug
    })

    dependencies.log(`Created OpenCode session: ${name} (${id.slice(0, 8)}) -> ${server.url}`)

    if (cwd) {
      dependencies.gitStatusManager.track(id, cwd)
      dependencies.projectsManager.addProject(cwd, name)
    }

    dependencies.broadcastSessions()
    dependencies.saveSessions()

    return session
  } catch (error) {
    throw new Error(`Failed to create OpenCode session: ${error}`)
  }
}

export async function deleteOpenCodeSession(
  id: string,
  dependencies: Pick<OpenCodeSessionDependencies, 'managedSessions' | 'opencodeSessions' | 'opencodeManager' | 'gitStatusManager' | 'log' | 'broadcastSessions' | 'saveSessions'>
): Promise<boolean> {
  const session = dependencies.managedSessions.get(id)
  if (!session || session.sessionType !== 'opencode') {
    return false
  }

  try {
    const sessionData = dependencies.opencodeSessions.get(id)
    if (sessionData?.abortController) {
      sessionData.abortController.abort()
    }

    await dependencies.opencodeManager.stopServer(id)

    dependencies.opencodeSessions.delete(id)
    dependencies.managedSessions.delete(id)
    dependencies.gitStatusManager.untrack(id)

    dependencies.log(`Deleted OpenCode session: ${session.name} (${id.slice(0, 8)})`)
    dependencies.broadcastSessions()
    dependencies.saveSessions()

    return true
  } catch (error) {
    console.error('Failed to delete OpenCode session:', error)
    return false
  }
}

export async function restartOpenCodeSession(
  id: string,
  dependencies: Pick<OpenCodeSessionDependencies, 'managedSessions' | 'opencodeSessions' | 'opencodeManager' | 'log' | 'broadcastSessions' | 'saveSessions'>
): Promise<{ ok: boolean; error?: string }> {
  const session = dependencies.managedSessions.get(id)
  if (!session || session.sessionType !== 'opencode') {
    return { ok: false, error: 'Session not found or not an OpenCode session' }
  }

  try {
    let server = dependencies.opencodeManager.getServer(id)

    if (!server) {
      const newServer = await dependencies.opencodeManager.startServer({ cwd: session.cwd })
      session.opencodePort = newServer.port
      session.opencodeServerUrl = newServer.url
      server = newServer
    }

    const sessionData = dependencies.opencodeSessions.get(id)

    if (sessionData?.abortController) {
      sessionData.abortController.abort()
    }

    const client = createOpencodeClient({ baseUrl: session.opencodeServerUrl })
    const abortController = new AbortController()

    const existingSessionId = sessionData?.opencodeSessionId || session.opencodeSessionId
    let opencodeSessionId = existingSessionId
    if (!opencodeSessionId) {
      const createResult = await client.session.create({})
      opencodeSessionId = createResult.data?.id || randomUUID()
    }

    dependencies.opencodeSessions.set(id, {
      serverId: session.opencodeServerUrl,
      client,
      abortController,
      opencodeSessionId
    })

    session.opencodeSessionId = opencodeSessionId

    await subscribeToOpenCodeEvents(id, session.opencodeServerUrl, opencodeSessionId, {
      opencodeSessions: dependencies.opencodeSessions,
      addEvent: () => {},
      debug: () => {}
    })

    session.status = 'idle'
    session.lastActivity = Date.now()

    dependencies.log(`Restarted OpenCode session: ${session.name} (${id.slice(0, 8)})`)
    dependencies.broadcastSessions()
    dependencies.saveSessions()

    return { ok: true }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Failed to restart OpenCode session:', error)
    return { ok: false, error: msg }
  }
}

export function checkOpenCodeHealth(
  dependencies: Pick<OpenCodeSessionDependencies, 'managedSessions' | 'opencodeManager' | 'broadcastSessions'>
): void {
  for (const session of dependencies.managedSessions.values()) {
    if (session.sessionType === 'opencode') {
      const server = dependencies.opencodeManager.getServer(session.id)
      if (server) {
        dependencies.opencodeManager.healthCheck(server).then((health: OpenCodeHealthResponse) => {
          const newStatus = health.healthy ? session.status : 'offline'
          if (session.status !== newStatus) {
            session.status = newStatus
            dependencies.broadcastSessions()
          }
        })
      }
    }
  }
}
