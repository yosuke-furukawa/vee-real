import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { sessionMiddleware, type AuthVars } from './auth.js'
import { authRoutes } from './routes/auth.js'
import { postRoutes } from './routes/posts.js'

const app = new Hono<{ Variables: AuthVars }>()

app.use('/uploads/*', serveStatic({ root: './public' }))
app.use('/styles.css', serveStatic({ path: './public/styles.css' }))
app.use('/favicon.svg', serveStatic({ path: './public/favicon.svg' }))

app.use('*', sessionMiddleware)
app.route('/', authRoutes)
app.route('/', postRoutes)

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`VEE-REAL listening on http://localhost:${info.port}`)
})
