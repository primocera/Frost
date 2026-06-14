/// <reference types="@cloudflare/workers-types" />
import { createWorld, addPlayer, removePlayer, tick } from '../sim/world'
import { serialize, selfOf } from '../sim/snapshot'
import { equipItem, unequipItem, dropItem } from '../sim/inventory'
import { spendTalent } from '../sim/talents'
import { trainSpell, buyShopItem, sellItem, regenShopStock } from '../sim/shop'
import { acceptQuest, claimQuest } from '../sim/quest'
import { stashDeposit, stashWithdraw } from '../sim/stash'
import { extractSave, applySave, SavedPlayer } from '../sim/persistence'
import { emptyInput, InputCommand, ClientMessage, WorldState } from '../sim/types'

const TICK_HZ = 30
const DT = 1 / TICK_HZ
const SAVE_EVERY_TICKS = 600   // ~20s

interface Env { FROST_ROOM: DurableObjectNamespace }

/**
 * One authoritative shared world per room, as a Cloudflare Durable Object.
 * Runs the sim at 30 Hz, broadcasts snapshots, and persists each player's
 * progression to the DO's built-in SQLite storage (keyed by a stable per-browser
 * id) so characters survive disconnects.
 */
export class FrostRoom {
  private world: WorldState
  private inputs: Record<string, InputCommand> = {}
  private sockets = new Map<string, WebSocket>()
  private pids = new Map<string, string>()   // connection id -> persistent save id
  private timer: ReturnType<typeof setInterval> | null = null
  private ticks = 0

  constructor(private state: DurableObjectState, _env: Env) {
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

    server.addEventListener('message', (ev) => { void this.onMessage(id, server, ev.data as string) })
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
    // Announce milestones from this tick's events as system chat.
    for (const ev of this.world.events) {
      if (ev.type === 'levelUp') {
        const p = this.world.players.find(pl => pl.id === ev.pid)
        if (p) this.sysChat(`${p.name} reached level ${ev.level}`)
      } else if (ev.type === 'feat') {
        this.sysChat(`${ev.name} ${ev.text}`)
      }
    }

    const snap = JSON.stringify({ t: 'snap', s: serialize(this.world) })
    for (const ws of this.sockets.values()) safeSend(ws, snap)

    this.ticks++
    if (this.ticks % 10 === 0) {
      for (const [id, ws] of this.sockets) {
        const p = this.world.players.find(pl => pl.id === id)
        if (p) safeSend(ws, JSON.stringify({ t: 'self', self: selfOf(p) }))
      }
    }
    if (this.ticks % SAVE_EVERY_TICKS === 0) this.saveAll()
  }

  private async onMessage(id: string, ws: WebSocket, raw: string) {
    let msg: ClientMessage
    try { msg = JSON.parse(raw) } catch { return }

    if (msg.t === 'join') {
      const pid = msg.pid || id
      this.pids.set(id, pid)
      const player = addPlayer(this.world, id, msg.name || 'Mage')
      const saved = await this.state.storage.get<SavedPlayer>('p:' + pid)
      if (saved) { applySave(player, saved); regenShopStock(player) }   // stock for loaded level
      safeSend(ws, JSON.stringify({ t: 'welcome', id }))
      this.sysChat(`${player.name} joined the world`)
      return
    }

    const player = this.world.players.find(p => p.id === id)
    if (msg.t === 'equip') {
      if (player) equipItem(player, msg.itemId)
    } else if (msg.t === 'unequip') {
      if (player) unequipItem(player, msg.slot)
    } else if (msg.t === 'talent') {
      if (player) spendTalent(player, msg.id)
    } else if (msg.t === 'train') {
      if (player) trainSpell(player, msg.spell)
    } else if (msg.t === 'buy') {
      if (player) buyShopItem(player, msg.idx)
    } else if (msg.t === 'questAccept') {
      if (player) acceptQuest(player)
    } else if (msg.t === 'questClaim') {
      if (player) claimQuest(player)
    } else if (msg.t === 'stashDeposit') {
      if (player) stashDeposit(player, msg.itemId)
    } else if (msg.t === 'stashWithdraw') {
      if (player) stashWithdraw(player, msg.itemId)
    } else if (msg.t === 'drop') {
      if (player) dropItem(player, msg.itemId)
    } else if (msg.t === 'sell') {
      if (player) sellItem(player, msg.itemId)
    } else if (msg.t === 'chat') {
      const text = String(msg.text).slice(0, 200).trim()
      if (player && text) {
        const out = JSON.stringify({ t: 'chat', from: player.name, text })
        for (const sock of this.sockets.values()) safeSend(sock, out)
      }
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
    this.savePlayer(id)
    this.pids.delete(id)
    removePlayer(this.world, id)
    delete this.inputs[id]
    this.sockets.delete(id)
    if (this.sockets.size === 0 && this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private sysChat(text: string) {
    const out = JSON.stringify({ t: 'chat', from: '', text, sys: true })
    for (const ws of this.sockets.values()) safeSend(ws, out)
  }

  private savePlayer(id: string) {
    const pid = this.pids.get(id)
    const p = this.world.players.find(pl => pl.id === id)
    if (pid && p) void this.state.storage.put('p:' + pid, extractSave(p))
  }

  private saveAll() {
    for (const id of this.pids.keys()) this.savePlayer(id)
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
