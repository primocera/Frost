import {
  EnemyConfig,
  Slime, Ghoul, Imp, Brute, Wraith, Elite, Wolf, Spider, Bandit, Bear,
  Thornback, FrostWarden, CorruptedMage, ArcaneLich, AshenGiant, DefiasCaster,
  ArcaneGolem, CorruptedDragonkin, Golem,
  NightbladeWarden, MoonwatcherArcher, HighElfSentinel, ElvenMystic, Starweaver,
} from './enemies'

/** Ported verbatim from world/World.ts (pure data — no Phaser). */
export const WORLD_W = 5100
export const WORLD_H = 6500
export const WORLD_SIZE = 3600
// The old game spawned at the village (3300, 6100) and you walked north to the
// forest. The village buildings/NPCs aren't ported yet (Phase 6), so for now we
// spawn directly in the Beginner Forest where the starter camps are, so there's
// something to fight immediately. Reverts to the village once it's built.
export const STARTER_X = 3300
// Spawn sits in the mob-free village strip (y 5400–6500), below the deepest
// Beginner Forest camps (~y 5240), so the whole safe square stays clear of
// enemies. Players walk a short way north to reach combat.
export const STARTER_Y = 5900

/** No-PvP square around spawn: half-extent in px (used by sim + renderer). */
export const PVP_SAFE_R = 460

export interface ZoneDef {
  name: string
  labelColor: string
  atmosphere: number
  atmoAlpha: number
  danger: 1 | 2 | 3 | 4 | 5
  music?: string
  x: number; y: number; w: number; h: number
}

export const ZONE_DEFS: readonly ZoneDef[] = [
  { name: 'Volcanic Wastes',    labelColor: '#ff6622', atmosphere: 0x3a0a00, atmoAlpha: 0.22, danger: 5, x: 1500, y: 0,    w: 3600, h: 1800 },
  { name: 'Frozen Ruins',       labelColor: '#aaddff', atmosphere: 0x040d1e, atmoAlpha: 0.72, danger: 2, x: 1500, y: 1800, w: 3600, h: 1100 },
  { name: 'Corrupted Fields',   labelColor: '#cc4444', atmosphere: 0x220000, atmoAlpha: 0.09, danger: 3, x: 1500, y: 2900, w: 1500, h: 1400 },
  { name: 'Arcane Caves',       labelColor: '#aa44ff', atmosphere: 0x110022, atmoAlpha: 0.11, danger: 4, x: 3600, y: 2900, w: 1500, h: 1400 },
  { name: 'Mount Hyjal',        labelColor: '#44ff88', atmosphere: 0x010d04, atmoAlpha: 0.20, danger: 4, x: 0,    y: 0,    w: 1500, h: 2900 },
  { name: 'Hillsbrad Foothills',labelColor: '#aacc55', atmosphere: 0x080e00, atmoAlpha: 0.06, danger: 3, x: 0,    y: 2900, w: 1500, h: 1400 },
  { name: 'Elven Wilds',        labelColor: '#88ffcc', atmosphere: 0x001a14, atmoAlpha: 0.10, danger: 1, x: 0,    y: 4300, w: 1500, h: 1100 },
  { name: 'Beginner Forest',    labelColor: '#44cc44', atmosphere: 0x002200, atmoAlpha: 0.04, danger: 1, x: 1500, y: 4300, w: 3600, h: 1100 },
]

export function getZoneAt(wx: number, wy: number): ZoneDef | null {
  return ZONE_DEFS.find(z => wx >= z.x && wx < z.x + z.w && wy >= z.y && wy < z.y + z.h) ?? null
}

export interface SpawnZoneDef {
  cx: number; cy: number; radius: number
  table: EnemyConfig[]
  maxEnemies: number
  zoneBounds: { x: number; y: number; w: number; h: number } | null
}

function zoneBoundsFor(cx: number, cy: number) {
  const z = ZONE_DEFS.find(d => cx >= d.x && cx < d.x + d.w && cy >= d.y && cy < d.y + d.h)
  return z ? { x: z.x, y: z.y, w: z.w, h: z.h } : null
}

