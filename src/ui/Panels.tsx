import { useState } from 'react'
import {
  EQUIP_SLOTS, EquipSlot, SLOT_LABEL, RARITY_COLOR, ItemStats, Item,
  TALENT_DEFS, talentsForTree, TREE_LABEL, TREE_COLOR, TREE_UNLOCK_LEVEL,
  TALENT_TREES, TreeId, canBuyTalent, SHOP_SPELLS, sellPrice,
} from '../sim'
import { useGameStore } from './store'

const TYPE_ICON: Record<string, string> = { staff: '🪄', robe: '🧥', ring: '💍', amulet: '📿' }

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
  const isTrade = panel === 'trade'   // don't let a stray backdrop click drop a live trade
  return (
    <div style={styles.backdrop} onClick={() => { if (!isTrade) useGameStore.getState().setPanel('none') }}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        {panel === 'inventory' ? <Inventory />
          : panel === 'talents' ? <Talents />
          : panel === 'shop' ? <Shop />
          : panel === 'merchant' ? <Merchant />
          : panel === 'stash' ? <Stash />
          : panel === 'trade' ? <Trade />
          : panel === 'farm' ? <Farm />
          : <QuestBoard />}
      </div>
    </div>
  )
}

function Trade() {
  const self = useGameStore((s) => s.self)
  const actions = useGameStore((s) => s.actions)
  const gold = useGameStore((s) => s.hud.gold)
  const t = self?.trade ?? null

  if (!t) return <Empty title="Trade" />

  // Pending request — accept / decline / waiting.
  if (t.stage === 'pending') {
    return (
      <>
        <TradeHeader withName={t.withName} />
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
          {t.incoming ? (
            <>
              <div style={{ color: '#cdd8ee', fontSize: 15, textAlign: 'center' }}>
                <b style={{ color: '#ffd23a' }}>{t.withName}</b> wants to trade with you.
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button style={styles.questBtn} onClick={() => actions?.tradeAccept()}>Accept</button>
                <button style={styles.tradeCancelBtn} onClick={() => actions?.tradeDecline()}>Decline</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ color: '#9ab', fontSize: 14 }}>Waiting for <b style={{ color: '#ffd23a' }}>{t.withName}</b> to accept…</div>
              <button style={styles.tradeCancelBtn} onClick={() => actions?.tradeCancel()}>Cancel</button>
            </>
          )}
        </div>
      </>
    )
  }

  // Active trade — edit your offer, watch theirs, confirm.
  const offeredIds = t.yourItems.map((it) => it.id)
  const available = (self?.inv ?? []).filter((it) => !offeredIds.includes(it.id))
  const setOffer = (ids: number[], g: number) => actions?.tradeOffer(ids, g)

  return (
    <>
      <TradeHeader withName={t.withName} />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Your side */}
        <div style={styles.tradeHalf}>
          <div style={{ ...styles.tradeSideLabel, color: '#7fd' }}>
            YOUR OFFER {t.yourConfirm && <span style={{ color: '#5d8' }}>✓ locked</span>}
          </div>
          <div style={styles.tradeOfferBox}>
            {t.yourItems.map((it) => (
              <ItemCard key={it.id} item={it} onClick={() => setOffer(offeredIds.filter((x) => x !== it.id), t.yourGold)} />
            ))}
            {t.yourItems.length === 0 && <div style={styles.tradeHint}>Add items from your bag below ↓</div>}
          </div>
          <GoldField value={t.yourGold} max={gold} onChange={(g) => setOffer(offeredIds, g)} />
          <div style={{ ...styles.tradeSideLabel, fontSize: 9 }}>YOUR BAG — click to add</div>
          <div style={styles.tradeBagBox}>
            {available.map((it) => (
              <ItemCard key={it.id} item={it} onClick={() => setOffer([...offeredIds, it.id], t.yourGold)} />
            ))}
            {available.length === 0 && <div style={styles.tradeHint}>No items to offer.</div>}
          </div>
        </div>
        {/* Their side */}
        <div style={{ ...styles.tradeHalf, borderLeft: '1px solid rgba(51,68,85,0.4)' }}>
          <div style={{ ...styles.tradeSideLabel, color: '#fb7' }}>
            {t.withName.toUpperCase()}'S OFFER {t.theirConfirm && <span style={{ color: '#5d8' }}>✓ locked</span>}
          </div>
          <div style={{ ...styles.tradeOfferBox, flex: 1 }}>
            {t.theirItems.map((it) => <ItemCard key={it.id} item={it} onClick={() => {}} />)}
            {t.theirItems.length === 0 && <div style={styles.tradeHint}>Nothing yet.</div>}
          </div>
          <div style={{ color: '#ffdd00', fontSize: 13, padding: '6px 2px' }}>⛁ {fmtCopper(t.theirGold)}</div>
        </div>
      </div>
      <div style={styles.tradeFooter}>
        <button style={styles.tradeCancelBtn} onClick={() => actions?.tradeCancel()}>Cancel</button>
        <button
          style={{ ...styles.tradeConfirmBtn, opacity: t.yourConfirm ? 0.55 : 1 }}
          onClick={() => actions?.tradeConfirm()}
        >
          {t.yourConfirm ? 'Confirmed ✓' : 'Confirm Trade'}
        </button>
      </div>
    </>
  )
}

