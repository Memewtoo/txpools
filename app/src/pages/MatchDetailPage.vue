<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { createAssociatedTokenAccountInstruction } from '@solana/spl-token'
import { Transaction } from '@solana/web3.js'
import { useWallet } from 'solana-wallets-vue'
import { Clock3, Users, WalletCards } from '@lucide/vue'
import LockUSDCPanel from '../components/LockUSDCPanel.vue'
import OutcomeCard from '../components/OutcomeCard.vue'
import PoolStatsCard from '../components/PoolStatsCard.vue'
import StatusBadge from '../components/StatusBadge.vue'
import TeamBadge from '../components/TeamBadge.vue'
import { pools as mockPools, type MatchPool, type OutcomeKey, type PoolStatus } from '../data/mockData'
import { useInitializedTxPools } from '../composables/useInitializedTxPools'
import {
  BONUS_POOL_AMOUNT_RAW,
  confirmSubmittedTransaction,
  DEFAULT_PLATFORM_FEE_BPS,
  ProgramOutcome,
  TXPOOLS_USDC_MINT,
  fetchIndexedPool,
  findPoolPda,
  getUserUsdcAccount,
  lockPredictionInstruction,
  programToOutcome,
  rawToUsdc,
  txPoolsClient,
  txPoolsTransactionConnection,
  usdcToRaw,
  type IndexedPool,
} from '../services/txpools'

const route = useRoute()
const wallet = useWallet()
const { initializedPools, settlementPreviews, refreshInitializedPoolFromRpc } = useInitializedTxPools()
const fallbackPool = ref<MatchPool>()
const pool = computed(() =>
  initializedPools.value.find((item) => item.id === String(route.params.id))
  ?? mockPools.find((item) => item.id === String(route.params.id))
  ?? fallbackPool.value,
)
const selectedKey = ref<OutcomeKey>('home')
const selectedOutcome = computed(() => pool.value?.outcomes.find((outcome) => outcome.key === selectedKey.value))
const settlementPreview = computed(() => pool.value ? settlementPreviews.value.find((preview) => preview.poolId === pool.value?.id) : undefined)
const now = ref(Date.now())
const usdcBalanceRaw = ref<bigint>()
const lockSending = ref(false)
const lockError = ref<string>()
const lockSignature = ref<string>()
const fallbackError = ref<string>()
let timer: number | undefined
let poolRefreshTimer: number | undefined
let poolSubscriptionId: number | undefined
let poolSubscriptionGeneration = 0
let poolRefreshPending = false

const routeFixtureId = computed(() => {
  const id = String(route.params.id)
  const match = id.match(/^txline-(\d+)$/)
  return match ? Number(match[1]) : undefined
})

const formatRawUsdc = (amountRaw: bigint) =>
  `${rawToUsdc(amountRaw).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`

const indexedOutcomeTotal = (indexedPool: IndexedPool, outcome: ProgramOutcome) => {
  if (outcome === ProgramOutcome.Home) return BigInt(indexedPool.outcome_home)
  if (outcome === ProgramOutcome.Away) return BigInt(indexedPool.outcome_away)
  return BigInt(indexedPool.outcome_draw)
}

const currentMultiplier = (indexedPool: IndexedPool, outcomeTotal: bigint) => {
  // This is a projection from current vault state; resolution stores the final
  // net payout pool used by claim_winnings.
  if (outcomeTotal === 0n) return 0
  const vaultAmount = BigInt(indexedPool.vault_amount)
  const totalLocked = BigInt(indexedPool.total_locked)
  const feeBps = BigInt(indexedPool.fee_bps || DEFAULT_PLATFORM_FEE_BPS)
  const fee = totalLocked === 0n ? 0n : (vaultAmount * feeBps) / 10_000n
  const payoutPool = vaultAmount > fee ? vaultAmount - fee : 0n
  return Number(payoutPool) / Number(outcomeTotal)
}

