import Balance from './balance'
import { updateEnemy } from './ai'
import { EnemyConfig } from './enemies'
import { generateGold, generateItem, Item } from './items'
import { createPlayer, effMaxMana, effSpeed, effSpellDamage, fireboltCooldownMax, frostboltCooldownMax,
  fireboltCost, frostboltCost, gainXP, regenMana, critChance, critMult, applyCDR, spellCost,
  SPELL_TRAIN_LEVEL } from './player'
import { talentBonus } from './talents'
import { regenShopStock } from './shop'
import { questOnKill } from './quest'
import { BOSS_SPAWNS, BOSS_BY_KEY, bossEnemyConfig, BOSS_RESPAWN_MS } from './bosses'
import { RNG } from './rng'
import { buildSpawnZones, getZoneAt, STARTER_X, STARTER_Y, WORLD_W, WORLD_H, PVP_SAFE_R } from './zones'
import { EnemyState, GroundEffectState, InputCommand, PlayerState, ProjectileState,
  SpawnZoneState, WorldState } from './types'

const BOUNDS = { x: 0, y: 0, w: WORLD_W, h: WORLD_H }
const PLAYER_RADIUS = 14
const FIRE_SPEED = 540
const FROST_SPEED = 480
const BOLT_LIFE = 1800
const RESPAWN_MIN = 240_000
const RESPAWN_MAX = 300_000
const RESPAWN_DEAD_MS = 2000
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(bx - ax, by - ay)
const zoneName = (x: number, y: number) => getZoneAt(x, y)?.name ?? '__town__'
const inSafeZone = (x: number, y: number) =>
  Math.abs(x - STARTER_X) < PVP_SAFE_R && Math.abs(y - STARTER_Y) < PVP_SAFE_R

/** FFA PvP: apply a player's spell damage to another player (never self/safe-zone). */
function damagePlayer(world: WorldState, attackerId: string | undefined, victim: PlayerState, dmg: number, frost: boolean) {
  if (victim.dead || victim.id === attackerId || inSafeZone(victim.x, victim.y) || victim.pvpGraceMs > 0) return
  victim.stats.hp = Math.max(0, victim.stats.hp - dmg)
  victim.hurtMs = 160
  if (frost) {
    victim.slowMult = Math.min(victim.slowMult, Balance.spells.frostbolt.slowMult)
    victim.slowMs = Math.max(victim.slowMs, Balance.spells.frostbolt.slowDurationMs)
  }
  world.events.push({ type: 'playerHit', pid: victim.id, x: victim.x, y: victim.y, damage: dmg })
}

function damagePlayersInRadius(world: WorldState, attackerId: string, cx: number, cy: number, radius: number, dmg: number, frost: boolean) {
  for (const v of world.players) {
    if (v.id === attackerId || v.dead || inSafeZone(v.x, v.y)) continue
    if (dist(cx, cy, v.x, v.y) <= radius) damagePlayer(world, attackerId, v, dmg, frost)
  }
}

/** Creates an empty world (no players). Add players with addPlayer(). */
export function createWorld(seed: number): WorldState {
  const world: WorldState = {
    bounds: { ...BOUNDS },
    players: [],
    enemies: [],
    projectiles: [],
    loot: [],
    grounds: [],
    zones: buildSpawnZones().map((z, id): SpawnZoneState => ({
      id, cx: z.cx, cy: z.cy, radius: z.radius, configs: z.table,
      zoneBounds: z.zoneBounds, maxEnemies: z.maxEnemies, count: 0, respawnTimers: [],
    })),
    bossRespawns: [],
    timeMs: 0,
    rngState: seed >>> 0,
    events: [],
    nextEnemyId: 1,
    nextProjId: 1,
    nextLootId: 1,
    killStreak: 0,
    lastKillMs: -99999,
  }
  const rng = new RNG(seed)
  for (const zone of world.zones) {
    for (let i = 0; i < zone.maxEnemies; i++) spawnFromZone(world, zone, rng)
  }
  for (const b of BOSS_SPAWNS) spawnBoss(world, b.cfg.key, b.x, b.y)
  world.rngState = rng.state
  return world
}

export function addPlayer(world: WorldState, id: string, name: string): PlayerState {
  const existing = world.players.find(p => p.id === id)
  if (existing) return existing
  const p = createPlayer(id, name, STARTER_X, STARTER_Y)
  regenShopStock(p)
  world.players.push(p)
  return p
}

