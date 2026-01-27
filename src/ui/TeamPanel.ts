/**
 * TeamPanel - Manages the teams section in the right sidebar
 *
 * Handles:
 * - Displaying active teams with member info
 * - Team creation UI
 * - Adding/removing team members
 * - Coordinator badges and role indicators
 */

import type { Team, AgentRole, ManagedSession } from '../../shared/types'

const ROLE_COLORS: Record<AgentRole, string> = {
  coordinator: '#f59e0b', // amber
  researcher: '#3b82f6', // blue
  coder: '#10b981', // green
  reviewer: '#8b5cf6', // purple
  tester: '#ec4899', // pink
  documenter: '#6366f1', // indigo
  architect: '#14b8a6', // teal
  custom: '#9ca3af', // gray
}

const ROLE_ICONS: Record<AgentRole, string> = {
  coordinator: '👑',
  researcher: '🔍',
  coder: '💻',
  reviewer: '✅',
  tester: '🧪',
  documenter: '📝',
  architect: '🏗️',
  custom: '⚙️',
}

export class TeamPanel {
  private containerEl: HTMLElement | null = null
  private teamsListEl: HTMLElement | null = null
  private teams: Map<string, Team> = new Map()
  private sessions: Map<string, ManagedSession> = new Map()

  constructor() {
    this.containerEl = document.getElementById('teams-panel')
    if (!this.containerEl) {
      console.warn('[TeamPanel] Container #teams-panel not found')
      return
    }

    this.render()
  }

  /**
   * Update sessions map (called from main.ts when sessions update)
   */
  setSessions(sessions: Map<string, ManagedSession>): void {
    this.sessions = sessions
    this.refreshTeams()
  }

  /**
   * Add or update a team
   */
  addTeam(team: Team): void {
    this.teams.set(team.id, team)
    this.refreshTeams()
  }

  /**
   * Remove a team
   */
  removeTeam(teamId: string): void {
    this.teams.delete(teamId)
    this.refreshTeams()
  }

  /**
   * Update all teams (called from main.ts when teams list changes)
   */
  setTeams(teams: Team[]): void {
    this.teams.clear()
    teams.forEach((team) => this.teams.set(team.id, team))
    this.refreshTeams()
  }

  /**
   * Render the panel structure (called once in constructor)
   */
  private render(): void {
    if (!this.containerEl) return

    // Create header
    const header = document.createElement('div')
    header.className = 'teams-header'

    const title = document.createElement('h3')
    title.textContent = 'Teams '
    const count = document.createElement('span')
    count.className = 'team-count'
    count.textContent = '0'
    title.appendChild(count)

    const newBtn = document.createElement('button')
    newBtn.className = 'btn-new-team'
    newBtn.title = 'Create Team'
    newBtn.textContent = '+'
    newBtn.addEventListener('click', () => this.showCreateTeamModal())

    header.appendChild(title)
    header.appendChild(newBtn)

    // Create teams list container
    const listContainer = document.createElement('div')
    listContainer.className = 'teams-list'

    this.containerEl.appendChild(header)
    this.containerEl.appendChild(listContainer)

    this.teamsListEl = listContainer
  }

  /**
   * Refresh teams display
   */
  private refreshTeams(): void {
    if (!this.teamsListEl) return

    const teamCount = this.teams.size
    const countEl = this.containerEl?.querySelector('.team-count')
    if (countEl) {
      countEl.textContent = String(teamCount)
    }

    // Clear existing content
    this.teamsListEl.innerHTML = ''

    if (teamCount === 0) {
      const emptyState = document.createElement('div')
      emptyState.className = 'teams-empty'

      const icon = document.createElement('div')
      icon.className = 'teams-empty-icon'
      icon.textContent = '👥'

      const text = document.createElement('p')
      text.textContent = 'No active teams'

      const btn = document.createElement('button')
      btn.className = 'btn-create-first-team'
      btn.textContent = 'Create Team'
      btn.addEventListener('click', () => this.showCreateTeamModal())

      emptyState.appendChild(icon)
      emptyState.appendChild(text)
      emptyState.appendChild(btn)

      this.teamsListEl.appendChild(emptyState)
      return
    }

    // Render team cards
    const sortedTeams = Array.from(this.teams.values()).sort((a, b) => b.createdAt - a.createdAt)

    sortedTeams.forEach((team) => {
      const card = this.createTeamCard(team)
      this.teamsListEl!.appendChild(card)
    })
  }

