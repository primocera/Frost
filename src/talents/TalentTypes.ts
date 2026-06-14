export type TreeId   = 'frost' | 'fire' | 'arcane'
export type TalentId =
  | 'frost_chill' | 'frost_nova_ext' | 'frost_armor' | 'frost_permafrost' | 'frost_kite'
  | 'fire_ignite'  | 'fire_crit'      | 'fire_crit_dmg' | 'fire_arcex'    | 'fire_flashpoint'
  | 'arc_mana'     | 'arc_power'      | 'arc_radius'    | 'arc_cdr'        | 'arc_regen'

export interface TalentDef {
  id:       TalentId
  tree:     TreeId
  name:     string
  desc:     string       // what the talent does (tree-color heading)
  maxRank:  number
  rankDesc: string[]     // one line per rank shown in UI
}

export const TREE_LABEL: Record<TreeId, string> = {
  frost:  'FROST',
  fire:   'FIRE',
  arcane: 'ARCANE',
}

export const TREE_COLOR: Record<TreeId, string> = {
  frost:  '#44aaff',
  fire:   '#ff6633',
  arcane: '#cc44ff',
}

export const TREE_HEX: Record<TreeId, number> = {
  frost:  0x44aaff,
  fire:   0xff6633,
  arcane: 0xcc44ff,
}

export const TALENT_TREES: TreeId[] = ['frost', 'fire', 'arcane']

/** Minimum player level required to spend points in each tree. */
export const TREE_UNLOCK_LEVEL: Record<TreeId, number> = {
  frost:  2,
  fire:   2,   // you start with Firebolt, so fire talents unlock early too
  arcane: 6,
}

export const TALENT_DEFS: TalentDef[] = [
  // ── Frost ──────────────────────────────────────────────────────────────────
  {
    id: 'frost_chill', tree: 'frost', name: 'Chilling Touch', maxRank: 2,
    desc: 'Firebolt slows the target.',
    rankDesc: ['60% speed  1.5s', '45% speed  2s'],
  },
  {
    id: 'frost_nova_ext', tree: 'frost', name: 'Extended Freeze', maxRank: 2,
    desc: 'Frost Nova freeze lasts longer.',
    rankDesc: ['+500ms', '+1000ms'],
  },
  {
    id: 'frost_armor', tree: 'frost', name: 'Glacial Armor', maxRank: 2,
    desc: 'Reduces incoming damage.',
    rankDesc: ['-8% dmg taken', '-16% dmg taken'],
  },
  {
    id: 'frost_permafrost', tree: 'frost', name: 'Permafrost', maxRank: 1,
    desc: 'Frozen enemies take 25% more damage.',
    rankDesc: ['Frozen: +25% dmg taken'],
  },
  {
    id: 'frost_kite', tree: 'frost', name: 'Ice Flow', maxRank: 2,
    desc: 'Increases movement speed.',
    rankDesc: ['+2 speed', '+4 speed'],
  },

  // ── Fire ───────────────────────────────────────────────────────────────────
  {
    id: 'fire_ignite', tree: 'fire', name: 'Ignite', maxRank: 2,
    desc: 'Firebolt burns the target over time.',
    rankDesc: ['8 dmg × 4 ticks (2s)', '14 dmg × 4 ticks (2s)'],
  },
  {
    id: 'fire_crit', tree: 'fire', name: 'Pyromaniac', maxRank: 3,
    desc: 'Increases critical strike chance.',
    rankDesc: ['+3% crit', '+6% crit', '+9% crit'],
  },
  {
    id: 'fire_crit_dmg', tree: 'fire', name: 'Combustion', maxRank: 2,
    desc: 'Increases critical strike damage.',
    rankDesc: ['Crits deal ×1.65', 'Crits deal ×1.8'],
  },
  {
    id: 'fire_arcex', tree: 'fire', name: 'Inferno', maxRank: 2,
    desc: 'Arcane Explosion hits harder.',
    rankDesc: ['+10 base damage', '+20 base damage'],
  },
  {
    id: 'fire_flashpoint', tree: 'fire', name: 'Flashpoint', maxRank: 1,
    desc: 'Killing a burning enemy resets Firebolt.',
    rankDesc: ['Kill burning: reset Firebolt CD'],
  },

  // ── Arcane ─────────────────────────────────────────────────────────────────
  {
    id: 'arc_mana', tree: 'arcane', name: 'Mana Flow', maxRank: 2,
    desc: 'All spell mana costs reduced.',
    rankDesc: ['-10% mana costs', '-20% mana costs'],
  },
  {
    id: 'arc_power', tree: 'arcane', name: 'Arcane Power', maxRank: 2,
    desc: 'Increases spell damage.',
    rankDesc: ['+6 spell damage', '+12 spell damage'],
  },
  {
    id: 'arc_radius', tree: 'arcane', name: 'Resonance', maxRank: 2,
    desc: 'AoE spells cover a larger area.',
    rankDesc: ['+8% AoE radius', '+16% AoE radius'],
  },
  {
    id: 'arc_cdr', tree: 'arcane', name: 'Temporal Flux', maxRank: 2,
    desc: 'All spell cooldowns reduced.',
    rankDesc: ['-6% cooldowns', '-12% cooldowns'],
  },
  {
    id: 'arc_regen', tree: 'arcane', name: 'Insight', maxRank: 2,
    desc: 'Increases mana regeneration.',
    rankDesc: ['+1.2 mana/sec', '+2.4 mana/sec'],
  },
]

/** All talents belonging to a given tree, in order. */
export function talentsForTree(tree: TreeId): TalentDef[] {
  return TALENT_DEFS.filter(d => d.tree === tree)
}
