import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { sessionMiddleware, type AuthVars } from './auth.js'
import { authRoutes } from './routes/auth.js'
import { postRoutes } from './routes/posts.js'
import { startProcessorLoop } from './worker/imageProcessor.js'
import { attachWebSocket } from './ws.js'

const app = new Hono<{ Variables: AuthVars }>()

app.use('/uploads/*', serveStatic({ root: './public' }))
app.use('/styles.css', serveStatic({ path: './public/styles.css' }))
app.use('/favicon.svg', serveStatic({ path: './public/favicon.svg' }))
app.use('/post.js', serveStatic({ path: './public/post.js' }))
app.use('/post-modal.js', serveStatic({ path: './public/post-modal.js' }))
app.use('/feed.js', serveStatic({ path: './public/feed.js' }))

app.use('*', sessionMiddleware)
app.route('/', authRoutes)
app.route('/', postRoutes)

const port = Number(process.env.PORT ?? 3000)
const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`VEE-REAL listening on http://localhost:${info.port}`)
})
attachWebSocket(server)

const workerInterval = Number(process.env.WORKER_INTERVAL_MS ?? 2000)
if (workerInterval > 0) {
  startProcessorLoop({ intervalMs: workerInterval })
}
