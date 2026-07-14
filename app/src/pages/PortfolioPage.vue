<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useWallet, WalletMultiButton } from 'solana-wallets-vue'
import { createAssociatedTokenAccountInstruction } from '@solana/spl-token'
import { Transaction } from '@solana/web3.js'
import { CheckCircle2, ExternalLink, RefreshCw } from '@lucide/vue'
import PortfolioTable from '../components/PortfolioTable.vue'
import { type Position } from '../data/mockData'
import { useInitializedTxPools, type InitializedPoolState } from '../composables/useInitializedTxPools'
import {
  PoolStatus as ProgramPoolStatus,
  ProgramOutcome,
  TXPOOLS_USDC_MINT,
  claimWinningsInstruction,
  confirmSubmittedTransaction,
  fetchIndexedUserPositions,
  getUserUsdcAccount,
  rawToUsdc,
  txPoolsClient,
  txPoolsTransactionConnection,
  type IndexedPool,
  type IndexedPosition,
} from '../services/txpools'

const tabs = ['All', 'Active', 'Pending Settlement', 'Claimable', 'Won', 'Lost'] as const
const wallet = useWallet()
const { initializedPoolStates, indexedPools, refreshInitializedPools } = useInitializedTxPools()
const active = ref<(typeof tabs)[number]>('All')
const indexedPositions = ref<IndexedPosition[]>([])
const loading = ref(false)
const error = ref<string>()
const claimError = ref<string>()
const claimSignature = ref<string>()
const claimingIds = ref<Set<string>>(new Set())

const connectedWallet = computed(() => wallet.publicKey.value)

const formatRawUsdc = (amount: bigint) =>
  `${rawToUsdc(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`

const explorerTx = (signature: string) =>
  `https://explorer.solana.com/tx/${signature}?cluster=devnet`

const outcomeLabel = (outcome: number, home: string, away: string) => {
  if (outcome === ProgramOutcome.Home) return `${home} Win`
  if (outcome === ProgramOutcome.Away) return `${away} Win`
  return 'Draw'
}

const poolByPubkey = computed(() =>
  new Map(initializedPoolStates.value.map((state) => [state.pool.poolAddress, state])),
)
const indexedPoolByPubkey = computed(() =>
  new Map(indexedPools.value.map((pool) => [pool.pool_pubkey, pool])),
)

const positionStatus = (position: IndexedPosition, state: InitializedPoolState): Position['status'] => {
  const pool = state.onChainPool
  const winning = pool.winningOutcome === position.outcome
  if (pool.status === 1 || pool.status === 2) {
    if (!winning) return 'Lost'
    return position.claimed ? 'Won' : 'Claimable'
  }
  if (state.pool.status === 'Ready to Settle') return 'Pending Settlement'
  return 'Active'
}

const indexedPositionStatus = (position: IndexedPosition, pool: IndexedPool): Position['status'] => {
  if (pool.status === ProgramPoolStatus.Resolved || pool.status === ProgramPoolStatus.Swept) {
    if (Number(pool.winning_outcome) !== position.outcome) return 'Lost'
    return position.claimed ? 'Won' : 'Claimable'
  }
  return 'Active'
}

const estimatedPayoutRaw = (position: IndexedPosition, state: InitializedPoolState) => {
  // Use the exact integer formula from claim_winnings. Open pools use a current
  // projection, while resolved pools use the immutable netPayoutPool.
  const amount = BigInt(position.amount)
  const pool = state.onChainPool
  const outcomeTotal =
    position.outcome === ProgramOutcome.Home
      ? pool.outcomeTotals[0]
      : position.outcome === ProgramOutcome.Away
        ? pool.outcomeTotals[2]
        : pool.outcomeTotals[1]

  if (amount === 0n || outcomeTotal === 0n) return 0n
  if (pool.status === 1 || pool.status === 2) {
    if (pool.winningOutcome !== position.outcome) return 0n
    return (amount * pool.netPayoutPool) / outcomeTotal
  }

  const feeBps = BigInt(pool.feeBps)
  const fee = pool.totalLocked === 0n ? 0n : (state.vaultAmountRaw * feeBps) / 10_000n
  const payoutPool = state.vaultAmountRaw > fee ? state.vaultAmountRaw - fee : 0n
  return (amount * payoutPool) / outcomeTotal
}

const indexedOutcomeTotal = (position: IndexedPosition, pool: IndexedPool) => {
  if (position.outcome === ProgramOutcome.Home) return BigInt(pool.outcome_home)
  if (position.outcome === ProgramOutcome.Away) return BigInt(pool.outcome_away)
  return BigInt(pool.outcome_draw)
}

