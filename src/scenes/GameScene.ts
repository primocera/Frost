import Phaser from 'phaser'
import { Player } from '../entities/Player'
import { Enemy } from '../entities/Enemy'
import { EnemyConfig, Slime, Ghoul, Imp, Brute, Wraith, Elite } from '../entities/EnemyTypes'
import { Boss } from '../entities/Boss'
import { BossConfig, ALL_BOSSES } from '../entities/BossTypes'
import { World, SpawnZone, ZoneDef, getZoneAt, ZONE_DEFS } from '../world/World'
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
  private activeBoss:   Boss | null = null
  private bossGroup!:   Phaser.Physics.Arcade.Group
  private bossProjectiles!: Phaser.Physics.Arcade.Group
  private bossKills     = new Map<string, number>()   // kills per zone name
  private bossDefeated  = new Set<string>()            // zone names where boss died
  // Zone atmosphere
  private currentZone:   ZoneDef | null = null
  private atmoGraphics!: Phaser.GameObjects.Graphics
  private snowEmitter!:  Phaser.GameObjects.Particles.ParticleEmitter
  private emberEmitter!: Phaser.GameObjects.Particles.ParticleEmitter
  private moteEmitter!:  Phaser.GameObjects.Particles.ParticleEmitter

  constructor() { super('GameScene') }

  create() {
    this.buildPlayerTexture()

    this.world       = new World(this, WORLD)
    this.player      = new Player(this, WORLD / 2, WORLD / 2)
    this.enemyGroup  = this.physics.add.group()
    this.bolts       = this.physics.add.group()
    this.wraithBolts = this.physics.add.group()
    this.hud         = new HUD(this)
    this.sfx         = new SoundManager(this)

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
      )

      // Double the gap between ambient particle emissions to reduce GPU load on mobile
      this.snowEmitter.setFrequency(720)
      this.emberEmitter.setFrequency(600)
      this.moteEmitter.setFrequency(880)
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
      x:       { min: -20, max: 980 },
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
      x:       { min: 0, max: 960 },
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
      x:       { min: 0, max: 960 },
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
  }

  update(_time: number, delta: number) {
    if (this.dead) return

    if (this.player.isDead) {
      this.dead = true
      this.physics.pause()
      this.add.text(480, 320, `YOU DIED\n${this.social.profile.name}\n\nRefresh to restart`, {
        fontSize: '32px', color: '#ff4444',
        fontFamily: 'monospace', align: 'center',
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

    const anyUIOpen = this.inventoryUI.isOpen() || this.talentUI.isOpen() || this.progressionUI.isOpen()
    if (!anyUIOpen) {
      if (Phaser.Input.Keyboard.JustDown(this.fKey)) this.castFirebolt(ptr.worldX, ptr.worldY)
      if (Phaser.Input.Keyboard.JustDown(this.qKey)) this.castArcaneExplosion()
      if (Phaser.Input.Keyboard.JustDown(this.eKey)) this.castFrostNova()
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
    spawnFirebolt(this, this.bolts, this.player.x, this.player.y, worldX, worldY, this.player.effectiveSpellDamage)
    this.sfx.onFireboltCast()
  }

  private castArcaneExplosion() {
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
    for (const enemy of [...this.enemies]) {
      if (!enemy.active || enemy.dying) continue
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

    for (const enemy of [...this.enemies]) {
      if (!enemy.active || enemy.dying) continue
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

    spawnBlizzard(this, worldX, worldY, (cx, cy) => {
      // Snapshot to avoid mutation issues during kill processing
      for (const enemy of [...this.enemies]) {
        if (!enemy.active || enemy.dying) continue
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
    }

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

    // Track kills per zone for boss spawn threshold
    const zoneName = enemy.getData('zoneName') as string | undefined
    if (zoneName && !this.bossDefeated.has(zoneName) && !this.activeBoss) {
      const count    = (this.bossKills.get(zoneName) ?? 0) + 1
      this.bossKills.set(zoneName, count)
      const bossCfg  = ALL_BOSSES.find(b => b.zoneId === zoneName)
      if (bossCfg && count >= bossCfg.killThreshold) {
        this.time.delayedCall(1800, () => {
          if (!this.dead && !this.activeBoss && !this.bossDefeated.has(zoneName))
            this.spawnBoss(bossCfg)
        })
      }
    }

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
      this.hud.showFloatingText(drop.x, drop.y - 20, drop.item.name, RARITY_COLOR[drop.item.rarity], 13)
    } else if (drop.gold !== undefined) {
      this.player.inventory.gold += drop.gold
      this.progression.onGoldCollected(drop.gold)
      this.hud.showFloatingText(drop.x, drop.y - 20, `+${drop.gold}g`, '#ffdd00', 13)
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
    const t = this.add.text(480, 295, `⚔  ${cfg.name}  ⚔\nBOSS ENCOUNTER`, {
      fontSize: '22px', fontFamily: 'monospace', color: '#ff5555',
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
      this.atmoGraphics.fillRect(0, 0, 960, 640)
      this.tweens.add({ targets: this.atmoGraphics, alpha: zone.atmoAlpha, duration: 1800, ease: 'Power1' })
      this.announceZone(zone)
    } else {
      this.tweens.add({ targets: this.atmoGraphics, alpha: 0, duration: 1800 })
    }
  }

  private announceZone(zone: ZoneDef) {
    const stars = '★'.repeat(zone.danger) + '☆'.repeat(4 - zone.danger)
    const t = this.add.text(480, 440, `${zone.name}   ${stars}`, {
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
    g.fillRect(0, 0, 960, 640)
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
    const lvText = this.add.text(480, 300, `LEVEL  ${this.player.stats.level}`, {
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
          targets: lvText, y: 220, alpha: 0,
          duration: 1100, delay: 650, ease: 'Power2',
          onComplete: () => lvText.destroy(),
        })
      },
    })

    // Gold particle burst from player
    const burst = this.add.particles(this.player.x, this.player.y, 'particle', {
      speed:     { min: 90, max: 380 },
      scale:     { start: 1.6, end: 0 },
      alpha:     { start: 1, end: 0 },
      lifespan:  900,
      blendMode: 'ADD',
      tint:      [0xffdd00, 0xffffff, 0xff8800, 0xffcc00],
      angle:     { min: 0, max: 360 },
      emitting:  false,
    }).setDepth(10)
    burst.explode(Device.particleCount(48))
    this.time.delayedCall(1000, () => { if (burst.active) burst.destroy() })
  }

  // ── Spawning ──────────────────────────────────────────────────────────────

  private spawnFromZone(zone: SpawnZone) {
    const angle = Math.random() * Math.PI * 2
    const r     = Phaser.Math.FloatBetween(zone.radius * 0.3, zone.radius)
    const x     = Phaser.Math.Clamp(zone.cx + Math.cos(angle) * r, 80, WORLD - 80)
    const y     = Phaser.Math.Clamp(zone.cy + Math.sin(angle) * r, 80, WORLD - 80)

    const cfg = zone.table[Phaser.Math.Between(0, zone.table.length - 1)]
    const enemy = new Enemy(this, x, y, cfg)
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
}
