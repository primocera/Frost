import {
  EQUIP_SLOTS, EquipSlot, SLOT_LABEL, RARITY_COLOR, ItemStats, Item,
  TALENT_DEFS, talentsForTree, TREE_LABEL, TREE_COLOR, TREE_UNLOCK_LEVEL,
  TALENT_TREES, TreeId, canBuyTalent, SHOP_SPELLS,
} from '../sim'
import { useGameStore } from './store'

const fmtCopper = (n: number) => {
  const g = Math.floor(n / 10000), s = Math.floor((n % 10000) / 100), c = n % 100
  return [g && `${g}g`, s && `${s}s`, (c || (!g && !s)) && `${c}c`].filter(Boolean).join(' ')
}

const STAT_FMT: Record<keyof ItemStats, (v: number) => string> = {
  spellPower: (v) => `+${v} Spell Power`,
  mana: (v) => `+${v} Max Mana`,
  manaRegen: (v) => `+${v} Mana/sec`,
  critChance: (v) => `+${(v * 100).toFixed(1)}% Crit`,
  speed: (v) => `+${v} Speed`,
  cooldownReduction: (v) => `+${(v * 100).toFixed(1)}% CDR`,
}

function statLines(stats: ItemStats): string[] {
  return (Object.entries(stats) as [keyof ItemStats, number][])
    .filter(([, v]) => v)
    .map(([k, v]) => STAT_FMT[k](v))
}

export function Panels() {
  const panel = useGameStore((s) => s.panel)
  if (panel === 'none') return null
  return (
    <div style={styles.backdrop} onClick={() => useGameStore.getState().setPanel('none')}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        {panel === 'inventory' ? <Inventory /> : panel === 'talents' ? <Talents /> : <Shop />}
      </div>
    </div>
  )
}

function Inventory() {
  const self = useGameStore((s) => s.self)
  const gold = useGameStore((s) => s.hud.gold)
  const actions = useGameStore((s) => s.actions)
  if (!self) return <Empty title="Inventory" />

  return (
    <>
      <Header title="Inventory" />
      <div style={{ display: 'flex', minHeight: 0, flex: 1 }}>
        {/* Equipped */}
        <div style={styles.equipCol}>
          {EQUIP_SLOTS.map((slot) => {
            const it = self.eq[slot]
            return (
              <div key={slot} style={styles.equipSlot} onClick={() => it && actions?.unequip(slot)} title={it ? 'Click to unequip' : ''}>
                <div style={styles.slotLabel}>{SLOT_LABEL[slot]}</div>
                {it
                  ? <div style={{ color: RARITY_COLOR[it.rarity], fontSize: 12 }}>{it.name}</div>
                  : <div style={{ color: '#445', fontSize: 12 }}>— empty —</div>}
                {it && <div style={styles.statMini}>{statLines(it.stats).join(' · ')}</div>}
              </div>
            )
          })}
        </div>
        {/* Bag */}
        <div style={styles.bagCol}>
          <div style={styles.goldRow}>⛁ {gold} gold · {self.inv.length} items</div>
          <div style={styles.bagGrid}>
            {self.inv.map((it) => <ItemCard key={it.id} item={it} onClick={() => actions?.equip(it.id)} />)}
            {self.inv.length === 0 && <div style={{ color: '#556', fontSize: 13, padding: 8 }}>Empty — kill monsters to find loot.</div>}
          </div>
        </div>
      </div>
    </>
  )
}

function ItemCard({ item, onClick }: { item: Item; onClick: () => void }) {
  return (
    <div style={{ ...styles.itemCard, borderColor: RARITY_COLOR[item.rarity] }} onClick={onClick} title="Click to equip">
      <div style={{ color: RARITY_COLOR[item.rarity], fontWeight: 600 }}>{item.name}</div>
      <div style={styles.statMini}>{statLines(item.stats).join(' · ')}</div>
    </div>
  )
}