const indexedEstimatedPayoutRaw = (position: IndexedPosition, pool: IndexedPool) => {
  const amount = BigInt(position.amount)
  const outcomeTotal = indexedOutcomeTotal(position, pool)
  if (amount === 0n || outcomeTotal === 0n) return 0n

  if (pool.status === ProgramPoolStatus.Resolved || pool.status === ProgramPoolStatus.Swept) {
    if (Number(pool.winning_outcome) !== position.outcome) return 0n
    return (amount * BigInt(pool.net_payout_pool)) / outcomeTotal
  }

  const vaultAmount = BigInt(pool.vault_amount)
  const totalLocked = BigInt(pool.total_locked)
  const fee = totalLocked === 0n ? 0n : (vaultAmount * BigInt(pool.fee_bps)) / 10_000n
  const payoutPool = vaultAmount > fee ? vaultAmount - fee : 0n
  return (amount * payoutPool) / outcomeTotal
}

const rows = computed<Position[]>(() => {
  const mapped = indexedPositions.value
    .map((position) => {
      const state = poolByPubkey.value.get(position.pool_pubkey)
      const indexedPool = indexedPoolByPubkey.value.get(position.pool_pubkey)
      if (!state && !indexedPool) return undefined
      const status = state
        ? positionStatus(position, state)
        : indexedPositionStatus(position, indexedPool as IndexedPool)
      const home = state?.pool.home ?? `Fixture ${indexedPool?.fixture_id ?? 'Unknown'}`
      const away = state?.pool.away ?? 'TxPools'
      const payoutRaw = state
        ? estimatedPayoutRaw(position, state)
        : indexedEstimatedPayoutRaw(position, indexedPool as IndexedPool)
      return {
        id: position.position_pubkey,
        ...(state?.pool.id
          ? { poolId: state.pool.id }
          : indexedPool?.fixture_id
            ? { poolId: `txline-${indexedPool.fixture_id}` }
            : {}),
        match: state ? `${state.pool.home} vs ${state.pool.away}` : home,
        prediction: outcomeLabel(position.outcome, home, away),
        amount: formatRawUsdc(BigInt(position.amount)),
        status,
        estimatedPayout: formatRawUsdc(payoutRaw),
        action: status === 'Claimable' ? 'Claim Winnings' : status === 'Won' ? 'Claimed' : status === 'Lost' ? 'Closed' : 'View Pool',
      } satisfies Position
    })
    .filter((position): position is Position => Boolean(position))

  return active.value === 'All'
    ? mapped
    : mapped.filter((position) => position.status === (active.value as Position['status']))
})

const claimableValue = computed(() =>
  indexedPositions.value.reduce((total, position) => {
    const state = poolByPubkey.value.get(position.pool_pubkey)
    if (state) {
      if (positionStatus(position, state) !== 'Claimable') return total
      return total + estimatedPayoutRaw(position, state)
    }

    const indexedPool = indexedPoolByPubkey.value.get(position.pool_pubkey)
    if (!indexedPool || indexedPositionStatus(position, indexedPool) !== 'Claimable') return total
    return total + indexedEstimatedPayoutRaw(position, indexedPool)
  }, 0n),
)

const refreshPortfolio = async () => {
  if (!connectedWallet.value) {
    indexedPositions.value = []
    return
  }
  loading.value = true
  error.value = undefined
  try {
    const [positions] = await Promise.all([
      fetchIndexedUserPositions(connectedWallet.value.toBase58()),
      refreshInitializedPools({ fallbackToBrowserRpc: false }),
    ])
    indexedPositions.value = positions
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Unable to load indexed portfolio positions.'
  } finally {
    loading.value = false
  }
}

