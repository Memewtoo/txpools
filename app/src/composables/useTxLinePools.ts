import { computed, onMounted, onUnmounted, ref } from 'vue'
import { pools as mockPools } from '../data/mockData'
import { archiveWorldCupFixtures } from '../services/txline/fixtureArchive'
import {
  applyScoreEventToPools,
  canUseTxLine,
  fixturesToPoolStates,
  latestScoreEventFromSnapshot,
  makeSettlementPreview,
  TxLineClient,
  txLineConfig,
  type TxLineFixture,
  type TxLinePoolState,
} from '../services/txline'

const poolStates = ref<TxLinePoolState[]>(mockPools.map((pool) => ({ pool, source: 'mock' })))
const liveFixtures = ref<TxLineFixture[]>([])
const liveStatus = ref<'mock' | 'connecting' | 'live' | 'error' | 'stream-error'>(canUseTxLine(txLineConfig) ? 'connecting' : 'mock')
const liveError = ref<string>()
const lastEventId = ref<string>()
const started = ref(false)
let abortController: AbortController | undefined

const startTxLine = async () => {
  if (started.value || !canUseTxLine(txLineConfig)) return

  started.value = true
  abortController = new AbortController()
  const client = new TxLineClient(txLineConfig)

  liveStatus.value = 'connecting'
  let hasLiveFixtures = false

  try {
    const fixtures = await client.getFixturesSnapshot()
    const worldCupFixtures = fixtures.filter((fixture) => (fixture.Competition ?? fixture.competition ?? '').toLowerCase().includes('world cup'))
    const relevantFixtures = archiveWorldCupFixtures(worldCupFixtures.length ? worldCupFixtures : fixtures)
    liveFixtures.value = relevantFixtures
    poolStates.value = fixturesToPoolStates(relevantFixtures)
    // Hydrate current scores before opening SSE so the first render does not
    // depend on another event arriving for every fixture.
    const scoreSnapshots = await Promise.allSettled(
      poolStates.value
        .filter((state) => state.fixtureId)
        .map(async (state) => {
          const updates = await client.getScoresSnapshot(state.fixtureId as number)
          return latestScoreEventFromSnapshot(updates)
        }),
    )
    for (const result of scoreSnapshots) {
      if (result.status === 'fulfilled' && result.value) {
        poolStates.value = applyScoreEventToPools(poolStates.value, result.value)
      }
    }
    hasLiveFixtures = true
    liveStatus.value = 'live'
  } catch (error) {
    if (abortController.signal.aborted) return
    liveStatus.value = 'error'
    liveError.value = error instanceof Error ? error.message : 'TxLINE fixture snapshot failed.'
    return
  }

  try {
    // Snapshot data remains usable if the long-lived stream later disconnects.
    for await (const message of client.streamScores({ signal: abortController.signal })) {
      if (message.id) lastEventId.value = message.id
      if (message.data) poolStates.value = applyScoreEventToPools(poolStates.value, message.data)
    }
  } catch (error) {
    if (abortController.signal.aborted) return
    liveStatus.value = hasLiveFixtures ? 'stream-error' : 'error'
    liveError.value = error instanceof Error ? error.message : 'TxLINE live stream failed.'
  }
}

export const useTxLinePools = () => {
  onMounted(() => void startTxLine())
  onUnmounted(() => {
    abortController?.abort()
    started.value = false
  })

  const pools = computed(() => poolStates.value.map((state) => state.pool))
  const settlementPreviews = computed(() => poolStates.value.map(makeSettlementPreview))
  const sourceLabel = computed(() => {
    if (liveStatus.value === 'live') return 'TxLINE SSE live'
    if (liveStatus.value === 'stream-error') return 'TxLINE fixtures live'
    if (liveStatus.value === 'connecting') return 'Connecting TxLINE'
    if (liveStatus.value === 'error') return 'Mock fallback'
    return 'Mock data'
  })

  return {
    pools,
    poolStates,
    liveFixtures,
    settlementPreviews,
    liveStatus,
    liveError,
    lastEventId,
    sourceLabel,
  }
}
