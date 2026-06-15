import { STARTER_X, STARTER_Y, FARM_X, FARM_Y } from './zones'

/**
 * Static, solid world obstacles (buildings, towers, moonwells) as simple
 * circles. Lives in the pure sim so the server and the client's movement
 * prediction resolve them identically (no desync). Positions mirror the props
 * drawn in engine/Props.ts. Trees are added on top of this set separately.
 */
export interface Obstacle { x: number; y: number; r: number }

export const OBSTACLES: Obstacle[] = [
  // Holt's farm structures
  { x: FARM_X - 66, y: FARM_Y - 58, r: 40 },   // cottage
  { x: FARM_X + 96, y: FARM_Y + 26, r: 20 },   // coop
  { x: FARM_X - 168, y: FARM_Y - 76, r: 15 },  // well
  // Town watchtowers (corners of the spawn safe zone)
  { x: STARTER_X - 400, y: STARTER_Y - 340, r: 18 },
  { x: STARTER_X + 400, y: STARTER_Y - 340, r: 18 },
  { x: STARTER_X - 400, y: STARTER_Y + 340, r: 18 },
  { x: STARTER_X + 400, y: STARTER_Y + 340, r: 18 },
  // Elven Wilds moonwells (solid stone rim)
  { x: 540, y: 4660, r: 26 },
  { x: 1010, y: 5030, r: 26 },
  { x: 300, y: 5180, r: 26 },
]

/** Push a circle of `radius` at (x,y) out of any obstacle it overlaps. */
export function resolveObstacles(x: number, y: number, radius: number): { x: number; y: number } {
  for (const o of OBSTACLES) {
    const dx = x - o.x, dy = y - o.y
    const min = o.r + radius
    const d2 = dx * dx + dy * dy
    if (d2 >= min * min) continue
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2)
      const push = (min - d) / d
      x += dx * push; y += dy * push
    } else {
      x += min   // exactly on centre — shove out arbitrarily
    }
  }
  return { x, y }
}
