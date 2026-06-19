"""Single conversion point between [[lat, lng], ...] (the app's convention) and
PostGIS WKT (which is lng-first / x-y order). Keep ALL order-flipping here.
"""
from __future__ import annotations


def point_wkt(lat: float, lng: float) -> str:
    return f"SRID=4326;POINT({lng} {lat})"


def linestring_wkt(points: list[list[float]] | list[tuple[float, float]]) -> str:
    """points are [lat, lng] pairs — flipped to lng lat for WKT."""
    if len(points) < 2:
        raise ValueError("LINESTRING needs at least 2 points")
    coords = ", ".join(f"{p[1]} {p[0]}" for p in points)
    return f"SRID=4326;LINESTRING({coords})"


def parse_linestring_wkt(wkt: str) -> list[list[float]]:
    """'LINESTRING(lng lat, lng lat, ...)' → [[lat, lng], ...]."""
    inner = wkt[wkt.index("(") + 1 : wkt.rindex(")")]
    out: list[list[float]] = []
    for pair in inner.split(","):
        lng_s, lat_s = pair.strip().split()
        out.append([float(lat_s), float(lng_s)])
    return out
