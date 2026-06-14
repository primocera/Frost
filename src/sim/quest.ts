import { PlayerState, Quest } from './types'

/**
 * Simple repeatable bounty quest from the Bounty Board NPC: slay N monsters for
 * a gold reward. Kills are counted server-side; the reward scales with level.
 */
const TARGET = 15

export function questFor(level: number): Quest {
  return { kills: 0, target: TARGET, reward: 4000 + level * 1500, done: false }
}

export function acceptQuest(p: PlayerState): boolean {
  if (p.quest) return false
  p.quest = questFor(p.stats.level)
  return true
}

/** Count a kill toward the active bounty. Returns true if it just completed. */
export function questOnKill(p: PlayerState): boolean {
  const q = p.quest
  if (!q || q.done) return false
  q.kills++
  if (q.kills >= q.target) { q.done = true; return true }
  return false
}

/** Claim a completed bounty's reward. Returns gold awarded (0 if not claimable). */
export function claimQuest(p: PlayerState): number {
  const q = p.quest
  if (!q || !q.done) return 0
  p.gold += q.reward
  p.quest = null   // repeatable — accept a fresh one
  return q.reward
}
