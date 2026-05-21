import Phaser from 'phaser'

/** Visual effect only — GameScene applies damage. */
export function castArcaneExplosion(scene: Phaser.Scene, x: number, y: number, radius: number) {
  // Outer shockwave ring expands to the full damage radius
  const ring = scene.add.graphics().setPosition(x, y).setDepth(8)
  ring.lineStyle(3, 0xcc44ff, 1)
  ring.strokeCircle(0, 0, 12)
  scene.tweens.add({
    targets: ring, scaleX: radius / 12, scaleY: radius / 12, alpha: 0,
    duration: 360, ease: 'Power1Out',
    onComplete: () => ring.destroy(),
  })

  // Inner purple flash — short-lived disc to sell the burst
  const flash = scene.add.graphics().setPosition(x, y).setDepth(7)
  flash.fillStyle(0x8800cc, 0.22)
  flash.fillCircle(0, 0, radius)
  scene.tweens.add({
    targets: flash, alpha: 0,
    duration: 280, ease: 'Power2',
    onComplete: () => flash.destroy(),
  })

  // Secondary inner ring (slightly delayed, brighter)
  const ring2 = scene.add.graphics().setPosition(x, y).setDepth(8)
  ring2.lineStyle(2, 0xff88ff, 0.9)
  ring2.strokeCircle(0, 0, radius * 0.5)
  scene.tweens.add({
    targets: ring2, scaleX: 2, scaleY: 2, alpha: 0,
    duration: 280, delay: 40, ease: 'Power2Out',
    onComplete: () => ring2.destroy(),
  })

  // Particle burst
  const emitter = scene.add.particles(x, y, 'particle', {
    speed:     { min: 80, max: radius * 1.3 },
    scale:     { start: 1.2, end: 0 },
    alpha:     { start: 1, end: 0 },
    lifespan:  440,
    blendMode: 'ADD',
    tint:      [0xcc44ff, 0x9900ff, 0xff88ff, 0xffffff],
    angle:     { min: 0, max: 360 },
    emitting:  false,
  }).setDepth(8)
  emitter.explode(24)
  scene.time.delayedCall(520, () => { if (emitter.active) emitter.destroy() })
}
