import type { SseMessage } from './types'

const parseData = (value: string) => {
  if (!value) return undefined
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

const parseMessage = (chunk: string): SseMessage | undefined => {
  const message: SseMessage = {}
  const data: string[] = []

  for (const line of chunk.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue
    const separator = line.indexOf(':')
    const field = separator === -1 ? line : line.slice(0, separator)
    const rawValue = separator === -1 ? '' : line.slice(separator + 1).replace(/^ /, '')

    if (field === 'id') message.id = rawValue
    if (field === 'event') message.event = rawValue
    if (field === 'data') data.push(rawValue)
  }

  if (data.length) message.data = parseData(data.join('\n'))
  return message.id || message.event || data.length ? message : undefined
}

export async function* readSseMessages<T>(response: Response, signal?: AbortSignal): AsyncGenerator<SseMessage<T>> {
  if (!response.body) throw new Error('TxLINE SSE response did not include a readable body.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (!signal?.aborted) {
    const { done, value } = await reader.read()
    if (done) break

    // Network chunks can split an SSE message at any byte; retain the incomplete
    // tail and emit only records separated by a blank line.
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split(/\r?\n\r?\n/)
    buffer = parts.pop() ?? ''

    for (const part of parts) {
      const parsed = parseMessage(part)
      if (parsed) yield parsed as SseMessage<T>
    }
  }

  const tail = parseMessage(buffer)
  if (tail) yield tail as SseMessage<T>
}
