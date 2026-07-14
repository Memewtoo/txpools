import type { MatchPool, OutcomeKey, PoolStatus } from '../../data/mockData'
import { isTxLineFinalStatus, txLineEventOrder } from './finality'
import type { SettlementPreview, TxLineFixture, TxLinePoolState, TxLineScoreEvent } from './types'

const normalize = (value: string | undefined) => (value ?? '').toLowerCase().replace(/[^a-z]/g, '')
const slugify = (value: string) => normalize(value).replace(/^$/, 'fixture')

const teamCodes: Record<string, string> = {
  argentina: 'AR',
  australia: 'AU',
  belgium: 'BE',
  brazil: 'BR',
  colombia: 'CO',
  egypt: 'EG',
  england: 'EN',
  france: 'FR',
  mexico: 'MX',
  morocco: 'MA',
  myanmar: 'MM',
  norway: 'NO',
  portugal: 'PT',
  spain: 'ES',
  switzerland: 'CH',
  usa: 'US',
  vietnam: 'VN',
}

const teamCode = (team: string) => teamCodes[normalize(team)] ?? team.slice(0, 2).toUpperCase()

const formatUsdc = (value: number) => `${value.toLocaleString()} USDC`

const seededPool = (fixtureId: number | undefined, home: string, away: string) => {
  // Demo-only values keep reference fixtures useful before an on-chain pool is
  // loaded. Initialized pools replace them with real PDA and vault data.
  const isUsaBelgium =
    fixtureId === 18193785 || (normalize(home) === 'usa' && normalize(away) === 'belgium')

  const isPinnedSettledFixture = fixtureId === 18202701

  if (!isUsaBelgium && !isPinnedSettledFixture) {
    return {
      totalPool: formatUsdc(0),
      participants: 0,
      outcomes: [
        { key: 'home' as OutcomeKey, label: `${home} Win`, multiplier: 0, share: 0, amount: formatUsdc(0) },
        { key: 'draw' as OutcomeKey, label: 'Draw', multiplier: 0, share: 0, amount: formatUsdc(0) },
        { key: 'away' as OutcomeKey, label: `${away} Win`, multiplier: 0, share: 0, amount: formatUsdc(0) },
      ],
    }
  }

  if (isPinnedSettledFixture) {
    return {
      totalPool: formatUsdc(9800),
      participants: 36,
      outcomes: [
        { key: 'home' as OutcomeKey, label: `${home} Win`, multiplier: 1.64, share: 61, amount: formatUsdc(5978) },
        { key: 'draw' as OutcomeKey, label: 'Draw', multiplier: 4.1, share: 14, amount: formatUsdc(1372) },
        { key: 'away' as OutcomeKey, label: `${away} Win`, multiplier: 3.2, share: 25, amount: formatUsdc(2450) },
      ],
    }
  }

  return {
    totalPool: formatUsdc(12500),
    participants: 48,
    outcomes: [
      { key: 'home' as OutcomeKey, label: `${home} Win`, multiplier: 3.2, share: 24, amount: formatUsdc(3000) },
      { key: 'draw' as OutcomeKey, label: 'Draw', multiplier: 4.5, share: 12, amount: formatUsdc(1500) },
      { key: 'away' as OutcomeKey, label: `${away} Win`, multiplier: 1.56, share: 64, amount: formatUsdc(8000) },
    ],
  }
}

const getStartTime = (fixture: TxLineFixture) => fixture.startTime ?? fixture.StartTime

const formatStartTime = (startTime?: number) => {
  if (!startTime) return 'Schedule pending'
  const millis = startTime > 10_000_000_000 ? startTime : startTime * 1000
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(millis))
}

const scoreValue = (value: unknown): number | undefined => {
  if (typeof value === 'number') return value
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  for (const key of ['Score', 'score', 'Goals', 'goals', 'Value', 'value']) {
    if (typeof record[key] === 'number') return record[key] as number
  }
  const total = record.Total
  if (total && typeof total === 'object') {
    const totalRecord = total as Record<string, unknown>
    if (typeof totalRecord.Score === 'number') return totalRecord.Score
    if (typeof totalRecord.score === 'number') return totalRecord.score
    if (typeof totalRecord.Goals === 'number') return totalRecord.Goals
    if (typeof totalRecord.goals === 'number') return totalRecord.goals
  }
  return undefined
}

const getFixtureId = (fixture: TxLineFixture | TxLineScoreEvent) => fixture.fixtureId ?? fixture.FixtureId
const getParticipant1 = (fixture: TxLineFixture) => fixture.participant1 ?? fixture.Participant1
const getParticipant2 = (fixture: TxLineFixture) => fixture.participant2 ?? fixture.Participant2
const getCompetition = (fixture: TxLineFixture) => fixture.competition ?? fixture.Competition ?? 'World Cup'
const isFinalFixtureState = (fixture: TxLineFixture) => {
  const gameState = fixture.gameState ?? fixture.GameState
  return gameState === 3 || String(gameState).toLowerCase() === 'final'
}

