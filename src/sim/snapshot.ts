import { ALL_ENEMIES, EnemyConfig } from './enemies'
import { BOSS_CFG_BY_KEY, BOSS_BY_KEY } from './bosses'
import { EnemyState, PlayerState, SelfState, Snapshot, WorldState } from './types'
import { tradeViewFor } from './trade'

/** Personal inventory/talent state for the owning player (sent only to them).
 *  `world` is optional: when present, the live trade session is included. */
export function selfOf(p: PlayerState, world?: WorldState): SelfState {
  return {
    inv: p.inventory, eq: p.equipped, ranks: p.talentRanks, pts: p.talentPoints,
    shop: p.shopStock, quest: p.quest, stash: p.stash,
    trade: world ? tradeViewFor(world, p.id) : null,
  }
}

/** key → EnemyConfig, so clients can rebuild render data from a compact key. */
export const ENEMY_BY_KEY: Record<string, EnemyConfig> = {
  ...Object.fromEntries(ALL_ENEMIES.map(c => [c.key, c])),
  ...BOSS_CFG_BY_KEY,
}

/**
 * Server: pack the authoritative world into a compact wire snapshot.
 * Entities far from every player are culled (the world holds ~500 enemies but
 * only a few dozen are ever near players), keeping snapshots small.
 */
export function serialize(world: WorldState, cullRadius = 1500): Snapshot {
  const viewers = world.players.map(p => ({ x: p.x, y: p.y }))
  const near = (x: number, y: number) =>
    viewers.length === 0 || viewers.some(v => Math.hypot(v.x - x, v.y - y) <= cullRadius)

  return {
    t: world.timeMs,
    players: world.players.map(p => ({
      id: p.id, name: p.name, x: p.x, y: p.y, vx: p.vx, vy: p.vy, facing: p.facing,
      hp: p.stats.hp, maxHp: p.stats.maxHp, mana: p.stats.mana, maxMana: p.stats.maxMana,
      xp: p.stats.xp, xpToNext: p.stats.xpToNext, level: p.stats.level, gold: p.gold,
      activeBolt: p.activeBolt, learned: p.learnedSpells,
      castMs: p.castMs, hurtMs: p.hurtMs, dead: p.dead, frozen: p.frozenMs > 0,
    })),
    enemies: world.enemies.filter(e => near(e.x, e.y)).map(e => ({
      id: e.id, key: e.key, x: e.x, y: e.y, facing: e.facing,
      hp: e.hp, maxHp: e.maxHp,
      frozen: e.frozenMs > 0, slow: e.slowMs > 0, flash: e.hitFlashMs > 0,
      tell: e.telegraphing || e.chargePhase === 'windup',
      dying: e.dying, deathMs: e.deathMs,
      boss: e.isBoss || undefined,
      slamR: e.slamMs > 0 && BOSS_BY_KEY[e.bossKey] ? BOSS_BY_KEY[e.bossKey].slamRadius : undefined,
    })),
    projectiles: world.projectiles.filter(p => near(p.x, p.y)).map(p => ({
      id: p.id, owner: p.owner, kind: p.kind, x: p.x, y: p.y, vx: p.vx, vy: p.vy, radius: p.radius,
    })),
    loot: world.loot.filter(l => near(l.x, l.y)).map(l => ({ id: l.id, x: l.x, y: l.y, gold: l.gold, rarity: l.item?.rarity })),
    grounds: world.grounds.map(g => ({ id: g.id, x: g.x, y: g.y, radius: g.radius })),
    events: world.events,
  }
}

/** A render-only PlayerState built from a snapshot (no AI/sim internals needed). */
export function hydratePlayer(s: Snapshot['players'][number]): PlayerState {
  return {
    id: s.id, name: s.name, x: s.x, y: s.y, vx: s.vx, vy: s.vy, facing: s.facing,
    stats: {
      hp: s.hp, maxHp: s.maxHp, mana: s.mana, maxMana: s.maxMana,
      xp: s.xp, xpToNext: s.xpToNext, level: s.level, speed: 0, spellDamage: 0,
    },
    cd: { firebolt: 0, frostbolt: 0, arcaneBlast: 0, frostNova: 0, blizzard: 0 },
    activeBolt: s.activeBolt, learnedSpells: s.learned, manaRegenAccum: 0,
    dead: s.dead, gold: s.gold, inventory: [], inventoryCap: 30,
    equipped: { staff: null, robe: null, ring1: null, ring2: null, amulet: null },
    talentRanks: {}, talentPoints: 0, shopStock: [], quest: null, stash: [],
    frozenMs: s.frozen ? 9999 : 0, slowMs: 0, slowMult: 1, pvpGraceMs: 0,
    castMs: s.castMs, hurtMs: s.hurtMs,
  }
}

/** A render-only EnemyState built from a snapshot (cfg restored from key). */
export function hydrateEnemy(s: Snapshot['enemies'][number]): EnemyState {
  const cfg = ENEMY_BY_KEY[s.key] ?? ALL_ENEMIES[0]
  return {
    id: s.id, key: s.key, x: s.x, y: s.y, vx: 0, vy: 0, facing: s.facing,
    hp: s.hp, maxHp: s.maxHp, cfg,
    homeX: s.x, homeY: s.y, homeZone: null, zoneId: -1,
    aiState: 'wander', attackCd: 0, wanderIdleMs: 0, wanderTarget: null,
    frozenMs: s.frozen ? 9999 : 0, slowMs: s.slow ? 9999 : 0, slowMult: 1, rangedCd: 0,
    chargeCd: 0, chargePhase: s.tell ? 'windup' : 'none', chargeTimer: 0, chargeDir: { x: 0, y: 0 },
    telegraphTimer: 0, telegraphing: s.tell,
    burning: false, burnTicksLeft: 0, burnTickTimer: 0, burnDmg: 0, burnOwnerId: '',
    isBoss: !!s.boss, bossKey: '', slamCd: 0, slamMs: s.slamR ? 1 : 0, slamRadius: s.slamR ?? 0, spreadCd: 0,
    dying: s.dying, deathMs: s.deathMs, hitFlashMs: s.flash ? 160 : 0,
  }
}
