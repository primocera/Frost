import { EnemyState } from '../sim'

/**
 * Procedural enemy sprites. Each archetype family draws a distinct silhouette
 * (centred at origin, the renderer translates to the enemy position first),
 * tinted by `fill` so status effects (frozen/slow/hit-flash) still read.
 */
type Family = 'blob' | 'spider' | 'beast' | 'imp' | 'undead' | 'construct' | 'caster' | 'humanoid' | 'brute' | 'orb'

export function familyOf(e: EnemyState): Family {
  const k = e.key
  if (k === 'slime') return 'blob'
  if (k === 'spider') return 'spider'
  if (k === 'wolf' || k === 'bear' || k.includes('dragon')) return 'beast'
  if (k === 'imp') return 'imp'
  if (k === 'ghoul') return 'undead'
  if (k.includes('golem')) return 'construct'
  if (k === 'highelf_sentinel' || k === 'nightblade_warden') return 'humanoid'   // elven sentinels, not blobs
  if (e.cfg.humanoid) return 'humanoid'
  if (e.cfg.aiType === 'ranged') return 'caster'
  if (e.cfg.aiType === 'elite' || e.cfg.aiType === 'tank') return 'brute'
  return 'orb'
}

export function drawEnemyArt(ctx: CanvasRenderingContext2D, e: EnemyState, fill: string, t: number, r: number) {
  ART[familyOf(e)](ctx, r, fill, e.facing, t)
}

/** Visual size: small mobs are floored to ~player size so they don't look tiny;
 *  the gameplay hitbox (cfg.radius) is unchanged. */
export function visualRadius(e: EnemyState): number {
  return Math.max(17, e.cfg.radius)
}

const dark = 'rgba(0,0,0,0.4)'
const eye = (c: CanvasRenderingContext2D, x: number, y: number, rr = 1.6, col = '#101018') => {
  c.fillStyle = col; c.beginPath(); c.arc(x, y, rr, 0, Math.PI * 2); c.fill()
}

