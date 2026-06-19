import type { Waypoint } from '../types.js'

// Google Earth web's camera state is encoded in the URL fragment:
//   @<lat>,<lng>,<altitudeMeters>a,<distanceMeters>d,<fovDegrees>y,<headingDegrees>h,<tiltDegrees>t,<rollDegrees>r
//
// We park the camera ~30m above the road, tilted ~70° to approximate a windshield view, oriented
// along the direction of travel. These numbers are starting points — tune per-deploy.

export type EarthCameraParams = {
  altitudeM?: number
  distanceM?: number
  fovDeg?: number
  tiltDeg?: number
}

export function earthUrlFor(wp: Waypoint, params: EarthCameraParams = {}): string {
  const altitudeM = params.altitudeM ?? 30
  const distanceM = params.distanceM ?? 40
  const fovDeg = params.fovDeg ?? 75
  const tiltDeg = params.tiltDeg ?? 70
  const heading = ((wp.heading % 360) + 360) % 360
  return (
    `https://earth.google.com/web/@${wp.lat},${wp.lng},` +
    `${altitudeM}a,${distanceM}d,${fovDeg}y,${heading}h,${tiltDeg}t,0r`
  )
}
