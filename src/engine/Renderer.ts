import { Camera } from './Camera'
import { Particles } from './Particles'
import { EnemyState, GroundEffectState, LootState, ProjectileState, WorldState, ZONE_DEFS, STARTER_X, STARTER_Y, PVP_SAFE_R } from '../sim'

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
  private grassPattern: CanvasPattern | null = null

  constructor(private ctx: CanvasRenderingContext2D) {
    this.grassPattern = this.buildGrassPattern()
  }

  draw(cam: Camera, world: WorldState, fx: Particles, localId = '') {
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

    this.drawGround(cam, world.bounds)
    for (const g of world.grounds) this.drawBlizzard(g, world.timeMs)
    for (const drop of world.loot) if (inView(drop.x, drop.y)) this.drawLoot(drop, world.timeMs)

    // Depth-sort visible entities (enemies + players) by y.
    const ents: Array<{ y: number; draw: () => void }> = []
    for (const e of world.enemies) if (inView(e.x, e.y)) ents.push({ y: e.y, draw: () => this.drawEnemy(e) })
    for (const p of world.players) {
      if (!inView(p.x, p.y)) continue
      ents.push({ y: p.y, draw: () => {
        this.drawPlayer(p.x, p.y, p.facing, p.vx, p.vy, world.timeMs, p.castMs > 0, p.hurtMs > 0, p.dead, p.frozenMs > 0)
        if (p.id !== localId) this.drawNameTag(p.x, p.y, p.name)
      } })
    }
    ents.sort((a, b) => a.y - b.y)
    for (const ent of ents) ent.draw()

    for (const proj of world.projectiles) if (inView(proj.x, proj.y)) this.drawProjectile(proj)

    fx.draw(ctx)
    ctx.restore()
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

  private drawGround(cam: Camera, b: WorldBounds) {
    const ctx = this.ctx
    const vx = Math.max(b.x, cam.originX)
    const vy = Math.max(b.y, cam.originY)
    const vw = Math.min(b.x + b.w, cam.originX + cam.visW) - vx
    const vh = Math.min(b.y + b.h, cam.originY + cam.visH) - vy
    if (vw <= 0 || vh <= 0) return
    ctx.fillStyle = this.grassPattern ?? '#1d3a24'
    ctx.fillRect(vx, vy, vw, vh)

    // Per-zone atmosphere tint so the regions read as distinct biomes.
    for (const z of ZONE_DEFS) {
      const zx = Math.max(z.x, vx), zy = Math.max(z.y, vy)
      const zw = Math.min(z.x + z.w, vx + vw) - zx
      const zh = Math.min(z.y + z.h, vy + vh) - zy
      if (zw <= 0 || zh <= 0) continue
      const r = (z.atmosphere >> 16) & 0xff, g = (z.atmosphere >> 8) & 0xff, bl = z.atmosphere & 0xff
      ctx.fillStyle = `rgba(${r},${g},${bl},${Math.min(0.6, z.atmoAlpha)})`
      ctx.fillRect(zx, zy, zw, zh)
      // Zone border line
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'
      ctx.lineWidth = 2
      ctx.strokeRect(z.x, z.y, z.w, z.h)
    }

    ctx.strokeStyle = 'rgba(90,140,90,0.5)'
    ctx.lineWidth = 4
    ctx.strokeRect(b.x, b.y, b.w, b.h)

    // PvP safe zone around spawn (square) — only draw when on screen.
    if (Math.abs(STARTER_X - cam.x) < cam.visW / 2 + PVP_SAFE_R &&
        Math.abs(STARTER_Y - cam.y) < cam.visH / 2 + PVP_SAFE_R) {
      const sx = STARTER_X - PVP_SAFE_R, sy = STARTER_Y - PVP_SAFE_R, sz = PVP_SAFE_R * 2
      ctx.save()
      ctx.fillStyle = 'rgba(80,180,255,0.06)'
      ctx.fillRect(sx, sy, sz, sz)
      ctx.setLineDash([14, 10])
      ctx.strokeStyle = 'rgba(120,200,255,0.45)'
      ctx.lineWidth = 3
      ctx.strokeRect(sx, sy, sz, sz)
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(150,210,255,0.6)'
      ctx.font = 'bold 14px -apple-system, "Segoe UI", sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('✦ Safe Zone — no PvP ✦', STARTER_X, sy + 22)
      ctx.restore()
    }
  }

  private drawEnemy(e: EnemyState) {
    const ctx = this.ctx
    const r = e.cfg.radius
    if (e.dying) {
      const k = 1 - e.deathMs / 340
      ctx.globalAlpha = Math.max(0, 1 - k)
      ctx.save(); ctx.translate(e.x, e.y); ctx.scale(1 + k, 1 + k)
      ctx.fillStyle = hex(e.cfg.color)
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill()
      ctx.restore(); ctx.globalAlpha = 1
      return
    }

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.beginPath(); ctx.ellipse(e.x, e.y + r * 0.7, r * 0.9, r * 0.4, 0, 0, Math.PI * 2); ctx.fill()

    // Body
    let fill = hex(e.cfg.color)
    if (e.hitFlashMs > 0) fill = '#ffffff'
    else if (e.frozenMs > 0) fill = '#88ddff'
    else if (e.slowMs > 0) fill = '#bbddff'
    ctx.fillStyle = fill
    ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.fill()
    // Darker rim
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2
    ctx.stroke()
    // Eyes (face direction)
    ctx.fillStyle = '#101018'
    const ex = e.facing * r * 0.35
    ctx.beginPath(); ctx.arc(e.x + ex - 2, e.y - 2, 1.6, 0, Math.PI * 2)
    ctx.arc(e.x + ex + 2, e.y - 2, 1.6, 0, Math.PI * 2); ctx.fill()

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

  private drawNameTag(x: number, y: number, name: string) {
    const ctx = this.ctx
    ctx.font = 'bold 11px -apple-system, "Segoe UI", sans-serif'
    ctx.textAlign = 'center'
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'
    ctx.strokeText(name, x, y - 34)
    ctx.fillStyle = '#9ed8ff'
    ctx.fillText(name, x, y - 34)
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
    const bob = moving ? Math.sin(timeMs * 0.012) * 1.5 : 0

    ctx.save()
    ctx.translate(x, y + bob)
    if (dead) ctx.globalAlpha = 0.5
    if (facing === -1) ctx.scale(-1, 1)

    // Frozen tell (PvP Frost Nova) — icy ring.
    if (frozen) {
      ctx.strokeStyle = 'rgba(150,225,255,0.85)'
      ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.arc(0, 6, 20, 0, Math.PI * 2); ctx.stroke()
    }

    // Cast glow
    if (casting) {
      const glow = ctx.createRadialGradient(0, 4, 0, 0, 4, 26)
      glow.addColorStop(0, 'rgba(136,68,255,0.35)')
      glow.addColorStop(1, 'rgba(136,68,255,0)')
      ctx.fillStyle = glow
      ctx.beginPath(); ctx.arc(0, 4, 26, 0, Math.PI * 2); ctx.fill()
    }

    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.beginPath(); ctx.ellipse(0, 22, 11, 4, 0, 0, Math.PI * 2); ctx.fill()

    const robe = ctx.createLinearGradient(-12, 0, 12, 22)
    robe.addColorStop(0, hurt ? '#b5523b' : '#3b6fb5')
    robe.addColorStop(1, hurt ? '#722f1f' : '#1f3f72')
    ctx.fillStyle = robe
    ctx.beginPath()
    ctx.moveTo(-10, 2); ctx.bezierCurveTo(-14, 10, -13, 19, -8, 23)
    ctx.lineTo(8, 23); ctx.bezierCurveTo(13, 19, 14, 10, 10, 2)
    ctx.closePath(); ctx.fill()

    const head = ctx.createRadialGradient(-1, -6, 0, 0, -5, 7)
    head.addColorStop(0, '#f1c79b'); head.addColorStop(1, '#c89163')
    ctx.fillStyle = head
    ctx.beginPath(); ctx.arc(0, -5, 6.5, 0, Math.PI * 2); ctx.fill()

    ctx.fillStyle = '#27407a'
    ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(2, -24); ctx.lineTo(9, -8); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#9ecbff'
    ctx.beginPath(); ctx.arc(2, -24, 1.8, 0, Math.PI * 2); ctx.fill()

    ctx.strokeStyle = '#5a3d1e'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(12, -14); ctx.lineTo(13, 22); ctx.stroke()
    const tip = ctx.createRadialGradient(12, -16, 0, 12, -16, 6)
    tip.addColorStop(0, 'rgba(150,200,255,0.95)'); tip.addColorStop(1, 'rgba(80,140,255,0)')
    ctx.fillStyle = tip
    ctx.beginPath(); ctx.arc(12, -16, 6, 0, Math.PI * 2); ctx.fill()

    ctx.restore()
    ctx.globalAlpha = 1
  }

  private buildGrassPattern(): CanvasPattern | null {
    const size = 64
    const c = document.createElement('canvas')
    c.width = c.height = size
    const g = c.getContext('2d')
    if (!g) return null
    g.fillStyle = '#21422a'; g.fillRect(0, 0, size, size)
    const speckles = [['rgba(45,80,48,0.8)', 90], ['rgba(30,58,36,0.8)', 70], ['rgba(60,100,62,0.5)', 40]] as const
    let seed = 1337
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
    for (const [color, count] of speckles) {
      g.fillStyle = color
      for (let i = 0; i < count; i++) g.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 1.5, 1 + rnd() * 2)
    }
    return this.ctx.createPattern(c, 'repeat')
  }
}