export function removePlayer(world: WorldState, id: string) {
  world.players = world.players.filter(p => p.id !== id)
}

function spawnFromZone(world: WorldState, zone: SpawnZoneState, rng: RNG) {
  const cfg = rng.pick(zone.configs)
  const a = rng.next() * Math.PI * 2
  const r = rng.next() * zone.radius
  const x = Math.max(80, Math.min(WORLD_W - 80, zone.cx + Math.cos(a) * r))
  const y = Math.max(80, Math.min(WORLD_H - 80, zone.cy + Math.sin(a) * r))
  world.enemies.push(makeEnemy(world, cfg, x, y, zone, rng))
  zone.count++
}

function makeEnemy(
  world: WorldState, cfg: EnemyConfig, x: number, y: number, zone: SpawnZoneState, rng: RNG,
): EnemyState {
  return {
    id: world.nextEnemyId++, key: cfg.key, x, y, vx: 0, vy: 0, facing: 1,
    hp: cfg.hp, maxHp: cfg.hp, cfg,
    homeX: x, homeY: y,
    homeZone: zone.zoneBounds ? { ...zone.zoneBounds } : null,
    zoneId: zone.id,
    aiState: 'wander', attackCd: 0,
    wanderIdleMs: rng.int(0, cfg.idleTime[1]), wanderTarget: null,
    frozenMs: 0, slowMs: 0, slowMult: 1, rangedCd: 0,
    chargeCd: cfg.chargeCooldownMs ? cfg.chargeCooldownMs * 0.55 : 0,
    chargePhase: 'none', chargeTimer: 0, chargeDir: { x: 0, y: 0 },
    telegraphTimer: 0, telegraphing: false,
    burning: false, burnTicksLeft: 0, burnTickTimer: 0, burnDmg: 0, burnOwnerId: '',
    isBoss: false, bossKey: '', slamCd: 4000, slamMs: 0, slamRadius: 0, spreadCd: 5000,
    dying: false, deathMs: 0, hitFlashMs: 0,
  }
}

function spawnBoss(world: WorldState, key: string, x: number, y: number) {
  const boss = BOSS_BY_KEY[key]
  if (!boss) return
  const dummyZone: SpawnZoneState = { id: -1, cx: x, cy: y, radius: 0, configs: [], zoneBounds: null, maxEnemies: 0, count: 0, respawnTimers: [] }
  const rng = new RNG((world.timeMs | 0) ^ 0xB055)
  const e = makeEnemy(world, bossEnemyConfig(boss), x, y, dummyZone, rng)
  e.zoneId = -1
  e.isBoss = true
  e.bossKey = key
  e.slamRadius = boss.slamRadius
  world.enemies.push(e)
}

const playerById = (world: WorldState, id?: string) =>
  id ? world.players.find(p => p.id === id) ?? null : null

// ── Main tick ─────────────────────────────────────────────────────────────────

/** Advance the world by `dt` seconds. `inputs` maps player id → their command. */
export function tick(world: WorldState, inputs: Record<string, InputCommand>, dt: number) {
  const dtMs = dt * 1000
  world.timeMs += dtMs
  world.events.length = 0
  const rng = new RNG(world.rngState)

  for (const p of world.players) {
    const input = inputs[p.id]
    updatePlayer(world, p, input, dt, dtMs)
    if (input) {
      if (input.swapBolt) p.activeBolt = p.activeBolt === 'fire' ? 'frost' : 'fire'
      if (!p.dead) handleCasts(world, p, input, rng)
    }
  }

  for (const e of world.enemies) {
    if (e.dying) { e.deathMs -= dtMs; continue }
    tickBurn(world, e, dtMs, rng)
    if (e.dying) continue
    updateEnemy(e, world.players, world.enemies, world, dtMs, rng)
    if (e.isBoss) tickBoss(world, e, dtMs)
    e.x += e.vx * dt
    e.y += e.vy * dt
  }
  separateEnemies(world)

  updateProjectiles(world, dt, dtMs, rng)
  updateGrounds(world, dtMs, rng)
  updateLoot(world, dtMs)
  updateRespawns(world, dtMs, rng)
  updateBossRespawns(world, dtMs)

  world.enemies = world.enemies.filter(e => !(e.dying && e.deathMs <= 0))

  for (const p of world.players) {
    if (p.stats.hp <= 0 && !p.dead) {
      p.dead = true; p.hurtMs = 0
      world.events.push({ type: 'death', pid: p.id })
      p.manaRegenAccum = -RESPAWN_DEAD_MS
    }
    if (p.dead) {
      p.manaRegenAccum += dtMs
      if (p.manaRegenAccum >= 0) respawn(world, p)
    }
  }

  world.rngState = rng.state
}

