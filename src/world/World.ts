import Phaser from 'phaser'
import { EnemyConfig, Slime, Ghoul, Imp, Brute, Wraith, Elite, Wolf, Spider, Bandit, Bear, Thornback, FrostWarden, CorruptedMage, ArcaneLich, AshenGiant } from '../entities/EnemyTypes'

export interface SpawnZone {
  cx: number
  cy: number
  radius: number
  table: EnemyConfig[]
  maxEnemies: number
  /** Rectangle that confines enemies to this zone. null = no restriction (town area). */
  zoneBounds: { x: number; y: number; w: number; h: number } | null
}

// ── Zone definitions ───────────────────────────────────────────────────────────

export interface ZoneDef {
  name:       string
  labelColor: string  // CSS hex for UI text
  atmosphere: number  // numeric color for viewport overlay
  atmoAlpha:  number  // overlay alpha (0–1)
  danger:     1 | 2 | 3 | 4 | 5
  x: number; y: number; w: number; h: number
}

export const ZONE_DEFS: readonly ZoneDef[] = [
  {
    name: 'Beginner Forest',  labelColor: '#44cc44',
    atmosphere: 0x002200, atmoAlpha: 0.04,
    danger: 1, x: 0,    y: 2500, w: 3600, h: 1100,
  },
  {
    name: 'Frozen Ruins',     labelColor: '#aaddff',
    atmosphere: 0x88ccff, atmoAlpha: 0.14,
    danger: 2, x: 0,    y: 0,    w: 3600, h: 1100,
  },
  {
    name: 'Corrupted Fields', labelColor: '#cc4444',
    atmosphere: 0x220000, atmoAlpha: 0.09,
    danger: 3, x: 0,    y: 1100, w: 1500, h: 1400,
  },
  {
    name: 'Arcane Caves',     labelColor: '#aa44ff',
    atmosphere: 0x110022, atmoAlpha: 0.11,
    danger: 4, x: 2100, y: 1100, w: 1500, h: 1400,
  },
  {
    name: 'Volcanic Wastes',  labelColor: '#ff6622',
    atmosphere: 0x3a0a00, atmoAlpha: 0.22,
    danger: 5, x: 3600, y: 0,    w: 1800, h: 3600,
  },
]

/** Returns the named zone at world coordinates, or null for the central area. */
export function getZoneAt(worldX: number, worldY: number): ZoneDef | null {
  return ZONE_DEFS.find(z =>
    worldX >= z.x && worldX < z.x + z.w &&
    worldY >= z.y && worldY < z.y + z.h
  ) ?? null
}

const BORDER      = 80
const SAFE_RADIUS = 360

// ── World ──────────────────────────────────────────────────────────────────────

export interface DungeonEntrance {
  x:      number
  y:      number
  zoneId: string
}

export class World {
  readonly size:   number
  readonly worldW: number   // total world width (may exceed size for rectangular worlds)
  readonly cx:     number
  readonly cy:     number
  readonly obstacles:        Phaser.Physics.Arcade.StaticGroup
  readonly spawnZones:       SpawnZone[] = []
  readonly dungeonEntrances: DungeonEntrance[] = []
  readonly stashChestPos:    { x: number; y: number } = { x: 0, y: 0 }
  readonly chickenPositions: { x: number; y: number }[] = []

  constructor(private scene: Phaser.Scene, size: number, worldW?: number) {
    this.size   = size
    this.worldW = worldW ?? size
    this.cx     = size / 2   // town center X stays at the square center
    this.cy     = size / 2
    this.obstacles = scene.physics.add.staticGroup()

    this.buildTextures()
    this.buildTerrain()
    this.buildDecor()
    this.buildZoneArchitecture()
    this.buildTown()
    this.buildForest()
    this.buildCamps()
    this.buildBoundary()
    this.buildObstacles()
    this.buildAmbientLight()
    this.buildSnowfall()
    this.buildDungeonEntrances()
    this.buildSpawnZones()
    scene.physics.world.setBounds(0, 0, this.worldW, size)
  }

  // ── Textures ───────────────────────────────────────────────────────────────