  /**
   * Create a team card element
   */
  private createTeamCard(team: Team): HTMLElement {
    const card = document.createElement('div')
    card.className = 'team-card'
    card.dataset.teamId = team.id

    // Header
    const header = document.createElement('div')
    header.className = 'team-card-header'

    const info = document.createElement('div')
    info.className = 'team-info'

    const name = document.createElement('div')
    name.className = 'team-name'
    name.textContent = team.name

    const goal = document.createElement('div')
    goal.className = 'team-goal'
    goal.textContent = team.goal

    info.appendChild(name)
    info.appendChild(goal)

    const meta = document.createElement('div')
    meta.className = 'team-meta'

    const memberCount = document.createElement('span')
    memberCount.className = 'team-member-count'
    memberCount.title = 'Team members'
    memberCount.textContent = `${team.sessions.length} 👥`

    const status = document.createElement('span')
    status.className = `team-status team-status-${team.status}`
    status.textContent = team.status

    const expandIcon = document.createElement('span')
    expandIcon.className = 'expand-icon'
    expandIcon.textContent = '▼'

    meta.appendChild(memberCount)
    meta.appendChild(status)
    meta.appendChild(expandIcon)

    header.appendChild(info)
    header.appendChild(meta)

    // Toggle expand/collapse on header click
    header.addEventListener('click', () => {
      card.classList.toggle('expanded')
    })

    // Body
    const body = document.createElement('div')
    body.className = 'team-card-body'

    // Coordinator info
    const coordinatorSection = this.createCoordinatorSection(team)
    body.appendChild(coordinatorSection)

    // Members list
    const membersSection = this.createMembersSection(team)
    body.appendChild(membersSection)

    card.appendChild(header)
    card.appendChild(body)

    return card
  }

  /**
   * Create coordinator section
   */
  private createCoordinatorSection(team: Team): HTMLElement {
    const section = document.createElement('div')
    section.className = 'team-coordinator'

    const label = document.createElement('span')
    label.className = 'coordinator-label'
    label.textContent = '👑 Coordinator:'

    const coordinator = this.sessions.get(team.coordinatorId)
    const coordName = document.createElement('span')
    coordName.className = 'coordinator-name'
    coordName.textContent = coordinator?.name || team.coordinatorId.slice(0, 8)

    section.appendChild(label)
    section.appendChild(coordName)

    return section
  }

