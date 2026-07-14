import { getMetaRows } from './db.mjs'

const participantCountsSql = `
  select pool_pubkey, count(distinct user_pubkey) as participants
  from positions
  where cast(amount as integer) > 0
  group by pool_pubkey
`

const positionCountsSql = `
  select pool_pubkey, count(*) as positions
  from positions
  where cast(amount as integer) > 0
  group by pool_pubkey
`

// Participant count is derived from distinct position owners instead of
// consuming bytes in every on-chain Pool account.

const toCountMap = (rows, key) => new Map(rows.map((row) => [row.pool_pubkey, Number(row[key])]))

const enrichPools = (db, pools) => {
  const participants = toCountMap(db.prepare(participantCountsSql).all(), 'participants')
  const positions = toCountMap(db.prepare(positionCountsSql).all(), 'positions')

  return pools.map((pool) => ({
    ...pool,
    participants: participants.get(pool.pool_pubkey) ?? 0,
    positions: positions.get(pool.pool_pubkey) ?? 0,
  }))
}

export const listPools = (db) => enrichPools(
  db,
  db.prepare('select * from pools order by cast(fixture_id as integer) asc').all(),
)

export const getPoolByFixtureId = (db, fixtureId) => {
  const pool = db.prepare('select * from pools where fixture_id = ? limit 1').get(String(fixtureId))
  if (!pool) return undefined
  return enrichPools(db, [pool])[0]
}

export const listPositions = (db, { poolPubkey, userPubkey } = {}) => {
  let sql = 'select * from positions'
  const clauses = []
  const params = []

  if (poolPubkey) {
    clauses.push('pool_pubkey = ?')
    params.push(poolPubkey)
  }
  if (userPubkey) {
    clauses.push('user_pubkey = ?')
    params.push(userPubkey)
  }
  if (clauses.length) sql += ` where ${clauses.join(' and ')}`
  sql += ' order by updated_at desc'

  return db.prepare(sql).all(...params)
}

export const getPoolParticipants = (db, poolPubkey) => ({
  pool_pubkey: poolPubkey,
  participants: Number(
    db.prepare(`
      select count(distinct user_pubkey) as participants
      from positions
      where pool_pubkey = ?
        and cast(amount as integer) > 0
    `).get(poolPubkey)?.participants ?? 0,
  ),
})

export const getHealth = (db) => {
  const publicKeys = new Set([
    'last_indexed_slot',
    'last_indexed_at',
    'program_id',
    'rpc_host',
  ])
  return {
    ok: true,
    meta: Object.fromEntries(
      getMetaRows(db)
        .filter((row) => publicKeys.has(row.key))
        .map((row) => [row.key, row.value]),
    ),
  }
}
