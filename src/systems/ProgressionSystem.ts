const SAVE_KEY = 'frost_v1'

// ── Cosmetics ──────────────────────────────────────────────────────────────────

export type CosmeticId = 'default' | 'crimson' | 'void' | 'golden' | 'frost' | 'shadow'

export interface CosmeticDef {
  id:   CosmeticId
  name: string
  tint: number
  desc: string  // shown as unlock hint
}

export const COSMETICS: Record<CosmeticId, CosmeticDef> = {
  default: { id: 'default', name: 'Azure',   tint: 0xffffff, desc: 'Default' },
  crimson: { id: 'crimson', name: 'Crimson',  tint: 0xff5555, desc: 'Kill 100 enemies' },
  void:    { id: 'void',    name: 'Void',     tint: 0xaa55ff, desc: 'Hunt an elite mob' },
  golden:  { id: 'golden',  name: 'Golden',   tint: 0xffdd55, desc: 'Collect 1000 gold' },
  frost:   { id: 'frost',   name: 'Frost',    tint: 0x55ddff, desc: 'Reach level 10' },
  shadow:  { id: 'shadow',  name: 'Shadow',   tint: 0x7799bb, desc: 'Kill 500 enemies' },
}

export const COSMETIC_IDS = Object.keys(COSMETICS) as CosmeticId[]

// ── Achievements ───────────────────────────────────────────────────────────────

export interface AchievementDef {
  id:        string
  name:      string
  desc:      string
  goal:      number
  stat:      keyof AccountStats
  cosmetic?: CosmeticId
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_blood',   name: 'First Blood',   desc: 'Kill your first enemy',        goal: 1,    stat: 'totalKills' },
  { id: 'slayer_100',    name: 'Slayer',         desc: 'Kill 100 enemies',             goal: 100,  stat: 'totalKills',    cosmetic: 'crimson' },
  { id: 'slayer_500',    name: 'Mass Slaughter', desc: 'Kill 500 enemies',             goal: 500,  stat: 'totalKills',    cosmetic: 'shadow' },
  { id: 'elite_hunter',  name: 'Elite Hunter',   desc: 'Kill an elite mob',            goal: 1,    stat: 'eliteKills',    cosmetic: 'void' },
  { id: 'elite_slayer',  name: 'Elite Slayer',   desc: 'Kill 10 elites',              goal: 10,   stat: 'eliteKills' },
  { id: 'level_10',      name: 'Veteran Mage',   desc: 'Reach level 10',              goal: 10,   stat: 'highestLevel',  cosmetic: 'frost' },
  { id: 'level_20',      name: 'Archmage',        desc: 'Reach level 20',              goal: 20,   stat: 'highestLevel' },
  { id: 'gold_hoarder',  name: 'Gold Hoarder',   desc: 'Collect 1000 gold lifetime',  goal: 1000, stat: 'totalGold',     cosmetic: 'golden' },
  { id: 'streak_master', name: 'Streak Master',  desc: 'Hit a kill streak of 8',      goal: 8,    stat: 'highestStreak' },
  { id: 'veteran',       name: 'Veteran',         desc: 'Play 10 sessions',            goal: 10,   stat: 'sessionsPlayed' },
  { id: 'challenger',    name: 'Challenger',      desc: 'Complete 5 daily challenges', goal: 5,    stat: 'dailiesCompleted' },
]

// ── Daily challenges ───────────────────────────────────────────────────────────

export interface ChallengeDef {
  id:       string
  desc:     string
  goal:     number
  stat:     string   // key into daily progress object
  isMax:    boolean  // true = peak value (level, streak); false = cumulative (kills, gold)
  xpReward: number
}