  /**
   * Create members section
   */
  private createMembersSection(team: Team): HTMLElement {
    const section = document.createElement('div')
    section.className = 'team-members'

    // Header with add button
    const header = document.createElement('div')
    header.className = 'team-members-header'

    const title = document.createElement('span')
    title.textContent = 'Members'

    const addBtn = document.createElement('button')
    addBtn.className = 'btn-add-member'
    addBtn.title = 'Add member'
    addBtn.textContent = '+'
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      this.showAddMemberModal(team.id)
    })

    header.appendChild(title)
    header.appendChild(addBtn)

    // Members list
    const list = document.createElement('div')
    list.className = 'team-members-list'

    team.sessions.forEach((sessionId) => {
      const session = this.sessions.get(sessionId)
      if (!session) return

      const memberEl = this.createMemberElement(team, session)
      list.appendChild(memberEl)
    })

    section.appendChild(header)
    section.appendChild(list)

    return section
  }

  /**
   * Create member element
   */
  private createMemberElement(team: Team, session: ManagedSession): HTMLElement {
    const memberEl = document.createElement('div')
    memberEl.className = 'team-member'
    memberEl.dataset.sessionId = session.id

    const role = session.agentRole || 'researcher'
    const roleColor = ROLE_COLORS[role]
    const roleIcon = ROLE_ICONS[role]
    const isCoordinator = session.id === team.coordinatorId

    const roleIconEl = document.createElement('span')
    roleIconEl.className = 'member-role-icon'
    roleIconEl.style.color = roleColor
    roleIconEl.title = role
    roleIconEl.textContent = roleIcon

    const nameEl = document.createElement('span')
    nameEl.className = 'member-name'
    nameEl.textContent = session.name || session.id.slice(0, 8)

    memberEl.appendChild(roleIconEl)
    memberEl.appendChild(nameEl)

    if (isCoordinator) {
      const badge = document.createElement('span')
      badge.className = 'coordinator-badge'
      badge.textContent = '👑'
      memberEl.appendChild(badge)
    } else {
      const removeBtn = document.createElement('button')
      removeBtn.className = 'btn-leave-team'
      removeBtn.title = 'Remove from team'
      removeBtn.textContent = '×'
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        this.removeMember(team.id, session.id)
      })
      memberEl.appendChild(removeBtn)
    }

    return memberEl
  }

  /**
   * Show create team modal
   */
  private showCreateTeamModal(): void {
    // TODO: Replace with proper modal UI
    const name = prompt('Team name:')
    if (!name) return

    const goal = prompt('Team goal:')
    if (!goal) return

    // Get available sessions (not already in a team)
    const availableSessions = Array.from(this.sessions.values()).filter(
      (s) => !s.teamId && s.status !== 'offline'
    )

    if (availableSessions.length === 0) {
      alert('No available sessions to create a team. Start a new session first.')
      return
    }

    // For now, use first available session as coordinator
    const coordinator = availableSessions[0]

    this.createTeam(coordinator.id, name, goal)
  }

  /**
   * Show add member modal
   */
  private showAddMemberModal(teamId: string): void {
    const team = this.teams.get(teamId)
    if (!team) return

    // Get available sessions (not in this team)
    const availableSessions = Array.from(this.sessions.values()).filter(
      (s) => !team.sessions.includes(s.id) && s.status !== 'offline'
    )

    if (availableSessions.length === 0) {
      alert('No available sessions to add.')
      return
    }

    // Simple prompt for now (will be replaced with proper modal)
    const sessionNames = availableSessions
      .map((s, i) => `${i + 1}. ${s.name || s.id.slice(0, 8)}`)
      .join('\n')
    const choice = prompt(`Select session to add:\n\n${sessionNames}\n\nEnter number:`)

    if (!choice) return

    const index = parseInt(choice) - 1
    if (index < 0 || index >= availableSessions.length) {
      alert('Invalid selection')
      return
    }

    const session = availableSessions[index]
    const role = prompt('Role (researcher/coder/reviewer/tester):', 'researcher') as AgentRole

    this.addMember(teamId, session.id, role || 'researcher')
  }

  /**
   * Create a new team (API call)
   */
  private async createTeam(coordinatorId: string, name: string, goal: string): Promise<void> {
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordinatorId, name, goal }),
      })

      if (!res.ok) {
        const error = await res.json()
        alert(`Failed to create team: ${error.error}`)
        return
      }

      const data = await res.json()
      console.log('[TeamPanel] Created team:', data.team)
      // Team will be added via WebSocket broadcast
    } catch (err) {
      console.error('[TeamPanel] Error creating team:', err)
      alert('Failed to create team')
    }
  }

  /**
   * Add member to team (API call)
   */
  private async addMember(teamId: string, sessionId: string, role: AgentRole): Promise<void> {
    try {
      const res = await fetch(`/api/teams/${teamId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, role }),
      })

      if (!res.ok) {
        const error = await res.json()
        alert(`Failed to add member: ${error.error}`)
        return
      }

      console.log('[TeamPanel] Added member to team')
      // Team will update via WebSocket broadcast
    } catch (err) {
      console.error('[TeamPanel] Error adding member:', err)
      alert('Failed to add member')
    }
  }

  /**
   * Remove member from team (API call)
   */
  private async removeMember(teamId: string, sessionId: string): Promise<void> {
    if (!confirm('Remove this member from the team?')) return

    try {
      const res = await fetch(`/api/teams/${teamId}/members/${sessionId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const error = await res.json()
        alert(`Failed to remove member: ${error.error}`)
        return
      }

      console.log('[TeamPanel] Removed member from team')
      // Team will update via WebSocket broadcast
    } catch (err) {
      console.error('[TeamPanel] Error removing member:', err)
      alert('Failed to remove member')
    }
  }
}
