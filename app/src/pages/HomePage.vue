<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ArrowRight, CheckCircle2, CircleDollarSign, Trophy, WalletCards } from '@lucide/vue'
import FlowStepCard from '../components/FlowStepCard.vue'
import HeroSection from '../components/HeroSection.vue'
import MatchPoolCard from '../components/MatchPoolCard.vue'
import { useInitializedTxPools } from '../composables/useInitializedTxPools'
import { PoolStatus as ProgramPoolStatus } from '../services/txpools'

const { initializedPoolStates, initializedPools, indexedPools, onChainLoading } = useInitializedTxPools()
const now = ref(Date.now())
let relativeTimeTimer: number | undefined

const featured = computed(() => {
  const statusOrder = { Upcoming: 0, Live: 1, 'Ready to Settle': 2, Settled: 3 }
  return initializedPools.value
    .filter((pool) => pool.status !== 'Settled')
    .sort((left, right) => (
      statusOrder[left.status] - statusOrder[right.status]
      || (left.startsAt ?? Number.MAX_SAFE_INTEGER) - (right.startsAt ?? Number.MAX_SAFE_INTEGER)
    ))
    .slice(0, 3)
})

const settledAtByFixture = computed(() => new Map(
  indexedPools.value.map((pool) => [pool.fixture_id, pool.settled_at ?? 0]),
))

const winnerLabel = (home: string, away: string, outcome: 'home' | 'draw' | 'away' | undefined) => {
  if (outcome === 'home') return `${home} Win`
  if (outcome === 'away') return `${away} Win`
  if (outcome === 'draw') return 'Draw'
  return 'Verified result'
}

const latestSettlements = computed(() => initializedPoolStates.value
  .filter((state) => (
    state.onChainPool.status === ProgramPoolStatus.Resolved
    || state.onChainPool.status === ProgramPoolStatus.Swept
  ))
  .map((state) => ({
    id: state.pool.id,
    fixtureId: state.fixtureId,
    match: `${state.pool.home} vs ${state.pool.away}`,
    finalScore: `${state.onChainPool.finalHomeScore} - ${state.onChainPool.finalAwayScore}`,
    winner: winnerLabel(state.pool.home, state.pool.away, state.pool.winningOutcome),
    settledAt: settledAtByFixture.value.get(String(state.fixtureId)) ?? 0,
    matchAt: state.pool.startsAt ?? 0,
  }))
  .sort((left, right) => (right.settledAt - left.settledAt) || (right.matchAt - left.matchAt))
  .slice(0, 4))

const relativeTime = (timestamp: number) => {
  if (!timestamp) return 'Settled on-chain'
  const elapsedMinutes = Math.max(0, Math.floor((now.value - timestamp) / 60_000))
  if (elapsedMinutes < 1) return 'Just now'
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`
  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) return `${elapsedHours}h ago`
  return `${Math.floor(elapsedHours / 24)}d ago`
}

onMounted(() => {
  relativeTimeTimer = window.setInterval(() => {
    now.value = Date.now()
  }, 60_000)
})

onUnmounted(() => {
  if (relativeTimeTimer) window.clearInterval(relativeTimeTimer)
})
</script>

<template>
  <div class="space-y-20">
    <HeroSection />

    <section class="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      <FlowStepCard title="Deposit USDC" copy="Select your prediction and commit USDC to the escrow pool." :icon="WalletCards" tone="primary" />
      <FlowStepCard title="Match Ends" copy="The final whistle blows and match statistics are finalized globally." :icon="Trophy" tone="secondary" />
      <FlowStepCard title="TxLINE Verifies" copy="Cryptographic data feed triggers the on-chain settlement." :icon="CheckCircle2" tone="tertiary" />
      <FlowStepCard title="Winners Claim" copy="Protocol distributes USDC automatically to verified winners." :icon="CircleDollarSign" tone="purple" />
    </section>

    <section>
      <div class="mb-8 flex items-end justify-between gap-4">
        <div>
          <h2 class="text-3xl font-bold text-white">Featured Matches</h2>
          <p class="mt-1 font-semibold text-muted">Active World Cup prediction pools</p>
        </div>
        <RouterLink to="/pools" class="hidden items-center gap-2 font-bold text-primary sm:inline-flex">
          View All <ArrowRight class="h-4 w-4" />
        </RouterLink>
      </div>
      <div v-if="featured.length" class="grid gap-6 lg:grid-cols-3">
        <MatchPoolCard v-for="pool in featured" :key="pool.id" :pool="pool" />
      </div>
      <div v-else class="glass-card rounded-2xl p-8 text-center">
        <h3 class="text-xl font-bold text-white">{{ onChainLoading ? 'Loading Initialized Pools' : 'No Active Pools' }}</h3>
        <p class="mt-2 text-sm text-muted">
          {{ onChainLoading ? 'Reading current TxPools accounts from the indexer.' : 'There are no initialized pools currently open or awaiting settlement.' }}
        </p>
      </div>
    </section>

    <section class="panel rounded-2xl p-6 sm:p-8">
      <div class="mb-8 flex items-center justify-between">
        <h2 class="text-2xl font-bold text-white">Latest Settlements</h2>
        <RouterLink to="/settlements" class="text-sm font-bold text-primary">View Ledger</RouterLink>
      </div>
      <div v-if="latestSettlements.length" class="grid gap-4 lg:grid-cols-2">
        <div v-for="row in latestSettlements" :key="row.id" class="flex items-center justify-between gap-4 rounded-xl bg-surface-low p-5">
          <div class="flex items-center gap-4">
            <div class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-tertiary/10 text-tertiary">
              <CheckCircle2 class="h-5 w-5" />
            </div>
            <div>
              <div class="font-bold text-white">Match {{ row.match }}</div>
              <div class="font-mono text-sm font-bold text-muted">Fixture {{ row.fixtureId }} · Final {{ row.finalScore }}</div>
            </div>
          </div>
          <div class="text-right">
            <div class="font-mono font-bold text-white">{{ row.winner }}</div>
            <div class="text-xs font-bold text-muted">{{ relativeTime(row.settledAt) }}</div>
          </div>
        </div>
      </div>
      <div v-else class="rounded-xl bg-surface-low p-6 text-center text-sm font-semibold text-muted">
        {{ onChainLoading ? 'Loading on-chain settlement history...' : 'No pools have been settled on-chain yet.' }}
      </div>
    </section>
  </div>
</template>
