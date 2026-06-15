import { useRef, useEffect, useState } from 'react'
import { minimap, MINIMAP_ZOOMS } from '../engine/minimap'
import { useGameStore } from './store'

/**
 * Minimap UI: owns the canvas + the toggle/zoom buttons. The engine draws into
 * this canvas each (throttled) frame via the `minimap` bridge — React just
 * registers the element and the chosen zoom level.
 */
export function Minimap() {
  const isMobile = useGameStore((s) => s.isMobile)
  const [open, setOpen] = useState(true)
  const [zoom, setZoom] = useState(1)
  const ref = useRef<HTMLCanvasElement>(null)
  const size = isMobile ? 104 : 148

  useEffect(() => {
    minimap.canvas = open ? ref.current : null
    return () => { minimap.canvas = null }
  }, [open])
  useEffect(() => { minimap.zoom = zoom }, [zoom])

  if (!open) {
    return <button style={styles.openBtn} onClick={() => setOpen(true)} title="Show map">🗺</button>
  }
  return (
    <div style={{ ...styles.wrap, width: size + 6 }}>
      <canvas ref={ref} width={size} height={size} style={{ width: size, height: size, display: 'block', borderRadius: 7 }} />
      <button style={{ ...styles.mapBtn, left: 5 }} onClick={() => setZoom((z) => (z + 1) % MINIMAP_ZOOMS.length)} title="Zoom">🔍{zoom + 1}</button>
      <button style={{ ...styles.mapBtn, right: 5 }} onClick={() => setOpen(false)} title="Hide map">✕</button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: 'fixed', top: 90, right: 12, padding: 3, zIndex: 60,
    background: 'rgba(6,10,20,0.55)', border: '1px solid rgba(90,140,220,0.4)', borderRadius: 10,
  },
  openBtn: {
    position: 'fixed', top: 90, right: 12, width: 34, height: 34, borderRadius: 8, zIndex: 60,
    fontSize: 16, background: 'rgba(6,10,20,0.6)', border: '1px solid rgba(90,140,220,0.4)', color: '#cfe3ff', cursor: 'pointer',
  },
  mapBtn: {
    position: 'absolute', bottom: 6, width: 26, height: 20, borderRadius: 5, padding: 0,
    fontSize: 10, fontWeight: 700, background: 'rgba(10,18,34,0.82)', border: '1px solid rgba(90,140,220,0.4)',
    color: '#cfe3ff', cursor: 'pointer', fontFamily: '-apple-system, "Segoe UI", sans-serif',
  },
}
