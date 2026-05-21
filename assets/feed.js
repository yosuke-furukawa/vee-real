// フィードを WebSocket で購読し、新規投稿が来たら先頭に追加、
// 画像処理（thumb/display 生成）が終わったら src を WebP に差し替える。

const feed = document.querySelector('[data-feed]')
if (feed) {
  const fmtRelative = (ms, now) => {
    const diff = Math.max(0, now - ms)
    const sec = Math.floor(diff / 1000)
    if (sec < 60) return 'たった今'
    const min = Math.floor(sec / 60)
    if (min < 60) return `${min}分前`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `${hr}時間前`
    const day = Math.floor(hr / 24)
    if (day < 7) return `${day}日前`
    const jst = new Date(ms + 9 * 60 * 60 * 1000)
    return `${jst.getUTCMonth() + 1}/${jst.getUTCDate()}`
  }

  const findCard = (id) => feed.querySelector(`li.card[data-post-id="${id}"]`)

  const buildTitle = (username, ago, caption) =>
    caption ? `@${username} · ${ago} · ${caption}` : `@${username} · ${ago}`

  const prependCreated = (e) => {
    if (findCard(e.id)) return // 既存（自分の投稿後のリダイレクト直後など）は無視
    const empty = document.querySelector('[data-feed-empty]')
    if (empty) empty.remove()

    const ago = fmtRelative(e.created_at, Date.now())
    const title = buildTitle(e.username, ago, e.caption)
    const alt = e.caption || `@${e.username} の投稿`

    const li = document.createElement('li')
    li.className = 'card'
    li.title = title
    li.dataset.postId = String(e.id)

    const a = document.createElement('a')
    a.href = e.orig_path
    a.setAttribute('data-fancybox', 'feed')
    a.setAttribute('data-caption', title)

    const img = document.createElement('img')
    img.className = 'photo'
    img.src = e.orig_path
    img.width = e.width
    img.height = e.height
    img.loading = 'lazy'
    img.decoding = 'async'
    img.alt = alt
    a.appendChild(img)

    const head = document.createElement('div')
    head.className = 'card-head'
    const user = document.createElement('span')
    user.className = 'user'
    user.textContent = `@${e.username}`
    const time = document.createElement('time')
    time.className = 'ago'
    time.dateTime = new Date(e.created_at).toISOString()
    time.textContent = ago
    head.appendChild(user)
    head.appendChild(time)

    li.appendChild(a)
    li.appendChild(head)
    feed.prepend(li)
  }

  const applyProcessed = (e) => {
    const li = findCard(e.id)
    if (!li) return
    const a = li.querySelector('a[data-fancybox]')
    const img = li.querySelector('img.photo')
    if (!a || !img) return

    // 既に <picture> 化済みなら source を上書き、なければ <picture> でラップする。
    let picture = img.parentElement && img.parentElement.tagName === 'PICTURE' ? img.parentElement : null
    if (!picture) {
      picture = document.createElement('picture')
      img.replaceWith(picture)
      picture.appendChild(img)
    }
    let source = picture.querySelector('source[type="image/webp"]')
    if (!source) {
      source = document.createElement('source')
      source.type = 'image/webp'
      picture.insertBefore(source, img)
    }
    source.srcset = e.thumb_path
    img.width = e.thumb_w
    img.height = e.thumb_h
    a.href = e.display_path
  }

  let ws = null
  let reconnectDelay = 1000
  const MAX_DELAY = 30_000

  const connect = () => {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${proto}//${location.host}/ws`
    try {
      ws = new WebSocket(url)
    } catch (err) {
      console.error('[feed] websocket open failed', err)
      scheduleReconnect()
      return
    }

    ws.addEventListener('open', () => {
      reconnectDelay = 1000
    })
    ws.addEventListener('message', (ev) => {
      let msg
      try {
        msg = JSON.parse(ev.data)
      } catch {
        return
      }
      if (!msg || typeof msg !== 'object') return
      if (msg.type === 'post:created') prependCreated(msg)
      else if (msg.type === 'post:processed') applyProcessed(msg)
    })
    ws.addEventListener('close', scheduleReconnect)
    ws.addEventListener('error', () => {
      try {
        ws?.close()
      } catch {
        // ignore
      }
    })
  }

  const scheduleReconnect = () => {
    setTimeout(connect, reconnectDelay)
    reconnectDelay = Math.min(MAX_DELAY, reconnectDelay * 2)
  }

  connect()
}
