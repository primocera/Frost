import Phaser from 'phaser'

const SPELL_COLORS = [0xcc44ff, 0x44aaff, 0x0088dd, 0xff8800] as const
const SPELL_KEYS   = ['Q', 'E', 'R', 'F'] as const
const MENU_KEYS    = ['I', 'T', 'P', '?'] as const
const ICOL         = 0x33bb77

export interface SpellCooldown { cd: number; max: number }

// Screen-pixel layout — all positions defined in CSS/screen pixels, then
// converted to game coords for drawing. This is necessary because Phaser 3
// camera zoom is applied from the VIEWPORT CENTER (W/2, H/2), not the origin:
//   screenX = W/2 + (gameX - W/2) * zoom
//   gameX   = W/2 + (screenX - W/2) / zoom
// Using gameX = screenX / zoom (the naive approach) puts controls far off-screen.
interface ScreenLayout {
  jx: number; jy: number; baseR: number; knobR: number
  spellR: number; spells: Array<{ cx: number; cy: number }>
  menuR:  number; menus:  Array<{ cx: number; cy: number }>
  ix: number; iy: number; iRad: number
  swapR: number; swap: { cx: number; cy: number }
}

export class MobileControls {
  /** Normalised joystick direction — magnitude 0..1. */
  readonly dir = { x: 0, y: 0 }

  private gfx:          Phaser.GameObjects.Graphics
  private spellTexts:   Phaser.GameObjects.Text[]
  private menuTexts:    Phaser.GameObjects.Text[]
  private interactText: Phaser.GameObjects.Text
  private swapText:     Phaser.GameObjects.Text

  /** Currently selected bolt — drives the swap-button icon and F-button colour. */
  private activeBolt: 'fire' | 'frost' = 'fire'

  private joystickPtrId: number | null = null
  // Knob offset stored in SCREEN PIXELS so math stays in one coordinate space
  private knobOffX = 0
  private knobOffY = 0

  private interactLabel: string | null = null

  private cooldowns: SpellCooldown[] = [
    { cd: 0, max: 1 }, { cd: 0, max: 1 },
    { cd: 0, max: 1 }, { cd: 0, max: 1 },
  ]

  constructor(
    private scene:      Phaser.Scene,
    private onSpell:    (idx: number) => void,   // 0=Q 1=E 2=R 3=F
    private onMenu:     (key: string) => void,   // 'I'|'T'|'P'
    private onInteract: () => void,               // contextual action (E key)
    private onSwapBolt: () => void,               // toggle firebolt ↔ frostbolt
  ) {
    scene.input.addPointer(4)

    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(25)

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

    this.swapText = scene.add.text(0, 0, '🔥', {
      fontSize: '15px',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    }).setScrollFactor(0).setDepth(26).setOrigin(0.5, 0.5)

    scene.input.on('pointerdown', this.onDown, this)
    scene.input.on('pointermove', this.onMove, this)
    scene.input.on('pointerup',   this.onUp,   this)
  }

  // ── Coordinate helpers ──────────────────────────────────────────────────────

  private get Z()  { return this.scene.cameras.main.zoom || 1 }
  private get W()  { return this.scene.scale.width }
  private get H()  { return this.scene.scale.height }

  // Screen pixels → game coords for SF=0 drawing (zoom applied from center)
  private s2gx(sx: number) { return this.W / 2 + (sx - this.W / 2) / this.Z }
  private s2gy(sy: number) { return this.H / 2 + (sy - this.H / 2) / this.Z }
  // Radius only needs to be divided by zoom (not offset-adjusted)
  private r2g(r: number)   { return r / this.Z }

  // ── Layout in screen pixels ────────────────────────────────────────────────