  private buildTextures() {
    const g = this.scene.add.graphics()

    // ── Terrain tiles ─────────────────────────────────────────────────────────
    const tile = (key: string, base: number, line: number) => {
      g.fillStyle(base)
      g.fillRect(0, 0, 64, 64)
      g.lineStyle(1, line, 0.4)
      g.strokeRect(0, 0, 64, 64)
      g.generateTexture(key, 64, 64)
      g.clear()
    }

    tile('t_plains',  0x1e3a1e, 0x243f24)   // neutral green
    tile('t_forest',  0x112211, 0x172817)   // beginner forest — dark green
    tile('t_frozen',  0x7aa8c0, 0x8abcd0)   // frozen ruins — pale glacial ice
    tile('t_snow',    0xc8dce8, 0xd4e6f2)   // snow patches — near-white blue
    tile('t_corrupt', 0x1c0c0c, 0x271414)   // corrupted fields — dark blood-red
    tile('t_arcane',  0x0e0618, 0x150820)   // arcane caves — deep void purple

    // ── Tree (beginner forest) ────────────────────────────────────────────────
    g.fillStyle(0x1e5c1e)
    g.fillCircle(19, 19, 16)
    g.fillStyle(0x287228, 0.55)
    g.fillCircle(13, 14, 9)
    g.fillStyle(0x4a2e0e)
    g.fillRect(15, 30, 8, 18)
    g.generateTexture('tree', 38, 48)
    g.clear()

    // ── Dead tree (corrupted fields) ──────────────────────────────────────────
    g.fillStyle(0x3a1a1a)
    g.fillRect(15, 14, 7, 34)
    g.lineStyle(2, 0x4a2222)
    g.lineBetween(18, 20, 5,  9)
    g.lineBetween(5,  9,  1,  5)
    g.lineBetween(18, 27, 33, 14)
    g.lineBetween(33, 14, 37, 10)
    g.fillStyle(0x330000, 0.28)
    g.fillCircle(18, 10, 13)      // sinister aura
    g.generateTexture('dead_tree', 38, 48)
    g.clear()

    // ── Rock (reused in multiple zones) ──────────────────────────────────────
    g.fillStyle(0x5a5c58)
    g.fillEllipse(21, 17, 36, 26)
    g.fillStyle(0x4a4c48)
    g.fillEllipse(28, 20, 24, 18)
    g.fillStyle(0x787a76, 0.6)
    g.fillEllipse(14, 12, 18, 11)
    g.generateTexture('rock_obs', 44, 34)
    g.clear()

    // ── Campfire ──────────────────────────────────────────────────────────────
    g.fillStyle(0x4a2a0a)
    g.fillEllipse(16, 30, 24, 8)           // log shadow
    g.fillStyle(0x6b3a10)
    g.fillRect(8, 22, 5, 12)               // log left
    g.fillRect(19, 22, 5, 12)              // log right
    g.fillStyle(0xff2200, 0.9)
    g.fillTriangle(16, 8, 8, 26, 24, 26)   // flame outer
    g.fillStyle(0xff7700, 0.85)
    g.fillTriangle(16, 12, 11, 24, 21, 24) // flame mid
    g.fillStyle(0xffee00, 0.8)
    g.fillTriangle(16, 16, 13, 23, 19, 23) // flame tip
    g.fillStyle(0xffffff, 0.55)
    g.fillCircle(16, 19, 3)                // hot core
    g.generateTexture('campfire', 32, 36)
    g.clear()

    // NPC sprites are built from the player humanoid model in GameScene.

    // ── Ice crystal (frozen ruins) ────────────────────────────────────────────
    g.fillStyle(0x88bbdd, 0.92)
    g.fillTriangle(9, 0, 0, 36, 17, 36)     // main spike
    g.fillStyle(0xbbddff, 0.72)
    g.fillTriangle(9, 4, 5, 18, 13, 18)     // inner face
    g.fillStyle(0xffffff, 0.42)
    g.fillTriangle(9, 6, 7, 12, 11, 12)     // tip gleam
    g.fillStyle(0x77aacc, 0.82)
    g.fillTriangle(15, 8, 11, 30, 19, 30)   // smaller side crystal
    g.generateTexture('ice_obs', 20, 36)
    g.clear()

    // ── Snowflake (falling snow particle) ────────────────────────────────────
    g.fillStyle(0xddeeff, 0.85)
    g.fillCircle(4, 4, 2.5)
    g.fillStyle(0xffffff, 0.55)
    g.fillCircle(3, 3, 1.2)
    g.generateTexture('snowflake', 8, 8)
    g.clear()

    // ── Arcane pillar (arcane caves) ──────────────────────────────────────────
    g.fillStyle(0x252030)
    g.fillRect(5, 5, 12, 32)     // shaft
    g.fillStyle(0x352844)
    g.fillRect(1, 0, 20, 6)      // capital
    g.fillRect(1, 36, 20, 6)     // base
    g.fillStyle(0xaa44ff, 0.20)
    g.fillRect(6, 8, 10, 24)     // inner arcane glow
    g.lineStyle(1, 0xcc66ff, 0.28)
    g.strokeRect(5, 5, 12, 32)
    g.generateTexture('pillar_obs', 22, 42)
    g.clear()

    // ── Torch ─────────────────────────────────────────────────────────────────
    g.fillStyle(0x5a3808)
    g.fillRect(10, 16, 4, 20)             // post
    g.fillStyle(0x7a4e18)
    g.fillRect(8, 12, 8, 6)              // bracket
    g.fillStyle(0xff2200, 0.9)
    g.fillTriangle(12, 4, 7, 14, 17, 14) // flame outer
    g.fillStyle(0xff8800, 0.88)
    g.fillTriangle(12, 7, 9, 13, 15, 13)
    g.fillStyle(0xffee00, 0.8)
    g.fillCircle(12, 11, 3)              // hot tip
    g.generateTexture('torch', 24, 36)
    g.clear()

    // ── Fence post ────────────────────────────────────────────────────────────
    g.fillStyle(0x5a4220)
    g.fillRect(4, 0, 7, 28)
    g.fillStyle(0x7a5c2e, 0.6)
    g.fillRect(4, 0, 3, 28)
    g.fillStyle(0x3a2a10)
    g.fillRect(0, 12, 14, 3)
    g.generateTexture('fence_post', 14, 28)
    g.clear()

    // ── Stash chest ───────────────────────────────────────────────────────────
    g.fillStyle(0x8b5e1a)
    g.fillRect(2, 10, 36, 28)          // chest body
    g.fillStyle(0x6b3e0a)
    g.fillRect(2, 10, 36, 12)          // lid
    g.fillStyle(0xddaa33)
    g.fillRect(15, 20, 10, 7)          // latch plate
    g.fillStyle(0xffcc55)
    g.fillCircle(20, 24, 3)            // latch knob
    g.lineStyle(2, 0x5a3008, 0.9)
    g.strokeRect(2, 10, 36, 28)
    g.lineStyle(1, 0xcc8822, 0.6)
    g.strokeRect(2, 10, 36, 12)
    g.generateTexture('stash_chest', 40, 38)
    g.clear()

    // ── Tent ─────────────────────────────────────────────────────────────────
    g.fillStyle(0x7a5c2e)
    g.fillTriangle(28, 4, 0, 42, 56, 42)    // main canvas
    g.fillStyle(0x5a3c0e, 0.8)
    g.fillTriangle(28, 4, 14, 42, 0, 42)    // left shadow
    g.fillStyle(0x9a7040, 0.6)
    g.fillTriangle(28, 4, 42, 42, 56, 42)   // right highlight
    g.fillStyle(0x3a2808)
    g.fillRect(26, 4, 3, 40)                // center pole
    g.fillStyle(0x111111, 0.55)
    g.fillTriangle(22, 42, 34, 42, 28, 26)  // door opening
    g.generateTexture('tent', 56, 44)
    g.clear()

    // ── Crate ─────────────────────────────────────────────────────────────────
    g.fillStyle(0x7a5c2e)
    g.fillRect(0, 0, 22, 20)
    g.fillStyle(0x5a3c0e)
    g.fillRect(0, 0, 22, 4)
    g.fillRect(0, 16, 22, 4)
    g.lineStyle(1, 0x4a2c0a, 0.8)
    g.lineBetween(11, 0, 11, 20)
    g.strokeRect(0, 0, 22, 20)
    g.generateTexture('crate', 22, 20)
    g.clear()

    // ── Mage tower (town landmark) ──────────────────────────────────────────
    {
      const TW = 60, TH = 140
      g.fillStyle(0x1e1a2e, 0.8)                       // ground shadow
      g.fillEllipse(30, TH - 4, 52, 12)
      g.fillStyle(0x4a4660)                            // main shaft
      g.fillRect(14, 50, 32, TH - 54)
      g.fillStyle(0x3a3650, 0.8)                       // shadow side
      g.fillRect(36, 50, 10, TH - 54)
      g.fillStyle(0x5c5878, 0.5)                       // lit side
      g.fillRect(14, 50, 6, TH - 54)
      g.lineStyle(1, 0x2a2840, 0.5)                    // stone courses
      for (let by = 64; by < TH - 8; by += 16) g.lineBetween(14, by, 46, by)
      g.fillStyle(0x1a1228)                            // door
      g.fillRect(26, TH - 22, 12, 18)
      g.fillStyle(0x6633aa, 0.4)
      g.fillRect(26, TH - 22, 12, 4)
      g.fillStyle(0xaa66ff, 0.85)                      // arcane windows
      g.fillRect(26, 66, 8, 12)
      g.fillCircle(30, 66, 4)
      g.fillStyle(0xcc99ff, 0.7)
      g.fillRect(27, 94, 6, 8)
      g.fillRect(27, 116, 6, 8)
      g.fillStyle(0x52506e)                            // top platform
      g.fillRect(8, 44, 44, 12)
      for (let cc = 8; cc < 52; cc += 11) {            // crenellations
        g.fillStyle(0x42405e); g.fillRect(cc, 38, 7, 8)
      }
      g.fillStyle(0x4a2299)                            // conical roof
      g.fillTriangle(30, 4, 6, 44, 54, 44)
      g.fillStyle(0x6a3acc, 0.55)                      // roof lit side
      g.fillTriangle(30, 4, 30, 44, 54, 44)
      g.lineStyle(1, 0x33196e, 0.5)
      g.lineBetween(30, 4, 6, 44)
      g.lineBetween(30, 4, 54, 44)
      g.fillStyle(0xcc88ff, 0.95)                      // glowing orb finial
      g.fillCircle(30, 8, 5)
      g.fillStyle(0xffffff, 0.7)
      g.fillCircle(30, 7, 2.4)
      g.generateTexture('mage_tower', TW, TH)
      g.clear()
    }

    // ── Well ────────────────────────────────────────────────────────────────────
    g.fillStyle(0x5a5c58)                  // stone rim
    g.fillEllipse(22, 36, 40, 18)
    g.fillStyle(0x787a76, 0.6)
    g.fillEllipse(18, 33, 24, 10)
    g.fillStyle(0x1a2a34)                  // water hole
    g.fillEllipse(22, 35, 26, 11)
    g.fillStyle(0x335566, 0.6)
    g.fillEllipse(22, 35, 16, 7)
    g.fillStyle(0x6b4a28)                  // support posts
    g.fillRect(8, 4, 4, 28)
    g.fillRect(32, 4, 4, 28)
    g.fillStyle(0x9a4422)                  // little roof
    g.fillTriangle(2, 12, 42, 12, 22, 0)
    g.fillStyle(0xbb5530, 0.5)
    g.fillTriangle(22, 0, 42, 12, 26, 12)
    g.generateTexture('well', 44, 46)
    g.clear()

    // ── Chicken ───────────────────────────────────────────────────────────────
    g.fillStyle(0xf0ece0)                  // body
    g.fillEllipse(8, 10, 13, 11)
    g.fillStyle(0xffffff, 0.6)             // highlight
    g.fillEllipse(6, 8, 7, 5)
    g.fillStyle(0xcc3322)                  // comb
    g.fillCircle(11, 3, 2)
    g.fillCircle(13, 4, 1.6)
    g.fillStyle(0xddaa00)                  // beak
    g.fillTriangle(14, 6, 17, 7, 14, 9)
    g.fillStyle(0x222222)                  // eye
    g.fillCircle(12, 6, 1)
    g.fillStyle(0xddaa00)                  // legs
    g.fillRect(6, 15, 1, 3)
    g.fillRect(10, 15, 1, 3)
    g.generateTexture('chicken', 18, 18)
    g.clear()

    // ── Hay bale ──────────────────────────────────────────────────────────────
    g.fillStyle(0xc8a838)
    g.fillRect(0, 4, 30, 20)
    g.fillStyle(0xd8b848, 0.6)
    g.fillRect(0, 4, 30, 5)
    g.fillStyle(0x9a7a20, 0.7)
    g.fillRect(7, 4, 1.5, 20)
    g.fillRect(15, 4, 1.5, 20)
    g.fillRect(23, 4, 1.5, 20)
    g.lineStyle(1, 0x7a5e18, 0.8)
    g.strokeRect(0, 4, 30, 20)
    g.generateTexture('hay', 30, 26)
    g.clear()

    // ── Crop sprout (field plant) ──────────────────────────────────────────────
    g.fillStyle(0x2a6e1e)
    g.fillTriangle(2, 14, 4, 4,  6, 14)
    g.fillTriangle(6, 14, 8, 1,  10, 14)
    g.fillTriangle(9, 14, 12, 5, 14, 14)
    g.fillStyle(0x3a8e2e, 0.6)
    g.fillTriangle(7, 12, 8, 3, 9, 12)
    g.fillStyle(0xddcc44, 0.7)             // ripe tips
    g.fillCircle(8, 2, 1.4)
    g.fillCircle(4, 5, 1)
    g.fillCircle(12, 6, 1)
    g.generateTexture('crop', 16, 16)
    g.clear()

    // ── Forest bush ─────────────────────────────────────────────────────────────
    g.fillStyle(0x16401a)
    g.fillCircle(12, 20, 12); g.fillCircle(26, 20, 13); g.fillCircle(19, 13, 12)
    g.fillStyle(0x2a6a24, 0.7)
    g.fillCircle(15, 14, 7); g.fillCircle(23, 16, 6)
    g.fillStyle(0xcc3355, 0.9)               // berries
    g.fillCircle(10, 18, 1.6); g.fillCircle(27, 22, 1.6); g.fillCircle(19, 24, 1.6)
    g.generateTexture('bush', 38, 34)
    g.clear()

    // ── Flower (tinted per placement) ─────────────────────────────────────────
    g.fillStyle(0x2a6e1e)
    g.fillRect(6, 9, 1.5, 7)                 // stem
    g.fillStyle(0xf2f2f2)                     // petals
    g.fillCircle(6, 2, 2.2); g.fillCircle(9, 5, 2.2); g.fillCircle(8, 8, 2.2)
    g.fillCircle(4, 8, 2.2); g.fillCircle(3, 5, 2.2)
    g.fillStyle(0xffcc33)                     // center
    g.fillCircle(6, 5, 2)
    g.generateTexture('flower', 13, 16)
    g.clear()

    // ── Mushroom ────────────────────────────────────────────────────────────────
    g.fillStyle(0xede0c8)
    g.fillRect(6, 8, 4, 8)                    // stem
    g.fillStyle(0xcc3322)
    g.fillEllipse(8, 7, 16, 10)              // cap
    g.fillStyle(0xffffff, 0.8)               // spots
    g.fillCircle(5, 6, 1.6); g.fillCircle(11, 7, 1.4); g.fillCircle(8, 4, 1.4)
    g.generateTexture('mushroom', 16, 18)
    g.clear()

    // ── Glowing mushroom (enchanted) ──────────────────────────────────────────
    g.fillStyle(0xddeeff)
    g.fillRect(6, 8, 4, 8)
    g.fillStyle(0x33aaff)
    g.fillEllipse(8, 7, 16, 10)
    g.fillStyle(0xaaffff, 0.85)
    g.fillCircle(8, 6, 3)
    g.generateTexture('mushroom_glow', 16, 18)
    g.clear()

    // ── Reed / cattail (riverbank) ────────────────────────────────────────────
    g.fillStyle(0x2e6a24)
    g.fillRect(3, 4, 1.5, 24); g.fillRect(7, 2, 1.5, 26); g.fillRect(11, 6, 1.5, 22)
    g.fillStyle(0x6a4420)
    g.fillRect(6.5, 1, 2.5, 8)               // cattail head
    g.generateTexture('reed', 16, 30)
    g.clear()

    // ── Lily pad ────────────────────────────────────────────────────────────────
    g.fillStyle(0x1e6e2e, 0.95)
    g.fillEllipse(12, 8, 22, 12)
    g.fillStyle(0x2a8e3a, 0.5)
    g.fillEllipse(10, 6, 12, 6)
    g.fillStyle(0xffccee, 0.9)               // tiny flower
    g.fillCircle(15, 6, 2.5)
    g.fillStyle(0xffffff, 0.8)
    g.fillCircle(15, 6, 1.2)
    g.generateTexture('lily', 24, 16)
    g.clear()

    // ── Forest cabin (log lodge) ──────────────────────────────────────────────
    g.fillStyle(0x1e1a12, 0.7)
    g.fillEllipse(36, 61, 60, 12)            // ground shadow
    g.fillStyle(0x6b4a28)                     // log wall
    g.fillRect(8, 30, 56, 32)
    g.lineStyle(1, 0x4a3018, 0.6)             // log courses
    for (let ly = 36; ly < 60; ly += 7) g.lineBetween(8, ly, 64, ly)
    g.fillStyle(0x2a4a1e)                      // mossy roof
    g.fillTriangle(2, 32, 70, 32, 36, 6)
    g.fillStyle(0x3a6a2a, 0.5)                // roof lit side
    g.fillTriangle(36, 6, 70, 32, 44, 32)
    g.fillStyle(0x5a5450)                      // chimney
    g.fillRect(52, 8, 8, 18)
    g.fillStyle(0x2a1808)                      // door
    g.fillRect(30, 44, 14, 18)
    g.fillStyle(0xffcc66, 0.55)               // lit windows
    g.fillRect(14, 40, 9, 9); g.fillRect(49, 40, 9, 9)
    g.lineStyle(1, 0x2a1808, 0.8)
    g.strokeRect(14, 40, 9, 9); g.strokeRect(49, 40, 9, 9)
    g.generateTexture('forest_cabin', 72, 64)
    g.clear()

    // ── Wooden bridge ───────────────────────────────────────────────────────────
    g.fillStyle(0x5a3c1e)
    g.fillRect(6, 8, 64, 74)                  // deck base
    g.fillStyle(0x7a5230)
    for (let py = 10; py < 80; py += 8) g.fillRect(8, py, 60, 6)   // planks
    g.fillStyle(0x3a2410)                      // side rails
    g.fillRect(4, 4, 6, 82); g.fillRect(66, 4, 6, 82)
    g.fillStyle(0x5a3c1e)                      // rail posts
    for (let py = 8; py < 86; py += 20) { g.fillRect(2, py, 10, 6); g.fillRect(64, py, 10, 6) }
    g.generateTexture('bridge', 76, 90)
    g.clear()

    // ── Volcanic ground ───────────────────────────────────────────────────────
    tile('t_volcanic', 0x1e0806, 0x2a0c06)   // dark scorched rock
    tile('t_lava',     0x7a1e00, 0x992800)   // molten lava tile

    // ── Volcanic rock — cracked obsidian boulder ──────────────────────────────
    g.fillStyle(0x120808)
    g.fillEllipse(22, 18, 40, 26)
    g.fillStyle(0x1e0e0e)
    g.fillEllipse(20, 14, 30, 19)
    g.lineStyle(1.5, 0xff3300, 0.45)
    g.lineBetween(10, 20, 7, 30)
    g.lineBetween(26, 15, 32, 28)
    g.lineBetween(14, 24, 18, 32)
    g.fillStyle(0xff4400, 0.20)
    g.fillEllipse(22, 26, 30, 12)    // lava seam glow underneath
    g.generateTexture('lava_rock', 44, 36)
    g.clear()

    // ── Obsidian spire — dark crystalline formation ──────────────────────────
    g.fillStyle(0x080510)
    g.fillTriangle(12, 0, 0, 42, 24, 42)
    g.fillStyle(0x12082a)
    g.fillTriangle(12, 2, 7, 42, 12, 42)
    g.fillStyle(0x200e40, 0.55)
    g.fillTriangle(12, 2, 14, 42, 24, 42)
    g.lineStyle(1, 0x6622bb, 0.35)
    g.lineBetween(12, 2, 8, 42)
    g.fillStyle(0x4411aa, 0.14)
    g.fillCircle(12, 22, 13)
    g.generateTexture('obsidian_spire', 24, 42)
    g.clear()

    // ── Ash mound — grey-white debris pile ───────────────────────────────────
    g.fillStyle(0x2a2822)
    g.fillEllipse(18, 14, 32, 20)
    g.fillStyle(0x3e3c36, 0.75)
    g.fillEllipse(16, 12, 24, 15)
    g.fillStyle(0x555248, 0.4)
    g.fillEllipse(14, 10, 14, 8)
    g.generateTexture('ash_mound', 36, 28)
    g.clear()

    // ── Dungeon portal ────────────────────────────────────────────────────────
    g.fillStyle(0x3a3a44)
    g.fillRect(0, 8, 8, 40)           // left pillar
    g.fillRect(32, 8, 8, 40)          // right pillar
    g.fillRect(0, 0, 40, 12)          // arch top
    g.fillStyle(0x0d0a1a)
    g.fillRect(8, 8, 24, 40)          // portal interior
    g.fillStyle(0x3311aa, 0.6)
    g.fillRect(10, 12, 20, 32)        // inner glow
    g.fillStyle(0x8844ff, 0.35)
    g.fillRect(14, 18, 12, 20)        // bright core
    g.lineStyle(2, 0x6644cc, 0.9)
    g.strokeRect(0, 0, 40, 48)
    g.generateTexture('dungeon_portal', 40, 48)
    g.clear()

    g.destroy()
  }

