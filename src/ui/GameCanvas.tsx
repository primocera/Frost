import { useEffect, useRef } from 'react'
import { Game } from '../engine/Game'
import { SoundManager } from '../engine/Sound'
import { useGameStore } from './store'

/**
 * Hosts the single <canvas> the game renders into and owns the engine lifecycle.
 * The React tree never draws world entities — the engine does, on this element.
 */
export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const sound = new SoundManager()
    sound.setVolume(useGameStore.getState().volume)
    void sound.loadAll(import.meta.env.BASE_URL).then(() => sound.setZoneMusic('mus_westfall'))
    const unsubVol = useGameStore.subscribe((s) => sound.setVolume(s.volume))

    const name = useGameStore.getState().playerName
    const game = new Game(canvas, name, sound)

    // Browsers block audio until a user gesture — resume on first interaction.
    const resume = () => sound.resume()
    window.addEventListener('pointerdown', resume, { once: true })
    window.addEventListener('keydown', resume, { once: true })

    return () => {
      game.destroy()
      unsubVol()
      window.removeEventListener('pointerdown', resume)
      window.removeEventListener('keydown', resume)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      tabIndex={0}
      style={{ display: 'block', position: 'fixed', inset: 0, width: '100%', height: '100%' }}
    />
  )
}
