import type { Connection } from '@solana/web3.js'

export interface ConfirmSubmittedTransactionParams {
  connection: Connection
  signature: string
  blockhash: string
  lastValidBlockHeight: number
  isApplied?: () => Promise<boolean>
}

export const confirmSubmittedTransaction = async ({
  connection,
  signature,
  lastValidBlockHeight,
  isApplied,
}: ConfirmSubmittedTransactionParams) => {
  // Polling avoids relying on WebSocket support from local RPC proxies. The
  // optional state check also catches landed transactions while status lags.
  const deadline = Date.now() + 60_000
  let attempts = 0

  while (Date.now() < deadline) {
    attempts += 1
    try {
      const status = (await connection.getSignatureStatuses(
        [signature],
        { searchTransactionHistory: attempts > 10 },
      )).value[0]

      if (status?.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`)
      }
      if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
        return
      }
    } catch (caught) {
      if (caught instanceof Error && caught.message.startsWith('Transaction failed:')) throw caught
    }

    if (isApplied) {
      try {
        if (await isApplied()) return
      } catch {
        // A secondary RPC may briefly lag or throttle; keep polling the signature RPC.
      }
    }

    if (attempts % 5 === 0) {
      try {
        if (await connection.getBlockHeight('confirmed') > lastValidBlockHeight) break
      } catch {
        // Status polling remains authoritative when block-height lookup is unavailable.
      }
    }

    await new Promise((resolve) => globalThis.setTimeout(resolve, 750))
  }

  throw new Error(`Transaction confirmation timed out. Check signature ${signature}.`)
}
