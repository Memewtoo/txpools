import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const solanaRpcUrl = new URL(
    env.TXPOOLS_INDEXER_RPC_URL ?? env.VITE_SOLANA_RPC_URL ?? 'https://api.devnet.solana.com',
  )
  const solanaTransactionRpcUrl = new URL(
    env.VITE_SOLANA_TRANSACTION_RPC_URL ?? 'https://api.devnet.solana.com',
  )
  const txLineHeaders = {
    ...(env.TXLINE_GUEST_JWT ? { Authorization: `Bearer ${env.TXLINE_GUEST_JWT}` } : {}),
    ...(env.TXLINE_API_TOKEN ? { 'X-Api-Token': env.TXLINE_API_TOKEN } : {}),
  }

  return {
    plugins: [vue()],
    server: {
      proxy: {
        '/txline': {
          target: env.TXLINE_API_ORIGIN ?? 'https://txline-dev.txodds.com',
          changeOrigin: true,
          secure: true,
          headers: txLineHeaders,
          rewrite: (path) => path.replace(/^\/txline/, ''),
        },
        '/solana-rpc': {
          target: solanaRpcUrl.origin,
          changeOrigin: true,
          secure: true,
          ws: true,
          rewrite: () => `${solanaRpcUrl.pathname}${solanaRpcUrl.search}`,
        },
        '/solana-tx-rpc': {
          target: solanaTransactionRpcUrl.origin,
          changeOrigin: true,
          secure: true,
          ws: true,
          rewrite: () => `${solanaTransactionRpcUrl.pathname}${solanaTransactionRpcUrl.search}`,
        },
      },
    },
  }
})
