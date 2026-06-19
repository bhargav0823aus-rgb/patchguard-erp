# Road Capture PWA

Two-screen web client for a road-damage detection pipeline:

- **Capture (`/`)** — phone-facing. Driver mounts the phone, taps **Start**, and the app captures rear-camera frames at 3 fps with GPS and POSTs them to the backend every ~5 s.
- **Dashboard (`/dashboard`)** — desktop-facing. Map view of damaged-road reports. Pan/zoom to query the visible bounding box, click pins to inspect the annotated image and detected damages.

Both screens talk to the same backend (`VITE_API_BASE`). AI inference, storage, and the model itself live behind that API.

## Stack

- Vite + React + TypeScript
- `react-router-dom` (HashRouter — works on static hosts and inside the installed PWA)
- `react-leaflet` + OpenStreetMap tiles for the dashboard
- `vite-plugin-pwa` — installable shell for the capture screen
- Web APIs: `getUserMedia`, `Geolocation.watchPosition`, `screen.wakeLock`

## Quick start

```bash
npm install
cp .env.example .env   # set VITE_API_BASE (e.g. http://localhost:8000)
npm run dev -- --host
```

Open `http://localhost:5173/` — you'll land on the Capture screen. Click **Dashboard** in the top nav to switch.

```bash
npm run build      # production bundle in dist/
npm run preview    # serve the build locally
```

## Configuration

| Env var          | Required | Purpose                                                        |
| ---------------- | -------- | -------------------------------------------------------------- |
| `VITE_API_BASE`  | yes      | Backend origin. Both endpoints below are appended to this URL. |

## Backend API contract

### `POST {VITE_API_BASE}/api/v1/images/batch`

`multipart/form-data`:

- `files` — JPEG blobs, one form-part per image, all repeated under the field name `files`.
- `items_json` — JSON string, one entry per image, in the same order as `files`:

  ```json
  [
    {
      "filename": "img_000123_1715769600000.jpg",
      "latitude": 35.6895,
      "longitude": 139.6917,
      "captured_at": "2026-05-14T10:00:00.000Z",
      "heading": 90.0,
      "altitude": 10.0,
      "gps_accuracy": 3.0
    }
  ]
  ```

  All GPS fields except `filename` and `captured_at` may be `null` when no fix is available. Filenames are deterministic: `img_{6-digit-index}_{capturedAtMs}.jpg`.

The buffer is cleared only on a 2xx response; non-2xx is surfaced in the status panel and those 15 frames are dropped.

### `GET {VITE_API_BASE}/api/v1/images/damage-report?lon_min=&lat_min=&lon_max=&lat_max=`

Returns `DamageReportItem[]` for the current map viewport. Map pan/zoom is debounced 300 ms before refetching. Schema is exactly as in your backend spec:

```ts
type DamageReportItem = {
  image_id: string
  annotated_image_url: string   // presigned, ~1 h
  latitude: number
  longitude: number
  captured_at: string
  damages: Damage[]
}
```

Capture-page constants — adjust in `src/pages/CapturePage.tsx`:

```ts
const BATCH_SIZE = 15  // frames per batch
const FPS = 3          // capture rate
```

## HTTPS on LAN (for phone testing)

`getUserMedia` and Wake Lock only work in a secure context. Two options:

**Option A — `mkcert`.** Install, run `mkcert -install`, then `mkcert 192.168.x.x localhost`, then plug the cert into `vite.config.ts`'s `server.https`.

**Option B — tunnel.** `cloudflared tunnel --url http://localhost:5173` or `ngrok http 5173`.

Inspect uploads with `https://webhook.site/` while you're without a real backend.

## Usage

### Capture screen (phone)

1. Open over HTTPS on a phone.
2. *(Optional)* "Add to Home Screen" — launches fullscreen portrait.
3. Grant **Camera** and **Location** permissions.
4. Mount phone on the dashboard, rear camera facing forward.
5. Tap **Start**. Status panel shows frame count, batch progress, batches sent, last upload, GPS, wake-lock state.
6. Tap **Stop** to release camera, GPS, and wake lock.

### Dashboard screen (desktop)

1. Open in any modern browser, click **Dashboard** in the nav.
2. Pan/zoom to the area you care about — pins reflect every damaged image within the visible bounding box.
3. Click a pin → popup with timestamp and a *View details* button → modal showing the annotated image and the list of detected damages with class, confidence, bbox, and model version.

## Known limitations

- **Backgrounding.** Mobile browsers throttle `setInterval` and `MediaStream` when the tab loses focus. Keep the app foregrounded; the wake lock keeps the screen on.
- **Single in-flight upload.** If a round-trip exceeds the ~5 s batch window, the next ready batch overwrites any queued one, bounding memory at the cost of dropping frames. Matches the design doc's "clear local memory" priority.
- **GPS denial is non-fatal.** Frames still upload with `latitude`/`longitude` set to `null`; the backend should expect this.
- **HashRouter.** Used so the dashboard route survives static hosting and the installed PWA shell. URLs look like `/#/dashboard`.

## Project layout

```
src/
  App.tsx                    Router shell + tab nav
  pages/
    CapturePage.tsx          Camera + GPS + upload loop
    DashboardPage.tsx        Leaflet map + damage-report fetch + detail modal
  components/
    CapturePanel.tsx         <video> preview + Start/Stop button
    StatusBar.tsx            Frames, batches, GPS, last upload, errors
  hooks/
    useCamera.ts             getUserMedia + MediaStream lifecycle
    useGeolocation.ts        watchPosition + latest-fix cache
    useWakeLock.ts           screen wake lock (re-acquires on visibility)
  lib/
    captureLoop.ts           3 fps tick, draws video → canvas → JPEG, batches frames
    api.ts                   uploadBatch + fetchDamageReport
    types.ts                 Frame, GeoFix, UploadItem, DamageReportItem, BBox
scripts/
  gen-icons.mjs              Regenerates the placeholder PWA icons
```

## Regenerating PWA icons

```bash
node scripts/gen-icons.mjs
```

Replace `public/icon-192.png` and `public/icon-512.png` with real artwork when ready.
