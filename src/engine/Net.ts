import { PartySocket } from 'partysocket'
import Balance from '../sim/balance'
import { hydrateEnemy, hydratePlayer } from '../sim/snapshot'
import { WORLD_W, WORLD_H } from '../sim/zones'
import {
  EnemyState, InputCommand, PlayerState, ProjectileState, ServerMessage,
  SelfState, SimEvent, Vec2, WorldState,
} from '../sim/types'
import { EquipSlot } from '../items/ItemTypes'
import { TalentId } from '../talents/TalentTypes'

export type NetStatus = 'connecting' | 'connected' | 'offline'

const PLAYER_RADIUS = 14
const LERP_RATE = 14       // position smoothing per second
const RECONCILE = 0.12     // how hard prediction is pulled toward server truth

/**
 * Networked client: connects to the PartyKit room, sends input, and turns the
 * stream of authoritative snapshots into a smoothly-interpolated render world.
 * The local player is client-side predicted (moves instantly on input) and
 * gently reconciled toward the server's position on each snapshot.
 */
export class Net {
  status: NetStatus = 'connecting'
  localId = ''
  readonly world: WorldState

  private socket: PartySocket
  private players = new Map<string, PlayerState>()
  private targets = new Map<string, Vec2>()
  private enemies = new Map<number, EnemyState>()
  private enemyTargets = new Map<number, Vec2>()
  private pending: SimEvent[] = []
  private pred: Vec2 = { x: 0, y: 0 }
  private predReady = false
  self: SelfState | null = null

  constructor(host: string, room: string, private name: string, private onStatus: (s: NetStatus) => void) {
    this.world = {
      bounds: { x: 0, y: 0, w: WORLD_W, h: WORLD_H },
      players: [], enemies: [], projectiles: [], loot: [], grounds: [], zones: [],
      timeMs: 0, rngState: 0, events: [], nextEnemyId: 0, nextProjId: 0, nextLootId: 0,
      killStreak: 0, lastKillMs: 0,
    }
    this.socket = new PartySocket({ host, room })
    this.socket.addEventListener('open', () => {
      this.setStatus('connected')
      this.socket.send(JSON.stringify({ t: 'join', name: this.name }))
    })
    this.socket.addEventListener('close', () => this.setStatus('offline'))
    this.socket.addEventListener('error', () => this.setStatus('offline'))
    this.socket.addEventListener('message', (e) => this.onMessage(e.data as string))
  }

  private setStatus(s: NetStatus) { this.status = s; this.onStatus(s) }

  private onMessage(raw: string) {
    let msg: ServerMessage
    try { msg = JSON.parse(raw) } catch { return }
    if (msg.t === 'welcome') { this.localId = msg.id; return }
    if (msg.t === 'self') { this.self = msg.self; return }
    if (msg.t === 'snap') this.applySnapshot(msg)
  }

  equip(itemId: number) { this.send({ t: 'equip', itemId }) }
  unequip(slot: EquipSlot) { this.send({ t: 'unequip', slot }) }
  buyTalent(id: TalentId) { this.send({ t: 'talent', id }) }
  private send(msg: object) { if (this.socket.readyState === 1) this.socket.send(JSON.stringify(msg)) }

