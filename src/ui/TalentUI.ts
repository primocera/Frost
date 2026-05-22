import Phaser from 'phaser'
import { TALENT_DEFS, TALENT_TREES, TREE_COLOR, TREE_HEX, TREE_LABEL, TREE_UNLOCK_LEVEL, TalentId, talentsForTree } from '../talents/TalentTypes'
import { TalentSystem } from '../systems/TalentSystem'
import { UIScaler } from './uiScale'

// ── Layout ────────────────────────────────────────────────────────────────────
const PX = 60,  PY = 88,  PW = 840, PH = 454
const COL_W  = PW / 3                          // 280
const ROW_H  = 73
const HDR_H  = 50
const FTR_H  = 26

const D_PANEL   = 40
const D_TOOLTIP = 42

const BG     = 0x09090f
const BORDER = 0x334455

function colX(col: number)  { return PX + col * COL_W }
function rowY(row: number)  { return PY + HDR_H + row * ROW_H }
function buyZone(col: number, row: number) {
  return { x: colX(col) + COL_W - 46, y: rowY(row) + 10, w: 38, h: 26 }
}

// ─────────────────────────────────────────────────────────────────────────────

interface TalentRow {
  nameText: Phaser.GameObjects.Text
  descText: Phaser.GameObjects.Text
  rankText: Phaser.GameObjects.Text
  buyText:  Phaser.GameObjects.Text
}

export class TalentUI {
  private visible = false

  private panelGfx:    Phaser.GameObjects.Graphics
  private titleText:   Phaser.GameObjects.Text
  private pointsText:  Phaser.GameObjects.Text
  private treeHeaders: Phaser.GameObjects.Text[]
  private lockLabels:  Phaser.GameObjects.Text[]   // one per tree column
  private rows:        TalentRow[]
  private allObjects:  Phaser.GameObjects.GameObject[]
  private ui!:         UIScaler

