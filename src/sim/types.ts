import { EnemyConfig } from './enemies'
import { Item } from './items'
import { EquipSlot } from '../items/ItemTypes'
import { TalentId } from '../talents/TalentTypes'

export interface Vec2 { x: number; y: number }

export type BoltKind = 'fire' | 'frost'

export interface PlayerStats {
  hp: number; maxHp: number
  mana: number; maxMana: number
  xp: number; xpToNext: number; level: number
  speed: number; spellDamage: number
}

export interface PlayerState {
  id: string
  name: string
  x: number; y: number
  vx: number; vy: number
  facing: 1 | -1
  stats: PlayerStats
  // Cooldowns remaining, in ms.
  cd: { firebolt: number; frostbolt: number; arcaneBlast: number; frostNova: number; blizzard: number }
  activeBolt: BoltKind
  learnedSpells: string[]
  manaRegenAccum: number
  dead: boolean
  // Per-player progression/economy (was world-global in single-player).
  gold: number
  inventory: Item[]
  inventoryCap: number
  equipped: Record<EquipSlot, Item | null>
  talentRanks: Partial<Record<TalentId, number>>
  talentPoints: number
  // PvP status effects (other players' frost spells).
  frozenMs: number
  slowMs: number
  slowMult: number
  // Visual hints the renderer reads (ms remaining).
  castMs: number
  hurtMs: number
}

export type EnemyAIState = 'wander' | 'chase'

export interface EnemyState {
  id: number
  key: string            // EnemyConfig.key — renderer maps to a draw routine
  x: number; y: number
  vx: number; vy: number
  facing: 1 | -1
  hp: number; maxHp: number
  cfg: EnemyConfig
  homeX: number; homeY: number
  homeZone: { x: number; y: number; w: number; h: number } | null
  zoneId: number         // spawn zone index (for respawn accounting); -1 if none
  aiState: EnemyAIState
  attackCd: number
  wanderIdleMs: number
  wanderTarget: Vec2 | null
  frozenMs: number
  slowMs: number
  slowMult: number
  rangedCd: number
  // Elite charge state machine
  chargeCd: number
  chargePhase: 'none' | 'windup' | 'charging'
  chargeTimer: number
  chargeDir: Vec2
  // Tank telegraph state machine
  telegraphTimer: number
  telegraphing: boolean
  burning: boolean
  burnTicksLeft: number
  burnTickTimer: number
  burnDmg: number
  burnOwnerId: string
  dying: boolean
  deathMs: number        // death animation time remaining (kept briefly for FX)
  hitFlashMs: number
}

export interface ProjectileState {
  id: number
  owner: 'player' | 'enemy'
  ownerId?: string       // player id for kill/XP attribution (player bolts only)
  kind: string           // 'firebolt' | 'frostbolt' | enemy bolt tex key
  x: number; y: number
  vx: number; vy: number
  damage: number
  lifeMs: number
  radius: number
}

export interface LootState {
  id: number
  x: number; y: number
  item?: Item
  gold?: number
  ageMs: number
}

export interface SpawnZoneState {
  id: number
  cx: number; cy: number; radius: number
  configs: EnemyConfig[]    // possible enemy types in this zone
  zoneBounds: { x: number; y: number; w: number; h: number } | null
  maxEnemies: number
  count: number             // currently alive
  respawnTimers: number[]   // pending respawn countdowns (ms)
}

/** Persistent ground AoE — currently just Blizzard's ticking zone. */
export interface GroundEffectState {
  id: number
  kind: 'blizzard'
  ownerId: string           // caster — for kill/XP attribution
  spellDamage: number       // snapshot of caster's spell damage at cast time
  x: number; y: number; radius: number
  tickTimer: number
  durationMs: number
  zoneName: string          // restricts hits to the caster's zone (parity with old code)
}

/** One-shot effects the sim emits each tick for the renderer/audio to consume.
 *  `pid` (when present) names the player the event concerns — clients show
 *  HUD banners only for their own id, but render world FX for everyone. */
