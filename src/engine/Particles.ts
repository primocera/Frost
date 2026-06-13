/**
 * Transient visual effects (particle bursts, expanding rings, floating combat
 * text). Replaces Phaser's particle emitters + tweens. Lives entirely on the
 * client — driven by SimEvents — so it never affects gameplay or networking.
 *
 * All draw calls happen in world space (inside the renderer's camera transform).
 */
interface Particle {
  x: number; y: number; vx: number; vy: number
  life: number; max: number
  size: number; gravity: number
  color: string; add: boolean
}
interface Ring { x: number; y: number; r: number; maxR: number; life: number; max: number; color: string; width: number }
interface FloatText { x: number; y: number; text: string; color: string; size: number; life: number; max: number }

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`

export class Particles {
  private parts: Particle[] = []
  private rings: Ring[] = []
  private texts: FloatText[] = []

  burst(x: number, y: number, count: number, colors: number[], opts: {
    speedMin?: number; speedMax?: number; life?: number; size?: number; gravity?: number; add?: boolean
  } = {}) {
    const { speedMin = 60, speedMax = 240, life = 0.4, size = 3, gravity = 0, add = true } = opts
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const s = speedMin + Math.random() * (speedMax - speedMin)
      this.parts.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life, max: life, size, gravity,
        color: hex(colors[(Math.random() * colors.length) | 0]), add,
      })
    }
  }

  ring(x: number, y: number, color: number, maxR = 40, life = 0.26, width = 3) {
    this.rings.push({ x, y, r: 8, maxR, life, max: life, color: hex(color), width })
  }

  text(x: number, y: number, text: string, color: string, size = 15) {
    this.texts.push({ x, y, text, color, size, life: 0.9, max: 0.9 })
  }

  update(dt: number) {
    for (const p of this.parts) {
      p.x += p.vx * dt; p.y += p.vy * dt
      p.vy += p.gravity * dt
      p.life -= dt
    }
    this.parts = this.parts.filter(p => p.life > 0)

    for (const r of this.rings) r.life -= dt
    this.rings = this.rings.filter(r => r.life > 0)

    for (const t of this.texts) { t.y -= 26 * dt; t.life -= dt }
    this.texts = this.texts.filter(t => t.life > 0)
  }

  draw(ctx: CanvasRenderingContext2D) {
    // Rings
    for (const r of this.rings) {
      const k = 1 - r.life / r.max
      ctx.globalAlpha = 1 - k
      ctx.strokeStyle = r.color
      ctx.lineWidth = r.width
      ctx.beginPath()
      ctx.arc(r.x, r.y, r.r + (r.maxR - r.r) * k, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    // Particles
    for (const p of this.parts) {
      const a = Math.max(0, p.life / p.max)
      ctx.globalAlpha = a
      if (p.add) ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.6), 0, Math.PI * 2)
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
    }
    ctx.globalAlpha = 1

    // Floating text
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const t of this.texts) {
      const a = Math.min(1, t.life / 0.4)
      ctx.globalAlpha = a
      ctx.font = `bold ${t.size}px -apple-system, "Segoe UI", sans-serif`
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'
      ctx.strokeText(t.text, t.x, t.y)
      ctx.fillStyle = t.color
      ctx.fillText(t.text, t.x, t.y)
    }
    ctx.globalAlpha = 1
  }

  clear() { this.parts.length = 0; this.rings.length = 0; this.texts.length = 0 }
}