  private getLayout(): ScreenLayout {
    const W = this.W, H = this.H
    const s = Math.min(W, H)

    // Joystick — always bottom-left
    const baseR = Math.max(52, Math.round(s * 0.14))
    const knobR = Math.round(baseR * 0.38)
    const jx    = baseR + 22
    const jy    = H - baseR - 28

    // Spell buttons — 2×2 grid, bottom-right
    const spellR = Math.max(30, Math.round(s * 0.072))
    const gap    = spellR * 2 + 14
    const sx1    = W - spellR - 18
    const sx0    = sx1 - gap
    const sy1    = H - spellR - 18
    const sy0    = sy1 - gap
    const spells = [
      { cx: sx0, cy: sy0 },
      { cx: sx1, cy: sy0 },
      { cx: sx0, cy: sy1 },
      { cx: sx1, cy: sy1 },
    ]

    // Menu buttons (I/T/P) — top-right column
    const menuR = 22
    const mx    = W - menuR - 10
    const menus = MENU_KEYS.map((_, i) => ({
      cx: mx,
      cy: Math.round(menuR + 10 + i * (menuR * 2 + 8)),
    }))

    // Interact button — bottom-centre
    const iRad = spellR + 10
    const ix   = Math.round(W / 2)
    const iy   = H - iRad - 22

    // Bolt-swap toggle — above the right column of the spell grid
    const swapR = Math.max(24, Math.round(spellR * 0.74))
    const swap  = { cx: sx1, cy: sy0 - spellR - swapR - 12 }

    return { jx, jy, baseR, knobR, spellR, spells, menuR, menus, ix, iy, iRad, swapR, swap }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  isJoystickPtr(ptrId: number): boolean { return ptrId === this.joystickPtrId }

  /**
   * Screen-pixel box just above the spell grid + swap button, where the HUD
   * can stack the HP/mana/XP bars. All values are screen pixels (matches the
   * HUD's zoom-corrected coordinate space).
   */
  getStatBarAnchor(): { x: number; w: number; bottomY: number } {
    const L     = this.getLayout()
    const left  = L.spells[0].cx - L.spellR        // left edge of left column
    const right = L.spells[1].cx + L.spellR        // right edge of right column
    const swapTop = L.swap.cy - L.swapR            // top of the bolt-swap button
    return { x: left, w: right - left, bottomY: swapTop - 12 }
  }

  /** True if a screen-pixel x is inside the joystick activation zone. */
  isJoystickZone(screenX: number): boolean {
    const { jx, baseR } = this.getLayout()
    return screenX < jx + baseR + 48
  }

  /** True if a screen-pixel tap lands on any control button (spell/menu/interact). */
  isControlTap(screenX: number, screenY: number): boolean {
    const L = this.getLayout()
    for (const s of L.spells)
      if (Phaser.Math.Distance.Between(screenX, screenY, s.cx, s.cy) <= L.spellR + 12) return true
    for (const m of L.menus)
      if (Phaser.Math.Distance.Between(screenX, screenY, m.cx, m.cy) <= L.menuR + 12) return true
    if (this.interactLabel && Phaser.Math.Distance.Between(screenX, screenY, L.ix, L.iy) <= L.iRad + 14)
      return true
    if (Phaser.Math.Distance.Between(screenX, screenY, L.swap.cx, L.swap.cy) <= L.swapR + 12) return true
    return false
  }

  setCooldowns(data: SpellCooldown[]) { this.cooldowns = data }

  setActiveBolt(bolt: 'fire' | 'frost') { this.activeBolt = bolt }

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
    this.swapText.destroy()
  }

  // ── Pointer handlers ───────────────────────────────────────────────────────
  // ptr.x / ptr.y are screen pixels — compare directly against screen layout.

