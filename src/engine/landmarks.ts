import { ZONE_DEFS, STARTER_X, STARTER_Y, FARM_X, FARM_Y, PVP_SAFE_R } from '../sim'
import { softShadow } from './Shadows'
import { nightAmount } from './dayNight'

/**
 * Procedural world landmarks — points of interest that break up empty terrain
 * and reward exploration: shrines, abandoned campfires, ruined stone circles,
 * ruins, treasure caches, rare resource groves, and varied towers. Placed
 * deterministically (denser in the Beginner Forest), drawn with shadows and
 * animated glows so the "shiny" ones are visible from a distance. Purely
 * visual/client-side for now (no collision/loot yet — that's a server follow-up).
 */
export type LandmarkKind =
  | 'shrine' | 'campfire' | 'stoneCircle' | 'ruin' | 'treasure' | 'grove'
  | 'watchtower' | 'mageTower' | 'ruinedTower'

export interface Landmark { x: number; y: number; kind: LandmarkKind; s: number; phase: number }

// Spawn weights — biased a little by zone flavour.
const FOREST_POOL: LandmarkKind[] = ['campfire', 'shrine', 'treasure', 'grove', 'stoneCircle', 'ruin', 'watchtower', 'campfire', 'grove']
const MAGIC_POOL: LandmarkKind[] = ['shrine', 'grove', 'stoneCircle', 'mageTower', 'ruin', 'shrine']
const HARSH_POOL: LandmarkKind[] = ['ruin', 'ruinedTower', 'campfire', 'stoneCircle', 'watchtower']

function poolFor(name: string): LandmarkKind[] {
  if (name === 'Beginner Forest' || name === 'Hillsbrad Foothills') return FOREST_POOL
  if (name === 'Elven Wilds' || name === 'Mount Hyjal') return MAGIC_POOL
  return HARSH_POOL
}
function countFor(name: string, w: number, h: number): number {
  const per = name === 'Beginner Forest' ? 4.5 : name === 'Elven Wilds' ? 3.2 : 2.2
  return Math.round((w * h) / 1_000_000 * per)
}

function generate(): Landmark[] {
  let seed = 0x1a3df2
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
  const inSafe = (x: number, y: number) => Math.abs(x - STARTER_X) < PVP_SAFE_R + 120 && Math.abs(y - STARTER_Y) < PVP_SAFE_R + 120
  const nearFarm = (x: number, y: number) => Math.abs(x - FARM_X) < 280 && Math.abs(y - FARM_Y) < 260
  const out: Landmark[] = []
  for (const z of ZONE_DEFS) {
    const pool = poolFor(z.name)
    const count = countFor(z.name, z.w, z.h)
    for (let i = 0; i < count; i++) {
      let x = 0, y = 0, ok = false
      for (let tries = 0; tries < 8 && !ok; tries++) {
        x = z.x + 80 + rnd() * (z.w - 160)
        y = z.y + 80 + rnd() * (z.h - 160)
        ok = !inSafe(x, y) && !nearFarm(x, y) && out.every(l => Math.hypot(l.x - x, l.y - y) > 360)
      }
      if (!ok) continue
      out.push({ x, y, kind: pool[(rnd() * pool.length) | 0], s: 0.9 + rnd() * 0.35, phase: rnd() * 99 })
    }
  }
  return out
}

// Big glowing shrines flanking the four corners of the spawn town.
const SPAWN_SHRINES: Landmark[] = [
  { x: STARTER_X - 400, y: STARTER_Y - 340, kind: 'shrine', s: 1.6, phase: 0 },
  { x: STARTER_X + 400, y: STARTER_Y - 340, kind: 'shrine', s: 1.6, phase: 1.7 },
  { x: STARTER_X - 400, y: STARTER_Y + 340, kind: 'shrine', s: 1.6, phase: 3.3 },
  { x: STARTER_X + 400, y: STARTER_Y + 340, kind: 'shrine', s: 1.6, phase: 4.9 },
]

export const LANDMARKS: Landmark[] = [...SPAWN_SHRINES, ...generate()]
export const landmarkFootY = (l: Landmark) => l.y

// Some landmarks read better much larger.
const KIND_SCALE: Partial<Record<LandmarkKind, number>> = { shrine: 1.9, watchtower: 1.45, mageTower: 1.5, ruinedTower: 1.35 }

export function drawLandmark(ctx: CanvasRenderingContext2D, l: Landmark, t: number) {
  ctx.save()
  ctx.translate(l.x, l.y)
  const s = l.s * (KIND_SCALE[l.kind] ?? 1)
  ctx.scale(s, s)
  DRAW[l.kind](ctx, t + l.phase * 1000)
  ctx.restore()
}

