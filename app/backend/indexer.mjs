import { Connection, PublicKey } from '@solana/web3.js'
import { config, POOL_LEN, POOL_SEED, POSITION_LEN, TOKEN_ACCOUNT_LEN, VAULT_SEED } from './config.mjs'
import { decodePool, decodePosition, readTokenAccountAmount } from './decoders.mjs'
import { openDb, setMeta, upsertPool, upsertPosition } from './db.mjs'

const textSeed = (value) => new TextEncoder().encode(value)
const TXLINE_PROGRAM_ID = '6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J'

const u64Seed = (value) => {
  const bytes = new Uint8Array(8)
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true)
  return bytes
}

const findPoolPda = (fixtureId) =>
  PublicKey.findProgramAddressSync([textSeed(POOL_SEED), u64Seed(fixtureId)], config.programId)[0]

const findVaultPda = (poolPubkey) =>
  PublicKey.findProgramAddressSync([textSeed(VAULT_SEED), poolPubkey.toBuffer()], config.programId)[0]

const fetchProgramAccounts = async (connection, dataSize) =>
  connection.getProgramAccounts(config.programId, {
    commitment: 'confirmed',
    filters: [{ dataSize }],
  })

const fetchVaultAmounts = async (connection, pools) => {
  const vaults = pools.map((pool) => ({
    pool,
    vaultPubkey: findVaultPda(new PublicKey(pool.pool_pubkey)),
  }))
  // Batch vault reads to keep RPC usage predictable as pool count grows.
  const infos = await connection.getMultipleAccountsInfo(
    vaults.map((item) => item.vaultPubkey),
    'confirmed',
  )

  return new Map(
    vaults.map((item, index) => {
      const info = infos[index]
      if (!info || info.data.length !== TOKEN_ACCOUNT_LEN) {
        return [item.pool.pool_pubkey, { vault_pubkey: item.vaultPubkey.toBase58(), vault_amount: '0' }]
      }
      return [
        item.pool.pool_pubkey,
        {
          vault_pubkey: item.vaultPubkey.toBase58(),
          vault_amount: readTokenAccountAmount(Buffer.from(info.data)),
        },
      ]
    }),
  )
}

const fetchMissingSettlementTimes = async (connection, db, pools) => {
  const settledAtByPool = new Map()
  const existingStatement = db.prepare('select settled_at from pools where pool_pubkey = ?')

  for (const pool of pools) {
    if (pool.status !== 1 && pool.status !== 2) continue
    if (existingStatement.get(pool.pool_pubkey)?.settled_at) continue

    const signatures = await connection.getSignaturesForAddress(
      new PublicKey(pool.pool_pubkey),
      { limit: 25 },
      'confirmed',
    )
    if (!signatures.length) continue

    // Pool state stores the result but not its wall-clock settlement time. Find
    // a successful transaction that invoked TxLINE and persist that timestamp.
    for (const { signature } of signatures) {
      const transaction = await connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      })
      const isResolution = transaction?.meta?.err === null
        && transaction.meta.logMessages?.some((line) => line.includes(`Program ${TXLINE_PROGRAM_ID} invoke`))
      if (isResolution && transaction.blockTime) {
        settledAtByPool.set(pool.pool_pubkey, transaction.blockTime * 1_000)
        break
      }
    }
  }

  return settledAtByPool
}

export const runIndexerOnce = async ({
  db = openDb(config.dbPath),
  connection = new Connection(config.rpcUrl, 'confirmed'),
  log = console.log,
} = {}) => {
  const startedAt = Date.now()
  const slot = await connection.getSlot('confirmed')

  const [poolAccounts, positionAccounts] = await Promise.all([
    fetchProgramAccounts(connection, POOL_LEN),
    fetchProgramAccounts(connection, POSITION_LEN),
  ])

  const pools = poolAccounts.map(({ pubkey, account }) => decodePool(pubkey, Buffer.from(account.data)))
  const vaultAmounts = await fetchVaultAmounts(connection, pools)
  const settlementTimes = await fetchMissingSettlementTimes(connection, db, pools)
  const positions = positionAccounts.map(({ pubkey, account }) => decodePosition(pubkey, Buffer.from(account.data)))
  const now = Date.now()

  // Pools, positions, and metadata represent one observed Solana slot, so they
  // are committed together or the entire poll is rolled back.
  db.exec('begin immediate;')
  try {
    for (const pool of pools) {
      const expectedPool = findPoolPda(pool.fixture_id).toBase58()
      if (expectedPool !== pool.pool_pubkey) continue
      upsertPool(db, {
        ...pool,
        ...vaultAmounts.get(pool.pool_pubkey),
        updated_slot: slot,
        updated_at: now,
        settled_at: settlementTimes.get(pool.pool_pubkey) ?? null,
      })
    }

    for (const position of positions) {
      upsertPosition(db, {
        ...position,
        updated_slot: slot,
        updated_at: now,
      })
    }

    setMeta(db, 'last_indexed_slot', slot)
    setMeta(db, 'last_indexed_at', now)
    setMeta(db, 'rpc_host', config.rpcHost)
    setMeta(db, 'program_id', config.programId.toBase58())
    db.exec('commit;')
  } catch (error) {
    db.exec('rollback;')
    throw error
  }

  log(
    `[txpools-indexer] slot=${slot} pools=${pools.length} positions=${positions.length} ${Date.now() - startedAt}ms`,
  )

  return { slot, pools: pools.length, positions: positions.length }
}

export const startIndexer = ({
  db = openDb(config.dbPath),
  connection = new Connection(config.rpcUrl, 'confirmed'),
  log = console.log,
} = {}) => {
  let running = false
  let stopped = false
  let timer

  const tick = async () => {
    // Avoid overlapping polls when an RPC cycle takes longer than the interval.
    if (running || stopped) return
    running = true
    try {
      await runIndexerOnce({ db, connection, log })
    } catch (error) {
      console.error('[txpools-indexer] poll failed:', error instanceof Error ? error.message : error)
    } finally {
      running = false
      if (!stopped) timer = setTimeout(tick, config.pollMs)
    }
  }

  void tick()

  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
  }
}

if (process.argv.includes('--once')) {
  await runIndexerOnce()
}
