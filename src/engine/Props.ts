import { FARM_X, FARM_Y, BESSIE_X, BESSIE_Y, STARTER_X, STARTER_Y } from '../sim'
import { softShadow } from './Shadows'
import { nightAmount } from './dayNight'

/**
 * Hand-built world landmarks + living ambiance, all procedural canvas art:
 *  - Holt's farmstead near the Arcane Caves (cottage, coop, well, hay, fences)
 *  - Night-elf moonwells glowing in the Elven Wilds
 *  - Wandering critters (chickens incl. quest-hen Bessie, butterflies, fireflies)
 * that make the world feel inhabited rather than empty.
 */
export type PropKind = 'cottage' | 'coop' | 'hay' | 'fenceH' | 'fenceV' | 'well' | 'signpost' | 'moonwell' | 'tower'

export interface Prop { x: number; y: number; kind: PropKind }

// Fence posts strung into a paddock around the farm yard.
function fenceRing(cx: number, cy: number, hw: number, hh: number): Prop[] {
  const out: Prop[] = []
  for (let x = cx - hw; x <= cx + hw; x += 34) { out.push({ x, y: cy - hh, kind: 'fenceH' }); out.push({ x, y: cy + hh, kind: 'fenceH' }) }
  for (let y = cy - hh + 34; y < cy + hh; y += 34) { out.push({ x: cx - hw, y, kind: 'fenceV' }); out.push({ x: cx + hw, y, kind: 'fenceV' }) }
  return out
}

export const PROPS: Prop[] = [
  // ── Holt's Farm ──
  { x: FARM_X - 66, y: FARM_Y - 58, kind: 'cottage' },
  { x: FARM_X + 96, y: FARM_Y + 26, kind: 'coop' },
  { x: FARM_X + 150, y: FARM_Y - 36, kind: 'hay' },
  { x: FARM_X - 150, y: FARM_Y + 74, kind: 'hay' },
  { x: FARM_X - 168, y: FARM_Y - 76, kind: 'well' },
  { x: FARM_X - 196, y: FARM_Y + 128, kind: 'signpost' },
  ...fenceRing(FARM_X + 6, FARM_Y + 36, 150, 96),
  // ── Elven Wilds moonwells ──
  { x: 540, y: 4660, kind: 'moonwell' },
  { x: 1010, y: 5030, kind: 'moonwell' },
  { x: 300, y: 5180, kind: 'moonwell' },
  // (Spawn corners now hold big glowing shrines — see landmarks.ts SPAWN_SHRINES.)
]

const PROP_BASE: Record<PropKind, number> = { cottage: 0, coop: 0, hay: 0, fenceH: 0, fenceV: 0, well: 0, signpost: 0, moonwell: 6, tower: 0 }
/** Sort key (feet y) so props depth-sort correctly against players/enemies. */
export const propFootY = (p: Prop) => p.y + PROP_BASE[p.kind]

export function drawProp(ctx: CanvasRenderingContext2D, p: Prop, timeMs: number) {
  ctx.save()
  ctx.translate(p.x, p.y)
  PROP_DRAW[p.kind](ctx, timeMs)
  ctx.restore()
}

const shadow = (ctx: CanvasRenderingContext2D, rx: number, ry: number) => softShadow(ctx, 0, 0, rx + 2, ry + 1, 0.5)

