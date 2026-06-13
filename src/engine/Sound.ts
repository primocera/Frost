/**
 * All game audio in one place — Web Audio port of the old Phaser SoundManager.
 *
 * Web Audio (decoded AudioBuffers + one-shot BufferSources) lets the same SFX
 * overlap cleanly, which a pool of <audio> elements struggles with. The context
 * starts suspended until a user gesture resumes it (the "Begin" click qualifies).
 */
const CLIPS: Record<string, string> = {
  mus_westfall:        'assets/audio/mus_westfall.mp3',
  snd_cast:            'assets/audio/snd_cast.ogg',
  snd_frost_cast:      'assets/audio/snd_frost_cast.ogg',
  snd_icelance_cast:   'assets/audio/snd_icelance_cast.ogg',
  snd_icelance_impact: 'assets/audio/snd_icelance_impact.ogg',
  snd_arcane:          'assets/audio/snd_arcane.ogg',
  snd_blizzard:        'assets/audio/snd_blizzard.ogg',
  snd_impact:          'assets/audio/snd_impact.ogg',
  snd_hit:             'assets/audio/snd_hit.ogg',
  snd_death:           'assets/audio/snd_death.ogg',
  snd_levelup:         'assets/audio/snd_levelup.ogg',
}

export class SoundManager {
  private ctx: AudioContext
  private buffers = new Map<string, AudioBuffer>()
  private master: GainNode

  private musicSource: AudioBufferSourceNode | null = null
  private musicGain: GainNode | null = null
  private currentMusicKey = ''

  constructor() {
    this.ctx = new AudioContext()
    this.master = this.ctx.createGain()
    this.master.gain.value = 1
    this.master.connect(this.ctx.destination)
  }

  /** Fetch + decode every clip. Safe to call once at game start. */
  async loadAll(base: string): Promise<void> {
    const entries = Object.entries(CLIPS)
    await Promise.all(entries.map(async ([key, path]) => {
      try {
        const res = await fetch(base + path)
        const arr = await res.arrayBuffer()
        this.buffers.set(key, await this.ctx.decodeAudioData(arr))
      } catch (err) {
        console.warn(`[sound] failed to load ${key}:`, err)
      }
    }))
  }

  /** Resume the context after a user gesture (browsers block autoplay). */
  resume() { if (this.ctx.state === 'suspended') void this.ctx.resume() }

  onFireboltCast()    { this.play('snd_cast',            0.55) }
  onFrostboltCast()   { this.play('snd_icelance_cast',   0.70) }
  onFireboltImpact()  { this.play('snd_impact',          0.75) }
  onFrostboltImpact() { this.play('snd_icelance_impact', 0.80) }
  onPlayerHit()       { this.play('snd_hit',             0.60) }
  onEnemyDeath()      { this.play('snd_death',           0.50) }
  onLevelUp()         { this.play('snd_levelup',         1.0)  }
  onArcaneExplosion() { this.play('snd_arcane',          0.90) }
  onFrostNova()       { this.play('snd_frost_cast',      0.85) }
  onBlizzardCast()    { this.play('snd_blizzard',        0.65) }

  /** Switch looping background music, cross-fading from any current track. */
  setZoneMusic(key: string | null, volume = 0.38) {
    if (key === this.currentMusicKey) return
    this.currentMusicKey = key ?? ''

    if (this.musicSource && this.musicGain) {
      const old = this.musicSource
      const g = this.musicGain
      const now = this.ctx.currentTime
      g.gain.cancelScheduledValues(now)
      g.gain.setValueAtTime(g.gain.value, now)
      g.gain.linearRampToValueAtTime(0, now + 1.2)
      old.stop(now + 1.25)
      this.musicSource = null
      this.musicGain = null
    }

    if (!key) return
    const buf = this.buffers.get(key)
    if (!buf) return

    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const g = this.ctx.createGain()
    g.gain.value = 0
    src.connect(g).connect(this.master)
    src.start()
    const now = this.ctx.currentTime
    g.gain.linearRampToValueAtTime(volume, now + 1.5)
    this.musicSource = src
    this.musicGain = g
  }

  private play(key: string, volume: number) {
    const buf = this.buffers.get(key)
    if (!buf || this.ctx.state !== 'running') return
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    const g = this.ctx.createGain()
    g.gain.value = volume
    src.connect(g).connect(this.master)
    src.start()
  }
}
