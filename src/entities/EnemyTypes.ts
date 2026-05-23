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
  projectileTex?:    string  // bolt texture key; defaults to 'wraith_bolt' (purple)

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

  // Uses the tall 32×48 humanoid sprite (player model) instead of a square
  // creature texture — changes the body origin + collision setup in Enemy.
  humanoid?: boolean
}

// ── Enemy roster ───────────────────────────────────────────────────────────────

export const Slime: EnemyConfig = {
  key: 'slime', color: 0x44cc44, radius: 10, aiType: 'melee',
  hp: 60,  speed: 120, damage: 3, xpReward: 40,
  aggroRange: 220, attackRange: 46, attackRate: 1200,
  wanderRadius: 90, idleTime: [2000, 5000],
}

export const Ghoul: EnemyConfig = {
  key: 'ghoul', color: 0xaa6633, radius: 13, aiType: 'melee',
  hp: 120, speed: 148, damage: 5, xpReward: 85,
  aggroRange: 270, attackRange: 52, attackRate: 1000,
  wanderRadius: 130, idleTime: [1200, 3000],
}

/** Fast and fragile — rushes in packs, dies to one good AoE. */
export const Imp: EnemyConfig = {
  key: 'imp', color: 0xff3322, radius: 8, aiType: 'swarm',
  hp: 28,  speed: 255, damage: 2,  xpReward: 30,
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
  projectileTex: 'wraith_bolt',
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

// ── Starter Forest fauna ─────────────────────────────────────────────────────
// Each reuses a core AI archetype's stats so combat feel is unchanged — only
// the silhouette, theme colour, and size read differently.

/** Fast pack hunter — closes distance quickly (melee archetype, faster). */
export const Wolf: EnemyConfig = {
  key: 'wolf', color: 0x9a9088, radius: 12, aiType: 'melee',
  hp: 100, speed: 178, damage: 4, xpReward: 80,
  aggroRange: 300, attackRange: 48, attackRate: 950,
  wanderRadius: 160, idleTime: [800, 2200],
}

/** Skittering swarm — fragile, rushes in numbers (swarm archetype). */
export const Spider: EnemyConfig = {
  key: 'spider', color: 0x4a3a55, radius: 9, aiType: 'swarm',
  hp: 34, speed: 235, damage: 2, xpReward: 34,
  aggroRange: 280, attackRange: 22, attackRate: 820,
  wanderRadius: 150, idleTime: [200, 800],
}

/** Outlaw bruiser — standard blade-wielding melee threat (melee archetype). */
export const Bandit: EnemyConfig = {
  key: 'bandit', color: 0x8a6a44, radius: 12, aiType: 'melee',
  hp: 135, speed: 150, damage: 5, xpReward: 95,
  aggroRange: 270, attackRange: 52, attackRate: 1000,
  wanderRadius: 130, idleTime: [1000, 2800],
  humanoid: true,
}

/** Forest heavy thug — big slow humanoid, telegraphed heavy hit (tank archetype). */
export const Bear: EnemyConfig = {
  key: 'bear', color: 0x6b4a2e, radius: 14, aiType: 'tank',
  hp: 240, speed: 88, damage: 8, xpReward: 140,
  aggroRange: 250, attackRange: 56, attackRate: 2200,
  wanderRadius: 100, idleTime: [1400, 3200],
  telegraphMs: 520,
  humanoid: true,
}

// ── Rare roaming elites ─────────────────────────────────────────────────────

/** Forest rare — elite bandit commander who charges and pins you. */
export const Thornback: EnemyConfig = {
  key: 'thornback', label: 'Thornback', color: 0x228833, radius: 14, aiType: 'elite',
  hp: 480, speed: 98, damage: 28, xpReward: 380,
  aggroRange: 310, attackRange: 60, attackRate: 1600,
  wanderRadius: 200, idleTime: [1000, 3000],
  chargeMs: 600, chargeCooldownMs: 6000, chargeMult: 3.2,
  rare: true, lootMultiplier: 3, guaranteedDrop: true,
  humanoid: true,
}

/** Defias-style bandit caster — keeps distance, fires dark bolts. */
export const DefiasCaster: EnemyConfig = {
  key: 'defias_caster', color: 0x7722cc, radius: 11, aiType: 'ranged',
  hp: 55, speed: 90, damage: 0, xpReward: 70,
  aggroRange: 300, attackRange: 0, attackRate: 99999,
  wanderRadius: 120, idleTime: [600, 1800],
  projectileDamage: 5, projectileSpeed: 200, projectileRange: 280,
  projectileTex: 'enemy_fire_bolt',
  humanoid: true,
}

/** Frozen Ruins rare — ice guardian, fires slowing bolts and soaks damage. */
export const FrostWarden: EnemyConfig = {
  key: 'frost_warden', label: 'Frost Warden', color: 0x88eeff, radius: 20, aiType: 'ranged',
  hp: 400, speed: 80, damage: 0, xpReward: 360,
  aggroRange: 360, attackRange: 0, attackRate: 99999,
  wanderRadius: 160, idleTime: [800, 2400],
  projectileDamage: 30, projectileSpeed: 200, projectileRange: 340,
  projectileTex: 'enemy_frost_bolt',
  rare: true, lootMultiplier: 3, guaranteedDrop: true,
}

/** Corrupted Fields rare — rogue mage, fast arcane volleys, very high damage. */
export const CorruptedMage: EnemyConfig = {
  key: 'corrupted_mage', label: 'Corrupted Mage', color: 0xcc44ff, radius: 16, aiType: 'ranged',
  hp: 300, speed: 105, damage: 0, xpReward: 340,
  aggroRange: 380, attackRange: 0, attackRate: 99999,
  wanderRadius: 140, idleTime: [600, 2000],
  projectileDamage: 36, projectileSpeed: 300, projectileRange: 360,
  projectileTex: 'wraith_bolt',
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

/** Every enemy config — used to pre-generate all textures at boot. */
export const ALL_ENEMIES: EnemyConfig[] = [
  Slime, Ghoul, Imp, Brute, Wraith, Elite,
  Wolf, Spider, Bandit, Bear, DefiasCaster,
  ...ALL_RARE_ENEMIES,
]