function updatePlayer(world: WorldState, p: PlayerState, input: InputCommand | undefined, dt: number, dtMs: number) {
  for (const k of ['firebolt', 'frostbolt', 'arcaneBlast', 'frostNova', 'blizzard'] as const) {
    if (p.cd[k] > 0) p.cd[k] = Math.max(0, p.cd[k] - dtMs)
  }
  if (p.castMs > 0) p.castMs -= dtMs
  if (p.hurtMs > 0) p.hurtMs -= dtMs
  if (p.slowMs > 0) { p.slowMs -= dtMs; if (p.slowMs <= 0) { p.slowMs = 0; p.slowMult = 1 } }
  if (p.frozenMs > 0) p.frozenMs -= dtMs
  if (p.dead) { p.vx = 0; p.vy = 0; return }

  regenMana(p, dtMs)
  // Passive out-of-combat-ish HP regen (1.2%/s) so you can recover without potions.
  if (p.stats.hp < p.stats.maxHp) p.stats.hp = Math.min(p.stats.maxHp, p.stats.hp + p.stats.maxHp * 0.012 * dt)

  let dx = input ? input.move.x : 0
  let dy = input ? input.move.y : 0
  // Frozen by an enemy mage's Frost Nova — rooted in place but can still cast.
  if (p.frozenMs > 0) { dx = 0; dy = 0 }
  if (dx !== 0 && dy !== 0) { dx *= 0.7071; dy *= 0.7071 }
  const speed = effSpeed(p) * p.slowMult
  p.vx = dx * speed; p.vy = dy * speed
  p.x += p.vx * dt; p.y += p.vy * dt

  const b = world.bounds
  p.x = Math.max(b.x + PLAYER_RADIUS, Math.min(b.x + b.w - PLAYER_RADIUS, p.x))
  p.y = Math.max(b.y + PLAYER_RADIUS, Math.min(b.y + b.h - PLAYER_RADIUS, p.y))

  // PvP protection: refreshed in the safe zone, ticks down for a few seconds after leaving.
  if (inSafeZone(p.x, p.y)) p.pvpGraceMs = 5000
  else if (p.pvpGraceMs > 0) p.pvpGraceMs -= dtMs
  if (dx > 0.01) p.facing = 1
  else if (dx < -0.01) p.facing = -1
}

// ── Casting ─────────────────────────────────────────────────────────────────

function handleCasts(world: WorldState, p: PlayerState, input: InputCommand, rng: RNG) {
  if (input.castBolt) castBolt(world, p, input)
  if (input.castArcane) castArcane(world, p, rng)
  if (input.castNova) castNova(world, p)
  if (input.castBlizzard) castBlizzard(world, p, input)
}

function knows(p: PlayerState, spell: string) { return spell === 'bolt' || p.learnedSpells.includes(spell) }

function castBolt(world: WorldState, p: PlayerState, input: InputCommand) {
  const fire = p.activeBolt === 'fire'
  const cdKey = fire ? 'firebolt' : 'frostbolt'
  const cost = fire ? fireboltCost(p) : frostboltCost(p)
  if (p.cd[cdKey] > 0 || p.stats.mana < cost) return

  p.stats.mana -= cost
  p.cd[cdKey] = fire ? fireboltCooldownMax(p) : frostboltCooldownMax(p)
  p.castMs = 400

  const a = Math.atan2(input.aim.y - p.y, input.aim.x - p.x)
  const spd = fire ? FIRE_SPEED : FROST_SPEED
  world.projectiles.push({
    id: world.nextProjId++, owner: 'player', ownerId: p.id, kind: fire ? 'firebolt' : 'frostbolt',
    x: p.x, y: p.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
    damage: effSpellDamage(p), lifeMs: BOLT_LIFE, radius: 7,
  })
  world.events.push({ type: 'cast', kind: p.activeBolt, x: p.x, y: p.y })
}

