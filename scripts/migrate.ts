import Database from 'better-sqlite3'
import { existsSync, readFileSync, rmSync, cpSync, mkdirSync } from 'node:fs'

const DB_PATH = 'data/app.db'
const SEED_SQL = 'seed/db.sql'
const SEED_UPLOADS = 'seed/uploads'
const LIVE_UPLOADS = 'public/uploads'

if (!existsSync(SEED_SQL)) {
  console.error(`missing ${SEED_SQL}`)
  process.exit(1)
}

console.log('resetting database...')
mkdirSync('data', { recursive: true })
const db = new Database(DB_PATH)
db.pragma('foreign_keys = OFF')
db.exec(`
  DROP TABLE IF EXISTS posts;
  DROP TABLE IF EXISTS sessions;
  DROP TABLE IF EXISTS users;
`)
db.exec(readFileSync(SEED_SQL, 'utf-8'))

console.log('restoring uploads...')
rmSync(LIVE_UPLOADS, { recursive: true, force: true })
mkdirSync(LIVE_UPLOADS, { recursive: true })
if (existsSync(SEED_UPLOADS)) {
  cpSync(SEED_UPLOADS, LIVE_UPLOADS, { recursive: true })
}

const users = db.prepare<[], { c: number }>('SELECT count(*) AS c FROM users').get()!.c
const posts = db.prepare<[], { c: number }>('SELECT count(*) AS c FROM posts').get()!.c
db.close()
console.log(`done. users: ${users}, posts: ${posts}`)
