from __future__ import annotations

from dataclasses import dataclass

from geographiclib.geodesic import Geodesic

_GEOD = Geodesic.WGS84


@dataclass
class Waypoint:
    lat: float
    lng: float
    heading: float  # bearing in degrees, 0 = north

    def asdict(self) -> dict[str, float]:
        return {"lat": self.lat, "lng": self.lng, "heading": self.heading}


def _segment_meters(a: tuple[float, float], b: tuple[float, float]) -> float:
    return _GEOD.Inverse(a[0], a[1], b[0], b[1])["s12"]


def _bearing(a: tuple[float, float], b: tuple[float, float]) -> float:
    return _GEOD.Inverse(a[0], a[1], b[0], b[1])["azi1"] % 360


def _interpolate(a: tuple[float, float], b: tuple[float, float], dist_m: float) -> tuple[float, float]:
    line = _GEOD.InverseLine(a[0], a[1], b[0], b[1])
    p = line.Position(dist_m)
    return (p["lat2"], p["lon2"])


def sample_polyline(
    polyline: list[tuple[float, float]],
    every_m: float = 20.0,
) -> list[Waypoint]:
    """Resample a (lat, lng) polyline at regular geodesic intervals, attaching forward bearing."""
    if len(polyline) < 2:
        return []
    waypoints: list[Waypoint] = []
    leftover = 0.0
    for a, b in zip(polyline, polyline[1:]):
        seg_len = _segment_meters(a, b)
        if seg_len == 0:
            continue
        bearing = _bearing(a, b)
        # First emission position on this segment
        d = every_m - leftover
        while d <= seg_len:
            lat, lng = _interpolate(a, b, d)
            waypoints.append(Waypoint(lat=lat, lng=lng, heading=bearing))
            d += every_m
        leftover = seg_len - (d - every_m)
    # Always include the final endpoint
    last = polyline[-1]
    if not waypoints or (waypoints[-1].lat, waypoints[-1].lng) != last:
        bearing = waypoints[-1].heading if waypoints else 0.0
        waypoints.append(Waypoint(lat=last[0], lng=last[1], heading=bearing))
    return waypoints
