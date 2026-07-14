<script setup lang="ts">
import type { Settlement } from '../data/mockData'

defineProps<{ rows: Settlement[] }>()
</script>

<template>
  <div class="glass-card overflow-hidden rounded-2xl">
    <div class="overflow-x-auto">
      <table class="w-full min-w-[640px] text-center">
        <thead class="border-b border-outline/25 bg-surface/70 label-caps text-muted">
          <tr>
            <th class="px-6 py-4">Match</th>
            <th class="px-6 py-4">Final score</th>
            <th class="px-6 py-4">TxLINE proof</th>
            <th class="px-6 py-4">Winners</th>
            <th class="px-6 py-4">Claimable</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-outline/20">
          <tr v-for="row in rows" :key="row.id" class="hover:bg-surface-high/40">
            <td class="px-6 py-5 font-bold text-white">{{ row.match }}</td>
            <td class="px-6 py-5 font-mono text-muted">{{ row.finalScore }}</td>
            <td class="px-6 py-5 font-mono text-primary">{{ row.proofHash }}</td>
            <td class="px-6 py-5 text-muted">{{ row.winners }}</td>
            <td class="px-6 py-5 font-mono text-secondary">{{ row.amount }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
