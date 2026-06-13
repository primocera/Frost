import Balance from './balance'
import { gearStats } from './inventory'
import { talentBonus } from './talents'
import { PlayerState } from './types'

/** Minimum level required to learn each spell (ported from entities/Player.ts). */
export const SPELL_TRAIN_LEVEL: Record<string, number> = {
  frostNova: 7,
  arcaneBlast: 14,
  blizzard: 18,
}

/**
 * Pure player logic ported from entities/Player.ts. Gear/talent bonuses are
 * added in Phase 5 — for now "effective" values equal base values.
 */
export function createPlayer(id: string, name: string, x: number, y: number): PlayerState {
  const B = Balance.player
  return {
    id, name, x, y, vx: 0, vy: 0, facing: 1,
    stats: {
      hp: B.baseHp, maxHp: B.baseHp,
      mana: B.baseMana, maxMana: B.baseMana,
      xp: 0, xpToNext: Balance.xp.baseToNext, level: 1,
      speed: B.baseSpeed, spellDamage: B.baseSpellDamage,
    },
    cd: { firebolt: 0, frostbolt: 0, arcaneBlast: 0, frostNova: 0, blizzard: 0 },
    activeBolt: 'fire',
    learnedSpells: ['bolt'],
    manaRegenAccum: 0,
    dead: false,
    gold: 0,
    inventory: [],
    inventoryCap: 30,
    equipped: { staff: null, robe: null, ring1: null, ring2: null, amulet: null },
    talentRanks: {},
    talentPoints: 0,
    frozenMs: 0,
    slowMs: 0,
    slowMult: 1,
    castMs: 0,
    hurtMs: 0,
  }
}

export const effSpellDamage = (p: PlayerState) =>
  p.stats.spellDamage + (gearStats(p).spellPower ?? 0) + talentBonus.spellDamage(p.talentRanks)
export const effMaxMana = (p: PlayerState) => p.stats.maxMana + (gearStats(p).mana ?? 0)
export const effSpeed = (p: PlayerState) =>
  p.stats.speed + (gearStats(p).speed ?? 0) + talentBonus.speed(p.talentRanks)

export const critChance = (p: PlayerState) =>
  Math.min(0.50, (gearStats(p).critChance ?? 0) + talentBonus.critChance(p.talentRanks))
export const critMult = (p: PlayerState) => talentBonus.critMult(p.talentRanks)

/** Combined gear + talent cooldown reduction, capped at 40%. */
export const cdr = (p: PlayerState) =>
  Math.min(0.40, (gearStats(p).cooldownReduction ?? 0) + talentBonus.cdr(p.talentRanks))

export function fireboltCooldownMax(p: PlayerState): number {
  const B = Balance.player
  const raw = B.fireboltCdBase - (p.stats.level - 1) * B.fireboltCdReductionPerLevel
  return Math.round(Math.max(B.fireboltCdMin, raw) * (1 - cdr(p)))
}
export const frostboltCooldownMax = fireboltCooldownMax
export const applyCDR = (p: PlayerState, baseMs: number) => Math.round(baseMs * (1 - cdr(p)))

const manaCost = (p: PlayerState, base: number) =>
  Math.max(1, Math.round(base * talentBonus.manaCostMult(p.talentRanks)))
export const fireboltCost = (p: PlayerState) => manaCost(p, Balance.player.fireboltManaCost)
export const frostboltCost = (p: PlayerState) => manaCost(p, Balance.spells.frostbolt.manaCost)
export const spellCost = manaCost

export function regenMana(p: PlayerState, dtMs: number) {
  const regenPerSec = Balance.player.manaRegenBase + (p.stats.level - 1) * Balance.player.manaRegenPerLevel
    + (gearStats(p).manaRegen ?? 0) + talentBonus.manaRegen(p.talentRanks)
  p.manaRegenAccum += dtMs
  const ticks = Math.floor(p.manaRegenAccum / 200)
  if (ticks > 0) {
    p.stats.mana = Math.min(effMaxMana(p), p.stats.mana + regenPerSec * 0.2 * ticks)
    p.manaRegenAccum %= 200
  }
}

/** Adds XP; returns true if the player leveled up. */
export function gainXP(p: PlayerState, amount: number): boolean {
  p.stats.xp += amount
  if (p.stats.xp >= p.stats.xpToNext) { levelUp(p); return true }
  return false
}

function levelUp(p: PlayerState) {
  if (p.stats.level >= Balance.xp.maxLevel) {
    p.stats.xp = p.stats.xpToNext
    return
  }
  const B = Balance.player
  p.stats.xp -= p.stats.xpToNext
  p.stats.level++
  p.talentPoints++
  p.stats.xpToNext = Math.floor(p.stats.xpToNext * Balance.xp.levelScaling)
  p.stats.maxHp += B.hpPerLevel
  p.stats.hp = p.stats.maxHp
  p.stats.maxMana += B.manaPerLevel
  p.stats.mana = effMaxMana(p)
  p.stats.spellDamage += B.spellDamagePerLevel
  p.stats.speed += B.speedPerLevel
}
