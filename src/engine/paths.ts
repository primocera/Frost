import { STARTER_X, STARTER_Y, FARM_X, FARM_Y } from '../sim'
import { LANDMARKS } from './landmarks'

/**
 * Natural dirt paths connecting points of interest (town → farm → nearby
 * landmarks). Each edge is a quadratic-bezier *curve* (never a straight line),
 * laid down as soft overlapping dirt "dabs" of varied width that feather into
 * the grass, with occasional roadside stones, wildflowers and grass tufts so it
 * reads hand-crafted. Baked once; drawn under entities, culled per dab.
 */
interface Pt { x: number; y: number }
type PDab =
  | { x: number; y: number; r: number; kind: 'dirt' }
  | { x: number; y: number; kind: 'stone' | 'grass' }
  | { x: number; y: number; kind: 'flower'; col: string }

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

function buildPaths(): PDab[] {
  let seed = 0x51a73c
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
  const town: Pt = { x: STARTER_X, y: STARTER_Y }
  const farm: Pt = { x: FARM_X, y: FARM_Y }
  const nearTown = LANDMARKS.filter(l => { const d = dist(l, town); return d > 700 && d < 1700 }).slice(0, 4)
  const nearFarm = LANDMARKS.filter(l => { const d = dist(l, farm); return d > 250 && d < 850 }).slice(0, 1)
  const edges: [Pt, Pt][] = [
    [town, farm],
    ...nearTown.map(l => [town, { x: l.x, y: l.y }] as [Pt, Pt]),
    ...nearFarm.map(l => [farm, { x: l.x, y: l.y }] as [Pt, Pt]),
  ]

  const dabs: PDab[] = []
  const flowerCols = ['#ffd24a', '#ff7ab0', '#c8d8f8', '#a878d8']
  for (const [a, b] of edges) {
    const len = dist(a, b)
    if (len < 60) continue
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
    const px = -(b.y - a.y) / len, py = (b.x - a.x) / len      // perpendicular
    const off = (rnd() - 0.5) * len * 0.28                      // curve the road
    const cx = mx + px * off, cy = my + py * off
    const steps = Math.max(8, Math.round(len / 20))
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const u = 1 - t
      const x = u * u * a.x + 2 * u * t * cx + t * t * b.x
      const y = u * u * a.y + 2 * u * t * cy + t * t * b.y
      const r = 7 + Math.sin(t * Math.PI) * 5 + rnd() * 4        // varied width, wider mid-road
      dabs.push({ x: x + (rnd() - 0.5) * 6, y: y + (rnd() - 0.5) * 6, r, kind: 'dirt' })
      const dr = rnd()
      if (dr < 0.08) dabs.push({ x: x + px * (r + 4), y: y + py * (r + 4), kind: 'stone' })
      else if (dr < 0.15) dabs.push({ x: x - px * (r + 5), y: y - py * (r + 5), kind: 'flower', col: flowerCols[(rnd() * flowerCols.length) | 0] })
      else if (dr < 0.24) dabs.push({ x: x + px * (r + 6) * (rnd() < 0.5 ? 1 : -1), y: y + py * (r + 6), kind: 'grass' })
    }
  }
  return dabs
}

export const PATH_DABS: PDab[] = buildPaths()

export function drawPaths(ctx: CanvasRenderingContext2D, inView: (x: number, y: number) => boolean) {
  for (const d of PATH_DABS) {
    if (!inView(d.x, d.y)) continue
    if (d.kind === 'dirt') {
      const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r)
      g.addColorStop(0, 'rgba(120,96,60,0.34)'); g.addColorStop(0.6, 'rgba(108,86,54,0.20)'); g.addColorStop(1, 'rgba(108,86,54,0)')
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill()
    } else if (d.kind === 'stone') {
      ctx.fillStyle = 'rgba(150,146,136,0.65)'; ctx.beginPath(); ctx.arc(d.x, d.y, 1.8, 0, Math.PI * 2); ctx.fill()
    } else if (d.kind === 'flower') {
      ctx.fillStyle = d.col; ctx.beginPath(); ctx.arc(d.x, d.y, 1.6, 0, Math.PI * 2); ctx.fill()
    } else {
      ctx.strokeStyle = 'rgba(92,150,72,0.6)'; ctx.lineWidth = 1; ctx.lineCap = 'round'
      for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(d.x + k * 2, d.y + 2); ctx.lineTo(d.x + k * 2 + k * 1.4, d.y - 4); ctx.stroke() }
    }
  }
}
