import { join } from 'node:path'
import sharp from 'sharp'
import { db } from '../db.js'
import { ORIG_DIR, THUMB_DIR, DISPLAY_DIR } from '../images.js'
import { broadcast } from '../ws.js'

const THUMB_MAX = 480
const DISPLAY_MAX = 1200
const THUMB_QUALITY = 55
const DISPLAY_QUALITY = 70
const WEBP_EFFORT = 6

type Job = { id: number; image_id: string }

const claimNext = db.prepare<[], Job>(`
  UPDATE posts
  SET process_status = 'running'
  WHERE id = (
    SELECT id FROM posts
    WHERE process_status = 'pending'
    ORDER BY id ASC
    LIMIT 1
  )
  RETURNING id, image_id
`)

const insertVariant = db.prepare<[number, 'thumb' | 'display', string, number, number, number]>(
  `INSERT INTO image_variants (post_id, variant, format, path, width, height, bytes)
   VALUES (?, ?, 'webp', ?, ?, ?, ?)`,
)
const deleteVariant = db.prepare<[number, 'thumb' | 'display']>(
  `DELETE FROM image_variants WHERE post_id = ? AND variant = ?`,
)
const markDone = db.prepare<[number]>(`UPDATE posts SET process_status = 'done' WHERE id = ?`)
const markFailed = db.prepare<[number]>(`UPDATE posts SET process_status = 'failed' WHERE id = ?`)

type VariantOut = { width: number; height: number; bytes: number; path: string }

async function makeVariant(
  origPath: string,
  outPath: string,
  webPath: string,
  maxEdge: number,
  quality: number,
): Promise<VariantOut> {
  const info = await sharp(origPath)
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
    .webp({ quality, effort: WEBP_EFFORT, smartSubsample: true })
    .toFile(outPath)
  return { width: info.width, height: info.height, bytes: info.size, path: webPath }
}

async function processOne(job: Job): Promise<boolean> {
  const origPath = join(ORIG_DIR, job.image_id)
  const webpName = job.image_id.replace(/\.[^.]+$/, '.webp')
  const thumbFsPath = join(THUMB_DIR, webpName)
  const displayFsPath = join(DISPLAY_DIR, webpName)

  try {
    const thumb = await makeVariant(origPath, thumbFsPath, `/uploads/thumb/${webpName}`, THUMB_MAX, THUMB_QUALITY)
    const display = await makeVariant(origPath, displayFsPath, `/uploads/display/${webpName}`, DISPLAY_MAX, DISPLAY_QUALITY)

    const commit = db.transaction(() => {
      // 再処理対応: 既存行があれば差し替え。
      deleteVariant.run(job.id, 'thumb')
      deleteVariant.run(job.id, 'display')
      insertVariant.run(job.id, 'thumb', thumb.path, thumb.width, thumb.height, thumb.bytes)
      insertVariant.run(job.id, 'display', display.path, display.width, display.height, display.bytes)
      markDone.run(job.id)
    })
    commit()

    broadcast({
      type: 'post:processed',
      id: job.id,
      thumb_path: thumb.path,
      thumb_w: thumb.width,
      thumb_h: thumb.height,
      display_path: display.path,
    })
    return true
  } catch (err) {
    console.error(`[worker] post ${job.id} failed:`, err instanceof Error ? err.message : err)
    markFailed.run(job.id)
    return false
  }
}

export type ProcessSummary = { processed: number; failed: number }

export async function processPending(maxIterations = Number.POSITIVE_INFINITY): Promise<ProcessSummary> {
  let processed = 0
  let failed = 0
  for (let i = 0; i < maxIterations; i++) {
    const job = claimNext.get()
    if (!job) break
    const ok = await processOne(job)
    if (ok) processed++
    else failed++
  }
  return { processed, failed }
}

export function startProcessorLoop(opts: { intervalMs?: number } = {}): void {
  const intervalMs = opts.intervalMs ?? 2000
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      const s = await processPending()
      if (s.processed > 0 || s.failed > 0) {
        console.log(`[worker] processed=${s.processed} failed=${s.failed}`)
      }
    } finally {
      running = false
    }
  }
  setInterval(() => {
    void tick()
  }, intervalMs)
  void tick()
}