  // ── Terrain ────────────────────────────────────────────────────────────────

  private buildTerrain() {
    const S  = this.size
    const WW = this.worldW
    const add = (x: number, y: number, w: number, h: number, key: string, depth = 0) =>
      this.scene.add.tileSprite(x, y, w, h, key).setOrigin(0).setDepth(depth)

    // Base — plains across the full world width
    add(0, 0, WW, S, 't_plains')

    // Zone overlays (original 3600-wide zones)
    add(0,    2500, S,    1100, 't_forest',  0.1)   // Beginner Forest (bottom)
    add(0,    0,    S,    1100, 't_frozen',  0.1)   // Frozen Ruins (top)
    add(0,    1100, 1500, 1400, 't_corrupt', 0.1)   // Corrupted Fields (left)
    add(2100, 1100, 1500, 1400, 't_arcane',  0.1)   // Arcane Caves (right)

    // ── Volcanic Wastes (x: 3600–5400) ───────────────────────────────────────
    add(3600, 0,    1800, S,    't_volcanic', 0.1)   // full-height volcanic ground
    // Lava flow strips — brighter channels running through the zone
    add(3780, 0,    110,  S,    't_lava',    0.08)
    add(4200, 200,  80,   1100, 't_lava',    0.09)
    add(4650, 800,  90,   900,  't_lava',    0.08)
    add(5050, 0,    120,  1600, 't_lava',    0.09)
    add(4480, 2200, 100,  1400, 't_lava',    0.08)
    add(3900, 2800, 85,   800,  't_lava',    0.09)
    // Approach zone softening — slightly cooler tones near Arcane Caves border
    add(3600, 2200, 300,  1400, 't_arcane',  0.06)

    // Snow drifts over frozen ruins
    add(0,    0,    900,  400,  't_snow', 0.13)
    add(800,  200,  700,  500,  't_snow', 0.10)
    add(2200, 0,    800,  350,  't_snow', 0.11)
    add(2900, 300,  700,  600,  't_snow', 0.09)
    add(1400, 600,  500,  400,  't_snow', 0.10)

    // Central clearing — slightly warmer neutral plains, drawn on top
    const cw = 680, ch = 680
    add(this.cx - cw / 2, this.cy - ch / 2, cw, ch, 't_plains', 0.15)
  }

  // ── Decorative details (no physics) ───────────────────────────────────────

