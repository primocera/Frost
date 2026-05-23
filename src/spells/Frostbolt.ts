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
  const bolt  = group.create(fromX, fromY, 'frostbolt') as Phaser.Physics.Arcade.Sprite
  bolt.setData('damage', damage)
  bolt.setData('isFrost', true)
  bolt.setDepth(7)
  bolt.setBlendMode(Phaser.BlendModes.ADD)
  // frostbolt texture is 22×22 — centre the 7px collision circle
  ;(bolt.body as Phaser.Physics.Arcade.Body).setCircle(7, 4, 4)

  const angle = Phaser.Math.Angle.Between(fromX, fromY, toX, toY)
  bolt.setVelocity(Math.cos(angle) * SPEED, Math.sin(angle) * SPEED)

  // Slowly spin the ice crystal + breathe its scale for a living frost look
  scene.tweens.add({ targets: bolt, angle: 360, duration: 760, repeat: -1 })
  scene.tweens.add({
    targets: bolt, scale: { from: 0.9, to: 1.15 },
    duration: 240, yoyo: true, repeat: -1, ease: 'Sine.InOut',
  })

  // Bright frozen core trail
  const core = scene.add.particles(0, 0, 'particle', {
    follow:    bolt,
    frequency: 10,
    quantity:  2,
    lifespan:  160,
    speed:     { min: 5, max: 24 },
    scale:     { start: 0.7, end: 0 },
    alpha:     { start: 1, end: 0 },
    tint:      [0xffffff, 0xcceeff, 0x99e6ff],
    blendMode: 'ADD',
  }).setDepth(7)

  // Billowing frost mist
  const mist = scene.add.particles(0, 0, 'particle', {
    follow:    bolt,
    frequency: 18,
    quantity:  3,
    lifespan:  340,
    speed:     { min: 10, max: 58 },
    scale:     { start: 1.05, end: 0 },
    alpha:     { start: 0.6, end: 0 },
    tint:      [0x2288ee, 0x55bbff, 0x88ddff],
    blendMode: 'ADD',
  }).setDepth(6)

  // Drifting ice shards — rotating snowflake flecks shed along the path
  const shards = scene.add.particles(0, 0, 'snowflake', {
    follow:    bolt,
    frequency: 32,
    quantity:  1,
    lifespan:  500,
    speed:     { min: 20, max: 72 },
    scale:     { start: 0.95, end: 0.1 },
    alpha:     { start: 0.95, end: 0 },
    rotate:    { min: 0, max: 360 },
    tint:      [0xddf6ff, 0xaae6ff],
  }).setDepth(6)

  bolt.setData('trailCore', core)
  bolt.setData('trailFire', mist)
  bolt.setData('trailShards', shards)

  // Clean up emitters no matter HOW the bolt dies (wall, world bounds, zone boundary, etc.)
  bolt.once(Phaser.GameObjects.Events.DESTROY, () => {
    if ((bolt.scene as Phaser.Scene | null)?.tweens) bolt.scene.tweens.killTweensOf(bolt)
    for (const t of [core, mist, shards]) {
      if (t?.active) t.destroy()
    }
  })

  scene.time.delayedCall(LIFETIME, () => destroyFrostbolt(bolt))
  return bolt
}

export function destroyFrostbolt(bolt: Phaser.Physics.Arcade.Sprite) {
  if (!bolt.active) return
  bolt.destroy()   // DESTROY listener handles emitter + tween cleanup
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

  // Crystalline ice shards spraying out and tumbling — the frozen "shatter"
  const shards = scene.add.particles(x, y, 'snowflake', {
    speed:     { min: 90, max: 340 },
    scale:     { start: 1.3, end: 0.1 },
    alpha:     { start: 1, end: 0 },
    lifespan:  520,
    rotate:    { min: 0, max: 360 },
    gravityY:  140,
    tint:      [0xffffff, 0xcceeff, 0x88ddff],
    angle:     { min: 0, max: 360 },
    emitting:  false,
  }).setDepth(9)
  shards.explode(12)

  scene.time.delayedCall(700, () => {
    if (burst.active)  burst.destroy()
    if (shards.active) shards.destroy()
  })
}
