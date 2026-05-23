import Phaser from 'phaser'
import { Player, SPELL_TRAIN_LEVEL } from '../entities/Player'
import { Enemy } from '../entities/Enemy'
import { EnemyConfig, ALL_ENEMIES } from '../entities/EnemyTypes'
import { Boss } from '../entities/Boss'
import { BossConfig, ALL_BOSSES } from '../entities/BossTypes'
import { World, SpawnZone, ZoneDef, DungeonEntrance, getZoneAt, ZONE_DEFS } from '../world/World'
import { spawnFirebolt, destroyBolt, spawnImpact, spawnCastEffect } from '../spells/Firebolt'
import { spawnFrostbolt, destroyFrostbolt, spawnFrostImpact, spawnFrostCastEffect } from '../spells/Frostbolt'
import { castArcaneExplosion } from '../spells/ArcaneExplosion'
import { castFrostNova } from '../spells/FrostNova'
import { spawnBlizzard } from '../spells/Blizzard'
import { HUD } from '../ui/HUD'
import { SoundManager } from '../audio/SoundManager'
import Balance from '../config/Balance'
import { generateItem, generateGold } from '../items/ItemGen'
import { formatCopper, formatCopperShort } from '../utils/currency'
import { LootDrop } from '../world/LootDrop'
import { InventoryUI } from '../ui/InventoryUI'
import { StashUI } from '../ui/StashUI'
import { Stash } from '../systems/Stash'
import { TalentUI } from '../ui/TalentUI'
import { ProgressionUI } from '../ui/ProgressionUI'
import { ShopUI } from '../ui/ShopUI'
import { MobileControls } from '../ui/MobileControls'
import { PlayerSprite } from '../ui/PlayerSprite'
import { ChatUI } from '../ui/ChatUI'
import { InspectPanel } from '../ui/InspectPanel'
import { SocialSystem } from '../social/SocialSystem'
import { PartySystem } from '../social/PartySystem'
import { ProgressionSystem, COSMETICS } from '../systems/ProgressionSystem'
import { RARITY_COLOR } from '../items/ItemTypes'
import { Device } from '../config/DeviceConfig'

const WORLD       = 3600   // world height; also sets town center at WORLD/2
const WORLD_W     = 5400   // total world width (expanded eastward for Volcanic Wastes)
const RESPAWN_MIN = 240_000   // 4 minutes
const RESPAWN_MAX = 300_000   // 5 minutes

// ── Humanoid sprite styling ───────────────────────────────────────────────────
// The player mage and all humanoid NPCs / the bandit share one 32×48 figure;
// only the colours, headwear, beard and held item differ per character.
interface HumanoidStyle {
  robe:     [string, string, string]   // robe gradient: top / mid / hem
  robeHi:   string                     // robe left-edge highlight
  fold:     string                     // robe fold shadow lines
  belt:     string
  sleeve:   string
  hand:     string                     // skin
  head:     [string, string]           // head radial gradient
  eye:      string
  beard:    'long' | 'none'
  beardCol: [string, string]
  headwear: 'wizardhat' | 'hood' | 'bandana' | 'strawhat' | 'merchanthat'
  hwMain:   string
  hwDark:   string
  item:     'staff' | 'dagger' | 'pitchfork' | 'bow' | 'none'
  crystal:  string                     // staff crystal tint
  glow:     boolean                    // cast/crystal glow (mage-like casters)
  glowRgb:  string                     // glow colour as "r,g,b"
}

const MAGE_STYLE: HumanoidStyle = {
  robe: ['#9a948a', '#7c766b', '#544f47'], robeHi: '#b3ab9d', fold: '#4a463d',
  belt: '#6b5436', sleeve: '#857f74', hand: '#d8a878', head: ['#e8c098', '#bf8a5e'],
  eye: '#dff0ff', beard: 'long', beardCol: ['#e4e0d6', '#b4ad9f'],
  headwear: 'wizardhat', hwMain: '#8d887d', hwDark: '#403c34',
  item: 'staff', crystal: '#cfe8ff', glow: true, glowRgb: '180,215,255',
}

