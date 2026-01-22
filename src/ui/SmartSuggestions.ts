/**
 * SmartSuggestions - Context-aware prompt suggestions based on Claude Code events
 *
 * Analyzes recent events to provide intelligent quick-action chips that help
 * users interact more efficiently with their Claude sessions.
 */

import type { ClaudeEvent } from '../../shared/types'

export interface Suggestion {
  id: string
  text: string
  prompt: string
  icon: string
  priority: number // Higher = more relevant
  expiresAt?: number // Timestamp when suggestion becomes stale
}

// Common suggestions always available
const COMMON_SUGGESTIONS: Suggestion[] = [
  { id: 'status', text: 'Status', prompt: 'What is the current status?', icon: '📊', priority: 1 },
  { id: 'continue', text: 'Continue', prompt: 'Continue with the current task', icon: '▶️', priority: 2 },
  { id: 'explain', text: 'Explain', prompt: 'Can you explain what you just did?', icon: '💡', priority: 1 },
]

// Event-specific suggestion templates
const EVENT_SUGGESTIONS: Record<string, (event: ClaudeEvent) => Suggestion[]> = {
  // After a bash command fails
  bash_error: (_event) => [
    { id: 'retry-bash', text: 'Run again', prompt: 'Run the command again', icon: '🔄', priority: 8 },
    { id: 'fix-cmd', text: 'Fix command', prompt: 'Fix the command and try again', icon: '🔧', priority: 7 },
  ],

  // After a successful bash command
  bash_success: (event) => {
    const input = (event as any).input?.command || ''
    const suggestions: Suggestion[] = []

    if (input.includes('test') || input.includes('jest') || input.includes('vitest')) {
      suggestions.push({ id: 'run-tests', text: 'Run tests again', prompt: 'Run the tests again', icon: '🧪', priority: 6 })
    }
    if (input.includes('build')) {
      suggestions.push({ id: 'deploy', text: 'Deploy', prompt: 'Deploy the build', icon: '🚀', priority: 5 })
    }
    if (input.includes('git')) {
      suggestions.push({ id: 'git-status', text: 'Git status', prompt: 'Show git status', icon: '📝', priority: 5 })
    }

    return suggestions
  },

  // After file read
  file_read: (event) => {
    const filePath = (event as any).input?.file_path || ''
    const fileName = filePath.split('/').pop() || 'this file'
    return [
      { id: 'edit-file', text: `Edit ${fileName}`, prompt: `Edit the file ${fileName}`, icon: '✏️', priority: 6 },
      { id: 'find-refs', text: 'Find references', prompt: `Find all references to functions in ${fileName}`, icon: '🔍', priority: 4 },
    ]
  },

  // After file edit
  file_edit: (event) => {
    const filePath = (event as any).input?.file_path || ''
    const fileName = filePath.split('/').pop() || 'this file'
    return [
      { id: 'run-tests', text: 'Run tests', prompt: 'Run tests to verify the changes', icon: '🧪', priority: 7 },
      { id: 'review', text: 'Review changes', prompt: `Show me the changes made to ${fileName}`, icon: '👀', priority: 5 },
    ]
  },

  // After error
  error: (_event) => [
    { id: 'fix-error', text: 'Fix error', prompt: 'Please fix this error', icon: '🔧', priority: 9 },
    { id: 'explain-error', text: 'Explain error', prompt: 'Can you explain what caused this error?', icon: '❓', priority: 7 },
    { id: 'rollback', text: 'Undo changes', prompt: 'Undo the recent changes that caused this error', icon: '↩️', priority: 6 },
  ],

  // After stop (Claude finished responding)
  stop: (event) => {
    const reason = (event as any).reason || ''
    const suggestions: Suggestion[] = [
      { id: 'continue', text: 'Continue', prompt: 'Continue', icon: '▶️', priority: 8 },
    ]

    if (reason === 'end_turn') {
      suggestions.push({ id: 'next-step', text: 'Next step', prompt: 'What should we do next?', icon: '➡️', priority: 7 })
    }

    return suggestions
  },

  // After successful task completion
  task_complete: (_event) => [
    { id: 'verify', text: 'Verify', prompt: 'Verify that the task was completed correctly', icon: '✅', priority: 6 },
    { id: 'commit', text: 'Commit', prompt: 'Commit these changes with an appropriate message', icon: '💾', priority: 5 },
  ],

  // After search/grep
  search: (_event) => [
    { id: 'narrow', text: 'Refine search', prompt: 'Refine the search to narrow down results', icon: '🎯', priority: 5 },
    { id: 'read-first', text: 'Read first result', prompt: 'Read the first matching file', icon: '📖', priority: 6 },
  ],
}

export class SmartSuggestions {
  private container: HTMLElement | null = null
  private suggestions: Suggestion[] = []
  private recentEvents: { event: ClaudeEvent; timestamp: number }[] = []
  private onSelect: ((prompt: string) => void) | null = null
  private maxEvents = 10
  private suggestionLifetimeMs = 30000 // Suggestions expire after 30 seconds

