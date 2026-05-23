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

  // Rare roaming elite
  label?:          string  // display name shown above the enemy
  rare?:           boolean
  lootMultiplier?: number  // gold multiplier on kill
}

// ── Enemy roster ───────────────────────────────────────────────────────────────

export const Slime: EnemyConfig = {
  key: 'slime', color: 0x44cc44, radius: 10, aiType: 'melee',
  hp: 60,  speed: 120, damage: 12, xpReward: 40,
  aggroRange: 220, attackRange: 46, attackRate: 1200,
  wanderRadius: 90, idleTime: [2000, 5000],
}

export const Ghoul: EnemyConfig = {
  key: 'ghoul', color: 0xaa6633, radius: 13, aiType: 'melee',
  hp: 120, speed: 148, damage: 20, xpReward: 85,
  aggroRange: 270, attackRange: 52, attackRate: 1000,
  wanderRadius: 130, idleTime: [1200, 3000],
}

/** Fast and fragile — rushes in packs, dies to one good AoE. */
export const Imp: EnemyConfig = {
  key: 'imp', color: 0xff3322, radius: 8, aiType: 'swarm',
  hp: 28,  speed: 255, damage: 8,  xpReward: 30,
  aggroRange: 280, attackRange: 20, attackRate: 820,
  wanderRadius: 140, idleTime: [200, 700],
}

/** Slow and heavily armoured — telegraphed heavy hit, must be kited. */
export const Brute: EnemyConfig = {
  key: 'brute', color: 0x667788, radius: 20, aiType: 'tank',
  hp: 280, speed: 65,  damage: 30, xpReward: 120,
  aggroRange: 240, attackRange: 62, attackRate: 2600,
  wanderRadius: 80, idleTime: [1500, 3500],
  telegraphMs: 560,
}

/** Keeps distance, fires projectiles, backs away if you close in. */
export const Wraith: EnemyConfig = {
  key: 'wraith', color: 0xaa44ee, radius: 12, aiType: 'ranged',
  hp: 75,  speed: 90,  damage: 0,  xpReward: 90,
  aggroRange: 290, attackRange: 0, attackRate: 99999,
  wanderRadius: 120, idleTime: [600, 1800],
  projectileDamage: 16, projectileSpeed: 240, projectileRange: 280,
}

/** Rare, dangerous — charges across the room, guaranteed good loot. */
export const Elite: EnemyConfig = {
  key: 'elite', color: 0xddaa00, radius: 22, aiType: 'elite',
  hp: 550, speed: 130, damage: 22, xpReward: 250,
  aggroRange: 340, attackRange: 64, attackRate: 1400,
  wanderRadius: 80, idleTime: [600, 1400],
  chargeMs: 650, chargeCooldownMs: 5500, chargeMult: 3.6,
  guaranteedDrop: true,
}

// ── Rare roaming elites ─────────────────────────────────────────────────────

/** Forest rare — spiked brute, charges and pins you. */
export const Thornback: EnemyConfig = {
  key: 'thornback', label: 'Thornback', color: 0x228833, radius: 24, aiType: 'elite',
  hp: 480, speed: 98, damage: 28, xpReward: 380,
  aggroRange: 310, attackRange: 70, attackRate: 1600,
  wanderRadius: 200, idleTime: [1000, 3000],
  chargeMs: 600, chargeCooldownMs: 6000, chargeMult: 3.2,
  rare: true, lootMultiplier: 3, guaranteedDrop: true,
}

/** Frozen Ruins rare — ice guardian, fires slowing bolts and soaks damage. */
export const FrostWarden: EnemyConfig = {
  key: 'frost_warden', label: 'Frost Warden', color: 0x88eeff, radius: 20, aiType: 'ranged',
  hp: 400, speed: 80, damage: 0, xpReward: 360,
  aggroRange: 360, attackRange: 0, attackRate: 99999,
  wanderRadius: 160, idleTime: [800, 2400],
  projectileDamage: 30, projectileSpeed: 200, projectileRange: 340,
  rare: true, lootMultiplier: 3, guaranteedDrop: true,
}

/** Corrupted Fields rare — rogue mage, fast arcane volleys, very high damage. */
export const CorruptedMage: EnemyConfig = {
  key: 'corrupted_mage', label: 'Corrupted Mage', color: 0xcc44ff, radius: 16, aiType: 'ranged',
  hp: 300, speed: 105, damage: 0, xpReward: 340,
  aggroRange: 380, attackRange: 0, attackRate: 99999,
  wanderRadius: 140, idleTime: [600, 2000],
  projectileDamage: 36, projectileSpeed: 300, projectileRange: 360,
  rare: true, lootMultiplier: 3, guaranteedDrop: true,
}

/** Arcane Caves rare — undead lich, charges then fires arcane barrages. */
export const ArcaneLich: EnemyConfig = {
  key: 'arcane_lich', label: 'Arcane Lich', color: 0x44ddff, radius: 22, aiType: 'elite',
  hp: 560, speed: 115, damage: 24, xpReward: 440,
  aggroRange: 370, attackRange: 62, attackRate: 1400,
  wanderRadius: 130, idleTime: [600, 1800],
  chargeMs: 700, chargeCooldownMs: 5000, chargeMult: 3.8,
  rare: true, lootMultiplier: 3, guaranteedDrop: true,
}

/** Volcanic Wastes rare — colossal lava titan, devastating telegraphed slam. */
export const AshenGiant: EnemyConfig = {
  key: 'ashen_giant', label: 'Ashen Giant', color: 0xff6622, radius: 30, aiType: 'tank',
  hp: 1100, speed: 52, damage: 60, xpReward: 560,
  aggroRange: 320, attackRange: 80, attackRate: 3400,
  wanderRadius: 120, idleTime: [1200, 3200],
  telegraphMs: 900,
  rare: true, lootMultiplier: 4, guaranteedDrop: true,
}

export const ALL_RARE_ENEMIES: EnemyConfig[] = [
  Thornback, FrostWarden, CorruptedMage, ArcaneLich, AshenGiant,
]
