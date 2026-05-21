import Database from 'better-sqlite3'
import { existsSync, readFileSync, rmSync, cpSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DB_PATH = 'data/app.db'
const SEED_SQL = 'seed/db.sql'
const SEED_UPLOADS = 'seed/uploads'
const LIVE_UPLOADS = 'public/uploads'
const ORIG_DIR = join(LIVE_UPLOADS, 'orig')
const THUMB_DIR = join(LIVE_UPLOADS, 'thumb')
const DISPLAY_DIR = join(LIVE_UPLOADS, 'display')

if (!existsSync(SEED_SQL)) {
  console.error(`missing ${SEED_SQL}`)
  process.exit(1)
}

console.log('resetting database...')
mkdirSync('data', { recursive: true })
const db = new Database(DB_PATH)
db.pragma('foreign_keys = OFF')
db.exec(`
  DROP TABLE IF EXISTS image_variants;
  DROP TABLE IF EXISTS posts;
  DROP TABLE IF EXISTS sessions;
  DROP TABLE IF EXISTS users;
`)
db.exec(readFileSync(SEED_SQL, 'utf-8'))

console.log('applying schema upgrades...')
db.exec(`ALTER TABLE posts ADD COLUMN process_status TEXT NOT NULL DEFAULT 'pending'`)
db.exec(`CREATE INDEX IF NOT EXISTS posts_process_status_idx ON posts(process_status)`)
db.exec(`
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

console.log('restoring uploads...')
rmSync(LIVE_UPLOADS, { recursive: true, force: true })
mkdirSync(ORIG_DIR, { recursive: true })
mkdirSync(THUMB_DIR, { recursive: true })
mkdirSync(DISPLAY_DIR, { recursive: true })
if (existsSync(SEED_UPLOADS)) {
  cpSync(SEED_UPLOADS, ORIG_DIR, { recursive: true })
}

console.log('seeding image_variants (orig)...')
const EXT_TO_FORMAT: Record<string, string> = {
  jpg: 'jpg',
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  gif: 'gif',
}
type PostRow = { id: number; image_id: string; width: number; height: number }
const posts = db
  .prepare<[], PostRow>('SELECT id, image_id, width, height FROM posts')
  .all()
const insertVariant = db.prepare<[number, string, string, number, number, number]>(
  `INSERT INTO image_variants (post_id, variant, format, path, width, height, bytes)
   VALUES (?, 'orig', ?, ?, ?, ?, ?)`,
)
let variantCount = 0
let missingFiles = 0
const tx = db.transaction(() => {
  for (const p of posts) {
    const ext = p.image_id.split('.').pop()?.toLowerCase() ?? ''
    const format = EXT_TO_FORMAT[ext] ?? ext
    const path = `/uploads/orig/${p.image_id}`
    const fsPath = join(ORIG_DIR, p.image_id)
    let bytes: number
    try {
      bytes = statSync(fsPath).size
    } catch {
      missingFiles++
      continue
    }
    insertVariant.run(p.id, format, path, p.width, p.height, bytes)
    variantCount++
  }
})
tx()

const users = db.prepare<[], { c: number }>('SELECT count(*) AS c FROM users').get()!.c
const postCount = db.prepare<[], { c: number }>('SELECT count(*) AS c FROM posts').get()!.c
db.close()
console.log(
  `done. users: ${users}, posts: ${postCount}, orig variants: ${variantCount}` +
    (missingFiles > 0 ? ` (missing files skipped: ${missingFiles})` : ''),
)
