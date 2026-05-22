import Phaser from 'phaser'
import { EQUIP_SLOTS, EquipSlot, Item, ItemStats, RARITY_COLOR, SLOT_LABEL, STAT_LABEL } from '../items/ItemTypes'
import { Inventory } from '../systems/Inventory'
import { UIScaler } from './uiScale'

// ── Layout constants (all screen-space pixels) ────────────────────────────────
const PX = 130, PY = 112, PW = 700, PH = 388            // outer panel
const DIV = PX + 218                                      // x of divider line

// Equipment slots (left column)
const EX = PX + 12, EY = PY + 48, EW = 198, EH = 36, EG = 6

// Inventory grid (right column)
const GX = DIV + 12, GY = PY + 48, CELL = 56, GAP = 6
const COLS = 5, ROWS = 4                                  // 20 slots total

// Depths
const D_PANEL   = 40
const D_TOOLTIP = 42

// Colours
const BG       = 0x09090f
const BG_ALPHA = 0.94
const BORDER   = 0x334455

function equipSlotRect(i: number): { x: number; y: number; w: number; h: number } {
  return { x: EX, y: EY + i * (EH + EG), w: EW, h: EH }
}

function invSlotRect(idx: number): { x: number; y: number; w: number; h: number } {
  const col = idx % COLS
  const row = Math.floor(idx / COLS)
  return { x: GX + col * (CELL + GAP), y: GY + row * (CELL + GAP), w: CELL, h: CELL }
}

// ── Stat display helpers ──────────────────────────────────────────────────────

function statLines(stats: ItemStats): string[] {
  const lines: string[] = []
  for (const k of Object.keys(stats) as (keyof ItemStats)[]) {
    const v = stats[k]
    if (v === undefined) continue
    let display: string
    if (k === 'critChance' || k === 'cooldownReduction') {
      display = `+${(v * 100).toFixed(1)}%  ${STAT_LABEL[k]}`
    } else if (k === 'manaRegen') {
      display = `+${v.toFixed(1)}  ${STAT_LABEL[k]}`
    } else {
      display = `+${v}  ${STAT_LABEL[k]}`
    }
    lines.push(display)
  }
  return lines
}

// ─────────────────────────────────────────────────────────────────────────────

export class InventoryUI {
  private visible = false

  /** Called with the slot index when the player right-clicks an inventory item. */
  onDropItem?: (idx: number) => void

  // Main panel
  private panelGfx:  Phaser.GameObjects.Graphics
  private titleText: Phaser.GameObjects.Text
  private goldText:  Phaser.GameObjects.Text

  // Equipment slot texts (5 entries)
  private equipTexts: Phaser.GameObjects.Text[]

  // Inventory slot texts (20 entries)
  private invTexts: Phaser.GameObjects.Text[]

  // Tooltip
  private tipGfx:  Phaser.GameObjects.Graphics
  private tipText: Phaser.GameObjects.Text

  private allObjects: Phaser.GameObjects.GameObject[]
  private ui!:        UIScaler

