# PLAN: VEE-REAL 高速化 / 画像配信改善

ターゲットは「最新ではないスマホ・月末ギガ枯れの高校生」。
通信量と表示初速を最優先に、サーバー処理は重くしすぎず段階的に進める。

ブランチ: `feature/performance-improvements`

---

## 現状サマリ

- 投稿: `POST /post` で multipart formdata。`sharp` でメタ取得だけして **原寸のまま** `public/uploads/<uuid>.jpg` に保存。
- 配信: Hono の `serveStatic` が `/uploads/*` をそのまま返す。HTTP/1.1。
- フィード: 原寸 `<img>` を `loading="lazy"` で並べるだけ。1枚 1〜数 MB のJPGがそのまま流れる。
- DB: SQLite。`posts(image_id, width, height, ...)` の1レコード=1画像。バリアント概念なし。
- 投稿UI: `<input type="file">` のみ、プレビューも圧縮もなし。
- 既存アップロード画像: `public/uploads/*.jpg` が 60枚ほど。マイグレ対象。

---

## ゴール

- フィードで流れるバイト数を **1枚あたり 1MB前後 → 50〜150KB** まで落とす（WebP + リサイズ）。
- 投稿時のアップロード量も削る（ローカルでリサイズ・WebP化してから送る）。
- HTTP/3 で初回 RTT・ロス耐性を改善。
- 既存の MPA + formdata 動作は **JS無しでも壊さない** (progressive enhancement)。

---

## タスク一覧

### Task 1. 画像バリアント基盤 (DBスキーマ + ファイル配置)

**目的**: 1枚の投稿に対して「原本」「サムネ(webp)」「表示用(webp)」など複数のバリアントを持てるようにする。バッチ処理の前提。

**作業**:
- `src/db.ts` に `image_variants` テーブル追加。
  ```sql
  CREATE TABLE image_variants (
    post_id   INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    variant   TEXT NOT NULL,             -- 'orig' | 'thumb' | 'display'
    format    TEXT NOT NULL,             -- 'webp' | 'jpg' | 'png'
    path      TEXT NOT NULL,             -- '/uploads/thumb/<uuid>.webp'
    width     INTEGER NOT NULL,
    height    INTEGER NOT NULL,
    bytes     INTEGER NOT NULL,
    PRIMARY KEY (post_id, variant)
  );
  ```
- `posts` テーブルに `process_status TEXT NOT NULL DEFAULT 'pending'` (`pending|done|failed`) を追加（既存レコードの ALTER 含む）。
- ディレクトリ構成:
  - `public/uploads/orig/<uuid>.<ext>`   ← バッチ前のアップ済み原本
  - `public/uploads/thumb/<uuid>.webp`   ← フィード用
  - `public/uploads/display/<uuid>.webp` ← 単票表示用 (将来詳細ページで使う)
- マイグレーション:
  - 既存 `public/uploads/<uuid>.jpg` を `public/uploads/orig/` に移動するスクリプト。
  - 既存 `posts` 行に `process_status='pending'` を入れる。
  - `scripts/migrate.ts` も新スキーマに合わせて更新（seed復元時の配置を `orig/` に）。

**完了条件**: `pnpm migrate` 後にDBが新スキーマで立ち上がり、既存画像がすべて `orig/` 配下に存在し、`posts.process_status='pending'` で残っている。

---

### Task 2. バッチ画像処理ワーカー

**目的**: 投稿時はI/Oだけで返す。WebP化・リサイズは後追いで非同期に。

**設計判断**:
- 単一プロセス・小規模なので **インプロセスのワーカー** で十分（外部キュー不要）。
- 起動方法は 2way:
  - (A) `pnpm dev` / `pnpm start` 時に**バックグラウンドループとして自動起動**（`setTimeout` で繰り返し、`process_status='pending'` を1件ずつ拾う）。
  - (B) `scripts/process-images.ts` で **手動 / cron 用のワンショット実行**。CIや初期マイグレ後の一括変換に使う。
- バリアント生成パラメタ（初期値、後で調整可）:
  - `thumb`:    長辺 720px / WebP / quality 70
  - `display`:  長辺 1440px / WebP / quality 80
  - 原本は触らず保管（後から再生成可能なように）。

**作業**:
- `src/worker/imageProcessor.ts` を新規作成。
  - 1件取り出し → `sharp(orig).resize(...).webp({quality}).toFile(...)` を thumb / display 2回流す。
  - 完了したら `image_variants` に2行 INSERT、`posts.process_status='done'` を1トランザクションで。
  - 失敗時は `failed` にして次へ（再試行は当面手動）。
- `src/index.ts` でアプリ起動時にワーカーループも起動（`startProcessorLoop({ intervalMs: 2000 })`）。
- `scripts/process-images.ts` を追加、`pnpm process-images` を `package.json` に登録。
- 同時実行制御: SQLite なので `UPDATE posts SET process_status='running' WHERE id=? AND process_status='pending'` の `changes` で奪取する単純ロック。

**完了条件**: 既存60枚+新規投稿が `pnpm process-images` 一発で全部 `done` になり、`public/uploads/thumb/*.webp` と `display/*.webp` が並ぶ。

---

### Task 3. フィードを WebP サムネで配信

**目的**: Task 2 の成果を実際の画面で使う。

**作業**:
- `posts` 取得時に `image_variants` を JOIN して `thumb_path`, `thumb_w`, `thumb_h`（と fallback 用に `orig_path`）を引く。
- `src/images.ts` の `imageSrc()` をバリアント受け取りに変更（または `thumbSrc(post)` 等の小関数を追加）。
- `src/views/feed.tsx` を `<picture>` で書き換え:
  ```jsx
  <picture>
    <source type="image/webp" srcSet={thumb.path} />
    <img src={orig.path} width={thumb.width} height={thumb.height} loading="lazy" decoding="async" />
  </picture>
  ```
  ※ターゲット端末はほぼ WebP 対応だが、未処理 (`pending`) 投稿のために orig fallback は残す。
