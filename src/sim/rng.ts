/**
 * Small seedable PRNG (mulberry32). The simulation uses this instead of
 * Math.random so that, in Phase 4, the PartyKit server and clients can stay in
 * sync — same seed + same inputs => same world.
 */
export class RNG {
  private s: number

  constructor(seed = 0x9e3779b9) { this.s = seed >>> 0 }

  /** Float in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0
    let t = this.s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Float in [min, max). */
  range(min: number, max: number): number { return min + this.next() * (max - min) }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number { return Math.floor(this.range(min, max + 1)) }

  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)] }

  /** Serialize / restore internal state (for snapshots). */
  get state() { return this.s }
  set state(v: number) { this.s = v >>> 0 }
}
