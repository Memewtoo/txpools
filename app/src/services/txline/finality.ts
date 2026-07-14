import type { TxLineScoreEvent } from './types'

export const TXLINE_FINAL_STATUS_IDS = [5, 10, 13, 100] as const

export const txLineStatusId = (event: TxLineScoreEvent) =>
  event.StatusId ?? event.statusId ?? event.dataSoccer?.StatusId ?? event.Data?.StatusId

export const isTxLineFinalStatus = (event: TxLineScoreEvent) => {
  const statusId = txLineStatusId(event)
  return statusId !== undefined && TXLINE_FINAL_STATUS_IDS.includes(statusId as (typeof TXLINE_FINAL_STATUS_IDS)[number])
}

export const txLineEventOrder = (event: TxLineScoreEvent) => event.seq ?? event.Seq ?? event.ts ?? event.Ts ?? 0

export const txLineEventSeq = (event: TxLineScoreEvent) => event.seq ?? event.Seq

export const latestFinalScoreEvent = (events: TxLineScoreEvent[]) =>
  events
    .filter((event) => isTxLineFinalStatus(event) && txLineEventSeq(event) !== undefined)
    .sort((left, right) => txLineEventOrder(right) - txLineEventOrder(left))[0]
