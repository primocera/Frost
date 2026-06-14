import { EQUIP_SLOTS, EquipSlot, ItemStats, slotsForType } from '../items/ItemTypes'
import { PlayerState } from './types'

/** Aggregate stat bonuses from all equipped items (port of Inventory.recompute). */
export function gearStats(p: PlayerState): Readonly<ItemStats> {
  const s: ItemStats = {}
  for (const slot of EQUIP_SLOTS) {
    const item = p.equipped[slot]
    if (!item) continue
    for (const [k, v] of Object.entries(item.stats) as [keyof ItemStats, number][]) {
      s[k] = ((s[k] ?? 0) as number) + v
    }
  }
  return s
}

/**
 * Equip an inventory item by id. Rings fill ring1 then ring2; any displaced
 * item goes back to the inventory. Server-authoritative — validated by id.
 */
export function equipItem(p: PlayerState, itemId: number): boolean {
  const idx = p.inventory.findIndex(it => it.id === itemId)
  if (idx < 0) return false
  const item = p.inventory[idx]

  const slots = slotsForType(item.type)
  let target = slots[0]
  for (const s of slots) { if (!p.equipped[s]) { target = s; break } }

  const displaced = p.equipped[target]
  p.equipped[target] = item
  p.inventory.splice(idx, 1)
  if (displaced) p.inventory.push(displaced)
  return true
}

/** Discard an inventory item. */
export function dropItem(p: PlayerState, itemId: number): boolean {
  const idx = p.inventory.findIndex(it => it.id === itemId)
  if (idx < 0) return false
  p.inventory.splice(idx, 1)
  return true
}

/** Unequip a slot back into the bag (fails if the bag is full). */
export function unequipItem(p: PlayerState, slot: EquipSlot): boolean {
  const item = p.equipped[slot]
  if (!item) return false
  if (p.inventory.length >= p.inventoryCap) return false
  p.inventory.push(item)
  p.equipped[slot] = null
  return true
}
