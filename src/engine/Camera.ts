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

  /** World-to-screen zoom. <1 shows more world (used to zoom out on mobile). */
  zoom = 1

  /** Optional world bounds to clamp the camera within. null = unbounded. */
  bounds: { x: number; y: number; w: number; h: number } | null = null

  // Screen-shake offset (raid juice).
  private shakeMs = 0
  private shakeAmp = 0
  private shakeX = 0
  private shakeY = 0
  shake(amp: number, ms = 450) { this.shakeAmp = Math.max(this.shakeAmp, amp); this.shakeMs = Math.max(this.shakeMs, ms) }
  tickShake(dt: number) {
    if (this.shakeMs <= 0) { this.shakeX = this.shakeY = 0; return }
    this.shakeMs -= dt * 1000
    const a = this.shakeAmp * Math.max(0, this.shakeMs / 450)
    this.shakeX = (Math.random() - 0.5) * 2 * a
    this.shakeY = (Math.random() - 0.5) * 2 * a
    if (this.shakeMs <= 0) { this.shakeAmp = this.shakeX = this.shakeY = 0 }
  }

  setViewport(w: number, h: number) { this.viewW = w; this.viewH = h }

  /** Visible world span (CSS viewport divided by zoom). */
  get visW() { return this.viewW / this.zoom }
  get visH() { return this.viewH / this.zoom }

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
    const halfW = this.visW / 2
    const halfH = this.visH / 2
    // If the world is smaller than the viewport, just centre it.
    if (b.w >= this.visW) this.x = Math.min(b.x + b.w - halfW, Math.max(b.x + halfW, this.x))
    else this.x = b.x + b.w / 2
    if (b.h >= this.visH) this.y = Math.min(b.y + b.h - halfH, Math.max(b.y + halfH, this.y))
    else this.y = b.y + b.h / 2
  }

  /** Top-left world coordinate currently visible. */
  get originX() { return this.x - this.visW / 2 + this.shakeX }
  get originY() { return this.y - this.visH / 2 + this.shakeY }

  screenToWorld(sx: number, sy: number) {
    return { x: this.originX + sx / this.zoom, y: this.originY + sy / this.zoom }
  }
}
