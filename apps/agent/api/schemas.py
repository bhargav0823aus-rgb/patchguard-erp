from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class StartEndJob(BaseModel):
    mode: Literal["start_end"] = "start_end"
    start_lat: float
    start_lng: float
    end_lat: float
    end_lng: float
    every_m: float = 20.0


class NamedRoadJob(BaseModel):
    mode: Literal["named_road"] = "named_road"
    prompt: str = Field(..., description='e.g. "check all roads on Ultimo Street, Sydney"')


class CreateJobRequest(BaseModel):
    """A user submission. Either supply an NL prompt, or a structured start_end job."""
    prompt: str | None = None
    start_end: StartEndJob | None = None


class CreateJobResponse(BaseModel):
    job_id: str
    status: Literal["queued", "rejected"]
    message: str | None = None


class WaypointDTO(BaseModel):
    lat: float
    lng: float
    heading: float


class JobStatusResponse(BaseModel):
    job_id: str
    label: str
    state: Literal["pending", "running", "done", "failed"]
    captured: int
    skipped: int
    total_waypoints: int
    next_index: int
