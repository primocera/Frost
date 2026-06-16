import { EnemyState, PlayerState, RaidSnap, WorldState } from './types'
import { EnemyConfig } from './enemies'
import { RNG } from './rng'
import { generateItem, Rarity } from './items'
import { gainXP } from './player'
import { regenShopStock } from './shop'
import { talentBonus } from './talents'

/**
 * Server-wide raid: "Malfurion the Corrupted" awakens periodically in Mount
 * Hyjal. HP scales with the active player count; the fight has three escalating
 * phases (bolts/stomp → minions/nova → enrage). Damage is tracked per player and
 * turned into contribution-tiered rewards on kill, with world announcements via
 * `feat` events (the worker broadcasts those as system chat). All authoritative
 * in the sim, so it stays consistent for everyone.
 */
const RAID_FIRST_MS = 150_000          // first raid ~2.5 min after the world wakes
const RAID_INTERVAL_MS = 18 * 60_000   // then every ~18 min
const RAID_DESPAWN_MS = 12 * 60_000    // active window before it retreats
const RAID_BASE_HP = 50_000
const RAID_HP_PER_PLAYER = 10_000
const HYJAL_X = 750, HYJAL_Y = 1200    // arena in Mount Hyjal
const MIN_CONTRIB_PCT = 0.02           // anti-leech: must deal ≥2% to be rewarded

export const MALFURION_CFG: EnemyConfig = {
  key: 'malfurion', color: 0x66ffaa, radius: 115, aiType: 'ranged',
  hp: RAID_BASE_HP, speed: 42, damage: 40, attackRange: 700, attackRate: 1500,
  aggroRange: 1400, wanderRadius: 0, idleTime: [0, 0], xpReward: 0,
  label: 'Malfurion the Corrupted', rare: true, humanoid: true,
}
const MINION_CFG: EnemyConfig = {
  key: 'treant_spawn', color: 0x3a8f4a, radius: 14, aiType: 'melee',
  hp: 300, speed: 150, damage: 8, attackRange: 48, attackRate: 1100,
  aggroRange: 650, wanderRadius: 60, idleTime: [1000, 3000], xpReward: 120,
}

export function initRaid(world: WorldState) { world.raid = null; world.nextRaidMs = RAID_FIRST_MS }

function makeRaidEnemy(world: WorldState, cfg: EnemyConfig, x: number, y: number, isBoss: boolean): EnemyState {
  return {
    id: world.nextEnemyId++, key: cfg.key, x, y, vx: 0, vy: 0, facing: 1,
    hp: cfg.hp, maxHp: cfg.hp, cfg, homeX: x, homeY: y, homeZone: null, zoneId: -1,
    aiState: 'chase', attackCd: 0, wanderIdleMs: 0, wanderTarget: null,
    frozenMs: 0, slowMs: 0, slowMult: 1, rangedCd: 0,
    chargeCd: 0, chargePhase: 'none', chargeTimer: 0, chargeDir: { x: 0, y: 0 },
    telegraphTimer: 0, telegraphing: false,
    burning: false, burnTicksLeft: 0, burnTickTimer: 0, burnDmg: 0, burnOwnerId: '',
    isBoss, bossKey: isBoss ? cfg.key : '', slamCd: 0, slamMs: 0, slamRadius: 0, spreadCd: 0,
    dying: false, deathMs: 0, hitFlashMs: 0,
  }
}

function spawnRaid(world: WorldState) {
  const hp = RAID_BASE_HP + RAID_HP_PER_PLAYER * Math.max(1, world.players.length)
  const e = makeRaidEnemy(world, MALFURION_CFG, HYJAL_X, HYJAL_Y, true)
  e.hp = e.maxHp = hp
  e.slamRadius = 190; e.slamCd = 5000; e.spreadCd = 3000; e.rangedCd = 8000; e.chargeCd = 14000
  world.enemies.push(e)
  world.raid = { enemyId: e.id, name: MALFURION_CFG.label!, zone: 'Mount Hyjal', phase: 1, despawnMs: RAID_DESPAWN_MS, participants: {} }
  world.events.push({ type: 'feat', name: '⚔', text: `${MALFURION_CFG.label} has awakened in Mount Hyjal!` })
}

function endRaid(world: WorldState) { world.raid = null; world.nextRaidMs = RAID_INTERVAL_MS }

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(bx - ax, by - ay)
function nearestPlayer(world: WorldState, e: EnemyState): PlayerState | null {
  let best: PlayerState | null = null, bd = Infinity
  for (const p of world.players) { if (p.dead) continue; const d = dist(e.x, e.y, p.x, p.y); if (d < bd) { bd = d; best = p } }
  return best
}