/** Port of World.buildSpawnZones() — the full camp layout across all 8 zones. */
export function buildSpawnZones(): SpawnZoneDef[] {
  const zones: SpawnZoneDef[] = []
  const push = (cx: number, cy: number, radius: number, table: EnemyConfig[], maxEnemies: number) =>
    zones.push({ cx, cy, radius, table, maxEnemies, zoneBounds: zoneBoundsFor(cx, cy) })

  // Hillsbrad Foothills
  for (const [cx, cy] of [[240, 4050], [600, 4120], [980, 4060], [1340, 4090], [420, 3920], [820, 3970], [1180, 3940]] as [number, number][])
    push(cx, cy, 180, [Wolf, Wolf, Bandit, Bandit], 5)
  for (const [cx, cy] of [[200, 3580], [560, 3620], [900, 3570], [1280, 3600], [350, 3320], [750, 3380], [1100, 3340]] as [number, number][])
    push(cx, cy, 200, [Bandit, Bandit, Bear, Wolf, DefiasCaster], 5)
  for (const [cx, cy] of [[180, 3060], [560, 3100], [1000, 3080], [1320, 3050]] as [number, number][])
    push(cx, cy, 220, [Bandit, DefiasCaster, Bear, Brute, Thornback], 6)

  // Mount Hyjal
  for (const [cx, cy] of [[220, 2720], [640, 2760], [1060, 2730], [1360, 2700]] as [number, number][])
    push(cx, cy, 260, [Elite, ArcaneGolem, ArcaneGolem, Wraith], 4)
  for (const [cx, cy] of [[200, 2150], [700, 2020], [1260, 2180], [380, 1480], [950, 1600], [1310, 1340], [160, 1060], [780, 1120], [1200, 980]] as [number, number][])
    push(cx, cy, 290, [NightbladeWarden, HighElfSentinel, MoonwatcherArcher, ElvenMystic, ArcaneGolem], 5)
  for (const [cx, cy] of [[260, 780], [820, 680], [1300, 740], [110, 340], [600, 240], [1150, 300], [820, 520]] as [number, number][])
    push(cx, cy, 310, [NightbladeWarden, ElvenMystic, HighElfSentinel, MoonwatcherArcher, Starweaver], 5)

  // Elven Wilds
  for (const [cx, cy] of [[1350, 4420], [1380, 4780], [1320, 5100]] as [number, number][])
    push(cx, cy, 180, [NightbladeWarden, NightbladeWarden, MoonwatcherArcher], 2)
  for (const [cx, cy] of [[700, 4450], [280, 4520], [1100, 4700], [450, 4850], [900, 5050], [200, 5150]] as [number, number][])
    push(cx, cy, 240, [NightbladeWarden, HighElfSentinel, MoonwatcherArcher, ElvenMystic], 3)
  for (const [cx, cy] of [[140, 4420], [180, 4920], [120, 5260]] as [number, number][])
    push(cx, cy, 280, [HighElfSentinel, ElvenMystic, ElvenMystic, NightbladeWarden, Starweaver], 4)

  // Beginner Forest
  for (const [cx, cy] of [[3200, 4380], [3800, 4360], [4400, 4380], [4900, 4390]] as [number, number][])
    push(cx, cy, 160, [Slime, Slime, Spider], 2)
  for (const [cx, cy] of [[2700, 4720], [4000, 4680], [4800, 4640], [2650, 5020], [4400, 5040]] as [number, number][])
    push(cx, cy, 240, [Slime, Spider, Bandit, Bandit], 3)
  push(3600, 5240, 250, [Bandit, Bandit, Bear, Bear, Spider], 4)
  push(4100, 5180, 250, [Bandit, DefiasCaster, Bear, Bandit, Thornback], 4)
  push(4600, 5220, 250, [Bandit, Bandit, Bear, Bear, Spider], 4)
  push(4900, 5150, 250, [Bandit, DefiasCaster, Bandit, Bear, Thornback], 4)

  // Frozen Ruins
  push(1880, 2800, 280, [Ghoul, Ghoul, Brute], 3)
  push(2450, 2760, 280, [Ghoul, Ghoul, Wraith], 3)
  push(4200, 2770, 280, [Ghoul, Ghoul, Brute], 3)
  push(4800, 2790, 280, [Ghoul, Ghoul, Wraith], 3)
  push(1760, 2480, 320, [Ghoul, Ghoul, Brute, Brute], 4)
  push(2320, 2520, 320, [Ghoul, Wraith, Brute, Ghoul], 4)
  push(3900, 2500, 320, [Ghoul, Ghoul, Brute, Brute], 4)
  push(4600, 2450, 320, [Ghoul, Wraith, Wraith, Brute], 4)
  push(2800, 2700, 320, [Ghoul, Ghoul, Brute, Ghoul], 4)
  push(4400, 2660, 320, [Ghoul, Wraith, Wraith, Brute, Ghoul], 5)
  for (const [cx, cy] of [[2000, 2000], [2700, 1960], [4000, 2020], [4800, 1980]] as [number, number][])
    push(cx, cy, 320, [Wraith, Wraith, Brute, Brute, Ghoul, FrostWarden], 6)

  // Corrupted Fields
  for (const [cx, cy] of [[2880, 3120], [2920, 3720], [2860, 4180]] as [number, number][])
    push(cx, cy, 260, [Imp, Imp, CorruptedDragonkin], 3)
  for (const [cx, cy] of [[2400, 3100], [1850, 3240], [2600, 3980], [1900, 4150], [2420, 4250]] as [number, number][])
    push(cx, cy, 300, [Imp, Imp, Imp, CorruptedDragonkin, Golem], 5)
  for (const [cx, cy] of [[1660, 3100], [1700, 3720], [1640, 4180]] as [number, number][])
    push(cx, cy, 300, [Imp, CorruptedDragonkin, Golem, Golem, Imp, CorruptedMage], 6)

  // Arcane Caves
  push(3680, 3120, 280, [ArcaneGolem, ArcaneGolem, ArcaneGolem], 3)
  push(3650, 3740, 280, [Wraith, Wraith, ArcaneGolem], 3)
  push(3720, 4220, 280, [ArcaneGolem, ArcaneGolem, ArcaneGolem], 3)
  for (const [cx, cy] of [[4150, 3080], [4700, 3280], [4200, 4180], [4800, 4000], [4000, 4280]] as [number, number][])
    push(cx, cy, 300, [Wraith, Wraith, ArcaneGolem, ArcaneGolem], 4)
  for (const [cx, cy] of [[4950, 3120], [5000, 3700], [4980, 4180]] as [number, number][])
    push(cx, cy, 300, [Wraith, ArcaneGolem, ArcaneGolem, ArcaneGolem, Elite, ArcaneLich], 5)

  // Volcanic Wastes
  for (const [cx, cy] of [[1800, 1680], [2400, 1720], [3000, 1660], [3700, 1700], [4400, 1680], [4900, 1720]] as [number, number][])
    push(cx, cy, 270, [Ghoul, Brute, Brute, Imp, Elite], 4)
  for (const [cx, cy] of [[1780, 1020], [2400, 1180], [3000, 960], [3650, 1080], [4300, 1220], [4850, 1020], [2600, 1380], [4000, 1350]] as [number, number][])
    push(cx, cy, 300, [Elite, Elite, Brute, Wraith, Ghoul, AshenGiant], 5)
  for (const [cx, cy] of [[1820, 480], [2320, 220], [2800, 500], [3800, 180], [4400, 420], [4880, 260], [3300, 520], [2100, 100]] as [number, number][])
    push(cx, cy, 320, [Elite, Elite, Elite, Brute, Wraith, Wraith, AshenGiant], 6)

  return zones
}
