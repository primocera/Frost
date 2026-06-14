import { create } from 'zustand'
import type { SelfState } from '../sim/types'
import type { EquipSlot } from '../items/ItemTypes'
import type { TalentId } from '../talents/TalentTypes'

/**
 * UI-facing store. The canvas game engine pushes a *summary* of game state into
 * this store a handful of times per second (NOT every frame) so that React HUD
 * and panel components can render without driving the game loop.
 *
 * Phase 0: only connection + screen state. Player stats, inventory, etc. land
 * here in later phases.
 */
export type Screen = 'landing' | 'playing'
export type NetStatus = 'offline' | 'connecting' | 'connected'

/** Lightweight snapshot of game state the HUD renders. Pushed by the engine
 *  ~10×/s — NOT every frame — so React re-renders stay cheap. */
export interface SpellHud {
  key: string        // 'Q' | 'E' | 'R'
  label: string
  cdPct: number      // 0 = ready, 1 = just cast
  learned: boolean
}

export interface HudState {
  hp: number; maxHp: number
  mana: number; maxMana: number
  xp: number; xpToNext: number; level: number
  gold: number
  activeBolt: 'fire' | 'frost'
  dead: boolean
  zone: string
  zoneColor: string
  spells: SpellHud[]
  learnedSpells: string[]
}

const initialHud: HudState = {
  hp: 80, maxHp: 80, mana: 100, maxMana: 100,
  xp: 0, xpToNext: 500, level: 1, gold: 0, activeBolt: 'fire', dead: false,
  zone: '', zoneColor: '#cfe3ff', spells: [], learnedSpells: ['bolt'],
}

export type Panel = 'none' | 'inventory' | 'talents' | 'shop' | 'merchant' | 'quest' | 'stash' | 'trade'

/** Nearby tradeable player, surfaced so the HUD can prompt "Press G to trade". */
export interface NearPlayer { id: string; name: string }

/** Action hooks the engine registers so React panels can drive the sim
 *  (local) or send messages to the server (networked). */
export interface GameActions {
  equip: (itemId: number) => void
  unequip: (slot: EquipSlot) => void
  buyTalent: (id: TalentId) => void
  train: (spell: string) => void
  buy: (idx: number) => void
  acceptQuest: () => void
  claimQuest: () => void
  stashDeposit: (itemId: number) => void
  stashWithdraw: (itemId: number) => void
  drop: (itemId: number) => void
  sell: (itemId: number) => void
  tradeRequest: (toId: string) => void
  tradeAccept: () => void
  tradeDecline: () => void
  tradeOffer: (items: number[], gold: number) => void
  tradeConfirm: () => void
  tradeCancel: () => void
  sendChat: (text: string) => void
}

export interface ChatLine { from: string; text: string; sys?: boolean }

interface GameUIState {
  screen: Screen
  playerName: string
  hardcore: boolean
  net: NetStatus
  hud: HudState
  panel: Panel
  self: SelfState | null
  actions: GameActions | null
  chat: ChatLine[]
  chatOpen: boolean
  isMobile: boolean
  nearNpc: boolean
  nearPlayer: NearPlayer | null
  volume: number

  startGame: (name: string, hardcore: boolean) => void
  setNet: (net: NetStatus) => void
  setHud: (hud: HudState) => void
  setPanel: (panel: Panel) => void
  togglePanel: (panel: Panel) => void
  setSelf: (self: SelfState | null) => void
  setActions: (actions: GameActions) => void
  addChat: (line: ChatLine) => void
  setChatOpen: (open: boolean) => void
  setMobile: (m: boolean) => void
  setNearNpc: (n: boolean) => void
  setNearPlayer: (p: NearPlayer | null) => void
  setVolume: (v: number) => void
}

export const useGameStore = create<GameUIState>((set) => ({
  screen: 'landing',
  playerName: 'Apprentice',
  hardcore: false,
  net: 'offline',
  hud: initialHud,
  panel: 'none',
  self: null,
  actions: null,
  chat: [],
  chatOpen: false,
  isMobile: false,
  nearNpc: false,
  nearPlayer: null,
  volume: 0.7,

  startGame: (name, hardcore) =>
    set({ screen: 'playing', playerName: name || 'Apprentice', hardcore }),
  setNet: (net) => set({ net }),
  setHud: (hud) => set({ hud }),
  setPanel: (panel) => set({ panel }),
  togglePanel: (panel) => set((s) => ({ panel: s.panel === panel ? 'none' : panel })),
  setSelf: (self) => set({ self }),
  setActions: (actions) => set({ actions }),
  addChat: (line) => set((s) => ({ chat: [...s.chat.slice(-49), line] })),
  setChatOpen: (open) => set({ chatOpen: open }),
  setMobile: (m) => set({ isMobile: m }),
  setNearNpc: (n) => set({ nearNpc: n }),
  setNearPlayer: (p) => set({ nearPlayer: p }),
  setVolume: (v) => set({ volume: v }),
}))
