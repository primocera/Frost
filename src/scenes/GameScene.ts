import Phaser from 'phaser'
import { Player } from '../entities/Player'
import { Enemy } from '../entities/Enemy'
import { EnemyConfig, Slime, Ghoul } from '../entities/EnemyTypes'
import { World, SpawnZone } from '../world/World'
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
import { RARITY_COLOR } from '../items/ItemTypes'

const WORLD       = 3600
const RESPAWN_MS  = 6000

export class GameScene extends Phaser.Scene {
  private player!:     Player
  private world!:      World
  private enemies:     Enemy[] = []
  private enemyGroup!: Phaser.Physics.Arcade.Group
  private bolts!:      Phaser.Physics.Arcade.Group
  private hud!:        HUD
  private sfx!:        SoundManager
  private lootDrops:     LootDrop[] = []
  private burnTimers:    Map<Enemy, Phaser.Time.TimerEvent> = new Map()
  private inventoryUI!:  InventoryUI
  private talentUI!:     TalentUI
  private fKey!: Phaser.Input.Keyboard.Key
  private qKey!: Phaser.Input.Keyboard.Key
  private eKey!: Phaser.Input.Keyboard.Key
  private rKey!: Phaser.Input.Keyboard.Key
  private iKey!: Phaser.Input.Keyboard.Key
  private tKey!: Phaser.Input.Keyboard.Key
  private zoneCounts!: Map<SpawnZone, number>
  private lastFullWarnAt = 0
  private dead = false

  constructor() { super('GameScene') }

  create() {
    this.buildPlayerTexture()

    this.world      = new World(this, WORLD)
    this.player     = new Player(this, WORLD / 2, WORLD / 2)
    this.enemyGroup = this.physics.add.group()
    this.bolts      = this.physics.add.group()
    this.hud        = new HUD(this)
    this.sfx        = new SoundManager(this)

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

    this.inventoryUI = new InventoryUI(this, this.player.inventory)
    this.talentUI    = new TalentUI(this, this.player.talents)

    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.leftButtonDown() && !this.inventoryUI.isOpen() && !this.talentUI.isOpen())
        this.castFirebolt(ptr.worldX, ptr.worldY)
    })

    // Collision: player and enemies push against obstacles
    this.physics.add.collider(this.player, this.world.obstacles)
    this.physics.add.collider(this.enemyGroup, this.world.obstacles)

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

    // Populate every spawn zone
    this.zoneCounts = new Map()
    for (const zone of this.world.spawnZones) {
      this.zoneCounts.set(zone, 0)
      for (let i = 0; i < zone.maxEnemies; i++) this.spawnFromZone(zone)
    }
  }

  update(_time: number, delta: number) {
    if (this.dead) return

    if (this.player.isDead) {
      this.dead = true
      this.physics.pause()
      this.add.text(480, 320, 'YOU DIED\n\nRefresh to restart', {
        fontSize: '32px', color: '#ff4444',
        fontFamily: 'monospace', align: 'center',
        stroke: '#000000', strokeThickness: 5,
      }).setScrollFactor(0).setDepth(50).setOrigin(0.5)
      return
    }

    this.player.update(delta)

    const ptr = this.input.activePointer

    // Rotate player sprite to always face the cursor — snappy and intuitive
    this.player.setRotation(
      Phaser.Math.Angle.Between(this.player.x, this.player.y, ptr.worldX, ptr.worldY)
    )

    if (Phaser.Input.Keyboard.JustDown(this.iKey)) {
      if (this.talentUI.isOpen()) this.talentUI.hide()
      this.inventoryUI.toggle()
    }
    if (Phaser.Input.Keyboard.JustDown(this.tKey)) {
      if (this.inventoryUI.isOpen()) this.inventoryUI.hide()
      this.talentUI.toggle()
    }

    const anyUIOpen = this.inventoryUI.isOpen() || this.talentUI.isOpen()
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
      const dmg = enemy.update(delta, this.player, this.enemies)
      if (dmg > 0) {
        this.sfx.onPlayerHit()
        this.cameras.main.shake(160, 0.009)
        this.screenFlash(0xff0000, 0.20, 300)
        this.hud.showFloatingText(this.player.x, this.player.y - 20, `-${dmg}`, '#ff4444', 22)
      }
    }

    this.hud.update(this.player)
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
      const isCrit = Math.random() < this.player.critChance
      const dmg    = isCrit ? Math.round(baseArcDmg * t.bonusCritMult) : baseArcDmg
      const label  = isCrit ? `CRIT! -${dmg}` : `-${dmg}`
      const col    = isCrit ? '#ffff44' : '#cc44ff'
      this.hud.showFloatingText(enemy.x, enemy.y - 20, label, col)
      if (enemy.takeDamage(dmg)) this.killEnemy(enemy)
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
        enemy.slow(slowMult, slowDurationMs)
        const dmg = Math.round(tickDamage + spellDmg * 0.4)
        this.hud.showFloatingText(enemy.x, enemy.y - 20, `-${dmg}`, '#44aaff')
        if (enemy.takeDamage(dmg)) this.killEnemy(enemy)
      }
    })
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

    this.tryDropLoot(enemy)
    enemy.die()

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
    const B = Balance.loot
    if (Math.random() < B.itemDropChance) {
      const x = enemy.x + Phaser.Math.Between(-18, 18)
      const y = enemy.y + Phaser.Math.Between(-18, 18)
      this.lootDrops.push(new LootDrop(this, x, y, generateItem(this.player.stats.level)))
    }
    if (Math.random() < B.goldDropChance) {
      const x = enemy.x + Phaser.Math.Between(-18, 18)
      const y = enemy.y + Phaser.Math.Between(-18, 18)
      this.lootDrops.push(new LootDrop(this, x, y, undefined, generateGold(this.player.stats.level)))
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
      this.hud.showFloatingText(drop.x, drop.y - 20, `+${drop.gold}g`, '#ffdd00', 13)
    }
    const i = this.lootDrops.indexOf(drop)
    if (i !== -1) this.lootDrops.splice(i, 1)
    drop.destroy()
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
    burst.explode(48)
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

    // Enemies
    for (const cfg of [Slime, Ghoul] as EnemyConfig[]) {
      const size   = cfg.radius * 2 + 4
      const center = size / 2
      g.fillStyle(cfg.color)
      g.fillCircle(center, center, cfg.radius)
      g.fillStyle(0xffffff, 0.25)
      g.fillCircle(center - cfg.radius * 0.2, center - cfg.radius * 0.3, cfg.radius * 0.38)
      g.generateTexture(cfg.key, size, size)
      g.clear()
    }

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
