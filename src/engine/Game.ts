import { formatCopperShort } from '../utils/currency'
import {
  createWorld, addPlayer, tick, WorldState, PlayerState, SimEvent,
  getZoneAt, Balance, fireboltCooldownMax, effMaxMana, equipItem, unequipItem, spendTalent, selfOf,
  extractSave, applySave, SavedPlayer, trainSpell, buyShopItem, acceptQuest, claimQuest,
  stashDeposit, stashWithdraw, dropItem, sellItem,
  acceptFarmQuest, feedBessie, claimFarmQuest, BESSIE_X, BESSIE_Y, FEED_RANGE,
  raidSummary,
} from '../sim'
import { nearestNPC } from './npcs'
import { emptyInput, InputCommand } from '../sim/types'
import type { EquipSlot } from '../items/ItemTypes'
import type { TalentId } from '../talents/TalentTypes'
import { useGameStore, ChatLine } from '../ui/store'
import { Camera } from './Camera'
import { Input } from './Input'
import { Loop } from './Loop'
import { Net } from './Net'
import { Particles } from './Particles'
import { Renderer } from './Renderer'
import { SoundManager } from './Sound'
import { touch, resetTouchEdges } from './touch'
import { minimap, drawMinimap, MINIMAP_ZOOMS } from './minimap'

const LOCAL_ID = 'local'
// Cap network input sends to ~15 Hz (vs. the 60 Hz sim) to stay within the
// Durable Objects free-tier request budget. Prediction hides the lower rate.
const NET_SEND_DT = 1 / 15
// Game server host. Local dev uses wrangler's default port (8787); production
// sets VITE_PARTYKIT_HOST to the deployed Worker host (e.g. frost.<sub>.workers.dev).
const PARTY_HOST = import.meta.env.VITE_PARTYKIT_HOST || `${location.hostname}:8787`
const PARTY_ROOM = 'frost'

/**
 * Client runtime. Starts in single-player (local sim) so the game is instantly
 * playable, and transparently upgrades to networked multiplayer once the
 * PartyKit room connects. If the server is unreachable, it just stays local.
 */
export class Game {
  private ctx: CanvasRenderingContext2D
  private input: Input
  private camera = new Camera()
  private renderer: Renderer
  private fx = new Particles()
  private loop: Loop
  private local: WorldState
  private net: Net | null = null
  private mode: 'local' | 'net' = 'local'
  private hudAccum = 0
  private saveAccum = 0
  private lastNearNpc = false
  private lastNearPlayerId: string | null = null
  private lastNearBessie = false
  private tradeOpen = false
  // Network input throttling. Each inbound WS message is a Durable Object
  // "request", so sending 60×/s/player burns the free tier in hours. We coalesce
  // input and flush at NET_SEND_HZ, skipping sends entirely while idle.
  private netSendAccum = 0
  private pendingCmd = emptyInput()
  private lastSentIdle = false
  private pid = getPid()
  /** name -> active speech bubble (ms remaining). */
  private bubbles = new Map<string, { text: string; ms: number }>()

  constructor(private canvas: HTMLCanvasElement, name: string, private online: boolean, private sound?: SoundManager) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas context unavailable')
    this.ctx = ctx
    this.renderer = new Renderer(ctx)
    this.input = new Input(canvas)

    this.local = createWorld(Date.now() & 0xffffffff)
    const lp0 = addPlayer(this.local, LOCAL_ID, name)
    const saved = loadLocalSave()
    if (saved) applySave(lp0, saved)   // restore solo progress
    // Soft cap in solo: a logged-in member account lifts the level-10 cap.
    lp0.member = !!useGameStore.getState().account?.member

    touch.active = isTouchDevice()   // must be set before resize() (it picks zoom)
    this.camera.bounds = this.local.bounds
    this.resize()
    const lp = this.localPlayer()
    if (lp) this.camera.snap(lp.x, lp.y)

