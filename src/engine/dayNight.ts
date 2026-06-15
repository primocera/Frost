/**
 * World day-night cycle. The phase is derived purely from the wall clock
 * (Date.now), so every player — solo or multiplayer — sees the same time of day
 * with no network sync. One full day is 25 minutes (Minecraft-ish). The result
 * is a single screen tint the renderer blends over the world, so it costs one
 * fillRect per frame (mobile-friendly).
 */
const CYCLE_MS = 25 * 60 * 1000   // 25 min per full day

export interface Tint { r: number; g: number; b: number; a: number }

// Keyframes around the day (phase 0 = midnight, 0.5 = noon). Phase 1 repeats 0.
const KEYS: [number, Tint][] = [
  [0.00, { r: 8,   g: 14,  b: 42,  a: 0.60 }],  // midnight — deep blue moonlight
  [0.20, { r: 10,  g: 16,  b: 46,  a: 0.56 }],  // late night
  [0.25, { r: 255, g: 150, b: 80,  a: 0.30 }],  // sunrise — warm
  [0.32, { r: 255, g: 238, b: 210, a: 0.04 }],  // morning
  [0.50, { r: 255, g: 255, b: 255, a: 0.00 }],  // noon — clear
  [0.68, { r: 255, g: 240, b: 205, a: 0.05 }],  // afternoon
  [0.74, { r: 255, g: 120, b: 60,  a: 0.30 }],  // sunset
  [0.80, { r: 110, g: 64,  b: 140, a: 0.38 }],  // dusk — purple
  [0.87, { r: 8,   g: 14,  b: 42,  a: 0.56 }],  // night falls
  [1.00, { r: 8,   g: 14,  b: 42,  a: 0.60 }],  // wrap to midnight
]

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Current 0..1 position in the day (0 = midnight, 0.5 = noon). */
export function dayPhase(now = Date.now()): number {
  return ((now % CYCLE_MS) / CYCLE_MS + 1) % 1
}

/** Screen tint for the current time of day. */
export function dayNightTint(now = Date.now()): Tint {
  const p = dayPhase(now)
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [p0, c0] = KEYS[i], [p1, c1] = KEYS[i + 1]
    if (p >= p0 && p <= p1) {
      const t = (p - p0) / (p1 - p0 || 1)
      return { r: Math.round(lerp(c0.r, c1.r, t)), g: Math.round(lerp(c0.g, c1.g, t)), b: Math.round(lerp(c0.b, c1.b, t)), a: lerp(c0.a, c1.a, t) }
    }
  }
  return KEYS[0][1]
}

export function dayPhaseLabel(now = Date.now()): { label: string; icon: string } {
  const p = dayPhase(now)
  if (p < 0.22 || p >= 0.86) return { label: 'Night', icon: '🌙' }
  if (p < 0.30) return { label: 'Dawn', icon: '🌅' }
  if (p < 0.72) return { label: 'Day', icon: '☀️' }
  if (p < 0.80) return { label: 'Sunset', icon: '🌇' }
  return { label: 'Dusk', icon: '🌆' }
}

/** True during the dark hours — for future night-exclusive spawns/resources. */
export function isNight(now = Date.now()): boolean {
  const p = dayPhase(now)
  return p < 0.22 || p >= 0.86
}
