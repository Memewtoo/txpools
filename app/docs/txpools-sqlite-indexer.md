# TxPools SQLite Indexer

Local-only indexer for TxPools devnet pools and positions.

## Run Once

```bash
cd app
npm run indexer:once
```

This polls Solana devnet once, decodes TxPools `Pool` and `Position` accounts, and writes `txpools.sqlite`.

## Run API + Poller

```bash
cd app
npm run indexer
```

Defaults:

```text
RPC:  https://api.devnet.solana.com
API:  http://localhost:8787
DB:   ./txpools.sqlite
Poll: 15000 ms
```

## Environment

```bash
TXPOOLS_INDEXER_RPC_URL=https://api.devnet.solana.com
TXPOOLS_INDEXER_PORT=8787
TXPOOLS_INDEXER_POLL_MS=15000
TXPOOLS_INDEXER_DB_PATH=./txpools.sqlite
```

## API

```text
GET /health
GET /api/pools
GET /api/pools/:fixtureId
GET /api/pools/:fixtureId/participants
GET /api/pools/:fixtureId/positions
GET /api/users/:wallet/positions
```

## Notes

- Amounts are stored as raw USDC strings to avoid JavaScript number rounding.
- Participant count is derived off-chain with `count(distinct user_pubkey)`.
- This is intentionally polling-based for hackathon/devnet reliability. A later production indexer can switch to WebSocket subscriptions or a hosted indexing service without changing the on-chain program.