  init(containerId: string, onSelect: (prompt: string) => void): void {
    this.container = document.getElementById(containerId)
    this.onSelect = onSelect
    this.render()
  }

  /**
   * Process a new event and update suggestions accordingly
   */
  processEvent(event: ClaudeEvent): void {
    const now = Date.now()

    // Add event to recent history
    this.recentEvents.push({ event, timestamp: now })

    // Keep only recent events
    this.recentEvents = this.recentEvents.filter(
      e => now - e.timestamp < this.suggestionLifetimeMs
    ).slice(-this.maxEvents)

    // Generate new suggestions
    this.updateSuggestions()
  }

  private updateSuggestions(): void {
    const now = Date.now()
    const newSuggestions: Suggestion[] = []
    const seenIds = new Set<string>()

    // Process recent events (newest first)
    for (const { event, timestamp } of [...this.recentEvents].reverse()) {
      const age = now - timestamp
      const freshness = 1 - (age / this.suggestionLifetimeMs) // 1.0 = brand new, 0 = about to expire

      let eventSuggestions: Suggestion[] = []

      // Determine event type and get relevant suggestions
      if (event.type === 'post_tool_use') {
        const tool = (event as any).tool
        const success = (event as any).success

        if (tool === 'Bash') {
          eventSuggestions = success
            ? EVENT_SUGGESTIONS.bash_success(event)
            : EVENT_SUGGESTIONS.bash_error(event)
        } else if (tool === 'Read') {
          eventSuggestions = EVENT_SUGGESTIONS.file_read(event)
        } else if (tool === 'Edit' || tool === 'Write') {
          eventSuggestions = EVENT_SUGGESTIONS.file_edit(event)
        } else if (tool === 'Grep' || tool === 'Glob') {
          eventSuggestions = EVENT_SUGGESTIONS.search(event)
        }

        // Add error suggestions if tool failed
        if (!success) {
          eventSuggestions = [...eventSuggestions, ...EVENT_SUGGESTIONS.error(event)]
        }
      } else if (event.type === 'stop') {
        eventSuggestions = EVENT_SUGGESTIONS.stop(event)
      }

      // Add suggestions with freshness-adjusted priority and expiration
      for (const suggestion of eventSuggestions) {
        if (!seenIds.has(suggestion.id)) {
          seenIds.add(suggestion.id)
          newSuggestions.push({
            ...suggestion,
            priority: Math.round(suggestion.priority * freshness),
            expiresAt: timestamp + this.suggestionLifetimeMs,
          })
        }
      }
    }

    // Add common suggestions with lower priority
    for (const suggestion of COMMON_SUGGESTIONS) {
      if (!seenIds.has(suggestion.id)) {
        seenIds.add(suggestion.id)
        newSuggestions.push({ ...suggestion })
      }
    }

    // Sort by priority (highest first) and take top suggestions
    this.suggestions = newSuggestions
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 6) // Max 6 visible suggestions

    this.render()
  }

  private render(): void {
    if (!this.container) return

    // Clear existing content safely
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild)
    }

    if (this.suggestions.length === 0) {
      this.container.classList.add('hidden')
      return
    }

    this.container.classList.remove('hidden')

    // Create chips using safe DOM methods
    for (const suggestion of this.suggestions) {
      const chip = document.createElement('button')
      chip.className = `suggestion-chip${suggestion.priority >= 7 ? ' suggestion-highlight' : ''}`
      chip.title = suggestion.prompt

      const iconSpan = document.createElement('span')
      iconSpan.className = 'suggestion-icon'
      iconSpan.textContent = suggestion.icon

      const textSpan = document.createElement('span')
      textSpan.className = 'suggestion-text'
      textSpan.textContent = suggestion.text

      chip.appendChild(iconSpan)
      chip.appendChild(textSpan)

      // Add click handler with captured prompt value
      const promptValue = suggestion.prompt
      chip.addEventListener('click', () => {
        if (this.onSelect) {
          this.onSelect(promptValue)
        }
      })

      this.container.appendChild(chip)
    }
  }

  /**
   * Clear all event-based suggestions, keeping only common ones
   */
  clear(): void {
    this.recentEvents = []
    this.suggestions = [...COMMON_SUGGESTIONS]
    this.render()
  }

  /**
   * Add a custom suggestion programmatically
   */
  addSuggestion(suggestion: Omit<Suggestion, 'expiresAt'>): void {
    // Remove existing suggestion with same ID
    this.suggestions = this.suggestions.filter(s => s.id !== suggestion.id)

    // Add new suggestion at appropriate position
    this.suggestions.push({
      ...suggestion,
      expiresAt: Date.now() + this.suggestionLifetimeMs,
    })

    this.suggestions.sort((a, b) => b.priority - a.priority)
    this.suggestions = this.suggestions.slice(0, 6)

    this.render()
  }
}

// Singleton instance
export const smartSuggestions = new SmartSuggestions()
