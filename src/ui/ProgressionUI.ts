import {
  ProgressionSystem, ACHIEVEMENTS, COSMETICS, COSMETIC_IDS,
} from '../systems/ProgressionSystem'

declare const window: Window & {
  __gpPanel: { open(el: HTMLElement): void; close(el: HTMLElement): void }
}

export class ProgressionUI {
  private visible    = false
  private activeTab  = 0
  private backdrop:  HTMLElement
  private contentEl: HTMLElement
  private tabEls:    HTMLElement[]

  constructor(_scene: unknown, private prog: ProgressionSystem) {
    this.backdrop = document.createElement('div')
    this.backdrop.className = 'gp-backdrop'
    this.backdrop.style.display = 'none'

    const tabs = ['Daily Challenges', 'Achievements', 'Cosmetics & Stats']
    const tabsHTML = tabs.map((t, i) =>
      `<div class="gp-prog-tab${i === 0 ? ' active' : ''}" data-tab="${i}">${t}</div>`
    ).join('')

    this.backdrop.innerHTML = `
      <div class="gp-panel gp-panel-prog">
        <div class="gp-header">
          <span class="gp-title">Progression</span>
          <button class="gp-close">✕</button>
        </div>
        <div class="gp-prog-tabs">${tabsHTML}</div>
        <div class="gp-prog-content" id="gp-prog-content"></div>
        <div class="gp-prog-footer" id="gp-prog-footer"></div>
      </div>
    `
    document.body.appendChild(this.backdrop)

    this.contentEl = this.backdrop.querySelector('#gp-prog-content')!
    this.tabEls    = Array.from(this.backdrop.querySelectorAll('.gp-prog-tab')) as HTMLElement[]

    this.backdrop.querySelector('.gp-close')!.addEventListener('click', () => this.hide())
    this.backdrop.querySelector('.gp-prog-tabs')!.addEventListener('click', e => this.onTabClick(e as MouseEvent))
    this.backdrop.addEventListener('click', e => this.onBodyClick(e as MouseEvent))

    prog.onChange = () => { if (this.visible) this.refresh() }
  }

  isOpen()  { return this.visible }
  toggle()  { this.visible ? this.hide() : this.show() }

  show() {
    this.visible = true
    this.refresh()
    window.__gpPanel.open(this.backdrop)
  }

  hide() {
    this.visible = false
    window.__gpPanel.close(this.backdrop)
  }

  refresh() {
    if (!this.visible) return
    this.updateFooter()
    this.renderTab()
  }

  private updateFooter() {
    const done  = ACHIEVEMENTS.filter(a => this.prog.isAchievementUnlocked(a.id)).length
    const footer = this.backdrop.querySelector('#gp-prog-footer') as HTMLElement
    footer.textContent = `${done}/${ACHIEVEMENTS.length} achievements unlocked  •  Challenges reset at midnight`
  }

  private renderTab() {
    if (this.activeTab === 0)      this.renderChallenges()
    else if (this.activeTab === 1) this.renderAchievements()
    else                           this.renderCosmetics()
  }

  private renderChallenges() {
    const challenges = this.prog.todayChallenges
    this.contentEl.innerHTML = challenges.slice(0, 3).map(ch => {
      if (!ch) return ''
      const done = this.prog.isChallengeComplete(ch.id)
      const prog = Math.min(this.prog.getChallengeProgress(ch.id), ch.goal)
      const pct  = Math.round((prog / ch.goal) * 100)
      return `
        <div class="gp-ch-card${done ? ' done' : ''}">
          <div class="gp-ch-title">${ch.desc}</div>
          <div class="gp-ch-sub">${prog} / ${ch.goal}${done ? '  ✓ COMPLETE' : ''}</div>
          <div class="gp-prog-bar"><div class="gp-prog-fill${done ? ' done' : ''}" style="width:${pct}%"></div></div>
          <div class="gp-ch-reward">+${ch.xpReward} XP</div>
        </div>
      `
    }).join('')
  }

