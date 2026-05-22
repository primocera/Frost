import Phaser from 'phaser'

export function castFrostNova(scene: Phaser.Scene, x: number, y: number, radius: number) {
  // Ice ground disc — flat circle that expands across the floor
  const disc = scene.add.graphics().setPosition(x, y).setDepth(5)
  disc.fillStyle(0x88ccff, 0.18)
  disc.fillCircle(0, 0, radius)
  disc.lineStyle(2, 0xaaeeff, 0.55)
  disc.strokeCircle(0, 0, radius * 0.9)
  scene.tweens.add({
    targets: disc, alpha: 0,
    duration: 600, delay: 80, ease: 'Power2',
    onComplete: () => disc.destroy(),
  })

  // Primary expanding ice ring
  const ring1 = scene.add.graphics().setPosition(x, y).setDepth(9)
  ring1.lineStyle(4, 0x66ddff, 1)
  ring1.strokeCircle(0, 0, 10)
  scene.tweens.add({
    targets: ring1, scaleX: radius / 10, scaleY: radius / 10, alpha: 0,
    duration: 440, ease: 'Power2Out',
    onComplete: () => ring1.destroy(),
  })

  // Secondary ring — thinner, icy white
  const ring2 = scene.add.graphics().setPosition(x, y).setDepth(8)
  ring2.lineStyle(2, 0xeeffff, 0.75)
  ring2.strokeCircle(0, 0, 10)
  scene.tweens.add({
    targets: ring2, scaleX: radius / 10 * 0.82, scaleY: radius / 10 * 0.82, alpha: 0,
    duration: 580, delay: 55, ease: 'Power2Out',
    onComplete: () => ring2.destroy(),
  })

  // Crystal shard burst — fly outward and fade
  const shards = scene.add.particles(x, y, 'particle', {
    speed:       { min: radius * 0.4, max: radius * 1.2 },
    scale:       { start: 0.65, end: 0 },
    alpha:       { start: 1, end: 0 },
    lifespan:    680,
    tint:        [0xffffff, 0xaaeeff, 0x55ccff, 0x88eeff],
    angle:       { min: 0, max: 360 },
    blendMode:   'ADD',
    emitting:    false,
  }).setDepth(9)
  shards.explode(34)

  // Fine sparkle on top
  const sparkle = scene.add.particles(x, y, 'particle', {
    speed:       { min: 20, max: 60 },
    scale:       { start: 0.35, end: 0 },
    alpha:       { start: 0.8, end: 0 },
    lifespan:    500,
    tint:        [0xffffff, 0xddffff],
    angle:       { min: 0, max: 360 },
    blendMode:   'ADD',
    emitting:    false,
  }).setDepth(10)
  sparkle.explode(18)

  scene.time.delayedCall(800, () => {
    if (shards.active) shards.destroy()
    if (sparkle.active) sparkle.destroy()
  })
}

/** Icy overlay on a frozen enemy — ring that pulses around them. */
export function applyFreezeVisual(
  scene: Phaser.Scene,
  enemy: Phaser.GameObjects.Components.Transform & { active: boolean },
  durationMs: number,
) {
  if (!enemy.active) return
  const r  = 14
  const fg = scene.add.graphics().setDepth(6)

  const draw = () => {
    if (!fg.active || !enemy.active) return
    fg.clear()
    fg.setPosition(enemy.x, enemy.y)
    fg.lineStyle(2, 0x88ddff, 0.65)
    fg.strokeCircle(0, 0, r)
    fg.lineStyle(1, 0xccffff, 0.35)
    fg.strokeCircle(0, 0, r * 0.65)
  }
  draw()

  const ticker = scene.time.addEvent({ delay: 80, loop: true, callback: draw })
  scene.time.delayedCall(durationMs, () => {
    ticker.destroy()
    scene.tweens.add({
      targets: fg, alpha: 0, duration: 250,
      onComplete: () => fg.destroy(),
    })
  })
}
