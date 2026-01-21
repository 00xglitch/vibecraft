/**
 * SearchableSelect - A reusable searchable dropdown component
 *
 * Provides keyboard-navigable dropdown with type-to-filter.
 * Adapts the DirectoryAutocomplete pattern for general use.
 */

// Injected by Vite at build time
declare const __VIBECRAFT_DEFAULT_PORT__: number
const API_PORT = __VIBECRAFT_DEFAULT_PORT__
const API_URL = `http://localhost:${API_PORT}`

export interface SelectOption {
  id: string
  label: string
  disabled?: boolean
}

export interface SearchableSelectConfig {
  container: HTMLElement
  placeholder?: string
  options?: SelectOption[]
  fetchOptions?: (query: string) => Promise<SelectOption[]>
  onSelect: (option: SelectOption) => void
  onFocus?: () => void
  onBlur?: () => void
  disabled?: boolean
  initialValue?: string
}

export class SearchableSelect {
  private container: HTMLElement
  public input: HTMLInputElement
  private dropdown: HTMLElement | null = null
  private options: SelectOption[] = []
  private filteredOptions: SelectOption[] = []
  private selectedIndex = 0
  private fetchOptions: ((query: string) => Promise<SelectOption[]>) | null = null
  private onSelect: (option: SelectOption) => void
  private onFocus?: () => void
  private onBlur?: () => void
  private isDisabled = false
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private cleanupFns: (() => void)[] = []
  private isOpen = false

  constructor(config: SearchableSelectConfig) {
    this.container = config.container
    this.onSelect = config.onSelect
    this.onFocus = config.onFocus
    this.onBlur = config.onBlur
    this.isDisabled = config.disabled ?? false
    this.options = config.options ?? []
    this.fetchOptions = config.fetchOptions ?? null

    this.input = document.createElement('input')
    this.input.type = 'text'
    this.input.className = 'searchable-select-input'
    this.input.placeholder = config.placeholder ?? 'Select...'
    this.input.disabled = this.isDisabled

    if (config.initialValue) {
      const initialOption = this.options.find(o => o.id === config.initialValue)
      if (initialOption) {
        this.input.value = initialOption.label
      }
    }

    this.container.appendChild(this.input)
    this.setupStyles()
    this.setupEventListeners()

    if (this.options.length === 0 && this.fetchOptions) {
      this.fetchOptions('').then(opts => {
        this.options = opts
        this.filteredOptions = opts
      })
    } else {
      this.filteredOptions = [...this.options]
    }
  }

  private setupStyles(): void {
    const style = document.createElement('style')
    style.textContent = `
      .searchable-select-container {
        position: relative;
        width: 100%;
      }
      .searchable-select-input {
        width: 100%;
        padding: 8px 12px;
        background: rgba(20, 20, 25, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        color: #fff;
        font-size: 14px;
        font-family: inherit;
        outline: none;
        cursor: pointer;
      }
      .searchable-select-input:focus {
        border-color: rgba(74, 200, 232, 0.5);
        box-shadow: 0 0 0 2px rgba(74, 200, 232, 0.1);
      }
      .searchable-select-input:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .searchable-select-dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        max-height: 220px;
        overflow-y: auto;
        background: rgba(20, 20, 25, 0.98);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        margin-top: 4px;
        display: none;
        z-index: 1001;
        backdrop-filter: blur(8px);
      }
      .searchable-select-dropdown.open {
        display: block;
      }
      .searchable-select-item {
        padding: 10px 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        color: #fff;
        font-size: 13px;
      }
      .searchable-select-item:hover,
      .searchable-select-item.selected {
        background: rgba(74, 200, 232, 0.15);
      }
      .searchable-select-item.disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .searchable-select-item .label {
        flex: 1;
      }
      .searchable-select-item .hint {
        color: rgba(255, 255, 255, 0.4);
        font-size: 11px;
      }
      .searchable-select-empty {
        padding: 12px;
        color: rgba(255, 255, 255, 0.4);
        font-size: 13px;
        text-align: center;
      }
    `
    document.head.appendChild(style)
    this.cleanupFns.push(() => style.remove())
  }

  private createDropdown(): HTMLElement {
    if (this.dropdown) return this.dropdown

    this.dropdown = document.createElement('div')
    this.dropdown.className = 'searchable-select-dropdown'
    this.container.appendChild(this.dropdown)

    return this.dropdown
  }

  private renderDropdown(): void {
    const dd = this.createDropdown()

    if (this.filteredOptions.length === 0) {
      dd.innerHTML = '<div class="searchable-select-empty">No results</div>'
      dd.classList.add('open')
      return
    }

    dd.innerHTML = this.filteredOptions.map((opt, i) => {
      const isSelected = i === this.selectedIndex
      const disabled = opt.disabled ?? false
      return `
        <div class="searchable-select-item${isSelected ? ' selected' : ''}${disabled ? ' disabled' : ''}"
             data-index="${i}" data-id="${escapeHtml(opt.id)}">
          <span class="label">${escapeHtml(opt.label)}</span>
        </div>
      `
    }).join('')

    dd.querySelectorAll('.searchable-select-item:not(.disabled)').forEach((item) => {
      item.addEventListener('mouseenter', () => {
        const idx = parseInt((item as HTMLElement).dataset.index || '0', 10)
        this.selectedIndex = idx
        this.updateSelection()
      })
      item.addEventListener('click', () => {
        const idx = parseInt((item as HTMLElement).dataset.index || '0', 10)
        this.selectByIndex(idx)
      })
    })

    dd.classList.add('open')
    this.isOpen = true

    const selectedEl = dd.querySelector('.selected')
    selectedEl?.scrollIntoView({ block: 'nearest' })
  }

