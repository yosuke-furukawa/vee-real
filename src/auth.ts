import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { Context, MiddlewareHandler } from 'hono'
import { db, type User } from './db.js'

const COOKIE = 'vr_session'
const MAX_AGE_DAYS = 30
const MAX_AGE_MS = MAX_AGE_DAYS * 24 * 60 * 60 * 1000

const findUserById = db.prepare<[number], User>('SELECT * FROM users WHERE id = ?')
const insertSession = db.prepare<[string, number, number]>(
  'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)',
)
const findSession = db.prepare<[string, number], { user_id: number }>(
  'SELECT user_id FROM sessions WHERE id = ? AND expires_at > ?',
)
const deleteSession = db.prepare<[string]>('DELETE FROM sessions WHERE id = ?')

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export function loginUser(c: Context, userId: number): void {
  const token = randomBytes(32).toString('base64url')
  insertSession.run(token, userId, Date.now() + MAX_AGE_MS)
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: MAX_AGE_DAYS * 24 * 60 * 60,
  })
}

export function logoutUser(c: Context): void {
  const token = getCookie(c, COOKIE)
  if (token) deleteSession.run(token)
  deleteCookie(c, COOKIE, { path: '/' })
}

export type AuthVars = { user: User | null }

export const sessionMiddleware: MiddlewareHandler<{ Variables: AuthVars }> = async (c, next) => {
  const token = getCookie(c, COOKIE)
  const session = token ? findSession.get(token, Date.now()) : null
  const user = session ? findUserById.get(session.user_id) ?? null : null
  c.set('user', user)
  await next()
}

export const requireAuth: MiddlewareHandler<{ Variables: AuthVars }> = async (c, next) => {
  if (!c.get('user')) return c.redirect('/login')
  await next()
}
