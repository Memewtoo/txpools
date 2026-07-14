import { PublicKey } from '@solana/web3.js'

export const TXPOOLS_PROGRAM_ID = new PublicKey(
  import.meta.env.VITE_TXPOOLS_PROGRAM_ID ?? 'txpWnpDSkz98Xgm451KBpezot1YL4FM8LnnUA4Tyfh1',
)

export const TXPOOLS_USDC_MINT = new PublicKey(
  import.meta.env.VITE_TXPOOLS_USDC_MINT ?? '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
)

export const TXPOOLS_RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL ?? 'https://api.devnet.solana.com'
const configuredReadProxy = import.meta.env.VITE_SOLANA_RPC_PROXY_URL?.replace(/\/+$/, '')
export const TXPOOLS_BROWSER_RPC_URL =
  configuredReadProxy
    ? configuredReadProxy
    : import.meta.env.DEV && import.meta.env.VITE_SOLANA_USE_DEV_PROXY !== 'false'
    ? `${window.location.origin}/solana-rpc`
    : TXPOOLS_RPC_URL
export const TXPOOLS_BROWSER_RPC_WS_URL =
  !configuredReadProxy && import.meta.env.DEV && import.meta.env.VITE_SOLANA_USE_DEV_PROXY !== 'false'
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/solana-rpc`
    : undefined
export const TXPOOLS_TRANSACTION_RPC_URL =
  import.meta.env.VITE_SOLANA_TRANSACTION_RPC_URL ?? 'https://api.devnet.solana.com'
export const TXPOOLS_BROWSER_TRANSACTION_RPC_URL =
  import.meta.env.DEV && import.meta.env.VITE_SOLANA_USE_DEV_PROXY !== 'false'
    ? `${window.location.origin}/solana-tx-rpc`
    : TXPOOLS_TRANSACTION_RPC_URL
export const TXPOOLS_BROWSER_TRANSACTION_RPC_WS_URL =
  import.meta.env.DEV && import.meta.env.VITE_SOLANA_USE_DEV_PROXY !== 'false'
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/solana-tx-rpc`
    : undefined
export const TXPOOLS_CLUSTER = import.meta.env.VITE_TXPOOLS_CLUSTER ?? 'devnet'

export const TXPOOLS_BOOTSTRAP_ADMIN = import.meta.env.VITE_TXPOOLS_BOOTSTRAP_ADMIN
  ? new PublicKey(import.meta.env.VITE_TXPOOLS_BOOTSTRAP_ADMIN)
  : undefined

export const TXLINE_PROGRAM_ID = new PublicKey('6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J')

export const CONFIG_SEED = 'config'
export const POOL_SEED = 'pool'
export const POSITION_SEED = 'position'
export const VAULT_SEED = 'vault'
export const DAILY_SCORES_SEED = 'daily_scores_roots'

export const USDC_DECIMALS = 6
export const BASIS_POINTS_DENOMINATOR = 10_000
export const DEFAULT_PLATFORM_FEE_BPS = 200
export const BONUS_POOL_AMOUNT_RAW = 150_000_000n
export const BONUS_POOL_AMOUNT_USDC = 150

export const TXLINE_HOME_SCORE_STAT_KEY = 1
export const TXLINE_AWAY_SCORE_STAT_KEY = 2