const PROP_DRAW: Record<PropKind, (c: CanvasRenderingContext2D, t: number) => void> = {
  cottage(c, t) {
    shadow(c, 54, 12)
    // walls
    c.fillStyle = '#caa46e'; c.fillRect(-46, -52, 92, 52)
    c.fillStyle = 'rgba(120,80,40,0.25)'; for (let x = -46; x < 46; x += 16) c.fillRect(x, -52, 2, 52)
    // door + windows
    c.fillStyle = '#5a3a1e'; c.fillRect(-10, -26, 20, 26)
    c.fillStyle = '#ffd680'; c.fillRect(-36, -40, 16, 14); c.fillRect(20, -40, 16, 14)
    c.strokeStyle = '#5a3a1e'; c.lineWidth = 1.5; c.strokeRect(-36, -40, 16, 14); c.strokeRect(20, -40, 16, 14)
    // thatched roof
    c.fillStyle = '#8a6a2e'; c.beginPath(); c.moveTo(-56, -50); c.lineTo(0, -86); c.lineTo(56, -50); c.closePath(); c.fill()
    c.fillStyle = '#9a7a3a'; c.beginPath(); c.moveTo(-56, -50); c.lineTo(0, -80); c.lineTo(0, -86); c.closePath(); c.fill()
    // chimney + drifting smoke
    c.fillStyle = '#7a5436'; c.fillRect(28, -82, 12, 20)
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.0006 + i * 0.5) % 1
      c.fillStyle = `rgba(220,220,220,${0.35 * (1 - ph)})`
      c.beginPath(); c.arc(34 + Math.sin(ph * 6) * 6, -88 - ph * 40, 4 + ph * 7, 0, Math.PI * 2); c.fill()
    }
  },
  coop(c) {
    shadow(c, 26, 8)
    c.fillStyle = '#7a5230'; c.fillRect(-22, -26, 44, 26)
    c.fillStyle = '#5a3a20'; c.beginPath(); c.moveTo(-26, -26); c.lineTo(0, -40); c.lineTo(26, -26); c.closePath(); c.fill()
    c.fillStyle = '#2a1a0e'; c.beginPath(); c.arc(0, -8, 7, 0, Math.PI * 2); c.fill()   // entrance hole
    c.fillStyle = '#caa46e'; c.beginPath(); c.moveTo(-8, 0); c.lineTo(8, 0); c.lineTo(2, 12); c.lineTo(-14, 12); c.closePath(); c.fill()  // ramp
  },
  hay(c) {
    shadow(c, 20, 6)
    c.fillStyle = '#cBA94e'; c.beginPath(); c.ellipse(0, -12, 20, 14, 0, 0, Math.PI * 2); c.fill()
    c.strokeStyle = '#a8862e'; c.lineWidth = 1.5
    for (const oy of [-18, -12, -6]) { c.beginPath(); c.ellipse(0, oy, 18, 4, 0, 0, Math.PI); c.stroke() }
    c.strokeStyle = '#8a6a20'; c.beginPath(); c.moveTo(0, -26); c.lineTo(0, 1); c.stroke()
  },
  fenceH(c) {
    c.fillStyle = '#6a4a2a'; c.fillRect(-3, -22, 6, 22)
    c.fillStyle = '#7a5a36'; c.fillRect(-17, -18, 34, 4); c.fillRect(-17, -9, 34, 4)
  },
  fenceV(c) {
    c.fillStyle = '#6a4a2a'; c.fillRect(-3, -22, 6, 22)
    c.fillStyle = '#5a3f26'; c.fillRect(-2, -18, 4, 18)
  },
  well(c) {
    shadow(c, 22, 7)
    c.fillStyle = '#6f7378'; c.beginPath(); c.ellipse(0, -4, 18, 10, 0, 0, Math.PI * 2); c.fill()
    c.fillStyle = '#23323f'; c.beginPath(); c.ellipse(0, -6, 12, 6, 0, 0, Math.PI * 2); c.fill()
    c.fillStyle = '#5a3f26'; c.fillRect(-16, -44, 4, 40); c.fillRect(12, -44, 4, 40)
    c.fillStyle = '#7a4a2a'; c.beginPath(); c.moveTo(-22, -44); c.lineTo(0, -56); c.lineTo(22, -44); c.closePath(); c.fill()
  },
  signpost(c) {
    shadow(c, 10, 4)
    c.fillStyle = '#6a4a2a'; c.fillRect(-2, -34, 4, 34)
    c.fillStyle = '#8a6a3a'; c.fillRect(-18, -32, 30, 12)
    c.fillStyle = '#3a2a16'; c.font = '8px serif'; c.textAlign = 'center'; c.fillText("HOLT'S FARM", -3, -23)
  },
  tower(c, t) {
    shadow(c, 30, 10)
    const H = 132, W = 26   // taller + wider than before
    // buttressed stone base
    c.fillStyle = '#4c4842'; c.beginPath(); c.moveTo(-W - 8, 0); c.lineTo(-W, -22); c.lineTo(W, -22); c.lineTo(W + 8, 0); c.closePath(); c.fill()
    // main shaft
    const g = c.createLinearGradient(-W, 0, W, 0)
    g.addColorStop(0, '#56524b'); g.addColorStop(0.5, '#7c776e'); g.addColorStop(1, '#504c46')
    c.fillStyle = g; c.fillRect(-W, -H, W * 2, H)
    // stone courses + a few block seams
    c.strokeStyle = 'rgba(0,0,0,0.16)'; c.lineWidth = 1
    for (let y = -H + 14; y < -8; y += 14) { c.beginPath(); c.moveTo(-W, y); c.lineTo(W, y); c.stroke() }
    c.strokeStyle = 'rgba(0,0,0,0.10)'
    for (let y = -H + 14; y < -8; y += 28) { c.beginPath(); c.moveTo(0, y); c.lineTo(0, y + 14); c.stroke() }
    // arrow slits
    c.fillStyle = '#2a2620'
    c.fillRect(-3, -H + 44, 6, 16); c.fillRect(-3, -H + 80, 6, 16)
    // crenellated top (parapet + merlons)
    c.fillStyle = '#888377'; c.fillRect(-W - 4, -H - 8, W * 2 + 8, 10)
    for (let x = -W - 4; x < W + 4; x += 12) c.fillRect(x, -H - 18, 8, 12)
    // lit window — faint by day, glowing after dark
    const lit = 0.5 + nightAmount(t) * 0.5
    c.save(); c.shadowColor = `rgba(255,200,90,${lit})`; c.shadowBlur = 6 + nightAmount(t) * 12
    c.fillStyle = `rgba(255,210,120,${0.55 + lit * 0.45})`; c.fillRect(-5, -H + 24, 10, 13)
    c.restore()
    c.strokeStyle = '#3a352e'; c.lineWidth = 1; c.strokeRect(-5, -H + 24, 10, 13)
    // banner
    c.strokeStyle = '#4a3318'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -H - 18); c.lineTo(0, -H - 42); c.stroke()
    const wave = Math.sin(t * 0.004) * 2
    c.fillStyle = '#2f63b0'; c.beginPath(); c.moveTo(0, -H - 42); c.lineTo(18, -H - 36 + wave); c.lineTo(0, -H - 28); c.closePath(); c.fill()
    c.fillStyle = '#9ec4ff'; c.beginPath(); c.arc(3, -H - 35, 1.6, 0, Math.PI * 2); c.fill()
  },
  moonwell(c, t) {
    const pulse = (0.6 + Math.sin(t * 0.0015) * 0.4) * (1 + nightAmount(t) * 1.3)
    const glow = c.createRadialGradient(0, -6, 0, 0, -6, 46)
    glow.addColorStop(0, `rgba(120,210,255,${0.30 * pulse})`); glow.addColorStop(1, 'rgba(80,150,255,0)')
    c.fillStyle = glow; c.beginPath(); c.arc(0, -6, 46, 0, Math.PI * 2); c.fill()
    c.fillStyle = '#cdd6e8'; c.beginPath(); c.ellipse(0, 0, 30, 16, 0, 0, Math.PI * 2); c.fill()   // marble rim
    const water = c.createRadialGradient(0, -2, 2, 0, -2, 24)
    water.addColorStop(0, `rgba(180,240,255,${0.9 * pulse})`); water.addColorStop(1, 'rgba(60,140,220,0.85)')
    c.fillStyle = water; c.beginPath(); c.ellipse(0, -2, 23, 11, 0, 0, Math.PI * 2); c.fill()
    // four slender pillars
    c.fillStyle = '#e6ecf6'
    for (const ox of [-26, 26]) { c.fillRect(ox - 2, -30, 4, 30) }
    c.fillStyle = `rgba(200,240,255,${0.5 * pulse})`
    for (const ox of [-26, 26]) { c.beginPath(); c.arc(ox, -32, 4, 0, Math.PI * 2); c.fill() }
  },
}

