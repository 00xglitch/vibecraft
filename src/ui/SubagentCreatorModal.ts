/**
 * Subagent Creator Modal
 *
 * UI for creating subagents with role templates.
 * Shows template options and allows customization.
 */

import { soundManager } from '../audio'
import {
  SUBAGENT_TEMPLATES,
  type SubagentRole,
  type SubagentTemplate,
} from '../entities/SubagentManager'

// ============================================================================
// Types
// ============================================================================

export interface SubagentCreatorConfig {
  sessionId: string
  onCreateSubagent: (config: SubagentCreateRequest) => void
}

export interface SubagentCreateRequest {
  sessionId: string
  role: SubagentRole
  description: string
  customTools?: string[]
}

// ============================================================================
// State
// ============================================================================

let modal: HTMLElement | null = null
let soundEnabled = true
let currentConfig: SubagentCreatorConfig | null = null
let selectedRole: SubagentRole = 'researcher'

// ============================================================================
// Public API
// ============================================================================

/**
 * Show the subagent creator modal
 */
export function showSubagentCreatorModal(config: SubagentCreatorConfig): void {
  currentConfig = config
  selectedRole = 'researcher'

  // Remove any existing modal
  hideSubagentCreatorModal()

  // Create modal using DOM methods for security
  modal = createModalElement()

  // Add to DOM
  document.body.appendChild(modal)

  // Play sound
  if (soundEnabled) {
    soundManager.play('notification')
  }

  // Animate in
  requestAnimationFrame(() => {
    modal?.classList.add('modal-visible')
  })
}

/**
 * Hide the modal
 */
export function hideSubagentCreatorModal(): void {
  if (modal) {
    modal.classList.remove('modal-visible')
    modal.classList.add('modal-hiding')

    setTimeout(() => {
      modal?.remove()
      modal = null
      currentConfig = null
    }, 200)
  }
}

/**
 * Set sound enabled state
 */
export function setSubagentCreatorSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled
}

// ============================================================================
// DOM Creation (Safe from XSS)
// ============================================================================

function createModalElement(): HTMLElement {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay subagent-creator-overlay'

  const content = document.createElement('div')
  content.className = 'modal-content subagent-creator-modal'

  // Header
  const header = document.createElement('div')
  header.className = 'modal-header'

  const title = document.createElement('h2')
  title.className = 'modal-title'
  title.textContent = 'Create Subagent'

  const closeBtn = document.createElement('button')
  closeBtn.className = 'modal-close'
  closeBtn.setAttribute('aria-label', 'Close')
  closeBtn.textContent = '×'
  closeBtn.addEventListener('click', hideSubagentCreatorModal)

  header.appendChild(title)
  header.appendChild(closeBtn)

  // Body
  const body = document.createElement('div')
  body.className = 'modal-body'

  // Role selection section
  const roleSection = createRoleSection()
  body.appendChild(roleSection)

  // Details section
  const detailsSection = createDetailsSection()
  body.appendChild(detailsSection)

  // Description section
  const descSection = createDescriptionSection()
  body.appendChild(descSection)

  // Footer
  const footer = createFooter()

  content.appendChild(header)
  content.appendChild(body)
  content.appendChild(footer)
  overlay.appendChild(content)

  // Overlay click to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      hideSubagentCreatorModal()
    }
  })

  // Escape key handler
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      hideSubagentCreatorModal()
      document.removeEventListener('keydown', handleKeydown)
    }
  }
  document.addEventListener('keydown', handleKeydown)

  return overlay
}

function createRoleSection(): HTMLElement {
  const section = document.createElement('div')
  section.className = 'subagent-role-section'

  const label = document.createElement('label')
  label.className = 'subagent-label'
  label.textContent = 'Select Role'
  section.appendChild(label)

  const grid = document.createElement('div')
  grid.className = 'subagent-role-grid'

  for (const template of SUBAGENT_TEMPLATES) {
    const card = createRoleCard(template)
    grid.appendChild(card)
  }

  section.appendChild(grid)
  return section
}

function createRoleCard(template: SubagentTemplate): HTMLElement {
  const isSelected = template.id === selectedRole
  const colorHex = '#' + template.color.toString(16).padStart(6, '0')

  const card = document.createElement('button')
  card.className = 'subagent-role-card' + (isSelected ? ' subagent-role-card-selected' : '')
  card.setAttribute('data-role', template.id)
  card.style.setProperty('--role-color', colorHex)

  const icon = document.createElement('span')
  icon.className = 'subagent-role-icon'
  icon.textContent = template.icon

  const labelSpan = document.createElement('span')
  labelSpan.className = 'subagent-role-label'
  labelSpan.textContent = template.name

  card.appendChild(icon)
  card.appendChild(labelSpan)

  card.addEventListener('click', () => {
    selectedRole = template.id
    updateSelectedRole()
    if (soundEnabled) {
      soundManager.play('read')
    }
  })

  return card
}

