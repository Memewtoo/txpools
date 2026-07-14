<script setup lang="ts">
import { computed, ref } from 'vue'
import { createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { ComputeBudgetProgram, PublicKey, Transaction } from '@solana/web3.js'
import { useWallet, WalletMultiButton } from 'solana-wallets-vue'
import { CheckCircle2, ExternalLink, RefreshCw, ShieldCheck, X } from '@lucide/vue'
import SettlementTable from '../components/SettlementTable.vue'
import StatusBadge from '../components/StatusBadge.vue'
import type { Settlement } from '../data/mockData'
import { useInitializedTxPools, type InitializedPoolState } from '../composables/useInitializedTxPools'
import { useTxPoolsAdmin } from '../composables/useTxPoolsAdmin'
import {
  DEFAULT_PLATFORM_FEE_BPS,
  ProgramOutcome,
  PoolStatus as ProgramPoolStatus,
  TXPOOLS_USDC_MINT,
  confirmSubmittedTransaction,
  getResolveProofInputs,
  rawToUsdc,
  resolvePoolInstruction,
  txPoolsClient,
  txPoolsTransactionConnection,
  type PoolAccount,
} from '../services/txpools'
import { TxLineClient, txLineConfig } from '../services/txline'

type ResolveUiState = {
  loading?: boolean
  error?: string
  signature?: string
  proofSeq?: number
}

type SuccessToast = {
  id: number
  match: string
  signature: string
}

type SettlementRow = Settlement & { settledAt: number; matchAt: number }

const wallet = useWallet()
const { config, refreshConfig } = useTxPoolsAdmin()
const {
  initializedPoolStates,
  indexedPools,
  onChainLoading,
  onChainError,
  indexerError,
  refreshInitializedPools,
} = useInitializedTxPools()

const resolveState = ref<Record<string, ResolveUiState>>({})
const hiddenResolvedPoolIds = ref<Set<string>>(new Set())
const successToasts = ref<SuccessToast[]>([])
const optimisticSettlementRows = ref<SettlementRow[]>([])
let nextToastId = 0

const connectedWallet = computed(() => wallet.publicKey.value)

const formatRawUsdc = (amount: bigint) =>
  `${rawToUsdc(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`

const shortSignature = (value: string) => `${value.slice(0, 6)}...${value.slice(-6)}`

const explorerTx = (signature: string) => `https://explorer.solana.com/tx/${signature}?cluster=devnet`

const outcomeLabel = (state: InitializedPoolState, outcome: ProgramOutcome | number) => {
  if (outcome === ProgramOutcome.Home) return `${state.pool.home} Win`
  if (outcome === ProgramOutcome.Away) return `${state.pool.away} Win`
  if (outcome === ProgramOutcome.Draw) return 'Draw'
  return 'Pending'
}

const outcomeTotal = (state: InitializedPoolState, outcome: ProgramOutcome | number) => {
  if (outcome === ProgramOutcome.Home) return state.onChainPool.outcomeTotals[0]
  if (outcome === ProgramOutcome.Away) return state.onChainPool.outcomeTotals[2]
  if (outcome === ProgramOutcome.Draw) return state.onChainPool.outcomeTotals[1]
  return 0n
}

const fixtureIdOf = (state: InitializedPoolState) => {
  const fixtureId = state.fixtureId ?? state.pool.fixtureId
  if (fixtureId === undefined) throw new Error('Initialized pool is missing a fixture id.')
  return fixtureId
}

const readyPools = computed(() =>
  // Both gates matter: TxLINE must report final and the on-chain pool must still be open.
  initializedPoolStates.value
    .filter((state) =>
      state.pool.status === 'Ready to Settle'
      && state.onChainPool.status === ProgramPoolStatus.Open
      && !hiddenResolvedPoolIds.value.has(state.pool.id),
    )
    .sort((left, right) => (left.pool.startsAt ?? 0) - (right.pool.startsAt ?? 0)),
)

const settledPools = computed(() =>
  initializedPoolStates.value
    .filter((state) => state.onChainPool.status === ProgramPoolStatus.Resolved || state.onChainPool.status === ProgramPoolStatus.Swept),
)

const indexedUpdatedAtByFixture = computed(() =>
  new Map(indexedPools.value.map((pool) => [pool.fixture_id, pool.settled_at ?? 0])),
)

const settlementRowFromPool = (
  state: InitializedPoolState,
  pool: PoolAccount,
  settledAt: number,
): SettlementRow => {
  const winningPool =
    pool.winningOutcome === ProgramOutcome.Home
      ? pool.outcomeTotals[0]
      : pool.winningOutcome === ProgramOutcome.Away
        ? pool.outcomeTotals[2]
        : pool.outcomeTotals[1]

  return {
      id: state.pool.id,
      match: `${state.pool.home} vs ${state.pool.away}`,
      finalScore: `${pool.finalHomeScore} - ${pool.finalAwayScore}`,
      proofHash: `fixture:${state.fixtureId}:resolved`,
      totalPool: formatRawUsdc(pool.netPayoutPool + pool.feeAmount),
      winningPool: formatRawUsdc(winningPool),
      winners: state.pool.participants,
      verifiedWinner: outcomeLabel(state, pool.winningOutcome),
      settledAgo: 'On-chain',
      amount: formatRawUsdc(pool.netPayoutPool),
      settledAt,
      matchAt: state.pool.startsAt ?? 0,
  }
}

const settlementRows = computed<SettlementRow[]>(() => {
  const indexedRows = settledPools.value.map((state) => settlementRowFromPool(
    state,
    state.onChainPool,
    indexedUpdatedAtByFixture.value.get(String(state.fixtureId)) ?? 0,
  ))
  const indexedIds = new Set(indexedRows.map((row) => row.id))

  return [
    ...optimisticSettlementRows.value.filter((row) => !indexedIds.has(row.id)),
    ...indexedRows,
  ].sort((left, right) => (right.settledAt - left.settledAt) || (right.matchAt - left.matchAt))
})

const optimisticSettlementRow = (
  state: InitializedPoolState,
  finalHomeScore: number,
  finalAwayScore: number,
): SettlementRow => {
  const winner =
    finalHomeScore > finalAwayScore
      ? ProgramOutcome.Home
      : finalAwayScore > finalHomeScore
        ? ProgramOutcome.Away
        : ProgramOutcome.Draw
  const winningPool = outcomeTotal(state, winner)
  const fee = winningPool === 0n || state.onChainPool.totalLocked === 0n
    ? 0n
    : (state.vaultAmountRaw * BigInt(state.onChainPool.feeBps || DEFAULT_PLATFORM_FEE_BPS)) / 10_000n
  const netPayoutPool = state.vaultAmountRaw > fee ? state.vaultAmountRaw - fee : 0n

  return {
    id: state.pool.id,
    match: `${state.pool.home} vs ${state.pool.away}`,
    finalScore: `${finalHomeScore} - ${finalAwayScore}`,
    proofHash: `fixture:${state.fixtureId}:resolved`,
    totalPool: formatRawUsdc(state.vaultAmountRaw),
    winningPool: formatRawUsdc(winningPool),
    winners: state.pool.participants,
    verifiedWinner: outcomeLabel(state, winner),
    settledAgo: 'Just now',
    amount: formatRawUsdc(netPayoutPool),
    settledAt: Date.now(),
    matchAt: state.pool.startsAt ?? 0,
  }
}

const payoutPreview = (state: InitializedPoolState) => {
  const [homeRaw, awayRaw] = state.pool.score.split('-').map((part) => Number(part.trim()))
  const homeScore = Number.isFinite(homeRaw) ? homeRaw : 0
  const awayScore = Number.isFinite(awayRaw) ? awayRaw : 0
  const winner =
    homeScore > awayScore
      ? ProgramOutcome.Home
      : awayScore > homeScore
        ? ProgramOutcome.Away
        : ProgramOutcome.Draw
  const winningPool = outcomeTotal(state, winner)
  const fee = winningPool === 0n || state.onChainPool.totalLocked === 0n
    ? 0n
    : (state.vaultAmountRaw * BigInt(state.onChainPool.feeBps || DEFAULT_PLATFORM_FEE_BPS)) / 10_000n
  const payoutPool = state.vaultAmountRaw > fee ? state.vaultAmountRaw - fee : 0n
  const rate = winningPool === 0n ? 0 : Number(payoutPool) / Number(winningPool)

  return { homeScore, awayScore, winner, winningPool, fee, payoutPool, rate }
}

const setResolveState = (poolId: string, patch: ResolveUiState) => {
  resolveState.value = {
    ...resolveState.value,
    [poolId]: {
      ...resolveState.value[poolId],
      ...patch,
    },
  }
}

const dismissToast = (toastId: number) => {
  successToasts.value = successToasts.value.filter((toast) => toast.id !== toastId)
}

const showSuccessToast = (state: InitializedPoolState, signature: string) => {
  const toast = {
    id: nextToastId += 1,
    match: `${state.pool.home} vs ${state.pool.away}`,
    signature,
  }
  successToasts.value = [...successToasts.value, toast]
  globalThis.setTimeout(() => dismissToast(toast.id), 6_000)
}

const errorMessage = (caught: unknown) => {
  if (caught instanceof Error && caught.message) return caught.message
  if (caught && typeof caught === 'object') {
    const record = caught as Record<string, unknown>
    if (typeof record.message === 'string' && record.message) return record.message
    if (typeof record.error === 'string' && record.error) return record.error
    if (record.cause instanceof Error && record.cause.message) return record.cause.message
  }
  return 'resolve_pool transaction failed.'
}

const resolveMarket = async (state: InitializedPoolState) => {
  const resolver = connectedWallet.value
  if (!resolver) {
    setResolveState(state.pool.id, { error: 'Connect a wallet to resolve this market.' })
    return
  }
  if (!config.value) {
    await refreshConfig()
  }
  if (!config.value) {
    setResolveState(state.pool.id, { error: 'TxPools config is not loaded yet.' })
    return
  }

  setResolveState(state.pool.id, { loading: true, error: undefined, signature: undefined })

  try {
    const client = new TxLineClient(txLineConfig)
    const fixtureId = fixtureIdOf(state)
    const proof = await getResolveProofInputs(client, fixtureId)
    const feeRecipientToken = getAssociatedTokenAddressSync(
      TXPOOLS_USDC_MINT,
      config.value.feeRecipient,
      false,
      TOKEN_PROGRAM_ID,
    )
    // Two validate_stat CPIs are compute-heavy, so resolution explicitly raises
    // the transaction limit while leaving the program logic unchanged.
    const instructions = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    ]
    const feeRecipientTokenInfo = await txPoolsClient.connection.getAccountInfo(feeRecipientToken, 'confirmed')
    if (!feeRecipientTokenInfo) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          resolver,
          feeRecipientToken,
          config.value.feeRecipient,
          TXPOOLS_USDC_MINT,
          TOKEN_PROGRAM_ID,
        ),
      )
    }
    instructions.push(
      resolvePoolInstruction({
        resolver,
        fixtureId,
        feeRecipientToken,
        finalHomeScore: proof.finalHomeScore,
        finalAwayScore: proof.finalAwayScore,
        homeValidateStatData: proof.homeValidateStatData,
        awayValidateStatData: proof.awayValidateStatData,
        epochDay: proof.epochDay,
      }),
    )

    const {
      context: { slot: minContextSlot },
      value: { blockhash, lastValidBlockHeight },
    } = await txPoolsTransactionConnection.getLatestBlockhashAndContext('confirmed')
    const transaction = new Transaction({
      feePayer: resolver,
      recentBlockhash: blockhash,
    }).add(...instructions)
    const signature = await wallet.sendTransaction(transaction, txPoolsTransactionConnection, { minContextSlot })
    await confirmSubmittedTransaction({
      connection: txPoolsTransactionConnection,
      signature,
      blockhash,
      lastValidBlockHeight,
      isApplied: async () => {
        const pool = await txPoolsClient.fetchPool(fixtureId)
        return pool?.status === ProgramPoolStatus.Resolved || pool?.status === ProgramPoolStatus.Swept
      },
    })
    setResolveState(state.pool.id, { loading: false, signature, proofSeq: proof.seq })
    // Reflect success immediately; the next indexer poll replaces this row with
    // authoritative on-chain values without requiring a page refresh.
    hiddenResolvedPoolIds.value = new Set([...hiddenResolvedPoolIds.value, state.pool.id])
    optimisticSettlementRows.value = [
      optimisticSettlementRow(state, proof.finalHomeScore, proof.finalAwayScore),
      ...optimisticSettlementRows.value.filter((row) => row.id !== state.pool.id),
    ]
    showSuccessToast(state, signature)
    await refreshInitializedPools()
  } catch (caught) {
    setResolveState(state.pool.id, {
      loading: false,
      error: errorMessage(caught),
    })
  }
}
</script>

