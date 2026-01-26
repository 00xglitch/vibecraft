import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import type { AgentMessage } from '../shared/types.js'

/**
 * Persistent message queue for agent-to-agent communication.
 *
 * Features:
 * - In-memory queue for fast access
 * - Automatic persistence to disk for restart survival
 * - Batched writes to minimize I/O
 * - Simple file-based storage (no external services required)
 *
 * Future: Could be swapped with MQTT/RabbitMQ/Kafka for distributed deployments
 * without changing the API.
 */
export class MessageQueue {
  private queues: Map<string, AgentMessage[]> = new Map()
  private queueFilePath: string
  private saveTimer: NodeJS.Timeout | null = null
  private dirty = false

  constructor(dataDir?: string) {
    const baseDir = dataDir || path.join(os.homedir(), '.vibecraft', 'data')
    this.queueFilePath = path.join(baseDir, 'message-queue.json')
  }

  /** Load queues from disk on startup */
  async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.queueFilePath, 'utf-8')
      const parsed = JSON.parse(data)

      // Reconstruct Map from JSON object
      this.queues = new Map(Object.entries(parsed.queues || {}))

      console.log(`[MessageQueue] Loaded ${this.queues.size} queues from disk`)
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.error('[MessageQueue] Error loading queues:', err)
      }
      // File doesn't exist yet - that's fine
    }
  }

  /** Queue a message for a session */
  enqueue(sessionId: string, message: AgentMessage): void {
    if (!this.queues.has(sessionId)) {
      this.queues.set(sessionId, [])
    }

    this.queues.get(sessionId)!.push(message)
    this.markDirty()

    console.log(
      `[MessageQueue] Queued message ${message.id} for ${sessionId} (${this.queues.get(sessionId)!.length} in queue)`
    )
  }

  /** Dequeue all messages for a session */
  dequeue(sessionId: string): AgentMessage[] {
    const messages = this.queues.get(sessionId) || []

    if (messages.length > 0) {
      this.queues.delete(sessionId)
      this.markDirty()
      console.log(`[MessageQueue] Dequeued ${messages.length} messages for ${sessionId}`)
    }

    return messages
  }

  /** Get queued messages without removing them */
  peek(sessionId: string): AgentMessage[] {
    return this.queues.get(sessionId) || []
  }

  /** Get queue length for a session */
  getLength(sessionId: string): number {
    return this.queues.get(sessionId)?.length || 0
  }

  /** Get all non-empty queues */
  getAllQueues(): Map<string, AgentMessage[]> {
    return new Map(this.queues)
  }

  /** Clear queue for a session */
  clear(sessionId: string): void {
    if (this.queues.has(sessionId)) {
      this.queues.delete(sessionId)
      this.markDirty()
    }
  }

  /** Mark queue as dirty (needs saving) and schedule save */
  private markDirty(): void {
    this.dirty = true

    // Debounce saves - only save after 2 seconds of no changes
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
    }

    this.saveTimer = setTimeout(() => {
      this.save().catch(console.error)
    }, 2000)
  }

  /** Save queues to disk */
  async save(): Promise<void> {
    if (!this.dirty) return

    try {
      // Convert Map to plain object for JSON serialization
      const data = {
        queues: Object.fromEntries(this.queues),
        savedAt: Date.now(),
      }

      await fs.writeFile(this.queueFilePath, JSON.stringify(data, null, 2), 'utf-8')
      this.dirty = false
      console.log(`[MessageQueue] Saved ${this.queues.size} queues to disk`)
    } catch (err) {
      console.error('[MessageQueue] Error saving queues:', err)
    }
  }

  /** Force immediate save */
  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    await this.save()
  }

  /** Get statistics */
  getStats(): {
    totalQueues: number
    totalMessages: number
    queueLengths: Record<string, number>
  } {
    let totalMessages = 0
    const queueLengths: Record<string, number> = {}

    for (const [sessionId, messages] of this.queues) {
      const len = messages.length
      queueLengths[sessionId] = len
      totalMessages += len
    }

    return {
      totalQueues: this.queues.size,
      totalMessages,
      queueLengths,
    }
  }
}
