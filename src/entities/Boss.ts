import Phaser from 'phaser'
import { Player } from './Player'
import { BossConfig } from './BossTypes'
import { Device } from '../config/DeviceConfig'

export type BossPhase = 1 | 2 | 3
type BossAction = 'idle' | 'slam' | 'spread' | 'charge'

export class Boss extends Phaser.Physics.Arcade.Sprite {
  readonly cfg:  BossConfig
  hp:    number
  dying = false

  private _phase:  BossPhase = 1
  private action:  BossAction = 'idle'

  // Cooldowns (positive = ready in ms, ticking down)
  private slamCd:   number
  private spreadCd: number
  private chargeCd: number

  private hpBar:   Phaser.GameObjects.Graphics
  private warning: Phaser.GameObjects.Graphics

  // Slam telegraph state, updated each frame
  private slamWarn = { active: false, elapsed: 0, duration: 0, radius: 0 }

  constructor(scene: Phaser.Scene, x: number, y: number, cfg: BossConfig) {
    super(scene, x, y, cfg.key)
    this.cfg = cfg
    this.hp  = cfg.maxHp

    // Staggered initial delays so boss doesn't ability-dump immediately
    this.slamCd   = 1800
    this.spreadCd = 2800
    this.chargeCd = 4500

    scene.add.existing(this)
    scene.physics.add.existing(this)
    ;(this.body as Phaser.Physics.Arcade.Body).setCircle(cfg.radius, 4, 4)
    this.setDepth(5)

    // World-space graphics (not tied to boss position — drawn with absolute coords)
    this.hpBar  = scene.add.graphics().setDepth(7)
    this.warning = scene.add.graphics().setDepth(3)

    this.redrawHPBar()
  }

  get phase(): BossPhase { return this._phase }

  // ── Main update ───────────────────────────────────────────────────────────

  update(delta: number, player: Player): void {
    if (this.dying) return

    // Keep world-space HP bar anchored to boss
    this.hpBar.setPosition(this.x, this.y)

    // Tick cooldowns
    if (this.slamCd   > 0) this.slamCd   -= delta
    if (this.spreadCd > 0) this.spreadCd -= delta
    if (this.chargeCd > 0) this.chargeCd -= delta

    // Phase transitions
    const hpFrac = this.hp / this.cfg.maxHp
    if (this._phase === 1 && hpFrac <= this.cfg.phase2At) this.enterPhase(2)
    if (this._phase === 2 && hpFrac <= this.cfg.phase3At) this.enterPhase(3)

    // Redraw pulsing warning circle each frame while active
    if (this.slamWarn.active) {
      this.slamWarn.elapsed += delta
      const pct   = Math.min(1, this.slamWarn.elapsed / this.slamWarn.duration)
      const pulse = 0.3 + 0.35 * Math.sin(pct * Math.PI * 6)
      const g     = this.warning
      g.clear()
      g.fillStyle(0xff2200, pulse * 0.40)
      g.fillCircle(this.x, this.y, this.slamWarn.radius)
      g.lineStyle(3, 0xff2200, 0.45 + pulse * 0.55)
      g.strokeCircle(this.x, this.y, this.slamWarn.radius)
    }

    // Ability lock — skip movement while winding up or spreading
    if (this.action !== 'idle') return

    const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y)

    // Ability priority: slam if in range, then spread, then charge
    if (this.slamCd <= 0 && dist < this.cfg.slamRadius * 2.2) {
      this.doSlam(player); return
    }
    if (this.spreadCd <= 0 && dist < 500) {
      this.doSpread(player); return
    }
    if (this.chargeCd <= 0 && dist > 100 && dist < 620) {
      this.doCharge(player); return
    }

