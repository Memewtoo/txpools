<script setup lang="ts">
import type { Outcome } from '../data/mockData'

defineProps<{
  outcome: Outcome
  selected: boolean
  disabled?: boolean
  highlighted?: boolean
  highlightLabel?: string
}>()

defineEmits<{
  select: [key: string]
}>()

const formatMultiplier = (value: number) => value.toFixed(2).replace('.00', '')
</script>

<template>
  <button
    class="glass-card rounded-2xl p-6 text-left transition active:scale-[0.98]"
    :disabled="disabled"
    :class="[
      highlighted ? 'border-tertiary/50 bg-tertiary/10 ring-2 ring-tertiary/30 shadow-green' : selected && !disabled ? 'border-primary/70 bg-primary/10 ring-1 ring-primary/30' : 'hover:border-primary/40',
      disabled ? 'cursor-not-allowed opacity-60 hover:border-outline/30' : '',
    ]"
    @click="!disabled && $emit('select', outcome.key)"
  >
    <div class="mb-4 flex items-start justify-between gap-4">
      <span class="text-xl font-bold text-white">{{ outcome.label.replace(' Win', '') }}</span>
      <span class="font-mono text-xl font-bold text-secondary">{{ outcome.multiplier > 0 ? `x${formatMultiplier(outcome.multiplier)}` : '--' }}</span>
    </div>
    <div class="mb-2 h-2 overflow-hidden rounded-full bg-surface-bright">
      <div class="h-full rounded-full" :class="selected ? 'bg-primary' : 'bg-outline'" :style="{ width: `${outcome.share}%` }"></div>
    </div>
    <div class="flex justify-between label-caps text-muted">
      <span>{{ highlighted ? highlightLabel : outcome.share > 0 ? `${outcome.share}% Vol` : 'Pool empty' }}</span>
      <span>{{ outcome.amount }}</span>
    </div>
    <div class="mt-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
      Current rate before your lock
    </div>
  </button>
</template>
