import { ALL_BOSSES, BossConfig } from '../entities/BossTypes'
import { EnemyConfig } from './enemies'

export { ALL_BOSSES }
export type { BossConfig }

/** Synthesise an EnemyConfig from a boss so bosses flow through the normal enemy
 *  pipeline (movement, bolt collision, loot). Their special attacks are handled
 *  separately in the world tick. Marked rare + guaranteedDrop for epic loot. */
export function bossEnemyConfig(b: BossConfig): EnemyConfig {
  return {
    key: b.key, color: b.color, radius: b.radius, aiType: 'melee',
    hp: b.maxHp, speed: b.speed, damage: 14, xpReward: b.xpReward,
    aggroRange: b.aggroRange, attackRange: b.attackRange, attackRate: 1400,
    wanderRadius: 40, idleTime: [800, 2000],
    label: b.name, rare: true, lootMultiplier: 5, guaranteedDrop: true,
  }
}

export const BOSS_CFG_BY_KEY: Record<string, EnemyConfig> =
  Object.fromEntries(ALL_BOSSES.map(b => [b.key, bossEnemyConfig(b)]))
export const BOSS_BY_KEY: Record<string, BossConfig> =
  Object.fromEntries(ALL_BOSSES.map(b => [b.key, b]))

/** One boss per major zone, at a clear arena spot. */
export const BOSS_SPAWNS: { cfg: BossConfig; x: number; y: number }[] = [
  { cfg: BOSS_BY_KEY['boss_thornback'], x: 3300, y: 4720 },  // Beginner Forest
  { cfg: BOSS_BY_KEY['boss_frostlord'], x: 3300, y: 2350 },  // Frozen Ruins
  { cfg: BOSS_BY_KEY['boss_corruptor'], x: 2250, y: 3600 },  // Corrupted Fields
  { cfg: BOSS_BY_KEY['boss_warden'],    x: 4350, y: 3600 },  // Arcane Caves
]

export const BOSS_RESPAWN_MS = 180_000   // 3 min after death
