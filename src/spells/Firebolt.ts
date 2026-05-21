import Phaser from 'phaser'

const SPEED    = 540   // px/s — snappy but readable
const LIFETIME = 1800  // ms before auto-despawn

// ── Spawn ─────────────────────────────────────────────────────────────────────

export function spawnFirebolt(
  scene: Phaser.Scene,
  group: Phaser.Physics.Arcade.Group,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  damage: number,
) {
  const bolt = group.create(fromX, fromY, 'firebolt') as Phaser.Physics.Arcade.Sprite
  bolt.setData('damage', damage)
  bolt.setDepth(7)
  ;(bolt.body as Phaser.Physics.Arcade.Body).setCircle(7)

  const angle = Phaser.Math.Angle.Between(fromX, fromY, toX, toY)
  bolt.setVelocity(Math.cos(angle) * SPEED, Math.sin(angle) * SPEED)

  // Particle trail that follows the bolt
  const trail = scene.add.particles(0, 0, 'particle', {
    follow:    bolt,
    frequency: 20,           // emit every 20ms
    quantity:  2,
    lifespan:  160,
    speed:     { min: 15, max: 50 },
    scale:     { start: 0.8, end: 0 },
    alpha:     { start: 0.9, end: 0 },
    blendMode: 'ADD',
    tint:      [0xff8800, 0xff4400, 0xffcc00],
  }).setDepth(6)

  bolt.setData('trail', trail)

  scene.time.delayedCall(LIFETIME, () => destroyBolt(bolt))
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

/** Stops the trail and destroys the bolt. Safe to call multiple times. */
export function destroyBolt(bolt: Phaser.Physics.Arcade.Sprite) {
  if (!bolt.active) return
  const trail = bolt.getData('trail') as Phaser.GameObjects.Particles.ParticleEmitter | undefined
  if (trail?.active) {
    trail.stop()
    // Let in-flight particles finish before removing the emitter
    bolt.scene.time.delayedCall(200, () => { if (trail.active) trail.destroy() })
  }
  bolt.destroy()
}

// ── Effects ───────────────────────────────────────────────────────────────────

/** Expanding ring at the cast origin — confirms the spell fired. */
export function spawnCastEffect(scene: Phaser.Scene, x: number, y: number) {
  const g = scene.add.graphics().setPosition(x, y).setDepth(8)
  g.lineStyle(2, 0xff8800, 1)
  g.strokeCircle(0, 0, 8)
  scene.tweens.add({
    targets:  g,
    scaleX:   3.5, scaleY: 3.5,
    alpha:    0,
    duration: 220,
    ease:     'Power2Out',
    onComplete: () => g.destroy(),
  })
}

/** Particle burst at the impact point. */
export function spawnImpact(scene: Phaser.Scene, x: number, y: number) {
  const emitter = scene.add.particles(x, y, 'particle', {
    speed:     { min: 90, max: 280 },
    scale:     { start: 1.1, end: 0 },
    alpha:     { start: 1,   end: 0 },
    lifespan:  380,
    blendMode: 'ADD',
    tint:      [0xff8800, 0xffcc00, 0xff4400, 0xffffff],
    angle:     { min: 0, max: 360 },
    emitting:  false,
  }).setDepth(8)

  emitter.explode(16)
  scene.time.delayedCall(500, () => { if (emitter.active) emitter.destroy() })
}
