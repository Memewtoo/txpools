import type { MatchPool, OutcomeKey } from '../../data/mockData'

export interface TxLineConfig {
  apiOrigin: string
  browserApiOrigin: string
  guestJwt?: string
  apiToken?: string
  browserUsesProxy: boolean
  enabled: boolean
  competitionId?: number
  fixtureStartEpochDay?: number
  fixtureLookbackDays: number
}

export interface TxLineFixture {
  Ts?: number
  ts?: number
  FixtureId?: number
  fixtureId?: number
  Competition?: string
  competition?: string
  CompetitionId?: number
  competitionId?: number
  StartTime?: number
  startTime?: number
  Participant1?: string
  participant1?: string
  Participant2?: string
  participant2?: string
  Participant1Id?: number
  participant1Id?: number
  Participant2Id?: number
  participant2Id?: number
  Participant1IsHome?: boolean
  participant1IsHome?: boolean
  GameState?: number | string
  gameState?: number | string
}

export interface TxLineScoreTotal {
  Score?: number
  score?: number
  Goals?: number
  goals?: number
  Value?: number
  value?: number
}

export interface TxLineScoreEvent {
  fixtureId?: number
  FixtureId?: number
  seq?: number
  Seq?: number
  gameState?: string
  GameState?: string
  action?: string
  Action?: string
  ts?: number
  Ts?: number
  StartTime?: number
  Clock?: {
    Running?: boolean
    Seconds?: number
  }
  Score?: {
    Participant1?: unknown
    Participant2?: unknown
  }
  score?: {
    Participant1?: unknown
    Participant2?: unknown
    participant1?: unknown
    participant2?: unknown
  }
  scoreSoccer?: {
    Participant1?: TxLineScoreTotal
    Participant2?: TxLineScoreTotal
    participant1?: TxLineScoreTotal
    participant2?: TxLineScoreTotal
  }
  dataSoccer?: {
    Minutes?: number
    Goal?: boolean
    Participant?: number
    StatusId?: number
    Type?: string
  }
  Data?: {
    Minutes?: number
    StatusId?: number
  }
  Stats?: Record<string, number>
  stats?: Record<string, number>
  StatusId?: number
  statusId?: number
}

export interface SseMessage<T = unknown> {
  id?: string
  event?: string
  data?: T
}

export interface TxLinePoolState {
  pool: MatchPool
  fixtureId?: number
  seq?: number
  source: 'mock' | 'txline'
  updatedAt?: number
}

export interface SettlementPreview {
  poolId: string
  fixtureId?: number
  seq?: number
  status: 'not-ready' | 'ready'
  finalScore: string
  winningOutcome?: OutcomeKey
  verifiedWinner: string
  proofStatus: 'mock' | 'available' | 'unavailable'
  proofHash: string
  explanation: string
}
