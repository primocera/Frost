export type AIType = 'melee' | 'swarm' | 'tank' | 'ranged' | 'elite'

export interface EnemyConfig {
  key:          string
  color:        number
  radius:       number
  hp:           number
  speed:        number
  damage:       number
  attackRange:  number
  attackRate:   number
  aggroRange:   number
  wanderRadius: number
  idleTime:     [number, number]
  xpReward:     number
  aiType:       AIType

  // Ranged-specific
  projectileDamage?: number
  projectileSpeed?:  number
  projectileRange?:  number

  // Tank-specific: wind-up before the heavy hit lands
  telegraphMs?: number

  // Elite-specific
  chargeMs?:         number
  chargeCooldownMs?: number
  chargeMult?:       number
  guaranteedDrop?:   boolean
}

// ── Enemy roster ───────────────────────────────────────────────────────────────

export const Slime: EnemyConfig = {
  key: 'slime', color: 0x44cc44, radius: 10, aiType: 'melee',
  hp: 60,  speed: 130, damage: 12, xpReward: 40,
  aggroRange: 500, attackRange: 46, attackRate: 1200,
  wanderRadius: 150, idleTime: [1500, 3500],
}

export const Ghoul: EnemyConfig = {
  key: 'ghoul', color: 0xaa6633, radius: 13, aiType: 'melee',
  hp: 120, speed: 155, damage: 20, xpReward: 85,
  aggroRange: 420, attackRange: 52, attackRate: 1000,
  wanderRadius: 220, idleTime: [800, 2000],
}

/** Fast and fragile — rushes in packs, dies to one good AoE. */
export const Imp: EnemyConfig = {
  key: 'imp', color: 0xff3322, radius: 8, aiType: 'swarm',
  hp: 28,  speed: 260, damage: 8,  xpReward: 30,
  aggroRange: 440, attackRange: 20, attackRate: 820,
  wanderRadius: 180, idleTime: [150, 600],
}

/** Slow and heavily armoured — telegraphed heavy hit, must be kited. */
export const Brute: EnemyConfig = {
  key: 'brute', color: 0x667788, radius: 20, aiType: 'tank',
  hp: 280, speed: 65,  damage: 30, xpReward: 120,
  aggroRange: 380, attackRange: 62, attackRate: 2600,
  wanderRadius: 100, idleTime: [900, 2200],
  telegraphMs: 560,
}

/** Keeps distance, fires projectiles, backs away if you close in. */
export const Wraith: EnemyConfig = {
  key: 'wraith', color: 0xaa44ee, radius: 12, aiType: 'ranged',
  hp: 75,  speed: 90,  damage: 0,  xpReward: 90,
  aggroRange: 480, attackRange: 0, attackRate: 99999,
  wanderRadius: 160, idleTime: [500, 1500],
  projectileDamage: 16, projectileSpeed: 240, projectileRange: 280,
}

/** Rare, dangerous — charges across the room, guaranteed good loot. */
export const Elite: EnemyConfig = {
  key: 'elite', color: 0xddaa00, radius: 22, aiType: 'elite',
  hp: 550, speed: 130, damage: 22, xpReward: 250,
  aggroRange: 520, attackRange: 64, attackRate: 1400,
  wanderRadius: 100, idleTime: [400, 1100],
  chargeMs: 650, chargeCooldownMs: 5500, chargeMult: 3.6,
  guaranteedDrop: true,
}