function castArcane(world: WorldState, p: PlayerState, rng: RNG) {
  if (!knows(p, 'arcaneBlast')) { world.events.push({ type: 'spellGated', pid: p.id, spell: 'arcaneBlast', level: SPELL_TRAIN_LEVEL.arcaneBlast }); return }
  const cost = spellCost(p, Balance.spells.arcaneBlast.manaCost)
  if (p.cd.arcaneBlast > 0 || p.stats.mana < cost) return
  p.stats.mana -= cost
  p.cd.arcaneBlast = fireboltCooldownMax(p)
  p.castMs = 400

  const radius = Math.round(Balance.spells.arcaneBlast.radius * talentBonus.aoeMult(p.talentRanks))
  const dmg = Math.round(Balance.spells.arcaneBlast.baseDamage + talentBonus.arcExDamage(p.talentRanks) + effSpellDamage(p) * 0.5)
  world.events.push({ type: 'aoe', kind: 'arcane', x: p.x, y: p.y, radius })
  damageInRadius(world, p, p.x, p.y, radius, dmg, false, rng)
  damagePlayersInRadius(world, p.id, p.x, p.y, radius, dmg, false)
}

function castNova(world: WorldState, p: PlayerState) {
  if (!knows(p, 'frostNova')) { world.events.push({ type: 'spellGated', pid: p.id, spell: 'frostNova', level: SPELL_TRAIN_LEVEL.frostNova }); return }
  const cost = spellCost(p, Balance.spells.frostNova.manaCost)
  if (p.cd.frostNova > 0 || p.stats.mana < cost) return
  p.stats.mana -= cost
  p.cd.frostNova = applyCDR(p, Balance.spells.frostNova.cooldownMs)
  p.castMs = 400

  const radius = Math.round(Balance.spells.frostNova.radius * talentBonus.aoeMult(p.talentRanks))
  const freezeMs = Balance.spells.frostNova.freezeMs + talentBonus.freezeMs(p.talentRanks)
  const pz = zoneName(p.x, p.y)
  world.events.push({ type: 'aoe', kind: 'nova', x: p.x, y: p.y, radius })
  for (const e of world.enemies) {
    if (e.dying || zoneName(e.x, e.y) !== pz) continue
    if (dist(p.x, p.y, e.x, e.y) > radius) continue
    e.frozenMs = Math.max(e.frozenMs, freezeMs)
    e.aiState = 'chase'; e.vx = 0; e.vy = 0
    world.events.push({ type: 'freeze', x: e.x, y: e.y })
  }
  // PvP: roots other players caught in the nova.
  for (const v of world.players) {
    if (v.id === p.id || v.dead || inSafeZone(v.x, v.y)) continue
    if (dist(p.x, p.y, v.x, v.y) > radius) continue
    v.frozenMs = Math.max(v.frozenMs, freezeMs)
    world.events.push({ type: 'freeze', x: v.x, y: v.y })
  }
}

function castBlizzard(world: WorldState, p: PlayerState, input: InputCommand) {
  if (!knows(p, 'blizzard')) { world.events.push({ type: 'spellGated', pid: p.id, spell: 'blizzard', level: SPELL_TRAIN_LEVEL.blizzard }); return }
  const cost = spellCost(p, Balance.spells.blizzard.manaCost)
  if (p.cd.blizzard > 0 || p.stats.mana < cost) return
  p.stats.mana -= cost
  p.cd.blizzard = applyCDR(p, Balance.spells.blizzard.cooldownMs)
  p.castMs = 400

  const radius = Math.round(Balance.spells.blizzard.radius * talentBonus.aoeMult(p.talentRanks))
  world.grounds.push({
    id: world.nextProjId++, kind: 'blizzard', ownerId: p.id, spellDamage: effSpellDamage(p),
    x: input.aim.x, y: input.aim.y, radius,
    tickTimer: 0, durationMs: Balance.spells.blizzard.durationMs,
    zoneName: zoneName(p.x, p.y),
  })
  world.events.push({ type: 'aoe', kind: 'blizzard', x: input.aim.x, y: input.aim.y, radius })
}

// ── Areas of effect ───────────────────────────────────────────────────────────

