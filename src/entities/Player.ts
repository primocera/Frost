import Phaser from 'phaser'
import Balance from '../config/Balance'
import { Inventory } from '../systems/Inventory'
import { TalentSystem } from '../systems/TalentSystem'

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

/** Minimum level required to train each spell at the trainer. */
export const SPELL_TRAIN_LEVEL: Record<string, number> = {
  arcaneExplosion: 4,
  frostNova:       8,
  blizzard:        14,
}

export class Player extends Phaser.Physics.Arcade.Sprite {
  playerName: string
  stats: Stats
  readonly inventory = new Inventory()
  readonly talents   = new TalentSystem()

  fireboltCooldown        = 0
  frostboltCooldown       = 0
  arcaneExplosionCooldown = 0
  frostNovaCooldown       = 0
  blizzardCooldown        = 0

  /** Spells trained at the trainer. 'bolt' is always known. */
  readonly learnedSpells: Set<string> = new Set(['bolt'])

  /** Which bolt spell the F key and left-click currently fire. */
  activeBolt: 'fire' | 'frost' = 'fire'

  swapBolt() { this.activeBolt = this.activeBolt === 'fire' ? 'frost' : 'fire' }

  /** True when the free-tier level cap (5) has been hit. Read by GameScene. */
  premiumGateReached = false

  /** Returns true when the player has trained this spell. Bolt is always available. */
  hasSpell(name: string): boolean { return name === 'bolt' || this.learnedSpells.has(name) }

  /** Learn a spell (call after verifying level + gold). */
  learnSpell(name: string): void { this.learnedSpells.add(name) }

  // ── Effective stats (base + gear) ─────────────────────────────────────────

  get effectiveSpellDamage(): number {
    return this.stats.spellDamage
      + (this.inventory.gearStats.spellPower ?? 0)
      + this.talents.bonusSpellDamage
  }

  get effectiveMaxMana(): number {
    return this.stats.maxMana + (this.inventory.gearStats.mana ?? 0)
  }

  get effectiveSpeed(): number {
    return this.stats.speed
      + (this.inventory.gearStats.speed ?? 0)
      + this.talents.bonusSpeed
  }

  /** Crit chance from gear + talents (0–0.50 hard cap). */
  get critChance(): number {
    return Math.min(0.50, (this.inventory.gearStats.critChance ?? 0) + this.talents.bonusCritChance)
  }

  // ── Cooldowns with level scaling + gear CDR ───────────────────────────────

  get fireboltCooldownMax(): number {
    const raw  = Balance.player.fireboltCdBase
      - (this.stats.level - 1) * Balance.player.fireboltCdReductionPerLevel
    const base = Math.max(Balance.player.fireboltCdMin, raw)
    return this.applyCDR(base)
  }
  get frostboltCooldownMax(): number { return this.fireboltCooldownMax }
  /** ArcEx shares cooldown length with whichever bolt is active. */
  get arcaneExplosionCooldownMax(): number { return this.fireboltCooldownMax }
  get frostNovaCooldownMax()       { return this.applyCDR(Balance.spells.frostNova.cooldownMs) }
  get blizzardCooldownMax()        { return this.applyCDR(Balance.spells.blizzard.cooldownMs) }

  private applyCDR(baseMs: number): number {
    const cdr = Math.min(0.40, (this.inventory.gearStats.cooldownReduction ?? 0) + this.talents.bonusCDR)
    return Math.round(baseMs * (1 - cdr))
  }

  // ── Mana costs ────────────────────────────────────────────────────────────

  private effectiveCost(base: number): number {
    return Math.max(1, Math.round(base * this.talents.bonusManaCostMult))
  }

  get fireboltCost()        { return this.effectiveCost(Balance.player.fireboltManaCost) }
  get frostboltCost()       { return this.effectiveCost(Balance.spells.frostbolt.manaCost) }
  get arcaneExplosionCost() { return this.effectiveCost(Balance.spells.arcaneExplosion.manaCost) }
  get frostNovaCost()       { return this.effectiveCost(Balance.spells.frostNova.manaCost) }
  get blizzardCost()        { return this.effectiveCost(Balance.spells.blizzard.manaCost) }

