import Phaser from 'phaser'

// ── Layout constants (all in 960×640 canvas-space) ─────────────────────────

// Virtual joystick — bottom-left
const JX     = 112
const JY     = 530
const BASE_R = 74
const KNOB_R = 28

// Spell buttons — bottom-right, clear of the HUD rings at y≈596
const SPELL_DEFS = [
  { key: 'Q', label: 'ArcEx',    color: 0xcc44ff, cx: 746, cy: 480 },
  { key: 'E', label: 'FrNova',   color: 0x44aaff, cx: 820, cy: 480 },
  { key: 'R', label: 'Blizzard', color: 0x0088dd, cx: 746, cy: 556 },
  { key: 'F', label: 'Firebolt', color: 0xff8800, cx: 820, cy: 556 },
] as const
const SPELL_R = 31

// Menu buttons — top-right column (replaces keyboard-hint text on mobile)
const MENU_DEFS = [
  { key: 'I', cx: 930, cy: 52  },
  { key: 'T', cx: 930, cy: 82  },
  { key: 'P', cx: 930, cy: 112 },
] as const
const MENU_R = 17

// ── Types ──────────────────────────────────────────────────────────────────

export interface SpellCooldown { cd: number; max: number }

export class MobileControls {
  /** Normalised joystick direction — magnitude 0..1. */
  readonly dir = { x: 0, y: 0 }

  private gfx:        Phaser.GameObjects.Graphics
  private spellTexts: Phaser.GameObjects.Text[]
  private menuTexts:  Phaser.GameObjects.Text[]

  private joystickPtrId: number | null = null
  private knobX = JX
  private knobY = JY

  // [cd, max] for each spell — updated each frame by GameScene
  private cooldowns: SpellCooldown[] = [
    { cd: 0, max: 1 }, { cd: 0, max: 1 },
    { cd: 0, max: 1 }, { cd: 0, max: 1 },
  ]

