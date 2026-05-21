import Phaser from 'phaser'
import { Player } from '../entities/Player'

const W = 960
const H = 640

const RING_CY   = H - 44
const RING_R    = 16
const RING_STEP = 56
const RING_X0   = W / 2 - RING_STEP * 1.5

const RINGS = [
  { key: 'Q', name: 'ArcEx',    color: 0xcc44ff },
  { key: 'E', name: 'FrNova',   color: 0x44aaff },
  { key: 'R', name: 'Blizzard', color: 0x0088dd },
  { key: 'F', name: 'Firebolt', color: 0xff8800 },
] as const

export class HUD {
  private bars:        Phaser.GameObjects.Graphics
  private levelLabel:  Phaser.GameObjects.Text
  private hpText:      Phaser.GameObjects.Text
  private manaText:    Phaser.GameObjects.Text
  private oomLabel:    Phaser.GameObjects.Text
  private goldText:    Phaser.GameObjects.Text
  private talentBadge: Phaser.GameObjects.Text
  private aggroText:   Phaser.GameObjects.Text
  private controls:    Phaser.GameObjects.Text
  private ringLabels:  Phaser.GameObjects.Text[]
  private bossNameText: Phaser.GameObjects.Text

  // Timestamps for transient feedback effects
  private failedCastAt   = [-Infinity, -Infinity, -Infinity, -Infinity]
  private oomAt          = -Infinity
  private activeTextCount = 0

  // Boss bar state
  private bossName   = ''
  private bossHp     = 0
  private bossMaxHp  = 0
  private bossPhase  = 1

