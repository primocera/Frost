/**
 * Shared bridge between the React touch controls (DOM events) and the engine's
 * input loop. The MobileControls component writes here; Game.buildInput reads it.
 * Edge-triggered buttons (swap/spells) are consumed once per tick by the engine.
 */
export const touch = {
  active: false,           // mobile UI shown → engine should read this
  move: { x: 0, y: 0 },    // joystick vector, -1..1
  castBolt: false,         // hold-to-fire (auto-aims nearest enemy)
  swap: false,
  arcane: false,
  nova: false,
  blizzard: false,
  interact: false,         // talk to nearby NPC (mobile E)
  trade: false,            // request trade with nearby player (mobile G)
}

/** Clear edge-triggered buttons after the engine has read them for a tick. */
export function resetTouchEdges() {
  touch.swap = touch.arcane = touch.nova = touch.blizzard = touch.interact = touch.trade = false
}
