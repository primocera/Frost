/**
 * All game audio in one place.
 * Files are loaded by BootScene before GameScene starts.
 */
export class SoundManager {
  private currentMusic: Phaser.Sound.BaseSound | null = null
  private currentMusicKey = ''

  constructor(private scene: Phaser.Scene) {}

  onFireboltCast()      { this.play('snd_cast',            0.55) }
  onFrostboltCast()     { this.play('snd_icelance_cast',   0.70) }
  onFireboltImpact()    { this.play('snd_impact',          0.75) }
  onFrostboltImpact()   { this.play('snd_icelance_impact', 0.80) }
  onPlayerHit()         { this.play('snd_hit',             0.60) }
  onEnemyDeath()        { this.play('snd_death',           0.50) }
  onLevelUp()           { this.play('snd_levelup',         1.0)  }
  onArcaneExplosion()   { this.play('snd_arcane',          0.90) }
  onFrostNova()         { this.play('snd_frost_cast',      0.85) }
  onBlizzardCast()      { this.play('snd_frost_cast',      0.65) }

  /** Switch background music — cross-fades if already playing something else. */
  setZoneMusic(key: string | null, volume = 0.38) {
    if (key === this.currentMusicKey) return
    this.currentMusicKey = key ?? ''

    if (this.currentMusic) {
      const old = this.currentMusic
      this.scene.tweens.add({
        targets: old, volume: 0, duration: 1200,
        onComplete: () => old.destroy(),
      })
      this.currentMusic = null
    }

    if (!key) return

    const mus = this.scene.sound.add(key, { loop: true, volume: 0 })
    mus.play()
    this.scene.tweens.add({ targets: mus, volume, duration: 1500 })
    this.currentMusic = mus
  }

  private play(key: string, volume: number) {
    this.scene.sound.play(key, { volume })
  }
}
