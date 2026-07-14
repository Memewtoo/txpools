import { computed, ref, watch } from 'vue'
import { PublicKey } from '@solana/web3.js'
import type { MatchPool, Outcome, OutcomeKey, PoolStatus } from '../data/mockData'
import { useTxLinePools } from './useTxLinePools'
import {
  BONUS_POOL_AMOUNT_RAW,
  DEFAULT_PLATFORM_FEE_BPS,
  PoolStatus as ProgramPoolStatus,
  ProgramOutcome,
  fetchIndexedPools,
  findPoolPda,
  findVaultPda,
  programToOutcome,
  rawToUsdc,
  txPoolsClient,
  type IndexedPool,
  type PoolAccount,
} from '../services/txpools'
import type { TxLinePoolState } from '../services/txline'

export interface InitializedPoolState extends TxLinePoolState {
  pool: MatchPool
  onChainPool: PoolAccount
  vaultAmountRaw: bigint
}

const formatUsdc = (amountRaw: bigint) =>
  `${rawToUsdc(amountRaw).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`

const teamCode = (value: string) => value.slice(0, 2).toUpperCase()

const outcomeKeyFromIndex = (index: number): OutcomeKey => {
  if (index === 0) return 'home'
  if (index === 2) return 'away'
  return 'draw'
}

const outcomeLabel = (pool: MatchPool, key: OutcomeKey) => {
  if (key === 'home') return `${pool.home} Win`
  if (key === 'away') return `${pool.away} Win`
  return 'Draw'
}

const programStatusToPoolStatus = (state: TxLinePoolState, onChainPool: PoolAccount): PoolStatus => {
  if (onChainPool.status === ProgramPoolStatus.Resolved || onChainPool.status === ProgramPoolStatus.Swept) {
    return 'Settled'
  }
  return state.pool.status
}

const txlineStateLabel = (state: TxLinePoolState, onChainPool: PoolAccount) => {
  if (onChainPool.status === ProgramPoolStatus.Swept) return 'Unclaimed Pool Swept'
  if (onChainPool.status === ProgramPoolStatus.Resolved) return 'Settled On-Chain'
  if (state.pool.status === 'Ready to Settle') return 'On-Chain Ready'
  if (state.pool.status === 'Upcoming') return 'On-Chain Pool Open'
  return 'Prediction Closed'
}

const multiplierFor = (
  onChainPool: PoolAccount,
  vaultAmountRaw: bigint,
  outcomeAmountRaw: bigint,
) => {
  // Mirror the on-chain payout formula so displayed multipliers never promise
  // more than the current post-fee vault can distribute.
  if (outcomeAmountRaw === 0n) return 0
  const feeBps = BigInt(onChainPool.feeBps || DEFAULT_PLATFORM_FEE_BPS)
  const feeRaw = onChainPool.totalLocked === 0n
    ? 0n
    : (vaultAmountRaw * feeBps) / 10_000n
  const payoutRaw = vaultAmountRaw > feeRaw ? vaultAmountRaw - feeRaw : 0n
  return Number(payoutRaw) / Number(outcomeAmountRaw)
}

const onChainOutcomes = (basePool: MatchPool, onChainPool: PoolAccount, vaultAmountRaw: bigint): Outcome[] => {
  const userTotal = onChainPool.totalLocked
  return onChainPool.outcomeTotals.map((amountRaw, index) => {
    const key = outcomeKeyFromIndex(index)
    const share = userTotal > 0n ? Math.round((Number(amountRaw) / Number(userTotal)) * 100) : 0
    return {
      key,
      label: outcomeLabel(basePool, key),
      multiplier: multiplierFor(onChainPool, vaultAmountRaw, amountRaw),
      share,
      amount: formatUsdc(amountRaw),
      amountRaw: amountRaw.toString(),
    }
  })
}

const withOnChainPool = (
  state: TxLinePoolState,
  onChainPool: PoolAccount,
  vaultAmountRaw: bigint,
  indexedPool?: IndexedPool,
): InitializedPoolState => {
  const fixtureId = Number(onChainPool.fixtureId)
  const [poolAddress] = findPoolPda(fixtureId)
  const [vaultAddress] = findVaultPda(poolAddress)
  const status = programStatusToPoolStatus(state, onChainPool)
  const programWinner = programToOutcome(onChainPool.winningOutcome)
  const winningOutcome = programWinner ?? state.pool.winningOutcome
  const userTotalLocked = onChainPool.totalLocked
  const bonusRaw = vaultAmountRaw >= BONUS_POOL_AMOUNT_RAW
    ? BONUS_POOL_AMOUNT_RAW
    : vaultAmountRaw > userTotalLocked
      ? vaultAmountRaw - userTotalLocked
      : 0n

  return {
    ...state,
    onChainPool,
    vaultAmountRaw,
    pool: {
      ...state.pool,
      fixtureId,
      initializedOnChain: true,
      poolAddress: poolAddress.toBase58(),
      vaultAddress: vaultAddress.toBase58(),
      status,
      predictionClosed: status !== 'Upcoming',
      closeLabel: status === 'Upcoming' ? 'Open until kickoff' : 'Prediction closed',
      txlineState: txlineStateLabel(state, onChainPool),
      totalPool: formatUsdc(vaultAmountRaw),
      totalPoolRaw: vaultAmountRaw.toString(),
      totalLockedRaw: userTotalLocked.toString(),
      userTotalLocked: formatUsdc(userTotalLocked),
      bonusPool: formatUsdc(bonusRaw),
      feeBps: onChainPool.feeBps,
      participants: indexedPool?.participants ?? 0,
      outcomes: onChainOutcomes(state.pool, onChainPool, vaultAmountRaw),
      winningOutcome,
      leaderOutcome: status === 'Settled' ? undefined : state.pool.leaderOutcome,
    },
  }
}

