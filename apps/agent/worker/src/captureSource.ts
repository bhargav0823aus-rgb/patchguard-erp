import type { Waypoint } from './types.js'

export interface CaptureSource {
  init(): Promise<void>
  captureAt(wp: Waypoint, settleMs: number): Promise<{ jpeg: Buffer; capturedAt: number }>
  dispose(): Promise<void>
}
