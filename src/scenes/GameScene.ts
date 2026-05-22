import Phaser from 'phaser'
import { Player } from '../entities/Player'
import { Enemy } from '../entities/Enemy'
import { EnemyConfig, Slime, Ghoul, Imp, Brute, Wraith, Elite } from '../entities/EnemyTypes'
import { Boss } from '../entities/Boss'
import { BossConfig, ALL_BOSSES } from '../entities/BossTypes'
import { World, SpawnZone, ZoneDef, DungeonEntrance, getZoneAt, ZONE_DEFS } from '../world/World'
import { spawnFirebolt, destroyBolt, spawnImpact, spawnCastEffect } from '../spells/Firebolt'
import { castArcaneExplosion } from '../spells/ArcaneExplosion'
import { castFrostNova } from '../spells/FrostNova'
import { spawnBlizzard } from '../spells/Blizzard'
import { HUD } from '../ui/HUD'
import { SoundManager } from '../audio/SoundManager'
import Balance from '../config/Balance'
import { generateItem, generateGold } from '../items/ItemGen'
import { LootDrop } from '../world/LootDrop'
import { InventoryUI } from '../ui/InventoryUI'
import { StashUI } from '../ui/StashUI'
import { Stash } from '../systems/Stash'
import { TalentUI } from '../ui/TalentUI'
import { ProgressionUI } from '../ui/ProgressionUI'
import { MobileControls } from '../ui/MobileControls'
import { ChatUI } from '../ui/ChatUI'
import { InspectPanel } from '../ui/InspectPanel'
import { SocialSystem } from '../social/SocialSystem'
import { PartySystem } from '../social/PartySystem'
import { ProgressionSystem, COSMETICS } from '../systems/ProgressionSystem'
import { RARITY_COLOR } from '../items/ItemTypes'
import { Device } from '../config/DeviceConfig'

const WORLD       = 3600
const RESPAWN_MS  = 6000

export class GameScene extends Phaser.Scene {
  private player!:     Player
  private world!:      World
  private enemies:     Enemy[] = []
  private enemyGroup!: Phaser.Physics.Arcade.Group
  private bolts!:      Phaser.Physics.Arcade.Group
  private wraithBolts!: Phaser.Physics.Arcade.Group
  private hud!:        HUD
  private sfx!:        SoundManager
  private lootDrops:     LootDrop[] = []
  private burnTimers:    Map<Enemy, Phaser.Time.TimerEvent> = new Map()
  private inventoryUI!:   InventoryUI
  private talentUI!:      TalentUI
  private progressionUI!: ProgressionUI
  private stash!:         Stash
  private stashUI!:       StashUI
  private nearStash       = false
  private stashPrompt!:   Phaser.GameObjects.Text
  private progression!:   ProgressionSystem
  private fKey!: Phaser.Input.Keyboard.Key
  private qKey!: Phaser.Input.Keyboard.Key
  private eKey!: Phaser.Input.Keyboard.Key
  private rKey!: Phaser.Input.Keyboard.Key
  private iKey!: Phaser.Input.Keyboard.Key
  private tKey!: Phaser.Input.Keyboard.Key
  private pKey!: Phaser.Input.Keyboard.Key
  private mobileControls: MobileControls | null = null
  // Social systems
  private social!:   SocialSystem
  private party!:    PartySystem
  private chatUI!:   ChatUI
  private inspect!:  InspectPanel
  private tabKey!:   Phaser.Input.Keyboard.Key
  private zoneCounts!: Map<SpawnZone, number>
  private lastFullWarnAt = 0
  private dead           = false
  private killStreak     = 0
  private lastKillTime   = 0
  // Boss system
  private activeBoss:        Boss | null = null
  private bossGroup!:        Phaser.Physics.Arcade.Group
  private bossProjectiles!:  Phaser.Physics.Arcade.Group
  private bossDefeated       = new Set<string>()       // zone names where boss died
  // Dungeon entrances
  private dungeonEntrances:  { entrance: DungeonEntrance; cfg: BossConfig }[] = []
  private nearDungeon:       BossConfig | null = null
  private dungeonPrompt!:    Phaser.GameObjects.Text
  // Zone atmosphere
  private currentZone:   ZoneDef | null = null
  private atmoGraphics!: Phaser.GameObjects.Graphics
  private snowEmitter!:  Phaser.GameObjects.Particles.ParticleEmitter
  private emberEmitter!: Phaser.GameObjects.Particles.ParticleEmitter
  private moteEmitter!:  Phaser.GameObjects.Particles.ParticleEmitter
  // NPCs
  private npcQuest!:    Phaser.GameObjects.Image
  private npcMerchant!: Phaser.GameObjects.Image
  private npcPrompt!:   Phaser.GameObjects.Text
  private nearNPC:      'quest' | 'merchant' | null = null
  private dialogOpen    = false
  private questDialogAction = false
  // Quest system
  private questDefs:     { title: string; desc: string; target: number; xp: number; gold: number }[] = []
  private activeQuestIdx = -1
  private questKills     = 0
  // Quest objective marker (world-space)
  private questMarker:    Phaser.GameObjects.Graphics | null = null
  private questMarkerTxt: Phaser.GameObjects.Text | null = null
  // Premium gate
  private premiumGateShown = false

  constructor() { super('GameScene') }

