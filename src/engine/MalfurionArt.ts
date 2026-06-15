/**
 * Procedural Malfurion — the corrupted archdruid raid boss, drawn in the game's
 * own flat-shaded canvas style (like the mage, towers and shrines) so he sits
 * cohesively in the world instead of looking like a pasted-in illustration.
 * Drawn centred at the origin; the caller translates to the boss position and
 * handles facing flip + hit-flash. `r` is the boss visual radius (~60).
 */
export function drawMalfurion(ctx: CanvasRenderingContext2D, r: number, t: number) {
  const u = r / 60
  ctx.save()
  ctx.scale(u, u)   // design space is ~60px units, scaled to the boss radius
  const pulse = 0.6 + Math.sin(t * 0.003) * 0.4

  // Corruption aura + drifting wisps
  const ag = ctx.createRadialGradient(0, -8, 0, 0, -8, 74)
  ag.addColorStop(0, `rgba(150,90,255,${0.22 * pulse})`)
  ag.addColorStop(0.5, `rgba(100,255,170,${0.13 * pulse})`)
  ag.addColorStop(1, 'rgba(100,255,170,0)')
  ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(0, -8, 74, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = `rgba(150,100,255,${0.45 * pulse})`; ctx.lineWidth = 2; ctx.lineCap = 'round'
  for (let i = 0; i < 3; i++) {
    const a = t * 0.001 + i * 2.1
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * 30, -18 + Math.sin(a) * 18)
    ctx.quadraticCurveTo(Math.cos(a) * 42, -50, Math.cos(a) * 26, -72); ctx.stroke()
  }

  const robe = '#3a5a32', robeDark = '#27401f', robeHi = '#4f7440', bark = '#5a4326', barkHi = '#6e5436'
  const skin = '#8aa882', skinDark = '#688a66'

  // Gnarled staff (behind the body)
  ctx.strokeStyle = bark; ctx.lineWidth = 5; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(34, 56); ctx.lineTo(30, -66); ctx.stroke()
  ctx.strokeStyle = barkHi; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(30, -66); ctx.quadraticCurveTo(20, -72, 26, -80); ctx.moveTo(30, -66); ctx.quadraticCurveTo(40, -72, 34, -82); ctx.stroke()
  const cg = ctx.createRadialGradient(30, -72, 0, 30, -72, 9)
  cg.addColorStop(0, '#d8ffe8'); cg.addColorStop(0.5, '#66ffaa'); cg.addColorStop(1, `rgba(60,200,140,${pulse})`)
  ctx.fillStyle = cg; ctx.beginPath(); ctx.moveTo(30, -81); ctx.lineTo(37, -71); ctx.lineTo(30, -61); ctx.lineTo(23, -71); ctx.closePath(); ctx.fill()

  // Robe
  const rg = ctx.createLinearGradient(-35, 0, 35, 40)
  rg.addColorStop(0, robe); rg.addColorStop(1, robeDark)
  ctx.fillStyle = rg
  ctx.beginPath()
  ctx.moveTo(-20, -28)
  ctx.bezierCurveTo(-30, -6, -36, 28, -34, 56)
  ctx.lineTo(34, 56)
  ctx.bezierCurveTo(36, 28, 30, -6, 20, -28)
  ctx.closePath(); ctx.fill()
  ctx.strokeStyle = robeDark; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(-8, -10); ctx.lineTo(-12, 54); ctx.moveTo(10, -10); ctx.lineTo(14, 54); ctx.stroke()
  // Leafy hem
  ctx.fillStyle = robeHi
  for (let i = -3; i <= 3; i++) { const x = i * 10 + 2; ctx.beginPath(); ctx.moveTo(x, 55); ctx.lineTo(x - 5, 46); ctx.lineTo(x + 5, 46); ctx.closePath(); ctx.fill() }
  // Sleeves + clawed hands
  ctx.fillStyle = robe
  ctx.beginPath(); ctx.ellipse(-26, 6, 8, 16, -0.2, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(26, 4, 8, 16, 0.2, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = skinDark
  ctx.beginPath(); ctx.arc(-28, 22, 5, 0, Math.PI * 2); ctx.arc(28, 20, 5, 0, Math.PI * 2); ctx.fill()

  // Bark mantle over the shoulders
  ctx.fillStyle = bark; ctx.beginPath(); ctx.moveTo(-25, -28); ctx.quadraticCurveTo(0, -45, 25, -28); ctx.quadraticCurveTo(0, -16, -25, -28); ctx.closePath(); ctx.fill()
  ctx.fillStyle = barkHi; ctx.beginPath(); ctx.moveTo(-25, -28); ctx.quadraticCurveTo(0, -41, 25, -28); ctx.quadraticCurveTo(0, -25, -25, -28); ctx.closePath(); ctx.fill()

  // Head
  const hy = -46
  const hg = ctx.createRadialGradient(-4, hy - 4, 0, 0, hy, 17)
  hg.addColorStop(0, skin); hg.addColorStop(1, skinDark)
  ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, hy, 16, 0, Math.PI * 2); ctx.fill()
  // Long beard
  ctx.fillStyle = '#cfe0c4'
  ctx.beginPath(); ctx.moveTo(-12, hy + 6); ctx.quadraticCurveTo(-10, hy + 34, 0, hy + 42); ctx.quadraticCurveTo(10, hy + 34, 12, hy + 6); ctx.quadraticCurveTo(0, hy + 16, -12, hy + 6); ctx.closePath(); ctx.fill()
  // Glowing eyes
  ctx.fillStyle = '#7fffe0'; ctx.shadowColor = '#7fffe0'; ctx.shadowBlur = 7
  ctx.beginPath(); ctx.ellipse(-6, hy - 1, 2.6, 1.7, 0, 0, Math.PI * 2); ctx.ellipse(6, hy - 1, 2.6, 1.7, 0, 0, Math.PI * 2); ctx.fill()
  ctx.shadowBlur = 0

  // Antlers
  ctx.strokeStyle = '#c8bd9c'; ctx.lineWidth = 4; ctx.lineJoin = 'round'
  const antler = (dir: number) => {
    ctx.beginPath()
    ctx.moveTo(dir * 6, hy - 12); ctx.quadraticCurveTo(dir * 24, hy - 26, dir * 21, hy - 46)
    ctx.moveTo(dir * 15, hy - 26); ctx.lineTo(dir * 31, hy - 30)
    ctx.moveTo(dir * 19, hy - 36); ctx.lineTo(dir * 35, hy - 41)
    ctx.moveTo(dir * 21, hy - 46); ctx.lineTo(dir * 29, hy - 56)
    ctx.stroke()
  }
  antler(-1); antler(1)

  ctx.restore()
}
