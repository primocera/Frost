import { EQUIP_SLOTS, EquipSlot, Item, ItemStats, RARITY_COLOR, SLOT_LABEL, STAT_LABEL } from '../items/ItemTypes'
import { Inventory } from '../systems/Inventory'
import { formatCopper } from '../utils/currency'

declare const window: Window & {
  __gpTooltip: { show(html: string, x: number, y: number, border?: string): void; hide(): void }
  __gpPanel:   { open(el: HTMLElement): void; close(el: HTMLElement): void }
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
    .join('\n')
}

const RARITY_BORDER: Record<string, string> = {
  common: '#888888', magic: '#4477ff', rare: '#ddbb00', epic: '#bb33ff',
}

export class InventoryUI {
  private visible  = false
  private backdrop: HTMLElement
  private equipCol: HTMLElement
  private gridEl:   HTMLElement
  private goldEl:   HTMLElement

  onDropItem?: (idx: number) => void

  constructor(_scene: unknown, private inv: Inventory) {
    this.backdrop = document.createElement('div')
    this.backdrop.className = 'gp-backdrop'
    this.backdrop.style.display = 'none'

    this.backdrop.innerHTML = `
      <div class="gp-panel gp-panel-inv">
        <div class="gp-header">
          <span class="gp-title">Inventory</span>
          <button class="gp-close">✕</button>
        </div>
        <div class="gp-inv-body">
          <div class="gp-equip-col" id="gp-equip-col"></div>
          <div class="gp-grid-col">
            <div class="gp-item-grid" id="gp-item-grid"></div>
            <div class="gp-gold-row" id="gp-gold-row"></div>
          </div>
        </div>
      </div>
    `
    document.body.appendChild(this.backdrop)

    this.equipCol = this.backdrop.querySelector('#gp-equip-col')!
    this.gridEl   = this.backdrop.querySelector('#gp-item-grid')!
    this.goldEl   = this.backdrop.querySelector('#gp-gold-row')!

    this.backdrop.querySelector('.gp-close')!.addEventListener('click', () => this.hide())
    this.backdrop.addEventListener('click', this.onClick)
    this.backdrop.addEventListener('contextmenu', this.onRightClick)
    this.backdrop.addEventListener('mousemove', this.onMouseMove)
    this.backdrop.addEventListener('mouseleave', () => window.__gpTooltip.hide())

    inv.addChangeListener(() => this.refresh())
  }

  isOpen()  { return this.visible }
  toggle()  { this.visible ? this.hide() : this.show() }

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
    this.renderEquip()
    this.renderGrid()
    this.goldEl.textContent = formatCopper(this.inv.gold)
  }

  private renderEquip() {
    this.equipCol.innerHTML = ''
    EQUIP_SLOTS.forEach((slot) => {
      const item  = this.inv.equipped[slot]
      const div   = document.createElement('div')
      div.className = 'gp-equip-slot'
      div.dataset.equip = slot

      const label = document.createElement('div')
      label.className = 'gp-equip-label'
      label.textContent = SLOT_LABEL[slot]

      const name = document.createElement('div')
      name.className = 'gp-equip-name'
      if (item) {
        name.classList.add(item.rarity, 'has-rarity-bar')
        name.textContent = item.name
      } else {
        name.textContent = '— empty —'
      }

      div.appendChild(label)
      div.appendChild(name)
      this.equipCol.appendChild(div)
    })
  }

  private renderGrid() {
    this.gridEl.innerHTML = ''
    for (let idx = 0; idx < 20; idx++) {
      const item = this.inv.items[idx]
      const cell = document.createElement('div')
      cell.className = 'gp-slot' + (item ? ` ${item.rarity}` : '')
      cell.dataset.invIdx = String(idx)

      if (item) {
        const type = document.createElement('span')
        type.className = 'item-type'
        type.textContent = item.type[0].toUpperCase()

        const name = document.createElement('span')
        name.className = 'item-name'
        name.textContent = item.name.length > 10 ? item.name.slice(0, 10) + '…' : item.name

        cell.appendChild(type)
        cell.appendChild(name)
      }
      this.gridEl.appendChild(cell)
    }
  }

  private onClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement

    // Close button handled separately
    if ((target as HTMLElement).classList.contains('gp-close')) return

    // Click on equip slot → unequip
    const equipSlot = target.closest('[data-equip]') as HTMLElement | null
    if (equipSlot) {
      this.inv.unequip(equipSlot.dataset.equip as EquipSlot)
      return
    }

    // Click on inventory cell → equip
    const cell = target.closest('[data-inv-idx]') as HTMLElement | null
    if (cell) {
      const idx = parseInt(cell.dataset.invIdx!)
      if (this.inv.items[idx]) this.inv.equip(idx)
    }
  }

  private onRightClick = (e: MouseEvent) => {
    e.preventDefault()
    const cell = (e.target as HTMLElement).closest('[data-inv-idx]') as HTMLElement | null
    if (cell) {
      const idx = parseInt(cell.dataset.invIdx!)
      if (this.inv.items[idx]) this.onDropItem?.(idx)
    }
  }

  private onMouseMove = (e: MouseEvent) => {
    const target = e.target as HTMLElement

    // Equip slot tooltip
    const equipSlot = target.closest('[data-equip]') as HTMLElement | null
    if (equipSlot) {
      const item = this.inv.equipped[equipSlot.dataset.equip as EquipSlot]
      if (item) { this.showItemTip(item, e.clientX, e.clientY, 'Click to unequip'); return }
    }

    // Inventory cell tooltip
    const cell = target.closest('[data-inv-idx]') as HTMLElement | null
    if (cell) {
      const idx = parseInt(cell.dataset.invIdx!)
      const item = this.inv.items[idx]
      if (item) { this.showItemTip(item, e.clientX, e.clientY, 'Left-click: equip  •  Right-click: drop'); return }
    }

    window.__gpTooltip.hide()
  }

  private showItemTip(item: Item, x: number, y: number, hint: string) {
    const lines = [
      `<strong style="color:${RARITY_COLOR[item.rarity]}">${item.name}</strong>`,
      `<span style="color:#668899">Ilvl ${item.ilvl}  •  ${item.type}</span>`,
      `<span style="color:#334455">─────────────────</span>`,
      statLines(item.stats).replace(/\n/g, '<br>'),
      `<span style="color:#334455">─────────────────</span>`,
      `<span style="color:#556677">${hint}</span>`,
    ].join('<br>')
    window.__gpTooltip.show(lines, x, y, RARITY_BORDER[item.rarity])
  }
}
