import Phaser from 'phaser'

const SPEED    = 480   // slightly slower than firebolt
const LIFETIME = 1800

export function spawnFrostbolt(
  scene:   Phaser.Scene,
  group:   Phaser.Physics.Arcade.Group,
  fromX:   number,
  fromY:   number,
  toX:     number,
  toY:     number,
  damage:  number,
): Phaser.Physics.Arcade.Sprite {
  const bolt  = group.create(fromX, fromY, 'firebolt') as Phaser.Physics.Arcade.Sprite
  bolt.setData('damage', damage)
  bolt.setData('isFrost', true)
  bolt.setTint(0x88ddff)
  bolt.setDepth(7)
  ;(bolt.body as Phaser.Physics.Arcade.Body).setCircle(7)

  const angle = Phaser.Math.Angle.Between(fromX, fromY, toX, toY)
  bolt.setVelocity(Math.cos(angle) * SPEED, Math.sin(angle) * SPEED)
  bolt.setRotation(angle)

  // Ice core trail
  const core = scene.add.particles(0, 0, 'particle', {
    follow:    bolt,
    frequency: 14,
    quantity:  2,
    lifespan:  120,
    speed:     { min: 5, max: 20 },
    scale:     { start: 0.65, end: 0 },
    alpha:     { start: 1, end: 0 },
    tint:      [0xffffff, 0xaaeeff],
    blendMode: 'ADD',
  }).setDepth(7)

  // Frost mist trail
  const mist = scene.add.particles(0, 0, 'particle', {
    follow:    bolt,
    frequency: 22,
    quantity:  3,
    lifespan:  260,
    speed:     { min: 15, max: 60 },
    scale:     { start: 0.85, end: 0 },
    alpha:     { start: 0.75, end: 0 },
    tint:      [0x44aaff, 0x22ccff, 0x88ddff],
    blendMode: 'ADD',
  }).setDepth(6)

  bolt.setData('trailCore', core)
  bolt.setData('trailFire', mist)

  scene.time.delayedCall(LIFETIME, () => destroyFrostbolt(bolt))
  return bolt
}

export function destroyFrostbolt(bolt: Phaser.Physics.Arcade.Sprite) {
  if (!bolt.active) return
  const core = bolt.getData('trailCore') as Phaser.GameObjects.Particles.ParticleEmitter | undefined
  const mist = bolt.getData('trailFire') as Phaser.GameObjects.Particles.ParticleEmitter | undefined
  for (const t of [core, mist]) {
    if (t?.active) {
      t.stop()
      bolt.scene.time.delayedCall(250, () => { if (t.active) t.destroy() })
    }
  }
  bolt.destroy()
}

/** Small ice ring at the player's feet when a frostbolt fires. */
export function spawnFrostCastEffect(scene: Phaser.Scene, x: number, y: number) {
  const ring = scene.add.graphics().setPosition(x, y).setDepth(8)
  ring.lineStyle(2, 0x44aaff, 1)
  ring.strokeCircle(0, 0, 10)
  scene.tweens.add({
    targets: ring, scaleX: 3.2, scaleY: 3.2, alpha: 0,
    duration: 200, ease: 'Power2Out',
    onComplete: () => ring.destroy(),
  })

  const sparks = scene.add.particles(x, y, 'particle', {
    speed:     { min: 50, max: 160 },
    scale:     { start: 0.55, end: 0 },
    alpha:     { start: 0.9, end: 0 },
    lifespan:  240,
    tint:      [0xaaeeff, 0x44ccff, 0xffffff],
    angle:     { min: 0, max: 360 },
    blendMode: 'ADD',
    emitting:  false,
  }).setDepth(8)
  sparks.explode(7)
  scene.time.delayedCall(320, () => { if (sparks.active) sparks.destroy() })
}

/** Icy burst at impact point. */
export function spawnFrostImpact(scene: Phaser.Scene, x: number, y: number) {
  const ring = scene.add.graphics().setPosition(x, y).setDepth(9)
  ring.lineStyle(3, 0x88ddff, 1)
  ring.strokeCircle(0, 0, 8)
  scene.tweens.add({
    targets: ring, scaleX: 4.5, scaleY: 4.5, alpha: 0,
    duration: 300, ease: 'Power2Out',
    onComplete: () => ring.destroy(),
  })

  const flash = scene.add.graphics().setPosition(x, y).setDepth(8)
  flash.fillStyle(0xaaffff, 0.6)
  flash.fillCircle(0, 0, 14)
  scene.tweens.add({
    targets: flash, scaleX: 0.2, scaleY: 0.2, alpha: 0,
    duration: 160, ease: 'Power3',
    onComplete: () => flash.destroy(),
  })

  const burst = scene.add.particles(x, y, 'particle', {
    speed:     { min: 60, max: 300 },
    scale:     { start: 0.9, end: 0 },
    alpha:     { start: 1, end: 0 },
    lifespan:  450,
    tint:      [0xffffff, 0x88eeff, 0x44aaff, 0x0066cc],
    angle:     { min: 0, max: 360 },
    blendMode: 'ADD',
    emitting:  false,
  }).setDepth(9)
  burst.explode(16)

  scene.time.delayedCall(600, () => { if (burst.active) burst.destroy() })
}
