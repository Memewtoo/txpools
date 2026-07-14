<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { PublicKey, Transaction, type TransactionInstruction } from '@solana/web3.js'
import { Buffer } from 'buffer'
import { ArchiveRestore, RefreshCw, Settings2, ShieldCheck, WalletCards } from '@lucide/vue'
import InstructionPreviewBlock from '../components/InstructionPreviewBlock.vue'
import {
  BONUS_POOL_AMOUNT_USDC,
  DEFAULT_PLATFORM_FEE_BPS,
  PoolStatus as ProgramPoolStatus,
  TXPOOLS_PROGRAM_ID,
  TXPOOLS_USDC_MINT,
  findConfigPda,
  findPoolPda,
  findVaultPda,
  confirmSubmittedTransaction,
  fetchIndexedPools,
  initializeConfigInstruction,
  initializePoolInstruction,
  rawToUsdc,
  sweepUnclaimedPoolInstruction,
  txPoolsClient,
  txPoolsTransactionConnection,
  type IndexedPool,
} from '../services/txpools'
import { useTxPoolsAdmin } from '../composables/useTxPoolsAdmin'
import { useTxLinePools } from '../composables/useTxLinePools'
import type { TxLinePoolState } from '../services/txline'

const {
  wallet,
  connectedWallet,
  config,
  configInitialized,
  authorityAddress,
  isAuthority,
  gateReason,
  loading,
  error,
  refreshConfig,
} = useTxPoolsAdmin()
const { poolStates, sourceLabel } = useTxLinePools()

const feeRecipient = ref('')
const feeBps = ref(DEFAULT_PLATFORM_FEE_BPS)
const selectedFixtureId = ref<number>()
const configPreview = ref<InstructionPreview>()
const poolPreview = ref<InstructionPreview>()
const configPreviewError = ref<string>()
const poolPreviewError = ref<string>()
const configTxError = ref<string>()
const poolTxError = ref<string>()
const configSignature = ref<string>()
const poolSignature = ref<string>()
const configSending = ref(false)
const poolSending = ref(false)
const poolStatusLoading = ref(false)
const poolStatusError = ref<string>()
const initializedPoolIds = ref<Set<number>>(new Set())
const indexedPools = ref<IndexedPool[]>([])
const sweepLoading = ref(false)
const sweepError = ref<string>()
const sweepingFixtureIds = ref<Set<string>>(new Set())
const sweepSignatures = ref<Record<string, string>>({})

interface InstructionPreview {
  programId: string
  dataHex: string
  accounts: Array<{
    address: string
    signer: boolean
    writable: boolean
  }>
}

const shortAddress = (value?: PublicKey) => {
  if (!value) return 'Not set'
  const text = value.toBase58()
  return `${text.slice(0, 4)}...${text.slice(-4)}`
}

const shortSignature = (value: string) => `${value.slice(0, 6)}...${value.slice(-6)}`

const instructionPreview = (instruction: TransactionInstruction): InstructionPreview => ({
  programId: instruction.programId.toBase58(),
  dataHex: Buffer.from(instruction.data).toString('hex'),
  accounts: instruction.keys.map((account) => ({
    address: account.pubkey.toBase58(),
    signer: account.isSigner,
    writable: account.isWritable,
  })),
})

const normalizeTimestampSeconds = (value: number | undefined) => {
  if (!value || !Number.isFinite(value)) return undefined
  return Math.floor(value > 10_000_000_000 ? value / 1000 : value)
}

const formatDateTime = (seconds: number | undefined) => {
  if (!seconds) return 'Pending'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(seconds * 1000))
}

const txLineFixtureStates = computed(() =>
  poolStates.value
    .filter((state): state is TxLinePoolState & { fixtureId: number } => state.source === 'txline' && typeof state.fixtureId === 'number')
    .sort((left, right) => {
      const leftStart = left.pool.startsAt ?? Number.MAX_SAFE_INTEGER
      const rightStart = right.pool.startsAt ?? Number.MAX_SAFE_INTEGER
      return leftStart - rightStart
    }),
)

