import Phaser from 'phaser'
import {
  ProgressionSystem, ACHIEVEMENTS, COSMETICS, COSMETIC_IDS, CosmeticId,
} from '../systems/ProgressionSystem'

// ── Layout ────────────────────────────────────────────────────────────────────
const PX   = 50,  PY   = 58
const PW   = 860, PH   = 508
const TAB_H = 34
const FTR_H = 26
const HDR_H = TAB_H            // alias
const CONT_Y = PY + HDR_H + 2
const CONT_H = PH - HDR_H - FTR_H - 2
const CONT_X = PX + 12
const CONT_W = PW - 24

const D      = 40
const BG     = 0x09090f
const BORDER = 0x334455

const TAB_COLORS = [0x1a2a1a, 0x1a1a2a, 0x2a1a2a] as const

// ─────────────────────────────────────────────────────────────────────────────

export class ProgressionUI {
  private visible   = false
  private activeTab = 0

  private panelGfx:   Phaser.GameObjects.Graphics
  private tabTexts:   Phaser.GameObjects.Text[]
  private footerText: Phaser.GameObjects.Text

  // Tab 0: Challenges (3 cards × 4 texts + 1 xp label = 15)
  private chTexts: Phaser.GameObjects.Text[] = []

  // Tab 1: Achievements (11 × 2 texts = 22)
  private achTexts: Phaser.GameObjects.Text[] = []

  // Tab 2: Cosmetics (6 × 2 texts = 12) + stats label + 7 stats (label+value = 14) + section header
  private cosTexts:    Phaser.GameObjects.Text[] = []
  private statTexts:   Phaser.GameObjects.Text[] = []
  private statsHeader: Phaser.GameObjects.Text

  private allObjs: Phaser.GameObjects.GameObject[]