const indexedPoolToMatchPool = (indexedPool: IndexedPool): MatchPool => {
  const fixtureId = Number(indexedPool.fixture_id)
  const vaultAmount = BigInt(indexedPool.vault_amount)
  const totalLocked = BigInt(indexedPool.total_locked)
  const bonusRaw = vaultAmount >= BONUS_POOL_AMOUNT_RAW
    ? BONUS_POOL_AMOUNT_RAW
    : vaultAmount > totalLocked
      ? vaultAmount - totalLocked
      : 0n
  const closeMillis = Number(indexedPool.close_ts) * 1000
  const status: PoolStatus = indexedPool.status === 1 || indexedPool.status === 2
    ? 'Settled'
    : Number.isFinite(closeMillis) && closeMillis > Date.now()
      ? 'Upcoming'
      : 'Live'
  const labels = [
    { outcome: ProgramOutcome.Home, key: 'home' as const, label: 'Home Win' },
    { outcome: ProgramOutcome.Draw, key: 'draw' as const, label: 'Draw' },
    { outcome: ProgramOutcome.Away, key: 'away' as const, label: 'Away Win' },
  ]

  return {
    id: `txline-${fixtureId}`,
    code: `TX-${fixtureId}`,
    fixtureId,
    initializedOnChain: true,
    poolAddress: indexedPool.pool_pubkey,
    vaultAddress: indexedPool.vault_pubkey,
    home: `Fixture ${fixtureId}`,
    away: 'TxPools',
    homeCode: 'TX',
    awayCode: 'US',
    score: indexedPool.status === 1 || indexedPool.status === 2
      ? `${indexedPool.final_home_score} - ${indexedPool.final_away_score}`
      : 'VS',
    minute: status === 'Upcoming' ? 'Scheduled' : status === 'Settled' ? 'Settled' : 'Closed',
    time: 'Indexed TxPools pool',
    predictionClosed: status !== 'Upcoming',
    closeLabel: status === 'Upcoming' ? 'Open until kickoff' : 'Prediction closed',
    status,
    totalPool: formatRawUsdc(vaultAmount),
    totalPoolRaw: indexedPool.vault_amount,
    totalLockedRaw: indexedPool.total_locked,
    userTotalLocked: formatRawUsdc(totalLocked),
    bonusPool: formatRawUsdc(bonusRaw),
    feeBps: indexedPool.fee_bps,
    participants: indexedPool.participants,
    txlineState: 'Indexed On-Chain Pool',
    winningOutcome: programToOutcome(indexedPool.winning_outcome),
    outcomes: labels.map(({ outcome, key, label }) => {
      const outcomeTotal = indexedOutcomeTotal(indexedPool, outcome)
      const share = totalLocked > 0n ? Math.round((Number(outcomeTotal) / Number(totalLocked)) * 100) : 0
      return {
        key,
        label,
        multiplier: currentMultiplier(indexedPool, outcomeTotal),
        share,
        amount: formatRawUsdc(outcomeTotal),
        amountRaw: outcomeTotal.toString(),
      }
    }),
  }
}

const refreshFallbackPool = async () => {
  fallbackPool.value = undefined
  fallbackError.value = undefined
  if (!routeFixtureId.value) return
  if (initializedPools.value.some((item) => item.id === String(route.params.id))) return

  try {
    const indexedPool = await fetchIndexedPool(routeFixtureId.value)
    fallbackPool.value = indexedPool ? indexedPoolToMatchPool(indexedPool) : undefined
  } catch (caught) {
    fallbackError.value = caught instanceof Error ? caught.message : 'Unable to load indexed pool fallback.'
  }
}

