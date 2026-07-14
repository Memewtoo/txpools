<script setup lang="ts">
import { ArrowUpRight, ShieldCheck } from '@lucide/vue'
</script>

<template>
  <section class="panel relative overflow-hidden rounded-3xl px-6 py-12 sm:px-12 lg:px-16 lg:py-18">
    <div class="absolute right-16 top-12 h-48 w-48 rounded-full bg-primary/10 blur-3xl"></div>
    <div class="relative grid gap-10 lg:grid-cols-[1fr_330px] lg:items-center">
      <div>
        <h1 class="max-w-3xl text-5xl font-extrabold leading-tight tracking-normal text-white sm:text-6xl">
          Trustless World Cup
          <span class="gradient-text block">Prediction Pools</span>
        </h1>
        <p class="mt-7 max-w-2xl text-xl font-medium leading-8 text-muted">
          Join USDC prediction pools settled by cryptographically verified match data on Solana. Experience zero-counterparty risk.
        </p>
        <div class="mt-10 flex flex-col gap-4 sm:flex-row">
          <RouterLink to="/pools" class="gradient-button inline-flex items-center justify-center gap-2 rounded-xl px-8 py-4 font-bold">
            Explore Pools
            <ArrowUpRight class="h-5 w-5" />
          </RouterLink>
          <RouterLink to="/trust" class="inline-flex items-center justify-center rounded-xl border border-outline/60 bg-transparent px-8 py-4 font-bold text-muted hover:text-white">
            Documentation
          </RouterLink>
        </div>
      </div>
      <aside class="rounded-2xl border border-outline/70 bg-surface-low/80 p-6 shadow-glow">
        <div class="mb-6 flex items-center justify-between text-sm font-bold text-muted">
          <span>Protocol Status</span>
          <span class="font-mono">0x4F...9E2</span>
        </div>
        <div class="mb-4 h-1.5 overflow-hidden rounded-full bg-surface-bright">
          <div class="h-full w-[82%] rounded-full bg-tertiary"></div>
        </div>
        <div class="flex items-center justify-between border-b border-outline/25 pb-8 text-sm font-bold text-muted">
          <span>Verification</span>
          <span class="text-tertiary">98% Verified</span>
        </div>
        <div class="grid grid-cols-2 gap-5 pt-7">
          <div class="text-center">
            <div class="font-mono text-2xl font-bold text-white">1.4s</div>
            <div class="label-caps text-muted">Latency</div>
          </div>
          <div class="text-center">
            <div class="font-mono text-2xl font-bold text-white">4.8M</div>
            <div class="label-caps text-muted">TVL (USDC)</div>
          </div>
        </div>
        <ShieldCheck class="absolute -right-3 -top-3 h-10 w-10 text-tertiary/40" />
      </aside>
    </div>
  </section>
</template>
