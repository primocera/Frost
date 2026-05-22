import Phaser from 'phaser'

export function castArcaneExplosion(scene: Phaser.Scene, x: number, y: number, radius: number) {
  // Ground rune — brief arcane circle that flashes before the burst
  const rune = scene.add.graphics().setPosition(x, y).setDepth(6)
  drawRuneCircle(rune, radius)
  scene.tweens.add({
    targets: rune, alpha: 0,
    duration: 320, delay: 30, ease: 'Power2',
    onComplete: () => rune.destroy(),
  })

  // Primary shockwave ring
  const ring1 = scene.add.graphics().setPosition(x, y).setDepth(9)
  ring1.lineStyle(4, 0xdd55ff, 1)
  ring1.strokeCircle(0, 0, 12)
  scene.tweens.add({
    targets: ring1, scaleX: radius / 12, scaleY: radius / 12, alpha: 0,
    duration: 340, ease: 'Power2Out',
    onComplete: () => ring1.destroy(),
  })

  // Secondary ring — brighter, slightly slower
  const ring2 = scene.add.graphics().setPosition(x, y).setDepth(8)
  ring2.lineStyle(2, 0xff88ff, 0.85)
  ring2.strokeCircle(0, 0, 12)
  scene.tweens.add({
    targets: ring2, scaleX: radius / 12 * 0.70, scaleY: radius / 12 * 0.70, alpha: 0,
    duration: 420, delay: 40, ease: 'Power1Out',
    onComplete: () => ring2.destroy(),
  })

  // Inner flash fill
  const flash = scene.add.graphics().setPosition(x, y).setDepth(7)
  flash.fillStyle(0xaa00ff, 0.25)
  flash.fillCircle(0, 0, radius)
  scene.tweens.add({
    targets: flash, alpha: 0,
    duration: 300, ease: 'Power3',
    onComplete: () => flash.destroy(),
  })

  // Main burst
  const burst = scene.add.particles(x, y, 'particle', {
    speed:     { min: 60, max: radius * 1.4 },
    scale:     { start: 1.1, end: 0 },
    alpha:     { start: 1, end: 0 },
    lifespan:  460,
    tint:      [0xff88ff, 0xcc44ff, 0x9900ff, 0xffffff],
    angle:     { min: 0, max: 360 },
    blendMode: 'ADD',
    emitting:  false,
  }).setDepth(9)
  burst.explode(28)

  // Arcane sparks — thin streaks from center
  const sparks = scene.add.particles(x, y, 'particle', {
    speed:     { min: radius * 0.3, max: radius * 0.9 },
    scale:     { start: 0.45, end: 0 },
    alpha:     { start: 0.9, end: 0 },
    lifespan:  360,
    tint:      [0xffffff, 0xddaaff],
    angle:     { min: 0, max: 360 },
    blendMode: 'ADD',
    emitting:  false,
  }).setDepth(10)
  sparks.explode(20)

  scene.time.delayedCall(600, () => {
    if (burst.active) burst.destroy()
    if (sparks.active) sparks.destroy()
  })
}

/** Draws a simple arcane rune circle — two concentric rings plus 6 tick marks. */
function drawRuneCircle(g: Phaser.GameObjects.Graphics, radius: number) {
  g.lineStyle(2, 0xcc44ff, 0.7)
  g.strokeCircle(0, 0, radius)
  g.lineStyle(1, 0xaa22dd, 0.45)
  g.strokeCircle(0, 0, radius * 0.65)

  // Tick marks at 6 cardinal+diagonal points
  const ticks = 6
  for (let i = 0; i < ticks; i++) {
    const a  = (i / ticks) * Math.PI * 2
    const r1 = radius * 0.55, r2 = radius * 0.78
    g.lineStyle(1.5, 0xdd88ff, 0.6)
    g.beginPath()
    g.moveTo(Math.cos(a) * r1, Math.sin(a) * r1)
    g.lineTo(Math.cos(a) * r2, Math.sin(a) * r2)
    g.strokePath()
  }
}