function damageRaidPlayer(world: WorldState, p: PlayerState, raw: number) {
  const dmg = Math.round(raw * (1 - talentBonus.damageReduction(p.talentRanks)))
  p.stats.hp = Math.max(0, p.stats.hp - dmg); p.hurtMs = 160
  world.events.push({ type: 'playerHit', pid: p.id, x: p.x, y: p.y, damage: dmg })
}

/** Drive the raid: scheduling, despawn, and Malfurion's phased AI. */
export function tickRaid(world: WorldState, dt: number, dtMs: number, rng: RNG) {
  if (!world.raid) {
    world.nextRaidMs -= dtMs
    if (world.nextRaidMs <= 0 && world.players.length > 0) spawnRaid(world)
    return
  }
  const e = world.enemies.find(x => x.id === world.raid!.enemyId)
  if (!e || e.dying) { endRaid(world); return }

  world.raid.despawnMs -= dtMs
  if (world.raid.despawnMs <= 0) {
    world.events.push({ type: 'feat', name: '⚔', text: `${e.cfg.label} has retreated into the mountains.` })
    e.dying = true; e.deathMs = 300
    endRaid(world)
    return
  }
  tickMalfurion(world, e, dtMs, rng)
  e.x += e.vx * dt; e.y += e.vy * dt
}

function tickMalfurion(world: WorldState, e: EnemyState, dtMs: number, rng: RNG) {
  const raid = world.raid!
  const pct = e.hp / e.maxHp
  const phase: 1 | 2 | 3 = pct > 0.7 ? 1 : pct > 0.3 ? 2 : 3
  if (phase > raid.phase) {
    raid.phase = phase
    world.events.push({ type: 'feat', name: '⚔', text: phase === 2 ? 'Phase 2 — Malfurion summons the wilds!' : 'Phase 3 — Malfurion is enraged!' })
    if (phase === 3) world.events.push({ type: 'screenShake', intensity: 14 })
  }
  const enrage = phase === 3 ? 0.5 : phase === 2 ? 0.78 : 1

  // Stomp in progress (telegraph → impact)
  if (e.slamMs > 0) {
    e.vx = 0; e.vy = 0; e.slamMs -= dtMs
    if (e.slamMs <= 0) {
      e.slamMs = 0
      world.events.push({ type: 'bossSlam', x: e.x, y: e.y, radius: e.slamRadius })
      if (phase === 3) world.events.push({ type: 'screenShake', intensity: 10 })
      for (const p of world.players) { if (!p.dead && dist(e.x, e.y, p.x, p.y) <= e.slamRadius) damageRaidPlayer(world, p, 60) }
    }
    return
  }

  e.slamCd -= dtMs; e.spreadCd -= dtMs; e.rangedCd -= dtMs; e.chargeCd -= dtMs
  const target = nearestPlayer(world, e)
  if (!target) { e.vx = 0; e.vy = 0; return }
  const tdx = target.x - e.x, tdy = target.y - e.y, td = Math.hypot(tdx, tdy) || 1
  if (td > e.slamRadius * 0.8) { e.vx = tdx / td * e.cfg.speed; e.vy = tdy / td * e.cfg.speed } else { e.vx = 0; e.vy = 0 }
  if (tdx > 0.5) e.facing = 1; else if (tdx < -0.5) e.facing = -1

  // Stomp
  if (e.slamCd <= 0 && td <= e.slamRadius * 1.1) { e.slamMs = 850; e.slamCd = 4500 * enrage; e.vx = 0; e.vy = 0; return }
  // Nature-bolt fan
  if (e.spreadCd <= 0 && td <= e.cfg.aggroRange) {
    e.spreadCd = 2600 * enrage
    const baseA = Math.atan2(tdy, tdx), n = phase === 3 ? 7 : 5, arc = 0.9
    for (let i = 0; i < n; i++) {
      const a = baseA + (i - (n - 1) / 2) * (arc / Math.max(1, n - 1))
      world.projectiles.push({ id: world.nextProjId++, owner: 'enemy', kind: 'nature_bolt', x: e.x, y: e.y, vx: Math.cos(a) * 340, vy: Math.sin(a) * 340, damage: 30, lifeMs: 3500, radius: 8 })
    }
  }
  // Ice/nature nova (phase 2+)
  if (phase >= 2 && e.rangedCd <= 0) {
    e.rangedCd = 7000 * enrage
    const r = phase === 3 ? 320 : 240
    world.events.push({ type: 'aoe', kind: 'nova', x: e.x, y: e.y, radius: r })
    if (phase === 3) world.events.push({ type: 'screenShake', intensity: 8 })
    for (const p of world.players) { if (!p.dead && dist(e.x, e.y, p.x, p.y) <= r) damageRaidPlayer(world, p, phase === 3 ? 70 : 45) }
  }
  // Summon minions (phase 2+)
  if (phase >= 2 && e.chargeCd <= 0) {
    e.chargeCd = 12000 * enrage
    const existing = world.enemies.filter(x => x.key === 'treant_spawn' && !x.dying).length
    const toSpawn = Math.min(3, 6 - existing)
    for (let i = 0; i < toSpawn; i++) {
      const a = rng.next() * Math.PI * 2, d = 80 + rng.next() * 60
      world.enemies.push(makeRaidEnemy(world, MINION_CFG, e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, false))
    }
    if (toSpawn > 0) world.events.push({ type: 'feat', name: '⚔', text: `${e.cfg.label} summons the wilds!` })
  }
}

