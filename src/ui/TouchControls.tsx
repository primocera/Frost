import { useRef, useState } from 'react'
import { touch } from '../engine/touch'
import { useGameStore } from './store'

/**
 * Touch controls: a left thumb-stick for movement and right-side buttons for
 * casting (auto-aims nearest enemy) + spells. Writes into the `touch` bridge
 * that Game.buildInput reads. Only rendered on touch devices.
 */
export function TouchControls() {
  const isMobile = useGameStore((s) => s.isMobile)
  const nearNpc = useGameStore((s) => s.nearNpc)
  const nearPlayer = useGameStore((s) => s.nearPlayer)
  const nearBessie = useGameStore((s) => s.nearBessie)
  if (!isMobile) return null
  return (
    <>
      <Joystick />
      {nearNpc && (
        <div style={styles.interactBtn} onTouchStart={(e) => { e.preventDefault(); touch.interact = true }}>
          E · Talk
        </div>
      )}
      {!nearNpc && nearBessie && (
        <div style={{ ...styles.interactBtn, background: 'rgba(150,110,20,0.85)', borderColor: 'rgba(255,220,120,0.7)' }}
          onTouchStart={(e) => { e.preventDefault(); touch.interact = true }}>
          🌾 Feed Bessie
        </div>
      )}
      {!nearNpc && nearPlayer && (
        <div style={{ ...styles.interactBtn, background: 'rgba(20,120,80,0.85)', borderColor: 'rgba(120,255,200,0.7)' }}
          onTouchStart={(e) => { e.preventDefault(); touch.trade = true }}>
          🤝 Trade {nearPlayer.name}
        </div>
      )}
      <div style={styles.rightCluster}>
        <SpellBtn label="Q" color="#cc44ff" onDown={() => { touch.arcane = true }} />
        <SpellBtn label="E" color="#44aaff" onDown={() => { touch.nova = true }} />
        <SpellBtn label="R" color="#4488ff" onDown={() => { touch.blizzard = true }} />
        <CastBtn />
      </div>
      <div style={styles.topRow}>
        <MiniBtn label="💬" onTap={() => useGameStore.getState().setChatOpen(true)} />
        <MiniBtn label="✦" onTap={() => { touch.swap = true }} />
        <MiniBtn label="🎒" onTap={() => useGameStore.getState().togglePanel('inventory')} />
        <MiniBtn label="✪" onTap={() => useGameStore.getState().togglePanel('talents')} />
        <MiniBtn label="🏪" onTap={() => useGameStore.getState().togglePanel('shop')} />
      </div>
    </>
  )
}

function Joystick() {
  const baseRef = useRef<HTMLDivElement>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const R = 52

  const update = (clientX: number, clientY: number) => {
    const el = baseRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    let dx = clientX - (r.left + r.width / 2)
    let dy = clientY - (r.top + r.height / 2)
    const mag = Math.hypot(dx, dy) || 1
    const clamped = Math.min(mag, R)
    const nx = (dx / mag), ny = (dy / mag)
    setKnob({ x: nx * clamped, y: ny * clamped })
    touch.move = { x: nx * (clamped / R), y: ny * (clamped / R) }
  }
  const end = () => { setKnob({ x: 0, y: 0 }); touch.move = { x: 0, y: 0 } }

  return (
    <div
      ref={baseRef}
      style={styles.joyBase}
      onTouchStart={(e) => { const t = e.touches[0]; update(t.clientX, t.clientY) }}
      onTouchMove={(e) => { e.preventDefault(); const t = e.touches[0]; update(t.clientX, t.clientY) }}
      onTouchEnd={end}
      onTouchCancel={end}
    >
      <div style={{ ...styles.joyKnob, transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  )
}

function CastBtn() {
  return (
    <div
      style={{ ...styles.castBtn }}
      onTouchStart={(e) => { e.preventDefault(); touch.castBolt = true }}
      onTouchEnd={() => { touch.castBolt = false }}
      onTouchCancel={() => { touch.castBolt = false }}
    >🔥</div>
  )
}

function SpellBtn({ label, color, onDown }: { label: string; color: string; onDown: () => void }) {
  return (
    <div
      style={{ ...styles.spellBtn, borderColor: color, color }}
      onTouchStart={(e) => { e.preventDefault(); onDown() }}
    >{label}</div>
  )
}

function MiniBtn({ label, onTap }: { label: string; onTap: () => void }) {
  return (
    <div style={styles.miniBtn} onTouchStart={(e) => { e.preventDefault(); onTap() }}>{label}</div>
  )
}

const btnBase: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  userSelect: 'none', WebkitUserSelect: 'none', pointerEvents: 'auto', touchAction: 'none',
  fontFamily: '-apple-system, "Segoe UI", sans-serif', fontWeight: 700,
}

const styles: Record<string, React.CSSProperties> = {
  joyBase: {
    ...btnBase, position: 'fixed', left: 24, bottom: 28, width: 124, height: 124, borderRadius: '50%',
    background: 'rgba(20,30,55,0.35)', border: '2px solid rgba(120,170,255,0.35)',
  },
  joyKnob: {
    width: 56, height: 56, borderRadius: '50%',
    background: 'rgba(120,170,255,0.55)', border: '2px solid rgba(180,210,255,0.7)',
  },
  rightCluster: {
    position: 'fixed', right: 20, bottom: 24, display: 'grid',
    gridTemplateColumns: '64px 64px', gridGap: 10, pointerEvents: 'none',
  },
  castBtn: {
    ...btnBase, width: 80, height: 80, borderRadius: '50%', fontSize: 30,
    background: 'rgba(180,60,20,0.5)', border: '2px solid rgba(255,140,80,0.7)',
    gridColumn: '2', gridRow: '1 / span 2', alignSelf: 'end',
  },
  spellBtn: {
    ...btnBase, width: 60, height: 60, borderRadius: '50%', fontSize: 20,
    background: 'rgba(15,25,45,0.55)', border: '2px solid',
  },
  topRow: {
    position: 'fixed', top: 10, right: 12, display: 'flex', gap: 8, pointerEvents: 'none',
  },
  miniBtn: {
    ...btnBase, width: 42, height: 42, borderRadius: 10, fontSize: 18,
    background: 'rgba(15,25,45,0.6)', border: '1.5px solid rgba(120,170,255,0.4)', color: '#cfe3ff',
  },
  interactBtn: {
    ...btnBase, position: 'fixed', bottom: 160, left: '50%', transform: 'translateX(-50%)',
    padding: '12px 26px', borderRadius: 12, fontSize: 16,
    background: 'rgba(20,80,160,0.85)', border: '2px solid rgba(120,200,255,0.7)', color: '#fff',
  },
}
