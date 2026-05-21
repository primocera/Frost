export type BossId = 'thornback' | 'frostlord' | 'corruptor' | 'warden'

export interface BossConfig {
  id:           BossId
  name:         string
  key:          string
  color:        number
  radius:       number
  maxHp:        number
  speed:        number
  aggroRange:   number
  attackRange:  number
  xpReward:     number
  zoneId:       string   // matches ZoneDef.name
  killThreshold:number   // enemy kills in zone before boss spawns

  phase2At: number  // HP fraction (e.g. 0.60) where phase 2 triggers
  phase3At: number  // HP fraction (e.g. 0.30) where phase 3 triggers

  // Slam: AoE circle telegraph attack
  slamRadius:     number
  slamDamage:     number
  slamCooldownMs: number

  // Spread: projectile fan aimed at player
  spreadCount:     number
  spreadDamage:    number
  spreadSpeed:     number
  spreadCooldownMs:number

  // Charge: fast dash toward player
  chargeMult:      number
  chargeDamage:    number
  chargeMs:        number
  chargeCooldownMs:number
}

// ── Boss roster ────────────────────────────────────────────────────────────────

/** The forest guardian — slow melee tank that pounds the ground. */
const Thornback: BossConfig = {
  id: 'thornback', name: 'Thornback', key: 'boss_thornback', color: 0x33bb44,
  radius: 28, maxHp: 800, speed: 88, aggroRange: 520, attackRange: 68,
  xpReward: 600, zoneId: 'Beginner Forest', killThreshold: 10,
  phase2At: 0.60, phase3At: 0.30,
  slamRadius: 110, slamDamage: 32, slamCooldownMs: 4000,
  spreadCount: 3, spreadDamage: 16, spreadSpeed: 230, spreadCooldownMs: 5000,
  chargeMult: 3.1, chargeDamage: 28, chargeMs: 680, chargeCooldownMs: 7000,
}

/** An ancient frozen warlord — wide ice blasts, relentless pressure. */
const Frostlord: BossConfig = {
  id: 'frostlord', name: 'Frostlord', key: 'boss_frostlord', color: 0x44bbee,
  radius: 32, maxHp: 1200, speed: 76, aggroRange: 560, attackRange: 74,
  xpReward: 900, zoneId: 'Frozen Ruins', killThreshold: 10,
  phase2At: 0.60, phase3At: 0.30,
  slamRadius: 140, slamDamage: 42, slamCooldownMs: 3800,
  spreadCount: 5, spreadDamage: 22, spreadSpeed: 220, spreadCooldownMs: 4500,
  chargeMult: 2.8, chargeDamage: 38, chargeMs: 800, chargeCooldownMs: 6500,
}

/** A bloated corruption elemental — rapid volleys, short wind-ups. */
const Corruptor: BossConfig = {
  id: 'corruptor', name: 'Corruptor', key: 'boss_corruptor', color: 0xcc3311,
  radius: 30, maxHp: 1400, speed: 98, aggroRange: 560, attackRange: 70,
  xpReward: 1100, zoneId: 'Corrupted Fields', killThreshold: 10,
  phase2At: 0.60, phase3At: 0.30,
  slamRadius: 130, slamDamage: 48, slamCooldownMs: 3200,
  spreadCount: 6, spreadDamage: 20, spreadSpeed: 255, spreadCooldownMs: 4000,
  chargeMult: 3.5, chargeDamage: 36, chargeMs: 650, chargeCooldownMs: 5500,
}

/** An ancient arcane construct — blinding spreads and punishing charges. */
const Warden: BossConfig = {
  id: 'warden', name: 'Arcane Warden', key: 'boss_warden', color: 0x9922dd,
  radius: 34, maxHp: 1600, speed: 106, aggroRange: 600, attackRange: 76,
  xpReward: 1400, zoneId: 'Arcane Caves', killThreshold: 10,
  phase2At: 0.60, phase3At: 0.30,
  slamRadius: 150, slamDamage: 55, slamCooldownMs: 2800,
  spreadCount: 8, spreadDamage: 24, spreadSpeed: 275, spreadCooldownMs: 3200,
  chargeMult: 3.8, chargeDamage: 44, chargeMs: 600, chargeCooldownMs: 5000,
}

export const ALL_BOSSES: BossConfig[] = [Thornback, Frostlord, Corruptor, Warden]
