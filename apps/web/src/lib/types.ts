// Live capture state — local to the capture page.

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
  blob: Blob
  fix: GeoFix | null
}

// Exactly the shape the backend expects in `items_json`.
export type UploadItem = {
  filename: string
  latitude: number | null
  longitude: number | null
  captured_at: string // ISO-8601 with Z
  heading: number | null
  altitude: number | null
  gps_accuracy: number | null
}

// Damage-report response shape.

export type DamageClass =
  | 'longitudinal crack'
  | 'transverse crack'
  | 'alligator crack'
  | 'other corruption'
  | 'Pothole'

export type Damage = {
  id: string
  image_id: string
  damage_class: DamageClass
  confidence: number
  bbox_x1: number
  bbox_y1: number
  bbox_x2: number
  bbox_y2: number
  model_version: string
}

export type DamageReportItem = {
  image_id: string
  annotated_image_url: string
  latitude: number
  longitude: number
  captured_at: string
  damages: Damage[]
  vision_description?: string | null
}

export type BBox = {
  lonMin: number
  latMin: number
  lonMax: number
  latMax: number
}
