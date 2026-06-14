/**
 * The original game's detailed mage figure, ported from GameScene's procedural
 * sprite sheet. Drawn relative to the origin (caller translates to the player
 * position and applies the facing flip). `frame`: 0-3 idle, 4-7 walk, 8-10 cast.
 */
const STYLE = {
  robe: ['#9a948a', '#7c766b', '#544f47'] as const, robeHi: '#b3ab9d', fold: '#4a463d',
  belt: '#6b5436', sleeve: '#857f74', hand: '#d8a878', head: ['#e8c098', '#bf8a5e'] as const,
  eye: '#dff0ff', beardCol: ['#e4e0d6', '#b4ad9f'] as const,
  hwMain: '#8d887d', hwDark: '#403c34', crystal: '#cfe8ff', glowRgb: '180,215,255',
}

interface Anim { bob: number; staffRaise: number; glow: number; footSwing: number; blink: boolean }
const ANIMS: Anim[] = [
  { bob: 0, staffRaise: 0, glow: 0.20, footSwing: 0, blink: false },
  { bob: 1, staffRaise: 0, glow: 0.15, footSwing: 0, blink: false },
  { bob: 1, staffRaise: 0, glow: 0.20, footSwing: 0, blink: false },
  { bob: 0, staffRaise: 0, glow: 0.30, footSwing: 0, blink: true },
  { bob: 0, staffRaise: -1, glow: 0.15, footSwing: -1, blink: false },
  { bob: -1, staffRaise: 1, glow: 0.15, footSwing: -0.4, blink: false },
  { bob: 0, staffRaise: -1, glow: 0.15, footSwing: 1, blink: false },
  { bob: -1, staffRaise: 1, glow: 0.15, footSwing: 0.4, blink: false },
  { bob: -1, staffRaise: 6, glow: 0.55, footSwing: 0, blink: false },
  { bob: -3, staffRaise: 14, glow: 1.00, footSwing: 0, blink: false },
  { bob: -2, staffRaise: 10, glow: 0.65, footSwing: 0, blink: false },
]

const YOFF = -30   // shifts the 32×48 figure so its feet sit near the origin

export function mageFrame(state: 'idle' | 'walk' | 'cast', t: number): number {
  if (state === 'cast') return 8 + (Math.floor(t / 90) % 3)
  if (state === 'walk') return 4 + (Math.floor(t / 110) % 4)
  return Math.floor(t / 250) % 4
}

