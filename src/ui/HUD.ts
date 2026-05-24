import Phaser from 'phaser'
import { Player } from '../entities/Player'
import { UIScaler } from './uiScale'
import { formatCopper } from '../utils/currency'
import type { MobileControls } from './MobileControls'

const RING_R    = 16
const RING_STEP = 56

const RINGS_BASE = [
  { key: 'Q', name: 'ArcEx',    color: 0xcc44ff },
  { key: 'E', name: 'FrNova',   color: 0x44aaff },
  { key: 'R', name: 'Blizzard', color: 0x0088dd },
  { key: 'F', name: 'Firebolt', color: 0xff8800 },
] as const

type RingDef = { key: string; name: string; color: number }

export class HUD {
  private bars:           Phaser.GameObjects.Graphics
  private levelLabel:     Phaser.GameObjects.Text
  private hpText:         Phaser.GameObjects.Text
  private manaText:       Phaser.GameObjects.Text
  private oomLabel:       Phaser.GameObjects.Text
  private goldText:       Phaser.GameObjects.Text
  private talentBadge:    Phaser.GameObjects.Text
  private aggroText:      Phaser.GameObjects.Text
  private controls:       Phaser.GameObjects.Text
  private ringLabels:     Phaser.GameObjects.Text[]
  private bossNameText:   Phaser.GameObjects.Text
  private playerNameText: Phaser.GameObjects.Text
  private questText:      Phaser.GameObjects.Text

  // Timestamps for transient feedback effects
  private failedCastAt   = [-Infinity, -Infinity, -Infinity, -Infinity]
  private oomAt          = -Infinity
  private activeTextCount = 0

  // Boss bar state
  private bossName   = ''
  private bossHp     = 0
  private bossMaxHp  = 0
  private bossPhase  = 1

  private ui!: UIScaler
  private mobile = false
  private mc: MobileControls | null = null

  // W/H are screen pixels; the UIScaler container counteracts camera zoom,
  // so screen-pixel coordinates render correctly on mobile (zoom 1.6).
  private get W()       { return this.scene.scale.width }
  private get H()       { return this.scene.scale.height }
  private get RING_CY() { return this.H - 44 }

