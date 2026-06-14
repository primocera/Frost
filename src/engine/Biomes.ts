import { ZONE_DEFS } from '../sim'

/**
 * Procedural biome look: per-zone ground textures, scattered decorations and
 * ambient tint. Keeps the pure-canvas approach (no external art) but gives each
 * region a distinct, moodier identity instead of flat grass + a colour overlay.
 */
export type DecorType =
  | 'tree' | 'pine' | 'deadTree' | 'rock' | 'bush' | 'crystal'
  | 'lavaRock' | 'mushroom' | 'snowMound' | 'flower' | 'bone'

export interface Biome {
  ground: string
  speckles: [string, number][]
  decor: DecorType[]
  density: number      // props per 1,000,000 px²
  ambient: string      // screen tint rgba
}

const GRASS: Biome = {
  ground: '#21422a',
  speckles: [['#2d5030cc', 90], ['#1c3a24cc', 70], ['#3c6440aa', 40]],
  decor: ['tree', 'bush', 'flower', 'rock'], density: 22, ambient: 'rgba(20,40,16,0.10)',
}

/** Biome per zone name; the central town/unzoned area uses GRASS. */
export const BIOMES: Record<string, Biome> = {
  'Beginner Forest': GRASS,
  'Elven Wilds': {
    ground: '#1c3a32', speckles: [['#27504acc', 80], ['#16302accc', 70], ['#3a6a64aa', 36]],
    decor: ['pine', 'mushroom', 'crystal', 'bush'], density: 24, ambient: 'rgba(0,30,28,0.16)',
  },
  'Mount Hyjal': {
    ground: '#1a3a24', speckles: [['#244e30cc', 80], ['#13301ccc', 70], ['#356040aa', 36]],
    decor: ['pine', 'tree', 'rock', 'bush'], density: 26, ambient: 'rgba(2,22,8,0.18)',
  },
  'Hillsbrad Foothills': {
    ground: '#2c3a1e', speckles: [['#3a4a26cc', 80], ['#222e16cc', 66], ['#4c5e30aa', 36]],
    decor: ['bush', 'flower', 'rock', 'tree'], density: 18, ambient: 'rgba(16,18,0,0.08)',
  },
  'Frozen Ruins': {
    ground: '#2b3a48', speckles: [['#3c4e60cc', 80], ['#223040ccc', 70], ['#5a6e84aa', 50]],
    decor: ['snowMound', 'deadTree', 'rock'], density: 18, ambient: 'rgba(120,160,210,0.14)',
  },
  'Volcanic Wastes': {
    ground: '#2a1814', speckles: [['#3a201aee', 80], ['#180c0accc', 70], ['#ff5a1e55', 26]],
    decor: ['lavaRock', 'rock', 'bone'], density: 16, ambient: 'rgba(120,30,0,0.18)',
  },
  'Corrupted Fields': {
    ground: '#241a1e', speckles: [['#321f26cc', 80], ['#160d10ccc', 70], ['#7a2a55aa', 26]],
    decor: ['deadTree', 'bone', 'mushroom'], density: 18, ambient: 'rgba(60,0,30,0.16)',
  },
  'Arcane Caves': {
    ground: '#1e1630', speckles: [['#2a1f44cc', 80], ['#130d22ccc', 70], ['#9a5affaa', 24]],
    decor: ['crystal', 'rock'], density: 18, ambient: 'rgba(60,20,110,0.18)',
  },
}

export const DEFAULT_BIOME = GRASS

export function biomeAt(name: string): Biome { return BIOMES[name] ?? GRASS }

/** Build a small repeating ground tile pattern for a biome. */
export function buildPattern(ctx: CanvasRenderingContext2D, biome: Biome): CanvasPattern | null {
  const size = 64
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  if (!g) return null
  g.fillStyle = biome.ground
  g.fillRect(0, 0, size, size)
  let seed = 99173
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
  for (const [color, count] of biome.speckles) {
    g.fillStyle = color
    for (let i = 0; i < count; i++) g.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 1.6, 1 + rnd() * 2.2)
  }
  return ctx.createPattern(c, 'repeat')
}

export interface DecorInstance { x: number; y: number; type: DecorType; s: number }

/** Deterministically scatter decorations across every zone. */
export function generateDecor(): DecorInstance[] {
  let seed = 0x5eed
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
  const out: DecorInstance[] = []
  for (const z of ZONE_DEFS) {
    const biome = biomeAt(z.name)
    const count = Math.round((z.w * z.h) / 1_000_000 * biome.density)
    for (let i = 0; i < count; i++) {
      out.push({
        x: z.x + rnd() * z.w,
        y: z.y + rnd() * z.h,
        type: biome.decor[(rnd() * biome.decor.length) | 0],
        s: 0.8 + rnd() * 0.7,
      })
    }
  }
  return out
}

// ── Decoration drawing (in world space, anchored at the base point) ──────────
export function drawDecor(ctx: CanvasRenderingContext2D, d: DecorInstance) {
  ctx.save()
  ctx.translate(d.x, d.y)
  ctx.scale(d.s, d.s)
  // soft shadow
  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  ctx.beginPath(); ctx.ellipse(0, 0, 9, 3.5, 0, 0, Math.PI * 2); ctx.fill()
  DRAW[d.type](ctx)
  ctx.restore()
}

