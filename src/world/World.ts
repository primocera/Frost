import Phaser from 'phaser'
import { EnemyConfig, Slime, Ghoul } from '../entities/EnemyTypes'

export interface SpawnZone {
  cx: number
  cy: number
  radius: number
  table: EnemyConfig[]   // weighted pool — duplicate entries to increase odds
  maxEnemies: number
}

const BORDER      = 80    // world-edge clearance for obstacle placement
const SAFE_RADIUS = 360   // obstacle-free zone around player start

export class World {
  readonly size: number
  readonly cx:   number
  readonly cy:   number
  readonly obstacles:  Phaser.Physics.Arcade.StaticGroup
  readonly spawnZones: SpawnZone[] = []

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
    this.buildSpawnZones()
    scene.physics.world.setBounds(0, 0, size, size)
  }

  // ── Textures ─────────────────────────────────────────────────────────────

  private buildTextures() {
    const g = this.scene.add.graphics()

    const tile = (key: string, base: number, line: number) => {
      g.fillStyle(base)
      g.fillRect(0, 0, 64, 64)
      g.lineStyle(1, line, 0.45)
      g.strokeRect(0, 0, 64, 64)
      g.generateTexture(key, 64, 64)
      g.clear()
    }

    tile('t_plains', 0x1e3a1e, 0x243f24)
    tile('t_forest', 0x122212, 0x172817)
    tile('t_swamp',  0x141f14, 0x1a271a)
    tile('t_rock',   0x282e26, 0x2e342c)

    // Tree: canopy + trunk
    g.fillStyle(0x1e5c1e)
    g.fillCircle(19, 19, 16)
    g.fillStyle(0x287228, 0.55)
    g.fillCircle(13, 14, 9)
    g.fillStyle(0x4a2e0e)
    g.fillRect(15, 30, 8, 18)
    g.generateTexture('tree', 38, 48)
    g.clear()

    // Rock: lumpy grey mound
    g.fillStyle(0x5a5c58)
    g.fillEllipse(21, 17, 36, 26)
    g.fillStyle(0x4a4c48)
    g.fillEllipse(28, 20, 24, 18)
    g.fillStyle(0x787a76, 0.6)
    g.fillEllipse(14, 12, 18, 11)
    g.generateTexture('rock_obs', 44, 34)
    g.clear()

    g.destroy()
  }

  // ── Terrain layers ────────────────────────────────────────────────────────

  private buildTerrain() {
    const S = this.size
    const add = (x: number, y: number, w: number, h: number, key: string, depth = 0) =>
      this.scene.add.tileSprite(x, y, w, h, key).setOrigin(0).setDepth(depth)

    // Base — plains everywhere
    add(0, 0, S, S, 't_plains')

    // North forest band (top 20%)
    add(0, 0, S, S * 0.20, 't_forest', 0.1)
    // West forest band (left 18%)
    add(0, 0, S * 0.18, S, 't_forest', 0.1)
    // South swamp band (bottom 20%)
    add(0, S * 0.80, S, S * 0.20, 't_swamp', 0.1)
    // East rocky band (right 20%)
    add(S * 0.80, 0, S * 0.20, S, 't_rock', 0.1)

    // Central clearing — slightly lighter, drawn last on top
    const cw = 640, ch = 640
    add(this.cx - cw / 2, this.cy - ch / 2, cw, ch, 't_plains', 0.15)
  }

  // ── Decorative details (no physics) ───────────────────────────────────────

  private buildDecor() {
    const S  = this.size
    const g  = this.scene.add.graphics().setDepth(0.05)

    // Dirt path: faint line from center south toward bottom edge
    g.fillStyle(0x2a3a1a, 0.35)
    g.fillRect(this.cx - 18, this.cy, 36, S * 0.5)

    // Water puddles in swamp zone
    g.fillStyle(0x0a1a14, 0.55)
    for (const [px, py, rw, rh] of [
      [S * 0.15, S * 0.83, 80, 32], [S * 0.45, S * 0.87, 110, 40],
      [S * 0.65, S * 0.85, 70,  28], [S * 0.35, S * 0.92, 90, 36],
      [S * 0.75, S * 0.90, 60, 26],
    ]) g.fillEllipse(px, py, rw, rh)

    // Rock surface cracks in east zone
    g.lineStyle(1, 0x3a3e38, 0.5)
    for (let i = 0; i < 18; i++) {
      const x = S * 0.82 + Math.random() * S * 0.14
      const y = Math.random() * S
      g.lineBetween(x, y, x + Phaser.Math.Between(-20, 20), y + Phaser.Math.Between(-14, 14))
    }

    // Forest floor dabs — dark spots under north/west trees
    g.fillStyle(0x0e1e0e, 0.3)
    for (let i = 0; i < 30; i++) {
      const x = Math.random() < 0.5
        ? Math.random() * S * 0.18
        : Phaser.Math.FloatBetween(0, S)
      const y = Math.random() < 0.5
        ? Math.random() * S * 0.20
        : Phaser.Math.FloatBetween(0, S * 0.20)
      g.fillCircle(x, y, Phaser.Math.Between(12, 30))
    }
  }

  // ── Hard boundary ─────────────────────────────────────────────────────────

  private buildBoundary() {
    const S = this.size
    const W = 56
    const g = this.scene.add.graphics().setDepth(0.5)

    g.fillStyle(0x070f07)
    g.fillRect(0, 0,     S, W)          // top
    g.fillRect(0, S - W, S, W)          // bottom
    g.fillRect(0, W,     W, S - W * 2)  // left
    g.fillRect(S - W, W, W, S - W * 2)  // right

    // Inner edge highlight
    g.lineStyle(2, 0x2a4a2a, 0.7)
    g.strokeRect(W, W, S - W * 2, S - W * 2)
  }

  // ── Obstacles ─────────────────────────────────────────────────────────────

  private buildObstacles() {
    const S = this.size

    // North forest
    this.scatter('tree',     0,         0,          S,          S * 0.20, 38)
    // West forest
    this.scatter('tree',     0,         S * 0.20,   S * 0.18,   S * 0.60, 28)
    // South swamp
    this.scatter('tree',     0,         S * 0.80,   S,          S * 0.20, 26)
    // East rocky zone
    this.scatter('rock_obs', S * 0.80,  0,          S * 0.20,   S,        30)
    // Sparse plains scatter
    this.scatter('tree',     S * 0.20,  S * 0.20,   S * 0.60,   S * 0.60, 20)
    this.scatter('rock_obs', S * 0.20,  S * 0.20,   S * 0.60,   S * 0.60, 10)
  }

  private scatter(
    key:    string,
    zx: number, zy: number, zw: number, zh: number,
    count:  number,
  ) {
    const isTree = key === 'tree'
    // Tree: canopy collision — radius 13, offset (6, 3)
    // Rock: centre mass   — radius 13, offset (9, 4)
    const [radius, ox, oy] = isTree ? [13, 6, 3] : [13, 9, 4]

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

  // ── Spawn zones ───────────────────────────────────────────────────────────

  private buildSpawnZones() {
    const h = this.size / 2

    // Cardinal mid zones — medium difficulty
    const mid: [number, number][] = [
      [h + 720, h], [h - 720, h], [h, h + 720], [h, h - 720],
    ]
    for (const [cx, cy] of mid) {
      this.spawnZones.push({ cx, cy, radius: 380, table: [Slime, Slime, Ghoul], maxEnemies: 3 })
    }

    // Corner zones — harder
    const corners: [number, number][] = [
      [h + 1150, h + 1150], [h - 1150, h + 1150],
      [h + 1150, h - 1150], [h - 1150, h - 1150],
    ]
    for (const [cx, cy] of corners) {
      this.spawnZones.push({ cx, cy, radius: 420, table: [Ghoul, Ghoul, Slime], maxEnemies: 5 })
    }
  }
}
