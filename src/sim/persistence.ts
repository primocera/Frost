import { EquipSlot, Item } from '../items/ItemTypes'
import { TalentId } from '../talents/TalentTypes'
import { BoltKind, PlayerState } from './types'

/**
 * Serializable character save. Position, HP/mana and connection state are NOT
 * saved (they reset on load); everything that represents progression is.
 */
export interface SavedPlayer {
  v: 1
  name: string
  level: number; xp: number; xpToNext: number
  maxHp: number; maxMana: number; spellDamage: number; speed: number
  gold: number
  inventory: Item[]
  equipped: Record<EquipSlot, Item | null>
  talentRanks: Partial<Record<TalentId, number>>
  talentPoints: number
  learnedSpells: string[]
  activeBolt: BoltKind
}

export function extractSave(p: PlayerState): SavedPlayer {
  return {
    v: 1,
    name: p.name,
    level: p.stats.level, xp: p.stats.xp, xpToNext: p.stats.xpToNext,
    maxHp: p.stats.maxHp, maxMana: p.stats.maxMana,
    spellDamage: p.stats.spellDamage, speed: p.stats.speed,
    gold: p.gold,
    inventory: p.inventory,
    equipped: p.equipped,
    talentRanks: p.talentRanks,
    talentPoints: p.talentPoints,
    learnedSpells: p.learnedSpells,
    activeBolt: p.activeBolt,
  }
}

/** Restore a save onto a freshly created player. HP/mana refill to full. */
export function applySave(p: PlayerState, s: SavedPlayer) {
  if (!s || s.v !== 1) return
  p.stats.level = s.level
  p.stats.xp = s.xp
  p.stats.xpToNext = s.xpToNext
  p.stats.maxHp = s.maxHp
  p.stats.maxMana = s.maxMana
  p.stats.spellDamage = s.spellDamage
  p.stats.speed = s.speed
  p.stats.hp = s.maxHp
  p.stats.mana = s.maxMana
  p.gold = s.gold
  p.inventory = s.inventory ?? []
  p.equipped = s.equipped ?? { staff: null, robe: null, ring1: null, ring2: null, amulet: null }
  p.talentRanks = s.talentRanks ?? {}
  p.talentPoints = s.talentPoints ?? 0
  p.learnedSpells = s.learnedSpells ?? ['bolt']
  p.activeBolt = s.activeBolt ?? 'fire'
}
