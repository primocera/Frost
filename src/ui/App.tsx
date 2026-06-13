import { useState } from 'react'
import { useGameStore } from './store'
import { GameCanvas } from './GameCanvas'
import { Panels } from './Panels'

/**
 * Root component. Switches between the landing/name screen and the live game.
 * The rich landing markup from the old index.html is reduced here to a clean
 * React form; full visual polish is restored in Phase 6 alongside persistence.
 */
export function App() {
  const screen = useGameStore((s) => s.screen)
  return screen === 'landing' ? <Landing /> : <Game />
}

function Landing() {
  const startGame = useGameStore((s) => s.startGame)
  const [name, setName] = useState('')
  const [hardcore, setHardcore] = useState(false)

  return (
    <div style={styles.landing}>
      <div style={styles.icon}>❄</div>
      <h1 style={styles.title}>FROST</h1>
      <p style={styles.sub}>A Mage's Journey · Co-op</p>

      <input
        style={styles.input}
        value={name}
        maxLength={16}
        placeholder="Enter your mage name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && startGame(name, hardcore)}
        autoComplete="off"
        spellCheck={false}
      />

      <div style={styles.modeRow}>
        <button
          style={{ ...styles.modeBtn, ...(hardcore ? {} : styles.modeActive) }}
          onClick={() => setHardcore(false)}
        >
          ⚡ Normal
        </button>
        <button
          style={{ ...styles.modeBtn, ...(hardcore ? styles.modeActiveHc : {}) }}
          onClick={() => setHardcore(true)}
        >
          ☠ Hardcore
        </button>
      </div>

      <button style={styles.startBtn} onClick={() => startGame(name, hardcore)}>
        Begin your journey
      </button>
    </div>
  )
}

function Game() {
  const name = useGameStore((s) => s.playerName)
  const hud = useGameStore((s) => s.hud)
  const net = useGameStore((s) => s.net)
  const netInfo = {
    connecting: { color: '#ffcc44', text: '◌ connecting…' },
    connected: { color: '#55dd77', text: '● multiplayer' },
    offline: { color: '#888', text: '○ solo (offline)' },
  }[net]
  return (
    <>
      <GameCanvas />
      <div style={{ ...styles.netBadge, color: netInfo.color }}>{netInfo.text}</div>
      <div style={styles.hud}>
        <div style={styles.hudName}>{name} · Lv {hud.level}</div>
        <div style={{ ...styles.hudZone, color: hud.zoneColor }}>📍 {hud.zone}</div>
        <Bar label="HP" value={hud.hp} max={hud.maxHp} color="#e0464a" track="#3a1416" />
        <Bar label="MP" value={hud.mana} max={hud.maxMana} color="#3b82f6" track="#13243f" />
        <Bar label="XP" value={hud.xp} max={hud.xpToNext} color="#8b5cf6" track="#241a3a" thin />
        <div style={styles.hudFoot}>
          <span style={{ color: '#ffdd00' }}>⛁ {hud.gold}</span>
          <span style={{ color: hud.activeBolt === 'fire' ? '#ff8800' : '#44aaff' }}>
            {hud.activeBolt === 'fire' ? '🔥 Firebolt' : '❄ Frostbolt'}
          </span>
        </div>
      </div>

      <div style={styles.spellbar}>
        {hud.spells.map((sp) => (
          <div key={sp.key} style={{ ...styles.spellIcon, opacity: sp.learned ? 1 : 0.35 }}>
            <span style={styles.spellKey}>{sp.key}</span>
            <span style={styles.spellLabel}>{sp.label}</span>
            {sp.learned && sp.cdPct > 0 && (
              <div style={{ ...styles.spellCd, height: `${Math.min(100, sp.cdPct * 100)}%` }} />
            )}
            {!sp.learned && <span style={styles.spellLock}>🔒</span>}
          </div>
        ))}
      </div>

      <div style={styles.controls}>WASD · Click/F bolt · Q/E/R spells · X swap · I bag · T talents · B shop</div>
      {hud.dead && <div style={styles.dead}>You fell… respawning</div>}
      <Panels />
    </>
  )
}