  create(data?: { playerName?: string }) {
    const playerName = data?.playerName ?? 'Apprentice'
    this.buildPlayerTexture()

    this.world       = new World(this, WORLD)
    this.player      = new Player(this, WORLD / 2, WORLD / 2, playerName)
    this.enemyGroup  = this.physics.add.group()
    this.bolts       = this.physics.add.group()
    this.wraithBolts = this.physics.add.group()
    this.hud         = new HUD(this)
    this.sfx         = new SoundManager(this)
    this.hud.setPlayerName(playerName)
    this.createNPCs()
    this.initDungeonEntrances()
    this.initQuests()

    // Camera: smooth lerp + deadzone so minor movements don't pan the view
    this.cameras.main
      .setBounds(0, 0, WORLD, WORLD)
      .startFollow(this.player, true, 0.07, 0.07)
      .setDeadzone(180, 130)

    const kb  = this.input.keyboard!
    this.fKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.F)
    this.qKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q)
    this.eKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E)
    this.rKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.R)
    this.iKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.I)
    this.tKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.T)
    this.pKey   = kb.addKey(Phaser.Input.Keyboard.KeyCodes.P)
    this.tabKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.TAB)

    this.inventoryUI  = new InventoryUI(this, this.player.inventory)
    this.inventoryUI.onDropItem = (idx) => this.dropInventoryItem(idx)

    this.stash   = new Stash()
    this.stashUI = new StashUI(this, this.stash, this.player.inventory)
    this.stashUI.onDropInventoryItem = (idx) => this.dropInventoryItem(idx)

    this.stashPrompt = this.add.text(
      this.world.stashChestPos.x, this.world.stashChestPos.y - 56,
      '[E] Open stash', {
        fontSize: '11px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#ddaa33',
        stroke: '#000', strokeThickness: 3,
        backgroundColor: '#00000088', padding: { x: 4, y: 2 },
      }
    ).setDepth(10).setOrigin(0.5).setVisible(false)

    this.talentUI     = new TalentUI(this, this.player.talents)
    this.progression  = new ProgressionSystem()
    this.progressionUI = new ProgressionUI(this, this.progression)

    this.progression.onAchievementUnlocked = (def) => {
      const cosName = def.cosmetic ? COSMETICS[def.cosmetic].name : undefined
      this.hud.showAchievementUnlock(def.name, cosName)
      this.applyCosmetic()
    }
    this.progression.onChallengeCompleted = (ch, xpReward) => {
      this.hud.showChallengeComplete(ch.desc, xpReward)
      this.player.gainXP(xpReward)
    }

    this.progression.startSession()
    this.applyCosmetic()

    // ── Mobile / touch setup ─────────────────────────────────────────────
    Device.isMobile = this.sys.game.device.input.touch
    if (Device.isMobile) {
      this.hud.hideControlsHint()
      this.cameras.main.setZoom(1.6)

      this.mobileControls = new MobileControls(
        this,
        // Spell button taps (0=Q 1=E 2=R 3=F)
        (idx) => {
          if (this.dead) return
          const anyUIOpen = this.inventoryUI.isOpen() || this.talentUI.isOpen() || this.progressionUI.isOpen()
          if (anyUIOpen) return
          switch (idx) {
            case 0: this.castArcaneExplosion(); break
            case 1: this.castFrostNova(); break
            case 2: this.castBlizzard(this.player.x, this.player.y); break
            case 3: this.castFireboltAtNearest(); break
          }
        },
        // Menu button taps (I / T / P)
        (key) => {
          switch (key) {
            case 'I':
              this.talentUI.isOpen() && this.talentUI.hide()
              this.progressionUI.isOpen() && this.progressionUI.hide()
              this.inventoryUI.toggle()
              break
            case 'T':
              this.inventoryUI.isOpen() && this.inventoryUI.hide()
              this.progressionUI.isOpen() && this.progressionUI.hide()
              this.talentUI.toggle()
              break
            case 'P':
              this.inventoryUI.isOpen() && this.inventoryUI.hide()
              this.talentUI.isOpen() && this.talentUI.hide()
              this.progressionUI.toggle()
              break
          }
        },
        // Interact button — same as E key
        () => { if (!this.dead) this.handleEInteract() },
      )
    }

    // ── Social systems ────────────────────────────────────────────────────
    this.social  = new SocialSystem()
    this.party   = new PartySystem()
    this.inspect = new InspectPanel(this)
    this.chatUI  = new ChatUI(this, this.social, (cmd) => {
      if (cmd === '/inspect') this.doInspect()
    })

    this.social.onInspect = (data) => this.inspect.show(data)

    // Register local player in party
    this.party.addOrUpdate({
      id:       this.social.profile.id,
      name:     this.social.profile.name,
      level:    this.player.stats.level,
      hp:       this.player.stats.hp,
      maxHp:    this.player.stats.maxHp,
      mana:     this.player.stats.mana,
      maxMana:  this.player.effectiveMaxMana,
      cosmetic: this.social.profile.cosmetic,
      isLocal:  true,
      online:   true,
    })

    this.social.feedEvent(`Welcome, ${this.social.profile.name}!`, '#aaddff')
    this.social.feedEvent('Tab to inspect. Enter for commands.', '#555555')

    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      // Ignore joystick touches and presses inside the joystick zone
      if (this.mobileControls?.isJoystickPtr(ptr.id)) return
      if (this.mobileControls?.isJoystickZone(ptr.x)) return
      if (this.mobileControls?.isControlTap(ptr.x, ptr.y)) return
      if (!ptr.leftButtonDown()) return
      if (this.inventoryUI.isOpen() || this.talentUI.isOpen() || this.progressionUI.isOpen()) return
      this.castFirebolt(ptr.worldX, ptr.worldY)
    })

    // Collision: player and enemies push against obstacles
    this.physics.add.collider(this.player, this.world.obstacles)
    this.physics.add.collider(this.enemyGroup, this.world.obstacles)
    // Enemies push each other apart — prevents the classic "zerg stack" problem
    this.physics.add.collider(this.enemyGroup, this.enemyGroup)
    this.physics.add.collider(this.wraithBolts, this.world.obstacles, (boltObj) => {
      const bolt = boltObj as unknown as Phaser.Physics.Arcade.Sprite
      if (bolt.active) bolt.destroy()
    })

    // Bolt hits enemy
    this.physics.add.overlap(this.bolts, this.enemyGroup, (boltObj, enemyObj) => {
      const bolt  = boltObj  as unknown as Phaser.Physics.Arcade.Sprite
      const enemy = enemyObj as unknown as Enemy
      if (!bolt.active || !enemy.active || enemy.dying) return
      let dmg    = bolt.getData('damage') as number
      const hitX = enemy.x
      const hitY = enemy.y
      destroyBolt(bolt)
      spawnImpact(this, hitX, hitY)

      // Hitstop: 50 ms physics freeze gives every bolt impact physical weight
      this.physics.world.pause()
      this.time.delayedCall(50, () => { if (!this.dead) this.physics.world.resume() })

      this.cameras.main.shake(70, 0.004)
      this.sfx.onFireboltImpact()

      // Permafrost: frozen enemies take bonus damage
      if (this.player.talents.permafrostEnabled && enemy.isFrozen)
        dmg = Math.round(dmg * 1.25)

      const isCrit = Math.random() < this.player.critChance
      if (isCrit) dmg = Math.round(dmg * this.player.talents.bonusCritMult)

      const sz    = dmg >= 80 ? 28 : dmg >= 40 ? 22 : 18
      const label = isCrit ? `CRIT! -${dmg}` : `-${dmg}`
      const col   = isCrit ? '#ffff44' : '#ff8800'
      this.hud.showFloatingText(hitX, hitY - 20, label, col, sz)

      // Aggro chain: enemies near the impact point get pulled into combat
      for (const nearby of this.enemies) {
        if (!nearby.active || nearby.dying || nearby === enemy) continue
        const d = Phaser.Math.Distance.Between(hitX, hitY, nearby.x, nearby.y)
        if (d <= Balance.aggro.chainRadius) nearby.forceAggro()
      }

      // Chilling Touch: slow enemy on bolt hit
      const { chillSlowMult, chillDurationMs } = this.player.talents
      if (chillSlowMult > 0 && !enemy.dying) enemy.slow(chillSlowMult, chillDurationMs)

      // Ignite: apply burn DoT on hit
      if (this.player.talents.igniteRank > 0 && !enemy.dying) this.applyBurn(enemy)

      if (enemy.takeDamage(dmg)) this.killEnemy(enemy)
    })

    // Wraith bolt hits player
    this.physics.add.overlap(this.player, this.wraithBolts, (_p, boltObj) => {
      const bolt = boltObj as unknown as Phaser.Physics.Arcade.Sprite
      if (!bolt.active) return
      const dmg = bolt.getData('damage') as number
      bolt.destroy()
      this.player.takeDamage(dmg)
      this.sfx.onPlayerHit()
      this.cameras.main.shake(130, 0.006)
      this.screenFlash(0xff0000, 0.18, 280)
      this.hud.showFloatingText(this.player.x, this.player.y - 20, `-${dmg}`, '#ff4444', 20)
    })

    // Enemy emits this when a melee or telegraph hit lands
    this.events.on('enemy-hit-player', (_dmg: number) => {
      if (this.dead) return
      this.sfx.onPlayerHit()
      this.cameras.main.shake(160, 0.009)
      this.screenFlash(0xff0000, 0.20, 300)
      this.hud.showFloatingText(this.player.x, this.player.y - 20, `-${_dmg}`, '#ff4444', 22)
    })

    // Enemy (Wraith) fires a projectile
    this.events.on('enemy-shoot', (d: { x: number; y: number; vx: number; vy: number; damage: number }) => {
      if (this.dead) return
      // Cap active bolts so a pack of Wraithes can't fill the screen
      if (this.wraithBolts.getLength() >= 8) return
      const bolt = this.wraithBolts.create(d.x, d.y, 'wraith_bolt') as Phaser.Physics.Arcade.Sprite
      bolt.setData('damage', d.damage)
      ;(bolt.body as Phaser.Physics.Arcade.Body).setCircle(5, 1, 1)
      bolt.setDepth(6)
      bolt.setVelocity(d.vx, d.vy)
      this.time.delayedCall(3000, () => { if (bolt.active) bolt.destroy() })
    })

    // Populate every spawn zone
    this.zoneCounts = new Map()
    for (const zone of this.world.spawnZones) {
      this.zoneCounts.set(zone, 0)
      for (let i = 0; i < zone.maxEnemies; i++) this.spawnFromZone(zone)
    }

    // ── Zone atmosphere overlay (screen-space, depth 1) ───────────────────
    this.atmoGraphics = this.add.graphics().setScrollFactor(0).setDepth(1)

    // ── Ambient particle emitters (screen-space) ──────────────────────────
    // Snow: falls from top of screen (Frozen Ruins)
    this.snowEmitter = this.add.particles(0, 0, 'particle', {
      x:       { min: -20, max: this.scale.width + 20 },
      y:       { min: -30, max: -5 },
      speedY:  { min: 35, max: 80 },
      speedX:  { min: -18, max: 18 },
      lifespan: { min: 5000, max: 10000 },
      scale:   { start: 0.22, end: 0.07 },
      alpha:   { start: 0.72, end: 0 },
      tint:    [0xaad4ff, 0xffffff, 0xddeeff],
      frequency: 360,
      quantity: 1,
    }).setScrollFactor(0).setDepth(2)
    this.snowEmitter.pause()

    // Embers: float up from bottom (Corrupted Fields)
    this.emberEmitter = this.add.particles(0, 0, 'particle', {
      x:       { min: 0, max: this.scale.width },
      y:       { min: 650, max: 670 },
      speedY:  { min: -100, max: -35 },
      speedX:  { min: -30, max: 30 },
      lifespan: { min: 2500, max: 5500 },
      scale:   { start: 0.24, end: 0 },
      alpha:   { start: 0.65, end: 0 },
      tint:    [0xff3300, 0xff6600, 0xdd2200],
      blendMode: 'ADD',
      frequency: 300,
      quantity: 1,
    }).setScrollFactor(0).setDepth(2)
    this.emberEmitter.pause()

    // Arcane motes: drift upward (Arcane Caves)
    this.moteEmitter = this.add.particles(0, 0, 'particle', {
      x:       { min: 0, max: this.scale.width },
      y:       { min: 580, max: 660 },
      speedY:  { min: -65, max: -18 },
      speedX:  { min: -28, max: 28 },
      lifespan: { min: 4000, max: 8000 },
      scale:   { start: 0.30, end: 0 },
      alpha:   { start: 0.52, end: 0 },
      tint:    [0xaa44ff, 0xcc66ff, 0x8822dd, 0xff88ff],
      blendMode: 'ADD',
      frequency: 440,
      quantity: 1,
    }).setScrollFactor(0).setDepth(2)
    this.moteEmitter.pause()

    // Reduce particle emission rate on mobile to ease GPU load
    if (Device.isMobile) {
      this.snowEmitter.setFrequency(720)
      this.emberEmitter.setFrequency(600)
      this.moteEmitter.setFrequency(880)
    }

    // ── Boss system ───────────────────────────────────────────────────────
    this.bossGroup      = this.physics.add.group()
    this.bossProjectiles = this.physics.add.group()

    // Boss projectile destroys on hitting an obstacle
    this.physics.add.collider(this.bossProjectiles, this.world.obstacles, (boltObj) => {
      const bolt = boltObj as unknown as Phaser.Physics.Arcade.Sprite
      if (bolt.active) bolt.destroy()
    })

    // Boss projectile hits player
    this.physics.add.overlap(this.player, this.bossProjectiles, (_p, boltObj) => {
      const bolt = boltObj as unknown as Phaser.Physics.Arcade.Sprite
      if (!bolt.active) return
      const dmg = bolt.getData('damage') as number
      bolt.destroy()
      this.player.takeDamage(dmg)
      this.sfx.onPlayerHit()
      this.cameras.main.shake(130, 0.006)
      this.screenFlash(0xff0000, 0.18, 280)
      this.hud.showFloatingText(this.player.x, this.player.y - 20, `-${dmg}`, '#ff4444', 20)
    })

    // Firebolt hits boss
    this.physics.add.overlap(this.bolts, this.bossGroup, (boltObj, bossObj) => {
      const bolt = boltObj  as unknown as Phaser.Physics.Arcade.Sprite
      const boss = bossObj  as unknown as Boss
      if (!bolt.active || !boss.active || boss.dying) return

      let dmg = bolt.getData('damage') as number
      destroyBolt(bolt)
      spawnImpact(this, boss.x, boss.y)

      this.physics.world.pause()
      this.time.delayedCall(50, () => { if (!this.dead) this.physics.world.resume() })
      this.cameras.main.shake(70, 0.004)
      this.sfx.onFireboltImpact()

      if (this.player.talents.permafrostEnabled && false) {
        // Bosses are immune to freeze — no permafrost bonus
      }
      const isCrit = Math.random() < this.player.critChance
      if (isCrit) dmg = Math.round(dmg * this.player.talents.bonusCritMult)

      const sz    = dmg >= 80 ? 28 : dmg >= 40 ? 22 : 18
      const label = isCrit ? `CRIT! -${dmg}` : `-${dmg}`
      const col   = isCrit ? '#ffff44' : '#ff8800'
      this.hud.showFloatingText(boss.x, boss.y - 20, label, col, sz)

      if (boss.takeDamage(dmg)) this.killBoss()
    })

    // Boss fires a spread projectile
    this.events.on('boss-shoot', (d: { x: number; y: number; vx: number; vy: number; damage: number }) => {
      if (this.dead) return
      const bolt = this.bossProjectiles.create(d.x, d.y, 'boss_bolt') as Phaser.Physics.Arcade.Sprite
      bolt.setData('damage', d.damage)
      ;(bolt.body as Phaser.Physics.Arcade.Body).setCircle(7, 1, 1)
      bolt.setDepth(6)
      bolt.setVelocity(d.vx, d.vy)
      this.time.delayedCall(4500, () => { if (bolt.active) bolt.destroy() })
    })

    // Boss phase transition announcement
    this.events.on('boss-phase', (d: { phase: number; name: string }) => {
      const text  = d.phase === 3 ? 'BERSERKING!' : 'ENRAGED!'
      const color = d.phase === 3 ? '#ff3300' : '#ff9900'
      this.hud.showStreakText(`${d.name}  ${text}`, color, 26)
      this.screenFlash(d.phase === 3 ? 0xff3300 : 0xff9900, 0.13, 500)
    })

    // Auto-start first quest after a brief welcome moment
    this.time.delayedCall(1800, () => {
      if (!this.dead && this.activeQuestIdx < 0) this.autoStartFirstQuest()
    })
  }

  update(_time: number, delta: number) {
    if (this.dead) return

    if (this.player.isDead) {
      this.dead = true
      this.physics.pause()
      this.add.text(this.scale.width / 2, this.scale.height / 2, `YOU DIED\n${this.social.profile.name}\n\nRefresh to restart`, {
        fontSize: '32px', color: '#ff4444',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', align: 'center',
        stroke: '#000000', strokeThickness: 5,
      }).setScrollFactor(0).setDepth(50).setOrigin(0.5)
      return
    }

    // Push joystick direction to player before its update() reads it
    if (this.mobileControls) {
      this.player.joystickDir.x = this.mobileControls.dir.x
      this.player.joystickDir.y = this.mobileControls.dir.y

      this.mobileControls.setCooldowns([
        { cd: this.player.arcaneExplosionCooldown, max: this.player.arcaneExplosionCooldownMax },
        { cd: this.player.frostNovaCooldown,       max: this.player.frostNovaCooldownMax },
        { cd: this.player.blizzardCooldown,        max: this.player.blizzardCooldownMax },
        { cd: this.player.fireboltCooldown,        max: this.player.fireboltCooldownMax },
      ])
      this.mobileControls.update()
    }

    this.player.update(delta)

    const ptr = this.input.activePointer

    // Rotate player sprite to always face the cursor — snappy and intuitive
    this.player.setRotation(
      Phaser.Math.Angle.Between(this.player.x, this.player.y, ptr.worldX, ptr.worldY)
    )

    if (Phaser.Input.Keyboard.JustDown(this.iKey)) {
      this.talentUI.isOpen() && this.talentUI.hide()
      this.progressionUI.isOpen() && this.progressionUI.hide()
      this.inventoryUI.toggle()
    }
    if (Phaser.Input.Keyboard.JustDown(this.tKey)) {
      this.inventoryUI.isOpen() && this.inventoryUI.hide()
      this.progressionUI.isOpen() && this.progressionUI.hide()
      this.talentUI.toggle()
    }
    if (Phaser.Input.Keyboard.JustDown(this.pKey)) {
      this.inventoryUI.isOpen() && this.inventoryUI.hide()
      this.talentUI.isOpen() && this.talentUI.hide()
      this.progressionUI.toggle()
    }

    // NPC / stash / dungeon proximity and E-key interaction
    this.updateNPCProximity()
    this.updateDungeonProximity()
    this.updateStashProximity()

    if (Phaser.Input.Keyboard.JustDown(this.eKey)) this.handleEInteract()

    const anyUIOpen = this.inventoryUI.isOpen() || this.talentUI.isOpen() || this.progressionUI.isOpen() || this.dialogOpen || this.stashUI.isOpen()
    if (!anyUIOpen) {
      if (Phaser.Input.Keyboard.JustDown(this.fKey)) this.castFirebolt(ptr.worldX, ptr.worldY)
      if (Phaser.Input.Keyboard.JustDown(this.qKey)) this.castArcaneExplosion()
      if (!this.nearNPC && !this.nearStash && !this.nearDungeon && Phaser.Input.Keyboard.JustDown(this.eKey)) this.castFrostNova()
      if (Phaser.Input.Keyboard.JustDown(this.rKey)) this.castBlizzard(ptr.worldX, ptr.worldY)
    }

    // Proximity loot pickup
    for (let i = this.lootDrops.length - 1; i >= 0; i--) {
      const drop = this.lootDrops[i]
      if (!drop.active) { this.lootDrops.splice(i, 1); continue }
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, drop.x, drop.y)
      if (d <= drop.pickupRadius) this.pickupDrop(drop)
    }

    for (const enemy of this.enemies) {
      if (!enemy.active) continue
      enemy.update(delta, this.player, this.enemies)
    }

    if (this.activeBoss?.active && !this.activeBoss.dying) {
      this.activeBoss.update(delta, this.player)
      this.hud.tickBossBar(this.activeBoss.hp, this.activeBoss.phase)
    }

    // Tab — inspect nearest entity (or self)
    if (Phaser.Input.Keyboard.JustDown(this.tabKey)) this.doInspect()

    this.chatUI.update()
    this.inspect.update()

    const aggroCount = this.enemies.filter(e => e.active && !e.dying && e.isChasing).length
    this.hud.update(this.player, aggroCount)

    // Clip bolts that cross a zone boundary — prevents sniping across zones
    for (const child of this.bolts.getChildren()) {
      const b = child as Phaser.Physics.Arcade.Sprite
      if (!b.active) continue
      const castZone = b.getData('castZone') as string | undefined
      if (castZone === undefined) continue
      const currZone = getZoneAt(b.x, b.y)?.name ?? '__town__'
      if (currZone !== castZone) destroyBolt(b)
    }

    // Zone detection — triggers atmosphere + ambient effects on entry
    const zone = getZoneAt(this.player.x, this.player.y)
    if (zone !== this.currentZone) this.enterZone(zone)
  }

  // ── Combat ────────────────────────────────────────────────────────────────

  private castFirebolt(worldX: number, worldY: number) {
    if (!this.player.canCastFirebolt()) {
      if (this.player.fireboltCooldown > 0) this.hud.notifyCastFailed(3)
      else this.hud.notifyOOM()
      return
    }
    this.player.spendFireboltCost()
    spawnCastEffect(this, this.player.x, this.player.y)
    const bolt = spawnFirebolt(this, this.bolts, this.player.x, this.player.y, worldX, worldY, this.player.effectiveSpellDamage)
    bolt.setData('castZone', getZoneAt(this.player.x, this.player.y)?.name ?? '__town__')
    this.sfx.onFireboltCast()
  }

  private castArcaneExplosion() {
    if (!this.player.hasSpell('arcaneExplosion')) {
      this.hud.showFloatingText(this.player.x, this.player.y - 30, 'Arcane Explosion — unlocks at level 4', '#8866aa', 13)
      return
    }
    if (!this.player.canCastArcaneExplosion()) {
      if (this.player.arcaneExplosionCooldown > 0) this.hud.notifyCastFailed(0)
      else this.hud.notifyOOM()
      return
    }
    this.player.spendArcaneExplosionCost()

    const t      = this.player.talents
    const radius = Math.round(Balance.spells.arcaneExplosion.radius * t.bonusAoEMult)
    castArcaneExplosion(this, this.player.x, this.player.y, radius)
    this.cameras.main.shake(90, 0.007)
    this.sfx.onArcaneExplosion()

    const baseArcDmg = Math.round(
      Balance.spells.arcaneExplosion.baseDamage + t.bonusArcExDamage
      + this.player.effectiveSpellDamage * 0.5
    )
    const playerZoneName = getZoneAt(this.player.x, this.player.y)?.name ?? '__town__'
    for (const enemy of [...this.enemies]) {
      if (!enemy.active || enemy.dying) continue
      if ((getZoneAt(enemy.x, enemy.y)?.name ?? '__town__') !== playerZoneName) continue
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y)
      if (d > radius) continue
      const wasFrozen = enemy.isFrozen
      const isCrit    = Math.random() < this.player.critChance
      const dmg       = isCrit ? Math.round(baseArcDmg * t.bonusCritMult) : baseArcDmg
      const label     = isCrit ? `CRIT! -${dmg}` : wasFrozen ? `SHATTER -${dmg}` : `-${dmg}`
      const col       = isCrit ? '#ffff44' : wasFrozen ? '#aaffff' : '#cc44ff'
      this.hud.showFloatingText(enemy.x, enemy.y - 20, label, col)
      if (enemy.takeDamage(dmg)) this.killEnemy(enemy)
    }
    // Boss takes ArcEx damage too
    if (this.activeBoss && !this.activeBoss.dying) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.activeBoss.x, this.activeBoss.y)
      if (d <= radius) {
        const isCrit = Math.random() < this.player.critChance
        const dmg    = isCrit ? Math.round(baseArcDmg * t.bonusCritMult) : baseArcDmg
        const label  = isCrit ? `CRIT! -${dmg}` : `-${dmg}`
        this.hud.showFloatingText(this.activeBoss.x, this.activeBoss.y - 20, label, isCrit ? '#ffff44' : '#cc44ff')
        if (this.activeBoss.takeDamage(dmg)) this.killBoss()
      }
    }
  }

  private castFrostNova() {
    if (!this.player.hasSpell('frostNova')) {
      this.hud.showFloatingText(this.player.x, this.player.y - 30, 'Frost Nova — unlocks at level 8', '#4488cc', 13)
      return
    }
    if (!this.player.canCastFrostNova()) {
      if (this.player.frostNovaCooldown > 0) this.hud.notifyCastFailed(1)
      else this.hud.notifyOOM()
      return
    }
    this.player.spendFrostNovaCost()

    const radius   = Math.round(Balance.spells.frostNova.radius * this.player.talents.bonusAoEMult)
    const freezeMs = Balance.spells.frostNova.freezeMs + this.player.talents.bonusFreezeMs
    castFrostNova(this, this.player.x, this.player.y, radius)
    this.cameras.main.shake(80, 0.005)
    this.sfx.onFrostNova()

    const frostPlayerZone = getZoneAt(this.player.x, this.player.y)?.name ?? '__town__'
    for (const enemy of [...this.enemies]) {
      if (!enemy.active || enemy.dying) continue
      if ((getZoneAt(enemy.x, enemy.y)?.name ?? '__town__') !== frostPlayerZone) continue
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y)
      if (d > radius) continue
      enemy.freeze(freezeMs)
      this.hud.showFloatingText(enemy.x, enemy.y - 20, 'FROZEN', '#88ddff')
    }
    // Boss resists freeze but still takes impact damage
    if (this.activeBoss && !this.activeBoss.dying) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.activeBoss.x, this.activeBoss.y)
      if (d <= radius) {
        const dmg = Math.round(this.player.effectiveSpellDamage * 0.8)
        this.hud.showFloatingText(this.activeBoss.x, this.activeBoss.y - 20, `FROST -${dmg}`, '#88ddff')
        if (this.activeBoss.takeDamage(dmg)) this.killBoss()
      }
    }
  }

  private castBlizzard(worldX: number, worldY: number) {
    if (!this.player.hasSpell('blizzard')) {
      this.hud.showFloatingText(this.player.x, this.player.y - 30, 'Blizzard — unlocks at level 14', '#44aadd', 13)
      return
    }
    if (!this.player.canCastBlizzard()) {
      if (this.player.blizzardCooldown > 0) this.hud.notifyCastFailed(2)
      else this.hud.notifyOOM()
      return
    }
    this.player.spendBlizzardCost()

    const { tickDamage, slowMult, slowDurationMs } = Balance.spells.blizzard
    const radius   = Math.round(Balance.spells.blizzard.radius * this.player.talents.bonusAoEMult)
    const spellDmg = this.player.effectiveSpellDamage
    this.sfx.onBlizzardCast()

    const blizzPlayerZone = getZoneAt(this.player.x, this.player.y)?.name ?? '__town__'
    spawnBlizzard(this, worldX, worldY, (cx, cy) => {
      // Snapshot to avoid mutation issues during kill processing
      for (const enemy of [...this.enemies]) {
        if (!enemy.active || enemy.dying) continue
        if ((getZoneAt(enemy.x, enemy.y)?.name ?? '__town__') !== blizzPlayerZone) continue
        const d = Phaser.Math.Distance.Between(cx, cy, enemy.x, enemy.y)
        if (d > radius) continue
        const wasFrozen = enemy.isFrozen
        enemy.slow(slowMult, slowDurationMs)
        const dmg   = Math.round(tickDamage + spellDmg * 0.4)
        const label = wasFrozen ? `SHATTER -${dmg}` : `-${dmg}`
        const col   = wasFrozen ? '#aaffff' : '#44aaff'
        this.hud.showFloatingText(enemy.x, enemy.y - 20, label, col)
        if (enemy.takeDamage(dmg)) this.killEnemy(enemy)
      }
      // Boss hit by blizzard tick (immune to slow)
      if (this.activeBoss && !this.activeBoss.dying) {
        const d = Phaser.Math.Distance.Between(cx, cy, this.activeBoss.x, this.activeBoss.y)
        if (d <= radius) {
          const dmg = Math.round(tickDamage + spellDmg * 0.4)
          this.hud.showFloatingText(this.activeBoss.x, this.activeBoss.y - 20, `-${dmg}`, '#44aaff')
          if (this.activeBoss.takeDamage(dmg)) this.killBoss()
        }
      }
    })
  }

  /** Mobile F-button: auto-aims Firebolt at the nearest active enemy or boss. */
  private castFireboltAtNearest() {
    let tx = this.input.activePointer.worldX
    let ty = this.input.activePointer.worldY
    let nearestDist = Infinity

    for (const e of this.enemies) {
      if (!e.active || e.dying) continue
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y)
      if (d < nearestDist) { nearestDist = d; tx = e.x; ty = e.y }
    }
    if (this.activeBoss?.active && !this.activeBoss.dying) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.activeBoss.x, this.activeBoss.y)
      if (d < nearestDist) { tx = this.activeBoss.x; ty = this.activeBoss.y }
    }

    this.castFirebolt(tx, ty)
  }

  private doInspect() {
    let nearest: Enemy | Boss | null = null
    let nearestDist = Infinity

    for (const e of this.enemies) {
      if (!e.active || e.dying) continue
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y)
      if (d < nearestDist) { nearestDist = d; nearest = e }
    }
    if (this.activeBoss?.active && !this.activeBoss.dying) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.activeBoss.x, this.activeBoss.y)
      if (d < nearestDist) { nearest = this.activeBoss }
    }

    if (nearest instanceof Boss) {
      this.social.inspectLocal({
        name:   nearest.cfg.name,
        level:  0,
        hp:     Math.round(nearest.hp),
        maxHp:  nearest.cfg.maxHp,
        type:   'boss',
        extra:  [`Phase ${nearest.phase}  |  Zone: ${nearest.cfg.zoneId}`],
      })
    } else if (nearest instanceof Enemy) {
      const extras: string[] = []
      if (nearest.cfg.aiType === 'elite') extras.push('Elite — drops rare loot')
      if (nearest.isFrozen) extras.push('Status: Frozen')
      else if (nearest.burning) extras.push('Status: Burning')
      this.social.inspectLocal({
        name:   nearest.cfg.key,
        level:  0,
        hp:     Math.round(nearest.hp),
        maxHp:  nearest.cfg.hp,
        type:   nearest.cfg.aiType,
        extra:  extras.length ? extras : undefined,
      })
    } else {
      // No nearby enemy — inspect self
      const stats = this.progression.stats
      this.social.inspectLocal({
        name:    this.social.profile.name,
        level:   this.player.stats.level,
        hp:      Math.round(this.player.stats.hp),
        maxHp:   this.player.stats.maxHp,
        mana:    this.player.stats.mana,
        maxMana: this.player.effectiveMaxMana,
        type:    'player',
        extra:   [
          `Kills: ${stats.totalKills}   Gold: ${this.player.inventory.gold}g`,
          `Spell Power: ${this.player.effectiveSpellDamage}`,
        ],
      })
    }
  }

  private killEnemy(enemy: Enemy) {
    const zone = enemy.getData('zone') as SpawnZone | undefined

    const i = this.enemies.indexOf(enemy)
    if (i !== -1) this.enemies.splice(i, 1)
    this.enemyGroup.remove(enemy as unknown as Phaser.GameObjects.GameObject, false, false)

    this.sfx.onEnemyDeath()

    // Multikill bonus: each additional aggroed enemy at kill time adds +25% XP
    const aggroedCount = this.enemies.filter(e => e !== enemy && e.active && !e.dying && e.isChasing).length
    const xpMult       = 1 + aggroedCount * Balance.xp.multikillBonus
    const xpGained     = Math.round(enemy.cfg.xpReward * xpMult)

    // Always show XP; highlight multikills with the multiplier
    if (aggroedCount > 0) {
      this.hud.showFloatingText(enemy.x, enemy.y - 36, `+${xpGained} XP  ×${xpMult.toFixed(2)}`, '#aaff44', 18)
    } else {
      this.hud.showFloatingText(enemy.x, enemy.y - 36, `+${xpGained} XP`, '#77dd44', 15)
    }

    const leveled = this.player.gainXP(xpGained)
    if (leveled) {
      this.sfx.onLevelUp()
      this.spawnLevelUpFanfare()
      this.progression.onLevelReached(this.player.stats.level)
      this.onSpellUnlock(this.player.stats.level)
    }
    if (this.player.premiumGateReached && !this.premiumGateShown) this.showPremiumGate()
    if (this.activeQuestIdx >= 0) this.trackQuestKill()

    // Flashpoint: killing a burning enemy resets Firebolt cooldown
    if (this.player.talents.flashpointEnabled && enemy.burning) {
      this.player.fireboltCooldown = 0
      this.hud.showFloatingText(enemy.x, enemy.y - 48, 'FLASHPOINT!', '#ff8844', 16)
    }

    // Clear burn timer for this enemy
    const bt = this.burnTimers.get(enemy)
    if (bt) { bt.remove(false); this.burnTimers.delete(enemy) }
    enemy.burning = false

    const isElite = enemy.cfg.aiType === 'elite'
    this.progression.onKill(isElite)
    if (isElite) this.social.feedEvent(`Elite ${enemy.cfg.key} slain!`, '#ffdd44')
    this.tryDropLoot(enemy)
    enemy.die()
    this.registerKill(enemy.x, enemy.y)

    if (zone) {
      const prev = this.zoneCounts.get(zone) ?? 1
      this.zoneCounts.set(zone, prev - 1)
      this.time.delayedCall(RESPAWN_MS, () => {
        if (!this.dead && (this.zoneCounts.get(zone) ?? 0) < zone.maxEnemies) {
          this.spawnFromZone(zone)
        }
      })
    }
  }

  // ── Talent effects ────────────────────────────────────────────────────────

  private applyBurn(enemy: Enemy) {
    // Cancel any existing burn timer so it refreshes cleanly
    const existing = this.burnTimers.get(enemy)
    if (existing) { existing.remove(false); this.burnTimers.delete(enemy) }

    enemy.burning = true
    const dmg     = this.player.talents.igniteDamagePerTick
    let ticks      = 0
    const timer = this.time.addEvent({
      delay:    500,
      repeat:   3,
      callback: () => {
        if (!enemy.active || enemy.dying) {
          enemy.burning = false
          this.burnTimers.delete(enemy)
          return
        }
        ticks++
        this.hud.showFloatingText(enemy.x, enemy.y - 14, `-${dmg}`, '#ff6622', 13)
        if (enemy.takeDamage(dmg)) this.killEnemy(enemy)
        if (ticks >= 4) {
          enemy.burning = false
          this.burnTimers.delete(enemy)
        }
      },
    })
    this.burnTimers.set(enemy, timer)
  }

  // ── Loot ──────────────────────────────────────────────────────────────────

  private tryDropLoot(enemy: Enemy) {
    const B   = Balance.loot
    const lvl = this.player.stats.level

    if (enemy.cfg.guaranteedDrop) {
      // Elite: always drops a rare+ item and double gold
      const rarity = Math.random() < 0.30 ? 'epic' : 'rare'
      this.lootDrops.push(new LootDrop(this, enemy.x - 14, enemy.y, generateItem(lvl, rarity)))
      this.lootDrops.push(new LootDrop(this, enemy.x + 14, enemy.y, undefined, generateGold(lvl) * 2))
      return
    }

    if (Math.random() < B.itemDropChance) {
      const x = enemy.x + Phaser.Math.Between(-18, 18)
      const y = enemy.y + Phaser.Math.Between(-18, 18)
      this.lootDrops.push(new LootDrop(this, x, y, generateItem(lvl)))
    }
    if (Math.random() < B.goldDropChance) {
      const x = enemy.x + Phaser.Math.Between(-18, 18)
      const y = enemy.y + Phaser.Math.Between(-18, 18)
      this.lootDrops.push(new LootDrop(this, x, y, undefined, generateGold(lvl)))
    }
  }

  private pickupDrop(drop: LootDrop) {
    if (drop.item) {
      if (this.player.inventory.isFull) {
        const now = this.time.now
        if (now - this.lastFullWarnAt > 2000) {
          this.hud.showFloatingText(this.player.x, this.player.y - 30, 'Inventory full!', '#ff8844')
          this.lastFullWarnAt = now
        }
        return
      }
      this.player.inventory.add(drop.item)
      const rarity = drop.item.rarity
      const isRare = rarity === 'rare' || rarity === 'epic'
      const sz  = rarity === 'epic' ? 20 : rarity === 'rare' ? 17 : 13
      const col = RARITY_COLOR[rarity]
      const pfx = rarity === 'epic' ? '★ ' : rarity === 'rare' ? '◆ ' : ''
      this.hud.showFloatingText(drop.x, drop.y - 20, `${pfx}${drop.item.name}`, col, sz)
      if (isRare) {
        // Camera shake for rare+ drops
        this.cameras.main.shake(rarity === 'epic' ? 120 : 60, rarity === 'epic' ? 0.006 : 0.003)
        this.screenFlash(rarity === 'epic' ? 0xaa44ff : 0x4488ff, 0.08, 300)
      }
    } else if (drop.gold !== undefined) {
      this.player.inventory.gold += drop.gold
      this.progression.onGoldCollected(drop.gold)
      const sz  = drop.gold >= 20 ? 16 : 13
      const col = drop.gold >= 20 ? '#ffee44' : '#ffdd00'
      this.hud.showFloatingText(drop.x, drop.y - 20, `+${drop.gold}g`, col, sz)
    }
    const i = this.lootDrops.indexOf(drop)
    if (i !== -1) this.lootDrops.splice(i, 1)
    drop.destroy()
  }

  // ── Kill streak ───────────────────────────────────────────────────────────

  private registerKill(x: number, y: number) {
    const now = this.time.now
    if (now - this.lastKillTime < 2500) {
      this.killStreak++
    } else {
      this.killStreak = 1
    }
    this.lastKillTime = now

    this.progression.onStreakReached(this.killStreak)

    if (this.killStreak === 3) {
      this.hud.showStreakText('TRIPLE KILL', '#ff9900', 28)
    } else if (this.killStreak === 5) {
      this.hud.showStreakText('RAMPAGE!', '#ff5500', 32)
      this.cameras.main.shake(180, 0.010)
    } else if (this.killStreak === 8) {
      this.hud.showStreakText('MASSACRE!', '#ff2200', 36)
      this.cameras.main.shake(240, 0.013)
      this.screenFlash(0xff2200, 0.10, 400)
    } else if (this.killStreak >= 12 && (this.killStreak - 12) % 4 === 0) {
      this.hud.showStreakText('UNSTOPPABLE!', '#ffdd00', 40)
      this.cameras.main.shake(300, 0.016)
      this.screenFlash(0xffdd00, 0.12, 500)
    }

    // Pull nearby loot toward the player when on a hot streak
    if (this.killStreak >= 4) {
      this.lootPulse(x, y, this.killStreak >= 6 ? 350 : 220)
    }
  }

  private lootPulse(originX: number, originY: number, radius: number) {
    for (let i = this.lootDrops.length - 1; i >= 0; i--) {
      const drop = this.lootDrops[i]
      if (!drop.active) continue
      const d = Phaser.Math.Distance.Between(originX, originY, drop.x, drop.y)
      if (d <= radius) this.pickupDrop(drop)
    }
  }

  // ── Boss system ────────────────────────────────────────────────────────────

  private spawnBoss(cfg: BossConfig) {
    // Spawn at the center of the boss's zone
    const zoneDef = ZONE_DEFS.find(z => z.name === cfg.zoneId)
    if (!zoneDef) return

    const bx = zoneDef.x + zoneDef.w / 2
    const by = zoneDef.y + zoneDef.h / 2

    this.activeBoss = new Boss(this, bx, by, cfg)
    this.bossGroup.add(this.activeBoss as unknown as Phaser.GameObjects.GameObject)
    this.physics.add.collider(this.activeBoss, this.world.obstacles)

    this.hud.setBossBar(cfg.name, cfg.maxHp, cfg.maxHp, 1)

    // Arrival announcement
    const t = this.add.text(this.scale.width / 2, this.scale.height / 2 - 25, `⚔  ${cfg.name}  ⚔\nBOSS ENCOUNTER`, {
      fontSize: '22px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#ff5555',
      stroke: '#000000', strokeThickness: 5, align: 'center',
    }).setScrollFactor(0).setDepth(50).setOrigin(0.5).setAlpha(0)

    this.tweens.add({
      targets: t, alpha: 1,
      duration: 320, ease: 'Back.Out',
      onComplete: () => {
        this.tweens.add({
          targets: t, y: 245, alpha: 0,
          duration: 900, delay: 2400, ease: 'Power2',
          onComplete: () => t.destroy(),
        })
      },
    })

    this.screenFlash(0x880000, 0.24, 900)
    this.cameras.main.shake(300, 0.011)
  }

  private killBoss() {
    if (!this.activeBoss) return
    const boss = this.activeBoss
    this.activeBoss = null
    this.bossDefeated.add(boss.cfg.zoneId)
    this.bossGroup.remove(boss as unknown as Phaser.GameObjects.GameObject, false, false)

    // XP reward
    const xp      = boss.cfg.xpReward
    const leveled = this.player.gainXP(xp)
    if (leveled) {
      this.sfx.onLevelUp()
      this.spawnLevelUpFanfare()
      this.progression.onLevelReached(this.player.stats.level)
    }
    this.hud.showFloatingText(boss.x, boss.y - 50, `+${xp} XP`, '#ffdd00', 28)

    // Count as an elite kill for achievements / progression
    this.progression.onKill(true)

    // Guaranteed epic item drops + large gold
    const lvl = this.player.stats.level
    this.lootDrops.push(new LootDrop(this, boss.x - 24, boss.y, generateItem(lvl, 'epic')))
    this.lootDrops.push(new LootDrop(this, boss.x + 24, boss.y, generateItem(lvl, 'epic')))
    this.lootDrops.push(new LootDrop(this, boss.x, boss.y + 22, undefined, generateGold(lvl) * 6))
    this.progression.onGoldCollected(generateGold(lvl) * 6)

    // Big victory announcement
    this.social.feedEvent(`${boss.cfg.name} defeated!`, '#ffdd00')
    this.hud.showStreakText(`${boss.cfg.name}  SLAIN!`, '#ffdd00', 36)
    this.screenFlash(0xffdd00, 0.30, 1100)
    this.cameras.main.shake(420, 0.018)

    this.hud.setBossBar(null, 0, 0)
    boss.die()
  }

  // ── Zone atmosphere ───────────────────────────────────────────────────────

  private enterZone(zone: ZoneDef | null) {
    this.currentZone = zone

    // Pause all ambient emitters, resume the right one
    this.snowEmitter.pause()
    this.emberEmitter.pause()
    this.moteEmitter.pause()
    if (zone?.name === 'Frozen Ruins')     this.snowEmitter.resume()
    if (zone?.name === 'Corrupted Fields') this.emberEmitter.resume()
    if (zone?.name === 'Arcane Caves')     this.moteEmitter.resume()

    // Fade atmosphere overlay to zone color (or clear if central)
    this.tweens.killTweensOf(this.atmoGraphics)
    if (zone) {
      this.atmoGraphics.clear()
      this.atmoGraphics.fillStyle(zone.atmosphere, 1)
      this.atmoGraphics.fillRect(0, 0, this.scale.width, this.scale.height)
      this.tweens.add({ targets: this.atmoGraphics, alpha: zone.atmoAlpha, duration: 1800, ease: 'Power1' })
      this.announceZone(zone)
    } else {
      this.tweens.add({ targets: this.atmoGraphics, alpha: 0, duration: 1800 })
    }
  }

  private announceZone(zone: ZoneDef) {
    const stars = '★'.repeat(zone.danger) + '☆'.repeat(4 - zone.danger)
    const t = this.add.text(this.scale.width / 2, this.scale.height * 0.69, `${zone.name}   ${stars}`, {
      fontSize:        '18px',
      fontFamily:      'monospace',
      color:           zone.labelColor,
      stroke:          '#000000',
      strokeThickness: 5,
    }).setScrollFactor(0).setDepth(50).setOrigin(0.5).setAlpha(0)

    this.tweens.add({
      targets: t, alpha: 1, y: 428,
      duration: 380, ease: 'Back.Out',
      onComplete: () => {
        this.tweens.add({
          targets: t, y: 395, alpha: 0,
          duration: 700, delay: 2000, ease: 'Power2',
          onComplete: () => t.destroy(),
        })
      },
    })
  }

  private applyCosmetic() {
    const tint = COSMETICS[this.progression.equippedCosmetic].tint
    if (tint === 0xffffff) this.player.clearTint()
    else this.player.setTint(tint)
  }

  // ── Screen effects ────────────────────────────────────────────────────────

  /** Full-screen color overlay that fades out — use for hits, level-ups, etc. */
  private screenFlash(color: number, alpha: number, duration: number) {
    const g = this.add.graphics()
    g.fillStyle(color, alpha)
    g.fillRect(0, 0, this.scale.width, this.scale.height)
    g.setScrollFactor(0).setDepth(98)
    this.tweens.add({
      targets: g, alpha: 0,
      duration, ease: 'Power2',
      onComplete: () => g.destroy(),
    })
  }

  private spawnLevelUpFanfare() {
    this.social.feedEvent(`Level ${this.player.stats.level} reached!`, '#ffdd44')
    this.screenFlash(0xffdd00, 0.35, 700)

    // Big animated "LEVEL X" text
    const Z   = this.cameras.main.zoom || 1
    const W   = this.scale.width  / Z
    const H   = this.scale.height / Z
    const lvText = this.add.text(W / 2, H / 2, `LEVEL  ${this.player.stats.level}`, {
      fontSize:        '58px',
      color:           '#ffdd00',
      fontFamily:      'monospace',
      stroke:          '#000000',
      strokeThickness: 9,
    }).setScrollFactor(0).setDepth(51).setOrigin(0.5).setAlpha(0).setScale(0.3)

    this.tweens.add({
      targets: lvText, scaleX: 1, scaleY: 1, alpha: 1,
      duration: 240, ease: 'Back.Out',
      onComplete: () => {
        this.tweens.add({
          targets: lvText, y: H * 0.34, alpha: 0,
          duration: 1100, delay: 650, ease: 'Power2',
          onComplete: () => lvText.destroy(),
        })
      },
    })

    // Expanding ring from player
    const ringGfx = this.add.graphics().setDepth(11)
    let ringR = 10
    const ringTimer = this.time.addEvent({
      delay: 16, repeat: 40,
      callback: () => {
        ringR += 8
        ringGfx.clear()
        ringGfx.lineStyle(4, 0xffdd00, Math.max(0, 1 - ringR / 340))
        ringGfx.strokeCircle(this.player.x, this.player.y, ringR)
      },
    })
    this.time.delayedCall(700, () => { ringGfx.destroy() })

    // Gold particle burst from player
    const burst = this.add.particles(this.player.x, this.player.y, 'particle', {
      speed:     { min: 100, max: 420 },
      scale:     { start: 1.8, end: 0 },
      alpha:     { start: 1, end: 0 },
      lifespan:  1000,
      blendMode: 'ADD',
      tint:      [0xffdd00, 0xffffff, 0xff8800, 0xffcc00],
      angle:     { min: 0, max: 360 },
      emitting:  false,
    }).setDepth(10)
    burst.explode(Device.particleCount(56))
    this.time.delayedCall(1100, () => { if (burst.active) burst.destroy() })
  }

  // ── Spawning ──────────────────────────────────────────────────────────────

  private spawnFromZone(zone: SpawnZone) {
    const angle = Math.random() * Math.PI * 2
    const r     = Phaser.Math.FloatBetween(zone.radius * 0.3, zone.radius)
    const x     = Phaser.Math.Clamp(zone.cx + Math.cos(angle) * r, 80, WORLD - 80)
    const y     = Phaser.Math.Clamp(zone.cy + Math.sin(angle) * r, 80, WORLD - 80)

    const cfg = zone.table[Phaser.Math.Between(0, zone.table.length - 1)]
    const enemy = new Enemy(this, x, y, cfg)
    enemy.homeZone = zone.zoneBounds
    enemy.setData('zone', zone)
    enemy.setData('zoneName', getZoneAt(zone.cx, zone.cy)?.name ?? null)
    this.enemies.push(enemy)
    this.enemyGroup.add(enemy as unknown as Phaser.GameObjects.GameObject)
    this.zoneCounts.set(zone, (this.zoneCounts.get(zone) ?? 0) + 1)
  }

  // ── Textures ──────────────────────────────────────────────────────────────

  private buildPlayerTexture() {
    const g = this.add.graphics()

    // Player — direction indicator dot at top so rotation shows facing
    g.fillStyle(0x3377ee)
    g.fillCircle(16, 16, 14)
    g.fillStyle(0x88bbff, 0.4)
    g.fillCircle(12, 12, 6)    // glint
    g.fillStyle(0xffffff, 0.92)
    g.fillCircle(16, 6, 3)     // bright dot near top → rotates to face cursor
    g.generateTexture('player', 32, 32)
    g.clear()

    // Enemies — base pass for all types
    for (const cfg of [Slime, Ghoul, Imp, Brute, Wraith, Elite] as EnemyConfig[]) {
      const size = cfg.radius * 2 + 4
      const c    = size / 2
      const r    = cfg.radius

      // Elite: outer gold aura ring
      if (cfg.aiType === 'elite') {
        g.lineStyle(4, 0xffdd00, 0.45)
        g.strokeCircle(c, c, r + 3)
      }

      // Wraith: outer glow ring
      if (cfg.aiType === 'ranged') {
        g.lineStyle(2, cfg.color, 0.35)
        g.strokeCircle(c, c, r + 4)
      }

      g.fillStyle(cfg.color)
      g.fillCircle(c, c, r)

      // Brute: dark inner mass to convey heaviness
      if (cfg.aiType === 'tank') {
        g.fillStyle(0x000000, 0.30)
        g.fillCircle(c, c, r * 0.55)
      }

      // Glint highlight
      g.fillStyle(0xffffff, 0.25)
      g.fillCircle(c - r * 0.2, c - r * 0.3, r * 0.38)

      g.generateTexture(cfg.key, size, size)
      g.clear()
    }

    // Boss textures — large orbs with double ring + phase-ready glint
    for (const cfg of ALL_BOSSES) {
      const size = cfg.radius * 2 + 4
      const c    = size / 2
      const r    = cfg.radius

      // Outer aura ring
      g.lineStyle(4, cfg.color, 0.4)
      g.strokeCircle(c, c, r + 4)
      // Dark halo
      g.lineStyle(5, 0x000000, 0.55)
      g.strokeCircle(c, c, r + 1)
      // Main fill
      g.fillStyle(cfg.color)
      g.fillCircle(c, c, r)
      // Inner ring detail
      g.lineStyle(2, 0x000000, 0.30)
      g.strokeCircle(c, c, r * 0.60)
      // Highlight glint
      g.fillStyle(0xffffff, 0.26)
      g.fillCircle(c - r * 0.26, c - r * 0.30, r * 0.36)

      g.generateTexture(cfg.key, size, size)
      g.clear()
    }

    // Boss projectile bolt: larger, fiery orange orb
    g.fillStyle(0xff5522)
    g.fillCircle(8, 8, 8)
    g.fillStyle(0xffbb44, 0.75)
    g.fillCircle(8, 8, 4)
    g.fillStyle(0xffffff, 0.45)
    g.fillCircle(6, 6, 2)
    g.generateTexture('boss_bolt', 16, 16)
    g.clear()

    // Wraith bolt: small purple orb
    g.fillStyle(0xbb44ee)
    g.fillCircle(6, 6, 6)
    g.fillStyle(0xffffff, 0.5)
    g.fillCircle(4, 4, 2)
    g.generateTexture('wraith_bolt', 12, 12)
    g.clear()

    // Firebolt
    g.fillStyle(0xff6600)
    g.fillCircle(7, 7, 7)
    g.fillStyle(0xffcc00, 0.8)
    g.fillCircle(7, 7, 4)
    g.generateTexture('firebolt', 14, 14)
    g.clear()

    // Particle
    g.fillStyle(0xffffff)
    g.fillCircle(4, 4, 4)
    g.generateTexture('particle', 8, 8)
    g.destroy()
  }

  // ── Stash ─────────────────────────────────────────────────────────────────

  private updateStashProximity() {
    const d = Phaser.Math.Distance.Between(
      this.player.x, this.player.y,
      this.world.stashChestPos.x, this.world.stashChestPos.y,
    )
    this.nearStash = d < 100
    this.stashPrompt.setVisible(this.nearStash && !this.stashUI.isOpen())
    if (this.nearStash && !this.nearNPC) this.mobileControls?.showInteract('Stash')
    else if (!this.nearNPC && !this.nearDungeon)  this.mobileControls?.hideInteract()
  }

  private dropInventoryItem(idx: number) {
    const item = this.player.inventory.items[idx]
    if (!item) return
    this.player.inventory.items[idx] = null
    this.player.inventory.onChange?.()
    this.lootDrops.push(new LootDrop(this, this.player.x + Phaser.Math.Between(-20, 20), this.player.y + 16, item))
    this.hud.showFloatingText(this.player.x, this.player.y - 30, `Dropped ${item.name}`, '#888888', 13)
  }

  // ── Dungeon entrances ─────────────────────────────────────────────────────

  private initDungeonEntrances() {
    for (const entrance of this.world.dungeonEntrances) {
      const cfg = ALL_BOSSES.find(b => b.zoneId === entrance.zoneId)
      if (cfg) this.dungeonEntrances.push({ entrance, cfg })
    }

    this.dungeonPrompt = this.add.text(0, 0, '', {
      fontSize: '11px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#cc88ff',
      stroke: '#000000', strokeThickness: 3,
      backgroundColor: '#00000088', padding: { x: 4, y: 2 },
    }).setDepth(10).setOrigin(0.5).setVisible(false)
  }

  private updateDungeonProximity() {
    const px = this.player.x, py = this.player.y
    this.nearDungeon = null
    this.dungeonPrompt.setVisible(false)

    for (const { entrance, cfg } of this.dungeonEntrances) {
      const d = Phaser.Math.Distance.Between(px, py, entrance.x, entrance.y)
      if (d < 110 && !this.bossDefeated.has(cfg.zoneId)) {
        this.nearDungeon = cfg
        this.dungeonPrompt
          .setText(`[E] Enter ${cfg.name}'s dungeon`)
          .setPosition(entrance.x, entrance.y - 72)
          .setVisible(true)
        if (!this.nearNPC) this.mobileControls?.showInteract('Enter')
        break
      }
    }
    if (!this.nearDungeon && !this.nearNPC && !this.nearStash) {
      this.mobileControls?.hideInteract()
    }
  }

  private enterDungeon(cfg: BossConfig) {
    this.dungeonPrompt.setVisible(false)
    this.screenFlash(0x220033, 0.28, 600)
    this.cameras.main.shake(200, 0.009)
    this.time.delayedCall(600, () => {
      if (!this.dead && !this.activeBoss && !this.bossDefeated.has(cfg.zoneId))
        this.spawnBoss(cfg)
    })
  }

  // ── E-key / interact ─────────────────────────────────────────────────────

  private handleEInteract() {
    if (this.nearNPC) {
      if (this.dialogOpen) {
        ;(window as any).__frostModal?.hide()
        this.dismissDialog()
      } else if (this.nearNPC === 'quest') this.openQuestDialog()
      else this.openMerchantDialog()
    } else if (this.nearStash) {
      if (this.stashUI.isOpen()) this.stashUI.hide()
      else {
        this.inventoryUI.isOpen() && this.inventoryUI.hide()
        this.talentUI.isOpen()    && this.talentUI.hide()
        this.progressionUI.isOpen() && this.progressionUI.hide()
        this.stashUI.show()
      }
    } else if (this.nearDungeon && !this.dialogOpen && !this.activeBoss) {
      this.enterDungeon(this.nearDungeon)
    }
  }

  // ── NPCs ──────────────────────────────────────────────────────────────────

  private createNPCs() {
    const cx = WORLD / 2
    const cy = WORLD / 2

    // Quest NPC
    this.npcQuest = this.add.image(cx - 180, cy - 20, 'npc_quest').setDepth(4).setOrigin(0.5, 1)
    this.add.text(cx - 180, cy - 68, 'Elder Mirwen', {
      fontSize: '13px', fontStyle: 'bold',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#cc88ff',
      stroke: '#000', strokeThickness: 4,
    }).setDepth(4).setOrigin(0.5)
    this.add.text(cx - 180, cy - 52, '! Quest', {
      fontSize: '11px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#ffdd44',
      stroke: '#000', strokeThickness: 3,
    }).setDepth(4).setOrigin(0.5)

    // Merchant NPC
    this.npcMerchant = this.add.image(cx + 180, cy - 20, 'npc_merchant').setDepth(4).setOrigin(0.5, 1)
    this.add.text(cx + 180, cy - 68, 'Trader Brom', {
      fontSize: '13px', fontStyle: 'bold',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#ddbb44',
      stroke: '#000', strokeThickness: 4,
    }).setDepth(4).setOrigin(0.5)
    this.add.text(cx + 180, cy - 52, '$ Shop', {
      fontSize: '11px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#aaffaa',
      stroke: '#000', strokeThickness: 3,
    }).setDepth(4).setOrigin(0.5)

    // Direction signs
    const sty = (col: string) => ({ fontSize: '12px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: col, stroke: '#000', strokeThickness: 4 })
    this.add.text(cx, cy + 260, '▼  Beginner Forest',        sty('#44cc44')).setDepth(4).setOrigin(0.5)
    this.add.text(cx, cy - 260, '▲  Frozen Ruins (Danger)',  sty('#88ccff')).setDepth(4).setOrigin(0.5)
    this.add.text(cx - 290, cy, '◄  Corrupted Fields',       sty('#cc4444')).setDepth(4).setOrigin(0.5)
    this.add.text(cx + 290, cy, 'Arcane Caves  ►',           sty('#aa44ff')).setDepth(4).setOrigin(0.5)

    // Proximity prompt (world-space, follows camera)
    this.npcPrompt = this.add.text(0, 0, 'Press E to talk', {
      fontSize: '11px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#ffffcc',
      stroke: '#000000', strokeThickness: 3,
      backgroundColor: '#00000088', padding: { x: 4, y: 2 },
    }).setDepth(10).setOrigin(0.5).setVisible(false)
  }

  private updateNPCProximity() {
    const px = this.player.x, py = this.player.y
    const dQ = Phaser.Math.Distance.Between(px, py, this.npcQuest.x,    this.npcQuest.y)
    const dM = Phaser.Math.Distance.Between(px, py, this.npcMerchant.x, this.npcMerchant.y)
    if (dQ < 90) {
      this.nearNPC = 'quest'
      this.npcPrompt.setPosition(this.npcQuest.x, this.npcQuest.y - 72).setVisible(true)
      this.mobileControls?.showInteract('Talk')
    } else if (dM < 90) {
      this.nearNPC = 'merchant'
      this.npcPrompt.setPosition(this.npcMerchant.x, this.npcMerchant.y - 72).setVisible(true)
      this.mobileControls?.showInteract('Talk')
    } else {
      this.nearNPC = null
      if (!this.dialogOpen) this.npcPrompt.setVisible(false)
      if (!this.nearStash && !this.nearDungeon) this.mobileControls?.hideInteract()
    }
  }

  private openQuestDialog() {
    if (this.dialogOpen) return
    const q = this.questDefs[this.activeQuestIdx]
    let lines: string[]
    if (this.activeQuestIdx < 0) {
      lines = [
        'Elder Mirwen:',
        '',
        '"A new mage arrives in Millhaven."',
        '"The Beginner Forest to the south"',
        '"is teeming with slimes and ghouls."',
        '"Prove your worth — then return."',
        '',
        '[E] Accept first quest',
      ]
      this.questDialogAction = true
    } else if (q && this.questKills >= q.target) {
      lines = [
        'Elder Mirwen:',
        '',
        `"Well done! You have completed:"`,
        `"${q.title}"`,
        '',
        `Reward: +${q.xp} XP  +${q.gold} gold`,
        '',
        '[E] Collect reward',
      ]
      this.questDialogAction = true
    } else if (q) {
      const left = q.target - this.questKills
      lines = [
        'Elder Mirwen:',
        '',
        `Quest: ${q.title}`,
        q.desc,
        '',
        `Progress: ${this.questKills} / ${q.target}  (${left} left)`,
        '',
        '[E] Close',
      ]
      this.questDialogAction = false
    } else {
      lines = [
        'Elder Mirwen:',
        '',
        '"You have proven yourself."',
        '"The full adventure continues"',
        '"in the premium version!"',
        '',
        '[E] Close',
      ]
      this.questDialogAction = false
    }
    this.showDialog(lines)
    this.dialogOpen = true
  }

  private openMerchantDialog() {
    if (this.dialogOpen) return
    const lines = [
      'Trader Brom:',
      '',
      '"Welcome, weary mage!"',
      '"My wares are being restocked."',
      '"A full shop arrives in the"',
      '"premium version of Frost!"',
      '',
      `Gold: ${this.player.inventory.gold} g`,
      '',
      '[E] Close',
    ]
    this.showDialog(lines)
    this.dialogOpen = true
    this.questDialogAction = false
  }

  private showDialog(lines: string[]) {
    const frostModal = (window as any).__frostModal
    if (!frostModal) return

    // lines[0] is always "NpcName:" — strip colon for title
    const title = lines[0].replace(/:$/, '').trim()
    const isMerchant = title.toLowerCase().includes('brom') || title.toLowerCase().includes('trader')

    // body: everything except first line and [E] action lines
    const bodyLines = lines.slice(1).filter(l => !l.startsWith('['))

    // action label from the [E] line
    const actionLine = lines.find(l => l.startsWith('[E]'))
    const actionLabel = actionLine ? actionLine.replace('[E]', '').trim() : 'Close'

    frostModal.show({
      title,
      titleClass: isMerchant ? 'merchant' : '',
      lines: bodyLines,
      buttons: [{ label: actionLabel, primary: true, onClick: () => this.dismissDialog() }],
      onClose: () => this.dismissDialog(),
    })
  }

  private dismissDialog() {
    if (!this.dialogOpen) return
    const hadAction = this.questDialogAction
    this.questDialogAction = false
    this.dialogOpen = false
    this.npcPrompt.setVisible(false)

    if (!hadAction) return

    const q = this.questDefs[this.activeQuestIdx]
    if (this.activeQuestIdx < 0) {
      // Accept first quest
      this.activeQuestIdx = 0
      this.questKills = 0
      this.updateQuestHUD()
      this.hud.showQuestUpdate('Quest accepted!\n' + this.questDefs[0].title, '#aadd44')
    } else if (q && this.questKills >= q.target) {
      // Collect reward
      this.player.gainXP(q.xp)
      this.player.inventory.gold += q.gold
      this.hud.showQuestUpdate(`Quest complete!\n+${q.xp} XP  +${q.gold} gold`, '#ffdd44')
      this.hideQuestObjectiveMarker()
      const next = this.activeQuestIdx + 1
      if (next < this.questDefs.length) {
        this.activeQuestIdx = next
        this.questKills = 0
        this.updateQuestHUD()
        // Quest 1: explore other zones; show a broader marker
        if (next === 1) this.showQuestObjectiveMarker(900, 1760, '▼ Explore Zones')
        this.time.delayedCall(2800, () => {
          this.hud.showQuestUpdate('New quest!\n' + this.questDefs[next].title, '#aadd44')
        })
      } else {
        this.activeQuestIdx = -2
        this.hud.setQuestText('All quests complete!')
        this.hideQuestObjectiveMarker()
      }
    }
  }

  // ── Quest objective marker ────────────────────────────────────────────────

  private showQuestObjectiveMarker(wx: number, wy: number, label: string) {
    this.questMarker?.destroy()
    this.questMarkerTxt?.destroy()

    const g = this.add.graphics().setDepth(3.5)
    this.questMarker = g

    g.lineStyle(3, 0x66ff33, 0.55)
    g.strokeCircle(wx, wy, 190)
    g.lineStyle(2, 0x33ff00, 0.22)
    g.strokeCircle(wx, wy, 240)

    this.tweens.add({
      targets: g,
      alpha: { from: 0.35, to: 1 },
      duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    })

    this.questMarkerTxt = this.add.text(wx, wy - 210, label, {
      fontSize: '13px', fontStyle: 'bold',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      color: '#88ff44', stroke: '#000000', strokeThickness: 4,
    }).setDepth(3.5).setOrigin(0.5)
  }

  private hideQuestObjectiveMarker() {
    this.questMarker?.destroy();    this.questMarker    = null
    this.questMarkerTxt?.destroy(); this.questMarkerTxt = null
  }

  private autoStartFirstQuest() {
    this.activeQuestIdx = 0
    this.questKills = 0
    this.updateQuestHUD()

    // Pulsing ring in the Beginner Forest
    this.showQuestObjectiveMarker(1800, 2900, '▼ Quest Zone')

    // Welcome NPC dialog
    const frostModal = (window as any).__frostModal
    if (frostModal) {
      frostModal.show({
        title: 'Elder Mirwen',
        lines: [
          '"Ah, a new mage arrives in Millhaven!"',
          '"The Beginner Forest lies to the south."',
          '"Slimes and ghouls stir in the shadows."',
          '"Prove yourself worthy — then return."',
          '',
          'Quest: First Blood',
          'Slay 5 creatures in Beginner Forest.',
        ],
        buttons: [{ label: 'I\'m ready!', primary: true, onClick: () => {} }],
        onClose: () => {},
      })
    }

    this.hud.showQuestUpdate(
      'Quest accepted!\nFirst Blood — go south to Beginner Forest',
      '#aadd44'
    )
  }

  // ── Quests ────────────────────────────────────────────────────────────────

  private initQuests() {
    this.questDefs = [
      { title: 'First Blood',      desc: 'Slay 5 creatures near town.',          target: 5,  xp: 80,  gold: 15 },
      { title: 'Pest Control',     desc: 'Defeat 12 enemies across the land.',   target: 12, xp: 160, gold: 35 },
      { title: 'Growing Stronger', desc: 'Hunt down 25 enemies total.',          target: 25, xp: 300, gold: 70 },
    ]
    this.updateQuestHUD()
  }

  private trackQuestKill() {
    const q = this.questDefs[this.activeQuestIdx]
    if (!q) return
    this.questKills++
    this.updateQuestHUD()
    if (this.questKills >= q.target)
      this.hud.showQuestUpdate('Quest complete!\nReturn to Elder Mirwen.', '#ffdd44')
  }

  private updateQuestHUD() {
    if (this.activeQuestIdx < 0) {
      this.hud.setQuestText('Talk to Elder Mirwen\nfor your first quest.')
      return
    }
    const q = this.questDefs[this.activeQuestIdx]
    if (!q) { this.hud.setQuestText(''); return }
    const prefix = this.questKills >= q.target ? '★ ' : ''
    this.hud.setQuestText(`${prefix}${q.title}\n${this.questKills}/${q.target}`)
  }

  // ── Spell unlock announcements ────────────────────────────────────────────

  private onSpellUnlock(level: number) {
    const msgs: Record<number, string> = {
      4:  'New Spell: Arcane Explosion (Q)\nInstant AoE burst around you!',
      8:  'New Spell: Frost Nova (E)\nFreeze nearby enemies solid!',
      14: 'New Spell: Blizzard (R)\nSummon a sustained ice storm!',
    }
    if (msgs[level]) this.hud.showQuestUpdate(msgs[level], '#88ddff')
  }

  // ── Premium gate ──────────────────────────────────────────────────────────

  private showPremiumGate() {
    this.premiumGateShown = true
    this.screenFlash(0x4466aa, 0.18, 1200)
    const frostModal = (window as any).__frostModal
    if (!frostModal) return
    frostModal.show({
      title: '✦  Your Journey Continues  ✦',
      titleClass: 'premium',
      lines: [
        "You've reached Level 10 — end of the free chapter.",
        '',
        'The full version unlocks:',
        '◆ Levels 11–20 & true archmage power',
        '◆ Blizzard — sustained AoE ice storm (Lv 14)',
        '◆ Deep talent trees & item crafting',
        '◆ Endless boss lairs & epic rewards',
        '',
        'Thank you for playing Frost!',
        '',
        'You may keep exploring — XP is capped at level 10.',
      ],
      buttons: [
        { label: '✦  Get Full Version', primary: true,  onClick: () => {} },
        { label: 'Skip for now (testing)', primary: false, onClick: () => {} },
      ],
      onClose: () => {},
    })
  }
}
