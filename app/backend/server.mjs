import http from 'node:http'
import { Readable } from 'node:stream'
import { URL } from 'node:url'
import { config } from './config.mjs'
import { openDb } from './db.mjs'
import { startIndexer } from './indexer.mjs'
import {
  getHealth,
  getPoolByFixtureId,
  getPoolParticipants,
  listPools,
  listPositions,
} from './queries.mjs'

const db = openDb(config.dbPath)
const stopIndexer = startIndexer({ db })

const TXLINE_PATHS = [
  /^\/txline\/api\/fixtures\/snapshot$/,
  /^\/txline\/api\/scores\/stream$/,
  /^\/txline\/api\/scores\/snapshot\/\d+$/,
  /^\/txline\/api\/scores\/stat-validation$/,
]
const READ_RPC_METHODS = new Set([
  'getAccountInfo',
  'getMultipleAccounts',
  'getTokenAccountBalance',
])
const requestWindows = new Map()

const allowedOrigin = (req) => {
  const origin = req.headers.origin
  if (!origin) return '*'
  if (!config.allowedOrigins.length || config.allowedOrigins.includes('*')) return '*'
  return config.allowedOrigins.includes(origin) ? origin : undefined
}

const corsHeaders = (req) => {
  const origin = allowedOrigin(req)
  return {
    ...(origin ? { 'access-control-allow-origin': origin } : {}),
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, last-event-id, solana-client',
    vary: 'Origin',
  }
}

const sendJson = (req, res, status, body, extraHeaders = {}) => {
  const data = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    ...corsHeaders(req),
    ...extraHeaders,
  })
  res.end(data)
}

const notFound = (req, res) => sendJson(req, res, 404, { error: 'Not found' })

const isRateLimited = (req) => {
  const now = Date.now()
  const forwardedFor = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim()
  const key = forwardedFor || req.socket.remoteAddress || 'unknown'
  const current = requestWindows.get(key)
  if (!current || now - current.startedAt >= 60_000) {
    requestWindows.set(key, { count: 1, startedAt: now })
    return false
  }
  current.count += 1
  return current.count > config.proxyRequestsPerMinute
}