// ── Ground-level farm dressing (drawn under entities, in drawGround) ──────────
export function drawFarmGround(ctx: CanvasRenderingContext2D) {
  ctx.save()
  // packed-dirt yard
  ctx.fillStyle = 'rgba(120,92,56,0.5)'
  ctx.beginPath(); ctx.ellipse(FARM_X + 6, FARM_Y + 36, 175, 120, 0, 0, Math.PI * 2); ctx.fill()
  // tilled crop rows
  ctx.fillStyle = 'rgba(90,66,38,0.6)'
  const fx = FARM_X + 70, fy = FARM_Y + 96
  for (let i = 0; i < 6; i++) ctx.fillRect(fx - 60, fy + i * 11, 130, 5)
  ctx.fillStyle = 'rgba(90,170,80,0.5)'
  for (let i = 0; i < 6; i++) for (let j = 0; j < 10; j++) { ctx.beginPath(); ctx.arc(fx - 56 + j * 13, fy + i * 11 + 2, 1.6, 0, Math.PI * 2); ctx.fill() }
  ctx.restore()
}

// ── Town guards (decorative sentries near the spawn) ─────────────────────────
export interface Guard { x: number; y: number; flip: boolean }
export const GUARDS: Guard[] = [
  { x: STARTER_X - 55, y: STARTER_Y - 405, flip: false },
  { x: STARTER_X + 55, y: STARTER_Y - 405, flip: true },
  { x: STARTER_X - 55, y: STARTER_Y + 405, flip: false },
  { x: STARTER_X + 55, y: STARTER_Y + 405, flip: true },
]