const DRAW: Record<LandmarkKind, (c: CanvasRenderingContext2D, t: number) => void> = {
  shrine(c, t) {
    const pulse = (0.6 + Math.sin(t * 0.0024) * 0.4) * (1 + nightAmount(t) * 1.4)
    // glow + light beam
    const glow = c.createRadialGradient(0, -20, 0, 0, -20, 44)
    glow.addColorStop(0, `rgba(150,210,255,${0.32 * pulse})`); glow.addColorStop(1, 'rgba(120,180,255,0)')
    c.fillStyle = glow; c.beginPath(); c.arc(0, -20, 44, 0, Math.PI * 2); c.fill()
    softShadow(c, 0, 2, 18, 6, 0.5)
    // stone base + obelisk
    c.fillStyle = '#cdd6e6'; c.beginPath(); c.ellipse(0, 0, 16, 6, 0, 0, Math.PI * 2); c.fill()
    c.fillStyle = '#9aa6bc'; c.beginPath(); c.moveTo(-7, -2); c.lineTo(-5, -40); c.lineTo(5, -40); c.lineTo(7, -2); c.closePath(); c.fill()
    c.fillStyle = '#c2cde0'; c.beginPath(); c.moveTo(-5, -40); c.lineTo(0, -48); c.lineTo(5, -40); c.closePath(); c.fill()
    // glowing rune
    c.fillStyle = `rgba(150,220,255,${pulse})`; c.beginPath(); c.arc(0, -26, 3.2, 0, Math.PI * 2); c.fill()
    // floating sparks
    c.fillStyle = `rgba(200,240,255,${pulse})`
    for (let i = 0; i < 4; i++) { const a = t * 0.001 + i * 1.57; c.beginPath(); c.arc(Math.cos(a) * 12, -22 + Math.sin(a * 1.3) * 10, 1, 0, Math.PI * 2); c.fill() }
  },
  campfire(c, t) {
    softShadow(c, 0, 1, 16, 6, 0.45)
    // ring of stones
    c.fillStyle = '#6b6660'
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; c.beginPath(); c.ellipse(Math.cos(a) * 12, Math.sin(a) * 6, 3.2, 2.2, a, 0, Math.PI * 2); c.fill() }
    // charred logs
    c.strokeStyle = '#2e241c'; c.lineWidth = 3; c.lineCap = 'round'
    c.beginPath(); c.moveTo(-6, 2); c.lineTo(6, -2); c.moveTo(-5, -3); c.lineTo(6, 3); c.stroke()
    // faint dying embers
    const e = 0.3 + Math.sin(t * 0.006) * 0.3
    c.fillStyle = `rgba(255,120,40,${Math.max(0, e) * 0.7})`; c.beginPath(); c.arc(0, -1, 3, 0, Math.PI * 2); c.fill()
    for (let i = 0; i < 2; i++) { const ph = (t * 0.0008 + i * 0.5) % 1; c.fillStyle = `rgba(120,120,120,${0.25 * (1 - ph)})`; c.beginPath(); c.arc(Math.sin(ph * 6) * 4, -6 - ph * 22, 2 + ph * 4, 0, Math.PI * 2); c.fill() }
  },
  stoneCircle(c) {
    softShadow(c, 0, 2, 28, 9, 0.4)
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2
      const sx = Math.cos(a) * 26, sy = Math.sin(a) * 13
      c.fillStyle = '#7c7770'; c.fillRect(sx - 4, sy - 22, 8, 22)
      c.fillStyle = '#90897f'; c.fillRect(sx - 4, sy - 22, 3, 22)
      c.fillStyle = '#5e5952'; c.fillRect(sx - 4, sy - 24, 8, 3)
    }
  },
  ruin(c) {
    softShadow(c, 0, 2, 24, 8, 0.42)
    c.fillStyle = '#867f74'
    // broken wall + pillars
    c.fillRect(-22, -14, 44, 14)
    c.fillStyle = '#6e685e'; c.fillRect(-22, -14, 44, 3)
    for (const [x, h] of [[-18, 30], [2, 24], [16, 18]] as const) {
      c.fillStyle = '#8e877c'; c.fillRect(x - 4, -h, 8, h)
      c.fillStyle = '#736c62'; c.fillRect(x - 4, -h, 3, h)
    }
    // rubble
    c.fillStyle = '#6e685e'; for (const [rx, ry] of [[-24, -2], [24, -1], [8, 1]] as const) { c.beginPath(); c.arc(rx, ry, 3, 0, Math.PI * 2); c.fill() }
  },
  treasure(c, t) {
    const glint = 0.5 + Math.sin(t * 0.004) * 0.5
    softShadow(c, 0, 1, 14, 5, 0.5)
    // ring of mushrooms/stones marking the clearing
    c.fillStyle = '#5e5952'
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; c.beginPath(); c.arc(Math.cos(a) * 22, Math.sin(a) * 11, 2, 0, Math.PI * 2); c.fill() }
    // chest
    c.fillStyle = '#7a4a22'; c.fillRect(-11, -10, 22, 12)
    c.fillStyle = '#9a6030'; c.beginPath(); c.moveTo(-11, -10); c.quadraticCurveTo(0, -19, 11, -10); c.closePath(); c.fill()
    c.fillStyle = '#e0c060'; c.fillRect(-2, -12, 4, 14)
    c.strokeStyle = '#4a2c12'; c.lineWidth = 1; c.strokeRect(-11, -10, 22, 12)
    // gold glint
    c.fillStyle = `rgba(255,235,150,${glint})`; c.beginPath(); c.arc(0, -5, 2, 0, Math.PI * 2); c.fill()
    c.fillStyle = `rgba(255,255,220,${glint})`; c.fillRect(-0.6, -16, 1.2, 6); c.fillRect(-3, -13, 6, 1.2)
  },
  grove(c, t) {
    const pulse = 0.5 + Math.sin(t * 0.003) * 0.5
    const glow = c.createRadialGradient(0, -10, 0, 0, -10, 34)
    glow.addColorStop(0, `rgba(120,255,180,${0.22 * pulse})`); glow.addColorStop(1, 'rgba(120,255,180,0)')
    c.fillStyle = glow; c.beginPath(); c.arc(0, -10, 34, 0, Math.PI * 2); c.fill()
    softShadow(c, 0, 2, 18, 6, 0.4)
    // cluster of glowing crystals/herbs
    for (const [x, y, h, col] of [[-10, 0, 18, '#46e0a0'], [6, 1, 22, '#5affc0'], [13, 0, 14, '#3ad08a'], [-2, 2, 12, '#7affd0']] as const) {
      c.fillStyle = col
      c.beginPath(); c.moveTo(x, y); c.lineTo(x - 3, y - h + 5); c.lineTo(x, y - h); c.lineTo(x + 3, y - h + 5); c.closePath(); c.fill()
      c.fillStyle = `rgba(220,255,240,${pulse})`; c.beginPath(); c.arc(x, y - h + 4, 1.2, 0, Math.PI * 2); c.fill()
    }
  },
  watchtower(c, t) { tower(c, t, '#6e6a62', '#3a78c8', false) },
  mageTower(c, t) {
    tower(c, t, '#5a4a78', '#a070e0', false)
    // arcane orb on top
    const pulse = 0.6 + Math.sin(t * 0.004) * 0.4
    const g = c.createRadialGradient(0, -96, 0, 0, -96, 14)
    g.addColorStop(0, `rgba(190,150,255,${pulse})`); g.addColorStop(1, 'rgba(160,110,240,0)')
    c.fillStyle = g; c.beginPath(); c.arc(0, -96, 14, 0, Math.PI * 2); c.fill()
    c.fillStyle = '#d8c0ff'; c.beginPath(); c.arc(0, -96, 3.5, 0, Math.PI * 2); c.fill()
  },
  ruinedTower(c) { tower(c, 0, '#6a655c', '', true) },
}

