<script setup lang="ts">
import { computed } from 'vue'
import { ArrowRight, CheckCircle2, CircleDollarSign, Trophy, WalletCards } from '@lucide/vue'
import FlowStepCard from '../components/FlowStepCard.vue'
import HeroSection from '../components/HeroSection.vue'
import MatchPoolCard from '../components/MatchPoolCard.vue'
import { recentSettlements } from '../data/mockData'
import { useTxLinePools } from '../composables/useTxLinePools'

const { pools } = useTxLinePools()
const featured = computed(() => pools.value.slice(0, 3))
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
      <div class="grid gap-6 lg:grid-cols-3">
        <MatchPoolCard v-for="pool in featured" :key="pool.id" :pool="pool" />
      </div>
    </section>

    <section class="panel rounded-2xl p-6 sm:p-8">
      <div class="mb-8 flex items-center justify-between">
        <h2 class="text-2xl font-bold text-white">Latest Settlements</h2>
        <RouterLink to="/settlements" class="text-sm font-bold text-primary">View Ledger</RouterLink>
      </div>
      <div class="grid gap-4 lg:grid-cols-2">
        <div v-for="row in recentSettlements" :key="row.id" class="flex items-center justify-between gap-4 rounded-xl bg-surface-low p-5">
          <div class="flex items-center gap-4">
            <div class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-tertiary/10 text-tertiary">
              <CheckCircle2 class="h-5 w-5" />
            </div>
            <div>
              <div class="font-bold text-white">Match {{ row.match }}</div>
              <div class="font-mono text-sm font-bold text-muted">SIG: {{ row.proofHash }}</div>
            </div>
          </div>
          <div class="text-right">
            <div class="font-mono font-bold text-white">Verified</div>
            <div class="text-xs font-bold text-muted">{{ row.settledAgo }}</div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
