export type PoolStatus = 'Live' | 'Upcoming' | 'Ready to Settle' | 'Settled'
export type OutcomeKey = 'home' | 'draw' | 'away'

export interface Outcome {
  key: OutcomeKey
  label: string
  multiplier: number
  share: number
  amount: string
  amountRaw?: string
}

export interface MatchPool {
  id: string
  code: string
  fixtureId?: number
  initializedOnChain?: boolean
  poolAddress?: string
  vaultAddress?: string
  userTotalLocked?: string
  bonusPool?: string
  feeBps?: number
  home: string
  away: string
  homeCode: string
  awayCode: string
  score: string
  minute: string
  time: string
  startsAt?: number
  predictionClosed?: boolean
  closeLabel?: string
  status: PoolStatus
  totalPool: string
  totalPoolRaw?: string
  totalLockedRaw?: string
  participants: number
  txlineState: string
  winningOutcome?: OutcomeKey
  leaderOutcome?: OutcomeKey
  outcomes: Outcome[]
}

export interface Settlement {
  id: string
  match: string
  finalScore: string
  proofHash: string
  totalPool: string
  winningPool: string
  winners: number
  verifiedWinner: string
  settledAgo?: string
  amount?: string
}

export interface Position {
  id: string
  poolId?: string
  match: string
  prediction: string
  amount: string
  status: 'Active' | 'Pending Settlement' | 'Claimable' | 'Won' | 'Lost'
  estimatedPayout: string
  action: string
}

export const pools: MatchPool[] = [
  {
    id: 'brazil-spain',
    code: 'WC-2841',
    home: 'Brazil',
    away: 'Spain',
    homeCode: 'BR',
    awayCode: 'ES',
    score: '2 - 1',
    minute: "85'",
    time: 'Live now',
    status: 'Live',
    totalPool: '812,400 USDC',
    participants: 1248,
    txlineState: 'TxLINE Synced',
    outcomes: [
      { key: 'home', label: 'Brazil Win', multiplier: 1.42, share: 65, amount: '528,200 USDC' },
      { key: 'draw', label: 'Draw', multiplier: 3.85, share: 12, amount: '97,400 USDC' },
      { key: 'away', label: 'Spain Win', multiplier: 6.2, share: 23, amount: '186,800 USDC' },
    ],
  },
  {
    id: 'argentina-france',
    code: 'WC-2845',
    home: 'Argentina',
    away: 'France',
    homeCode: 'AR',
    awayCode: 'FR',
    score: 'VS',
    minute: '20:00 UTC',
    time: 'Starts in 4h',
    status: 'Upcoming',
    totalPool: '450,000 USDC',
    participants: 982,
    txlineState: 'Pre-sync Phase',
    outcomes: [
      { key: 'home', label: 'Argentina Win', multiplier: 2.1, share: 42, amount: '189,000 USDC' },
      { key: 'draw', label: 'Draw', multiplier: 3.4, share: 20, amount: '90,000 USDC' },
      { key: 'away', label: 'France Win', multiplier: 2.5, share: 38, amount: '171,000 USDC' },
    ],
  },
  {
    id: 'england-portugal',
    code: 'WC-2850',
    home: 'England',
    away: 'Portugal',
    homeCode: 'EN',
    awayCode: 'PT',
    score: 'VS',
    minute: '14:00 UTC',
    time: 'Starts tomorrow',
    status: 'Upcoming',
    totalPool: '85,500 USDC',
    participants: 344,
    txlineState: 'Waiting for Start',
    outcomes: [
      { key: 'home', label: 'England Win', multiplier: 1.9, share: 55, amount: '47,000 USDC' },
      { key: 'draw', label: 'Draw', multiplier: 4.2, share: 12, amount: '10,260 USDC' },
      { key: 'away', label: 'Portugal Win', multiplier: 2.8, share: 33, amount: '28,240 USDC' },
    ],
  },
  {
    id: 'morocco-usa',
    code: 'WC-2857',
    home: 'Morocco',
    away: 'USA',
    homeCode: 'MA',
    awayCode: 'US',
    score: '1 - 0',
    minute: 'Final',
    time: 'Proof ready',
    status: 'Ready to Settle',
    totalPool: '1,200,000 USDC',
    participants: 4210,
    txlineState: 'Outcome Confirmed',
    winningOutcome: 'home',
    outcomes: [
      { key: 'home', label: 'Morocco Win', multiplier: 5.8, share: 17, amount: '204,000 USDC' },
      { key: 'draw', label: 'Draw', multiplier: 3.1, share: 29, amount: '348,000 USDC' },
      { key: 'away', label: 'USA Win', multiplier: 1.8, share: 54, amount: '648,000 USDC' },
    ],
  },
  {
    id: 'brazil-croatia',
    code: 'WC-2862',
    home: 'Brazil',
    away: 'Croatia',
    homeCode: 'BR',
    awayCode: 'HR',
    score: '1 - 1',
    minute: 'AET Draw',
    time: 'Settled',
    status: 'Settled',
    totalPool: '340,000 USDC',
    participants: 764,
    txlineState: 'Fully Distributed',
    winningOutcome: 'draw',
    outcomes: [
      { key: 'home', label: 'Brazil Win', multiplier: 1.5, share: 58, amount: '197,200 USDC' },
      { key: 'draw', label: 'Draw', multiplier: 4.5, share: 16, amount: '54,400 USDC' },
      { key: 'away', label: 'Croatia Win', multiplier: 3.2, share: 26, amount: '88,400 USDC' },
    ],
  },
  {
    id: 'japan-germany',
    code: 'WC-2868',
    home: 'Japan',
    away: 'Germany',
    homeCode: 'JP',
    awayCode: 'DE',
    score: 'VS',
    minute: '18:30 UTC',
    time: 'Starts in 2d',
    status: 'Upcoming',
    totalPool: '126,800 USDC',
    participants: 511,
    txlineState: 'Pre-sync Phase',
    outcomes: [
      { key: 'home', label: 'Japan Win', multiplier: 3.7, share: 25, amount: '31,700 USDC' },
      { key: 'draw', label: 'Draw', multiplier: 3.25, share: 18, amount: '22,824 USDC' },
      { key: 'away', label: 'Germany Win', multiplier: 1.95, share: 57, amount: '72,276 USDC' },
    ],
  },
  {
    id: 'usa-netherlands',
    code: 'WC-2870',
    home: 'USA',
    away: 'Netherlands',
    homeCode: 'US',
    awayCode: 'NL',
    score: '0 - 2',
    minute: 'Final',
    time: 'Settled',
    status: 'Settled',
    totalPool: '245,000 USDC',
    participants: 608,
    txlineState: 'Settled OK',
    winningOutcome: 'away',
    outcomes: [
      { key: 'home', label: 'USA Win', multiplier: 3.9, share: 21, amount: '51,450 USDC' },
      { key: 'draw', label: 'Draw', multiplier: 3.3, share: 18, amount: '44,100 USDC' },
      { key: 'away', label: 'Netherlands Win', multiplier: 2.0, share: 61, amount: '149,450 USDC' },
    ],
  },
]

