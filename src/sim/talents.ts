import { TALENT_DEFS, TalentId, TreeId, TREE_UNLOCK_LEVEL } from '../talents/TalentTypes'
import { PlayerState } from './types'

// Re-export the (framework-free) talent definitions through sim/.
export * from '../talents/TalentTypes'

export type TalentRanks = Partial<Record<TalentId, number>>

const rank = (r: TalentRanks, id: TalentId) => r[id] ?? 0

/**
 * Pure port of systems/TalentSystem.ts. Bonuses are computed from a ranks map
 * so the same logic runs on the server (authoritative combat) and the client
 * (HUD display / tooltips).
 */
export const talentBonus = {
  spellDamage: (r: TalentRanks) => rank(r, 'arc_power') * 6,
  manaRegen:   (r: TalentRanks) => rank(r, 'arc_regen') * 1.2,
  speed:       (r: TalentRanks) => rank(r, 'frost_kite') * 2,
  cdr:         (r: TalentRanks) => rank(r, 'arc_cdr') * 0.06,
  critChance:  (r: TalentRanks) => rank(r, 'fire_crit') * 0.03,
  critMult:    (r: TalentRanks) => 1.5 + rank(r, 'fire_crit_dmg') * 0.15,
  damageReduction: (r: TalentRanks) => rank(r, 'frost_armor') * 0.08,
  freezeMs:    (r: TalentRanks) => rank(r, 'frost_nova_ext') * 500,
  arcExDamage: (r: TalentRanks) => rank(r, 'fire_arcex') * 10,
  aoeMult:     (r: TalentRanks) => 1 + rank(r, 'arc_radius') * 0.08,
  manaCostMult:(r: TalentRanks) => 1 - rank(r, 'arc_mana') * 0.10,
  igniteRank:  (r: TalentRanks) => rank(r, 'fire_ignite'),
  igniteDmg:   (r: TalentRanks) => { const x = rank(r, 'fire_ignite'); return x === 0 ? 0 : x === 1 ? 8 : 14 },
  permafrost:  (r: TalentRanks) => rank(r, 'frost_permafrost') > 0,
  flashpoint:  (r: TalentRanks) => rank(r, 'fire_flashpoint') > 0,
  chillSlowMult: (r: TalentRanks) => { const x = rank(r, 'frost_chill'); return x === 0 ? 0 : x === 1 ? 0.60 : 0.45 },
  chillDurationMs: (r: TalentRanks) => { const x = rank(r, 'frost_chill'); return x === 0 ? 0 : x === 1 ? 1500 : 2000 },
}

export function treeUnlocked(tree: TreeId, level: number): boolean {
  return level >= TREE_UNLOCK_LEVEL[tree]
}

/** Server-side validation: can this player spend a point on `id`? */
export function canBuyTalent(ranks: TalentRanks, points: number, level: number, id: TalentId): boolean {
  if (points <= 0) return false
  const def = TALENT_DEFS.find(d => d.id === id)
  if (!def) return false
  if (!treeUnlocked(def.tree, level)) return false
  return rank(ranks, id) < def.maxRank
}

/** Spend one talent point on `id` (validated). Returns true if applied. */
export function spendTalent(p: PlayerState, id: TalentId): boolean {
  if (!canBuyTalent(p.talentRanks, p.talentPoints, p.stats.level, id)) return false
  p.talentRanks[id] = (p.talentRanks[id] ?? 0) + 1
  p.talentPoints--
  return true
}
