import Phaser from 'phaser'

export class NameScene extends Phaser.Scene {
  private nameStr       = ''
  private nameDisplay!:   Phaser.GameObjects.Text
  private cursorVisible   = true
  private cursorTimer     = 0
  private ready           = false
  private hardcore        = false
  private normalBtn!:     Phaser.GameObjects.Text
  private hardcoreBtn!:   Phaser.GameObjects.Text

  constructor() { super('NameScene') }

  create() {
    const W = this.scale.width
    const H = this.scale.height

    // Background
    const bg = this.add.graphics()
    bg.fillStyle(0x080e18)
    bg.fillRect(0, 0, W, H)

    // Stars
    bg.fillStyle(0xffffff, 0.5)
    for (let i = 0; i < 90; i++) {
      const x = Phaser.Math.Between(0, W)
      const y = Phaser.Math.Between(0, H)
      bg.fillCircle(x, y, Math.random() < 0.15 ? 1.5 : 0.8)
    }

    // Title
    this.add.text(W / 2, 120, 'F  R  O  S  T', {
      fontSize: '64px', fontFamily: 'monospace', color: '#88ccff',
      stroke: '#001133', strokeThickness: 10,
    }).setOrigin(0.5)

    this.add.text(W / 2, 198, "A Mage's Journey", {
      fontSize: '18px', fontFamily: 'monospace', color: '#4477aa',
    }).setOrigin(0.5)

    const line = this.add.graphics()
    line.lineStyle(1, 0x334466, 0.7)
    line.lineBetween(W / 2 - 200, 228, W / 2 + 200, 228)

    // Name prompt
    this.add.text(W / 2, 276, 'Enter your mage name:', {
      fontSize: '16px', fontFamily: 'monospace', color: '#9999bb',
    }).setOrigin(0.5)

    // Input box
    const box = this.add.graphics()
    box.fillStyle(0x0d1a2a)
    box.fillRect(W / 2 - 160, 302, 320, 40)
    box.lineStyle(1, 0x334466)
    box.strokeRect(W / 2 - 160, 302, 320, 40)

    this.nameDisplay = this.add.text(W / 2, 322, '_', {
      fontSize: '20px', fontFamily: 'monospace', color: '#eeeeff',
    }).setOrigin(0.5)

    this.add.text(W / 2, 372, 'Press ENTER to begin', {
      fontSize: '13px', fontFamily: 'monospace', color: '#446688',
    }).setOrigin(0.5)

    this.add.text(W / 2, 390, '(up to 16 characters — leave blank for "Apprentice")', {
      fontSize: '10px', fontFamily: 'monospace', color: '#2a3d55',
    }).setOrigin(0.5)

    // Mode selection
    this.add.text(W / 2, 424, 'GAME MODE', {
      fontSize: '11px', fontFamily: 'monospace', color: '#334466',
    }).setOrigin(0.5)

    this.normalBtn = this.add.text(W / 2 - 70, 448, '[ NORMAL ]', {
      fontSize: '14px', fontFamily: 'monospace', color: '#44aaff',
      stroke: '#001133', strokeThickness: 3,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.setMode(false))

    this.hardcoreBtn = this.add.text(W / 2 + 70, 448, '[ HARDCORE ]', {
      fontSize: '14px', fontFamily: 'monospace', color: '#445566',
      stroke: '#001133', strokeThickness: 3,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.setMode(true))

    // Tap to start
    this.add.text(W / 2, 484, '— or tap / click here to start —', {
      fontSize: '12px', fontFamily: 'monospace', color: '#334455',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.startGame())

    // Flavor
    this.add.text(W / 2, 530, 'Master fire and frost • Rise from apprentice to archmage', {
      fontSize: '11px', fontFamily: 'monospace', color: '#22334a',
    }).setOrigin(0.5)

    // Spell hint dots
    const hints = [
      { col: 0xff6600, label: 'Firebolt' },
      { col: 0xcc44ff, label: 'Arcane Exp' },
      { col: 0x44aaff, label: 'Frost Nova' },
      { col: 0x0088dd, label: 'Blizzard'  },
    ]
    hints.forEach((h, i) => {
      const hx = W / 2 - 168 + i * 112
      const hy = 570
      const g2 = this.add.graphics()
      g2.fillStyle(h.col, 0.8)
      g2.fillCircle(hx, hy, 8)
      this.add.text(hx, hy + 14, h.label, {
        fontSize: '10px', fontFamily: 'monospace', color: '#334455',
      }).setOrigin(0.5)
    })

    // Keyboard capture
    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      if (this.ready) return
      if (event.key === 'Enter') {
        this.startGame()
      } else if (event.key === 'Backspace') {
        this.nameStr = this.nameStr.slice(0, -1)
        this.updateDisplay()
      } else if (event.key.length === 1 && this.nameStr.length < 16 && event.key.charCodeAt(0) >= 32) {
        this.nameStr += event.key
        this.updateDisplay()
      }
    })
  }

  update(_t: number, delta: number) {
    this.cursorTimer += delta
    if (this.cursorTimer > 530) {
      this.cursorTimer  = 0
      this.cursorVisible = !this.cursorVisible
      this.updateDisplay()
    }
  }

  private updateDisplay() {
    this.nameDisplay.setText(this.nameStr + (this.cursorVisible ? '_' : ' '))
  }

  private setMode(hc: boolean) {
    this.hardcore = hc
    this.normalBtn.setColor(hc ? '#445566' : '#44aaff')
    this.hardcoreBtn.setColor(hc ? '#ff4444' : '#445566')
  }

  private startGame() {
    if (this.ready) return
    this.ready = true
    if (this.nameStr.trim().length === 0) this.nameStr = 'Apprentice'
    this.cameras.main.fadeOut(400, 8, 14, 24)
    this.time.delayedCall(420, () => {
      this.scene.start('GameScene', { playerName: this.nameStr, hardcore: this.hardcore })
    })
  }
}
