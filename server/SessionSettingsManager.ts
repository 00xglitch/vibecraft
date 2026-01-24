import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import { homedir } from 'os'
import type { ManagedSession } from '../shared/types.js'

export class SessionSettingsManager {
  private settingsDir: string

  constructor() {
    this.settingsDir = path.join(homedir(), '.vibecraft/sessions')
  }

  /** Get session-specific settings directory */
  getSessionDir(sessionId: string): string {
    return path.join(this.settingsDir, sessionId)
  }

  /** Get session settings file path */
  getSessionSettingsPath(sessionId: string): string {
    return path.join(this.getSessionDir(sessionId), 'settings.json')
  }

  /** Generate settings file for a session */
  async generateSessionSettings(session: ManagedSession): Promise<void> {
    const sessionDir = this.getSessionDir(session.id)
    await fs.mkdir(sessionDir, { recursive: true })

    const settings = {
      mcpServers: this.buildMCPServers(session.enabledMCPs || []),
      // Plugins would go here when implemented
    }

    const settingsPath = this.getSessionSettingsPath(session.id)
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2))

    console.log(`[SessionSettings] Generated settings for session ${session.id} at ${settingsPath}`)
  }

  /** Build MCP servers configuration */
  private buildMCPServers(enabledMCPs: string[]): Record<string, any> {
    const servers: Record<string, any> = {}

    // Load global settings to get server configurations
    const globalSettings = this.loadGlobalSettings()

    for (const mcpId of enabledMCPs) {
      if (globalSettings.mcpServers?.[mcpId]) {
        servers[mcpId] = globalSettings.mcpServers[mcpId]
      }
    }

    return servers
  }

  /** Load global Claude settings */
  private loadGlobalSettings(): any {
    try {
      const globalPath = path.join(homedir(), '.claude/settings.json')
      const content = fsSync.readFileSync(globalPath, 'utf-8')
      return JSON.parse(content)
    } catch {
      return {}
    }
  }

  /** Update session settings when MCP/plugin toggled */
  async updateSessionSettings(session: ManagedSession): Promise<void> {
    await this.generateSessionSettings(session)
  }

  /** Delete session settings */
  async deleteSessionSettings(sessionId: string): Promise<void> {
    const sessionDir = this.getSessionDir(sessionId)
    try {
      await fs.rm(sessionDir, { recursive: true, force: true })
      console.log(`[SessionSettings] Deleted settings for session ${sessionId}`)
    } catch (err) {
      console.error(`[SessionSettings] Failed to delete settings for session ${sessionId}:`, err)
    }
  }

  /** Check if session has custom settings */
  hasCustomSettings(sessionId: string): boolean {
    try {
      const settingsPath = this.getSessionSettingsPath(sessionId)
      return fsSync.existsSync(settingsPath)
    } catch {
      return false
    }
  }
}
