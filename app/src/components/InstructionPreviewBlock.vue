<script setup lang="ts">
defineProps<{
  preview: {
    programId: string
    dataHex: string
    accounts: Array<{
      address: string
      signer: boolean
      writable: boolean
    }>
  }
}>()
</script>

<template>
  <div class="space-y-4">
    <div>
      <div class="label-caps text-muted">Program id</div>
      <div class="mt-1 break-all font-mono text-sm text-white">{{ preview.programId }}</div>
    </div>
    <div>
      <div class="label-caps text-muted">Instruction data hex</div>
      <div class="mt-1 break-all font-mono text-xs text-primary">{{ preview.dataHex }}</div>
    </div>
    <div>
      <div class="label-caps text-muted">Accounts</div>
      <div class="mt-2 overflow-hidden rounded-xl border border-white/10">
        <div
          v-for="(account, index) in preview.accounts"
          :key="account.address"
          class="grid gap-2 border-b border-white/10 bg-background/40 px-3 py-2 text-xs last:border-b-0 sm:grid-cols-[40px_1fr_120px]"
        >
          <div class="font-mono text-muted">#{{ index }}</div>
          <div class="break-all font-mono text-white">{{ account.address }}</div>
          <div class="font-semibold text-muted">
            {{ account.signer ? 'signer' : 'readonly' }} / {{ account.writable ? 'writable' : 'read' }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
