/**
 * StreetViewCaptureSource — fetches Google Street View Static API images angled DOWN
 * at the road surface for road-damage detection (RDD).
 *
 * Pipeline per waypoint:
 *   1. Hit /metadata to find the nearest panorama within `radius_m`.
 *      • If status != OK → fall back to satellite tile (survey continues).
 *      • If `date` is older than `maxAgeYears` → fall back (road may have been resurfaced).
 *   2. Request the image by `pano_id` (stable reference, not lat/lng resolution).
 *      • `pitch=-40` tilts the camera DOWN so the road surface fills the frame —
 *        this is the single most important param for damage detection.
 *      • `fov=90` keeps a wide-ish view without too much fisheye distortion.
 *      • `heading` is the waypoint's forward bearing.
 *
 * Costs are bounded by metadata (free) + one Street View image ($7 / 1000) per waypoint.
 */
import type { CaptureSource } from '../captureSource.js'
import { SatelliteCaptureSource } from '../satellite/source.js'
import type { Waypoint } from '../types.js'

const SV_BASE = 'https://maps.googleapis.com/maps/api/streetview'
const SV_META = 'https://maps.googleapis.com/maps/api/streetview/metadata'

type MetaResponse = {
  status?: string
  pano_id?: string
  date?: string // "YYYY-MM" or "YYYY-MM-DD"
  location?: { lat: number; lng: number }
}

export class StreetViewCaptureSource implements CaptureSource {
  private fallback: SatelliteCaptureSource
  private hits = 0
  private fallbacks = 0
  private stale = 0

  constructor(
    private apiKey: string,
    private size: string = '640x640',
    // Wider than 90° fisheyes; narrower than 90° loses surrounding context.
    // 90° is the sweet spot recommended for RDD pipelines.
    private fov: number = 90,
    // 15m so the API resolves to the panorama nearest the actual road, not an overpass.
    private radius_m: number = 15,
    // -40° tilts the camera DOWN at the pavement. With pitch 0 the road is a thin strip
    // at the bottom; with -40 it fills most of the frame, which is what YOLOv5 needs.
    private pitch: number = -40,
    // Skip panoramas older than this many years (likely resurfaced since capture).
    // 8 years is permissive — tighten to 4–5 if you want fresher imagery only.
    private maxAgeYears: number = 8,
  ) {
    this.fallback = new SatelliteCaptureSource()
  }

  async init(): Promise<void> {
    if (!this.apiKey) throw new Error('GOOGLE_MAPS_API_KEY missing for Street View source')
    const probeUrl = `${SV_META}?location=-33.8688,151.2093&key=${this.apiKey}`
    try {
      const res = await fetch(probeUrl)
      const j = (await res.json()) as MetaResponse
      if (j.status === 'OK') {
        console.log(
          `[capture] Street View Static OK (pitch=${this.pitch}, fov=${this.fov}, radius=${this.radius_m}m)`,
        )
      } else if (j.status === 'REQUEST_DENIED') {
        throw new Error('Street View Static API not enabled or API key invalid')
      } else {
        console.warn(`[capture] Street View probe status: ${j.status}`)
      }
    } catch (err) {
      throw new Error(`Street View probe failed: ${err}`)
    }
    await this.fallback.init()
  }

  /** Parse "YYYY-MM" or "YYYY-MM-DD" → ms-since-epoch. Returns 0 if unparseable. */
  private parseDate(s: string | undefined): number {
    if (!s) return 0
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(s)
    if (!m) return 0
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3] ?? '1')).getTime()
  }

  async captureAt(wp: Waypoint, _settleMs: number): Promise<{ jpeg: Buffer; capturedAt: number }> {
    // 1) Metadata check.
    const metaUrl = `${SV_META}?location=${wp.lat},${wp.lng}&radius=${this.radius_m}&source=outdoor&key=${this.apiKey}`
    let meta: MetaResponse = {}
    try {
      const r = await fetch(metaUrl)
      meta = (await r.json()) as MetaResponse
    } catch {
      meta = { status: 'NETWORK_ERROR' }
    }

    if (meta.status !== 'OK' || !meta.pano_id) {
      this.fallbacks++
      if (this.fallbacks % 5 === 1) {
        console.log(
          `[capture] no SV (${meta.status}) at ${wp.lat.toFixed(5)},${wp.lng.toFixed(5)} — satellite fallback`,
        )
      }
      return this.fallback.captureAt(wp, _settleMs)
    }

    // 2) Freshness check — skip very old captures.
    const captured = this.parseDate(meta.date)
    if (captured > 0) {
      const ageYears = (Date.now() - captured) / (365.25 * 24 * 3600 * 1000)
      if (ageYears > this.maxAgeYears) {
        this.stale++
        if (this.stale % 5 === 1) {
          console.log(
            `[capture] SV too old (${meta.date}, ${ageYears.toFixed(1)}y) at ${wp.lat.toFixed(5)},${wp.lng.toFixed(5)} — satellite fallback`,
          )
        }
        return this.fallback.captureAt(wp, _settleMs)
      }
    }

    // 3) Fetch the image, pulling by pano_id for stability.
    const heading = ((wp.heading % 360) + 360) % 360
    const imgUrl =
      `${SV_BASE}?size=${this.size}` +
      `&pano=${encodeURIComponent(meta.pano_id)}` +
      `&heading=${heading.toFixed(2)}` +
      `&pitch=${this.pitch}` +
      `&fov=${this.fov}` +
      `&source=outdoor` +
      `&return_error_code=true` +
      `&key=${this.apiKey}`

    const res = await fetch(imgUrl)
    if (!res.ok) {
      this.fallbacks++
      console.warn(`[capture] SV image HTTP ${res.status} for pano ${meta.pano_id} — satellite fallback`)
      return this.fallback.captureAt(wp, _settleMs)
    }
    const bytes = new Uint8Array(await res.arrayBuffer())
    this.hits++
    return { jpeg: Buffer.from(bytes), capturedAt: Date.now() }
  }

  async dispose(): Promise<void> {
    console.log(
      `[capture] Street View summary: ${this.hits} hits / ${this.fallbacks} no-coverage / ${this.stale} too-old`,
    )
    await this.fallback.dispose()
  }
}
