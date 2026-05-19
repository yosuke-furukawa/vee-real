import { db } from '../src/db.js'
import { processUpload } from '../src/images.js'
import { hashPassword } from '../src/auth.js'

const USERNAMES = ['yamato', 'akari', 'ren', 'mei', 'haruto', 'yuna', 'sora', 'riko']
const CAPTIONS = [
  '朝ごはん☀️',
  '電車なう',
  '部活おわり',
  '今日も寒い…',
  '友達と',
  '帰り道',
  'お弁当',
  'カフェなう',
  '雨だね☂️',
  '課題やっと終わった',
  'そろそろ寝る',
  'おはよう',
  '昼休み',
  '放課後',
  '夕焼けきれい',
  '',
]
const TOTAL_POSTS = Number(process.env.POSTS ?? 120)
const POOL_SIZE = Math.min(60, TOTAL_POSTS)
const BATCH = 8
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const IMG_W = 4000
const IMG_H = 3000

async function fetchImage(seed: number): Promise<Buffer> {
  const url = `https://picsum.photos/seed/vr${seed}/${IMG_W}/${IMG_H}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch seed=${seed}: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function fetchPool(): Promise<Buffer[]> {
  const out: Buffer[] = []
  for (let i = 0; i < POOL_SIZE; i += BATCH) {
    const seeds = Array.from({ length: Math.min(BATCH, POOL_SIZE - i) }, (_, j) => i + j + 1)
    const batch = await Promise.all(seeds.map(fetchImage))
    out.push(...batch)
    const totalKB = batch.reduce((s, b) => s + b.length, 0) / 1024
    console.log(`  fetched ${out.length}/${POOL_SIZE}  (batch ${(totalKB / batch.length).toFixed(0)} KB avg)`)
  }
  return out
}

const findUser = db.prepare<[string], { id: number }>('SELECT id FROM users WHERE username = ?')
const insertUser = db.prepare<[string, string, number]>(
  'INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)',
)
const insertPost = db.prepare<[number, string, string, number, number, number]>(
  `INSERT INTO posts (user_id, image_id, caption, width, height, created_at)
   VALUES (?, ?, ?, ?, ?, ?)`,
)

console.log(`seeding ${USERNAMES.length} users + ${TOTAL_POSTS} posts from picsum.photos...`)

const passwordHash = await hashPassword('password123')
const userIds: number[] = []
for (const name of USERNAMES) {
  const existing = findUser.get(name)
  if (existing) {
    userIds.push(existing.id)
  } else {
    const info = insertUser.run(name, passwordHash, Date.now())
    userIds.push(Number(info.lastInsertRowid))
  }
}
console.log(`  users ready: ${userIds.length}`)

console.log(`  fetching ${POOL_SIZE} photos (${IMG_W}x${IMG_H} ~1MB each)...`)
const pool = await fetchPool()

const now = Date.now()
for (let i = 0; i < TOTAL_POSTS; i++) {
  const buf = pool[i % POOL_SIZE]
  const result = await processUpload(buf)
  const userId = userIds[i % userIds.length]
  const caption = CAPTIONS[i % CAPTIONS.length]
  const createdAt = now - Math.floor(Math.random() * WEEK_MS)
  insertPost.run(userId, result.imageId, caption, result.width, result.height, createdAt)
  if ((i + 1) % 20 === 0) console.log(`  posts ${i + 1}/${TOTAL_POSTS}`)
}

const finalCount = db.prepare<[], { c: number }>('SELECT count(*) AS c FROM posts').get()!.c
console.log(`done. total posts in DB: ${finalCount}`)
