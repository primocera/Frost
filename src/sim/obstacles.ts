import { STARTER_X, STARTER_Y, FARM_X, FARM_Y, PVP_SAFE_R, ZONE_DEFS } from './zones'

/**
 * Static, solid world obstacles as circles, in the pure sim so the server and
 * the client's movement prediction resolve them identically (no desync).
 *  - BUILDINGS: hand-placed structures (mirror engine/Props.ts). Players AND
 *    enemies collide with these.
 *  - TREES: deterministically scattered big trees. Players collide with their
 *    trunks; the renderer draws them from this same list so what you see is what
 *    blocks you. (Enemies skip trees to keep the per-tick cost low.)
 */
export interface Obstacle { x: number; y: number; r: number }
export type TreeKind = 'oak' | 'tree' | 'pine' | 'glow' | 'aurora'
export interface TreeObstacle extends Obstacle { kind: TreeKind; s: number }

export const BUILDINGS: Obstacle[] = [
  { x: FARM_X - 66, y: FARM_Y - 58, r: 40 },   // cottage
  { x: FARM_X + 96, y: FARM_Y + 26, r: 20 },   // coop
  { x: FARM_X - 168, y: FARM_Y - 76, r: 15 },  // well
  { x: STARTER_X - 400, y: STARTER_Y - 340, r: 26 },
  { x: STARTER_X + 400, y: STARTER_Y - 340, r: 26 },
  { x: STARTER_X - 400, y: STARTER_Y + 340, r: 26 },
  { x: STARTER_X + 400, y: STARTER_Y + 340, r: 26 },
  { x: 540, y: 4660, r: 26 },   // moonwells
  { x: 1010, y: 5030, r: 26 },
  { x: 300, y: 5180, r: 26 },
]

// Which zones get solid trees, how dense, and what kind.
const TREE_SPEC: Record<string, { perM: number; kind: (r: number) => TreeKind }> = {
  'Beginner Forest':     { perM: 13, kind: (r) => (r < 0.4 ? 'oak' : r < 0.75 ? 'tree' : 'aurora') },
  'Elven Wilds':         { perM: 13, kind: (r) => (r < 0.5 ? 'aurora' : 'glow') },
  'Mount Hyjal':         { perM: 12, kind: () => 'pine' },
  'Hillsbrad Foothills': { perM: 11, kind: (r) => (r < 0.4 ? 'pine' : r < 0.7 ? 'tree' : 'oak') },
}

function generateTrees(): TreeObstacle[] {
  let seed = 0x713ee5
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
  const inSafe = (x: number, y: number) => Math.abs(x - STARTER_X) < PVP_SAFE_R + 50 && Math.abs(y - STARTER_Y) < PVP_SAFE_R + 50
  const nearFarm = (x: number, y: number) => Math.abs(x - FARM_X) < 230 && Math.abs(y - FARM_Y) < 200
  const out: TreeObstacle[] = []
  for (const z of ZONE_DEFS) {
    const spec = TREE_SPEC[z.name]
    if (!spec) continue
    const count = Math.round((z.w * z.h) / 1_000_000 * spec.perM)
    for (let i = 0; i < count; i++) {
      const x = z.x + rnd() * z.w
      const y = z.y + rnd() * z.h
      if (inSafe(x, y) || nearFarm(x, y)) continue
      out.push({ x, y, r: 11, kind: spec.kind(rnd()), s: 0.85 + rnd() * 0.6 })
    }
  }
  return out
}

export const TREES: TreeObstacle[] = generateTrees()

/** Push a circle of `radius` at (x,y) out of buildings (and trees if asked). */
export function resolveObstacles(x: number, y: number, radius: number, withTrees = false): { x: number; y: number } {
  const push = (o: Obstacle) => {
    const dx = x - o.x, dy = y - o.y
    const min = o.r + radius
    const d2 = dx * dx + dy * dy
    if (d2 >= min * min) return
    if (d2 > 0.0001) { const d = Math.sqrt(d2); const f = (min - d) / d; x += dx * f; y += dy * f }
    else x += min
  }
  for (const o of BUILDINGS) push(o)
  if (withTrees) for (const o of TREES) push(o)
  return { x, y }
}