export type SimEvent =
  | { type: 'cast'; kind: BoltKind; x: number; y: number }
  | { type: 'impact'; kind: BoltKind; x: number; y: number }
  | { type: 'aoe'; kind: 'arcane' | 'nova' | 'blizzard'; x: number; y: number; radius: number }
  | { type: 'spellGated'; pid: string; spell: string; level: number }
  | { type: 'learnedSpell'; pid: string; spell: string }
  | { type: 'enemyHit'; x: number; y: number; damage: number; crit: boolean; frost: boolean }
  | { type: 'enemyDeath'; x: number; y: number; color: number; xp: number; mult: number }
  | { type: 'freeze'; x: number; y: number }
  | { type: 'playerHit'; pid: string; x: number; y: number; damage: number }
  | { type: 'levelUp'; pid: string; level: number }
  | { type: 'loot'; x: number; y: number; item?: Item; gold?: number }
  | { type: 'pickup'; pid: string; x: number; y: number; item?: Item; gold?: number }
  | { type: 'rareSlain'; label: string }
  | { type: 'feat'; name: string; text: string }   // notable deed → announced in chat
  | { type: 'death'; pid: string }
  | { type: 'respawn'; pid: string }

export interface WorldState {
  bounds: { x: number; y: number; w: number; h: number }
  players: PlayerState[]
  enemies: EnemyState[]
  projectiles: ProjectileState[]
  loot: LootState[]
  grounds: GroundEffectState[]
  zones: SpawnZoneState[]
  timeMs: number
  rngState: number
  events: SimEvent[]
  nextEnemyId: number
  nextProjId: number
  nextLootId: number
  killStreak: number
  lastKillMs: number
}

/** Per-tick player intent, produced by Input (client) or the network (server). */
export interface InputCommand {
  move: Vec2            // raw -1..1 per axis (sim normalizes diagonals)
  aim: Vec2             // world-space target for casts
  castBolt: boolean     // fire the active bolt this tick
  swapBolt: boolean     // toggle fire/frost
  castArcane: boolean   // Q — Arcane Blast (AoE burst around player)
  castNova: boolean     // E — Frost Nova (AoE freeze around player)
  castBlizzard: boolean // R — Blizzard (ground AoE at aim point)
  pickup: boolean       // attempt to grab nearby loot
}

export function emptyInput(): InputCommand {
  return {
    move: { x: 0, y: 0 }, aim: { x: 0, y: 0 },
    castBolt: false, swapBolt: false, castArcane: false, castNova: false, castBlizzard: false,
    pickup: false,
  }
}

// ── Network wire format ─────────────────────────────────────────────────────
// Snapshots trim the heavy/AI-internal fields: enemies send `key` (client maps
// back to EnemyConfig) instead of the whole cfg, and loot sends just rarity.

export interface PlayerSnap {
  id: string; name: string
  x: number; y: number; vx: number; vy: number; facing: 1 | -1
  hp: number; maxHp: number; mana: number; maxMana: number
  xp: number; xpToNext: number; level: number; gold: number
  activeBolt: BoltKind; learned: string[]
  castMs: number; hurtMs: number; dead: boolean; frozen: boolean
}
export interface EnemySnap {
  id: number; key: string; x: number; y: number; facing: 1 | -1
  hp: number; maxHp: number
  frozen: boolean; slow: boolean; flash: boolean; tell: boolean
  dying: boolean; deathMs: number
}
export interface ProjSnap { id: number; owner: 'player' | 'enemy'; kind: string; x: number; y: number; vx: number; vy: number; radius: number }
export interface LootSnap { id: number; x: number; y: number; gold?: number; rarity?: string }
export interface GroundSnap { id: number; x: number; y: number; radius: number }

export interface Snapshot {
  t: number
  players: PlayerSnap[]
  enemies: EnemySnap[]
  projectiles: ProjSnap[]
  loot: LootSnap[]
  grounds: GroundSnap[]
  events: SimEvent[]
}

/** Full personal state sent only to the owning connection (inventory/talents). */
export interface SelfState {
  inv: Item[]
  eq: Record<EquipSlot, Item | null>
  ranks: Partial<Record<TalentId, number>>
  pts: number
}

/** client → server */
export type ClientMessage =
  | { t: 'join'; name: string; pid?: string }   // pid = stable per-browser save id
  | { t: 'input'; cmd: InputCommand }
  | { t: 'equip'; itemId: number }
  | { t: 'unequip'; slot: EquipSlot }
  | { t: 'talent'; id: TalentId }
  | { t: 'train'; spell: string }
  | { t: 'chat'; text: string }

/** server → client */
export type ServerMessage =
  | { t: 'welcome'; id: string }
  | { t: 'snap'; s: Snapshot }
  | { t: 'self'; self: SelfState }
  | { t: 'chat'; from: string; text: string; sys?: boolean }
