import Phaser from 'phaser'

type MageState = 'idle' | 'walk' | 'cast' | 'hurt' | 'dead'

/**
 * Visual-only companion for the Player physics body.
 * Renders the animated mage sprite and manages state transitions.
 * The Player's physics body is invisible; this provides all visuals.
 */
export class PlayerSprite {
  private body:       Phaser.GameObjects.Sprite
  private castGlow:   Phaser.GameObjects.Graphics
  private state:      MageState = 'idle'
  private castTimer   = 0
  private hurtTimer   = 0
  private facingRight = true

  constructor(scene: Phaser.Scene) {
    this.body = scene.add.sprite(0, 0, 'mage_sheet', 0)
      .setDepth(5)
      .setOrigin(0.5, 0.78)   // feet align with physics body center

    this.castGlow = scene.add.graphics()
      .setDepth(4)
      .setBlendMode(Phaser.BlendModes.ADD)

    if (!scene.anims.exists('mage_idle')) {
      scene.anims.create({
        key: 'mage_idle',
        frames: scene.anims.generateFrameNumbers('mage_sheet', { start: 0, end: 3 }),
        frameRate: 4, repeat: -1,
      })
      scene.anims.create({
        key: 'mage_walk',
        frames: scene.anims.generateFrameNumbers('mage_sheet', { start: 4, end: 7 }),
        frameRate: 9, repeat: -1,
      })
      scene.anims.create({
        key: 'mage_cast',
        frames: scene.anims.generateFrameNumbers('mage_sheet', { start: 8, end: 10 }),
        frameRate: 11, repeat: 0,
      })
    }

    this.body.play('mage_idle')
  }

  playCast() {
    this.castTimer = 400
    this.state = 'cast'
    this.body.play('mage_cast', true)
  }

  playHurt() {
    this.hurtTimer = 160
    this.body.setTint(0xff4444)
    this.body.scene.time.delayedCall(160, () => this.body.clearTint())
  }

  update(delta: number, x: number, y: number, vx: number, vy: number, isDead: boolean) {
    this.body.setPosition(x, y)

    // Flip to face direction of travel
    if (vx > 18)       this.facingRight = true
    else if (vx < -18) this.facingRight = false
    this.body.setFlipX(!this.facingRight)

    // State machine
    if (isDead) {
      if (this.state !== 'dead') {
        this.state = 'dead'
        this.body.setTint(0x888888)
        this.body.play('mage_idle', true).stop()
      }
      this.castGlow.clear()
      return
    }

    if (this.castTimer > 0) {
      this.castTimer -= delta
      if (this.castTimer <= 0 && this.state === 'cast') {
        this.state = 'idle'
        this.body.play('mage_idle', true)
      }
    }

    if (this.hurtTimer > 0) this.hurtTimer -= delta

    if (this.state !== 'cast' && this.state !== 'dead') {
      const moving  = Math.abs(vx) > 18 || Math.abs(vy) > 18
      const target: MageState = moving ? 'walk' : 'idle'
      if (target !== this.state) {
        this.state = target
        this.body.play(target === 'walk' ? 'mage_walk' : 'mage_idle', true)
      }
    }

    // Cast glow that pulses around the mage while casting
    this.castGlow.clear()
    if (this.castTimer > 0) {
      const t = Math.min(1, this.castTimer / 180)
      this.castGlow.fillStyle(0x8844ff, t * 0.30)
      this.castGlow.fillCircle(x, y, 24 + t * 12)
    }
  }

  destroy() {
    this.body.destroy()
    this.castGlow.destroy()
  }
}
