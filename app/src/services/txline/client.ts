import { readSseMessages } from './sse'
import type { SseMessage, TxLineConfig, TxLineFixture, TxLineScoreEvent } from './types'

export class TxLineClient {
  constructor(private readonly config: TxLineConfig) {}

  private headers(extra?: HeadersInit) {
    return {
      ...(!this.config.browserUsesProxy && this.config.guestJwt && this.config.apiToken
        ? {
            Authorization: `Bearer ${this.config.guestJwt}`,
            'X-Api-Token': this.config.apiToken,
          }
        : {}),
      ...extra,
    }
  }

  private url(path: string, params?: Record<string, string | number | undefined>) {
    // Browser traffic uses the local or hosted backend proxy, which injects
    // credentials without exposing them in the Vite bundle.
    const origin = typeof window === 'undefined' ? this.config.apiOrigin : this.config.browserApiOrigin
    const base = origin.startsWith('/') ? `${window.location.origin}${origin}/api/` : `${origin}/api/`
    const url = new URL(path, base)
    Object.entries(params ?? {}).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value))
    })
    return url.toString()
  }

  private fixtureStartEpochDay() {
    if (this.config.fixtureStartEpochDay !== undefined) return this.config.fixtureStartEpochDay

    const utcEpochDay = Math.floor(Date.now() / 86_400_000)
    return utcEpochDay - Math.max(0, this.config.fixtureLookbackDays)
  }

  async getFixturesSnapshot() {
    const response = await fetch(
      this.url('fixtures/snapshot', {
        competitionId: this.config.competitionId,
        startEpochDay: this.fixtureStartEpochDay(),
      }),
      { headers: this.headers() },
    )

    if (!response.ok) throw new Error(`TxLINE fixtures snapshot failed: ${response.status}`)
    return (await response.json()) as TxLineFixture[]
  }

  async *streamScores(options: { fixtureId?: number; lastEventId?: string; signal?: AbortSignal } = {}) {
    const response = await fetch(this.url('scores/stream', { fixtureId: options.fixtureId }), {
      headers: this.headers({
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
        ...(options.lastEventId ? { 'Last-Event-ID': options.lastEventId } : {}),
      }),
      signal: options.signal,
    })

    if (!response.ok) throw new Error(`TxLINE scores stream failed: ${response.status}`)

    for await (const message of readSseMessages<TxLineScoreEvent>(response, options.signal)) {
      if (message.event === 'heartbeat') continue
      yield message as SseMessage<TxLineScoreEvent>
    }
  }

  async getScoresSnapshot(fixtureId: number) {
    const response = await fetch(this.url(`scores/snapshot/${fixtureId}`), {
      headers: this.headers(),
    })

    if (!response.ok) throw new Error(`TxLINE scores snapshot failed for ${fixtureId}: ${response.status}`)
    return (await response.json()) as TxLineScoreEvent[]
  }

  async getScoreStatValidation(params: { fixtureId: number; seq: number; statKeys: number[] }) {
    const response = await fetch(
      this.url('scores/stat-validation', {
        fixtureId: params.fixtureId,
        seq: params.seq,
        statKeys: params.statKeys.join(','),
      }),
      { headers: this.headers() },
    )

    if (!response.ok) throw new Error(`TxLINE score stat validation failed: ${response.status}`)
    return response.json() as Promise<unknown>
  }
}