const uninitializedFixtureStates = computed(() =>
  txLineFixtureStates.value.filter((state) => !initializedPoolIds.value.has(state.fixtureId)),
)

const selectedFixtureState = computed(() =>
  txLineFixtureStates.value.find((state) => state.fixtureId === selectedFixtureId.value)
    ?? uninitializedFixtureStates.value[0]
    ?? txLineFixtureStates.value[0],
)

const selectedPoolAlreadyInitialized = computed(() =>
  selectedFixtureState.value ? initializedPoolIds.value.has(selectedFixtureState.value.fixtureId) : false,
)

const selectedFixtureTiming = computed(() => {
  const state = selectedFixtureState.value
  if (!state) return undefined

  const startSeconds = normalizeTimestampSeconds(state.pool.startsAt)
  // TxLINE kickoff is the prediction cutoff. The short fallback keeps malformed
  // demo fixtures usable without introducing another admin-entered timestamp.
  const fallbackCloseSeconds = Math.floor(Date.now() / 1000) + 60 * 60
  const closeTs = startSeconds ?? fallbackCloseSeconds

  return { closeTs }
})

const poolAddresses = computed(() => {
  const fixtureId = selectedFixtureState.value?.fixtureId ?? 0
  const [pool] = findPoolPda(fixtureId)
  const [vault] = findVaultPda(pool)
  return { pool, vault }
})

const explorerTx = (signature: string) =>
  `https://explorer.solana.com/tx/${signature}?cluster=devnet`

const formatRawUsdc = (amount: string) =>
  `${rawToUsdc(BigInt(amount)).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`

const winningPoolRaw = (pool: IndexedPool) => {
  if (pool.winning_outcome === 0) return BigInt(pool.outcome_home)
  if (pool.winning_outcome === 1) return BigInt(pool.outcome_draw)
  if (pool.winning_outcome === 2) return BigInt(pool.outcome_away)
  return -1n
}

const sweepCandidates = computed(() =>
  // Match the program's narrow sweep rule before offering an admin action.
  indexedPools.value
    .filter((pool) =>
      pool.status === ProgramPoolStatus.Resolved
      && winningPoolRaw(pool) === 0n
      && BigInt(pool.vault_amount) > 0n,
    )
    .sort((left, right) => (right.settled_at ?? 0) - (left.settled_at ?? 0)),
)

const sweepMatchLabel = (pool: IndexedPool) => {
  const state = txLineFixtureStates.value.find((item) => String(item.fixtureId) === pool.fixture_id)
  return state ? `${state.pool.home} vs ${state.pool.away}` : `Fixture ${pool.fixture_id}`
}

const makeConfigInstruction = () => {
  if (!connectedWallet.value) throw new Error('Connect the authority wallet first.')
  const recipient = new PublicKey(feeRecipient.value || connectedWallet.value.toBase58())
  return initializeConfigInstruction({
    admin: connectedWallet.value,
    feeRecipient: recipient,
    feeBps: feeBps.value,
  })
}

const makePoolInstruction = () => {
  if (!connectedWallet.value) throw new Error('Connect the authority wallet first.')
  if (!configInitialized.value) throw new Error('initialize_pool requires an initialized config account.')
  if (!selectedFixtureState.value || !selectedFixtureTiming.value) throw new Error('Select an available TxLINE fixture first.')
  if (selectedPoolAlreadyInitialized.value) throw new Error('This fixture pool is already initialized on-chain.')
  return initializePoolInstruction({
    admin: connectedWallet.value,
    fixtureId: selectedFixtureState.value.fixtureId,
    closeTs: selectedFixtureTiming.value.closeTs,
  })
}

