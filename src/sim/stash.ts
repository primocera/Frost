import { PlayerState } from './types'

/** Shared bank/stash storage in town: move items between bag and stash. */
export const STASH_CAP = 50

export function stashDeposit(p: PlayerState, itemId: number): boolean {
  if (p.stash.length >= STASH_CAP) return false
  const idx = p.inventory.findIndex(it => it.id === itemId)
  if (idx < 0) return false
  p.stash.push(p.inventory[idx])
  p.inventory.splice(idx, 1)
  return true
}

export function stashWithdraw(p: PlayerState, itemId: number): boolean {
  if (p.inventory.length >= p.inventoryCap) return false
  const idx = p.stash.findIndex(it => it.id === itemId)
  if (idx < 0) return false
  p.inventory.push(p.stash[idx])
  p.stash.splice(idx, 1)
  return true
}
