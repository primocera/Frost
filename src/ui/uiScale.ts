import Phaser from 'phaser'

/**
 * Wraps screen-space (scrollFactor=0) UI objects in a container that
 * counteracts the main camera's zoom.
 *
 * Phaser applies camera zoom from the viewport CENTRE, so a scrollFactor=0
 * object drawn at game coord G renders at screen = SW/2 + (G - SW/2) * Z.
 * On mobile we zoom the world to 1.6, which pushes edge-anchored HUD bars
 * and panels off-screen.
 *
 * Setting this container's scale to 1/Z and its position to (SW/2)(1 - 1/Z)
 * makes a child placed at local coord L appear at screen pixel L — so every
 * piece of UI authored in plain screen pixels "just works" at any zoom, and
 * pointer hit-tests against those same screen pixels stay correct.
 */
export class UIScaler {
  readonly container: Phaser.GameObjects.Container

  constructor(private scene: Phaser.Scene, depth: number) {
    this.container = scene.add.container(0, 0).setScrollFactor(0).setDepth(depth)
    this.relayout()
    scene.scale.on('resize', this.relayout, this)
  }

  add(obj: Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[]) {
    this.container.add(obj as Phaser.GameObjects.GameObject)
  }

  /** Recompute the counter-zoom transform. Call after the camera zoom changes. */
  relayout() {
    const z  = this.scene.cameras.main.zoom || 1
    const sw = this.scene.scale.width
    const sh = this.scene.scale.height
    this.container.setScale(1 / z)
    this.container.setPosition((sw / 2) * (1 - 1 / z), (sh / 2) * (1 - 1 / z))
  }
}