const sendInstruction = async (
  instruction: TransactionInstruction,
  isApplied?: () => Promise<boolean>,
) => {
  // Shared admin submission keeps config and pool flows on the same blockhash,
  // min-context-slot, and state-aware confirmation path.
  if (!connectedWallet.value) throw new Error('Connect the authority wallet first.')
  const {
    context: { slot: minContextSlot },
    value: { blockhash, lastValidBlockHeight },
  } = await txPoolsTransactionConnection.getLatestBlockhashAndContext('confirmed')
  const transaction = new Transaction({
    feePayer: connectedWallet.value,
    recentBlockhash: blockhash,
  }).add(instruction)
  const signature = await wallet.sendTransaction(transaction, txPoolsTransactionConnection, { minContextSlot })
  await confirmSubmittedTransaction({
    connection: txPoolsTransactionConnection,
    signature,
    blockhash,
    lastValidBlockHeight,
    isApplied,
  })
  return signature
}

const buildConfigPreview = () => {
  configPreviewError.value = undefined
  configTxError.value = undefined
  configPreview.value = undefined

  try {
    configPreview.value = instructionPreview(makeConfigInstruction())
  } catch (caught) {
    configPreviewError.value = caught instanceof Error ? caught.message : 'Unable to build initialize_config preview.'
  }
}

const sendConfigTransaction = async () => {
  configPreviewError.value = undefined
  configTxError.value = undefined
  configSignature.value = undefined
  configSending.value = true

  try {
    const instruction = makeConfigInstruction()
    configPreview.value = instructionPreview(instruction)
    configSignature.value = await sendInstruction(
      instruction,
      async () => Boolean(await txPoolsClient.fetchConfig()),
    )
    await refreshConfig()
  } catch (caught) {
    configTxError.value = caught instanceof Error ? caught.message : 'initialize_config transaction failed.'
  } finally {
    configSending.value = false
  }
}

const buildPoolPreview = () => {
  poolPreviewError.value = undefined
  poolTxError.value = undefined
  poolPreview.value = undefined

  try {
    poolPreview.value = instructionPreview(makePoolInstruction())
  } catch (caught) {
    poolPreviewError.value = caught instanceof Error ? caught.message : 'Unable to build initialize_pool preview.'
  }
}

const sendPoolTransaction = async () => {
  poolPreviewError.value = undefined
  poolTxError.value = undefined
  poolSignature.value = undefined
  poolSending.value = true

  try {
    const instruction = makePoolInstruction()
    poolPreview.value = instructionPreview(instruction)
    const fixtureId = selectedFixtureState.value?.fixtureId
    poolSignature.value = await sendInstruction(
      instruction,
      fixtureId === undefined
        ? undefined
        : async () => Boolean(await txPoolsClient.fetchPool(fixtureId)),
    )
    await refreshPoolStatuses()
    selectedFixtureId.value = uninitializedFixtureStates.value[0]?.fixtureId
  } catch (caught) {
    poolTxError.value = caught instanceof Error ? caught.message : 'initialize_pool transaction failed.'
  } finally {
    poolSending.value = false
  }
}

const refreshPoolStatuses = async () => {
  poolStatusLoading.value = true
  poolStatusError.value = undefined

  try {
    const pools = await txPoolsClient.fetchPools(txLineFixtureStates.value.map((state) => state.fixtureId))
    initializedPoolIds.value = new Set(pools.keys())
  } catch (caught) {
    poolStatusError.value = caught instanceof Error ? caught.message : 'Unable to check initialized TxPools pools.'
  } finally {
    poolStatusLoading.value = false
  }
}

const refreshSweepPools = async () => {
  sweepLoading.value = true
  sweepError.value = undefined
  try {
    indexedPools.value = await fetchIndexedPools()
  } catch (caught) {
    sweepError.value = caught instanceof Error ? caught.message : 'Unable to load sweepable pools.'
  } finally {
    sweepLoading.value = false
  }
}