<template>
  <div class="space-y-10">
    <div
      class="pointer-events-none fixed right-4 top-20 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-3"
      aria-live="polite"
    >
      <TransitionGroup
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="translate-x-4 opacity-0"
        leave-active-class="transition duration-150 ease-in"
        leave-to-class="translate-x-4 opacity-0"
      >
        <div
          v-for="toast in successToasts"
          :key="toast.id"
          class="pointer-events-auto rounded-xl border border-tertiary/35 bg-[#071711]/95 p-4 shadow-2xl backdrop-blur"
        >
          <div class="flex items-start gap-3">
            <CheckCircle2 class="mt-0.5 h-5 w-5 shrink-0 text-tertiary" />
            <div class="min-w-0 flex-1">
              <div class="font-bold text-white">Transaction successful</div>
              <div class="mt-1 truncate text-sm text-muted">{{ toast.match }} is settled.</div>
              <a
                class="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-primary"
                :href="explorerTx(toast.signature)"
                target="_blank"
                rel="noreferrer"
              >
                View transaction
                <ExternalLink class="h-3.5 w-3.5" />
              </a>
            </div>
            <button
              class="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted transition hover:bg-white/10 hover:text-white"
              type="button"
              title="Dismiss notification"
              @click="dismissToast(toast.id)"
            >
              <X class="h-4 w-4" />
            </button>
          </div>
        </div>
      </TransitionGroup>
    </div>

    <header class="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
      <div>
        <h1 class="text-4xl font-bold text-white">Permissionless Settlement</h1>
        <p class="mt-3 max-w-3xl text-muted">
          Resolve finalized match pools with TxLINE score proofs, then let winning users claim USDC payouts.
        </p>
      </div>
      <button
        class="inline-flex items-center gap-2 rounded-xl border border-secondary/25 bg-secondary/10 px-4 py-2 text-sm font-bold text-secondary transition hover:bg-secondary/15 disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="onChainLoading"
        type="button"
        @click="refreshInitializedPools()"
      >
        <RefreshCw class="h-4 w-4" :class="onChainLoading ? 'animate-spin' : ''" />
        Refresh Pools
      </button>
    </header>

    <div v-if="onChainError" class="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold text-red-200">
      {{ onChainError }}
    </div>
    <div v-if="indexerError" class="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm font-semibold text-amber-100">
      Indexer unavailable: {{ indexerError }}
    </div>

    <section class="grid gap-4 md:grid-cols-3">
      <div class="rounded-2xl border border-outline/25 bg-surface-low p-5 text-center">
        <div class="label-caps text-muted">Ready to resolve</div>
        <div class="mt-2 font-mono text-3xl font-bold text-tertiary">{{ readyPools.length }}</div>
      </div>
      <div class="rounded-2xl border border-outline/25 bg-surface-low p-5 text-center">
        <div class="label-caps text-muted">Settled on-chain</div>
        <div class="mt-2 font-mono text-3xl font-bold text-primary">{{ settledPools.length }}</div>
      </div>
      <div class="rounded-2xl border border-outline/25 bg-surface-low p-5 text-center">
        <div class="label-caps text-muted">Indexed pools</div>
        <div class="mt-2 font-mono text-3xl font-bold text-white">{{ indexedPools.length }}</div>
      </div>
    </section>

    <section>
      <div class="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 class="text-2xl font-bold text-white">Ready for Settlement</h2>
          <p class="mt-2 max-w-3xl text-sm leading-6 text-muted">
            These pools are initialized on-chain, final in TxLINE, and still unresolved in the TxPools program.
          </p>
        </div>
        <WalletMultiButton v-if="!connectedWallet" dark />
      </div>

      <div v-if="readyPools.length" class="grid gap-6 xl:grid-cols-2">
        <article v-for="state in readyPools" :key="state.pool.id" class="glass-card rounded-2xl p-6">
          <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <StatusBadge status="TxLINE Proof Available" />
              <h3 class="mt-4 text-2xl font-bold text-white">{{ state.pool.home }} vs {{ state.pool.away }}</h3>
              <p class="mt-1 font-mono text-lg text-muted">Final score {{ state.pool.score }}</p>
            </div>
            <div class="grid h-14 w-14 place-items-center rounded-2xl bg-tertiary/10 text-tertiary">
              <ShieldCheck class="h-7 w-7" />
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <div class="rounded-xl bg-surface-low p-4 text-center">
              <div class="label-caps text-muted">Fixture ID</div>
              <div class="mt-1 font-mono font-bold text-primary">{{ state.fixtureId }}</div>
            </div>
            <div class="rounded-xl bg-surface-low p-4 text-center">
              <div class="label-caps text-muted">Verified winner</div>
              <div class="mt-1 font-bold text-tertiary">{{ outcomeLabel(state, payoutPreview(state).winner) }}</div>
            </div>
            <div class="rounded-xl bg-surface-low p-4 text-center">
              <div class="label-caps text-muted">Gross pool</div>
              <div class="mt-1 font-mono font-bold text-white">{{ formatRawUsdc(state.vaultAmountRaw) }}</div>
            </div>
            <div class="rounded-xl bg-surface-low p-4 text-center">
              <div class="label-caps text-muted">Winning pool</div>
              <div class="mt-1 font-mono font-bold text-white">{{ formatRawUsdc(payoutPreview(state).winningPool) }}</div>
            </div>
            <div class="rounded-xl bg-surface-low p-4 text-center">
              <div class="label-caps text-muted">Platform fee</div>
              <div class="mt-1 font-mono font-bold text-secondary">{{ formatRawUsdc(payoutPreview(state).fee) }}</div>
            </div>
            <div class="rounded-xl bg-surface-low p-4 text-center">
              <div class="label-caps text-muted">Payout rate</div>
              <div class="mt-1 font-mono font-bold text-primary">{{ payoutPreview(state).rate.toFixed(2) }}x</div>
            </div>
          </div>

          <div class="mt-5 rounded-2xl border border-white/10 bg-surface-low p-4">
            <div class="label-caps text-muted">On-chain action</div>
            <p class="mt-2 text-sm leading-6 text-muted">
              Resolving builds TxLINE validate_stat proofs for home and away score, calls resolve_pool, stores the winning outcome, and moves the pool into claimable state.
            </p>
            <div v-if="resolveState[state.pool.id]?.proofSeq" class="mt-2 font-mono text-sm text-primary">
              TxLINE proof seq {{ resolveState[state.pool.id]?.proofSeq }}
            </div>
            <div v-if="resolveState[state.pool.id]?.error" class="mt-3 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
              {{ resolveState[state.pool.id]?.error }}
            </div>
            <a
              v-if="resolveState[state.pool.id]?.signature"
              class="mt-3 inline-flex items-center gap-2 text-sm font-bold text-primary"
              :href="explorerTx(resolveState[state.pool.id]?.signature as string)"
              target="_blank"
              rel="noreferrer"
            >
              {{ shortSignature(resolveState[state.pool.id]?.signature as string) }}
              <ExternalLink class="h-4 w-4" />
            </a>
          </div>

          <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
            <span class="text-sm font-semibold text-muted">
              {{ state.pool.participants }} indexed participants
            </span>
            <button
              class="inline-flex items-center gap-2 rounded-lg bg-tertiary px-5 py-2 font-bold text-[#003920] transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              :disabled="resolveState[state.pool.id]?.loading || !connectedWallet"
              @click="resolveMarket(state)"
            >
              <RefreshCw v-if="resolveState[state.pool.id]?.loading" class="h-4 w-4 animate-spin" />
              <CheckCircle2 v-else class="h-4 w-4" />
              {{ resolveState[state.pool.id]?.loading ? 'Resolving...' : 'Resolve Market' }}
            </button>
          </div>
        </article>
      </div>

      <div v-else class="glass-card rounded-2xl p-6 text-center text-muted">
        {{ onChainLoading ? 'Loading initialized pools...' : 'No initialized pool is ready for settlement right now.' }}
      </div>
    </section>

    <section>
      <h2 class="mb-5 text-2xl font-bold text-white">Recently Settled</h2>
      <SettlementTable :rows="settlementRows" />
    </section>
  </div>
</template>
