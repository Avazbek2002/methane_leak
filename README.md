# MethaneLeak

Lightweight dashboard and inference pipeline for detecting and visualizing methane point-source plumes.

This repository contains a Next.js frontend that visualizes methane plume vectors from a PostGIS database, a minimal API layer, a GPU inference worker scaffold built with Modal, and a local orchestrator that samples imagery from Earth Engine.

**Quick summary**
- Frontend: Next.js App Router + Mapbox GL for the main visualization; a small Leaflet component is provided for facility markers.
- Backend: Next.js API routes connecting to Postgres/PostGIS (`/api/methane-data`, `/api/facilities`).
- Inference: `modal_inference.py` is a Modal GPU worker that exposes a `predict_batch` method for batched inference.
- Orchestration: `live_cron_worker.py` contains local orchestration logic that samples Earth Engine, crops/stacks inputs and calls the remote Modal worker.
- CI: `.github/workflows/daily_inference.yml` runs the orchestrator on a schedule (optional).
  
 ┌────────────────────────────────────────┐
 │ GitHub Actions (Nightly Cron 02:00 UTC)│
 └───────────────────┬────────────────────┘
                     │ Wakes up headless runner
                     ▼
 ┌────────────────────────────────────────┐
 │       live_cron_worker.py              │
 └───────────────────┬────────────────────┘
                     │
                     ├─► [1. Ephemeral Read] ──► Query Max Date from Neon DB
                     │
                     ├─► [2. Free Harvest]  ──► Pull 11-Channel Matrices from GEE
                     │                           (Injects -9999.0 Sentinels for NaNs)
                     ▼
 ┌────────────────────────────────────────┐
 │ Mega-Batch Tensor: (972, 11, 32, 32)   │
 └───────────────────┬────────────────────┘
                     │ 
                     │ Fires ONE Single Network Handshake (Low Cost)
                     ▼
 ┌────────────────────────────────────────┐
 │   Modal Serverless T4 GPU App Cluster  │
 │  ────────────────────────────────────  │
 │  • Restores TorchScript JIT Graph      │
 │  • Maps Sentinels safely back to NaNs  │
 │  • Aligns Scales via .view(-1, 1, 1)   │
 │  • Executes Parallel Evaluation Pass   │
 └───────────────────┬────────────────────┘
                     │
                     │ Streams back Fractional Probabilities Vector
                     ▼
 ┌────────────────────────────────────────┐
 │       live_cron_worker.py              │
 │  ────────────────────────────────────  │
 │  • Evaluates Pure Model Threshold (0.6)│
 │  • Runs Convex Hull Plume Vectorizer   │
 └───────────────────┬────────────────────┘
                     │
                     │ Opens Short-Lived Writing Window
                     ▼
 ┌────────────────────────────────────────┐
 │      Neon PostGIS (methane_alerts)     │
 └───────────────────┬────────────────────┘
                     │
                     │ Idempotent Append (ON CONFLICT DO NOTHING)
                     ▼
 ┌────────────────────────────────────────┐
 │          Frontend Web Map Dashboard    │
 │  ────────────────────────────────────  │
 │  • Pulls Live GeoJSON Outlines         │
 │  • Visualizes Plumes Over Assets       │
 └────────────────────────────────────────┘

## Architecture Overview

High level flow:

1. Ingestion: Earth Engine (or other imagery source) provides satellite/timelapse images.
2. Orchestrator: `live_cron_worker.py` crops/stacks images for candidate facilities and calls the remote GPU worker for scoring.
3. Inference: `modal_inference.py` runs on GPU (Modal) and writes results back to PostGIS (or returns predictions to the orchestrator which inserts rows).
4. Storage: PostGIS holds a `methane_alerts` table (geometry + properties) and `facilities` table.
5. API: Next.js routes serve GeoJSON FeatureCollections to the frontend.
6. Frontend: `components/MethaneMap.js` loads `/api/methane-data`, rendering vector fills/lines and interactivity (filters, timeline, selection). `components/FacilityMap.tsx` renders facility markers.

```mermaid
flowchart LR
  A[Earth Engine / Imagery] --> B[Orchestrator \n(live_cron_worker.py)]
  B --> C[Modal GPU Worker \n(modal_inference.py)]
  C --> D[(PostGIS DB)]
  D --> E[Next.js API routes]
  E --> F[Frontend \n(Next.js + Mapbox)]
  F -->|User interacts| E
```

## Key files
- `app/page.js` — main layout and sidebar UI (timeline, probability filter, facility toggles).
- `components/MethaneMap.js` — Mapbox map, plume layers, facility layers, selection/highlight logic.
- `components/FacilityMap.tsx` — React-Leaflet marker view for facilities.
- `app/api/methane-data/route.js` — returns GeoJSON FeatureCollection of `methane_alerts`.
- `app/api/facilities/route.ts` — returns GeoJSON FeatureCollection of active `facilities`.
- `modal_inference.py` — Modal GPU worker scaffold (expects model in a persistent volume).
- `live_cron_worker.py` — local orchestrator that samples imagery, prepares batches, and writes alerts.
- `.github/workflows/daily_inference.yml` — optional scheduled CI job to run the orchestrator.

## Local development

Prerequisites:
- Node.js >= 20 (we recommend using `nvm`) — project requires Next.js on Node 20+.
- Python 3.10+ for the orchestrator and Earth Engine CLI (if used).
- A Postgres/PostGIS database (Neon, RDS, etc.) and connection string in `DATABASE_URL`.

Quick start (frontend only):

```bash
# use nvm to install/select Node 20
nvm install 20 && nvm use 20

# install deps and run dev server
npm install
npm run dev
```

Open http://localhost:3000/ — the sidebar contains the **Observation Year Filter** (no plumes shown by default until a year is selected), probability slider, and facility toggles.

Run the local orchestrator (requires Earth Engine credentials and DB access):

```bash
python live_cron_worker.py
```

Run the Modal worker is normally executed remotely; see `modal_inference.py` for the worker class and required model volume. For local development you can mock the worker or set `SKIP_REMOTE=true` in the orchestrator if present.

## Environment variables
- `NEXT_PUBLIC_MAPBOX_TOKEN` — public Mapbox token used by `components/MethaneMap.js`.
- `DATABASE_URL` — Postgres/PostGIS connection string.
- `EARTHENGINE_TOKEN` — service account token or ADC for Earth Engine ingestion (base64 or ADC method as documented in the code).
- Modal-related secrets or volumes when deploying the GPU worker.

## Known behaviors and troubleshooting
- Mapbox CSS must be imported globally (see `app/layout.js`) — moving it into a component may break global styling.
- If plumes do not appear on load, ensure you have selected an **Observation Year** in the sidebar (the map intentionally hides plumes until the user selects a year).
- If timelapse images are broken, the frontend includes a fallback SVG placeholder; update your DB or host animations under `public/animations/` or an S3/CDN and set `animation_url` accordingly.
- Facility click copies coordinates to the clipboard (lat, lon) and shows a small popup confirmation.

## Deployment notes
- Ensure secrets (`DATABASE_URL`, `NEXT_PUBLIC_MAPBOX_TOKEN`, Earth Engine credentials) are set in your deployment environment.
- Upload trained model artifacts to a Modal volume (or host them where `modal_inference.py` can load them), and update the worker configuration.
- The provided `.github/workflows/daily_inference.yml` demonstrates a nightly orchestrator run; adapt it to your cloud environment and credentials.

## Contributing
- Open an issue or submit a PR. Keep changes focused and add tests where feasible.

## License
MITThis is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