const HUMANOID_STYLES: Record<string, HumanoidStyle> = {
  // Elder Mirwen — venerable purple archmage (same silhouette as the player)
  npc_elder: {
    robe: ['#6a4faa', '#503a86', '#352560'], robeHi: '#8a6fd0', fold: '#2a1d50',
    belt: '#d9b34a', sleeve: '#5a4496', hand: '#e8c098', head: ['#e8c098', '#bf8a5e'],
    eye: '#dff0ff', beard: 'long', beardCol: ['#eeeeee', '#c8c4ba'],
    headwear: 'wizardhat', hwMain: '#5a3aa6', hwDark: '#352066',
    item: 'staff', crystal: '#cfe8ff', glow: true, glowRgb: '200,180,255',
  },
  // Trader Brom — merchant in a floppy hat
  npc_merchant: {
    robe: ['#a8823e', '#8a6a30', '#5e4720'], robeHi: '#c2a058', fold: '#4a3318',
    belt: '#3a2a14', sleeve: '#9a7838', hand: '#e8b88a', head: ['#e8b88a', '#c08a5e'],
    eye: '#3a2a1a', beard: 'none', beardCol: ['#776655', '#554433'],
    headwear: 'merchanthat', hwMain: '#5a4226', hwDark: '#332010',
    item: 'none', crystal: '#ffffff', glow: false, glowRgb: '0,0,0',
  },
  // Farmer Holt — straw hat + pitchfork
  npc_farmer: {
    robe: ['#b89a5a', '#9a8048', '#6e5832'], robeHi: '#cdb070', fold: '#5a4528',
    belt: '#4a3820', sleeve: '#a88e50', hand: '#d8a878', head: ['#e8b88a', '#c08a5e'],
    eye: '#3a2a1a', beard: 'none', beardCol: ['#aa9988', '#887766'],
    headwear: 'strawhat', hwMain: '#d9b94a', hwDark: '#b8962e',
    item: 'pitchfork', crystal: '#ffffff', glow: false, glowRgb: '0,0,0',
  },
  // Mage Solvara — ice mage, blue hood + frost staff
  npc_icemage: {
    robe: ['#7fb8e8', '#4f8fc0', '#2d5f90'], robeHi: '#bfe4ff', fold: '#1f4570',
    belt: '#cfe8ff', sleeve: '#4f8fc0', hand: '#e8c098', head: ['#e8c098', '#bf8a5e'],
    eye: '#dff0ff', beard: 'none', beardCol: ['#dddddd', '#bbbbbb'],
    headwear: 'hood', hwMain: '#2d5580', hwDark: '#1a3a5a',
    item: 'staff', crystal: '#aef0ff', glow: true, glowRgb: '170,240,255',
  },
  // Ranger Aldric — green hood + bow
  npc_ranger: {
    robe: ['#4a6a38', '#3a5a2e', '#284018'], robeHi: '#6a8a4a', fold: '#1e3014',
    belt: '#5a3e22', sleeve: '#3a5a2e', hand: '#d8a878', head: ['#e8b88a', '#c08a5e'],
    eye: '#2a3a1a', beard: 'none', beardCol: ['#5a4a32', '#3a2e1e'],
    headwear: 'hood', hwMain: '#2e4a22', hwDark: '#1c3014',
    item: 'bow', crystal: '#ffffff', glow: false, glowRgb: '0,0,0',
  },
  // Hermit Zethkar — grey ragged robe, beard, gnarled staff
  npc_hermit: {
    robe: ['#6b675e', '#55514a', '#3a382f'], robeHi: '#807c70', fold: '#2a2820',
    belt: '#4a473f', sleeve: '#55514a', hand: '#d8b890', head: ['#d8b890', '#b08a60'],
    eye: '#cccccc', beard: 'long', beardCol: ['#dddddd', '#b4b0a4'],
    headwear: 'hood', hwMain: '#4a473f', hwDark: '#2e2c24',
    item: 'staff', crystal: '#aaffbb', glow: false, glowRgb: '150,255,170',
  },
  // Pyromancer Ignis — red robe, dark hood, flame staff
  npc_pyromancer: {
    robe: ['#c44726', '#9a2e1e', '#601810'], robeHi: '#ff7a40', fold: '#3a1008',
    belt: '#ffaa33', sleeve: '#9a2e1e', hand: '#e8b88a', head: ['#e8b88a', '#c0785e'],
    eye: '#ff6622', beard: 'none', beardCol: ['#552222', '#331111'],
    headwear: 'hood', hwMain: '#3a1410', hwDark: '#1e0a08',
    item: 'staff', crystal: '#ff8833', glow: true, glowRgb: '255,150,60',
  },
  // Bandit (enemy) — leather tunic + red bandana + dagger
  bandit: {
    robe: ['#9a7850', '#7a5c3a', '#503a22'], robeHi: '#b89868', fold: '#3a2a18',
    belt: '#3a2a18', sleeve: '#7a5c3a', hand: '#d8a878', head: ['#e8b88a', '#c08a5e'],
    eye: '#2a1a12', beard: 'none', beardCol: ['#3a2e1e', '#2a2014'],
    headwear: 'bandana', hwMain: '#b02828', hwDark: '#7a1818',
    item: 'dagger', crystal: '#ffffff', glow: false, glowRgb: '0,0,0',
  },
  // Bear → heavy thug — dark brown leather, hood, bare hands (imposing bruiser)
  bear: {
    robe: ['#5e3a1e', '#482c12', '#2e180a'], robeHi: '#7a5030', fold: '#1c0e06',
    belt: '#8a5a30', sleeve: '#482c12', hand: '#c89060', head: ['#d8a070', '#b07040'],
    eye: '#1a1008', beard: 'none', beardCol: ['#2a2018', '#1a1408'],
    headwear: 'hood', hwMain: '#3a2010', hwDark: '#1e0e06',
    item: 'none', crystal: '#ffffff', glow: false, glowRgb: '0,0,0',
  },
  // Thornback → elite bandit commander — dark scarred leather, near-black bandana, dagger
  thornback: {
    robe: ['#3a2610', '#28180a', '#160c04'], robeHi: '#524030', fold: '#0e0804',
    belt: '#6a1010', sleeve: '#28180a', hand: '#d0a068', head: ['#e0a870', '#b07848'],
    eye: '#1a1008', beard: 'none', beardCol: ['#1a1208', '#100c04'],
    headwear: 'bandana', hwMain: '#6a0808', hwDark: '#400404',
    item: 'dagger', crystal: '#ffffff', glow: false, glowRgb: '0,0,0',
  },
  // DefiasCaster → dark-robed bandit mage — deep purple hood + dark staff
  defias_caster: {
    robe: ['#3a1a58', '#2a1042', '#180828'], robeHi: '#5a2a88', fold: '#0e0420',
    belt: '#6622aa', sleeve: '#2a1042', hand: '#d8a878', head: ['#e8b888', '#c08a5e'],
    eye: '#cc44ff', beard: 'none', beardCol: ['#3a2a4a', '#2a1a3a'],
    headwear: 'hood', hwMain: '#1e0a32', hwDark: '#0e0418',
    item: 'staff', crystal: '#aa44ff', glow: true, glowRgb: '150,50,220',
  },
}

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
  private shopUI!:        ShopUI
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
  private xKey!: Phaser.Input.Keyboard.Key
  private mobileControls: MobileControls | null = null
  private playerSprite!:  PlayerSprite
  // Social systems
  private social!:   SocialSystem
  private party!:    PartySystem
  private chatUI!:   ChatUI
  private inspect!:  InspectPanel
  private tabKey!:   Phaser.Input.Keyboard.Key
  private zoneCounts!: Map<SpawnZone, number>
  private lastFullWarnAt  = 0
  private lastGateWarnAt  = 0
  private dead           = false
  private hardcore       = false
  private deathText:     Phaser.GameObjects.Text | null = null
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
  private ashEmitter!:   Phaser.GameObjects.Particles.ParticleEmitter
  // NPCs
  private npcQuest!:    Phaser.GameObjects.Image
  private npcMerchant!: Phaser.GameObjects.Image
  private npcFarmer!:   Phaser.GameObjects.Image
  private npcTrainer!:  Phaser.GameObjects.Image
  private npcPrompt!:   Phaser.GameObjects.Text
  private nearNPC:      'quest' | 'merchant' | 'zone' | 'farmer' | 'trainer' | null = null
  private nearZoneNPCIdx = -1
  private nearChicken    = false
  private zoneNPCs:     Array<{ sprite: Phaser.GameObjects.Image; travelZone: string; name: string }> = []
  private chickenQuestState: 'none' | 'accepted' | 'fed' | 'complete' = 'none'
  private dialogOpen    = false
  private questDialogAction = false
  // Quest system
  private questDefs:     {
    type?:        'kill' | 'travel' | 'interact'
    title:        string
    desc:         string
    target:       number
    zone?:        string
    travelZone?:  string
    markerX?:     number
    markerY?:     number
    markerLabel?: string
    giver?:       string
    arriveLines?: string[]
    xp:           number
    gold:         number
    autoCollect?: boolean
  }[] = []
  private activeQuestIdx = -1
  private questKills     = 0
  // Quest objective marker (world-space)
  private questMarker:    Phaser.GameObjects.Graphics | null = null
  private questMarkerTxt: Phaser.GameObjects.Text | null = null
  // Premium gate
  private premiumGateShown = false

  constructor() { super('GameScene') }

  create(data?: { playerName?: string; hardcore?: boolean }) {
    const playerName = data?.playerName ?? 'Apprentice'
    this.hardcore    = data?.hardcore   ?? false
    this.buildPlayerTexture()

    this.world       = new World(this, WORLD, WORLD_W)
    this.player      = new Player(this, WORLD / 2, WORLD / 2, playerName)
    // Physics body is still active; hide the placeholder circle visual
    this.player.setAlpha(0)
    this.playerSprite = new PlayerSprite(this)
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
      .setBounds(0, 0, WORLD_W, WORLD)
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
    this.xKey   = kb.addKey(Phaser.Input.Keyboard.KeyCodes.X)
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
    this.shopUI = new ShopUI(() => this.player.stats.level, this.player.inventory)

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
          const anyUIOpen = this.inventoryUI.isOpen() || this.talentUI.isOpen() || this.progressionUI.isOpen() || this.stashUI.isOpen() || this.shopUI.isOpen()
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
              this.talentUI.isOpen()      && this.talentUI.hide()
              this.progressionUI.isOpen() && this.progressionUI.hide()
              this.shopUI.isOpen()        && this.shopUI.hide()
              this.inventoryUI.toggle()
              break
            case 'T':
              this.inventoryUI.isOpen()   && this.inventoryUI.hide()
              this.progressionUI.isOpen() && this.progressionUI.hide()
              this.shopUI.isOpen()        && this.shopUI.hide()
              this.talentUI.toggle()
              break
            case 'P':
              this.inventoryUI.isOpen() && this.inventoryUI.hide()
              this.talentUI.isOpen()    && this.talentUI.hide()
              this.shopUI.isOpen()      && this.shopUI.hide()
              this.progressionUI.toggle()
              break
            case '?':
              this.openHelpPanel()
              break
          }
        },
        // Interact button — same as E key
        () => { if (!this.dead) this.handleEInteract() },
        // Bolt-swap toggle — mirrors the X key (firebolt ↔ frostbolt)
        () => {
          if (this.dead) return
          this.player.swapBolt()
          const frost = this.player.activeBolt === 'frost'
          this.hud.showQuestUpdate(frost ? '❄ Frostbolt' : '🔥 Firebolt', frost ? '#88ddff' : '#ff8844')
        },
      )
      this.hud.setMobile(this.mobileControls)
      this.mobileControls.setLearnedSpells(this.player.learnedSpells)
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
      if (this.inventoryUI.isOpen() || this.talentUI.isOpen() || this.progressionUI.isOpen() || this.stashUI.isOpen() || this.shopUI.isOpen()) return
      this.castActiveBolt(ptr.worldX, ptr.worldY)
    })

    // Collision: player and enemies push against obstacles
    this.physics.add.collider(this.player, this.world.obstacles)
    this.physics.add.collider(this.enemyGroup, this.world.obstacles)
    // Player bolts stop at obstacles — triggers proper cleanup + impact effect
    this.physics.add.collider(this.bolts, this.world.obstacles, (boltObj) => {
      const bolt    = boltObj as unknown as Phaser.Physics.Arcade.Sprite
      if (!bolt.active) return
      const isFrost = bolt.getData('isFrost') as boolean | undefined
      if (isFrost) { spawnFrostImpact(this, bolt.x, bolt.y); destroyFrostbolt(bolt); this.sfx.onFrostboltImpact() }
      else         { spawnImpact(this, bolt.x, bolt.y);       destroyBolt(bolt);      this.sfx.onFireboltImpact() }
    })
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
      const isFrost = bolt.getData('isFrost') as boolean | undefined
      const hitX = enemy.x
      const hitY = enemy.y
      if (isFrost) { destroyFrostbolt(bolt); spawnFrostImpact(this, hitX, hitY); this.sfx.onFrostboltImpact() }
      else         { destroyBolt(bolt);      spawnImpact(this, hitX, hitY) }

      // Hitstop: 50 ms physics freeze gives every bolt impact physical weight
      this.physics.world.pause()
      this.time.delayedCall(50, () => { if (!this.dead) this.physics.world.resume() })

      this.cameras.main.shake(70, 0.004)
      if (isFrost) this.sfx.onFrostboltImpact()
      else         this.sfx.onFireboltImpact()

      // Permafrost: frozen enemies take bonus damage
      if (this.player.talents.permafrostEnabled && enemy.isFrozen)
        dmg = Math.round(dmg * 1.25)

      const isCrit = Math.random() < this.player.critChance
      if (isCrit) dmg = Math.round(dmg * this.player.talents.bonusCritMult)

      const baseSz = dmg >= 80 ? 28 : dmg >= 40 ? 22 : 18
      const sz     = isCrit ? baseSz + 6 : baseSz
      const normCol = isFrost ? '#66ccff' : '#ff8800'
      const label  = isCrit ? `CRIT! -${dmg}` : `-${dmg}`
      const col    = isCrit ? '#ffff44' : normCol
      this.hud.showFloatingText(hitX, hitY - 20, label, col, sz)

      // Crit punch: extra shake + golden starburst
      if (isCrit) {
        this.cameras.main.shake(120, 0.009)
        const critBurst = this.add.particles(hitX, hitY, 'particle', {
          speed:     { min: 80, max: 290 },
          scale:     { start: 1.1, end: 0 },
          alpha:     { start: 1, end: 0 },
          lifespan:  380,
          tint:      [0xffff66, 0xffffff, 0xffcc22],
          angle:     { min: 0, max: 360 },
          blendMode: 'ADD',
          emitting:  false,
        }).setDepth(10)
        critBurst.explode(Device.particleCount(14))
        this.time.delayedCall(450, () => { if (critBurst.active) critBurst.destroy() })
      }

      // Aggro chain: enemies near the impact point get pulled into combat
      for (const nearby of this.enemies) {
        if (!nearby.active || nearby.dying || nearby === enemy) continue
        const d = Phaser.Math.Distance.Between(hitX, hitY, nearby.x, nearby.y)
        if (d <= Balance.aggro.chainRadius) nearby.forceAggro()
      }

      // Frostbolt inherently slows
      if (isFrost && !enemy.dying) {
        const { slowMult, slowDurationMs } = Balance.spells.frostbolt
        enemy.slow(slowMult, slowDurationMs)
      }

      // Chilling Touch: slow enemy on bolt hit
      const { chillSlowMult, chillDurationMs } = this.player.talents
      if (chillSlowMult > 0 && !enemy.dying) enemy.slow(chillSlowMult, chillDurationMs)

      // Ignite: apply burn DoT on hit (fire bolts only)
      if (!isFrost && this.player.talents.igniteRank > 0 && !enemy.dying) this.applyBurn(enemy)

      if (enemy.takeDamage(dmg)) this.killEnemy(enemy)
    })

    // Wraith bolt hits player
    this.physics.add.overlap(this.player, this.wraithBolts, (_p, boltObj) => {
      const bolt = boltObj as unknown as Phaser.Physics.Arcade.Sprite
      if (!bolt.active) return
      const dmg = bolt.getData('damage') as number
      bolt.destroy()
      this.player.takeDamage(dmg)
      this.playerSprite.playHurt()
      this.sfx.onPlayerHit()
      this.cameras.main.shake(130, 0.006)
      this.screenFlash(0xff0000, 0.18, 280)
      this.hud.showFloatingText(this.player.x, this.player.y - 20, `-${dmg}`, '#ff4444', 20)
    })

    // Enemy emits this when a melee or telegraph hit lands
    this.events.on('enemy-hit-player', (_dmg: number) => {
      if (this.dead) return
      this.playerSprite.playHurt()
      this.sfx.onPlayerHit()
      this.cameras.main.shake(160, 0.009)
      this.screenFlash(0xff0000, 0.20, 300)
      this.hud.showFloatingText(this.player.x, this.player.y - 20, `-${_dmg}`, '#ff4444', 22)
    })

    // Enemy (ranged) fires a projectile — bolt texture/colour varies by enemy type
    this.events.on('enemy-shoot', (d: { x: number; y: number; vx: number; vy: number; damage: number; key: string }) => {
      if (this.dead) return
      // Cap active bolts so ranged packs can't flood the screen
      if (this.wraithBolts.getLength() >= 10) return
      const bolt = this.wraithBolts.create(d.x, d.y, d.key) as Phaser.Physics.Arcade.Sprite
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

    // Ash: drifts down from above (Volcanic Wastes) — grey soot particles
    this.ashEmitter = this.add.particles(0, 0, 'particle', {
      x:       { min: 0, max: this.scale.width },
      y:       { min: -30, max: -5 },
      speedY:  { min: 25, max: 60 },
      speedX:  { min: -22, max: 22 },
      lifespan: { min: 4500, max: 9000 },
      scale:   { start: 0.18, end: 0.04 },
      alpha:   { start: 0.55, end: 0 },
      tint:    [0x4a4642, 0x3a3430, 0x2a2420, 0x5a5450],
      frequency: 280,
      quantity: 1,
    }).setScrollFactor(0).setDepth(2)
    this.ashEmitter.pause()

    // Reduce particle emission rate on mobile to ease GPU load
    if (Device.isMobile) {
      this.snowEmitter.setFrequency(720)
      this.emberEmitter.setFrequency(600)
      this.moteEmitter.setFrequency(880)
      this.ashEmitter.setFrequency(560)
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
      this.playerSprite.playHurt()
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
      if (this.hardcore) {
        this.add.text(this.scale.width / 2, this.scale.height / 2,
          `YOU DIED\n${this.social.profile.name}\n\n☠  Hardcore — your journey ends here\n\nRefresh to restart`, {
          fontSize: '28px', color: '#ff4444',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', align: 'center',
          stroke: '#000000', strokeThickness: 5,
        }).setScrollFactor(0).setDepth(50).setOrigin(0.5)
      } else {
        this.time.delayedCall(1800, () => this.respawn())
        this.deathText = this.add.text(this.scale.width / 2, this.scale.height / 2,
          `YOU DIED\nRespawning…`, {
          fontSize: '32px', color: '#ff4444',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', align: 'center',
          stroke: '#000000', strokeThickness: 5,
        }).setScrollFactor(0).setDepth(50).setOrigin(0.5)
      }
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
      this.mobileControls.setActiveBolt(this.player.activeBolt)
      this.mobileControls.update()
    }

    this.player.update(delta)

    const body = this.player.body as Phaser.Physics.Arcade.Body
    this.playerSprite.update(delta, this.player.x, this.player.y, body.velocity.x, body.velocity.y, this.dead)

    const ptr = this.input.activePointer

    if (Phaser.Input.Keyboard.JustDown(this.iKey)) {
      this.talentUI.isOpen()      && this.talentUI.hide()
      this.progressionUI.isOpen() && this.progressionUI.hide()
      this.shopUI.isOpen()        && this.shopUI.hide()
      this.inventoryUI.toggle()
    }
    if (Phaser.Input.Keyboard.JustDown(this.tKey)) {
      this.inventoryUI.isOpen()   && this.inventoryUI.hide()
      this.progressionUI.isOpen() && this.progressionUI.hide()
      this.shopUI.isOpen()        && this.shopUI.hide()
      this.talentUI.toggle()
    }
    if (Phaser.Input.Keyboard.JustDown(this.pKey)) {
      this.inventoryUI.isOpen() && this.inventoryUI.hide()
      this.talentUI.isOpen()    && this.talentUI.hide()
      this.shopUI.isOpen()      && this.shopUI.hide()
      this.progressionUI.toggle()
    }

    // NPC / stash / dungeon proximity and E-key interaction
    this.updateNPCProximity()
    this.updateDungeonProximity()
    this.updateStashProximity()

    // Capture JustDown once — it resets after the first read per frame
    const eDown = Phaser.Input.Keyboard.JustDown(this.eKey)
    if (eDown) this.handleEInteract()

    if (Phaser.Input.Keyboard.JustDown(this.xKey)) {
      this.player.swapBolt()
      const label = this.player.activeBolt === 'frost' ? '❄ Frostbolt' : '🔥 Firebolt'
      this.hud.showQuestUpdate(label, this.player.activeBolt === 'frost' ? '#88ddff' : '#ff8844')
    }

    const anyUIOpen = this.inventoryUI.isOpen() || this.talentUI.isOpen() || this.progressionUI.isOpen() || this.dialogOpen || this.stashUI.isOpen() || this.shopUI.isOpen()
    if (!anyUIOpen) {
      if (Phaser.Input.Keyboard.JustDown(this.fKey)) this.castActiveBolt(ptr.worldX, ptr.worldY)
      if (Phaser.Input.Keyboard.JustDown(this.qKey)) this.castArcaneExplosion()
      if (!this.nearNPC && !this.nearChicken && !this.nearStash && !this.nearDungeon && eDown) this.castFrostNova()
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
    if (zone && this.isZoneLocked(zone.name)) {
      this.pushOutOfZone(zone)
    } else {
      if (zone !== this.currentZone) this.enterZone(zone)
    }
  }

  // ── Combat ────────────────────────────────────────────────────────────────

  /** Dispatches to whichever bolt is active (fire or frost). */
  private castActiveBolt(worldX: number, worldY: number) {
    if (this.player.activeBolt === 'frost') this.castFrostbolt(worldX, worldY)
    else this.castFirebolt(worldX, worldY)
  }

  private castFirebolt(worldX: number, worldY: number) {
    if (!this.player.canCastFirebolt()) {
      if (this.player.fireboltCooldown > 0) this.hud.notifyCastFailed(3)
      else this.hud.notifyOOM()
      return
    }
    this.player.spendFireboltCost()
    this.playerSprite.playCast()
    spawnCastEffect(this, this.player.x, this.player.y)
    const bolt = spawnFirebolt(this, this.bolts, this.player.x, this.player.y, worldX, worldY, this.player.effectiveSpellDamage)
    bolt.setData('castZone', getZoneAt(this.player.x, this.player.y)?.name ?? '__town__')
    this.sfx.onFireboltCast()
  }

  private castFrostbolt(worldX: number, worldY: number) {
    if (!this.player.canCastFrostbolt()) {
      if (this.player.frostboltCooldown > 0) this.hud.notifyCastFailed(3)
      else this.hud.notifyOOM()
      return
    }
    this.player.spendFrostboltCost()
    this.playerSprite.playCast()
    spawnFrostCastEffect(this, this.player.x, this.player.y)
    const bolt = spawnFrostbolt(this, this.bolts, this.player.x, this.player.y, worldX, worldY, this.player.effectiveSpellDamage)
    bolt.setData('castZone', getZoneAt(this.player.x, this.player.y)?.name ?? '__town__')
    this.sfx.onFrostboltCast()
  }

  private castArcaneExplosion() {
    if (!this.player.hasSpell('arcaneExplosion')) {
      this.hud.showFloatingText(this.player.x, this.player.y - 30, 'Train Arcane Explosion at the Spell Trainer!', '#8866aa', 13)
      return
    }
    if (!this.player.canCastArcaneExplosion()) {
      if (this.player.arcaneExplosionCooldown > 0) this.hud.notifyCastFailed(0)
      else this.hud.notifyOOM()
      return
    }
    this.player.spendArcaneExplosionCost()
    this.playerSprite.playCast()

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
      this.hud.showFloatingText(this.player.x, this.player.y - 30, 'Train Frost Nova at the Spell Trainer!', '#4488cc', 13)
      return
    }
    if (!this.player.canCastFrostNova()) {
      if (this.player.frostNovaCooldown > 0) this.hud.notifyCastFailed(1)
      else this.hud.notifyOOM()
      return
    }
    this.player.spendFrostNovaCost()
    this.playerSprite.playCast()

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
      this.hud.showFloatingText(this.player.x, this.player.y - 30, 'Train Blizzard at the Spell Trainer!', '#44aadd', 13)
      return
    }
    if (!this.player.canCastBlizzard()) {
      if (this.player.blizzardCooldown > 0) this.hud.notifyCastFailed(2)
      else this.hud.notifyOOM()
      return
    }
    this.player.spendBlizzardCost()
    this.playerSprite.playCast()

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

  /** Mobile F-button: auto-aims active bolt at the nearest active enemy or boss. */
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

    this.castActiveBolt(tx, ty)
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
          `Kills: ${stats.totalKills}   Gold: ${formatCopper(this.player.inventory.gold)}`,
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
    if (this.player.premiumGateReached && !this.premiumGateShown) this.showLevel10Milestone()
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

    if (enemy.cfg.rare) {
      const label = enemy.cfg.label ?? enemy.cfg.key
      this.hud.showStreakText(`☠ ${label} Slain!`, '#ffaa00', 26)
      this.social.feedEvent(`Rare "${label}" defeated!`, '#ffaa00')
    }

    this.tryDropLoot(enemy)
    enemy.die()
    this.registerKill(enemy.x, enemy.y)

    if (zone) {
      const prev = this.zoneCounts.get(zone) ?? 1
      this.zoneCounts.set(zone, prev - 1)
      this.time.delayedCall(Phaser.Math.Between(RESPAWN_MIN, RESPAWN_MAX), () => {
        if (!this.dead && (this.zoneCounts.get(zone) ?? 0) < zone.maxEnemies) {
          this.spawnFromZone(zone)
        }
      })
    }
  }

  // ── Talent effects ────────────────────────────────────────────────────────

  private respawn() {
    this.deathText?.destroy()
    this.deathText = null
    // Heal to full and teleport back to the starting town centre
    this.player.stats.hp   = this.player.stats.maxHp
    this.player.stats.mana = this.player.effectiveMaxMana
    ;(this.player.body as Phaser.Physics.Arcade.Body).reset(WORLD / 2, WORLD / 2)

    // Enemies stay alive — player teleports to town so there's no instant re-kill

    this.dead = false
    this.physics.resume()

    // Brief screen flash to signal respawn
    this.cameras.main.flash(400, 100, 160, 255, false)
    this.hud.showFloatingText(this.player.x, this.player.y - 40, 'Respawned', '#88aaff', 18)
  }

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
      const goldMult = enemy.cfg.lootMultiplier ?? 2
      // Rares get an epic-bias item; regular elites are rare-biased
      const epicChance = enemy.cfg.rare ? 0.55 : 0.30
      const rarity = Math.random() < epicChance ? 'epic' : 'rare'
      this.lootDrops.push(new LootDrop(this, enemy.x - 14, enemy.y, generateItem(lvl, rarity)))
      // Rares drop a second item too
      if (enemy.cfg.rare) {
        this.lootDrops.push(new LootDrop(this, enemy.x, enemy.y - 14, generateItem(lvl, 'rare')))
      }
      this.lootDrops.push(new LootDrop(this, enemy.x + 14, enemy.y, undefined, generateGold(lvl) * goldMult))
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
      this.player.inventory.notifyChange()
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
      this.player.inventory.notifyChange()
      this.progression.onGoldCollected(drop.gold)
      const sz  = drop.gold >= 100 ? 16 : 13
      const col = drop.gold >= 100 ? '#ffee44' : '#ffdd00'
      this.hud.showFloatingText(drop.x, drop.y - 20, `+${formatCopperShort(drop.gold)}`, col, sz)
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

    // Zone music
    const musicKey = (!zone || zone.name === 'Beginner Forest') ? 'mus_westfall' : null
    this.sfx.setZoneMusic(musicKey)

    // Pause all ambient emitters, resume the right one
    this.snowEmitter.pause()
    this.emberEmitter.pause()
    this.moteEmitter.pause()
    this.ashEmitter.pause()
    if (zone?.name === 'Frozen Ruins')     this.snowEmitter.resume()
    if (zone?.name === 'Corrupted Fields') this.emberEmitter.resume()
    if (zone?.name === 'Arcane Caves')     this.moteEmitter.resume()
    if (zone?.name === 'Volcanic Wastes')  this.ashEmitter.resume()

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
    const stars = '★'.repeat(zone.danger) + '☆'.repeat(Math.max(0, 4 - zone.danger))
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
    // Spawn tightly at the camp centre so enemies visibly cluster there
    const angle = Math.random() * Math.PI * 2
    const r     = Phaser.Math.FloatBetween(0, 32)
    const x     = Phaser.Math.Clamp(zone.cx + Math.cos(angle) * r, 80, WORLD_W - 80)
    const y     = Phaser.Math.Clamp(zone.cy + Math.sin(angle) * r, 80, WORLD - 80)

    const cfg = zone.table[Phaser.Math.Between(0, zone.table.length - 1)]
    const enemy = new Enemy(this, x, y, cfg)
    enemy.homeZone = zone.zoneBounds
    enemy.setData('zone', zone)
    enemy.setData('zoneName', getZoneAt(zone.cx, zone.cy)?.name ?? null)
    this.enemies.push(enemy)
    this.enemyGroup.add(enemy as unknown as Phaser.GameObjects.GameObject)
    this.zoneCounts.set(zone, (this.zoneCounts.get(zone) ?? 0) + 1)

    if (cfg.rare) {
      const zoneName = getZoneAt(zone.cx, zone.cy)?.name ?? 'the wilderness'
      this.hud.showFloatingText(x, y - 40, `⚠ ${cfg.label} roams ${zoneName}`, '#ffaa00', 14)
    }
  }

  // ── Textures ──────────────────────────────────────────────────────────────

  private buildPlayerTexture() {
    const g = this.add.graphics()

    // Invisible 1×1 placeholder — the physics body still uses 'player' key
    // but the PlayerSprite renders the actual mage visuals.
    g.fillStyle(0x000000, 0)
    g.fillRect(0, 0, 1, 1)
    g.generateTexture('player', 32, 32)
    g.clear()

    // ── Mage animated sprite sheet ─────────────────────────────────────────
    // 32×48 per frame, 11 frames: idle(0-3) walk(4-7) cast(8-10)
    this.buildMageSheet()
    g.clear()

    // Enemies — distinct creature art per type.
    // Texture padded by 8px each side (size = 2r+16) so horns/auras/wisps
    // aren't clipped; Enemy.ts centres the physics circle with offset 8.
    // Humanoid enemies (e.g. bandit) use the tall figure sheet instead, built below.
    for (const cfg of ALL_ENEMIES) {
      if (cfg.humanoid) continue
      const size = cfg.radius * 2 + 16
      const c    = size / 2
      this.drawEnemyArt(g, cfg, c, cfg.radius)
      g.generateTexture(cfg.key, size, size)
      g.clear()
    }

    // Humanoid NPCs + enemies reuse the player figure with themed styling
    for (const key of Object.keys(HUMANOID_STYLES)) {
      this.buildHumanoidTexture(key, HUMANOID_STYLES[key])
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

    // Wraith bolt: small purple orb (Wraith, CorruptedMage)
    g.fillStyle(0xbb44ee)
    g.fillCircle(6, 6, 6)
    g.fillStyle(0xffffff, 0.5)
    g.fillCircle(4, 4, 2)
    g.generateTexture('wraith_bolt', 12, 12)
    g.clear()

    // Enemy frost bolt: icy blue orb (FrostWarden)
    g.fillStyle(0x22aaee)
    g.fillCircle(6, 6, 6)
    g.fillStyle(0x88eeff, 0.75)
    g.fillCircle(6, 6, 3.5)
    g.fillStyle(0xffffff, 0.6)
    g.fillCircle(4, 4, 1.5)
    g.generateTexture('enemy_frost_bolt', 12, 12)
    g.clear()

    // Enemy fire bolt: orange-red orb (DefiasCaster)
    g.fillStyle(0xdd3300)
    g.fillCircle(6, 6, 6)
    g.fillStyle(0xff8800, 0.8)
    g.fillCircle(6, 6, 3.5)
    g.fillStyle(0xffee44, 0.6)
    g.fillCircle(5, 5, 1.8)
    g.generateTexture('enemy_fire_bolt', 12, 12)
    g.clear()

    // Firebolt — bright hot core with additive-ready edges
    g.fillStyle(0xff3300, 1)
    g.fillCircle(7, 7, 7)
    g.fillStyle(0xff8800, 0.85)
    g.fillCircle(7, 7, 5)
    g.fillStyle(0xffee44, 0.90)
    g.fillCircle(7, 7, 3)
    g.fillStyle(0xffffff, 0.80)
    g.fillCircle(7, 7, 1.5)
    g.generateTexture('firebolt', 14, 14)
    g.clear()

    // Frostbolt — crystalline ice orb with radiating shards (WoW-style)
    {
      const c = 11
      g.fillStyle(0x2277cc, 0.45)            // outer frost halo
      g.fillCircle(c, c, 11)
      g.fillStyle(0xaaf0ff, 0.92)            // 8 ice-crystal shards
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2
        g.fillTriangle(
          c + Math.cos(a) * 11,        c + Math.sin(a) * 11,
          c + Math.cos(a + 0.30) * 3.2, c + Math.sin(a + 0.30) * 3.2,
          c + Math.cos(a - 0.30) * 3.2, c + Math.sin(a - 0.30) * 3.2,
        )
      }
      g.fillStyle(0x55bbff, 0.95)            // icy body
      g.fillCircle(c, c, 6)
      g.fillStyle(0xbfeeff, 0.95)            // bright inner
      g.fillCircle(c, c, 3.4)
      g.fillStyle(0xffffff, 1)               // hot white core
      g.fillCircle(c, c, 1.7)
      g.generateTexture('frostbolt', 22, 22)
      g.clear()
    }

    // Particle — soft round glow dot (used by all particle effects)
    g.fillStyle(0xffffff)
    g.fillCircle(4, 4, 4)
    g.generateTexture('particle', 8, 8)
    g.destroy()
  }

  // ── Mage sprite sheet ──────────────────────────────────────────────────────

  private buildMageSheet() {
    // 32×48 per frame, 11 frames horizontal strip
    // Frames: 0-3 idle | 4-7 walk | 8-10 cast
    const FW = 32, FH = 48, FRAMES = 11
    const ct = this.textures.createCanvas('mage_sheet', FW * FRAMES, FH)!
    const ctx = ct.getContext()

    for (let f = 0; f < FRAMES; f++) {
      this.drawHumanoidFrame(ctx, f * FW, f, MAGE_STYLE)
    }
    ct.refresh()

    // Register numbered frames so anims.generateFrameNumbers() works
    for (let i = 0; i < FRAMES; i++) {
      ct.add(i, 0, i * FW, 0, FW, FH)
    }
  }

  /** Single static idle-frame humanoid texture (NPCs + humanoid enemies). */
  private buildHumanoidTexture(key: string, style: HumanoidStyle) {
    const ct = this.textures.createCanvas(key, 32, 48)
    if (!ct) return
    this.drawHumanoidFrame(ct.getContext(), 0, 0, style)
    ct.refresh()
  }

  private drawHumanoidFrame(ctx: CanvasRenderingContext2D, ox: number, frame: number, style: HumanoidStyle) {
    const FW = 32
    // Animation parameters per frame
    type Anim = { bob: number; staffRaise: number; glow: number; footSwing: number; blink: boolean }
    const ANIMS: Anim[] = [
      // Idle 0-3
      { bob: 0, staffRaise: 0,  glow: 0.20, footSwing: 0,    blink: false },
      { bob: 1, staffRaise: 0,  glow: 0.15, footSwing: 0,    blink: false },
      { bob: 1, staffRaise: 0,  glow: 0.20, footSwing: 0,    blink: false },
      { bob: 0, staffRaise: 0,  glow: 0.30, footSwing: 0,    blink: true  },
      // Walk 4-7
      { bob: 0, staffRaise: -1, glow: 0.15, footSwing: -1,   blink: false },
      { bob:-1, staffRaise:  1, glow: 0.15, footSwing: -0.4, blink: false },
      { bob: 0, staffRaise: -1, glow: 0.15, footSwing:  1,   blink: false },
      { bob:-1, staffRaise:  1, glow: 0.15, footSwing:  0.4, blink: false },
      // Cast 8-10
      { bob:-1, staffRaise:  6, glow: 0.55, footSwing: 0,    blink: false },
      { bob:-3, staffRaise: 14, glow: 1.00, footSwing: 0,    blink: false },
      { bob:-2, staffRaise: 10, glow: 0.65, footSwing: 0,    blink: false },
    ]
    const a  = ANIMS[Math.min(frame, ANIMS.length - 1)]
    const cx = ox + FW / 2        // horizontal centre of this frame
    const by = a.bob               // vertical body offset

    // ── Cast glow behind everything (mage-like casters only) ─────────────
    if (style.glow && a.glow > 0.3) {
      const grad = ctx.createRadialGradient(cx, by + 30, 0, cx, by + 30, 22)
      grad.addColorStop(0, `rgba(${style.glowRgb},${a.glow * 0.55})`)
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.ellipse(cx, by + 30, 22, 18, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    // ── Drop shadow ──────────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(0,0,0,0.22)'
    ctx.beginPath()
    ctx.ellipse(cx, by + 47, 10, 3.5, 0, 0, Math.PI * 2)
    ctx.fill()

    // ── Held item (behind the body) ──────────────────────────────────────
    this.drawHeldItem(ctx, cx, by, a, style)

    // ── Boots peeking from the robe hem ──────────────────────────────────
    const lx = cx - 6 + a.footSwing * -3
    const rx = cx + 4 + a.footSwing * 3
    ctx.fillStyle = '#2a2018'
    ctx.beginPath(); ctx.ellipse(lx, by + 45, 5, 3.5, -0.08, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(rx, by + 45, 5, 3.5, 0.08, 0, Math.PI * 2); ctx.fill()

    // ── Robe body ────────────────────────────────────────────────────────
    const robeGr = ctx.createLinearGradient(cx - 13, by + 24, cx + 13, by + 45)
    robeGr.addColorStop(0, style.robe[0])
    robeGr.addColorStop(0.55, style.robe[1])
    robeGr.addColorStop(1, style.robe[2])
    ctx.fillStyle = robeGr
    ctx.beginPath()
    ctx.moveTo(cx - 11, by + 25)
    ctx.bezierCurveTo(cx - 15, by + 33, cx - 14, by + 42, cx - 9, by + 46)
    ctx.lineTo(cx + 8, by + 46)
    ctx.bezierCurveTo(cx + 14, by + 42, cx + 15, by + 33, cx + 11, by + 25)
    ctx.closePath()
    ctx.fill()

    // Robe fold shadows
    ctx.strokeStyle = style.fold
    ctx.lineWidth   = 1
    ctx.beginPath()
    ctx.moveTo(cx - 3, by + 30); ctx.lineTo(cx - 4, by + 45)
    ctx.moveTo(cx + 4, by + 30); ctx.lineTo(cx + 5, by + 45)
    ctx.stroke()
    // Robe left highlight
    ctx.strokeStyle = style.robeHi
    ctx.lineWidth   = 1.2
    ctx.beginPath()
    ctx.moveTo(cx - 11, by + 25)
    ctx.bezierCurveTo(cx - 15, by + 33, cx - 14, by + 42, cx - 9, by + 46)
    ctx.stroke()

    // Belt
    ctx.strokeStyle = style.belt
    ctx.lineWidth   = 2
    ctx.beginPath()
    ctx.moveTo(cx - 9, by + 33); ctx.quadraticCurveTo(cx, by + 35, cx + 9, by + 33)
    ctx.stroke()

    // ── Sleeves + hands ──────────────────────────────────────────────────
    ctx.fillStyle = style.sleeve
    ctx.beginPath(); ctx.ellipse(cx - 12, by + 31, 5, 7.5, -0.18, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(cx + 11, by + 31, 4.5, 7, 0.18, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = style.hand
    ctx.beginPath(); ctx.arc(cx - 13, by + 38, 3.5, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(cx + 12, by + 36, 3.5, 0, Math.PI * 2); ctx.fill()

    // ── Head ─────────────────────────────────────────────────────────────
    const headX = cx, headY = by + 19, headR = 6.5
    const headGr = ctx.createRadialGradient(headX - 1, headY - 1, 0, headX, headY, headR)
    headGr.addColorStop(0, style.head[0])
    headGr.addColorStop(1, style.head[1])
    ctx.fillStyle = headGr
    ctx.beginPath()
    ctx.arc(headX, headY, headR, 0, Math.PI * 2)
    ctx.fill()

    // ── Beard (optional) ─────────────────────────────────────────────────
    if (style.beard === 'long') {
      const beardGr = ctx.createLinearGradient(cx, by + 18, cx, by + 38)
      beardGr.addColorStop(0, style.beardCol[0])
      beardGr.addColorStop(1, style.beardCol[1])
      ctx.fillStyle = beardGr
      ctx.beginPath()
      ctx.moveTo(cx - 6.5, by + 17)
      ctx.quadraticCurveTo(cx - 9, by + 26, cx - 4, by + 33)
      ctx.quadraticCurveTo(cx - 2, by + 37, cx, by + 38)
      ctx.quadraticCurveTo(cx + 2, by + 37, cx + 4, by + 33)
      ctx.quadraticCurveTo(cx + 9, by + 26, cx + 6.5, by + 17)
      ctx.quadraticCurveTo(cx, by + 21, cx - 6.5, by + 17)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = style.beardCol[1]
      ctx.lineWidth   = 0.8
      ctx.beginPath()
      ctx.moveTo(cx - 2, by + 22); ctx.lineTo(cx - 2.5, by + 34)
      ctx.moveTo(cx + 2, by + 22); ctx.lineTo(cx + 2.5, by + 34)
      ctx.stroke()
      ctx.fillStyle = style.beardCol[0]
      ctx.beginPath()
      ctx.ellipse(cx - 3, by + 19.5, 3, 1.8, 0.3, 0, Math.PI * 2)
      ctx.ellipse(cx + 3, by + 19.5, 3, 1.8, -0.3, 0, Math.PI * 2)
      ctx.fill()
    }

    // ── Headwear ─────────────────────────────────────────────────────────
    this.drawHeadwear(ctx, cx, by, style)

    // ── Eyes (on top, so headwear never hides them) ──────────────────────
    if (!a.blink) {
      ctx.fillStyle = style.eye
      ctx.beginPath()
      ctx.arc(cx - 3, by + 16.5, 1, 0, Math.PI * 2)
      ctx.arc(cx + 3, by + 16.5, 1, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  /** Held item (staff / dagger / pitchfork / bow) on the figure's right side. */
  private drawHeldItem(
    ctx: CanvasRenderingContext2D, cx: number, by: number,
    a: { staffRaise: number; glow: number }, style: HumanoidStyle,
  ) {
    if (style.item === 'none') return
    const sx = cx + 12

    if (style.item === 'staff') {
      const tipY = by + 4 - a.staffRaise
      const botY = by + 45
      ctx.save()
      ctx.lineCap = 'round'
      ctx.strokeStyle = '#5a3d1e'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(sx, tipY + 8); ctx.lineTo(sx + 1, botY); ctx.stroke()
      ctx.strokeStyle = '#8a6838'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(sx - 0.5, tipY + 9); ctx.lineTo(sx + 0.5, botY); ctx.stroke()
      ctx.strokeStyle = '#4a3318'; ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(sx, tipY + 8); ctx.quadraticCurveTo(sx - 4, tipY + 5, sx - 3, tipY + 1)
      ctx.moveTo(sx, tipY + 8); ctx.quadraticCurveTo(sx + 4, tipY + 5, sx + 3, tipY + 1)
      ctx.stroke()
      ctx.restore()
      // Crystal glow (casters)
      if (style.glow && a.glow > 0.2) {
        const ogr = ctx.createRadialGradient(sx, tipY + 3, 0, sx, tipY + 3, 13 * a.glow)
        ogr.addColorStop(0, `rgba(${style.glowRgb},${a.glow * 0.85})`)
        ogr.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = ogr
        ctx.beginPath(); ctx.arc(sx, tipY + 3, 13 * a.glow, 0, Math.PI * 2); ctx.fill()
      }
      // Crystal body
      const cgr = ctx.createRadialGradient(sx - 1, tipY + 1, 0, sx, tipY + 3, 5)
      cgr.addColorStop(0, '#ffffff')
      cgr.addColorStop(0.4, style.crystal)
      cgr.addColorStop(1, `rgba(${style.glowRgb},0.9)`)
      ctx.fillStyle = cgr
      ctx.beginPath()
      ctx.moveTo(sx, tipY - 2 - a.glow)
      ctx.lineTo(sx + 3.5, tipY + 3)
      ctx.lineTo(sx, tipY + 6 + a.glow)
      ctx.lineTo(sx - 3.5, tipY + 3)
      ctx.closePath()
      ctx.fill()
      if (style.glow && a.glow > 0.5) {
        ctx.save()
        ctx.fillStyle   = '#ffffff'
        ctx.shadowColor = style.crystal
        ctx.shadowBlur  = 5
        this.drawStar5(ctx, sx, tipY + 3, 2.5, 1)
        ctx.fill()
        ctx.restore()
      }
      return
    }

    if (style.item === 'dagger') {
      const hy = by + 34
      ctx.fillStyle = '#cdd6e0'
      ctx.beginPath()
      ctx.moveTo(sx, hy); ctx.lineTo(sx - 2.5, hy - 2); ctx.lineTo(sx - 1.5, hy - 13)
      ctx.lineTo(sx, hy - 15); ctx.lineTo(sx + 1.5, hy - 13); ctx.lineTo(sx + 2.5, hy - 2)
      ctx.closePath(); ctx.fill()
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.6
      ctx.beginPath(); ctx.moveTo(sx, hy - 2); ctx.lineTo(sx, hy - 14); ctx.stroke()
      ctx.fillStyle = '#6a4a2a'; ctx.fillRect(sx - 3, hy, 6, 1.6)       // crossguard
      ctx.fillStyle = '#4a3318'; ctx.fillRect(sx - 1, hy + 1.6, 2, 4)   // hilt
      return
    }

    if (style.item === 'pitchfork') {
      ctx.save(); ctx.lineCap = 'round'
      ctx.strokeStyle = '#8a6838'; ctx.lineWidth = 1.8
      ctx.beginPath(); ctx.moveTo(sx, by + 8); ctx.lineTo(sx + 1, by + 46); ctx.stroke()
      ctx.strokeStyle = '#c0c4cc'; ctx.lineWidth = 1.3
      ctx.beginPath()
      ctx.moveTo(sx - 3, by + 10); ctx.lineTo(sx - 3, by + 1)
      ctx.moveTo(sx,     by + 9);  ctx.lineTo(sx,     by)
      ctx.moveTo(sx + 3, by + 10); ctx.lineTo(sx + 3, by + 1)
      ctx.moveTo(sx - 3.5, by + 10); ctx.lineTo(sx + 3.5, by + 10)
      ctx.stroke(); ctx.restore()
      return
    }

    if (style.item === 'bow') {
      ctx.save(); ctx.lineCap = 'round'
      ctx.strokeStyle = '#7a5a32'; ctx.lineWidth = 1.8
      ctx.beginPath(); ctx.arc(sx - 1, by + 30, 14, -1.2, 1.2, false); ctx.stroke()
      ctx.strokeStyle = '#e0ddd0'; ctx.lineWidth = 0.6
      const a1 = -1.2, a2 = 1.2
      ctx.beginPath()
      ctx.moveTo(sx - 1 + 14 * Math.cos(a1), by + 30 + 14 * Math.sin(a1))
      ctx.lineTo(sx - 1 + 14 * Math.cos(a2), by + 30 + 14 * Math.sin(a2))
      ctx.stroke(); ctx.restore()
      return
    }
  }

  /** Headwear drawn over the head: wizard hat / hood / bandana / straw / cap. */
  private drawHeadwear(ctx: CanvasRenderingContext2D, cx: number, by: number, style: HumanoidStyle) {
    const brimY = by + 14
    switch (style.headwear) {
      case 'wizardhat': {
        ctx.fillStyle = style.hwMain
        ctx.beginPath()
        ctx.moveTo(cx - 13, brimY)
        ctx.quadraticCurveTo(cx, brimY + 6, cx + 13, brimY)
        ctx.quadraticCurveTo(cx, brimY - 4, cx - 13, brimY)
        ctx.closePath(); ctx.fill()
        const coneGr = ctx.createLinearGradient(cx - 9, by, cx + 9, brimY)
        coneGr.addColorStop(0, style.hwMain); coneGr.addColorStop(1, style.hwDark)
        ctx.fillStyle = coneGr
        ctx.beginPath()
        ctx.moveTo(cx - 9, brimY - 1)
        ctx.quadraticCurveTo(cx - 12, by + 6, cx - 8, by + 2)
        ctx.quadraticCurveTo(cx - 6, by - 1, cx - 3, by + 2)
        ctx.quadraticCurveTo(cx + 4, by + 6, cx + 9, brimY - 1)
        ctx.closePath(); ctx.fill()
        ctx.fillStyle = style.hwDark
        ctx.beginPath()
        ctx.moveTo(cx - 8.5, brimY - 2)
        ctx.quadraticCurveTo(cx, brimY + 1, cx + 8.5, brimY - 2)
        ctx.lineTo(cx + 8, brimY - 5)
        ctx.quadraticCurveTo(cx, brimY - 2, cx - 8, brimY - 5)
        ctx.closePath(); ctx.fill()
        break
      }
      case 'hood': {
        ctx.fillStyle = style.hwMain
        // Forehead dome
        ctx.beginPath()
        ctx.moveTo(cx - 8.5, by + 16)
        ctx.quadraticCurveTo(cx - 10, by + 2, cx, by + 1)
        ctx.quadraticCurveTo(cx + 10, by + 2, cx + 8.5, by + 16)
        ctx.quadraticCurveTo(cx, by + 10, cx - 8.5, by + 16)
        ctx.closePath(); ctx.fill()
        // Side flaps framing the face
        ctx.beginPath()
        ctx.moveTo(cx - 8.5, by + 15); ctx.quadraticCurveTo(cx - 10, by + 24, cx - 5, by + 27)
        ctx.lineTo(cx - 4, by + 22); ctx.quadraticCurveTo(cx - 7, by + 19, cx - 7, by + 15)
        ctx.closePath(); ctx.fill()
        ctx.beginPath()
        ctx.moveTo(cx + 8.5, by + 15); ctx.quadraticCurveTo(cx + 10, by + 24, cx + 5, by + 27)
        ctx.lineTo(cx + 4, by + 22); ctx.quadraticCurveTo(cx + 7, by + 19, cx + 7, by + 15)
        ctx.closePath(); ctx.fill()
        // Inner rim shade
        ctx.strokeStyle = style.hwDark; ctx.lineWidth = 1.4
        ctx.beginPath(); ctx.moveTo(cx - 7.5, by + 15); ctx.quadraticCurveTo(cx, by + 10, cx + 7.5, by + 15); ctx.stroke()
        break
      }
      case 'bandana': {
        // Skullcap above the band
        ctx.fillStyle = style.hwDark
        ctx.beginPath(); ctx.ellipse(cx, by + 13, 7, 5.5, 0, Math.PI, 0); ctx.fill()
        // Band across the forehead
        ctx.fillStyle = style.hwMain
        ctx.beginPath()
        ctx.moveTo(cx - 7.5, by + 15); ctx.quadraticCurveTo(cx, by + 11.5, cx + 7.5, by + 15)
        ctx.lineTo(cx + 7.5, by + 17.5); ctx.quadraticCurveTo(cx, by + 14, cx - 7.5, by + 17.5)
        ctx.closePath(); ctx.fill()
        // Knot + trailing tails (left side)
        ctx.beginPath(); ctx.arc(cx - 7.5, by + 16, 2, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.moveTo(cx - 7, by + 16); ctx.lineTo(cx - 12, by + 19); ctx.lineTo(cx - 10, by + 21); ctx.closePath(); ctx.fill()
        ctx.beginPath(); ctx.moveTo(cx - 7, by + 16); ctx.lineTo(cx - 11, by + 23); ctx.lineTo(cx - 9, by + 24); ctx.closePath(); ctx.fill()
        break
      }
      case 'strawhat': {
        const y = by + 13
        ctx.fillStyle = style.hwMain
        ctx.beginPath(); ctx.ellipse(cx, y, 13, 4.2, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = style.hwDark
        ctx.beginPath(); ctx.ellipse(cx, y - 3.5, 7, 4.5, 0, Math.PI, 0); ctx.fill()
        ctx.fillStyle = style.hwMain
        ctx.beginPath(); ctx.ellipse(cx, y - 2.5, 6.2, 3.5, 0, Math.PI, 0); ctx.fill()
        break
      }
      case 'merchanthat': {
        const y = by + 13
        ctx.fillStyle = style.hwMain
        ctx.beginPath(); ctx.ellipse(cx, y, 12, 3.6, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = style.hwDark
        ctx.beginPath()
        ctx.moveTo(cx - 6, y); ctx.lineTo(cx - 5, by + 4)
        ctx.quadraticCurveTo(cx, by + 2, cx + 5, by + 4); ctx.lineTo(cx + 6, y)
        ctx.closePath(); ctx.fill()
        // Feather
        ctx.strokeStyle = '#cc4444'; ctx.lineWidth = 1.4; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(cx + 5, by + 3); ctx.lineTo(cx + 9, by - 3); ctx.stroke()
        break
      }
    }
  }

  /** Draw a 5-pointed star path (call ctx.fill() after). */
  private drawStar5(ctx: CanvasRenderingContext2D, cx: number, cy: number, outerR: number, innerR: number) {
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI) / 5 - Math.PI / 2
      const r     = i % 2 === 0 ? outerR : innerR
      if (i === 0) ctx.moveTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r)
      else         ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r)
    }
    ctx.closePath()
  }

  // ── Enemy creature art ──────────────────────────────────────────────────────

  /** Draws a stylised creature for the given config, centred at (c, c). */
  private drawEnemyArt(g: Phaser.GameObjects.Graphics, cfg: EnemyConfig, c: number, r: number) {
    switch (cfg.key) {
      case 'slime': {
        // Translucent green jelly with a glossy dome + wobbly eyes
        g.fillStyle(0x247a24)                              // dark base puddle
        g.fillEllipse(c, c + r * 0.32, r * 2.05, r * 1.7)
        g.fillStyle(0x3fbf3f)                              // body
        g.fillEllipse(c, c + r * 0.12, r * 1.9, r * 1.55)
        g.fillStyle(0x66dd66, 0.55)                        // inner glow
        g.fillEllipse(c - r * 0.25, c - r * 0.15, r * 1.0, r * 0.8)
        // Big dome highlight (gives it the gel sheen)
        g.fillStyle(0xffffff, 0.5)
        g.fillEllipse(c - r * 0.35, c - r * 0.5, r * 0.62, r * 0.4)
        // Eyes
        g.fillStyle(0xffffff)
        g.fillCircle(c - r * 0.4, c, r * 0.3)
        g.fillCircle(c + r * 0.4, c, r * 0.3)
        g.fillStyle(0x113311)
        g.fillCircle(c - r * 0.36, c + r * 0.05, r * 0.15)
        g.fillCircle(c + r * 0.44, c + r * 0.05, r * 0.15)
        // Eye glints
        g.fillStyle(0xffffff)
        g.fillCircle(c - r * 0.42, c - r * 0.04, r * 0.06)
        g.fillCircle(c + r * 0.38, c - r * 0.04, r * 0.06)
        break
      }
      case 'wolf': {
        // Dire wolf — side profile facing right. Texture is (r*2+16)px square, c=center.
        // Body is shifted r*0.2 left so the snout fits without clipping.
        const bx = c - r * 0.2   // horizontal body centre
        const by = c + r * 0.08  // vertical body centre
        const D = 0x2e2925, M = 0x5c5248, L = 0x9e9080

        // Bushy tail — swept upward at rear
        g.fillStyle(M)
        g.fillTriangle(bx - r * 0.52, by - r * 0.05, bx - r * 1.48, by - r * 1.08, bx - r * 0.48, by + r * 0.32)
        g.fillStyle(L, 0.75)
        g.fillTriangle(bx - r * 0.92, by - r * 0.42, bx - r * 1.48, by - r * 1.08, bx - r * 1.22, by - r * 0.48)
        g.fillStyle(D)
        g.fillCircle(bx - r * 1.42, by - r * 1.05, r * 0.16)  // dark tail tip

        // Legs — 4 pillars with oval paws
        g.fillStyle(D)
        for (const lx of [-0.72, -0.28, 0.22, 0.62]) {
          g.fillRect(bx + lx * r - r * 0.11, by + r * 0.46, r * 0.26, r * 0.84)
          g.fillEllipse(bx + lx * r, by + r * 1.3, r * 0.42, r * 0.22)
        }

        // Body — main mass
        g.fillStyle(M)
        g.fillEllipse(bx, by + r * 0.08, r * 2.05, r * 1.26)
        // Pale underbelly
        g.fillStyle(0xb8aea4, 0.38)
        g.fillEllipse(bx + r * 0.1, by + r * 0.44, r * 1.45, r * 0.52)

        // Raised hackles along spine
        g.fillStyle(D)
        for (let k = 0; k < 5; k++) {
          const hx = bx - r * 0.78 + k * r * 0.36
          g.fillTriangle(hx - r * 0.12, by - r * 0.52, hx + r * 0.12, by - r * 0.52, hx, by - r * 0.98)
        }

        // Neck
        g.fillStyle(M)
        g.fillEllipse(bx + r * 0.74, by - r * 0.22, r * 0.66, r * 0.92)

        // Head
        g.fillStyle(M)
        g.fillEllipse(bx + r * 1.04, by - r * 0.26, r * 0.88, r * 0.76)

        // Ears — pointed, alert
        g.fillStyle(M)
        g.fillTriangle(bx + r * 0.68, by - r * 0.60, bx + r * 0.90, by - r * 0.60, bx + r * 0.72, by - r * 1.16)
        g.fillTriangle(bx + r * 0.96, by - r * 0.60, bx + r * 1.18, by - r * 0.60, bx + r * 1.14, by - r * 1.12)
        g.fillStyle(0x7a4242)  // pink inner ear
        g.fillTriangle(bx + r * 0.73, by - r * 0.66, bx + r * 0.87, by - r * 0.66, bx + r * 0.76, by - r * 0.98)
        g.fillTriangle(bx + r * 0.99, by - r * 0.66, bx + r * 1.14, by - r * 0.66, bx + r * 1.11, by - r * 0.96)

        // Muzzle / snout (dark wedge)
        g.fillStyle(D)
        g.fillEllipse(bx + r * 1.44, by - r * 0.12, r * 0.72, r * 0.44)
        g.fillStyle(L, 0.45)  // top-muzzle highlight
        g.fillEllipse(bx + r * 1.38, by - r * 0.25, r * 0.46, r * 0.22)
        // Nose (stays within texture: bx + r*1.75 = c - r*0.2 + r*1.75 = c + r*1.55 = c+18.6 < 39 ✓)
        g.fillStyle(0x0e0c0a)
        g.fillEllipse(bx + r * 1.72, by - r * 0.18, r * 0.24, r * 0.18)

        // Amber eye
        g.fillStyle(0xffcc22)
        g.fillCircle(bx + r * 1.1, by - r * 0.38, r * 0.17)
        g.fillStyle(0x0e0c0a)
        g.fillEllipse(bx + r * 1.12, by - r * 0.38, r * 0.08, r * 0.14)

        // Snarl fangs (bottom jaw)
        g.fillStyle(0xf0ece4)
        g.fillTriangle(bx + r * 1.28, by + r * 0.06, bx + r * 1.42, by + r * 0.06, bx + r * 1.35, by + r * 0.30)
        g.fillTriangle(bx + r * 1.46, by + r * 0.06, bx + r * 1.60, by + r * 0.06, bx + r * 1.53, by + r * 0.27)
        break
      }
      case 'bear': {
        // Hulking brown bear — front 3/4, round ears, broad shoulders, claws.
        const D = 0x4d3520, M = 0x6b4a2e, L = 0x8a6238

        // Hind/standing legs
        g.fillStyle(D)
        g.fillEllipse(c - r * 0.55, c + r * 0.95, r * 0.7, r * 1.0)
        g.fillEllipse(c + r * 0.55, c + r * 0.95, r * 0.7, r * 1.0)
        // Body (broad)
        g.fillStyle(M)
        g.fillEllipse(c, c + r * 0.25, r * 2.0, r * 1.95)
        // Lighter chest
        g.fillStyle(L, 0.5)
        g.fillEllipse(c, c + r * 0.45, r * 1.1, r * 1.2)
        // Shoulders hump
        g.fillStyle(M)
        g.fillCircle(c - r * 0.75, c - r * 0.35, r * 0.6)
        g.fillCircle(c + r * 0.75, c - r * 0.35, r * 0.6)
        // Front paws with claws
        g.fillStyle(D)
        g.fillEllipse(c - r * 0.7, c + r * 1.1, r * 0.6, r * 0.5)
        g.fillEllipse(c + r * 0.7, c + r * 1.1, r * 0.6, r * 0.5)
        g.fillStyle(0xe8dcc8)
        for (const px of [-0.85, -0.65, -0.45]) {
          g.fillTriangle(c + px * r, c + r * 1.25, c + px * r + r * 0.1, c + r * 1.25, c + (px + 0.05) * r, c + r * 1.5)
        }
        for (const px of [0.45, 0.65, 0.85]) {
          g.fillTriangle(c + px * r, c + r * 1.25, c + px * r + r * 0.1, c + r * 1.25, c + (px + 0.05) * r, c + r * 1.5)
        }
        // Head
        g.fillStyle(M)
        g.fillCircle(c, c - r * 0.55, r * 0.78)
        // Round ears
        g.fillStyle(D)
        g.fillCircle(c - r * 0.62, c - r * 1.1, r * 0.32)
        g.fillCircle(c + r * 0.62, c - r * 1.1, r * 0.32)
        g.fillStyle(M)
        g.fillCircle(c - r * 0.62, c - r * 1.08, r * 0.18)
        g.fillCircle(c + r * 0.62, c - r * 1.08, r * 0.18)
        // Snout
        g.fillStyle(L)
        g.fillEllipse(c, c - r * 0.28, r * 0.7, r * 0.5)
        g.fillStyle(0x1a1410)
        g.fillEllipse(c, c - r * 0.42, r * 0.26, r * 0.18)   // nose
        // Small angry eyes
        g.fillStyle(0x1a1410)
        g.fillCircle(c - r * 0.34, c - r * 0.68, r * 0.12)
        g.fillCircle(c + r * 0.34, c - r * 0.68, r * 0.12)
        g.fillStyle(0xffaa44, 0.9)
        g.fillCircle(c - r * 0.32, c - r * 0.7, r * 0.05)
        g.fillCircle(c + r * 0.36, c - r * 0.7, r * 0.05)
        break
      }
      case 'spider': {
        // Black widow — top-down, glossy black with red hourglass, 8 bent legs.
        // Texture (r*2+16)px, r=9, size=34, c=17. Legs safely within ±(r+7).
        const lw = Math.max(2, r * 0.28)

        // === 8 legs (4 per side) — two segments, bent outward ===
        g.lineStyle(lw, 0x140d1a)
        const legY = [-0.82, -0.24, 0.28, 0.72]  // attachment y offsets on body
        for (const sign of [-1, 1]) {
          for (let i = 0; i < 4; i++) {
            const ay = legY[i]
            // Attachment on body edge
            const ax = c + sign * r * 0.32
            const ay_ = c + ay * r
            // Knee — bent outward
            const spread = 1.08 + Math.abs(ay) * 0.18
            const kx = c + sign * r * spread
            const ky = c + ay * r * 0.55 + (i < 2 ? -r * 0.18 : r * 0.12)
            // Foot tip — angles back inward
            const fx = c + sign * r * 1.58
            const fy = c + ay * r * 1.32
            g.lineBetween(ax, ay_, kx, ky)
            g.lineBetween(kx, ky, fx, fy)
          }
        }
        // Leg highlight — slightly lighter top segment
        g.lineStyle(Math.max(1, lw * 0.5), 0x281c34, 0.6)
        for (const sign of [-1, 1]) {
          for (let i = 0; i < 4; i++) {
            const ay = legY[i]
            const ax = c + sign * r * 0.32, ay_ = c + ay * r
            const spread = 1.08 + Math.abs(ay) * 0.18
            const kx = c + sign * r * spread
            const ky = c + ay * r * 0.55 + (i < 2 ? -r * 0.18 : r * 0.12)
            g.lineBetween(ax - sign, ay_ - 1, kx - sign, ky - 1)
          }
        }

        // === Abdomen (rear) — bulbous, glossy black ===
        g.fillStyle(0x0d0812)
        g.fillEllipse(c + r * 0.04, c + r * 0.52, r * 1.62, r * 1.45)  // shadow
        g.fillStyle(0x180f20)
        g.fillEllipse(c, c + r * 0.46, r * 1.52, r * 1.35)
        // Gloss highlight (upper-left sheen)
        g.fillStyle(0x3a2448, 0.65)
        g.fillEllipse(c - r * 0.3, c + r * 0.14, r * 0.52, r * 0.38)
        // Red hourglass marking — two triangles meeting at centre
        g.fillStyle(0xcc1111)
        g.fillTriangle(c - r * 0.22, c + r * 0.22, c + r * 0.22, c + r * 0.22, c, c + r * 0.44)
        g.fillTriangle(c - r * 0.22, c + r * 0.72, c + r * 0.22, c + r * 0.72, c, c + r * 0.50)
        // Hourglass glow rim
        g.fillStyle(0xff4422, 0.4)
        g.fillTriangle(c - r * 0.26, c + r * 0.18, c + r * 0.26, c + r * 0.18, c, c + r * 0.46)
        g.fillTriangle(c - r * 0.26, c + r * 0.76, c + r * 0.26, c + r * 0.76, c, c + r * 0.48)

        // === Cephalothorax (front) — smaller, rounder ===
        g.fillStyle(0x0e0914)
        g.fillEllipse(c + r * 0.02, c - r * 0.52, r * 0.85, r * 0.76)  // shadow
        g.fillStyle(0x1c1226)
        g.fillEllipse(c, c - r * 0.56, r * 0.78, r * 0.68)
        // Gloss
        g.fillStyle(0x362048, 0.55)
        g.fillEllipse(c - r * 0.14, c - r * 0.7, r * 0.3, r * 0.22)

        // === Eyes — two large red main eyes + four small side eyes ===
        g.fillStyle(0xff2200)
        g.fillCircle(c - r * 0.22, c - r * 0.68, r * 0.16)
        g.fillCircle(c + r * 0.22, c - r * 0.68, r * 0.16)
        g.fillStyle(0xff5533, 0.85)
        g.fillCircle(c - r * 0.38, c - r * 0.58, r * 0.09)
        g.fillCircle(c + r * 0.38, c - r * 0.58, r * 0.09)
        g.fillCircle(c - r * 0.08, c - r * 0.82, r * 0.08)
        g.fillCircle(c + r * 0.08, c - r * 0.82, r * 0.08)
        // Eye shine
        g.fillStyle(0xffffff, 0.7)
        g.fillCircle(c - r * 0.25, c - r * 0.72, r * 0.06)
        g.fillCircle(c + r * 0.19, c - r * 0.72, r * 0.06)

        // === Fangs / chelicerae ===
        g.fillStyle(0x0c0712)
        g.fillTriangle(c - r * 0.2, c - r * 0.88, c - r * 0.04, c - r * 0.88, c - r * 0.12, c - r * 1.16)
        g.fillTriangle(c + r * 0.2, c - r * 0.88, c + r * 0.04, c - r * 0.88, c + r * 0.12, c - r * 1.16)
        // Fang tips (slightly lighter)
        g.fillStyle(0x241535)
        g.fillCircle(c - r * 0.12, c - r * 1.12, r * 0.08)
        g.fillCircle(c + r * 0.12, c - r * 1.12, r * 0.08)
        break
      }
      case 'ghoul': {
        // Hunched undead with sunken glowing eyes + claws
        g.fillStyle(0x7a4422)
        g.fillEllipse(c, c + r * 0.2, r * 1.9, r * 1.8)
        g.fillStyle(0xaa6633)
        g.fillEllipse(c, c, r * 1.7, r * 1.5)
        // Head hunch
        g.fillStyle(0x8a5128)
        g.fillCircle(c, c - r * 0.5, r * 0.7)
        // Sunken eye sockets
        g.fillStyle(0x2a1808)
        g.fillCircle(c - r * 0.35, c - r * 0.45, r * 0.26)
        g.fillCircle(c + r * 0.35, c - r * 0.45, r * 0.26)
        // Glowing eyes
        g.fillStyle(0xffcc22)
        g.fillCircle(c - r * 0.35, c - r * 0.45, r * 0.13)
        g.fillCircle(c + r * 0.35, c - r * 0.45, r * 0.13)
        // Claws
        g.fillStyle(0xddccbb)
        g.fillTriangle(c - r * 0.9, c + r * 0.8, c - r * 0.6, c + r * 0.7, c - r * 0.7, c + r * 1.1)
        g.fillTriangle(c + r * 0.9, c + r * 0.8, c + r * 0.6, c + r * 0.7, c + r * 0.7, c + r * 1.1)
        break
      }
      case 'imp': {
        // Small red devil with horns, ears and angry eyes
        // Bat-wing hints behind
        g.fillStyle(0x661100, 0.9)
        g.fillTriangle(c - r * 0.6, c, c - r * 1.5, c - r * 0.4, c - r * 1.2, c + r * 0.6)
        g.fillTriangle(c + r * 0.6, c, c + r * 1.5, c - r * 0.4, c + r * 1.2, c + r * 0.6)
        // Body
        g.fillStyle(0xcc1100)
        g.fillCircle(c, c + r * 0.1, r)
        g.fillStyle(0xff3322)
        g.fillCircle(c, c, r * 0.9)
        // Horns
        g.fillStyle(0x551100)
        g.fillTriangle(c - r * 0.55, c - r * 0.7, c - r * 0.2, c - r * 0.7, c - r * 0.5, c - r * 1.5)
        g.fillTriangle(c + r * 0.55, c - r * 0.7, c + r * 0.2, c - r * 0.7, c + r * 0.5, c - r * 1.5)
        // Angry eyes
        g.fillStyle(0xffee00)
        g.fillTriangle(c - r * 0.5, c - r * 0.1, c - r * 0.1, c, c - r * 0.45, c + r * 0.2)
        g.fillTriangle(c + r * 0.5, c - r * 0.1, c + r * 0.1, c, c + r * 0.45, c + r * 0.2)
        break
      }
      case 'brute': {
        // Big armoured tank with heavy shoulders + glowing eyes
        g.fillStyle(0x445566)
        g.fillCircle(c, c, r)
        g.fillStyle(0x667788)
        g.fillCircle(c, c, r * 0.92)
        // Shoulders
        g.fillStyle(0x556677)
        g.fillCircle(c - r * 0.85, c - r * 0.3, r * 0.5)
        g.fillCircle(c + r * 0.85, c - r * 0.3, r * 0.5)
        // Armor band
        g.fillStyle(0x2f3a44)
        g.fillRect(c - r * 0.9, c + r * 0.1, r * 1.8, r * 0.45)
        // Rivets
        g.fillStyle(0x99aabb)
        g.fillCircle(c - r * 0.6, c + r * 0.32, r * 0.1)
        g.fillCircle(c, c + r * 0.32, r * 0.1)
        g.fillCircle(c + r * 0.6, c + r * 0.32, r * 0.1)
        // Glowing eyes
        g.fillStyle(0xff4422)
        g.fillCircle(c - r * 0.32, c - r * 0.2, r * 0.16)
        g.fillCircle(c + r * 0.32, c - r * 0.2, r * 0.16)
        // Top highlight
        g.fillStyle(0x8899aa, 0.4)
        g.fillCircle(c - r * 0.25, c - r * 0.55, r * 0.3)
        break
      }
      case 'wraith': {
        // Hooded spectre — rounded hood, wispy tapering bottom, no feet
        g.fillStyle(cfg.color, 0.25)
        g.fillCircle(c, c, r + 4)                       // aura
        g.fillStyle(0xaa44ee, 0.9)
        // Cloak body: hood top + wispy tail
        g.fillCircle(c, c - r * 0.2, r * 0.95)
        g.fillTriangle(c - r * 0.9, c, c + r * 0.9, c, c, c + r * 1.5)
        // Wisp tendrils
        g.fillStyle(0x8833cc, 0.7)
        g.fillTriangle(c - r * 0.6, c + r * 0.6, c - r * 0.2, c + r * 0.6, c - r * 0.45, c + r * 1.4)
        g.fillTriangle(c + r * 0.6, c + r * 0.6, c + r * 0.2, c + r * 0.6, c + r * 0.45, c + r * 1.4)
        // Hood opening (dark)
        g.fillStyle(0x2a0d44)
        g.fillEllipse(c, c - r * 0.15, r * 1.1, r * 0.95)
        // Glowing eyes
        g.fillStyle(0xddaaff)
        g.fillCircle(c - r * 0.3, c - r * 0.2, r * 0.18)
        g.fillCircle(c + r * 0.3, c - r * 0.2, r * 0.18)
        break
      }
      case 'elite': {
        // Imposing golden champion — crown of spikes + bright aura
        g.lineStyle(3, 0xffdd00, 0.4)
        g.strokeCircle(c, c, r + 5)
        g.fillStyle(0xaa7700)
        g.fillCircle(c, c, r)
        g.fillStyle(0xddaa00)
        g.fillCircle(c, c, r * 0.9)
        // Crown of spikes
        g.fillStyle(0xffdd44)
        for (let i = -2; i <= 2; i++) {
          const sxk = c + i * r * 0.42
          g.fillTriangle(sxk - r * 0.18, c - r * 0.75, sxk + r * 0.18, c - r * 0.75, sxk, c - r * 1.3)
        }
        // Inner gem
        g.fillStyle(0xff8822)
        g.fillCircle(c, c + r * 0.1, r * 0.4)
        // Menacing eyes
        g.fillStyle(0xff5522)
        g.fillCircle(c - r * 0.38, c - r * 0.2, r * 0.16)
        g.fillCircle(c + r * 0.38, c - r * 0.2, r * 0.16)
        // Highlight
        g.fillStyle(0xffffff, 0.35)
        g.fillCircle(c - r * 0.3, c - r * 0.45, r * 0.28)
        break
      }
      case 'thornback': {
        // Massive dark-green spiked brute — radial bone spikes + armored shell
        g.lineStyle(3, 0x44ff44, 0.25)
        g.strokeCircle(c, c, r + 5)
        g.fillStyle(0x1a5520)
        g.fillCircle(c, c, r)
        g.fillStyle(0x228833)
        g.fillCircle(c, c, r * 0.88)
        // Bone spikes radiating out
        g.fillStyle(0xddddbb)
        for (let i = 0; i < 8; i++) {
          const a  = (i / 8) * Math.PI * 2 - Math.PI / 8
          const ox = Math.cos(a) * r * 0.8, oy = Math.sin(a) * r * 0.8
          g.fillTriangle(
            c + Math.cos(a - 0.22) * r * 0.65, c + Math.sin(a - 0.22) * r * 0.65,
            c + Math.cos(a + 0.22) * r * 0.65, c + Math.sin(a + 0.22) * r * 0.65,
            c + ox * 1.55, c + oy * 1.55,
          )
        }
        // Red glowing eyes
        g.fillStyle(0xff2200)
        g.fillCircle(c - r * 0.32, c - r * 0.18, r * 0.18)
        g.fillCircle(c + r * 0.32, c - r * 0.18, r * 0.18)
        g.fillStyle(0xffaa00, 0.7)
        g.fillCircle(c, c + r * 0.22, r * 0.28)
        break
      }
      case 'frost_warden': {
        // Ice-blue armoured guardian — hexagonal plate, crown of icicles
        g.lineStyle(3, 0xaaffff, 0.4)
        g.strokeCircle(c, c, r + 5)
        g.fillStyle(0x336699)
        g.fillCircle(c, c, r)
        g.fillStyle(0x88eeff)
        g.fillCircle(c, c, r * 0.85)
        // Icicle crown spikes
        g.fillStyle(0xddf6ff)
        for (let i = -2; i <= 2; i++) {
          const sx = c + i * r * 0.38
          const sh = r * 0.35 + Math.abs(i) * r * 0.08
          g.fillTriangle(sx - r * 0.14, c - r * 0.7, sx + r * 0.14, c - r * 0.7, sx, c - r * 0.7 - sh)
        }
        // Armour hex detail
        g.lineStyle(1.5, 0x336699, 0.8)
        g.strokeCircle(c, c + r * 0.1, r * 0.42)
        // Frost glow core
        g.fillStyle(0xffffff, 0.6)
        g.fillCircle(c, c + r * 0.1, r * 0.22)
        // Cold eyes
        g.fillStyle(0xffffff)
        g.fillCircle(c - r * 0.3, c - r * 0.2, r * 0.16)
        g.fillCircle(c + r * 0.3, c - r * 0.2, r * 0.16)
        g.fillStyle(0x0066cc)
        g.fillCircle(c - r * 0.3, c - r * 0.2, r * 0.08)
        g.fillCircle(c + r * 0.3, c - r * 0.2, r * 0.08)
        break
      }
      case 'corrupted_mage': {
        // Dark purple rogue caster — hooded with arcane rune + tentacle wisps
        g.lineStyle(3, 0xcc44ff, 0.35)
        g.strokeCircle(c, c, r + 5)
        g.fillStyle(0x3a0055)
        g.fillCircle(c, c, r)
        g.fillStyle(0x7a00cc)
        g.fillCircle(c, c, r * 0.88)
        // Wispy arcane tendrils (4 directions)
        g.fillStyle(0xcc44ff, 0.6)
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4
          g.fillTriangle(
            c + Math.cos(a - 0.3) * r * 0.7, c + Math.sin(a - 0.3) * r * 0.7,
            c + Math.cos(a + 0.3) * r * 0.7, c + Math.sin(a + 0.3) * r * 0.7,
            c + Math.cos(a) * r * 1.45,      c + Math.sin(a) * r * 1.45,
          )
        }
        // Arcane rune (star)
        g.fillStyle(0xffaaff, 0.85)
        g.fillCircle(c, c, r * 0.38)
        // Glowing purple eyes
        g.fillStyle(0xff88ff)
        g.fillCircle(c - r * 0.28, c - r * 0.12, r * 0.16)
        g.fillCircle(c + r * 0.28, c - r * 0.12, r * 0.16)
        g.fillStyle(0xffffff, 0.6)
        g.fillCircle(c - r * 0.28, c - r * 0.12, r * 0.06)
        g.fillCircle(c + r * 0.28, c - r * 0.12, r * 0.06)
        break
      }
      case 'arcane_lich': {
        // Undead lich — dark skeletal body, glowing cyan rune skull
        g.lineStyle(3, 0x44ddff, 0.4)
        g.strokeCircle(c, c, r + 6)
        g.fillStyle(0x0d1a22)
        g.fillCircle(c, c, r)
        g.fillStyle(0x1a3344)
        g.fillCircle(c, c, r * 0.9)
        // Skull dome
        g.fillStyle(0x223344)
        g.fillCircle(c, c - r * 0.22, r * 0.72)
        // Jaw notch
        g.fillStyle(0x0d1a22)
        g.fillRect(c - r * 0.32, c + r * 0.25, r * 0.64, r * 0.35)
        // Teeth
        g.fillStyle(0xaaccdd)
        for (let i = -1; i <= 1; i++) {
          g.fillRect(c + i * r * 0.28 - r * 0.08, c + r * 0.25, r * 0.14, r * 0.22)
        }
        // Glowing cyan eyes
        g.fillStyle(0x44ddff)
        g.fillCircle(c - r * 0.32, c - r * 0.28, r * 0.2)
        g.fillCircle(c + r * 0.32, c - r * 0.28, r * 0.2)
        g.fillStyle(0xaaffff, 0.9)
        g.fillCircle(c - r * 0.32, c - r * 0.28, r * 0.09)
        g.fillCircle(c + r * 0.32, c - r * 0.28, r * 0.09)
        // Crown rune glow
        g.fillStyle(0x44ddff, 0.45)
        g.fillCircle(c, c - r * 0.9, r * 0.28)
        break
      }
      case 'ashen_giant': {
        // Colossal lava titan — cracked grey rock skin with molten core veins
        g.lineStyle(4, 0xff6622, 0.35)
        g.strokeCircle(c, c, r + 7)
        g.fillStyle(0x333333)
        g.fillCircle(c, c, r)
        g.fillStyle(0x555555)
        g.fillCircle(c, c, r * 0.92)
        // Molten crack veins
        g.lineStyle(2, 0xff4400, 0.9)
        g.strokeCircle(c, c, r * 0.6)
        g.lineStyle(1.5, 0xff8800, 0.6)
        g.strokeCircle(c, c + r * 0.2, r * 0.36)
        // Lava core glow
        g.fillStyle(0xff6622, 0.85)
        g.fillCircle(c, c + r * 0.1, r * 0.42)
        g.fillStyle(0xffbb44, 0.7)
        g.fillCircle(c, c + r * 0.1, r * 0.22)
        // Rocky brow ridges
        g.fillStyle(0x444444)
        g.fillRect(c - r * 0.75, c - r * 0.5, r * 1.5, r * 0.28)
        // Small sunken eyes
        g.fillStyle(0xff4400)
        g.fillCircle(c - r * 0.36, c - r * 0.34, r * 0.16)
        g.fillCircle(c + r * 0.36, c - r * 0.34, r * 0.16)
        g.fillStyle(0xffcc44, 0.9)
        g.fillCircle(c - r * 0.36, c - r * 0.34, r * 0.07)
        g.fillCircle(c + r * 0.36, c - r * 0.34, r * 0.07)
        break
      }
      default: {
        g.fillStyle(cfg.color)
        g.fillCircle(c, c, r)
        g.fillStyle(0xffffff, 0.25)
        g.fillCircle(c - r * 0.2, c - r * 0.3, r * 0.38)
      }
    }
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
    this.player.inventory.notifyChange()
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
      } else if (this.nearNPC === 'quest')   this.openQuestDialog()
      else if (this.nearNPC === 'zone')      this.openZoneNPCDialog(this.nearZoneNPCIdx)
      else if (this.nearNPC === 'farmer')    this.openFarmerDialog()
      else if (this.nearNPC === 'trainer')   this.openTrainerDialog()
      else                                   this.openMerchantDialog()
    } else if (this.nearChicken) {
      this.feedChicken()
    } else if (this.nearStash) {
      if (this.stashUI.isOpen()) this.stashUI.hide()
      else {
        this.inventoryUI.isOpen()   && this.inventoryUI.hide()
        this.talentUI.isOpen()      && this.talentUI.hide()
        this.progressionUI.isOpen() && this.progressionUI.hide()
        this.shopUI.isOpen()        && this.shopUI.hide()
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
    this.npcQuest = this.add.image(cx - 180, cy - 20, 'npc_elder').setDepth(4).setOrigin(0.5, 1)
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

    // Spell Trainer NPC — center-north of town
    this.npcTrainer = this.add.image(cx + 60, cy - 90, 'npc_icemage').setDepth(4).setOrigin(0.5, 1)
    this.add.text(cx + 60, cy - 138, 'Spell Trainer', {
      fontSize: '13px', fontStyle: 'bold',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#88ddff',
      stroke: '#000', strokeThickness: 4,
    }).setDepth(4).setOrigin(0.5)
    this.add.text(cx + 60, cy - 122, '✦ Train Spells', {
      fontSize: '11px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#aaffee',
      stroke: '#000', strokeThickness: 3,
    }).setDepth(4).setOrigin(0.5)

    // Zone quest-giver NPCs — placed inside each zone, visible once unlocked
    const zoneNPCDefs: Array<{ x: number; y: number; name: string; travelZone: string; texture: string; label: string }> = [
      { x: 1800, y: 550,  name: 'Mage Solvara',      travelZone: 'Frozen Ruins',     texture: 'npc_icemage',    label: '! Quest' },
      { x: 750,  y: 1800, name: 'Ranger Aldric',      travelZone: 'Corrupted Fields', texture: 'npc_ranger',     label: '! Quest' },
      { x: 2850, y: 1800, name: 'Hermit Zethkar',     travelZone: 'Arcane Caves',     texture: 'npc_hermit',     label: '! Quest' },
      { x: 3900, y: 1800, name: 'Pyromancer Ignis',   travelZone: 'Volcanic Wastes',  texture: 'npc_pyromancer', label: '! Quest' },
    ]
    for (const def of zoneNPCDefs) {
      const sprite = this.add.image(def.x, def.y, def.texture).setDepth(4).setOrigin(0.5, 1)
      this.add.text(def.x, def.y - 48, def.name, {
        fontSize: '13px', fontStyle: 'bold',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#ffffff',
        stroke: '#000', strokeThickness: 4,
      }).setDepth(4).setOrigin(0.5)
      this.add.text(def.x, def.y - 32, def.label, {
        fontSize: '11px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#ffdd44',
        stroke: '#000', strokeThickness: 3,
      }).setDepth(4).setOrigin(0.5)
      this.zoneNPCs.push({ sprite, travelZone: def.travelZone, name: def.name })
    }

    // Direction signs
    const sty = (col: string) => ({ fontSize: '12px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: col, stroke: '#000', strokeThickness: 4 })
    this.add.text(cx, cy + 260, '▼  Beginner Forest',        sty('#44cc44')).setDepth(4).setOrigin(0.5)
    this.add.text(cx, cy - 260, '▲  Frozen Ruins (Danger)',  sty('#88ccff')).setDepth(4).setOrigin(0.5)
    this.add.text(cx - 290, cy, '◄  Corrupted Fields',       sty('#cc4444')).setDepth(4).setOrigin(0.5)
    this.add.text(cx + 290, cy, 'Arcane Caves  ►',           sty('#aa44ff')).setDepth(4).setOrigin(0.5)

    // Farmer Holt — stands at the south border of town near the forest road
    this.npcFarmer = this.add.image(cx - 110, cy + 215, 'npc_farmer')
      .setDepth(4).setOrigin(0.5, 1)
    this.add.text(cx - 110, cy + 215 - 48, 'Farmer Holt', {
      fontSize: '13px', fontStyle: 'bold',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#ddcc88',
      stroke: '#000', strokeThickness: 4,
    }).setDepth(4).setOrigin(0.5)
    this.add.text(cx - 110, cy + 215 - 32, '! Quest', {
      fontSize: '11px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#ffdd44',
      stroke: '#000', strokeThickness: 3,
    }).setDepth(4).setOrigin(0.5)

    // Proximity prompt (world-space, follows camera)
    this.npcPrompt = this.add.text(0, 0, 'Press E to talk', {
      fontSize: '11px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#ffffcc',
      stroke: '#000000', strokeThickness: 3,
      backgroundColor: '#00000088', padding: { x: 4, y: 2 },
    }).setDepth(10).setOrigin(0.5).setVisible(false)
  }

  private updateNPCProximity() {
    const px = this.player.x, py = this.player.y

    // Zone NPCs — always detectable, not locked to travel quest state
    this.nearZoneNPCIdx = -1
    for (let i = 0; i < this.zoneNPCs.length; i++) {
      const znpc = this.zoneNPCs[i]
      const d = Phaser.Math.Distance.Between(px, py, znpc.sprite.x, znpc.sprite.y)
      if (d < 90) {
        this.nearNPC = 'zone'
        this.nearZoneNPCIdx = i
        this.npcPrompt.setText('Press E to talk').setPosition(znpc.sprite.x, znpc.sprite.y - 72).setVisible(true)
        this.mobileControls?.showInteract('Talk')
        return
      }
    }

    // Farmer Holt
    const dF = Phaser.Math.Distance.Between(px, py, this.npcFarmer.x, this.npcFarmer.y)
    if (dF < 90) {
      this.nearNPC = 'farmer'
      this.npcPrompt.setText('Press E to talk').setPosition(this.npcFarmer.x, this.npcFarmer.y - 72).setVisible(true)
      this.mobileControls?.showInteract('Talk')
      return
    }

    // Chicken — only when the feed quest is active
    this.nearChicken = false
    if (this.chickenQuestState === 'accepted') {
      for (const c of this.world.chickenPositions) {
        const dc = Phaser.Math.Distance.Between(px, py, c.x, c.y)
        if (dc < 55) {
          this.nearChicken = true
          this.nearNPC = null
          this.npcPrompt.setText('Press E to feed').setPosition(c.x, c.y - 28).setVisible(true)
          this.mobileControls?.showInteract('Feed')
          return
        }
      }
    }

    const dQ = Phaser.Math.Distance.Between(px, py, this.npcQuest.x,    this.npcQuest.y)
    const dM = Phaser.Math.Distance.Between(px, py, this.npcMerchant.x, this.npcMerchant.y)
    const dT = Phaser.Math.Distance.Between(px, py, this.npcTrainer.x,  this.npcTrainer.y)
    if (dT < 90) {
      this.nearNPC = 'trainer'
      this.npcPrompt.setText('Press E to train').setPosition(this.npcTrainer.x, this.npcTrainer.y - 72).setVisible(true)
      this.mobileControls?.showInteract('Train')
    } else if (dQ < 90) {
      this.nearNPC = 'quest'
      this.npcPrompt.setText('Press E to talk').setPosition(this.npcQuest.x, this.npcQuest.y - 72).setVisible(true)
      this.mobileControls?.showInteract('Talk')
    } else if (dM < 90) {
      this.nearNPC = 'merchant'
      this.npcPrompt.setText('Press E to talk').setPosition(this.npcMerchant.x, this.npcMerchant.y - 72).setVisible(true)
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
      // No quest yet — offer first quest
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

    } else if (q?.type === 'travel') {
      // On a travel quest — Mirwen reminds player where to go
      lines = [
        'Elder Mirwen:',
        '',
        `"${q.title}"`,
        `"${q.desc}"`,
        '',
        `Head to: ${q.travelZone}`,
        '',
        '[E] Close',
      ]
      this.questDialogAction = false

    } else if (q && this.questKills >= q.target) {
      // Kill quest complete — collect reward
      lines = [
        'Elder Mirwen:',
        '',
        '"Well done! You have completed:"',
        `"${q.title}"`,
        '',
        `Reward: +${q.xp} XP  +${formatCopper(q.gold)}`,
        '',
        '[E] Collect reward',
      ]
      this.questDialogAction = true

    } else if (q) {
      // Kill quest in progress
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
      // All done
      lines = [
        'Elder Mirwen:',
        '',
        '"You have cleared all the lands."',
        '"The title of Archmage is yours."',
        '',
        '[E] Close',
      ]
      this.questDialogAction = false
    }
    this.showDialog(lines)
    this.dialogOpen = true
  }

  private openZoneNPCDialog(idx: number) {
    if (this.dialogOpen || idx < 0) return
    const npc   = this.zoneNPCs[idx]
    const { name, travelZone } = npc
    const activeQ = this.questDefs[this.activeQuestIdx]

    // Travel quest for this zone — show quest offer
    if (activeQ?.type === 'travel' && activeQ.travelZone === travelZone) {
      const lines = [
        `${name}:`,
        ...(activeQ.arriveLines ?? [
          `"You made it to ${travelZone}."`,
          '"There is work to be done here."',
        ]),
        '',
        '[E] Accept quest',
      ]
      this.questDialogAction = true
      this.showDialog(lines)
      this.dialogOpen = true
      return
    }

    // Find zone kill quests for this NPC
    const zoneKillQuests = this.questDefs.map((q, i) => ({ q, i })).filter(({ q }) => q.zone === travelZone)
    const currentZoneQ   = zoneKillQuests.find(({ i }) => i === this.activeQuestIdx)
    const travelIdx      = this.questDefs.findIndex(q => q.type === 'travel' && q.travelZone === travelZone)
    const pastZone       = zoneKillQuests.length > 0 && zoneKillQuests.every(({ i }) => i < this.activeQuestIdx)
    const notYetReached  = travelIdx >= 0 && this.activeQuestIdx < travelIdx

    let lines: string[]
    if (notYetReached) {
      lines = [
        `${name}:`,
        '',
        '"I don\'t know you yet, traveler."',
        '"Come back when you have business here."',
        '',
        '[E] Close',
      ]
    } else if (currentZoneQ) {
      const { q } = currentZoneQ
      const left = Math.max(0, q.target - this.questKills)
      if (this.questKills >= q.target) {
        lines = [
          `${name}:`,
          '',
          `"You've done it — ${q.title} complete!"`,
          '"Keep pushing. There\'s more work ahead."',
          '',
          `Progress: ${q.target} / ${q.target} ★`,
          '',
          '[E] Close',
        ]
      } else {
        lines = [
          `${name}:`,
          '',
          `Quest: ${q.title}`,
          q.desc,
          '',
          `Progress: ${this.questKills} / ${q.target}  (${left} left)`,
          '',
          '[E] Close',
        ]
      }
    } else if (pastZone) {
      lines = [
        `${name}:`,
        '',
        '"You cleared this land. Well done."',
        '"The next frontier awaits you."',
        '',
        '[E] Close',
      ]
    } else {
      lines = [
        `${name}:`,
        '',
        '"Dangerous times..."',
        '"Stay sharp out there."',
        '',
        '[E] Close',
      ]
    }

    this.questDialogAction = false
    this.showDialog(lines)
    this.dialogOpen = true
  }

  private openFarmerDialog() {
    if (this.dialogOpen) return
    let lines: string[]

    if (this.chickenQuestState === 'none') {
      lines = [
        'Farmer Holt:',
        '',
        '"Ah — a wandering mage, heading into the wilds?"',
        '"Before you go — my old hen Bessie hasn\'t been fed today."',
        '"She\'s just pecking around nearby."',
        '"Would you toss her some grain? Just press E near her."',
        '',
        '[E] Sure, I\'ll feed her',
      ]
      this.questDialogAction = true
    } else if (this.chickenQuestState === 'accepted') {
      lines = [
        'Farmer Holt:',
        '',
        '"Bessie\'s just right there, pecking around!"',
        '"Walk up to her and press E to give her some grain."',
        '',
        '[E] Close',
      ]
      this.questDialogAction = false
    } else if (this.chickenQuestState === 'fed') {
      lines = [
        'Farmer Holt:',
        '',
        '"She\'s full and happy — bless you, mage!"',
        '"Take this for your trouble. Safe travels out there."',
        '',
        'Reward: +60 XP  +5s',
        '',
        '[E] Collect reward',
      ]
      this.questDialogAction = true
    } else {
      lines = [
        'Farmer Holt:',
        '',
        '"Thanks again for feeding old Bessie!"',
        '"Come back safe from the wilds."',
        '',
        '[E] Close',
      ]
      this.questDialogAction = false
    }

    this.showDialog(lines)
    this.dialogOpen = true
  }

  private openTrainerDialog() {
    if (this.dialogOpen) return
    const frostModal = (window as any).__frostModal
    if (!frostModal) return

    const TRAINABLE = [
      { name: 'arcaneExplosion', label: 'Arcane Explosion', key: 'Q', cost: 100  },
      { name: 'frostNova',       label: 'Frost Nova',        key: 'E', cost: 200  },
      { name: 'blizzard',        label: 'Blizzard',           key: 'R', cost: 500  },
    ]

    const level = this.player.stats.level
    const gold  = this.player.inventory.gold

    const lines: string[] = [
      '',
      '"Welcome, apprentice. I can teach you the arcane arts."',
      '"Prove your worth and bring the coin."',
      '',
    ]
    for (const sp of TRAINABLE) {
      const lvReq = SPELL_TRAIN_LEVEL[sp.name] ?? 1
      if (this.player.hasSpell(sp.name)) {
        lines.push(`  ✓  ${sp.label}  — Learned`)
      } else if (level < lvReq) {
        lines.push(`  ✗  ${sp.label}  — Requires level ${lvReq}`)
      } else if (gold < sp.cost) {
        lines.push(`  ✗  ${sp.label}  — ${formatCopper(sp.cost)}  (need more gold)`)
      } else {
        lines.push(`  ○  ${sp.label}  — ${formatCopper(sp.cost)}`)
      }
    }

    const trainable = TRAINABLE.filter(sp => {
      const lvReq = SPELL_TRAIN_LEVEL[sp.name] ?? 1
      return !this.player.hasSpell(sp.name) && level >= lvReq && gold >= sp.cost
    })

    const buttons = [
      ...trainable.map(sp => ({
        label: `Train ${sp.label}`,
        primary: true,
        onClick: () => {
          this.player.learnSpell(sp.name)
          this.player.inventory.gold -= sp.cost
          this.player.inventory.notifyChange()
          this.mobileControls?.setLearnedSpells(this.player.learnedSpells)
          this.hud.showQuestUpdate(`Learned: ${sp.label}!`, '#aaffcc')
          this.dialogOpen = false
          this.npcPrompt.setVisible(false)
        },
      })),
      { label: 'Close', primary: trainable.length === 0, onClick: () => this.dismissDialog() },
    ]

    frostModal.show({
      title: 'Spell Trainer',
      lines,
      buttons,
      onClose: () => this.dismissDialog(),
    })
    this.dialogOpen = true
  }

  private feedChicken() {
    if (this.chickenQuestState !== 'accepted') return
    this.chickenQuestState = 'fed'
    this.nearChicken = false
    this.npcPrompt.setVisible(false)
    this.hud.showFloatingText(this.player.x, this.player.y - 30, 'Chicken fed!', '#ffdd44', 16)
    this.hud.showQuestUpdate('Bessie is fed!\nReturn to Farmer Holt.', '#aadd44')
    const burst = this.add.particles(this.player.x, this.player.y - 10, 'particle', {
      speed: { min: 20, max: 80 }, scale: { start: 0.5, end: 0 },
      alpha: { start: 1, end: 0 }, lifespan: 500,
      tint: [0xffdd44, 0xffffff, 0xffcc88],
      angle: { min: 0, max: 360 }, emitting: false,
    }).setDepth(9)
    burst.explode(8)
    this.time.delayedCall(600, () => { if (burst.active) burst.destroy() })
  }

  private openHelpPanel() {
    const frostModal = (window as any).__frostModal
    if (!frostModal) return
    frostModal.show({
      title: 'Controls & Help',
      lines: [
        '◆ Move — WASD keys or the joystick',
        '◆ Bolt — Left-click or the F button',
        '◆ Swap bolt — X key or the 🔥/❄ button',
        '◆ Arcane Explosion — Q',
        '◆ Frost Nova — E',
        '◆ Blizzard — R',
        '',
        '◆ Inventory — I',
        '◆ Talents — T',
        '◆ Progress — P',
        '',
        '◆ Interact / talk — E or the green button',
      ],
      buttons: [{ label: 'Got it', primary: true, onClick: () => {} }],
      onClose: () => {},
    })
  }

  private openMerchantDialog() {
    if (this.dialogOpen || this.shopUI.isOpen()) return
    this.inventoryUI.isOpen() && this.inventoryUI.hide()
    this.talentUI.isOpen()    && this.talentUI.hide()
    this.progressionUI.isOpen() && this.progressionUI.hide()
    this.stashUI.isOpen()     && this.stashUI.hide()
    this.shopUI.open()
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

    // Farmer Holt chicken quest hand-in
    if (this.nearNPC === 'farmer') {
      if (this.chickenQuestState === 'none') {
        this.chickenQuestState = 'accepted'
        this.hud.showQuestUpdate('Quest accepted!\nFeed the Chicken', '#aadd44')
      } else if (this.chickenQuestState === 'fed') {
        this.chickenQuestState = 'complete'
        this.player.gainXP(60)
        this.player.inventory.gold += 500
        this.player.inventory.notifyChange()
        this.hud.showQuestUpdate('Quest complete!\n+60 XP  +5s', '#ffdd44')
      }
      return
    }

    // Zone NPC — accept travel quest and start kill quest
    if (this.nearNPC === 'zone') {
      this.completeTravelQuest()
      return
    }

    const q = this.questDefs[this.activeQuestIdx]
    if (this.activeQuestIdx < 0) {
      // Accept first quest
      this.activeQuestIdx = 0
      this.questKills = 0
      this.updateQuestHUD()
      this.hud.showQuestUpdate('Quest accepted!\n' + this.questDefs[0].title, '#aadd44')
    } else if (q && this.questKills >= q.target) {
      // Collect reward from Elder Mirwen
      this.player.gainXP(q.xp)
      this.player.inventory.gold += q.gold
      this.player.inventory.notifyChange()
      this.hud.showQuestUpdate(`Quest complete!\n+${q.xp} XP  +${formatCopper(q.gold)}`, '#ffdd44')
      this.hideQuestObjectiveMarker()
      const next = this.activeQuestIdx + 1
      if (next < this.questDefs.length) {
        this.activeQuestIdx = next
        this.questKills = 0
        this.updateQuestHUD()
        const nq = this.questDefs[next]
        if (nq.type === 'travel') {
          // Show marker for the travel destination and Mirwen's send-off
          this.showQuestObjectiveMarker(nq.markerX!, nq.markerY!, nq.markerLabel!)
          this.time.delayedCall(2000, () => {
            this.hud.showQuestUpdate(`New quest!\n${nq.title}\n${nq.desc}`, '#aadd44')
          })
        } else {
          this.time.delayedCall(2400, () => {
            this.hud.showQuestUpdate('New quest!\n' + nq.title, '#aadd44')
          })
        }
      } else {
        this.activeQuestIdx = -2
        this.hud.setQuestText('All zones cleared!\nYou are the Archmage.')
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
      // ── Phase 1: Elder Mirwen — Town ──────────────────────────────────────
      { title: 'First Blood',      desc: 'Slay 5 creatures near town.',        target: 5,  xp: 80,  gold: 1500  },
      { title: 'Pest Control',     desc: 'Defeat 12 enemies across the land.', target: 12, xp: 160, gold: 3500  },
      { title: 'Growing Stronger', desc: 'Hunt down 25 enemies in the wilds.', target: 25, xp: 300, gold: 7000  },

      // ── Travel 1: Town → Frozen Ruins ─────────────────────────────────────
      {
        type: 'travel', title: 'A Frozen Lead',
        desc: 'Travel north and find Mage Solvara in the Frozen Ruins.',
        target: 0, xp: 60, gold: 1200,
        travelZone: 'Frozen Ruins', markerX: 1800, markerY: 550, markerLabel: '▲ Frozen Ruins',
        giver: 'Mage Solvara',
        arriveLines: [
          '"You braved the cold to find me — good."',
          '"This city was great once. Undead now haunt every corner."',
          '"Thin their numbers. Show them we still fight back."',
          '',
          'Quest: Ice Cleansing',
          'Slay 20 enemies in the Frozen Ruins.',
        ],
      },

      // ── Phase 2: Frozen Ruins — auto-collect ──────────────────────────────
      { title: 'Ice Cleansing', desc: 'Slay 20 enemies in the Frozen Ruins.',    target: 20, zone: 'Frozen Ruins', xp: 280,  gold: 6000,  autoCollect: true },
      { title: 'Frozen Menace', desc: 'Defeat 40 enemies in the Frozen Ruins.',  target: 40, zone: 'Frozen Ruins', xp: 520,  gold: 12000, autoCollect: true },

      // ── Travel 2: Frozen Ruins → Corrupted Fields ─────────────────────────
      {
        type: 'travel', title: 'The Tainted West',
        desc: 'Head west and find Ranger Aldric in the Corrupted Fields.',
        target: 0, xp: 60, gold: 1200,
        travelZone: 'Corrupted Fields', markerX: 750, markerY: 1800, markerLabel: '◄ Corrupted Fields',
        giver: 'Ranger Aldric',
        arriveLines: [
          '"Finally! A mage. This blight has spread too long."',
          '"Demons twisted these fields beyond recognition."',
          '"No mercy. Purge them all."',
          '',
          'Quest: Purge the Corruption',
          'Slay 25 enemies in the Corrupted Fields.',
        ],
      },

      // ── Phase 3: Corrupted Fields — auto-collect ──────────────────────────
      { title: 'Purge the Corruption', desc: 'Slay 25 enemies in the Corrupted Fields.', target: 25, zone: 'Corrupted Fields', xp: 450, gold: 10000, autoCollect: true },
      { title: 'Root of Evil',         desc: 'Defeat 50 enemies in the Corrupted Fields.',target: 50, zone: 'Corrupted Fields', xp: 800, gold: 20000, autoCollect: true },

      // ── Travel 3: Corrupted Fields → Arcane Caves ─────────────────────────
      {
        type: 'travel', title: 'Into the Depths',
        desc: 'Travel east and find Hermit Zethkar in the Arcane Caves.',
        target: 0, xp: 60, gold: 1200,
        travelZone: 'Arcane Caves', markerX: 2850, markerY: 1800, markerLabel: '► Arcane Caves',
        giver: 'Hermit Zethkar',
        arriveLines: [
          '"...you dare enter my sanctuary? Bold."',
          '"Raw arcane energy warps everything it touches here."',
          '"Survive this, and the title of Archmage is yours."',
          '',
          'Quest: Cave Delver',
          'Slay 30 enemies in the Arcane Caves.',
        ],
      },

      // ── Phase 4: Arcane Caves — auto-collect ──────────────────────────────
      { title: 'Cave Delver',  desc: 'Slay 30 enemies in the Arcane Caves.',   target: 30, zone: 'Arcane Caves', xp: 700,  gold: 18000, autoCollect: true },
      { title: 'Arcane Purge', desc: 'Defeat 60 enemies in the Arcane Caves.', target: 60, zone: 'Arcane Caves', xp: 1200, gold: 35000, autoCollect: true },

      // ── Travel 4: Arcane Caves → Volcanic Wastes ─────────────────────────
      {
        type: 'travel', title: 'Into the Wastes',
        desc: 'Cross east past the Arcane Caves — find Pyromancer Ignis in the Volcanic Wastes.',
        target: 0, xp: 100, gold: 3000,
        travelZone: 'Volcanic Wastes', markerX: 3900, markerY: 1800, markerLabel: '► Volcanic Wastes',
        giver: 'Pyromancer Ignis',
        arriveLines: [
          '"The forge-fire never sleeps. Neither do I."',
          '"Ash demons and molten elites haunt every crater."',
          '"Burn them all. The caldera demands sacrifice."',
          '',
          'Quest: Forge Trial',
          'Slay 40 enemies in the Volcanic Wastes.',
        ],
      },

      // ── Phase 5: Volcanic Wastes — auto-collect ───────────────────────────
      { title: 'Forge Trial', desc: 'Slay 40 enemies in the Volcanic Wastes.',   target: 40,  zone: 'Volcanic Wastes', xp: 1500, gold: 55000,  autoCollect: true },
      { title: 'The Inferno', desc: 'Defeat 80 enemies in the Volcanic Wastes.', target: 80,  zone: 'Volcanic Wastes', xp: 2400, gold: 100000, autoCollect: true },
      { title: 'Archmage',    desc: 'Reach the summit — slay 120 in the Wastes.',target: 120, zone: 'Volcanic Wastes', xp: 4000, gold: 200000, autoCollect: true },
    ]
    this.updateQuestHUD()
  }

  private trackQuestKill() {
    const q = this.questDefs[this.activeQuestIdx]
    if (!q || q.type === 'travel') return
    if (q.zone && getZoneAt(this.player.x, this.player.y)?.name !== q.zone) return
    this.questKills++
    this.updateQuestHUD()

    // WoW-style quest progress popup above the player's head
    const capped = Math.min(this.questKills, q.target)
    this.hud.showFloatingText(
      this.player.x, this.player.y - 52,
      `${q.title}: ${capped}/${q.target}`,
      '#ffe066', 16,
    )

    if (this.questKills >= q.target) {
      if (q.autoCollect) {
        this.hud.showQuestUpdate(`Quest complete!\n${q.title}`, '#ffdd44')
        this.time.delayedCall(2000, () => this.autoCompleteQuest())
      } else {
        this.hud.showQuestUpdate('Quest complete!\nReturn to Elder Mirwen.', '#ffdd44')
      }
    }
  }

  private autoCompleteQuest() {
    const q = this.questDefs[this.activeQuestIdx]
    if (!q) return
    this.player.gainXP(q.xp)
    this.player.inventory.gold += q.gold
    this.player.inventory.notifyChange()
    this.hud.showQuestUpdate(`+${q.xp} XP  +${formatCopper(q.gold)}`, '#ffdd44')
    this.hideQuestObjectiveMarker()
    const next = this.activeQuestIdx + 1
    if (next < this.questDefs.length) {
      this.activeQuestIdx = next
      this.questKills = 0
      this.updateQuestHUD()
      const nq = this.questDefs[next]
      if (nq.type === 'travel') {
        this.showQuestObjectiveMarker(nq.markerX!, nq.markerY!, nq.markerLabel!)
        this.time.delayedCall(1800, () =>
          this.hud.showQuestUpdate(`New quest!\n${nq.title}\n${nq.desc}`, '#aadd44'))
      } else {
        this.time.delayedCall(1200, () =>
          this.hud.showQuestUpdate(`New quest!\n${nq.title}`, '#aadd44'))
      }
    } else {
      this.activeQuestIdx = -2
      this.hud.setQuestText('All zones cleared!\nYou are the Archmage.')
    }
  }

  // ── Zone gating ───────────────────────────────────────────────────────────

  /** Minimum quest index needed to enter each zone. */
  private readonly ZONE_UNLOCK: Record<string, number> = {
    'Frozen Ruins':     3,   // unlocked when "A Frozen Lead" travel quest is active
    'Corrupted Fields': 6,   // unlocked when "The Tainted West" travel quest is active
    'Arcane Caves':     9,   // unlocked when "Into the Depths" travel quest is active
    'Volcanic Wastes':  12,  // unlocked when "Into the Wastes" travel quest is active
  }

  private isZoneLocked(zoneName: string): boolean {
    const required = this.ZONE_UNLOCK[zoneName]
    return required !== undefined && this.activeQuestIdx < required
  }

  private pushOutOfZone(zone: ZoneDef) {
    const body = this.player.body as Phaser.Physics.Arcade.Body
    // Push back to just outside the zone boundary
    switch (zone.name) {
      case 'Frozen Ruins':
        body.reset(this.player.x, zone.y + zone.h + 12)
        break
      case 'Corrupted Fields':
        body.reset(zone.x + zone.w + 12, this.player.y)
        break
      case 'Arcane Caves':
        body.reset(zone.x - 12, this.player.y)
        break
      case 'Volcanic Wastes':
        body.reset(zone.x - 12, this.player.y)
        break
    }
    // Throttle warning message to once every 3 seconds
    if (this.time.now - this.lastGateWarnAt < 3000) return
    this.lastGateWarnAt = this.time.now
    const hint = this.getZoneGateHint(zone.name)
    this.hud.showQuestUpdate(hint, '#ff8844')
  }

  private getZoneGateHint(zoneName: string): string {
    switch (zoneName) {
      case 'Frozen Ruins':
        return '🔒 Frozen Ruins\nComplete Elder Mirwen\'s quests first.'
      case 'Corrupted Fields':
        return '🔒 Corrupted Fields\nClear the Frozen Ruins first.'
      case 'Arcane Caves':
        return '🔒 Arcane Caves\nClear the Corrupted Fields first.'
      case 'Volcanic Wastes':
        return '🔒 Volcanic Wastes\nClear the Arcane Caves first.'
      default:
        return '🔒 Zone locked.'
    }
  }

  private completeTravelQuest() {
    const q = this.questDefs[this.activeQuestIdx]
    if (!q || q.type !== 'travel') return
    this.player.gainXP(q.xp)
    this.player.inventory.gold += q.gold
    this.player.inventory.notifyChange()
    this.hideQuestObjectiveMarker()
    const next = this.activeQuestIdx + 1
    if (next < this.questDefs.length) {
      this.activeQuestIdx = next
      this.questKills = 0
      this.updateQuestHUD()
      const nq = this.questDefs[next]
      this.hud.showQuestUpdate(`Quest accepted!\n${nq.title}`, '#aadd44')
    }
  }

  private updateQuestHUD() {
    if (this.activeQuestIdx < 0) {
      this.hud.setQuestText('Talk to Elder Mirwen\nfor your first quest.')
      return
    }
    const q = this.questDefs[this.activeQuestIdx]
    if (!q) { this.hud.setQuestText(''); return }
    if (q.type === 'travel') {
      this.hud.setQuestText(`${q.title}\n→ ${q.travelZone}`)
      return
    }
    const prefix = this.questKills >= q.target ? '★ ' : ''
    const zone   = q.zone ? `\n[${q.zone}]` : ''
    this.hud.setQuestText(`${prefix}${q.title}\n${this.questKills}/${q.target}${zone}`)
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

  // ── Level 10 milestone modal ──────────────────────────────────────────────

  private showLevel10Milestone() {
    this.premiumGateShown = true
    this.screenFlash(0x4466aa, 0.22, 1200)
    const frostModal = (window as any).__frostModal
    if (!frostModal) return
    frostModal.show({
      title: '⚡  Level 10 — Veteran Mage  ⚡',
      titleClass: 'premium',
      lines: [
        '"You have grown stronger than most dare to imagine."',
        '',
        'Milestones reached:',
        '◆ Talent trees are now fully open — spend wisely',
        '◆ Blizzard unlocks at level 14 (R)',
        '◆ Arcane tree unlocks at level 9 — power awaits',
        '',
        'Press T to open your Talent Trees.',
      ],
      buttons: [
        { label: 'Keep going', primary: true, onClick: () => {} },
      ],
      onClose: () => {},
    })
  }
}