    // Multiplayer only connects when the player chose "Play Online" — solo stays
    // a pure local sim (zero server cost). Falls back to local if it can't connect.
    if (this.online) {
      this.net = new Net(PARTY_HOST, PARTY_ROOM, name, this.pid, (status) => {
        useGameStore.getState().setNet(status)
        if (status === 'connected') this.mode = 'net'
        else if (status === 'offline' && this.mode === 'net') this.mode = 'local'
      })
      useGameStore.getState().setNet('connecting')
    } else {
      useGameStore.getState().setNet('offline')
    }
    window.addEventListener('beforeunload', this.saveOnExit)

    // Let React panels drive equip/talent actions (local sim or networked).
    useGameStore.getState().setActions({
      equip: (id) => this.doEquip(id),
      unequip: (slot) => this.doUnequip(slot),
      buyTalent: (id) => this.doTalent(id),
      train: (spell) => this.doTrain(spell),
      buy: (idx) => this.doBuy(idx),
      acceptQuest: () => this.doQuest('accept'),
      claimQuest: () => this.doQuest('claim'),
      farmAccept: () => this.doFarm('accept'),
      farmFeed: () => this.doFarm('feed'),
      farmClaim: () => this.doFarm('claim'),
      stashDeposit: (id) => this.doStash('deposit', id),
      stashWithdraw: (id) => this.doStash('withdraw', id),
      drop: (id) => { if (this.mode === 'net' && this.net) this.net.drop(id); else { const p = this.localPlayer(); if (p) dropItem(p, id) } },
      sell: (id) => { if (this.mode === 'net' && this.net) this.net.sell(id); else { const p = this.localPlayer(); if (p) sellItem(p, id) } },
      // Trading only exists in multiplayer (no other players in the local sim).
      tradeRequest: (toId) => this.net?.tradeRequest(toId),
      tradeAccept: () => this.net?.tradeAccept(),
      tradeDecline: () => this.net?.tradeDecline(),
      tradeOffer: (items, gold) => this.net?.tradeOffer(items, gold),
      tradeConfirm: () => this.net?.tradeConfirm(),
      tradeCancel: () => this.net?.tradeCancel(),
      sendChat: (text) => this.doChat(text),
    })
    useGameStore.getState().setMobile(touch.active)

