/**
 * Generic image-sprite cache: loads a PNG from /assets, keys out its flat
 * background once (edge flood-fill, so interior colours survive), and hands back
 * a ready-to-stamp canvas. Used for the imported Botania pine art. Returns null
 * until loaded; callers should fall back to procedural art meanwhile.
 */
const cache = new Map<string, { canvas: HTMLCanvasElement | null }>()

export function keyedSprite(file: string): HTMLCanvasElement | null {
  let e = cache.get(file)
  if (!e) {
    e = { canvas: null }
    cache.set(file, e)
    const img = new Image()
    img.onload = () => { try { e!.canvas = keyOut(img) } catch { e!.canvas = null } }
    img.src = `${import.meta.env.BASE_URL}assets/${file}`
  }
  return e.canvas
}

function keyOut(img: HTMLImageElement): HTMLCanvasElement {
  const w = img.width, h = img.height
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const g = c.getContext('2d')!
  g.drawImage(img, 0, 0)
  const id = g.getImageData(0, 0, w, h)
  const d = id.data
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + (w - 1)) * 4]
  let br = 0, bgc = 0, bb = 0
  for (const ci of corners) { br += d[ci]; bgc += d[ci + 1]; bb += d[ci + 2] }
  br /= 4; bgc /= 4; bb /= 4
  const TOL = 80
  const isBg = (i: number) => d[i + 3] < 8 || Math.abs(d[i] - br) + Math.abs(d[i + 1] - bgc) + Math.abs(d[i + 2] - bb) < TOL
  const visited = new Uint8Array(w * h)
  const stack: number[] = []
  const seed = (x: number, y: number) => { const p = y * w + x; if (!visited[p]) { visited[p] = 1; stack.push(p) } }
  for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1) }
  for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y) }
  while (stack.length) {
    const p = stack.pop()!
    if (!isBg(p * 4)) continue
    d[p * 4 + 3] = 0
    const x = p % w, y = (p / w) | 0
    if (x > 0 && !visited[p - 1]) { visited[p - 1] = 1; stack.push(p - 1) }
    if (x < w - 1 && !visited[p + 1]) { visited[p + 1] = 1; stack.push(p + 1) }
    if (y > 0 && !visited[p - w]) { visited[p - w] = 1; stack.push(p - w) }
    if (y < h - 1 && !visited[p + w]) { visited[p + w] = 1; stack.push(p + w) }
  }
  g.putImageData(id, 0, 0)
  return c
}
