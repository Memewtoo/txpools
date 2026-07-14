<script setup lang="ts">
import { Lock, ShieldCheck } from '@lucide/vue'
import type { MatchPool } from '../data/mockData'
import StatusBadge from './StatusBadge.vue'
import TeamBadge from './TeamBadge.vue'

defineProps<{ pool: MatchPool }>()
</script>

<template>
  <article class="glass-card flex h-full flex-col overflow-hidden rounded-2xl">
    <div class="border-b border-outline/20 p-6">
      <div class="mb-6 flex items-start justify-between gap-4">
        <div class="space-y-2">
          <StatusBadge :status="pool.status" />
          <div class="font-mono text-xs font-semibold uppercase text-muted">{{ pool.time }}</div>
        </div>
        <div class="text-right">
          <div class="label-caps text-muted">{{ pool.initializedOnChain ? 'Gross Pool' : pool.status === 'Settled' ? 'Final Pool' : 'Total Pool' }}</div>
          <div class="font-mono font-bold text-white">{{ pool.totalPool }}</div>
          <div v-if="pool.initializedOnChain" class="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
            {{ pool.userTotalLocked }} user locked
          </div>
        </div>
      </div>

      <div class="mb-8 flex items-center justify-between gap-3">
        <TeamBadge :code="pool.homeCode" :name="pool.home" />
        <div class="min-w-24 text-center">
          <div class="font-mono text-3xl font-bold tracking-wide text-white">{{ pool.score }}</div>
          <div class="mt-1 label-caps text-muted">{{ pool.minute }}</div>
        </div>
        <TeamBadge :code="pool.awayCode" :name="pool.away" />
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div
          v-for="outcome in pool.outcomes"
          :key="outcome.key"
          class="rounded-xl border p-3 text-center"
          :class="pool.winningOutcome === outcome.key ? 'border-tertiary/50 bg-tertiary/10 text-tertiary ring-2 ring-tertiary/30 shadow-green' : pool.leaderOutcome === outcome.key ? 'border-primary/50 bg-primary/10 text-primary ring-1 ring-primary/30 shadow-glow' : 'border-outline/30 bg-surface-low text-muted'"
        >
          <div class="mb-1 label-caps">{{ outcome.label }}</div>
          <div class="font-mono text-lg font-bold text-primary">{{ outcome.multiplier > 0 ? `${outcome.multiplier.toFixed(2).replace('.00', '')}x` : '--' }}</div>
          <div class="mt-1 text-[10px]">{{ pool.winningOutcome === outcome.key ? 'Winning' : pool.leaderOutcome === outcome.key ? 'Leading' : outcome.share > 0 ? `${outcome.share}% Pool` : 'Pool empty' }}</div>
          <div v-if="outcome.multiplier > 0" class="mt-1 text-[9px] uppercase tracking-wide text-muted">Current rate</div>
        </div>
      </div>

      <div
        v-if="pool.initializedOnChain"
        class="mt-4 grid gap-3 rounded-xl border border-white/10 bg-surface-low p-3 text-center text-xs sm:grid-cols-2"
      >
        <div>
          <div class="label-caps text-muted">Platform bonus</div>
          <div class="mt-1 font-mono font-bold text-secondary">{{ pool.bonusPool }}</div>
        </div>
        <div>
          <div class="label-caps text-muted">Pool PDA</div>
          <div class="mt-1 truncate font-mono font-bold text-primary" :title="pool.poolAddress">{{ pool.poolAddress }}</div>
        </div>
      </div>
    </div>
    <div class="mt-auto flex items-center justify-between gap-4 bg-surface/45 p-4">
      <div
        class="flex items-center gap-2 font-mono text-[11px] font-bold uppercase"
        :class="{
          'text-tertiary': pool.status === 'Live' || pool.status === 'Settled',
          'text-cyan': pool.status === 'Upcoming',
          'text-primary': pool.status === 'Ready to Settle',
        }"
      >
        <Lock v-if="pool.status === 'Upcoming'" class="h-4 w-4" />
        <ShieldCheck v-else class="h-4 w-4" />
        {{ pool.txlineState }}
      </div>
      <RouterLink
        :to="`/pools/${pool.id}`"
        class="rounded-lg px-5 py-2 text-sm font-bold transition active:scale-95"
        :class="pool.status === 'Ready to Settle' ? 'border border-primary/30 bg-primary/10 text-primary' : pool.status === 'Upcoming' ? 'gradient-button text-white' : pool.status === 'Settled' ? 'border border-emerald-300/25 bg-emerald-300/10 text-emerald-200' : 'border border-tertiary/25 bg-tertiary/10 text-tertiary'"
      >
        {{ pool.status === 'Settled' ? 'View History' : pool.status === 'Upcoming' ? 'Join Pool' : 'View Pool' }}
      </RouterLink>
    </div>
  </article>
</template>
