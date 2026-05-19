import { Hono } from 'hono'
import { db } from '../db.js'
import type { User } from '../db.js'
import { AuthPage } from '../views/auth.js'
import { hashPassword, loginUser, logoutUser, verifyPassword, type AuthVars } from '../auth.js'

const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/

const findByUsername = db.prepare<[string], User>('SELECT * FROM users WHERE username = ?')
const insertUser = db.prepare<[string, string, number]>(
  'INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)',
)

export const authRoutes = new Hono<{ Variables: AuthVars }>()

authRoutes.get('/login', (c) => c.html(<AuthPage mode="login" />))
authRoutes.get('/signup', (c) => c.html(<AuthPage mode="signup" />))

authRoutes.post('/signup', async (c) => {
  const form = await c.req.parseBody()
  const username = String(form.username ?? '').trim()
  const password = String(form.password ?? '')

  if (!USERNAME_RE.test(username)) {
    return c.html(<AuthPage mode="signup" username={username} error="ユーザー名は半角英数字/アンダースコア 3〜24 文字。" />, 400)
  }
  if (password.length < 8 || password.length > 128) {
    return c.html(<AuthPage mode="signup" username={username} error="パスワードは 8〜128 文字で。" />, 400)
  }
  if (findByUsername.get(username)) {
    return c.html(<AuthPage mode="signup" username={username} error="そのユーザー名は使われています。" />, 409)
  }

  const hash = await hashPassword(password)
  const info = insertUser.run(username, hash, Date.now())
  loginUser(c, Number(info.lastInsertRowid))
  return c.redirect('/')
})

authRoutes.post('/login', async (c) => {
  const form = await c.req.parseBody()
  const username = String(form.username ?? '').trim()
  const password = String(form.password ?? '')

  const user = findByUsername.get(username)
  const ok = user ? await verifyPassword(password, user.password_hash) : false
  if (!user || !ok) {
    return c.html(<AuthPage mode="login" username={username} error="ユーザー名かパスワードが違います。" />, 401)
  }
  loginUser(c, user.id)
  return c.redirect('/')
})

authRoutes.post('/logout', (c) => {
  logoutUser(c)
  return c.redirect('/')
})
