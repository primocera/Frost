import Phaser from 'phaser'
import { Item, RARITY_COLOR } from '../items/ItemTypes'
import { Inventory } from '../systems/Inventory'
import { Stash } from '../systems/Stash'
import { UIScaler } from './uiScale'

const CELL = 56
const GAP  = 6
const COLS = 5
const ROWS = 4

const GRID_W = COLS * (CELL + GAP) - GAP   // 304px
const PW     = 12 + GRID_W + 16 + GRID_W + 12  // 648px
const PH     = 54 + ROWS * (CELL + GAP) - GAP + 28  // 306px

const D_PANEL   = 44
const D_TOOLTIP = 46

function stashSlotRect(idx: number, panelX: number, panelY: number) {
  const col = idx % COLS, row = Math.floor(idx / COLS)
  return {
    x: panelX + 12 + col * (CELL + GAP),
    y: panelY + 54 + row * (CELL + GAP),
    w: CELL, h: CELL,
  }
}

function invSlotRect(idx: number, panelX: number, panelY: number) {
  const col = idx % COLS, row = Math.floor(idx / COLS)
  return {
    x: panelX + 12 + GRID_W + 16 + col * (CELL + GAP),
    y: panelY + 54 + row * (CELL + GAP),
    w: CELL, h: CELL,
  }
}

export class StashUI {
  private visible = false
  private panelGfx: Phaser.GameObjects.Graphics
  private stashTexts: Phaser.GameObjects.Text[]
  private invTexts:   Phaser.GameObjects.Text[]
  private tipGfx:     Phaser.GameObjects.Graphics
  private tipText:    Phaser.GameObjects.Text
  private allObjects: Phaser.GameObjects.GameObject[]
  private ui!:        UIScaler

  /** Called when player right-clicks an inventory item — idx is the inventory slot. */
  onDropInventoryItem?: (idx: number) => void

  constructor(
    private scene:   Phaser.Scene,
    private stash:   Stash,
    private inv:     Inventory,
  ) {
    const d = D_PANEL
    this.panelGfx = scene.add.graphics().setScrollFactor(0).setDepth(d)

    this.stashTexts = Array.from({ length: ROWS * COLS }, () =>
      scene.add.text(0, 0, '', {
        fontSize: '10px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#aaaaaa',
        align: 'center', wordWrap: { width: CELL - 4 },
      }).setScrollFactor(0).setDepth(d).setOrigin(0.5)
    )

    this.invTexts = Array.from({ length: ROWS * COLS }, () =>
      scene.add.text(0, 0, '', {
        fontSize: '10px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#aaaaaa',
        align: 'center', wordWrap: { width: CELL - 4 },
      }).setScrollFactor(0).setDepth(d).setOrigin(0.5)
    )

    this.tipGfx  = scene.add.graphics().setScrollFactor(0).setDepth(D_TOOLTIP)
    this.tipText = scene.add.text(0, 0, '', {
      fontSize: '11px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#dddddd', lineSpacing: 3,
    }).setScrollFactor(0).setDepth(D_TOOLTIP)

    this.allObjects = [
      this.panelGfx, this.tipGfx, this.tipText,
      ...this.stashTexts, ...this.invTexts,
    ]

    this.ui = new UIScaler(scene, D_PANEL)
    this.ui.add(this.allObjects)

    this.hide()

    stash.onChange = () => this.refresh()
    inv.onChange   = () => this.refresh()
  }

  isOpen() { return this.visible }

  show() {
    this.visible = true
    this.ui.relayout()
    this.allObjects.forEach(o => (o as Phaser.GameObjects.Graphics).setVisible(true))
    this.refresh()
    this.scene.input.on('pointermove', this.onMove,  this)
    this.scene.input.on('pointerdown', this.onClick, this)
  }

  hide() {
    this.visible = false
    this.allObjects.forEach(o => (o as Phaser.GameObjects.Graphics).setVisible(false))
    this.scene.input.off('pointermove', this.onMove,  this)
    this.scene.input.off('pointerdown', this.onClick, this)
    this.hideTooltip()
  }

  refresh() {
    if (!this.visible) return
    this.draw()
  }

  private get px() { return this.scene.scale.width  / 2 - PW / 2 }
  private get py() { return this.scene.scale.height / 2 - PH / 2 }

  private draw() {
    const { px, py } = this
    const g = this.panelGfx
    g.clear()

    // Background
    g.fillStyle(0x09090f, 0.96)
    g.fillRoundedRect(px, py, PW, PH, 6)
    g.lineStyle(1, 0x556677, 0.8)
    g.strokeRoundedRect(px, py, PW, PH, 6)

    // Divider
    const divX = px + 12 + GRID_W + 8
    g.lineStyle(1, 0x334455, 0.6)
    g.lineBetween(divX, py + 46, divX, py + PH - 8)

    // Header labels
    this.scene.add.text  // column headers drawn via text objects created below (stateless)

    // Stash column header
    g.fillStyle(0x1a2a1a, 0.5)
    g.fillRoundedRect(px + 12, py + 8, GRID_W, 38, 3)
    g.fillStyle(0x2a3a2a, 0.5)

    // Inventory column header
    g.fillStyle(0x1a1a2a, 0.5)
    g.fillRoundedRect(px + 12 + GRID_W + 16, py + 8, GRID_W, 38, 3)

    // Draw stash slots
    for (let idx = 0; idx < ROWS * COLS; idx++) {
      const item = this.stash.items[idx]
      const { x, y, w, h } = stashSlotRect(idx, px, py)
      this.drawCell(g, item, x, y, w, h)
      const cx = x + w / 2, cy = y + h / 2
      this.stashTexts[idx].setPosition(cx, cy)
      if (item) {
        const abb = item.name.length > 9 ? item.name.slice(0, 9) + '…' : item.name
        this.stashTexts[idx].setText(`${item.type[0].toUpperCase()}\n${abb}`).setColor(RARITY_COLOR[item.rarity])
      } else {
        this.stashTexts[idx].setText('')
      }
    }

    // Draw inventory slots
    for (let idx = 0; idx < ROWS * COLS; idx++) {
      const item = this.inv.items[idx]
      const { x, y, w, h } = invSlotRect(idx, px, py)
      this.drawCell(g, item, x, y, w, h)
      const cx = x + w / 2, cy = y + h / 2
      this.invTexts[idx].setPosition(cx, cy)
      if (item) {
        const abb = item.name.length > 9 ? item.name.slice(0, 9) + '…' : item.name
        this.invTexts[idx].setText(`${item.type[0].toUpperCase()}\n${abb}`).setColor(RARITY_COLOR[item.rarity])
      } else {
        this.invTexts[idx].setText('')
      }
    }
  }