const indexedPoolToAccount = (pool: IndexedPool): PoolAccount => ({
  fixtureId: BigInt(pool.fixture_id),
  admin: new PublicKey(pool.admin_pubkey),
  closeTs: BigInt(pool.close_ts),
  status: pool.status as ProgramPoolStatus,
  totalLocked: BigInt(pool.total_locked),
  outcomeTotals: [BigInt(pool.outcome_home), BigInt(pool.outcome_draw), BigInt(pool.outcome_away)],
  winningOutcome: pool.winning_outcome as ProgramOutcome,
  finalHomeScore: pool.final_home_score,
  finalAwayScore: pool.final_away_score,
  feeBps: pool.fee_bps,
  feeAmount: BigInt(pool.fee_amount),
  netPayoutPool: BigInt(pool.net_payout_pool),
  poolBump: 0,
  vaultBump: 0,
})

const fallbackStateFromIndexedPool = (pool: IndexedPool): TxLinePoolState & { fixtureId: number } => {
  const fixtureId = Number(pool.fixture_id)
  const closeMillis = Number(pool.close_ts) * 1000
  const status: PoolStatus = pool.status === ProgramPoolStatus.Resolved || pool.status === ProgramPoolStatus.Swept
    ? 'Settled'
    : closeMillis > Date.now()
      ? 'Upcoming'
      : 'Ready to Settle'
  const home = `Fixture ${fixtureId}`
  const away = 'TxLINE'

  return {
    source: 'txline',
    fixtureId,
    pool: {
      id: `txline-${fixtureId}`,
      code: `TX-${fixtureId}`,
      fixtureId,
      home,
      away,
      homeCode: teamCode(home),
      awayCode: teamCode(away),
      score: pool.status === ProgramPoolStatus.Resolved || pool.status === ProgramPoolStatus.Swept
        ? `${pool.final_home_score} - ${pool.final_away_score}`
        : 'VS',
      minute: status === 'Upcoming' ? 'Open' : status === 'Settled' ? 'Settled' : 'Result pending',
      time: 'Indexed TxPools pool',
      startsAt: closeMillis,
      predictionClosed: status !== 'Upcoming',
      closeLabel: status === 'Upcoming' ? 'Open until kickoff' : 'Prediction closed',
      status,
      totalPool: formatUsdc(BigInt(pool.vault_amount)),
      totalPoolRaw: pool.vault_amount,
      totalLockedRaw: pool.total_locked,
      participants: pool.participants,
      txlineState: status === 'Upcoming' ? 'Indexed Pool Open' : 'Indexed Pool',
      outcomes: [
        { key: 'home', label: `${home} Win`, multiplier: 0, share: 0, amount: formatUsdc(BigInt(pool.outcome_home)), amountRaw: pool.outcome_home },
        { key: 'draw', label: 'Draw', multiplier: 0, share: 0, amount: formatUsdc(BigInt(pool.outcome_draw)), amountRaw: pool.outcome_draw },
        { key: 'away', label: `${away} Win`, multiplier: 0, share: 0, amount: formatUsdc(BigInt(pool.outcome_away)), amountRaw: pool.outcome_away },
      ],
    },
  }
}

