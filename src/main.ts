import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { GameScene } from './scenes/GameScene'

new Phaser.Game({
  type: Phaser.AUTO,
  width: 960,
  height: 640,
  backgroundColor: '#182818',
  parent: document.body,
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
      gravity: { x: 0, y: 0 },
    },
  },
  scene: [BootScene, GameScene],
})