    // Chase player
    if (dist > this.cfg.attackRange) {
      const angle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y)
      const spd   = this.cfg.speed * (this._phase === 3 ? 1.28 : 1)
      this.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd)
    } else {
      this.setVelocity(0, 0)
    }
  }

  // ── Slam ──────────────────────────────────────────────────────────────────

  private doSlam(player: Player) {
    this.action = 'slam'
    this.setVelocity(0, 0)

    const windUpMs = 1100
    this.slamWarn  = { active: true, elapsed: 0, duration: windUpMs, radius: this.cfg.slamRadius }

    // Boss squash wind-up
    this.setTint(0xff3300)
    this.scene.tweens.add({
      targets: this, scaleX: 1.5, scaleY: 0.6,
      duration: windUpMs * 0.4, yoyo: true, ease: 'Power2',
    })

    this.scene.time.delayedCall(windUpMs, () => {
      if (this.dying || !this.active) return
      this.slamWarn.active = false
      this.warning.clear()

      // Damage player if inside slam radius
      const d = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y)
      if (d <= this.cfg.slamRadius && !player.isDead) {
        player.takeDamage(this.cfg.slamDamage)
        this.scene.events.emit('enemy-hit-player', this.cfg.slamDamage)
      }

      // Shockwave particle burst
      const burst = this.scene.add.particles(this.x, this.y, 'particle', {
        speed:     { min: 60, max: this.cfg.slamRadius * 1.1 },
        scale:     { start: 1.0, end: 0 },
        alpha:     { start: 0.9, end: 0 },
        lifespan:  420,
        blendMode: 'ADD',
        tint:      [0xff3300, 0xff8800, 0xffee00],
        angle:     { min: 0, max: 360 },
        emitting:  false,
      }).setDepth(8)
      burst.explode(Device.particleCount(24))
      this.scene.time.delayedCall(550, () => { if (burst.active) burst.destroy() })

      const mult    = this._phase === 3 ? 0.68 : this._phase === 2 ? 0.82 : 1
      this.slamCd   = Math.round(this.cfg.slamCooldownMs * mult)
      this.action   = 'idle'
      if (!this.dying) this.updateTint()
    })
  }

  // ── Spread shot ───────────────────────────────────────────────────────────

  private doSpread(player: Player) {
    this.action = 'spread'
    this.setVelocity(0, 0)

    // Cast wind-up pulse
    this.setTint(0xffdd44)
    this.scene.tweens.add({
      targets: this, scaleX: 0.72, scaleY: 0.72,
      duration: 300, yoyo: true, ease: 'Back.Out',
      onComplete: () => {
        if (this.dying || !this.active) return

        const base  = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y)
        const count = this._phase === 3 ? this.cfg.spreadCount + 2 : this.cfg.spreadCount
        const arc   = (count - 1) * 0.22   // total spread arc in radians
        const step  = count > 1 ? arc / (count - 1) : 0

        for (let i = 0; i < count; i++) {
          const angle = base - arc / 2 + i * step
          this.scene.events.emit('boss-shoot', {
            x: this.x, y: this.y,
            vx: Math.cos(angle) * this.cfg.spreadSpeed,
            vy: Math.sin(angle) * this.cfg.spreadSpeed,
            damage: this.cfg.spreadDamage,
          })
        }

        const mult      = this._phase === 3 ? 0.65 : this._phase === 2 ? 0.80 : 1
        this.spreadCd   = Math.round(this.cfg.spreadCooldownMs * mult)
        this.action     = 'idle'
        if (!this.dying) this.updateTint()
      },
    })
  }

  // ── Charge ────────────────────────────────────────────────────────────────

  private doCharge(player: Player) {
    this.action = 'charge'

    // Snapshot target so charge aims at where player was
    const targetX = player.x
    const targetY = player.y

    // Orange wind-up squash
    this.setTint(0xff8800)
    this.scene.tweens.add({
      targets: this, scaleX: 1.7, scaleY: 0.45,
      duration: 380, yoyo: true, ease: 'Power2',
    })

    this.scene.time.delayedCall(580, () => {
      if (this.dying || !this.active) return
      const angle = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY)
      const spd   = this.cfg.speed * this.cfg.chargeMult
      this.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd)

      // Camera trail particle
      this.setTint(0xffaa00)

      this.scene.time.delayedCall(this.cfg.chargeMs, () => {
        if (this.dying || !this.active) return
        this.setVelocity(0, 0)

        // Damage player if they're in the landing zone
        const d = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y)
        if (d < this.cfg.attackRange * 2.0 && !player.isDead) {
          player.takeDamage(this.cfg.chargeDamage)
          this.scene.events.emit('enemy-hit-player', this.cfg.chargeDamage)
        }

        // Landing dust burst
        const burst = this.scene.add.particles(this.x, this.y, 'particle', {
          speed:     { min: 40, max: 130 },
          scale:     { start: 0.7, end: 0 },
          alpha:     { start: 0.8, end: 0 },
          lifespan:  350,
          tint:      [this.cfg.color, 0xffffff],
          angle:     { min: 0, max: 360 },
          emitting:  false,
        }).setDepth(8)
        burst.explode(Device.particleCount(16))
        this.scene.time.delayedCall(400, () => { if (burst.active) burst.destroy() })

        const mult      = this._phase === 3 ? 0.68 : this._phase === 2 ? 0.82 : 1
        this.chargeCd   = Math.round(this.cfg.chargeCooldownMs * mult)
        this.action     = 'idle'
        if (!this.dying) this.updateTint()
      })
    })
  }

  // ── Phase transition ──────────────────────────────────────────────────────

  private enterPhase(phase: BossPhase) {
    this._phase = phase

    // Big scale pulse — signals the transition visually
    this.scene.tweens.add({
      targets: this, scaleX: 2.0, scaleY: 2.0,
      duration: 220, yoyo: true, ease: 'Back.Out',
      onComplete: () => { if (!this.dying) this.updateTint() },
    })

    const shakeStr = phase === 3 ? 0.015 : 0.011
    this.scene.cameras.main.shake(320, shakeStr)

    // Signal GameScene to show phase announcement
    this.scene.events.emit('boss-phase', { phase, name: this.cfg.name })

    this.redrawHPBar()
  }

  // ── Combat ────────────────────────────────────────────────────────────────

  takeDamage(amount: number): boolean {
    this.hp = Math.max(0, this.hp - amount)
    this.redrawHPBar()

    // Hit flash + knockback squash
    this.setTint(0xffffff)
    this.setScale(1.6, 0.55)
    this.scene.tweens.add({
      targets: this, scaleX: 1, scaleY: 1,
      duration: 190, ease: 'Back.Out',
      onComplete: () => { if (!this.dying) this.updateTint() },
    })

    return this.hp <= 0
  }

  die() {
    if (this.dying) return
    this.dying = true
    ;(this.body as Phaser.Physics.Arcade.Body).enable = false
    this.hpBar.setVisible(false)
    this.slamWarn.active = false
    this.warning.clear()

    // Three staggered explosion bursts
    for (let i = 0; i < 3; i++) {
      this.scene.time.delayedCall(i * 160, () => {
        if (!this.scene?.sys.isActive()) return
        const ox = Phaser.Math.Between(-24, 24)
        const oy = Phaser.Math.Between(-24, 24)
        const b  = this.scene.add.particles(this.x + ox, this.y + oy, 'particle', {
          speed:     { min: 90, max: 320 },
          scale:     { start: 2.2, end: 0 },
          alpha:     { start: 1, end: 0 },
          lifespan:  720,
          blendMode: 'ADD',
          tint:      [this.cfg.color, 0xffffff, 0xffdd44],
          angle:     { min: 0, max: 360 },
          emitting:  false,
        }).setDepth(9)
        b.explode(Device.particleCount(32))
        this.scene.time.delayedCall(850, () => { if (b.active) b.destroy() })
      })
    }

    this.scene.tweens.add({
      targets: this, scaleX: 3.2, scaleY: 3.2, alpha: 0,
      duration: 560, ease: 'Power2Out',
      onComplete: () => this.destroy(),
    })
  }

  // ── Visuals ────────────────────────────────────────────────────────────────

  private updateTint() {
    if (this.dying) return
    if (this._phase === 3) { this.setTint(0xff6622); return }
    if (this._phase === 2) { this.setTint(0xffbb44); return }
    this.clearTint()
  }

  private redrawHPBar() {
    const g    = this.hpBar
    const w    = this.cfg.radius * 2 + 22
    const pct  = this.hp / this.cfg.maxHp
    const yOff = -(this.cfg.radius + 16)
    const fill = this._phase === 3 ? 0xff2200 : this._phase === 2 ? 0xff8800 : 0xdd2222
    g.clear()
    g.fillStyle(0x220000)
    g.fillRect(-w / 2, yOff, w, 7)
    g.fillStyle(fill)
    g.fillRect(-w / 2, yOff, w * pct, 7)
  }

  destroy(fromScene?: boolean) {
    this.hpBar?.destroy()
    this.warning?.destroy()
    super.destroy(fromScene)
  }
}