  private drawCell(g: Phaser.GameObjects.Graphics, item: Item | null, x: number, y: number, w: number, h: number) {
    const bg = item
      ? { common: 0x1a1818, magic: 0x0d1628, rare: 0x1c1800, epic: 0x180d28 }[item.rarity]
      : 0x111118
    g.fillStyle(bg, 1)
    g.fillRoundedRect(x, y, w, h, 3)
    if (item) {
      const bc = { common: 0x555555, magic: 0x4477ff, rare: 0xddbb00, epic: 0xbb33ff }[item.rarity]
      g.lineStyle(1, bc, 0.7)
    } else {
      g.lineStyle(1, 0x222233, 0.7)
    }
    g.strokeRoundedRect(x, y, w, h, 3)
  }

  // ── Tooltip ──────────────────────────────────────────────────────────────────

  private showTooltip(item: Item, sx: number, sy: number, hint: string) {
    const body = [
      item.name,
      `Ilvl ${item.ilvl}  •  ${item.type}`,
      '─────────────────',
      ...Object.entries(item.stats).map(([k, v]) => `+${v}  ${k}`),
      '─────────────────',
      hint,
    ].join('\n')

    this.tipText.setText(body).setColor(RARITY_COLOR[item.rarity])
    const tw = this.tipText.width + 20, th = this.tipText.height + 20
    const tx = sx + 14 + tw > this.scene.scale.width ? sx - tw - 8 : sx + 14
    const ty = Math.min(sy, this.scene.scale.height - th - 8)
    this.tipText.setPosition(tx + 10, ty + 10)
    const g = this.tipGfx
    g.clear()
    g.fillStyle(0x050510, 0.95)
    g.fillRoundedRect(tx, ty, tw, th, 4)
    const bc = { common: 0x888888, magic: 0x4477ff, rare: 0xddbb00, epic: 0xbb33ff }[item.rarity]
    g.lineStyle(1, bc, 0.8)
    g.strokeRoundedRect(tx, ty, tw, th, 4)
    this.tipGfx.setVisible(true)
    this.tipText.setVisible(true)
  }

  private hideTooltip() {
    this.tipGfx.clear().setVisible(false)
    this.tipText.setVisible(false)
  }

  // ── Input ────────────────────────────────────────────────────────────────────

  private onMove = (ptr: Phaser.Input.Pointer) => {
    const { px, py } = this
    for (let idx = 0; idx < ROWS * COLS; idx++) {
      const { x, y, w, h } = stashSlotRect(idx, px, py)
      if (ptr.x >= x && ptr.x <= x + w && ptr.y >= y && ptr.y <= y + h) {
        const item = this.stash.items[idx]
        if (item) { this.showTooltip(item, ptr.x, ptr.y, 'Click → move to backpack'); return }
      }
    }
    for (let idx = 0; idx < ROWS * COLS; idx++) {
      const { x, y, w, h } = invSlotRect(idx, px, py)
      if (ptr.x >= x && ptr.x <= x + w && ptr.y >= y && ptr.y <= y + h) {
        const item = this.inv.items[idx]
        if (item) { this.showTooltip(item, ptr.x, ptr.y, 'Left-click → stash  •  Right-click → drop'); return }
      }
    }
    this.hideTooltip()
  }

  private onClick = (ptr: Phaser.Input.Pointer) => {
    const { px, py } = this

    // Click on stash slot → move to inventory
    if (ptr.leftButtonDown()) {
      for (let idx = 0; idx < ROWS * COLS; idx++) {
        const { x, y, w, h } = stashSlotRect(idx, px, py)
        if (ptr.x >= x && ptr.x <= x + w && ptr.y >= y && ptr.y <= y + h) {
          const item = this.stash.items[idx]
          if (item && !this.inv.isFull) {
            this.stash.remove(idx)
            this.inv.add(item)
          }
          return
        }
      }

      // Left-click on inventory slot → move to stash
      for (let idx = 0; idx < ROWS * COLS; idx++) {
        const { x, y, w, h } = invSlotRect(idx, px, py)
        if (ptr.x >= x && ptr.x <= x + w && ptr.y >= y && ptr.y <= y + h) {
          const item = this.inv.items[idx]
          if (item && !this.stash.isFull) {
            this.inv.items[idx] = null
            this.stash.add(item)
            this.inv.onChange?.()
          }
          return
        }
      }
    }

    // Right-click on inventory slot → drop
    if (ptr.rightButtonDown()) {
      for (let idx = 0; idx < ROWS * COLS; idx++) {
        const { x, y, w, h } = invSlotRect(idx, px, py)
        if (ptr.x >= x && ptr.x <= x + w && ptr.y >= y && ptr.y <= y + h) {
          if (this.inv.items[idx]) this.onDropInventoryItem?.(idx)
          return
        }
      }
    }
  }
}