function createDetailsSection(): HTMLElement {
  const section = document.createElement('div')
  section.className = 'subagent-details-section'

  const selectedTemplate = SUBAGENT_TEMPLATES.find((t) => t.id === selectedRole)!

  // Selected role display
  const selectedDiv = document.createElement('div')
  selectedDiv.className = 'subagent-selected-role'

  const iconLarge = document.createElement('span')
  iconLarge.className = 'subagent-role-icon-large'
  iconLarge.textContent = selectedTemplate.icon

  const infoDiv = document.createElement('div')
  infoDiv.className = 'subagent-role-info'

  const nameDiv = document.createElement('div')
  nameDiv.className = 'subagent-role-name'
  nameDiv.textContent = selectedTemplate.name

  const descDiv = document.createElement('div')
  descDiv.className = 'subagent-role-desc'
  descDiv.textContent = selectedTemplate.description

  infoDiv.appendChild(nameDiv)
  infoDiv.appendChild(descDiv)
  selectedDiv.appendChild(iconLarge)
  selectedDiv.appendChild(infoDiv)
  section.appendChild(selectedDiv)

  // Tools
  if (selectedTemplate.suggestedTools.length > 0) {
    const toolsDiv = document.createElement('div')
    toolsDiv.className = 'subagent-tools'

    const toolsLabel = document.createElement('label')
    toolsLabel.className = 'subagent-label'
    toolsLabel.textContent = 'Suggested Tools'
    toolsDiv.appendChild(toolsLabel)

    const toolsList = document.createElement('div')
    toolsList.className = 'subagent-tools-list'

    for (const tool of selectedTemplate.suggestedTools) {
      const tag = document.createElement('span')
      tag.className = 'subagent-tool-tag'
      tag.textContent = tool
      toolsList.appendChild(tag)
    }

    toolsDiv.appendChild(toolsList)
    section.appendChild(toolsDiv)
  }

  return section
}

function createDescriptionSection(): HTMLElement {
  const section = document.createElement('div')
  section.className = 'subagent-description-section'

  const label = document.createElement('label')
  label.className = 'subagent-label'
  label.setAttribute('for', 'subagent-description')
  label.textContent = 'Task Description'
  section.appendChild(label)

  const textarea = document.createElement('textarea')
  textarea.id = 'subagent-description'
  textarea.className = 'subagent-description-input'
  textarea.placeholder = 'Describe what this subagent should do...'
  textarea.rows = 3
  section.appendChild(textarea)

  return section
}

function createFooter(): HTMLElement {
  const footer = document.createElement('div')
  footer.className = 'modal-footer'

  const cancelBtn = document.createElement('button')
  cancelBtn.className = 'modal-btn modal-btn-secondary subagent-cancel-btn'
  cancelBtn.textContent = 'Cancel'
  cancelBtn.addEventListener('click', hideSubagentCreatorModal)

  const createBtn = document.createElement('button')
  createBtn.className = 'modal-btn modal-btn-primary subagent-create-btn'
  updateCreateButtonText(createBtn)
  createBtn.addEventListener('click', handleCreate)

  footer.appendChild(cancelBtn)
  footer.appendChild(createBtn)
  return footer
}

function updateCreateButtonText(btn: HTMLElement): void {
  const template = SUBAGENT_TEMPLATES.find((t) => t.id === selectedRole)!
  btn.textContent = `Create ${template.icon} ${template.name}`
}

function updateSelectedRole(): void {
  if (!modal) return

  // Update card selection
  const cards = modal.querySelectorAll('.subagent-role-card')
  cards.forEach((card) => {
    const role = card.getAttribute('data-role')
    if (role === selectedRole) {
      card.classList.add('subagent-role-card-selected')
    } else {
      card.classList.remove('subagent-role-card-selected')
    }
  })

  // Update details section
  const detailsSection = modal.querySelector('.subagent-details-section')
  if (detailsSection) {
    const newDetails = createDetailsSection()
    detailsSection.replaceWith(newDetails)
  }

  // Update create button
  const createBtn = modal.querySelector('.subagent-create-btn')
  if (createBtn) {
    updateCreateButtonText(createBtn as HTMLElement)
  }
}

function handleCreate(): void {
  if (!currentConfig || !modal) return

  const descInput = modal.querySelector('#subagent-description') as HTMLTextAreaElement
  const description = descInput?.value.trim() || 'Subagent task'

  const template = SUBAGENT_TEMPLATES.find((t) => t.id === selectedRole)

  currentConfig.onCreateSubagent({
    sessionId: currentConfig.sessionId,
    role: selectedRole,
    description,
    customTools: template?.suggestedTools,
  })

  if (soundEnabled) {
    soundManager.play('spawn')
  }

  hideSubagentCreatorModal()
}
