import { STARTER_X, STARTER_Y } from '../sim'

/**
 * Summoner's-Rift-style lanes (matching the reference screenshot): wide, warm
 * tan dirt lanes with clean edges and a slightly lighter trodden centre, sitting
 * on the darker grass. Layout: a north trunk out of town up to the Frozen Ruins,
 * which forks left (toward the Corrupted Fields) and right (toward the Arcane
 * Caves / mines) just before that zone band. Straight, deliberate segments —
 * not a wandering trail. Drawn under entities; culled when off-screen.
 */
const SPLIT_Y = 4650   // 90° junction — forks earlier on the way north

const LANES: { x: number; y: number }[][] = [
  // North trunk — starts past the spawn plaza so it doesn't collide with town.
  [{ x: STARTER_X, y: STARTER_Y - 520 }, { x: STARTER_X, y: 2650 }],  // town → north → frost land
  // Left fork: out → down a bit → continue left (toward Corrupted Fields).
  [{ x: STARTER_X, y: SPLIT_Y }, { x: 2780, y: SPLIT_Y }, { x: 2780, y: SPLIT_Y + 260 }, { x: 2150, y: SPLIT_Y + 260 }],
  // Right fork: out → down a bit → continue right (toward Arcane Caves / mines).
  [{ x: STARTER_X, y: SPLIT_Y }, { x: 3820, y: SPLIT_Y }, { x: 3820, y: SPLIT_Y + 260 }, { x: 4900, y: SPLIT_Y + 260 }],
]
const LANE_W = 70

function trace(ctx: CanvasRenderingContext2D, ln: { x: number; y: number }[]) {
  ctx.beginPath()
  ctx.moveTo(ln[0].x, ln[0].y)
  for (let i = 1; i < ln.length; i++) ctx.lineTo(ln[i].x, ln[i].y)
}

export function drawRoads(ctx: CanvasRenderingContext2D, _inView: (x: number, y: number) => boolean) {
  // Always draw — the strokes are cheap and the canvas clips off-screen parts.
  // (Endpoint-only culling made long lanes vanish when both ends were off-screen.)
  ctx.save()
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  // soft dark edge bleeding into the grass
  for (const ln of LANES) { trace(ctx, ln); ctx.strokeStyle = 'rgba(46,34,18,0.38)'; ctx.lineWidth = LANE_W + 12; ctx.stroke() }
  // packed tan lane body
  for (const ln of LANES) { trace(ctx, ln); ctx.strokeStyle = '#ab8a58'; ctx.lineWidth = LANE_W; ctx.stroke() }
  // faint lighter rim just inside the edge
  for (const ln of LANES) { trace(ctx, ln); ctx.strokeStyle = 'rgba(206,178,120,0.5)'; ctx.lineWidth = LANE_W - 4; ctx.stroke() }
  // lighter worn centre
  for (const ln of LANES) { trace(ctx, ln); ctx.strokeStyle = '#bd9c68'; ctx.lineWidth = LANE_W * 0.5; ctx.stroke() }
  ctx.restore()
}
