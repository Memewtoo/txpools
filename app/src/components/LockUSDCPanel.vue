<script setup lang="ts">
import { computed, ref } from 'vue'
import { LockKeyhole } from '@lucide/vue'
import type { Outcome } from '../data/mockData'

const props = defineProps<{
  selected?: Outcome
  grossPoolRaw?: string
  totalLockedRaw?: string
  feeBps?: number
  disabled?: boolean
  disabledReason?: string
  balance?: string
  sending?: boolean
  signature?: string
  error?: string
}>()

const emit = defineEmits<{
  confirm: [amount: number]
}>()

const amount = ref(250)
const amountRaw = computed(() => BigInt(Math.max(0, Math.round((Number(amount.value) || 0) * 1_000_000))))
const feeBps = computed(() => BigInt(props.feeBps ?? 0))
const currentGrossPoolRaw = computed(() => BigInt(props.grossPoolRaw ?? '0'))
const currentTotalLockedRaw = computed(() => BigInt(props.totalLockedRaw ?? '0'))
const currentOutcomeRaw = computed(() => BigInt(props.selected?.amountRaw ?? '0'))
const grossAfterLockRaw = computed(() => currentGrossPoolRaw.value + amountRaw.value)
const totalLockedAfterLockRaw = computed(() => currentTotalLockedRaw.value + amountRaw.value)
const outcomeAfterLockRaw = computed(() => currentOutcomeRaw.value + amountRaw.value)
const feeRaw = computed(() => {
  if (!props.selected || amountRaw.value === 0n || outcomeAfterLockRaw.value === 0n || totalLockedAfterLockRaw.value === 0n) return 0n
  return (grossAfterLockRaw.value * feeBps.value) / 10_000n
})
const payoutPoolRaw = computed(() => grossAfterLockRaw.value > feeRaw.value ? grossAfterLockRaw.value - feeRaw.value : 0n)
const estimatedPayoutRaw = computed(() => {
  if (!props.selected || amountRaw.value === 0n || outcomeAfterLockRaw.value === 0n) return 0n
  return (amountRaw.value * payoutPoolRaw.value) / outcomeAfterLockRaw.value
})
const estimatedProfitRaw = computed(() => (
  estimatedPayoutRaw.value > amountRaw.value ? estimatedPayoutRaw.value - amountRaw.value : 0n
))
const estimatedMultiplier = computed(() => (
  amountRaw.value > 0n ? Number(estimatedPayoutRaw.value) / Number(amountRaw.value) : 0
))
const formatRawUsdc = (value: bigint) =>
  `${(Number(value) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`

const confirm = () => {
  emit('confirm', amount.value)
}
</script>

<template>
  <aside class="glass-card rounded-2xl p-6">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h2 class="text-xl font-bold text-white">Lock USDC</h2>
        <p class="text-sm text-muted">Locks USDC into the selected on-chain match pool.</p>
      </div>
      <div class="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary">
        <LockKeyhole class="h-5 w-5" />
      </div>
    </div>
    <label class="mb-2 block label-caps text-muted" for="amount">Amount to lock</label>
    <div class="mb-3 flex items-center rounded-xl border border-outline/40 bg-surface-low px-4 py-3" :class="disabled ? 'opacity-60' : ''">
      <input id="amount" v-model.number="amount" type="number" min="10" :disabled="disabled" class="w-full border-0 bg-transparent p-0 text-2xl font-bold text-white outline-none focus:ring-0 disabled:cursor-not-allowed" />
      <span class="font-mono text-sm font-bold text-muted">USDC</span>
    </div>
    <div class="mb-6 flex justify-between text-sm text-muted">
      <span>Balance</span>
      <span class="font-mono">{{ balance ?? 'Connect wallet' }}</span>
    </div>
    <div class="space-y-3 border-y border-outline/25 py-5">
      <div class="flex justify-between text-sm">
        <span class="text-muted">Selected outcome</span>
        <span class="font-bold text-white">{{ selected?.label ?? 'Choose outcome' }}</span>
      </div>
      <div class="flex justify-between text-sm">
        <span class="text-muted">Estimated Claim</span>
        <span class="font-mono font-bold text-secondary">{{ selected ? formatRawUsdc(estimatedPayoutRaw) : 'Choose outcome' }}</span>
      </div>
      <div class="flex justify-between text-sm">
        <span class="text-muted">Potential Profit</span>
        <span class="font-mono font-bold text-tertiary">{{ selected ? formatRawUsdc(estimatedProfitRaw) : '--' }}</span>
      </div>
      <div class="flex justify-between text-sm">
        <span class="text-muted">Estimated Rate</span>
        <span class="font-mono text-muted">{{ selected ? `${estimatedMultiplier.toFixed(2)}x` : '--' }}</span>
      </div>
    </div>
    <p class="mt-4 text-xs leading-5 text-muted">
      Estimated claim includes your locked USDC and updates as your amount changes.
    </p>
    <div v-if="disabled" class="mt-5 rounded-xl border border-primary/20 bg-primary/10 p-3 text-sm font-semibold text-primary">
      {{ disabledReason ?? 'Prediction is closed for this match.' }}
    </div>
    <div v-if="error" class="mt-5 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm font-semibold text-red-200">
      {{ error }}
    </div>
    <a
      v-if="signature"
      class="mt-5 block rounded-xl border border-tertiary/30 bg-tertiary/10 p-3 text-center text-sm font-bold text-tertiary"
      :href="`https://explorer.solana.com/tx/${signature}?cluster=devnet`"
      target="_blank"
      rel="noreferrer"
    >
      lock_prediction confirmed: {{ signature.slice(0, 6) }}...{{ signature.slice(-6) }}
    </a>
    <button
      class="mt-6 w-full rounded-xl py-4 font-bold transition active:scale-[0.98]"
      :disabled="disabled || !selected || sending"
      :class="!disabled && selected && !sending ? 'gradient-button' : 'cursor-not-allowed bg-surface-bright text-muted'"
      @click="confirm"
    >
      {{ disabled ? 'Prediction Closed' : sending ? 'Sending...' : 'Confirm Prediction' }}
    </button>
  </aside>
</template>
