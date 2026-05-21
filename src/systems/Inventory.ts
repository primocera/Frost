import { EQUIP_SLOTS, EquipSlot, Item, ItemStats, slotsForType } from '../items/ItemTypes'

const SIZE = 20

export class Inventory {
  readonly items:    (Item | null)[] = new Array(SIZE).fill(null)
  readonly equipped: Record<EquipSlot, Item | null>
  gold = 0

  /** Called after any equip/unequip/add change — set by InventoryUI to trigger a redraw. */
  onChange?: () => void

  private _gearStats: ItemStats = {}
  get gearStats(): Readonly<ItemStats> { return this._gearStats }

  constructor() {
    this.equipped = { staff: null, robe: null, ring1: null, ring2: null, amulet: null }
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  get isFull(): boolean { return !this.items.includes(null) }

  get firstFreeSlot(): number { return this.items.indexOf(null) }

  // ── Mutations ─────────────────────────────────────────────────────────────

  /** Returns false if inventory is full. */
  add(item: Item): boolean {
    const idx = this.firstFreeSlot
    if (idx < 0) return false
    this.items[idx] = item
    return true
  }

  /**
   * Equip the item at inventory index `invIdx`.
   * If the target equip slot is occupied, the displaced item goes back to the same
   * inventory slot. Returns the displaced item (or null).
   */
  equip(invIdx: number): Item | null {
    const item = this.items[invIdx]
    if (!item) return null

    const slots  = slotsForType(item.type)
    let target   = slots[0]
    for (const s of slots) {
      if (!this.equipped[s]) { target = s; break }
    }

    const displaced    = this.equipped[target]
    this.equipped[target] = item
    this.items[invIdx]    = displaced
    this.recompute()
    this.onChange?.()
    return displaced
  }

  /**
   * Unequip the item in `slot` and move it to inventory.
   * Returns false if inventory is full.
   */
  unequip(slot: EquipSlot): boolean {
    const item = this.equipped[slot]
    if (!item) return false
    if (!this.add(item)) return false
    this.equipped[slot] = null
    this.recompute()
    this.onChange?.()
    return true
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private recompute() {
    const s: ItemStats = {}
    for (const slot of EQUIP_SLOTS) {
      const item = this.equipped[slot]
      if (!item) continue
      for (const [k, v] of Object.entries(item.stats) as [keyof ItemStats, number][]) {
        s[k] = ((s[k] ?? 0) as number) + v
      }
    }
    this._gearStats = s
  }
}
