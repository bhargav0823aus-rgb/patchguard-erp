export type Waypoint = {
  lat: number
  lng: number
  heading: number
}

export type JobSpec = {
  job_id: string
  label: string
  waypoints: Waypoint[]
  batch_size: number
  settle_ms: number
  upload_base: string
}

// Mirrors apps/web/src/lib/types.ts so the backend cannot tell a phone capture from a worker capture.
export type GeoFix = {
  lat: number
  lng: number
  accuracy: number
  altitude: number | null
  heading: number | null
  speed: number | null
  fixedAt: number
}

export type Frame = {
  index: number
  capturedAt: number
  jpeg: Buffer
  fix: GeoFix
}

export type UploadItem = {
  filename: string
  latitude: number | null
  longitude: number | null
  captured_at: string
  heading: number | null
  altitude: number | null
  gps_accuracy: number | null
}
