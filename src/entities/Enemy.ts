import Phaser from 'phaser'
import { Player } from './Player'
import { EnemyConfig } from './EnemyTypes'
import Balance from '../config/Balance'
import { Device } from '../config/DeviceConfig'

type AIState = 'wander' | 'chase'

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  readonly cfg: EnemyConfig
  hp:      number
  dying   = false
  burning = false

  private aiState:      AIState = 'wander'
  private attackCd     = 0
  private wanderIdleMs = 0
  private wanderTarget: Phaser.Math.Vector2 | null = null

  private readonly homeX: number
  private readonly homeY: number

  private hpBar: Phaser.GameObjects.Graphics

  // Status effects
  private frozenMs = 0
  private slowMs   = 0
  private slowMult = 1

  // Ranged AI
  private rangedCooldown = 0

  // Elite charge
  private chargeActive   = false
  private chargeCooldown = 0

  // Tank telegraph
  private telegraphing = false

  constructor(scene: Phaser.Scene, x: number, y: number, cfg: EnemyConfig) {
    super(scene, x, y, cfg.key)
    this.cfg   = cfg
    this.homeX = x
    this.homeY = y
    this.hp    = cfg.hp

    scene.add.existing(this)
    scene.physics.add.existing(this)
    ;(this.body as Phaser.Physics.Arcade.Body).setCircle(cfg.radius, 2, 2)
    this.setDepth(4)

    this.hpBar = scene.add.graphics().setDepth(6)
    this.redrawHPBar()

    this.wanderIdleMs = Phaser.Math.Between(0, cfg.idleTime[1])

    // Stagger charge cooldown so elites don't charge immediately on spawn
    if (cfg.chargeCooldownMs) this.chargeCooldown = cfg.chargeCooldownMs * 0.55
  }

  // ── Public API ────────────────────────────────────────────────────────────

  forceAggro() {
    this.aiState      = 'chase'
    this.wanderTarget = null
  }

  get isChasing(): boolean { return this.aiState === 'chase' }
  get isFrozen():  boolean { return this.frozenMs > 0 }

  freeze(ms: number) {
    const wasAlreadyFrozen = this.frozenMs > 0
    this.frozenMs = Math.max(this.frozenMs, ms)
    this.aiState  = 'chase'
    this.setVelocity(0, 0)
    this.updateStatusTint()

    if (!wasAlreadyFrozen) {
      const burst = this.scene.add.particles(this.x, this.y, 'particle', {
        speed:     { min: 30, max: 90 },
        scale:     { start: 0.7, end: 0 },
        alpha:     { start: 1, end: 0 },
        lifespan:  420,
        blendMode: 'ADD',
        tint:      [0x88ddff, 0xaaeeff, 0xffffff],
        angle:     { min: 0, max: 360 },
        emitting:  false,
      }).setDepth(9)
      burst.explode(Device.particleCount(14))
      this.scene.time.delayedCall(500, () => { if (burst.active) burst.destroy() })
    }
  }

  slow(mult: number, ms: number) {
    this.slowMult = Math.min(this.slowMult, mult)
    this.slowMs   = Math.max(this.slowMs, ms)
    this.updateStatusTint()
  }

  // ── Main update ───────────────────────────────────────────────────────────

  update(delta: number, player: Player, allies: Enemy[]): void {
    if (this.dying) return
    if (this.attackCd     > 0) this.attackCd     -= delta
    if (this.rangedCooldown > 0) this.rangedCooldown -= delta

    this.hpBar.setPosition(this.x, this.y)

    // These states block all other logic
    if (this.telegraphing) return
    if (this.chargeActive) return

    // Charge cooldown only ticks while the elite is free to act
    if (this.cfg.chargeCooldownMs && this.chargeCooldown > 0 && this.frozenMs <= 0) {
      this.chargeCooldown -= delta
    }

    if (this.frozenMs > 0) {
      this.frozenMs -= delta
      this.setVelocity(0, 0)
      if (this.frozenMs <= 0) { this.frozenMs = 0; this.updateStatusTint() }
      return
    }

    if (this.slowMs > 0) {
      this.slowMs -= delta
      if (this.slowMs <= 0) { this.slowMs = 0; this.slowMult = 1; this.updateStatusTint() }
    }

    const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y)

    if (dist < this.cfg.aggroRange) {
      this.aiState = 'chase'
    } else if (this.aiState === 'chase' && dist > this.cfg.aggroRange * 1.4) {
      this.aiState      = 'wander'
      this.wanderTarget = null
    }

    // Leash: give up chase if we've wandered too far from spawn point
    if (this.aiState === 'chase') {
      const leashDist = Phaser.Math.Distance.Between(this.x, this.y, this.homeX, this.homeY)
      if (leashDist > 850) {
        this.aiState      = 'wander'
        this.wanderTarget = null
      }
    }

    // Safe zone: town center at world mid-point — enemies cannot pursue there
    if (this.aiState === 'chase') {
      const townCX = 1800, townCY = 1800, safeR = 420
      const playerToTown = Phaser.Math.Distance.Between(player.x, player.y, townCX, townCY)
      if (playerToTown < safeR) {
        this.aiState      = 'wander'
        this.wanderTarget = null
      }
    }

    if (this.aiState === 'chase') { this.doChase(dist, player, allies); return }
    this.doWander(delta)
  }

  // ── AI: Chase dispatch ────────────────────────────────────────────────────

  private doChase(dist: number, player: Player, allies: Enemy[]): void {
    if (this.cfg.aiType === 'ranged') { this.doChaseRanged(dist, player); return }

    // Elite: trigger charge when cooldown expires
    if (this.cfg.aiType === 'elite' && this.chargeCooldown <= 0 && !this.chargeActive) {
      this.startCharge(player.x, player.y)
    }

    const speed = this.cfg.speed * this.slowMult

    if (dist > this.cfg.attackRange) {
      // ── Movement ───────────────────────────────────────────────────────────
      const angle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y)
      let vx = Math.cos(angle) * speed
      let vy = Math.sin(angle) * speed

      // Sine-wave weave (unique per enemy, avoids robotic straight lines)
      const weavePhase = (this.homeX + this.homeY) * 0.003
      const perpDrift  = Math.sin(this.scene.time.now * 0.0015 + weavePhase) * 0.22
      const perpAngle  = angle + Math.PI / 2
      vx += Math.cos(perpAngle) * speed * perpDrift
      vy += Math.sin(perpAngle) * speed * perpDrift

      // Soft flocking toward nearby chasing allies
      const { flockRadius, flockWeight } = Balance.mob
      let cx = 0, cy = 0, count = 0
      for (const ally of allies) {
        if (ally === this || !ally.active || ally.dying || !ally.isChasing) continue
        const d = Phaser.Math.Distance.Between(this.x, this.y, ally.x, ally.y)
        if (d < flockRadius) { cx += ally.x; cy += ally.y; count++ }
      }
      if (count > 0) {
        cx /= count; cy /= count
        const fAngle = Phaser.Math.Angle.Between(this.x, this.y, cx, cy)
        vx = vx * (1 - flockWeight) + Math.cos(fAngle) * speed * flockWeight
        vy = vy * (1 - flockWeight) + Math.sin(fAngle) * speed * flockWeight
      }

      this.setVelocity(vx, vy)
    } else {
      this.setVelocity(0, 0)
      if (this.attackCd <= 0) {
        if (this.cfg.aiType === 'tank' && this.cfg.telegraphMs) {
          this.startTelegraphAttack(player)
        } else {
          this.attackCd = this.cfg.attackRate
          player.takeDamage(this.cfg.damage)
          this.scene.events.emit('enemy-hit-player', this.cfg.damage)
        }
      }
    }
  }

  // ── AI: Ranged kiting ─────────────────────────────────────────────────────

  private doChaseRanged(dist: number, player: Player): void {
    const preferred  = this.cfg.projectileRange ?? 260
    const backstep   = 110
    const speed      = this.cfg.speed * this.slowMult

    if (dist < backstep) {
      // Too close — back away
      const angle = Phaser.Math.Angle.Between(player.x, player.y, this.x, this.y)
      this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed)
    } else if (dist > preferred * 1.15) {
      // Too far — close in slowly
      const angle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y)
      this.setVelocity(Math.cos(angle) * speed * 0.65, Math.sin(angle) * speed * 0.65)
    } else {
      // Sweet spot — strafe perpendicular and shoot
      const toPlayerAngle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y)
      const strafeSign    = Math.sin(this.scene.time.now * 0.0008 + (this.homeX + this.homeY) * 0.002) > 0 ? 1 : -1
      const perpAngle     = toPlayerAngle + (Math.PI / 2) * strafeSign
      this.setVelocity(Math.cos(perpAngle) * speed * 0.5, Math.sin(perpAngle) * speed * 0.5)

      if (this.rangedCooldown <= 0) {
        this.rangedCooldown = 2400
        this.doShoot(player)
      }
    }
  }

  private doShoot(player: Player) {
    const angle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y)
    const spd   = this.cfg.projectileSpeed ?? 230

    // Brief cast pulse
    this.setTint(0xdd88ff)
    this.scene.tweens.add({
      targets: this, scaleX: 0.82, scaleY: 0.82,
      duration: 170, yoyo: true,
      onComplete: () => { if (!this.dying) this.updateStatusTint() },
    })

    this.scene.events.emit('enemy-shoot', {
      x: this.x, y: this.y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      damage: this.cfg.projectileDamage ?? 12,
    })
  }

  // ── AI: Elite charge ──────────────────────────────────────────────────────

  private startCharge(targetX: number, targetY: number) {
    this.chargeActive   = true
    this.chargeCooldown = Infinity   // prevent re-trigger during charge

    // Orange telegraph squash
    this.setTint(0xff5500)
    this.scene.tweens.add({
      targets: this, scaleX: 1.5, scaleY: 0.65,
      duration: 260, yoyo: true, ease: 'Power2',
    })

    this.scene.time.delayedCall(520, () => {
      if (this.dying || !this.active) return
      const angle = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY)
      const spd   = this.cfg.speed * (this.cfg.chargeMult ?? 3.5)
      this.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd)
      this.setTint(0xff9900)

      this.scene.time.delayedCall(this.cfg.chargeMs ?? 650, () => {
        if (this.dying || !this.active) return
        this.chargeActive   = false
        this.chargeCooldown = this.cfg.chargeCooldownMs ?? 6000
        this.updateStatusTint()
      })
    })
  }

  // ── AI: Brute telegraph attack ────────────────────────────────────────────

  private startTelegraphAttack(player: Player) {
    this.telegraphing = true
    this.attackCd     = this.cfg.attackRate

    // Red warning — player has telegraphMs to react
    this.setTint(0xff2200)
    this.scene.tweens.add({
      targets: this, scaleX: 1.6, scaleY: 0.55,
      duration: (this.cfg.telegraphMs! / 2), yoyo: true, ease: 'Power2',
    })

    this.scene.time.delayedCall(this.cfg.telegraphMs!, () => {
      if (this.dying || !this.active) return
      this.telegraphing = false
      this.updateStatusTint()
      // Slightly forgiving reach — rewards staying out of range but not by a pixel
      const d = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y)
      if (d <= this.cfg.attackRange * 1.8 && !player.isDead) {
        player.takeDamage(this.cfg.damage)
        this.scene.events.emit('enemy-hit-player', this.cfg.damage)
      }
    })
  }

  // ── Combat ────────────────────────────────────────────────────────────────

  takeDamage(amount: number): boolean {
    this.hp = Math.max(0, this.hp - amount)
    this.redrawHPBar()

    this.setTint(0xffffff)
    this.setScale(1.6, 0.5)
    this.scene.tweens.add({
      targets:  this,
      scaleX:   1, scaleY: 1,
      duration: 160,
      ease:     'Back.Out',
      onComplete: () => { if (!this.dying) this.updateStatusTint() },
    })

    return this.hp <= 0
  }

  die() {
    if (this.dying) return
    this.dying = true
    ;(this.body as Phaser.Physics.Arcade.Body).enable = false
    this.hpBar.setVisible(false)

    const burst = this.scene.add.particles(this.x, this.y, 'particle', {
      speed:     { min: 55, max: 200 },
      scale:     { start: 1.2, end: 0 },
      alpha:     { start: 1, end: 0 },
      lifespan:  520,
      blendMode: 'ADD',
      tint:      [this.cfg.color, 0xffffff],
      angle:     { min: 0, max: 360 },
      emitting:  false,
    }).setDepth(9)
    burst.explode(Device.particleCount(20))
    this.scene.time.delayedCall(600, () => { if (burst.active) burst.destroy() })

    this.scene.tweens.add({
      targets:  this,
      scaleX:   2.2, scaleY: 2.2,
      alpha:    0,
      duration: 340,
      ease:     'Power2Out',
      onComplete: () => this.destroy(),
    })
  }

  // ── Idle wander ───────────────────────────────────────────────────────────

  private doWander(delta: number) {
    if (this.wanderIdleMs > 0) {
      this.wanderIdleMs -= delta
      this.setVelocity(0, 0)
      return
    }
    if (!this.wanderTarget) { this.pickWanderTarget(); return }

    const dist = Phaser.Math.Distance.Between(this.x, this.y, this.wanderTarget.x, this.wanderTarget.y)
    if (dist < 8) {
      this.wanderTarget = null
      this.wanderIdleMs = Phaser.Math.Between(this.cfg.idleTime[0], this.cfg.idleTime[1])
      this.setVelocity(0, 0)
    } else {
      const angle = Phaser.Math.Angle.Between(this.x, this.y, this.wanderTarget.x, this.wanderTarget.y)
      const s     = this.cfg.speed * this.slowMult * 0.35
      this.setVelocity(Math.cos(angle) * s, Math.sin(angle) * s)
    }
  }

  private pickWanderTarget() {
    const angle = Math.random() * Math.PI * 2
    const r     = Phaser.Math.Between(30, this.cfg.wanderRadius)
    this.wanderTarget = new Phaser.Math.Vector2(
      this.homeX + Math.cos(angle) * r,
      this.homeY + Math.sin(angle) * r,
    )
  }

  // ── Visuals ───────────────────────────────────────────────────────────────

  private updateStatusTint() {
    if (this.dying) return
    if (this.frozenMs > 0)   { this.setTint(0x88ddff); return }
    if (this.slowMs   > 0)   { this.setTint(0xbbddff); return }
    this.clearTint()
  }

  private redrawHPBar() {
    const g    = this.hpBar
    const w    = this.cfg.radius * 2 + 4
    const pct  = this.hp / this.cfg.hp
    const yOff = -(this.cfg.radius + 10)
    g.clear()
    g.fillStyle(0x440000)
    g.fillRect(-w / 2, yOff, w, 4)
    g.fillStyle(0xdd2222)
    g.fillRect(-w / 2, yOff, w * pct, 4)
  }

  destroy(fromScene?: boolean) {
    this.hpBar?.destroy()
    super.destroy(fromScene)
  }
}
