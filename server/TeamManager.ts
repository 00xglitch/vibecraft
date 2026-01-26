import type { Team, ManagedSession, AgentRole, SharedMemory } from '../shared/types.js'

/**
 * TeamManager handles multi-agent team coordination
 *
 * Teams allow multiple Claude instances to work together on tasks with:
 * - Role-based collaboration (coordinator, researcher, coder, reviewer, etc.)
 * - Shared memory for context synchronization
 * - Agent-to-agent messaging (handled separately in server/index.ts)
 */
export class TeamManager {
  private teams: Map<string, Team> = new Map()
  private sharedMemories: Map<string, SharedMemory> = new Map()
  private teamCounter = 0

  /**
   * Create a new team with a coordinator
   *
   * @param coordinatorSession - Session to act as team coordinator
   * @param goal - What the team is working toward
   * @param name - Optional team name (defaults to "Team N")
   * @returns The created team
   */
  createTeam(coordinatorSession: ManagedSession, goal: string, name?: string): Team {
    const teamId = `team-${++this.teamCounter}`
    const memoryId = `mem-${teamId}`

    const team: Team = {
      id: teamId,
      name: name || `Team ${this.teamCounter}`,
      goal,
      sessions: [coordinatorSession.id],
      coordinatorId: coordinatorSession.id,
      sharedMemoryId: memoryId,
      createdAt: Date.now(),
      status: 'active',
    }

    const memory: SharedMemory = {
      id: memoryId,
      teamId,
      entries: [],
    }

    this.teams.set(teamId, team)
    this.sharedMemories.set(memoryId, memory)

    // Update coordinator session
    coordinatorSession.teamId = teamId
    coordinatorSession.isCoordinator = true
    coordinatorSession.agentRole = 'coordinator'
    coordinatorSession.sharedMemoryId = memoryId
    coordinatorSession.teamMembers = [coordinatorSession.id]

    console.log(
      `Created team ${teamId} (${team.name}) with coordinator ${coordinatorSession.id.slice(0, 8)}`
    )

    return team
  }

  /**
   * Add an agent to an existing team
   *
   * @param teamId - Team to add agent to
   * @param session - Session to add as team member
   * @param role - Role for this agent
   * @returns true if added successfully
   */
  addAgentToTeam(teamId: string, session: ManagedSession, role: AgentRole): boolean {
    const team = this.teams.get(teamId)
    if (!team) {
      console.warn(`Cannot add agent: team ${teamId} not found`)
      return false
    }

    // Add to team sessions
    team.sessions.push(session.id)

    // Update session metadata
    session.teamId = teamId
    session.agentRole = role
    session.isCoordinator = false
    session.sharedMemoryId = team.sharedMemoryId
    session.teamMembers = [...team.sessions]

    // Update all team members with new member list
    this.broadcastTeamUpdate(teamId)

    console.log(`Added agent ${session.id.slice(0, 8)} (${role}) to team ${teamId}`)

    return true
  }

  /**
   * Remove an agent from a team
   *
   * @param sessionId - Session ID to remove
   */
  removeAgentFromTeam(sessionId: string): void {
    const team = Array.from(this.teams.values()).find((t) => t.sessions.includes(sessionId))
    if (!team) return

    // Remove from team
    team.sessions = team.sessions.filter((id) => id !== sessionId)

    console.log(`Removed agent ${sessionId.slice(0, 8)} from team ${team.id}`)

    if (team.sessions.length === 0) {
      // Disband team - no members left
      this.teams.delete(team.id)
      this.sharedMemories.delete(team.sharedMemoryId)
      console.log(`Disbanded team ${team.id} (no members remaining)`)
    } else if (team.coordinatorId === sessionId) {
      // Promote new coordinator
      const newCoordinatorId = team.sessions[0]
      team.coordinatorId = newCoordinatorId
      console.log(`Promoted ${newCoordinatorId.slice(0, 8)} to coordinator of team ${team.id}`)
    }

    this.broadcastTeamUpdate(team.id)
  }

  /**
   * Add entry to shared memory for team context
   *
   * @param teamId - Team ID
   * @param sessionId - Session that created this entry
   * @param type - Type of entry (context, decision, finding, task)
   * @param content - Entry content
   */
  addToSharedMemory(
    teamId: string,
    sessionId: string,
    type: 'context' | 'decision' | 'finding' | 'task',
    content: string
  ): void {
    const team = this.teams.get(teamId)
    if (!team) return

    const memory = this.sharedMemories.get(team.sharedMemoryId)
    if (!memory) return

    memory.entries.push({
      timestamp: Date.now(),
      sessionId,
      type,
      content,
    })

    // Keep last 100 entries to prevent unbounded growth
    if (memory.entries.length > 100) {
      memory.entries = memory.entries.slice(-100)
    }

    console.log(`Added ${type} to team ${teamId} shared memory by ${sessionId.slice(0, 8)}`)
  }

  /**
   * Get shared memory formatted for prompt injection
   *
   * Returns markdown-formatted string with team goal and recent memory entries
   * to inject into agent prompts for context synchronization
   *
   * @param teamId - Team ID
   * @returns Formatted prompt section or empty string if team not found
   */
  getSharedMemoryPrompt(teamId: string): string {
    const team = this.teams.get(teamId)
    if (!team) return ''

    const memory = this.sharedMemories.get(team.sharedMemoryId)
    if (!memory || memory.entries.length === 0) return ''

    const recent = memory.entries.slice(-10) // Last 10 entries

    return `
## Team Context

**Team Goal**: ${team.goal}
**Your Role**: Check your session metadata for your role

**Recent Team Memory** (shared across all agents):
${recent.map((e) => `- [${e.type}] ${e.content}`).join('\n')}
`
  }

  /**
   * Broadcast team update to all members
   *
   * This would broadcast via WebSocket in a full implementation.
   * For now, it's a placeholder for server/index.ts to call.
   *
   * @param teamId - Team ID to broadcast update for
   */
  private broadcastTeamUpdate(teamId: string): void {
    // Implementation will be in server/index.ts
    // Server would broadcast via WebSocket:
    // broadcast({ type: 'team_update', payload: team })
  }

  /**
   * Get all teams
   *
   * @returns Array of all teams
   */
  getTeams(): Team[] {
    return Array.from(this.teams.values())
  }

  /**
   * Get a specific team
   *
   * @param teamId - Team ID
   * @returns Team or undefined if not found
   */
  getTeam(teamId: string): Team | undefined {
    return this.teams.get(teamId)
  }

  /**
   * Get shared memory for a team
   *
   * @param teamId - Team ID
   * @returns SharedMemory or undefined if not found
   */
  getSharedMemory(teamId: string): SharedMemory | undefined {
    const team = this.teams.get(teamId)
    if (!team) return undefined
    return this.sharedMemories.get(team.sharedMemoryId)
  }

  /**
   * Update team status
   *
   * @param teamId - Team ID
   * @param status - New status
   * @returns true if updated successfully
   */
  updateTeamStatus(teamId: string, status: 'active' | 'paused' | 'completed'): boolean {
    const team = this.teams.get(teamId)
    if (!team) return false

    team.status = status
    console.log(`Updated team ${teamId} status to ${status}`)
    return true
  }
}
