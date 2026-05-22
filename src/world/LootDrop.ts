import Phaser from 'phaser'
import { Item, RARITY_COLOR, RARITY_HEX } from '../items/ItemTypes'

const PICKUP_RADIUS = 44
const DESPAWN_MS    = 55_000

export class LootDrop {
  readonly x:    number
  readonly y:    number
  readonly item: Item | undefined
  readonly gold: number | undefined
  active = true

  private container: Phaser.GameObjects.Container
  private gfx:       Phaser.GameObjects.Graphics
  private label:     Phaser.GameObjects.Text

  constructor(scene: Phaser.Scene, x: number, y: number, item?: Item, gold?: number) {
    this.x    = x
    this.y    = y
    this.item = item
    this.gold = gold

    this.gfx = scene.add.graphics()
    const isGold  = gold !== undefined
    const color   = isGold ? '#ffdd00' : RARITY_COLOR[item!.rarity]
    const abbrev  = isGold ? `${gold}g` : `${item!.type[0].toUpperCase()} ${item!.name.slice(0, 12)}`

    this.label = scene.add.text(0, -14, abbrev, {
      fontSize:        '9px',
      fontFamily:      'monospace',
      color,
      stroke:          '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 1)

    this.container = scene.add.container(x, y - 3, [this.gfx, this.label]).setDepth(3)

    this.drawOrb()

    // Spawn pop-in animation
    this.container.setScale(0)
    scene.tweens.add({
      targets: this.container, scaleX: 1.3, scaleY: 1.3,
      duration: 110, ease: 'Back.Out',
      onComplete: () => {
        scene.tweens.add({
          targets: this.container, scaleX: 1, scaleY: 1,
          duration: 90, ease: 'Power2',
        })
      },
    })

    // Burst particles for rare/epic items
    if (item && (item.rarity === 'rare' || item.rarity === 'epic')) {
      const burst = scene.add.particles(x, y, 'particle', {
        speed:     { min: 60, max: item.rarity === 'epic' ? 200 : 130 },
        scale:     { start: item.rarity === 'epic' ? 0.9 : 0.65, end: 0 },
        alpha:     { start: 0.95, end: 0 },
        lifespan:  item.rarity === 'epic' ? 550 : 400,
        tint:      [RARITY_HEX[item.rarity]],
        angle:     { min: 0, max: 360 },
        blendMode: 'ADD',
        emitting:  false,
      }).setDepth(4)
      burst.explode(item.rarity === 'epic' ? 20 : 10)
      scene.time.delayedCall(700, () => { if (burst.active) burst.destroy() })
    }

    // Gold coin sparkle
    if (gold !== undefined && gold >= 10) {
      const coinBurst = scene.add.particles(x, y, 'particle', {
        speed:     { min: 30, max: 80 },
        scale:     { start: 0.5, end: 0 },
        alpha:     { start: 0.85, end: 0 },
        lifespan:  280,
        tint:      [0xffdd00, 0xffbb00, 0xffffff],
        angle:     { min: 0, max: 360 },
        blendMode: 'ADD',
        emitting:  false,
      }).setDepth(4)
      coinBurst.explode(gold >= 30 ? 10 : 5)
      scene.time.delayedCall(400, () => { if (coinBurst.active) coinBurst.destroy() })
    }

    // Bob animation
    scene.tweens.add({
      targets: this.container, y: y + 3,
      duration: 850, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    })

    // Fade-out warning before despawn, then destroy
    scene.time.delayedCall(DESPAWN_MS - 3000, () => {
      if (!this.active) return
      scene.tweens.add({
        targets: this.container, alpha: 0, duration: 3000,
        onComplete: () => this.destroy(),
      })
    })
  }

  get pickupRadius() { return PICKUP_RADIUS }

  private drawOrb() {
    const g = this.gfx
    g.clear()

    if (this.gold !== undefined) {
      g.fillStyle(0xffcc00)
      g.fillCircle(0, 0, 7)
      g.fillStyle(0xffee88, 0.55)
      g.fillCircle(-2, -2, 3)
    } else {
      const item  = this.item!
      const c     = RARITY_HEX[item.rarity]
      const r     = item.rarity === 'epic' ? 10 : item.rarity === 'rare' ? 9 : 8

      // Glow ring (rarity aura)
      g.lineStyle(2, c, 0.45)
      g.strokeCircle(0, 0, r + 5)
      // Main orb
      g.fillStyle(c, 0.95)
      g.fillCircle(0, 0, r)
      // Glint
      g.fillStyle(0xffffff, 0.40)
      g.fillCircle(-Math.round(r * 0.3), -Math.round(r * 0.3), Math.round(r * 0.35))
    }
  }

  destroy() {
    if (!this.active) return
    this.active = false
    this.container.destroy(true)
  }
}
