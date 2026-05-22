import { TALENT_DEFS, TALENT_TREES, TREE_COLOR, TREE_LABEL, TREE_UNLOCK_LEVEL, talentsForTree } from '../talents/TalentTypes'
import { TalentSystem } from '../systems/TalentSystem'

declare const window: Window & {
  __gpPanel: { open(el: HTMLElement): void; close(el: HTMLElement): void }
}

export class TalentUI {
  private visible  = false
  private backdrop: HTMLElement
  private colEls:  HTMLElement[]  // [frost, fire, arcane]
  private footerEl: HTMLElement

  constructor(_scene: unknown, private talents: TalentSystem) {
    this.backdrop = document.createElement('div')
    this.backdrop.className = 'gp-backdrop'
    this.backdrop.style.display = 'none'

    // Build 3-column structure
    const colsHTML = TALENT_TREES.map(tree => `
      <div class="gp-tree-col tree-${tree}" data-tree="${tree}">
        <div class="gp-tree-header">${TREE_LABEL[tree]}</div>
        <div class="gp-tree-rows" data-tree-rows="${tree}"></div>
      </div>
    `).join('')

    this.backdrop.innerHTML = `
      <div class="gp-panel gp-panel-talent">
        <div class="gp-header">
          <span class="gp-title">Talent Trees</span>
          <button class="gp-close">✕</button>
        </div>
        <div class="gp-talent-body">${colsHTML}</div>
        <div class="gp-talent-footer" id="gp-talent-footer"></div>
      </div>
    `
    document.body.appendChild(this.backdrop)

    this.colEls   = TALENT_TREES.map(t => this.backdrop.querySelector(`.gp-tree-col.tree-${t}`) as HTMLElement)
    this.footerEl = this.backdrop.querySelector('#gp-talent-footer')!

    this.backdrop.querySelector('.gp-close')!.addEventListener('click', () => this.hide())
    this.backdrop.addEventListener('click', this.onClick)

    talents.onChange = () => this.refresh()
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
    this.renderTrees()
    const pts = this.talents.points
    this.footerEl.textContent = pts > 0
      ? `${pts} talent point${pts > 1 ? 's' : ''} available`
      : 'No talent points — earn more by leveling up'
    this.footerEl.style.color = pts > 0 ? '#ffdd44' : '#445566'
  }

  private renderTrees() {
    TALENT_TREES.forEach((tree, colIdx) => {
      const col       = this.colEls[colIdx]
      const unlocked  = this.talents.treeUnlocked(tree)
      const rowsEl    = col.querySelector('[data-tree-rows]') as HTMLElement
      const treeColor = TREE_COLOR[tree]

      // Locked/unlocked state on column
      col.classList.toggle('locked-tree', !unlocked)

      rowsEl.innerHTML = ''

      talentsForTree(tree).forEach(def => {
        const rank    = this.talents.getRank(def.id)
        const canBuy  = this.talents.canBuy(def.id)
        const maxed   = rank >= def.maxRank

        const row = document.createElement('div')
        row.className = `gp-talent-row tree-${tree}` + (rank > 0 ? ' has-rank' : '')
        row.dataset.talentId = def.id

        // Rank dots
        const filledDots = '●'.repeat(rank)
        const emptyDots  = '○'.repeat(def.maxRank - rank)
        const dotsHTML = filledDots.split('').map(d => `<span class="filled">${d}</span>`).join('')
          + emptyDots.split('').map(d => `<span class="empty">${d}</span>`).join('')

        // Description text
        const descText = maxed
          ? '<span style="color:#556644">MAX</span>'
          : (rank < def.maxRank ? `<span style="color:#778899">${def.rankDesc[rank]}</span>` : '')

        // Buy button
        let btnHTML = ''
        if (!maxed) {
          const disabled = !canBuy || !unlocked
          btnHTML = `<button class="gp-buy-btn" data-talent-id="${def.id}" ${disabled ? 'disabled' : ''}>[+]</button>`
        }

        row.innerHTML = `
          <div class="gp-talent-name">${def.name}</div>
          <div class="gp-rank-dots">${dotsHTML}</div>
          <div class="gp-talent-desc">${descText}</div>
          ${btnHTML}
        `

        // Lock overlay for locked tree
        if (!unlocked) {
          const ov = document.createElement('div')
          ov.className = 'gp-lock-overlay'
          ov.textContent = `Unlocks at\nlevel ${TREE_UNLOCK_LEVEL[tree]}`
          ov.style.whiteSpace = 'pre'

          // Only show overlay on first row to cover the whole column
          rowsEl.style.position = 'relative'
          if (talentsForTree(tree).indexOf(def) === 0) {
            // Append overlay to column after all rows (done after loop)
          }
        }

        void treeColor
        rowsEl.appendChild(row)
      })

      // Add lock overlay covering rows area
      const existingOv = col.querySelector('.gp-lock-overlay')
      if (existingOv) existingOv.remove()

      if (!unlocked) {
        const ov = document.createElement('div')
        ov.className = 'gp-lock-overlay'
        ov.innerHTML = `Unlocks at<br>level ${TREE_UNLOCK_LEVEL[tree]}`
        rowsEl.style.position = 'relative'
        rowsEl.appendChild(ov)
      }
    })
  }

  private onClick = (e: MouseEvent) => {
    const btn = (e.target as HTMLElement).closest('[data-talent-id]') as HTMLElement | null
    if (!btn || (btn as HTMLButtonElement).disabled) return
    const id = btn.dataset.talentId as Parameters<TalentSystem['buy']>[0]
    if (id) this.talents.buy(id)
  }
}
