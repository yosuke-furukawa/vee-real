import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const DB_PATH = process.env.DB_PATH ?? 'data/app.db'
mkdirSync(dirname(DB_PATH), { recursive: true })

const sqlite = new DatabaseSync(DB_PATH)
sqlite.exec('PRAGMA journal_mode = WAL')
sqlite.exec('PRAGMA foreign_keys = ON')

export interface Statement<P extends unknown[] = [], R = unknown> {
  run(...params: P): { lastInsertRowid: number | bigint; changes: number | bigint }
  get(...params: P): R | undefined
  all(...params: P): R[]
}

export const db = {
  exec(sql: string): void {
    sqlite.exec(sql)
  },
  close(): void {
    sqlite.close()
  },
  prepare<P extends unknown[] = [], R = unknown>(sql: string): Statement<P, R> {
    return sqlite.prepare(sql) as unknown as Statement<P, R>
  },
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS posts (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    image_id    TEXT NOT NULL UNIQUE,
    caption     TEXT NOT NULL DEFAULT '',
    width       INTEGER NOT NULL,
    height      INTEGER NOT NULL,
    created_at  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS posts_created_at_idx ON posts(created_at DESC);

  CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);
`)

export type User = {
  id: number
  username: string
  password_hash: string
  created_at: number
}

export type Post = {
  id: number
  user_id: number
  image_id: string
  caption: string
  width: number
  height: number
  created_at: number
  username: string
}