export function drawMage(ctx: CanvasRenderingContext2D, frame: number) {
  const a = ANIMS[Math.min(frame, ANIMS.length - 1)]
  ctx.save()
  ctx.translate(0, YOFF)
  const cx = 0
  const by = a.bob

  // Cast glow behind everything
  if (a.glow > 0.3) {
    const g = ctx.createRadialGradient(cx, by + 30, 0, cx, by + 30, 22)
    g.addColorStop(0, `rgba(${STYLE.glowRgb},${a.glow * 0.55})`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.ellipse(cx, by + 30, 22, 18, 0, 0, Math.PI * 2); ctx.fill()
  }
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  ctx.beginPath(); ctx.ellipse(cx, by + 47, 10, 3.5, 0, 0, Math.PI * 2); ctx.fill()

  drawStaff(ctx, by, a)

  // Boots
  const lx = cx - 6 + a.footSwing * -3, rx = cx + 4 + a.footSwing * 3
  ctx.fillStyle = '#2a2018'
  ctx.beginPath(); ctx.ellipse(lx, by + 45, 5, 3.5, -0.08, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(rx, by + 45, 5, 3.5, 0.08, 0, Math.PI * 2); ctx.fill()

  // Robe
  const robeGr = ctx.createLinearGradient(cx - 13, by + 24, cx + 13, by + 45)
  robeGr.addColorStop(0, STYLE.robe[0]); robeGr.addColorStop(0.55, STYLE.robe[1]); robeGr.addColorStop(1, STYLE.robe[2])
  ctx.fillStyle = robeGr
  ctx.beginPath()
  ctx.moveTo(cx - 11, by + 25)
  ctx.bezierCurveTo(cx - 15, by + 33, cx - 14, by + 42, cx - 9, by + 46)
  ctx.lineTo(cx + 8, by + 46)
  ctx.bezierCurveTo(cx + 14, by + 42, cx + 15, by + 33, cx + 11, by + 25)
  ctx.closePath(); ctx.fill()
  ctx.strokeStyle = STYLE.fold; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(cx - 3, by + 30); ctx.lineTo(cx - 4, by + 45); ctx.moveTo(cx + 4, by + 30); ctx.lineTo(cx + 5, by + 45); ctx.stroke()
  ctx.strokeStyle = STYLE.robeHi; ctx.lineWidth = 1.2
  ctx.beginPath(); ctx.moveTo(cx - 11, by + 25); ctx.bezierCurveTo(cx - 15, by + 33, cx - 14, by + 42, cx - 9, by + 46); ctx.stroke()
  ctx.strokeStyle = STYLE.belt; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(cx - 9, by + 33); ctx.quadraticCurveTo(cx, by + 35, cx + 9, by + 33); ctx.stroke()

  // Sleeves + hands
  ctx.fillStyle = STYLE.sleeve
  ctx.beginPath(); ctx.ellipse(cx - 12, by + 31, 5, 7.5, -0.18, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(cx + 11, by + 31, 4.5, 7, 0.18, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = STYLE.hand
  ctx.beginPath(); ctx.arc(cx - 13, by + 38, 3.5, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(cx + 12, by + 36, 3.5, 0, Math.PI * 2); ctx.fill()

  // Head
  const hx = cx, hy = by + 19, hr = 6.5
  const headGr = ctx.createRadialGradient(hx - 1, hy - 1, 0, hx, hy, hr)
  headGr.addColorStop(0, STYLE.head[0]); headGr.addColorStop(1, STYLE.head[1])
  ctx.fillStyle = headGr
  ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.fill()

  // Long beard
  const beardGr = ctx.createLinearGradient(cx, by + 18, cx, by + 38)
  beardGr.addColorStop(0, STYLE.beardCol[0]); beardGr.addColorStop(1, STYLE.beardCol[1])
  ctx.fillStyle = beardGr
  ctx.beginPath()
  ctx.moveTo(cx - 6.5, by + 17)
  ctx.quadraticCurveTo(cx - 9, by + 26, cx - 4, by + 33)
  ctx.quadraticCurveTo(cx - 2, by + 37, cx, by + 38)
  ctx.quadraticCurveTo(cx + 2, by + 37, cx + 4, by + 33)
  ctx.quadraticCurveTo(cx + 9, by + 26, cx + 6.5, by + 17)
  ctx.quadraticCurveTo(cx, by + 21, cx - 6.5, by + 17)
  ctx.closePath(); ctx.fill()

  drawWizardHat(ctx, cx, by)

  // Eyes
  if (!a.blink) {
    ctx.fillStyle = STYLE.eye
    ctx.beginPath(); ctx.arc(cx - 3, by + 16.5, 1, 0, Math.PI * 2); ctx.arc(cx + 3, by + 16.5, 1, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
}

function drawStaff(ctx: CanvasRenderingContext2D, by: number, a: Anim) {
  const sx = 12
  const tipY = by + 4 - a.staffRaise
  const botY = by + 45
  ctx.save(); ctx.lineCap = 'round'
  ctx.strokeStyle = '#5a3d1e'; ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(sx, tipY + 8); ctx.lineTo(sx + 1, botY); ctx.stroke()
  ctx.strokeStyle = '#8a6838'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(sx - 0.5, tipY + 9); ctx.lineTo(sx + 0.5, botY); ctx.stroke()
  ctx.strokeStyle = '#4a3318'; ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(sx, tipY + 8); ctx.quadraticCurveTo(sx - 4, tipY + 5, sx - 3, tipY + 1)
  ctx.moveTo(sx, tipY + 8); ctx.quadraticCurveTo(sx + 4, tipY + 5, sx + 3, tipY + 1)
  ctx.stroke()
  ctx.restore()
  if (a.glow > 0.2) {
    const og = ctx.createRadialGradient(sx, tipY + 3, 0, sx, tipY + 3, 13 * a.glow)
    og.addColorStop(0, `rgba(${STYLE.glowRgb},${a.glow * 0.85})`); og.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = og
    ctx.beginPath(); ctx.arc(sx, tipY + 3, 13 * a.glow, 0, Math.PI * 2); ctx.fill()
  }
  const cg = ctx.createRadialGradient(sx - 1, tipY + 1, 0, sx, tipY + 3, 5)
  cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.4, STYLE.crystal); cg.addColorStop(1, `rgba(${STYLE.glowRgb},0.9)`)
  ctx.fillStyle = cg
  ctx.beginPath()
  ctx.moveTo(sx, tipY - 2 - a.glow); ctx.lineTo(sx + 3.5, tipY + 3); ctx.lineTo(sx, tipY + 6 + a.glow); ctx.lineTo(sx - 3.5, tipY + 3)
  ctx.closePath(); ctx.fill()
}

function drawWizardHat(ctx: CanvasRenderingContext2D, cx: number, by: number) {
  const brimY = by + 14
  ctx.fillStyle = STYLE.hwMain
  ctx.beginPath()
  ctx.moveTo(cx - 13, brimY); ctx.quadraticCurveTo(cx, brimY + 6, cx + 13, brimY); ctx.quadraticCurveTo(cx, brimY - 4, cx - 13, brimY)
  ctx.closePath(); ctx.fill()
  const coneGr = ctx.createLinearGradient(cx - 9, by, cx + 9, brimY)
  coneGr.addColorStop(0, STYLE.hwMain); coneGr.addColorStop(1, STYLE.hwDark)
  ctx.fillStyle = coneGr
  ctx.beginPath()
  ctx.moveTo(cx - 9, brimY - 1)
  ctx.quadraticCurveTo(cx - 12, by + 6, cx - 8, by + 2)
  ctx.quadraticCurveTo(cx - 6, by - 1, cx - 3, by + 2)
  ctx.quadraticCurveTo(cx + 4, by + 6, cx + 9, brimY - 1)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = STYLE.hwDark
  ctx.beginPath()
  ctx.moveTo(cx - 8.5, brimY - 2); ctx.quadraticCurveTo(cx, brimY + 1, cx + 8.5, brimY - 2)
  ctx.lineTo(cx + 8, brimY - 5); ctx.quadraticCurveTo(cx, brimY - 2, cx - 8, brimY - 5)
  ctx.closePath(); ctx.fill()
}
