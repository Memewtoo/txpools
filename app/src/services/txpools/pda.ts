import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { PublicKey } from '@solana/web3.js'
import {
  CONFIG_SEED,
  DAILY_SCORES_SEED,
  POOL_SEED,
  POSITION_SEED,
  TXLINE_PROGRAM_ID,
  TXPOOLS_PROGRAM_ID,
  TXPOOLS_USDC_MINT,
  VAULT_SEED,
} from './constants'
import { ProgramOutcome } from './layouts'

const textSeed = (value: string) => new TextEncoder().encode(value)

const u64Seed = (value: bigint | number) => {
  const bytes = new Uint8Array(8)
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true)
  return bytes
}

const u16Seed = (value: number) => {
  const bytes = new Uint8Array(2)
  new DataView(bytes.buffer).setUint16(0, value, true)
  return bytes
}

export const findConfigPda = () =>
  PublicKey.findProgramAddressSync([textSeed(CONFIG_SEED)], TXPOOLS_PROGRAM_ID)

export const findPoolPda = (fixtureId: bigint | number) =>
  PublicKey.findProgramAddressSync([textSeed(POOL_SEED), u64Seed(fixtureId)], TXPOOLS_PROGRAM_ID)

export const findVaultPda = (pool: PublicKey) =>
  PublicKey.findProgramAddressSync([textSeed(VAULT_SEED), pool.toBuffer()], TXPOOLS_PROGRAM_ID)

export const findPositionPda = (
  pool: PublicKey,
  user: PublicKey,
  outcome: ProgramOutcome,
) =>
  PublicKey.findProgramAddressSync(
    [textSeed(POSITION_SEED), pool.toBuffer(), user.toBuffer(), Uint8Array.of(outcome)],
    TXPOOLS_PROGRAM_ID,
  )

export const findDailyScoresPda = (epochDay: number) =>
  PublicKey.findProgramAddressSync([textSeed(DAILY_SCORES_SEED), u16Seed(epochDay)], TXLINE_PROGRAM_ID)

export const getUserUsdcAccount = (owner: PublicKey) =>
  getAssociatedTokenAddressSync(TXPOOLS_USDC_MINT, owner, false, TOKEN_PROGRAM_ID)
