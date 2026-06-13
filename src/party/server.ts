import type * as Party from 'partykit/server'
import { createWorld, addPlayer, removePlayer, tick } from '../sim/world'
import { serialize, selfOf } from '../sim/snapshot'
import { equipItem, unequipItem } from '../sim/inventory'
import { spendTalent } from '../sim/talents'
import { emptyInput, InputCommand, ClientMessage, WorldState } from '../sim/types'

const TICK_HZ = 30
const DT = 1 / TICK_HZ

/**
 * FrostServer — one authoritative shared world per room.
 *
 * The simulation (sim/world.tick) runs here at a fixed 30 Hz. Clients send
 * input commands; the server advances the world and broadcasts a snapshot each
 * tick. This is the source of truth for enemies, damage, loot, XP and kill
 * credit, so players can't desync or cheat.
 */
export default class FrostServer implements Party.Server {
  private world: WorldState
  private inputs: Record<string, InputCommand> = {}
  private timer: ReturnType<typeof setInterval> | null = null
  private ticks = 0

  constructor(readonly room: Party.Room) {
    this.world = createWorld(0xC0FFEE ^ hashString(room.id))
  }

  onStart() {
    this.timer = setInterval(() => this.step(), 1000 / TICK_HZ)
  }

  private step() {
    tick(this.world, this.inputs, DT)
    // Edge-triggered actions fire once, then clear (movement/aim persist).
    for (const id in this.inputs) {
      const i = this.inputs[id]
      i.swapBolt = i.castArcane = i.castNova = i.castBlizzard = false
    }
    this.room.broadcast(JSON.stringify({ t: 'snap', s: serialize(this.world) }))

    // Personal inventory/talent state to each owner ~3×/s.
    if (++this.ticks % 10 === 0) {
      for (const conn of this.room.getConnections()) {
        const p = this.world.players.find(pl => pl.id === conn.id)
        if (p) conn.send(JSON.stringify({ t: 'self', self: selfOf(p) }))
      }
    }
  }

  onMessage(raw: string, sender: Party.Connection) {
    let msg: ClientMessage
    try { msg = JSON.parse(raw) } catch { return }
    const player = this.world.players.find(p => p.id === sender.id)

    if (msg.t === 'join') {
      addPlayer(this.world, sender.id, msg.name || 'Mage')
      sender.send(JSON.stringify({ t: 'welcome', id: sender.id }))
    } else if (msg.t === 'equip') {
      if (player) equipItem(player, msg.itemId)
    } else if (msg.t === 'unequip') {
      if (player) unequipItem(player, msg.slot)
    } else if (msg.t === 'talent') {
      if (player) spendTalent(player, msg.id)
    } else if (msg.t === 'input') {
      const cur = this.inputs[sender.id] ?? emptyInput()
      cur.move = msg.cmd.move
      cur.aim = msg.cmd.aim
      cur.castBolt = msg.cmd.castBolt
      cur.pickup = msg.cmd.pickup
      // OR-accumulate edges so a press between ticks is never dropped.
      cur.swapBolt ||= msg.cmd.swapBolt
      cur.castArcane ||= msg.cmd.castArcane
      cur.castNova ||= msg.cmd.castNova
      cur.castBlizzard ||= msg.cmd.castBlizzard
      this.inputs[sender.id] = cur
    }
  }

  onClose(conn: Party.Connection) {
    removePlayer(this.world, conn.id)
    delete this.inputs[conn.id]
  }
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

FrostServer satisfies Party.Worker
