<script setup lang="ts">
import { CheckCircle2, Coins, Database, Shield, User, WalletCards } from '@lucide/vue'

const nodes = [
  { label: 'User', sub: 'Signs TX', icon: User },
  { label: 'USDC Pool', sub: 'Liquidity Entry', icon: Coins },
  { label: 'Solana Escrow', sub: 'Non-Custodial', icon: Shield, primary: true },
  { label: 'TxLINE Proof', sub: 'Merkle Proof', icon: CheckCircle2 },
  { label: 'Verified Result', sub: 'Signed Data', icon: Database },
  { label: 'USDC Payout', sub: 'Claim Winnings', icon: WalletCards },
]
</script>

<template>
  <section class="glass-card relative overflow-hidden rounded-3xl px-6 py-12">
    <div class="absolute -left-24 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl"></div>
    <div class="absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-tertiary/10 blur-3xl"></div>
    <div class="relative grid gap-6 lg:grid-cols-6 lg:items-start">
      <div v-for="(node, index) in nodes" :key="node.label" class="relative flex flex-col items-center text-center">
        <div
          class="mb-4 grid place-items-center border shadow-lg"
          :class="node.primary ? 'h-20 w-20 rounded-full border-background/30 bg-gradient-to-br from-primary-strong to-tertiary text-white shadow-green' : 'h-16 w-16 rounded-2xl border-outline/35 bg-surface-high text-primary'"
        >
          <component :is="node.icon" class="h-7 w-7" />
        </div>
        <div class="label-caps text-white">{{ node.label }}</div>
        <div class="mt-1 text-[10px] font-bold uppercase tracking-wide" :class="node.primary ? 'text-tertiary' : 'text-muted'">{{ node.sub }}</div>
        <div v-if="index < nodes.length - 1" class="mt-5 hidden h-px w-full bg-gradient-to-r from-outline via-primary/60 to-outline lg:absolute lg:left-[62%] lg:top-8 lg:block"></div>
      </div>
    </div>
  </section>
</template>