  private renderAchievements() {
    this.contentEl.innerHTML = ACHIEVEMENTS.map(def => {
      const unlocked = this.prog.isAchievementUnlocked(def.id)
      const progress = this.prog.getAchievementProgress(def.id)
      const pct      = Math.round(Math.min(1, progress / def.goal) * 100)

      let rightText: string
      if (unlocked) {
        rightText = def.cosmetic ? `${COSMETICS[def.cosmetic].name} skin unlocked` : 'COMPLETE'
      } else {
        const hint = def.cosmetic ? `→ ${COSMETICS[def.cosmetic].name}` : ''
        rightText  = `${progress} / ${def.goal}  ${hint}`
      }

      const barHTML = !unlocked
        ? `<div class="gp-ach-bar"><div class="gp-ach-fill" style="width:${pct}%"></div></div>`
        : ''

      return `
        <div class="gp-ach-row">
          <div class="gp-ach-icon${unlocked ? ' done' : ''}">${unlocked ? '✓' : ''}</div>
          <div class="gp-ach-body">
            <div class="gp-ach-name${unlocked ? ' done' : ''}">${def.name}</div>
            <div class="gp-ach-desc">${def.desc}</div>
            ${barHTML}
          </div>
          <div class="gp-ach-right${unlocked ? ' done' : ''}">${rightText}</div>
        </div>
      `
    }).join('')
  }

  private renderCosmetics() {
    const s = this.prog.stats
    const statData = [
      { label: 'Total Kills',     val: s.totalKills },
      { label: 'Elite Kills',     val: s.eliteKills },
      { label: 'Gold Collected',  val: s.totalGold },
      { label: 'Highest Level',   val: s.highestLevel },
      { label: 'Highest Streak',  val: s.highestStreak },
      { label: 'Sessions',        val: s.sessionsPlayed },
      { label: 'Dailies Done',    val: s.dailiesCompleted },
    ]

    const cosHTML = `
      <div class="gp-cos-strip">
        ${COSMETIC_IDS.map(id => {
          const def      = COSMETICS[id]
          const unlocked = this.prog.unlockedCosmetics.includes(id)
          const equipped = this.prog.equippedCosmetic === id
          const hex      = '#' + def.tint.toString(16).padStart(6, '0')
          return `
            <div class="gp-cos-card${equipped ? ' equipped' : ''}${!unlocked ? ' locked' : ''}" data-cos-id="${id}">
              <div class="gp-cos-dot" style="background:${hex};${equipped ? `box-shadow:0 0 10px ${hex}88` : ''}"></div>
              <div class="gp-cos-name">${def.name}</div>
              ${equipped ? '<div class="gp-cos-hint">EQUIPPED</div>'
                : unlocked ? '<div class="gp-cos-hint">click to equip</div>'
                : `<div class="gp-cos-hint">${def.desc}</div>`}
            </div>
          `
        }).join('')}
      </div>
    `

    const statsHTML = `
      <div class="gp-stats-header">Account Stats</div>
      <div class="gp-stats-grid">
        ${statData.map(s => `
          <div class="gp-stat-card">
            <div class="gp-stat-label">${s.label}</div>
            <div class="gp-stat-val">${s.val ?? 0}</div>
          </div>
        `).join('')}
      </div>
    `

    this.contentEl.innerHTML = cosHTML + statsHTML
  }

  private onTabClick = (e: MouseEvent) => {
    const tab = (e.target as HTMLElement).closest('[data-tab]') as HTMLElement | null
    if (!tab) return
    this.activeTab = parseInt(tab.dataset.tab!)
    this.tabEls.forEach((el, i) => el.classList.toggle('active', i === this.activeTab))
    this.renderTab()
  }

  private onBodyClick = (e: MouseEvent) => {
    const cos = (e.target as HTMLElement).closest('[data-cos-id]') as HTMLElement | null
    if (!cos) return
    const id = cos.dataset.cosId as Parameters<ProgressionSystem['equipCosmetic']>[0]
    if (id && this.prog.unlockedCosmetics.includes(id)) {
      this.prog.equipCosmetic(id)
    }
  }
}
