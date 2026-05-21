/**
 * All game audio in one place.
 * Files are loaded by BootScene before GameScene starts.
 * Source: Kenney.nl — CC0, no attribution required.
 */
export class SoundManager {
  constructor(private scene: Phaser.Scene) {}

  onFireboltCast()      { this.play('snd_cast',    0.55) }
  onFireboltImpact()    { this.play('snd_impact',  0.75) }
  onPlayerHit()         { this.play('snd_hit',     0.6)  }
  onEnemyDeath()        { this.play('snd_death',   0.5)  }
  onLevelUp()           { this.play('snd_levelup', 0.85) }
  onArcaneExplosion()   { this.play('snd_impact',  0.95) }   // hard hit, louder
  onFrostNova()         { this.play('snd_cast',    0.80) }   // mystical whoosh
  onBlizzardCast()      { this.play('snd_cast',    0.65) }

  private play(key: string, volume: number) {
    this.scene.sound.play(key, { volume })
  }
}
