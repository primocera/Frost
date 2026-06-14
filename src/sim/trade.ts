import { Item } from './items'
import { TradeSession, TradeView, WorldState } from './types'

/**
 * Player-to-player trading. A trade is a small server-authoritative session: the
 * requester (a) sends a request to a nearby target (b); once b accepts, both add
 * items + gold to their offer and confirm. When BOTH have confirmed, the swap is
 * executed atomically (re-validated against current inventories first). Changing
 * an offer clears both confirmations so nobody confirms a swap they didn't see.
 */
export const TRADE_RANGE = 170          // must be this close to start a trade
const TRADE_BREAK_RANGE = 320           // wander further apart → trade auto-cancels
const MAX_OFFER_ITEMS = 8

const find = (world: WorldState, id: string) => world.players.find(p => p.id === id)

export function getTradeOf(world: WorldState, id: string): TradeSession | undefined {
  return world.trades.find(t => t.a === id || t.b === id)
}

export function requestTrade(world: WorldState, fromId: string, toId: string) {
  if (fromId === toId) return
  const a = find(world, fromId), b = find(world, toId)
  if (!a || !b || a.dead || b.dead) return
  if (getTradeOf(world, fromId) || getTradeOf(world, toId)) return   // either already busy
  if (Math.hypot(a.x - b.x, a.y - b.y) > TRADE_RANGE) return
  world.trades.push({
    a: fromId, b: toId, aItems: [], bItems: [], aGold: 0, bGold: 0,
    aConfirm: false, bConfirm: false, accepted: false,
  })
}

export function acceptTrade(world: WorldState, id: string) {
  const t = getTradeOf(world, id)
  if (t && t.b === id && !t.accepted) t.accepted = true
}

/** Decline a pending request or cancel an active trade — same effect. */
export function cancelTrade(world: WorldState, id: string) {
  world.trades = world.trades.filter(t => t.a !== id && t.b !== id)
}

/** Replace this player's whole offer (item ids + gold) and reset confirmations. */
export function tradeOffer(world: WorldState, id: string, itemIds: number[], gold: number) {
  const t = getTradeOf(world, id)
  if (!t || !t.accepted) return
  const p = find(world, id)
  if (!p) return
  const valid = itemIds.filter(iid => p.inventory.some(it => it.id === iid)).slice(0, MAX_OFFER_ITEMS)
  const g = Math.max(0, Math.min(Math.floor(gold) || 0, p.gold))
  if (t.a === id) { t.aItems = valid; t.aGold = g } else { t.bItems = valid; t.bGold = g }
  t.aConfirm = false; t.bConfirm = false
}

export function tradeConfirm(world: WorldState, id: string) {
  const t = getTradeOf(world, id)
  if (!t || !t.accepted) return
  if (t.a === id) t.aConfirm = true; else t.bConfirm = true
  if (t.aConfirm && t.bConfirm) executeTrade(world, t)
}

function executeTrade(world: WorldState, t: TradeSession) {
  const a = find(world, t.a), b = find(world, t.b)
  const close = () => { world.trades = world.trades.filter(x => x !== t) }
  if (!a || !b) { close(); return }

  // Re-validate: every offered item must still be in its owner's bag and the
  // gold must still be available — guards against selling/equipping mid-trade.
  const aGive = t.aItems.map(iid => a.inventory.find(it => it.id === iid)).filter(Boolean) as Item[]
  const bGive = t.bItems.map(iid => b.inventory.find(it => it.id === iid)).filter(Boolean) as Item[]
  if (aGive.length !== t.aItems.length || bGive.length !== t.bItems.length) { close(); return }
  if (a.gold < t.aGold || b.gold < t.bGold) { close(); return }
  // Both bags must have room for what they receive.
  if (a.inventory.length - aGive.length + bGive.length > a.inventoryCap) { close(); return }
  if (b.inventory.length - bGive.length + aGive.length > b.inventoryCap) { close(); return }

  a.inventory = a.inventory.filter(it => !t.aItems.includes(it.id))
  b.inventory = b.inventory.filter(it => !t.bItems.includes(it.id))
  a.inventory.push(...bGive)
  b.inventory.push(...aGive)
  a.gold = a.gold - t.aGold + t.bGold
  b.gold = b.gold - t.bGold + t.aGold
  close()
}

/** Drop trades whose participants left, died, or walked apart. Call each tick. */
export function tickTrades(world: WorldState) {
  if (world.trades.length === 0) return
  world.trades = world.trades.filter(t => {
    const a = find(world, t.a), b = find(world, t.b)
    if (!a || !b || a.dead || b.dead) return false
    if (Math.hypot(a.x - b.x, a.y - b.y) > TRADE_BREAK_RANGE) return false
    return true
  })
}

/** Build the trade view for one player (resolves item ids → full items). */
export function tradeViewFor(world: WorldState, id: string): TradeView | null {
  const t = getTradeOf(world, id)
  if (!t) return null
  const otherId = t.a === id ? t.b : t.a
  const me = find(world, id), other = find(world, otherId)
  if (!me || !other) return null
  const mineIsA = t.a === id
  const myIds = mineIsA ? t.aItems : t.bItems
  const theirIds = mineIsA ? t.bItems : t.aItems
  const resolve = (ids: number[], inv: Item[]) =>
    ids.map(iid => inv.find(it => it.id === iid)).filter(Boolean) as Item[]
  return {
    withId: otherId, withName: other.name,
    stage: t.accepted ? 'active' : 'pending',
    incoming: !t.accepted && t.b === id,
    yourItems: resolve(myIds, me.inventory),
    theirItems: resolve(theirIds, other.inventory),
    yourGold: mineIsA ? t.aGold : t.bGold,
    theirGold: mineIsA ? t.bGold : t.aGold,
    yourConfirm: mineIsA ? t.aConfirm : t.bConfirm,
    theirConfirm: mineIsA ? t.bConfirm : t.aConfirm,
  }
}
