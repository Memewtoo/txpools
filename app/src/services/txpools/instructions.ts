import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import {
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js'
import { Buffer } from 'buffer'
import type { OutcomeKey } from '../../data/mockData'
import {
  DEFAULT_PLATFORM_FEE_BPS,
  TXLINE_PROGRAM_ID,
  TXPOOLS_PROGRAM_ID,
  TXPOOLS_USDC_MINT,
} from './constants'
import {
  TxPoolsInstruction,
  concatBytes,
  i64Le,
  outcomeToProgram,
  u16Le,
  u64Le,
  type ProgramOutcome,
} from './layouts'
import {
  findConfigPda,
  findDailyScoresPda,
  findPoolPda,
  findPositionPda,
  findVaultPda,
  getUserUsdcAccount,
} from './pda'

// TxPools has no Anchor IDL. These builders are the client-side ABI and must
// stay byte-for-byte aligned with the Pinocchio instruction handlers.

type WritableSigner = { pubkey: PublicKey; isSigner: true; isWritable: true }

const instructionData = (...parts: Array<Uint8Array | number[]>) => {
  const bytes = concatBytes(...parts)
  return Buffer.from(bytes)
}

const signerWritable = (pubkey: PublicKey): WritableSigner => ({
  pubkey,
  isSigner: true,
  isWritable: true,
})

const readonly = (pubkey: PublicKey, isSigner = false) => ({
  pubkey,
  isSigner,
  isWritable: false,
})

const writable = (pubkey: PublicKey, isSigner = false) => ({
  pubkey,
  isSigner,
  isWritable: true,
})

const asProgramOutcome = (outcome: OutcomeKey | ProgramOutcome) =>
  typeof outcome === 'number' ? outcome : outcomeToProgram(outcome)

export interface InitializeConfigInstructionParams {
  admin: PublicKey
  feeRecipient: PublicKey
  feeBps?: number
}

export interface InitializePoolInstructionParams {
  admin: PublicKey
  fixtureId: bigint | number
  closeTs: bigint | number
  adminUsdcAccount?: PublicKey
}

export interface LockPredictionInstructionParams {
  user: PublicKey
  fixtureId: bigint | number
  outcome: OutcomeKey | ProgramOutcome
  amountRaw: bigint | number
  userUsdcAccount?: PublicKey
}

export interface ResolvePoolInstructionParams {
  resolver: PublicKey
  fixtureId: bigint | number
  feeRecipientToken: PublicKey
  finalHomeScore: number
  finalAwayScore: number
  homeValidateStatData: Uint8Array
  awayValidateStatData: Uint8Array
  epochDay?: number
  dailyScoresMerkleRoots?: PublicKey
}

export interface ClaimWinningsInstructionParams {
  user: PublicKey
  fixtureId: bigint | number
  outcome: OutcomeKey | ProgramOutcome
  userUsdcAccount?: PublicKey
}

export interface SweepUnclaimedPoolInstructionParams {
  admin: PublicKey
  fixtureId: bigint | number
  feeRecipientToken: PublicKey
}

export const initializeConfigInstruction = ({
  admin,
  feeRecipient,
  feeBps = DEFAULT_PLATFORM_FEE_BPS,
}: InitializeConfigInstructionParams) => {
  const [config] = findConfigPda()

  return new TransactionInstruction({
    programId: TXPOOLS_PROGRAM_ID,
    keys: [
      signerWritable(admin),
      writable(config),
      readonly(feeRecipient),
      readonly(SystemProgram.programId),
      readonly(SYSVAR_RENT_PUBKEY),
    ],
    data: instructionData([TxPoolsInstruction.InitializeConfig], u16Le(feeBps)),
  })
}

export const initializePoolInstruction = ({
  admin,
  fixtureId,
  closeTs,
  adminUsdcAccount = getUserUsdcAccount(admin),
}: InitializePoolInstructionParams) => {
  const [config] = findConfigPda()
  const [pool] = findPoolPda(fixtureId)
  const [vault] = findVaultPda(pool)

  return new TransactionInstruction({
    programId: TXPOOLS_PROGRAM_ID,
    keys: [
      signerWritable(admin),
      readonly(config),
      writable(pool),
      writable(vault),
      writable(adminUsdcAccount),
      readonly(TXPOOLS_USDC_MINT),
      readonly(TOKEN_PROGRAM_ID),
      readonly(SystemProgram.programId),
      readonly(SYSVAR_RENT_PUBKEY),
    ],
    data: instructionData(
      [TxPoolsInstruction.InitializePool],
      u64Le(fixtureId),
      i64Le(closeTs),
    ),
  })
}

export const lockPredictionInstruction = ({
  user,
  fixtureId,
  outcome,
  amountRaw,
  userUsdcAccount = getUserUsdcAccount(user),
}: LockPredictionInstructionParams) => {
  const programOutcome = asProgramOutcome(outcome)
  const [pool] = findPoolPda(fixtureId)
  const [position] = findPositionPda(pool, user, programOutcome)
  const [vault] = findVaultPda(pool)

  return new TransactionInstruction({
    programId: TXPOOLS_PROGRAM_ID,
    keys: [
      signerWritable(user),
      writable(pool),
      writable(position),
      writable(userUsdcAccount),
      writable(vault),
      readonly(TXPOOLS_USDC_MINT),
      readonly(TOKEN_PROGRAM_ID),
      readonly(SystemProgram.programId),
      readonly(SYSVAR_RENT_PUBKEY),
    ],
    data: instructionData(
      [TxPoolsInstruction.LockPrediction],
      [programOutcome],
      u64Le(amountRaw),
    ),
  })
}

export const resolvePoolInstruction = ({
  resolver,
  fixtureId,
  feeRecipientToken,
  finalHomeScore,
  finalAwayScore,
  homeValidateStatData,
  awayValidateStatData,
  epochDay,
  dailyScoresMerkleRoots,
}: ResolvePoolInstructionParams) => {
  const [config] = findConfigPda()
  const [pool] = findPoolPda(fixtureId)
  const [vault] = findVaultPda(pool)
  const dailyScores =
    dailyScoresMerkleRoots ?? (epochDay === undefined ? undefined : findDailyScoresPda(epochDay)[0])

  if (!dailyScores) {
    throw new Error('resolve_pool requires either epochDay or dailyScoresMerkleRoots.')
  }

  // Prefix both opaque TxLINE blobs with u16 lengths so Rust can split them
  // without introducing a general-purpose serializer on-chain.
  return new TransactionInstruction({
    programId: TXPOOLS_PROGRAM_ID,
    keys: [
      readonly(resolver, true),
      readonly(config),
      writable(pool),
      writable(vault),
      writable(feeRecipientToken),
      readonly(TXPOOLS_USDC_MINT),
      readonly(TOKEN_PROGRAM_ID),
      readonly(TXLINE_PROGRAM_ID),
      readonly(dailyScores),
    ],
    data: instructionData(
      [TxPoolsInstruction.ResolvePool],
      u16Le(finalHomeScore),
      u16Le(finalAwayScore),
      u16Le(homeValidateStatData.length),
      homeValidateStatData,
      u16Le(awayValidateStatData.length),
      awayValidateStatData,
    ),
  })
}

export const claimWinningsInstruction = ({
  user,
  fixtureId,
  outcome,
  userUsdcAccount = getUserUsdcAccount(user),
}: ClaimWinningsInstructionParams) => {
  const programOutcome = asProgramOutcome(outcome)
  const [pool] = findPoolPda(fixtureId)
  const [position] = findPositionPda(pool, user, programOutcome)
  const [vault] = findVaultPda(pool)

  return new TransactionInstruction({
    programId: TXPOOLS_PROGRAM_ID,
    keys: [
      signerWritable(user),
      writable(pool),
      writable(position),
      writable(vault),
      writable(userUsdcAccount),
      readonly(TXPOOLS_USDC_MINT),
      readonly(TOKEN_PROGRAM_ID),
    ],
    data: instructionData([TxPoolsInstruction.ClaimWinnings]),
  })
}

export const sweepUnclaimedPoolInstruction = ({
  admin,
  fixtureId,
  feeRecipientToken,
}: SweepUnclaimedPoolInstructionParams) => {
  const [config] = findConfigPda()
  const [pool] = findPoolPda(fixtureId)
  const [vault] = findVaultPda(pool)

  return new TransactionInstruction({
    programId: TXPOOLS_PROGRAM_ID,
    keys: [
      readonly(admin, true),
      readonly(config),
      writable(pool),
      writable(vault),
      writable(feeRecipientToken),
      readonly(TXPOOLS_USDC_MINT),
      readonly(TOKEN_PROGRAM_ID),
    ],
    data: instructionData([TxPoolsInstruction.SweepUnclaimedPool]),
  })
}