  constructor(private scene: Phaser.Scene, private talents: TalentSystem) {
    const d = D_PANEL

    this.panelGfx  = scene.add.graphics().setScrollFactor(0).setDepth(d)
    this.titleText = scene.add.text(PX + PW / 2, PY + 10, 'Talent Trees', {
      fontSize: '17px', fontStyle: 'bold',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#c8d8f8',
    }).setScrollFactor(0).setDepth(d).setOrigin(0.5, 0)

    this.pointsText = scene.add.text(PX + PW / 2, PY + PH - FTR_H + 6, '', {
      fontSize: '12px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#ffdd88',
    }).setScrollFactor(0).setDepth(d).setOrigin(0.5, 0)

    this.treeHeaders = TALENT_TREES.map((tree, col) =>
      scene.add.text(colX(col) + COL_W / 2, PY + HDR_H / 2, TREE_LABEL[tree], {
        fontSize: '13px', fontStyle: 'bold',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: TREE_COLOR[tree],
      }).setScrollFactor(0).setDepth(d).setOrigin(0.5, 0.5)
    )

    // Lock overlay label shown in the middle of each locked column
    this.lockLabels = TALENT_TREES.map((tree, col) =>
      scene.add.text(
        colX(col) + COL_W / 2,
        PY + HDR_H + (PH - HDR_H - FTR_H) / 2,
        `Unlocks at\nlevel ${TREE_UNLOCK_LEVEL[tree]}`, {
          fontSize: '13px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#446666',
          align: 'center',
        }
      ).setScrollFactor(0).setDepth(d + 1).setOrigin(0.5, 0.5)
    )

    // Build one row per talent (3 trees × 5 talents = 15)
    this.rows = TALENT_DEFS.map((def, idx) => {
      const col   = TALENT_TREES.indexOf(def.tree)
      const rowIdx = talentsForTree(def.tree).indexOf(def)
      const cx    = colX(col) + 8
      const ry    = rowY(rowIdx)
      const color = TREE_COLOR[def.tree]

      const nameText = scene.add.text(cx, ry + 8, def.name, {
        fontSize: '12px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color,
      }).setScrollFactor(0).setDepth(d)

      const rankText = scene.add.text(cx, ry + 26, '', {
        fontSize: '12px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color,
      }).setScrollFactor(0).setDepth(d)

      const descText = scene.add.text(cx, ry + 44, '', {
        fontSize: '10px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#888888',
      }).setScrollFactor(0).setDepth(d)

      const { x: bx, y: by } = buyZone(col, rowIdx)
      const buyText = scene.add.text(bx + 19, by + 13, '[+]', {
        fontSize: '11px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#44ff88',
      }).setScrollFactor(0).setDepth(d).setOrigin(0.5, 0.5)

      void idx
      return { nameText, rankText, descText, buyText }
    })

    this.allObjects = [
      this.panelGfx, this.titleText, this.pointsText,
      ...this.treeHeaders,
      ...this.lockLabels,
      ...this.rows.flatMap(r => [r.nameText, r.rankText, r.descText, r.buyText]),
    ]

    this.ui = new UIScaler(scene, D_PANEL)
    this.ui.add(this.allObjects)

    this.hide()
    talents.onChange = () => this.refresh()
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  isOpen() { return this.visible }

  toggle() { this.visible ? this.hide() : this.show() }

  show() {
    this.visible = true
    this.ui.relayout()
    this.allObjects.forEach(o => (o as Phaser.GameObjects.Graphics).setVisible(true))
    this.refresh()
    this.scene.input.on('pointerdown', this.onClick, this)
  }

  hide() {
    this.visible = false
    this.allObjects.forEach(o => (o as Phaser.GameObjects.Graphics).setVisible(false))
    this.scene.input.off('pointerdown', this.onClick, this)
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  refresh() {
    if (!this.visible) return
    this.drawPanel()

    const pts = this.talents.points
    this.pointsText.setText(
      pts > 0 ? `${pts} talent point${pts > 1 ? 's' : ''} available` : 'No talent points — earn more by leveling up'
    ).setColor(pts > 0 ? '#ffdd44' : '#555555')

    // Show/hide lock overlays per tree
    TALENT_TREES.forEach((tree, col) => {
      const unlocked = this.talents.treeUnlocked(tree)
      this.lockLabels[col].setVisible(!unlocked)
      this.treeHeaders[col].setColor(unlocked ? TREE_COLOR[tree] : '#334444')
    })

    TALENT_DEFS.forEach((def, i) => {
      const unlocked = this.talents.treeUnlocked(def.tree)
      const rank     = this.talents.getRank(def.id)
      const maxRank  = def.maxRank
      const canBuy   = this.talents.canBuy(def.id)
      const row      = this.rows[i]

      if (!unlocked) {
        // Dim everything in locked columns
        row.nameText.setColor('#334444')
        row.rankText.setText('○'.repeat(maxRank)).setColor('#334444')
        row.descText.setText(def.desc).setColor('#223333')
        row.buyText.setVisible(false)
        return
      }

      row.nameText.setColor(TREE_COLOR[def.tree])

      // Rank dots: ● filled, ○ empty
      row.rankText.setText('●'.repeat(rank) + '○'.repeat(maxRank - rank)).setColor(TREE_COLOR[def.tree])

      // Description: show next-rank effect or "MAX" if complete
      if (rank < maxRank) {
        row.descText.setText(def.rankDesc[rank]).setColor('#888888')
      } else {
        row.descText.setText('MAX').setColor('#556644')
      }

      // Buy button
      if (rank >= maxRank) {
        row.buyText.setVisible(false)
      } else if (canBuy) {
        row.buyText.setText('[+]').setColor('#44ff88').setVisible(true)
      } else {
        row.buyText.setText('[+]').setColor('#334433').setVisible(true)
      }
    })
  }

  private drawPanel() {
    const g = this.panelGfx
    g.clear()

    // Background
    g.fillStyle(BG, 0.96)
    g.fillRoundedRect(PX, PY, PW, PH, 6)
    g.lineStyle(1, BORDER, 0.8)
    g.strokeRoundedRect(PX, PY, PW, PH, 6)

    // Header separator
    g.lineStyle(1, BORDER, 0.5)
    g.lineBetween(PX + 8, PY + HDR_H, PX + PW - 8, PY + HDR_H)

    // Footer separator
    g.lineBetween(PX + 8, PY + PH - FTR_H, PX + PW - 8, PY + PH - FTR_H)

    // Column dividers
    g.lineBetween(PX + COL_W,     PY + HDR_H, PX + COL_W,     PY + PH - FTR_H)
    g.lineBetween(PX + COL_W * 2, PY + HDR_H, PX + COL_W * 2, PY + PH - FTR_H)

    // Tree column headers
    TALENT_TREES.forEach((tree, col) => {
      const cx = colX(col) + COL_W / 2
      const hx = TREE_HEX[tree]

      // Subtle colored tint behind each column header
      g.fillStyle(hx, 0.07)
      g.fillRect(colX(col) + 1, PY + 1, COL_W - 1, HDR_H - 1)

      // Underline accent
      g.lineStyle(2, hx, 0.5)
      g.lineBetween(colX(col) + 16, PY + HDR_H - 1, colX(col) + COL_W - 16, PY + HDR_H - 1)

      // Column title (drawn as graphics text via scene.add already created — we re-draw
      // the accent line here; the actual text sits in separate Text objects below)
      void cx
    })

    // Dark overlay for locked columns
    TALENT_TREES.forEach((tree, col) => {
      if (!this.talents.treeUnlocked(tree)) {
        g.fillStyle(0x000000, 0.55)
        g.fillRect(colX(col) + 1, PY + HDR_H, COL_W - 1, PH - HDR_H - FTR_H)
      }
    })

    // Per-row slot backgrounds
    TALENT_DEFS.forEach((def, i) => {
      const col     = TALENT_TREES.indexOf(def.tree)
      const rowIdx  = talentsForTree(def.tree).indexOf(def)
      const rank    = this.talents.getRank(def.id)
      const canBuy  = this.talents.canBuy(def.id)
      const ry      = rowY(rowIdx)
      const rx      = colX(col)
      const hx      = TREE_HEX[def.tree]

      const slotBg = rank > 0 ? 0x0d1018 : 0x090910
      g.fillStyle(slotBg, 1)
      g.fillRoundedRect(rx + 4, ry + 3, COL_W - 8, ROW_H - 6, 3)

      if (canBuy) {
        g.lineStyle(1, hx, 0.25)
        g.strokeRoundedRect(rx + 4, ry + 3, COL_W - 8, ROW_H - 6, 3)
      }

      // Left accent bar if any rank purchased
      if (rank > 0) {
        g.fillStyle(hx, 0.60)
        g.fillRect(rx + 4, ry + 5, 3, ROW_H - 10)
      }

      // Buy button background
      if (rank < def.maxRank) {
        const { x: bx, y: by, w: bw, h: bh } = buyZone(col, rowIdx)
        g.fillStyle(canBuy ? 0x0a2010 : 0x0d0d0d, 1)
        g.fillRoundedRect(bx, by, bw, bh, 3)
        g.lineStyle(1, canBuy ? 0x226633 : 0x222222, 0.8)
        g.strokeRoundedRect(bx, by, bw, bh, 3)
      }

      void i
    })
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  private onClick = (ptr: Phaser.Input.Pointer) => {
    if (!ptr.leftButtonDown()) return

    TALENT_DEFS.forEach((def) => {
      const col    = TALENT_TREES.indexOf(def.tree)
      const rowIdx = talentsForTree(def.tree).indexOf(def)
      const { x, y, w, h } = buyZone(col, rowIdx)
      if (ptr.x >= x && ptr.x <= x + w && ptr.y >= y && ptr.y <= y + h) {
        this.talents.buy(def.id)
      }
    })
  }
}
