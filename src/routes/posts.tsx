import { Hono } from 'hono'
import { db, type FeedPost, type VariantFormat } from '../db.js'
import { FeedPage } from '../views/feed.js'
import { PostPage } from '../views/post.js'
import { processUpload, MAX_BYTES, origSrc } from '../images.js'
import { requireAuth, type AuthVars } from '../auth.js'
import { broadcast } from '../ws.js'

const listPosts = db.prepare<[], FeedPost>(`
  SELECT
    p.*,
    u.username,
    thumb.path   AS thumb_path,
    thumb.width  AS thumb_w,
    thumb.height AS thumb_h,
    display.path AS display_path,
    orig.path    AS orig_path
  FROM posts p
  JOIN users u ON u.id = p.user_id
  LEFT JOIN image_variants thumb   ON thumb.post_id   = p.id AND thumb.variant   = 'thumb'
  LEFT JOIN image_variants display ON display.post_id = p.id AND display.variant = 'display'
  LEFT JOIN image_variants orig    ON orig.post_id    = p.id AND orig.variant    = 'orig'
  ORDER BY p.created_at DESC
  LIMIT 60
`)

const insertPost = db.prepare<[number, string, string, number, number, number]>(
  `INSERT INTO posts (user_id, image_id, caption, width, height, created_at)
   VALUES (?, ?, ?, ?, ?, ?)`,
)

const insertOrigVariant = db.prepare<[number, VariantFormat, string, number, number, number]>(
  `INSERT INTO image_variants (post_id, variant, format, path, width, height, bytes)
   VALUES (?, 'orig', ?, ?, ?, ?, ?)`,
)

type NewPost = {
  userId: number
  imageId: string
  caption: string
  width: number
  height: number
  bytes: number
  format: VariantFormat
  createdAt: number
}

const createPostTx = db.transaction((p: NewPost): number => {
  const r = insertPost.run(p.userId, p.imageId, p.caption, p.width, p.height, p.createdAt)
  const postId = Number(r.lastInsertRowid)
  insertOrigVariant.run(postId, p.format, origSrc(p.imageId), p.width, p.height, p.bytes)
  return postId
})

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

  const createdAt = Date.now()
  const postId = createPostTx({
    userId: user.id,
    imageId: result.imageId,
    caption,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
    format: result.format,
    createdAt,
  })

  broadcast({
    type: 'post:created',
    id: postId,
    image_id: result.imageId,
    username: user.username,
    caption,
    width: result.width,
    height: result.height,
    created_at: createdAt,
    orig_path: origSrc(result.imageId),
  })

  return c.redirect('/')
})
