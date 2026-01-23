/**
 * Plugin Marketplace Modal - Simplified version
 */

import { toast } from './Toast'

let modal: HTMLElement | null = null

export interface MarketplacePlugin {
  id: string
  name: string
  description: string
  installed: boolean
}

export function show(): void {
  if (!modal) {
    modal = document.createElement('div')
    modal.id = 'plugin-marketplace-modal'
    modal.className = 'modal'
    modal.innerHTML =
      '<div class="modal-content marketplace-modal-content"><div class="modal-header"><h3>Plugin Marketplace</h3><button id="pm-close">×</button></div><div class="marketplace-list"><p>Plugin marketplace coming soon!</p></div></div>'
    document.body.appendChild(modal)

    modal.querySelector('#pm-close')?.addEventListener('click', hide)
    modal.addEventListener('click', (e) => {
      if (e.target === modal) hide()
    })
  }
  modal.classList.add('show')
  toast.info('Plugin Marketplace', { icon: '🔌', duration: 2000 })
}

export function hide(): void {
  if (modal) modal.classList.remove('show')
}
