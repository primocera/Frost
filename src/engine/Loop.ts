/**
 * Fixed-timestep game loop with a render callback.
 *
 * The simulation advances in fixed steps (default 60 Hz) regardless of display
 * refresh rate — this keeps movement/physics deterministic, which matters once
 * the same sim runs on the PartyKit server (Phase 4). Rendering happens once per
 * animation frame with an interpolation factor `alpha` for smoothness.
 */
export class Loop {
  private raf = 0
  private last = 0
  private acc = 0
  private running = false

  /** Fixed simulation step, in seconds. */
  readonly step: number
  /** Guard against the "spiral of death" after a long pause/tab-switch. */
  private readonly maxFrame = 0.25

  constructor(
    private update: (dt: number) => void,
    private render: (alpha: number) => void,
    hz = 60,
  ) {
    this.step = 1 / hz
  }

  start() {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.tick)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  /** Drop accumulated time (e.g. after the tab was backgrounded) so the sim
   *  doesn't fast-forward a burst of catch-up ticks on return. */
  resetTiming() {
    this.last = performance.now()
    this.acc = 0
  }

  private tick = (now: number) => {
    if (!this.running) return
    let frame = (now - this.last) / 1000
    this.last = now
    if (frame > this.maxFrame) frame = this.maxFrame
    this.acc += frame

    while (this.acc >= this.step) {
      this.update(this.step)
      this.acc -= this.step
    }
    this.render(this.acc / this.step)
    this.raf = requestAnimationFrame(this.tick)
  }
}
