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
  if (e.cfg.humanoid) return 'humanoid'
  if (e.cfg.aiType === 'ranged') return 'caster'
  if (e.cfg.aiType === 'elite' || e.cfg.aiType === 'tank') return 'brute'
  return 'orb'
}

export function drawEnemyArt(ctx: CanvasRenderingContext2D, e: EnemyState, fill: string, t: number) {
  const r = e.cfg.radius
  const f = e.facing
  ART[familyOf(e)](ctx, r, fill, f, t)
}

const dark = 'rgba(0,0,0,0.4)'
const eye = (c: CanvasRenderingContext2D, x: number, y: number, rr = 1.6, col = '#101018') => {
  c.fillStyle = col; c.beginPath(); c.arc(x, y, rr, 0, Math.PI * 2); c.fill()
}

const ART: Record<Family, (c: CanvasRenderingContext2D, r: number, fill: string, f: number, t: number) => void> = {
  orb(c, r, fill) {
    c.fillStyle = fill; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill()
    c.strokeStyle = dark; c.lineWidth = 2; c.stroke()
    eye(c, -r * 0.3, -2); eye(c, r * 0.3, -2)
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
  construct(c, r, fill) {
    c.fillStyle = fill
    c.fillRect(-r * 0.9, -r * 0.9, r * 1.8, r * 1.8)
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(-r * 0.9, -r * 0.9, r * 1.8, r * 0.5)
    c.strokeStyle = dark; c.lineWidth = 2; c.strokeRect(-r * 0.9, -r * 0.9, r * 1.8, r * 1.8)
    // glowing core
    const g = c.createRadialGradient(0, 0, 0, 0, 0, r * 0.7)
    g.addColorStop(0, 'rgba(255,180,80,0.9)'); g.addColorStop(1, 'rgba(255,120,30,0)')
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, r * 0.7, 0, Math.PI * 2); c.fill()
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
    c.beginPath(); c.moveTo(-r * 0.3, r * 0.4); c.lineTo(-r * 0.3, r * 1.1); c.moveTo(r * 0.3, r * 0.4); c.lineTo(r * 0.3, r * 1.1); c.stroke()
    // torso
    c.fillStyle = fill; c.beginPath()
    c.moveTo(-r * 0.6, -r * 0.2); c.lineTo(r * 0.6, -r * 0.2); c.lineTo(r * 0.45, r * 0.6); c.lineTo(-r * 0.45, r * 0.6); c.closePath(); c.fill()
    // head
    c.fillStyle = '#d8a878'; c.beginPath(); c.arc(0, -r * 0.6, r * 0.4, 0, Math.PI * 2); c.fill()
    // weapon hint
    c.strokeStyle = '#b8c0cc'; c.lineWidth = 2; c.beginPath(); c.moveTo(f * r * 0.6, r * 0.2); c.lineTo(f * r * 1.1, -r * 0.6); c.stroke()
    eye(c, f * 1.5, -r * 0.6, 1)
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
