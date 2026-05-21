/**
 * PartySystem — architecture for up to 4 co-op party members.
 *
 * In single-player the local player is the sole member.
 * Multiplayer readiness: call addMember / removeMember / updateMember
 * from a WebSocket message handler and all UI that subscribes via
 * onChange will update automatically.
 */

export interface PartyMember {
  /** Matches PlayerProfile.id — network player ID in multiplayer. */
  id:       string
  name:     string
  level:    number
  hp:       number
  maxHp:    number
  mana:     number
  maxMana:  number
  cosmetic: string
  /** True for the local player — renders their frame differently. */
  isLocal:  boolean
  /** False when the player has disconnected but hasn't left the party. */
  online:   boolean
}

/** Subset sent over the network as position/state ticks. */
export interface PartyTick {
  id:    string
  hp:    number
  mana:  number
  level: number
  x?:    number   // world position — for future minimap
  y?:    number
}

export class PartySystem {
  readonly maxSize = 4

  /** Fires whenever the member list or any member's stats change. */
  onChange?: (members: PartyMember[]) => void

  private members = new Map<string, PartyMember>()

  // ── Read ───────────────────────────────────────────────────────────────────

  get list(): PartyMember[]     { return [...this.members.values()] }
  get size(): number            { return this.members.size }
  get isFull(): boolean         { return this.members.size >= this.maxSize }
  get localMember(): PartyMember | undefined {
    return [...this.members.values()].find(m => m.isLocal)
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  /**
   * Upsert a member. Safe to call every frame for the local player.
   * Returns false if the party is full and the member doesn't already exist.
   */
  addOrUpdate(member: PartyMember): boolean {
    if (this.isFull && !this.members.has(member.id)) return false
    this.members.set(member.id, member)
    this.onChange?.(this.list)
    return true
  }

  /**
   * Apply a lightweight stat tick (called frequently, avoids full object alloc).
   * No-op if the member isn't in this party.
   */
  applyTick(tick: PartyTick) {
    const m = this.members.get(tick.id)
    if (!m) return
    m.hp    = tick.hp
    m.mana  = tick.mana
    m.level = tick.level
    this.onChange?.(this.list)
  }

  /**
   * Mark a member as offline (disconnected) without removing their frame.
   * In multiplayer: called when a player's WebSocket drops.
   */
  setOnline(id: string, online: boolean) {
    const m = this.members.get(id)
    if (!m || m.online === online) return
    m.online = online
    this.onChange?.(this.list)
  }

  /**
   * Remove a member entirely (left party, session ended).
   * In multiplayer: called when PARTY_LEAVE message is received.
   */
  remove(id: string) {
    if (!this.members.delete(id)) return
    this.onChange?.(this.list)
  }

  clear() { this.members.clear(); this.onChange?.([]) }

  // ── Future hooks (stubs — implement when adding multiplayer) ──────────────

  /**
   * Invite another player by ID.
   * Would send PARTY_INVITE over the NetAdapter.
   */
  // invitePlayer(targetId: string) { ... }

  /**
   * Accept an incoming party invite.
   * Would send PARTY_ACCEPT and merge member lists.
   */
  // acceptInvite(fromId: string) { ... }

  /**
   * Promote another member to party leader.
   * Would broadcast PARTY_LEADER_CHANGE.
   */
  // promoteLeader(id: string) { ... }
}