  constructor(private scene: Phaser.Scene) {
    const d = 20
    this.ui = new UIScaler(scene, d)

    this.bars = scene.add.graphics().setScrollFactor(0).setDepth(d)

    // HP / mana / XP labels
    this.levelLabel = scene.add.text(10, 56, '', {
      fontSize: '13px', color: '#dddddd', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    }).setScrollFactor(0).setDepth(d)

    this.hpText = scene.add.text(176, 10, '', {
      fontSize: '10px', color: '#ff8888', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    }).setScrollFactor(0).setDepth(d).setOrigin(1, 0)

    this.manaText = scene.add.text(176, 28, '', {
      fontSize: '10px', color: '#8888ff', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    }).setScrollFactor(0).setDepth(d).setOrigin(1, 0)

    // "OOM" label fades in when trying to cast without mana
    this.oomLabel = scene.add.text(176, 28, 'OOM', {
      fontSize: '11px', color: '#ff4444', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    }).setScrollFactor(0).setDepth(d + 1).setOrigin(1, 0).setAlpha(0)

    this.goldText = scene.add.text(10, 72, '', {
      fontSize: '12px', color: '#ffdd00', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    }).setScrollFactor(0).setDepth(d)

    this.talentBadge = scene.add.text(10, 88, '', {
      fontSize: '11px', color: '#cc88ff', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    }).setScrollFactor(0).setDepth(d)

    this.aggroText = scene.add.text(10, 104, '', {
      fontSize: '11px', color: '#888888', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    }).setScrollFactor(0).setDepth(d)

    this.controls = scene.add.text(0, 10,
      'WASD move\nF/Click  Bolt\nX  Swap bolt\nQ/E/R  Spells\nI  Inventory\nT  Talents\nP  Progress\nE  Trainer/NPCs', {
        fontSize: '11px', color: '#555555', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', align: 'right',
      }).setScrollFactor(0).setDepth(d).setOrigin(1, 0)

    // Ring labels: show key + name when ready, countdown when cooling
    this.ringLabels = RINGS_BASE.map((r, i) =>
      scene.add.text(0, 0, `${r.key} ${r.name}`, {
        fontSize: '10px', color: '#888888', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      }).setScrollFactor(0).setDepth(d).setOrigin(0.5, 0)
    )

    // Boss name label — hidden until a boss spawns
    this.bossNameText = scene.add.text(0, 4, '', {
      fontSize: '11px', color: '#ff8888', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    }).setScrollFactor(0).setDepth(d).setOrigin(0.5, 0).setVisible(false)

    // Player name
    this.playerNameText = scene.add.text(10, 120, '', {
      fontSize: '11px', color: '#556677', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    }).setScrollFactor(0).setDepth(d)

    // Quest tracker
    this.questText = scene.add.text(10, 134, '', {
      fontSize: '11px', color: '#aabb66', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      wordWrap: { width: 220 },
    }).setScrollFactor(0).setDepth(d)

    // Parent all persistent HUD objects into the zoom-correcting container
    this.ui.add([
      this.bars, this.levelLabel, this.hpText, this.manaText, this.oomLabel,
      this.goldText, this.talentBadge, this.aggroText, this.controls,
      ...this.ringLabels, this.bossNameText, this.playerNameText, this.questText,
    ])
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Hide the keyboard shortcut hint (replaced by mobile buttons on touch devices). */
  hideControlsHint() { this.controls.setVisible(false) }

  /** Switch the HUD into mobile layout: bars above the spell grid, quest on the right. */
  setMobile(mc: MobileControls) {
    this.mobile = true
    this.mc     = mc

    // Bars + level/hp/mana move to the bottom-right cluster (done each frame in
    // update()); fill the freed top-left with the remaining info labels.
    this.goldText.setPosition(10, 10)
    this.talentBadge.setPosition(10, 28)
    this.aggroText.setPosition(10, 46)
    this.playerNameText.setPosition(10, 64)

    // Quest tracker → right edge, just left of the menu button column.
    this.questText
      .setOrigin(1, 0)
      .setPosition(this.W - 58, 12)
      .setAlign('right')
      .setWordWrapWidth(150)
  }

  setPlayerName(name: string) { this.playerNameText.setText(name) }
  setQuestText(text: string)  { this.questText.setText(text) }

  /** Animated banner for quest updates, spell unlocks, etc. */
  showQuestUpdate(text: string, color = '#aadd44') {
    const t = this.scene.add.text(this.W / 2, this.H * 0.75, text, {
      fontSize: '16px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color,
      stroke: '#000000', strokeThickness: 4, align: 'center',
    }).setScrollFactor(0).setDepth(50).setOrigin(0.5).setAlpha(0)
    this.ui.container.add(t)
    this.scene.tweens.add({
      targets: t, alpha: 1, y: 468,
      duration: 260, ease: 'Back.Out',
      onComplete: () => {
        this.scene.tweens.add({
          targets: t, y: this.H * 0.69, alpha: 0,
          duration: 800, delay: 2200, ease: 'Power2',
          onComplete: () => t.destroy(),
        })
      },
    })
  }

  /** Show the boss HP bar at the top of the screen. Pass null name to hide it. */
  setBossBar(name: string | null, hp: number, maxHp: number, phase = 1) {
    if (!name) {
      this.bossName = ''
      this.bossNameText.setVisible(false)
      return
    }
    this.bossName  = name
    this.bossHp    = hp
    this.bossMaxHp = maxHp
    this.bossPhase = phase
    this.bossNameText.setText(name).setVisible(true)
  }

  /** Update boss HP each frame (called from GameScene while boss is alive). */
  tickBossBar(hp: number, phase: number) {
    this.bossHp   = hp
    this.bossPhase = phase
  }

  /** Flash a ring red — used when player tries to cast while it's on cooldown. */
  notifyCastFailed(spellIndex: number) {
    this.failedCastAt[spellIndex] = this.scene.time.now
  }

  /** Flash the mana bar — used when player can't afford a spell. */
  notifyOOM() {
    this.oomAt = this.scene.time.now
  }

  update(player: Player, aggroCount = 0) {
    const { stats } = player
    const now = this.scene.time.now
    const g   = this.bars
    this.ui.relayout()
    g.clear()

    // Reposition elements that depend on current screen size
    this.controls.setX(this.W - 10)
    this.bossNameText.setX(this.W / 2)
    if (this.mobile) this.questText.setX(this.W - 58)

    const effMaxMana = player.effectiveMaxMana

    // ── Boss HP bar (top center, hidden when no boss) ─────────────────────
    if (this.bossName) {
      const bw  = 480
      const bx  = (this.W - bw) / 2
      const pct = this.bossMaxHp > 0 ? this.bossHp / this.bossMaxHp : 0
      const fill = this.bossPhase === 3 ? 0xff2200 : this.bossPhase === 2 ? 0xff8800 : 0xdd3333
      this.bar(g, bx, 20, bw, 16, pct, fill, 0x220000)
      // Phase pips
      g.fillStyle(this.bossPhase >= 2 ? 0xff8800 : 0x440000)
      g.fillCircle(bx + bw + 8, 28, 4)
      g.fillStyle(this.bossPhase >= 3 ? 0xff2200 : 0x440000)
      g.fillCircle(bx + bw + 18, 28, 4)
    }

    // ── Stat bars ─────────────────────────────────────────────────────────
    // Geometry differs by platform: desktop top-left, mobile above the spell grid.
    let hpRect, manaRect, xpRect
    if (this.mobile && this.mc) {
      const a = this.mc.getStatBarAnchor()
      const h = 10, gap = 4
      const xpY   = a.bottomY - h
      const manaY = xpY   - gap - h
      const hpY   = manaY - gap - h
      hpRect   = { x: a.x, y: hpY,   w: a.w, h }
      manaRect = { x: a.x, y: manaY, w: a.w, h }
      xpRect   = { x: a.x, y: xpY,   w: a.w, h }
    } else {
      hpRect   = { x: 10, y: 10, w: 160, h: 12 }
      manaRect = { x: 10, y: 28, w: 160, h: 12 }
      xpRect   = { x: 10, y: 46, w: 160, h: 12 }
    }

    this.bar(g, hpRect.x,   hpRect.y,   hpRect.w,   hpRect.h,   stats.hp   / stats.maxHp,    0xdd2222, 0x440000)
    this.bar(g, manaRect.x, manaRect.y, manaRect.w, manaRect.h, stats.mana / effMaxMana,     0x2255ee, 0x001144)
    this.bar(g, xpRect.x,   xpRect.y,   xpRect.w,   xpRect.h,   stats.xp   / stats.xpToNext, 0xddaa00, 0x332200)

    // Red overlay on mana bar when OOM
    const oomAge = now - this.oomAt
    if (oomAge < 500) {
      g.fillStyle(0xff2222, 0.40 * (1 - oomAge / 500))
      g.fillRect(manaRect.x, manaRect.y, manaRect.w, manaRect.h)
    }

    this.levelLabel.setText(`Lv ${stats.level}   ${stats.xp} / ${stats.xpToNext} XP`)
    this.hpText.setText(`${stats.hp}/${stats.maxHp}`)
    this.manaText.setText(`${Math.floor(stats.mana)}/${effMaxMana}`)
    this.goldText.setText(formatCopper(player.inventory.gold))

    // On mobile, the value labels follow the bars to the bottom-right cluster
    if (this.mobile) {
      this.levelLabel.setText(`Lv ${stats.level}`)
      this.levelLabel.setPosition(hpRect.x, hpRect.y - 15)
      this.hpText.setPosition(hpRect.x + hpRect.w, hpRect.y - 3)
      this.manaText.setPosition(manaRect.x + manaRect.w, manaRect.y - 3)
      this.oomLabel.setPosition(manaRect.x + manaRect.w, manaRect.y - 3)
    }

    const pts = player.talents.points
    if (pts > 0) {
      const pulse = 0.75 + 0.25 * Math.sin(now * 0.004)
      this.talentBadge.setText(`T  ${pts} talent pt${pts > 1 ? 's' : ''}!`).setAlpha(pulse)
    } else {
      this.talentBadge.setText('').setAlpha(1)
    }

    const aggroCol = aggroCount >= 10 ? '#ff3300' : aggroCount >= 6 ? '#ff8800' : aggroCount >= 3 ? '#ffaa00' : '#888888'
    this.aggroText.setText(aggroCount > 0 ? `▲ ${aggroCount} chasing` : '').setColor(aggroCol)

    // OOM label fades in then out
    this.oomLabel.setAlpha(oomAge < 600 ? Math.max(0, 1 - oomAge / 600) : 0)

    // ── Low health vignette (pulsing red frame at screen edges) ──────────
    const hpFrac = stats.hp / stats.maxHp
    if (hpFrac < 0.30) {
      const pulse    = hpFrac < 0.15 ? 0.006 : 0.003
      const vigAlpha = (0.12 + 0.10 * Math.sin(now * pulse)) * (1 - hpFrac / 0.30)
      g.fillStyle(0xff0000, vigAlpha)
      g.fillRect(0, 0,           this.W, 52)
      g.fillRect(0, this.H - 52, this.W, 52)
      g.fillRect(0, 52,          52, this.H - 104)
      g.fillRect(this.W - 52, 52, 52, this.H - 104)
    }

    // ── Spell rings — only show learned spells ────────────────────────────
    const isFrost = player.activeBolt === 'frost'
    const ALL_RING_DEFS = [
      { key: 'Q', name: 'ArcBlast',                                  color: 0xcc44ff, spell: 'arcaneBlast',    cdIdx: 0 },
      { key: 'E', name: 'FrNova',                                    color: 0x44aaff, spell: 'frostNova',       cdIdx: 1 },
      { key: 'R', name: 'Blizzard',                                  color: 0x0088dd, spell: 'blizzard',        cdIdx: 2 },
      { key: 'F', name: isFrost ? 'Ice Lance' : 'Firebolt',          color: isFrost ? 0x44ccff : 0xff8800, spell: 'bolt', cdIdx: 3 },
    ]
    const boltCd    = isFrost ? player.frostboltCooldown  : player.fireboltCooldown
    const boltCdMax = isFrost ? player.frostboltCooldownMax : player.fireboltCooldownMax
    const cooldowns = [
      { cd: player.arcaneBlastCooldown,     max: player.arcaneBlastCooldownMax },
      { cd: player.frostNovaCooldown,       max: player.frostNovaCooldownMax },
      { cd: player.blizzardCooldown,        max: player.blizzardCooldownMax },
      { cd: boltCd,                         max: boltCdMax },
    ]

    // Hide all labels; only re-show the ones that get drawn
    this.ringLabels.forEach(l => l.setVisible(false))

    const visibleRings = ALL_RING_DEFS.filter(r => player.hasSpell(r.spell))
    const ringX0 = this.W / 2 - RING_STEP * (visibleRings.length - 1) / 2

    for (let vi = 0; vi < visibleRings.length; vi++) {
      const rng = visibleRings[vi]
      const cx  = ringX0 + vi * RING_STEP
      const { cd, max } = cooldowns[rng.cdIdx]

      this.drawSlot(g, cx, this.RING_CY, RING_R, cd, max, rng.color)

      // Red flash border on failed cast attempt (origIdx maps to failedCastAt slot)
      const origIdx = ALL_RING_DEFS.indexOf(rng)
      const failAge = now - this.failedCastAt[origIdx]
      if (failAge < 380) {
        g.lineStyle(3, 0xff2222, 0.75 * (1 - failAge / 380))
        g.strokeRect(cx - RING_R - 3, this.RING_CY - RING_R - 3, (RING_R + 3) * 2, (RING_R + 3) * 2)
      }

      const lbl = this.ringLabels[origIdx]
      lbl.setPosition(cx, this.RING_CY + RING_R + 7).setVisible(true)
      if (cd <= 0) {
        lbl.setText(`${rng.key} ${rng.name}`).setColor('#cccccc')
      } else {
        lbl.setText((cd / 1000).toFixed(1) + 's').setColor('#555555')
      }
    }
  }

  /** Floating combat text. Pops in then drifts upward and fades. fontSize defaults to 20. */
  showFloatingText(x: number, y: number, text: string, color = '#ff4444', fontSize = 20) {
    // During AoE chaos, skip minor damage numbers to prevent visual overload
    if (this.activeTextCount > 10 && fontSize < 16) return

    this.activeTextCount++
    const xOff = Phaser.Math.Between(-14, 14)
    const t = this.scene.add.text(x + xOff, y - 8, text, {
      fontSize: `${fontSize}px`, color,
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      stroke: '#000000', strokeThickness: Math.max(3, Math.round(fontSize / 5)),
    }).setDepth(30).setOrigin(0.5).setScale(0.4)

    this.scene.tweens.add({
      targets: t, scaleX: 1.1, scaleY: 1.1,
      duration: 90, ease: 'Back.Out',
      onComplete: () => {
        this.scene.tweens.add({
          targets: t, y: y - 65, alpha: 0,
          duration: 680, ease: 'Power2', delay: 60,
          onComplete: () => { this.activeTextCount--; t.destroy() },
        })
      },
    })
  }

  /** Achievement unlock banner — appears below any streak text. */
  showAchievementUnlock(name: string, cosmeticName?: string) {
    const body = cosmeticName ? `Achievement: ${name}\nUnlocked ${cosmeticName} cosmetic!` : `Achievement: ${name}`
    const t = this.scene.add.text(this.W / 2, this.H * 0.266, body, {
      fontSize: '15px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#ffdd44',
      stroke: '#000000', strokeThickness: 5, align: 'center',
    }).setScrollFactor(0).setDepth(50).setOrigin(0.5).setAlpha(0)
    this.ui.container.add(t)

    this.scene.tweens.add({
      targets: t, alpha: 1,
      duration: 280, ease: 'Back.Out',
      onComplete: () => {
        this.scene.tweens.add({
          targets: t, y: 120, alpha: 0,
          duration: 1100, delay: 2200, ease: 'Power2',
          onComplete: () => t.destroy(),
        })
      },
    })
  }

  /** Daily challenge completion banner. */
  showChallengeComplete(desc: string, xpReward: number) {
    const t = this.scene.add.text(this.W / 2, this.H * 0.3125, `Challenge complete!\n${desc}\n+${xpReward} XP bonus`, {
      fontSize: '14px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#44ff88',
      stroke: '#000000', strokeThickness: 4, align: 'center',
    }).setScrollFactor(0).setDepth(50).setOrigin(0.5).setAlpha(0)
    this.ui.container.add(t)

    this.scene.tweens.add({
      targets: t, alpha: 1,
      duration: 260, ease: 'Power2',
      onComplete: () => {
        this.scene.tweens.add({
          targets: t, y: 155, alpha: 0,
          duration: 1000, delay: 2500, ease: 'Power2',
          onComplete: () => t.destroy(),
        })
      },
    })
  }

  /** Large centered kill-streak announcement — pops in and floats up. */
  showStreakText(text: string, color: string, fontSize = 32) {
    const t = this.scene.add.text(this.W / 2, this.H * 0.172, text, {
      fontSize: `${fontSize}px`, fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color,
      stroke: '#000000', strokeThickness: 6,
    }).setScrollFactor(0).setDepth(50).setOrigin(0.5).setAlpha(0).setScale(0.3)
    this.ui.container.add(t)

    this.scene.tweens.add({
      targets: t, scaleX: 1, scaleY: 1, alpha: 1,
      duration: 200, ease: 'Back.Out',
      onComplete: () => {
        this.scene.tweens.add({
          targets: t, y: 70, alpha: 0,
          duration: 900, delay: 400, ease: 'Power2',
          onComplete: () => t.destroy(),
        })
      },
    })
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private drawSlot(
    g:     Phaser.GameObjects.Graphics,
    cx:    number, cy: number, r: number,
    cd:    number, cdMax: number,
    color: number,
  ) {
    const x = cx - r, y = cy - r, size = r * 2
    // Dark border
    g.fillStyle(0x111111, 0.85)
    g.fillRect(x - 3, y - 3, size + 6, size + 6)

    if (cd <= 0) {
      g.fillStyle(color)
      g.fillRect(x, y, size, size)
      // Glint highlight (top-left corner)
      g.fillStyle(0xffffff, 0.22)
      g.fillRect(x + 2, y + 2, size / 2 - 2, size / 3 - 1)
    } else {
      // Dark base
      g.fillStyle(0x1a1a1a)
      g.fillRect(x, y, size, size)
      // Colored fill sweeps upward from bottom as spell recovers
      const recoveredPct = 1 - cd / cdMax
      if (recoveredPct > 0.01) {
        const fillH = size * recoveredPct
        g.fillStyle(color, 0.55)
        g.fillRect(x, y + size - fillH, size, fillH)
      }
    }
  }

  private bar(
    g: Phaser.GameObjects.Graphics,
    x: number, y: number, w: number, h: number,
    pct: number, fill: number, bg: number,
  ) {
    g.fillStyle(bg)
    g.fillRect(x, y, w, h)
    g.fillStyle(fill)
    g.fillRect(x, y, Math.max(0, w * Math.min(1, pct)), h)
  }
}
