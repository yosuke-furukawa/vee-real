import type { IncomingMessage, Server as HttpServer } from 'node:http'
import type { Http2Server, Http2SecureServer } from 'node:http2'
import type { Socket } from 'node:net'
import { WebSocketServer, type WebSocket } from 'ws'

type UpgradableServer = HttpServer | Http2Server | Http2SecureServer

export type PostCreatedEvent = {
  type: 'post:created'
  id: number
  image_id: string
  username: string
  caption: string
  width: number
  height: number
  created_at: number
  orig_path: string
}

export type PostProcessedEvent = {
  type: 'post:processed'
  id: number
  thumb_path: string
  thumb_w: number
  thumb_h: number
  display_path: string
}

export type FeedEvent = PostCreatedEvent | PostProcessedEvent

const WS_PATH = '/ws'
const HEARTBEAT_MS = 30_000

let wss: WebSocketServer | null = null

export function attachWebSocket(server: UpgradableServer): WebSocketServer {
  if (wss) return wss
  const server_ = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
    if (!req.url) {
      socket.destroy()
      return
    }
    const { pathname } = new URL(req.url, 'http://localhost')
    if (pathname !== WS_PATH) {
      socket.destroy()
      return
    }
    server_.handleUpgrade(req, socket, head, (ws) => {
      server_.emit('connection', ws, req)
    })
  })

  server_.on('connection', (ws: WebSocket) => {
    let alive = true
    ws.on('pong', () => {
      alive = true
    })
    const heartbeat = setInterval(() => {
      if (!alive) {
        ws.terminate()
        return
      }
      alive = false
      try {
        ws.ping()
      } catch {
        // ignore
      }
    }, HEARTBEAT_MS)
    ws.on('close', () => clearInterval(heartbeat))
    ws.on('error', () => {
      // クライアント側の切断は珍しくないので握り潰す。
    })
    try {
      ws.send(JSON.stringify({ type: 'hello', t: Date.now() }))
    } catch {
      // ignore
    }
  })

  wss = server_
  return server_
}

export function broadcast(event: FeedEvent): void {
  if (!wss) return
  const payload = JSON.stringify(event)
  for (const client of wss.clients) {
    if (client.readyState === 1 /* OPEN */) {
      try {
        client.send(payload)
      } catch {
        // 個別失敗は無視。次回 heartbeat で掃除される。
      }
    }
  }
}
