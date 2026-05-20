# VEE-REAL

シンプルな画像共有掲示板 (BeReal 風)。Hono + `node:sqlite` + jQuery/Fancybox の MPA。

`PROMPT.md` にある通り、「**どこまでモダンに改善できるか**」を題材にするための、わざと素朴な実装が出発点です。

## 必要なもの

- Node.js 24+（`node:sqlite` を使うため。v22 だと `--experimental-sqlite` フラグが必要）
- pnpm

## 起動手順

```bash
pnpm install         # 依存インストール (sharp のみネイティブビルドが走ります)
npm run migrate      # seed/ から DB と画像を復元 (10 users / 202 posts)
pnpm dev             # http://localhost:3000
```

SQLite は Node 同梱の `node:sqlite` を使うため、SQLite まわりのネイティブビルドはありません。

## デフォルトログイン

`migrate` 直後は以下のユーザーが入っています。

| ユーザー名 | パスワード |
|---|---|
| `yamato` / `akari` / `ren` / `mei` / `haruto` / `yuna` / `sora` / `riko` | `password123` |

## コマンド一覧

| コマンド | 用途 |
|---|---|
| `pnpm dev` | watch モードで起動 |
| `pnpm start` | watch なしで起動 |
| `pnpm typecheck` | TypeScript の型チェック |
| `npm run migrate` | `seed/` から DB と画像を初期化 |
| `POSTS=N pnpm exec tsx scripts/seed.ts` | picsum から N 件の投稿を追加生成 |

## 環境変数

| 名前 | デフォルト | 意味 |
|---|---|---|
| `PORT` | `3000` | listen ポート |
| `DB_PATH` | `data/app.db` | SQLite ファイルパス |
| `POSTS` | `120` | `scripts/seed.ts` で生成する件数 |

## ディレクトリ構成

```
src/
  index.ts            # Hono サーバー本体
  db.ts               # SQLite スキーマ (node:sqlite ラッパ)
  auth.ts             # bcryptjs パスワード + DB ベースのセッション
  images.ts           # 画像保存 (リサイズなし、原寸そのまま)
  routes/             # /signup /login /logout / /post
  views/              # hono/jsx テンプレート (Layout / Feed / Post / Auth)
public/
  styles.css          # 単一の CSS (mobile-first + grid サムネ)
  favicon.svg
scripts/
  seed.ts             # picsum.photos からシードデータ生成
  migrate.ts          # seed/ snapshot から初期化
seed/
  db.sql              # SQL ダンプ (CREATE TABLE + INSERT)
  uploads/            # 画像スナップショット (~180MB)
```

## 再スナップショットしたいとき

データを足したり編集したあとに `seed/` を更新したい場合:

```bash
sqlite3 data/app.db ".dump" > seed/db.sql
rm -rf seed/uploads && cp -c -R public/uploads seed/uploads
```

(`cp -c` は macOS の APFS clone。Linux なら `cp -R` で OK。)