const sweepPool = async (pool: IndexedPool) => {
  const admin = connectedWallet.value
  if (!admin || !config.value || !isAuthority.value) {
    sweepError.value = 'Connect the configured authority wallet before sweeping a pool.'
    return
  }
  if (!sweepCandidates.value.some((candidate) => candidate.pool_pubkey === pool.pool_pubkey)) {
    sweepError.value = 'This pool is not eligible for an unclaimed-funds sweep.'
    return
  }

  const fixtureId = pool.fixture_id
  sweepingFixtureIds.value = new Set([...sweepingFixtureIds.value, fixtureId])
  sweepError.value = undefined
  try {
    const feeRecipientToken = getAssociatedTokenAddressSync(
      TXPOOLS_USDC_MINT,
      config.value.feeRecipient,
      false,
      TOKEN_PROGRAM_ID,
    )
    const {
      context: { slot: minContextSlot },
      value: { blockhash, lastValidBlockHeight },
    } = await txPoolsTransactionConnection.getLatestBlockhashAndContext('confirmed')
    const transaction = new Transaction({
      feePayer: admin,
      recentBlockhash: blockhash,
    })

    // The fee recipient ATA may not exist on Devnet; create it atomically with the sweep.
    if (!await txPoolsClient.connection.getAccountInfo(feeRecipientToken, 'confirmed')) {
      transaction.add(createAssociatedTokenAccountInstruction(
        admin,
        feeRecipientToken,
        config.value.feeRecipient,
        TXPOOLS_USDC_MINT,
        TOKEN_PROGRAM_ID,
      ))
    }
    transaction.add(sweepUnclaimedPoolInstruction({
      admin,
      fixtureId: Number(fixtureId),
      feeRecipientToken,
    }))

    const signature = await wallet.sendTransaction(
      transaction,
      txPoolsTransactionConnection,
      { minContextSlot },
    )
    await confirmSubmittedTransaction({
      connection: txPoolsTransactionConnection,
      signature,
      blockhash,
      lastValidBlockHeight,
      isApplied: async () => (await txPoolsClient.fetchPool(Number(fixtureId)))?.status === ProgramPoolStatus.Swept,
    })

    indexedPools.value = indexedPools.value.map((item) =>
      item.pool_pubkey === pool.pool_pubkey
        ? { ...item, status: ProgramPoolStatus.Swept, vault_amount: '0' }
        : item,
    )
    sweepSignatures.value = { ...sweepSignatures.value, [fixtureId]: signature }
  } catch (caught) {
    sweepError.value = caught instanceof Error ? caught.message : 'sweep_unclaimed_pool transaction failed.'
  } finally {
    const next = new Set(sweepingFixtureIds.value)
    next.delete(fixtureId)
    sweepingFixtureIds.value = next
  }
}

watch(
  () => txLineFixtureStates.value.map((state) => state.fixtureId).join(','),
  (fixtureIds) => {
    if (!fixtureIds) return
    void refreshPoolStatuses()
  },
  { immediate: true },
)

watch(
  uninitializedFixtureStates,
  (states) => {
    if (!selectedFixtureId.value || initializedPoolIds.value.has(selectedFixtureId.value)) {
      selectedFixtureId.value = states[0]?.fixtureId
    }
  },
  { immediate: true },
)

watch(isAuthority, (authorized) => {
  if (authorized) void refreshSweepPools()
}, { immediate: true })
</script>

