import Phaser from 'phaser'

/** Loads all assets before the game scene starts. */
export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene') }

  preload() {
    this.load.audio('snd_cast',       'assets/audio/snd_cast.ogg')
    this.load.audio('snd_frost_cast', 'assets/audio/snd_frost_cast.ogg')
    this.load.audio('snd_arcane',     'assets/audio/snd_arcane.ogg')
    this.load.audio('snd_impact',     'assets/audio/snd_impact.ogg')
    this.load.audio('snd_hit',        'assets/audio/snd_hit.ogg')
    this.load.audio('snd_death',      'assets/audio/snd_death.ogg')
    this.load.audio('snd_levelup',    ['assets/audio/snd_levelup.ogg', 'assets/audio/snd_levelup.wav'])
  }

  create() {
    const playerName = this.registry.get('playerName') || 'Apprentice'
    this.scene.start('GameScene', { playerName })
  }
}
