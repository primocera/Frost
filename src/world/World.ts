import Phaser from 'phaser'
import { EnemyConfig, Slime, Ghoul, Imp, Brute, Wraith, Elite } from '../entities/EnemyTypes'

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
  danger:     1 | 2 | 3 | 4
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
  readonly size: number
  readonly cx:   number
  readonly cy:   number
  readonly obstacles:        Phaser.Physics.Arcade.StaticGroup
  readonly spawnZones:       SpawnZone[] = []
  readonly dungeonEntrances: DungeonEntrance[] = []
  readonly stashChestPos:    { x: number; y: number } = { x: 0, y: 0 }

  constructor(private scene: Phaser.Scene, size: number) {
    this.size = size
    this.cx   = size / 2
    this.cy   = size / 2
    this.obstacles = scene.physics.add.staticGroup()

    this.buildTextures()
    this.buildTerrain()
    this.buildDecor()
    this.buildBoundary()
    this.buildObstacles()
    this.buildAmbientLight()
    this.buildSnowfall()
    this.buildDungeonEntrances()
    this.buildSpawnZones()
    scene.physics.world.setBounds(0, 0, size, size)
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

    // ── NPC: Quest Giver ─────────────────────────────────────────────────────
    g.fillStyle(0x5533aa)
    g.fillEllipse(14, 20, 20, 24)          // robe
    g.fillStyle(0xffcc88)
    g.fillCircle(14, 9, 7)                 // face
    g.fillStyle(0x3322aa)
    g.fillEllipse(14, 7, 18, 10)           // hood
    g.fillStyle(0xffd700, 0.8)
    g.fillRect(24, 5, 3, 26)               // staff
    g.fillCircle(25, 4, 4)
    g.generateTexture('npc_quest', 30, 36)
    g.clear()

    // ── NPC: Merchant ────────────────────────────────────────────────────────
    g.fillStyle(0x886622)
    g.fillEllipse(14, 20, 20, 24)          // tunic
    g.fillStyle(0xffcc88)
    g.fillCircle(14, 9, 7)                 // face
    g.fillStyle(0x553300)
    g.fillEllipse(14, 6, 22, 8)            // hat brim
    g.fillRect(8, 4, 12, 7)               // hat crown
    g.fillStyle(0xffdd00, 0.7)
    g.fillCircle(20, 22, 4)                // coin glint
    g.generateTexture('npc_merchant', 30, 36)
    g.clear()

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
    const S   = this.size
    const add = (x: number, y: number, w: number, h: number, key: string, depth = 0) =>
      this.scene.add.tileSprite(x, y, w, h, key).setOrigin(0).setDepth(depth)

    // Base — plains everywhere
    add(0, 0, S, S, 't_plains')

    // Zone overlays
    add(0,    2500, S,    1100, 't_forest',  0.1)  // Beginner Forest (bottom)
    add(0,    0,    S,    1100, 't_frozen',  0.1)  // Frozen Ruins (top)
    add(0,    1100, 1500, 1400, 't_corrupt', 0.1)  // Corrupted Fields (left)
    add(2100, 1100, 1500, 1400, 't_arcane',  0.1)  // Arcane Caves (right)

    // Snow drifts over frozen ruins — lighter patches for deep snow areas
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
  }

  // ── Hard boundary ─────────────────────────────────────────────────────────

  private buildBoundary() {
    const S = this.size
    const W = 56
    const g = this.scene.add.graphics().setDepth(0.5)
    g.fillStyle(0x070f07)
    g.fillRect(0, 0,     S, W)
    g.fillRect(0, S - W, S, W)
    g.fillRect(0, W,     W, S - W * 2)
    g.fillRect(S - W, W, W, S - W * 2)
    g.lineStyle(2, 0x2a4a2a, 0.7)
    g.strokeRect(W, W, S - W * 2, S - W * 2)
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
      tree:       [13, 6,  3],
      dead_tree:  [8,  9,  4],
      rock_obs:   [13, 9,  4],
      ice_obs:    [5,  5, 22],   // collision at crystal base
      pillar_obs: [8,  3, 12],
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

  private buildSpawnZones() {
    const zoneBoundsFor = (cx: number, cy: number) => {
      const z = ZONE_DEFS.find(d => cx >= d.x && cx < d.x + d.w && cy >= d.y && cy < d.y + d.h)
      return z ? { x: z.x, y: z.y, w: z.w, h: z.h } : null
    }

    // ── Beginner Forest (y: 2500–3600) — danger 1, sparse ────────────────
    for (const [cx, cy] of [
      [500, 2900], [1200, 2800], [1800, 3100],
      [2400, 2850], [3100, 2950], [1800, 3450],
    ] as [number, number][]) {
      this.spawnZones.push({
        cx, cy, radius: 260,
        table: [Slime, Slime, Slime, Ghoul],
        maxEnemies: 3,
        zoneBounds: zoneBoundsFor(cx, cy),
      })
    }

    // ── Frozen Ruins (y: 0–1100) — danger 2 ───────────────────────────────
    for (const [cx, cy] of [
      [480,  340], [1200, 620], [1800, 300],
      [2400, 620], [3120, 340], [1800, 900],
    ] as [number, number][]) {
      this.spawnZones.push({
        cx, cy, radius: 340,
        table: [Ghoul, Ghoul, Wraith, Wraith, Brute],
        maxEnemies: 5,
        zoneBounds: zoneBoundsFor(cx, cy),
      })
    }

    // ── Corrupted Fields (x: 0–1500, y: 1100–2500) — danger 3 ────────────
    for (const [cx, cy] of [
      [380, 1420], [900, 1760], [340, 2120], [1080, 2320],
    ] as [number, number][]) {
      this.spawnZones.push({
        cx, cy, radius: 340,
        table: [Imp, Imp, Imp, Ghoul, Brute],
        maxEnemies: 5,
        zoneBounds: zoneBoundsFor(cx, cy),
      })
    }

    // ── Arcane Caves (x: 2100–3600, y: 1100–2500) — danger 4 ─────────────
    for (const [cx, cy] of [
      [2440, 1420], [3120, 1720], [2700, 2120], [3320, 2360],
    ] as [number, number][]) {
      this.spawnZones.push({
        cx, cy, radius: 360,
        table: [Wraith, Wraith, Brute, Elite, Ghoul],
        maxEnemies: 4,
        zoneBounds: zoneBoundsFor(cx, cy),
      })
    }

    // ── Central transition — pushed away from town, safe starter zone ────
    for (const [cx, cy] of [
      [1050, 1650], [2550, 1650], [1150, 2350], [2450, 2350],
    ] as [number, number][]) {
      this.spawnZones.push({
        cx, cy, radius: 220,
        table: [Slime, Slime, Ghoul],
        maxEnemies: 3,
        zoneBounds: zoneBoundsFor(cx, cy),
      })
    }
  }
}
