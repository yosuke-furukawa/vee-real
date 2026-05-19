import { mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import sharp from 'sharp'

export const UPLOAD_DIR = 'public/uploads'
export const MAX_BYTES = 8 * 1024 * 1024

const EXT_BY_FORMAT: Record<string, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  gif: 'gif',
}

mkdirSync(UPLOAD_DIR, { recursive: true })

export type ProcessResult = {
  imageId: string
  width: number
  height: number
}

export async function processUpload(buf: Buffer): Promise<ProcessResult> {
  const meta = await sharp(buf).metadata()
  if (!meta.width || !meta.height || !meta.format) {
    throw new Error('invalid image: missing metadata')
  }
  const ext = EXT_BY_FORMAT[meta.format]
  if (!ext) {
    throw new Error(`unsupported format: ${meta.format}`)
  }

  const imageId = `${randomUUID()}.${ext}`
  await writeFile(join(UPLOAD_DIR, imageId), buf)

  return { imageId, width: meta.width, height: meta.height }
}

export function imageSrc(imageId: string): string {
  return `/uploads/${imageId}`
}
