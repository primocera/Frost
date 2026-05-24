import { TALENT_DEFS, TalentId, TreeId, TREE_UNLOCK_LEVEL } from '../talents/TalentTypes'

export class TalentSystem {
  private _ranks: Partial<Record<TalentId, number>> = {}
  points      = 0
  playerLevel = 1

  get allRanks(): Partial<Record<TalentId, number>> { return { ...this._ranks } }

  /** Set by TalentUI so the panel redraws after a purchase. */
  onChange?: () => void

  getRank(id: TalentId): number { return this._ranks[id] ?? 0 }

  treeUnlocked(tree: TreeId): boolean {
    return this.playerLevel >= TREE_UNLOCK_LEVEL[tree]
  }

  canBuy(id: TalentId): boolean {
    if (this.points <= 0) return false
    const def = TALENT_DEFS.find(d => d.id === id)!
    if (!this.treeUnlocked(def.tree)) return false
    return this.getRank(id) < def.maxRank
  }

  buy(id: TalentId): boolean {
    if (!this.canBuy(id)) return false
    this._ranks[id] = this.getRank(id) + 1
    this.points--
    this.onChange?.()
    return true
  }

  // ── Passive stat bonuses ──────────────────────────────────────────────────

  /** Flat bonus added to base spell damage. */
  get bonusSpellDamage(): number { return this.getRank('arc_power') * 6 }

  /** Additional mana/sec added to base regen. */
  get bonusManaRegen(): number { return this.getRank('arc_regen') * 1.2 }

  /** Flat bonus added to movement speed. */
  get bonusSpeed(): number { return this.getRank('frost_kite') * 2 }

  /** Additional CDR fraction (stacks with gear CDR before 40% cap). */
  get bonusCDR(): number { return this.getRank('arc_cdr') * 0.06 }

  /** Additional crit chance fraction. */
  get bonusCritChance(): number { return this.getRank('fire_crit') * 0.03 }

  /** Final crit damage multiplier (1.5 base, +0.15 per Combustion rank). */
  get bonusCritMult(): number { return 1.5 + this.getRank('fire_crit_dmg') * 0.15 }

  /** Fraction of incoming damage blocked. */
  get bonusDamageReduction(): number { return this.getRank('frost_armor') * 0.08 }

  /** Extra milliseconds added to Frost Nova freeze. */
  get bonusFreezeMs(): number { return this.getRank('frost_nova_ext') * 500 }

  /** Flat bonus added to Arcane Explosion base damage. */
  get bonusArcExDamage(): number { return this.getRank('fire_arcex') * 10 }

  /** Multiplier applied to all AoE radii (1.0 = no change). */
  get bonusAoEMult(): number { return 1 + this.getRank('arc_radius') * 0.08 }

  /** Multiplier applied to mana costs (0.80 = 20% cheaper). */
  get bonusManaCostMult(): number { return 1 - this.getRank('arc_mana') * 0.10 }

  // ── Active modifiers ──────────────────────────────────────────────────────

  /** Speed fraction enemies move at after a chill (0 = no chill talent). */
  get chillSlowMult(): number {
    const r = this.getRank('frost_chill')
    return r === 0 ? 0 : r === 1 ? 0.60 : 0.45
  }

  /** Duration of the chill slow in ms. */
  get chillDurationMs(): number {
    const r = this.getRank('frost_chill')
    return r === 0 ? 0 : r === 1 ? 1500 : 2000
  }

  get igniteRank(): number { return this.getRank('fire_ignite') }

  /** Damage per burn tick (0 = Ignite not learned). */
  get igniteDamagePerTick(): number {
    return this.igniteRank === 0 ? 0 : this.igniteRank === 1 ? 8 : 14
  }

  get permafrostEnabled(): boolean { return this.getRank('frost_permafrost') > 0 }
  get flashpointEnabled(): boolean { return this.getRank('fire_flashpoint') > 0 }

  /** Restore saved state (called on character load). */
  loadSave(ranks: Partial<Record<TalentId, number>>, points: number, playerLevel: number) {
    this._ranks      = { ...ranks }
    this.points      = points
    this.playerLevel = playerLevel
    this.onChange?.()
  }

  /** Refund all spent talent points. Returns the number refunded. */
  reset(): number {
    const spent = (Object.values(this._ranks) as number[]).reduce((sum, r) => sum + r, 0)
    this._ranks = {}
    this.points += spent
    this.onChange?.()
    return spent
  }
}