function Talents() {
  const self = useGameStore((s) => s.self)
  const level = useGameStore((s) => s.hud.level)
  const actions = useGameStore((s) => s.actions)
  if (!self) return <Empty title="Talents" />
  const ranks = self.ranks

  return (
    <>
      <Header title={`Talents — ${self.pts} point${self.pts === 1 ? '' : 's'} available`} />
      <div style={{ display: 'flex', gap: 10, padding: 12, minHeight: 0, flex: 1, overflow: 'auto' }}>
        {TALENT_TREES.map((tree: TreeId) => {
          const unlocked = level >= TREE_UNLOCK_LEVEL[tree]
          return (
            <div key={tree} style={{ flex: 1, minWidth: 200 }}>
              <div style={{ ...styles.treeHead, color: TREE_COLOR[tree] }}>
                {TREE_LABEL[tree]} {!unlocked && <span style={{ fontSize: 10, color: '#667' }}>(Lv {TREE_UNLOCK_LEVEL[tree]})</span>}
              </div>
              {talentsForTree(tree).map((def) => {
                const r = ranks[def.id] ?? 0
                const can = canBuyTalent(ranks, self.pts, level, def.id)
                return (
                  <div key={def.id} style={{ ...styles.talentRow, opacity: unlocked ? 1 : 0.4 }}>
                    <div style={{ color: TREE_COLOR[tree], fontWeight: 600, fontSize: 12 }}>
                      {def.name} <span style={{ color: '#889' }}>{r}/{def.maxRank}</span>
                    </div>
                    <div style={styles.talentDesc}>{def.desc}</div>
                    <div style={styles.talentDesc}>{def.rankDesc[Math.min(r, def.maxRank - 1)]}</div>
                    <button
                      style={{ ...styles.buyBtn, borderColor: TREE_COLOR[tree], color: can ? TREE_COLOR[tree] : '#445', cursor: can ? 'pointer' : 'default' }}
                      disabled={!can}
                      onClick={() => actions?.buyTalent(def.id)}
                    >{r >= def.maxRank ? 'Maxed' : 'Learn'}</button>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </>
  )
}

function Shop() {
  const hud = useGameStore((s) => s.hud)
  const actions = useGameStore((s) => s.actions)
  return (
    <>
      <Header title="Spell Trainer" />
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto' }}>
        <div style={{ color: '#ffdd00', fontSize: 13 }}>Your gold: {fmtCopper(hud.gold)}</div>
        {SHOP_SPELLS.map((sp) => {
          const owned = hud.learnedSpells.includes(sp.spell)
          const levelOk = hud.level >= sp.level
          const goldOk = hud.gold >= sp.cost
          const canBuy = !owned && levelOk && goldOk
          return (
            <div key={sp.spell} style={styles.shopRow}>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#c0aaff', fontWeight: 600, fontSize: 13 }}>{sp.label}</div>
                <div style={{ color: '#889', fontSize: 11 }}>{sp.desc}</div>
                <div style={{ color: '#778', fontSize: 11 }}>Requires level {sp.level} · {fmtCopper(sp.cost)}</div>
              </div>
              {owned
                ? <span style={{ color: '#5d8', fontSize: 12, fontWeight: 600 }}>✓ Trained</span>
                : <button
                    style={{ ...styles.shopBuy, opacity: canBuy ? 1 : 0.4, cursor: canBuy ? 'pointer' : 'default' }}
                    disabled={!canBuy}
                    onClick={() => actions?.train(sp.spell)}
                  >{!levelOk ? `Lv ${sp.level}` : !goldOk ? 'Need gold' : 'Train'}</button>}
            </div>
          )
        })}
        <div style={{ color: '#556', fontSize: 11, marginTop: 6 }}>
          Earn gold by slaying monsters, then train your AoE spells here. Press B to close.
        </div>
      </div>
    </>
  )
}

function Header({ title }: { title: string }) {
  return (
    <div style={styles.header}>
      <span style={{ fontWeight: 700, color: '#c0aaff' }}>{title}</span>
      <button style={styles.close} onClick={() => useGameStore.getState().setPanel('none')}>✕</button>
    </div>
  )
}
function Empty({ title }: { title: string }) {
  return <><Header title={title} /><div style={{ padding: 20, color: '#667' }}>Loading…</div></>
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(2,5,15,0.6)', backdropFilter: 'blur(4px)',
    fontFamily: '-apple-system, "Segoe UI", sans-serif',
  },
  panel: {
    width: 720, maxWidth: 'calc(100vw - 24px)', height: 520, maxHeight: 'calc(100vh - 24px)',
    display: 'flex', flexDirection: 'column', background: 'linear-gradient(155deg,#0a1330,#050a18)',
    border: '1px solid rgba(60,100,190,0.5)', borderRadius: 14, overflow: 'hidden',
    boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px',
    background: 'rgba(12,25,55,0.7)', borderBottom: '1px solid rgba(45,80,150,0.35)', flexShrink: 0,
  },
  close: { background: 'none', border: 'none', color: '#88a', fontSize: 16, cursor: 'pointer' },
  equipCol: { width: 240, padding: 10, borderRight: '1px solid rgba(51,68,85,0.4)', display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto', flexShrink: 0 },
  equipSlot: { background: 'rgba(15,15,28,0.8)', border: '1px solid rgba(40,50,80,0.7)', borderRadius: 6, padding: '6px 10px', cursor: 'pointer' },
  slotLabel: { fontSize: 10, color: '#4a7', textTransform: 'uppercase', letterSpacing: 0.5 },
  statMini: { fontSize: 10, color: '#8aa', marginTop: 2, lineHeight: 1.4 },
  bagCol: { flex: 1, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 },
  goldRow: { fontSize: 12, color: '#fd0' },
  bagGrid: { display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto', minHeight: 0 },
  itemCard: { background: 'rgba(12,18,30,0.9)', border: '1px solid', borderRadius: 6, padding: '7px 10px', cursor: 'pointer', fontSize: 12 },
  treeHead: { textAlign: 'center', fontWeight: 700, fontSize: 13, padding: '6px 0', borderBottom: '1px solid rgba(51,68,85,0.4)', marginBottom: 6 },
  talentRow: { borderBottom: '1px solid rgba(25,30,45,0.9)', padding: '6px 4px' },
  talentDesc: { fontSize: 10, color: '#778', margin: '2px 0' },
  buyBtn: { marginTop: 3, fontSize: 11, padding: '2px 10px', borderRadius: 4, background: 'rgba(10,20,40,0.9)', border: '1px solid', fontFamily: 'inherit' },
  shopRow: { display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(12,18,30,0.9)', border: '1px solid rgba(45,70,110,0.4)', borderRadius: 8, padding: '10px 12px' },
  shopBuy: { fontSize: 12, padding: '6px 14px', borderRadius: 6, background: 'linear-gradient(135deg,rgba(20,80,160,0.8),rgba(10,50,100,0.8))', border: '1px solid rgba(60,120,220,0.45)', color: '#88bbff', fontFamily: 'inherit' },
}
