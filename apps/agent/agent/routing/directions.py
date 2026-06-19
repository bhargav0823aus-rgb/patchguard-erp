from __future__ import annotations

import os

import httpx

# OSRM public demo server. Free for light use; ask the user to run their own for production.
# Endpoint shape: /route/v1/{profile}/{lng1},{lat1};{lng2},{lat2}?overview=full&geometries=geojson
OSRM_BASE = os.environ.get("OSRM_BASE", "https://router.project-osrm.org")


async def directions_polyline(
    start: tuple[float, float],
    end: tuple[float, float],
    mode: str = "driving",
) -> list[tuple[float, float]]:
    """Return the OSRM route polyline as a list of (lat, lng)."""
    profile = {"driving": "car", "walking": "foot", "cycling": "bike"}.get(mode, "car")
    url = (
        f"{OSRM_BASE}/route/v1/{profile}/"
        f"{start[1]},{start[0]};{end[1]},{end[0]}"
    )
    params = {"overview": "full", "geometries": "geojson"}
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(url, params=params)
        r.raise_for_status()
        data = r.json()
    if data.get("code") != "Ok" or not data.get("routes"):
        raise RuntimeError(f"OSRM failed: {data.get('code')} — {data.get('message')}")
    # GeoJSON LineString coordinates are [lng, lat] pairs; flip to (lat, lng) for our pipeline.
    coords = data["routes"][0]["geometry"]["coordinates"]
    return [(lat, lng) for lng, lat in coords]
