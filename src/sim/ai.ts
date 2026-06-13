import Balance from './balance'
import { RNG } from './rng'
import { talentBonus } from './talents'
import { EnemyState, PlayerState, WorldState } from './types'

const TAU = Math.PI * 2
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(bx - ax, by - ay)
const angle = (ax: number, ay: number, bx: number, by: number) => Math.atan2(by - ay, bx - ax)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * Pure port of entities/Enemy.update + its AI helpers. Sets e.vx/e.vy (px/s);
 * the world tick integrates position. Tween-driven charge/telegraph become
 * explicit timer state machines so the logic stays deterministic and serializable.
 */
export function updateEnemy(
  e: EnemyState, players: PlayerState[], allies: EnemyState[], world: WorldState, dtMs: number, rng: RNG,
) {
  if (e.dying) return

  // Target the nearest living player; if none, just wander.
  const p = nearestPlayer(e, players)
  if (!p) { doWander(e, dtMs, rng); return }

  if (e.attackCd > 0) e.attackCd -= dtMs
  if (e.rangedCd > 0) e.rangedCd -= dtMs
  if (e.hitFlashMs > 0) e.hitFlashMs -= dtMs

  const vx = e.vx
  if (vx > 6) e.facing = 1
  else if (vx < -6) e.facing = -1

  // ── Charge state machine (elite) ──────────────────────────────────────────
  if (e.chargePhase === 'windup') {
    e.vx = 0; e.vy = 0
    e.chargeTimer -= dtMs
    if (e.chargeTimer <= 0) {
      const a = angle(e.x, e.y, p.x, p.y)
      e.chargeDir = { x: Math.cos(a), y: Math.sin(a) }
      e.chargePhase = 'charging'
      e.chargeTimer = e.cfg.chargeMs ?? 650
    }
    return
  }
  if (e.chargePhase === 'charging') {
    const spd = e.cfg.speed * (e.cfg.chargeMult ?? 3.5)
    e.vx = e.chargeDir.x * spd
    e.vy = e.chargeDir.y * spd
    e.chargeTimer -= dtMs
    if (e.chargeTimer <= 0) {
      e.chargePhase = 'none'
      e.chargeCd = e.cfg.chargeCooldownMs ?? 6000
    }
    return
  }

  // ── Telegraph state machine (tank) ──────────────────────────────────────────
  if (e.telegraphing) {
    e.vx = 0; e.vy = 0
    e.telegraphTimer -= dtMs
    if (e.telegraphTimer <= 0) {
      e.telegraphing = false
      const d = dist(e.x, e.y, p.x, p.y)
      if (d <= e.cfg.attackRange * 1.8 && !p.dead) hitPlayer(e, p, world)
    }
    return
  }

  if (e.cfg.chargeCooldownMs && e.chargeCd > 0 && e.frozenMs <= 0) e.chargeCd -= dtMs

  if (e.frozenMs > 0) {
    e.frozenMs -= dtMs
    e.vx = 0; e.vy = 0
    return
  }
  if (e.slowMs > 0) {
    e.slowMs -= dtMs
    if (e.slowMs <= 0) { e.slowMs = 0; e.slowMult = 1 }
  }

  const d = dist(e.x, e.y, p.x, p.y)
  const inZone = isInZone(e, p.x, p.y)

  if (d < e.cfg.aggroRange && inZone) e.aiState = 'chase'
  else if (e.aiState === 'chase' && d > e.cfg.aggroRange * 1.4) { e.aiState = 'wander'; e.wanderTarget = null }
  if (e.aiState === 'chase' && !inZone) { e.aiState = 'wander'; e.wanderTarget = null }

  if (e.aiState === 'chase' && dist(e.x, e.y, e.homeX, e.homeY) > 850) {
    e.aiState = 'wander'; e.wanderTarget = null
  }

  // Zone boundary leash
  if (e.homeZone) {
    const z = e.homeZone
    const outside = e.x < z.x - 80 || e.x > z.x + z.w + 80 || e.y < z.y - 80 || e.y > z.y + z.h + 80
    if (outside) {
      e.aiState = 'wander'; e.wanderTarget = null
      const rx = clamp(e.x, z.x, z.x + z.w)
      const ry = clamp(e.y, z.y, z.y + z.h)
      const ra = angle(e.x, e.y, rx, ry)
      e.vx = Math.cos(ra) * e.cfg.speed * 0.6
      e.vy = Math.sin(ra) * e.cfg.speed * 0.6
      return
    }
  }

  if (e.aiState === 'chase') { doChase(e, d, p, allies, world, rng); return }
  doWander(e, dtMs, rng)
}