  private buildDecor() {
    const S = this.size
    const g = this.scene.add.graphics().setDepth(0.05)

    // ── Beginner Forest — mossy patches ──────────────────────────────────────
    g.fillStyle(0x0e1e0e, 0.3)
    for (let i = 0; i < 40; i++) {
      const x = Phaser.Math.FloatBetween(60, S - 60)
      const y = Phaser.Math.FloatBetween(2560, 3540)
      g.fillCircle(x, y, Phaser.Math.Between(10, 28))
    }
    g.fillStyle(0x22441a, 0.18)
    for (let i = 0; i < 20; i++) {
      const x = Phaser.Math.FloatBetween(100, S - 100)
      const y = Phaser.Math.FloatBetween(2620, 3480)
      g.fillEllipse(x, y, Phaser.Math.Between(30, 80), Phaser.Math.Between(10, 24))
    }

    // ── Frozen Ruins — glacial overhaul ──────────────────────────────────────

    // Glacial lakes / frozen ponds — large bright-blue translucent sheets
    const lakes: [number, number, number, number][] = [
      [380,  180, 280, 110], [1050, 420, 380, 130], [2080, 150, 320, 120],
      [2750, 480, 260,  95], [1650, 780, 300, 100], [3180, 250, 260, 100],
      [600,  700, 220,  80], [3400, 700, 200,  85], [1800, 350, 180,  70],
    ]
    // Deep ice base (darker, shows depth)
    g.fillStyle(0x3a7aaa, 0.38)
    for (const [lx, ly, lw, lh] of lakes) g.fillEllipse(lx, ly, lw, lh)
    // Ice surface (brighter, reflective shimmer)
    g.fillStyle(0x88cce8, 0.30)
    for (const [lx, ly, lw, lh] of lakes) g.fillEllipse(lx, ly, lw * 0.85, lh * 0.72)
    // Bright specular highlight on lakes
    g.fillStyle(0xddf2ff, 0.22)
    for (const [lx, ly, lw, lh] of lakes) g.fillEllipse(lx - lw * 0.12, ly - lh * 0.14, lw * 0.4, lh * 0.32)

    // Deep ice crevasses — bold branching cracks
    g.lineStyle(3, 0x2a6090, 0.80)
    for (let i = 0; i < 18; i++) {
      const x = Phaser.Math.FloatBetween(80, S - 80)
      const y = Phaser.Math.FloatBetween(50, 1050)
      const dx = Phaser.Math.Between(-90, 90)
      const dy = Phaser.Math.Between(-55, 55)
      g.lineBetween(x, y, x + dx, y + dy)
      // Branch
      g.lineBetween(x + dx * 0.5, y + dy * 0.5,
        x + dx * 0.5 + Phaser.Math.Between(-40, 40),
        y + dy * 0.5 + Phaser.Math.Between(-30, 30))
    }
    // Thinner surface cracks network
    g.lineStyle(1, 0x5599bb, 0.55)
    for (let i = 0; i < 50; i++) {
      const x = Phaser.Math.FloatBetween(60, S - 60)
      const y = Phaser.Math.FloatBetween(30, 1070)
      g.lineBetween(x, y, x + Phaser.Math.Between(-28, 28), y + Phaser.Math.Between(-18, 18))
    }
    // Hairline frost cracks
    g.lineStyle(1, 0x99ccdd, 0.28)
    for (let i = 0; i < 80; i++) {
      const x = Phaser.Math.FloatBetween(40, S - 40)
      const y = Phaser.Math.FloatBetween(20, 1080)
      g.lineBetween(x, y, x + Phaser.Math.Between(-14, 14), y + Phaser.Math.Between(-10, 10))
    }

    // Snow drifts — piled along wind direction (south-east sweep)
    g.fillStyle(0xe8f4ff, 0.55)
    for (let i = 0; i < 38; i++) {
      const x = Phaser.Math.FloatBetween(60, S - 60)
      const y = Phaser.Math.FloatBetween(40, 1060)
      g.fillEllipse(x, y, Phaser.Math.Between(60, 220), Phaser.Math.Between(8, 24))
    }
    // Bright compressed snow at edges/obstacles
    g.fillStyle(0xf0faff, 0.40)
    for (let i = 0; i < 22; i++) {
      const x = Phaser.Math.FloatBetween(50, S - 50)
      const y = Phaser.Math.FloatBetween(30, 1070)
      g.fillEllipse(x, y, Phaser.Math.Between(18, 60), Phaser.Math.Between(5, 14))
    }

    // Ruined building footprints buried under ice/snow
    const ruins: [number, number, number, number][] = [
      [250, 200, 120, 80], [820, 550, 160, 90], [1650, 250, 100, 140],
      [2300, 650, 180, 80], [3100, 420, 130, 100], [1200, 900, 150, 70],
      [2700, 200, 110, 130], [3380, 820, 140, 80],
    ]
    // Stone wall remnants (grey under snow)
    g.fillStyle(0x6a7e8a, 0.30)
    for (const [rx, ry, rw, rh] of ruins) {
      g.fillRect(rx - rw / 2, ry - rh / 2, rw, rh)
      // Snow covering the top of the walls
      g.fillStyle(0xdeedf8, 0.45)
      g.fillRect(rx - rw / 2, ry - rh / 2, rw, 8)
      g.fillRect(rx - rw / 2, ry - rh / 2, 8, rh)
      g.fillStyle(0x6a7e8a, 0.30)
    }

    // Ice sheet shimmer — scattered white highlights across the whole zone
    g.fillStyle(0xffffff, 0.12)
    for (let i = 0; i < 60; i++) {
      const x = Phaser.Math.FloatBetween(30, S - 30)
      const y = Phaser.Math.FloatBetween(20, 1080)
      const r = Phaser.Math.Between(4, 22)
      g.fillEllipse(x, y, r * 3, r)
    }

    // ── Corrupted Fields — dark pools and corruption veins ────────────────────
    g.lineStyle(2, 0x440000, 0.6)
    for (let i = 0; i < 22; i++) {
      const x = Phaser.Math.FloatBetween(70, 1430)
      const y = Phaser.Math.FloatBetween(1160, 2430)
      g.lineBetween(x, y, x + Phaser.Math.Between(-45, 45), y + Phaser.Math.Between(-35, 35))
    }
    g.fillStyle(0x1a0000, 0.58)
    for (const [px, py, rw, rh] of [
      [300, 1400, 100, 38], [820, 1780, 120, 44], [480, 2200, 80, 32],
      [1100, 1620, 90, 36], [220, 2420,  70, 28], [650, 2050, 85, 34],
    ]) g.fillEllipse(px, py, rw, rh)

    // ── Arcane Caves — rune circles and arcane pools ──────────────────────────
    g.lineStyle(1, 0x6622aa, 0.38)
    for (let i = 0; i < 9; i++) {
      const cx = Phaser.Math.FloatBetween(2200, 3500)
      const cy = Phaser.Math.FloatBetween(1200, 2400)
      const r  = Phaser.Math.Between(28, 80)
      g.strokeCircle(cx, cy, r)
      for (let j = 0; j < 3; j++) {
        const angle = (j / 3) * Math.PI * 2
        g.lineBetween(cx, cy, cx + Math.cos(angle) * r, cy + Math.sin(angle) * r)
      }
    }
    g.fillStyle(0x220044, 0.45)
    for (const [px, py, rw, rh] of [
      [2420, 1400, 100, 40], [2950, 1780, 80, 32], [3220, 1520, 110, 42],
      [2640, 2180, 90, 36],  [3420, 2300, 76, 30],
    ]) g.fillEllipse(px, py, rw, rh)

    // ── Paths from town center to each zone ──────────────────────────────────
    const pathColor = 0x2a2e1a
    g.fillStyle(pathColor, 0.42)
    // South — toward Beginner Forest
    g.fillRect(this.cx - 22, this.cy + 220, 44, S * 0.5 - 220)
    // North — toward Frozen Ruins
    g.fillRect(this.cx - 22, 0, 44, this.cy - 220)
    // West — toward Corrupted Fields
    g.fillRect(0, this.cy - 22, this.cx - 220, 44)
    // East — toward Arcane Caves
    g.fillRect(this.cx + 220, this.cy - 22, S - (this.cx + 220), 44)

    // Path edges (slightly lighter) to give road a defined edge
    g.fillStyle(0x363c22, 0.25)
    g.fillRect(this.cx - 28, this.cy + 220, 6, S * 0.5 - 220)
    g.fillRect(this.cx + 22, this.cy + 220, 6, S * 0.5 - 220)
    g.fillRect(this.cx - 28, 0, 6, this.cy - 220)
    g.fillRect(this.cx + 22, 0, 6, this.cy - 220)

    // ── Town square — cobblestone circle ──────────────────────────────────────
    g.fillStyle(0x2c2c28, 0.5)
    g.fillCircle(this.cx, this.cy, 220)
    g.lineStyle(2, 0x3a3a34, 0.35)
    g.strokeCircle(this.cx, this.cy, 220)
    g.strokeCircle(this.cx, this.cy, 140)
    g.lineBetween(this.cx - 220, this.cy, this.cx + 220, this.cy)
    g.lineBetween(this.cx, this.cy - 220, this.cx, this.cy + 220)

    // ── Town fence ring ───────────────────────────────────────────────────────
    g.lineStyle(4, 0x4a3018, 0.5)
    g.strokeCircle(this.cx, this.cy, 310)
    g.lineStyle(2, 0x6a4828, 0.28)
    g.strokeCircle(this.cx, this.cy, 316)

    // ── Zone danger markers at path entry points ───────────────────────────────
    g.lineStyle(3, 0xcc3322, 0.28)
    // North path border (Frozen Ruins)
    g.lineBetween(this.cx - 80, 1100, this.cx + 80, 1100)
    // South path border (Beginner Forest)
    g.lineBetween(this.cx - 80, 2500, this.cx + 80, 2500)
    // West (Corrupted Fields)
    g.lineBetween(1500, this.cy - 80, 1500, this.cy + 80)
    // East (Arcane Caves)
    g.lineBetween(2100, this.cy - 80, 2100, this.cy + 80)

    // ── Zone gate seals — glowing barriers at locked zone entries ─────────────
    const gateG = this.scene.add.graphics().setDepth(3.6)

    // Frozen Ruins gate (north path) — icy blue seal
    gateG.lineStyle(4, 0x44aaff, 0.75)
    gateG.lineBetween(this.cx - 70, 1102, this.cx + 70, 1102)
    gateG.lineStyle(2, 0x88ddff, 0.45)
    gateG.lineBetween(this.cx - 70, 1098, this.cx + 70, 1098)
    gateG.lineBetween(this.cx - 70, 1106, this.cx + 70, 1106)
    // Rune diamonds along the seal
    for (const dx of [-40, 0, 40]) {
      gateG.fillStyle(0x88ddff, 0.6)
      gateG.fillTriangle(this.cx + dx, 1095, this.cx + dx - 5, 1102, this.cx + dx + 5, 1102)
      gateG.fillTriangle(this.cx + dx, 1109, this.cx + dx - 5, 1102, this.cx + dx + 5, 1102)
    }

    // Corrupted Fields gate (west path) — blood-red seal
    gateG.lineStyle(4, 0xcc2222, 0.75)
    gateG.lineBetween(1498, this.cy - 70, 1498, this.cy + 70)
    gateG.lineStyle(2, 0xff4444, 0.45)
    gateG.lineBetween(1494, this.cy - 70, 1494, this.cy + 70)
    gateG.lineBetween(1502, this.cy - 70, 1502, this.cy + 70)
    for (const dy of [-40, 0, 40]) {
      gateG.fillStyle(0xff5555, 0.6)
      gateG.fillTriangle(1491, this.cy + dy, 1498, this.cy + dy - 5, 1498, this.cy + dy + 5)
      gateG.fillTriangle(1505, this.cy + dy, 1498, this.cy + dy - 5, 1498, this.cy + dy + 5)
    }

    // Arcane Caves gate (east path) — purple arcane seal
    gateG.lineStyle(4, 0xaa44ff, 0.75)
    gateG.lineBetween(2102, this.cy - 70, 2102, this.cy + 70)
    gateG.lineStyle(2, 0xcc88ff, 0.45)
    gateG.lineBetween(2098, this.cy - 70, 2098, this.cy + 70)
    gateG.lineBetween(2106, this.cy - 70, 2106, this.cy + 70)
    for (const dy of [-40, 0, 40]) {
      gateG.fillStyle(0xcc88ff, 0.6)
      gateG.fillTriangle(2095, this.cy + dy, 2102, this.cy + dy - 5, 2102, this.cy + dy + 5)
      gateG.fillTriangle(2109, this.cy + dy, 2102, this.cy + dy - 5, 2102, this.cy + dy + 5)
    }

    // Lock icons (🔒) as text above each gate
    const lockStyle = {
      fontSize: '14px', fontFamily: 'system-ui', color: '#ffffff',
      stroke: '#000000', strokeThickness: 3,
    }
    this.scene.add.text(this.cx, 1082, '🔒 Frozen Ruins', lockStyle)
      .setOrigin(0.5, 1).setDepth(3.7)
    this.scene.add.text(1497, this.cy, '🔒', lockStyle)
      .setOrigin(1, 0.5).setDepth(3.7)
    this.scene.add.text(2103, this.cy, '🔒', lockStyle)
      .setOrigin(0, 0.5).setDepth(3.7)

    // ── Extended east path — from Arcane Caves into Volcanic Wastes ───────────
    g.fillStyle(0x1a0e06, 0.50)
    g.fillRect(3600, this.cy - 22, 1800, 44)
    g.fillStyle(0x280e06, 0.28)
    g.fillRect(3600, this.cy - 28, 1800, 6)
    g.fillRect(3600, this.cy + 22, 1800, 6)

    // ── Volcanic Wastes gate seal (east wall of Arcane Caves) ────────────────
    gateG.lineStyle(4, 0xff4400, 0.80)
    gateG.lineBetween(3598, this.cy - 70, 3598, this.cy + 70)
    gateG.lineStyle(2, 0xff8844, 0.50)
    gateG.lineBetween(3594, this.cy - 70, 3594, this.cy + 70)
    gateG.lineBetween(3602, this.cy - 70, 3602, this.cy + 70)
    for (const dy of [-40, 0, 40]) {
      gateG.fillStyle(0xff5500, 0.65)
      gateG.fillTriangle(3591, this.cy + dy, 3598, this.cy + dy - 5, 3598, this.cy + dy + 5)
      gateG.fillTriangle(3605, this.cy + dy, 3598, this.cy + dy - 5, 3598, this.cy + dy + 5)
    }
    this.scene.add.text(3599, this.cy, '🔒', lockStyle).setOrigin(0, 0.5).setDepth(3.7)

    // ── Zone transition softeners (blend strips at zone edges) ────────────────
    // Frozen/central gradient (y ~1050–1150)
    g.fillStyle(0x88ccff, 0.06)
    g.fillRect(0, 1020, S, 80)
    // Central/Beginner Forest gradient (y ~2450–2550)
    g.fillStyle(0x002200, 0.07)
    g.fillRect(0, 2450, S, 80)
    // Corrupted/central vertical gradient (x ~1450–1550)
    g.fillStyle(0x220000, 0.06)
    g.fillRect(1420, 1100, 80, 1400)
    // Arcane/central vertical gradient (x ~2060–2160)
    g.fillStyle(0x110022, 0.06)
    g.fillRect(2060, 1100, 80, 1400)
    // Arcane/Volcanic transition (x ~3560–3640)
    g.fillStyle(0x3a0a00, 0.09)
    g.fillRect(3560, 1100, 80, 1400)

    // ── Volcanic Wastes decor ─────────────────────────────────────────────────
    // Zone-wide ash floor texture (random light grey patches)
    g.fillStyle(0x1c1816, 0.30)
    for (let i = 0; i < 60; i++) {
      const ax = Phaser.Math.FloatBetween(3620, 5380)
      const ay = Phaser.Math.FloatBetween(20, 3580)
      g.fillEllipse(ax, ay, Phaser.Math.Between(40, 140), Phaser.Math.Between(14, 40))
    }
    // Bright ash soot patches
    g.fillStyle(0x2e2a24, 0.25)
    for (let i = 0; i < 40; i++) {
      const ax = Phaser.Math.FloatBetween(3640, 5360)
      const ay = Phaser.Math.FloatBetween(30, 3560)
      g.fillEllipse(ax, ay, Phaser.Math.Between(20, 70), Phaser.Math.Between(8, 20))
    }

    // Lava rivers — flowing channels of molten rock
    const lavaRivers: [number, number, number, number][] = [
      [3800, 0,    3800, 3600],   // near-border river runs full height
      [4250, 180,  4250, 1200],   // summit to core river
      [4700, 750,  4700, 1700],   // core mid-river
      [5080, 0,    5080, 1600],   // far east river
      [4480, 2180, 4480, 3600],   // approach river
      [3940, 2750, 3940, 3600],   // approach entry river
    ]
    g.lineStyle(14, 0x8a2200, 0.75)
    for (const [x1, y1, x2, y2] of lavaRivers) {
      g.lineBetween(x1, y1, x2, y2)
    }
    g.lineStyle(7, 0xdd4400, 0.60)
    for (const [x1, y1, x2, y2] of lavaRivers) {
      g.lineBetween(x1, y1, x2, y2)
    }
    g.lineStyle(3, 0xff8800, 0.45)
    for (const [x1, y1, x2, y2] of lavaRivers) {
      g.lineBetween(x1, y1, x2, y2)
    }

    // Lava pools — bright rounded pools at low points
    const lavaPools: [number, number, number, number][] = [
      [3800, 420,  220, 80],  [4280, 640,  180, 70],
      [4760, 300,  260, 90],  [5100, 980,  200, 75],
      [3980, 1650, 240, 85],  [4620, 1980, 190, 70],
      [5200, 1440, 210, 78],  [4100, 2500, 230, 82],
      [4700, 2900, 200, 72],  [3850, 3200, 180, 65],
    ]
    g.fillStyle(0x6a1800, 0.70)
    for (const [lx, ly, lw, lh] of lavaPools) g.fillEllipse(lx, ly, lw, lh)
    g.fillStyle(0xaa3300, 0.55)
    for (const [lx, ly, lw, lh] of lavaPools) g.fillEllipse(lx, ly, lw * 0.75, lh * 0.70)
    g.fillStyle(0xff6600, 0.25)
    for (const [lx, ly, lw, lh] of lavaPools) g.fillEllipse(lx - lw * 0.10, ly - lh * 0.12, lw * 0.38, lh * 0.30)

    // Volcanic cracks in the ground
    g.lineStyle(2, 0xaa2200, 0.65)
    for (let i = 0; i < 55; i++) {
      const cx = Phaser.Math.FloatBetween(3640, 5360)
      const cy = Phaser.Math.FloatBetween(30, 3560)
      const dx = Phaser.Math.Between(-70, 70)
      const dy = Phaser.Math.Between(-50, 50)
      g.lineBetween(cx, cy, cx + dx, cy + dy)
      g.lineBetween(cx + dx * 0.5, cy + dy * 0.5,
        cx + dx * 0.5 + Phaser.Math.Between(-30, 30),
        cy + dy * 0.5 + Phaser.Math.Between(-25, 25))
    }
    g.lineStyle(1, 0xff3300, 0.30)
    for (let i = 0; i < 80; i++) {
      const cx = Phaser.Math.FloatBetween(3640, 5360)
      const cy = Phaser.Math.FloatBetween(30, 3560)
      g.lineBetween(cx, cy, cx + Phaser.Math.Between(-22, 22), cy + Phaser.Math.Between(-16, 16))
    }

    // Volcanic cliffs — dark ridge lines suggesting elevation
    g.lineStyle(6, 0x0a0402, 0.70)
    for (const [cx, cy, cw] of [
      [4000, 500, 500], [4550, 200, 400], [5000, 700, 450],
      [3950, 1600, 380], [4600, 1200, 420], [5150, 1800, 360],
      [4200, 2600, 400], [4800, 2400, 350], [3900, 3100, 300],
    ] as [number, number, number][]) {
      g.lineBetween(cx - cw / 2, cy, cx + cw / 2, cy)
      g.lineBetween(cx - cw / 2, cy + 8, cx + cw / 2, cy + 8)
    }
    g.lineStyle(2, 0x200808, 0.50)
    for (const [cx, cy, cw] of [
      [4000, 500, 500], [4550, 200, 400], [5000, 700, 450],
      [3950, 1600, 380], [4600, 1200, 420], [5150, 1800, 360],
    ] as [number, number, number][]) {
      g.lineBetween(cx - cw / 2, cy + 18, cx + cw / 2, cy + 18)
    }

    // Summit crater — central visual anchor of the volcano
    g.fillStyle(0x380800, 0.80)
    g.fillEllipse(4800, 420, 420, 220)
    g.fillStyle(0x220400, 0.90)
    g.fillEllipse(4800, 420, 280, 150)
    g.fillStyle(0x8a1800, 0.60)
    g.fillEllipse(4800, 420, 160, 85)
    g.fillStyle(0xdd3300, 0.40)
    g.fillEllipse(4800, 420, 80, 44)
    g.fillStyle(0xff8800, 0.30)
    g.fillEllipse(4800, 420, 36, 20)
    // Crater rim
    g.lineStyle(8, 0x1a0500, 0.85)
    g.strokeEllipse(4800, 420, 420, 220)
    g.lineStyle(3, 0xff4400, 0.20)
    g.strokeEllipse(4800, 420, 410, 215)

    // Waystation sign pointing to volcanic zone (placed inside Arcane Caves near east border)
    this.scene.add.text(3450, this.cy - 60, 'Volcanic Wastes ►', {
      fontSize: '12px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      color: '#ff6622', stroke: '#000', strokeThickness: 4,
    }).setDepth(4).setOrigin(0.5)
    this.scene.add.text(3450, this.cy - 44, '☠ Extreme Danger', {
      fontSize: '10px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      color: '#cc2200', stroke: '#000', strokeThickness: 3,
    }).setDepth(4).setOrigin(0.5)

    // ── Improved Beginner Forest — landmarks and clearings ────────────────────
    // Ancient stone shrine clearing
    g.fillStyle(0x1a2e12, 0.35)
    g.fillCircle(900, 3220, 55)
    g.lineStyle(2, 0x446633, 0.30)
    g.strokeCircle(900, 3220, 55)
    // Stone path leading to shrine
    g.fillStyle(0x2a2a1e, 0.35)
    for (let i = 0; i < 6; i++) {
      g.fillRect(895, 3160 + i * 12, 10, 8)
    }

    // Forest glades (light patches where sun breaks through)
    g.fillStyle(0x1e3a14, 0.20)
    for (const [gx, gy] of [[1600, 3350], [2800, 3150], [500, 3450]]) {
      g.fillEllipse(gx, gy, 120, 80)
    }

    // ── Improved Frozen Ruins — more ruins detail ─────────────────────────────
    // Frozen statue silhouette
    g.fillStyle(0x8ab2cc, 0.45)
    g.fillRect(1790, 340, 18, 55)     // frozen figure body
    g.fillCircle(1800, 335, 12)       // head
    g.fillStyle(0xaacce0, 0.30)
    g.fillRect(1776, 352, 50, 8)      // outstretched arms

    // Ruined tower stumps
    for (const [rx, ry] of [[650, 180], [2950, 350], [3250, 780]]) {
      g.fillStyle(0x6a7e8a, 0.45)
      g.fillRect(rx - 20, ry - 40, 40, 40)
      g.fillStyle(0x4a5e6a, 0.35)
      g.fillRect(rx - 22, ry - 42, 44, 6)
      g.fillStyle(0xe8f4ff, 0.25)
      g.fillRect(rx - 22, ry - 42, 44, 4)
    }
  }

