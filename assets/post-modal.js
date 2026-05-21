// "+投稿" を押した時にネイティブ <dialog> を開く。
// /post ページに居る間（JS 無し fallback で着地した状態）は何もしない。

const dialog = document.getElementById('post-modal')
const trigger = document.querySelector('[data-open-post]')
const closeBtn = dialog?.querySelector('[data-close-modal]')

const onPostPage = () => location.pathname === '/post'

const openModal = () => {
  if (!dialog || dialog.open) return
  dialog.showModal()
  if (!onPostPage()) {
    history.pushState({ modal: 'post' }, '', '/post')
  }
}

const closeModal = () => {
  if (!dialog) return
  if (dialog.open) dialog.close()
}

if (dialog && trigger && !onPostPage()) {
  trigger.addEventListener('click', (ev) => {
    // 修飾キー付きクリックは新規タブなど通常遷移に任せる。
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return
    if ('button' in ev && ev.button > 0) return
    ev.preventDefault()
    openModal()
  })

  closeBtn?.addEventListener('click', () => closeModal())

  // dialog 閉じた時に URL を / に戻す（投稿成功 / × ボタン / Esc 共通）。
  dialog.addEventListener('close', () => {
    if (location.pathname === '/post' && history.state?.modal === 'post') {
      history.back()
    }
  })

  // 戻る/進むで /post に来た場合は閉じる。
  window.addEventListener('popstate', () => {
    if (onPostPage()) {
      openModal()
    } else {
      closeModal()
    }
  })
}
