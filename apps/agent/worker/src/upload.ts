// Uses Node 22's built-in fetch + WHATWG FormData/Blob.
// No node-fetch / form-data deps needed.

import type { Frame, UploadItem } from './types.js'

export class UploadError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export function filenameFor(jobId: string, frame: Frame): string {
  const idx = String(frame.index).padStart(6, '0')
  return `img_${jobId.slice(0, 8)}_${idx}_${frame.capturedAt}.jpg`
}

function frameToUploadItem(jobId: string, frame: Frame): UploadItem {
  return {
    filename: filenameFor(jobId, frame),
    latitude: frame.fix.lat ?? null,
    longitude: frame.fix.lng ?? null,
    captured_at: new Date(frame.capturedAt).toISOString(),
    heading: frame.fix.heading ?? null,
    altitude: frame.fix.altitude ?? null,
    gps_accuracy: frame.fix.accuracy ?? null,
  }
}

export type IngestedItem = {
  image_id: string
  annotated_image_url: string
  damages: number
  vision_description: string | null
  latitude: number
  longitude: number
}

export type BatchResponse = {
  ok: boolean
  ingested: number
  items: IngestedItem[]
}

export async function uploadBatch(
  uploadBase: string,
  jobId: string,
  frames: Frame[],
): Promise<BatchResponse> {
  const url = `${uploadBase.replace(/\/$/, '')}/api/v1/images/batch`

  const form = new FormData()
  const items: UploadItem[] = []
  for (const f of frames) {
    const name = filenameFor(jobId, f)
    // Node 22 has Blob globally; jpeg is a Buffer which Blob accepts.
    // Uint8Array works as a BlobPart and avoids the SharedArrayBuffer typing pitfall on Node's
    // Buffer.buffer (which can be SharedArrayBuffer in strict TS).
    const bytes = new Uint8Array(f.jpeg.buffer, f.jpeg.byteOffset, f.jpeg.byteLength)
    const blob = new Blob([bytes as BlobPart], { type: 'image/jpeg' })
    form.append('files', blob, name)
    items.push(frameToUploadItem(jobId, f))
  }
  form.append('items_json', JSON.stringify(items))
  // Links uploaded images to their inspection row in the ERP.
  form.append('job_id', jobId)

  const headers: Record<string, string> = {}
  if (process.env.WORKER_TOKEN) headers['X-Worker-Token'] = process.env.WORKER_TOKEN

  const res = await fetch(url, { method: 'POST', body: form, headers })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new UploadError(res.status, `Upload failed: HTTP ${res.status} ${body.slice(0, 200)}`)
  }
  return (await res.json()) as BatchResponse
}
