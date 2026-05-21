// 投稿フォームの共通ロジック: プレビュー表示・WebP化リサイズ・送信。
// data-post-form 属性付きの form 全てにバインドする（スタンドアロン /post とモーダル両対応）。

const MAX_EDGE = 1600
const WEBP_QUALITY = 0.85
const JPEG_QUALITY = 0.85

const supportsOffscreen = typeof OffscreenCanvas !== 'undefined'

const canEncodeWebp = async () => {
  try {
    const c = supportsOffscreen
      ? new OffscreenCanvas(2, 2)
      : Object.assign(document.createElement('canvas'), { width: 2, height: 2 })
    const ctx = c.getContext('2d')
    ctx.fillRect(0, 0, 2, 2)
    const blob = supportsOffscreen
      ? await c.convertToBlob({ type: 'image/webp', quality: 0.5 }).catch(() => null)
      : await new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/webp', 0.5))
    return !!blob && blob.type === 'image/webp'
  } catch {
    return false
  }
}

const webpSupported = await canEncodeWebp()

async function compress(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = supportsOffscreen
    ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement('canvas'), { width: w, height: h })
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()

  const type = webpSupported ? 'image/webp' : 'image/jpeg'
  const quality = webpSupported ? WEBP_QUALITY : JPEG_QUALITY
  const blob = supportsOffscreen
    ? await canvas.convertToBlob({ type, quality })
    : await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), type, quality),
      )

  const ext = type === 'image/webp' ? 'webp' : 'jpg'
  const base = (file.name || 'photo').replace(/\.[^.]+$/, '') || 'photo'
  return new File([blob], `${base}.${ext}`, { type })
}

const bindForm = (form) => {
  const fileInput = form.querySelector('input[type="file"]')
  const preview = form.querySelector('.preview')
  const status = form.querySelector('.post-status')
  const submitBtn = form.querySelector('button[type="submit"]')
  const dialog = form.closest('dialog')

  let previewUrl = null

  const setStatus = (msg, isError = false) => {
    if (!status) return
    status.textContent = msg ?? ''
    status.classList.toggle('error', !!isError)
  }

  const resetUI = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      previewUrl = null
    }
    if (preview) {
      preview.removeAttribute('src')
      preview.hidden = true
    }
    setStatus('')
    if (submitBtn) submitBtn.disabled = false
    form.reset()
  }

  // モーダルが閉じる時に状態を初期化（リセット）。
  if (dialog) {
    dialog.addEventListener('close', () => resetUI())
  }

  fileInput?.addEventListener('change', () => {
    const f = fileInput.files?.[0]
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      previewUrl = null
    }
    if (!f) {
      if (preview) {
        preview.removeAttribute('src')
        preview.hidden = true
      }
      setStatus('')
      return
    }
    previewUrl = URL.createObjectURL(f)
    if (preview) {
      preview.src = previewUrl
      preview.hidden = false
    }
    setStatus(`選択: ${f.name} · ${(f.size / 1024).toFixed(0)} KB`)
  })

  form.addEventListener('submit', async (ev) => {
    const file = fileInput?.files?.[0]
    if (!file) return // ネイティブの required に任せる

    ev.preventDefault()
    if (submitBtn) submitBtn.disabled = true
    setStatus('圧縮中…')

    let outFile
    try {
      outFile = await compress(file)
    } catch (e) {
      console.error(e)
      setStatus('画像の処理に失敗しました。別の画像でお試しください。', true)
      if (submitBtn) submitBtn.disabled = false
      return
    }

    const before = (file.size / 1024).toFixed(0)
    const after = (outFile.size / 1024).toFixed(0)
    setStatus(`アップロード中… (${before}KB → ${after}KB)`)

    const fd = new FormData(form)
    fd.set('image', outFile)

    try {
      const res = await fetch('/post', { method: 'POST', body: fd, redirect: 'follow' })
      if (res.ok || res.redirected) {
        if (dialog && dialog.open) {
          // モーダル送信: 閉じるだけ。フィードは WS 経由で更新される。
          dialog.close()
        } else {
          location.href = res.url || '/'
        }
        return
      }
      setStatus(`投稿に失敗しました (HTTP ${res.status})`, true)
      if (submitBtn) submitBtn.disabled = false
    } catch (e) {
      console.error(e)
      setStatus('ネットワークエラーで投稿できませんでした。', true)
      if (submitBtn) submitBtn.disabled = false
    }
  })
}

document.querySelectorAll('form[data-post-form]').forEach(bindForm)