export const fixtureToPoolState = (fixture: TxLineFixture): TxLinePoolState => {
  const fixtureId = getFixtureId(fixture)
  const home = getParticipant1(fixture) ?? 'Home'
  const away = getParticipant2(fixture) ?? 'Away'
  const competition = getCompetition(fixture)
  const startTime = getStartTime(fixture)
  const localSeed = seededPool(fixtureId, home, away)
  const now = Date.now()
  const startMillis = startTime ? (startTime > 10_000_000_000 ? startTime : startTime * 1000) : undefined
  const status: PoolStatus = isFinalFixtureState(fixture)
    ? 'Ready to Settle'
    : startMillis && startMillis <= now
      ? 'Live'
      : 'Upcoming'
  const predictionClosed = status !== 'Upcoming'

  return {
    fixtureId,
    source: 'txline',
    pool: {
      id: fixtureId ? `txline-${fixtureId}` : `${slugify(home)}-${slugify(away)}`,
      code: fixtureId ? `TX-${fixtureId}` : 'TX-LIVE',
      home,
      away,
      homeCode: teamCode(home),
      awayCode: teamCode(away),
      score: status === 'Upcoming' ? 'VS' : '0 - 0',
      minute: status === 'Upcoming' ? formatStartTime(startTime) : status === 'Ready to Settle' ? 'Final' : 'Closed',
      time: competition,
      startsAt: startMillis,
      predictionClosed,
      closeLabel: predictionClosed ? 'Prediction closed' : 'Open until kickoff',
      status,
      totalPool: localSeed.totalPool,
      participants: localSeed.participants,
      txlineState: status === 'Ready to Settle' ? 'TxLINE Result Ready' : status === 'Live' ? 'Prediction Closed' : 'TxLINE Fixture',
      outcomes: localSeed.outcomes,
    },
  }
}

export const fixturesToPoolStates = (fixtures: TxLineFixture[]) => fixtures.map(fixtureToPoolState)

export const attachFixturesToPools = (pools: MatchPool[], fixtures: TxLineFixture[]): TxLinePoolState[] => {
  return pools.map((pool) => {
    const match = fixtures.find((fixture) => {
      const p1 = normalize(getParticipant1(fixture))
      const p2 = normalize(getParticipant2(fixture))
      const home = normalize(pool.home)
      const away = normalize(pool.away)
      return (p1 === home && p2 === away) || (p1 === away && p2 === home)
    })

    return {
      pool,
      fixtureId: match ? getFixtureId(match) : undefined,
      source: match ? 'txline' : 'mock',
    }
  })
}

export const scoresFromEvent = (event: TxLineScoreEvent) => {
  const stats = event.Stats ?? event.stats
  const p1 = scoreValue(
    event.scoreSoccer?.Participant1 ??
      event.scoreSoccer?.participant1 ??
      event.Score?.Participant1 ??
      event.score?.Participant1 ??
      event.score?.participant1 ??
      stats?.['1'],
  )
  const p2 = scoreValue(
    event.scoreSoccer?.Participant2 ??
      event.scoreSoccer?.participant2 ??
      event.Score?.Participant2 ??
      event.score?.Participant2 ??
      event.score?.participant2 ??
      stats?.['2'],
  )
  if (p1 === undefined || p2 === undefined) return undefined
  return { p1, p2 }
}

export const latestScoreEventFromSnapshot = (events: TxLineScoreEvent[]) => {
  const scored = events
    .filter((event) => scoresFromEvent(event))
    .sort((left, right) => txLineEventOrder(right) - txLineEventOrder(left))[0]

  if (!scored) return events[events.length - 1]

  // TxLINE may emit final status separately from the latest event containing
  // score stats. Preserve the score payload while attaching terminal metadata.
  const terminal = events
    .filter(isTxLineFinalStatus)
    .sort((left, right) => txLineEventOrder(right) - txLineEventOrder(left))[0]

  if (!terminal) return scored

  return {
    ...scored,
    seq: terminal.seq ?? scored.seq,
    Seq: terminal.Seq ?? scored.Seq,
    StatusId: terminal.StatusId ?? scored.StatusId,
    gameState: terminal.gameState ?? scored.gameState,
    GameState: terminal.GameState ?? scored.GameState,
    action: terminal.action ?? scored.action,
    Action: terminal.Action ?? scored.Action,
    Data: {
      ...scored.Data,
      ...terminal.Data,
      StatusId: terminal.Data?.StatusId ?? scored.Data?.StatusId,
    },
    dataSoccer: {
      ...scored.dataSoccer,
      ...terminal.dataSoccer,
      StatusId: terminal.dataSoccer?.StatusId ?? scored.dataSoccer?.StatusId,
    },
    ts: terminal.ts ?? scored.ts,
    Ts: terminal.Ts ?? scored.Ts,
  }
}

