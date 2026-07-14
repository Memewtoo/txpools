<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
  title: string
  copy: string
  icon: Component
  tone: 'primary' | 'secondary' | 'tertiary' | 'purple'
}>()
</script>

<template>
  <article class="glass-card rounded-2xl p-8">
    <div
      class="mb-7 grid h-12 w-12 place-items-center rounded-xl"
      :class="{
        'bg-primary/15 text-primary': tone === 'primary',
        'bg-secondary/15 text-secondary': tone === 'secondary',
        'bg-tertiary/15 text-tertiary': tone === 'tertiary',
        'bg-primary-strong/20 text-primary': tone === 'purple',
      }"
    >
      <component :is="icon" class="h-6 w-6" />
    </div>
    <h3 class="mb-3 text-lg font-bold text-white">{{ title }}</h3>
    <p class="text-sm font-semibold leading-6 text-muted">{{ copy }}</p>
  </article>
</template>
