import { Buffer } from 'buffer'

const browserGlobal = globalThis as any

browserGlobal.Buffer ??= Buffer
browserGlobal.global ??= globalThis
browserGlobal.process ??= { env: {} }
