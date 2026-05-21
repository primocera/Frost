/**
 * SocialSystem — player identity, event routing, and network adapter seam.
 *
 * All social activity (chat, inspect, party) flows through this class.
 * In single-player the LocalAdapter processes events in-process.
 * Multiplayer readiness: swap LocalAdapter for WebSocketAdapter and the
 * rest of the codebase stays unchanged.
 */

const PROFILE_KEY = 'frost_profile'

// ── Network adapter interface ──────────────────────────────────────────────────

export interface NetMessage {
  type:    string
  payload: unknown
}

/**
 * Implement this interface to replace single-player with a real transport.
 * A WebSocketAdapter would serialize NetMessages to JSON, send them over the
 * wire, and dispatch incoming messages to the registered handlers.
 */
export interface NetAdapter {
  send(msg: NetMessage): void
  on(type: string, handler: (payload: unknown) => void): void
  dispose(): void
}

/** Single-player adapter: messages are dispatched immediately in-process. */
export class LocalAdapter implements NetAdapter {
  private handlers = new Map<string, Array<(p: unknown) => void>>()

  send(msg: NetMessage) {
    this.handlers.get(msg.type)?.forEach(h => h(msg.payload))
  }

  on(type: string, handler: (payload: unknown) => void) {
    if (!this.handlers.has(type)) this.handlers.set(type, [])
    this.handlers.get(type)!.push(handler)
  }

  dispose() { this.handlers.clear() }
}

// ── Player profile ─────────────────────────────────────────────────────────────

export interface PlayerProfile {
  /** Persistent UUID — becomes the network player ID in multiplayer. */
  id:       string
  name:     string
  cosmetic: string
}

// ── Inspect data ───────────────────────────────────────────────────────────────

export interface InspectData {
  name:   string
  level:  number
  hp:     number
  maxHp:  number
  mana?:  number
  maxMana?: number
  type:   string   // 'player' | 'enemy' | 'boss'
  extra?: string[] // extra stat lines
}

// ── Chat message ───────────────────────────────────────────────────────────────

export interface ChatMessage {
  id:     string   // sender profile ID
  name:   string   // sender display name
  text:   string
  color:  string   // CSS hex
  ts:     number   // Date.now()
}

// ── SocialSystem ───────────────────────────────────────────────────────────────

export class SocialSystem {
  readonly profile: PlayerProfile
  private  adapter: NetAdapter

  /** Called when any chat message arrives (local or future remote). */
  onChatMessage?: (msg: ChatMessage) => void
  /** Called when an inspect response is ready. */
  onInspect?:     (data: InspectData) => void

  constructor() {
    this.profile = this.loadProfile()
    this.adapter = new LocalAdapter()

    // Wire adapter events back to typed callbacks
    this.adapter.on('CHAT', (p) => {
      this.onChatMessage?.(p as ChatMessage)
    })
    this.adapter.on('INSPECT_RESPONSE', (p) => {
      this.onInspect?.(p as InspectData)
    })
  }

  // ── Profile ────────────────────────────────────────────────────────────────

  /**
   * Set the player's display name (1–20 chars, sanitised).
   * Returns the final stored name so callers can display it.
   */
  setName(raw: string): string {
    const name = raw.trim().replace(/[^\w\s\-]/g, '').slice(0, 20) || 'Mage'
    this.profile.name = name
    this.saveProfile()
    return name
  }

  // ── Chat ──────────────────────────────────────────────────────────────────

  /**
   * Send a chat message from the local player.
   * In multiplayer this would be broadcast to all party members.
   */
  sendChat(text: string) {
    const msg: ChatMessage = {
      id:    this.profile.id,
      name:  this.profile.name,
      text:  text.slice(0, 200),
      color: '#ffffff',
      ts:    Date.now(),
    }
    this.adapter.send({ type: 'CHAT', payload: msg })
  }

  /**
   * Post a game-event feed line (kill, level-up, etc.).
   * These never go over the network — they're local feedback only.
   */
  feedEvent(text: string, color = '#888888') {
    this.onChatMessage?.({
      id: '__game__', name: '', text, color, ts: Date.now(),
    })
  }

  // ── Inspect ───────────────────────────────────────────────────────────────

  /**
   * Inspect a local entity (enemy, boss, or self).
   * In multiplayer, inspecting another player would send INSPECT_REQUEST
   * over the network and wait for their INSPECT_RESPONSE.
   */
  inspectLocal(data: InspectData) {
    this.adapter.send({ type: 'INSPECT_RESPONSE', payload: data })
  }

  // ── Adapter swap (future) ─────────────────────────────────────────────────

  /**
   * Replace the transport. Call before the game starts (or during reconnect).
   *
   * Example future usage:
   *   social.useAdapter(new WebSocketAdapter('wss://frost.game/ws', token))
   */
  useAdapter(next: NetAdapter) {
    this.adapter.dispose()
    this.adapter = next
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  private loadProfile(): PlayerProfile {
    try {
      const raw = localStorage.getItem(PROFILE_KEY)
      if (raw) return JSON.parse(raw) as PlayerProfile
    } catch { /* ignore */ }
    return {
      id:       typeof crypto.randomUUID === 'function'
                  ? crypto.randomUUID()
                  : Math.random().toString(36).slice(2) + Date.now().toString(36),
      name:     'Mage',
      cosmetic: 'default',
    }
  }

  private saveProfile() {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(this.profile)) } catch { /* ignore */ }
  }
}
