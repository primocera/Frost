/**
 * Soft, feathered blob shadow shared by every entity + prop. The gradient is
 * baked once into a tiny offscreen canvas (a "decal") and stamped with drawImage
 * — far cheaper than building a radial gradient per entity per frame, so it
 * stays smooth on mobile with lots of shadows on screen.
 */
let decal: HTMLCanvasElement | null = null
function getDecal(): HTMLCanvasElement {
  if (decal) return decal
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(0,0,0,0.6)')
  grad.addColorStop(0.55, 'rgba(0,0,0,0.32)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.beginPath(); g.arc(32, 32, 32, 0, Math.PI * 2); g.fill()
  decal = c
  return c
}

/** Stamp a feathered elliptical shadow centred at (cx,cy) with the given radii. */
export function softShadow(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, alpha = 1) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.drawImage(getDecal(), cx - rx, cy - ry, rx * 2, ry * 2)
  ctx.restore()
}
