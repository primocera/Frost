import { Item, ItemStats, ItemType, Rarity } from './ItemTypes'

let _nextId = 1

const STAT_KEYS: (keyof ItemStats)[] = [
  'spellPower', 'mana', 'manaRegen', 'critChance', 'speed', 'cooldownReduction',
]

// Flat ranges before ilvl scaling — ilvl adds 5% per level above 1
const BASE: Record<Rarity, Record<keyof ItemStats, [number, number]>> = {
  common: {
    spellPower:        [2,   5],
    mana:              [10,  22],
    manaRegen:         [0.2, 0.5],
    critChance:        [0.01, 0.02],
    speed:             [1,   3],
    cooldownReduction: [0.02, 0.04],
  },
  magic: {
    spellPower:        [5,   11],
    mana:              [22,  45],
    manaRegen:         [0.5, 1.1],
    critChance:        [0.02, 0.06],
    speed:             [2,   5],
    cooldownReduction: [0.03, 0.07],
  },
  rare: {
    spellPower:        [10,  20],
    mana:              [45,  80],
    manaRegen:         [1.1, 2.2],
    critChance:        [0.06, 0.11],
    speed:             [3,   6],
    cooldownReduction: [0.06, 0.11],
  },
  epic: {
    spellPower:        [20,  35],
    mana:              [80,  130],
    manaRegen:         [2.2, 4.0],
    critChance:        [0.11, 0.20],
    speed:             [5,   10],
    cooldownReduction: [0.10, 0.18],
  },
}

const STAT_COUNT: Record<Rarity, number> = { common: 1, magic: 2, rare: 3, epic: 4 }

const PREFIXES: Record<Rarity, string[]> = {
  common: ['Worn',      'Crude',     'Frayed',    'Old',      'Simple'   ],
  magic:  ['Glowing',   'Crackling', 'Swift',     'Imbued',   'Charged'  ],
  rare:   ['Arcane',    'Mystic',    'Astral',    'Ancient',  'Ethereal' ],
  epic:   ['Starfire',  'Celestial', 'Void',      'Prismatic','Abyssal'  ],
}

const BASE_NAMES: Record<ItemType, string[]> = {
  staff:  ['Staff', 'Wand', 'Rod', 'Scepter', 'Catalyst'],
  robe:   ['Robe', 'Vestments', 'Wrappings', 'Mantle'],
  ring:   ['Ring', 'Band', 'Seal', 'Circle'],
  amulet: ['Amulet', 'Pendant', 'Talisman', 'Medallion'],
}

const SUFFIXES: Partial<Record<keyof ItemStats, string>> = {
  spellPower:        'Power',
  mana:              'Wisdom',
  manaRegen:         'Restoration',
  critChance:        'Precision',
  speed:             'Swiftness',
  cooldownReduction: 'Mastery',
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function roundStat(key: keyof ItemStats, val: number): number {
  if (key === 'critChance' || key === 'cooldownReduction') return Math.round(val * 1000) / 1000
  if (key === 'manaRegen') return Math.round(val * 10) / 10
  return Math.round(val)
}

function buildName(type: ItemType, rarity: Rarity, stats: ItemStats): string {
  const prefix = pick(PREFIXES[rarity])
  const base   = pick(BASE_NAMES[type])

  if (rarity === 'rare') {
    // Suffix reflects the dominant stat relative to epic max
    let topKey: keyof ItemStats | null = null
    let topNorm = -Infinity
    for (const k of STAT_KEYS) {
      const v = stats[k]
      if (v === undefined) continue
      const norm = v / BASE.epic[k][1]
      if (norm > topNorm) { topNorm = norm; topKey = k }
    }
    const sfx = topKey ? (SUFFIXES[topKey] ?? 'Mystery') : 'Mystery'
    return `${prefix} ${base} of ${sfx}`
  }

  return `${prefix} ${base}`
}

// ── Public ────────────────────────────────────────────────────────────────────

export function generateItem(ilvl: number, forceRarity?: Rarity): Item {
  let rarity = forceRarity
  if (!rarity) {
    const r = Math.random()
    if      (r < 0.02) rarity = 'epic'
    else if (r < 0.10) rarity = 'rare'
    else if (r < 0.32) rarity = 'magic'
    else                rarity = 'common'
  }

  const type = pick(['staff', 'robe', 'ring', 'amulet'] as ItemType[])
  const ilvlScale = 1 + (ilvl - 1) * 0.05

  const count   = STAT_COUNT[rarity]
  const chosen  = [...STAT_KEYS].sort(() => Math.random() - 0.5).slice(0, count)

  const stats: ItemStats = {}
  for (const key of chosen) {
    const [lo, hi] = BASE[rarity][key]
    stats[key] = roundStat(key, randRange(lo, hi) * ilvlScale)
  }

  return {
    id:     _nextId++,
    type,
    rarity,
    name:   buildName(type, rarity, stats),
    stats,
    ilvl,
  }
}

/** Returns a copper amount dropped by an enemy at the given level. */
export function generateGold(level: number): number {
  return Math.max(5, Math.round(level * 30 * (0.7 + Math.random() * 0.6)))
}
