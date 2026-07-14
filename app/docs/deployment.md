# Vercel and Railway Deployment

TxPools uses Vercel for the static Vue application and one Railway web service for the SQLite indexer, read API, TxLINE proxy, and protected Solana read proxy.

## Railway

Create a service from the GitHub repository and set its root directory to `app`.

Use this start command:

```bash
npm run indexer
```

Attach a volume at `/data`, then configure:

```bash
TXPOOLS_INDEXER_RPC_URL=<helius-devnet-rpc>
TXPOOLS_INDEXER_POLL_MS=15000
TXPOOLS_INDEXER_DB_PATH=/data/txpools.sqlite
TXPOOLS_PROGRAM_ID=txpWnpDSkz98Xgm451KBpezot1YL4FM8LnnUA4Tyfh1
TXPOOLS_ALLOWED_ORIGINS=https://<vercel-project>.vercel.app
TXPOOLS_PROXY_REQUESTS_PER_MINUTE=180
TXLINE_API_ORIGIN=https://txline-dev.txodds.com
TXLINE_GUEST_JWT=<txline-guest-jwt>
TXLINE_API_TOKEN=<txline-api-token>
```

Railway injects `PORT`; do not define it manually. Generate a public domain and verify:

```text
https://<railway-domain>/health
https://<railway-domain>/api/pools
```

## Vercel

Import the same repository and configure:

```text
Root Directory: app
Framework: Vite
Build Command: npm run build
Output Directory: dist
```

Set these browser-safe variables:

```bash
VITE_TXLINE_ENABLE_LIVE=true
VITE_TXLINE_PROXY_URL=https://<railway-domain>/txline
VITE_TXLINE_COMPETITION_ID=
VITE_TXLINE_FIXTURE_START_EPOCH_DAY=20639
VITE_TXPOOLS_CLUSTER=devnet
VITE_TXPOOLS_PROGRAM_ID=txpWnpDSkz98Xgm451KBpezot1YL4FM8LnnUA4Tyfh1
VITE_TXPOOLS_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
VITE_TXPOOLS_BOOTSTRAP_ADMIN=<browser-admin-wallet>
VITE_TXPOOLS_INDEXER_URL=https://<railway-domain>
VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
VITE_SOLANA_RPC_PROXY_URL=https://<railway-domain>/solana-rpc
VITE_SOLANA_TRANSACTION_RPC_URL=https://api.devnet.solana.com
```

Do not add `TXLINE_GUEST_JWT`, `TXLINE_API_TOKEN`, or the Helius URL to Vercel. The checked-in `vercel.json` sends Vue Router paths such as `/pools` and `/portfolio` to `index.html`.

After Vercel assigns the final domain, update `TXPOOLS_ALLOWED_ORIGINS` on Railway and redeploy the Railway service.