- 未処理 (`process_status != 'done'`) の投稿は orig をそのまま表示（ブラックアウトしない）。
- `width/height` を thumb のサイズに合わせる（CLS抑制）。
- `<img loading="lazy" decoding="async">` は維持。`fetchpriority="low"` は2画面目以降に。

**完了条件**: ブラウザのNetworkで `/uploads/thumb/*.webp` が読まれ、各画像 100〜150KB 程度に収まる。CLSが出ない。

---

### Task 4. クライアントサイドの投稿UI改善

**目的**: 「プレビューが無い」「原寸が送られて月末ギガを食う」を同時に解決。サーバー実装はほぼ触らない。

**設計**:
- `<input type="file">` の `change` で `URL.createObjectURL` を `<img>` の `src` に → 即プレビュー。
- 送信前に `<canvas>` (もしくは `createImageBitmap` + OffscreenCanvas) で長辺 1600px 程度にダウンスケール、`canvas.convertToBlob({ type:'image/webp', quality:0.85 })` で WebP 化。
- 旧ブラウザ・WebP 非対応の場合は JPEG にフォールバック。
- formdata 送信のまま（FormData の `image` を加工後 Blob に差し替えて `fetch('/post', { method:'POST', body: fd })`）。リダイレクト先 HTML を `document.write` するか、`location.href = res.url` で遷移。
- **JSなしでも動く**: `<form action="/post" method="post" enctype="multipart/form-data">` はそのまま残し、JS が `submit` を `preventDefault` して上書きする progressive enhancement。
- カメラ起動用 `capture="environment"` は維持。

**作業**:
- `public/post.js` を追加（モジュール、TS は使わず素のJS。サイズも軽くしたい）。
- `src/views/post.tsx` でプレビュー枠 (`<img id="preview">`)、進捗表示、`<script type="module" src="/post.js" defer></script>` を追加。
- サーバ側 `POST /post` は最大バイトを少しだけ緩める or そのまま (8MB のままで十分)。EXIF回転は `sharp` 側で吸収する（既に `metadata` 経由）。

**完了条件**: ファイル選択 → プレビュー即表示、送信時にWebP化されて 200〜400KB 程度で `/post` に送られる。JSオフでも従来通り formdata で投稿できる。

---

### Task 5. Caddy で HTTP/3 リバースプロキシ

**目的**: 配信を HTTP/3 化。アプリ側は Node のまま 3000 で listen し続ける。

**選定**: Caddy。理由 — QUIC/HTTP3 標準サポート、自動 TLS、Caddyfile が短い、開発時もローカル証明書が自動。

**作業**:
- `Caddyfile` を追加:
  ```caddy
  {
      auto_https disable_redirects
      servers {
          protocols h1 h2 h3
      }
  }

  vee-real.localhost, localhost {
      encode zstd gzip
      @uploads path /uploads/*
      header @uploads Cache-Control "public, max-age=31536000, immutable"
      reverse_proxy 127.0.0.1:3000
  }
  ```
- `docker-compose.yml` (もしくは README の起動手順) を追加:
  - `app`: Node 22, `pnpm start`, expose 3000
  - `caddy`: `caddy:2-alpine`, UDP/443 を含めて公開
- ローカル開発手順:
  - `pnpm dev` を起動 → 別シェルで `caddy run` (or `docker compose up caddy`)。
  - Chrome の `chrome://flags/#enable-quic` を有効化 + DevTools Network パネルで `h3` 表示を確認。
- アップロード上限を Caddy 側でも明示: `request_body { max_size 16MB }` を `/post` ルートに付ける（クライアントWebP化後でも余裕を持って）。
- 注意点メモ:
  - `127.0.0.1:3000` への upstream は HTTP/1.1 でよい（HTTP/3 は外向きだけ）。
  - 静的 `/uploads/*` は将来 Caddy 直配信に切り替えると更に軽くなる（今回は Hono 経由のまま、Cache-Control だけ Caddy で付ける）。

**完了条件**: `curl --http3 https://localhost/` が 200。DevTools の Protocol 列に `h3` が並ぶ。`/uploads/*.webp` に長期 `Cache-Control` が乗る。

---

## 実施順（推奨）

1. **Task 1** スキーマと配置の土台 (これが全部の前提)
2. **Task 2** ワーカー（既存画像も一括変換して効果を即可視化）
3. **Task 3** フィードを WebP に切替 ← ここでまず体感が変わる
4. **Task 4** クライアント投稿UI（送信量削減 + UX改善）
5. **Task 5** Caddy + HTTP/3（インフラ層、独立性が高いので最後）

各タスクは独立したコミット単位で進める。1〜3 を1つの動作するセットにし、その後 4, 5 を順に。

---

## 動作確認のやり方

- `pnpm dev` 起動後、Chrome DevTools MCP でブラウザ自動操作可能:
  - フィードを開き、Network で WebP・サイズ・キャッシュヘッダ・Protocol を確認
  - 投稿ページでプレビュー → 送信 → リダイレクト先のフィードに新画像が出るか
- 既存画像での回帰確認: `seed` を `pnpm migrate` で戻して `pnpm process-images` 流す。

---

## 後回し（今回スコープ外）

- 詳細ページ（個別投稿URL）。`display` バリアントは作るが表示先は次フェーズ。
- CDN / S3 化。今回はローカル `public/uploads` のまま。
- AVIF 対応。WebP で十分な軽量化が取れる想定。
- 失敗バリアントの自動リトライ／監視。当面は手動 `pnpm process-images`。
