<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { Position } from '../data/mockData'
import StatusBadge from './StatusBadge.vue'

defineProps<{ rows: Position[]; claimingIds?: string[] }>()
const emit = defineEmits<{ claim: [positionId: string] }>()
</script>

<template>
  <div class="glass-card overflow-hidden rounded-2xl">
    <div class="overflow-x-auto">
      <table class="w-full min-w-[820px] text-center">
        <thead class="border-b border-outline/25 bg-surface/70 label-caps text-muted">
          <tr>
            <th class="px-6 py-4">Match/Event</th>
            <th class="px-6 py-4">Prediction</th>
            <th class="px-6 py-4">Amount</th>
            <th class="px-6 py-4">Status</th>
            <th class="px-6 py-4">Estimated Payout</th>
            <th class="px-6 py-4">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-outline/20">
          <tr v-for="row in rows" :key="row.id" class="hover:bg-surface-high/40">
            <td class="px-6 py-5 font-bold text-white">{{ row.match }}</td>
            <td class="px-6 py-5 text-muted">{{ row.prediction }}</td>
            <td class="px-6 py-5 font-mono text-white">{{ row.amount }}</td>
            <td class="px-6 py-5"><div class="flex justify-center"><StatusBadge :status="row.status" /></div></td>
            <td class="px-6 py-5 font-mono text-secondary">{{ row.estimatedPayout }}</td>
            <td class="px-6 py-5">
              <RouterLink
                v-if="row.action === 'View Pool' && row.poolId"
                :to="`/pools/${row.poolId}`"
                class="inline-flex rounded-lg border border-outline/35 bg-surface-high px-4 py-2 text-sm font-bold text-muted transition hover:border-primary/40 hover:text-primary"
              >
                View Pool
              </RouterLink>
              <button
                v-else
                class="rounded-lg px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60"
                :class="row.status === 'Claimable' ? 'bg-tertiary text-[#003920]' : 'border border-outline/35 bg-surface-high text-muted'"
                :disabled="row.status !== 'Claimable' || claimingIds?.includes(row.id)"
                type="button"
                @click="emit('claim', row.id)"
              >
                {{ claimingIds?.includes(row.id) ? 'Claiming...' : row.action }}
              </button>
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td colspan="6" class="px-6 py-10 text-center font-semibold text-muted">No positions in this category.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
