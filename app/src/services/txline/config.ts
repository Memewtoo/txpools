import type { TxLineConfig } from './types'

const toNumber = (value: string | undefined) => {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const WORLD_CUP_DEMO_START_EPOCH_DAY = 20639
const browserProxyOrigin = import.meta.env.VITE_TXLINE_PROXY_URL?.replace(/\/+$/, '') ?? '/txline'

export const txLineConfig: TxLineConfig = {
  apiOrigin: 'https://txline-dev.txodds.com',
  browserApiOrigin: browserProxyOrigin,
  browserUsesProxy: true,
  enabled: import.meta.env.VITE_TXLINE_ENABLE_LIVE === 'true',
  competitionId: toNumber(import.meta.env.VITE_TXLINE_COMPETITION_ID),
  fixtureStartEpochDay: toNumber(import.meta.env.VITE_TXLINE_FIXTURE_START_EPOCH_DAY) ?? WORLD_CUP_DEMO_START_EPOCH_DAY,
  fixtureLookbackDays: toNumber(import.meta.env.VITE_TXLINE_FIXTURE_LOOKBACK_DAYS) ?? 14,
}

export const canUseTxLine = (config: TxLineConfig) => Boolean(
  config.enabled
  && (typeof window !== 'undefined' ? config.browserUsesProxy : config.guestJwt && config.apiToken),
)
