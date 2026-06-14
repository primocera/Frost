/**
 * Client wrapper for the Worker's /api auth endpoints. On success the server
 * returns the account's stable `pid` (save key); we persist it so the game
 * loads that same character — on this or any other device the user logs in from.
 */
const HOST = import.meta.env.VITE_PARTYKIT_HOST || `${location.hostname}:8787`
const API_BASE = `${location.protocol === 'https:' ? 'https' : 'http'}://${HOST}`

export interface Account { email: string; pid: string }

async function post(path: string, email: string, password: string): Promise<Account> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
  } catch { throw new Error('Could not reach the server. Try again.') }
  const data = await res.json().catch(() => ({})) as { pid?: string; email?: string; error?: string }
  if (!res.ok || !data.pid) throw new Error(data.error || 'Something went wrong.')
  return { email: data.email ?? email, pid: data.pid }
}

export const signup = (email: string, password: string) => post('/api/signup', email, password)
export const login = (email: string, password: string) => post('/api/login', email, password)

export function saveAccount(a: Account) {
  try { localStorage.setItem('frost_account_pid', a.pid); localStorage.setItem('frost_account_email', a.email) } catch { /* storage blocked */ }
}
export function loadAccount(): Account | null {
  try {
    const pid = localStorage.getItem('frost_account_pid')
    const email = localStorage.getItem('frost_account_email')
    return pid && email ? { pid, email } : null
  } catch { return null }
}
export function logoutAccount() {
  try { localStorage.removeItem('frost_account_pid'); localStorage.removeItem('frost_account_email') } catch { /* */ }
}
