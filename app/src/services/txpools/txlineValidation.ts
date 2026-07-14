import { TXLINE_AWAY_SCORE_STAT_KEY, TXLINE_HOME_SCORE_STAT_KEY } from './constants'
import { latestFinalScoreEvent, txLineEventSeq, txLineStatusId } from '../txline/finality'
import type { TxLineScoreEvent } from '../txline/types'

export interface ResolveProofInputs {
  homeValidateStatData: Uint8Array
  awayValidateStatData: Uint8Array
  finalHomeScore: number
  finalAwayScore: number
  seq: number
  statusId: number
  epochDay: number
}

const scoreFromEvent = (event: TxLineScoreEvent, statKey: number) => {
  const stats = event.Stats ?? event.stats
  const value = stats?.[String(statKey)]
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 65_535) {
    throw new Error(`TxLINE final score event is missing a valid stat ${statKey} score.`)
  }
  return value
}

interface TxLineValidationClient {
  getScoresSnapshot(fixtureId: number): Promise<TxLineScoreEvent[]>
  getScoreStatValidation(params: {
    fixtureId: number
    seq: number
    statKeys: number[]
  }): Promise<unknown>
}

const hexToBytes = (value: string) => {
  const normalized = value.startsWith('0x') ? value.slice(2) : value
  if (!/^[\da-f]*$/i.test(normalized) || normalized.length % 2 !== 0) return undefined
  const bytes = new Uint8Array(normalized.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

const base64ToBytes = (value: string) => {
  try {
    const decoded = globalThis.atob(value)
    return Uint8Array.from(decoded, (char) => char.charCodeAt(0))
  } catch {
    return undefined
  }
}

const bytesFromUnknown = (value: unknown): Uint8Array | undefined => {
  // TxLINE versions have wrapped serialized instructions under different keys;
  // normalize those response shapes only at this adapter boundary.
  if (value instanceof Uint8Array) return value
  if (Array.isArray(value) && value.every((entry) => Number.isInteger(entry))) {
    return Uint8Array.from(value as number[])
  }
  if (typeof value === 'string') {
    return value.startsWith('0x') ? hexToBytes(value) : base64ToBytes(value) ?? hexToBytes(value)
  }
  if (!value || typeof value !== 'object') return undefined

  const record = value as Record<string, unknown>
  for (const key of ['validateStatData', 'instructionData', 'serialized', 'data', 'bytes', 'base64', 'hex']) {
    const bytes = bytesFromUnknown(record[key])
    if (bytes) return bytes
  }
  return undefined
}

const matchesStatKey = (value: unknown, statKey: number) => {
  if (value === statKey) return true
  if (typeof value === 'string') return Number(value) === statKey
  return false
}

const i32Le = (value: number) => {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setInt32(0, value, true)
  return bytes
}

const u32Le = (value: number) => {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value, true)
  return bytes
}

const i64Le = (value: number | bigint) => {
  const bytes = new Uint8Array(8)
  new DataView(bytes.buffer).setBigInt64(0, BigInt(value), true)
  return bytes
}

const concatBytes = (...parts: Uint8Array[]) => {
  const length = parts.reduce((total, part) => total + part.length, 0)
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.length
  }
  return bytes
}

const fixedHash = (value: unknown, label: string) => {
  const bytes = bytesFromUnknown(value)
  if (!bytes || bytes.length !== 32) throw new Error(`TxLINE stat validation response has invalid ${label}.`)
  return bytes
}

const proofVec = (value: unknown) => {
  if (!Array.isArray(value)) throw new Error('TxLINE stat validation response has an invalid Merkle proof vector.')
  // TxLINE encodes each proof as a length followed by hash/direction pairs.
  return concatBytes(
    u32Le(value.length),
    ...value.map((entry) => {
      if (!entry || typeof entry !== 'object') throw new Error('TxLINE Merkle proof entry is invalid.')
      const record = entry as Record<string, unknown>
      return concatBytes(
        fixedHash(record.hash, 'proof hash'),
        Uint8Array.of(record.isRightSibling ? 1 : 0),
      )
    }),
  )
}

const numberField = (value: unknown, label: string) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`TxLINE stat validation response is missing ${label}.`)
  }
  return value
}

const objectField = (value: unknown, label: string) => {
  if (!value || typeof value !== 'object') throw new Error(`TxLINE stat validation response is missing ${label}.`)
  return value as Record<string, unknown>
}

const validateStatDiscriminator = Uint8Array.from([107, 197, 232, 90, 191, 136, 105, 185])
const comparisonEqualTo = 2