const readBody = async (req, maxBytes = 1_000_000) => {
  const chunks = []
  let length = 0
  for await (const chunk of req) {
    length += chunk.length
    if (length > maxBytes) throw new Error('Request body is too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

const proxySolanaRpc = async (req, res) => {
  if (isRateLimited(req)) {
    sendJson(req, res, 429, { error: 'Proxy rate limit exceeded' })
    return
  }

  let payload
  try {
    payload = JSON.parse(await readBody(req))
  } catch (error) {
    sendJson(req, res, 400, { error: error instanceof Error ? error.message : 'Invalid JSON' })
    return
  }

  const calls = Array.isArray(payload) ? payload : [payload]
  if (!calls.length || calls.some((call) => !call || !READ_RPC_METHODS.has(call.method))) {
    sendJson(req, res, 403, { error: 'RPC method is not available through the read proxy' })
    return
  }

  const upstream = await fetch(config.rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await upstream.text()
  res.writeHead(upstream.status, {
    'content-type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...corsHeaders(req),
  })
  res.end(body)
}

const proxyTxLine = async (req, res, url) => {
  if (!config.txLineGuestJwt || !config.txLineApiToken) {
    sendJson(req, res, 503, { error: 'TxLINE proxy is not configured' })
    return
  }
  if (!TXLINE_PATHS.some((pattern) => pattern.test(url.pathname))) {
    notFound(req, res)
    return
  }
  if (isRateLimited(req)) {
    sendJson(req, res, 429, { error: 'Proxy rate limit exceeded' })
    return
  }

  const upstreamUrl = new URL(url.pathname.replace(/^\/txline/, ''), config.txLineApiOrigin)
  upstreamUrl.search = url.search
  const abortController = new AbortController()
  res.once('close', () => abortController.abort())
  const upstream = await fetch(upstreamUrl, {
    headers: {
      Authorization: `Bearer ${config.txLineGuestJwt}`,
      'X-Api-Token': config.txLineApiToken,
      Accept: req.headers.accept ?? 'application/json',
      ...(req.headers['last-event-id'] ? { 'Last-Event-ID': req.headers['last-event-id'] } : {}),
      'Cache-Control': 'no-cache',
    },
    signal: abortController.signal,
  })

  if (!upstream.body) {
    sendJson(req, res, 502, { error: 'TxLINE returned an empty response' })
    return
  }

  res.writeHead(upstream.status, {
    'content-type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
    'cache-control': upstream.headers.get('cache-control') ?? 'no-store',
    'x-accel-buffering': 'no',
    ...corsHeaders(req),
  })
  const stream = Readable.fromWeb(upstream.body)
  stream.on('error', (error) => {
    if (!abortController.signal.aborted) res.destroy(error)
  })
  stream.pipe(res)
}

const routeApiGet = (req, res, path) => {
  if (path === '/') {
    sendJson(req, res, 200, {
      name: 'TxPools Indexer API',
      ok: true,
      endpoints: [
        'GET /health',
        'GET /api/pools',
        'GET /api/pools/:fixtureId',
        'GET /api/pools/:fixtureId/participants',
        'GET /api/pools/:fixtureId/positions',
        'GET /api/users/:wallet/positions',
        'POST /solana-rpc',
      ],
    })
    return true
  }

  if (path === '/health') {
    sendJson(req, res, 200, getHealth(db))
    return true
  }

  if (path === '/api/pools') {
    sendJson(req, res, 200, { pools: listPools(db) })
    return true
  }

  const poolMatch = path.match(/^\/api\/pools\/([^/]+)$/)
  if (poolMatch) {
    const pool = getPoolByFixtureId(db, poolMatch[1])
    if (!pool) notFound(req, res)
    else sendJson(req, res, 200, { pool })
    return true
  }

  const poolPositionsMatch = path.match(/^\/api\/pools\/([^/]+)\/positions$/)
  if (poolPositionsMatch) {
    const pool = getPoolByFixtureId(db, poolPositionsMatch[1])
    if (!pool) notFound(req, res)
    else sendJson(req, res, 200, { positions: listPositions(db, { poolPubkey: pool.pool_pubkey }) })
    return true
  }

  const poolParticipantsMatch = path.match(/^\/api\/pools\/([^/]+)\/participants$/)
  if (poolParticipantsMatch) {
    const pool = getPoolByFixtureId(db, poolParticipantsMatch[1])
    if (!pool) notFound(req, res)
    else sendJson(req, res, 200, getPoolParticipants(db, pool.pool_pubkey))
    return true
  }

  const userPositionsMatch = path.match(/^\/api\/users\/([^/]+)\/positions$/)
  if (userPositionsMatch) {
    sendJson(req, res, 200, { positions: listPositions(db, { userPubkey: userPositionsMatch[1] }) })
    return true
  }

  return false
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    if (!allowedOrigin(req)) sendJson(req, res, 403, { error: 'Origin is not allowed' })
    else sendJson(req, res, 204, {})
    return
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const path = url.pathname.replace(/\/+$/, '') || '/'

  try {
    if (req.method === 'POST' && path === '/solana-rpc') {
      await proxySolanaRpc(req, res)
      return
    }
    if (req.method === 'GET' && path.startsWith('/txline/')) {
      await proxyTxLine(req, res, url)
      return
    }
    if (req.method !== 'GET') {
      sendJson(req, res, 405, { error: 'Method not allowed' })
      return
    }
    if (!routeApiGet(req, res, path)) notFound(req, res)
  } catch (error) {
    console.error('[txpools-indexer-api] request failed:', error)
    if (!res.headersSent) {
      sendJson(req, res, 500, { error: error instanceof Error ? error.message : 'Internal server error' })
    } else {
      res.destroy(error instanceof Error ? error : undefined)
    }
  }
})

server.listen(config.port, '0.0.0.0', () => {
  console.log(`[txpools-indexer-api] http://0.0.0.0:${config.port}`)
  console.log(`[txpools-indexer-api] rpc=${config.rpcHost}`)
  console.log(`[txpools-indexer-api] db=${config.dbPath}`)
})

const shutdown = () => {
  stopIndexer()
  server.close(() => {
    db.close()
    process.exit(0)
  })
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