function damageInRadius(world: WorldState, caster: PlayerState, cx: number, cy: number, radius: number, dmg: number, frost: boolean, rng: RNG) {
  const pz = zoneName(caster.x, caster.y)
  const perma = talentBonus.permafrost(caster.talentRanks)
  for (const e of [...world.enemies]) {
    if (e.dying || zoneName(e.x, e.y) !== pz) continue
    if (dist(cx, cy, e.x, e.y) > radius) continue
    const wasFrozen = e.frozenMs > 0
    let d = dmg
    if (perma && wasFrozen) d = Math.round(d * 1.25)
    const crit = rng.next() < critChance(caster)
    if (crit) d = Math.round(d * critMult(caster))
    world.events.push({ type: 'enemyHit', x: e.x, y: e.y, damage: d, crit, frost: frost || wasFrozen })
    e.hp = Math.max(0, e.hp - d)
    e.hitFlashMs = 160
    if (e.hp <= 0) killEnemy(world, e, caster.id, rng)
  }
}

function updateGrounds(world: WorldState, dtMs: number, rng: RNG) {
  const { tickDamage, tickMs, slowMult, slowDurationMs } = Balance.spells.blizzard
  const survivors: GroundEffectState[] = []
  for (const g of world.grounds) {
    g.durationMs -= dtMs
    g.tickTimer -= dtMs
    if (g.tickTimer <= 0) {
      g.tickTimer = tickMs
      const dmg = Math.round(tickDamage + g.spellDamage * 0.4)
      for (const e of [...world.enemies]) {
        if (e.dying || zoneName(e.x, e.y) !== g.zoneName) continue
        if (dist(g.x, g.y, e.x, e.y) > g.radius) continue
        e.slowMult = Math.min(e.slowMult, slowMult)
        e.slowMs = Math.max(e.slowMs, slowDurationMs)
        world.events.push({ type: 'enemyHit', x: e.x, y: e.y, damage: dmg, crit: false, frost: true })
        e.hp = Math.max(0, e.hp - dmg)
        e.hitFlashMs = 120
        if (e.hp <= 0) killEnemy(world, e, g.ownerId, rng)
      }
      // PvP: blizzard also damages + chills enemy players standing in it.
      damagePlayersInRadius(world, g.ownerId, g.x, g.y, g.radius, dmg, true)
    }
    if (g.durationMs > 0) survivors.push(g)
  }
  world.grounds = survivors
}

// ── Projectiles ─────────────────────────────────────────────────────────────

function updateProjectiles(world: WorldState, dt: number, dtMs: number, rng: RNG) {
  const b = world.bounds
  const survivors: ProjectileState[] = []
  for (const proj of world.projectiles) {
    proj.x += proj.vx * dt
    proj.y += proj.vy * dt
    proj.lifeMs -= dtMs
    if (proj.lifeMs <= 0 || proj.x < b.x || proj.x > b.x + b.w || proj.y < b.y || proj.y > b.y + b.h) continue

    if (proj.owner === 'player') {
      let hit = false
      for (const e of world.enemies) {
        if (e.dying) continue
        if (dist(proj.x, proj.y, e.x, e.y) <= proj.radius + e.cfg.radius) { hitEnemy(world, e, proj, rng); hit = true; break }
      }
      // PvP: a player bolt can hit another player.
      if (!hit) {
        for (const v of world.players) {
          if (v.id === proj.ownerId || v.dead || inSafeZone(v.x, v.y)) continue
          if (dist(proj.x, proj.y, v.x, v.y) <= proj.radius + PLAYER_RADIUS) {
            const frost = proj.kind === 'frostbolt'
            world.events.push({ type: 'impact', kind: frost ? 'frost' : 'fire', x: v.x, y: v.y })
            damagePlayer(world, proj.ownerId, v, proj.damage, frost)
            hit = true
            break
          }
        }
      }
      if (hit) continue
    } else {
      let hit = false
      for (const p of world.players) {
        if (p.dead) continue
        if (dist(proj.x, proj.y, p.x, p.y) <= proj.radius + PLAYER_RADIUS) {
          const dmg = Math.round(proj.damage * (1 - talentBonus.damageReduction(p.talentRanks)))
          p.stats.hp = Math.max(0, p.stats.hp - dmg)
          p.hurtMs = 160
          world.events.push({ type: 'playerHit', pid: p.id, x: p.x, y: p.y, damage: dmg })
          hit = true
          break
        }
      }
      if (hit) continue
    }
    survivors.push(proj)
  }
  world.projectiles = survivors
}

