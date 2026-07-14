/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TXLINE_ENABLE_LIVE?: string
  readonly VITE_TXLINE_PROXY_URL?: string
  readonly VITE_TXLINE_COMPETITION_ID?: string
  readonly VITE_TXPOOLS_CLUSTER?: string
  readonly VITE_SOLANA_RPC_URL?: string
  readonly VITE_SOLANA_RPC_PROXY_URL?: string
  readonly VITE_SOLANA_USE_DEV_PROXY?: string
  readonly VITE_SOLANA_TRANSACTION_RPC_URL?: string
  readonly VITE_TXPOOLS_PROGRAM_ID?: string
  readonly VITE_TXPOOLS_USDC_MINT?: string
  readonly VITE_TXPOOLS_BOOTSTRAP_ADMIN?: string
  readonly VITE_TXPOOLS_INDEXER_URL?: string
}