/** Accumulate damage dealt to the raid boss (called from every damage site). */
export function onRaidDamage(world: WorldState, e: EnemyState, ownerId: string | undefined, dmg: number) {
  if (!world.raid || e.id !== world.raid.enemyId || !ownerId) return
  world.raid.participants[ownerId] = (world.raid.participants[ownerId] ?? 0) + dmg
}

function rollRaidRarity(tier: string, rng: RNG): Rarity | null {
  const r = rng.next()
  if (tier === 'MVP') return r < 0.5 ? 'epic' : r < 0.85 ? 'rare' : 'magic'
  if (tier === 'Gold') return r < 0.25 ? 'epic' : r < 0.7 ? 'rare' : 'magic'
  if (tier === 'Silver') return r < 0.1 ? 'epic' : r < 0.5 ? 'rare' : 'common'
  return r < 0.4 ? 'magic' : 'common'
}

/** Distribute contribution-tiered rewards on kill + announce. */
export function onRaidKill(world: WorldState, e: EnemyState, rng: RNG) {
  const raid = world.raid
  world.events.push({ type: 'feat', name: '⚔', text: `${e.cfg.label} has been defeated!` })
  if (raid) {
    const entries = Object.entries(raid.participants).sort((a, b) => b[1] - a[1])
    const total = entries.reduce((s, [, d]) => s + d, 0) || 1
    const minDmg = e.maxHp * MIN_CONTRIB_PCT
    entries.forEach(([pid, dmg], idx) => {
      if (dmg < minDmg) return
      const p = world.players.find(pl => pl.id === pid)
      if (!p) return
      const share = dmg / total
      const tier = idx === 0 ? 'MVP' : share >= 0.25 ? 'Gold' : share >= 0.1 ? 'Silver' : 'Bronze'
      const mult = tier === 'MVP' ? 3 : tier === 'Gold' ? 2 : tier === 'Silver' ? 1.3 : 1
      p.gold += Math.round(3000 * mult)
      if (gainXP(p, Math.round(800 * mult))) { world.events.push({ type: 'levelUp', pid: p.id, level: p.stats.level }); regenShopStock(p) }
      const rarity = rollRaidRarity(tier, rng)
      if (rarity && p.inventory.length < p.inventoryCap) {
        const item = generateItem(rng, Math.max(12, p.stats.level + 4), rarity)
        if (rarity === 'epic' && (tier === 'MVP' || rng.next() < 0.4)) item.name = 'Legendary ' + item.name
        p.inventory.push(item)
        world.events.push({ type: 'pickup', pid: p.id, x: p.x, y: p.y, item })
        if (item.name.startsWith('Legendary')) world.events.push({ type: 'feat', name: '★', text: `${p.name} obtained ${item.name}!` })
      }
      world.events.push({ type: 'feat', name: '⚔', text: `${p.name} earned a ${tier} reward` })
    })
  }
  endRaid(world)
}

export function raidSummary(world: WorldState): RaidSnap | null {
  if (!world.raid) return null
  const e = world.enemies.find(x => x.id === world.raid!.enemyId)
  return {
    name: world.raid.name,
    hpPct: e ? Math.max(0, e.hp / e.maxHp) : 0,
    phase: world.raid.phase,
    participants: Object.values(world.raid.participants).filter(d => d > 0).length,
    secondsLeft: Math.max(0, Math.ceil(world.raid.despawnMs / 1000)),
  }
}