function hitEnemy(world: WorldState, e: EnemyState, proj: ProjectileState, rng: RNG) {
  const owner = playerById(world, proj.ownerId)
  const frost = proj.kind === 'frostbolt'
  const wasFrozen = e.frozenMs > 0
  let dmg = proj.damage

  // Permafrost: frozen enemies take +25%.
  if (owner && wasFrozen && talentBonus.permafrost(owner.talentRanks)) dmg = Math.round(dmg * 1.25)
  // Crit.
  const crit = owner ? rng.next() < critChance(owner) : false
  if (crit && owner) dmg = Math.round(dmg * critMult(owner))

  world.events.push({ type: 'impact', kind: frost ? 'frost' : 'fire', x: e.x, y: e.y })
  world.events.push({ type: 'enemyHit', x: e.x, y: e.y, damage: dmg, crit, frost })

  for (const nearby of world.enemies) {
    if (nearby === e || nearby.dying) continue
    if (dist(e.x, e.y, nearby.x, nearby.y) <= Balance.aggro.chainRadius) { nearby.aiState = 'chase'; nearby.wanderTarget = null }
  }

  if (frost) {
    const { slowMult, slowDurationMs } = Balance.spells.frostbolt
    e.slowMult = Math.min(e.slowMult, slowMult)
    e.slowMs = Math.max(e.slowMs, slowDurationMs)
  }
  if (owner) {
    // Chilling Touch: bolt hits chill the target.
    const chill = talentBonus.chillSlowMult(owner.talentRanks)
    if (chill > 0) { e.slowMult = Math.min(e.slowMult, chill); e.slowMs = Math.max(e.slowMs, talentBonus.chillDurationMs(owner.talentRanks)) }
    // Ignite: fire bolts apply a burn DoT.
    if (!frost && talentBonus.igniteRank(owner.talentRanks) > 0) applyBurn(e, owner)
  }

  e.hp = Math.max(0, e.hp - dmg)
  e.hitFlashMs = 160
  if (e.hp <= 0) killEnemy(world, e, proj.ownerId, rng)
}

function applyBurn(e: EnemyState, owner: PlayerState) {
  e.burning = true
  e.burnTicksLeft = 4
  e.burnTickTimer = 500
  e.burnDmg = talentBonus.igniteDmg(owner.talentRanks)
  e.burnOwnerId = owner.id
}

function tickBurn(world: WorldState, e: EnemyState, dtMs: number, rng: RNG) {
  if (!e.burning || e.burnTicksLeft <= 0) return
  e.burnTickTimer -= dtMs
  if (e.burnTickTimer > 0) return
  e.burnTickTimer = 500
  e.burnTicksLeft--
  world.events.push({ type: 'enemyHit', x: e.x, y: e.y, damage: e.burnDmg, crit: false, frost: false })
  e.hp = Math.max(0, e.hp - e.burnDmg)
  if (e.burnTicksLeft <= 0) e.burning = false
  if (e.hp <= 0) killEnemy(world, e, e.burnOwnerId, rng)
}

// ── Kills + loot ──────────────────────────────────────────────────────────────

// ── Boss attacks ───────────────────────────────────────────────────────────

