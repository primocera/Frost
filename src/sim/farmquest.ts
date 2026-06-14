import { PlayerState } from './types'
import { gainXP } from './player'
import { BESSIE_X, BESSIE_Y, FEED_RANGE } from './zones'

/**
 * Farmer Holt's "Feed Bessie" starter quest (ported from the original game).
 * A gentle first errand: accept from Holt → walk to Bessie the hen and feed her
 * → return to Holt for a small XP + gold reward. Server-authoritative so it
 * persists and can't be claimed twice.
 */
export const FARM_REWARD_XP = 60
export const FARM_REWARD_GOLD = 500   // copper (= 5 silver)

export function acceptFarmQuest(p: PlayerState) {
  if (p.farmQuest === 0) p.farmQuest = 1
}

/** Feed Bessie — only counts while the quest is active and you're next to her. */
export function feedBessie(p: PlayerState) {
  if (p.farmQuest !== 1) return
  if (Math.hypot(p.x - BESSIE_X, p.y - BESSIE_Y) > FEED_RANGE) return
  p.farmQuest = 2
}

export function claimFarmQuest(p: PlayerState) {
  if (p.farmQuest !== 2) return
  p.farmQuest = 3
  p.gold += FARM_REWARD_GOLD
  gainXP(p, FARM_REWARD_XP)
}
