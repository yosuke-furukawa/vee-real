import { Hono } from 'hono'
import { db, type Post } from '../db.js'
import { FeedPage } from '../views/feed.js'
import { PostPage } from '../views/post.js'
import { processUpload, MAX_BYTES } from '../images.js'
import { requireAuth, type AuthVars } from '../auth.js'

const listPosts = db.prepare<[], Post>(`
  SELECT p.*, u.username
  FROM posts p
  JOIN users u ON u.id = p.user_id
  ORDER BY p.created_at DESC
  LIMIT 60
`)

const insertPost = db.prepare<[number, string, string, number, number, number]>(
  `INSERT INTO posts (user_id, image_id, caption, width, height, created_at)
   VALUES (?, ?, ?, ?, ?, ?)`,
)

export const postRoutes = new Hono<{ Variables: AuthVars }>()

postRoutes.get('/', (c) => {
  const user = c.get('user')
  const posts = listPosts.all()
  return c.html(<FeedPage user={user} posts={posts} />)
})

postRoutes.get('/post', requireAuth, (c) => {
  const user = c.get('user')!
  return c.html(<PostPage user={user} />)
})

postRoutes.post('/post', requireAuth, async (c) => {
  const user = c.get('user')!
  const form = await c.req.parseBody().catch(() => null)

  const file = form?.['image']
  const caption = String(form?.['caption'] ?? '').slice(0, 140).trim()

  if (!(file instanceof File) || file.size === 0) {
    return c.html(<PostPage user={user} error="画像を選んでください。" />, 400)
  }
  if (file.size > MAX_BYTES) {
    return c.html(<PostPage user={user} error="画像が大きすぎます（最大 8MB）。" />, 413)
  }

  let result: Awaited<ReturnType<typeof processUpload>>
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    result = await processUpload(buf)
  } catch {
    return c.html(<PostPage user={user} error="画像を読み込めませんでした。" />, 400)
  }

  insertPost.run(user.id, result.imageId, caption, result.width, result.height, Date.now())
  return c.redirect('/')
})