function tickBoss(world: WorldState, e: EnemyState, dtMs: number) {
  const boss = BOSS_BY_KEY[e.bossKey]
  if (!boss) return
  const enrage = e.hp / e.maxHp < 0.30 ? 0.55 : 1   // attacks faster when low

  // Resolve a slam in progress (telegraph → impact).
  if (e.slamMs > 0) {
    e.vx = 0; e.vy = 0
    e.slamMs -= dtMs
    if (e.slamMs <= 0) {
      e.slamMs = 0
      world.events.push({ type: 'bossSlam', x: e.x, y: e.y, radius: boss.slamRadius })
      for (const p of world.players) {
        if (p.dead) continue
        if (dist(e.x, e.y, p.x, p.y) <= boss.slamRadius) damagePlayerPvE(world, p, boss.slamDamage)
      }
    }
    return
  }

  if (e.slamCd > 0) e.slamCd -= dtMs
  if (e.spreadCd > 0) e.spreadCd -= dtMs

  let target: PlayerState | null = null, td = Infinity
  for (const p of world.players) { if (p.dead) continue; const d = dist(e.x, e.y, p.x, p.y); if (d < td) { td = d; target = p } }
  if (!target) return

  if (e.slamCd <= 0 && td <= boss.slamRadius * 1.2) {
    e.slamMs = 850; e.slamCd = boss.slamCooldownMs * enrage; e.vx = 0; e.vy = 0
    return
  }
  if (e.spreadCd <= 0 && td <= boss.aggroRange) {
    e.spreadCd = boss.spreadCooldownMs * enrage
    const baseA = Math.atan2(target.y - e.y, target.x - e.x)
    const arc = 0.5, n = boss.spreadCount
    for (let i = 0; i < n; i++) {
      const a = baseA + (i - (n - 1) / 2) * (arc / Math.max(1, n - 1))
      world.projectiles.push({
        id: world.nextProjId++, owner: 'enemy', kind: 'wraith_bolt',
        x: e.x, y: e.y, vx: Math.cos(a) * boss.spreadSpeed, vy: Math.sin(a) * boss.spreadSpeed,
        damage: boss.spreadDamage, lifeMs: 3000, radius: 6,
      })
    }
  }
}

function damagePlayerPvE(world: WorldState, p: PlayerState, raw: number) {
  const dmg = Math.round(raw * (1 - talentBonus.damageReduction(p.talentRanks)))
  p.stats.hp = Math.max(0, p.stats.hp - dmg)
  p.hurtMs = 160
  world.events.push({ type: 'playerHit', pid: p.id, x: p.x, y: p.y, damage: dmg })
}

function updateBossRespawns(world: WorldState, dtMs: number) {
  if (world.bossRespawns.length === 0) return
  const still: typeof world.bossRespawns = []
  for (const b of world.bossRespawns) {
    b.timer -= dtMs
    if (b.timer <= 0) spawnBoss(world, b.key, b.x, b.y)
    else still.push(b)
  }
  world.bossRespawns = still
}

function killEnemy(world: WorldState, e: EnemyState, killerId: string | undefined, rng: RNG) {
  if (e.dying) return
  const killer = playerById(world, killerId)
  if (e.isBoss) world.bossRespawns.push({ key: e.bossKey, x: e.homeX, y: e.homeY, timer: BOSS_RESPAWN_MS })

  const aggroed = world.enemies.filter(o => o !== e && !o.dying && o.aiState === 'chase').length
  const mult = 1 + aggroed * Balance.xp.multikillBonus
  const xp = Math.round(e.cfg.xpReward * mult)

  if (killer) {
    const leveled = gainXP(killer, xp)
    if (leveled) { world.events.push({ type: 'levelUp', pid: killer.id, level: killer.stats.level }); regenShopStock(killer) }
    // Flashpoint: killing a burning enemy resets the killer's Firebolt cooldown.
    if (e.burning && talentBonus.flashpoint(killer.talentRanks)) killer.cd.firebolt = 0
    // Bounty progress.
    if (questOnKill(killer)) world.events.push({ type: 'feat', name: killer.name, text: 'completed a bounty!' })
  }
  world.events.push({ type: 'enemyDeath', x: e.x, y: e.y, color: e.cfg.color, xp, mult })
  if (e.cfg.rare) {
    world.events.push({ type: 'rareSlain', label: e.cfg.label ?? e.cfg.key })
    if (killer) world.events.push({ type: 'feat', name: killer.name, text: `slew ${e.cfg.label ?? e.cfg.key}` })
  }

  dropLoot(world, e, killer, rng)
  e.dying = true; e.deathMs = 340; e.vx = 0; e.vy = 0

  if (world.timeMs - world.lastKillMs < 2500) world.killStreak++
  else world.killStreak = 1
  world.lastKillMs = world.timeMs

  const zone = world.zones[e.zoneId]
  if (zone) { zone.count--; zone.respawnTimers.push(rng.int(RESPAWN_MIN, RESPAWN_MAX)) }
}

