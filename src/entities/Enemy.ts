import Phaser from 'phaser'
import { Player } from './Player'
import { EnemyConfig } from './EnemyTypes'
import Balance from '../config/Balance'

type AIState = 'wander' | 'chase'

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  readonly cfg: EnemyConfig
  hp:      number
  dying   = false
  burning = false    // set by GameScene when Ignite is active

  private aiState:      AIState = 'wander'
  private attackCd     = 0
  private wanderIdleMs = 0
  private wanderTarget: Phaser.Math.Vector2 | null = null

  private readonly homeX: number
  private readonly homeY: number

  private hpBar: Phaser.GameObjects.Graphics

  // Status effects
  private frozenMs = 0     // ms remaining; enemy can't move or attack
  private slowMs   = 0     // ms remaining
  private slowMult = 1     // speed multiplier while slowed (< 1 = slower)

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
  }

  // ── Public API ────────────────────────────────────────────────────────────

  forceAggro() {
    this.aiState      = 'chase'
    this.wanderTarget = null
  }

  get isChasing(): boolean { return this.aiState === 'chase' }
  get isFrozen():  boolean { return this.frozenMs > 0 }

  /** Root this enemy in place for the given duration. */
  freeze(ms: number) {
    const wasAlreadyFrozen = this.frozenMs > 0
    this.frozenMs = Math.max(this.frozenMs, ms)
    this.aiState  = 'chase'
    this.setVelocity(0, 0)
    this.updateStatusTint()

    // Ice shard burst only on initial freeze — communicates the hit clearly
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
      burst.explode(14)
      this.scene.time.delayedCall(500, () => { if (burst.active) burst.destroy() })
    }
  }

  /** Reduce movement speed for the given duration. Refreshes if already slowed. */
  slow(mult: number, ms: number) {
    this.slowMult = Math.min(this.slowMult, mult)   // take the worse (slower) value
    this.slowMs   = Math.max(this.slowMs, ms)
    this.updateStatusTint()
  }

  // ── Main update ───────────────────────────────────────────────────────────

  update(delta: number, player: Player, allies: Enemy[]): number {
    if (this.dying) return 0
    if (this.attackCd > 0) this.attackCd -= delta

    this.hpBar.setPosition(this.x, this.y)

    // Frozen: skip all movement and attacks
    if (this.frozenMs > 0) {
      this.frozenMs -= delta
      this.setVelocity(0, 0)
      if (this.frozenMs <= 0) {
        this.frozenMs = 0
        this.updateStatusTint()
      }
      return 0
    }

    // Slow timer decay
    if (this.slowMs > 0) {
      this.slowMs -= delta
      if (this.slowMs <= 0) {
        this.slowMs  = 0
        this.slowMult = 1
        this.updateStatusTint()
      }
    }

    const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y)

    if (dist < this.cfg.aggroRange) {
      this.aiState = 'chase'
    } else if (this.aiState === 'chase' && dist > this.cfg.aggroRange * 1.4) {
      this.aiState      = 'wander'
      this.wanderTarget = null
    }

    if (this.aiState === 'chase') return this.doChase(dist, player, allies)
    this.doWander(delta)
    return 0
  }

  // ── Combat ────────────────────────────────────────────────────────────────

  private doChase(dist: number, player: Player, allies: Enemy[]): number {
    const speed = this.cfg.speed * this.slowMult

    if (dist > this.cfg.attackRange) {
      let vx: number, vy: number
      const angle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y)
      vx = Math.cos(angle) * speed
      vy = Math.sin(angle) * speed

      // Subtle weave: sine-wave perpendicular drift unique per enemy (avoids robotic lines)
      const weavePhase = (this.homeX + this.homeY) * 0.003
      const perpDrift  = Math.sin(this.scene.time.now * 0.0015 + weavePhase) * 0.22
      const perpAngle  = angle + Math.PI / 2
      vx += Math.cos(perpAngle) * speed * perpDrift
      vy += Math.sin(perpAngle) * speed * perpDrift

      // Soft flocking: nudge velocity toward nearby chasing allies
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
        this.attackCd = this.cfg.attackRate
        player.takeDamage(this.cfg.damage)
        return this.cfg.damage
      }
    }
    return 0
  }

  takeDamage(amount: number): boolean {
    this.hp = Math.max(0, this.hp - amount)
    this.redrawHPBar()

    // Hit flash: white tint, then restore status tint
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

    // Color-matched death burst — reads as satisfying kill confirmation
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
    burst.explode(20)
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
    if (this.frozenMs > 0) {
      this.setTint(0x88ddff)   // bright ice blue = frozen
    } else if (this.slowMs > 0) {
      this.setTint(0xbbddff)   // pale blue = slowed
    } else {
      this.clearTint()
    }
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