<template>
  <div class="space-y-8">
    <header class="flex flex-wrap items-start justify-between gap-5">
      <div>
        <div class="label-caps text-primary">Authority only</div>
        <h1 class="mt-2 text-4xl font-bold text-white">TxPools Admin</h1>
        <p class="mt-3 max-w-3xl text-muted">
          Initialize TxPools config and match pools from the connected authority wallet on Solana devnet.
        </p>
      </div>
      <button
        class="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-bold text-primary transition hover:bg-primary/15"
        type="button"
        @click="refreshConfig"
      >
        Refresh Config
      </button>
    </header>

    <section class="grid gap-4 lg:grid-cols-3">
      <article class="glass-card rounded-2xl p-5">
        <div class="flex items-center gap-3">
          <div class="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck class="h-5 w-5" />
          </div>
          <div>
            <div class="label-caps text-muted">Authority</div>
            <div class="font-mono font-bold text-white">{{ shortAddress(authorityAddress) }}</div>
          </div>
        </div>
      </article>
      <article class="glass-card rounded-2xl p-5">
        <div class="flex items-center gap-3">
          <div class="grid h-11 w-11 place-items-center rounded-xl bg-secondary/10 text-secondary">
            <WalletCards class="h-5 w-5" />
          </div>
          <div>
            <div class="label-caps text-muted">Connected wallet</div>
            <div class="font-mono font-bold text-white">{{ shortAddress(connectedWallet ?? undefined) }}</div>
          </div>
        </div>
      </article>
      <article class="glass-card rounded-2xl p-5">
        <div class="flex items-center gap-3">
          <div class="grid h-11 w-11 place-items-center rounded-xl bg-tertiary/10 text-tertiary">
            <Settings2 class="h-5 w-5" />
          </div>
          <div>
            <div class="label-caps text-muted">Config state</div>
            <div class="font-bold" :class="configInitialized ? 'text-tertiary' : 'text-amber-200'">
              {{ loading ? 'Loading' : configInitialized ? 'Initialized' : 'Not initialized' }}
            </div>
          </div>
        </div>
      </article>
    </section>

    <div v-if="error" class="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold text-red-200">
      {{ error }}
    </div>

    <section v-if="!isAuthority" class="glass-card rounded-2xl p-8 text-center">
      <h2 class="text-2xl font-bold text-white">Admin Locked</h2>
      <p class="mx-auto mt-3 max-w-2xl text-muted">{{ gateReason }}</p>
      <p class="mx-auto mt-3 max-w-2xl text-sm text-muted">
        If this is the first config initialization, set <span class="font-mono text-primary">VITE_TXPOOLS_BOOTSTRAP_ADMIN</span>
        to the intended authority wallet and reconnect that wallet.
      </p>
    </section>

    <section v-else class="grid gap-6 xl:grid-cols-2">
      <article class="glass-card rounded-2xl p-6">
        <div class="mb-5">
          <div class="label-caps text-primary">Instruction 0</div>
          <h2 class="mt-2 text-2xl font-bold text-white">initialize_config</h2>
          <p class="mt-2 text-sm leading-6 text-muted">
            Creates the config PDA and stores admin, fee recipient, and fee bps. This can only run once.
          </p>
        </div>

        <div class="space-y-4" :class="configInitialized ? 'opacity-55' : ''">
          <label class="block">
            <span class="label-caps text-muted">Fee recipient</span>
            <input
              v-model="feeRecipient"
              :disabled="configInitialized"
              class="mt-2 w-full rounded-xl border border-outline/40 bg-surface-low px-4 py-3 font-mono text-sm text-white outline-none focus:border-primary disabled:cursor-not-allowed"
              :placeholder="connectedWallet?.toBase58() ?? 'Authority wallet by default'"
            />
          </label>
          <label class="block">
            <span class="label-caps text-muted">Platform fee bps</span>
            <input
              v-model.number="feeBps"
              :disabled="configInitialized"
              min="0"
              max="10000"
              type="number"
              class="mt-2 w-full rounded-xl border border-outline/40 bg-surface-low px-4 py-3 font-mono text-sm text-white outline-none focus:border-primary disabled:cursor-not-allowed"
            />
          </label>

          <div class="rounded-xl bg-surface-low p-4">
            <div class="label-caps text-muted">Config PDA</div>
            <div class="mt-1 break-all font-mono text-sm text-white">{{ findConfigPda()[0].toBase58() }}</div>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <button
              class="rounded-xl border border-primary/30 bg-primary/10 py-3 font-bold text-primary transition hover:bg-primary/15 active:scale-[0.98]"
              :disabled="configInitialized || configSending"
              :class="configInitialized || configSending ? 'cursor-not-allowed opacity-60' : ''"
              type="button"
              @click="buildConfigPreview"
            >
              Build Preview
            </button>
            <button
              class="rounded-xl py-3 font-bold transition active:scale-[0.98]"
              :disabled="configInitialized || configSending"
              :class="configInitialized || configSending ? 'cursor-not-allowed bg-surface-bright text-muted' : 'gradient-button'"
              type="button"
              @click="sendConfigTransaction"
            >
              {{ configInitialized ? 'Config Already Initialized' : configSending ? 'Sending...' : 'Send initialize_config' }}
            </button>
          </div>
        </div>

        <div v-if="configPreviewError" class="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
          {{ configPreviewError }}
        </div>
        <div v-if="configTxError" class="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
          {{ configTxError }}
        </div>
        <a
          v-if="configSignature"
          class="mt-4 block rounded-xl border border-tertiary/30 bg-tertiary/10 p-3 text-center text-sm font-bold text-tertiary"
          :href="explorerTx(configSignature)"
          target="_blank"
          rel="noreferrer"
        >
          initialize_config confirmed: {{ shortSignature(configSignature) }}
        </a>
        <div v-if="configPreview" class="mt-5 rounded-2xl border border-white/10 bg-surface-low p-4">
          <InstructionPreviewBlock :preview="configPreview" />
        </div>
      </article>

      <article class="glass-card rounded-2xl p-6">
        <div class="mb-5">
          <div class="label-caps text-secondary">Instruction 1</div>
          <h2 class="mt-2 text-2xl font-bold text-white">initialize_pool</h2>
          <p class="mt-2 text-sm leading-6 text-muted">
            Creates a match pool PDA and USDC vault PDA for a TxLINE fixture that has not been initialized yet, then seeds the vault with the platform bonus pool.
          </p>
        </div>

        <div class="space-y-4" :class="!configInitialized ? 'opacity-55' : ''">
          <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-low p-4">
            <div>
              <div class="label-caps text-muted">TxLINE fixtures</div>
              <div class="mt-1 text-sm font-semibold text-white">{{ sourceLabel }}</div>
            </div>
            <button
              class="rounded-lg border border-secondary/30 bg-secondary/10 px-4 py-2 text-sm font-bold text-secondary transition hover:bg-secondary/15"
              type="button"
              :disabled="poolStatusLoading"
              @click="refreshPoolStatuses"
            >
              {{ poolStatusLoading ? 'Checking...' : 'Refresh Pools' }}
            </button>
          </div>

          <div v-if="poolStatusError" class="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
            {{ poolStatusError }}
          </div>

          <label class="block">
            <span class="label-caps text-muted">Uninitialized TxLINE fixture</span>
            <select
              v-model.number="selectedFixtureId"
              :disabled="!configInitialized || !uninitializedFixtureStates.length"
              class="mt-2 w-full rounded-xl border border-outline/40 bg-surface-low px-4 py-3 font-mono text-sm text-white outline-none focus:border-secondary disabled:cursor-not-allowed"
            >
              <option
                v-for="state in uninitializedFixtureStates"
                :key="state.fixtureId"
                :value="state.fixtureId"
              >
                {{ state.pool.home }} vs {{ state.pool.away }} / {{ state.fixtureId }} / {{ state.pool.status }}
              </option>
            </select>
          </label>

          <div v-if="selectedFixtureState" class="rounded-2xl border border-white/10 bg-surface-low p-4">
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div class="label-caps text-muted">Selected match</div>
                <div class="mt-1 text-xl font-bold text-white">
                  {{ selectedFixtureState.pool.home }} vs {{ selectedFixtureState.pool.away }}
                </div>
                <div class="mt-1 font-mono text-sm text-muted">
                  Fixture {{ selectedFixtureState.fixtureId }} / {{ selectedFixtureState.pool.status }} / {{ selectedFixtureState.pool.score }}
                </div>
              </div>
              <span
                class="rounded-full px-3 py-1 text-xs font-bold"
                :class="selectedPoolAlreadyInitialized ? 'bg-tertiary/10 text-tertiary' : 'bg-secondary/10 text-secondary'"
              >
                {{ selectedPoolAlreadyInitialized ? 'Already initialized' : 'Ready to initialize' }}
              </span>
            </div>

            <div class="mt-4 grid gap-3 sm:grid-cols-2">
              <div class="rounded-xl bg-background/40 p-3">
                <div class="label-caps text-muted">close_ts</div>
                <div class="mt-1 font-mono text-sm font-bold text-white">
                  {{ selectedFixtureTiming?.closeTs }}
                </div>
                <div class="mt-1 text-xs text-muted">
                  {{ formatDateTime(selectedFixtureTiming?.closeTs) }} / kickoff lock cutoff
                </div>
              </div>
              <div class="rounded-xl bg-background/40 p-3">
                <div class="label-caps text-muted">settlement gate</div>
                <div class="mt-1 text-sm font-bold text-white">TxLINE final StatusId</div>
                <div class="mt-1 text-xs text-muted">resolve_pool proofs are built only from final score events</div>
              </div>
              <div class="rounded-xl bg-background/40 p-3 sm:col-span-2">
                <div class="label-caps text-muted">platform bonus seed</div>
                <div class="mt-1 font-mono text-sm font-bold text-secondary">
                  {{ BONUS_POOL_AMOUNT_USDC }} USDC
                </div>
                <div class="mt-1 text-xs text-muted">
                  initialize_pool transfers this amount from the connected authority wallet USDC account into the pool vault. It is not a user position and cannot be claimed directly as winnings.
                </div>
              </div>
            </div>
          </div>

          <div v-else class="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
            No TxLINE fixtures are available yet. Wait for TxLINE fixtures to load or check your TxLINE credentials.
          </div>

          <div class="grid gap-3">
            <div class="rounded-xl bg-surface-low p-4">
              <div class="label-caps text-muted">Pool PDA</div>
              <div class="mt-1 break-all font-mono text-sm text-white">{{ poolAddresses.pool.toBase58() }}</div>
            </div>
            <div class="rounded-xl bg-surface-low p-4">
              <div class="label-caps text-muted">Vault PDA</div>
              <div class="mt-1 break-all font-mono text-sm text-white">{{ poolAddresses.vault.toBase58() }}</div>
            </div>
            <div class="rounded-xl bg-surface-low p-4">
              <div class="label-caps text-muted">USDC mint</div>
              <div class="mt-1 break-all font-mono text-sm text-white">{{ TXPOOLS_USDC_MINT.toBase58() }}</div>
            </div>
            <div class="rounded-xl bg-surface-low p-4">
              <div class="label-caps text-muted">Required admin USDC</div>
              <div class="mt-1 font-mono text-sm font-bold text-secondary">{{ BONUS_POOL_AMOUNT_USDC }} USDC</div>
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <button
              class="rounded-xl border border-secondary/30 bg-secondary/10 py-3 font-bold text-secondary transition hover:bg-secondary/15 active:scale-[0.98]"
              :disabled="!configInitialized || poolSending || !selectedFixtureState || selectedPoolAlreadyInitialized"
              :class="!configInitialized || poolSending || !selectedFixtureState || selectedPoolAlreadyInitialized ? 'cursor-not-allowed opacity-60' : ''"
              type="button"
              @click="buildPoolPreview"
            >
              Build Preview
            </button>
            <button
              class="rounded-xl py-3 font-bold transition active:scale-[0.98]"
              :disabled="!configInitialized || poolSending || !selectedFixtureState || selectedPoolAlreadyInitialized"
              :class="configInitialized && !poolSending && selectedFixtureState && !selectedPoolAlreadyInitialized ? 'gradient-button' : 'cursor-not-allowed bg-surface-bright text-muted'"
              type="button"
              @click="sendPoolTransaction"
            >
              {{ !configInitialized ? 'Initialize Config First' : selectedPoolAlreadyInitialized ? 'Pool Already Initialized' : poolSending ? 'Sending...' : 'Send initialize_pool' }}
            </button>
          </div>
        </div>

        <div v-if="poolPreviewError" class="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
          {{ poolPreviewError }}
        </div>
        <div v-if="poolTxError" class="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
          {{ poolTxError }}
        </div>
        <a
          v-if="poolSignature"
          class="mt-4 block rounded-xl border border-tertiary/30 bg-tertiary/10 p-3 text-center text-sm font-bold text-tertiary"
          :href="explorerTx(poolSignature)"
          target="_blank"
          rel="noreferrer"
        >
          initialize_pool confirmed: {{ shortSignature(poolSignature) }}
        </a>
        <div v-if="poolPreview" class="mt-5 rounded-2xl border border-white/10 bg-surface-low p-4">
          <InstructionPreviewBlock :preview="poolPreview" />
        </div>
      </article>
    </section>

    <section v-if="isAuthority" class="glass-card rounded-2xl p-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div class="label-caps text-tertiary">Instruction 5</div>
          <h2 class="mt-2 text-2xl font-bold text-white">sweep_unclaimed_pool</h2>
          <p class="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Recover the remaining vault balance only from resolved pools whose winning outcome has no user funds. Pools with winners must be claimed through Portfolio instead.
          </p>
        </div>
        <button
          class="inline-flex items-center gap-2 rounded-lg border border-tertiary/30 bg-tertiary/10 px-4 py-2 text-sm font-bold text-tertiary transition hover:bg-tertiary/15 disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          :disabled="sweepLoading"
          @click="refreshSweepPools"
        >
          <RefreshCw class="h-4 w-4" :class="sweepLoading ? 'animate-spin' : ''" />
          {{ sweepLoading ? 'Checking...' : 'Refresh Eligible Pools' }}
        </button>
      </div>

      <div v-if="sweepError" class="mt-5 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
        {{ sweepError }}
      </div>

      <div v-if="sweepCandidates.length" class="mt-6 divide-y divide-outline/20 rounded-xl border border-outline/25 bg-surface-low">
        <div
          v-for="pool in sweepCandidates"
          :key="pool.pool_pubkey"
          class="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="min-w-0">
            <div class="font-bold text-white">{{ sweepMatchLabel(pool) }}</div>
            <div class="mt-1 font-mono text-xs text-muted">
              Fixture {{ pool.fixture_id }} / {{ pool.final_home_score }} - {{ pool.final_away_score }}
            </div>
            <div class="mt-2 text-sm text-muted">
              Vault balance <span class="font-mono font-bold text-secondary">{{ formatRawUsdc(pool.vault_amount) }}</span>
            </div>
            <a
              v-if="sweepSignatures[pool.fixture_id]"
              class="mt-2 inline-block text-xs font-bold text-primary"
              :href="explorerTx(sweepSignatures[pool.fixture_id])"
              target="_blank"
              rel="noreferrer"
            >
              Confirmed: {{ shortSignature(sweepSignatures[pool.fixture_id]) }}
            </a>
          </div>
          <button
            class="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-tertiary px-4 py-2 text-sm font-bold text-[#003920] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            :disabled="sweepingFixtureIds.has(pool.fixture_id)"
            @click="sweepPool(pool)"
          >
            <ArchiveRestore class="h-4 w-4" />
            {{ sweepingFixtureIds.has(pool.fixture_id) ? 'Sweeping...' : 'Sweep Vault' }}
          </button>
        </div>
      </div>
      <div v-else-if="!sweepLoading" class="mt-6 rounded-xl border border-outline/25 bg-surface-low p-6 text-center text-sm font-semibold text-muted">
        No resolved pool currently has an empty winning outcome and a remaining vault balance.
      </div>
    </section>

    <section class="glass-card rounded-2xl p-5">
      <div class="label-caps text-muted">Program</div>
      <div class="mt-2 break-all font-mono text-sm text-white">{{ TXPOOLS_PROGRAM_ID.toBase58() }}</div>
      <div v-if="config" class="mt-4 grid gap-3 sm:grid-cols-3">
        <div class="rounded-xl bg-surface-low p-3 text-center">
          <div class="label-caps text-muted">Fee bps</div>
          <div class="mt-1 font-mono font-bold text-white">{{ config.feeBps }}</div>
        </div>
        <div class="rounded-xl bg-surface-low p-3 text-center">
          <div class="label-caps text-muted">Fee recipient</div>
          <div class="mt-1 font-mono font-bold text-white">{{ shortAddress(config.feeRecipient) }}</div>
        </div>
        <div class="rounded-xl bg-surface-low p-3 text-center">
          <div class="label-caps text-muted">Config bump</div>
          <div class="mt-1 font-mono font-bold text-white">{{ config.bump }}</div>
        </div>
      </div>
    </section>
  </div>
</template>
