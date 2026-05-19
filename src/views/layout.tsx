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
              <a href="/post" class="btn btn-primary">
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
      <script src="https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js" defer></script>
      <script src="https://cdn.jsdelivr.net/npm/@fancyapps/fancybox@3.5.7/dist/jquery.fancybox.min.js" defer></script>
    </body>
    </html>
  </>
)
