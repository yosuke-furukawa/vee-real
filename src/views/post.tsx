import type { FC } from 'hono/jsx'
import { Layout } from './layout.js'
import type { User } from '../db.js'

type Props = {
  user: User
  error?: string
}

export const PostPage: FC<Props> = ({ user, error }) => (
  <Layout title="投稿" user={user}>
    <section class="post-form">
      <h1>写真を投稿</h1>
      {error && <p class="error" role="alert">{error}</p>}
      <form method="post" action="/post" enctype="multipart/form-data" class="stack">
        <label class="file-pick">
          <span class="file-pick-label">📷 写真をえらぶ / 撮る</span>
          <input
            type="file"
            name="image"
            accept="image/jpeg,image/png,image/webp,image/gif"
            capture="environment"
            required
          />
          <span class="file-pick-hint">最大 8MB · 原寸のまま投稿されます</span>
        </label>
        <label>
          <span>ひとこと（任意・最大140字）</span>
          <textarea name="caption" maxLength={140} rows={3} placeholder="今日のひとこと…" />
        </label>
        <button type="submit" class="btn btn-primary btn-block">投稿する</button>
      </form>
    </section>
  </Layout>
)
