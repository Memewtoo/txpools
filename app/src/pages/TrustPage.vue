<script setup lang="ts">
import { Database, LockKeyhole, Radio, ShieldCheck } from '@lucide/vue'
import TrustFlowDiagram from '../components/TrustFlowDiagram.vue'

const cards = [
  {
    title: '1. Real-time Match Stream',
    copy: 'TxLINE streams signed World Cup match data so settlement uses the same finalized event state seen by the interface.',
    icon: Radio,
    tone: 'text-primary bg-primary/10 border-primary/30',
  },
  {
    title: '2. Cryptographic Proofs',
    copy: 'Final outcomes are validated through TxLINE Merkle proof verification and signed match data before USDC moves.',
    icon: ShieldCheck,
    tone: 'text-secondary bg-secondary/10 border-secondary/30',
  },
  {
    title: '3. Permissionless Settlement',
    copy: 'Anyone can submit the TxLINE proof and call validate_stat CPI to settle a completed match pool.',
    icon: Database,
    tone: 'text-tertiary bg-tertiary/10 border-tertiary/30',
  },
  {
    title: '4. Non-custodial Escrow',
    copy: 'Locked USDC remains in Solana escrow until verified result logic releases payouts for claim winnings.',
    icon: LockKeyhole,
    tone: 'text-cyan bg-cyan/10 border-cyan/30',
  },
]
</script>

<template>
  <div class="space-y-12">
    <header class="mx-auto max-w-3xl text-center">
      <div class="mb-4 inline-flex rounded-full border border-primary/25 bg-primary/10 px-3 py-1 label-caps text-primary">Trust Architecture</div>
      <h1 class="text-4xl font-bold text-white sm:text-5xl">TxLINE-Verified Settlement</h1>
      <p class="mt-5 text-lg leading-8 text-muted">
        TxPools connects USDC match pools to cryptographically signed match data, then releases payouts only after verified settlement.
      </p>
    </header>

    <TrustFlowDiagram />

    <section class="grid gap-6 md:grid-cols-2">
      <article v-for="card in cards" :key="card.title" class="glass-card rounded-2xl border-t-2 p-8" :class="card.tone">
        <div class="mb-6 grid h-12 w-12 place-items-center rounded-xl border" :class="card.tone">
          <component :is="card.icon" class="h-6 w-6" />
        </div>
        <h2 class="mb-3 text-xl font-bold text-white">{{ card.title }}</h2>
        <p class="leading-7 text-muted">{{ card.copy }}</p>
      </article>
    </section>
  </div>
</template>