const CHALLENGE_POOL: ChallengeDef[] = [
  { id: 'kill_20',  desc: 'Kill 20 enemies',      goal: 20,  stat: 'kills',      isMax: false, xpReward: 200 },
  { id: 'kill_50',  desc: 'Kill 50 enemies',      goal: 50,  stat: 'kills',      isMax: false, xpReward: 400 },
  { id: 'kill_100', desc: 'Kill 100 enemies',     goal: 100, stat: 'kills',      isMax: false, xpReward: 800 },
  { id: 'elite_1',  desc: 'Hunt an elite mob',    goal: 1,   stat: 'eliteKills', isMax: false, xpReward: 350 },
  { id: 'elite_3',  desc: 'Hunt 3 elite mobs',    goal: 3,   stat: 'eliteKills', isMax: false, xpReward: 700 },
  { id: 'level_5',  desc: 'Reach level 5',        goal: 5,   stat: 'level',      isMax: true,  xpReward: 250 },
  { id: 'level_8',  desc: 'Reach level 8',        goal: 8,   stat: 'level',      isMax: true,  xpReward: 500 },
  { id: 'gold_300', desc: 'Collect 300 gold',     goal: 300, stat: 'gold',       isMax: false, xpReward: 300 },
  { id: 'gold_800', desc: 'Collect 800 gold',     goal: 800, stat: 'gold',       isMax: false, xpReward: 600 },
  { id: 'streak_5', desc: 'Get a kill streak of 5', goal: 5, stat: 'streak',     isMax: true,  xpReward: 300 },
  { id: 'streak_8', desc: 'Get a kill streak of 8', goal: 8, stat: 'streak',     isMax: true,  xpReward: 500 },
]

// ── Persistent save ────────────────────────────────────────────────────────────

export interface AccountStats {
  totalKills:       number
  eliteKills:       number
  totalGold:        number
  highestLevel:     number
  highestStreak:    number
  sessionsPlayed:   number
  dailiesCompleted: number
}

interface DailyState {
  date:         string         // YYYY-MM-DD
  challengeIds: string[]
  progress:     Record<string, number>
  completed:    string[]
}

interface SaveData {
  accountStats:         AccountStats
  achievementProgress:  Record<string, number>
  unlockedAchievements: string[]
  unlockedCosmetics:    CosmeticId[]
  equippedCosmetic:     CosmeticId
  daily:                DailyState
}

// ── ProgressionSystem ──────────────────────────────────────────────────────────

export class ProgressionSystem {
  private save: SaveData

  onAchievementUnlocked?: (def: AchievementDef) => void
  onChallengeCompleted?:  (def: ChallengeDef, xpReward: number) => void
  onChange?:              () => void

  constructor() {
    this.save = this.load()
    this.rotateDailyIfNeeded()
  }

  startSession() {
    this.save.accountStats.sessionsPlayed++
    this.persist()
    this.checkAchievements()
    this.onChange?.()
  }

  // ── Event hooks (called from GameScene) ──────────────────────────────────

  onKill(isElite: boolean) {
    this.save.accountStats.totalKills++
    if (isElite) this.save.accountStats.eliteKills++
    this.trackDaily('kills', 1, false)
    if (isElite) this.trackDaily('eliteKills', 1, false)
    this.checkAchievements()
    this.persist()
  }

  onLevelReached(level: number) {
    if (level > this.save.accountStats.highestLevel) {
      this.save.accountStats.highestLevel = level
      this.checkAchievements()
      this.persist()
    }
    this.trackDaily('level', level, true)
  }

  onGoldCollected(amount: number) {
    this.save.accountStats.totalGold += amount
    this.trackDaily('gold', amount, false)
    this.checkAchievements()
    this.persist()
  }

  onStreakReached(streak: number) {
    if (streak > this.save.accountStats.highestStreak) {
      this.save.accountStats.highestStreak = streak
      this.checkAchievements()
      this.persist()
    }
    this.trackDaily('streak', streak, true)
  }

  // ── Daily challenges ──────────────────────────────────────────────────────

  get todayChallenges(): ChallengeDef[] {
    return this.save.daily.challengeIds
      .map(id => CHALLENGE_POOL.find(c => c.id === id))
      .filter(Boolean) as ChallengeDef[]
  }

