import { STARTER_X, STARTER_Y, FARM_X, FARM_Y } from '../sim'

/**
 * A proper dirt road — not translucent splatter. The route is a smooth curve
 * (waypoints joined with quadratic segments through their midpoints), stroked in
 * three passes: a soft dark edge that blends into the grass, an opaque packed-
 * dirt body, and a lighter "worn" centre stripe. Plus a few deterministic
 * pebbles for texture. One road for now (town → farm) to judge the look.
 */
const ROAD: { x: number; y: number }[] = [
  { x: STARTER_X + 30, y: STARTER_Y - 410 },
  { x: 3560, y: 5430 },
  { x: 3760, y: 5150 },
  { x: 3980, y: 4900 },
  { x: 4180, y: 4650 },
  { x: FARM_X - 20, y: FARM_Y + 80 },
]

function tracePath(ctx: CanvasRenderingContext2D) {
  ctx.beginPath()
  ctx.moveTo(ROAD[0].x, ROAD[0].y)
  for (let i = 1; i < ROAD.length - 1; i++) {
    const mx = (ROAD[i].x + ROAD[i + 1].x) / 2, my = (ROAD[i].y + ROAD[i + 1].y) / 2
    ctx.quadraticCurveTo(ROAD[i].x, ROAD[i].y, mx, my)
  }
  const last = ROAD[ROAD.length - 1]
  ctx.lineTo(last.x, last.y)
}

// A few pebbles scattered along the road (deterministic).
const PEBBLES = (() => {
  let seed = 0x2b91
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
  const out: { x: number; y: number; r: number }[] = []
  for (let i = 0; i < ROAD.length - 1; i++) {
    const a = ROAD[i], b = ROAD[i + 1]
    for (let k = 0; k < 4; k++) {
      const t = (k + rnd()) / 4
      out.push({ x: a.x + (b.x - a.x) * t + (rnd() - 0.5) * 14, y: a.y + (b.y - a.y) * t + (rnd() - 0.5) * 14, r: 1.2 + rnd() * 1.6 })
    }
  }
  return out
})()

export function drawRoads(ctx: CanvasRenderingContext2D, inView: (x: number, y: number) => boolean) {
  if (!ROAD.some(p => inView(p.x, p.y))) return
  ctx.save()
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  tracePath(ctx); ctx.strokeStyle = 'rgba(54,40,24,0.40)'; ctx.lineWidth = 30; ctx.stroke()   // soft blended edge
  tracePath(ctx); ctx.strokeStyle = '#735734'; ctx.lineWidth = 22; ctx.stroke()                // packed dirt body
  tracePath(ctx); ctx.strokeStyle = '#8a6a42'; ctx.lineWidth = 9; ctx.stroke()                 // worn centre
  for (const p of PEBBLES) {
    if (!inView(p.x, p.y)) continue
    ctx.fillStyle = 'rgba(150,140,126,0.6)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
}
