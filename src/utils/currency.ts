/** Format a copper amount into a human-readable string.
 *  100 copper = 1 silver, 100 silver = 1 gold (10 000 copper). */
export function formatCopper(n: number): string {
  const g = Math.floor(n / 10_000)
  const s = Math.floor((n % 10_000) / 100)
  const c = n % 100
  const parts: string[] = []
  if (g > 0) parts.push(`${g}g`)
  if (s > 0) parts.push(`${s}s`)
  if (c > 0 || parts.length === 0) parts.push(`${c}c`)
  return parts.join(' ')
}

/** Compact version for floating text — shows at most two tiers. */
export function formatCopperShort(n: number): string {
  const g = Math.floor(n / 10_000)
  const s = Math.floor((n % 10_000) / 100)
  const c = n % 100
  if (g > 0) return s > 0 ? `${g}g ${s}s` : `${g}g`
  if (s > 0) return c > 0 ? `${s}s ${c}c` : `${s}s`
  return `${c}c`
}
