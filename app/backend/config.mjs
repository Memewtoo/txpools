import { PublicKey } from '@solana/web3.js'

const splitList = (value) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

const rpcUrl = process.env.TXPOOLS_INDEXER_RPC_URL
  ?? process.env.VITE_SOLANA_RPC_URL
  ?? 'https://api.devnet.solana.com'

const rpcHost = (() => {
  try {
    return new URL(rpcUrl).host
  } catch {
    return 'invalid-rpc-url'
  }
})()

export const config = {
  rpcUrl,
  rpcHost,
  programId: new PublicKey(
    process.env.TXPOOLS_PROGRAM_ID
      ?? process.env.VITE_TXPOOLS_PROGRAM_ID
      ?? 'txpWnpDSkz98Xgm451KBpezot1YL4FM8LnnUA4Tyfh1',
  ),
  pollMs: Number(process.env.TXPOOLS_INDEXER_POLL_MS ?? 15_000),
  dbPath: process.env.TXPOOLS_INDEXER_DB_PATH ?? './txpools.sqlite',
  port: Number(process.env.PORT ?? process.env.TXPOOLS_INDEXER_PORT ?? 8787),
  allowedOrigins: splitList(process.env.TXPOOLS_ALLOWED_ORIGINS),
  proxyRequestsPerMinute: Number(process.env.TXPOOLS_PROXY_REQUESTS_PER_MINUTE ?? 180),
  txLineApiOrigin: process.env.TXLINE_API_ORIGIN ?? 'https://txline-dev.txodds.com',
  txLineGuestJwt: process.env.TXLINE_GUEST_JWT,
  txLineApiToken: process.env.TXLINE_API_TOKEN,
}

export const POOL_SEED = 'pool'
export const VAULT_SEED = 'vault'
export const POOL_LEN = 107
export const POSITION_LEN = 76
export const TOKEN_ACCOUNT_LEN = 165
