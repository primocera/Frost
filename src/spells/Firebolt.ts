import Phaser from 'phaser'

const SPEED    = 540
const LIFETIME = 1800

export function spawnFirebolt(
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
  bolt.setDepth(7)
  ;(bolt.body as Phaser.Physics.Arcade.Body).setCircle(7)

  const angle = Phaser.Math.Angle.Between(fromX, fromY, toX, toY)
  bolt.setVelocity(Math.cos(angle) * SPEED, Math.sin(angle) * SPEED)
  bolt.setRotation(angle)

  // Core trail — tight and bright
  const core = scene.add.particles(0, 0, 'particle', {
    follow:    bolt,
    frequency: 14,
    quantity:  2,
    lifespan:  100,
    speed:     { min: 5, max: 20 },
    scale:     { start: 0.7, end: 0 },
    alpha:     { start: 1, end: 0 },
    tint:      [0xffffff, 0xffee88],
    blendMode: 'ADD',
  }).setDepth(7)

  // Outer fire trail — wider, orange/red
  const fire = scene.add.particles(0, 0, 'particle', {
    follow:    bolt,
    frequency: 20,
    quantity:  3,
    lifespan:  200,
    speed:     { min: 20, max: 70 },
    scale:     { start: 0.9, end: 0 },
    alpha:     { start: 0.85, end: 0 },
    tint:      [0xff6600, 0xff3300, 0xffaa00],
    blendMode: 'ADD',
  }).setDepth(6)

  bolt.setData('trailCore', core)
  bolt.setData('trailFire', fire)

  scene.time.delayedCall(LIFETIME, () => destroyBolt(bolt))
  return bolt
}

export function destroyBolt(bolt: Phaser.Physics.Arcade.Sprite) {
  if (!bolt.active) return
  const core = bolt.getData('trailCore') as Phaser.GameObjects.Particles.ParticleEmitter | undefined
  const fire = bolt.getData('trailFire') as Phaser.GameObjects.Particles.ParticleEmitter | undefined
  for (const t of [core, fire]) {
    if (t?.active) {
      t.stop()
      bolt.scene.time.delayedCall(250, () => { if (t.active) t.destroy() })
    }
  }
  bolt.destroy()
}

/** Small ring at the player's feet when a bolt fires. */
export function spawnCastEffect(scene: Phaser.Scene, x: number, y: number) {
  // Ring expands outward
  const ring = scene.add.graphics().setPosition(x, y).setDepth(8)
  ring.lineStyle(2, 0xff8800, 1)
  ring.strokeCircle(0, 0, 10)
  scene.tweens.add({
    targets: ring, scaleX: 3.2, scaleY: 3.2, alpha: 0,
    duration: 200, ease: 'Power2Out',
    onComplete: () => ring.destroy(),
  })

  // Ember particles outward from cast origin
  const sparks = scene.add.particles(x, y, 'particle', {
    speed:     { min: 60, max: 180 },
    scale:     { start: 0.65, end: 0 },
    alpha:     { start: 0.9, end: 0 },
    lifespan:  240,
    tint:      [0xff9900, 0xffcc00, 0xffffff],
    angle:     { min: 0, max: 360 },
    blendMode: 'ADD',
    emitting:  false,
  }).setDepth(8)
  sparks.explode(8)
  scene.time.delayedCall(320, () => { if (sparks.active) sparks.destroy() })
}

/** Big fiery burst at impact — scaled to a hit-stop weight. */
export function spawnImpact(scene: Phaser.Scene, x: number, y: number) {
  // Shockwave ring
  const ring = scene.add.graphics().setPosition(x, y).setDepth(9)
  ring.lineStyle(3, 0xffaa22, 1)
  ring.strokeCircle(0, 0, 8)
  scene.tweens.add({
    targets: ring, scaleX: 4.5, scaleY: 4.5, alpha: 0,
    duration: 260, ease: 'Power2Out',
    onComplete: () => ring.destroy(),
  })

  // Flash core
  const flash = scene.add.graphics().setPosition(x, y).setDepth(8)
  flash.fillStyle(0xffffff, 0.7)
  flash.fillCircle(0, 0, 14)
  scene.tweens.add({
    targets: flash, scaleX: 0.2, scaleY: 0.2, alpha: 0,
    duration: 140, ease: 'Power3',
    onComplete: () => flash.destroy(),
  })

  // Particle burst
  const burst = scene.add.particles(x, y, 'particle', {
    speed:     { min: 80, max: 340 },
    scale:     { start: 1.0, end: 0 },
    alpha:     { start: 1, end: 0 },
    lifespan:  400,
    tint:      [0xffffff, 0xffcc44, 0xff8800, 0xff4400],
    angle:     { min: 0, max: 360 },
    blendMode: 'ADD',
    emitting:  false,
  }).setDepth(9)
  burst.explode(18)

  // Embers that linger
  const embers = scene.add.particles(x, y, 'particle', {
    speed:     { min: 10, max: 50 },
    scale:     { start: 0.5, end: 0 },
    alpha:     { start: 0.7, end: 0 },
    lifespan:  700,
    tint:      [0xff6600, 0xff3300],
    angle:     { min: 0, max: 360 },
    blendMode: 'ADD',
    emitting:  false,
  }).setDepth(8)
  embers.explode(10)

  scene.time.delayedCall(800, () => {
    if (burst.active) burst.destroy()
    if (embers.active) embers.destroy()
  })
}
