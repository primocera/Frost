/**
 * Single source of truth for all gameplay tuning.
 * Change numbers here — nothing else needs editing.
 */
const Balance = {

  player: {
    // ── Base stats (level 1) ──────────────────────────────────────────────
    baseHp:          80,
    baseMana:        100,
    baseSpeed:       172,
    baseSpellDamage: 28,

    // ── Per-level gains ───────────────────────────────────────────────────
    hpPerLevel:           20,   // flat HP per level
    manaPerLevel:         14,   // flat mana per level
    speedPerLevel:        4,    // px/s per level
    spellDamagePerLevel:  8,    // flat damage per level

    // ── Mana regeneration (mana per second) ───────────────────────────────
    // Total regen = base + (level × perLevel)
    // Lv1: 4.5/s   Lv10: 9/s   Lv20: 14/s
    manaRegenBase:     4,
    manaRegenPerLevel: 0.5,

    // ── Firebolt cooldown (ms) ────────────────────────────────────────────
    // Reduces each level, floored at min.
    // Lv1: 800ms  Lv10: 638ms  Lv20: 458ms  Lv24: floor=400ms
    fireboltCdBase:            800,
    fireboltCdReductionPerLevel: 18,
    fireboltCdMin:             400,
    fireboltManaCost:           15,
  },

  xp: {
    baseToNext:    100,
    levelScaling:  1.5,   // each level needs ×1.5 more XP than the last

    // Bonus XP per additional aggroed enemy at kill time.
    // Fighting 4 enemies at once: ×(1 + 3×0.25) = ×1.75 XP on each kill.
    multikillBonus: 0.25,
  },

  aggro: {
    // When a spell hits, enemies within this radius also get aggroed.
    // Makes shooting into a cluster pull the whole group.
    chainRadius: 200,
  },

  mob: {
    // Soft flocking: chasing enemies nudge toward nearby chasing allies.
    // Creates a "blob" feel instead of single-file approach.
    flockRadius: 190,    // px — search range for allies
    flockWeight: 0.18,   // fraction of speed blended toward ally centroid
  },

  loot: {
    // Per-enemy drop chances
    goldDropChance: 0.60,   // fraction of kills that drop gold
    itemDropChance: 0.22,   // fraction of kills that drop an item
    goldPerLevel:   3.2,    // avg gold multiplier per player level
  },

  spells: {
    // ── Arcane Explosion (Q) ──────────────────────────────────────────────
    // Instant AoE burst around the player. Good opener before enemies close in.
    // Damage = baseDamage + spellDamage × 0.5
    arcaneExplosion: {
      radius:     180,
      baseDamage:  40,
      manaCost:    45,
      cooldownMs: 6000,
    },

    // ── Frost Nova (E) ────────────────────────────────────────────────────
    // AoE root around the player. Freeze pack, then AoE, then kite stragglers.
    frostNova: {
      radius:     200,
      freezeMs:  2200,    // how long enemies stay frozen
      manaCost:    60,
      cooldownMs: 10000,
    },

    // ── Blizzard (R) ──────────────────────────────────────────────────────
    // Targeted ground AoE. Damages and slows all enemies in zone over time.
    // Tick damage = tickDamage + spellDamage × 0.4
    blizzard: {
      radius:        240,
      tickDamage:     18,
      tickMs:        600,   // ms between damage ticks (~7 ticks over 4s)
      durationMs:   4000,
      slowMult:      0.45,  // enemies move at 45% speed while in zone
      slowDurationMs: 1400, // slow lingers this long after last tick
      manaCost:       90,
      cooldownMs:  14000,
    },
  },

} as const

export default Balance
