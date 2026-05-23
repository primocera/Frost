import Phaser from 'phaser'
import { EnemyConfig, Slime, Ghoul, Imp, Brute, Wraith, Elite, Wolf, Spider, Bandit, Bear, Thornback, FrostWarden, CorruptedMage, ArcaneLich, AshenGiant, DefiasCaster, ArcaneGolem, CorruptedDragonkin, Golem, NightbladeWarden, MoonwatcherArcher, HighElfSentinel, ElvenMystic, Starweaver } from '../entities/EnemyTypes'

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
    name: 'Volcanic Wastes',  labelColor: '#ff6622',
    atmosphere: 0x3a0a00, atmoAlpha: 0.22,
    danger: 5, x: 1500, y: 0,    w: 3600, h: 1800,  // TOP — lava (x:1500-5100)
  },
  {
    name: 'Frozen Ruins',     labelColor: '#aaddff',
    atmosphere: 0x88ccff, atmoAlpha: 0.14,
    danger: 2, x: 1500, y: 1800, w: 3600, h: 1100,  // x:1500-5100
  },
  {
    name: 'Corrupted Fields', labelColor: '#cc4444',
    atmosphere: 0x220000, atmoAlpha: 0.09,
    danger: 3, x: 1500, y: 2900, w: 1500, h: 1400,  // x:1500-3000
  },
  {
    name: 'Arcane Caves',     labelColor: '#aa44ff',
    atmosphere: 0x110022, atmoAlpha: 0.11,
    danger: 4, x: 3600, y: 2900, w: 1500, h: 1400,  // x:3600-5100
  },
  {
    name: 'Elven Wilds',      labelColor: '#88ffcc',
    atmosphere: 0x001a14, atmoAlpha: 0.10,
    danger: 1, x: 0,    y: 4300, w: 1500, h: 1100,  // NEW — moonlit elven forest (left)
  },
  {
    name: 'Beginner Forest',  labelColor: '#44cc44',
    atmosphere: 0x002200, atmoAlpha: 0.04,
    danger: 1, x: 1500, y: 4300, w: 3600, h: 1100,  // full base width x:1500-5100
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
  readonly worldW: number   // total world width
  readonly worldH: number   // total world height
  readonly cx:     number
  readonly cy:     number
  readonly obstacles:        Phaser.Physics.Arcade.StaticGroup
  readonly spawnZones:       SpawnZone[] = []
  readonly dungeonEntrances: DungeonEntrance[] = []
  readonly stashChestPos:    { x: number; y: number } = { x: 0, y: 0 }
  readonly chickenPositions: { x: number; y: number }[] = []

  constructor(private scene: Phaser.Scene, size: number, worldW?: number, worldH?: number) {
    this.size   = size
    this.worldW = worldW ?? size
    this.worldH = worldH ?? size
    this.cx     = this.worldW - size / 2         // 3300 — town center (1800px from right of base world)
    this.cy     = this.worldH - size / 2         // 3600 — town center (size/2 from bottom)
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
    scene.physics.world.setBounds(0, 0, this.worldW, this.worldH)
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
    tile('t_elven',   0x081a14, 0x0c2218)   // elven wilds — deep moonlit blue-green

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

    // ── Elven silver tree ─────────────────────────────────────────────────────
    g.fillStyle(0x284838)
    g.fillCircle(19, 18, 16)               // outer canopy
    g.fillStyle(0x3a6a50, 0.75)
    g.fillCircle(14, 13, 10)               // secondary cluster
    g.fillStyle(0x88ccaa, 0.55)            // moonlit silver-green highlights
    g.fillCircle(20, 13, 7)
    g.fillStyle(0xbbeecc, 0.35)            // bright tips catching moonlight
    g.fillCircle(19, 9,  4)
    g.fillStyle(0xddf8ee, 0.20)            // moonlit glow crown
    g.fillCircle(19, 7,  3)
    g.fillStyle(0xc8d8d0)                  // silver-grey bark
    g.fillRect(16, 31, 6, 17)
    g.generateTexture('elven_tree', 38, 48)
    g.clear()

    // ── Moonwell (elven shrine pool) ──────────────────────────────────────────
    // Stone arch and pillars
    g.fillStyle(0x7880a0)
    g.fillRect(3, 10, 5, 22)              // left pillar
    g.fillRect(36, 10, 5, 22)            // right pillar
    g.fillStyle(0x9aa8c0, 0.7)
    g.fillRect(1, 8, 9, 4)              // left cap
    g.fillRect(34, 8, 9, 4)             // right cap
    g.lineStyle(2, 0x9aaccc, 0.8)
    g.strokeCircle(22, 18, 19)   // arch ring
    // Stone rim of the well
    g.fillStyle(0x8890a8)
    g.fillEllipse(22, 33, 40, 18)
    g.fillStyle(0xaab8c8, 0.6)
    g.fillEllipse(22, 31, 28, 12)
    // Moonlit pool surface
    g.fillStyle(0x0d2840, 0.92)
    g.fillEllipse(22, 31, 24, 10)
    g.fillStyle(0x44aacc, 0.60)
    g.fillEllipse(22, 31, 17, 7)
    g.fillStyle(0xaaeeff, 0.45)
    g.fillEllipse(20, 30, 10, 5)         // moonlit reflection shimmer
    g.generateTexture('moonwell', 44, 44)
    g.clear()

    // ── Elven stone ruin ──────────────────────────────────────────────────────
    g.fillStyle(0x6878a0, 0.9)
    g.fillRect(4, 10, 32, 26)            // base stone block
    g.fillStyle(0x7888b8, 0.6)
    g.fillRect(4, 10, 32, 7)            // top face
    g.fillStyle(0x505a88, 0.75)
    g.fillRect(28, 10, 8, 26)           // shadow side
    g.lineStyle(1, 0x99aace, 0.40)
    g.lineBetween(4, 20, 36, 20)        // stone course
    g.lineBetween(4, 28, 36, 28)
    // Elven rune glyph (subtle carved sigil)
    g.lineStyle(1, 0x88ccff, 0.30)
    g.lineBetween(16, 14, 24, 14)
    g.lineBetween(20, 12, 20, 18)
    g.strokeCircle(20, 22, 4)
    g.generateTexture('elven_ruin', 40, 38)
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
    const S  = this.size   // 3600 — base zone width
    const WH = this.worldH // 5400 — total world height
    const WW = this.worldW // 5100 — total world width
    const EX = WW - S      // 1500 — Elven Wilds extension on left
    const add = (x: number, y: number, w: number, h: number, key: string, depth = 0) =>
      this.scene.add.tileSprite(x, y, w, h, key).setOrigin(0).setDepth(depth)

    // Base — plains across the full world (covered by zone tiles on top)
    add(0, 0, WW, WH, 't_plains')

    // ── Volcanic Wastes (y: 0–1800, x: EX–WW) ───────────────────────────────
    add(EX,      0,    S,    1800, 't_volcanic', 0.1)
    add(EX,      180,  S,    90,   't_lava',    0.08)
    add(EX,      580,  S,    70,   't_lava',    0.09)
    add(EX,      980,  S,    80,   't_lava',    0.08)
    add(EX,      1380, S,    75,   't_lava',    0.09)
    add(EX+1200, 0,    1200, 600,  't_lava',    0.07)  // caldera core

    // ── Frozen Ruins (y: 1800–2900, x: EX–WW) ───────────────────────────────
    add(EX,      1800, S,    1100, 't_frozen',  0.1)
    add(EX,      1800, 900,  400,  't_snow', 0.13)
    add(EX+800,  2000, 700,  500,  't_snow', 0.10)
    add(EX+2200, 1800, 800,  350,  't_snow', 0.11)
    add(EX+2900, 2100, 700,  600,  't_snow', 0.09)
    add(EX+1400, 2400, 500,  400,  't_snow', 0.10)

    // ── Corrupted Fields (y: 2900–4300, x: EX–EX+1500) ──────────────────────
    add(EX,      2900, 1500, 1400, 't_corrupt', 0.1)

    // ── Arcane Caves (y: 2900–4300, x: EX+2100–WW) ──────────────────────────
    add(EX+2100, 2900, 1500, 1400, 't_arcane',  0.1)

    // ── Elven Wilds (y: 4300–5400, x: 0–EX) ─────────────────────────────────
    add(0,   4300, EX,  1100, 't_elven',   0.1)
    add(120, 4350, 380, 300,  't_elven',   0.08)
    add(600, 4600, 500, 350,  't_elven',   0.08)

    // ── Beginner Forest (y: 4300–5400, x: EX–WW) — full base width ───────────
    add(EX,  4300, S,   1100, 't_forest',  0.1)

    // Central clearing — warmer neutral plains around town hub
    const cw = 680, ch = 680
    add(this.cx - cw / 2, this.cy - ch / 2, cw, ch, 't_plains', 0.15)

    // Transition softeners between Elven Wilds and Beginner Forest (x ≈ EX)
    add(EX - 40, 4300, 80, 1100, 't_forest', 0.07)
    add(EX - 100, 4300, 80, 1100, 't_elven',  0.06)
  }

  // ── Decorative details (no physics) ───────────────────────────────────────

  private buildDecor() {
    const S  = this.size         // 3600 — base zone width
    const WW = this.worldW       // 5100 — total width
    const WH = this.worldH       // 5400
    const EX = WW - S            // 1500 — Elven x offset
    const g  = this.scene.add.graphics().setDepth(0.05)

    // ── Beginner Forest — mossy patches ──────────────────────────────────────
    g.fillStyle(0x0e1e0e, 0.3)
    for (let i = 0; i < 40; i++) {
      const x = Phaser.Math.FloatBetween(EX + 60, WW - 60)
      const y = Phaser.Math.FloatBetween(4360, WH - 60)
      g.fillCircle(x, y, Phaser.Math.Between(10, 28))
    }
    g.fillStyle(0x22441a, 0.18)
    for (let i = 0; i < 20; i++) {
      const x = Phaser.Math.FloatBetween(EX + 60, WW - 100)
      const y = Phaser.Math.FloatBetween(4420, WH - 80)
      g.fillEllipse(x, y, Phaser.Math.Between(30, 80), Phaser.Math.Between(10, 24))
    }

    // ── Elven Wilds — moonlit clearings and glowing moss patches ─────────────
    // Moonlit grass patches (soft silver-green glow)
    g.fillStyle(0x0a2a1e, 0.45)
    for (let i = 0; i < 35; i++) {
      const x = Phaser.Math.FloatBetween(60, 1440)
      const y = Phaser.Math.FloatBetween(4360, WH - 60)
      g.fillCircle(x, y, Phaser.Math.Between(14, 38))
    }
    // Silver-teal shimmering clearings
    g.fillStyle(0x1e4438, 0.22)
    for (let i = 0; i < 16; i++) {
      const x = Phaser.Math.FloatBetween(80, 1400)
      const y = Phaser.Math.FloatBetween(4400, WH - 80)
      g.fillEllipse(x, y, Phaser.Math.Between(40, 120), Phaser.Math.Between(20, 50))
    }
    // Moonlit pools — small bright teal ellipses
    g.fillStyle(0x1a5050, 0.60)
    for (const [px, py, pw, ph] of [
      [180, 4460, 90, 36], [580, 4700, 110, 42], [320, 4900, 80, 32],
      [980, 4520, 100, 38], [760, 4850, 95, 35], [1200, 4700, 85, 32],
      [450, 5150, 105, 40], [1050, 5300, 90, 34],
    ] as [number, number, number, number][]) {
      g.fillEllipse(px, py, pw, ph)
      g.fillStyle(0x44aacc, 0.38)
      g.fillEllipse(px, py, pw * 0.70, ph * 0.65)
      g.fillStyle(0xaaeeff, 0.22)
      g.fillEllipse(px - pw * 0.08, py - ph * 0.10, pw * 0.35, ph * 0.28)
      g.fillStyle(0x1a5050, 0.60)
    }
    // Elven rune carvings on the ground
    g.lineStyle(1, 0x44ccaa, 0.28)
    for (let i = 0; i < 8; i++) {
      const rx = Phaser.Math.FloatBetween(100, 1350)
      const ry = Phaser.Math.FloatBetween(4380, WH - 100)
      const rr = Phaser.Math.Between(16, 34)
      g.strokeCircle(rx, ry, rr)
      for (let j = 0; j < 3; j++) {
        const a = (j / 3) * Math.PI * 2
        g.lineBetween(rx, ry, rx + Math.cos(a) * rr, ry + Math.sin(a) * rr)
      }
    }

    // ── Frozen Ruins — glacial overhaul ──────────────────────────────────────

    // Glacial lakes / frozen ponds — large bright-blue translucent sheets
    const lakes: [number, number, number, number][] = [
      [EX+380,  1980, 280, 110], [EX+1050, 2220, 380, 130], [EX+2080, 1950, 320, 120],
      [EX+2750, 2280,  260,  95], [EX+1650, 2580, 300, 100], [EX+3180, 2050, 260, 100],
      [EX+600,  2500, 220,  80], [EX+3400, 2500, 200,  85], [EX+1800, 2150, 180,  70],
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
      const x = Phaser.Math.FloatBetween(EX + 80, WW - 80)
      const y = Phaser.Math.FloatBetween(1850, 2850)
      const dx = Phaser.Math.Between(-90, 90)
      const dy = Phaser.Math.Between(-55, 55)
      g.lineBetween(x, y, x + dx, y + dy)
      g.lineBetween(x + dx * 0.5, y + dy * 0.5,
        x + dx * 0.5 + Phaser.Math.Between(-40, 40),
        y + dy * 0.5 + Phaser.Math.Between(-30, 30))
    }
    g.lineStyle(1, 0x5599bb, 0.55)
    for (let i = 0; i < 50; i++) {
      const x = Phaser.Math.FloatBetween(EX + 60, WW - 60)
      const y = Phaser.Math.FloatBetween(1830, 2870)
      g.lineBetween(x, y, x + Phaser.Math.Between(-28, 28), y + Phaser.Math.Between(-18, 18))
    }
    g.lineStyle(1, 0x99ccdd, 0.28)
    for (let i = 0; i < 80; i++) {
      const x = Phaser.Math.FloatBetween(EX + 40, WW - 40)
      const y = Phaser.Math.FloatBetween(1820, 2880)
      g.lineBetween(x, y, x + Phaser.Math.Between(-14, 14), y + Phaser.Math.Between(-10, 10))
    }

    // Snow drifts
    g.fillStyle(0xe8f4ff, 0.55)
    for (let i = 0; i < 38; i++) {
      const x = Phaser.Math.FloatBetween(EX + 60, WW - 60)
      const y = Phaser.Math.FloatBetween(1840, 2860)
      g.fillEllipse(x, y, Phaser.Math.Between(60, 220), Phaser.Math.Between(8, 24))
    }
    g.fillStyle(0xf0faff, 0.40)
    for (let i = 0; i < 22; i++) {
      const x = Phaser.Math.FloatBetween(EX + 50, WW - 50)
      const y = Phaser.Math.FloatBetween(1830, 2870)
      g.fillEllipse(x, y, Phaser.Math.Between(18, 60), Phaser.Math.Between(5, 14))
    }

    // Ruined building footprints buried under ice/snow
    const ruins: [number, number, number, number][] = [
      [EX+250, 2000, 120, 80], [EX+820, 2350, 160, 90], [EX+1650, 2050, 100, 140],
      [EX+2300, 2450, 180, 80], [EX+3100, 2220, 130, 100], [EX+1200, 2700, 150, 70],
      [EX+2700, 2000, 110, 130], [EX+3380, 2620, 140, 80],
    ]
    g.fillStyle(0x6a7e8a, 0.30)
    for (const [rx, ry, rw, rh] of ruins) {
      g.fillRect(rx - rw / 2, ry - rh / 2, rw, rh)
      g.fillStyle(0xdeedf8, 0.45)
      g.fillRect(rx - rw / 2, ry - rh / 2, rw, 8)
      g.fillRect(rx - rw / 2, ry - rh / 2, 8, rh)
      g.fillStyle(0x6a7e8a, 0.30)
    }

    // Ice sheet shimmer
    g.fillStyle(0xffffff, 0.12)
    for (let i = 0; i < 60; i++) {
      const x = Phaser.Math.FloatBetween(EX + 30, WW - 30)
      const y = Phaser.Math.FloatBetween(1820, 2880)
      const r = Phaser.Math.Between(4, 22)
      g.fillEllipse(x, y, r * 3, r)
    }

    // ── Corrupted Fields — dark pools and corruption veins ────────────────────
    g.lineStyle(2, 0x440000, 0.6)
    for (let i = 0; i < 22; i++) {
      const x = Phaser.Math.FloatBetween(EX + 70, EX + 1430)
      const y = Phaser.Math.FloatBetween(2960, 4230)
      g.lineBetween(x, y, x + Phaser.Math.Between(-45, 45), y + Phaser.Math.Between(-35, 35))
    }
    g.fillStyle(0x1a0000, 0.58)
    for (const [px, py, rw, rh] of [
      [EX+300, 3200, 100, 38], [EX+820, 3580, 120, 44], [EX+480, 4000, 80, 32],
      [EX+1100, 3420, 90, 36], [EX+220, 4220, 70, 28], [EX+650, 3850, 85, 34],
    ]) g.fillEllipse(px, py, rw, rh)

    // ── Arcane Caves — rune circles and arcane pools ──────────────────────────
    g.lineStyle(1, 0x6622aa, 0.38)
    for (let i = 0; i < 9; i++) {
      const acx = Phaser.Math.FloatBetween(EX + 2200, WW - 100)
      const acy = Phaser.Math.FloatBetween(3000, 4200)
      const r   = Phaser.Math.Between(28, 80)
      g.strokeCircle(acx, acy, r)
      for (let j = 0; j < 3; j++) {
        const angle = (j / 3) * Math.PI * 2
        g.lineBetween(acx, acy, acx + Math.cos(angle) * r, acy + Math.sin(angle) * r)
      }
    }
    g.fillStyle(0x220044, 0.45)
    for (const [px, py, rw, rh] of [
      [EX+2420, 3200, 100, 40], [EX+2950, 3580, 80, 32], [EX+3220, 3320, 110, 42],
      [EX+2640, 3980, 90, 36],  [EX+3420, 4100, 76, 30],
    ]) g.fillEllipse(px, py, rw, rh)

    // ── Paths from town center to each zone ──────────────────────────────────
    const { cx, cy } = this
    const pathColor = 0x2a2e1a
    g.fillStyle(pathColor, 0.42)
    // South — toward Beginner Forest
    g.fillRect(cx - 22, cy + 220, 44, this.worldH - cy - 220)
    // North — toward Frozen Ruins + Volcanic
    g.fillRect(cx - 22, 0, 44, cy - 220)
    // West — toward Corrupted Fields
    g.fillRect(0, cy - 22, cx - 220, 44)
    // East — toward Arcane Caves
    g.fillRect(cx + 220, cy - 22, WW - (cx + 220), 44)

    // Path edges
    g.fillStyle(0x363c22, 0.25)
    g.fillRect(cx - 28, cy + 220, 6, this.worldH - cy - 220)
    g.fillRect(cx + 22, cy + 220, 6, this.worldH - cy - 220)
    g.fillRect(cx - 28, 0, 6, cy - 220)
    g.fillRect(cx + 22, 0, 6, cy - 220)

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
    // North path border (Frozen Ruins entry at y=2900)
    g.lineBetween(cx - 80, 2900, cx + 80, 2900)
    // South path border (Beginner Forest at y=4300)
    g.lineBetween(cx - 80, 4300, cx + 80, 4300)
    // West (Corrupted Fields at x=EX+1500=3000)
    g.lineBetween(EX + 1500, cy - 80, EX + 1500, cy + 80)
    // East (Arcane Caves at x=EX+2100=3600)
    g.lineBetween(EX + 2100, cy - 80, EX + 2100, cy + 80)

    // ── Zone gate seals — glowing barriers at locked zone entries ─────────────
    const gateG = this.scene.add.graphics().setDepth(3.6)

    // Frozen Ruins gate (north path at y=2900) — icy blue seal
    gateG.lineStyle(4, 0x44aaff, 0.75)
    gateG.lineBetween(cx - 70, 2902, cx + 70, 2902)
    gateG.lineStyle(2, 0x88ddff, 0.45)
    gateG.lineBetween(cx - 70, 2898, cx + 70, 2898)
    gateG.lineBetween(cx - 70, 2906, cx + 70, 2906)
    for (const dx of [-40, 0, 40]) {
      gateG.fillStyle(0x88ddff, 0.6)
      gateG.fillTriangle(cx + dx, 2895, cx + dx - 5, 2902, cx + dx + 5, 2902)
      gateG.fillTriangle(cx + dx, 2909, cx + dx - 5, 2902, cx + dx + 5, 2902)
    }

    // Corrupted Fields gate (west path at x=EX+1500=3000) — blood-red seal
    const corrGX = EX + 1500
    gateG.lineStyle(4, 0xcc2222, 0.75)
    gateG.lineBetween(corrGX - 2, cy - 70, corrGX - 2, cy + 70)
    gateG.lineStyle(2, 0xff4444, 0.45)
    gateG.lineBetween(corrGX - 6, cy - 70, corrGX - 6, cy + 70)
    gateG.lineBetween(corrGX + 2, cy - 70, corrGX + 2, cy + 70)
    for (const dy of [-40, 0, 40]) {
      gateG.fillStyle(0xff5555, 0.6)
      gateG.fillTriangle(corrGX - 9, cy + dy, corrGX - 2, cy + dy - 5, corrGX - 2, cy + dy + 5)
      gateG.fillTriangle(corrGX + 5, cy + dy, corrGX - 2, cy + dy - 5, corrGX - 2, cy + dy + 5)
    }

    // Arcane Caves gate (east path at x=EX+2100=3600) — purple arcane seal
    const arcGX = EX + 2100
    gateG.lineStyle(4, 0xaa44ff, 0.75)
    gateG.lineBetween(arcGX + 2, cy - 70, arcGX + 2, cy + 70)
    gateG.lineStyle(2, 0xcc88ff, 0.45)
    gateG.lineBetween(arcGX - 2, cy - 70, arcGX - 2, cy + 70)
    gateG.lineBetween(arcGX + 6, cy - 70, arcGX + 6, cy + 70)
    for (const dy of [-40, 0, 40]) {
      gateG.fillStyle(0xcc88ff, 0.6)
      gateG.fillTriangle(arcGX - 5, cy + dy, arcGX + 2, cy + dy - 5, arcGX + 2, cy + dy + 5)
      gateG.fillTriangle(arcGX + 9, cy + dy, arcGX + 2, cy + dy - 5, arcGX + 2, cy + dy + 5)
    }

    // Lock icons (🔒) as text above each gate
    const lockStyle = {
      fontSize: '14px', fontFamily: 'system-ui', color: '#ffffff',
      stroke: '#000000', strokeThickness: 3,
    }
    this.scene.add.text(cx, 2882, '🔒 Frozen Ruins', lockStyle)
      .setOrigin(0.5, 1).setDepth(3.7)
    this.scene.add.text(corrGX - 3, cy, '🔒', lockStyle)
      .setOrigin(1, 0.5).setDepth(3.7)
    this.scene.add.text(arcGX + 3, cy, '🔒', lockStyle)
      .setOrigin(0, 0.5).setDepth(3.7)

    // Volcanic Wastes gate — seal at the y=1800 border (top of Frozen Ruins)
    // The north path leads up through Frozen Ruins into Volcanic at y=1800
    gateG.lineStyle(4, 0xff4400, 0.80)
    gateG.lineBetween(cx - 70, 1802, cx + 70, 1802)
    gateG.lineStyle(2, 0xff8844, 0.50)
    gateG.lineBetween(cx - 70, 1798, cx + 70, 1798)
    gateG.lineBetween(cx - 70, 1806, cx + 70, 1806)
    for (const dx of [-40, 0, 40]) {
      gateG.fillStyle(0xff5500, 0.65)
      gateG.fillTriangle(cx + dx, 1795, cx + dx - 5, 1802, cx + dx + 5, 1802)
      gateG.fillTriangle(cx + dx, 1809, cx + dx - 5, 1802, cx + dx + 5, 1802)
    }
    this.scene.add.text(cx, 1783, '🔒 Volcanic Wastes', lockStyle).setOrigin(0.5, 1).setDepth(3.7)

    // ── Zone transition softeners (blend strips at zone edges) ────────────────
    // Volcanic/Frozen border (y ~1780–1820) — only over non-elven zone
    g.fillStyle(0x3a0a00, 0.12)
    g.fillRect(EX, 1750, S, 80)
    // Frozen/central gradient (y ~2880–2920)
    g.fillStyle(0x88ccff, 0.06)
    g.fillRect(EX, 2860, S, 80)
    // Central/Forest gradient (y ~4280–4320)
    g.fillStyle(0x002200, 0.07)
    g.fillRect(EX, 4260, S, 80)
    // Elven/central gradient (left strip at y ~4260–4340)
    g.fillStyle(0x001a14, 0.08)
    g.fillRect(0, 4260, EX, 80)
    // Corrupted/central vertical gradient (x = EX+1500 = 3000)
    g.fillStyle(0x220000, 0.06)
    g.fillRect(EX + 1420, 2900, 80, 1400)
    // Arcane/central vertical gradient (x = EX+2100 = 3600)
    g.fillStyle(0x110022, 0.06)
    g.fillRect(EX + 2060, 2900, 80, 1400)
    // Elven/Forest border at x = EX (1500)
    g.fillStyle(0x001a14, 0.07)
    g.fillRect(EX - 60, 4300, 80, 1100)

    // ── Volcanic Wastes decor (y:0–1800, x:EX–WW = 1500–5100) ───────────────
    // Zone-wide ash floor — dark grey soot
    g.fillStyle(0x1c1816, 0.30)
    for (let i = 0; i < 60; i++) {
      const ax = Phaser.Math.FloatBetween(EX + 30, WW - 30)
      const ay = Phaser.Math.FloatBetween(20, 1770)
      g.fillEllipse(ax, ay, Phaser.Math.Between(40, 140), Phaser.Math.Between(14, 40))
    }
    g.fillStyle(0x2e2a24, 0.25)
    for (let i = 0; i < 40; i++) {
      const ax = Phaser.Math.FloatBetween(EX + 40, WW - 40)
      const ay = Phaser.Math.FloatBetween(20, 1770)
      g.fillEllipse(ax, ay, Phaser.Math.Between(20, 70), Phaser.Math.Between(8, 20))
    }

    // Lava rivers — horizontal bands crossing the zone
    const lavaRivers: [number, number, number, number][] = [
      [EX, 200,  WW, 200],   [EX, 640,  WW, 640],
      [EX, 1050, WW, 1050],  [EX, 1450, WW, 1450],
      [EX+800, 0,  EX+800,  900],   [EX+2400, 0, EX+2400, 500],
    ]
    g.lineStyle(14, 0x8a2200, 0.75)
    for (const [x1, y1, x2, y2] of lavaRivers) g.lineBetween(x1, y1, x2, y2)
    g.lineStyle(7, 0xdd4400, 0.60)
    for (const [x1, y1, x2, y2] of lavaRivers) g.lineBetween(x1, y1, x2, y2)
    g.lineStyle(3, 0xff8800, 0.45)
    for (const [x1, y1, x2, y2] of lavaRivers) g.lineBetween(x1, y1, x2, y2)

    // Lava pools
    const lavaPools: [number, number, number, number][] = [
      [EX+300,  350, 220, 80], [EX+900,  160, 180, 70], [EX+1600, 420, 260, 90],
      [EX+2400, 260, 200, 75], [EX+3100, 500, 240, 85], [EX+500,  850, 190, 70],
      [EX+1200, 1100, 210, 78], [EX+2000, 950, 230, 82], [EX+2800, 1200, 200, 72],
      [EX+700, 1450, 220, 80], [EX+1900, 1580, 195, 74], [EX+3000, 1480, 210, 78],
    ]
    g.fillStyle(0x6a1800, 0.70)
    for (const [lx, ly, lw, lh] of lavaPools) g.fillEllipse(lx, ly, lw, lh)
    g.fillStyle(0xaa3300, 0.55)
    for (const [lx, ly, lw, lh] of lavaPools) g.fillEllipse(lx, ly, lw * 0.75, lh * 0.70)
    g.fillStyle(0xff6600, 0.25)
    for (const [lx, ly, lw, lh] of lavaPools) g.fillEllipse(lx - lw * 0.10, ly - lh * 0.12, lw * 0.38, lh * 0.30)

    // Volcanic ground cracks
    g.lineStyle(2, 0xaa2200, 0.65)
    for (let i = 0; i < 55; i++) {
      const vcx = Phaser.Math.FloatBetween(EX + 30, WW - 30)
      const vcy = Phaser.Math.FloatBetween(20, 1760)
      const dx  = Phaser.Math.Between(-70, 70)
      const dy  = Phaser.Math.Between(-50, 50)
      g.lineBetween(vcx, vcy, vcx + dx, vcy + dy)
      g.lineBetween(vcx + dx * 0.5, vcy + dy * 0.5,
        vcx + dx * 0.5 + Phaser.Math.Between(-30, 30),
        vcy + dy * 0.5 + Phaser.Math.Between(-25, 25))
    }
    g.lineStyle(1, 0xff3300, 0.30)
    for (let i = 0; i < 80; i++) {
      const vcx = Phaser.Math.FloatBetween(EX + 30, WW - 30)
      const vcy = Phaser.Math.FloatBetween(20, 1760)
      g.lineBetween(vcx, vcy, vcx + Phaser.Math.Between(-22, 22), vcy + Phaser.Math.Between(-16, 16))
    }

    // Volcanic ridge lines
    g.lineStyle(6, 0x0a0402, 0.70)
    for (const [rcx, rcy, rcw] of [
      [EX+600, 300, 500], [EX+1400, 120, 600], [EX+2200, 350, 540], [EX+3000, 200, 500],
      [EX+500, 900, 420], [EX+1600, 780, 480], [EX+2700, 950, 520],
    ] as [number, number, number][]) {
      g.lineBetween(rcx - rcw / 2, rcy, rcx + rcw / 2, rcy)
      g.lineBetween(rcx - rcw / 2, rcy + 8, rcx + rcw / 2, rcy + 8)
    }

    // Summit caldera (upper centre at cx=3300, y:280)
    g.fillStyle(0x380800, 0.80); g.fillEllipse(cx, 280, 500, 260)
    g.fillStyle(0x220400, 0.90); g.fillEllipse(cx, 280, 340, 175)
    g.fillStyle(0x8a1800, 0.60); g.fillEllipse(cx, 280, 190, 100)
    g.fillStyle(0xdd3300, 0.40); g.fillEllipse(cx, 280, 90, 48)
    g.fillStyle(0xff8800, 0.30); g.fillEllipse(cx, 280, 40, 22)
    g.lineStyle(8, 0x1a0500, 0.85); g.strokeEllipse(cx, 280, 500, 260)
    g.lineStyle(3, 0xff4400, 0.20); g.strokeEllipse(cx, 280, 490, 255)

    // Sign in Frozen Ruins pointing north
    this.scene.add.text(cx, 2830, '▲ Volcanic Wastes  ☠ Extreme Danger', {
      fontSize: '11px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      color: '#ff6622', stroke: '#000', strokeThickness: 4,
    }).setDepth(4).setOrigin(0.5)

    // ── Improved Beginner Forest — landmarks and clearings ────────────────────
    // Ancient stone shrine clearing
    g.fillStyle(0x1a2e12, 0.35)
    g.fillCircle(EX + 2400, 5020, 55)
    g.lineStyle(2, 0x446633, 0.30)
    g.strokeCircle(EX + 2400, 5020, 55)
    g.fillStyle(0x2a2a1e, 0.35)
    for (let i = 0; i < 6; i++) {
      g.fillRect(EX + 2395, 4960 + i * 12, 10, 8)
    }

    // Forest glades
    g.fillStyle(0x1e3a14, 0.20)
    for (const [gx, gy] of [[EX+2200, 5150], [EX+3000, 4950], [EX+1700, 5250]]) {
      g.fillEllipse(gx, gy, 120, 80)
    }

    // ── Improved Frozen Ruins — ruins detail ──────────────────────────────────
    // Frozen statue
    g.fillStyle(0x8ab2cc, 0.45)
    g.fillRect(EX + 1790, 2140, 18, 55)
    g.fillCircle(EX + 1800, 2135, 12)
    g.fillStyle(0xaacce0, 0.30)
    g.fillRect(EX + 1776, 2152, 50, 8)

    // Ruined tower stumps
    for (const [rx, ry] of [[EX+650, 1980], [EX+2950, 2150], [EX+3250, 2580]]) {
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
    const { cx, cy, size, worldH, worldW } = this
    const EX = worldW - size  // 1500 — left elven extension

    // ── Volcanic/Frozen cliff face at y≈1800 (Volcanic → Frozen Ruins boundary)
    const volcCliffY = 1800
    g.fillStyle(0x1a0800, 1.0)
    g.fillRect(EX, volcCliffY - 18, size, 36)
    g.fillStyle(0x3a1200, 0.85)
    g.fillRect(EX, volcCliffY - 10, size, 20)
    g.fillStyle(0xff3300, 0.18)
    g.fillRect(EX, volcCliffY - 14, size, 4)
    g.fillStyle(0x0e0500, 1.0)
    for (let rx = EX + 40; rx < worldW - 40; rx += 80) {
      const h = 16 + Math.sin(rx * 0.067) * 7 + Math.sin(rx * 0.02) * 9
      const w = 30 + Math.sin(rx * 0.033) * 12
      g.fillTriangle(rx - w / 2, volcCliffY - 10, rx + w / 2, volcCliffY - 10, rx, volcCliffY - 10 - h)
    }
    g.fillStyle(0xff4400, 0.22)
    for (let rx = EX + 40; rx < worldW - 40; rx += 80) {
      const h = 16 + Math.sin(rx * 0.067) * 7 + Math.sin(rx * 0.02) * 9
      g.fillTriangle(rx - 5, volcCliffY - 10, rx + 5, volcCliffY - 10, rx, volcCliffY - 10 - h + 4)
    }

    // ── Frozen cliff face at y≈2900 (Frozen Ruins → Central boundary)
    const cliffY = 2900
    g.fillStyle(0x0a1520, 0.9)
    g.fillRect(EX, cliffY - 18, size, 36)
    g.fillStyle(0x1a2a38, 1.0)
    g.fillRect(EX, cliffY - 12, size, 22)
    g.fillStyle(0x22364a, 0.9)
    g.fillRect(EX, cliffY - 8, size, 12)
    g.fillStyle(0xc8e8ff, 0.55)
    g.fillRect(EX, cliffY - 14, size, 4)
    g.fillStyle(0x0e1c28, 1.0)
    for (let rx = EX + 40; rx < worldW - 40; rx += 80) {
      const h = 14 + Math.sin(rx * 0.07) * 6 + Math.sin(rx * 0.019) * 8
      const w = 28 + Math.sin(rx * 0.031) * 10
      g.fillTriangle(rx - w / 2, cliffY - 12, rx + w / 2, cliffY - 12, rx, cliffY - 12 - h)
    }
    g.fillStyle(0xddf4ff, 0.38)
    for (let rx = EX + 40; rx < worldW - 40; rx += 80) {
      const h = 14 + Math.sin(rx * 0.07) * 6 + Math.sin(rx * 0.019) * 8
      g.fillTriangle(rx - 4, cliffY - 12, rx + 4, cliffY - 12, rx, cliffY - 12 - h + 2)
    }

    // ── Frozen stairway (town → Frozen Ruins pass at cliffY)
    const stairX    = cx
    const stairTopY = cliffY - 48
    const stepW = 72, stepH = 12, steps = 5
    for (let s = 0; s < steps; s++) {
      const sy = stairTopY + s * stepH
      const sw = stepW - s * 8
      g.fillStyle(0x3a5870, 1.0); g.fillRect(stairX - sw / 2, sy, sw, stepH - 1)
      g.fillStyle(0xaad4f0, 0.5); g.fillRect(stairX - sw / 2, sy, sw, 2)
      g.fillStyle(0x0a1520, 0.6); g.fillRect(stairX - sw / 2, sy + stepH - 3, sw, 3)
    }
    g.fillStyle(0x141e28, 0.95); g.fillRect(stairX - 36, cliffY - 16, 72, 18)
    g.fillStyle(0x1a2c3e, 0.85); g.fillRect(stairX - 30, cliffY - 14, 60, 12)
    const pillarH = 52
    for (const px of [stairX - 48, stairX + 48]) {
      g.fillStyle(0x2c4a62, 1.0); g.fillRect(px - 8, stairTopY - pillarH, 16, pillarH)
      g.fillStyle(0x88ccee, 0.4); g.fillRect(px - 8, stairTopY - pillarH, 4, pillarH)
      g.fillStyle(0xaadeee, 0.8); g.fillTriangle(px - 10, stairTopY - pillarH, px + 10, stairTopY - pillarH, px, stairTopY - pillarH - 16)
      g.fillStyle(0xeeffff, 0.6); g.fillTriangle(px - 4, stairTopY - pillarH, px + 4, stairTopY - pillarH, px, stairTopY - pillarH - 8)
    }

    // ── Stone path edging (town → each cliff)
    const pathEdgeG = this.scene.add.graphics().setDepth(1)
    for (let py = cy - 260; py > cliffY + 40; py -= 48) {
      pathEdgeG.fillStyle(0x2e2820, 0.35)
      pathEdgeG.fillRect(cx - 38, py, 14, 10)
      pathEdgeG.fillRect(cx + 24, py, 14, 10)
    }

    // ── Pre-volcanic scorch (bottom of volcanic zone, y: 1650–1800)
    const scorchG = this.scene.add.graphics().setDepth(1)
    for (let band = 0; band < 4; band++) {
      const byOff = band * 30
      scorchG.fillStyle(0x3a1800, 0.06 + band * 0.04)
      scorchG.fillRect(EX, volcCliffY - 140 + byOff, size, 30)
    }

    // ── Elven forest treeline at y≈4300 (entry into Elven Wilds / Forest)
    const forestY = 4300
    g.fillStyle(0x0a1a10, 0.8)
    g.fillRect(0, forestY - 10, 1500, 22)  // elven tree-line strip
    g.fillStyle(0x143020, 0.85)
    g.fillRect(0, forestY - 6, 1500, 12)
    g.fillStyle(0x88ccaa, 0.22)
    g.fillRect(0, forestY - 12, 1500, 3)   // moonlit canopy glint

    // ── Mountain peaks along north border of volcanic zone (y≈0, x: EX–WW)
    const peakG = this.scene.add.graphics().setDepth(0.5)
    peakG.fillStyle(0x1a0800, 0.90)
    for (let px = EX; px < worldW; px += 120) {
      const ph = 60 + Math.sin(px * 0.017) * 30 + Math.sin(px * 0.009) * 22
      const pw = 80 + Math.sin(px * 0.023) * 30
      peakG.fillTriangle(px - pw / 2, 0, px + pw / 2, 0, px + pw / 4, -ph)
      peakG.fillStyle(0xff3300, 0.15)
      peakG.fillTriangle(px - pw / 8, 0, px + pw / 8, 0, px + pw / 16, -ph * 0.35)
      peakG.fillStyle(0x1a0800, 0.90)
    }

    // ── Path milestone stones
    const msG = this.scene.add.graphics().setDepth(4)
    const milestones: Array<[number, number, string]> = [
      [cx,       cy - 240,  'FROZEN\nRUINS ↑'],
      [cx - 220, cy,        '← CORRUPTED\n   FIELDS'],
      [cx + 220, cy,        'ARCANE\nCAVES →'],
      [cx,       cy + 240,  'FOREST ↓'],
      [cx,       cliffY + 30, '↑ RUINS'],
      [cx,       volcCliffY + 30, '↑ VOLCANIC'],
      [EX - 200, cy + 240,  '← ELVEN\n  WILDS'],  // points left toward x:0-EX
    ]
    for (const [mx, my, label] of milestones) {
      msG.fillStyle(0x3c3028, 0.9); msG.fillRect(mx - 18, my - 14, 36, 28)
      msG.fillStyle(0x5a4a38, 0.5); msG.fillRect(mx - 18, my - 14, 36, 5)
      this.scene.add.text(mx, my, label, {
        fontSize: '9px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        color: '#9a8070', align: 'center', stroke: '#000', strokeThickness: 2,
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
    const WW = this.worldW     // 5100
    const WH = this.worldH     // 5400
    const EX = WW - this.size  // 1500 — elven x offset; forest starts at EX

    // Forest x range: EX–WW (1500–5100, full base width)
    // Forest y range: 4300–5400

    // ── Rivers ───────────────────────────────────────────────────────────────
    const mainRiver = (x: number) => 4860 + Math.sin(x * 0.0024) * 85 + Math.sin(x * 0.0009) * 40
    const creek     = (x: number) => 5200 + Math.sin(x * 0.004) * 45
    this.drawRiver(mainRiver, EX, WW, 34)
    this.drawRiver(creek, EX + 2200, WW, 18)
    this.addRiverParticles(mainRiver, EX, WW, 34)
    this.addRiverParticles(creek, EX + 2200, WW, 18)

    // Bridge where south road crosses main river
    this.scene.add.image(this.cx, mainRiver(this.cx), 'bridge').setDepth(2.6).setOrigin(0.5, 0.5)

    // Reeds + lily pads along the main river
    for (let x = EX + 100; x < WW - 80; x += Phaser.Math.Between(120, 220)) {
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
    const cabinX = EX + 2200, cabinY = 4540
    const cabin  = this.obstacles.create(cabinX, cabinY, 'forest_cabin') as Phaser.Physics.Arcade.Sprite
    cabin.setOrigin(0.5, 1).setDepth(3)
    const cb = cabin.body as Phaser.Physics.Arcade.StaticBody
    cb.setSize(56, 26); cb.setOffset(8, 36); cabin.refreshBody()
    const cg = this.scene.add.graphics().setDepth(1.4).setBlendMode(Phaser.BlendModes.ADD)
    cg.fillStyle(0xff8833, 0.06); cg.fillCircle(cabinX, cabinY - 28, 64)

    // ── Bushes ──────────────────────────────────────────────────────────────────
    for (let i = 0; i < 50; i++) {
      const x = Phaser.Math.FloatBetween(EX + 60, WW - 70)
      const y = Phaser.Math.FloatBetween(4360, WH - 60)
      if (Phaser.Math.Distance.Between(x, y, this.cx, this.cy) < SAFE_RADIUS) continue
      this.scene.add.image(x, y, 'bush').setDepth(2).setOrigin(0.5, 1)
        .setScale(Phaser.Math.FloatBetween(0.8, 1.35))
    }

    // ── Flowers ──────────────────────────────────────────────────────────────────
    const flowerTints = [0xff77aa, 0xffe066, 0x88aaff, 0xffffff, 0xcc88ff]
    for (let i = 0; i < 70; i++) {
      const x = Phaser.Math.FloatBetween(EX + 60, WW - 60)
      const y = Phaser.Math.FloatBetween(4360, WH - 60)
      this.scene.add.image(x, y, 'flower').setDepth(1.2).setOrigin(0.5, 1)
        .setTint(Phaser.Utils.Array.GetRandom(flowerTints))
        .setScale(Phaser.Math.FloatBetween(0.8, 1.4))
    }

    // ── Mushrooms ─────────────────────────────────────────────────────────────
    for (let i = 0; i < 26; i++) {
      const x = Phaser.Math.FloatBetween(EX + 60, WW - 80)
      const y = Phaser.Math.FloatBetween(4380, WH - 80)
      this.scene.add.image(x, y, 'mushroom').setDepth(1.2).setOrigin(0.5, 1)
    }

    // ── Glowing mushrooms ────────────────────────────────────────────────────────
    const gm = this.scene.add.graphics().setDepth(0.9).setBlendMode(Phaser.BlendModes.ADD)
    for (let i = 0; i < 18; i++) {
      const x = Phaser.Math.FloatBetween(EX + 60, WW - 80)
      const y = Phaser.Math.FloatBetween(4380, WH - 80)
      this.scene.add.image(x, y, 'mushroom_glow').setDepth(1.3).setOrigin(0.5, 1)
      gm.fillStyle(0x33aaff, 0.08); gm.fillCircle(x, y - 6, 28)
    }

    // ── Elven Wilds dressing — moonlit silver trees, glowing pools ────────────
    // Silver-tinted flowers
    const elvenFlowerTints = [0xaaffee, 0xddf8ff, 0xccffee, 0xeeffff, 0x88ddcc]
    for (let i = 0; i < 60; i++) {
      const x = Phaser.Math.FloatBetween(60, 1420)
      const y = Phaser.Math.FloatBetween(4360, WH - 60)
      this.scene.add.image(x, y, 'flower').setDepth(1.2).setOrigin(0.5, 1)
        .setTint(Phaser.Utils.Array.GetRandom(elvenFlowerTints))
        .setScale(Phaser.Math.FloatBetween(0.7, 1.2))
    }
    // Glowing mushrooms in elven zone (blue-teal hue)
    const egm = this.scene.add.graphics().setDepth(0.9).setBlendMode(Phaser.BlendModes.ADD)
    for (let i = 0; i < 22; i++) {
      const x = Phaser.Math.FloatBetween(60, 1420)
      const y = Phaser.Math.FloatBetween(4380, WH - 80)
      this.scene.add.image(x, y, 'mushroom_glow').setDepth(1.3).setOrigin(0.5, 1)
        .setTint(0x44ffcc)
      egm.fillStyle(0x22ffaa, 0.07); egm.fillCircle(x, y - 6, 32)
    }
    // Bush equivalents — slightly smaller in elven zone
    for (let i = 0; i < 30; i++) {
      const x = Phaser.Math.FloatBetween(60, 1420)
      const y = Phaser.Math.FloatBetween(4360, WH - 60)
      this.scene.add.image(x, y, 'bush').setDepth(2).setOrigin(0.5, 1)
        .setTint(0x4a8060).setScale(Phaser.Math.FloatBetween(0.7, 1.1))
    }
  }

  // ── Zone camps ────────────────────────────────────────────────────────────

  private buildCamps() {
    const add = (x: number, y: number, key: string, depth = 3, ox = 0.5, oy = 1) =>
      this.scene.add.image(x, y, key).setDepth(depth).setOrigin(ox, oy)

    // Each camp: [cx, cy, tentTint, fireTint, glowColor]
    const EX = this.worldW - this.size  // 1500
    const camps: Array<[number, number, number, number, number]> = [
      [EX+1800, 2350, 0xaaddff, 0x88ccff, 0x4488ff],  // Frozen Ruins — Mage Solvara (x:3300)
      [EX+ 750, 3600, 0xaa5533, 0xff4400, 0xff2200],  // Corrupted Fields — Ranger Aldric (x:2250)
      [EX+2850, 3600, 0x8844cc, 0x8833ff, 0x6600cc],  // Arcane Caves — Hermit Zethkar (x:4350)
      [EX+1800,  900, 0x662200, 0xff4400, 0xff2200],  // Volcanic Wastes — Pyromancer Ignis (x:3300)
      [    600, 4680, 0x224422, 0x33ff88, 0x00ffaa],  // Elven Wilds — Elder Liriel (x:600, no offset)
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
    const HH = this.worldH
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
    const S  = this.size
    const WW = this.worldW
    const EX = WW - S  // 1500

    // Beginner Forest (x:EX-WW, y:4300-5400) — dense healthy trees
    this.scatter('tree',      EX,      4300, S,    1100, 50)

    // Frozen Ruins (x:EX-WW, y:1800-2900) — ice crystals + frozen boulders
    this.scatter('ice_obs',   EX,      1800, S,    1100, 55)
    this.scatter('rock_obs',  EX,      1800, S,    1100, 28)

    // Corrupted Fields (x:EX-EX+1500, y:2900-4300) — twisted dead trees + stone
    this.scatter('dead_tree', EX,      2900, 1500, 1400, 26)
    this.scatter('rock_obs',  EX,      2900, 1500, 1400, 14)

    // Arcane Caves (x:EX+2100-WW, y:2900-4300) — arcane pillars + boulders
    this.scatter('pillar_obs', EX+2100, 2900, 1500, 1400, 28)
    this.scatter('rock_obs',   EX+2100, 2900, 1500, 1400, 16)

    // Central corridor (x:EX+1300-EX+2300) — sparse, player can navigate
    this.scatter('tree',     EX+1300, 2900, 1000, 1400, 12)
    this.scatter('rock_obs', EX+1300, 2900, 1000, 1400,  6)

    // ── Volcanic Wastes (x:EX-WW, y:0-1800) — lava rocks + obsidian spires ──
    this.scatter('lava_rock',      EX, 0,    S,    1800, 55)
    this.scatter('obsidian_spire', EX, 0,    S,     900, 30)  // summit
    this.scatter('obsidian_spire', EX, 900,  S,     900, 20)  // lower
    this.scatter('ash_mound',      EX, 1400, S,     400, 22)  // approach
    this.scatter('rock_obs',       EX, 0,    S,    1800, 20)

    // ── Elven Wilds (x:0-EX, y:4300-5400) — elven trees + moonwells ──────────
    this.scatter('elven_tree', 0, 4300, EX, 1100, 30)
    this.scatter('moonwell',   0, 4300, EX, 1100, 10)
    this.scatter('elven_ruin', 0, 4300, EX, 1100,  8)
    this.scatter('rock_obs',   0, 4300, EX, 1100,  8)

    // ── Extra tree clusters in Beginner Forest ────────────────────────────────
    const treeClusters: [number, number][] = [
      [EX+1600, 4500], [EX+1900, 4650], [EX+2000, 4450], [EX+2200, 4600],
      [EX+2700, 4500], [EX+3200, 4700], [EX+2100, 5100], [EX+2800, 5150],
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

    // Extra campfires in the Beginner Forest (x:EX+, y:4300-5400)
    const forestFires: [number, number][] = [
      [EX+1700, 4650], [EX+2200, 4800], [EX+2700, 4700], [EX+3100, 4500],
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

    // Forest campfires (Beginner Forest)
    const EX = this.worldW - this.size  // 1500
    const forestFires: [number, number][] = [
      [EX+1700, 4650], [EX+2200, 4800], [EX+2700, 4700], [EX+3100, 4500],
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
      [EX+1800, 4850], [EX+1800, 2380], [EX+750, 3600], [EX+2850, 3600],
    ]
    for (const [px, py] of portalPositions) {
      this.addFireGlow(g, px, py - 20, 0x8833ff, 80, 35, 0.025, 0.05)
    }

    // ── Volcanic Wastes (x:EX-WW, y:0-1800) — orange-red lava ambient glow ───
    const lavaG = this.scene.add.graphics().setDepth(0.09).setBlendMode(Phaser.BlendModes.ADD)
    lavaG.fillStyle(0xff3300, 0.05)
    lavaG.fillRect(EX, 0, this.size, 1800)
    const lavaPools2: [number, number][] = [
      [EX+300, 320], [EX+900, 520], [EX+1500, 180], [EX+2200, 640],
      [EX+2800, 350], [EX+3200, 820], [EX+600, 1100], [EX+1800, 280],
      [EX+2400, 1300], [EX+3400, 1100],
    ]
    for (const [lx, ly] of lavaPools2) {
      this.addFireGlow(lavaG, lx, ly, 0xff4400, 200, 90, 0.038, 0.075)
    }
    // Caldera — big bright hotspot at cx
    this.addFireGlow(lavaG, this.cx, 280, 0xff6600, 380, 160, 0.055, 0.11)

    // ── Frozen Ruins (x:EX-WW, y:1800-2900) — cold blue zone ambient glow ───
    const coldG = this.scene.add.graphics().setDepth(0.09).setBlendMode(Phaser.BlendModes.ADD)
    coldG.fillStyle(0x44aaff, 0.04)
    coldG.fillRect(EX, 1800, this.size, 1100)
    const lakeGlows: [number, number][] = [
      [EX+380, 1980], [EX+1050, 2220], [EX+2080, 1950], [EX+2750, 2280], [EX+1650, 2580], [EX+3180, 2050],
    ]
    for (const [lx, ly] of lakeGlows) {
      this.addFireGlow(coldG, lx, ly, 0x66ccff, 180, 80, 0.03, 0.055)
    }
    for (const [lx, ly] of [[EX+600, 2140], [EX+1400, 1980], [EX+2400, 2400], [EX+3000, 2620], [EX+1800, 2750]]) {
      this.addFireGlow(coldG, lx, ly, 0x99ddff, 100, 45, 0.025, 0.04)
    }

    // ── Elven Wilds (x:0-1500, y:4300-5400) — teal moonlit ambient glow ─────
    const elvenG = this.scene.add.graphics().setDepth(0.09).setBlendMode(Phaser.BlendModes.ADD)
    elvenG.fillStyle(0x00ffcc, 0.025)
    elvenG.fillRect(0, 4300, 1500, 1100)
    // Moonwell glows — silver-teal pools of fae light
    const moonwellGlows: [number, number][] = [
      [200, 4450], [700, 4620], [1100, 4480], [400, 4850],
      [950, 4950], [150, 5100], [1300, 5200], [600, 5280],
    ]
    for (const [mx, my] of moonwellGlows) {
      this.addFireGlow(elvenG, mx, my, 0x44ffcc, 120, 55, 0.030, 0.055)
    }
    // Rune circle bright points — starlight glints
    for (const [rx, ry] of [[350, 4540], [850, 4730], [1200, 5050], [500, 5180]]) {
      this.addFireGlow(elvenG, rx, ry, 0xaaddff, 70, 30, 0.025, 0.04)
    }
  }

  private buildSnowfall() {
    // Snowfall emitters scattered across the Frozen Ruins zone (y: 1800–2900)
    // Each emitter covers a ~600×300 patch; together they blanket the whole zone.
    const EX = this.worldW - this.size  // 1500
    const emitterCenters: [number, number][] = [
      [EX+ 300, 2100], [EX+ 900, 2000], [EX+1500, 2300], [EX+1800, 1950], [EX+2100, 2500],
      [EX+2700, 2150], [EX+3300, 2000], [EX+ 600, 2600], [EX+1200, 2750], [EX+3000, 2550],
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
      elven_tree:     [11, 8,  4],
      moonwell:       [14, 8,  8],
      elven_ruin:     [10, 8,  6],
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
    const EX = this.worldW - this.size  // 1500
    const entries: { x: number; y: number; zoneId: string; label: string; col: string }[] = [
      { x: EX+1800, y: 4850, zoneId: 'Beginner Forest',  label: "Thornback's Lair",  col: '#44cc44' },
      { x: EX+1800, y: 2380, zoneId: 'Frozen Ruins',     label: "Frostlord's Tomb",  col: '#88ccff' },
      { x: EX+ 750, y: 3600, zoneId: 'Corrupted Fields', label: "Corruptor's Pit",   col: '#cc4444' },
      { x: EX+2850, y: 3600, zoneId: 'Arcane Caves',     label: "Warden's Sanctum",  col: '#aa44ff' },
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

    // ── Elven Wilds (x: 0–1500, y: 4300–5400) — danger 1 ───────────────────
    // Moonlit forest — night elves, high elves, rare Starweaver archmage.
    // Entry camps — east edge (x≈1100–1400), player approaches from Beginner Forest
    for (const [cx, cy] of [
      [1350, 4420], [1380, 4780], [1320, 5100],
    ] as [number, number][]) {
      push(cx, cy, 180, [NightbladeWarden, NightbladeWarden, MoonwatcherArcher], 2)
    }
    // Core camps — spread through the moonlit interior
    for (const [cx, cy] of [
      [ 700, 4450], [ 280, 4520], [1100, 4700],
      [ 450, 4850], [ 900, 5050], [ 200, 5150],
    ] as [number, number][]) {
      push(cx, cy, 240, [NightbladeWarden, HighElfSentinel, MoonwatcherArcher, ElvenMystic], 3)
    }
    // Deep camps — far west, Starweaver's domain
    for (const [cx, cy] of [
      [ 140, 4420], [ 180, 4920], [ 120, 5260],
    ] as [number, number][]) {
      push(cx, cy, 280, [HighElfSentinel, ElvenMystic, ElvenMystic, NightbladeWarden, Starweaver], 4)
    }

    // ── Beginner Forest (x: 1500–5100, y: 4300–5400) — danger 1 ─────────────
    // Dungeon entrance at (3300, 4850) — camps stay 400px clear of it.
    // Entry camps — near the north border of forest, first enemies player sees
    for (const [cx, cy] of [
      [3200, 4380], [3800, 4360], [4400, 4380], [4900, 4390],
    ] as [number, number][]) {
      push(cx, cy, 160, [Slime, Slime, Spider], 2)
    }
    // Core camps — spread across mid-forest, avoiding the dungeon column
    for (const [cx, cy] of [
      [3100, 4720], [4000, 4680], [4800, 4640],
      [3250, 5020], [4400, 5040],
    ] as [number, number][]) {
      push(cx, cy, 240, [Slime, Spider, Bandit, Bandit], 3)
    }
    // Deep camps — far south, clear of dungeon at (3300, 4850)
    push(3600, 5240, 250, [Bandit, Bandit, Bear, Bear, Spider], 4)
    push(4100, 5180, 250, [Bandit, DefiasCaster, Bear, Bandit, Thornback], 4)
    push(4600, 5220, 250, [Bandit, Bandit, Bear, Bear, Spider], 4)
    push(4900, 5150, 250, [Bandit, DefiasCaster, Bandit, Bear, Thornback], 4)

    // ── Frozen Ruins (x: 1500–5100, y: 1800–2900) — danger 2 ───────────────────
    // Dungeon entrance at (3300, 2380) — camps stay 400px clear.
    // Entry camps — near the south border (y≈2700–2860), spread west to east
    push(1880, 2800, 280, [Ghoul, Ghoul, Brute], 3)
    push(2450, 2760, 280, [Ghoul, Ghoul, Wraith], 3)
    push(4200, 2770, 280, [Ghoul, Ghoul, Brute], 3)
    push(4800, 2790, 280, [Ghoul, Ghoul, Wraith], 3)
    // Core camps — mid-zone, flanking wide of dungeon column
    push(1760, 2480, 320, [Ghoul, Ghoul, Brute, Brute], 4)
    push(2320, 2520, 320, [Ghoul, Wraith, Brute, Ghoul], 4)
    push(3900, 2500, 320, [Ghoul, Ghoul, Brute, Brute], 4)
    push(4600, 2450, 320, [Ghoul, Wraith, Wraith, Brute], 4)
    push(2800, 2700, 320, [Ghoul, Ghoul, Brute, Ghoul], 4)
    push(4400, 2660, 320, [Ghoul, Wraith, Wraith, Brute, Ghoul], 5)
    // Deep camps — deep north (y: 1840–2000), Frost Warden patrols
    for (const [cx, cy] of [
      [2000, 2000], [2700, 1960], [4000, 2020], [4800, 1980],
    ] as [number, number][]) {
      push(cx, cy, 320, [Wraith, Wraith, Brute, Brute, Ghoul, FrostWarden], 6)
    }

    // ── Corrupted Fields (x: 1500–3000, y: 2900–4300) — danger 3 ───────────────
    // Dungeon entrance at (2250, 3600) — camps stay 400px clear.
    // Entry camps — east edge (x≈2800–3000), player enters from right
    for (const [cx, cy] of [
      [2880, 3120], [2920, 3720], [2860, 4180],
    ] as [number, number][]) {
      push(cx, cy, 260, [Imp, Imp, CorruptedDragonkin], 3)
    }
    // Core camps — spread north/south of dungeon, not near (2250, 3600)
    for (const [cx, cy] of [
      [2400, 3100], [1850, 3240], [2600, 3980],
      [1900, 4150], [2420, 4250],
    ] as [number, number][]) {
      push(cx, cy, 300, [Imp, Imp, Imp, CorruptedDragonkin, Golem], 5)
    }
    // Deep camps — far west, Corrupted Mage lurks here
    for (const [cx, cy] of [
      [1660, 3100], [1700, 3720], [1640, 4180],
    ] as [number, number][]) {
      push(cx, cy, 300, [Imp, CorruptedDragonkin, Golem, Golem, Imp, CorruptedMage], 6)
    }

    // ── Arcane Caves (x: 3600–5100, y: 2900–4300) — danger 4 ────────────────
    // Dungeon entrance at (4350, 3600) — camps stay 400px clear.
    // Entry camps — west edge (x≈3600–3800), player enters from left
    push(3680, 3120, 280, [ArcaneGolem, ArcaneGolem, ArcaneGolem], 3)
    push(3650, 3740, 280, [Wraith, Wraith, ArcaneGolem], 3)
    push(3720, 4220, 280, [ArcaneGolem, ArcaneGolem, ArcaneGolem], 3)
    // Core camps — north/south of dungeon and far east, not near (4350, 3600)
    for (const [cx, cy] of [
      [4150, 3080], [4700, 3280], [4200, 4180],
      [4800, 4000], [4000, 4280],
    ] as [number, number][]) {
      push(cx, cy, 300, [Wraith, Wraith, ArcaneGolem, ArcaneGolem], 4)
    }
    // Deep camps — far east, Arcane Lich haunts these ruins
    for (const [cx, cy] of [
      [4950, 3120], [5000, 3700], [4980, 4180],
    ] as [number, number][]) {
      push(cx, cy, 300, [Wraith, ArcaneGolem, ArcaneGolem, ArcaneGolem, Elite, ArcaneLich], 5)
    }

    // ── Volcanic Wastes (x: 1500–5100, y: 0–1800) — danger 5 ───────────────────
    // No dungeon — camps spread freely across the wide lava plateau.
    // Approach (y: 1400–1800) — where frozen ruins meet volcanic ash
    for (const [cx, cy] of [
      [1800, 1680], [2400, 1720], [3000, 1660],
      [3700, 1700], [4400, 1680], [4900, 1720],
    ] as [number, number][]) {
      push(cx, cy, 270, [Ghoul, Brute, Brute, Imp, Elite], 4)
    }
    // Core (y: 600–1400) — high Elite density; Ashen Giant roams
    for (const [cx, cy] of [
      [1780, 1020], [2400, 1180], [3000,  960],
      [3650, 1080], [4300, 1220], [4850, 1020],
      [2600, 1380], [4000, 1350],
    ] as [number, number][]) {
      push(cx, cy, 300, [Elite, Elite, Brute, Wraith, Ghoul, AshenGiant], 5)
    }
    // Summit (y: 0–600) — maximum danger, endgame farming, caldera at (3300, 280)
    for (const [cx, cy] of [
      [1820,  480], [2320,  220], [2800,  500],
      [3800,  180], [4400,  420], [4880,  260],
      [3300,  520], [2100,  100],
    ] as [number, number][]) {
      push(cx, cy, 320, [Elite, Elite, Elite, Brute, Wraith, Wraith, AshenGiant], 6)
    }
  }
}
