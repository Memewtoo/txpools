# TxPools Hackathon Demo Script

Target length: 4:30-4:50. Maximum allowed length: 5:00.

## Before Recording

- Confirm the Vercel application and Railway `/health` endpoint are available.
- Connect Phantom to Devnet and use a wallet with devnet USDC.
- Identify one upcoming initialized pool for the lock demonstration.
- Keep one previously submitted transaction open in Solana Explorer as a backup.
- Use the authority wallet if the Admin page will be shown.
- Close any tabs or panels containing `.env` values, API credentials, or keypairs.
- Set browser zoom to 90% so cards and tables fit without rushed scrolling.
- Do not wait silently for Devnet. If confirmation takes more than a few seconds, use the latency line below and continue.

## Recording Script

### 0:00-0:30 - The Product

**On screen:** Open the TxPools homepage. Briefly show Featured Matches and Latest Settlements.

**Narration:**

> TxPools is a trustless World Cup prediction pool application on Solana Devnet. Users lock USDC before kickoff, match results are verified through TxLINE, and winners claim a proportional share of the pool. These featured matches and latest settlements are live application data joined from TxLINE and our indexed on-chain TxPools accounts, not hard-coded demo rows.

### 0:30-1:10 - Live Pools

**On screen:** Open **Pools**. Point to the TxLINE SSE badge, on-chain pool count, statuses, pool totals, current rates, and pool PDA. Open an upcoming match.

**Narration:**

> The Pools view combines TxLINE fixture and score feeds with initialized program accounts. Each card shows the match status, gross USDC pool, user liquidity, platform bonus, outcome distribution, and current payout rates. Only initialized pools appear here. TxLINE controls the match lifecycle in the interface, while pool balances and outcomes come from Solana.

### 1:10-2:05 - Lock a Prediction

**On screen:** On Match Detail, show the wallet balance and countdown. Select an outcome, enter a small USDC amount, show the estimated claim and rate, then click **Confirm Prediction** and approve in Phantom.

**Narration before approval:**

> Predictions close at the fixture kickoff time. I will select an outcome and lock a small amount of devnet USDC. The preview applies the same proportional payout formula used by the program. The transaction creates or updates a position PDA for this wallet, pool, and outcome, then transfers USDC into the pool vault PDA.

**Narration after submission:**

> Once confirmed, the gross pool, outcome totals, and all three rates refresh from the updated on-chain account. The page also subscribes to pool changes, so locks from other users update these cards automatically.

**Devnet latency line:**

> The transaction is submitted to Devnet. Confirmation can occasionally lag, so I will continue while the client verifies the resulting position account rather than treating a block-height timeout as a failed transaction.

### 2:05-2:40 - Portfolio and Claims

**On screen:** Open **Portfolio**. Show All, Active, Claimable, Won, and Lost filters. Point to the newly created or existing position. If a claimable position is available, show **Claim Winnings**; otherwise show a previously claimed row.

**Narration:**

> Portfolio is wallet-scoped and only appears after connecting. Positions are indexed from on-chain position PDAs for fast loading, while transaction eligibility remains based on program state. Active positions show projected payouts. After resolution, winning positions become claimable, losing positions close, and a successful claim is permanently marked so it cannot be claimed twice.

**Optional claim narration:**

> Claiming transfers this wallet's exact proportional payout from the PDA-controlled vault into its USDC token account.

### 2:40-3:35 - TxLINE Settlement

**On screen:** Open **Settlements**. Show Ready for Settlement and Recently Settled. Point to final score, proof status, winning pool, payout rate, and settled ordering. Resolve only if an eligible pool is available and the timing is comfortable.

**Narration:**

> Settlement is permissionless, but the interface is strict: a pool appears here only when TxLINE reports the fixture as final and the on-chain pool is still open. Resolve Market prepares proofs for the final home and away scores and sends `resolve_pool`. The Pinocchio program performs two TxLINE `validate_stat` CPIs, records the verified winner, calculates the fee and net payout pool, and moves user winnings into a claimable state. Recently settled pools are read from real program accounts and ordered by their indexed settlement time.

**If resolving live:**

> I can submit this from any connected wallet; settlement does not require the pool admin.

### 3:35-4:15 - Authority Controls

**On screen:** Connect the authority wallet and open **Admin**. Show that Admin is absent for other wallets. Show initialized config, TxLINE fixture selection, automatic timestamps, platform bonus, and sweep eligibility. Do not initialize or sweep unless intentionally prepared.

**Narration:**

> Administrative controls are address-gated in the interface and enforced again by the program. The global config is initialized once. For pool creation, the page fetches eligible TxLINE fixtures, excludes fixtures already initialized, derives timing automatically, creates the pool and vault PDAs, and funds a 150 USDC platform bonus. Sweep is narrowly limited to resolved pools with no user funds on the winning outcome; pools with winners must pay users through claims.

### 4:15-4:45 - Trust and Architecture

**On screen:** Open **Trust** and follow the flow diagram from user to payout.

**Narration:**

> The trust model is simple: users deposit into non-custodial Solana escrow, TxLINE supplies signed match data and Merkle-backed score proofs, and the program validates the result before releasing payouts. The SQLite service is only a read indexer. It never signs, holds funds, resolves pools, or authorizes claims. Solana accounts remain the source of truth.

### 4:45-4:58 - Close

**On screen:** Return to the homepage or briefly show the program IDs in the README or Explorer.

**Narration:**

> TxPools is deployed on Devnet, built with Vue, Pinocchio, and Mollusk-tested program logic. It demonstrates the complete flow from live World Cup data, to USDC prediction, TxLINE-verified settlement, and non-custodial winnings. This is TxPools.

## Claims to Avoid

- Do not call the product a betting platform, casino, bookmaker, or yield product.
- Do not say settlement is automatic; it is permissionless and must be triggered.
- Do not say payouts are automatic; winning users call `claim_winnings`.
- Do not say the indexer secures or authorizes transactions.
- Do not claim TxLINE proves final match status on-chain. The frontend strictly checks finality, while the current CPI validates the submitted score statistics.
- Do not describe Devnet USDC as real-value USDC.

## Short Backup Demo

If a transaction or external feed is unavailable during recording:

1. Show the existing on-chain pool and position values in the application.
2. Open a previously successful transaction in Solana Explorer.
3. Explain the account transition in one sentence.
4. Continue to the next section without waiting or retrying on camera.
