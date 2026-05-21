import Phaser from 'phaser'

/** Visual effect only — GameScene applies freeze to enemies. */
export function castFrostNova(scene: Phaser.Scene, x: number, y: number, radius: number) {
  // Expanding ice ring out to the freeze radius
  const ring = scene.add.graphics().setPosition(x, y).setDepth(8)
  ring.lineStyle(4, 0x88ddff, 1)
  ring.strokeCircle(0, 0, 10)
  scene.tweens.add({
    targets: ring, scaleX: radius / 10, scaleY: radius / 10, alpha: 0,
    duration: 480, ease: 'Power2Out',
    onComplete: () => ring.destroy(),
  })

  // Second ring — thinner, slightly slower
  const ring2 = scene.add.graphics().setPosition(x, y).setDepth(7)
  ring2.lineStyle(2, 0xaaeeff, 0.7)
  ring2.strokeCircle(0, 0, 10)
  scene.tweens.add({
    targets: ring2, scaleX: radius / 10 * 0.85, scaleY: radius / 10 * 0.85, alpha: 0,
    duration: 600, delay: 60, ease: 'Power2Out',
    onComplete: () => ring2.destroy(),
  })

  // Flash fill — icy dome
  const fill = scene.add.graphics().setPosition(x, y).setDepth(6)
  fill.fillStyle(0x44aadd, 0.28)
  fill.fillCircle(0, 0, radius)
  scene.tweens.add({
    targets: fill, alpha: 0,
    duration: 400, ease: 'Power2',
    onComplete: () => fill.destroy(),
  })

  // Ice crystal burst
  const emitter = scene.add.particles(x, y, 'particle', {
    speed:     { min: 60, max: radius * 1.1 },
    scale:     { start: 0.9, end: 0 },
    alpha:     { start: 1, end: 0 },
    lifespan:  650,
    blendMode: 'ADD',
    tint:      [0x88ddff, 0xaaeeff, 0xffffff, 0x44aadd],
    angle:     { min: 0, max: 360 },
    emitting:  false,
  }).setDepth(8)
  emitter.explode(32)
  scene.time.delayedCall(750, () => { if (emitter.active) emitter.destroy() })
}
