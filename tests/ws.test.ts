import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { WebSocket } from 'ws'
import { attachWebSocket, broadcast, type FeedEvent } from '../src/ws.js'

let server: HttpServer
let port = 0

before(async () => {
  server = createServer()
  attachWebSocket(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  port = (server.address() as AddressInfo).port
})

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

type Recv = { ws: WebSocket; messages: Record<string, unknown>[] }

const openClient = (path = '/ws'): Promise<Recv> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`)
    const messages: Record<string, unknown>[] = []
    ws.on('message', (m) => {
      try {
        messages.push(JSON.parse(m.toString()))
      } catch {
        // skip non-JSON frames
      }
    })
    ws.once('open', () => resolve({ ws, messages }))
    ws.once('error', reject)
  })

const closeClient = (c: Recv) =>
  new Promise<void>((resolve) => {
    if (c.ws.readyState === WebSocket.CLOSED) return resolve()
    c.ws.once('close', () => resolve())
    c.ws.close()
  })

const waitFor = async (
  predicate: () => boolean,
  { timeoutMs = 500, stepMs = 10 } = {},
): Promise<void> => {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitFor timed out after ${timeoutMs}ms`)
    }
    await wait(stepMs)
  }
}

const sampleCreated: FeedEvent = {
  type: 'post:created',
  id: 1,
  image_id: 'abc.jpg',
  username: 'tester',
  caption: 'hi',
  width: 100,
  height: 80,
  created_at: 1700000000000,
  orig_path: '/uploads/orig/abc.jpg',
}

const sampleProcessed: FeedEvent = {
  type: 'post:processed',
  id: 42,
  thumb_path: '/uploads/thumb/x.webp',
  thumb_w: 720,
  thumb_h: 480,
  display_path: '/uploads/display/x.webp',
}

test('client receives hello message immediately on connect', async () => {
  const c = await openClient()
  await waitFor(() => c.messages.length >= 1)
  assert.equal(c.messages[0]?.['type'], 'hello')
  assert.equal(typeof c.messages[0]?.['t'], 'number')
  await closeClient(c)
})

test('broadcast delivers post:created event to a connected client', async () => {
  const c = await openClient()
  await waitFor(() => c.messages.some((m) => m['type'] === 'hello'))

  broadcast(sampleCreated)

  await waitFor(() => c.messages.some((m) => m['type'] === 'post:created'))
  const ev = c.messages.find((m) => m['type'] === 'post:created')
  assert.deepEqual(ev, sampleCreated)
  await closeClient(c)
})

test('broadcast delivers post:processed event to a connected client', async () => {
  const c = await openClient()
  await waitFor(() => c.messages.some((m) => m['type'] === 'hello'))

  broadcast(sampleProcessed)

  await waitFor(() => c.messages.some((m) => m['type'] === 'post:processed'))
  const ev = c.messages.find((m) => m['type'] === 'post:processed')
  assert.deepEqual(ev, sampleProcessed)
  await closeClient(c)
})

test('broadcast fans out to all connected clients', async () => {
  const a = await openClient()
  const b = await openClient()
  await waitFor(() => a.messages.length >= 1 && b.messages.length >= 1)

  broadcast(sampleCreated)

  await waitFor(
    () =>
      a.messages.some((m) => m['type'] === 'post:created') &&
      b.messages.some((m) => m['type'] === 'post:created'),
  )
  assert.ok(a.messages.find((m) => m['type'] === 'post:created'))
  assert.ok(b.messages.find((m) => m['type'] === 'post:created'))
  await closeClient(a)
  await closeClient(b)
})

test('broadcast is a no-op when there are no clients', async () => {
  // 確実に全クライアントが close されたあとに呼ぶ。
  await wait(50)
  assert.doesNotThrow(() => broadcast(sampleCreated))
})

test('upgrade on wrong path is rejected', async () => {
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/not-ws`)
    const timer = setTimeout(() => reject(new Error('did not close in time')), 1000)
    ws.once('open', () => {
      clearTimeout(timer)
      reject(new Error('connection should not open on wrong path'))
    })
    ws.once('error', () => {
      clearTimeout(timer)
      resolve()
    })
    ws.once('close', () => {
      clearTimeout(timer)
      resolve()
    })
  })
})

test('attachWebSocket is idempotent and returns the same instance', () => {
  const a = attachWebSocket(server)
  const b = attachWebSocket(server)
  assert.equal(a, b)
})

test('clients do not receive events sent after they close', async () => {
  const c = await openClient()
  await waitFor(() => c.messages.length >= 1)
  await closeClient(c)
  const before = c.messages.length
  broadcast(sampleCreated)
  await wait(50)
  assert.equal(c.messages.length, before)
})