// Shared tower drawing (varied by colour + ruined flag).
function tower(c: CanvasRenderingContext2D, t: number, stone: string, flag: string, ruined: boolean) {
  softShadow(c, 0, 2, 22, 8, 0.5)
  const h = ruined ? 60 : 86
  const g = c.createLinearGradient(-16, 0, 16, 0)
  g.addColorStop(0, shade(stone, -0.18)); g.addColorStop(0.5, stone); g.addColorStop(1, shade(stone, -0.18))
  c.fillStyle = g; c.fillRect(-16, -h, 32, h)
  c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 1
  for (let y = -h + 10; y < 0; y += 12) { c.beginPath(); c.moveTo(-16, y); c.lineTo(16, y); c.stroke() }
  if (ruined) {
    // broken jagged top
    c.fillStyle = stone; c.beginPath(); c.moveTo(-16, -h); c.lineTo(-10, -h - 10); c.lineTo(-3, -h + 2); c.lineTo(5, -h - 8); c.lineTo(16, -h); c.closePath(); c.fill()
    c.fillStyle = '#6e685e'; for (const [rx, ry] of [[-22, -2], [22, -1]] as const) { c.beginPath(); c.arc(rx, ry, 3, 0, Math.PI * 2); c.fill() }
  } else {
    c.fillStyle = shade(stone, 0.12)
    for (let x = -16; x < 16; x += 11) c.fillRect(x, -h - 10, 7, 12)
    c.fillRect(-16, -h - 2, 32, 6)
    c.fillStyle = '#ffd27a'; c.fillRect(-5, -h + 26, 10, 13); c.strokeStyle = '#3a352e'; c.strokeRect(-5, -h + 26, 10, 13)
    if (flag) {
      c.strokeStyle = '#4a3318'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, -h - 10); c.lineTo(0, -h - 26); c.stroke()
      const wave = Math.sin(t * 0.004) * 2
      c.fillStyle = flag; c.beginPath(); c.moveTo(0, -h - 26); c.lineTo(14, -h - 22 + wave); c.lineTo(0, -h - 18); c.closePath(); c.fill()
    }
  }
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.max(0, Math.min(255, ((n >> 16) & 0xff) + amt * 255))
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt * 255))
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt * 255))
  return `rgb(${r | 0},${g | 0},${b | 0})`
}
