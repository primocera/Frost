/**
 * Camera that follows a world-space target and converts world<->screen coords.
 * Replaces Phaser's scene camera + `startFollow`.
 */
export class Camera {
  /** World-space point the camera is centred on. */
  x = 0
  y = 0

  /** Viewport size in CSS pixels (updated on resize). */
  viewW = 0
  viewH = 0

  /** Optional world bounds to clamp the camera within. null = unbounded. */
  bounds: { x: number; y: number; w: number; h: number } | null = null

  setViewport(w: number, h: number) { this.viewW = w; this.viewH = h }

  /** Smoothly chase a target. `lerp` of 1 snaps instantly. */
  follow(tx: number, ty: number, lerp = 0.18) {
    this.x += (tx - this.x) * lerp
    this.y += (ty - this.y) * lerp
    this.clamp()
  }

  /** Snap directly to a target (e.g. on spawn / teleport). */
  snap(tx: number, ty: number) { this.x = tx; this.y = ty; this.clamp() }

  private clamp() {
    if (!this.bounds) return
    const b = this.bounds
    const halfW = this.viewW / 2
    const halfH = this.viewH / 2
    // If the world is smaller than the viewport, just centre it.
    if (b.w >= this.viewW) this.x = Math.min(b.x + b.w - halfW, Math.max(b.x + halfW, this.x))
    else this.x = b.x + b.w / 2
    if (b.h >= this.viewH) this.y = Math.min(b.y + b.h - halfH, Math.max(b.y + halfH, this.y))
    else this.y = b.y + b.h / 2
  }

  /** Top-left world coordinate currently visible. */
  get originX() { return this.x - this.viewW / 2 }
  get originY() { return this.y - this.viewH / 2 }

  screenToWorld(sx: number, sy: number) {
    return { x: sx + this.originX, y: sy + this.originY }
  }
}