export const useInitializedTxPools = () => {
  const txLine = useTxLinePools()
  const initializedPoolStates = ref<InitializedPoolState[]>([])
  const indexedPools = ref<IndexedPool[]>([])
  const rpcPoolOverrides = new Map<number, { onChainPool: PoolAccount; vaultAmountRaw: bigint }>()
  const onChainLoading = ref(false)
  const onChainError = ref<string>()
  const indexerError = ref<string>()

  const rebuildFromIndexedPools = () => {
    if (!indexedPools.value.length) return false

    // TxLINE supplies match metadata while the indexer supplies authoritative
    // program balances and status. Fixture ID is the stable join key.
    const txLineByFixture = new Map(
      txLine.poolStates.value
        .filter((state): state is TxLinePoolState & { fixtureId: number } =>
          state.source === 'txline' && typeof state.fixtureId === 'number',
        )
        .map((state) => [String(state.fixtureId), state]),
    )

    initializedPoolStates.value = indexedPools.value.map((indexedPool) => {
      const state = txLineByFixture.get(indexedPool.fixture_id) ?? fallbackStateFromIndexedPool(indexedPool)
      const fixtureId = Number(indexedPool.fixture_id)
      const indexedAccount = indexedPoolToAccount(indexedPool)
      const indexedVaultAmount = BigInt(indexedPool.vault_amount)
      const override = rpcPoolOverrides.get(fixtureId)

      // Keep a confirmed post-transaction read visible until the polling
      // indexer reaches the same pool totals and vault balance.
      if (
        override
        && override.onChainPool.totalLocked === indexedAccount.totalLocked
        && override.onChainPool.outcomeTotals.every((amount, index) => amount === indexedAccount.outcomeTotals[index])
        && override.vaultAmountRaw === indexedVaultAmount
      ) {
        rpcPoolOverrides.delete(fixtureId)
      }

      const current = rpcPoolOverrides.get(fixtureId)
      return withOnChainPool(
        state,
        current?.onChainPool ?? indexedAccount,
        current?.vaultAmountRaw ?? indexedVaultAmount,
        indexedPool,
      )
    })

    return true
  }

  const refreshInitializedPools = async ({ fallbackToBrowserRpc = true } = {}) => {
    onChainLoading.value = true
    onChainError.value = undefined
    indexerError.value = undefined

    // Prefer the local read model to avoid one browser RPC request per pool.
    try {
      indexedPools.value = await fetchIndexedPools()
      if (rebuildFromIndexedPools()) return
    } catch (caught) {
      indexedPools.value = []
      indexerError.value = caught instanceof Error ? caught.message : 'Unable to read TxPools indexer API.'
    }

    if (!fallbackToBrowserRpc) {
      initializedPoolStates.value = []
      onChainLoading.value = false
      return
    }

    // Direct RPC keeps the app usable when the optional indexer is offline.
    const candidates = txLine.poolStates.value.filter(
      (state): state is TxLinePoolState & { fixtureId: number } =>
        state.source === 'txline' && typeof state.fixtureId === 'number',
    )

    if (!candidates.length) {
      initializedPoolStates.value = []
      return
    }

    try {
      const results = await Promise.all(
        candidates.map(async (state) => {
          const onChainPool = await txPoolsClient.fetchPool(state.fixtureId)
          if (!onChainPool) return undefined
          const vaultAmountRaw = await txPoolsClient.fetchVaultAmount(state.fixtureId)
          return withOnChainPool(state, onChainPool, vaultAmountRaw)
        }),
      )
      initializedPoolStates.value = results.filter(
        (state): state is InitializedPoolState => Boolean(state),
      )
    } catch (caught) {
      onChainError.value = caught instanceof Error ? caught.message : 'Unable to read initialized TxPools pools.'
    } finally {
      onChainLoading.value = false
    }
  }

  const refreshInitializedPoolFromRpc = async (fixtureId: number) => {
    const onChainPool = await txPoolsClient.fetchPool(fixtureId)
    if (!onChainPool) return false

    const vaultAmountRaw = await txPoolsClient.fetchVaultAmount(fixtureId)
    rpcPoolOverrides.set(fixtureId, { onChainPool, vaultAmountRaw })

    if (rebuildFromIndexedPools()) return true

    const state = txLine.poolStates.value.find(
      (candidate): candidate is TxLinePoolState & { fixtureId: number } =>
        candidate.source === 'txline' && candidate.fixtureId === fixtureId,
    )
    if (!state) return false

    const refreshed = withOnChainPool(state, onChainPool, vaultAmountRaw)
    const existingIndex = initializedPoolStates.value.findIndex((candidate) => candidate.fixtureId === fixtureId)
    if (existingIndex === -1) {
      initializedPoolStates.value = [...initializedPoolStates.value, refreshed]
    } else {
      initializedPoolStates.value = initializedPoolStates.value.map((candidate, index) =>
        index === existingIndex ? refreshed : candidate,
      )
    }
    return true
  }

  watch(
    txLine.poolStates,
    () => {
      if (!rebuildFromIndexedPools()) void refreshInitializedPools()
    },
    { immediate: true },
  )

  const initializedPools = computed(() => initializedPoolStates.value.map((state) => state.pool))
  const initializedFixtureIds = computed(() => new Set(initializedPoolStates.value.map((state) => state.fixtureId)))

  return {
    ...txLine,
    initializedPoolStates,
    initializedPools,
    initializedFixtureIds,
    indexedPools,
    onChainLoading,
    onChainError,
    indexerError,
    refreshInitializedPools,
    refreshInitializedPoolFromRpc,
  }
}
