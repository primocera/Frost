/// <reference types="@cloudflare/workers-types" />

/**
 * Minimal account system: email + password signup/login over plain HTTP routes,
 * backed by Cloudflare D1 (separate free tier from Durable Objects, so it never
 * touches the multiplayer request budget). Doubles as a leads list — every
 * signup is a row of {email, created} you can export from the D1 console.
 *
 * The "credential" returned on success is the player's stable `pid` (the save
 * key). Storing it client-side lets a player resume the same character on any
 * device after logging in. Passwords are PBKDF2-SHA256 hashed with a per-user
 * salt; plaintext is never stored.
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
       email TEXT PRIMARY KEY, pw_hash TEXT NOT NULL, salt TEXT NOT NULL,
       pid TEXT NOT NULL, created INTEGER NOT NULL
     )`).run()
  tableReady = true
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

interface Creds { email?: unknown; password?: unknown }
function validate(body: Creds): { email: string; password: string } | string {
  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')
  if (!EMAIL_RE.test(email)) return 'Please enter a valid email.'
  if (password.length < 6) return 'Password must be at least 6 characters.'
  return { email, password }
}

async function signup(db: D1Database, body: Creds): Promise<Response> {
  const v = validate(body)
  if (typeof v === 'string') return json({ error: v }, 400)
  const existing = await db.prepare('SELECT email FROM accounts WHERE email = ?').bind(v.email).first()
  if (existing) return json({ error: 'That email is already registered — try logging in.' }, 409)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const pid = crypto.randomUUID()
  await db.prepare('INSERT INTO accounts (email, pw_hash, salt, pid, created) VALUES (?, ?, ?, ?, ?)')
    .bind(v.email, await derive(v.password, salt), toHex(salt), pid, Date.now()).run()
  return json({ pid, email: v.email })
}

async function login(db: D1Database, body: Creds): Promise<Response> {
  const v = validate(body)
  if (typeof v === 'string') return json({ error: v }, 400)
  const row = await db.prepare('SELECT pw_hash, salt, pid FROM accounts WHERE email = ?')
    .bind(v.email).first<{ pw_hash: string; salt: string; pid: string }>()
  if (!row) return json({ error: 'No account with that email.' }, 404)
  if (await derive(v.password, fromHex(row.salt)) !== row.pw_hash) return json({ error: 'Wrong password.' }, 401)
  return json({ pid: row.pid, email: v.email })
}

/** Route the /api/* endpoints. Returns 503 until a D1 database is bound. */
export async function handleApi(req: Request, db: D1Database | undefined, pathname: string): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (!db) return json({ error: 'Accounts are not enabled yet.' }, 503)
  await ensureTable(db)
  let body: Creds
  try { body = await req.json() } catch { return json({ error: 'Bad request.' }, 400) }
  if (pathname === '/api/signup') return signup(db, body)
  if (pathname === '/api/login') return login(db, body)
  return json({ error: 'Not found.' }, 404)
}
