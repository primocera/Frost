import { STARTER_X, STARTER_Y, HOLT_X, HOLT_Y } from '../sim'
import type { Panel } from '../ui/store'

/**
 * Town NPCs. They're static and identical for every player, so they live on the
 * client (no sim/network cost): rendered in the world, and walking up + pressing
 * E opens the matching panel. Placed in the mob-free spawn town.
 */
export type Marker = 'spark' | 'coin' | 'quest' | 'chest'

export interface NPC {
  id: string
  name: string
  title: string
  x: number; y: number
  marker: Marker      // floating marker (drawn, not emoji)
  robe: string        // robe colour
  panel: Panel        // panel opened on interact
}

export const INTERACT_RANGE = 70

// Spread around the town plaza so you walk between them.
export const NPCS: NPC[] = [
  { id: 'trainer',  name: 'Mevra',  title: 'Spell Trainer', x: STARTER_X - 290, y: STARTER_Y - 150, marker: 'spark', robe: '#6b4ea8', panel: 'shop' },
  { id: 'merchant', name: 'Brom',   title: 'Merchant',      x: STARTER_X + 290, y: STARTER_Y - 150, marker: 'coin',  robe: '#a8732e', panel: 'merchant' },
  { id: 'quest',    name: 'Aldra',  title: 'Bounty Board',  x: STARTER_X - 290, y: STARTER_Y + 150, marker: 'quest', robe: '#3e7a5a', panel: 'quest' },
  { id: 'stash',    name: 'Keeper', title: 'Stash',         x: STARTER_X + 290, y: STARTER_Y + 150, marker: 'chest', robe: '#5a5e6a', panel: 'stash' },
  // Out at his farm by the caves — gives the "Feed Bessie" starter quest.
  { id: 'farmer',   name: 'Farmer Holt', title: 'Farmer',   x: HOLT_X,          y: HOLT_Y,          marker: 'quest', robe: '#7a5a2e', panel: 'farm' },
]

export function nearestNPC(px: number, py: number): NPC | null {
  let best: NPC | null = null
  let bd = INTERACT_RANGE
  for (const n of NPCS) {
    const d = Math.hypot(n.x - px, n.y - py)
    if (d < bd) { bd = d; best = n }
  }
  return best
}

/** Draw an NPC (centred at origin via the caller's translate). */
export function drawNPC(ctx: CanvasRenderingContext2D, npc: NPC, near: boolean, timeMs: number) {
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.beginPath(); ctx.ellipse(0, 22, 11, 4, 0, 0, Math.PI * 2); ctx.fill()
  // robe
  const g = ctx.createLinearGradient(-12, 0, 12, 22)
  g.addColorStop(0, npc.robe); g.addColorStop(1, shade(npc.robe, -0.35))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(-10, 2); ctx.bezierCurveTo(-14, 10, -13, 19, -8, 23)
  ctx.lineTo(8, 23); ctx.bezierCurveTo(13, 19, 14, 10, 10, 2); ctx.closePath(); ctx.fill()
  // head
  const h = ctx.createRadialGradient(-1, -6, 0, 0, -5, 7)
  h.addColorStop(0, '#f1c79b'); h.addColorStop(1, '#c89163')
  ctx.fillStyle = h
  ctx.beginPath(); ctx.arc(0, -5, 6.5, 0, Math.PI * 2); ctx.fill()

  // floating marker (drawn so colours are consistent across platforms)
  const bob = Math.sin(timeMs * 0.004) * 2
  drawMarker(ctx, npc.marker, 0, -24 + bob)

  // name + interact prompt
  ctx.font = 'bold 11px -apple-system, "Segoe UI", sans-serif'
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'
  ctx.strokeText(npc.name, 0, -34)
  ctx.fillStyle = '#ffe9a8'; ctx.fillText(npc.name, 0, -34)
  if (near) {
    ctx.font = 'bold 11px -apple-system, "Segoe UI", sans-serif'
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(-46, 30, 92, 17)
    ctx.fillStyle = '#fff'
    ctx.fillText(`Press E — ${npc.title}`, 0, 42)
  }
}

/** Drawn floating markers (no emoji → consistent colours; quest is yellow). */
function drawMarker(ctx: CanvasRenderingContext2D, marker: Marker, x: number, y: number) {
  ctx.save()
  ctx.translate(x, y)
  if (marker === 'quest') {
    ctx.fillStyle = '#ffd23a'; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 3
    ctx.font = 'bold 22px -apple-system, "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.strokeText('!', 0, 0); ctx.fillText('!', 0, 0)
  } else if (marker === 'coin') {
    ctx.fillStyle = '#f2c54a'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#a87b20'; ctx.lineWidth = 1.5; ctx.stroke()
    ctx.fillStyle = '#a87b20'; ctx.font = 'bold 11px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', 0, 1)
  } else if (marker === 'spark') {
    ctx.fillStyle = '#a98bff'
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(2.5, 0); ctx.lineTo(0, 9); ctx.lineTo(-2.5, 0); ctx.closePath(); ctx.fill()
      ctx.rotate(Math.PI / 4)
    }
  } else { // chest
    ctx.fillStyle = '#7a4a22'; ctx.fillRect(-8, -3, 16, 9)
    ctx.fillStyle = '#9a6030'; ctx.beginPath(); ctx.moveTo(-8, -3); ctx.quadraticCurveTo(0, -10, 8, -3); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#e0c060'; ctx.fillRect(-1.5, -3, 3, 9)   // latch
    ctx.strokeStyle = '#4a2c12'; ctx.lineWidth = 1; ctx.strokeRect(-8, -3, 16, 9)
  }
  ctx.restore()
}

function shade(hexColor: string, amt: number): string {
  const n = parseInt(hexColor.slice(1), 16)
  const r = Math.max(0, Math.min(255, ((n >> 16) & 0xff) + amt * 255))
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt * 255))
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt * 255))
  return `rgb(${r | 0},${g | 0},${b | 0})`
}
