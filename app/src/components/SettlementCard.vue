<script setup lang="ts">
import { ShieldCheck } from '@lucide/vue'
import type { Settlement } from '../data/mockData'
import StatusBadge from './StatusBadge.vue'

defineProps<{ settlement: Settlement }>()
</script>

<template>
  <article class="glass-card rounded-2xl p-6">
    <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <StatusBadge status="TxLINE Proof Available" />
        <h3 class="mt-4 text-2xl font-bold text-white">{{ settlement.match }}</h3>
        <p class="mt-1 font-mono text-lg text-muted">Final score {{ settlement.finalScore }}</p>
      </div>
      <div class="grid h-14 w-14 place-items-center rounded-2xl bg-tertiary/10 text-tertiary">
        <ShieldCheck class="h-7 w-7" />
      </div>
    </div>
    <div class="grid gap-3 sm:grid-cols-2">
      <div class="rounded-xl bg-surface-low p-4">
        <div class="label-caps text-muted">TxLINE proof hash</div>
        <div class="mt-1 font-mono font-bold text-primary">{{ settlement.proofHash }}</div>
      </div>
      <div class="rounded-xl bg-surface-low p-4">
        <div class="label-caps text-muted">Verified winner</div>
        <div class="mt-1 font-bold text-tertiary">{{ settlement.verifiedWinner }}</div>
      </div>
      <div class="rounded-xl bg-surface-low p-4">
        <div class="label-caps text-muted">Total pool</div>
        <div class="mt-1 font-mono font-bold text-white">{{ settlement.totalPool }}</div>
      </div>
      <div class="rounded-xl bg-surface-low p-4">
        <div class="label-caps text-muted">Winning pool</div>
        <div class="mt-1 font-mono font-bold text-white">{{ settlement.winningPool }}</div>
      </div>
    </div>
    <div class="mt-5 flex flex-wrap items-center justify-between gap-4">
      <span class="text-sm font-semibold text-muted">{{ settlement.winners }} winners eligible to claim winnings</span>
      <button class="rounded-lg bg-tertiary px-5 py-2 font-bold text-[#003920] transition active:scale-95">Resolve Market</button>
    </div>
  </article>
</template>
