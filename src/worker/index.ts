/// <reference types="@cloudflare/workers-types" />
import { createWorld, addPlayer, removePlayer, tick } from '../sim/world'
import { serialize, selfOf } from '../sim/snapshot'
import { equipItem, unequipItem } from '../sim/inventory'
import { spendTalent } from '../sim/talents'
import { emptyInput, InputCommand, ClientMessage, WorldState } from '../sim/types'

const TICK_HZ = 30
const DT = 1 / TICK_HZ

interface Env { FROST_ROOM: DurableObjectNamespace }

/**
 * One authoritative shared world per room, as a Cloudflare Durable Object.
 * (Replaces the old PartyKit server — same sim, raw Workers API, deployable on
 * the Cloudflare free plan via a SQLite-backed DO; see wrangler.jsonc.)
 *
 * The DO runs the simulation at 30 Hz while players are connected, ingests their
 * input/actions, and broadcasts snapshots. It is the source of truth for
 * enemies, damage, loot, XP, gear and PvP.
 */
export class FrostRoom {
  private world: WorldState
  private inputs: Record<string, InputCommand> = {}
  private sockets = new Map<string, WebSocket>()
  private timer: ReturnType<typeof setInterval> | null = null
  private ticks = 0

  constructor(_state: DurableObjectState, _env: Env) {
    this.world = createWorld(0xC0FFEE)
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade') !== 'websocket') {
      return new Response('Frost game server — connect via WebSocket.', { status: 426 })
    }
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    server.accept()

    const id = crypto.randomUUID()
    this.sockets.set(id, server)

    server.addEventListener('message', (ev) => this.onMessage(id, server, ev.data as string))
    server.addEventListener('close', () => this.onClose(id))
    server.addEventListener('error', () => this.onClose(id))

    if (!this.timer) this.timer = setInterval(() => this.step(), 1000 / TICK_HZ)
    return new Response(null, { status: 101, webSocket: client })
  }

  private step() {
    tick(this.world, this.inputs, DT)
    for (const id in this.inputs) {
      const i = this.inputs[id]
      i.swapBolt = i.castArcane = i.castNova = i.castBlizzard = false
    }
    const snap = JSON.stringify({ t: 'snap', s: serialize(this.world) })
    for (const ws of this.sockets.values()) safeSend(ws, snap)

    // Personal inventory/talent state to each owner ~3×/s.
    if (++this.ticks % 10 === 0) {
      for (const [id, ws] of this.sockets) {
        const p = this.world.players.find(pl => pl.id === id)
        if (p) safeSend(ws, JSON.stringify({ t: 'self', self: selfOf(p) }))
      }
    }
  }

  private onMessage(id: string, ws: WebSocket, raw: string) {
    let msg: ClientMessage
    try { msg = JSON.parse(raw) } catch { return }
    const player = this.world.players.find(p => p.id === id)

    if (msg.t === 'join') {
      addPlayer(this.world, id, msg.name || 'Mage')
      safeSend(ws, JSON.stringify({ t: 'welcome', id }))
    } else if (msg.t === 'equip') {
      if (player) equipItem(player, msg.itemId)
    } else if (msg.t === 'unequip') {
      if (player) unequipItem(player, msg.slot)
    } else if (msg.t === 'talent') {
      if (player) spendTalent(player, msg.id)
    } else if (msg.t === 'input') {
      const cur = this.inputs[id] ?? emptyInput()
      cur.move = msg.cmd.move
      cur.aim = msg.cmd.aim
      cur.castBolt = msg.cmd.castBolt
      cur.pickup = msg.cmd.pickup
      cur.swapBolt ||= msg.cmd.swapBolt
      cur.castArcane ||= msg.cmd.castArcane
      cur.castNova ||= msg.cmd.castNova
      cur.castBlizzard ||= msg.cmd.castBlizzard
      this.inputs[id] = cur
    }
  }

  private onClose(id: string) {
    removePlayer(this.world, id)
    delete this.inputs[id]
    this.sockets.delete(id)
    // Stop the loop when the room empties (lets the DO go idle → no cost).
    if (this.sockets.size === 0 && this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}

function safeSend(ws: WebSocket, data: string) {
  try { ws.send(data) } catch { /* socket closing */ }
}

/** Worker entry: route each WebSocket connection to the room's Durable Object. */
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const room = url.searchParams.get('room') || 'frost'
    const id = env.FROST_ROOM.idFromName(room)
    return env.FROST_ROOM.get(id).fetch(req)
  },
}
