/**
 * ChatUI — scrolling event feed + command console.
 *
 * The feed sits below the stat bars (top-left) and shows game events and
 * chat messages. Commands are entered via a DOM <input> that overlays the
 * canvas; on mobile the command bar is unavailable (feed is read-only).
 *
 * Command grammar:
 *   /name <newname>   — change display name
 *   /help             — list commands
 *   /inspect          — inspect nearest entity (Tab key also works)
 */

import Phaser from 'phaser'
import { SocialSystem } from '../social/SocialSystem'

// ── Layout (960 × 640 canvas-space) ───────────────────────────────────────────

const FEED_X    = 10
const FEED_Y    = 122    // below the HUD stat bars
const FEED_W    = 262
const LINE_H    = 17
const MAX_LINES = 5
const MSG_TTL   = 9000  // ms until a feed message fades away

interface FeedLine {
  text:  Phaser.GameObjects.Text
  expAt: number   // scene timestamp when this message should fade
}

export class ChatUI {
  private bg:       Phaser.GameObjects.Graphics
  private lines:    FeedLine[] = []
  private messages: { text: string; color: string }[] = []

  // Command input — DOM element
  private inputEl:   HTMLInputElement | null = null
  private inputOpen  = false

  // Bound handlers — stored so removeEventListener works correctly
  private readonly boundKeyDown = (e: KeyboardEvent) => this.onDocKeyDown(e)

  constructor(
    private scene:  Phaser.Scene,
    private social: SocialSystem,
    private onCommand?: (cmd: string) => void,   // GameScene handles /inspect etc.
  ) {
    this.bg = scene.add.graphics()
      .setScrollFactor(0)
      .setDepth(18)

    // Subscribe to social chat events
    social.onChatMessage = (msg) => {
      const prefix = msg.id === '__game__' ? '' : `${msg.name}: `
      this.addMessage(prefix + msg.text, msg.color)
    }

    // DOM input (desktop only; skipped if touch device)
    if (!scene.sys.game.device.input.touch) {
      this.buildInputEl()
      document.addEventListener('keydown', this.boundKeyDown)
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Push a new message onto the feed. Color is a CSS hex string. */
  addMessage(text: string, color = '#888888') {
    this.messages.push({ text, color })
    if (this.messages.length > MAX_LINES) this.messages.shift()
    this.rebuildLines()
  }

  /** Called from GameScene.update() each frame. */
  update() {
    const now = this.scene.time.now
    let anyVisible = false

    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i]
      const age  = now - line.expAt + MSG_TTL
      if (now > line.expAt) {
        line.text.setAlpha(Math.max(0, 1 - (now - line.expAt) / 800))
      } else {
        line.text.setAlpha(1)
        anyVisible = true
      }
      if (line.text.alpha > 0) anyVisible = true
    }

    // Draw semi-transparent background only when there's content
    this.bg.clear()
    if (anyVisible) {
      this.bg.fillStyle(0x000000, 0.38)
      this.bg.fillRect(FEED_X - 4, FEED_Y - 4, FEED_W + 8, MAX_LINES * LINE_H + 8)
    }
  }

  /** Open/close the command input box. Toggle. */
  toggleInput() {
    if (!this.inputEl) return
    this.inputOpen ? this.closeInput() : this.openInput()
  }

  destroy() {
    document.removeEventListener('keydown', this.boundKeyDown)
    this.inputEl?.remove()
    this.lines.forEach(l => l.text.destroy())
    this.bg.destroy()
  }

  // ── Command input ──────────────────────────────────────────────────────────

  private buildInputEl() {
    const el       = document.createElement('input')
    el.type        = 'text'
    el.maxLength   = 120
    el.placeholder = '/help for commands…'
    el.style.cssText = [
      'position:fixed',
      'z-index:200',
      'display:none',
      'padding:3px 7px',
      'background:rgba(0,0,0,0.82)',
      'color:#dddddd',
      'border:1px solid #444',
      'border-radius:2px',
      'font:13px monospace',
      'outline:none',
    ].join(';')
    document.body.appendChild(el)

    el.addEventListener('keydown', (e) => {
      e.stopPropagation()   // prevent Phaser key bindings from firing
      if (e.key === 'Enter') {
        const val = el.value.trim()
        if (val) this.executeCommand(val)
        this.closeInput()
      }
      if (e.key === 'Escape') this.closeInput()
    })

    this.inputEl = el
    this.positionInputEl()
    window.addEventListener('resize', () => this.positionInputEl())
  }

  private positionInputEl() {
    if (!this.inputEl) return
    const canvas = this.scene.game.canvas
    const rect   = canvas.getBoundingClientRect()
    const sx     = rect.width  / 960
    const sy     = rect.height / 640
    this.inputEl.style.left   = `${rect.left  + FEED_X * sx}px`
    this.inputEl.style.top    = `${rect.top   + (FEED_Y + MAX_LINES * LINE_H + 6) * sy}px`
    this.inputEl.style.width  = `${FEED_W * sx}px`
    this.inputEl.style.fontSize = `${Math.round(13 * Math.min(sx, sy))}px`
  }

  private openInput() {
    if (!this.inputEl) return
    this.inputEl.value   = ''
    this.inputEl.style.display = 'block'
    this.inputEl.focus()
    this.inputOpen = true
    this.scene.input.keyboard?.disableGlobalCapture()
  }

  private closeInput() {
    if (!this.inputEl) return
    this.inputEl.style.display = 'none'
    this.inputOpen = false
    this.scene.input.keyboard?.enableGlobalCapture()
  }

  private onDocKeyDown(e: KeyboardEvent) {
    // Enter opens the command box (if not already open)
    if (e.key === 'Enter' && !this.inputOpen) {
      e.preventDefault()
      this.openInput()
    }
  }

  private executeCommand(raw: string) {
    const parts = raw.split(/\s+/)
    const cmd   = parts[0].toLowerCase()

    if (cmd === '/help' || cmd === 'help') {
      this.addMessage('/name <name>  — set display name', '#888888')
      this.addMessage('/inspect      — inspect nearest entity', '#888888')
      this.addMessage('Press Enter to open chat', '#888888')
      return
    }

    if (cmd === '/name') {
      const newName = this.social.setName(parts.slice(1).join(' ') || 'Mage')
      this.addMessage(`Name set to "${newName}"`, '#aaddff')
      return
    }

    if (cmd === '/inspect') {
      this.onCommand?.('/inspect')
      return
    }

    // Pass anything else (non-slash text) as a chat message
    if (!cmd.startsWith('/')) {
      this.social.sendChat(raw)
      return
    }

    this.addMessage(`Unknown command: ${cmd}`, '#ff6666')
  }

  // ── Feed rendering ─────────────────────────────────────────────────────────

  private rebuildLines() {
    // Destroy and recreate text objects to keep ordering simple
    this.lines.forEach(l => l.text.destroy())
    this.lines = []

    const now = this.scene.time.now
    this.messages.forEach((msg, i) => {
      const t = this.scene.add.text(
        FEED_X,
        FEED_Y + i * LINE_H,
        this.truncate(msg.text, FEED_W),
        { fontSize: '11px', color: msg.color, fontFamily: 'monospace' },
      ).setScrollFactor(0).setDepth(19).setAlpha(1)

      this.lines.push({ text: t, expAt: now + MSG_TTL })
    })
  }

  private truncate(text: string, maxPx: number): string {
    // Rough char-based truncation (monospace ~6.6px per char at 11px)
    const maxChars = Math.floor(maxPx / 6.6)
    return text.length > maxChars ? text.slice(0, maxChars - 1) + '…' : text
  }
}
