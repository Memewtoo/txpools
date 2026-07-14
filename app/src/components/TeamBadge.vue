<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  code: string
  name: string
  size?: 'sm' | 'md' | 'lg'
}>()

const flagCodes: Record<string, string> = {
  AR: 'ar',
  BE: 'be',
  BR: 'br',
  CH: 'ch',
  CO: 'co',
  DE: 'de',
  EG: 'eg',
  EN: 'gb-eng',
  ES: 'es',
  FR: 'fr',
  HR: 'hr',
  JP: 'jp',
  MA: 'ma',
  MX: 'mx',
  NL: 'nl',
  NO: 'no',
  PT: 'pt',
  US: 'us',
}

const flagUrl = computed(() => `https://flagcdn.com/${flagCodes[props.code] ?? props.code.toLowerCase()}.svg`)
</script>

<template>
  <div class="flex flex-col items-center gap-2">
    <div
      class="overflow-hidden rounded-full border border-outline/60 bg-surface-bright/70 shadow-inner"
      :class="{
        'h-10 w-10': size === 'sm',
        'h-14 w-14': !size || size === 'md',
        'h-20 w-20': size === 'lg',
      }"
    >
      <img :src="flagUrl" :alt="`${name} flag`" class="h-full w-full object-cover" />
    </div>
    <span class="text-center text-sm font-semibold text-white sm:text-base">{{ name }}</span>
  </div>
</template>