export const settlements: Settlement[] = [
  {
    id: 'settle-morocco-usa',
    match: 'Morocco vs USA',
    finalScore: '1 - 0',
    proofHash: '0x7AF2...91CD',
    totalPool: '1,200,000 USDC',
    winningPool: '204,000 USDC',
    winners: 318,
    verifiedWinner: 'Morocco Win',
  },
  {
    id: 'settle-brazil-spain',
    match: 'Brazil vs Spain',
    finalScore: '2 - 1',
    proofHash: '0x4F9A...2ZK1',
    totalPool: '812,400 USDC',
    winningPool: '528,200 USDC',
    winners: 824,
    verifiedWinner: 'Brazil Win',
  },
]

export const recentSettlements: Settlement[] = [
  {
    id: 'recent-1',
    match: 'USA vs Netherlands',
    finalScore: '0 - 2',
    proofHash: '0x92V1...MP94',
    totalPool: '245,000 USDC',
    winningPool: '149,450 USDC',
    winners: 286,
    verifiedWinner: 'Netherlands Win',
    settledAgo: '14 mins ago',
    amount: '18,420 USDC',
  },
  {
    id: 'recent-2',
    match: 'Brazil vs Croatia',
    finalScore: '1 - 1',
    proofHash: '0x1AC7...88F0',
    totalPool: '340,000 USDC',
    winningPool: '54,400 USDC',
    winners: 122,
    verifiedWinner: 'Draw',
    settledAgo: '42 mins ago',
    amount: '31,600 USDC',
  },
]

export const portfolioPositions: Position[] = [
  {
    id: 'pos-1',
    match: 'Brazil vs Spain',
    prediction: 'Brazil Win',
    amount: '500 USDC',
    status: 'Active',
    estimatedPayout: '710 USDC',
    action: 'View Pool',
  },
  {
    id: 'pos-2',
    match: 'Morocco vs USA',
    prediction: 'Morocco Win',
    amount: '250 USDC',
    status: 'Pending Settlement',
    estimatedPayout: '1,450 USDC',
    action: 'Waiting',
  },
  {
    id: 'pos-3',
    match: 'USA vs Netherlands',
    prediction: 'Netherlands Win',
    amount: '900 USDC',
    status: 'Claimable',
    estimatedPayout: '1,800 USDC',
    action: 'Claim Winnings',
  },
  {
    id: 'pos-4',
    match: 'Brazil vs Croatia',
    prediction: 'Draw',
    amount: '300 USDC',
    status: 'Won',
    estimatedPayout: '1,350 USDC',
    action: 'Claimed',
  },
  {
    id: 'pos-5',
    match: 'Japan vs Germany',
    prediction: 'Japan Win',
    amount: '150 USDC',
    status: 'Active',
    estimatedPayout: '555 USDC',
    action: 'View Pool',
  },
]

export const findPool = (id: string) => pools.find((pool) => pool.id === id) ?? pools[0]
