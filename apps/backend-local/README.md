# patchguard-backend-local

Drop-in local backend that loads the YOLOv5 weights from the DL assignment and serves the same `/api/v1/images/*` contract the dashboard and worker expect. No cloud, no S3 — annotated images are served straight off disk.

```
main.py      # FastAPI: /healthz, /api/v1/images/batch, /api/v1/images/damage-report, /api/v1/images/{id}/annotated
model.py     # torch.hub-loaded YOLOv5 wrapper + PIL renderer (RDD2022 → dashboard label mapping)
storage.py   # in-memory ImageStore + ./data/raw + ./data/annotated on disk
```

## Run

```bash
cd ~/patchguard/apps/backend-local
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# .env defaults already point at your DL assignment paths via /mnt/c/... — edit only if you moved things.

uvicorn main:app --host 0.0.0.0 --port 8000
```

Verify:

```bash
curl http://localhost:8000/healthz
# → {"ok":true,"images":0,"damages":0,"model":"yolov5s-rdd2022-best"}
```

## Manual smoke test

```bash
# Send one JPEG with fake GPS:
curl -X POST http://localhost:8000/api/v1/images/batch \
  -F 'files=@some_road.jpg' \
  -F 'items_json=[{"filename":"some_road.jpg","latitude":-33.882,"longitude":151.197,"captured_at":"2026-06-03T10:00:00Z","heading":90,"altitude":null,"gps_accuracy":1.0}]'

# Then query the bbox:
curl 'http://localhost:8000/api/v1/images/damage-report?lon_min=151.19&lat_min=-33.89&lon_max=151.20&lat_max=-33.87'
```

## Caveats

- **CPU inference** is the default. ~200–400ms per image on a recent laptop. With a CUDA torch build, set `INFER_DEVICE=cuda:0`.
- **Memory only.** Restart drops everything. Fine for local demo, not for anything else.
- **No auth.** Don't expose this on the open internet.
- **Class mapping.** RDD2022 codes (`D00–D43`) are mapped to the dashboard's `DamageClass` enum inside `model.py`. If you change the dashboard enum, change the mapping in lockstep.