  getChallengeProgress(id: string): number { return this.save.daily.progress[id] ?? 0 }
  isChallengeComplete(id: string): boolean  { return this.save.daily.completed.includes(id) }

  // ── Achievements ──────────────────────────────────────────────────────────

  getAchievementProgress(id: string): number {
    const def = ACHIEVEMENTS.find(a => a.id === id)
    if (!def) return 0
    return Math.min(def.goal, this.save.accountStats[def.stat] ?? 0)
  }

  isAchievementUnlocked(id: string): boolean { return this.save.unlockedAchievements.includes(id) }

  // ── Cosmetics ─────────────────────────────────────────────────────────────

  get equippedCosmetic(): CosmeticId  { return this.save.equippedCosmetic }
  get unlockedCosmetics(): CosmeticId[] { return [...this.save.unlockedCosmetics] }

  equipCosmetic(id: CosmeticId) {
    if (!this.save.unlockedCosmetics.includes(id)) return
    this.save.equippedCosmetic = id
    this.persist()
    this.onChange?.()
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  get stats(): AccountStats { return { ...this.save.accountStats } }

  // ── Internals ─────────────────────────────────────────────────────────────

  private trackDaily(stat: string, value: number, isMax: boolean) {
    const d = this.save.daily
    if (isMax) {
      d.progress[stat] = Math.max(d.progress[stat] ?? 0, value)
    } else {
      d.progress[stat] = (d.progress[stat] ?? 0) + value
    }

    for (const ch of this.todayChallenges) {
      if (d.completed.includes(ch.id)) continue
      if (ch.stat !== stat) continue
      if ((d.progress[stat] ?? 0) >= ch.goal) {
        d.completed.push(ch.id)
        this.save.accountStats.dailiesCompleted++
        this.onChallengeCompleted?.(ch, ch.xpReward)
        this.checkAchievements()
      }
    }

    this.persist()
    this.onChange?.()
  }

  private checkAchievements() {
    const s = this.save.accountStats
    for (const def of ACHIEVEMENTS) {
      if (this.save.unlockedAchievements.includes(def.id)) continue
      const current = (s[def.stat] ?? 0) as number
      if (current >= def.goal) {
        this.save.unlockedAchievements.push(def.id)
        if (def.cosmetic && !this.save.unlockedCosmetics.includes(def.cosmetic)) {
          this.save.unlockedCosmetics.push(def.cosmetic)
        }
        this.onAchievementUnlocked?.(def)
        this.onChange?.()
      }
    }
  }

  private rotateDailyIfNeeded() {
    const today = todayStr()
    if (this.save.daily.date === today) return
    const seed     = parseInt(today.replace(/-/g, ''), 10)
    const shuffled = seededShuffle(CHALLENGE_POOL.map(c => c.id), seed)
    this.save.daily = { date: today, challengeIds: shuffled.slice(0, 3), progress: {}, completed: [] }
    this.persist()
  }

  private load(): SaveData {
    try {
      const raw = localStorage.getItem(SAVE_KEY)
      if (raw) return JSON.parse(raw) as SaveData
    } catch { /* ignore parse/access errors */ }
    return this.defaultSave()
  }

  private persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)) } catch { /* ignore */ }
  }

  private defaultSave(): SaveData {
    return {
      accountStats: {
        totalKills: 0, eliteKills: 0, totalGold: 0,
        highestLevel: 0, highestStreak: 0, sessionsPlayed: 0, dailiesCompleted: 0,
      },
      achievementProgress:  {},
      unlockedAchievements: [],
      unlockedCosmetics:    ['default'],
      equippedCosmetic:     'default',
      daily: { date: '', challengeIds: [], progress: {}, completed: [] },
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr]
  let s = seed
  for (let i = out.length - 1; i > 0; i--) {
    s = ((s * 1664525 + 1013904223) | 0) >>> 0
    const j = s % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