  constructor(
    private scene:   Phaser.Scene,
    private onSpell: (idx: number) => void,   // 0=Q 1=E 2=R 3=F
    private onMenu:  (key: string) => void,   // 'I'|'T'|'P'
  ) {
    // Support up to 5 simultaneous touches (joystick + 4 spell buttons)
    scene.input.addPointer(4)

    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(25)

    // Spell labels (key/countdown) — updated each frame
    this.spellTexts = SPELL_DEFS.map(s =>
      scene.add.text(s.cx, s.cy + SPELL_R + 5, s.key, {
        fontSize: '10px', color: '#cccccc', fontFamily: 'monospace',
      }).setScrollFactor(0).setDepth(26).setOrigin(0.5, 0)
    )

    // Menu button labels — static
    this.menuTexts = MENU_DEFS.map(m =>
      scene.add.text(m.cx, m.cy, m.key, {
        fontSize: '10px', color: '#aaaaaa', fontFamily: 'monospace',
      }).setScrollFactor(0).setDepth(26).setOrigin(0.5, 0.5)
    )

    scene.input.on('pointerdown', this.onDown, this)
    scene.input.on('pointermove', this.onMove, this)
    scene.input.on('pointerup',   this.onUp,   this)
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** True if this pointer ID belongs to the joystick touch. */
  isJoystickPtr(ptrId: number): boolean { return ptrId === this.joystickPtrId }

  /** True if canvas-x is inside the joystick zone (don't fire Firebolt here). */
  isJoystickZone(x: number): boolean { return x < JX + BASE_R + 28 }

  /** Update spell cooldown data — call once per frame before update(). */
  setCooldowns(data: SpellCooldown[]) { this.cooldowns = data }

  /** Redraw the controls — call from GameScene.update(). */
  update() { this.redraw() }

  destroy() {
    this.scene.input.off('pointerdown', this.onDown, this)
    this.scene.input.off('pointermove', this.onMove, this)
    this.scene.input.off('pointerup',   this.onUp,   this)
    this.gfx.destroy()
    this.spellTexts.forEach(t => t.destroy())
    this.menuTexts.forEach(t => t.destroy())
  }

  // ── Pointer handlers ───────────────────────────────────────────────────────

  private onDown(ptr: Phaser.Input.Pointer) {
    const { x, y } = ptr

    // Menu buttons (highest priority — small targets, top-right)
    for (const m of MENU_DEFS) {
      if (Phaser.Math.Distance.Between(x, y, m.cx, m.cy) <= MENU_R + 10) {
        this.onMenu(m.key)
        return
      }
    }

    // Spell buttons
    for (let i = 0; i < SPELL_DEFS.length; i++) {
      const s = SPELL_DEFS[i]
      if (Phaser.Math.Distance.Between(x, y, s.cx, s.cy) <= SPELL_R + 10) {
        this.onSpell(i)
        return
      }
    }

    // Joystick zone — left portion of screen, only one joystick at a time
    if (x < JX + BASE_R + 30 && this.joystickPtrId === null) {
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
    this.knobX = JX
    this.knobY = JY
    this.dir.x = 0
    this.dir.y = 0
  }

  private moveKnob(x: number, y: number) {
    const dx   = x - JX
    const dy   = y - JY
    const dist = Math.sqrt(dx * dx + dy * dy)

    // Clamp knob to base radius
    if (dist > BASE_R) {
      const s  = BASE_R / dist
      this.knobX = JX + dx * s
      this.knobY = JY + dy * s
    } else {
      this.knobX = x
      this.knobY = y
    }

    // Normalised direction with dead zone (12% of base radius)
    const deadZone = BASE_R * 0.12
    const clamped  = Math.min(dist, BASE_R)
    if (clamped < deadZone) {
      this.dir.x = 0
      this.dir.y = 0
    } else {
      const norm = (clamped - deadZone) / (BASE_R - deadZone)
      this.dir.x = (dist > 0 ? dx / dist : 0) * norm
      this.dir.y = (dist > 0 ? dy / dist : 0) * norm
    }
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  private redraw() {
    const g      = this.gfx
    const active = this.joystickPtrId !== null
    g.clear()

    // ── Joystick base ─────────────────────────────────────────────────────
    g.fillStyle(0x000000, active ? 0.42 : 0.18)
    g.fillCircle(JX, JY, BASE_R)
    g.lineStyle(2, 0xffffff, active ? 0.22 : 0.09)
    g.strokeCircle(JX, JY, BASE_R)

    // Inner guide ring
    g.lineStyle(1, 0xffffff, active ? 0.10 : 0.04)
    g.strokeCircle(JX, JY, BASE_R * 0.5)

    // Knob
    g.fillStyle(0x7788ff, active ? 0.78 : 0.28)
    g.fillCircle(this.knobX, this.knobY, KNOB_R)
    if (active) {
      g.fillStyle(0xffffff, 0.22)
      g.fillCircle(this.knobX - 7, this.knobY - 7, 9)
    }

    // ── Spell buttons ──────────────────────────────────────────────────────
    for (let i = 0; i < SPELL_DEFS.length; i++) {
      const s             = SPELL_DEFS[i]
      const { cd, max }  = this.cooldowns[i]
      const ready         = cd <= 0

      // Dark backing ring
      g.fillStyle(0x111111, 0.80)
      g.fillCircle(s.cx, s.cy, SPELL_R + 4)

      if (ready) {
        g.fillStyle(s.color, 0.88)
        g.fillCircle(s.cx, s.cy, SPELL_R)
        // Glint
        g.fillStyle(0xffffff, 0.22)
        g.fillCircle(s.cx - 8, s.cy - 8, 8)
        this.spellTexts[i].setText(s.key).setColor('#dddddd')
      } else {
        // Dimmed base
        g.fillStyle(0x0d0d0d)
        g.fillCircle(s.cx, s.cy, SPELL_R)

        // Cooldown fill arc (sweeps clockwise from top)
        const pct = 1 - cd / max
        if (pct > 0.01) {
          g.fillStyle(s.color, 0.58)
          g.slice(
            s.cx, s.cy, SPELL_R,
            -Math.PI / 2,
            -Math.PI / 2 + pct * Math.PI * 2,
            false,
          )
          g.fillPath()
        }

        this.spellTexts[i].setText((cd / 1000).toFixed(1) + 's').setColor('#555555')
      }
    }

    // ── Menu buttons (I / T / P) ───────────────────────────────────────────
    for (const m of MENU_DEFS) {
      g.fillStyle(0x000000, 0.52)
      g.fillCircle(m.cx, m.cy, MENU_R)
      g.lineStyle(1, 0x555555, 0.75)
      g.strokeCircle(m.cx, m.cy, MENU_R)
    }
  }
}
