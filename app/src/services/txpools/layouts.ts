import { PublicKey } from '@solana/web3.js'
import type { OutcomeKey } from '../../data/mockData'

export const enum TxPoolsInstruction {
  InitializeConfig = 0,
  InitializePool = 1,
  LockPrediction = 2,
  ResolvePool = 3,
  ClaimWinnings = 4,
  SweepUnclaimedPool = 5,
}

export const CONFIG_LEN = 68
export const POOL_LEN = 107
export const POSITION_LEN = 76

// Offsets below mirror the fixed Rust account layouts. BigInt keeps raw USDC
// and fixture identifiers lossless across the JavaScript boundary.

export const enum PoolStatus {
  Open = 0,
  Resolved = 1,
  Swept = 2,
}

export const enum ProgramOutcome {
  Home = 0,
  Draw = 1,
  Away = 2,
  None = 255,
}

export interface ConfigAccount {
  admin: PublicKey
  feeRecipient: PublicKey
  feeBps: number
  bump: number
}

export interface PoolAccount {
  fixtureId: bigint
  admin: PublicKey
  closeTs: bigint
  status: PoolStatus
  totalLocked: bigint
  outcomeTotals: [bigint, bigint, bigint]
  winningOutcome: ProgramOutcome
  finalHomeScore: number
  finalAwayScore: number
  feeBps: number
  feeAmount: bigint
  netPayoutPool: bigint
  poolBump: number
  vaultBump: number
}

export interface PositionAccount {
  user: PublicKey
  pool: PublicKey
  outcome: ProgramOutcome
  amount: bigint
  claimed: boolean
  bump: number
}

export const outcomeToProgram = (outcome: OutcomeKey): ProgramOutcome => {
  if (outcome === 'home') return ProgramOutcome.Home
  if (outcome === 'away') return ProgramOutcome.Away
  return ProgramOutcome.Draw
}

export const programToOutcome = (outcome: ProgramOutcome): OutcomeKey | undefined => {
  if (outcome === ProgramOutcome.Home) return 'home'
  if (outcome === ProgramOutcome.Draw) return 'draw'
  if (outcome === ProgramOutcome.Away) return 'away'
  return undefined
}

export const u16Le = (value: number) => {
  const bytes = new Uint8Array(2)
  new DataView(bytes.buffer).setUint16(0, value, true)
  return bytes
}

export const u64Le = (value: bigint | number) => {
  const bytes = new Uint8Array(8)
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true)
  return bytes
}

export const i64Le = (value: bigint | number) => {
  const bytes = new Uint8Array(8)
  new DataView(bytes.buffer).setBigInt64(0, BigInt(value), true)
  return bytes
}

export const concatBytes = (...parts: Array<Uint8Array | number[]>) => {
  const normalized = parts.map((part) => (part instanceof Uint8Array ? part : Uint8Array.from(part)))
  const length = normalized.reduce((total, part) => total + part.length, 0)
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const part of normalized) {
    bytes.set(part, offset)
    offset += part.length
  }
  return bytes
}

const requireLength = (data: Uint8Array, minLength: number, accountName: string) => {
  if (data.length < minLength) throw new Error(`${accountName} account is too small.`)
}

const readPubkey = (data: Uint8Array, offset: number) => new PublicKey(data.slice(offset, offset + 32))
const readU16 = (data: Uint8Array, offset: number) => new DataView(data.buffer, data.byteOffset + offset, 2).getUint16(0, true)
const readU64 = (data: Uint8Array, offset: number) => new DataView(data.buffer, data.byteOffset + offset, 8).getBigUint64(0, true)
const readI64 = (data: Uint8Array, offset: number) => new DataView(data.buffer, data.byteOffset + offset, 8).getBigInt64(0, true)

export const decodeConfig = (data: Uint8Array): ConfigAccount => {
  requireLength(data, CONFIG_LEN, 'Config')
  if (data[0] !== 1) throw new Error('Invalid config discriminator.')
  return {
    admin: readPubkey(data, 1),
    feeRecipient: readPubkey(data, 33),
    feeBps: readU16(data, 65),
    bump: data[67],
  }
}

export const decodePool = (data: Uint8Array): PoolAccount => {
  requireLength(data, POOL_LEN, 'Pool')
  if (data[0] !== 2) throw new Error('Invalid pool discriminator.')
  return {
    fixtureId: readU64(data, 1),
    admin: readPubkey(data, 9),
    closeTs: readI64(data, 41),
    status: data[49] as PoolStatus,
    totalLocked: readU64(data, 50),
    outcomeTotals: [readU64(data, 58), readU64(data, 66), readU64(data, 74)],
    winningOutcome: data[82] as ProgramOutcome,
    finalHomeScore: readU16(data, 83),
    finalAwayScore: readU16(data, 85),
    feeBps: readU16(data, 87),
    feeAmount: readU64(data, 89),
    netPayoutPool: readU64(data, 97),
    poolBump: data[105],
    vaultBump: data[106],
  }
}

export const decodePosition = (data: Uint8Array): PositionAccount => {
  requireLength(data, POSITION_LEN, 'Position')
  if (data[0] !== 3) throw new Error('Invalid position discriminator.')
  return {
    user: readPubkey(data, 1),
    pool: readPubkey(data, 33),
    outcome: data[65] as ProgramOutcome,
    amount: readU64(data, 66),
    claimed: data[74] === 1,
    bump: data[75],
  }
}

export const usdcToRaw = (amount: number, decimals = 6) => BigInt(Math.round(amount * 10 ** decimals))
export const rawToUsdc = (amount: bigint, decimals = 6) => Number(amount) / 10 ** decimals
