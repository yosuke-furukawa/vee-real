import type { FC, PropsWithChildren } from 'hono/jsx'
import { raw } from 'hono/html'
import type { User } from '../db.js'

type Props = PropsWithChildren<{
  title: string
  user: User | null
  description?: string
}>

export const Layout: FC<Props> = ({ title, user, description, children }) => (
  <>
    {raw('<!doctype html>')}
    <html lang="ja">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <meta name="color-scheme" content="light dark" />
      <meta name="theme-color" content="#0b0b0c" />
      {description && <meta name="description" content={description} />}
      <title>{title} — VEE-REAL</title>
      <link rel="stylesheet" href="/styles.css" />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fancyapps/fancybox@3.5.7/dist/jquery.fancybox.min.css" />
      <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    </head>
    <body>
      <header class="top">
        <a href="/" class="brand">
          <span class="brand-mark">VEE</span>
          <span class="brand-dot">·</span>
          <span class="brand-real">REAL</span>
        </a>
        <nav>
          {user ? (
            <>
              <a href="/post" class="btn btn-primary" data-open-post>
                <span aria-hidden="true">＋</span> 投稿
              </a>
              <form method="post" action="/logout" class="inline-form">
                <button type="submit" class="btn btn-ghost">ログアウト</button>
              </form>
            </>
          ) : (
            <>
              <a href="/login" class="btn btn-ghost">ログイン</a>
              <a href="/signup" class="btn btn-primary">登録</a>
            </>
          )}
        </nav>
      </header>
      <main>{children}</main>
      <footer>
        <small>VEE-REAL · 通信量を控えめに、思い出は鮮やかに。</small>
      </footer>
      {user && (
        <dialog id="post-modal" class="post-modal" aria-labelledby="post-modal-title">
          <form
            id="post-form-modal"
            data-post-form
            method="post"
            action="/post"
            enctype="multipart/form-data"
            class="stack post-modal-form"
          >
            <header class="post-modal-head">
              <h2 id="post-modal-title">写真を投稿</h2>
              <button type="button" class="btn btn-ghost" data-close-modal aria-label="閉じる">×</button>
            </header>
            <label class="file-pick">
              <span class="file-pick-label">📷 写真をえらぶ / 撮る</span>
              <input
                type="file"
                name="image"
                accept="image/jpeg,image/png,image/webp,image/gif"
                capture="environment"
                required
              />
              <span class="file-pick-hint">最大 8MB · 送信時に自動でリサイズ + WebP化されます</span>
            </label>
            <img id="preview-modal" class="preview" alt="" hidden />
            <p id="status-modal" class="post-status" role="status" aria-live="polite"></p>
            <label>
              <span>ひとこと（任意・最大140字）</span>
              <textarea name="caption" maxLength={140} rows={3} placeholder="今日のひとこと…" />
            </label>
            <button type="submit" class="btn btn-primary btn-block">投稿する</button>
          </form>
        </dialog>
      )}
      <script src="https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js" defer></script>
      <script src="https://cdn.jsdelivr.net/npm/@fancyapps/fancybox@3.5.7/dist/jquery.fancybox.min.js" defer></script>
      {user && <script src="/post-modal.js" type="module" defer></script>}
      {user && <script src="/post.js" type="module" defer></script>}
    </body>
    </html>
  </>
)
