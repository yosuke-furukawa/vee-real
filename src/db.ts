import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const DB_PATH = process.env.DB_PATH ?? 'data/app.db'
mkdirSync(dirname(DB_PATH), { recursive: true })

export const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS posts (
    id              INTEGER PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    image_id        TEXT NOT NULL UNIQUE,
    caption         TEXT NOT NULL DEFAULT '',
    width           INTEGER NOT NULL,
    height          INTEGER NOT NULL,
    created_at      INTEGER NOT NULL,
    process_status  TEXT NOT NULL DEFAULT 'pending'
  );

  CREATE INDEX IF NOT EXISTS posts_created_at_idx ON posts(created_at DESC);
  CREATE INDEX IF NOT EXISTS posts_process_status_idx ON posts(process_status);

  CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);

  CREATE TABLE IF NOT EXISTS image_variants (
    post_id   INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    variant   TEXT NOT NULL,
    format    TEXT NOT NULL,
    path      TEXT NOT NULL,
    width     INTEGER NOT NULL,
    height    INTEGER NOT NULL,
    bytes     INTEGER NOT NULL,
    PRIMARY KEY (post_id, variant)
  );

  CREATE INDEX IF NOT EXISTS image_variants_variant_idx ON image_variants(variant);
`)

const postCols = db
  .prepare<[], { name: string }>("PRAGMA table_info('posts')")
  .all()
  .map((c) => c.name)
if (!postCols.includes('process_status')) {
  db.exec(`ALTER TABLE posts ADD COLUMN process_status TEXT NOT NULL DEFAULT 'pending'`)
  db.exec(`CREATE INDEX IF NOT EXISTS posts_process_status_idx ON posts(process_status)`)
}

export type User = {
  id: number
  username: string
  password_hash: string
  created_at: number
}

export type ProcessStatus = 'pending' | 'done' | 'failed'

export type Post = {
  id: number
  user_id: number
  image_id: string
  caption: string
  width: number
  height: number
  created_at: number
  process_status: ProcessStatus
  username: string
}

export type VariantKind = 'orig' | 'thumb' | 'display'
export type VariantFormat = 'webp' | 'jpg' | 'png' | 'gif'

export type ImageVariant = {
  post_id: number
  variant: VariantKind
  format: VariantFormat
  path: string
  width: number
  height: number
  bytes: number
}

export type FeedPost = Post & {
  thumb_path: string | null
  thumb_w: number | null
  thumb_h: number | null
  display_path: string | null
  orig_path: string | null
}
