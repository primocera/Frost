/// <reference types="@cloudflare/workers-types" />

/**
 * Accounts + one-time membership for online play.
 *  - /api/play         : sign in (verify password) or register a new name.
 *  - /api/stripe-webhook: Stripe calls this after a $3 checkout; we flip the
 *                         buyer's account to member=1 (matched by the pid passed
 *                         as client_reference_id on the payment link).
 * Backed by Cloudflare D1 (separate free tier from the Durable Object).
 * Passwords are PBKDF2-SHA256 + per-user salt. Membership lifts the free level
 * cap; the level gate itself is enforced server-side in the sim.
 */

export interface AuthEnv { DB?: D1Database; STRIPE_WEBHOOK_SECRET?: string }

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
       pid TEXT NOT NULL, member INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL
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

/** Sign in or register; returns { pid, name, member }. */
async function play(db: D1Database, body: Creds): Promise<Response> {
  const v = validate(body)
  if (typeof v === 'string') return json({ error: v }, 400)
  const row = await db.prepare('SELECT pw_hash, salt, pid, member FROM accounts WHERE name = ?')
    .bind(v.name).first<{ pw_hash: string; salt: string; pid: string; member: number }>()
  if (row) {
    if (await derive(v.password, fromHex(row.salt)) !== row.pw_hash) {
      return json({ error: 'That name is taken — wrong password.' }, 401)
    }
    return json({ pid: row.pid, name: v.name, member: !!row.member })
  }
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const pid = crypto.randomUUID()
  await db.prepare('INSERT INTO accounts (name, pw_hash, salt, pid, member, created) VALUES (?, ?, ?, ?, 0, ?)')
    .bind(v.name, await derive(v.password, salt), toHex(salt), pid, Date.now()).run()
  return json({ pid, name: v.name, member: false })
}

// ── Stripe webhook (membership unlock) ───────────────────────────────────────
function constTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function verifyStripe(payload: string, header: string, secret: string): Promise<boolean> {
  const t = header.split(',').find(p => p.startsWith('t='))?.slice(2)
  const sigs = header.split(',').filter(p => p.startsWith('v1=')).map(p => p.slice(3))
  if (!t || sigs.length === 0) return false
  const key = await crypto.subtle.importKey('raw', enc(secret) as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = toHex(await crypto.subtle.sign('HMAC', key, enc(`${t}.${payload}`) as BufferSource))
  return sigs.some(s => constTimeEq(s, mac))
}

async function stripeWebhook(env: AuthEnv, req: Request): Promise<Response> {
  if (!env.DB || !env.STRIPE_WEBHOOK_SECRET) return json({ error: 'Not configured.' }, 503)
  const payload = await req.text()
  const sig = req.headers.get('stripe-signature') ?? ''
  if (!(await verifyStripe(payload, sig, env.STRIPE_WEBHOOK_SECRET))) return json({ error: 'Bad signature.' }, 400)
  let event: { type?: string; data?: { object?: { client_reference_id?: string } } }
  try { event = JSON.parse(payload) } catch { return json({ error: 'Bad payload.' }, 400) }
  if (event.type === 'checkout.session.completed') {
    const pid = event.data?.object?.client_reference_id
    if (pid) {
      await ensureTable(env.DB)
      await env.DB.prepare('UPDATE accounts SET member = 1 WHERE pid = ?').bind(String(pid)).run()
    }
  }
  return json({ received: true })
}

/** Route /api/*. Account routes need D1; webhook needs D1 + the signing secret. */
export async function handleApi(req: Request, env: AuthEnv, pathname: string): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (pathname === '/api/stripe-webhook') return stripeWebhook(env, req)
  if (!env.DB) return json({ error: 'Accounts are not enabled yet.' }, 503)
  await ensureTable(env.DB)
  let body: Creds
  try { body = await req.json() } catch { return json({ error: 'Bad request.' }, 400) }
  if (pathname === '/api/play') return play(env.DB, body)
  return json({ error: 'Not found.' }, 404)
}

/** Look up a player's membership by their pid (used by the game server on join). */
export async function isMember(db: D1Database | undefined, pid: string): Promise<boolean> {
  if (!db) return false
  await ensureTable(db)
  const row = await db.prepare('SELECT member FROM accounts WHERE pid = ?').bind(pid).first<{ member: number }>()
  return !!row?.member
}
