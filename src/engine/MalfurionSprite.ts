/**
 * Loads the generated Malfurion boss art (public/assets/malfurion.png) and
 * keys out its flat grey background once, on load: a flood-fill from the image
 * edges turns background-connected grey transparent while preserving any grey
 * inside the character. The processed canvas is then stamped as the raid boss
 * sprite. Same-origin asset, so getImageData isn't tainted.
 */
let sprite: HTMLCanvasElement | null = null
let started = false

export function getMalfurionSprite(): HTMLCanvasElement | null {
  if (!started) {
    started = true
    const img = new Image()
    img.onload = () => { try { sprite = keyOut(img) } catch { sprite = null } }
    img.src = `${import.meta.env.BASE_URL}assets/malfurion.png`
  }
  return sprite
}

function keyOut(img: HTMLImageElement): HTMLCanvasElement {
  const w = img.width, h = img.height
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const g = c.getContext('2d')!
  g.drawImage(img, 0, 0)
  const id = g.getImageData(0, 0, w, h)
  const d = id.data

  // Average the four corners to get the background colour.
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + (w - 1)) * 4]
  let br = 0, bgc = 0, bb = 0
  for (const ci of corners) { br += d[ci]; bgc += d[ci + 1]; bb += d[ci + 2] }
  br /= 4; bgc /= 4; bb /= 4
  const TOL = 96
  const isBg = (i: number) => Math.abs(d[i] - br) + Math.abs(d[i + 1] - bgc) + Math.abs(d[i + 2] - bb) < TOL

  // Flood fill transparency from every edge pixel.
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
