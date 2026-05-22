import Phaser from 'phaser'

const SPELL_COLORS = [0xcc44ff, 0x44aaff, 0x0088dd, 0xff8800] as const
const SPELL_KEYS   = ['Q', 'E', 'R', 'F'] as const
const MENU_KEYS    = ['I', 'T', 'P'] as const
const ICOL         = 0x33bb77

// ── Types ──────────────────────────────────────────────────────────────────

export interface SpellCooldown { cd: number; max: number }

interface Layout {
  jx: number; jy: number; baseR: number; knobR: number
  spellR: number; spells: Array<{ cx: number; cy: number }>
  menuR: number;  menus:  Array<{ cx: number; cy: number }>
  ix: number; iy: number; iRad: number
  leftHand: boolean
}

export class MobileControls {
  /** Normalised joystick direction — magnitude 0..1. */
  readonly dir = { x: 0, y: 0 }

  private gfx:          Phaser.GameObjects.Graphics
  private spellTexts:   Phaser.GameObjects.Text[]
  private menuTexts:    Phaser.GameObjects.Text[]
  private interactText: Phaser.GameObjects.Text

  private joystickPtrId: number | null = null
  private knobOffX = 0
  private knobOffY = 0

  private interactLabel: string | null = null

  private cooldowns: SpellCooldown[] = [
    { cd: 0, max: 1 }, { cd: 0, max: 1 },
    { cd: 0, max: 1 }, { cd: 0, max: 1 },
  ]

  constructor(
    private scene:        Phaser.Scene,
    private onSpell:      (idx: number) => void,   // 0=Q 1=E 2=R 3=F
    private onMenu:       (key: string) => void,   // 'I'|'T'|'P'
    private onInteract:   () => void,               // contextual action
    private joystickSide: 'left' | 'right' = 'left',
  ) {
    scene.input.addPointer(4)

    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(25)

    // All text positions are set each frame in redraw()
    this.spellTexts = SPELL_KEYS.map(() =>
      scene.add.text(0, 0, '', {
        fontSize: '10px', color: '#cccccc', fontFamily: 'monospace',
      }).setScrollFactor(0).setDepth(26).setOrigin(0.5, 0)
    )

    this.menuTexts = MENU_KEYS.map(k =>
      scene.add.text(0, 0, k, {
        fontSize: '10px', color: '#aaaaaa', fontFamily: 'monospace',
      }).setScrollFactor(0).setDepth(26).setOrigin(0.5, 0.5)
    )

    this.interactText = scene.add.text(0, 0, '', {
      fontSize: '13px', fontStyle: 'bold',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      color: '#ffffff',
    }).setScrollFactor(0).setDepth(26).setOrigin(0.5, 0.5).setVisible(false)

    scene.input.on('pointerdown', this.onDown, this)
    scene.input.on('pointermove', this.onMove, this)
    scene.input.on('pointerup',   this.onUp,   this)
  }

  // ── Coordinate helpers ─────────────────────────────────────────────────────
  // ptr.x / ptr.y are screen pixels. Scroll-factor-0 objects are drawn at
  // game canvas coords where screenX = canvasX * zoom. So to compare pointer
  // coordinates against canvas positions, divide by zoom.

  private get Z()  { return this.scene.cameras.main.zoom || 1 }
  private get VW() { return this.scene.scale.width  / this.Z }
  private get VH() { return this.scene.scale.height / this.Z }

  /** Canvas-space coords of pointer (screen pixels ÷ zoom). */
  private canvasXY(ptr: Phaser.Input.Pointer) {
    return { x: ptr.x / this.Z, y: ptr.y / this.Z }
  }

  // ── Layout ─────────────────────────────────────────────────────────────────