const ART: Record<Family, (c: CanvasRenderingContext2D, r: number, fill: string, f: number, t: number) => void> = {
  orb(c, r, fill, f, t) {
    // spiky little creature
    c.fillStyle = fill
    const spikes = 9
    c.beginPath()
    for (let i = 0; i <= spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2
      const rad = i % 2 === 0 ? r : r * 0.78
      const px = Math.cos(a) * rad, py = Math.sin(a) * rad
      i === 0 ? c.moveTo(px, py) : c.lineTo(px, py)
    }
    c.closePath(); c.fill()
    c.fillStyle = 'rgba(255,255,255,0.15)'; c.beginPath(); c.ellipse(-r * 0.25, -r * 0.3, r * 0.4, r * 0.25, 0, 0, Math.PI * 2); c.fill()
    eye(c, f * 1 - r * 0.32, -2, 1.8, '#ffe0a0'); eye(c, f * 1 + r * 0.32, -2, 1.8, '#ffe0a0')
    // tiny fanged mouth
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1.4
    c.beginPath(); c.moveTo(-r * 0.3, r * 0.4); c.lineTo(0, r * 0.55); c.lineTo(r * 0.3, r * 0.4); c.stroke()
    void t
  },
  blob(c, r, fill, _f, t) {
    const sq = 1 + Math.sin(t * 0.004) * 0.06
    c.save(); c.scale(1 / sq, sq)
    c.fillStyle = fill; c.beginPath()
    c.ellipse(0, 2, r, r * 0.85, 0, 0, Math.PI * 2); c.fill()
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.ellipse(-r * 0.3, -r * 0.3, r * 0.35, r * 0.25, 0, 0, Math.PI * 2); c.fill()
    c.restore()
    eye(c, -r * 0.3, 0); eye(c, r * 0.3, 0)
  },
  spider(c, r, fill, f) {
    c.strokeStyle = fill; c.lineWidth = 1.8; c.lineCap = 'round'
    for (const s of [-1, 1]) for (const i of [0, 1, 2]) {
      const ay = -3 + i * 4
      c.beginPath(); c.moveTo(0, ay - 2); c.lineTo(s * (r + 5), ay - 4 - i); c.lineTo(s * (r + 8), ay + 2); c.stroke()
    }
    c.fillStyle = fill; c.beginPath(); c.arc(0, 1, r * 0.9, 0, Math.PI * 2); c.fill()
    c.fillStyle = dark; c.beginPath(); c.arc(f * 2, -2, r * 0.5, 0, Math.PI * 2); c.fill()
    eye(c, f * 1 - 2, -3, 1, '#ff5555'); eye(c, f * 1 + 2, -3, 1, '#ff5555')
  },
  beast(c, r, fill, f) {
    c.fillStyle = dark; c.lineWidth = 0
    // legs
    for (const lx of [-r * 0.6, -r * 0.2, r * 0.2, r * 0.6]) c.fillRect(lx - 1.5, r * 0.3, 3, r * 0.7)
    // body
    c.fillStyle = fill; c.beginPath(); c.ellipse(0, 0, r * 1.25, r * 0.7, 0, 0, Math.PI * 2); c.fill()
    // head
    c.beginPath(); c.ellipse(f * r * 1.1, -r * 0.3, r * 0.55, r * 0.45, 0, 0, Math.PI * 2); c.fill()
    // ears
    c.beginPath(); c.moveTo(f * r * 1.0, -r * 0.7); c.lineTo(f * r * 1.15, -r * 1.1); c.lineTo(f * r * 1.3, -r * 0.7); c.closePath(); c.fill()
    // tail
    c.strokeStyle = fill; c.lineWidth = 3; c.beginPath(); c.moveTo(-f * r * 1.2, -r * 0.1); c.lineTo(-f * r * 1.7, -r * 0.5); c.stroke()
    eye(c, f * r * 1.25, -r * 0.35, 1.3, '#ffdd55')
  },
  imp(c, r, fill, f) {
    c.fillStyle = 'rgba(120,30,20,0.6)'  // wings
    c.beginPath(); c.moveTo(0, 0); c.lineTo(-r * 1.6, -r); c.lineTo(-r * 0.6, r * 0.3); c.closePath()
    c.moveTo(0, 0); c.lineTo(r * 1.6, -r); c.lineTo(r * 0.6, r * 0.3); c.closePath(); c.fill()
    c.fillStyle = fill; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill()
    // horns
    c.strokeStyle = '#2a0a06'; c.lineWidth = 2; c.beginPath()
    c.moveTo(-r * 0.5, -r * 0.7); c.lineTo(-r * 0.7, -r * 1.2); c.moveTo(r * 0.5, -r * 0.7); c.lineTo(r * 0.7, -r * 1.2); c.stroke()
    eye(c, -r * 0.35, -1, 1.4, '#ffdd00'); eye(c, r * 0.35, -1, 1.4, '#ffdd00')
    void f
  },
  undead(c, r, fill, f) {
    c.fillStyle = fill
    c.beginPath(); c.moveTo(-r * 0.8, r); c.quadraticCurveTo(-r, -r * 0.6, 0, -r); c.quadraticCurveTo(r, -r * 0.6, r * 0.8, r); c.closePath(); c.fill()
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.arc(f * 2, -r * 0.4, r * 0.5, 0, Math.PI * 2); c.fill()
    eye(c, f * 2 - 2.5, -r * 0.4, 1.3, '#88ff66'); eye(c, f * 2 + 2.5, -r * 0.4, 1.3, '#88ff66')
  },
  construct(c, r, fill, f) {
    // stubby arms
    c.fillStyle = fill
    c.beginPath(); c.arc(-r * 1.05, r * 0.1, r * 0.42, 0, Math.PI * 2); c.arc(r * 1.05, r * 0.1, r * 0.42, 0, Math.PI * 2); c.fill()
    // rounded boulder body
    c.beginPath()
    c.moveTo(-r, r * 0.35)
    c.quadraticCurveTo(-r * 1.05, -r * 0.5, -r * 0.4, -r * 0.95)
    c.quadraticCurveTo(0, -r * 1.15, r * 0.4, -r * 0.95)
    c.quadraticCurveTo(r * 1.05, -r * 0.5, r, r * 0.35)
    c.quadraticCurveTo(r * 0.7, r, 0, r)
    c.quadraticCurveTo(-r * 0.7, r, -r, r * 0.35)
    c.closePath(); c.fill()
    // top-lit highlight + lower shade
    c.fillStyle = 'rgba(255,255,255,0.14)'; c.beginPath(); c.ellipse(0, -r * 0.55, r * 0.7, r * 0.3, 0, 0, Math.PI * 2); c.fill()
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.ellipse(0, r * 0.55, r * 0.75, r * 0.3, 0, 0, Math.PI * 2); c.fill()
    // molten cracks
    c.strokeStyle = 'rgba(255,150,50,0.85)'; c.lineWidth = 1.6; c.lineCap = 'round'
    c.beginPath(); c.moveTo(-r * 0.45, -r * 0.35); c.lineTo(-r * 0.1, r * 0.05); c.lineTo(r * 0.35, -r * 0.15); c.moveTo(-r * 0.1, r * 0.05); c.lineTo(0, r * 0.55); c.stroke()
    // glowing core
    const g = c.createRadialGradient(0, 0, 0, 0, 0, r * 0.6)
    g.addColorStop(0, 'rgba(255,190,90,0.95)'); g.addColorStop(1, 'rgba(255,120,30,0)')
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, r * 0.6, 0, Math.PI * 2); c.fill()
    eye(c, f * 2 - 4, -r * 0.45, 1.6, '#ffd060'); eye(c, f * 2 + 4, -r * 0.45, 1.6, '#ffd060')
  },
  caster(c, r, fill, f, t) {
    const bob = Math.sin(t * 0.004) * 2
    c.save(); c.translate(0, bob)
    // hood/robe
    c.fillStyle = fill
    c.beginPath(); c.moveTo(0, -r * 1.2); c.quadraticCurveTo(-r * 1.1, -r * 0.2, -r * 0.9, r); c.lineTo(r * 0.9, r); c.quadraticCurveTo(r * 1.1, -r * 0.2, 0, -r * 1.2); c.closePath(); c.fill()
    // hood opening
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.beginPath(); c.ellipse(f * 1, -r * 0.5, r * 0.45, r * 0.55, 0, 0, Math.PI * 2); c.fill()
    eye(c, f * 1, -r * 0.5, 1.6, '#aab8ff')
    c.restore()
    // faint aura
    c.globalAlpha = 0.18; c.fillStyle = fill; c.beginPath(); c.arc(0, bob, r * 1.5, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1
  },
  humanoid(c, r, fill, f) {
    // legs
    c.strokeStyle = '#2a2018'; c.lineWidth = 3; c.lineCap = 'round'
    c.beginPath(); c.moveTo(-r * 0.3, r * 0.5); c.lineTo(-r * 0.3, r * 1.15); c.moveTo(r * 0.3, r * 0.5); c.lineTo(r * 0.3, r * 1.15); c.stroke()
    // cape behind
    c.fillStyle = 'rgba(0,0,0,0.22)'
    c.beginPath(); c.moveTo(-r * 0.5, -r * 0.2); c.quadraticCurveTo(-r * 0.85, r * 0.6, -r * 0.3, r * 0.95); c.lineTo(r * 0.3, r * 0.95); c.quadraticCurveTo(r * 0.85, r * 0.6, r * 0.5, -r * 0.2); c.closePath(); c.fill()
    // shield (off hand)
    c.fillStyle = fill; c.beginPath(); c.ellipse(-f * r * 0.72, r * 0.12, r * 0.28, r * 0.42, 0, 0, Math.PI * 2); c.fill()
    c.strokeStyle = 'rgba(255,255,255,0.28)'; c.lineWidth = 1.2; c.stroke()
    // armored torso (tinted)
    c.fillStyle = fill; c.beginPath()
    c.moveTo(-r * 0.55, -r * 0.25); c.lineTo(r * 0.55, -r * 0.25); c.lineTo(r * 0.42, r * 0.6); c.lineTo(-r * 0.42, r * 0.6); c.closePath(); c.fill()
    c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 1.4
    c.beginPath(); c.moveTo(-r * 0.42, r * 0.22); c.lineTo(r * 0.42, r * 0.22); c.stroke()   // belt
    c.beginPath(); c.moveTo(0, -r * 0.2); c.lineTo(0, r * 0.5); c.stroke()                    // center seam
    // pauldrons
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.arc(-r * 0.55, -r * 0.22, r * 0.26, 0, Math.PI * 2); c.arc(r * 0.55, -r * 0.22, r * 0.26, 0, Math.PI * 2); c.fill()
    // head + helm/hair
    c.fillStyle = '#e8c8a0'; c.beginPath(); c.arc(0, -r * 0.62, r * 0.4, 0, Math.PI * 2); c.fill()
    c.fillStyle = 'rgba(255,255,255,0.3)'; c.beginPath(); c.arc(0, -r * 0.74, r * 0.42, Math.PI, 0); c.fill()
    // sword (main hand)
    c.strokeStyle = '#cdd4dd'; c.lineWidth = 2.6; c.beginPath(); c.moveTo(f * r * 0.6, r * 0.3); c.lineTo(f * r * 1.15, -r * 0.7); c.stroke()
    c.strokeStyle = '#caa44a'; c.lineWidth = 2; c.beginPath(); c.moveTo(f * r * 0.5, r * 0.36); c.lineTo(f * r * 0.74, r * 0.2); c.stroke()
    eye(c, f * 1.5, -r * 0.62, 1, '#dff0ff')
  },
  brute(c, r, fill, f) {
    c.fillStyle = dark
    for (const lx of [-r * 0.45, r * 0.45]) c.fillRect(lx - 3, r * 0.5, 6, r * 0.6)
    c.fillStyle = fill
    c.beginPath(); c.moveTo(-r * 0.95, -r * 0.5); c.lineTo(r * 0.95, -r * 0.5); c.lineTo(r * 0.8, r * 0.7); c.lineTo(-r * 0.8, r * 0.7); c.closePath(); c.fill()
    // armored shoulders
    c.fillStyle = 'rgba(255,255,255,0.14)'; c.beginPath(); c.arc(-r * 0.8, -r * 0.4, r * 0.4, 0, Math.PI * 2); c.arc(r * 0.8, -r * 0.4, r * 0.4, 0, Math.PI * 2); c.fill()
    // head
    c.fillStyle = fill; c.beginPath(); c.arc(0, -r * 0.7, r * 0.45, 0, Math.PI * 2); c.fill()
    eye(c, f * 2 - 3, -r * 0.7, 1.4, '#ff6633'); eye(c, f * 2 + 3, -r * 0.7, 1.4, '#ff6633')
  },
}
