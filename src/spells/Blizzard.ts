import Phaser from 'phaser'
import Balance from '../config/Balance'

export function spawnBlizzard(
  scene:  Phaser.Scene,
  x:      number,
  y:      number,
  onTick: (cx: number, cy: number) => void,
) {
  const { radius, tickMs, durationMs } = Balance.spells.blizzard

  // Zone ground indicator: icy ring with subtle fill
  const zone = scene.add.graphics().setPosition(x, y).setDepth(5)
  zone.fillStyle(0x0044aa, 0.12)
  zone.fillCircle(0, 0, radius)
  zone.lineStyle(2, 0x66aaff, 0.55)
  zone.strokeCircle(0, 0, radius)
  zone.lineStyle(1, 0xaaddff, 0.25)
  zone.strokeCircle(0, 0, radius * 0.5)

  // Pulsing outer ring
  const pulse = scene.add.graphics().setPosition(x, y).setDepth(5)
  pulse.lineStyle(3, 0x88ccff, 0.2)
  pulse.strokeCircle(0, 0, radius * 0.85)
  scene.tweens.add({
    targets: pulse, alpha: 0.05,
    duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut',
  })

  // Continuous snow/ice falling inside the zone
  const snow = scene.add.particles(x, y, 'particle', {
    x:         { min: -radius * 0.9, max: radius * 0.9 },
    y:         { min: -radius * 0.6, max: radius * 0.4 },
    speedY:    { min: 25, max: 75 },
    speedX:    { min: -22, max: 22 },
    scale:     { start: 0.45, end: 0 },
    alpha:     { start: 0.75, end: 0 },
    lifespan:  950,
    tint:      [0xffffff, 0xaadeee, 0x88ccff],
    frequency: 60,
    quantity:  3,
    blendMode: 'ADD',
  }).setDepth(6)

  // Ambient icy motes that swirl slowly
  const motes = scene.add.particles(x, y, 'particle', {
    x:         { min: -radius * 0.7, max: radius * 0.7 },
    y:         { min: -radius * 0.7, max: radius * 0.7 },
    speedY:    { min: -15, max: -45 },
    speedX:    { min: -15, max: 15 },
    scale:     { start: 0.3, end: 0 },
    alpha:     { start: 0.5, end: 0 },
    lifespan:  1200,
    tint:      [0xeeffff, 0xffffff],
    frequency: 120,
    quantity:  2,
    blendMode: 'ADD',
  }).setDepth(6)

  const ticker = scene.time.addEvent({
    delay:    tickMs,
    loop:     true,
    callback: () => {
      onTick(x, y)

      // Impact burst each tick — conveys active damage
      const burst = scene.add.particles(x, y, 'particle', {
        x:         { min: -radius * 0.85, max: radius * 0.85 },
        y:         { min: -radius * 0.85, max: radius * 0.85 },
        speed:     { min: 20, max: 100 },
        scale:     { start: 0.7, end: 0 },
        alpha:     { start: 0.9, end: 0 },
        lifespan:  380,
        tint:      [0xffffff, 0x55aaff, 0x88ddff],
        angle:     { min: 0, max: 360 },
        blendMode: 'ADD',
        emitting:  false,
      }).setDepth(7)
      burst.explode(10)
      scene.time.delayedCall(450, () => { if (burst.active) burst.destroy() })

      // Small shockwave ring at center on each tick
      const tickRing = scene.add.graphics().setPosition(x, y).setDepth(8)
      tickRing.lineStyle(2, 0x88ddff, 0.8)
      tickRing.strokeCircle(0, 0, 14)
      scene.tweens.add({
        targets: tickRing, scaleX: radius / 14 * 0.5, scaleY: radius / 14 * 0.5, alpha: 0,
        duration: 300, ease: 'Power2Out',
        onComplete: () => tickRing.destroy(),
      })
    },
  })

  scene.time.delayedCall(durationMs, () => {
    ticker.destroy()
    snow.stop()
    motes.stop()
    pulse.destroy()

    scene.tweens.add({
      targets: zone, alpha: 0, duration: 500,
      onComplete: () => zone.destroy(),
    })
    scene.time.delayedCall(1000, () => {
      if (snow.active) snow.destroy()
      if (motes.active) motes.destroy()
    })
  })
}