export function drawGuard(ctx: CanvasRenderingContext2D, g: Guard, t: number) {
  ctx.save(); ctx.translate(g.x, g.y)
  const bob = Math.sin(t * 0.002 + g.x) * 1
  softShadow(ctx, 0, 3, 11, 4.5, 0.5)
  if (g.flip) ctx.scale(-1, 1)
  // spear
  ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 2; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(10, -36 + bob); ctx.lineTo(12, 8); ctx.stroke()
  ctx.fillStyle = '#cdd2da'; ctx.beginPath(); ctx.moveTo(10, -44 + bob); ctx.lineTo(13, -35 + bob); ctx.lineTo(7, -35 + bob); ctx.closePath(); ctx.fill()
  // legs
  ctx.fillStyle = '#33384a'; ctx.fillRect(-5, -1 + bob, 4, 10); ctx.fillRect(1, -1 + bob, 4, 10)
  // blue tabard
  ctx.fillStyle = '#2f5aa0'; ctx.beginPath()
  ctx.moveTo(-7, -20 + bob); ctx.lineTo(7, -20 + bob); ctx.lineTo(6, 2 + bob); ctx.lineTo(-6, 2 + bob); ctx.closePath(); ctx.fill()
  // pauldrons
  ctx.fillStyle = '#8a909a'; ctx.beginPath(); ctx.arc(-7, -18 + bob, 3.5, 0, Math.PI * 2); ctx.arc(7, -18 + bob, 3.5, 0, Math.PI * 2); ctx.fill()
  // head + helmet
  ctx.fillStyle = '#e8c098'; ctx.beginPath(); ctx.arc(0, -25 + bob, 5, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#9aa0aa'; ctx.beginPath(); ctx.arc(0, -26 + bob, 5.5, Math.PI, 0); ctx.fill()
  ctx.fillRect(-5.5, -26 + bob, 11, 2)
  ctx.restore()
}

// ── Critters ─────────────────────────────────────────────────────────────────
export interface Chicken { x: number; y: number; phase: number; bessie?: boolean }

function chickenFlock(): Chicken[] {
  const out: Chicken[] = [{ x: BESSIE_X, y: BESSIE_Y, phase: 0, bessie: true }]
  // hens milling around the farm yard
  const yard: [number, number][] = [[FARM_X + 30, FARM_Y + 60], [FARM_X - 20, FARM_Y + 90], [FARM_X + 100, FARM_Y + 70], [FARM_X + 60, FARM_Y + 20], [FARM_X - 60, FARM_Y + 40]]
  yard.forEach(([x, y], i) => out.push({ x, y, phase: i * 1.7 }))
  // a few pecking around the spawn town for life
  const town: [number, number][] = [[STARTER_X - 120, STARTER_Y + 200], [STARTER_X + 150, STARTER_Y + 210], [STARTER_X + 40, STARTER_Y + 250]]
  town.forEach(([x, y], i) => out.push({ x, y, phase: i * 2.3 }))
  return out
}
export const CHICKENS: Chicken[] = chickenFlock()

/** Live position of a wandering chicken (small idle drift). */
export function chickenPos(ch: Chicken, t: number): { x: number; y: number; peck: boolean; flip: boolean } {
  const a = t * 0.0004 + ch.phase
  const dx = Math.cos(a) * 13, dy = Math.sin(a * 1.3) * 9
  return { x: ch.x + dx, y: ch.y + dy, peck: Math.sin(t * 0.006 + ch.phase) > 0.5, flip: Math.cos(a) < 0 }
}

export function drawChicken(ctx: CanvasRenderingContext2D, x: number, y: number, peck: boolean, bessie: boolean, flip: boolean) {
  ctx.save(); ctx.translate(x, y); if (flip) ctx.scale(-1, 1)
  const s = bessie ? 1.25 : 1; ctx.scale(s, s)
  softShadow(ctx, 0, 0, 8, 3, 0.45)
  ctx.fillStyle = '#ddaa00'; ctx.fillRect(-2, -4, 1.2, 4); ctx.fillRect(1, -4, 1.2, 4)   // legs
  const bob = peck ? 1.5 : 0
  ctx.fillStyle = '#f2efe4'; ctx.beginPath(); ctx.ellipse(0, -8 + bob, 7, 6, 0, 0, Math.PI * 2); ctx.fill()   // body
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(-1.5, -9 + bob, 3.5, 3, 0, 0, Math.PI * 2); ctx.fill()
  const hy = -13 + bob * 2
  ctx.fillStyle = '#f2efe4'; ctx.beginPath(); ctx.arc(4, hy, 3.5, 0, Math.PI * 2); ctx.fill()   // head
  ctx.fillStyle = '#d23a2a'; ctx.beginPath(); ctx.arc(4, hy - 3, 1.6, 0, Math.PI * 2); ctx.fill()   // comb
  ctx.fillStyle = '#ffae00'; ctx.beginPath(); ctx.moveTo(7, hy); ctx.lineTo(10, hy + 1); ctx.lineTo(7, hy + 2); ctx.closePath(); ctx.fill()   // beak
  ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(5, hy - 0.5, 0.7, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

// Airborne ambiance drawn as an additive overlay (not depth-sorted).
interface Flutter { x: number; y: number; kind: 'butterfly' | 'firefly'; phase: number }
function flutters(): Flutter[] {
  const out: Flutter[] = []
  let seed = 0xb17e
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
  // butterflies across the Beginner Forest + town
  for (let i = 0; i < 26; i++) out.push({ x: 1600 + rnd() * 3400, y: 4350 + rnd() * 1400, kind: 'butterfly', phase: rnd() * 99 })
  // fireflies in the Elven Wilds
  for (let i = 0; i < 40; i++) out.push({ x: 40 + rnd() * 1420, y: 4320 + rnd() * 1060, kind: 'firefly', phase: rnd() * 99 })
  return out
}
export const FLUTTERS: Flutter[] = flutters()

export function drawFlutter(ctx: CanvasRenderingContext2D, f: Flutter, t: number, inView: (x: number, y: number) => boolean) {
  const x = f.x + Math.sin(t * 0.0009 + f.phase) * 26
  const y = f.y + Math.cos(t * 0.0012 + f.phase * 1.3) * 18
  if (!inView(x, y)) return
  if (f.kind === 'butterfly') {
    const flap = Math.sin(t * 0.02 + f.phase)
    const col = ['#ffcf4a', '#ff7ab0', '#9ad0ff'][((f.phase * 3) | 0) % 3]
    ctx.fillStyle = col
    ctx.beginPath(); ctx.ellipse(x - 2, y, 2.6, 1.4 + Math.abs(flap) * 1.6, flap * 0.5, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(x + 2, y, 2.6, 1.4 + Math.abs(flap) * 1.6, -flap * 0.5, 0, Math.PI * 2); ctx.fill()
  } else {
    const glow = 0.4 + Math.sin(t * 0.004 + f.phase) * 0.5
    if (glow <= 0.1) return
    const g = ctx.createRadialGradient(x, y, 0, x, y, 5)
    g.addColorStop(0, `rgba(200,255,170,${glow})`); g.addColorStop(1, 'rgba(150,255,120,0)')
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill()
  }
}
