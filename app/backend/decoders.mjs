import { PublicKey } from '@solana/web3.js'

export const DISCRIMINATOR_POOL = 2
export const DISCRIMINATOR_POSITION = 3

const requireLength = (data, minLength, accountName) => {
  if (data.length < minLength) throw new Error(`${accountName} account is too small.`)
}

const readPubkey = (data, offset) => new PublicKey(data.subarray(offset, offset + 32)).toBase58()
const readU16 = (data, offset) => data.readUInt16LE(offset)
const readU64 = (data, offset) => data.readBigUInt64LE(offset).toString()
const readI64 = (data, offset) => data.readBigInt64LE(offset).toString()

export const decodePool = (pubkey, data) => {
  requireLength(data, 107, 'Pool')
  if (data[0] !== DISCRIMINATOR_POOL) throw new Error('Invalid pool discriminator.')

  return {
    pool_pubkey: pubkey.toBase58(),
    fixture_id: readU64(data, 1),
    admin_pubkey: readPubkey(data, 9),
    close_ts: readI64(data, 41),
    status: data[49],
    total_locked: readU64(data, 50),
    outcome_home: readU64(data, 58),
    outcome_draw: readU64(data, 66),
    outcome_away: readU64(data, 74),
    winning_outcome: data[82],
    final_home_score: readU16(data, 83),
    final_away_score: readU16(data, 85),
    fee_bps: readU16(data, 87),
    fee_amount: readU64(data, 89),
    net_payout_pool: readU64(data, 97),
    pool_bump: data[105],
    vault_bump: data[106],
  }
}

export const decodePosition = (pubkey, data) => {
  requireLength(data, 76, 'Position')
  if (data[0] !== DISCRIMINATOR_POSITION) throw new Error('Invalid position discriminator.')

  return {
    position_pubkey: pubkey.toBase58(),
    user_pubkey: readPubkey(data, 1),
    pool_pubkey: readPubkey(data, 33),
    outcome: data[65],
    amount: readU64(data, 66),
    claimed: data[74] === 1 ? 1 : 0,
    bump: data[75],
  }
}

export const readTokenAccountAmount = (data) => {
  requireLength(data, 72, 'Token')
  return data.readBigUInt64LE(64).toString()
}
