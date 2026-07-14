import type { TxLineFixture } from './types'

const STORAGE_KEY = 'txpools:txline-fixture-archive:v1'
const MAX_ARCHIVED_FIXTURES = 48

export const seedArchivedFixtures: TxLineFixture[] = [
  {
    Ts: 1783389600000,
    StartTime: 1783389600000,
    Competition: 'World Cup',
    CompetitionId: 72,
    Participant1: 'USA',
    Participant2: 'Belgium',
    FixtureId: 18193785,
    Participant1IsHome: true,
  },
  {
    Ts: 1783440000000,
    StartTime: 1783440000000,
    Competition: 'World Cup',
    CompetitionId: 72,
    Participant1Id: 1489,
    Participant1: 'Argentina',
    Participant2Id: 1867,
    Participant2: 'Egypt',
    FixtureId: 18202701,
    Participant1IsHome: true,
  },
]

const fixtureId = (fixture: TxLineFixture) => fixture.FixtureId ?? fixture.fixtureId
const startTime = (fixture: TxLineFixture) => fixture.StartTime ?? fixture.startTime ?? 0

const canUseStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage)

export const readArchivedFixtures = (): TxLineFixture[] => {
  if (!canUseStorage()) return seedArchivedFixtures

  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]') as TxLineFixture[]
    return mergeFixtureArchive(seedArchivedFixtures, Array.isArray(parsed) ? parsed : [])
  } catch {
    return seedArchivedFixtures
  }
}

export const mergeFixtureArchive = (...groups: TxLineFixture[][]) => {
  // Keep fixtures after TxLINE prunes its rolling snapshot so initialized pools
  // and portfolio links remain discoverable across sessions.
  const byId = new Map<number, TxLineFixture>()

  for (const fixture of groups.flat()) {
    const id = fixtureId(fixture)
    if (!id) continue
    byId.set(id, { ...byId.get(id), ...fixture })
  }

  return [...byId.values()]
    .sort((left, right) => startTime(right) - startTime(left))
    .slice(0, MAX_ARCHIVED_FIXTURES)
}

export const writeArchivedFixtures = (fixtures: TxLineFixture[]) => {
  if (!canUseStorage()) return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fixtures))
  } catch {
    // Storage can fail in private mode or when quota is exceeded. Live fixtures still work.
  }
}

export const archiveWorldCupFixtures = (currentFixtures: TxLineFixture[]) => {
  const archived = readArchivedFixtures()
  const merged = mergeFixtureArchive(archived, currentFixtures)
  writeArchivedFixtures(merged)
  return merged
}
