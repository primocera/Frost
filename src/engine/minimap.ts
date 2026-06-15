import { WORLD_W, WORLD_H, STARTER_X, STARTER_Y, FARM_X, FARM_Y, ZONE_DEFS, BOSS_SPAWNS } from '../sim'
import type { WorldState } from '../sim/types'
import { biomeAt } from './Biomes'
import { NPCS } from './npcs'

/**
 * Minimap. The static world (zone tiles + fixed POIs: town, farm, NPCs, boss
 * arenas) is rendered ONCE into a cached offscreen canvas. Each minimap frame we
 * just blit that cache (panned/zoomed to the player) and stamp the few dynamic
 * dots — players, enemies, bosses. So we never re-render the whole world; the
 * per-frame cost is one drawImage + a short dot loop, throttled to ~10 fps.
 */
export const minimap = { canvas: null as HTMLCanvasElement | null, zoom: 1 }
// Half-extent (world units) the minimap shows: close, medium, whole world.
export const MINIMAP_ZOOMS = [1500, 3000, Math.max(WORLD_W, WORLD_H) / 2 + 60]

const BASE_SCALE = 0.12
let base: HTMLCanvasElement | null = null
function getBase(): HTMLCanvasElement {
  if (base) return base
  const c = document.createElement('canvas')
  c.width = Math.ceil(WORLD_W * BASE_SCALE)
  c.height = Math.ceil(WORLD_H * BASE_SCALE)
  const g = c.getContext('2d')!
  g.fillStyle = '#0a1018'; g.fillRect(0, 0, c.width, c.height)
  for (const z of ZONE_DEFS) {
    g.fillStyle = biomeAt(z.name).ground
    g.fillRect(z.x * BASE_SCALE, z.y * BASE_SCALE, z.w * BASE_SCALE, z.h * BASE_SCALE)
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1
    g.strokeRect(z.x * BASE_SCALE, z.y * BASE_SCALE, z.w * BASE_SCALE, z.h * BASE_SCALE)
  }
  const dot = (x: number, y: number, r: number, col: string) => {
    g.fillStyle = col; g.beginPath(); g.arc(x * BASE_SCALE, y * BASE_SCALE, r, 0, Math.PI * 2); g.fill()
  }
  dot(STARTER_X, STARTER_Y, 3, '#ffe08a')                                   // town
  dot(FARM_X, FARM_Y, 2.4, '#caa45a')                                       // farm
  for (const n of NPCS) dot(n.x, n.y, 1.8, n.marker === 'quest' ? '#ffd23a' : '#8fbfff')
  for (const b of BOSS_SPAWNS) { dot(b.x, b.y, 2.8, '#ff5544') }            // boss arenas (POIs)
  base = c
  return c
}

export function drawMinimap(ctx: CanvasRenderingContext2D, world: WorldState, localId: string, half: number) {
  const W = ctx.canvas.width, H = ctx.canvas.height
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#070b12'; ctx.fillRect(0, 0, W, H)

  const local = world.players.find(p => p.id === localId)
  const cx = local ? local.x : WORLD_W / 2
  const cy = local ? local.y : WORLD_H / 2
  const mapScale = W / (2 * half)
  const pu = 1 / mapScale   // world units per minimap pixel (keeps dots pixel-sized)

  ctx.save()
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip()
  ctx.translate(W / 2, H / 2); ctx.scale(mapScale, mapScale); ctx.translate(-cx, -cy)
  ctx.drawImage(getBase(), 0, 0, WORLD_W, WORLD_H)

  // Enemies (culled to the visible window)
  ctx.fillStyle = '#e0464a'
  for (const e of world.enemies) {
    if (e.dying || e.isBoss) continue
    if (Math.abs(e.x - cx) > half || Math.abs(e.y - cy) > half) continue
    ctx.fillRect(e.x - 1.3 * pu, e.y - 1.3 * pu, 2.6 * pu, 2.6 * pu)
  }
  // Bosses (always shown — they're POIs)
  for (const e of world.enemies) {
    if (!e.isBoss || e.dying) continue
    ctx.fillStyle = '#ff8a2a'; ctx.beginPath(); ctx.arc(e.x, e.y, 3.4 * pu, 0, Math.PI * 2); ctx.fill()
  }
  // Other players (co-op / party)
  for (const p of world.players) {
    if (p.id === localId) continue
    ctx.fillStyle = '#3fdc8a'; ctx.beginPath(); ctx.arc(p.x, p.y, 2.5 * pu, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 0.6 * pu; ctx.stroke()
  }
  // Local player — white facing arrow at centre
  if (local) {
    const f = local.facing >= 0 ? 1 : -1
    ctx.save(); ctx.translate(cx, cy)
    ctx.fillStyle = '#ffffff'
    ctx.beginPath(); ctx.moveTo(4.5 * pu * f, 0); ctx.lineTo(-3 * pu * f, -3 * pu); ctx.lineTo(-3 * pu * f, 3 * pu); ctx.closePath(); ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.lineWidth = 0.7 * pu; ctx.stroke()
    ctx.restore()
  }
  ctx.restore()

  ctx.strokeStyle = 'rgba(120,160,220,0.5)'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, W - 2, H - 2)
}