  constructor(private scene: Phaser.Scene) {
    const d = 20

    this.bars = scene.add.graphics().setScrollFactor(0).setDepth(d)

    // HP / mana / XP labels
    this.levelLabel = scene.add.text(10, 56, '', {
      fontSize: '13px', color: '#dddddd', fontFamily: 'monospace',
    }).setScrollFactor(0).setDepth(d)

    this.hpText = scene.add.text(176, 10, '', {
      fontSize: '10px', color: '#ff8888', fontFamily: 'monospace',
    }).setScrollFactor(0).setDepth(d).setOrigin(1, 0)

    this.manaText = scene.add.text(176, 28, '', {
      fontSize: '10px', color: '#8888ff', fontFamily: 'monospace',
    }).setScrollFactor(0).setDepth(d).setOrigin(1, 0)

    // "OOM" label fades in when trying to cast without mana
    this.oomLabel = scene.add.text(176, 28, 'OOM', {
      fontSize: '11px', color: '#ff4444', fontFamily: 'monospace',
    }).setScrollFactor(0).setDepth(d + 1).setOrigin(1, 0).setAlpha(0)

    this.goldText = scene.add.text(10, 72, '', {
      fontSize: '12px', color: '#ffdd00', fontFamily: 'monospace',
    }).setScrollFactor(0).setDepth(d)

    this.talentBadge = scene.add.text(10, 88, '', {
      fontSize: '11px', color: '#cc88ff', fontFamily: 'monospace',
    }).setScrollFactor(0).setDepth(d)

    this.aggroText = scene.add.text(10, 104, '', {
      fontSize: '11px', color: '#888888', fontFamily: 'monospace',
    }).setScrollFactor(0).setDepth(d)

    this.controls = scene.add.text(W - 10, 10,
      'WASD move\nF/Click  Firebolt\nQ  Arcane Exp\nE  Frost Nova\nR  Blizzard\nI  Inventory\nT  Talents\nP  Progress', {
        fontSize: '11px', color: '#555555', fontFamily: 'monospace', align: 'right',
      }).setScrollFactor(0).setDepth(d).setOrigin(1, 0)

    // Ring labels: show key + name when ready, countdown when cooling
    this.ringLabels = RINGS.map((r, i) =>
      scene.add.text(RING_X0 + i * RING_STEP, RING_CY + RING_R + 7, `${r.key} ${r.name}`, {
        fontSize: '10px', color: '#888888', fontFamily: 'monospace',
      }).setScrollFactor(0).setDepth(d).setOrigin(0.5, 0)
    )

    // Boss name label — hidden until a boss spawns
    this.bossNameText = scene.add.text(W / 2, 4, '', {
      fontSize: '11px', color: '#ff8888', fontFamily: 'monospace',
    }).setScrollFactor(0).setDepth(d).setOrigin(0.5, 0).setVisible(false)
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Hide the keyboard shortcut hint (replaced by mobile buttons on touch devices). */
  hideControlsHint() { this.controls.setVisible(false) }

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
    g.clear()

    const effMaxMana = player.effectiveMaxMana

    // ── Boss HP bar (top center, hidden when no boss) ─────────────────────
    if (this.bossName) {
      const bw  = 480
      const bx  = (W - bw) / 2
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
    this.bar(g, 10, 10, 160, 12, stats.hp   / stats.maxHp,    0xdd2222, 0x440000)
    this.bar(g, 10, 28, 160, 12, stats.mana / effMaxMana,     0x2255ee, 0x001144)
    this.bar(g, 10, 46, 160, 12, stats.xp   / stats.xpToNext, 0xddaa00, 0x332200)

    // Red overlay on mana bar when OOM
    const oomAge = now - this.oomAt
    if (oomAge < 500) {
      g.fillStyle(0xff2222, 0.40 * (1 - oomAge / 500))
      g.fillRect(10, 28, 160, 12)
    }

    this.levelLabel.setText(`Lv ${stats.level}   ${stats.xp} / ${stats.xpToNext} XP`)
    this.hpText.setText(`${stats.hp}/${stats.maxHp}`)
    this.manaText.setText(`${Math.floor(stats.mana)}/${effMaxMana}`)
    this.goldText.setText(`${player.inventory.gold} g`)

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
      // Pulse rate doubles at very low HP for urgency
      const pulse    = hpFrac < 0.15 ? 0.006 : 0.003
      const vigAlpha = (0.12 + 0.10 * Math.sin(now * pulse)) * (1 - hpFrac / 0.30)
      g.fillStyle(0xff0000, vigAlpha)
      g.fillRect(0, 0,     W, 52)          // top
      g.fillRect(0, H - 52, W, 52)         // bottom
      g.fillRect(0, 52,    52, H - 104)    // left
      g.fillRect(W - 52, 52, 52, H - 104) // right
    }

    // ── Spell rings ───────────────────────────────────────────────────────
    const cooldowns = [
      { cd: player.arcaneExplosionCooldown, max: player.arcaneExplosionCooldownMax },
      { cd: player.frostNovaCooldown,       max: player.frostNovaCooldownMax },
      { cd: player.blizzardCooldown,        max: player.blizzardCooldownMax },
      { cd: player.fireboltCooldown,        max: player.fireboltCooldownMax },
    ]

    for (let i = 0; i < RINGS.length; i++) {
      const cx  = RING_X0 + i * RING_STEP
      const rng = RINGS[i]
      const { cd, max } = cooldowns[i]
      const ready = cd <= 0

      this.drawRing(g, cx, RING_CY, RING_R, cd, max, rng.color)

      // Red flash border on failed cast attempt
      const failAge = now - this.failedCastAt[i]
      if (failAge < 380) {
        g.lineStyle(3, 0xff2222, 0.75 * (1 - failAge / 380))
        g.strokeCircle(cx, RING_CY, RING_R + 3)
      }

      // Label: show countdown when cooling, key+name when ready
      if (ready) {
        this.ringLabels[i].setText(`${rng.key} ${rng.name}`).setColor('#cccccc')
      } else {
        const secs = (cd / 1000).toFixed(1)
        this.ringLabels[i].setText(secs + 's').setColor('#555555')
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
      fontFamily: 'monospace',
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
    const t = this.scene.add.text(W / 2, 170, body, {
      fontSize: '15px', fontFamily: 'monospace', color: '#ffdd44',
      stroke: '#000000', strokeThickness: 5, align: 'center',
    }).setScrollFactor(0).setDepth(50).setOrigin(0.5).setAlpha(0)

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
    const t = this.scene.add.text(W / 2, 200, `Challenge complete!\n${desc}\n+${xpReward} XP bonus`, {
      fontSize: '14px', fontFamily: 'monospace', color: '#44ff88',
      stroke: '#000000', strokeThickness: 4, align: 'center',
    }).setScrollFactor(0).setDepth(50).setOrigin(0.5).setAlpha(0)

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
    const t = this.scene.add.text(W / 2, 110, text, {
      fontSize: `${fontSize}px`, fontFamily: 'monospace', color,
      stroke: '#000000', strokeThickness: 6,
    }).setScrollFactor(0).setDepth(50).setOrigin(0.5).setAlpha(0).setScale(0.3)

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

  private drawRing(
    g:     Phaser.GameObjects.Graphics,
    cx:    number, cy: number, r: number,
    cd:    number, cdMax: number,
    color: number,
  ) {
    g.fillStyle(0x111111, 0.85)
    g.fillCircle(cx, cy, r + 3)

    if (cd <= 0) {
      g.fillStyle(color)
      g.fillCircle(cx, cy, r)
      g.fillStyle(0xffffff, 0.30)
      g.fillCircle(cx - 4, cy - 4, 4)
    } else {
      g.fillStyle(0x0d0d0d)
      g.fillCircle(cx, cy, r)
      const pct = 1 - cd / cdMax
      if (pct > 0.01) {
        g.fillStyle(color, 0.65)
        g.slice(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2, false)
        g.fillPath()
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