  private getLayout(): Layout {
    const vw = this.VW, vh = this.VH
    const s  = Math.min(vw, vh)
    const leftHand = this.joystickSide !== 'right'

    // Joystick — bottom-left or bottom-right
    const baseR = Math.max(30, Math.round(s * 0.13))
    const knobR = Math.round(baseR * 0.38)
    const jy    = vh - baseR - 16
    const jx    = leftHand ? (baseR + 16) : (vw - baseR - 16)

    // Spell buttons — 2×2 grid on opposite side from joystick
    const spellR = Math.max(18, Math.round(s * 0.057))
    const gap    = spellR * 2 + 10
    let sx0: number, sx1: number
    if (leftHand) {
      sx1 = Math.round(vw - spellR - 12); sx0 = sx1 - gap
    } else {
      sx0 = Math.round(spellR + 12);      sx1 = sx0 + gap
    }
    const sy1 = Math.round(vh - spellR - 12)
    const sy0 = sy1 - gap
    const spells = [
      { cx: sx0, cy: sy0 },
      { cx: sx1, cy: sy0 },
      { cx: sx0, cy: sy1 },
      { cx: sx1, cy: sy1 },
    ]

    // Menu buttons (I/T/P) — same side as spell buttons, top edge
    const menuR = 16
    const mx = leftHand ? Math.round(vw - menuR - 6) : Math.round(menuR + 6)
    const menus = MENU_KEYS.map((_, i) => ({
      cx: mx,
      cy: Math.round(menuR + 6 + i * (menuR * 2 + 4)),
    }))

    // Interact button — bottom-center
    const iRad = spellR + 6
    const ix   = Math.round(vw / 2)
    const iy   = Math.round(vh - iRad - 12)

    return { jx, jy, baseR, knobR, spellR, spells, menuR, menus, ix, iy, iRad, leftHand }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  isJoystickPtr(ptrId: number): boolean { return ptrId === this.joystickPtrId }

  /** True if a screen-pixel x is inside the joystick zone (don't fire Firebolt). */
  isJoystickZone(screenX: number): boolean {
    const x = screenX / this.Z
    const { jx, baseR, leftHand } = this.getLayout()
    return leftHand ? x < jx + baseR + 28 : x > jx - baseR - 28
  }

  /** True if a screen-pixel tap lands on any control button. */
  isControlTap(screenX: number, screenY: number): boolean {
    const x = screenX / this.Z, y = screenY / this.Z
    const L = this.getLayout()
    for (const s of L.spells)
      if (Phaser.Math.Distance.Between(x, y, s.cx, s.cy) <= L.spellR + 10) return true
    for (const m of L.menus)
      if (Phaser.Math.Distance.Between(x, y, m.cx, m.cy) <= L.menuR + 10) return true
    if (this.interactLabel && Phaser.Math.Distance.Between(x, y, L.ix, L.iy) <= L.iRad + 12) return true
    return false
  }

  setCooldowns(data: SpellCooldown[]) { this.cooldowns = data }

  showInteract(label: string) {
    this.interactLabel = label
    this.interactText.setText(label).setVisible(true)
  }

  hideInteract() {
    this.interactLabel = null
    this.interactText.setVisible(false)
  }

  update() { this.redraw() }

  destroy() {
    this.scene.input.off('pointerdown', this.onDown, this)
    this.scene.input.off('pointermove', this.onMove, this)
    this.scene.input.off('pointerup',   this.onUp,   this)
    this.gfx.destroy()
    this.spellTexts.forEach(t => t.destroy())
    this.menuTexts.forEach(t => t.destroy())
    this.interactText.destroy()
  }

  // ── Pointer handlers ───────────────────────────────────────────────────────

  private onDown(ptr: Phaser.Input.Pointer) {
    const { x, y } = this.canvasXY(ptr)   // screen px → canvas coords
    const L = this.getLayout()

    // Menu buttons (highest priority — small targets)
    for (let i = 0; i < MENU_KEYS.length; i++) {
      const m = L.menus[i]
      if (Phaser.Math.Distance.Between(x, y, m.cx, m.cy) <= L.menuR + 10) {
        this.onMenu(MENU_KEYS[i])
        return
      }
    }

    // Interact button
    if (this.interactLabel && Phaser.Math.Distance.Between(x, y, L.ix, L.iy) <= L.iRad + 12) {
      this.onInteract()
      return
    }

    // Spell buttons
    for (let i = 0; i < L.spells.length; i++) {
      const s = L.spells[i]
      if (Phaser.Math.Distance.Between(x, y, s.cx, s.cy) <= L.spellR + 10) {
        this.onSpell(i)
        return
      }
    }

    // Joystick zone
    const inZone = L.leftHand
      ? x < L.jx + L.baseR + 30
      : x > L.jx - L.baseR - 30
    if (inZone && this.joystickPtrId === null) {
      this.joystickPtrId = ptr.id
      this.moveKnob(ptr.x, ptr.y)
    }
  }

  private onMove(ptr: Phaser.Input.Pointer) {
    if (ptr.id !== this.joystickPtrId || !ptr.isDown) return
    this.moveKnob(ptr.x, ptr.y)
  }

  private onUp(ptr: Phaser.Input.Pointer) {
    if (ptr.id !== this.joystickPtrId) return
    this.joystickPtrId = null
    this.knobOffX = 0
    this.knobOffY = 0
    this.dir.x = 0
    this.dir.y = 0
  }

  private moveKnob(screenX: number, screenY: number) {
    const { jx, jy, baseR } = this.getLayout()
    // Convert screen pixels to canvas coords before computing joystick delta
    const x  = screenX / this.Z
    const y  = screenY / this.Z
    const dx   = x - jx
    const dy   = y - jy
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist > baseR) {
      const s     = baseR / dist
      this.knobOffX = dx * s
      this.knobOffY = dy * s
    } else {
      this.knobOffX = dx
      this.knobOffY = dy
    }

    const deadZone = baseR * 0.12
    const clamped  = Math.min(dist, baseR)
    if (clamped < deadZone) {
      this.dir.x = 0
      this.dir.y = 0
    } else {
      const norm = (clamped - deadZone) / (baseR - deadZone)
      this.dir.x = (dist > 0 ? dx / dist : 0) * norm
      this.dir.y = (dist > 0 ? dy / dist : 0) * norm
    }
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  private redraw() {
    const g      = this.gfx
    const active = this.joystickPtrId !== null
    const L      = this.getLayout()
    g.clear()

    // Sync text objects to current layout
    for (let i = 0; i < L.spells.length; i++)
      this.spellTexts[i].setPosition(L.spells[i].cx, L.spells[i].cy + L.spellR + 5)
    for (let i = 0; i < L.menus.length; i++)
      this.menuTexts[i].setPosition(L.menus[i].cx, L.menus[i].cy)
    this.interactText.setPosition(L.ix, L.iy)

    const knobX = L.jx + this.knobOffX
    const knobY = L.jy + this.knobOffY

    // ── Joystick base ──────────────────────────────────────────────────────
    g.fillStyle(0x000000, active ? 0.42 : 0.18)
    g.fillCircle(L.jx, L.jy, L.baseR)
    g.lineStyle(2, 0xffffff, active ? 0.22 : 0.09)
    g.strokeCircle(L.jx, L.jy, L.baseR)
    g.lineStyle(1, 0xffffff, active ? 0.10 : 0.04)
    g.strokeCircle(L.jx, L.jy, L.baseR * 0.5)

    g.fillStyle(0x7788ff, active ? 0.78 : 0.28)
    g.fillCircle(knobX, knobY, L.knobR)
    if (active) {
      const gl = Math.round(L.knobR * 0.5)
      g.fillStyle(0xffffff, 0.22)
      g.fillCircle(knobX - gl, knobY - gl, Math.max(4, gl))
    }

    // ── Spell buttons ──────────────────────────────────────────────────────
    for (let i = 0; i < L.spells.length; i++) {
      const { cx, cy }   = L.spells[i]
      const { cd, max }  = this.cooldowns[i]
      const ready         = cd <= 0
      const color         = SPELL_COLORS[i]
      const sr            = L.spellR

      g.fillStyle(0x111111, 0.80)
      g.fillCircle(cx, cy, sr + 4)

      if (ready) {
        g.fillStyle(color, 0.88)
        g.fillCircle(cx, cy, sr)
        g.fillStyle(0xffffff, 0.22)
        g.fillCircle(cx - Math.round(sr * 0.44), cy - Math.round(sr * 0.44), Math.max(4, Math.round(sr * 0.33)))
        this.spellTexts[i].setText(SPELL_KEYS[i]).setColor('#dddddd')
      } else {
        g.fillStyle(0x0d0d0d)
        g.fillCircle(cx, cy, sr)
        const pct = 1 - cd / max
        if (pct > 0.01) {
          g.fillStyle(color, 0.58)
          g.slice(cx, cy, sr, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2, false)
          g.fillPath()
        }
        this.spellTexts[i].setText((cd / 1000).toFixed(1) + 's').setColor('#555555')
      }
    }

    // ── Interact button (contextual) ───────────────────────────────────────
    if (this.interactLabel) {
      g.fillStyle(0x000000, 0.55)
      g.fillCircle(L.ix, L.iy, L.iRad + 4)
      g.fillStyle(ICOL, 0.88)
      g.fillCircle(L.ix, L.iy, L.iRad)
      g.fillStyle(0xffffff, 0.18)
      g.fillCircle(L.ix - 10, L.iy - 10, 10)
      g.lineStyle(2, 0x66ffaa, 0.5)
      g.strokeCircle(L.ix, L.iy, L.iRad)
    }

    // ── Menu buttons (I / T / P) ───────────────────────────────────────────
    for (const m of L.menus) {
      g.fillStyle(0x000000, 0.52)
      g.fillCircle(m.cx, m.cy, L.menuR)
      g.lineStyle(1, 0x555555, 0.75)
      g.strokeCircle(m.cx, m.cy, L.menuR)
    }
  }
}