function Bar({ label, value, max, color, track, thin }: {
  label: string; value: number; max: number; color: string; track: string; thin?: boolean
}) {
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0))
  return (
    <div style={{ ...styles.barRow, height: thin ? 10 : 16 }}>
      <span style={styles.barLabel}>{label}</span>
      <div style={{ ...styles.barTrack, background: track }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: color, transition: 'width 0.12s' }} />
        {!thin && <span style={styles.barText}>{value} / {max}</span>}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  landing: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    background: 'linear-gradient(170deg,#040d1e 0%,#071a3a 28%,#0a2d5e 58%,#0e4a80 82%,#1a6a9a 100%)',
    color: '#fff',
    fontFamily: '-apple-system, "Segoe UI", sans-serif',
  },
  icon: {
    width: 96, height: 96, borderRadius: 24, fontSize: 50,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(145deg,#1a7fc4,#09305e)',
    boxShadow: '0 8px 40px rgba(30,140,255,0.35)',
  },
  title: { fontSize: 44, fontWeight: 800, letterSpacing: 10, margin: 0 },
  sub: { fontSize: 14, color: 'rgba(160,210,255,0.65)', margin: 0, marginBottom: 16 },
  input: {
    width: 300, padding: '14px 18px', borderRadius: 14,
    border: '1.5px solid rgba(80,170,255,0.25)', background: 'rgba(255,255,255,0.07)',
    color: '#fff', fontSize: 16, textAlign: 'center', outline: 'none',
  },
  modeRow: { display: 'flex', gap: 8, width: 300 },
  modeBtn: {
    flex: 1, padding: 10, borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer',
    background: 'rgba(20,90,200,0.18)', color: 'rgba(100,180,255,0.7)',
    border: '1.5px solid rgba(80,160,255,0.2)',
  },
  modeActive: {
    background: 'rgba(20,90,200,0.5)', color: '#88ccff', borderColor: 'rgba(80,160,255,0.6)',
  },
  modeActiveHc: {
    background: 'rgba(180,30,30,0.45)', color: '#ff7777', borderColor: 'rgba(220,60,60,0.6)',
  },
  startBtn: {
    width: 300, padding: 16, borderRadius: 14, border: 'none', cursor: 'pointer',
    fontSize: 16, fontWeight: 600, color: '#fff',
    background: 'linear-gradient(135deg,#1460b0,#0a3a78)',
    boxShadow: '0 4px 20px rgba(20,90,200,0.4)',
  },
  hud: {
    position: 'fixed', top: 12, left: 12, width: 240, display: 'flex', flexDirection: 'column', gap: 4,
    color: '#cfe3ff', fontFamily: '-apple-system, "Segoe UI", sans-serif', fontSize: 12,
    pointerEvents: 'none', textShadow: '0 1px 2px rgba(0,0,0,0.6)',
  },
  netBadge: {
    position: 'fixed', top: 12, right: 12, fontSize: 12, fontWeight: 600,
    fontFamily: '-apple-system, "Segoe UI", sans-serif', pointerEvents: 'none',
    textShadow: '0 1px 2px rgba(0,0,0,0.7)',
  },
  hudName: { fontSize: 14, fontWeight: 700, marginBottom: 1 },
  hudZone: { fontSize: 11, fontWeight: 600, marginBottom: 3 },
  spellbar: {
    position: 'fixed', bottom: 36, left: '50%', transform: 'translateX(-50%)',
    display: 'flex', gap: 8, pointerEvents: 'none',
    fontFamily: '-apple-system, "Segoe UI", sans-serif',
  },
  spellIcon: {
    position: 'relative', width: 50, height: 50, borderRadius: 8, overflow: 'hidden',
    background: 'rgba(12,20,40,0.75)', border: '1.5px solid rgba(90,140,220,0.4)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    color: '#cfe3ff', textShadow: '0 1px 2px rgba(0,0,0,0.7)',
  },
  spellKey: { fontSize: 14, fontWeight: 800 },
  spellLabel: { fontSize: 9, opacity: 0.8 },
  spellLock: { position: 'absolute', fontSize: 16, top: '50%', left: '50%', transform: 'translate(-50%,-50%)' },
  spellCd: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    background: 'rgba(0,0,0,0.55)', pointerEvents: 'none',
  },
  hudFoot: { display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 3 },
  barRow: { display: 'flex', alignItems: 'center', gap: 6 },
  barLabel: { width: 22, fontSize: 10, fontWeight: 700, color: 'rgba(200,220,255,0.7)' },
  barTrack: {
    position: 'relative', flex: 1, height: '100%', borderRadius: 4, overflow: 'hidden',
    border: '1px solid rgba(0,0,0,0.4)',
  },
  barText: {
    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 9, fontWeight: 700, color: '#fff', textShadow: '0 1px 1px rgba(0,0,0,0.9)',
  },
  controls: {
    position: 'fixed', bottom: 10, left: '50%', transform: 'translateX(-50%)',
    color: 'rgba(170,200,240,0.5)', fontFamily: '-apple-system, "Segoe UI", sans-serif',
    fontSize: 11, pointerEvents: 'none', textShadow: '0 1px 2px rgba(0,0,0,0.7)',
  },
  dead: {
    position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#ff6666', fontFamily: '-apple-system, "Segoe UI", sans-serif', fontSize: 28, fontWeight: 700,
    background: 'rgba(20,0,0,0.35)', pointerEvents: 'none', textShadow: '0 2px 8px rgba(0,0,0,0.8)',
  },
}
