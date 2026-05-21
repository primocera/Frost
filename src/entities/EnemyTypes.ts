/** All tunable data for an enemy type. Add a new object here to add a new mob. */
export interface EnemyConfig {
  key:          string           // texture key (generated in GameScene)
  color:        number           // main fill colour
  radius:       number           // collision + sprite radius
  hp:           number
  speed:        number           // chase speed px/s
  damage:       number           // melee damage per hit
  xpReward:     number
  aggroRange:   number           // px — player detection radius
  attackRange:  number           // px — melee reach
  attackRate:   number           // ms between attacks
  wanderRadius: number           // max wander distance from spawn point
  idleTime:    [number, number]  // [minMs, maxMs] pause between wander moves
}

export const Slime: EnemyConfig = {
  key: 'slime', color: 0xcc2233, radius: 12,
  hp: 60,  speed: 130, damage: 12, xpReward: 40,
  aggroRange: 500, attackRange: 46, attackRate: 1200,
  wanderRadius: 150, idleTime: [1500, 3500],
}

export const Ghoul: EnemyConfig = {
  key: 'ghoul', color: 0x8822aa, radius: 16,
  hp: 120, speed: 155, damage: 20, xpReward: 85,
  aggroRange: 420, attackRange: 52, attackRate: 1000,
  wanderRadius: 220, idleTime: [800, 2000],
}
