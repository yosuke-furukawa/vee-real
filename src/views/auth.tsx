import type { FC } from 'hono/jsx'
import { Layout } from './layout.js'

type Props = {
  mode: 'login' | 'signup'
  error?: string
  username?: string
}

export const AuthPage: FC<Props> = ({ mode, error, username }) => {
  const isLogin = mode === 'login'
  return (
    <Layout title={isLogin ? 'ログイン' : '登録'} user={null}>
      <section class="auth">
        <h1>{isLogin ? 'おかえり' : 'はじめまして'}</h1>
        <p class="lede">
          {isLogin ? 'ユーザー名とパスワードを入力してね。' : 'ユーザー名とパスワードを決めるだけ。メアド不要。'}
        </p>
        {error && <p class="error" role="alert">{error}</p>}
        <form method="post" action={isLogin ? '/login' : '/signup'} class="stack" autoComplete="on">
          <label>
            <span>ユーザー名</span>
            <input
              name="username"
              type="text"
              required
              minLength={3}
              maxLength={24}
              pattern="[a-zA-Z0-9_]+"
              autoComplete="username"
              value={username ?? ''}
              inputMode="text"
            />
          </label>
          <label>
            <span>パスワード</span>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              maxLength={128}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
            />
          </label>
          <button type="submit" class="btn btn-primary btn-block">
            {isLogin ? 'ログイン' : '登録する'}
          </button>
        </form>
        <p class="muted">
          {isLogin ? (
            <>はじめての方は <a href="/signup">新規登録</a></>
          ) : (
            <>すでにアカウントがある？ <a href="/login">ログイン</a></>
          )}
        </p>
      </section>
    </Layout>
  )
}