  canCastFirebolt()        { return this.fireboltCooldown <= 0        && this.stats.mana >= this.fireboltCost }
  canCastFrostbolt()       { return this.frostboltCooldown <= 0       && this.stats.mana >= this.frostboltCost }
  canCastArcaneExplosion() { return this.arcaneExplosionCooldown <= 0 && this.stats.mana >= this.arcaneExplosionCost }
  canCastFrostNova()       { return this.frostNovaCooldown <= 0       && this.stats.mana >= this.frostNovaCost }
  canCastBlizzard()        { return this.blizzardCooldown <= 0        && this.stats.mana >= this.blizzardCost }

  spendFireboltCost()        { this.stats.mana -= this.fireboltCost;        this.fireboltCooldown        = this.fireboltCooldownMax }
  spendFrostboltCost()       { this.stats.mana -= this.frostboltCost;       this.frostboltCooldown       = this.frostboltCooldownMax }
  spendArcaneExplosionCost() { this.stats.mana -= this.arcaneExplosionCost; this.arcaneExplosionCooldown = this.arcaneExplosionCooldownMax }
  spendFrostNovaCost()       { this.stats.mana -= this.frostNovaCost;       this.frostNovaCooldown       = this.frostNovaCooldownMax }
  spendBlizzardCost()        { this.stats.mana -= this.blizzardCost;        this.blizzardCooldown        = this.blizzardCooldownMax }

  /** Set by MobileControls each frame when on touch devices. Normalised magnitude 0..1. */
  joystickDir = { x: 0, y: 0 }

  private wasd: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>
  private manaRegenAccum = 0

  constructor(scene: Phaser.Scene, x: number, y: number, playerName = 'Apprentice') {
    super(scene, x, y, 'player')
    this.playerName = playerName
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
    if (this.frostboltCooldown       > 0) this.frostboltCooldown       -= delta
    if (this.arcaneExplosionCooldown > 0) this.arcaneExplosionCooldown -= delta
    if (this.frostNovaCooldown       > 0) this.frostNovaCooldown       -= delta
    if (this.blizzardCooldown        > 0) this.blizzardCooldown        -= delta
    this.regenMana(delta)
  }

  private move() {
    let vx = 0, vy = 0
    const leftDown  = this.wasd.left.isDown
    const rightDown = this.wasd.right.isDown
    const upDown    = this.wasd.up.isDown
    const downDown  = this.wasd.down.isDown

    if (leftDown)  vx -= 1
    if (rightDown) vx += 1
    if (upDown)    vy -= 1
    if (downDown)  vy += 1

    if (vx === 0 && vy === 0) {
      // No keyboard input — use joystick (already normalised, no diagonal correction needed)
      vx = this.joystickDir.x
      vy = this.joystickDir.y
    } else if (vx !== 0 && vy !== 0) {
      // WASD diagonal — normalise to prevent speed boost
      vx *= 0.707
      vy *= 0.707
    }

    this.setVelocity(vx * this.effectiveSpeed, vy * this.effectiveSpeed)
  }

  private regenMana(delta: number) {
    const regenPerSec = Balance.player.manaRegenBase
      + (this.stats.level - 1) * Balance.player.manaRegenPerLevel
      + (this.inventory.gearStats.manaRegen ?? 0)
      + this.talents.bonusManaRegen
    this.manaRegenAccum += delta
    const ticks = Math.floor(this.manaRegenAccum / 200)
    if (ticks > 0) {
      this.stats.mana = Math.min(this.effectiveMaxMana, this.stats.mana + regenPerSec * 0.2 * ticks)
      this.manaRegenAccum %= 200
    }
  }

  takeDamage(amount: number) {
    const reduced = Math.round(amount * (1 - this.talents.bonusDamageReduction))
    this.stats.hp = Math.max(0, this.stats.hp - reduced)
    this.setTint(0xff3333)
    this.scene.time.delayedCall(120, () => this.clearTint())
  }

  gainXP(amount: number): boolean {
    this.stats.xp += amount
    if (this.stats.xp >= this.stats.xpToNext) { this.levelUp(); return true }
    return false
  }

  private levelUp() {
    if (this.stats.level === 10) this.premiumGateReached = true  // milestone flag, no cap
    const B = Balance.player
    this.stats.xp       -= this.stats.xpToNext
    this.stats.level++
    this.talents.playerLevel = this.stats.level
    this.talents.points++
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
