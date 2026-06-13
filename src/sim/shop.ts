import { PlayerState } from './types'

/**
 * Spell trainer. Gold (earned from kills) is spent here to learn the AoE spells,
 * replacing the old auto-learn-on-level-up. This is the game's first real gold
 * sink and the natural anchor for a future cosmetics/premium store.
 *
 * Costs are in copper (the unit `player.gold` is stored in).
 */
export interface ShopSpell {
  spell: string
  label: string
  level: number   // minimum player level to train
  cost: number    // copper
  desc: string
}

export const SHOP_SPELLS: ShopSpell[] = [
  { spell: 'frostNova',   label: 'Frost Nova',   level: 7,  cost: 2000,  desc: 'AoE freeze around you (E)' },
  { spell: 'arcaneBlast', label: 'Arcane Blast', level: 14, cost: 8000,  desc: 'Instant AoE burst (Q)' },
  { spell: 'blizzard',    label: 'Blizzard',     level: 18, cost: 20000, desc: 'Targeted ground AoE (R)' },
]

export type TrainResult = 'ok' | 'known' | 'level' | 'gold' | 'unknown'

export function trainSpell(p: PlayerState, spell: string): TrainResult {
  const def = SHOP_SPELLS.find(s => s.spell === spell)
  if (!def) return 'unknown'
  if (p.learnedSpells.includes(spell)) return 'known'
  if (p.stats.level < def.level) return 'level'
  if (p.gold < def.cost) return 'gold'
  p.gold -= def.cost
  p.learnedSpells.push(spell)
  return 'ok'
}
