# patchguard-agent

ADK planner agent + FastAPI control plane + Node/Puppeteer capture worker.

```
agent/         # ADK Python package (PatchGuardAgent + routing tools)
api/           # FastAPI: POST /jobs, WS /jobs/:id/events
worker/        # Node + Puppeteer capture worker (drives earth.google.com)
```

## Run (local dev)

Two processes. Open two terminals.

**Terminal 1 — agent API:**

```bash
cd apps/agent
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
cp .env.example .env  # only GEMINI_API_KEY is required
uvicorn api.main:app --reload --host 0.0.0.0 --port 8765
```

Routing uses free OSM services by default:

| Tool | Service | Key? |
| --- | --- | --- |
| `geocode` | Nominatim (`nominatim.openstreetmap.org`) | no |
| `plan_route` | OSRM demo (`router.project-osrm.org`) | no |
| `resolve_named_road` | Overpass (`overpass-api.de`) | no |

Override via env vars (`NOMINATIM_URL`, `OSRM_BASE`) if you self-host or get rate-limited.

**Terminal 2 — capture worker:**

```bash
cd apps/agent/worker
npm install
npm run dev  # polls http://localhost:8765 for jobs
```

Smoke test:

```bash
curl -X POST http://localhost:8765/jobs \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "Survey Ultimo Street, Sydney NSW"}'
# → {"job_id": "..."}

# stream events:
websocat ws://localhost:8765/jobs/<job_id>/events
```

## Tool trace (Mode A — start + end coords)

```
plan_route(start, end) → sample_waypoints(polyline, 20m) → run_capture(job_spec)
```

## Tool trace (Mode B — named road)

```
geocode("Ultimo Street area") → resolve_named_road(name, anchor) → sample_waypoints → run_capture
```
