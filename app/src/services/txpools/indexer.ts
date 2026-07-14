export interface IndexedPool {
  pool_pubkey: string
  fixture_id: string
  admin_pubkey: string
  vault_pubkey: string
  vault_amount: string
  close_ts: string
  status: number
  total_locked: string
  outcome_home: string
  outcome_draw: string
  outcome_away: string
  winning_outcome: number
  final_home_score: number
  final_away_score: number
  fee_bps: number
  fee_amount: string
  net_payout_pool: string
  participants: number
  positions: number
  updated_slot: number
  updated_at: number
  settled_at: number | null
}

export interface IndexedPosition {
  position_pubkey: string
  pool_pubkey: string
  user_pubkey: string
  outcome: number
  amount: string
  claimed: number
  updated_slot: number
  updated_at: number
}

export const TXPOOLS_INDEXER_URL = import.meta.env.VITE_TXPOOLS_INDEXER_URL as string | undefined

const apiUrl = (path: string) => {
  if (!TXPOOLS_INDEXER_URL) return undefined
  return `${TXPOOLS_INDEXER_URL.replace(/\/+$/, '')}${path}`
}

const fetchJson = async <T>(path: string): Promise<T | undefined> => {
  const url = apiUrl(path)
  if (!url) return undefined
  const response = await fetch(url)
  if (!response.ok) throw new Error(`TxPools indexer request failed: ${response.status}`)
  return response.json() as Promise<T>
}

export const fetchIndexedPools = async () => {
  const result = await fetchJson<{ pools: IndexedPool[] }>('/api/pools')
  return result?.pools ?? []
}

export const fetchIndexedPool = async (fixtureId: bigint | number | string) => {
  const result = await fetchJson<{ pool: IndexedPool }>(`/api/pools/${fixtureId}`)
  return result?.pool
}

export const fetchIndexedUserPositions = async (wallet: string) => {
  const result = await fetchJson<{ positions: IndexedPosition[] }>(`/api/users/${wallet}/positions`)
  return result?.positions ?? []
}
