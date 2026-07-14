<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { WalletMultiButton, useWallet } from 'solana-wallets-vue'
import { Menu, RadioTower, X } from '@lucide/vue'
import { TXPOOLS_CLUSTER } from '../services/txpools'
import { useTxPoolsAdmin } from '../composables/useTxPoolsAdmin'

const open = ref(false)
const wallet = useWallet()
const { isAuthority } = useTxPoolsAdmin()
const connectedWallet = computed(() => wallet.publicKey.value)

const baseLinks = [
  { label: 'Pools', to: '/pools' },
  { label: 'Settlements', to: '/settlements' },
  { label: 'Trust', to: '/trust' },
]

const rightLinks = computed(() => [
  ...(connectedWallet.value ? [{ label: 'Portfolio', to: '/portfolio' }] : []),
  ...(isAuthority.value ? [{ label: 'Admin', to: '/admin' }] : []),
])
const clusterLabel = computed(() => (TXPOOLS_CLUSTER === 'mainnet-beta' ? 'Mainnet' : 'Devnet'))
const navLinkClass = 'rounded-lg border border-outline/20 bg-transparent px-3 py-2 text-sm font-semibold text-muted transition hover:border-primary/40 hover:bg-surface-high/60 hover:text-primary'
const navActiveClass = '!border-secondary/60 !bg-secondary/10 !text-secondary'
</script>

<template>
  <header class="fixed inset-x-0 top-0 z-50 border-b border-outline/30 bg-background/80 backdrop-blur-xl">
    <nav class="mx-auto flex h-16 max-w-app items-center justify-between px-4 sm:px-6 lg:px-8">
      <div class="flex items-center gap-8">
        <RouterLink to="/" class="text-2xl font-extrabold tracking-tight text-primary">TxPools</RouterLink>
        <div class="hidden items-center gap-2 md:flex">
          <RouterLink
            v-for="link in baseLinks"
            :key="link.to"
            :to="link.to"
            :class="navLinkClass"
            :active-class="navActiveClass"
          >
            {{ link.label }}
          </RouterLink>
        </div>
      </div>

      <div class="hidden items-center gap-2 sm:flex">
        <RouterLink
          v-for="link in rightLinks"
          :key="link.to"
          :to="link.to"
          :class="navLinkClass"
          :active-class="navActiveClass"
        >
          {{ link.label }}
        </RouterLink>
        <div class="inline-flex items-center gap-2 rounded-full border border-outline/30 bg-surface-high px-3 py-1.5">
          <RadioTower class="h-4 w-4 text-tertiary" />
          <span class="font-mono text-xs font-semibold text-muted">{{ clusterLabel }}</span>
        </div>
        <WalletMultiButton dark />
      </div>

      <button class="rounded-lg border border-outline/40 bg-surface-high p-2 text-muted md:hidden" @click="open = !open" aria-label="Toggle menu">
        <X v-if="open" class="h-5 w-5" />
        <Menu v-else class="h-5 w-5" />
      </button>
    </nav>
    <div v-if="open" class="border-t border-outline/20 bg-background px-4 py-4 md:hidden">
      <div class="grid gap-3">
        <RouterLink
          v-for="link in [...baseLinks, ...rightLinks]"
          :key="link.to"
          :to="link.to"
          :class="navLinkClass"
          :active-class="navActiveClass"
          @click="open = false"
        >
          {{ link.label }}
        </RouterLink>
        <WalletMultiButton dark />
      </div>
    </div>
  </header>
</template>