function GoldField({ value, max, onChange }: { value: number; max: number; onChange: (g: number) => void }) {
  const [focused, setFocused] = useState(false)
  const [text, setText] = useState('')
  // While not editing, mirror the authoritative offer; while editing, keep typing.
  const shown = focused ? text : (value ? String(value) : '')
  return (
    <div style={styles.goldField}>
      <span style={{ color: '#ffdd00', fontSize: 13 }}>⛁</span>
      <input
        type="number" min={0} max={max} value={shown}
        onFocus={() => { setFocused(true); setText(value ? String(value) : '') }}
        onBlur={() => setFocused(false)}
        onChange={(e) => { setText(e.target.value); onChange(Math.max(0, Math.min(max, Math.floor(Number(e.target.value) || 0)))) }}
        style={styles.goldInput}
        placeholder="0"
      />
      <span style={{ color: '#778', fontSize: 11 }}>/ {fmtCopper(max)}</span>
    </div>
  )
}

function TradeHeader({ withName }: { withName: string }) {
  return (
    <div style={styles.header}>
      <span style={{ fontWeight: 700, color: '#7fd' }}>🤝 Trading with {withName}</span>
      <button style={styles.close} onClick={() => useGameStore.getState().actions?.tradeCancel()}>✕</button>
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
            {self.inv.map((it) => <ItemCard key={it.id} item={it} onClick={() => actions?.equip(it.id)} onDrop={() => actions?.drop(it.id)} />)}
            {self.inv.length === 0 && <div style={{ color: '#556', fontSize: 13, padding: 8 }}>Empty — kill monsters to find loot.</div>}
          </div>
          <div style={{ fontSize: 10, color: '#566' }}>Click to equip · ✕ to drop</div>
        </div>
      </div>
    </>
  )
}