  // ── Zone architecture — landmark transitions between zones ────────────────

  private buildZoneArchitecture() {
    const g = this.scene.add.graphics().setDepth(2)
    const { cx, cy, size } = this

    // ── Frozen cliff face at y≈1100 (Beginner Forest → Frozen Ruins boundary)
    // A dramatic wall of ice and stone spanning the full world width
    const cliffY = 1100
    // Deep shadow base
    g.fillStyle(0x0a1520, 0.9)
    g.fillRect(0, cliffY - 18, 3600, 36)
    // Main cliff body — layered dark rock
    g.fillStyle(0x1a2a38, 1.0)
    g.fillRect(0, cliffY - 12, 3600, 22)
    // Mid rock band
    g.fillStyle(0x22364a, 0.9)
    g.fillRect(0, cliffY - 8, 3600, 12)
    // Ice/snow highlights along crest
    g.fillStyle(0xc8e8ff, 0.55)
    g.fillRect(0, cliffY - 14, 3600, 4)
    // Jagged rock tooth silhouette — repeating peaks along the cliff top
    g.fillStyle(0x0e1c28, 1.0)
    for (let rx = 40; rx < 3560; rx += 80) {
      const h = 14 + Math.sin(rx * 0.07) * 6 + Math.sin(rx * 0.019) * 8
      const w = 28 + Math.sin(rx * 0.031) * 10
      g.fillTriangle(rx - w / 2, cliffY - 12, rx + w / 2, cliffY - 12, rx, cliffY - 12 - h)
    }
    // Ice rime glint on peaks
    g.fillStyle(0xddf4ff, 0.38)
    for (let rx = 40; rx < 3560; rx += 80) {
      const h = 14 + Math.sin(rx * 0.07) * 6 + Math.sin(rx * 0.019) * 8
      g.fillTriangle(rx - 4, cliffY - 12, rx + 4, cliffY - 12, rx, cliffY - 12 - h + 2)
    }

    // ── Giant frozen stairway on the north path (from town to Frozen Ruins)
    // Located at x≈cx, running from y≈1060 down to y≈1120
    const stairX   = cx
    const stairTopY = cliffY - 48
    const stepW    = 72, stepH = 12, steps = 5
    for (let s = 0; s < steps; s++) {
      const sy   = stairTopY + s * stepH
      const sw   = stepW - s * 8
      // Step body
      g.fillStyle(0x3a5870, 1.0)
      g.fillRect(stairX - sw / 2, sy, sw, stepH - 1)
      // Step highlight
      g.fillStyle(0xaad4f0, 0.5)
      g.fillRect(stairX - sw / 2, sy, sw, 2)
      // Step shadow
      g.fillStyle(0x0a1520, 0.6)
      g.fillRect(stairX - sw / 2, sy + stepH - 3, sw, 3)
    }
    // Stairway gap in cliff (path opening)
    g.fillStyle(0x141e28, 0.95)
    g.fillRect(stairX - 36, cliffY - 16, 72, 18)
    g.fillStyle(0x1a2c3e, 0.85)
    g.fillRect(stairX - 30, cliffY - 14, 60, 12)

    // Twin ice pillars flanking the stairway entrance
    const pillarH = 52
    for (const px of [stairX - 48, stairX + 48]) {
      // Pillar body
      g.fillStyle(0x2c4a62, 1.0)
      g.fillRect(px - 8, stairTopY - pillarH, 16, pillarH)
      // Pillar highlight
      g.fillStyle(0x88ccee, 0.4)
      g.fillRect(px - 8, stairTopY - pillarH, 4, pillarH)
      // Pillar cap — glowing ice crystal
      g.fillStyle(0xaadeee, 0.8)
      g.fillTriangle(px - 10, stairTopY - pillarH, px + 10, stairTopY - pillarH, px, stairTopY - pillarH - 16)
      g.fillStyle(0xeeffff, 0.6)
      g.fillTriangle(px - 4, stairTopY - pillarH, px + 4, stairTopY - pillarH, px, stairTopY - pillarH - 8)
    }

    // ── Stone path edging along the north road (town → cliffY)
    // Cobblestone border markings along x≈cx, from cy down to cliffY
    const pathEdgeG = this.scene.add.graphics().setDepth(1)
    pathEdgeG.lineStyle(2, 0x3a3028, 0.4)
    for (let py = cy - 260; py > cliffY + 40; py -= 48) {
      // Left edge stone
      pathEdgeG.fillStyle(0x2e2820, 0.35)
      pathEdgeG.fillRect(cx - 38, py, 14, 10)
      // Right edge stone
      pathEdgeG.fillRect(cx + 24, py, 14, 10)
    }

    // ── Pre-volcanic scorch zone (x: 3200–3600, y: 0–3600)
    // Heat-baked ground darkens as you approach the volcanic wall
    const scorchG = this.scene.add.graphics().setDepth(1)
    for (let band = 0; band < 4; band++) {
      const bx    = 3200 + band * 100
      const alpha = 0.06 + band * 0.05
      scorchG.fillStyle(0x3a1800, alpha)
      scorchG.fillRect(bx, 0, 100, size)
    }

    // ── Volcanic cliff ridge at x≈3600 (Arcane Caves → Volcanic Wastes)
    // Imposing lava-streaked wall
    const volcX = 3600
    g.fillStyle(0x1a0800, 1.0)
    g.fillRect(volcX - 20, 0, 40, size)
    g.fillStyle(0x3a1000, 0.8)
    g.fillRect(volcX - 14, 0, 28, size)
    // Lava vein streaks
    g.fillStyle(0xff4400, 0.28)
    for (let vy = 0; vy < size; vy += 160) {
      const vw  = 2 + Math.sin(vy * 0.05) * 2
      const vox = Math.sin(vy * 0.023) * 8
      g.fillRect(volcX - 6 + vox, vy + 10, vw, 90)
    }
    // Glowing edge — hot orange glow on volcanic side
    g.fillStyle(0xff6600, 0.12)
    g.fillRect(volcX + 12, 0, 20, size)
    g.fillStyle(0xff3300, 0.08)
    g.fillRect(volcX + 18, 0, 30, size)
    // Jagged rock top teeth on cliff
    g.fillStyle(0x0e0500, 1.0)
    for (let ry = 30; ry < size - 30; ry += 70) {
      const tw = 10 + Math.sin(ry * 0.09) * 4
      const th = 16 + Math.sin(ry * 0.041) * 7
      g.fillTriangle(volcX - 20, ry, volcX - 20, ry + tw, volcX - 20 - th, ry + tw / 2)
    }

    // ── Jagged mountain peaks along the far north (y≈0)
    // Silhouette of the mountain range backdrop
    const peakG = this.scene.add.graphics().setDepth(0.5)
    peakG.fillStyle(0x0a1018, 0.85)
    for (let px = 0; px < 3600; px += 120) {
      const ph = 60 + Math.sin(px * 0.017) * 30 + Math.sin(px * 0.009) * 22
      const pw = 80 + Math.sin(px * 0.023) * 30
      peakG.fillTriangle(px - pw / 2, 0, px + pw / 2, 0, px + pw / 4, -ph)
      // Snow cap
      peakG.fillStyle(0xddeeff, 0.35)
      peakG.fillTriangle(px - pw / 8, 0, px + pw / 8, 0, px + pw / 16, -ph * 0.35)
      peakG.fillStyle(0x0a1018, 0.85)
    }

    // ── Path milestone stones (waypoints at key junctions)
    const msG  = this.scene.add.graphics().setDepth(4)
    const milestones: Array<[number, number, string]> = [
      [cx,        cy - 240,  'FROZEN\nRUINS ↑'],
      [cx - 220,  cy,        '← CORRUPTED\n   FIELDS'],
      [cx + 220,  cy,        'ARCANE\nCAVES →'],
      [cx,        cy + 240,  'BEGINNER\nFOREST ↓'],
      [cx,        cliffY + 30, '↑ RUINS'],
      [3480,      cy,        'VOLCANIC\nWASTES →'],
    ]
    for (const [mx, my, label] of milestones) {
      // Stone slab
      msG.fillStyle(0x3c3028, 0.9)
      msG.fillRect(mx - 18, my - 14, 36, 28)
      msG.fillStyle(0x5a4a38, 0.5)
      msG.fillRect(mx - 18, my - 14, 36, 5)
      // Etched text
      this.scene.add.text(mx, my, label, {
        fontSize: '9px',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        color: '#9a8070',
        align: 'center',
        stroke: '#000',
        strokeThickness: 2,
      }).setDepth(5).setOrigin(0.5, 0.5)
    }
  }

