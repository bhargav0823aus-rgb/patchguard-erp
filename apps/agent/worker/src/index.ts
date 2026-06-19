import { EarthCaptureSource } from './earth/source.js'
import { SatelliteCaptureSource } from './satellite/source.js'
import { StreetViewCaptureSource } from './streetview/source.js'
import type { CaptureSource } from './captureSource.js'
import { emit } from './events.js'
import { UploadError, uploadBatch } from './upload.js'
import type { Frame, JobSpec } from './types.js'

const AGENT_BASE = process.env.AGENT_BASE ?? 'http://localhost:8765'
const HEADLESS = (process.env.WORKER_HEADLESS ?? 'true') !== 'false'
const CAPTURE_SOURCE = (process.env.CAPTURE_SOURCE ?? 'satellite').toLowerCase()
const MAX_RETRIES = 3

function buildSource(): CaptureSource {
  if (CAPTURE_SOURCE === 'earth') {
    console.log('[capture] using Earth (Puppeteer) — needs working WebGL')
    return new EarthCaptureSource({ headless: HEADLESS })
  }
  if (CAPTURE_SOURCE === 'streetview') {
    const key = process.env.GOOGLE_MAPS_API_KEY ?? ''
    console.log('[capture] using Google Street View Static API (with satellite fallback)')
    return new StreetViewCaptureSource(key)
  }
  console.log('[capture] using satellite tiles (Esri World Imagery)')
  return new SatelliteCaptureSource()
}

async function claimJob(): Promise<JobSpec | null> {
  const res = await fetch(`${AGENT_BASE.replace(/\/$/, '')}/worker/next`)
  if (!res.ok) return null
  return (await res.json()) as JobSpec
}

async function runJob(job: JobSpec): Promise<void> {
  console.log(`[job ${job.job_id}] label=${job.label} waypoints=${job.waypoints.length}`)
  const source = buildSource()
  await source.init()
  const buffer: Frame[] = []
  let captured = 0
  let skipped = 0

  const flush = async (): Promise<void> => {
    if (buffer.length === 0) return
    const batch = buffer.splice(0, buffer.length)
    const fromIndex = batch[0]!.index
    const toIndex = batch[batch.length - 1]!.index
    try {
      const resp = await uploadBatch(job.upload_base, job.job_id, batch)
      await emit(AGENT_BASE, job.job_id, {
        t: 'batch_uploaded',
        from_index: fromIndex,
        to_index: toIndex,
        count: batch.length,
      })
      // Fan-out one step_image per ingested item so the dashboard can show the
      // latest annotated capture in real time.
      for (let i = 0; i < resp.items.length; i++) {
        const it = resp.items[i]!
        const idx = batch[i]?.index ?? (fromIndex + i)
        await emit(AGENT_BASE, job.job_id, {
          t: 'step_image',
          index: idx,
          image_id: it.image_id,
          image_url: it.annotated_image_url,
          damages: it.damages,
          vision_description: it.vision_description,
          latitude: it.latitude,
          longitude: it.longitude,
        })
      }
    } catch (err) {
      const status = err instanceof UploadError ? err.status : 0
      console.error(`[upload] failed for batch ${fromIndex}..${toIndex}:`, err)
      await emit(AGENT_BASE, job.job_id, {
        t: 'batch_failed',
        from_index: fromIndex,
        to_index: toIndex,
        status,
        reason: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      })
    }
  }

  try {
    for (let i = 0; i < job.waypoints.length; i++) {
      const wp = job.waypoints[i]!
      let attempt = 0
      let frame: Frame | null = null
      while (attempt < MAX_RETRIES) {
        try {
          const shot = await source.captureAt(wp, job.settle_ms)
          frame = {
            index: i,
            capturedAt: shot.capturedAt,
            jpeg: shot.jpeg,
            fix: {
              lat: wp.lat,
              lng: wp.lng,
              accuracy: 1.0,        // synthetic; Earth coords are exact
              altitude: null,
              heading: wp.heading,
              speed: null,
              fixedAt: shot.capturedAt,
            },
          }
          break
        } catch (err) {
          attempt += 1
          console.error(`[wp ${i}] attempt ${attempt} failed:`, err)
          await new Promise((r) => setTimeout(r, 500 * 2 ** attempt))
        }
      }
      if (!frame) {
        skipped += 1
        await emit(AGENT_BASE, job.job_id, {
          t: 'waypoint_failed',
          index: i,
          reason: 'earth_capture_failed',
        })
        continue
      }
      buffer.push(frame)
      captured += 1
      await emit(AGENT_BASE, job.job_id, {
        t: 'progress',
        index: i,
        waypoint: wp,
        preview_b64: frame.jpeg.toString('base64'),
      })
      if (buffer.length >= job.batch_size) {
        await flush()
      }
    }
    await flush()
    await emit(AGENT_BASE, job.job_id, { t: 'done', captured, skipped })
  } finally {
    await source.dispose()
  }
}

async function main(): Promise<void> {
  console.log(`worker started, polling ${AGENT_BASE}`)
  while (true) {
    try {
      const job = await claimJob()
      if (!job) {
        await new Promise((r) => setTimeout(r, 2000))
        continue
      }
      await runJob(job)
    } catch (err) {
      console.error('job loop error', err)
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
}

main().catch((err) => {
  console.error('fatal', err)
  process.exit(1)
})