    window.addEventListener('resize', this.resize)
    window.addEventListener('orientationchange', this.resize)
    window.visualViewport?.addEventListener('resize', this.resize)
    document.addEventListener('visibilitychange', this.onVisibility)
    this.loop = new Loop(this.update, this.render)
    this.loop.start()
  }

  private onVisibility = () => {
    if (document.hidden) {
      this.sound?.suspend()
    } else {
      this.loop.resetTiming()   // no catch-up burst
      this.sound?.resume()
    }
  }

  private resize = () => {
    const dpr = window.devicePixelRatio || 1
    // Size from the canvas's actual rendered box (CSS fills the viewport), not
    // window.innerHeight — the latter mismatches the visible area on mobile and
    // leaves a gap at the bottom.
    const rect = this.canvas.getBoundingClientRect()
    const w = Math.max(1, Math.round(rect.width))
    const h = Math.max(1, Math.round(rect.height))
    this.canvas.width = Math.round(w * dpr)
    this.canvas.height = Math.round(h * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.camera.setViewport(w, h)
    // Zoom out on touch devices so more of the world is visible (phones have a
    // small CSS viewport, which otherwise looks very zoomed-in).
    this.camera.zoom = touch.active ? Math.max(0.45, Math.min(0.8, w / 760)) : 1
  }

  /** The world currently being rendered (local sim or networked snapshot). */
  private get world(): WorldState { return this.mode === 'net' && this.net ? this.net.world : this.local }
  private get localId(): string { return this.mode === 'net' && this.net ? this.net.localId : LOCAL_ID }
  private localPlayer(): PlayerState | undefined {
    return this.world.players.find(p => p.id === this.localId)
  }

  private buildInput(): InputCommand {
    const cmd = emptyInput()

    // Movement: keyboard, or the touch joystick when it's being used.
    cmd.move = this.input.getMove()
    if (touch.active && (Math.abs(touch.move.x) > 0.01 || Math.abs(touch.move.y) > 0.01)) {
      cmd.move = { x: touch.move.x, y: touch.move.y }
    }

    const ptr = this.input.getPointer()
    const touchCasting = touch.active && (touch.castBolt || touch.blizzard)
    if (touchCasting) {
      // On touch, spells auto-aim at the nearest enemy.
      const near = this.nearestEnemy()
      const lp = this.localPlayer()
      cmd.aim = near ?? (lp ? { x: lp.x + lp.facing * 120, y: lp.y } : { x: 0, y: 0 })
    } else {
      cmd.aim = this.camera.screenToWorld(ptr.x, ptr.y)
    }

    cmd.castBolt = ptr.down || this.input.isDown('f') || (touch.active && touch.castBolt)
    cmd.swapBolt = this.input.consumePressed('x') || touch.swap
    cmd.castArcane = this.input.consumePressed('q') || touch.arcane
    cmd.castNova = this.input.consumePressed('e') || touch.nova
    cmd.castBlizzard = this.input.consumePressed('r') || touch.blizzard
    resetTouchEdges()
    return cmd
  }

  /** Closest other player within trade range (multiplayer only). */
  private nearestPlayer(): { id: string; name: string } | null {
    if (this.mode !== 'net') return null
    const lp = this.localPlayer()
    if (!lp) return null
    let best: { id: string; name: string } | null = null
    let bd = 170   // TRADE_RANGE
    for (const p of this.world.players) {
      if (p.id === this.localId) continue
      const d = Math.hypot(p.x - lp.x, p.y - lp.y)
      if (d < bd) { bd = d; best = { id: p.id, name: p.name } }
    }
    return best
  }

  private nearestEnemy(): { x: number; y: number } | null {
    const lp = this.localPlayer()
    if (!lp) return null
    let best: { x: number; y: number } | null = null
    let bd = Infinity
    for (const e of this.world.enemies) {
      if (e.dying) continue
      const d = Math.hypot(e.x - lp.x, e.y - lp.y)
      if (d < bd) { bd = d; best = { x: e.x, y: e.y } }
    }
    return best
  }

  private update = (dt: number) => {
    // E (or the mobile Talk button) interacts with a nearby NPC; checked before
    // buildInput so it takes priority over Frost Nova (also E).
    const lpNow = this.localPlayer()
    const npc = lpNow ? nearestNPC(lpNow.x, lpNow.y) : null
    if (npc && (this.input.consumePressed('e') || touch.interact)) useGameStore.getState().setPanel(npc.panel)
    if (!!npc !== this.lastNearNpc) { this.lastNearNpc = !!npc; useGameStore.getState().setNearNpc(!!npc) }

    // Feed Bessie: when the farm quest is active and you stand by the hen, E feeds her.
    const farmQuest = (this.mode === 'net' && this.net ? this.net.self?.farmQuest : (lpNow ? selfOf(lpNow).farmQuest : 0)) ?? 0
    const nearBessie = !npc && !!lpNow && farmQuest === 1 &&
      Math.hypot(lpNow.x - BESSIE_X, lpNow.y - BESSIE_Y) < FEED_RANGE
    if (nearBessie && (this.input.consumePressed('e') || touch.interact)) {
      this.doFarm('feed')
      if (lpNow) this.fx.text(BESSIE_X, BESSIE_Y - 20, '🌾 *cluck!*', '#ffe066', 16)
    }
    if (nearBessie !== this.lastNearBessie) { this.lastNearBessie = nearBessie; useGameStore.getState().setNearBessie(nearBessie) }

    // Nearby player → press G (or the mobile Trade button) to request a trade.
    const near = this.nearestPlayer()
    if (near && (this.input.consumePressed('g') || touch.trade)) this.net?.tradeRequest(near.id)
    if ((near?.id ?? null) !== this.lastNearPlayerId) {
      this.lastNearPlayerId = near?.id ?? null
      useGameStore.getState().setNearPlayer(near)
    }

    const cmd = this.buildInput()

    if (this.mode === 'net' && this.net) {
      this.queueNetInput(cmd)
      this.netSendAccum += dt
      // Cast/swap presses (edge events) flush immediately so they feel instant;
      // movement/aim flush at a capped rate; a fully-idle, unchanged input is
      // dropped (the server keeps the last command we sent).
      const edge = this.pendingCmd.swapBolt || this.pendingCmd.castArcane || this.pendingCmd.castNova || this.pendingCmd.castBlizzard
      if (edge || this.netSendAccum >= NET_SEND_DT) { this.flushNetInput(); this.netSendAccum = 0 }
      this.net.update(dt, cmd.move)
      this.handleEvents(this.net.drainEvents())
    } else {
      tick(this.local, { [LOCAL_ID]: cmd }, dt)
      this.handleEvents(this.local.events)
    }

    // Panel toggles (I = inventory, T = talents).
    if (this.input.consumePressed('i')) useGameStore.getState().togglePanel('inventory')
    if (this.input.consumePressed('t')) useGameStore.getState().togglePanel('talents')
    if (this.input.consumePressed('b')) useGameStore.getState().togglePanel('shop')
    // Enter opens chat.
    if (this.input.consumePressed('enter') && !useGameStore.getState().chatOpen) {
      useGameStore.getState().setChatOpen(true)
    }
    // Surface inbound chat lines (+ speech bubbles).
    if (this.net) for (const line of this.net.drainChat()) this.receiveChat(line)
    // Age out speech bubbles.
    for (const [name, b] of this.bubbles) { b.ms -= dt * 1000; if (b.ms <= 0) this.bubbles.delete(name) }

    this.fx.update(dt)
    this.camera.tickShake(dt)
    const lp = this.localPlayer()
    if (lp) this.camera.follow(lp.x, lp.y)
    this.input.endFrame()

    this.hudAccum += dt
    if (this.hudAccum >= 0.1) { this.hudAccum = 0; this.pushHud() }

    // Solo progress is saved to localStorage (multiplayer is saved server-side).
    if (this.mode === 'local') {
      this.saveAccum += dt
      if (this.saveAccum >= 8) { this.saveAccum = 0; if (lp) saveLocalSave(lp) }
    }
  }

  /** Accumulate this frame's intent into the pending network command. */
  private queueNetInput(cmd: InputCommand) {
    this.pendingCmd.move = cmd.move
    this.pendingCmd.aim = cmd.aim
    this.pendingCmd.castBolt = cmd.castBolt
    this.pendingCmd.pickup = cmd.pickup
    this.pendingCmd.swapBolt ||= cmd.swapBolt
    this.pendingCmd.castArcane ||= cmd.castArcane
    this.pendingCmd.castNova ||= cmd.castNova
    this.pendingCmd.castBlizzard ||= cmd.castBlizzard
  }

  /** Send the coalesced command — unless we're idle and already sent idle. */
  private flushNetInput() {
    const c = this.pendingCmd
    const idle = c.move.x === 0 && c.move.y === 0 && !c.castBolt && !c.pickup &&
      !c.swapBolt && !c.castArcane && !c.castNova && !c.castBlizzard
    if (idle && this.lastSentIdle) return    // nothing changed; don't spend a request
    this.net?.sendInput(c)
    this.lastSentIdle = idle
    c.swapBolt = c.castArcane = c.castNova = c.castBlizzard = false   // consume edges
  }

  private saveOnExit = () => {
    if (this.mode === 'local') { const p = this.localPlayer(); if (p) saveLocalSave(p) }
  }

  // ── Equip / talent actions ───────────────────────────────────────────────
  private doEquip(itemId: number) {
    if (this.mode === 'net' && this.net) this.net.equip(itemId)
    else { const p = this.localPlayer(); if (p) equipItem(p, itemId) }
  }
  private doUnequip(slot: EquipSlot) {
    if (this.mode === 'net' && this.net) this.net.unequip(slot)
    else { const p = this.localPlayer(); if (p) unequipItem(p, slot) }
  }
  private doTalent(id: TalentId) {
    if (this.mode === 'net' && this.net) this.net.buyTalent(id)
    else { const p = this.localPlayer(); if (p) spendTalent(p, id) }
  }
  private doTrain(spell: string) {
    if (this.mode === 'net' && this.net) this.net.train(spell)
    else { const p = this.localPlayer(); if (p) trainSpell(p, spell) }
  }
  private doBuy(idx: number) {
    if (this.mode === 'net' && this.net) this.net.buy(idx)
    else { const p = this.localPlayer(); if (p) buyShopItem(p, idx) }
  }
  private doQuest(which: 'accept' | 'claim') {
    if (this.mode === 'net' && this.net) { which === 'accept' ? this.net.acceptQuest() : this.net.claimQuest() }
    else { const p = this.localPlayer(); if (p) (which === 'accept' ? acceptQuest : claimQuest)(p) }
  }
  private doFarm(which: 'accept' | 'feed' | 'claim') {
    if (this.mode === 'net' && this.net) {
      which === 'accept' ? this.net.farmAccept() : which === 'feed' ? this.net.farmFeed() : this.net.farmClaim()
    } else {
      const p = this.localPlayer()
      if (p) (which === 'accept' ? acceptFarmQuest : which === 'feed' ? feedBessie : claimFarmQuest)(p)
    }
  }
  private doStash(which: 'deposit' | 'withdraw', itemId: number) {
    if (this.mode === 'net' && this.net) { which === 'deposit' ? this.net.stashDeposit(itemId) : this.net.stashWithdraw(itemId) }
    else { const p = this.localPlayer(); if (p) (which === 'deposit' ? stashDeposit : stashWithdraw)(p, itemId) }
  }
  private doChat(text: string) {
    const t = text.trim()
    if (!t) return
    if (this.mode === 'net' && this.net) this.net.sendChat(t)   // echoes back via drainChat
    else this.receiveChat({ from: this.localPlayer()?.name ?? 'You', text: t })
  }

  private receiveChat(line: ChatLine) {
    useGameStore.getState().addChat(line)
    if (!line.sys && line.from) this.bubbles.set(line.from, { text: line.text, ms: 5000 })
  }

  private minimapAccum = 0
  private render = () => {
    this.renderer.draw(this.camera, this.world, this.fx, this.localId, this.bubbles)
    // Minimap, throttled to ~10 fps (the base layer is cached; only dots redraw).
    const mc = minimap.canvas
    if (mc && ++this.minimapAccum >= 6) {
      this.minimapAccum = 0
      const mctx = mc.getContext('2d')
      if (mctx) drawMinimap(mctx, this.world, this.localId, MINIMAP_ZOOMS[minimap.zoom] ?? MINIMAP_ZOOMS[1])
    }
  }

  private handleEvents(events: SimEvent[]) {
    const s = this.sound
    const lp = this.localPlayer()
    const isLocal = (pid: string) => pid === this.localId
    for (const ev of events) {
      switch (ev.type) {
        case 'cast':
          this.fx.ring(ev.x, ev.y + 18, ev.kind === 'frost' ? 0x44aaff : 0xff8800, 34, 0.2, 2)
          ev.kind === 'frost' ? s?.onFrostboltCast() : s?.onFireboltCast()
          break
        case 'impact':
          this.fx.ring(ev.x, ev.y, ev.kind === 'frost' ? 0x88ddff : 0xffaa22, 44, 0.26)
          this.fx.burst(ev.x, ev.y, 14, ev.kind === 'frost'
            ? [0xffffff, 0x88eeff, 0x44aaff] : [0xffffff, 0xffcc44, 0xff8800, 0xff4400], { speedMax: 320 })
          ev.kind === 'frost' ? s?.onFrostboltImpact() : s?.onFireboltImpact()
          break
        case 'enemyHit': {
          const col = ev.crit ? '#ffff44' : ev.frost ? '#66ccff' : '#ff8800'
          const sz = ev.damage >= 80 ? 26 : ev.damage >= 40 ? 22 : 18
          this.fx.text(ev.x, ev.y - 20, `${ev.crit ? 'CRIT! ' : ''}-${ev.damage}`, col, sz)
          break
        }
        case 'enemyDeath':
          this.fx.burst(ev.x, ev.y, 20, [ev.color, 0xffffff], { speedMax: 200, life: 0.52 })
          this.fx.text(ev.x, ev.y - 36, ev.mult > 1 ? `+${ev.xp} XP  ×${ev.mult.toFixed(2)}` : `+${ev.xp} XP`,
            ev.mult > 1 ? '#aaff44' : '#77dd44', ev.mult > 1 ? 18 : 15)
          s?.onEnemyDeath()
          break
        case 'playerHit':
          this.fx.text(ev.x, ev.y - 20, `-${ev.damage}`, '#ff4444', 20)
          if (isLocal(ev.pid)) s?.onPlayerHit()
          break
        case 'aoe':
          if (ev.kind === 'arcane') {
            this.fx.ring(ev.x, ev.y, 0xcc44ff, ev.radius, 0.34, 4)
            this.fx.burst(ev.x, ev.y, 26, [0xcc44ff, 0xee88ff, 0xffffff], { speedMax: ev.radius * 1.8, life: 0.45 })
            s?.onArcaneExplosion()
          } else if (ev.kind === 'nova') {
            this.fx.ring(ev.x, ev.y, 0x88ddff, ev.radius, 0.4, 4)
            this.fx.burst(ev.x, ev.y, 24, [0x88ddff, 0xaaeeff, 0xffffff], { speedMax: ev.radius * 1.6, life: 0.5 })
            s?.onFrostNova()
          } else s?.onBlizzardCast()
          break
        case 'freeze':
          this.fx.burst(ev.x, ev.y, 8, [0x88ddff, 0xaaeeff, 0xffffff], { speedMax: 110, life: 0.4 })
          break
        case 'bossSlam':
          this.fx.ring(ev.x, ev.y, 0xff5522, ev.radius, 0.4, 6)
          this.fx.burst(ev.x, ev.y, 28, [0xff8844, 0xffcc44, 0xffffff], { speedMax: ev.radius * 2, life: 0.5 })
          s?.onArcaneExplosion()
          break
        case 'spellGated':
          if (isLocal(ev.pid) && lp) this.fx.text(lp.x, lp.y - 34, `Train ${ev.spell} at the Shop (B) — Lv ${ev.level}+`, '#cc99ff', 13)
          break
        case 'learnedSpell':
          if (isLocal(ev.pid) && lp) this.fx.text(lp.x, lp.y - 60, `Learned ${ev.spell}!`, '#88ffcc', 20)
          break
        case 'levelUp':
          if (isLocal(ev.pid) && lp) { this.fx.text(lp.x, lp.y - 50, `LEVEL ${ev.level}!`, '#ffee44', 26); s?.onLevelUp() }
          break
        case 'pickup':
          if (ev.gold !== undefined) this.fx.text(ev.x, ev.y - 20, formatCopperShort(ev.gold), '#ffdd00', 14)
          else if (ev.item) {
            const col = { common: '#aaaaaa', magic: '#5599ff', rare: '#ffdd00', epic: '#cc44ff' }[ev.item.rarity]
            const pfx = ev.item.rarity === 'epic' ? '★ ' : ev.item.rarity === 'rare' ? '◆ ' : ''
            this.fx.text(ev.x, ev.y - 20, `${pfx}${ev.item.name}`, col, ev.item.rarity === 'epic' ? 18 : 14)
          }
          break
        case 'rareSlain':
          if (lp) this.fx.text(lp.x, lp.y - 60, `☠ ${ev.label} Slain!`, '#ffaa00', 24)
          break
        case 'screenShake':
          this.camera.shake(ev.intensity)
          break
        default: break
      }
    }
  }

  private pushHud() {
    const p = this.localPlayer()
    if (!p) return
    // Inventory/talent panel data.
    useGameStore.getState().setSelf(this.mode === 'net' && this.net ? this.net.self : selfOf(p))
    // Raid banner data (from the snapshot online, or the local sim solo).
    useGameStore.getState().setRaid(this.mode === 'net' && this.net ? this.net.raid : raidSummary(this.local))

    // Auto-open the trade window when a trade starts; close it when it ends.
    const trade = this.mode === 'net' && this.net ? this.net.self?.trade ?? null : null
    if (trade && !this.tradeOpen) { this.tradeOpen = true; useGameStore.getState().setPanel('trade') }
    else if (!trade && this.tradeOpen) {
      this.tradeOpen = false
      if (useGameStore.getState().panel === 'trade') useGameStore.getState().setPanel('none')
    }
    const zone = getZoneAt(p.x, p.y)
    const arcaneMax = fireboltCooldownMax(p)
    const novaMax = Balance.spells.frostNova.cooldownMs
    const blizzMax = Balance.spells.blizzard.cooldownMs
    useGameStore.getState().setHud({
      hp: Math.round(p.stats.hp), maxHp: p.stats.maxHp,
      mana: Math.round(p.stats.mana), maxMana: effMaxMana(p),
      xp: Math.round(p.stats.xp), xpToNext: p.stats.xpToNext, level: p.stats.level,
      gold: p.gold, activeBolt: p.activeBolt, dead: p.dead,
      learnedSpells: p.learnedSpells,
      zone: zone?.name ?? 'Wilds',
      zoneColor: zone?.labelColor ?? '#cfe3ff',
      spells: [
        { key: 'Q', label: 'Arcane', cdPct: arcaneMax ? p.cd.arcaneBlast / arcaneMax : 0, learned: p.learnedSpells.includes('arcaneBlast') },
        { key: 'E', label: 'Nova',   cdPct: novaMax ? p.cd.frostNova / novaMax : 0,     learned: p.learnedSpells.includes('frostNova') },
        { key: 'R', label: 'Blizz',  cdPct: blizzMax ? p.cd.blizzard / blizzMax : 0,    learned: p.learnedSpells.includes('blizzard') },
      ],
    })
  }

  destroy() {
    this.saveOnExit()
    this.loop.stop()
    this.input.destroy()
    this.net?.close()
    window.removeEventListener('resize', this.resize)
    window.removeEventListener('orientationchange', this.resize)
    window.visualViewport?.removeEventListener('resize', this.resize)
    document.removeEventListener('visibilitychange', this.onVisibility)
    window.removeEventListener('beforeunload', this.saveOnExit)
  }
}

function isTouchDevice(): boolean {
  return 'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0
}

// ── Per-browser identity + solo save (localStorage) ─────────────────────────
function getPid(): string {
  try {
    // A logged-in account pins the save id so the character follows the user
    // across devices; guests get a random per-browser id.
    const account = localStorage.getItem('frost_account_pid')
    if (account) return account
    let id = localStorage.getItem('frost_pid')
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('frost_pid', id) }
    return id
  } catch { return 'local' }
}

function loadLocalSave(): SavedPlayer | null {
  try { const raw = localStorage.getItem('frost_save'); return raw ? JSON.parse(raw) as SavedPlayer : null }
  catch { return null }
}

function saveLocalSave(p: PlayerState) {
  try { localStorage.setItem('frost_save', JSON.stringify(extractSave(p))) } catch { /* storage full/blocked */ }
}
