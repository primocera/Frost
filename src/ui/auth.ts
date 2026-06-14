/**
 * Client wrapper for the Worker's /api/play endpoint. Online play uses a
 * name + password; on success the server returns the account's stable `pid`
 * (save key), which we persist so the same mage loads on any device.
 */
const HOST = import.meta.env.VITE_PARTYKIT_HOST || `${location.hostname}:8787`
const API_BASE = `${location.protocol === 'https:' ? 'https' : 'http'}://${HOST}`

export interface Account { name: string; pid: string; member: boolean }

/** Sign in or (if the name is new) register, returning the account. */
export async function playOnline(name: string, password: string): Promise<Account> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}/api/play`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password }),
    })
  } catch { throw new Error('Could not reach the server. Try again.') }
  const data = await res.json().catch(() => null) as { pid?: string; name?: string; member?: boolean; error?: string } | null
  if (res.ok && data?.pid) return { name: data.name ?? name, pid: data.pid, member: !!data.member }
  // Distinguish a working backend *rejecting* us (wrong password / bad input)
  // from the backend being unreachable / not enabled yet — callers can fall
  // back to guest online play only in the latter case.
  const err = new Error(data?.error || 'Could not reach the server.')
  ;(err as AuthError).rejected = res.status === 400 || res.status === 401 || res.status === 409
  throw err
}

interface AuthError extends Error { rejected?: boolean }

export function saveAccount(a: Account) {
  try {
    localStorage.setItem('frost_account_pid', a.pid)
    localStorage.setItem('frost_account_name', a.name)
    localStorage.setItem('frost_member', a.member ? '1' : '0')
  } catch { /* storage blocked */ }
}
export function loadAccount(): Account | null {
  try {
    const pid = localStorage.getItem('frost_account_pid')
    const name = localStorage.getItem('frost_account_name')
    return pid && name ? { pid, name, member: localStorage.getItem('frost_member') === '1' } : null
  } catch { return null }
}
export function logoutAccount() {
  try {
    localStorage.removeItem('frost_account_pid')
    localStorage.removeItem('frost_account_name')
    localStorage.removeItem('frost_member')
  } catch { /* */ }
}