function doChase(
  e: EnemyState, d: number, p: PlayerState, allies: EnemyState[], world: WorldState, rng: RNG,
) {
  if (e.cfg.aiType === 'ranged') { doChaseRanged(e, d, p, world); return }

  if (e.cfg.aiType === 'elite' && e.chargeCd <= 0 && e.chargePhase === 'none') {
    e.chargePhase = 'windup'
    e.chargeTimer = 520
    e.chargeCd = Infinity
    e.vx = 0; e.vy = 0
    return
  }

  const speed = e.cfg.speed * e.slowMult

  if (d > e.cfg.attackRange) {
    const a = angle(e.x, e.y, p.x, p.y)
    let vx = Math.cos(a) * speed
    let vy = Math.sin(a) * speed

    // Sine-wave weave (unique per enemy)
    const weavePhase = (e.homeX + e.homeY) * 0.003
    const perpDrift = Math.sin(world.timeMs * 0.0015 + weavePhase) * 0.22
    const perp = a + Math.PI / 2
    vx += Math.cos(perp) * speed * perpDrift
    vy += Math.sin(perp) * speed * perpDrift

    // Soft flocking toward nearby chasing allies
    const { flockRadius, flockWeight } = Balance.mob
    let cx = 0, cy = 0, count = 0
    for (const ally of allies) {
      if (ally === e || ally.dying || ally.aiState !== 'chase') continue
      if (dist(e.x, e.y, ally.x, ally.y) < flockRadius) { cx += ally.x; cy += ally.y; count++ }
    }
    if (count > 0) {
      cx /= count; cy /= count
      const fa = angle(e.x, e.y, cx, cy)
      vx = vx * (1 - flockWeight) + Math.cos(fa) * speed * flockWeight
      vy = vy * (1 - flockWeight) + Math.sin(fa) * speed * flockWeight
    }
    e.vx = vx; e.vy = vy
  } else {
    e.vx = 0; e.vy = 0
    if (e.attackCd <= 0) {
      if (e.cfg.aiType === 'tank' && e.cfg.telegraphMs) {
        e.telegraphing = true
        e.telegraphTimer = e.cfg.telegraphMs
        e.attackCd = e.cfg.attackRate
      } else {
        e.attackCd = e.cfg.attackRate
        hitPlayer(e, p, world)
      }
    }
  }
  void rng
}

function doChaseRanged(e: EnemyState, d: number, p: PlayerState, world: WorldState) {
  const preferred = e.cfg.projectileRange ?? 260
  const backstep = 110
  const speed = e.cfg.speed * e.slowMult

  if (d < backstep) {
    const a = angle(p.x, p.y, e.x, e.y)
    e.vx = Math.cos(a) * speed; e.vy = Math.sin(a) * speed
  } else if (d > preferred * 1.15) {
    const a = angle(e.x, e.y, p.x, p.y)
    e.vx = Math.cos(a) * speed * 0.65; e.vy = Math.sin(a) * speed * 0.65
  } else {
    const toP = angle(e.x, e.y, p.x, p.y)
    const sign = Math.sin(world.timeMs * 0.0008 + (e.homeX + e.homeY) * 0.002) > 0 ? 1 : -1
    const perp = toP + (Math.PI / 2) * sign
    e.vx = Math.cos(perp) * speed * 0.5; e.vy = Math.sin(perp) * speed * 0.5
    if (e.rangedCd <= 0) { e.rangedCd = 2400; shoot(e, p, world) }
  }
}

function shoot(e: EnemyState, p: PlayerState, world: WorldState) {
  // Cap active enemy bolts so ranged packs can't flood the screen.
  if (world.projectiles.filter(b => b.owner === 'enemy').length >= 10) return
  const a = angle(e.x, e.y, p.x, p.y)
  const spd = e.cfg.projectileSpeed ?? 230
  world.projectiles.push({
    id: world.nextProjId++, owner: 'enemy',
    kind: e.cfg.projectileTex ?? 'wraith_bolt',
    x: e.x, y: e.y,
    vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
    damage: e.cfg.projectileDamage ?? 12, lifeMs: 3000, radius: 5,
  })
}

function doWander(e: EnemyState, dtMs: number, rng: RNG) {
  if (e.wanderIdleMs > 0) { e.wanderIdleMs -= dtMs; e.vx = 0; e.vy = 0; return }
  if (!e.wanderTarget) { pickWander(e, rng); return }

  const d = dist(e.x, e.y, e.wanderTarget.x, e.wanderTarget.y)
  if (d < 8) {
    e.wanderTarget = null
    e.wanderIdleMs = rng.int(e.cfg.idleTime[0], e.cfg.idleTime[1])
    e.vx = 0; e.vy = 0
  } else {
    const a = angle(e.x, e.y, e.wanderTarget.x, e.wanderTarget.y)
    const s = e.cfg.speed * e.slowMult * 0.35
    e.vx = Math.cos(a) * s; e.vy = Math.sin(a) * s
  }
}

function pickWander(e: EnemyState, rng: RNG) {
  const a = rng.next() * TAU
  const r = rng.int(30, e.cfg.wanderRadius)
  let tx = e.homeX + Math.cos(a) * r
  let ty = e.homeY + Math.sin(a) * r
  if (e.homeZone) {
    const z = e.homeZone
    tx = clamp(tx, z.x + 60, z.x + z.w - 60)
    ty = clamp(ty, z.y + 60, z.y + z.h - 60)
  }
  e.wanderTarget = { x: tx, y: ty }
}

function isInZone(e: EnemyState, wx: number, wy: number): boolean {
  if (!e.homeZone) return true
  const z = e.homeZone
  return wx >= z.x && wx < z.x + z.w && wy >= z.y && wy < z.y + z.h
}

function hitPlayer(e: EnemyState, p: PlayerState, world: WorldState) {
  if (p.dead) return
  const dmg = Math.round(e.cfg.damage * (1 - talentBonus.damageReduction(p.talentRanks)))
  p.stats.hp = Math.max(0, p.stats.hp - dmg)
  p.hurtMs = 160
  world.events.push({ type: 'playerHit', pid: p.id, x: p.x, y: p.y, damage: dmg })
}

function nearestPlayer(e: EnemyState, players: PlayerState[]): PlayerState | null {
  let best: PlayerState | null = null
  let bestD = Infinity
  for (const p of players) {
    if (p.dead) continue
    const d = dist(e.x, e.y, p.x, p.y)
    if (d < bestD) { bestD = d; best = p }
  }
  return best
}
