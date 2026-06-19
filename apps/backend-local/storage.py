"""In-memory store for damage reports + on-disk store for raw + annotated JPEGs."""
from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path


@dataclass
class StoredDamage:
    id: str
    image_id: str
    damage_class: str
    confidence: float
    bbox_x1: int
    bbox_y1: int
    bbox_x2: int
    bbox_y2: int
    model_version: str


@dataclass
class StoredImage:
    image_id: str
    filename: str
    latitude: float
    longitude: float
    captured_at: str        # ISO-8601
    heading: float | None
    altitude: float | None
    gps_accuracy: float | None
    damages: list[StoredDamage] = field(default_factory=list)
    vision_description: str | None = None


class Store:
    def __init__(self, data_dir: Path) -> None:
        self.data_dir = data_dir
        self.raw_dir = data_dir / "raw"
        self.annotated_dir = data_dir / "annotated"
        self.raw_dir.mkdir(parents=True, exist_ok=True)
        self.annotated_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._by_id: dict[str, StoredImage] = {}

    def new_image_id(self) -> str:
        return uuid.uuid4().hex

    def save_raw(self, image_id: str, jpeg: bytes) -> Path:
        path = self.raw_dir / f"{image_id}.jpg"
        path.write_bytes(jpeg)
        return path

    def save_annotated(self, image_id: str, jpeg: bytes) -> Path:
        path = self.annotated_dir / f"{image_id}.jpg"
        path.write_bytes(jpeg)
        return path

    def annotated_path(self, image_id: str) -> Path | None:
        path = self.annotated_dir / f"{image_id}.jpg"
        return path if path.exists() else None

    def put(self, img: StoredImage) -> None:
        with self._lock:
            self._by_id[img.image_id] = img

    def in_bbox(
        self,
        lon_min: float,
        lat_min: float,
        lon_max: float,
        lat_max: float,
    ) -> list[StoredImage]:
        with self._lock:
            return [
                img
                for img in self._by_id.values()
                if lon_min <= img.longitude <= lon_max and lat_min <= img.latitude <= lat_max
            ]

    def stats(self) -> dict:
        with self._lock:
            return {
                "images": len(self._by_id),
                "damages": sum(len(i.damages) for i in self._by_id.values()),
            }


def parse_iso(s: str) -> str:
    # Keep what the client sent; validate it's parseable.
    datetime.fromisoformat(s.replace("Z", "+00:00"))
    return s
