<script setup lang="ts">
defineProps<{
  label: string
  status: 'mock' | 'connecting' | 'live' | 'error' | 'stream-error'
  error?: string
}>()
</script>

<template>
  <div
    class="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold"
    :class="{
      'border-tertiary/25 bg-tertiary/10 text-tertiary': status === 'live' || status === 'stream-error',
      'border-cyan/25 bg-cyan/10 text-cyan': status === 'connecting',
      'border-primary/25 bg-primary/10 text-primary': status === 'mock',
      'border-rose-300/25 bg-rose-300/10 text-rose-200': status === 'error',
    }"
    :title="error"
  >
    <span class="h-2 w-2 rounded-full" :class="status === 'live' ? 'bg-tertiary live-pulse' : status === 'stream-error' ? 'bg-tertiary' : status === 'error' ? 'bg-rose-300' : 'bg-current'"></span>
    {{ label }}
  </div>
</template>