function dropLoot(world: WorldState, e: EnemyState, killer: PlayerState | null, rng: RNG) {
  const B = Balance.loot
  const lvl = killer ? killer.stats.level : 1
  if (e.cfg.guaranteedDrop) {
    const goldMult = e.cfg.lootMultiplier ?? 2
    const epicChance = e.cfg.rare ? 0.55 : 0.30
    const rarity = rng.next() < epicChance ? 'epic' : 'rare'
    addLoot(world, e.x - 14, e.y, generateItem(rng, lvl, rarity))
    if (e.cfg.rare) addLoot(world, e.x, e.y - 14, generateItem(rng, lvl, 'rare'))
    addLoot(world, e.x + 14, e.y, undefined, generateGold(rng, lvl) * goldMult)
    return
  }
  if (rng.next() < B.itemDropChance) addLoot(world, e.x + rng.int(-18, 18), e.y + rng.int(-18, 18), generateItem(rng, lvl))
  if (rng.next() < B.goldDropChance) addLoot(world, e.x + rng.int(-18, 18), e.y + rng.int(-18, 18), undefined, generateGold(rng, lvl))
}

function addLoot(world: WorldState, x: number, y: number, item?: Item, gold?: number) {
  world.loot.push({ id: world.nextLootId++, x, y, item, gold, ageMs: 0 })
  world.events.push({ type: 'loot', x, y, item, gold })
}

function updateLoot(world: WorldState, dtMs: number) {
  const survivors = []
  for (const drop of world.loot) {
    drop.ageMs += dtMs
    // Nearest living player within range grabs it.
    let taker: PlayerState | null = null
    let bestD = 34
    for (const p of world.players) {
      if (p.dead) continue
      const d = dist(drop.x, drop.y, p.x, p.y)
      if (d < bestD) { bestD = d; taker = p }
    }
    if (taker) {
      if (drop.gold !== undefined) { taker.gold += drop.gold; world.events.push({ type: 'pickup', pid: taker.id, x: drop.x, y: drop.y, gold: drop.gold }); continue }
      if (drop.item) {
        if (taker.inventory.length >= taker.inventoryCap) { survivors.push(drop); continue }
        taker.inventory.push(drop.item)
        world.events.push({ type: 'pickup', pid: taker.id, x: drop.x, y: drop.y, item: drop.item })
        continue
      }
    }
    survivors.push(drop)
  }
  world.loot = survivors
}

function updateRespawns(world: WorldState, dtMs: number, rng: RNG) {
  for (const zone of world.zones) {
    if (zone.respawnTimers.length === 0) continue
    const still: number[] = []
    for (let t of zone.respawnTimers) {
      t -= dtMs
      if (t <= 0) { if (zone.count < zone.maxEnemies) spawnFromZone(world, zone, rng) }
      else still.push(t)
    }
    zone.respawnTimers = still
  }
}

/** Grid-based separation so ~500 enemies don't cost O(n²) each tick. */
function separateEnemies(world: WorldState) {
  const cell = 96
  const grid = new Map<number, EnemyState[]>()
  const key = (cx: number, cy: number) => cx * 100000 + cy
  for (const e of world.enemies) {
    if (e.dying) continue
    const cx = Math.floor(e.x / cell), cy = Math.floor(e.y / cell)
    const k = key(cx, cy)
    let bucket = grid.get(k)
    if (!bucket) { bucket = []; grid.set(k, bucket) }
    bucket.push(e)
  }
  for (const e of world.enemies) {
    if (e.dying) continue
    const cx = Math.floor(e.x / cell), cy = Math.floor(e.y / cell)
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const bucket = grid.get(key(cx + ox, cy + oy))
      if (!bucket) continue
      for (const o of bucket) {
        if (o === e || o.dying || o.id < e.id) continue
        const minD = e.cfg.radius + o.cfg.radius
        const dx = o.x - e.x, dy = o.y - e.y
        const d = Math.hypot(dx, dy) || 0.001
        if (d < minD) {
          const push = (minD - d) / 2
          const nx = dx / d, ny = dy / d
          e.x -= nx * push; e.y -= ny * push
          o.x += nx * push; o.y += ny * push
        }
      }
    }
  }
}

function respawn(world: WorldState, p: PlayerState) {
  p.dead = false
  p.stats.hp = p.stats.maxHp
  p.stats.mana = effMaxMana(p)
  p.manaRegenAccum = 0
  p.x = STARTER_X; p.y = STARTER_Y
  world.events.push({ type: 'respawn', pid: p.id })
}
