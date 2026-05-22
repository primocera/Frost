import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { NameScene } from './scenes/NameScene'
import { GameScene } from './scenes/GameScene'

new Phaser.Game({
  type: Phaser.AUTO,
  backgroundColor: '#080e18',
  parent: document.body,
  scale: {
    mode:       Phaser.Scale.EXPAND,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width:  960,
    height: 640,
  },
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
      gravity: { x: 0, y: 0 },
    },
  },
  scene: [BootScene, NameScene, GameScene],
})
