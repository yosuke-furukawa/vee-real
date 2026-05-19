import type { FC } from 'hono/jsx'
import { Layout } from './layout.js'
import type { Post, User } from '../db.js'
import { imageSrc } from '../images.js'

type Props = {
  user: User | null
  posts: Post[]
}

const fmtRelative = (ms: number, now: number): string => {
  const diff = Math.max(0, now - ms)
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `たった今`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}分前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}時間前`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}日前`
  const jst = new Date(ms + 9 * 60 * 60 * 1000)
  return `${jst.getUTCMonth() + 1}/${jst.getUTCDate()}`
}

export const FeedPage: FC<Props> = ({ user, posts }) => {
  const now = Date.now()
  return (
    <Layout title="フィード" user={user} description="VEE-REAL: 今日の一枚をシェア">
      {posts.length === 0 && (
        <p class="empty">
          まだ投稿はありません。{user ? <a href="/post">最初の一枚を投稿</a> : <a href="/signup">登録して投稿</a>}しよう。
        </p>
      )}

      <ol class="feed" role="list">
        {posts.map((p) => {
          const ago = fmtRelative(p.created_at, now)
          const title = p.caption ? `@${p.username} · ${ago} · ${p.caption}` : `@${p.username} · ${ago}`
          return (
            <li class="card" title={title}>
              <a href={imageSrc(p.image_id)} data-fancybox="feed" data-caption={title}>
                <img
                  class="photo"
                  src={imageSrc(p.image_id)}
                  width={p.width}
                  height={p.height}
                  loading="lazy"
                  decoding="async"
                  alt={p.caption || `@${p.username} の投稿`}
                />
              </a>
              <div class="card-head">
                <span class="user">@{p.username}</span>
                <time class="ago" dateTime={new Date(p.created_at).toISOString()}>{ago}</time>
              </div>
            </li>
          )
        })}
      </ol>
    </Layout>
  )
}
