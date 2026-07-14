<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
  label: string
  value: string
  icon: Component
}>()
</script>

<template>
  <article class="glass-card flex items-center gap-4 rounded-xl p-4">
    <div class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
      <component :is="icon" class="h-5 w-5" />
    </div>
    <div class="min-w-0">
      <div class="font-mono text-xl font-bold text-white">{{ value }}</div>
      <div class="mt-1 label-caps text-muted">{{ label }}</div>
    </div>
  </article>
</template>