  private hideDropdown(): void {
    if (this.dropdown) {
      this.dropdown.classList.remove('open')
      this.dropdown.style.display = 'none'
    }
    this.filteredOptions = [...this.options]
    this.selectedIndex = 0
    this.isOpen = false
  }

  private updateSelection(): void {
    if (!this.dropdown) return
    this.dropdown.querySelectorAll('.searchable-select-item').forEach((item, i) => {
      item.classList.toggle('selected', i === this.selectedIndex)
    })
    const selectedEl = this.dropdown.querySelector('.selected')
    selectedEl?.scrollIntoView({ block: 'nearest' })
  }

  private selectByIndex(index: number): void {
    if (index < 0 || index >= this.filteredOptions.length) return
    const option = this.filteredOptions[index]
    if (option.disabled) return

    this.input.value = option.label
    this.hideDropdown()
    this.onSelect(option)
  }

  private async handleInput(): Promise<void> {
    const value = this.input.value.toLowerCase()
    const fetchFn = this.fetchOptions

    if (fetchFn) {
      if (this.debounceTimer) clearTimeout(this.debounceTimer)
      this.debounceTimer = setTimeout(async () => {
        try {
          const opts = await fetchFn(value)
          this.options = opts
          this.filterOptions(value)
          this.renderDropdown()
        } catch (e) {
          console.error('SearchableSelect fetch error:', e)
        }
      }, 150)
    } else {
      this.filterOptions(value)
      this.renderDropdown()
    }
  }

  private filterOptions(query: string): void {
    if (!query) {
      this.filteredOptions = [...this.options]
    } else {
      this.filteredOptions = this.options.filter(opt =>
        opt.label.toLowerCase().includes(query)
      )
    }
    this.selectedIndex = 0
  }

  private handleKeydown = (e: KeyboardEvent): void => {
    if (this.isDisabled) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (!this.isOpen) {
          this.filteredOptions = [...this.options]
          this.renderDropdown()
        } else {
          this.selectedIndex = Math.min(this.selectedIndex + 1, this.filteredOptions.length - 1)
          this.updateSelection()
        }
        break

      case 'ArrowUp':
        e.preventDefault()
        if (this.isOpen) {
          this.selectedIndex = Math.max(this.selectedIndex - 1, 0)
          this.updateSelection()
        }
        break

      case 'Enter':
        e.preventDefault()
        if (this.isOpen && this.filteredOptions.length > 0) {
          this.selectByIndex(this.selectedIndex)
        }
        break

      case 'Tab':
        if (this.isOpen && this.filteredOptions.length > 0) {
          e.preventDefault()
          this.selectByIndex(this.selectedIndex)
        }
        break

      case 'Escape':
        e.preventDefault()
        this.hideDropdown()
        this.input.blur()
        break
    }
  }

  private handleFocus = (): void => {
    if (this.isDisabled) return
    this.onFocus?.()
    if (this.options.length === 0 && this.fetchOptions) {
      this.fetchOptions('').then(opts => {
        this.options = opts
        this.filteredOptions = [...opts]
        this.renderDropdown()
      })
    } else if (!this.isOpen) {
      this.filteredOptions = [...this.options]
      this.renderDropdown()
    }
  }

  private handleBlur = (): void => {
    setTimeout(() => {
      if (!this.dropdown?.contains(document.activeElement)) {
        this.hideDropdown()
        this.onBlur?.()
      }
    }, 150)
  }

  private setupEventListeners(): void {
    this.input.addEventListener('input', () => this.handleInput())
    this.input.addEventListener('keydown', this.handleKeydown)
    this.input.addEventListener('focus', this.handleFocus)
    this.input.addEventListener('blur', this.handleBlur)

    this.container.addEventListener('click', (e) => {
      if (e.target === this.input || this.container.contains(e.target as Node)) {
        if (!this.isOpen && !this.isDisabled) {
          this.input.focus()
        }
      }
    })
  }

  setOptions(options: SelectOption[]): void {
    this.options = options
    this.filteredOptions = [...options]
    if (this.isOpen) {
      this.renderDropdown()
    }
  }

  setDisabled(disabled: boolean): void {
    this.isDisabled = disabled
    this.input.disabled = disabled
    if (disabled) {
      this.hideDropdown()
    }
  }

  setValue(id: string): void {
    const option = this.options.find(o => o.id === id)
    if (option) {
      this.input.value = option.label
    }
  }

  getValue(): string | null {
    const label = this.input.value
    const option = this.options.find(o => o.label === label)
    return option?.id ?? null
  }

  destroy(): void {
    this.cleanupFns.forEach(fn => fn())
    this.input.removeEventListener('input', () => this.handleInput())
    this.input.removeEventListener('keydown', this.handleKeydown)
    this.input.removeEventListener('focus', this.handleFocus)
    this.input.removeEventListener('blur', this.handleBlur)
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.dropdown?.remove()
    this.input.remove()
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
