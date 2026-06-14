import { Camera } from './Camera'
import { Particles } from './Particles'
import { EnemyState, GroundEffectState, LootState, ProjectileState, WorldState, ZONE_DEFS, getZoneAt, STARTER_X, STARTER_Y, PVP_SAFE_R } from '../sim'
import { BIOMES, DEFAULT_BIOME, biomeAt, buildPattern, generateDecor, drawDecor, DecorInstance } from './Biomes'
import { drawEnemyArt, visualRadius } from './EnemyArt'
import { NPCS, nearestNPC, drawNPC } from './npcs'
import { drawMage, mageFrame } from './MageArt'

export interface WorldBounds { x: number; y: number; w: number; h: number }

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`
const RARITY_HEX: Record<string, string> = {
  common: '#aaaaaa', magic: '#5599ff', rare: '#ffdd00', epic: '#cc44ff',
}

/**
 * Canvas 2D renderer for the whole world. Translates the context into world
 * space once (the camera transform), then draws ground, loot, depth-sorted
 * entities, projectiles and FX in plain world coordinates.
 */
export class Renderer {
  private patterns = new Map<string, CanvasPattern | null>()
  private defaultPattern: CanvasPattern | null = null
  private decor: DecorInstance[] = generateDecor()

  constructor(private ctx: CanvasRenderingContext2D) {
    this.defaultPattern = buildPattern(ctx, DEFAULT_BIOME)
    for (const [name, biome] of Object.entries(BIOMES)) this.patterns.set(name, buildPattern(ctx, biome))
  }

  draw(cam: Camera, world: WorldState, fx: Particles, localId = '', bubbles?: Map<string, { text: string; ms: number }>) {
    const ctx = this.ctx
    ctx.fillStyle = '#060a12'
    ctx.fillRect(0, 0, cam.viewW, cam.viewH)

    // View rect (world space) with margin, for culling.
    const m = 80
    const vx0 = cam.originX - m, vy0 = cam.originY - m
    const vx1 = cam.originX + cam.visW + m, vy1 = cam.originY + cam.visH + m
    const inView = (x: number, y: number) => x >= vx0 && x <= vx1 && y >= vy0 && y <= vy1

    ctx.save()
    ctx.scale(cam.zoom, cam.zoom)
    ctx.translate(Math.round(-cam.originX), Math.round(-cam.originY))

    this.drawGround(cam, world.bounds, world.timeMs)
    for (const g of world.grounds) this.drawBlizzard(g, world.timeMs)
    for (const drop of world.loot) if (inView(drop.x, drop.y)) this.drawLoot(drop, world.timeMs)

    // Depth-sort visible entities (decor + NPCs + enemies + players) by y.
    const local = world.players.find(p => p.id === localId)
    const activeNpc = local ? nearestNPC(local.x, local.y) : null
    const ents: Array<{ y: number; draw: () => void }> = []
    for (const d of this.decor) if (inView(d.x, d.y)) ents.push({ y: d.y, draw: () => drawDecor(ctx, d) })
    for (const n of NPCS) if (inView(n.x, n.y)) ents.push({ y: n.y, draw: () => { ctx.save(); ctx.translate(n.x, n.y); drawNPC(ctx, n, n === activeNpc, world.timeMs); ctx.restore() } })
    for (const e of world.enemies) if (inView(e.x, e.y)) ents.push({ y: e.y, draw: () => this.drawEnemy(e, world.timeMs) })
    for (const p of world.players) {
      if (!inView(p.x, p.y)) continue
      const bubble = bubbles?.get(p.name)
      ents.push({ y: p.y, draw: () => {
        this.drawPlayer(p.x, p.y, p.facing, p.vx, p.vy, world.timeMs, p.castMs > 0, p.hurtMs > 0, p.dead, p.frozenMs > 0)
        this.drawPlayerOverlay(p.x, p.y, p.name, p.stats.hp, p.stats.maxHp, p.id !== localId, bubble?.text)
      } })
    }
    ents.sort((a, b) => a.y - b.y)
    for (const ent of ents) ent.draw()

    for (const proj of world.projectiles) if (inView(proj.x, proj.y)) this.drawProjectile(proj)

    fx.draw(ctx)
    ctx.restore()

    this.drawAmbient(cam)

    // Boss health bar (screen-space) when a boss is engaged near the local player.
    if (local) {
      let boss: EnemyState | null = null, bd = 700
      for (const e of world.enemies) {
        if (!e.isBoss || e.dying) continue
        const d = Math.hypot(e.x - local.x, e.y - local.y)
        if (d < bd) { bd = d; boss = e }
      }
      if (boss) this.drawBossBar(cam, boss)
    }
  }

  private drawBossBar(cam: Camera, e: EnemyState) {
    const ctx = this.ctx
    const w = Math.min(440, cam.viewW - 40)
    const x = (cam.viewW - w) / 2, y = 16, h = 18
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x - 3, y - 3, w + 6, h + 22)
    ctx.fillStyle = '#ffcf66'; ctx.font = 'bold 14px -apple-system, "Segoe UI", sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`☠ ${e.cfg.label ?? 'Boss'}`, cam.viewW / 2, y - 6)
    ctx.fillStyle = '#2a0a0a'; ctx.fillRect(x, y, w, h)
    const pct = Math.max(0, Math.min(1, e.hp / e.maxHp))
    const g = ctx.createLinearGradient(x, 0, x + w, 0)
    g.addColorStop(0, '#cc2222'); g.addColorStop(1, '#ff5544')
    ctx.fillStyle = g; ctx.fillRect(x, y, w * pct, h)
    ctx.strokeStyle = 'rgba(255,180,120,0.5)'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h)
  }

  /** Screen-space biome ambient tint + vignette for mood. */
  private drawAmbient(cam: Camera) {
    const ctx = this.ctx
    const w = cam.viewW, h = cam.viewH
    const zone = getZoneAt(cam.x, cam.y)
    const ambient = (zone ? biomeAt(zone.name) : DEFAULT_BIOME).ambient
    ctx.fillStyle = ambient
    ctx.fillRect(0, 0, w, h)
    // Vignette
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(0,0,0,0.38)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }

  private drawBlizzard(g: GroundEffectState, timeMs: number) {
    const ctx = this.ctx
    const pulse = 0.5 + Math.sin(timeMs * 0.01) * 0.1
    const grad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.radius)
    grad.addColorStop(0, `rgba(120,200,255,${0.12 * pulse})`)
    grad.addColorStop(0.7, `rgba(70,150,230,${0.16 * pulse})`)
    grad.addColorStop(1, 'rgba(40,90,170,0)')
    ctx.fillStyle = grad
    ctx.beginPath(); ctx.arc(g.x, g.y, g.radius, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = `rgba(150,210,255,${0.25 * pulse})`
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(g.x, g.y, g.radius, 0, Math.PI * 2); ctx.stroke()
  }

  private drawGround(cam: Camera, b: WorldBounds, timeMs: number) {
    const ctx = this.ctx
    const vx = Math.max(b.x, cam.originX)
    const vy = Math.max(b.y, cam.originY)
    const vw = Math.min(b.x + b.w, cam.originX + cam.visW) - vx
    const vh = Math.min(b.y + b.h, cam.originY + cam.visH) - vy
    if (vw <= 0 || vh <= 0) return
    // Central/un-zoned area: default grass.
    ctx.fillStyle = this.defaultPattern ?? '#1d3a24'
    ctx.fillRect(vx, vy, vw, vh)

    // Each zone painted with its own biome texture.
    for (const z of ZONE_DEFS) {
      const zx = Math.max(z.x, vx), zy = Math.max(z.y, vy)
      const zw = Math.min(z.x + z.w, vx + vw) - zx
      const zh = Math.min(z.y + z.h, vy + vh) - zy
      if (zw <= 0 || zh <= 0) continue
      ctx.fillStyle = this.patterns.get(z.name) ?? this.defaultPattern ?? '#1d3a24'
      ctx.fillRect(zx, zy, zw, zh)
    }

    // Town stone plaza (safe zone) — only draw when on screen.
    if (Math.abs(STARTER_X - cam.x) < cam.visW / 2 + PVP_SAFE_R &&
        Math.abs(STARTER_Y - cam.y) < cam.visH / 2 + PVP_SAFE_R) {
      this.drawPlaza(STARTER_X, STARTER_Y, PVP_SAFE_R, timeMs)
    }
  }

  /** A Twisted-Treeline-style paved stone altar with glowing blue runes. */
  private drawPlaza(cx: number, cy: number, R: number, timeMs: number) {
    const ctx = this.ctx
    const TAU = Math.PI * 2
    const pulse = 0.55 + Math.sin(timeMs * 0.0022) * 0.45   // 0.1..1
    ctx.save()
    // paved base
    const g = ctx.createRadialGradient(cx, cy - R * 0.25, R * 0.15, cx, cy, R)
    g.addColorStop(0, '#6f747f'); g.addColorStop(0.7, '#4f535d'); g.addColorStop(1, '#383b43')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill()
    // concentric paving rings
    ctx.lineWidth = 2
    for (let i = 1; i <= 6; i++) {
      ctx.strokeStyle = i % 2 ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.05)'
      ctx.beginPath(); ctx.arc(cx, cy, R * (i / 6.5), 0, TAU); ctx.stroke()
    }
    // radial cobble seams
    ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 1.5
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * R * 0.18, cy + Math.sin(a) * R * 0.18)
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R)
      ctx.stroke()
    }

    // ── glowing blue runes engraved in the stone ──
    ctx.save()
    ctx.shadowColor = 'rgba(90,180,255,0.95)'
    ctx.shadowBlur = 10 + pulse * 14
    const runeCol = `rgba(120,200,255,${0.45 + pulse * 0.45})`
    // two glowing ring inscriptions
    ctx.strokeStyle = runeCol; ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.62, 0, TAU); ctx.stroke()
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.40, 0, TAU); ctx.stroke()
    // ring of runic glyphs
    const RUNES = ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ', 'ᚺ', 'ᚾ', 'ᛁ', 'ᛃ']
    ctx.fillStyle = runeCol; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = `${Math.round(R * 0.07)}px serif`
    for (let i = 0; i < RUNES.length; i++) {
      const a = (i / RUNES.length) * TAU - Math.PI / 2
      const rx = cx + Math.cos(a) * R * 0.62, ry = cy + Math.sin(a) * R * 0.62
      ctx.save(); ctx.translate(rx, ry); ctx.rotate(a + Math.PI / 2); ctx.fillText(RUNES[i], 0, 0); ctx.restore()
    }
    // radial rune spokes near the centre
    ctx.strokeStyle = `rgba(120,200,255,${0.3 + pulse * 0.35})`; ctx.lineWidth = 2
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * R * 0.18, cy + Math.sin(a) * R * 0.18)
      ctx.lineTo(cx + Math.cos(a) * R * 0.38, cy + Math.sin(a) * R * 0.38)
      ctx.stroke()
    }
    ctx.restore()

    // ornate border
    ctx.lineWidth = 9; ctx.strokeStyle = '#34363d'; ctx.beginPath(); ctx.arc(cx, cy, R - 3, 0, TAU); ctx.stroke()
    ctx.save()
    ctx.shadowColor = 'rgba(90,180,255,0.9)'; ctx.shadowBlur = 8 + pulse * 12
    ctx.lineWidth = 3; ctx.strokeStyle = `rgba(140,205,255,${0.4 + pulse * 0.4})`
    ctx.beginPath(); ctx.arc(cx, cy, R - 8, 0, TAU); ctx.stroke()
    ctx.restore()

    // centre medallion with glowing rune
    ctx.fillStyle = '#43464e'; ctx.beginPath(); ctx.arc(cx, cy, R * 0.16, 0, TAU); ctx.fill()
    ctx.save()
    ctx.shadowColor = 'rgba(110,190,255,1)'; ctx.shadowBlur = 12 + pulse * 18
    ctx.strokeStyle = `rgba(150,210,255,${0.6 + pulse * 0.4})`; ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.16, 0, TAU); ctx.stroke()
    ctx.fillStyle = `rgba(170,215,255,${0.7 + pulse * 0.3})`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = `${Math.round(R * 0.15)}px serif`; ctx.fillText('❄', cx, cy + 1)
    ctx.restore()
    ctx.textBaseline = 'alphabetic'

    // label
    ctx.fillStyle = 'rgba(190,225,255,0.8)'; ctx.font = 'bold 16px -apple-system, "Segoe UI", sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('✦ Millhaven — Safe Zone ✦', cx, cy - R + 30)
    ctx.restore()
  }

  private drawEnemy(e: EnemyState, timeMs: number) {
    const ctx = this.ctx
    const r = visualRadius(e)
    if (e.dying) {
      const k = 1 - e.deathMs / 340
      ctx.globalAlpha = Math.max(0, 1 - k)
      ctx.save(); ctx.translate(e.x, e.y); ctx.scale(1 + k, 1 + k)
      drawEnemyArt(ctx, e, hex(e.cfg.color), timeMs, r)
      ctx.restore(); ctx.globalAlpha = 1
      return
    }

    // Boss slam telegraph (ground warning circle)
    if (e.isBoss && e.slamMs > 0 && e.slamRadius > 0) {
      ctx.save()
      ctx.fillStyle = 'rgba(255,60,0,0.12)'
      ctx.beginPath(); ctx.arc(e.x, e.y, e.slamRadius, 0, Math.PI * 2); ctx.fill()
      ctx.setLineDash([12, 8]); ctx.strokeStyle = 'rgba(255,80,20,0.85)'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.arc(e.x, e.y, e.slamRadius, 0, Math.PI * 2); ctx.stroke()
      ctx.restore()
    }

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.beginPath(); ctx.ellipse(e.x, e.y + r * 0.85, r * 0.9, r * 0.4, 0, 0, Math.PI * 2); ctx.fill()

    // Body sprite (status-tinted)
    let fill = hex(e.cfg.color)
    if (e.hitFlashMs > 0) fill = '#ffffff'
    else if (e.frozenMs > 0) fill = '#88ddff'
    else if (e.slowMs > 0) fill = '#bbddff'
    ctx.save(); ctx.translate(e.x, e.y)
    drawEnemyArt(ctx, e, fill, timeMs, r)
    ctx.restore()

    // Telegraph / charge tell
    if (e.telegraphing || e.chargePhase === 'windup') {
      ctx.strokeStyle = 'rgba(255,60,0,0.9)'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.arc(e.x, e.y, r + 6, 0, Math.PI * 2); ctx.stroke()
    }

    // HP bar
    if (e.hp < e.maxHp) {
      const w = r * 2 + 4
      const yy = e.y - r - 10
      ctx.fillStyle = '#440000'; ctx.fillRect(e.x - w / 2, yy, w, 4)
      ctx.fillStyle = '#dd2222'; ctx.fillRect(e.x - w / 2, yy, w * (e.hp / e.maxHp), 4)
    }

    if (e.cfg.rare && e.cfg.label) {
      ctx.fillStyle = '#ffaa00'; ctx.font = 'bold 10px -apple-system, "Segoe UI", sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(e.cfg.label, e.x, e.y - r - 16)
    }
  }

  private drawPlayerOverlay(x: number, y: number, name: string, hp: number, maxHp: number, showName: boolean, bubble?: string) {
    const ctx = this.ctx
    // Health bar above the mage.
    const w = 36, barY = y - 36
    const pct = Math.max(0, Math.min(1, maxHp > 0 ? hp / maxHp : 0))
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(x - w / 2 - 1, barY - 1, w + 2, 5)
    ctx.fillStyle = '#2a1416'
    ctx.fillRect(x - w / 2, barY, w, 3)
    ctx.fillStyle = pct > 0.5 ? '#46d06a' : pct > 0.25 ? '#e0b020' : '#e0464a'
    ctx.fillRect(x - w / 2, barY, w * pct, 3)

    // Name (remote players only).
    if (showName) {
      ctx.font = 'bold 11px -apple-system, "Segoe UI", sans-serif'
      ctx.textAlign = 'center'
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'
      ctx.strokeText(name, x, barY - 6)
      ctx.fillStyle = '#9ed8ff'
      ctx.fillText(name, x, barY - 6)
    }

    // Speech bubble.
    if (bubble) this.drawBubble(x, barY - (showName ? 20 : 8), bubble)
  }

  private drawBubble(x: number, y: number, text: string) {
    const ctx = this.ctx
    ctx.font = '11px -apple-system, "Segoe UI", sans-serif'
    ctx.textAlign = 'center'
    const t = text.length > 60 ? text.slice(0, 60) + '…' : text
    const w = Math.min(220, ctx.measureText(t).width + 16)
    const h = 18
    const bx = x - w / 2, by = y - h
    ctx.fillStyle = 'rgba(245,248,255,0.95)'
    ctx.beginPath()
    ctx.roundRect(bx, by, w, h, 6)
    ctx.fill()
    // little tail
    ctx.beginPath(); ctx.moveTo(x - 4, by + h); ctx.lineTo(x + 4, by + h); ctx.lineTo(x, by + h + 5); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#16203a'
    ctx.fillText(t, x, by + h / 2 + 4)
  }

  private drawProjectile(b: ProjectileState) {
    const ctx = this.ctx
    let inner = '#ffee88', outer = 'rgba(255,100,0,0.0)', edge = '#ff6600'
    if (b.kind === 'frostbolt') { inner = '#ffffff'; edge = '#44ccff'; outer = 'rgba(80,180,255,0)' }
    else if (b.owner === 'enemy') {
      if (b.kind === 'enemy_frost_bolt') { inner = '#ddffff'; edge = '#44ddff' }
      else if (b.kind === 'enemy_fire_bolt') { inner = '#ffddaa'; edge = '#ff8822' }
      else { inner = '#eeccff'; edge = '#bb55ff' }
      outer = 'rgba(0,0,0,0)'
    }
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius * 2.4)
    g.addColorStop(0, inner); g.addColorStop(0.5, edge); g.addColorStop(1, outer)
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(b.x, b.y, b.radius * 2.4, 0, Math.PI * 2); ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  }

  private drawLoot(drop: LootState, timeMs: number) {
    const ctx = this.ctx
    const bob = Math.sin(timeMs * 0.004 + drop.id) * 2
    const y = drop.y + bob
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.beginPath(); ctx.ellipse(drop.x, drop.y + 6, 7, 3, 0, 0, Math.PI * 2); ctx.fill()
    if (drop.gold !== undefined) {
      ctx.fillStyle = '#ffcc33'
      ctx.beginPath(); ctx.arc(drop.x, y, 5, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#aa7700'; ctx.lineWidth = 1; ctx.stroke()
    } else if (drop.item) {
      const c = RARITY_HEX[drop.item.rarity] ?? '#aaaaaa'
      ctx.save(); ctx.translate(drop.x, y); ctx.rotate(Math.PI / 4)
      ctx.fillStyle = c; ctx.fillRect(-5, -5, 10, 10)
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.strokeRect(-5, -5, 10, 10)
      ctx.restore()
      if (drop.item.rarity === 'rare' || drop.item.rarity === 'epic') {
        ctx.globalAlpha = 0.4 + Math.sin(timeMs * 0.006) * 0.2
        ctx.strokeStyle = c; ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(drop.x, y, 11, 0, Math.PI * 2); ctx.stroke()
        ctx.globalAlpha = 1
      }
    }
  }

  private drawPlayer(
    x: number, y: number, facing: number, vx: number, vy: number,
    timeMs: number, casting: boolean, hurt: boolean, dead: boolean, frozen = false,
  ) {
    const ctx = this.ctx
    const moving = Math.abs(vx) > 18 || Math.abs(vy) > 18
    const state = casting ? 'cast' : moving ? 'walk' : 'idle'
    const frame = mageFrame(state, timeMs)

    ctx.save()
    ctx.translate(x, y)
    if (dead) ctx.globalAlpha = 0.5
    if (facing === -1) ctx.scale(-1, 1)

    if (frozen) {
      ctx.strokeStyle = 'rgba(150,225,255,0.85)'; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.stroke()
    }

    drawMage(ctx, frame)
    void hurt   // hit feedback is the floating damage text + screen flash

    ctx.restore()
    ctx.globalAlpha = 1
  }

}