const buildValidateStatInstructionData = (response: unknown, statKey: number): Uint8Array | undefined => {
  if (!response || typeof response !== 'object') return undefined
  const record = response as Record<string, unknown>
  const statsToProve = record.statsToProve
  const statIndex = Array.isArray(statsToProve)
    ? statsToProve.findIndex((entry) => entry && typeof entry === 'object' && matchesStatKey((entry as Record<string, unknown>).key, statKey))
    : -1
  if (statIndex < 0 || !Array.isArray(statsToProve)) return undefined

  const stat = objectField(statsToProve[statIndex], 'requested stat')
  const summary = objectField(record.summary, 'summary')
  const updateStats = objectField(summary.updateStats, 'summary.updateStats')
  const ts = numberField(record.ts, 'ts')
  const fixtureId = numberField(summary.fixtureId, 'summary.fixtureId')
  const updateCount = numberField(updateStats.updateCount, 'summary.updateStats.updateCount')
  const minTimestamp = numberField(updateStats.minTimestamp, 'summary.updateStats.minTimestamp')
  const maxTimestamp = numberField(updateStats.maxTimestamp, 'summary.updateStats.maxTimestamp')
  const value = numberField(stat.value, 'stat value')
  const period = numberField(stat.period, 'stat period')
  const statProofs = record.statProofs
  if (!Array.isArray(statProofs)) throw new Error('TxLINE stat validation response is missing stat proofs.')

  // Serialize the exact validate_stat ABI consumed by the on-chain parser.
  return concatBytes(
    validateStatDiscriminator,
    i64Le(ts),
    i64Le(fixtureId),
    i32Le(updateCount),
    i64Le(minTimestamp),
    i64Le(maxTimestamp),
    fixedHash(summary.eventStatsSubTreeRoot, 'eventStatsSubTreeRoot'),
    proofVec(record.subTreeProof),
    proofVec(record.mainTreeProof),
    i32Le(value),
    Uint8Array.of(comparisonEqualTo),
    u32Le(statKey),
    i32Le(value),
    i32Le(period),
    fixedHash(record.eventStatRoot, 'eventStatRoot'),
    proofVec(statProofs[statIndex]),
    Uint8Array.of(0, 0),
  )
}

const findValidationForStatKey = (response: unknown, statKey: number): Uint8Array | undefined => {
  const direct = bytesFromUnknown(response)
  if (direct) return direct
  const built = buildValidateStatInstructionData(response, statKey)
  if (built) return built
  if (!response || typeof response !== 'object') return undefined

  const record = response as Record<string, unknown>
  const keyed = record[String(statKey)] ?? record[`stat_${statKey}`]
  const keyedBytes = bytesFromUnknown(keyed)
  if (keyedBytes) return keyedBytes

  for (const key of ['validations', 'stats', 'results', 'data']) {
    const value = record[key]
    if (!Array.isArray(value)) continue
    const match = value.find((entry) => {
      if (!entry || typeof entry !== 'object') return false
      const item = entry as Record<string, unknown>
      return ['statKey', 'StatKey', 'key', 'Key'].some((statField) => matchesStatKey(item[statField], statKey))
    })
    const matchBytes = bytesFromUnknown(match)
    if (matchBytes) return matchBytes
  }

  return undefined
}

export const buildResolveProofInputsFromTxLineResponse = (
  response: unknown,
  finalEvent: TxLineScoreEvent,
): ResolveProofInputs => {
  const homeValidateStatData = findValidationForStatKey(response, TXLINE_HOME_SCORE_STAT_KEY)
  const awayValidateStatData = findValidationForStatKey(response, TXLINE_AWAY_SCORE_STAT_KEY)
  const seq = txLineEventSeq(finalEvent)
  const statusId = txLineStatusId(finalEvent)
  const finalHomeScore = scoreFromEvent(finalEvent, TXLINE_HOME_SCORE_STAT_KEY)
  const finalAwayScore = scoreFromEvent(finalEvent, TXLINE_AWAY_SCORE_STAT_KEY)
  const summary = response && typeof response === 'object' ? (response as Record<string, unknown>).summary : undefined
  const updateStats = summary && typeof summary === 'object' ? (summary as Record<string, unknown>).updateStats : undefined
  const minTimestamp = updateStats && typeof updateStats === 'object' ? (updateStats as Record<string, unknown>).minTimestamp : undefined
  const epochDay = typeof minTimestamp === 'number'
    ? Math.floor(minTimestamp / 86_400_000)
    : typeof finalEvent.Ts === 'number'
      ? Math.floor(finalEvent.Ts / 86_400_000)
      : typeof finalEvent.ts === 'number'
        ? Math.floor(finalEvent.ts / 86_400_000)
        : undefined

  if (!homeValidateStatData || !awayValidateStatData) {
    throw new Error('TxLINE response did not include both home and away validate_stat payloads.')
  }
  if (seq === undefined || statusId === undefined) {
    throw new Error('TxLINE final score event is missing a sequence or final StatusId.')
  }
  if (epochDay === undefined) {
    throw new Error('TxLINE stat validation response is missing an epoch day timestamp.')
  }

  return {
    homeValidateStatData,
    awayValidateStatData,
    finalHomeScore,
    finalAwayScore,
    seq,
    statusId,
    epochDay,
  }
}

export const getResolveProofInputs = async (
  client: TxLineValidationClient,
  fixtureId: number,
  candidateSeq?: number,
) => {
  // Strict client-side finality gate: request proofs only for the sequence that
  // TxLINE itself marked terminal.
  const finalEvent = latestFinalScoreEvent(await client.getScoresSnapshot(fixtureId))
  if (!finalEvent) {
    throw new Error('TxLINE has not emitted a final StatusId for this fixture. Refusing to build resolve_pool proofs.')
  }

  const seq = txLineEventSeq(finalEvent)
  if (seq === undefined) {
    throw new Error('TxLINE final score event is missing a sequence. Refusing to build resolve_pool proofs.')
  }
  if (candidateSeq !== undefined && candidateSeq > seq) {
    throw new Error('Selected TxLINE score sequence is newer than the final-status event. Refresh score data before resolving.')
  }

  const response = await client.getScoreStatValidation({
    fixtureId,
    seq,
    statKeys: [TXLINE_HOME_SCORE_STAT_KEY, TXLINE_AWAY_SCORE_STAT_KEY],
  })
  return buildResolveProofInputsFromTxLineResponse(response, finalEvent)
}