function ItemCard({ item, onClick, onDrop }: { item: Item; onClick: () => void; onDrop?: () => void }) {
  return (
    <div style={{ ...styles.itemCard, borderColor: RARITY_COLOR[item.rarity], position: 'relative' }} onClick={onClick}>
      <div style={{ color: RARITY_COLOR[item.rarity], fontWeight: 600, paddingRight: onDrop ? 16 : 0 }}>
        <span style={{ marginRight: 5 }}>{TYPE_ICON[item.type] ?? '◆'}</span>{item.name}
      </div>
      <div style={styles.statMini}>{statLines(item.stats).join(' · ')}</div>
      {onDrop && (
        <button style={styles.dropBtn} title="Drop item" onClick={(e) => { e.stopPropagation(); onDrop() }}>✕</button>
      )}
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

function Merchant() {
  const self = useGameStore((s) => s.self)
  const gold = useGameStore((s) => s.hud.gold)
  const actions = useGameStore((s) => s.actions)
  if (!self) return <Empty title="Merchant" />
  return (
    <>
      <Header title={`Merchant Brom — ${fmtCopper(gold)}`} />
      {(self.shop ?? []).length === 0 && (
        <div style={{ padding: 16, color: '#889', fontSize: 13 }}>The merchant's stall is being restocked… (if this persists, the server needs a redeploy).</div>
      )}
      <div style={{ padding: 12, overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 8 }}>
        {(self.shop ?? []).map((s, i) => {
          const can = !s.sold && gold >= s.price
          return (
            <div key={i} style={{ ...styles.shopCard, borderColor: RARITY_COLOR[s.item.rarity], opacity: s.sold ? 0.4 : 1 }}>
              <div style={{ color: RARITY_COLOR[s.item.rarity], fontWeight: 600, fontSize: 12 }}>{s.item.name}</div>
              <div style={styles.statMini}>{statLines(s.item.stats).join(' · ')}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <span style={{ color: '#ffdd00', fontSize: 12 }}>{fmtCopper(s.price)}</span>
                <button style={{ ...styles.shopBuy, opacity: can ? 1 : 0.4, cursor: can ? 'pointer' : 'default' }}
                  disabled={!can} onClick={() => actions?.buy(i)}>{s.sold ? 'Sold' : 'Buy'}</button>
              </div>
            </div>
          )
        })}
      </div>
      {(self.inv ?? []).length > 0 && (
        <div style={{ borderTop: '1px solid rgba(51,68,85,0.4)', padding: '8px 12px', maxHeight: 160, overflow: 'auto' }}>
          <div style={{ fontSize: 11, color: '#9ab', marginBottom: 6 }}>Sell your loot:</div>
          {(self.inv ?? []).map((it) => (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 0', fontSize: 12 }}>
              <span style={{ color: RARITY_COLOR[it.rarity] }}>{TYPE_ICON[it.type]} {it.name}</span>
              <button style={styles.shopBuy} onClick={() => actions?.sell(it.id)}>Sell {fmtCopper(sellPrice(it))}</button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function QuestBoard() {
  const self = useGameStore((s) => s.self)
  const actions = useGameStore((s) => s.actions)
  if (!self) return <Empty title="Bounty Board" />
  const q = self.quest
  return (
    <>
      <Header title="Bounty Board" />
      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!q && (
          <>
            <div style={{ color: '#cdd8ee', fontSize: 14 }}>Slay <b>15 monsters</b> for a gold bounty (scales with your level).</div>
            <button style={styles.questBtn} onClick={() => actions?.acceptQuest()}>Accept Bounty</button>
          </>
        )}
        {q && !q.done && (
          <>
            <div style={{ color: '#cdd8ee', fontSize: 14 }}>Bounty: slay monsters — <b>{q.kills}/{q.target}</b></div>
            <div style={{ height: 8, background: 'rgba(51,68,85,0.5)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${(q.kills / q.target) * 100}%`, height: '100%', background: '#3366cc' }} />
            </div>
            <div style={{ color: '#778', fontSize: 12 }}>Reward: {fmtCopper(q.reward)}</div>
          </>
        )}
        {q && q.done && (
          <>
            <div style={{ color: '#5d8', fontSize: 14 }}>Bounty complete! Claim your reward.</div>
            <button style={styles.questBtn} onClick={() => actions?.claimQuest()}>Claim {fmtCopper(q.reward)}</button>
          </>
        )}
      </div>
    </>
  )
}

function Farm() {
  const self = useGameStore((s) => s.self)
  const actions = useGameStore((s) => s.actions)
  const close = () => useGameStore.getState().setPanel('none')
  const fq = self?.farmQuest ?? 0
  return (
    <>
      <Header title="Farmer Holt" />
      <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14, fontSize: 14, color: '#d8e0c8', lineHeight: 1.5 }}>
        {fq === 0 && (
          <>
            <p style={styles.holtSay}>"Ah — a wandering mage, heading into the wilds?"</p>
            <p style={styles.holtSay}>"Before you go — my old hen Bessie hasn't been fed today. She's just pecking around the yard."</p>
            <p style={styles.holtSay}>"Would you toss her some grain? Just walk up and press <b>E</b> near her."</p>
            <button style={styles.questBtn} onClick={() => { actions?.farmAccept() }}>Sure, I'll feed her</button>
          </>
        )}
        {fq === 1 && (
          <>
            <p style={styles.holtSay}>"Bessie's right there in the yard, pecking around!"</p>
            <p style={styles.holtSay}>"Walk up to her and press <b>E</b> to give her some grain."</p>
            <button style={{ ...styles.questBtn, background: 'rgba(40,60,30,0.8)' }} onClick={close}>Close</button>
          </>
        )}
        {fq === 2 && (
          <>
            <p style={styles.holtSay}>"She's full and happy — bless you, mage!"</p>
            <p style={styles.holtSay}>"Take this for your trouble. Safe travels out there."</p>
            <div style={{ color: '#aadd44', fontWeight: 600 }}>Reward: +60 XP · +5 silver</div>
            <button style={styles.questBtn} onClick={() => { actions?.farmClaim(); close() }}>Collect reward</button>
          </>
        )}
        {fq === 3 && (
          <>
            <p style={styles.holtSay}>"Thanks again for helping with Bessie. The farm's always open to you."</p>
            <button style={{ ...styles.questBtn, background: 'rgba(40,60,30,0.8)' }} onClick={close}>Farewell</button>
          </>
        )}
      </div>
    </>
  )
}

function Stash() {
  const self = useGameStore((s) => s.self)
  const actions = useGameStore((s) => s.actions)
  if (!self) return <Empty title="Stash" />
  return (
    <>
      <Header title="Stash" />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div style={styles.stashHalf}>
          <div style={{ ...styles.stashLabel, background: 'rgba(26,42,26,0.5)' }}>BAG ({(self.inv ?? []).length}) — click to deposit</div>
          <div style={styles.stashGrid}>
            {(self.inv ?? []).map((it) => <ItemCard key={it.id} item={it} onClick={() => actions?.stashDeposit(it.id)} />)}
          </div>
        </div>
        <div style={{ ...styles.stashHalf, borderLeft: '1px solid rgba(51,68,85,0.4)' }}>
          <div style={{ ...styles.stashLabel, background: 'rgba(26,26,42,0.5)' }}>STASH ({(self.stash ?? []).length}) — click to withdraw</div>
          <div style={styles.stashGrid}>
            {(self.stash ?? []).map((it) => <ItemCard key={it.id} item={it} onClick={() => actions?.stashWithdraw(it.id)} />)}
          </div>
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
  dropBtn: { position: 'absolute', top: 4, right: 4, width: 18, height: 18, lineHeight: '14px', textAlign: 'center', borderRadius: 4, border: 'none', background: 'rgba(120,30,30,0.6)', color: '#fff', fontSize: 11, cursor: 'pointer', padding: 0 },
  treeHead: { textAlign: 'center', fontWeight: 700, fontSize: 13, padding: '6px 0', borderBottom: '1px solid rgba(51,68,85,0.4)', marginBottom: 6 },
  talentRow: { borderBottom: '1px solid rgba(25,30,45,0.9)', padding: '6px 4px' },
  talentDesc: { fontSize: 10, color: '#778', margin: '2px 0' },
  buyBtn: { marginTop: 3, fontSize: 11, padding: '2px 10px', borderRadius: 4, background: 'rgba(10,20,40,0.9)', border: '1px solid', fontFamily: 'inherit' },
  shopRow: { display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(12,18,30,0.9)', border: '1px solid rgba(45,70,110,0.4)', borderRadius: 8, padding: '10px 12px' },
  shopBuy: { fontSize: 12, padding: '6px 14px', borderRadius: 6, background: 'linear-gradient(135deg,rgba(20,80,160,0.8),rgba(10,50,100,0.8))', border: '1px solid rgba(60,120,220,0.45)', color: '#88bbff', fontFamily: 'inherit' },
  shopCard: { background: 'rgba(12,18,30,0.9)', border: '1px solid', borderRadius: 8, padding: '9px 10px', display: 'flex', flexDirection: 'column', gap: 3 },
  stashHalf: { flex: 1, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 },
  stashLabel: { fontSize: 10, fontWeight: 700, textAlign: 'center', letterSpacing: 0.6, padding: '5px 8px', borderRadius: 4, color: '#9ab' },
  stashGrid: { display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto', minHeight: 0 },
  questBtn: { alignSelf: 'flex-start', fontSize: 14, padding: '10px 20px', borderRadius: 8, background: 'linear-gradient(135deg,#1460b0,#0a3a78)', border: 'none', color: '#fff', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  holtSay: { margin: 0, fontStyle: 'italic', color: '#cdd6bb' },
  tradeHalf: { flex: 1, padding: 10, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 },
  tradeSideLabel: { fontSize: 10, fontWeight: 700, letterSpacing: 0.6, padding: '2px 2px', display: 'flex', justifyContent: 'space-between' },
  tradeOfferBox: { minHeight: 96, maxHeight: 150, display: 'flex', flexDirection: 'column', gap: 5, overflow: 'auto', background: 'rgba(8,14,26,0.6)', border: '1px dashed rgba(60,90,140,0.4)', borderRadius: 6, padding: 6 },
  tradeBagBox: { flex: 1, display: 'flex', flexDirection: 'column', gap: 5, overflow: 'auto', minHeight: 40 },
  tradeHint: { color: '#556', fontSize: 11, padding: 6 },
  goldField: { display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' },
  goldInput: { width: 90, background: 'rgba(8,14,26,0.9)', border: '1px solid rgba(60,90,140,0.5)', borderRadius: 5, color: '#ffe9a8', fontSize: 12, padding: '4px 6px', fontFamily: 'inherit' },
  tradeFooter: { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 14px', borderTop: '1px solid rgba(51,68,85,0.4)', flexShrink: 0 },
  tradeCancelBtn: { fontSize: 13, padding: '9px 18px', borderRadius: 8, background: 'rgba(120,40,40,0.6)', border: '1px solid rgba(180,70,70,0.5)', color: '#ffbbbb', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  tradeConfirmBtn: { fontSize: 13, padding: '9px 22px', borderRadius: 8, background: 'linear-gradient(135deg,#1e9e5a,#0c6e3a)', border: '1px solid rgba(60,200,120,0.5)', color: '#eafff2', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
}