  constructor(private scene: Phaser.Scene, private prog: ProgressionSystem) {
    this.panelGfx = scene.add.graphics().setScrollFactor(0).setDepth(D)

    this.tabTexts = ['Daily Challenges', 'Achievements', 'Cosmetics & Stats'].map((label, i) =>
      scene.add.text(PX + (PW / 3) * i + PW / 6, PY + TAB_H / 2, label, {
        fontSize: '13px', fontStyle: 'bold',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#aabbcc',
      }).setScrollFactor(0).setDepth(D).setOrigin(0.5, 0.5)
    )

    this.footerText = scene.add.text(PX + PW / 2, PY + PH - FTR_H / 2, '', {
      fontSize: '10px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#334455',
    }).setScrollFactor(0).setDepth(D).setOrigin(0.5, 0.5)

    // ── Challenge texts ──────────────────────────────────────────────────────
    for (let i = 0; i < 3; i++) {
      const ry = CONT_Y + 12 + i * 152
      this.chTexts.push(
        // [0] title
        scene.add.text(CONT_X + 14, ry + 8, '', {
          fontSize: '13px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#ccddee',
        }).setScrollFactor(0).setDepth(D),
        // [1] progress "X / Y"
        scene.add.text(CONT_X + 14, ry + 32, '', {
          fontSize: '11px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#778899',
        }).setScrollFactor(0).setDepth(D),
        // [2] status label (COMPLETE)
        scene.add.text(CONT_X + 14, ry + 60, '', {
          fontSize: '12px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#44ff88',
        }).setScrollFactor(0).setDepth(D),
        // [3] xp reward (right-aligned)
        scene.add.text(PX + PW - 18, ry + 8, '', {
          fontSize: '13px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#ffdd88',
        }).setScrollFactor(0).setDepth(D).setOrigin(1, 0),
      )
    }

    // ── Achievement texts ────────────────────────────────────────────────────
    for (let i = 0; i < ACHIEVEMENTS.length; i++) {
      const ry = CONT_Y + 4 + i * 42
      this.achTexts.push(
        scene.add.text(CONT_X + 26, ry + 8, '', {
          fontSize: '12px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#aabbcc',
        }).setScrollFactor(0).setDepth(D),
        scene.add.text(PX + PW - 18, ry + 8, '', {
          fontSize: '11px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#556677',
        }).setScrollFactor(0).setDepth(D).setOrigin(1, 0),
      )
    }

    // ── Cosmetic texts ───────────────────────────────────────────────────────
    for (let i = 0; i < COSMETIC_IDS.length; i++) {
      const cx = PX + 75 + i * 138
      this.cosTexts.push(
        scene.add.text(cx, CONT_Y + 96, '', {
          fontSize: '12px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#aabbcc',
        }).setScrollFactor(0).setDepth(D).setOrigin(0.5, 0),
        scene.add.text(cx, CONT_Y + 114, '', {
          fontSize: '10px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#446655',
        }).setScrollFactor(0).setDepth(D).setOrigin(0.5, 0),
      )
    }

    // ── Stat texts ───────────────────────────────────────────────────────────
    this.statsHeader = scene.add.text(CONT_X + 8, CONT_Y + 145, 'ACCOUNT STATS', {
      fontSize: '10px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#334455',
    }).setScrollFactor(0).setDepth(D)

    const statLabels = ['Total Kills', 'Elite Kills', 'Gold Collected', 'Highest Level', 'Highest Streak', 'Sessions', 'Dailies Done']
    for (let i = 0; i < statLabels.length; i++) {
      const col = i % 2
      const row = Math.floor(i / 2)
      const sx  = CONT_X + col * 410
      const sy  = CONT_Y + 164 + row * 60
      this.statTexts.push(
        scene.add.text(sx, sy, statLabels[i], {
          fontSize: '10px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#446677',
        }).setScrollFactor(0).setDepth(D),
        scene.add.text(sx, sy + 16, '', {
          fontSize: '20px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#7799bb',
        }).setScrollFactor(0).setDepth(D),
      )
    }

    this.allObjs = [
      this.panelGfx, this.footerText, this.statsHeader,
      ...this.tabTexts,
      ...this.chTexts,
      ...this.achTexts,
      ...this.cosTexts,
      ...this.statTexts,
    ]

    this.hide()
    prog.onChange = () => { if (this.visible) this.refresh() }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  isOpen()  { return this.visible }
  toggle()  { this.visible ? this.hide() : this.show() }

  show() {
    this.visible = true
    this.allObjs.forEach(o => (o as Phaser.GameObjects.Graphics).setVisible(true))
    this.refresh()
    this.scene.input.on('pointerdown', this.onClick, this)
  }

  hide() {
    this.visible = false
    this.allObjs.forEach(o => (o as Phaser.GameObjects.Graphics).setVisible(false))
    this.scene.input.off('pointerdown', this.onClick, this)
  }

  refresh() {
    if (!this.visible) return
    this.drawPanel()

    // Update tab labels
    const labels = ['Daily Challenges', 'Achievements', 'Cosmetics & Stats']
    this.tabTexts.forEach((t, i) =>
      t.setText(labels[i]).setColor(i === this.activeTab ? '#ddeeff' : '#445566')
    )

    const doneCount = ACHIEVEMENTS.filter(a => this.prog.isAchievementUnlocked(a.id)).length
    this.footerText.setText(`${doneCount}/${ACHIEVEMENTS.length} achievements unlocked  •  Challenges reset at midnight`)

    // Hide all content texts, then populate active tab
    ;[...this.chTexts, ...this.achTexts, ...this.cosTexts, ...this.statTexts]
      .forEach(t => t.setVisible(false))
    this.statsHeader.setVisible(false)

    if (this.activeTab === 0)      this.fillChallenges()
    else if (this.activeTab === 1) this.fillAchievements()
    else                           this.fillCosmetics()
  }

  // ── Tab content ────────────────────────────────────────────────────────────

  private fillChallenges() {
    const challenges = this.prog.todayChallenges
    for (let i = 0; i < 3; i++) {
      const ch   = challenges[i]
      const base = i * 4
      if (!ch) continue

      const done     = this.prog.isChallengeComplete(ch.id)
      const progress = this.prog.getChallengeProgress(ch.id)
      const col      = done ? '#44ff88' : '#ccddee'

      this.chTexts[base + 0].setText(ch.desc).setColor(col).setVisible(true)
      this.chTexts[base + 1].setText(`${Math.min(progress, ch.goal)} / ${ch.goal}`).setColor(done ? '#336644' : '#778899').setVisible(true)
      this.chTexts[base + 2].setText(done ? '✓ COMPLETE' : '').setVisible(true)
      this.chTexts[base + 3].setText(`+${ch.xpReward} XP`).setColor(done ? '#aa8833' : '#ffdd88').setVisible(true)
    }
  }

  private fillAchievements() {
    for (let i = 0; i < ACHIEVEMENTS.length; i++) {
      const def      = ACHIEVEMENTS[i]
      const unlocked = this.prog.isAchievementUnlocked(def.id)
      const progress = this.prog.getAchievementProgress(def.id)
      const col      = unlocked ? '#66dd88' : '#778899'
      const name     = `${unlocked ? '✓ ' : ''}${def.name}`

      let rightStr: string
      if (unlocked) {
        rightStr = def.cosmetic ? `${COSMETICS[def.cosmetic].name} skin unlocked` : 'COMPLETE'
      } else {
        const hint = def.cosmetic ? `  → ${COSMETICS[def.cosmetic].name}` : ''
        rightStr   = `${progress} / ${def.goal}${hint}`
      }

      this.achTexts[i * 2 + 0].setText(name).setColor(col).setVisible(true)
      this.achTexts[i * 2 + 1].setText(rightStr).setColor(unlocked ? '#336644' : '#445566').setVisible(true)
    }
  }

  private fillCosmetics() {
    const s = this.prog.stats
    const statVals = [s.totalKills, s.eliteKills, s.totalGold, s.highestLevel, s.highestStreak, s.sessionsPlayed, s.dailiesCompleted]

    for (let i = 0; i < COSMETIC_IDS.length; i++) {
      const id       = COSMETIC_IDS[i]
      const def      = COSMETICS[id]
      const unlocked = this.prog.unlockedCosmetics.includes(id)
      const equipped = this.prog.equippedCosmetic === id

      this.cosTexts[i * 2 + 0]
        .setText(def.name)
        .setColor(unlocked ? '#ccddee' : '#334455')
        .setVisible(true)

      this.cosTexts[i * 2 + 1]
        .setText(equipped ? '[EQUIPPED]' : unlocked ? '[click to equip]' : def.desc)
        .setColor(equipped ? '#44ff88' : unlocked ? '#446655' : '#334444')
        .setVisible(true)
    }

    this.statsHeader.setVisible(true)
    for (let i = 0; i < this.statTexts.length / 2; i++) {
      this.statTexts[i * 2 + 0].setVisible(true)
      this.statTexts[i * 2 + 1].setText(String(statVals[i] ?? 0)).setVisible(true)
    }
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  private drawPanel() {
    const g = this.panelGfx
    g.clear()

    // Panel background
    g.fillStyle(BG, 0.97)
    g.fillRoundedRect(PX, PY, PW, PH, 6)
    g.lineStyle(1, BORDER, 0.8)
    g.strokeRoundedRect(PX, PY, PW, PH, 6)

    // Tab backgrounds
    for (let i = 0; i < 3; i++) {
      const tx = PX + (PW / 3) * i
      const tw = PW / 3
      g.fillStyle(i === this.activeTab ? TAB_COLORS[i] : 0x0d0d12, 1)
      g.fillRect(tx + 1, PY + 1, tw - 1, TAB_H - 1)
    }

    // Tab dividers
    g.lineStyle(1, BORDER, 0.35)
    g.lineBetween(PX + PW / 3,     PY + 1, PX + PW / 3,     PY + TAB_H)
    g.lineBetween(PX + PW * 2 / 3, PY + 1, PX + PW * 2 / 3, PY + TAB_H)

    // Separators
    g.lineStyle(1, BORDER, 0.4)
    g.lineBetween(PX + 8, PY + HDR_H,        PX + PW - 8, PY + HDR_H)
    g.lineBetween(PX + 8, PY + PH - FTR_H,   PX + PW - 8, PY + PH - FTR_H)

    if (this.activeTab === 0)      this.drawChallenges(g)
    else if (this.activeTab === 1) this.drawAchievements(g)
    else                           this.drawCosmetics(g)
  }

  private drawChallenges(g: Phaser.GameObjects.Graphics) {
    const challenges = this.prog.todayChallenges
    for (let i = 0; i < 3; i++) {
      const ch = challenges[i]
      if (!ch) continue
      const done     = this.prog.isChallengeComplete(ch.id)
      const progress = this.prog.getChallengeProgress(ch.id)
      const pct      = Math.min(1, progress / ch.goal)
      const ry       = CONT_Y + 12 + i * 152

      // Card
      g.fillStyle(done ? 0x0a1a0a : 0x0c0c14, 1)
      g.fillRoundedRect(CONT_X, ry, CONT_W, 136, 4)
      g.lineStyle(1, done ? 0x226633 : 0x223344, 0.6)
      g.strokeRoundedRect(CONT_X, ry, CONT_W, 136, 4)

      // Progress bar
      const barX = CONT_X + 14
      const barY = ry + 54
      const barW = CONT_W - 160
      const barH = 10
      g.fillStyle(0x141424, 1)
      g.fillRoundedRect(barX, barY, barW, barH, 4)
      g.fillStyle(done ? 0x33aa55 : 0x3366cc, 1)
      g.fillRoundedRect(barX, barY, Math.max(0, barW * pct), barH, 4)
    }
  }

  private drawAchievements(g: Phaser.GameObjects.Graphics) {
    for (let i = 0; i < ACHIEVEMENTS.length; i++) {
      const def      = ACHIEVEMENTS[i]
      const unlocked = this.prog.isAchievementUnlocked(def.id)
      const progress = this.prog.getAchievementProgress(def.id)
      const ry       = CONT_Y + 4 + i * 42

      // Row background
      g.fillStyle(unlocked ? 0x0a170a : 0x0c0c14, 1)
      g.fillRoundedRect(CONT_X, ry, CONT_W, 36, 3)

      // Icon circle
      g.fillStyle(unlocked ? 0x44aa66 : 0x334455, 1)
      g.fillCircle(CONT_X + 14, ry + 18, 8)

      // Progress bar (only for locked)
      if (!unlocked) {
        const pct  = Math.min(1, progress / def.goal)
        const barW = 160
        const barX = PX + PW - 18 - barW
        g.fillStyle(0x141424, 1)
        g.fillRect(barX, ry + 13, barW, 5)
        g.fillStyle(0x334488, 1)
        g.fillRect(barX, ry + 13, barW * pct, 5)
      }

      // Cosmetic reward dot
      if (def.cosmetic) {
        const cos          = COSMETICS[def.cosmetic]
        const cosUnlocked  = this.prog.unlockedCosmetics.includes(def.cosmetic)
        g.fillStyle(cosUnlocked ? cos.tint : 0x222233, cosUnlocked ? 0.85 : 0.4)
        g.fillCircle(PX + PW - 10, ry + 18, 6)
      }
    }
  }

  private drawCosmetics(g: Phaser.GameObjects.Graphics) {
    // Cosmetic strip background
    g.fillStyle(0x0d0d18, 1)
    g.fillRoundedRect(CONT_X, CONT_Y + 2, CONT_W, 138, 4)
    g.lineStyle(1, 0x223344, 0.4)
    g.strokeRoundedRect(CONT_X, CONT_Y + 2, CONT_W, 138, 4)

    for (let i = 0; i < COSMETIC_IDS.length; i++) {
      const id       = COSMETIC_IDS[i]
      const def      = COSMETICS[id]
      const unlocked = this.prog.unlockedCosmetics.includes(id)
      const equipped = this.prog.equippedCosmetic === id
      const cx       = PX + 75 + i * 138
      const cy       = CONT_Y + 56

      // Equipped glow ring
      if (equipped) {
        g.lineStyle(3, def.tint === 0xffffff ? 0x8888ff : def.tint, 0.9)
        g.strokeCircle(cx, cy, 27)
      }

      // Body
      const bodyCol = def.tint === 0xffffff ? 0x3377ee : def.tint
      g.fillStyle(bodyCol, unlocked ? 0.85 : 0.18)
      g.fillCircle(cx, cy, 22)

      // Glint
      if (unlocked) {
        g.fillStyle(0xffffff, 0.28)
        g.fillCircle(cx - 6, cy - 7, 6)
      }

      // Lock cross for locked cosmetics
      if (!unlocked) {
        g.lineStyle(2, 0x334455, 0.8)
        g.lineBetween(cx - 6, cy - 6, cx + 6, cy + 6)
        g.lineBetween(cx + 6, cy - 6, cx - 6, cy + 6)
      }
    }

    // Stats panel
    g.fillStyle(0x0d0d18, 1)
    g.fillRoundedRect(CONT_X, CONT_Y + 146, CONT_W, CONT_H - 146, 4)
    g.lineStyle(1, 0x223344, 0.35)
    g.strokeRoundedRect(CONT_X, CONT_Y + 146, CONT_W, CONT_H - 146, 4)
    g.lineBetween(CONT_X + 8, CONT_Y + 162, CONT_X + CONT_W - 8, CONT_Y + 162)
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  private onClick = (ptr: Phaser.Input.Pointer) => {
    if (!ptr.leftButtonDown()) return

    // Tab clicks
    for (let i = 0; i < 3; i++) {
      const tx = PX + (PW / 3) * i
      if (ptr.x >= tx && ptr.x <= tx + PW / 3 && ptr.y >= PY && ptr.y <= PY + TAB_H) {
        this.activeTab = i as 0 | 1 | 2
        this.refresh()
        return
      }
    }

    // Cosmetic equip clicks (tab 2)
    if (this.activeTab === 2) {
      for (let i = 0; i < COSMETIC_IDS.length; i++) {
        const cx = PX + 75 + i * 138
        const cy = CONT_Y + 56
        if (Phaser.Math.Distance.Between(ptr.x, ptr.y, cx, cy) <= 26) {
          this.prog.equipCosmetic(COSMETIC_IDS[i])
          return
        }
      }
    }
  }
}