  constructor(private scene: Phaser.Scene, private inv: Inventory) {
    const d = D_PANEL

    // ── Panel background ────────────────────────────────────────────────────
    this.panelGfx = scene.add.graphics().setScrollFactor(0).setDepth(d)

    // ── Title ───────────────────────────────────────────────────────────────
    this.titleText = scene.add.text(PX + PW / 2, PY + 12, 'Inventory', {
      fontSize: '17px', fontStyle: 'bold',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#c8d8f8',
    }).setScrollFactor(0).setDepth(d).setOrigin(0.5, 0)

    // ── Equipment slot texts ────────────────────────────────────────────────
    this.equipTexts = EQUIP_SLOTS.map((slot, i) => {
      const { x, y, h } = equipSlotRect(i)
      return scene.add.text(x + 6, y + h / 2, '', {
        fontSize: '11px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#aaaaaa',
      }).setScrollFactor(0).setDepth(d).setOrigin(0, 0.5)
    })

    // ── Inventory slot texts ────────────────────────────────────────────────
    this.invTexts = Array.from({ length: ROWS * COLS }, (_, idx) => {
      const { x, y, w, h } = invSlotRect(idx)
      return scene.add.text(x + w / 2, y + h / 2, '', {
        fontSize: '10px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#aaaaaa',
        align: 'center', wordWrap: { width: w - 4 },
      }).setScrollFactor(0).setDepth(d).setOrigin(0.5, 0.5)
    })

    // ── Gold text ───────────────────────────────────────────────────────────
    this.goldText = scene.add.text(GX, PY + PH - 22, '', {
      fontSize: '12px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#ffdd00',
    }).setScrollFactor(0).setDepth(d).setOrigin(0, 1)

    // ── Tooltip ─────────────────────────────────────────────────────────────
    this.tipGfx  = scene.add.graphics().setScrollFactor(0).setDepth(D_TOOLTIP)
    this.tipText = scene.add.text(0, 0, '', {
      fontSize: '11px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#dddddd',
      lineSpacing: 4,
    }).setScrollFactor(0).setDepth(D_TOOLTIP)

    this.allObjects = [
      this.panelGfx, this.titleText, this.goldText,
      this.tipGfx, this.tipText,
      ...this.equipTexts,
      ...this.invTexts,
    ]

    this.ui = new UIScaler(scene, D_PANEL)
    this.ui.add(this.allObjects)

    this.hide()

    // Register onChange to redraw when inventory mutates
    inv.onChange = () => this.refresh()
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  isOpen() { return this.visible }

  toggle() { this.visible ? this.hide() : this.show() }

  show() {
    this.visible = true
    this.ui.relayout()
    this.allObjects.forEach(o => (o as Phaser.GameObjects.Graphics).setVisible(true))
    this.refresh()
    this.scene.input.on('pointermove', this.onMove, this)
    this.scene.input.on('pointerdown', this.onClick,  this)
  }

  hide() {
    this.visible = false
    this.allObjects.forEach(o => (o as Phaser.GameObjects.Graphics).setVisible(false))
    this.scene.input.off('pointermove', this.onMove,  this)
    this.scene.input.off('pointerdown', this.onClick, this)
    this.hideTooltip()
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  refresh() {
    if (!this.visible) return
    this.drawPanel()
    this.goldText.setText(`Gold:  ${this.inv.gold} g`)
  }

  private drawPanel() {
    const g = this.panelGfx
    g.clear()

    // Background
    g.fillStyle(BG, BG_ALPHA)
    g.fillRoundedRect(PX, PY, PW, PH, 6)
    g.lineStyle(1, BORDER, 0.8)
    g.strokeRoundedRect(PX, PY, PW, PH, 6)

    // Section headers
    g.lineStyle(1, BORDER, 0.5)
    g.lineBetween(PX + 12, PY + 42, PX + PW - 12, PY + 42)   // below title
    g.lineBetween(DIV, PY + 42, DIV, PY + PH - 8)              // vertical divider

    this.scene.add.text   // section labels (we recreate from scratch each refresh)

    // Draw equipment slots
    EQUIP_SLOTS.forEach((slot, i) => {
      const item = this.inv.equipped[slot]
      const { x, y, w, h } = equipSlotRect(i)

      // Slot background
      const slotBg = item ? 0x1a1a2a : 0x111118
      g.fillStyle(slotBg, 1)
      g.fillRoundedRect(x, y, w, h, 3)
      g.lineStyle(1, item ? 0x334466 : 0x222233, 0.9)
      g.strokeRoundedRect(x, y, w, h, 3)

      // Rarity accent on left edge
      if (item) {
        const rarColor = { common: 0x888888, magic: 0x4477ff, rare: 0xddbb00, epic: 0xbb33ff }
        g.fillStyle(rarColor[item.rarity], 0.8)
        g.fillRect(x, y + 2, 3, h - 4)
      }

      // Slot label (always shown) + item name
      const slotLabel = SLOT_LABEL[slot]
      const itemLine  = item ? item.name : '— empty —'
      const textColor = item ? RARITY_COLOR[item.rarity] : '#444455'
      this.equipTexts[i].setText(`${slotLabel}:  ${itemLine}`).setColor(textColor)
    })

    // Draw inventory grid
    for (let idx = 0; idx < ROWS * COLS; idx++) {
      const item = this.inv.items[idx]
      const { x, y, w, h } = invSlotRect(idx)

      // Slot background tinted by rarity
      const bg = item
        ? { common: 0x1a1818, magic: 0x0d1628, rare: 0x1c1800, epic: 0x180d28 }[item.rarity]
        : 0x111118
      g.fillStyle(bg, 1)
      g.fillRoundedRect(x, y, w, h, 3)

      // Border: rarity color if occupied, dim if empty
      if (item) {
        const bc = { common: 0x555555, magic: 0x4477ff, rare: 0xddbb00, epic: 0xbb33ff }[item.rarity]
        g.lineStyle(1, bc, 0.7)
      } else {
        g.lineStyle(1, 0x222233, 0.7)
      }
      g.strokeRoundedRect(x, y, w, h, 3)

      // Item abbreviation
      if (item) {
        const letter  = item.type[0].toUpperCase()
        const nameAbb = item.name.length > 10 ? item.name.slice(0, 10) + '…' : item.name
        this.invTexts[idx].setText(`${letter}\n${nameAbb}`).setColor(RARITY_COLOR[item.rarity])
      } else {
        this.invTexts[idx].setText('')
      }
    }
  }

  // ── Tooltip ────────────────────────────────────────────────────────────────

  private showTooltip(item: Item, screenX: number, screenY: number) {
    const lines  = statLines(item.stats)
    const body   = [
      item.name,
      `Ilvl ${item.ilvl}  •  ${item.type[0].toUpperCase() + item.type.slice(1)}`,
      '─────────────────',
      ...lines,
      '─────────────────',
      'Left-click: equip/unequip  •  Right-click: drop',
    ].join('\n')

    this.tipText.setText(body)
    this.tipText.setColor('#dddddd')

    const tw  = this.tipText.width  + 20
    const th  = this.tipText.height + 20
    const tx  = screenX + 14 + tw > 960 ? screenX - tw - 8 : screenX + 14
    const ty  = Math.min(screenY, 640 - th - 8)

    this.tipText.setPosition(tx + 10, ty + 10)

    const g = this.tipGfx
    g.clear()
    g.fillStyle(0x050510, 0.95)
    g.fillRoundedRect(tx, ty, tw, th, 4)
    const bc = { common: 0x888888, magic: 0x4477ff, rare: 0xddbb00, epic: 0xbb33ff }[item.rarity]
    g.lineStyle(1, bc, 0.8)
    g.strokeRoundedRect(tx, ty, tw, th, 4)

    // Colour the name line
    this.tipText.setColor(RARITY_COLOR[item.rarity])

    this.tipGfx.setVisible(true)
    this.tipText.setVisible(true)
  }

  private hideTooltip() {
    this.tipGfx.clear()
    this.tipGfx.setVisible(false)
    this.tipText.setVisible(false)
  }

  // ── Input handlers ─────────────────────────────────────────────────────────

  private onMove = (ptr: Phaser.Input.Pointer) => {
    const item = this.itemAtPointer(ptr)
    if (item) this.showTooltip(item, ptr.x, ptr.y)
    else      this.hideTooltip()
  }

  private onClick = (ptr: Phaser.Input.Pointer) => {
    if (ptr.leftButtonDown()) {
      // Check equipment slots
      for (let i = 0; i < EQUIP_SLOTS.length; i++) {
        const { x, y, w, h } = equipSlotRect(i)
        if (ptr.x >= x && ptr.x <= x + w && ptr.y >= y && ptr.y <= y + h) {
          this.inv.unequip(EQUIP_SLOTS[i]); return
        }
      }
      // Check inventory slots
      for (let idx = 0; idx < ROWS * COLS; idx++) {
        const { x, y, w, h } = invSlotRect(idx)
        if (ptr.x >= x && ptr.x <= x + w && ptr.y >= y && ptr.y <= y + h) {
          if (this.inv.items[idx]) this.inv.equip(idx); return
        }
      }
    }

    // Right-click inventory slot → drop
    if (ptr.rightButtonDown()) {
      for (let idx = 0; idx < ROWS * COLS; idx++) {
        const { x, y, w, h } = invSlotRect(idx)
        if (ptr.x >= x && ptr.x <= x + w && ptr.y >= y && ptr.y <= y + h) {
          if (this.inv.items[idx]) this.onDropItem?.(idx); return
        }
      }
    }
  }

  private itemAtPointer(ptr: Phaser.Input.Pointer): Item | null {
    for (let i = 0; i < EQUIP_SLOTS.length; i++) {
      const { x, y, w, h } = equipSlotRect(i)
      if (ptr.x >= x && ptr.x <= x + w && ptr.y >= y && ptr.y <= y + h) {
        return this.inv.equipped[EQUIP_SLOTS[i]]
      }
    }
    for (let idx = 0; idx < ROWS * COLS; idx++) {
      const { x, y, w, h } = invSlotRect(idx)
      if (ptr.x >= x && ptr.x <= x + w && ptr.y >= y && ptr.y <= y + h) {
        return this.inv.items[idx]
      }
    }
    return null
  }
}