  private onDown(ptr: Phaser.Input.Pointer) {
    const x = ptr.x, y = ptr.y
    const L = this.getLayout()

    // Menu buttons (highest priority — small targets at top)
    for (let i = 0; i < MENU_KEYS.length; i++) {
      const m = L.menus[i]
      if (Phaser.Math.Distance.Between(x, y, m.cx, m.cy) <= L.menuR + 12) {
        this.onMenu(MENU_KEYS[i])
        return
      }
    }

    // Interact button
    if (this.interactLabel && Phaser.Math.Distance.Between(x, y, L.ix, L.iy) <= L.iRad + 14) {
      this.onInteract()
      return
    }

    // Bolt-swap toggle
    if (Phaser.Math.Distance.Between(x, y, L.swap.cx, L.swap.cy) <= L.swapR + 12) {
      this.onSwapBolt()
      return
    }

    // Spell buttons
    for (let i = 0; i < L.spells.length; i++) {
      const s = L.spells[i]
      if (Phaser.Math.Distance.Between(x, y, s.cx, s.cy) <= L.spellR + 12) {
        this.onSpell(i)
        return
      }
    }

    // Joystick — left half of screen
    if (x < L.jx + L.baseR + 48 && this.joystickPtrId === null) {
      this.joystickPtrId = ptr.id
      this.moveKnob(x, y)
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
    this.dir.x   = 0
    this.dir.y   = 0
  }

  // All math in screen pixels — no zoom conversion needed here.
  private moveKnob(screenX: number, screenY: number) {
    const { jx, jy, baseR } = this.getLayout()
    const dx   = screenX - jx
    const dy   = screenY - jy
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist > baseR) {
      const s       = baseR / dist
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
  // Convert every screen-pixel layout position to game coords before drawing.

  private redraw() {
    const g      = this.gfx
    const active = this.joystickPtrId !== null
    const L      = this.getLayout()
    g.clear()

    // Joystick — centre and knob in game coords
    const jgx    = this.s2gx(L.jx)
    const jgy    = this.s2gy(L.jy)
    const baseRg = this.r2g(L.baseR)
    const knobRg = this.r2g(L.knobR)
    const knobGX = this.s2gx(L.jx + this.knobOffX)
    const knobGY = this.s2gy(L.jy + this.knobOffY)

    g.fillStyle(0x000000, active ? 0.42 : 0.18)
    g.fillCircle(jgx, jgy, baseRg)
    g.lineStyle(2, 0xffffff, active ? 0.22 : 0.09)
    g.strokeCircle(jgx, jgy, baseRg)
    g.lineStyle(1, 0xffffff, active ? 0.10 : 0.04)
    g.strokeCircle(jgx, jgy, baseRg * 0.5)

    g.fillStyle(0x7788ff, active ? 0.78 : 0.28)
    g.fillCircle(knobGX, knobGY, knobRg)
    if (active) {
      const gl = Math.round(knobRg * 0.5)
      g.fillStyle(0xffffff, 0.22)
      g.fillCircle(knobGX - gl, knobGY - gl, Math.max(2, gl))
    }

    // Spell buttons
    for (let i = 0; i < L.spells.length; i++) {
      const { cx, cy }  = L.spells[i]
      const { cd, max } = this.cooldowns[i]
      const ready        = cd <= 0
      // The F (bolt) button reflects the active bolt: orange fire / blue frost
      const color        = i === 3
        ? (this.activeBolt === 'frost' ? 0x0088dd : 0xff8800)
        : SPELL_COLORS[i]
      const cgx          = this.s2gx(cx)
      const cgy          = this.s2gy(cy)
      const sr           = this.r2g(L.spellR)

      g.fillStyle(0x111111, 0.80)
      g.fillCircle(cgx, cgy, sr + this.r2g(4))

      if (ready) {
        g.fillStyle(color, 0.88)
        g.fillCircle(cgx, cgy, sr)
        g.fillStyle(0xffffff, 0.22)
        g.fillCircle(cgx - Math.round(sr * 0.44), cgy - Math.round(sr * 0.44), Math.max(2, Math.round(sr * 0.33)))
        this.spellTexts[i].setText(SPELL_KEYS[i]).setColor('#dddddd')
      } else {
        g.fillStyle(0x0d0d0d)
        g.fillCircle(cgx, cgy, sr)
        const pct = 1 - cd / max
        if (pct > 0.01) {
          g.fillStyle(color, 0.58)
          g.slice(cgx, cgy, sr, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2, false)
          g.fillPath()
        }
        this.spellTexts[i].setText((cd / 1000).toFixed(1) + 's').setColor('#555555')
      }

      // Position label below the circle
      this.spellTexts[i].setPosition(cgx, cgy + sr + this.r2g(5))
    }

    // Interact button
    if (this.interactLabel) {
      const igx  = this.s2gx(L.ix)
      const igy  = this.s2gy(L.iy)
      const iRad = this.r2g(L.iRad)
      g.fillStyle(0x000000, 0.55)
      g.fillCircle(igx, igy, iRad + this.r2g(4))
      g.fillStyle(ICOL, 0.88)
      g.fillCircle(igx, igy, iRad)
      g.fillStyle(0xffffff, 0.18)
      g.fillCircle(igx - this.r2g(10), igy - this.r2g(10), this.r2g(10))
      g.lineStyle(2, 0x66ffaa, 0.5)
      g.strokeCircle(igx, igy, iRad)
      this.interactText.setPosition(igx, igy)
    }

    // Bolt-swap toggle — shows the active bolt's icon
    {
      const sgx   = this.s2gx(L.swap.cx)
      const sgy   = this.s2gy(L.swap.cy)
      const sr    = this.r2g(L.swapR)
      const frost = this.activeBolt === 'frost'
      g.fillStyle(0x111111, 0.80)
      g.fillCircle(sgx, sgy, sr + this.r2g(3))
      g.fillStyle(frost ? 0x0088dd : 0xff8800, 0.9)
      g.fillCircle(sgx, sgy, sr)
      g.fillStyle(0xffffff, 0.2)
      g.fillCircle(sgx - this.r2g(8), sgy - this.r2g(8), this.r2g(7))
      g.lineStyle(2, frost ? 0x88ddff : 0xffcc66, 0.6)
      g.strokeCircle(sgx, sgy, sr)
      this.swapText.setText(frost ? '❄' : '🔥').setPosition(sgx, sgy)
    }

    // Menu buttons (I/T/P)
    for (let i = 0; i < L.menus.length; i++) {
      const { cx, cy } = L.menus[i]
      const mgx  = this.s2gx(cx)
      const mgy  = this.s2gy(cy)
      const menuR = this.r2g(L.menuR)
      g.fillStyle(0x000000, 0.52)
      g.fillCircle(mgx, mgy, menuR)
      g.lineStyle(1, 0x555555, 0.75)
      g.strokeCircle(mgx, mgy, menuR)
      this.menuTexts[i].setPosition(mgx, mgy)
    }
  }
}
