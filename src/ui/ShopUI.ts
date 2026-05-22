import { Item, ItemStats, RARITY_COLOR, STAT_LABEL } from '../items/ItemTypes'
import { generateItem } from '../items/ItemGen'
import { Inventory } from '../systems/Inventory'
import { formatCopper } from '../utils/currency'

declare const window: Window & {
  __gpTooltip: { show(html: string, x: number, y: number, border?: string): void; hide(): void }
  __gpPanel:   { open(el: HTMLElement): void; close(el: HTMLElement): void }
}

interface ShopEntry { item: Item; price: number; sold: boolean }

// Prices in copper (100c = 1s, 100s = 1g)
const PRICE: Record<string, [number, number]> = {
  common: [100,   300],   // 1s – 3s
  magic:  [600,  1800],   // 6s – 18s
  rare:   [6000, 18000],  // 60s – 180s (0.6g – 1.8g)
  epic:   [40000, 100000],// 4g – 10g
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

export class ShopUI {
  private visible  = false
  private backdrop: HTMLElement
  private gridEl:   HTMLElement
  private goldEl:   HTMLElement
  private stock:    ShopEntry[] = []
  private lastLevel = -1

  constructor(private getLevel: () => number, private inv: Inventory) {
    this.backdrop = document.createElement('div')
    this.backdrop.className = 'gp-backdrop'
    this.backdrop.style.display = 'none'

    this.backdrop.innerHTML = `
      <div class="gp-panel gp-panel-shop">
        <div class="gp-header">
          <span class="gp-title">Trader Brom</span>
          <button class="gp-close">✕</button>
        </div>
        <div class="gp-shop-body">
          <div class="gp-shop-grid" id="gp-shop-grid"></div>
        </div>
        <div class="gp-shop-gold-bar">
          <span class="gp-shop-gold-label">Your coins</span>
          <span class="gp-shop-gold-val" id="gp-shop-gold">0c</span>
        </div>
      </div>
    `
    document.body.appendChild(this.backdrop)

    this.gridEl = this.backdrop.querySelector('#gp-shop-grid')!
    this.goldEl = this.backdrop.querySelector('#gp-shop-gold')!

    this.backdrop.querySelector('.gp-close')!.addEventListener('click', () => this.hide())
    this.backdrop.addEventListener('click', this.onClick)
    this.backdrop.addEventListener('mousemove', this.onMouseMove)
    this.backdrop.addEventListener('mouseleave', () => window.__gpTooltip.hide())
  }

  isOpen() { return this.visible }

  open() {
    this.visible = true
    const level = this.getLevel()
    // Regenerate stock only if level changed or first open
    if (level !== this.lastLevel) {
      this.lastLevel = level
      this.generateStock(level)
    }
    this.render()
    window.__gpPanel.open(this.backdrop)
  }

  hide() {
    this.visible = false
    window.__gpTooltip.hide()
    window.__gpPanel.close(this.backdrop)
  }

  private generateStock(level: number) {
    const ilvl = Math.max(1, level)
    this.stock = []

    const pool: Array<{ rarity: 'common' | 'magic' | 'rare' | 'epic'; count: number }> = [
      { rarity: 'common', count: 3 },
      { rarity: 'magic',  count: 4 },
      { rarity: 'rare',   count: 3 },
    ]
    if (level >= 10) pool.push({ rarity: 'epic', count: 2 })

    for (const { rarity, count } of pool) {
      for (let i = 0; i < count; i++) {
        const item  = generateItem(ilvl, rarity)
        const [lo, hi] = PRICE[rarity]
        const price = Math.round(lo + Math.random() * (hi - lo))
        this.stock.push({ item, price, sold: false })
      }
    }
  }

  private render() {
    this.goldEl.textContent = formatCopper(this.inv.gold)
    this.gridEl.innerHTML = this.stock.map((entry, idx) => {
      const { item, price, sold } = entry
      const canAfford = this.inv.gold >= price && !this.inv.isFull
      const statsHtml = statLines(item.stats)
      return `
        <div class="gp-shop-card ${item.rarity}${sold ? ' sold' : ''}" data-shop-idx="${idx}" style="${sold ? 'opacity:0.4;pointer-events:none' : ''}">
          <div class="gp-shop-name ${item.rarity}">${item.name}</div>
          <div class="gp-shop-stats">${statsHtml}</div>
          <div class="gp-shop-row">
            <span class="gp-shop-price">${formatCopper(price)}</span>
            <button class="gp-shop-buy-btn" data-shop-idx="${idx}" ${sold || !canAfford ? 'disabled' : ''}>
              ${sold ? 'Sold' : 'Buy'}
            </button>
          </div>
        </div>
      `
    }).join('')
  }

  private onClick = (e: MouseEvent) => {
    const btn = (e.target as HTMLElement).closest('.gp-shop-buy-btn') as HTMLButtonElement | null
    if (!btn || btn.disabled) return

    const idx   = parseInt(btn.dataset.shopIdx!)
    const entry = this.stock[idx]
    if (!entry || entry.sold) return
    if (this.inv.gold < entry.price || this.inv.isFull) return

    this.inv.gold -= entry.price
    this.inv.add(entry.item)
    entry.sold = true
    this.inv.notifyChange()
    this.render()
  }

  private onMouseMove = (e: MouseEvent) => {
    const card = (e.target as HTMLElement).closest('[data-shop-idx]') as HTMLElement | null
    if (!card) { window.__gpTooltip.hide(); return }

    const idx   = parseInt(card.dataset.shopIdx!)
    const entry = this.stock[idx]
    if (!entry) { window.__gpTooltip.hide(); return }

    const { item, price, sold } = entry
    const canAfford = this.inv.gold >= price

    const hint = sold
      ? '<span style="color:#556677">Already purchased</span>'
      : !canAfford
        ? '<span style="color:#aa3333">Not enough gold</span>'
        : this.inv.isFull
          ? '<span style="color:#aa3333">Inventory full</span>'
          : '<span style="color:#556677">Click Buy to purchase</span>'

    const html = [
      `<strong style="color:${RARITY_COLOR[item.rarity]}">${item.name}</strong>`,
      `<span style="color:#668899">Ilvl ${item.ilvl}  •  ${item.type}</span>`,
      `<span style="color:#334455">─────────────────</span>`,
      statLines(item.stats),
      `<span style="color:#334455">─────────────────</span>`,
      `<span style="color:#ffdd00">Price: ${formatCopper(price)}</span>`,
      hint,
    ].join('<br>')

    window.__gpTooltip.show(html, e.clientX, e.clientY, RARITY_BORDER[item.rarity])
  }
}
