import Phaser from 'phaser'
import Balance from '../config/Balance'

/**
 * Spawns a Blizzard zone at (x, y).
 * onTick is called every tickMs for the duration — apply damage/slow there.
 */
export function spawnBlizzard(
  scene:  Phaser.Scene,
  x:      number,
  y:      number,
  onTick: (cx: number, cy: number) => void,
) {
  const { radius, tickMs, durationMs } = Balance.spells.blizzard

  // Persistent zone indicator: semi-transparent icy circle
  const zone = scene.add.graphics().setPosition(x, y).setDepth(5)
  zone.fillStyle(0x0055aa, 0.18)
  zone.fillCircle(0, 0, radius)
  zone.lineStyle(2, 0x44aaff, 0.55)
  zone.strokeCircle(0, 0, radius)

  // Soft inner glow ring — pulses
  const glow = scene.add.graphics().setPosition(x, y).setDepth(5)
  glow.lineStyle(8, 0x88ddff, 0.15)
  glow.strokeCircle(0, 0, radius * 0.65)

  // Continuous ambient snow falling inside the zone
  const snow = scene.add.particles(x, y, 'particle', {
    x:         { min: -radius * 0.9, max: radius * 0.9 },
    y:         { min: -radius * 0.5, max: radius * 0.5 },
    speedY:    { min: 30, max: 80 },
    speedX:    { min: -18, max: 18 },
    scale:     { start: 0.55, end: 0 },
    alpha:     { start: 0.7, end: 0 },
    lifespan:  900,
    blendMode: 'ADD',
    tint:      [0x88ddff, 0xaaeeff, 0xffffff],
    frequency: 70,
    quantity:  2,
  }).setDepth(6)

  // Tick: damage + per-tick particle burst
  const ticker = scene.time.addEvent({
    delay:    tickMs,
    loop:     true,
    callback: () => {
      onTick(x, y)

      // Small icy impact burst each tick — conveys active damage
      const burst = scene.add.particles(x, y, 'particle', {
        x:         { min: -radius, max: radius },
        y:         { min: -radius, max: radius },
        speed:     { min: 25, max: 110 },
        scale:     { start: 0.8, end: 0 },
        alpha:     { start: 1, end: 0 },
        lifespan:  360,
        blendMode: 'ADD',
        tint:      [0x44aaff, 0x88ddff, 0xffffff],
        angle:     { min: 0, max: 360 },
        emitting:  false,
      }).setDepth(7)
      burst.explode(10)
      scene.time.delayedCall(420, () => { if (burst.active) burst.destroy() })
    },
  })

  // Fade and cleanup after duration
  scene.time.delayedCall(durationMs, () => {
    ticker.destroy()
    snow.stop()

    scene.tweens.add({
      targets:  [zone, glow],
      alpha:    0,
      duration: 500,
      onComplete: () => { zone.destroy(); glow.destroy() },
    })

    scene.time.delayedCall(900, () => { if (snow.active) snow.destroy() })
  })
}
