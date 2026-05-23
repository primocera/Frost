/**
 * All game audio in one place.
 * Files are loaded by BootScene before GameScene starts.
 * Source: Kenney.nl — CC0, no attribution required.
 */
export class SoundManager {
  constructor(private scene: Phaser.Scene) {}

  onFireboltCast()      { this.play('snd_cast',       0.55) }
  onFrostboltCast()     { this.play('snd_icelance_cast',   0.70) }
  onFireboltImpact()    { this.play('snd_impact',          0.75) }
  onFrostboltImpact()   { this.play('snd_icelance_impact', 0.80) }
  onPlayerHit()         { this.play('snd_hit',        0.60) }
  onEnemyDeath()        { this.play('snd_death',      0.50) }
  onLevelUp()           { this.play('snd_levelup',    1.0)  }
  onArcaneExplosion()   { this.play('snd_arcane',     0.90) }
  onFrostNova()         { this.play('snd_frost_cast', 0.85) }
  onBlizzardCast()      { this.play('snd_frost_cast', 0.65) }

  private play(key: string, volume: number) {
    this.scene.sound.play(key, { volume })
  }
}