  private applySnapshot(msg: Extract<ServerMessage, { t: 'snap' }>) {
    const s = msg.s
    this.world.timeMs = s.t

    // Players
    const seen = new Set<string>()
    for (const ps of s.players) {
      seen.add(ps.id)
      const existing = this.players.get(ps.id)
      const hydrated = hydratePlayer(ps)
      if (existing) {
        // Keep smoothed render position; refresh stats/flags from the snapshot.
        hydrated.x = existing.x; hydrated.y = existing.y
      }
      this.players.set(ps.id, hydrated)
      this.targets.set(ps.id, { x: ps.x, y: ps.y })
      if (ps.id === this.localId) {
        if (!this.predReady) { this.pred.x = ps.x; this.pred.y = ps.y; this.predReady = true }
        else { this.pred.x += (ps.x - this.pred.x) * RECONCILE; this.pred.y += (ps.y - this.pred.y) * RECONCILE }
      }
    }
    for (const id of [...this.players.keys()]) if (!seen.has(id)) { this.players.delete(id); this.targets.delete(id) }

    // Enemies
    const seenE = new Set<number>()
    for (const es of s.enemies) {
      seenE.add(es.id)
      const existing = this.enemies.get(es.id)
      const hy = hydrateEnemy(es)
      if (existing) { hy.x = existing.x; hy.y = existing.y; hy.facing = es.facing }
      this.enemies.set(es.id, hy)
      this.enemyTargets.set(es.id, { x: es.x, y: es.y })
    }
    for (const id of [...this.enemies.keys()]) if (!seenE.has(id)) { this.enemies.delete(id); this.enemyTargets.delete(id) }

    // Projectiles / loot / grounds: rebuilt each snapshot (projectiles dead-reckoned in update()).
    this.world.projectiles = s.projectiles.map((p): ProjectileState => ({
      id: p.id, owner: p.owner, kind: p.kind, x: p.x, y: p.y, vx: p.vx, vy: p.vy, damage: 0, lifeMs: 9999, radius: p.radius,
    }))
    this.world.loot = s.loot.map(l => ({ id: l.id, x: l.x, y: l.y, gold: l.gold, item: l.rarity ? ({ rarity: l.rarity } as any) : undefined, ageMs: 0 }))
    this.world.grounds = s.grounds.map(g => ({ id: g.id, kind: 'blizzard' as const, ownerId: '', spellDamage: 0, x: g.x, y: g.y, radius: g.radius, tickTimer: 0, durationMs: 9999, zoneName: '' }))

    for (const ev of s.events) this.pending.push(ev)
  }

  /** Smoothly advance interpolation + local prediction; call once per frame. */
  update(dt: number, move: Vec2) {
    const k = Math.min(1, dt * LERP_RATE)

    // Local player prediction
    const local = this.localId ? this.players.get(this.localId) : undefined
    if (local && this.predReady) {
      let dx = move.x, dy = move.y
      if (dx !== 0 && dy !== 0) { dx *= 0.7071; dy *= 0.7071 }
      const speed = Balance.player.baseSpeed + (local.stats.level - 1) * Balance.player.speedPerLevel
      if (!local.dead && local.frozenMs <= 0) {
        this.pred.x = clamp(this.pred.x + dx * speed * dt, PLAYER_RADIUS, WORLD_W - PLAYER_RADIUS)
        this.pred.y = clamp(this.pred.y + dy * speed * dt, PLAYER_RADIUS, WORLD_H - PLAYER_RADIUS)
      }
      local.x = this.pred.x; local.y = this.pred.y
      local.vx = dx * speed; local.vy = dy * speed
      if (dx > 0.01) local.facing = 1; else if (dx < -0.01) local.facing = -1
    }

    // Remote players + enemies lerp toward their last server position.
    for (const [id, p] of this.players) {
      if (id === this.localId) continue
      const t = this.targets.get(id); if (!t) continue
      p.x += (t.x - p.x) * k; p.y += (t.y - p.y) * k
    }
    for (const [id, e] of this.enemies) {
      const t = this.enemyTargets.get(id); if (!t) continue
      e.x += (t.x - e.x) * k; e.y += (t.y - e.y) * k
    }

    // Dead-reckon projectiles between snapshots.
    for (const proj of this.world.projectiles) { proj.x += proj.vx * dt; proj.y += proj.vy * dt }

    this.world.players = [...this.players.values()]
    this.world.enemies = [...this.enemies.values()]
  }

  sendInput(cmd: InputCommand) {
    if (this.socket.readyState === 1 /* OPEN */) this.socket.send(JSON.stringify({ t: 'input', cmd }))
  }

  drainEvents(): SimEvent[] { const e = this.pending; this.pending = []; return e }
  localPlayer(): PlayerState | undefined { return this.localId ? this.players.get(this.localId) : undefined }
  close() { this.socket.close() }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
