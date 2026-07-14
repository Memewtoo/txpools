<script setup lang="ts">
import { CheckCircle2, Clock, Radio, ShieldCheck } from '@lucide/vue'
import type { PoolStatus } from '../data/mockData'

const props = defineProps<{
  status: PoolStatus | 'TxLINE Proof Available' | 'Claimable' | 'Pending Settlement' | 'Won' | 'Lost' | 'Active'
}>()
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 label-caps"
    :class="{
      'border-tertiary/25 bg-tertiary/10 text-tertiary': props.status === 'Live' || props.status === 'TxLINE Proof Available' || props.status === 'Claimable' || props.status === 'Won',
      'border-primary/25 bg-primary/10 text-primary': props.status === 'Ready to Settle' || props.status === 'Pending Settlement',
      'border-cyan/30 bg-cyan/10 text-cyan': props.status === 'Upcoming' || props.status === 'Active',
      'border-emerald-300/25 bg-emerald-300/10 text-emerald-200': props.status === 'Settled',
      'border-rose-300/25 bg-rose-300/10 text-rose-200': props.status === 'Lost',
    }"
  >
    <Radio v-if="props.status === 'Live'" class="h-3 w-3 live-pulse" />
    <ShieldCheck v-else-if="props.status === 'Ready to Settle' || props.status === 'TxLINE Proof Available'" class="h-3 w-3" />
    <CheckCircle2 v-else-if="props.status === 'Settled' || props.status === 'Claimable' || props.status === 'Won'" class="h-3 w-3" />
    <Clock v-else class="h-3 w-3" />
    {{ props.status }}
  </span>
</template>