const predictionLocked = computed(() => !pool.value || pool.value.predictionClosed || pool.value.status !== 'Upcoming')
const predictionWindow = computed(() => {
  if (predictionLocked.value) return 'Closed'
  if (!pool.value?.startsAt) return 'Pending'
  const diff = Math.max(0, pool.value.startsAt - now.value)
  const totalSeconds = Math.floor(diff / 1000)
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m ${seconds}s`
})
const connectedWallet = computed(() => wallet.publicKey.value)
const usdcBalance = computed(() => {
  if (!connectedWallet.value) return 'Connect wallet'
  if (usdcBalanceRaw.value === undefined) return 'Checking...'
  return `${rawToUsdc(usdcBalanceRaw.value).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`
})

const refreshUsdcBalance = async () => {
  if (!connectedWallet.value) {
    usdcBalanceRaw.value = undefined
    return
  }

  try {
    const account = getUserUsdcAccount(connectedWallet.value)
    const balance = await txPoolsClient.connection.getTokenAccountBalance(account)
    usdcBalanceRaw.value = BigInt(balance.value.amount)
  } catch {
    usdcBalanceRaw.value = 0n
  }
}

const refreshDisplayedPoolRates = async () => {
  const fixtureId = routeFixtureId.value
  if (!fixtureId || poolRefreshPending) return

  poolRefreshPending = true
  try {
    await refreshInitializedPoolFromRpc(fixtureId)
  } catch {
    // The periodic refresh retries transient RPC failures without interrupting
    // an already-confirmed prediction flow.
  } finally {
    poolRefreshPending = false
  }
}

const stopPoolSubscription = async () => {
  poolSubscriptionGeneration += 1
  if (poolSubscriptionId === undefined) return
  const subscriptionId = poolSubscriptionId
  poolSubscriptionId = undefined
  await txPoolsTransactionConnection.removeAccountChangeListener(subscriptionId).catch(() => undefined)
}

const startPoolSubscription = async () => {
  await stopPoolSubscription()
  const fixtureId = routeFixtureId.value
  if (!fixtureId || !pool.value?.initializedOnChain || pool.value.status !== 'Upcoming') return

  const generation = poolSubscriptionGeneration
  const [poolAddress] = findPoolPda(fixtureId)
  const subscriptionId = txPoolsTransactionConnection.onAccountChange(
    poolAddress,
    () => {
      if (generation === poolSubscriptionGeneration) void refreshDisplayedPoolRates()
    },
    'confirmed',
  )

  if (generation === poolSubscriptionGeneration) {
    poolSubscriptionId = subscriptionId
  } else {
    await txPoolsTransactionConnection.removeAccountChangeListener(subscriptionId).catch(() => undefined)
  }
}

const sendLockPrediction = async (amount: number) => {
  lockError.value = undefined
  lockSignature.value = undefined

  if (!connectedWallet.value) {
    lockError.value = 'Connect a wallet before locking USDC.'
    return
  }
  if (!pool.value?.fixtureId) {
    lockError.value = 'This match is not linked to an initialized TxPools fixture.'
    return
  }
  if (!selectedOutcome.value) {
    lockError.value = 'Choose an outcome first.'
    return
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    lockError.value = 'Enter a positive USDC amount.'
    return
  }

  const amountRaw = usdcToRaw(amount)
  if (usdcBalanceRaw.value !== undefined && usdcBalanceRaw.value < amountRaw) {
    lockError.value = 'Insufficient devnet USDC balance for this prediction.'
    return
  }

  lockSending.value = true
  try {
    const fixtureId = pool.value.fixtureId
    const outcome = selectedOutcome.value.key
    // Repeated locks reuse the same (pool, user, outcome) PDA, so confirmation
    // can verify that its cumulative amount reached the expected value.
    const existingPosition = await txPoolsClient.fetchPosition(
      fixtureId,
      connectedWallet.value,
      outcome,
    )
    const expectedPositionAmount = (existingPosition?.amount ?? 0n) + amountRaw
    const userUsdcAccount = getUserUsdcAccount(connectedWallet.value)
    const {
      context: { slot: minContextSlot },
      value: { blockhash, lastValidBlockHeight },
    } = await txPoolsTransactionConnection.getLatestBlockhashAndContext('confirmed')
    const transaction = new Transaction({
      feePayer: connectedWallet.value,
      recentBlockhash: blockhash,
    })

    // Create the user's devnet USDC ATA in the same transaction when needed.
    const userUsdcInfo = await txPoolsClient.connection.getAccountInfo(userUsdcAccount, 'confirmed')
    if (!userUsdcInfo) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          connectedWallet.value,
          userUsdcAccount,
          connectedWallet.value,
          TXPOOLS_USDC_MINT,
        ),
      )
    }

    transaction.add(
      lockPredictionInstruction({
        user: connectedWallet.value,
        fixtureId,
        outcome,
        amountRaw,
        userUsdcAccount,
      }),
    )

    const signature = await wallet.sendTransaction(transaction, txPoolsTransactionConnection, { minContextSlot })
    await confirmSubmittedTransaction({
      connection: txPoolsTransactionConnection,
      signature,
      blockhash,
      lastValidBlockHeight,
      isApplied: async () => {
        const position = await txPoolsClient.fetchPosition(
          fixtureId,
          connectedWallet.value as NonNullable<typeof connectedWallet.value>,
          outcome,
        )
        return Boolean(position && position.amount >= expectedPositionAmount)
      },
    })
    lockSignature.value = signature
    // Read the confirmed pool directly so rates update before the indexer's
    // next polling cycle.
    await Promise.all([refreshUsdcBalance(), refreshDisplayedPoolRates()])
  } catch (caught) {
    lockError.value = caught instanceof Error ? caught.message : 'lock_prediction transaction failed.'
  } finally {
    lockSending.value = false
  }
}

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = Date.now()
  }, 1000)
  // Account subscriptions update the cards immediately; polling covers a
  // dropped devnet WebSocket without putting sustained load on the RPC.
  poolRefreshTimer = window.setInterval(() => {
    if (pool.value?.initializedOnChain && pool.value.status === 'Upcoming') {
      void refreshDisplayedPoolRates()
    }
  }, 10_000)
  void refreshUsdcBalance()
})

onUnmounted(() => {
  if (timer) window.clearInterval(timer)
  if (poolRefreshTimer) window.clearInterval(poolRefreshTimer)
  void stopPoolSubscription()
})

watch(connectedWallet, () => {
  void refreshUsdcBalance()
})

watch(
  [routeFixtureId, () => pool.value?.initializedOnChain, () => pool.value?.status],
  () => {
    void startPoolSubscription()
  },
  { immediate: true },
)

watch(
  [() => route.params.id, initializedPools],
  () => {
    void refreshFallbackPool()
  },
  { immediate: true },
)
</script>

<template>
  <div v-if="pool" class="space-y-6">
    <section class="panel overflow-hidden rounded-2xl p-5 sm:p-6">
      <div class="mb-5 flex flex-wrap items-center justify-between gap-4">
        <StatusBadge :status="pool.status" />
      </div>
      <div class="grid items-center gap-5 lg:grid-cols-[1fr_140px_1fr]">
        <TeamBadge :code="pool.homeCode" :name="pool.home" size="md" />
        <div class="text-center">
          <div class="font-mono text-4xl font-extrabold text-white">{{ pool.score }}</div>
          <div class="mt-2 label-caps text-tertiary">{{ pool.minute }}</div>
        </div>
        <TeamBadge :code="pool.awayCode" :name="pool.away" size="md" />
      </div>
    </section>

    <section class="grid gap-4 md:grid-cols-3">
      <PoolStatsCard :label="pool.initializedOnChain ? 'Gross Pool' : 'Total Locked'" :value="pool.totalPool" :icon="WalletCards" />
      <PoolStatsCard label="Participants" :value="pool.participants.toLocaleString()" :icon="Users" />
      <PoolStatsCard label="Prediction Window" :value="predictionWindow" :icon="Clock3" />
    </section>

    <section v-if="pool.initializedOnChain" class="grid gap-4 md:grid-cols-3">
      <PoolStatsCard label="User Locked" :value="pool.userTotalLocked ?? '0 USDC'" :icon="WalletCards" />
      <PoolStatsCard label="Platform Bonus" :value="pool.bonusPool ?? '0 USDC'" :icon="WalletCards" />
      <PoolStatsCard label="Fee BPS" :value="String(pool.feeBps ?? 0)" :icon="WalletCards" />
    </section>

    <section class="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div class="space-y-3">
        <OutcomeCard
          v-for="outcome in pool.outcomes"
          :key="outcome.key"
          :outcome="outcome"
          :selected="selectedKey === outcome.key"
          :disabled="predictionLocked"
          :highlighted="pool.winningOutcome === outcome.key || pool.leaderOutcome === outcome.key"
          :highlight-label="pool.winningOutcome === outcome.key ? 'Winning' : pool.leaderOutcome === outcome.key ? 'Leading' : undefined"
          @select="selectedKey = $event as OutcomeKey"
        />
      </div>
      <div class="space-y-4">
        <LockUSDCPanel
          :selected="selectedOutcome"
          :gross-pool-raw="pool.totalPoolRaw"
          :total-locked-raw="pool.totalLockedRaw"
          :fee-bps="pool.feeBps"
          :disabled="predictionLocked"
          :disabled-reason="pool.closeLabel"
          :balance="usdcBalance"
          :sending="lockSending"
          :signature="lockSignature"
          :error="lockError"
          @confirm="sendLockPrediction"
        />
        <aside v-if="settlementPreview" class="glass-card rounded-2xl p-5">
          <div class="mb-3 flex items-center justify-between gap-4">
            <h2 class="font-bold text-white">Settlement Preview</h2>
            <span class="label-caps" :class="settlementPreview.status === 'ready' ? 'text-tertiary' : 'text-muted'">{{ settlementPreview.status }}</span>
          </div>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between gap-4">
              <span class="text-muted">{{ settlementPreview.status === 'ready' ? 'Winner' : 'Current state' }}</span>
              <span class="font-bold text-white">{{ settlementPreview.verifiedWinner }}</span>
            </div>
            <div class="flex justify-between gap-4">
              <span class="text-muted">Proof</span>
              <span class="font-mono text-primary">{{ settlementPreview.proofHash }}</span>
            </div>
          </div>
          <p class="mt-4 text-sm leading-6 text-muted">{{ settlementPreview.explanation }}</p>
          <RouterLink
            v-if="settlementPreview.status === 'ready'"
            to="/settlements"
            class="mt-4 block rounded-xl bg-primary px-4 py-3 text-center font-bold text-[#450086] transition hover:brightness-110 active:scale-95"
          >
            Settle Pool
          </RouterLink>
        </aside>
      </div>
    </section>
  </div>
  <div v-else class="glass-card rounded-2xl p-8 text-center">
    <h1 class="text-2xl font-bold text-white">Loading Pool</h1>
    <p class="mx-auto mt-3 max-w-2xl text-muted">
      {{ fallbackError ?? 'TxPools is reading the initialized pool account for this match.' }}
    </p>
  </div>
</template>