const DRAW: Record<DecorType, (c: CanvasRenderingContext2D) => void> = {
  tree(c) {
    c.fillStyle = '#3a2a18'; c.fillRect(-2.5, -14, 5, 14)
    for (const [oy, r, col] of [[-22, 14, '#2f5e34'], [-28, 11, '#3a7040'], [-33, 8, '#46824c']] as const) {
      c.fillStyle = col; c.beginPath(); c.arc(0, oy, r, 0, Math.PI * 2); c.fill()
    }
  },
  pine(c) {
    c.fillStyle = '#3a2a18'; c.fillRect(-2, -10, 4, 10)
    c.fillStyle = '#244e30'
    for (const oy of [-12, -20, -28]) { c.beginPath(); c.moveTo(-11, oy); c.lineTo(0, oy - 12); c.lineTo(11, oy); c.closePath(); c.fill() }
    c.fillStyle = '#356a40'
    for (const oy of [-13, -21]) { c.beginPath(); c.moveTo(-8, oy); c.lineTo(0, oy - 9); c.lineTo(8, oy); c.closePath(); c.fill() }
  },
  deadTree(c) {
    c.strokeStyle = '#4a3a30'; c.lineWidth = 3; c.lineCap = 'round'
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -22)
    c.moveTo(0, -14); c.lineTo(-9, -22); c.moveTo(0, -18); c.lineTo(8, -27); c.moveTo(0, -10); c.lineTo(7, -15); c.stroke()
  },
  rock(c) {
    c.fillStyle = '#5a5e64'; c.beginPath()
    c.moveTo(-9, 0); c.lineTo(-6, -8); c.lineTo(3, -10); c.lineTo(9, -3); c.lineTo(6, 0); c.closePath(); c.fill()
    c.fillStyle = '#71757c'; c.beginPath(); c.moveTo(-6, -8); c.lineTo(3, -10); c.lineTo(1, -5); c.closePath(); c.fill()
  },
  bush(c) {
    c.fillStyle = '#2c5232'
    for (const [ox, oy, r] of [[-6, -4, 7], [4, -5, 7], [-1, -8, 8]] as const) { c.beginPath(); c.arc(ox, oy, r, 0, Math.PI * 2); c.fill() }
    c.fillStyle = '#3a6a40'; c.beginPath(); c.arc(-1, -9, 5, 0, Math.PI * 2); c.fill()
  },
  crystal(c) {
    c.fillStyle = '#9a5aff'; c.beginPath(); c.moveTo(0, -22); c.lineTo(-6, -6); c.lineTo(0, 0); c.lineTo(6, -6); c.closePath(); c.fill()
    c.fillStyle = '#c79bff'; c.beginPath(); c.moveTo(0, -22); c.lineTo(0, 0); c.lineTo(6, -6); c.closePath(); c.fill()
    c.fillStyle = 'rgba(180,140,255,0.45)'; c.beginPath(); c.arc(0, -10, 12, 0, Math.PI * 2); c.fill()
  },
  lavaRock(c) {
    c.fillStyle = '#2a1410'; c.beginPath(); c.moveTo(-9, 0); c.lineTo(-6, -7); c.lineTo(4, -9); c.lineTo(9, -2); c.closePath(); c.fill()
    c.strokeStyle = '#ff5a1e'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-4, -3); c.lineTo(2, -6); c.lineTo(5, -3); c.stroke()
  },
  mushroom(c) {
    c.fillStyle = '#d8d2c0'; c.fillRect(-1.5, -6, 3, 6)
    c.fillStyle = '#b5436a'; c.beginPath(); c.ellipse(0, -6, 6, 4, 0, Math.PI, 0); c.fill()
    c.fillStyle = '#e8c0d0'; c.beginPath(); c.arc(-2, -7, 1, 0, Math.PI * 2); c.arc(2, -6, 1, 0, Math.PI * 2); c.fill()
  },
  snowMound(c) {
    c.fillStyle = '#e6eef8'; c.beginPath(); c.ellipse(0, -3, 11, 6, 0, Math.PI, 0); c.fill()
    c.fillStyle = '#c8d8ea'; c.beginPath(); c.ellipse(3, -2, 5, 3, 0, Math.PI, 0); c.fill()
  },
  flower(c) {
    c.strokeStyle = '#3a6a40'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -7); c.stroke()
    c.fillStyle = '#ffd24a'; c.beginPath(); c.arc(0, -8, 2.4, 0, Math.PI * 2); c.fill()
  },
  bone(c) {
    c.strokeStyle = '#cfc8b8'; c.lineWidth = 2.4; c.lineCap = 'round'
    c.beginPath(); c.moveTo(-7, -2); c.lineTo(6, -7); c.stroke()
    c.fillStyle = '#cfc8b8'; c.beginPath(); c.arc(-7, -3, 1.8, 0, Math.PI * 2); c.arc(-7, -1, 1.8, 0, Math.PI * 2); c.arc(6, -8, 1.8, 0, Math.PI * 2); c.arc(6, -6, 1.8, 0, Math.PI * 2); c.fill()
  },
}
