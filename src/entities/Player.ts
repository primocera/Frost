import Phaser from 'phaser'
import Balance from '../config/Balance'
import { Inventory } from '../systems/Inventory'

export interface Stats {
  hp: number
  maxHp: number
  mana: number
  maxMana: number
  xp: number
  xpToNext: number
  level: number
  speed: number
  spellDamage: number
}

export class Player extends Phaser.Physics.Arcade.Sprite {
  stats: Stats
  readonly inventory = new Inventory()

  fireboltCooldown        = 0
  arcaneExplosionCooldown = 0
  frostNovaCooldown       = 0
  blizzardCooldown        = 0

  // ── Effective stats (base + gear) ─────────────────────────────────────────

  get effectiveSpellDamage(): number {
    return this.stats.spellDamage + (this.inventory.gearStats.spellPower ?? 0)
  }

  get effectiveMaxMana(): number {
    return this.stats.maxMana + (this.inventory.gearStats.mana ?? 0)
  }

  get effectiveSpeed(): number {
    return this.stats.speed + (this.inventory.gearStats.speed ?? 0)
  }

  /** Crit chance from gear (0–0.50 hard cap). */
  get critChance(): number {
    return Math.min(0.50, this.inventory.gearStats.critChance ?? 0)
  }

  // ── Cooldowns with level scaling + gear CDR ───────────────────────────────

  get fireboltCooldownMax(): number {
    const raw  = Balance.player.fireboltCdBase
      - (this.stats.level - 1) * Balance.player.fireboltCdReductionPerLevel
    const base = Math.max(Balance.player.fireboltCdMin, raw)
    return this.applyCDR(base)
  }
  get arcaneExplosionCooldownMax() { return this.applyCDR(Balance.spells.arcaneExplosion.cooldownMs) }
  get frostNovaCooldownMax()       { return this.applyCDR(Balance.spells.frostNova.cooldownMs) }
  get blizzardCooldownMax()        { return this.applyCDR(Balance.spells.blizzard.cooldownMs) }

  private applyCDR(baseMs: number): number {
    const cdr = Math.min(0.40, this.inventory.gearStats.cooldownReduction ?? 0)
    return Math.round(baseMs * (1 - cdr))
  }

  // ── Mana costs ────────────────────────────────────────────────────────────

  readonly fireboltManaCost = Balance.player.fireboltManaCost

  canCastFirebolt()        { return this.fireboltCooldown <= 0        && this.stats.mana >= Balance.player.fireboltManaCost }
  canCastArcaneExplosion() { return this.arcaneExplosionCooldown <= 0 && this.stats.mana >= Balance.spells.arcaneExplosion.manaCost }
  canCastFrostNova()       { return this.frostNovaCooldown <= 0       && this.stats.mana >= Balance.spells.frostNova.manaCost }
  canCastBlizzard()        { return this.blizzardCooldown <= 0        && this.stats.mana >= Balance.spells.blizzard.manaCost }

  spendFireboltCost()       { this.stats.mana -= Balance.player.fireboltManaCost;          this.fireboltCooldown        = this.fireboltCooldownMax }
  spendArcaneExplosionCost(){ this.stats.mana -= Balance.spells.arcaneExplosion.manaCost;  this.arcaneExplosionCooldown = this.arcaneExplosionCooldownMax }
  spendFrostNovaCost()      { this.stats.mana -= Balance.spells.frostNova.manaCost;        this.frostNovaCooldown       = this.frostNovaCooldownMax }
  spendBlizzardCost()       { this.stats.mana -= Balance.spells.blizzard.manaCost;         this.blizzardCooldown        = this.blizzardCooldownMax }

  private wasd: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>
  private manaRegenAccum = 0

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player')
    scene.add.existing(this)
    scene.physics.add.existing(this)
    ;(this.body as Phaser.Physics.Arcade.Body).setCircle(14, 2, 2)
    this.setCollideWorldBounds(true)
    this.setDepth(5)

    const B = Balance.player
    this.stats = {
      hp:          B.baseHp,
      maxHp:       B.baseHp,
      mana:        B.baseMana,
      maxMana:     B.baseMana,
      xp:          0,
      xpToNext:    Balance.xp.baseToNext,
      level:       1,
      speed:       B.baseSpeed,
      spellDamage: B.baseSpellDamage,
    }

    const kb = scene.input.keyboard!
    this.wasd = {
      up:    kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down:  kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left:  kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }
  }

  update(delta: number) {
    this.move()
    if (this.fireboltCooldown        > 0) this.fireboltCooldown        -= delta
    if (this.arcaneExplosionCooldown > 0) this.arcaneExplosionCooldown -= delta
    if (this.frostNovaCooldown       > 0) this.frostNovaCooldown       -= delta
    if (this.blizzardCooldown        > 0) this.blizzardCooldown        -= delta
    this.regenMana(delta)
  }

  private move() {
    let vx = 0, vy = 0
    if (this.wasd.left.isDown)  vx -= 1
    if (this.wasd.right.isDown) vx += 1
    if (this.wasd.up.isDown)    vy -= 1
    if (this.wasd.down.isDown)  vy += 1
    if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707 }
    this.setVelocity(vx * this.effectiveSpeed, vy * this.effectiveSpeed)
  }

  private regenMana(delta: number) {
    const regenPerSec = Balance.player.manaRegenBase
      + (this.stats.level - 1) * Balance.player.manaRegenPerLevel
      + (this.inventory.gearStats.manaRegen ?? 0)
    this.manaRegenAccum += delta
    const ticks = Math.floor(this.manaRegenAccum / 200)
    if (ticks > 0) {
      this.stats.mana = Math.min(this.effectiveMaxMana, this.stats.mana + regenPerSec * 0.2 * ticks)
      this.manaRegenAccum %= 200
    }
  }

  takeDamage(amount: number) {
    this.stats.hp = Math.max(0, this.stats.hp - amount)
    this.setTint(0xff3333)
    this.scene.time.delayedCall(120, () => this.clearTint())
  }

  gainXP(amount: number): boolean {
    this.stats.xp += amount
    if (this.stats.xp >= this.stats.xpToNext) { this.levelUp(); return true }
    return false
  }

  private levelUp() {
    const B = Balance.player
    this.stats.xp       -= this.stats.xpToNext
    this.stats.level++
    this.stats.xpToNext   = Math.floor(this.stats.xpToNext * Balance.xp.levelScaling)
    this.stats.maxHp     += B.hpPerLevel
    this.stats.hp         = this.stats.maxHp
    this.stats.maxMana   += B.manaPerLevel
    this.stats.mana       = this.effectiveMaxMana
    this.stats.spellDamage += B.spellDamagePerLevel
    this.stats.speed     += B.speedPerLevel
  }

  get isDead() { return this.stats.hp <= 0 }
}
