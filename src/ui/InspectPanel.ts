/**
 * InspectPanel — entity stat popup.
 *
 * Triggered by Tab (nearest entity or self) or by GameScene calling show().
 * Rendered in screen-space (scrollFactor 0) so it's always readable.
 *
 * Multiplayer readiness: the InspectData interface maps directly to what
 * a INSPECT_RESPONSE network message would carry, so remote player
 * inspection is a matter of wiring the NetAdapter → social.inspectLocal().
 */

import Phaser from 'phaser'
import { InspectData } from '../social/SocialSystem'

const PW  = 220   // panel width
const PX  = 690   // left edge in canvas-space (right portion of screen)
const PY  = 92    // top edge
const PAD = 10    // inner padding

const TYPE_COLOR: Record<string, string> = {
  player: '#88aaff',
  enemy:  '#ff8888',
  boss:   '#ffaa44',
  elite:  '#ffdd44',
  ranged: '#dd88ff',
  tank:   '#aaaaaa',
  swarm:  '#ff6666',
  melee:  '#ff8888',
}

export class InspectPanel {
  private gfx:     Phaser.GameObjects.Graphics
  private texts:   Phaser.GameObjects.Text[] = []
  private visible  = false
  private hideAt   = 0   // scene timestamp

  constructor(private scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(40)
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Show the inspect panel with the given data.
   * Auto-hides after 5 s or when hide() is called.
   */
  show(data: InspectData) {
    this.clearTexts()
    this.visible = true
    this.hideAt  = this.scene.time.now + 5000

    const typeColor = TYPE_COLOR[data.type] ?? '#cccccc'
    const lines: { text: string; color: string }[] = []

    // Header
    lines.push({ text: data.name,           color: typeColor })
    lines.push({ text: this.typeLabel(data.type, data.level), color: '#888888' })

    // HP bar line
    const hpPct  = data.maxHp > 0 ? data.hp / data.maxHp : 0
    const hpFill = '█'.repeat(Math.round(hpPct * 12)).padEnd(12, '░')
    lines.push({ text: `HP  ${hpFill}  ${data.hp}/${data.maxHp}`, color: this.hpColor(hpPct) })

    // Mana (optional)
    if (data.mana !== undefined && data.maxMana) {
      const mnPct  = data.maxMana > 0 ? data.mana / data.maxMana : 0
      const mnFill = '█'.repeat(Math.round(mnPct * 12)).padEnd(12, '░')
      lines.push({ text: `MP  ${mnFill}  ${Math.floor(data.mana)}/${data.maxMana}`, color: '#4488ff' })
    }

    // Extra stat lines
    if (data.extra?.length) {
      lines.push({ text: '─'.repeat(26), color: '#333333' })
      data.extra.forEach(e => lines.push({ text: e, color: '#aaaaaa' }))
    }

    // Render
    const ph = PAD * 2 + lines.length * 16 + 4
    this.gfx.clear()
    this.gfx.fillStyle(0x000000, 0.82)
    this.gfx.fillRoundedRect(PX - 4, PY - 4, PW + 8, ph + 8, 4)
    this.gfx.lineStyle(1, 0x444444, 0.8)
    this.gfx.strokeRoundedRect(PX - 4, PY - 4, PW + 8, ph + 8, 4)

    lines.forEach((l, i) => {
      this.texts.push(
        this.scene.add.text(PX + PAD, PY + PAD + i * 16, l.text, {
          fontSize: '11px', color: l.color, fontFamily: 'monospace',
        }).setScrollFactor(0).setDepth(41)
      )
    })
  }

  hide() {
    if (!this.visible) return
    this.visible = false
    this.clearTexts()
    this.gfx.clear()
  }

  isVisible() { return this.visible }

  /** Call from GameScene.update() — auto-hides when the timer expires. */
  update() {
    if (this.visible && this.scene.time.now > this.hideAt) this.hide()
  }

  destroy() {
    this.clearTexts()
    this.gfx.destroy()
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private clearTexts() {
    this.texts.forEach(t => t.destroy())
    this.texts = []
  }

  private typeLabel(type: string, level: number): string {
    const typeName = type.charAt(0).toUpperCase() + type.slice(1)
    return level > 0 ? `Lv ${level}  ${typeName}` : typeName
  }

  private hpColor(pct: number): string {
    if (pct > 0.60) return '#44dd44'
    if (pct > 0.30) return '#ddaa00'
    return '#dd3333'
  }
}
