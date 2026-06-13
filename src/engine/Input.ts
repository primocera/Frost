/**
 * Keyboard + mouse input, decoupled from React and the game loop.
 *
 * Replaces Phaser's `input.keyboard` / pointer. The game loop reads the current
 * snapshot each frame via `getMove()` / `getPointer()`; nothing here mutates
 * game state directly.
 */
export interface MoveVector {
  x: number
  y: number
}

export class Input {
  private keys = new Set<string>()
  private pointerX = 0
  private pointerY = 0
  private pointerDownFlag = false
  /** Edge-triggered presses consumed once via `consumePressed()`. */
  private pressed = new Set<string>()
  private clicked = false

  constructor(private target: HTMLElement) {
    // Keyboard is global; pointer events bind to the canvas element.
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    target.addEventListener('mousemove', this.onMouseMove)
    target.addEventListener('mousedown', this.onMouseDown)
    target.addEventListener('mouseup', this.onMouseUp)
    target.addEventListener('contextmenu', this.onContextMenu)
    // Lose all held keys if the window blurs (prevents "stuck running").
    window.addEventListener('blur', this.clearAll)
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase()
    if (!this.keys.has(k)) this.pressed.add(k)
    this.keys.add(k)
  }
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()) }
  private onMouseMove = (e: MouseEvent) => { this.pointerX = e.clientX; this.pointerY = e.clientY }
  private onMouseDown = (e: MouseEvent) => { this.pointerDownFlag = true; if (e.button === 0) this.clicked = true }
  private onMouseUp = () => { this.pointerDownFlag = false }
  private onContextMenu = (e: MouseEvent) => e.preventDefault()
  private clearAll = () => { this.keys.clear(); this.pressed.clear() }

  /** WASD as a normalized-ish vector (caller normalizes diagonal). */
  getMove(): MoveVector {
    let x = 0, y = 0
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1
    if (this.keys.has('w') || this.keys.has('arrowup')) y -= 1
    if (this.keys.has('s') || this.keys.has('arrowdown')) y += 1
    return { x, y }
  }

  getPointer() { return { x: this.pointerX, y: this.pointerY, down: this.pointerDownFlag } }
  isDown(key: string) { return this.keys.has(key.toLowerCase()) }

  /** Returns true once per physical key press (edge-triggered). */
  consumePressed(key: string): boolean {
    const k = key.toLowerCase()
    if (this.pressed.has(k)) { this.pressed.delete(k); return true }
    return false
  }

  /** Returns true once per left-click. */
  consumeClick(): boolean {
    if (this.clicked) { this.clicked = false; return true }
    return false
  }

  /** Call at the very end of each frame to clear edge-triggered state. */
  endFrame() { this.pressed.clear() }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.target.removeEventListener('mousemove', this.onMouseMove)
    this.target.removeEventListener('mousedown', this.onMouseDown)
    this.target.removeEventListener('mouseup', this.onMouseUp)
    this.target.removeEventListener('contextmenu', this.onContextMenu)
    window.removeEventListener('blur', this.clearAll)
  }
}