const winnerFromScore = (homeScore: number, awayScore: number): OutcomeKey => {
  if (homeScore > awayScore) return 'home'
  if (homeScore < awayScore) return 'away'
  return 'draw'
}

export const applyScoreEventToPools = (states: TxLinePoolState[], event: TxLineScoreEvent): TxLinePoolState[] => {
  const fixtureId = getFixtureId(event)
  if (!fixtureId) return states

  const scores = scoresFromEvent(event)
  if (!scores) return states

  return states.map((state) => {
    if (state.fixtureId !== fixtureId) return state

    const isFinal = isTxLineFinalStatus(event) || state.pool.status === 'Ready to Settle' || state.pool.status === 'Settled'
    const status: PoolStatus = state.pool.status === 'Settled' ? 'Settled' : isFinal ? 'Ready to Settle' : 'Live'
    const scoreLeader = winnerFromScore(scores.p1, scores.p2)
    const leaderOutcome = scoreLeader === 'draw' ? undefined : scoreLeader
    // A live leader is display-only and becomes a winner only after finality.
    const winningOutcome = status === 'Ready to Settle' ? scoreLeader : state.pool.winningOutcome
    const clockSeconds = event.Clock?.Seconds
    const minuteValue = event.dataSoccer?.Minutes ?? event.Data?.Minutes
    const minute = typeof clockSeconds === 'number' ? `${Math.floor(clockSeconds / 60)}'` : typeof minuteValue === 'number' ? `${minuteValue}'` : 'Closed'

    return {
      ...state,
      source: 'txline',
      seq: event.seq ?? event.Seq ?? state.seq,
      updatedAt: event.ts ?? event.Ts ?? Date.now(),
      pool: {
        ...state.pool,
        score: `${scores.p1} - ${scores.p2}`,
        minute,
        status,
        predictionClosed: true,
        closeLabel: 'Prediction closed',
        txlineState: status === 'Ready to Settle' ? 'TxLINE Result Ready' : leaderOutcome ? `${leaderOutcome === 'home' ? state.pool.home : state.pool.away} Leading` : 'Prediction Closed',
        winningOutcome,
        leaderOutcome: status === 'Ready to Settle' ? undefined : leaderOutcome,
      },
    }
  })
}

export const makeSettlementPreview = (state: TxLinePoolState): SettlementPreview => {
  const [homeRaw, awayRaw] = state.pool.score.split('-').map((part) => Number(part.trim()))
  const hasScore = Number.isFinite(homeRaw) && Number.isFinite(awayRaw)
  const isReady = state.pool.status === 'Ready to Settle' || state.pool.status === 'Settled'
  const scoreOutcome = hasScore ? winnerFromScore(homeRaw, awayRaw) : undefined
  const winningOutcome = isReady ? (scoreOutcome ?? state.pool.winningOutcome) : undefined
  const leaderOutcome = !isReady && scoreOutcome && scoreOutcome !== 'draw' ? scoreOutcome : state.pool.leaderOutcome
  const winnerLabel = winningOutcome ? state.pool.outcomes.find((outcome) => outcome.key === winningOutcome)?.label ?? 'Unknown' : 'Pending'
  const leaderLabel = leaderOutcome ? state.pool.outcomes.find((outcome) => outcome.key === leaderOutcome)?.label.replace(' Win', '') ?? 'Unknown' : hasScore && scoreOutcome === 'draw' ? 'Level score' : 'Pending final result'

  return {
    poolId: state.pool.id,
    fixtureId: state.fixtureId,
    seq: state.seq,
    status: isReady && winningOutcome ? 'ready' : 'not-ready',
    finalScore: hasScore ? `${homeRaw} - ${awayRaw}` : state.pool.score,
    winningOutcome,
    verifiedWinner: isReady ? winnerLabel : leaderLabel,
    proofStatus: state.source === 'txline' && state.fixtureId && state.seq ? 'available' : state.source === 'txline' ? 'unavailable' : 'mock',
    proofHash: state.source === 'txline' && state.fixtureId ? `fixture:${state.fixtureId}:seq:${state.seq ?? 'pending'}` : `mock:${state.pool.code}`,
    explanation:
      isReady && winningOutcome
        ? `${winnerLabel} would receive the winning pool in this local preview.`
        : leaderOutcome
          ? `${leaderLabel} is currently leading, but TxLINE has not marked the result final.`
          : 'Settlement preview is waiting for a final TxLINE score event.',
  }
}
