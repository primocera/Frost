import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { GameScene } from './scenes/GameScene'

// Called by the HTML landing page when the player clicks "Begin"
;(window as any).__frostLaunch = () => {
  const playerName: string  = (window as any).__frostPlayerName || 'Apprentice'
  const hardcore:   boolean = (window as any).__frostHardcore   ?? false

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    backgroundColor: '#080e18',
    parent: 'game-container',
    scale: {
      mode:       Phaser.Scale.EXPAND,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width:  960,
      height: 640,
    },
    physics: {
      default: 'arcade',
      arcade: { debug: false, gravity: { x: 0, y: 0 } },
    },
    scene: [BootScene, GameScene],
  })

  game.registry.set('playerName', playerName)
  game.registry.set('hardcore',   hardcore)
}
