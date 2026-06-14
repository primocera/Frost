/**
 * Client wrapper for the Worker's /api/play endpoint. Online play uses a
 * name + password; on success the server returns the account's stable `pid`
 * (save key), which we persist so the same mage loads on any device.
 */
const HOST = import.meta.env.VITE_PARTYKIT_HOST || `${location.hostname}:8787`
const API_BASE = `${location.protocol === 'https:' ? 'https' : 'http'}://${HOST}`

export interface Account { name: string; pid: string }

/** Sign in or (if the name is new) register, returning the account. */
export async function playOnline(name: string, password: string): Promise<Account> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}/api/play`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password }),
    })
  } catch { throw new Error('Could not reach the server. Try again.') }
  const data = await res.json().catch(() => ({})) as { pid?: string; name?: string; error?: string }
  if (!res.ok || !data.pid) throw new Error(data.error || 'Something went wrong.')
  return { name: data.name ?? name, pid: data.pid }
}

export function saveAccount(a: Account) {
  try { localStorage.setItem('frost_account_pid', a.pid); localStorage.setItem('frost_account_name', a.name) } catch { /* storage blocked */ }
}
export function loadAccount(): Account | null {
  try {
    const pid = localStorage.getItem('frost_account_pid')
    const name = localStorage.getItem('frost_account_name')
    return pid && name ? { pid, name } : null
  } catch { return null }
}
export function logoutAccount() {
  try { localStorage.removeItem('frost_account_pid'); localStorage.removeItem('frost_account_name') } catch { /* */ }
}