const claimPosition = async (positionId: string) => {
  const user = connectedWallet.value
  if (!user || claimingIds.value.has(positionId)) return

  claimError.value = undefined
  claimSignature.value = undefined
  const position = indexedPositions.value.find((item) => item.position_pubkey === positionId)
  const pool = position ? indexedPoolByPubkey.value.get(position.pool_pubkey) : undefined
  if (!position || !pool) {
    claimError.value = 'The indexed position or pool is unavailable. Refresh Portfolio and try again.'
    return
  }
  if (indexedPositionStatus(position, pool) !== 'Claimable') {
    claimError.value = 'This position is not claimable.'
    return
  }

  claimingIds.value = new Set([...claimingIds.value, positionId])
  try {
    const fixtureId = Number(pool.fixture_id)
    const outcome = position.outcome as ProgramOutcome
    const userUsdcAccount = getUserUsdcAccount(user)
    const {
      context: { slot: minContextSlot },
      value: { blockhash, lastValidBlockHeight },
    } = await txPoolsTransactionConnection.getLatestBlockhashAndContext('confirmed')
    const transaction = new Transaction({
      feePayer: user,
      recentBlockhash: blockhash,
    })

    // Claim remains one wallet action even when the recipient ATA is missing.
    if (!await txPoolsClient.connection.getAccountInfo(userUsdcAccount, 'confirmed')) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          user,
          userUsdcAccount,
          user,
          TXPOOLS_USDC_MINT,
        ),
      )
    }
    transaction.add(claimWinningsInstruction({
      user,
      fixtureId,
      outcome,
      userUsdcAccount,
    }))

    const signature = await wallet.sendTransaction(
      transaction,
      txPoolsTransactionConnection,
      { minContextSlot },
    )
    await confirmSubmittedTransaction({
      connection: txPoolsTransactionConnection,
      signature,
      blockhash,
      lastValidBlockHeight,
      isApplied: async () => Boolean((await txPoolsClient.fetchPosition(
        fixtureId,
        user,
        outcome,
      ))?.claimed),
    })

    // Mark locally after on-chain confirmation so the claim button disappears
    // before the indexer's next polling cycle.
    indexedPositions.value = indexedPositions.value.map((item) =>
      item.position_pubkey === positionId ? { ...item, claimed: 1 } : item,
    )
    claimSignature.value = signature
  } catch (caught) {
    claimError.value = caught instanceof Error ? caught.message : 'claim_winnings transaction failed.'
  } finally {
    const next = new Set(claimingIds.value)
    next.delete(positionId)
    claimingIds.value = next
  }
}

watch(connectedWallet, () => void refreshPortfolio(), { immediate: true })
</script>

<template>
  <div v-if="!connectedWallet" class="glass-card rounded-2xl p-8 text-center">
    <h1 class="text-3xl font-bold text-white">Connect Wallet</h1>
    <p class="mx-auto mt-3 max-w-xl text-muted">
      Portfolio is available after connecting a wallet so TxPools can load your indexed positions.
    </p>
    <div class="mt-6 flex justify-center">
      <WalletMultiButton dark />
    </div>
  </div>

  <div v-else class="space-y-8">
    <header class="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
      <div>
        <h1 class="text-4xl font-bold text-white">My Portfolio</h1>
        <p class="mt-3 text-muted">Track locked USDC, pending settlements, and claimable winnings.</p>
        <button
          class="mt-4 inline-flex items-center gap-2 rounded-xl border border-secondary/25 bg-secondary/10 px-4 py-2 text-sm font-bold text-secondary transition hover:bg-secondary/15 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="loading"
          type="button"
          @click="refreshPortfolio"
        >
          <RefreshCw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />
          Refresh Portfolio
        </button>
      </div>
      <div class="glass-card rounded-2xl p-5 sm:min-w-80">
        <div class="label-caps text-muted">Claimable value</div>
        <div class="mt-1 font-mono text-3xl font-bold text-secondary">{{ formatRawUsdc(claimableValue) }}</div>
        <button class="mt-4 w-full rounded-xl bg-tertiary py-3 font-bold text-[#003920] opacity-60">Claim All USDC</button>
      </div>
    </header>

    <div v-if="error" class="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold text-red-200">
      {{ error }}
    </div>
    <div v-if="claimError" class="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold text-red-200">
      {{ claimError }}
    </div>
    <div v-if="claimSignature" class="flex items-center gap-3 rounded-2xl border border-tertiary/30 bg-tertiary/10 p-4 text-sm">
      <CheckCircle2 class="h-5 w-5 shrink-0 text-tertiary" />
      <span class="font-semibold text-white">Winnings claimed successfully.</span>
      <a
        class="ml-auto inline-flex items-center gap-1.5 font-bold text-primary"
        :href="explorerTx(claimSignature)"
        target="_blank"
        rel="noreferrer"
      >
        View transaction
        <ExternalLink class="h-4 w-4" />
      </a>
    </div>

    <div class="flex gap-2 overflow-x-auto rounded-2xl border border-outline/25 bg-surface-low p-1.5">
      <button v-for="tab in tabs" :key="tab" class="whitespace-nowrap rounded-xl px-5 py-2 label-caps" :class="active === tab ? 'bg-primary text-[#450086]' : 'text-muted'" @click="active = tab">
        {{ tab }}
      </button>
    </div>

    <PortfolioTable
      :rows="rows"
      :claiming-ids="Array.from(claimingIds)"
      @claim="claimPosition"
    />
  </div>
</template>
