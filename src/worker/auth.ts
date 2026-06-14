/// <reference types="@cloudflare/workers-types" />

/**
 * Dead-simple accounts for online play: a player picks a name + password. The
 * single /api/play endpoint signs them in if the name exists (password must
 * match) or registers it if it's new — no email, no separate signup/login.
 * Backed by Cloudflare D1 (separate free tier from the Durable Object, so it
 * never touches the multiplayer request budget). The returned `pid` is the save
 * key, so the same mage loads on any device. Passwords are PBKDF2-SHA256 + salt.
 */

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } })

const enc = (s: string) => new TextEncoder().encode(s)
const toHex = (buf: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
const fromHex = (h: string) => new Uint8Array((h.match(/.{2}/g) ?? []).map(b => parseInt(b, 16)))

async function derive(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc(password) as BufferSource, 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 100_000, hash: 'SHA-256' }, key, 256)
  return toHex(bits)
}

let tableReady = false
async function ensureTable(db: D1Database) {
  if (tableReady) return
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS accounts (
       name TEXT PRIMARY KEY, pw_hash TEXT NOT NULL, salt TEXT NOT NULL,
       pid TEXT NOT NULL, created INTEGER NOT NULL
     )`).run()
  tableReady = true
}

interface Creds { name?: unknown; password?: unknown }
function validate(body: Creds): { name: string; password: string } | string {
  const name = String(body.name ?? '').trim()
  const password = String(body.password ?? '')
  if (name.length < 1 || name.length > 16) return 'Name must be 1–16 characters.'
  if (password.length < 4) return 'Password must be at least 4 characters.'
  return { name, password }
}

/** Sign in (verify password) or register a new name, returning its save id. */
async function play(db: D1Database, body: Creds): Promise<Response> {
  const v = validate(body)
  if (typeof v === 'string') return json({ error: v }, 400)
  const row = await db.prepare('SELECT pw_hash, salt, pid FROM accounts WHERE name = ?')
    .bind(v.name).first<{ pw_hash: string; salt: string; pid: string }>()
  if (row) {
    if (await derive(v.password, fromHex(row.salt)) !== row.pw_hash) {
      return json({ error: 'That name is taken — wrong password.' }, 401)
    }
    return json({ pid: row.pid, name: v.name })
  }
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const pid = crypto.randomUUID()
  await db.prepare('INSERT INTO accounts (name, pw_hash, salt, pid, created) VALUES (?, ?, ?, ?, ?)')
    .bind(v.name, await derive(v.password, salt), toHex(salt), pid, Date.now()).run()
  return json({ pid, name: v.name })
}

/** Route /api/*. Returns 503 until a D1 database is bound. */
export async function handleApi(req: Request, db: D1Database | undefined, pathname: string): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (!db) return json({ error: 'Accounts are not enabled yet.' }, 503)
  await ensureTable(db)
  let body: Creds
  try { body = await req.json() } catch { return json({ error: 'Bad request.' }, 400) }
  if (pathname === '/api/play') return play(db, body)
  return json({ error: 'Not found.' }, 404)
}
