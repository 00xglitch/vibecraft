import { IncomingMessage, ServerResponse } from 'http'
import { createOpencodeClient } from '@opencode-ai/sdk'
import type { ManagedSession, CreateSessionRequest } from '../../shared/types.js'
import type { OpenCodeServer, OpenCodeProcessManager } from '../OpenCodeProcessManager.js'
import type { OpenCodeSessionData } from './sessions.js'

export interface OpenCodeRoutesDependencies {
  opencodeManager: OpenCodeProcessManager
  managedSessions: Map<string, ManagedSession>
  opencodeSessions: Map<string, OpenCodeSessionData>
  createOpenCodeSession: (options: CreateSessionRequest) => Promise<ManagedSession>
  deleteOpenCodeSession: (id: string) => Promise<boolean>
  restartOpenCodeSession: (id: string) => Promise<{ ok: boolean; error?: string }>
  debug: (message: string) => void
}

export function registerOpenCodeRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: OpenCodeRoutesDependencies
): void {
  const { debug } = dependencies

  if (req.method === 'POST' && req.url === '/sessions/opencode') {
    collectRequestBody(req).then(body => {
      try {
        const options = JSON.parse(body)
        dependencies.createOpenCodeSession(options)
          .then((session) => {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true, session }))
          })
          .catch((error) => {
            debug(`Failed to create OpenCode session: ${error}`)
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: error.message }))
          })
      } catch (e) {
        debug(`Failed to parse session request: ${e}`)
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON' }))
      }
    }).catch(() => {
      res.writeHead(413, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Request body too large' }))
    })
    return
  }

  if (req.method === 'DELETE' && req.url?.startsWith('/sessions/opencode/')) {
    const id = req.url.split('/').pop()
    if (id) {
      dependencies.deleteOpenCodeSession(id)
        .then((success) => {
          res.writeHead(success ? 200 : 404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: success }))
        })
        .catch((error) => {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: error.message }))
        })
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Missing session ID' }))
    }
    return
  }

  if (req.method === 'GET' && req.url === '/opencode/providers') {
    const fetchProviders = async (): Promise<void> => {
      let server: OpenCodeServer | null = null
      try {
        debug(`[OpenCode] Fetching providers...`)
        const servers = Array.from(dependencies.opencodeManager.getAllServers().values())
        if (servers.length > 0) {
          server = servers[0]
          debug(`[OpenCode] Using existing server: ${server.url}`)
        } else {
          debug(`[OpenCode] No existing server, starting new one...`)
          server = await dependencies.opencodeManager.startServer({})
        }
        const client = createOpencodeClient({ baseUrl: server.url })
        debug(`[OpenCode] Calling provider.list()...`)
        const providers = await client.provider.list()
        debug(`[OpenCode] Provider list response structure: ${JSON.stringify(providers).substring(0, 500)}`)
        debug(`[OpenCode] Provider list data: ${JSON.stringify(providers.data).substring(0, 500)}`)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(providers.data ?? {}))
      } catch (error) {
        debug(`[OpenCode] Failed to list providers: ${error}`)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Failed to list providers', details: String(error) }))
      }
    }
    fetchProviders()
    return
  }

  if (req.method === 'GET' && req.url?.startsWith('/opencode/providers/')) {
    const match = req.url?.match(/^\/opencode\/providers\/([^/?]+)\/models/)
    const providerId = match?.[1]
    if (!providerId) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Missing provider ID' }))
      return
    }

    const fetchModels = async (): Promise<void> => {
      try {
        let server: OpenCodeServer | null = null
        const servers = Array.from(dependencies.opencodeManager.getAllServers().values())
        if (servers.length > 0) {
          server = servers[0]
        } else {
          server = await dependencies.opencodeManager.startServer({})
        }
        const client = createOpencodeClient({ baseUrl: server.url })
        const providers = await client.provider.list()
        const provider = (providers.data?.all ?? []).find((p: any) => p.id === providerId)
        if (!provider) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Provider not found' }))
          return
        }

        const models = Object.values(provider.models ?? {}).map((model: any) => ({
          id: model.id,
          name: model.name,
          capabilities: {
            reasoning: model.reasoning,
            tool_call: model.tool_call,
            attachment: model.attachment,
          },
          cost: model.cost,
          limit: model.limit,
          status: model.status,
        }))

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ provider: provider.name, models }))
      } catch (error) {
        debug(`Failed to list models for provider ${providerId}: ${error}`)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Failed to list models' }))
      }
    }
    fetchModels()
    return
  }
}

function collectRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk.toString()
      if (body.length > 1e6) {
        reject(new Error('Request body too large'))
      }
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}
