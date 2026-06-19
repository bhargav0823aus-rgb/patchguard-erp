// Talks to the patchguard-agent control plane.

export type CreateJobPayload = {
  start_end: {
    start_lat: number
    start_lng: number
    end_lat: number
    end_lng: number
    every_m?: number
  }
}

export type CreateJobResponse = {
  job_id: string
  status: 'queued' | 'rejected'
  message?: string | null
}

export type JobEvent =
  | { t: 'snapshot'; label: string; state: string; next_index: number; captured: number; skipped: number; total_waypoints: number }
  | { t: 'route'; polyline: [number, number][]; label: string }
  | { t: 'progress'; index: number; waypoint: { lat: number; lng: number; heading: number }; preview_b64?: string }
  | { t: 'batch_uploaded'; from_index: number; to_index: number; count: number }
  | { t: 'batch_failed'; from_index: number; to_index: number; status: number; reason: string }
  | { t: 'step_image'; index: number; image_id: string; image_url: string; damages: number; vision_description: string | null; latitude: number; longitude: number }
  | { t: 'waypoint_failed'; index: number; reason: string }
  | { t: 'done'; captured: number; skipped: number }
  | { t: 'tool'; name: string; data: Record<string, unknown> }

function agentBase(): string {
  const base = import.meta.env.VITE_AGENT_BASE
  if (!base) throw new Error('VITE_AGENT_BASE is not set')
  return base.replace(/\/$/, '')
}

export async function createJob(payload: CreateJobPayload): Promise<CreateJobResponse> {
  const res = await fetch(`${agentBase()}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw new Error(`Job create failed: HTTP ${res.status}`)
  }
  return (await res.json()) as CreateJobResponse
}

export function openJobEvents(jobId: string, onEvent: (e: JobEvent) => void): () => void {
  const wsUrl = agentBase().replace(/^http/, 'ws') + `/jobs/${jobId}/events`
  const ws = new WebSocket(wsUrl)
  ws.onmessage = (m) => {
    try {
      onEvent(JSON.parse(m.data) as JobEvent)
    } catch (err) {
      console.error('bad job event', err)
    }
  }
  ws.onerror = (err) => console.error('job ws error', err)
  return () => {
    try { ws.close() } catch { /* noop */ }
  }
}
