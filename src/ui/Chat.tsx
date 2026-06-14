import { useEffect, useRef, useState } from 'react'
import { useGameStore } from './store'

/**
 * Multiplayer chat. Press Enter to open the input, type, Enter to send / Esc to
 * cancel. The message log sits bottom-left and fades old lines.
 */
export function Chat() {
  const chat = useGameStore((s) => s.chat)
  const open = useGameStore((s) => s.chatOpen)
  const net = useGameStore((s) => s.net)
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (open) inputRef.current?.focus() }, [open])

  const send = () => {
    const t = text.trim()
    if (t) useGameStore.getState().actions?.sendChat(t)
    setText('')
    useGameStore.getState().setChatOpen(false)
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.log}>
        {chat.slice(-8).map((l, i) => (
          <div key={i} style={styles.line}>
            <span style={styles.from}>{l.from}:</span> {l.text}
          </div>
        ))}
      </div>
      {open && (
        <input
          ref={inputRef}
          style={styles.input}
          value={text}
          maxLength={200}
          placeholder={net === 'connected' ? 'Say something…' : 'Chat is multiplayer-only'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') send()
            else if (e.key === 'Escape') { setText(''); useGameStore.getState().setChatOpen(false) }
          }}
          onBlur={() => useGameStore.getState().setChatOpen(false)}
        />
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: 'fixed', bottom: 70, left: 12, width: 360, maxWidth: 'calc(100vw - 24px)',
    display: 'flex', flexDirection: 'column', gap: 6,
    fontFamily: '-apple-system, "Segoe UI", sans-serif', pointerEvents: 'none',
  },
  log: { display: 'flex', flexDirection: 'column', gap: 2 },
  line: {
    fontSize: 12, color: '#dce8ff', textShadow: '0 1px 2px rgba(0,0,0,0.9)', lineHeight: 1.4,
    background: 'rgba(0,0,0,0.18)', borderRadius: 4, padding: '1px 6px', width: 'fit-content', maxWidth: '100%',
  },
  from: { color: '#7fd0ff', fontWeight: 700 },
  input: {
    pointerEvents: 'auto', width: '100%', padding: '8px 12px', borderRadius: 8,
    border: '1.5px solid rgba(90,160,255,0.5)', background: 'rgba(8,14,28,0.92)',
    color: '#fff', fontSize: 13, outline: 'none',
  },
}
