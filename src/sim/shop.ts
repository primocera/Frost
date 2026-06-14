import { PlayerState, ShopItem } from './types'
import { Item, Rarity, generateItem } from './items'
import { RNG } from './rng'

/**
 * Spell trainer. Gold (earned from kills) is spent here to learn the AoE spells,
 * replacing the old auto-learn-on-level-up. This is the game's first real gold
 * sink and the natural anchor for a future cosmetics/premium store.
 *
 * Costs are in copper (the unit `player.gold` is stored in).
 */
export interface ShopSpell {
  spell: string
  label: string
  level: number   // minimum player level to train
  cost: number    // copper
  desc: string
}

export const SHOP_SPELLS: ShopSpell[] = [
  { spell: 'frostNova',   label: 'Frost Nova',   level: 7,  cost: 2000,  desc: 'AoE freeze around you (E)' },
  { spell: 'arcaneBlast', label: 'Arcane Blast', level: 14, cost: 8000,  desc: 'Instant AoE burst (Q)' },
  { spell: 'blizzard',    label: 'Blizzard',     level: 18, cost: 20000, desc: 'Targeted ground AoE (R)' },
]

export type TrainResult = 'ok' | 'known' | 'level' | 'gold' | 'unknown'

export function trainSpell(p: PlayerState, spell: string): TrainResult {
  const def = SHOP_SPELLS.find(s => s.spell === spell)
  if (!def) return 'unknown'
  if (p.learnedSpells.includes(spell)) return 'known'
  if (p.stats.level < def.level) return 'level'
  if (p.gold < def.cost) return 'gold'
  p.gold -= def.cost
  p.learnedSpells.push(spell)
  return 'ok'
}

// ── Merchant gear shop (port of the old ShopUI) ─────────────────────────────
const PRICE: Record<Rarity, [number, number]> = {
  common: [100, 300], magic: [600, 1800], rare: [6000, 18000], epic: [40000, 100000],
}

/** A fresh merchant stock scaled to the player's level (copper prices). */
export function generateShopStock(rng: RNG, level: number): ShopItem[] {
  const ilvl = Math.max(1, level)
  const pool: [Rarity, number][] = [['common', 3], ['magic', 4], ['rare', 3]]
  if (level >= 10) pool.push(['epic', 2])
  const stock: ShopItem[] = []
  for (const [rarity, count] of pool) {
    for (let i = 0; i < count; i++) {
      const [lo, hi] = PRICE[rarity]
      stock.push({ item: generateItem(rng, ilvl, rarity), price: Math.round(rng.range(lo, hi)), sold: false })
    }
  }
  return stock
}

/** Refresh a player's merchant stock for their current level. */
export function regenShopStock(p: PlayerState) {
  let h = 2166136261
  for (let i = 0; i < p.id.length; i++) { h ^= p.id.charCodeAt(i); h = Math.imul(h, 16777619) }
  const seed = ((Date.now() & 0xffff) ^ Math.imul(p.stats.level, 2654435761) ^ h) >>> 0
  p.shopStock = generateShopStock(new RNG(seed), p.stats.level)
}

// Sell value (copper) — roughly a quarter of merchant buy prices.
const SELL: Record<Rarity, number> = { common: 40, magic: 250, rare: 2500, epic: 15000 }
export function sellPrice(item: Item): number {
  return Math.round(SELL[item.rarity] * (1 + (item.ilvl - 1) * 0.05))
}
export function sellItem(p: PlayerState, itemId: number): number {
  const idx = p.inventory.findIndex(it => it.id === itemId)
  if (idx < 0) return 0
  const price = sellPrice(p.inventory[idx])
  p.gold += price
  p.inventory.splice(idx, 1)
  return price
}

export type BuyResult = 'ok' | 'sold' | 'gold' | 'full' | 'bad'

/** Buy stock[idx] (validated server-side). */
export function buyShopItem(p: PlayerState, idx: number): BuyResult {
  const entry = p.shopStock[idx]
  if (!entry) return 'bad'
  if (entry.sold) return 'sold'
  if (p.gold < entry.price) return 'gold'
  if (p.inventory.length >= p.inventoryCap) return 'full'
  p.gold -= entry.price
  p.inventory.push(entry.item)
  entry.sold = true
  return 'ok'
}
