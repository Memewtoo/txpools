import type { MatchPool, OutcomeKey } from '../../data/mockData'
import type { SettlementPreview, TxLinePoolState } from '../txline'
import {
  BONUS_POOL_AMOUNT_USDC,
  DEFAULT_PLATFORM_FEE_BPS,
  TXLINE_AWAY_SCORE_STAT_KEY,
  TXLINE_HOME_SCORE_STAT_KEY,
  TXPOOLS_PROGRAM_ID,
} from '../txpools'

export interface LocalSettlementSimulation {
  poolId: string
  fixtureId?: number
  seq?: number
  match: string
  score: string
  statusLabel: string
  isFinal: boolean
  winningLabel: string
  winningOutcome?: OutcomeKey
  totalPoolUsdc: number
  userTotalLockedUsdc: number
  bonusPoolUsdc: number
  winningPoolUsdc: number
  platformFeeUsdc: number
  payoutPoolUsdc: number
  payoutMultiplier: number
  estimatedWinners: number
  userPrediction: string
  userLockedUsdc: number
  userClaimableUsdc: number
  userResultLabel: string
  proofHash: string
  onChainFields: Array<{ label: string; value: string }>
}

const PLATFORM_FEE_RATE = DEFAULT_PLATFORM_FEE_BPS / 10_000
const LOCAL_USER_LOCK_USDC = 250

const parseUsdc = (value: string) => Number(value.replace(/[^\d.]/g, '')) || 0

const scoreOutcome = (score: string): OutcomeKey | undefined => {
  const [homeRaw, awayRaw] = score.split('-').map((part) => Number(part.trim()))
  if (!Number.isFinite(homeRaw) || !Number.isFinite(awayRaw)) return undefined
  if (homeRaw > awayRaw) return 'home'
  if (homeRaw < awayRaw) return 'away'
  return 'draw'
}

const formatUsdc = (value: number) =>
  `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`

const participantsOf = (pool: MatchPool) => pool.participants ?? 0

const simulationFor = (
  state: TxLinePoolState,
  preview: SettlementPreview | undefined,
): LocalSettlementSimulation | undefined => {
  // This preview mirrors protocol economics for UI testing only. It never
  // mutates a PDA or substitutes for resolve_pool proof validation.
  const pool = state.pool
  const userTotalLockedUsdc = parseUsdc(pool.totalPool)
  const bonusPoolUsdc = BONUS_POOL_AMOUNT_USDC
  const totalPoolUsdc = userTotalLockedUsdc + bonusPoolUsdc
  if (!totalPoolUsdc) return undefined

  const isFinal = pool.status === 'Ready to Settle' || pool.status === 'Settled'
  const winningOutcome = isFinal ? preview?.winningOutcome ?? scoreOutcome(pool.score) : scoreOutcome(pool.score)
  if (!winningOutcome) return undefined

  const winningPool = pool.outcomes.find((outcome) => outcome.key === winningOutcome)
  if (!winningPool) return undefined

  const winningPoolUsdc = parseUsdc(winningPool.amount)
  const hasUserWinners = winningPoolUsdc > 0
  const hasParticipants = userTotalLockedUsdc > 0
  const platformFeeUsdc = hasUserWinners && hasParticipants ? totalPoolUsdc * PLATFORM_FEE_RATE : 0
  const payoutPoolUsdc = Math.max(totalPoolUsdc - platformFeeUsdc, 0)
  const payoutMultiplier = hasUserWinners ? payoutPoolUsdc / winningPoolUsdc : 0
  const userClaimableUsdc = hasUserWinners ? LOCAL_USER_LOCK_USDC * payoutMultiplier : 0
  const estimatedWinners = hasUserWinners
    ? Math.max(1, Math.round(participantsOf(pool) * (winningPool.share / 100)))
    : 0
  const proofHash = preview?.proofHash ?? `fixture:${state.fixtureId ?? pool.id}:seq:${state.seq ?? 'pending'}`
  const statusLabel = isFinal ? 'Final result simulation' : 'If final now'

  return {
    poolId: pool.id,
    fixtureId: state.fixtureId,
    seq: state.seq,
    match: `${pool.home} vs ${pool.away}`,
    score: pool.score,
    statusLabel,
    isFinal,
    winningLabel: isFinal ? winningPool.label : `${winningPool.label.replace(' Win', '')} leading`,
    winningOutcome,
    totalPoolUsdc,
    userTotalLockedUsdc,
    bonusPoolUsdc,
    winningPoolUsdc,
    platformFeeUsdc,
    payoutPoolUsdc,
    payoutMultiplier,
    estimatedWinners,
    userPrediction: winningPool.label,
    userLockedUsdc: LOCAL_USER_LOCK_USDC,
    userClaimableUsdc,
    userResultLabel: isFinal ? 'Claimable after settlement' : 'Projected only while match is live',
    proofHash,
    onChainFields: [
      { label: 'fixture_id', value: String(state.fixtureId ?? 'pending') },
      { label: 'score', value: pool.score },
      { label: 'winning_outcome', value: winningPool.key },
      { label: 'user_total_locked_usdc', value: formatUsdc(userTotalLockedUsdc) },
      { label: 'bonus_pool_usdc', value: formatUsdc(bonusPoolUsdc) },
      { label: 'gross_payout_pool_usdc', value: formatUsdc(totalPoolUsdc) },
      { label: 'user_winning_pool_usdc', value: formatUsdc(winningPoolUsdc) },
      { label: 'platform_fee_bps', value: String(DEFAULT_PLATFORM_FEE_BPS) },
      { label: 'fee_rule', value: '0 if no user winners or no participants' },
      { label: 'program_id', value: TXPOOLS_PROGRAM_ID.toBase58() },
      { label: 'pool_seed', value: '["pool", fixture_id_le_u64]' },
      { label: 'vault_seed', value: '["vault", pool]' },
      { label: 'position_seed', value: '["position", pool, user, outcome]' },
      { label: 'txline_seq', value: String(state.seq ?? 'pending') },
      { label: 'txline_stat_keys', value: `${TXLINE_HOME_SCORE_STAT_KEY}, ${TXLINE_AWAY_SCORE_STAT_KEY}` },
      { label: 'resolve_payload', value: 'home_score + away_score + validate_stat x2' },
      { label: 'proof_reference', value: proofHash },
      { label: 'settlement_mode', value: 'frontend simulation only' },
    ],
  }
}

export const makeLocalSettlementSimulations = (
  states: TxLinePoolState[],
  previews: SettlementPreview[],
) =>
  states
    .map((state) => simulationFor(state, previews.find((preview) => preview.poolId === state.pool.id)))
    .filter((simulation): simulation is LocalSettlementSimulation => Boolean(simulation))

export const formatSettlementUsdc = formatUsdc
