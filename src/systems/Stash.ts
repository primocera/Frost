import { Item } from '../items/ItemTypes'

const STASH_SIZE = 20

export class Stash {
  readonly items: (Item | null)[] = new Array(STASH_SIZE).fill(null)
  onChange?: () => void

  get isFull()   { return !this.items.includes(null) }
  get firstFree() { return this.items.indexOf(null) }

  add(item: Item): boolean {
    const idx = this.firstFree
    if (idx < 0) return false
    this.items[idx] = item
    this.onChange?.()
    return true
  }

  remove(idx: number): Item | null {
    const item = this.items[idx]
    if (!item) return null
    this.items[idx] = null
    this.onChange?.()
    return item
  }
}
