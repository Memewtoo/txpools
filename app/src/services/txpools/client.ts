import { Connection, PublicKey, type Commitment } from '@solana/web3.js'
import {
  TXPOOLS_BROWSER_RPC_URL,
  TXPOOLS_BROWSER_RPC_WS_URL,
  TXPOOLS_BROWSER_TRANSACTION_RPC_URL,
  TXPOOLS_BROWSER_TRANSACTION_RPC_WS_URL,
  TXPOOLS_PROGRAM_ID,
} from './constants'
import {
  decodeConfig,
  decodePool,
  decodePosition,
  outcomeToProgram,
  type ConfigAccount,
  type PoolAccount,
  type PositionAccount,
  type ProgramOutcome,
} from './layouts'
import {
  findConfigPda,
  findPoolPda,
  findPositionPda,
  findVaultPda,
  getUserUsdcAccount,
} from './pda'
import type { OutcomeKey } from '../../data/mockData'

export interface TxPoolsAddresses {
  config: PublicKey
  pool: PublicKey
  vault: PublicKey
}

const chunk = <T>(items: T[], size: number) => {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

const toOutcome = (outcome: OutcomeKey | ProgramOutcome) =>
  typeof outcome === 'number' ? outcome : outcomeToProgram(outcome)

export const createTxPoolsConnection = (
  endpoint = TXPOOLS_BROWSER_RPC_URL,
  commitment: Commitment = 'confirmed',
  wsEndpoint = endpoint === TXPOOLS_BROWSER_RPC_URL ? TXPOOLS_BROWSER_RPC_WS_URL : undefined,
) => new Connection(endpoint, { commitment, wsEndpoint })

export const txPoolsTransactionConnection = createTxPoolsConnection(
  TXPOOLS_BROWSER_TRANSACTION_RPC_URL,
  'confirmed',
  TXPOOLS_BROWSER_TRANSACTION_RPC_WS_URL,
)

// Reads may use a hosted RPC/indexer while transaction blockhashes, submission,
// and confirmation use the dedicated transaction connection above.

export class TxPoolsClient {
  readonly connection: Connection

  constructor(connection = createTxPoolsConnection()) {
    this.connection = connection
  }

  getConfigAddress() {
    return findConfigPda()[0]
  }

  getPoolAddress(fixtureId: bigint | number) {
    return findPoolPda(fixtureId)[0]
  }

  getVaultAddress(fixtureIdOrPool: bigint | number | PublicKey) {
    const pool = fixtureIdOrPool instanceof PublicKey ? fixtureIdOrPool : this.getPoolAddress(fixtureIdOrPool)
    return findVaultPda(pool)[0]
  }

  getPositionAddress(
    fixtureIdOrPool: bigint | number | PublicKey,
    user: PublicKey,
    outcome: OutcomeKey | ProgramOutcome,
  ) {
    const pool = fixtureIdOrPool instanceof PublicKey ? fixtureIdOrPool : this.getPoolAddress(fixtureIdOrPool)
    return findPositionPda(pool, user, toOutcome(outcome))[0]
  }

  getUserUsdcAccount(user: PublicKey) {
    return getUserUsdcAccount(user)
  }

  getPoolAddresses(fixtureId: bigint | number): TxPoolsAddresses {
    const config = this.getConfigAddress()
    const pool = this.getPoolAddress(fixtureId)
    const vault = this.getVaultAddress(pool)
    return { config, pool, vault }
  }

  async fetchConfig(): Promise<ConfigAccount | undefined> {
    const info = await this.connection.getAccountInfo(this.getConfigAddress())
    if (!info) return undefined
    this.requireOwner(info.owner, 'Config')
    return decodeConfig(info.data)
  }

  async fetchPool(fixtureId: bigint | number): Promise<PoolAccount | undefined> {
    const info = await this.connection.getAccountInfo(this.getPoolAddress(fixtureId))
    if (!info) return undefined
    this.requireOwner(info.owner, 'Pool')
    return decodePool(info.data)
  }

  async fetchPools(fixtureIds: Array<bigint | number>): Promise<Map<number, PoolAccount>> {
    const uniqueFixtureIds = [...new Set(fixtureIds.map((fixtureId) => Number(fixtureId)))]
    const pools = new Map<number, PoolAccount>()

    // getMultipleAccountsInfo accepts at most 100 addresses per request.
    for (const fixtureIdChunk of chunk(uniqueFixtureIds, 100)) {
      const addresses = fixtureIdChunk.map((fixtureId) => this.getPoolAddress(fixtureId))
      const infos = await this.connection.getMultipleAccountsInfo(addresses, 'confirmed')

      infos.forEach((info, index) => {
        if (!info) return
        this.requireOwner(info.owner, 'Pool')
        pools.set(fixtureIdChunk[index], decodePool(info.data))
      })
    }

    return pools
  }

  async fetchVaultAmount(fixtureIdOrPool: bigint | number | PublicKey): Promise<bigint> {
    const vault = this.getVaultAddress(fixtureIdOrPool)
    const balance = await this.connection.getTokenAccountBalance(vault)
    return BigInt(balance.value.amount)
  }

  async fetchPosition(
    fixtureIdOrPool: bigint | number | PublicKey,
    user: PublicKey,
    outcome: OutcomeKey | ProgramOutcome,
  ): Promise<PositionAccount | undefined> {
    const info = await this.connection.getAccountInfo(
      this.getPositionAddress(fixtureIdOrPool, user, outcome),
    )
    if (!info) return undefined
    this.requireOwner(info.owner, 'Position')
    return decodePosition(info.data)
  }

  private requireOwner(owner: PublicKey, accountName: string) {
    if (!owner.equals(TXPOOLS_PROGRAM_ID)) {
      throw new Error(`${accountName} account is not owned by TxPools program.`)
    }
  }
}

export const txPoolsClient = new TxPoolsClient()
