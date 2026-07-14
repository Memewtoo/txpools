<script setup lang="ts">
import { computed, ref } from 'vue'
import { RefreshCw } from '@lucide/vue'
import DataSourceBadge from '../components/DataSourceBadge.vue'
import MatchPoolCard from '../components/MatchPoolCard.vue'
import { type PoolStatus } from '../data/mockData'
import { useInitializedTxPools } from '../composables/useInitializedTxPools'

const tabs = ['All', 'Live', 'Upcoming', 'Ready to Settle', 'Settled'] as const
const active = ref<(typeof tabs)[number]>('All')
const {
  initializedPools,
  liveStatus,
  liveError,
  sourceLabel,
  onChainLoading,
  onChainError,
  indexerError,
  refreshInitializedPools,
} = useInitializedTxPools()
const visiblePools = computed(() => (
  active.value === 'All'
    ? initializedPools.value
    : initializedPools.value.filter((pool) => pool.status === (active.value as PoolStatus))
))
</script>

<template>
  <div>
    <header class="mb-10">
      <div class="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div>
          <h1 class="text-4xl font-bold text-white">World Cup Match Pools</h1>
          <p class="mt-3 max-w-2xl text-muted">Browse live and upcoming USDC prediction pools settled by TxLINE-verified results.</p>
          <div class="mt-4 flex flex-wrap items-center gap-3">
            <DataSourceBadge :label="sourceLabel" :status="liveStatus" :error="liveError" />
            <span class="rounded-full border border-tertiary/25 bg-tertiary/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-tertiary">
              {{ initializedPools.length }} on-chain pools
            </span>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <button
            class="inline-flex items-center gap-2 rounded-xl border border-secondary/25 bg-secondary/10 px-4 py-2 text-sm font-bold text-secondary transition hover:bg-secondary/15 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="onChainLoading"
            type="button"
            @click="refreshInitializedPools()"
          >
            <RefreshCw class="h-4 w-4" :class="onChainLoading ? 'animate-spin' : ''" />
            Refresh Chain
          </button>
          <div class="flex gap-2 overflow-x-auto rounded-2xl border border-outline/25 bg-surface-low p-1.5">
            <button
              v-for="tab in tabs"
              :key="tab"
              class="whitespace-nowrap rounded-xl px-5 py-2 label-caps transition"
              :class="active === tab ? 'bg-primary text-[#450086]' : 'text-muted hover:text-white'"
              @click="active = tab"
            >
              {{ tab }}
            </button>
          </div>
        </div>
      </div>
    </header>

    <div v-if="onChainError" class="mb-6 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold text-red-200">
      {{ onChainError }}
    </div>
    <div v-if="indexerError" class="mb-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm font-semibold text-amber-100">
      Indexed participant counts unavailable: {{ indexerError }}
    </div>

    <div v-if="visiblePools.length" class="grid gap-6 lg:grid-cols-2">
      <MatchPoolCard v-for="pool in visiblePools" :key="pool.id" :pool="pool" />
    </div>
    <div v-else class="glass-card rounded-2xl p-8 text-center">
      <h2 class="text-2xl font-bold text-white">
        {{ onChainLoading ? 'Checking On-Chain Pools' : 'No Initialized Pools Found' }}
      </h2>
      <p class="mx-auto mt-3 max-w-2xl text-muted">
        {{ onChainLoading
          ? 'TxPools is reading pool PDAs for the current TxLINE fixtures.'
          : 'Initialize a fixture from the admin page first. Only pools with an on-chain TxPools PDA appear here.' }}
      </p>
    </div>
  </div>
</template>
