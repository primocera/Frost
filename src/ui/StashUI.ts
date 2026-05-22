import { Item, ItemStats, RARITY_COLOR, STAT_LABEL } from '../items/ItemTypes'
import { Inventory } from '../systems/Inventory'
import { Stash } from '../systems/Stash'

declare const window: Window & {
  __gpTooltip: { show(html: string, x: number, y: number, border?: string): void; hide(): void }
  __gpPanel:   { open(el: HTMLElement): void; close(el: HTMLElement): void }
}

const RARITY_BORDER: Record<string, string> = {
  common: '#888888', magic: '#4477ff', rare: '#ddbb00', epic: '#bb33ff',
}

function statLines(stats: ItemStats): string {
  return (Object.keys(stats) as (keyof ItemStats)[])
    .filter(k => stats[k] !== undefined)
    .map(k => {
      const v = stats[k]!
      if (k === 'critChance' || k === 'cooldownReduction') return `+${(v * 100).toFixed(1)}%  ${STAT_LABEL[k]}`
      if (k === 'manaRegen') return `+${v.toFixed(1)}  ${STAT_LABEL[k]}`
      return `+${v}  ${STAT_LABEL[k]}`
    })
    .join('<br>')
}

export class StashUI {
  private visible    = false
  private backdrop:  HTMLElement
  private stashGrid: HTMLElement
  private invGrid:   HTMLElement

  onDropInventoryItem?: (idx: number) => void

  constructor(_scene: unknown, private stash: Stash, private inv: Inventory) {
    this.backdrop = document.createElement('div')
    this.backdrop.className = 'gp-backdrop'
    this.backdrop.style.display = 'none'

    this.backdrop.innerHTML = `
      <div class="gp-panel gp-panel-stash">
        <div class="gp-header">
          <span class="gp-title">Stash</span>
          <button class="gp-close">✕</button>
        </div>
        <div class="gp-stash-body">
          <div class="gp-stash-half">
            <div class="gp-stash-label">Storage</div>
            <div class="gp-stash-grid" id="gp-stash-grid"></div>
          </div>
          <div class="gp-stash-half">
            <div class="gp-stash-label">Backpack</div>
            <div class="gp-stash-grid" id="gp-inv-grid"></div>
          </div>
        </div>
      </div>
    `
    document.body.appendChild(this.backdrop)

    this.stashGrid = this.backdrop.querySelector('#gp-stash-grid')!
    this.invGrid   = this.backdrop.querySelector('#gp-inv-grid')!

    this.backdrop.querySelector('.gp-close')!.addEventListener('click', () => this.hide())
    this.backdrop.addEventListener('click', this.onClick)
    this.backdrop.addEventListener('contextmenu', this.onRightClick)
    this.backdrop.addEventListener('mousemove', this.onMouseMove)
    this.backdrop.addEventListener('mouseleave', () => window.__gpTooltip.hide())

    stash.onChange = () => this.refresh()
    inv.onChange   = () => this.refresh()
  }

  isOpen()  { return this.visible }

  show() {
    this.visible = true
    this.refresh()
    window.__gpPanel.open(this.backdrop)
  }

  hide() {
    this.visible = false
    window.__gpTooltip.hide()
    window.__gpPanel.close(this.backdrop)
  }

  refresh() {
    if (!this.visible) return
    this.renderGrid(this.stashGrid, this.stash.items, 'stash')
    this.renderGrid(this.invGrid,   this.inv.items,   'inv')
  }

  private renderGrid(el: HTMLElement, items: (Item | null)[], side: 'stash' | 'inv') {
    el.innerHTML = ''
    for (let idx = 0; idx < 20; idx++) {
      const item = items[idx]
      const cell = document.createElement('div')
      cell.className = 'gp-slot' + (item ? ` ${item.rarity}` : '')
      cell.dataset.side = side
      cell.dataset.idx  = String(idx)

      if (item) {
        const type = document.createElement('span')
        type.className = 'item-type'
        type.textContent = item.type[0].toUpperCase()

        const name = document.createElement('span')
        name.className = 'item-name'
        name.textContent = item.name.length > 9 ? item.name.slice(0, 9) + '…' : item.name

        cell.appendChild(type)
        cell.appendChild(name)
      }
      el.appendChild(cell)
    }
  }

  private onClick = (e: MouseEvent) => {
    const cell = (e.target as HTMLElement).closest('[data-side]') as HTMLElement | null
    if (!cell) return
    const idx  = parseInt(cell.dataset.idx!)
    const side = cell.dataset.side!

    if (side === 'stash') {
      const item = this.stash.items[idx]
      if (item && !this.inv.isFull) {
        this.stash.remove(idx)
        this.inv.add(item)
        this.stash.onChange?.()
      }
    } else {
      const item = this.inv.items[idx]
      if (item && !this.stash.isFull) {
        this.inv.items[idx] = null
        this.stash.add(item)
        this.inv.onChange?.()
      }
    }
  }

  private onRightClick = (e: MouseEvent) => {
    e.preventDefault()
    const cell = (e.target as HTMLElement).closest('[data-side]') as HTMLElement | null
    if (!cell || cell.dataset.side !== 'inv') return
    const idx = parseInt(cell.dataset.idx!)
    if (this.inv.items[idx]) this.onDropInventoryItem?.(idx)
  }

  private onMouseMove = (e: MouseEvent) => {
    const cell = (e.target as HTMLElement).closest('[data-side]') as HTMLElement | null
    if (!cell) { window.__gpTooltip.hide(); return }

    const idx  = parseInt(cell.dataset.idx!)
    const side = cell.dataset.side!
    const item = side === 'stash' ? this.stash.items[idx] : this.inv.items[idx]

    if (!item) { window.__gpTooltip.hide(); return }

    const hint = side === 'stash'
      ? 'Click → move to backpack'
      : 'Left-click → stash  •  Right-click → drop'

    const html = [
      `<strong style="color:${RARITY_COLOR[item.rarity]}">${item.name}</strong>`,
      `<span style="color:#668899">Ilvl ${item.ilvl}  •  ${item.type}</span>`,
      `<span style="color:#334455">─────────────────</span>`,
      statLines(item.stats),
      `<span style="color:#334455">─────────────────</span>`,
      `<span style="color:#556677">${hint}</span>`,
    ].join('<br>')

    window.__gpTooltip.show(html, e.clientX, e.clientY, RARITY_BORDER[item.rarity])
  }
}
