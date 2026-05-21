import { mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import sharp from 'sharp'
import type { VariantFormat } from './db.js'

export const UPLOAD_DIR = 'public/uploads'
export const ORIG_DIR = join(UPLOAD_DIR, 'orig')
export const THUMB_DIR = join(UPLOAD_DIR, 'thumb')
export const DISPLAY_DIR = join(UPLOAD_DIR, 'display')

export const MAX_BYTES = 8 * 1024 * 1024

const EXT_BY_FORMAT: Record<string, VariantFormat> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  gif: 'gif',
}

mkdirSync(ORIG_DIR, { recursive: true })
mkdirSync(THUMB_DIR, { recursive: true })
mkdirSync(DISPLAY_DIR, { recursive: true })

export type ProcessResult = {
  imageId: string
  width: number
  height: number
  bytes: number
  format: VariantFormat
}

export async function processUpload(buf: Buffer): Promise<ProcessResult> {
  const meta = await sharp(buf).metadata()
  if (!meta.width || !meta.height || !meta.format) {
    throw new Error('invalid image: missing metadata')
  }
  const format = EXT_BY_FORMAT[meta.format]
  if (!format) {
    throw new Error(`unsupported format: ${meta.format}`)
  }

  const imageId = `${randomUUID()}.${format}`
  await writeFile(join(ORIG_DIR, imageId), buf)

  return { imageId, width: meta.width, height: meta.height, bytes: buf.byteLength, format }
}

export function origSrc(imageId: string): string {
  return `/uploads/orig/${imageId}`
}

export function imageSrc(imageId: string): string {
  return origSrc(imageId)
}