  // ── Town — homestead dressing around the hub (crops, houses, livestock) ───
  //
  // Everything sits in the diagonal corners of the town ring so the N/S/E/W
  // roads stay clear. Houses and the well are solid; crops, hay, fences and
  // chickens are decorative so the player can wander freely through the hub.

  private buildTown() {
    const { cx, cy } = this

    // Solid structure → added to the obstacle group with a base-only body
    const solid = (x: number, y: number, key: string, bw: number, bh: number, ox: number, oy: number) => {
      const o = this.obstacles.create(x, y, key) as Phaser.Physics.Arcade.Sprite
      o.setOrigin(0.5, 1).setDepth(3)
      const body = o.body as Phaser.Physics.Arcade.StaticBody
      body.setSize(bw, bh)
      body.setOffset(ox, oy)
      o.refreshBody()
      return o
    }

    // ── Mage tower (NW corner) — the town landmark ────────────────────────────
    // Body covers the lower shaft only (frame is 60×140, shaft base near y 90+).
    const towerX = cx - 214, towerY = cy - 120
    solid(towerX, towerY, 'mage_tower', 34, 48, 13, 88)

    // Arcane glow radiating from the tower's orb
    const tg = this.scene.add.graphics().setDepth(1.5).setBlendMode(Phaser.BlendModes.ADD)
    tg.fillStyle(0x6622cc, 0.10); tg.fillCircle(towerX, towerY - 132, 70)
    tg.fillStyle(0xaa66ff, 0.07); tg.fillCircle(towerX, towerY - 132, 100)

    // ── Well (SE corner) ──────────────────────────────────────────────────────
    solid(cx + 212, cy + 156, 'well', 36, 12, 4, 34)

    // ── Crop field (SW corner) — tilled soil, sprouts, fence pen ──────────────
    const fX = cx - 196, fY = cy + 168
    const fW = 132, fH = 92

    const soil = this.scene.add.graphics().setDepth(1.7)
    soil.fillStyle(0x3a2a18, 0.9)
    soil.fillRoundedRect(fX - fW / 2, fY - fH / 2, fW, fH, 6)
    soil.fillStyle(0x2a1d10, 0.55)
    for (let r = 0; r < 4; r++) {
      soil.fillRect(fX - fW / 2 + 6, fY - fH / 2 + 12 + r * 20, fW - 12, 4)
    }

    // Sprouts in rows
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 5; col++) {
        const px = fX - fW / 2 + 18 + col * 24 + Phaser.Math.Between(-2, 2)
        const py = fY - fH / 2 + 16 + row * 20 + Phaser.Math.Between(-2, 2)
        this.scene.add.image(px, py, 'crop').setDepth(2).setOrigin(0.5, 1)
      }
    }

    // Fence posts around the field perimeter
    const penPosts: [number, number][] = []
    for (let px = fX - fW / 2; px <= fX + fW / 2; px += 26) {
      penPosts.push([px, fY - fH / 2], [px, fY + fH / 2])
    }
    for (let py = fY - fH / 2 + 26; py < fY + fH / 2; py += 26) {
      penPosts.push([fX - fW / 2, py], [fX + fW / 2, py])
    }
    for (const [px, py] of penPosts) {
      this.scene.add.image(px, py, 'fence_post').setDepth(2.2).setOrigin(0.5, 1)
    }

    // ── Hay bales + crates (storage near the well) ────────────────────────────
    const props: [number, number, string][] = [
      [cx + 168, cy + 132, 'hay'],
      [cx + 196, cy + 118, 'hay'],
      [cx + 150, cy + 158, 'crate'],
      [cx + 168, cy + 162, 'crate'],
      [cx - 168, cy - 116, 'crate'],
      [cx - 150, cy - 108, 'crate'],
    ]
    for (const [px, py, key] of props) {
      this.scene.add.image(px, py, key).setDepth(2.5).setOrigin(0.5, 1)
    }

    // ── Chickens — pecking and milling around the field and coop ──────────────
    const chickenSpots: [number, number][] = [
      [cx - 150, cy + 150], [cx - 110, cy + 200], [cx - 220, cy + 130],
      [cx + 130, cy + 150], [cx + 180, cy + 190], [cx - 60, cy + 180],
    ]
    for (const [px, py] of chickenSpots) {
      this.chickenPositions.push({ x: px, y: py })
      const chick = this.scene.add.image(px, py, 'chicken').setDepth(3).setOrigin(0.5, 1)
      if (Math.random() < 0.5) chick.setFlipX(true)
      // Pecking bob
      this.scene.tweens.add({
        targets: chick, scaleY: 0.82, duration: 380,
        yoyo: true, repeat: -1, ease: 'Sine.InOut',
        delay: Phaser.Math.Between(0, 1200),
      })
      // Lazy wander back and forth
      this.scene.tweens.add({
        targets: chick,
        x: px + Phaser.Math.Between(-28, 28),
        y: py + Phaser.Math.Between(-18, 18),
        duration: Phaser.Math.Between(2200, 3400),
        yoyo: true, repeat: -1, hold: Phaser.Math.Between(500, 1400),
        repeatDelay: Phaser.Math.Between(400, 1200), ease: 'Sine.InOut',
      })
    }
  }

  // ── River — meandering water band drawn from a parametric centerline ──────

  private drawRiver(center: (x: number) => number, x0: number, x1: number, hw: number) {
    const mk = (half: number) => {
      const top: Phaser.Math.Vector2[] = []
      const bot: Phaser.Math.Vector2[] = []
      for (let x = x0; x <= x1; x += 16) {
        const y = center(x)
        top.push(new Phaser.Math.Vector2(x, y - half))
        bot.push(new Phaser.Math.Vector2(x, y + half))
      }
      return top.concat(bot.reverse())
    }
    const rg = this.scene.add.graphics().setDepth(0.6)
    rg.fillStyle(0x3a3420, 0.45); rg.fillPoints(mk(hw + 12), true)   // muddy bank
    rg.fillStyle(0x16414a, 0.92); rg.fillPoints(mk(hw),      true)   // deep water
    rg.fillStyle(0x2c747e, 0.70); rg.fillPoints(mk(hw * 0.6), true)  // mid water
    rg.fillStyle(0x6fb8c0, 0.32); rg.fillPoints(mk(hw * 0.28), true) // light core
    rg.fillStyle(0xcdeef2, 0.22)                                     // surface shimmer
    for (let x = x0 + 24; x < x1; x += 70) {
      const y = center(x)
      rg.fillEllipse(x, y - 4, 20, 5)
    }
  }

  // ── River particle layers ─────────────────────────────────────────────────
  //
  // Three layers stacked on the water graphics:
  //   1. Surface shimmer  — tiny ADD-blend dots flowing downstream
  //   2. Rising mist      — large, near-transparent puffs lifting off the water
  //   3. Foam wisps       — bright white sparkles near the centre channel

  private addRiverParticles(center: (x: number) => number, x0: number, x1: number, hw: number) {
    const scene = this.scene
    const wide  = hw >= 30   // main river vs small creek
    const step  = wide ? 340 : 480

    for (let x = x0 + 60; x < x1 - 60; x += step) {
      const y = center(x)

      // ── 1. Surface shimmer — flows rightward, ADD blend ────────────────────
      scene.add.particles(x, y, 'particle', {
        speedX:    { min: 28, max: 72 },
        speedY:    { min: -10, max: 10 },
        lifespan:  { min: 1600, max: 2600 },
        frequency: 240,
        quantity:  1,
        scale:     { start: wide ? 0.28 : 0.16, end: 0.04 },
        alpha:     { start: 0.75, end: 0 },
        tint:      [0xffffff, 0xb8eeff, 0x66ccee],
        blendMode: 'ADD',
      }).setDepth(0.65)

      // ── 2. Rising mist — every other station only ─────────────────────────
      if (wide && ((x - x0) % (step * 2) < step)) {
        scene.add.particles(x, y - hw * 0.4, 'particle', {
          speedX:    { min: -8, max: 8 },
          speedY:    { min: -30, max: -10 },
          lifespan:  { min: 1400, max: 2200 },
          frequency: 480,
          quantity:  1,
          scale:     { start: 2.2, end: 0 },
          alpha:     { start: 0.10, end: 0 },
          tint:      [0xddf4ff, 0xffffff],
        }).setDepth(0.7)
      }

      // ── 3. Foam wisps — bright near the centre, short-lived ───────────────
      scene.add.particles(x + Phaser.Math.Between(-40, 40), y, 'particle', {
        speedX:    { min: 10, max: 40 },
        speedY:    { min: -6, max: 6 },
        lifespan:  { min: 800, max: 1400 },
        frequency: 360,
        quantity:  1,
        scale:     { start: wide ? 0.38 : 0.22, end: 0 },
        alpha:     { start: 0.55, end: 0 },
        tint:      [0xffffff, 0xe8f8ff],
        blendMode: 'ADD',
      }).setDepth(0.68)
    }
  }

  // ── Beginner Forest dressing — rivers, bushes, flowers, a cabin ───────────

  private buildForest() {
    const S = this.size

    // ── Rivers ────────────────────────────────────────────────────────────────
    const mainRiver  = (x: number) => 3060 + Math.sin(x * 0.0024) * 85 + Math.sin(x * 0.0009) * 40
    const creek      = (x: number) => 3400 + Math.sin(x * 0.004) * 45
    this.drawRiver(mainRiver, 0, S, 34)
    this.drawRiver(creek, 1680, S, 18)
    this.addRiverParticles(mainRiver, 0, S, 34)
    this.addRiverParticles(creek, 1680, S, 18)

    // Wooden bridge where the south road crosses the main river
    this.scene.add.image(this.cx, mainRiver(this.cx), 'bridge').setDepth(2.6).setOrigin(0.5, 0.5)

    // Reeds + lily pads along the main river (skip the bridge crossing)
    for (let x = 90; x < S - 80; x += Phaser.Math.Between(120, 220)) {
      if (Math.abs(x - this.cx) < 80) continue
      const y = mainRiver(x)
      this.scene.add.image(x, y - 30, 'reed').setDepth(1).setOrigin(0.5, 1)
      this.scene.add.image(x + 18, y + 28, 'reed').setDepth(2).setOrigin(0.5, 1).setFlipX(true)
      if (Math.random() < 0.55) {
        this.scene.add.image(x + Phaser.Math.Between(-22, 22), y + Phaser.Math.Between(-10, 10), 'lily')
          .setDepth(0.7).setOrigin(0.5)
      }
    }

    // ── Forest cabin (solid) ────────────────────────────────────────────────────
    const cabinX = 600, cabinY = 2740
    const cabin  = this.obstacles.create(cabinX, cabinY, 'forest_cabin') as Phaser.Physics.Arcade.Sprite
    cabin.setOrigin(0.5, 1).setDepth(3)
    const cb = cabin.body as Phaser.Physics.Arcade.StaticBody
    cb.setSize(56, 26); cb.setOffset(8, 36); cabin.refreshBody()
    // Warm glow from the cabin's windows
    const cg = this.scene.add.graphics().setDepth(1.4).setBlendMode(Phaser.BlendModes.ADD)
    cg.fillStyle(0xff8833, 0.06); cg.fillCircle(cabinX, cabinY - 28, 64)

    // ── Bushes (decorative, denser than trees) ──────────────────────────────────
    for (let i = 0; i < 50; i++) {
      const x = Phaser.Math.FloatBetween(70, S - 70)
      const y = Phaser.Math.FloatBetween(2560, 3540)
      if (Phaser.Math.Distance.Between(x, y, this.cx, this.cy) < SAFE_RADIUS) continue
      this.scene.add.image(x, y, 'bush').setDepth(2).setOrigin(0.5, 1)
        .setScale(Phaser.Math.FloatBetween(0.8, 1.35))
    }

    // ── Flowers (random tints) ──────────────────────────────────────────────────
    const flowerTints = [0xff77aa, 0xffe066, 0x88aaff, 0xffffff, 0xcc88ff]
    for (let i = 0; i < 70; i++) {
      const x = Phaser.Math.FloatBetween(60, S - 60)
      const y = Phaser.Math.FloatBetween(2560, 3540)
      this.scene.add.image(x, y, 'flower').setDepth(1.2).setOrigin(0.5, 1)
        .setTint(Phaser.Utils.Array.GetRandom(flowerTints))
        .setScale(Phaser.Math.FloatBetween(0.8, 1.4))
    }

    // ── Mushrooms ─────────────────────────────────────────────────────────────
    for (let i = 0; i < 26; i++) {
      const x = Phaser.Math.FloatBetween(80, S - 80)
      const y = Phaser.Math.FloatBetween(2580, 3520)
      this.scene.add.image(x, y, 'mushroom').setDepth(1.2).setOrigin(0.5, 1)
    }

    // ── Glowing mushrooms + soft light (enchantment) ────────────────────────────
    const gm = this.scene.add.graphics().setDepth(0.9).setBlendMode(Phaser.BlendModes.ADD)
    for (let i = 0; i < 18; i++) {
      const x = Phaser.Math.FloatBetween(80, S - 80)
      const y = Phaser.Math.FloatBetween(2580, 3520)
      this.scene.add.image(x, y, 'mushroom_glow').setDepth(1.3).setOrigin(0.5, 1)
      gm.fillStyle(0x33aaff, 0.08); gm.fillCircle(x, y - 6, 28)
    }
  }

  // ── Zone camps ────────────────────────────────────────────────────────────

  private buildCamps() {
    const add = (x: number, y: number, key: string, depth = 3, ox = 0.5, oy = 1) =>
      this.scene.add.image(x, y, key).setDepth(depth).setOrigin(ox, oy)

    // Each camp: [cx, cy, tentTint, fireTint, glowColor]
    const camps: Array<[number, number, number, number, number]> = [
      [1800, 550,  0xaaddff, 0x88ccff, 0x4488ff],  // Frozen Ruins — Mage Solvara
      [750,  1800, 0xaa5533, 0xff4400, 0xff2200],  // Corrupted Fields — Ranger Aldric
      [2850, 1800, 0x8844cc, 0x8833ff, 0x6600cc],  // Arcane Caves — Hermit Zethkar
      [3900, 1800, 0x662200, 0xff4400, 0xff2200],  // Volcanic Wastes — Pyromancer Ignis
    ]

    for (const [cx, cy, tentTint, , glowColor] of camps) {
      // Ground clearing — worn dirt patch
      const g = this.scene.add.graphics().setDepth(2.8)
      g.fillStyle(0x1a1008, 0.45)
      g.fillEllipse(cx, cy + 10, 200, 90)

      // Tent — offset to the side of the NPC spawn point
      add(cx - 60, cy + 10, 'tent').setTint(tentTint)

      // Campfire — centre of camp
      add(cx + 20, cy + 8, 'campfire')

      // Campfire glow
      const glow = this.scene.add.graphics().setDepth(2.9).setBlendMode(Phaser.BlendModes.ADD)
      glow.fillStyle(glowColor, 0.12)
      glow.fillCircle(cx + 20, cy + 8, 55)

      // Crates / supplies scattered around
      add(cx + 65, cy + 5,  'crate').setTint(0x888888)
      add(cx + 80, cy - 10, 'crate').setTint(0x999999)

      // A couple of rocks for ambiance
      add(cx - 100, cy + 15, 'rock_obs', 2.9).setScale(0.7)
      add(cx + 50,  cy + 20, 'rock_obs', 2.9).setScale(0.55)
    }
  }

  // ── Hard boundary ─────────────────────────────────────────────────────────

  private buildBoundary() {
    const WW = this.worldW
    const HH = this.size
    const W  = 56
    const g  = this.scene.add.graphics().setDepth(0.5)
    g.fillStyle(0x070f07)
    g.fillRect(0,      0,       WW,     W)        // top wall
    g.fillRect(0,      HH - W,  WW,     W)        // bottom wall
    g.fillRect(0,      W,       W,      HH - W * 2)  // left wall
    g.fillRect(WW - W, W,       W,      HH - W * 2)  // right wall
    g.lineStyle(2, 0x2a4a2a, 0.7)
    g.strokeRect(W, W, WW - W * 2, HH - W * 2)
  }

  // ── Obstacles ─────────────────────────────────────────────────────────────

  private buildObstacles() {
    const S = this.size

    // Beginner Forest — dense healthy trees
    this.scatter('tree',      0,    2500, S,    1100, 50)

    // Frozen Ruins — dense ice crystal clusters + frozen boulders
    this.scatter('ice_obs',   0,    0,    S,    1100, 55)
    this.scatter('rock_obs',  0,    0,    S,    1100, 28)

    // Corrupted Fields — twisted dead trees + crumbled stone
    this.scatter('dead_tree', 0,    1100, 1500, 1400, 26)
    this.scatter('rock_obs',  0,    1100, 1500, 1400, 14)

    // Arcane Caves — arcane pillars + ancient boulders
    this.scatter('pillar_obs', 2100, 1100, 1500, 1400, 28)
    this.scatter('rock_obs',   2100, 1100, 1500, 1400, 16)

    // Central clearing — sparse so player can orient on spawn
    this.scatter('tree',     1300, 1100, 1000, 1400, 12)
    this.scatter('rock_obs', 1300, 1100, 1000, 1400,  6)

    // ── Volcanic Wastes — lava rocks + obsidian spires ────────────────────────
    this.scatter('lava_rock',      3600, 0,    1800, 3600, 55)  // all zones
    this.scatter('obsidian_spire', 3600, 0,    1800, 1100, 30)  // summit (densest)
    this.scatter('obsidian_spire', 3600, 1100, 1800, 1400, 20)  // core
    this.scatter('ash_mound',      3600, 2500, 1800, 1100, 22)  // approach
    this.scatter('rock_obs',       3600, 0,    1800, 3600, 20)  // scattered boulders

    // ── Extra tree clusters in Beginner Forest ────────────────────────────────
    const treeClusters: [number, number][] = [
      [400, 2700], [780, 2850], [1400, 2650], [2200, 2800],
      [2700, 2700], [3200, 2900], [600, 3300], [1900, 3350],
    ]
    for (const [cx, cy] of treeClusters) {
      for (let j = 0; j < 4; j++) {
        const ox = Phaser.Math.Between(-60, 60)
        const oy = Phaser.Math.Between(-55, 55)
        if (Phaser.Math.Distance.Between(cx + ox, cy + oy, this.cx, this.cy) < SAFE_RADIUS) continue
        const obs = this.obstacles.create(cx + ox, cy + oy, 'tree') as Phaser.Physics.Arcade.Sprite
        obs.setDepth(3)
        ;(obs.body as Phaser.Physics.Arcade.StaticBody).setCircle(13, 6, 3)
        obs.refreshBody()
      }
    }

    // ── Campfire at town center (decorative, no collision) ────────────────────
    this.scene.add.image(this.cx, this.cy - 40, 'campfire').setDepth(2).setOrigin(0.5, 1)

    // Extra campfires in the Beginner Forest — give safe resting spots
    const forestFires: [number, number][] = [
      [800, 2850], [1600, 3100], [2600, 2950], [3000, 2700],
    ]
    for (const [fx, fy] of forestFires) {
      this.scene.add.image(fx, fy, 'campfire').setDepth(2).setOrigin(0.5, 1)
    }

    // Torches flanking town NPCs and path entries
    const torchPositions: [number, number][] = [
      // Around town campfire
      [this.cx - 60, this.cy - 80], [this.cx + 60, this.cy - 80],
      // Near Quest NPC
      [this.cx - 210, this.cy - 70], [this.cx - 150, this.cy - 70],
      // Near Merchant NPC
      [this.cx + 150, this.cy - 70], [this.cx + 210, this.cy - 70],
      // Path south gate
      [this.cx - 50, this.cy + 240], [this.cx + 50, this.cy + 240],
      // Path north gate
      [this.cx - 50, this.cy - 240], [this.cx + 50, this.cy - 240],
    ]
    for (const [tx, ty] of torchPositions) {
      this.scene.add.image(tx, ty, 'torch').setDepth(3).setOrigin(0.5, 1)
    }

    // Fence posts around town perimeter (every ~45° around the fence ring)
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
      const fx = this.cx + Math.cos(angle) * 312
      const fy = this.cy + Math.sin(angle) * 312
      this.scene.add.image(fx, fy, 'fence_post').setDepth(2).setOrigin(0.5, 1)
    }

    // Stash chest — right of campfire
    const chestX = this.cx + 100, chestY = this.cy - 30
    ;(this.stashChestPos as { x: number; y: number }).x = chestX
    ;(this.stashChestPos as { x: number; y: number }).y = chestY
    this.scene.add.image(chestX, chestY, 'stash_chest').setDepth(3).setOrigin(0.5, 1)
    this.scene.add.text(chestX, chestY - 48, 'Town Stash', {
      fontSize: '13px', fontStyle: 'bold',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#ddaa33',
      stroke: '#000', strokeThickness: 4,
    }).setDepth(4).setOrigin(0.5)
    // Glow under campfire
    const glow = this.scene.add.graphics().setDepth(1.5)
    glow.fillStyle(0xff4400, 0.07)
    glow.fillCircle(this.cx, this.cy - 40, 65)
  }

  // ── Ambient light ─────────────────────────────────────────────────────────

  private buildAmbientLight() {
    const g = this.scene.add.graphics()
      .setDepth(0.09)
      .setBlendMode(Phaser.BlendModes.ADD)

    // Town campfire — warm orange glow
    this.addFireGlow(g, this.cx, this.cy - 40, 0xff5500, 130, 60, 0.045, 0.09)

    // Forest campfires
    const forestFires: [number, number][] = [
      [800, 2850], [1600, 3100], [2600, 2950], [3000, 2700],
    ]
    for (const [fx, fy] of forestFires) {
      this.addFireGlow(g, fx, fy, 0xff4400, 90, 40, 0.035, 0.07)
    }

    // Torch glows around town
    const torchPositions: [number, number][] = [
      [this.cx - 60, this.cy - 80], [this.cx + 60, this.cy - 80],
      [this.cx - 210, this.cy - 70], [this.cx - 150, this.cy - 70],
      [this.cx + 150, this.cy - 70], [this.cx + 210, this.cy - 70],
      [this.cx - 50, this.cy + 240], [this.cx + 50, this.cy + 240],
      [this.cx - 50, this.cy - 240], [this.cx + 50, this.cy - 240],
    ]
    for (const [tx, ty] of torchPositions) {
      this.addFireGlow(g, tx, ty, 0xff6600, 55, 22, 0.03, 0.065)
    }

    // Dungeon portal glows — ominous purple
    const portalPositions: [number, number][] = [
      [1800, 3050], [1800, 580], [750, 1800], [2850, 1800],
    ]
    for (const [px, py] of portalPositions) {
      this.addFireGlow(g, px, py - 20, 0x8833ff, 80, 35, 0.025, 0.05)
    }

    // ── Volcanic Wastes — orange-red lava ambient glow ────────────────────────
    const lavaG = this.scene.add.graphics().setDepth(0.09).setBlendMode(Phaser.BlendModes.ADD)
    // Zone-wide orange wash
    lavaG.fillStyle(0xff3300, 0.05)
    lavaG.fillRect(3600, 0, 1800, this.size)
    // Lava pool and river glow
    const lavaPools2: [number, number][] = [
      [3800, 420], [4280, 640], [4760, 300], [5100, 980],
      [3980, 1650], [4620, 1980], [5200, 1440],
      [4100, 2500], [4700, 2900], [3850, 3200],
      [4800, 420],  // caldera
    ]
    for (const [lx, ly] of lavaPools2) {
      this.addFireGlow(lavaG, lx, ly, 0xff4400, 200, 90, 0.038, 0.075)
    }
    // Caldera — big bright hotspot
    this.addFireGlow(lavaG, 4800, 420, 0xff6600, 350, 140, 0.05, 0.10)

    // ── Frozen Ruins — cold blue zone ambient glow ────────────────────────────
    const coldG = this.scene.add.graphics().setDepth(0.09).setBlendMode(Phaser.BlendModes.ADD)
    // Wide zone-wide cold blue wash
    coldG.fillStyle(0x44aaff, 0.04)
    coldG.fillRect(0, 0, this.size, 1100)
    // Glacial lake glow points
    const lakeGlows: [number, number][] = [
      [380, 180], [1050, 420], [2080, 150], [2750, 480], [1650, 780], [3180, 250],
    ]
    for (const [lx, ly] of lakeGlows) {
      this.addFireGlow(coldG, lx, ly, 0x66ccff, 180, 80, 0.03, 0.055)
    }
    // Ice crystal clusters — faint blue glow
    for (const [lx, ly] of [[600, 340], [1400, 180], [2400, 600], [3000, 820], [1800, 950]]) {
      this.addFireGlow(coldG, lx, ly, 0x99ddff, 100, 45, 0.025, 0.04)
    }
  }

  private buildSnowfall() {
    // Snowfall emitters scattered across the Frozen Ruins zone (y: 0–1100)
    // Each emitter covers a ~600×300 patch; together they blanket the whole zone.
    const emitterCenters: [number, number][] = [
      [300, 300], [900, 200], [1500, 500], [1800, 150], [2100, 700],
      [2700, 350], [3300, 200], [600, 800], [1200, 950], [3000, 750],
    ]
    for (const [ex, ey] of emitterCenters) {
      this.scene.add.particles(ex, ey, 'snowflake', {
        x:        { min: -340, max: 340 },
        y:        { min: -200, max: 200 },
        speedX:   { min: 8,  max: 20  },   // slight wind drift east
        speedY:   { min: 18, max: 40  },   // fall downward
        lifespan: { min: 4000, max: 7000 },
        scale:    { start: 0.9, end: 0.1 },
        alpha:    { start: 0.75, end: 0 },
        rotate:   { min: 0, max: 360 },
        quantity:  1,
        frequency: 280,
      }).setDepth(3.8)
    }
  }

  private addFireGlow(
    g: Phaser.GameObjects.Graphics,
    x: number, y: number,
    color: number,
    outerR: number, innerR: number,
    outerAlpha: number, innerAlpha: number,
  ) {
    g.fillStyle(color, outerAlpha)
    g.fillCircle(x, y, outerR)
    g.fillStyle(color, innerAlpha)
    g.fillCircle(x, y, innerR)
  }

  private scatter(
    key: string,
    zx: number, zy: number, zw: number, zh: number,
    count: number,
  ) {
    // [circleRadius, bodyOffsetX, bodyOffsetY]
    const bodyMap: Record<string, [number, number, number]> = {
      tree:           [13, 6,  3],
      dead_tree:      [8,  9,  4],
      rock_obs:       [13, 9,  4],
      ice_obs:        [5,  5, 22],   // collision at crystal base
      pillar_obs:     [8,  3, 12],
      lava_rock:      [14, 8,  4],
      obsidian_spire: [6,  6, 26],   // collision at spire base
      ash_mound:      [10, 8,  6],
    }
    const [radius, ox, oy] = bodyMap[key] ?? [13, 6, 3]

    for (let i = 0; i < count; i++) {
      let x: number, y: number, tries = 0
      do {
        x = Phaser.Math.FloatBetween(zx + BORDER, zx + zw - BORDER)
        y = Phaser.Math.FloatBetween(zy + BORDER, zy + zh - BORDER)
        tries++
      } while (
        Phaser.Math.Distance.Between(x, y, this.cx, this.cy) < SAFE_RADIUS
        && tries < 25
      )
      if (tries >= 25) continue

      const obs = this.obstacles.create(x, y, key) as Phaser.Physics.Arcade.Sprite
      obs.setDepth(3)
      ;(obs.body as Phaser.Physics.Arcade.StaticBody).setCircle(radius, ox, oy)
      obs.refreshBody()
    }
  }

  // ── Dungeon entrances ─────────────────────────────────────────────────────

  private buildDungeonEntrances() {
    const entries: { x: number; y: number; zoneId: string; label: string; col: string }[] = [
      { x: 1800, y: 3050, zoneId: 'Beginner Forest',  label: "Thornback's Lair",  col: '#44cc44' },
      { x: 1800, y:  580, zoneId: 'Frozen Ruins',     label: "Frostlord's Tomb",  col: '#88ccff' },
      { x:  750, y: 1800, zoneId: 'Corrupted Fields', label: "Corruptor's Pit",   col: '#cc4444' },
      { x: 2850, y: 1800, zoneId: 'Arcane Caves',     label: "Warden's Sanctum",  col: '#aa44ff' },
    ]

    for (const e of entries) {
      this.dungeonEntrances.push({ x: e.x, y: e.y, zoneId: e.zoneId })

      this.scene.add.image(e.x, e.y, 'dungeon_portal').setDepth(3).setOrigin(0.5, 1)

      // Boss dungeon label above portal
      this.scene.add.text(e.x, e.y - 64, e.label, {
        fontSize: '13px', fontStyle: 'bold',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: e.col,
        stroke: '#000', strokeThickness: 4,
      }).setDepth(4).setOrigin(0.5)

      this.scene.add.text(e.x, e.y - 48, '⚔ Boss Dungeon', {
        fontSize: '11px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#777788',
        stroke: '#000', strokeThickness: 2,
      }).setDepth(4).setOrigin(0.5)
    }
  }

  // ── Spawn zones ───────────────────────────────────────────────────────────
  //
  // Design intent: enemies are grouped in camps. Each camp is a SpawnZone.
  // Density and threat scale with distance from town (1800, 1800).
  // Player should be able to pull 1-2 enemies carefully; AoE farming comes later.

  private buildSpawnZones() {
    const zoneBoundsFor = (cx: number, cy: number) => {
      const z = ZONE_DEFS.find(d => cx >= d.x && cx < d.x + d.w && cy >= d.y && cy < d.y + d.h)
      return z ? { x: z.x, y: z.y, w: z.w, h: z.h } : null
    }

    const push = (cx: number, cy: number, radius: number, table: EnemyConfig[], maxEnemies: number) =>
      this.spawnZones.push({ cx, cy, radius, table, maxEnemies, zoneBounds: zoneBoundsFor(cx, cy) })

    // ── Beginner Forest (y: 2500–3600) — danger 1 ────────────────────────
    // Entry camps (y: 2520–2700) — slimes + a skittering spider, low density
    for (const [cx, cy] of [
      [900,  2560], [1800, 2580], [2700, 2560],
    ] as [number, number][]) {
      push(cx, cy, 160, [Slime, Slime, Spider], 2)
    }
    // Core camps (y: 2750–3150) — slimes, spiders, wolves + roving bandits
    for (const [cx, cy] of [
      [500, 2900], [1200, 2850], [1800, 3050],
      [2500, 2950], [3100, 2900],
    ] as [number, number][]) {
      push(cx, cy, 240, [Slime, Spider, Wolf, Bandit], 3)
    }
    // Deep camps (y: 3200–3520) — wolf packs, bandits + a lumbering bear; Thornback roams here
    for (const [cx, cy] of [
      [800, 3300], [1800, 3420], [2900, 3280],
    ] as [number, number][]) {
      push(cx, cy, 250, [Wolf, Bandit, Bear, Spider, Bandit, Thornback], 4)
    }

    // ── Frozen Ruins (y: 0–1100) — danger 2 ───────────────────────────────
    // Entry camps (y: 870–1060) — Ghouls + a Wraith, smaller packs
    for (const [cx, cy] of [
      [600, 980], [1800, 940], [3000, 980],
    ] as [number, number][]) {
      push(cx, cy, 280, [Ghoul, Ghoul, Wraith], 3)
    }
    // Core camps (y: 420–870)
    for (const [cx, cy] of [
      [380, 640], [1200, 700], [1800, 480],
      [2500, 660], [3200, 520],
    ] as [number, number][]) {
      push(cx, cy, 320, [Ghoul, Ghoul, Wraith, Wraith, Brute], 5)
    }
    // Deep camps (y: 40–420) — most dangerous, Brute-heavy; Frost Warden patrols here
    for (const [cx, cy] of [
      [700, 220], [1800, 180], [3000, 240],
    ] as [number, number][]) {
      push(cx, cy, 320, [Wraith, Wraith, Brute, Brute, Ghoul, FrostWarden], 6)
    }

    // ── Corrupted Fields (x: 0–1500, y: 1100–2500) — danger 3 ────────────
    // Entry camps (x: 1080–1460) — Imps + a Ghoul, player meets them first
    for (const [cx, cy] of [
      [1360, 1440], [1300, 1900], [1350, 2360],
    ] as [number, number][]) {
      push(cx, cy, 260, [Imp, Imp, Ghoul], 3)
    }
    // Core camps
    for (const [cx, cy] of [
      [800, 1600], [480, 2000], [900, 2300],
    ] as [number, number][]) {
      push(cx, cy, 300, [Imp, Imp, Imp, Ghoul, Brute], 5)
    }
    // Deep camps (far west) — Corrupted Mage lurks here
    for (const [cx, cy] of [
      [240, 1560], [280, 2200],
    ] as [number, number][]) {
      push(cx, cy, 300, [Imp, Ghoul, Brute, Brute, Imp, CorruptedMage], 6)
    }

    // ── Arcane Caves (x: 2100–3600, y: 1100–2500) — danger 4 ─────────────
    // Entry camps (x: 2100–2560) — Wraithes + Ghouls
    for (const [cx, cy] of [
      [2300, 1440], [2260, 1900], [2380, 2360],
    ] as [number, number][]) {
      push(cx, cy, 280, [Wraith, Wraith, Ghoul], 3)
    }
    // Core camps
    for (const [cx, cy] of [
      [2800, 1580], [3100, 2020], [2900, 2320],
    ] as [number, number][]) {
      push(cx, cy, 300, [Wraith, Wraith, Brute, Ghoul], 4)
    }
    // Deep camps (far east) — Arcane Lich haunts these ruins
    for (const [cx, cy] of [
      [3360, 1580], [3400, 2120],
    ] as [number, number][]) {
      push(cx, cy, 300, [Wraith, Brute, Brute, Ghoul, Elite, ArcaneLich], 5)
    }

    // ── Volcanic Wastes (x: 3600–5400) — danger 5 ────────────────────────────
    // Approach (y: 2500–3600) — Brutes + Elites, first taste of volcanic difficulty
    for (const [cx, cy] of [
      [3800, 2720], [4200, 2880], [4650, 2760],
      [4050, 3200], [3860, 3380], [4750, 3300],
    ] as [number, number][]) {
      push(cx, cy, 270, [Ghoul, Brute, Brute, Imp, Elite], 4)
    }

    // Core (y: 1100–2500) — high Elite density; Ashen Giant roams the lava fields
    for (const [cx, cy] of [
      [3820, 1480], [4260, 1720], [4720, 1500],
      [4050, 2050], [4800, 1940], [4150, 2320],
      [5100, 1650], [5200, 2200],
    ] as [number, number][]) {
      push(cx, cy, 300, [Elite, Elite, Brute, Wraith, Ghoul, AshenGiant], 5)
    }

    // Summit (y: 0–1100) — maximum danger, dense Elite packs for endgame farming
    for (const [cx, cy] of [
      [3850, 420], [4280, 260], [4800, 680],
      [5150, 350], [4100, 900], [5000, 140],
      [4520, 950],
    ] as [number, number][]) {
      push(cx, cy, 320, [Elite, Elite, Elite, Brute, Wraith, Wraith, AshenGiant], 6)
    }
  }
}
