export type Rarity   = 'common' | 'magic' | 'rare' | 'epic'
export type ItemType = 'staff' | 'robe' | 'ring' | 'amulet'
export type EquipSlot = 'staff' | 'robe' | 'ring1' | 'ring2' | 'amulet'

export interface ItemStats {
  spellPower?:        number   // flat spell damage bonus
  mana?:              number   // flat max-mana bonus
  manaRegen?:         number   // mana/sec bonus
  critChance?:        number   // 0–1 fraction
  speed?:             number   // px/s bonus
  cooldownReduction?: number   // 0–0.40 fraction (CDR)
}

export interface Item {
  id:     number
  type:   ItemType
  rarity: Rarity
  name:   string
  stats:  ItemStats
  ilvl:   number
}

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#aaaaaa',
  magic:  '#5599ff',
  rare:   '#ffdd00',
  epic:   '#cc44ff',
}

export const RARITY_HEX: Record<Rarity, number> = {
  common: 0x888888,
  magic:  0x4477ff,
  rare:   0xddbb00,
  epic:   0xbb33ff,
}

export const SLOT_LABEL: Record<EquipSlot, string> = {
  staff:  'Staff',
  robe:   'Robe',
  ring1:  'Ring I',
  ring2:  'Ring II',
  amulet: 'Amulet',
}

export const EQUIP_SLOTS: EquipSlot[] = ['staff', 'robe', 'ring1', 'ring2', 'amulet']

export const STAT_LABEL: Record<keyof ItemStats, string> = {
  spellPower:        'Spell Power',
  mana:              'Max Mana',
  manaRegen:         'Mana/sec',
  critChance:        'Crit Chance',
  speed:             'Speed',
  cooldownReduction: 'Cooldown Reduction',
}

/** Item type → which equip slots can hold it. Rings fill ring1 first. */
export function slotsForType(type: ItemType): EquipSlot[] {
  return type === 'ring' ? ['ring1', 'ring2'] : [type]
}
