Here is a refined, highly professional, and structurally organized version of your `README.md`. It eliminates the duplicate Next.js boilerplate, merges the visual diagrams cleanly, and highlights the production-grade optimization patterns (Mega-Batch parallelization, lag resilience, and connection-insulated persistence) that make the architecture unique.

---

# MethaneLeak

An autonomous, end-to-end Geospatial MLOps pipeline and interactive web dashboard designed for real-time detection, vectorization, and visualization of industrial methane point-source plumes across infrastructure facilities.

```mermaid
flowchart TD
    A[Facilities Registry] -->│1. Ephemeral Read│ B(Orchestrator: live_cron_worker.py)
    C[Google Earth Engine] -->│2. Free Harvest│ B
    B -->│3. Injects -9999.0 Sentinels│ D[Mega-Batch Tensor: Shape N, 11, 32, 32]
    D -->│4. Single Unified Handshake│ E[Modal Serverless T4 GPU App Cluster]
    E -->│5. Restores TorchScript Graph \n Align Scales via .view -1,1,1│ F[Calibrated Fractional Probabilities]
    F -->│6. Convex Hull Vectorizer│ B
    B -->│7. Ephemeral Write Window│ G[(Neon PostGIS Database)]
    G -->│8. Optimized Spatial API│ H[Next.js API Routes]
    H -->│9. Live GeoJSON Feeds│ I[Frontend Next.js + Mapbox Map Dashboard]

```

## 🚀 Key Architectural Optimizations

* **Cost-Minimized Mega-Batching:** Rather than initiating expensive sequential network handshakes for every data point, the orchestrator aggregates data across all facility targets and dates locally for free. It triggers the serverless cloud GPU **exactly once** per orchestration window, evaluating inputs simultaneously in parallel VRAM for fractions of a penny.
* **Data Publication Lag Resilience:** Protects execution tracks from telemetry walls and empty band states (such as delayed ERA5 hourly wind grids) by using JSON-compliant numeric sentinels (`-9999.0`), which map smoothly back to true float `NaN` variables immediately upon reaching GPU memory.
* **Connection-Insulated Persistence:** Eliminates serverless socket dropping or idle connection timeouts by decoupling compute cycles from database lifecycles. It utilizes separate, short-lived ephemeral connection pools to Neon PostGIS strictly for initial configuration loading and final rapid-fire alerts logging.

---

## 📂 Repository Architecture

```text
├── app/
│   ├── api/
│   │   ├── facilities/route.ts      # Serves infrastructure targets as a GeoJSON FeatureCollection
│   │   └── methane-data/route.js    # Serves verified plume alerts as a GeoJSON FeatureCollection
│   ├── layout.js                    # Global layout configuration and Mapbox CSS ingestion
│   └── page.js                      # Core analytical layout, map shell, and filter controls sidebar
├── components/
│   ├── MethaneMap.js                # Core Mapbox GL wrapper with optimized vector data layers
│   └── FacilityMap.tsx              # React-Leaflet marker component for asset indexing
├── data/                            # Static asset coordinate files and GeoPackage boundaries
├── .github/workflows/
│   └── methane_cron.yml             # GitHub Actions scheduled headless workflow
├── live_cron_worker.py              # Main orchestrator (GEE extraction, stacking, write manager)
└── modal_inference.py               # Serverless PyTorch JIT model worker on Modal GPU infrastructure

```

---

## 🛠️ Local Development Setup

### 1. Database Provisioning

Ensure your target database has the **PostGIS** extension activated. Initialize your tables using the structural patterns defined below:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE facilities (
    ogim_id VARCHAR(50) PRIMARY KEY,
    fac_name VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    geom GEOMETRY(Point, 4326)
);

CREATE TABLE methane_alerts (
    id SERIAL PRIMARY KEY,
    ogim_id VARCHAR(50),
    fac_name VARCHAR(255),
    observation_date DATE,
    probability FLOAT,
    animation_url TEXT,
    geom GEOMETRY(MultiPolygon, 4326),
    CONSTRAINT unique_facility_date UNIQUE (ogim_id, observation_date)
);

```

### 2. Analytical Engine Setup (Python)

Ensure Python 3.10+ is accessible locally. Install the required data engineering and machine learning dependencies:

```bash
pip install numpy psycopg2-binary shapely Pillow earthengine-api modal
pip install -e .

```

To test ingestion tracks locally without deploying serverless infrastructure, run the script with mock execution constraints:

```bash
SKIP_REMOTE=true python live_cron_worker.py

```

### 3. Visual Dashboard Setup (Next.js Frontend)

Install Node.js (version 20+ recommended via `nvm`) and kick off the client compilation runtime:

```bash
# Set runtime Node version
nvm install 20 && nvm use 20

# Ingest package configurations and start development server
npm install
npm run dev

```

---

## ⚙️ Environment Variables Config

Create a `.env` configuration template in the root directory to authorize remote server handshakes:

```env
# Database Credentials
DATABASE_URL="postgresql://user:password@endpoint-pooler.neon.tech/main?sslmode=require"

# GIS Map Tokens
NEXT_PUBLIC_MAPBOX_TOKEN="pk.eyJ1Ijo..."

# Earth Engine Authorization
EARTHENGINE_PROJECT="your-active-gcp-project-id"
EARTHENGINE_TOKEN="base64-encoded-service-account-json-string"

# Modal API Authentication
MODAL_TOKEN_ID="ak-..."
MODAL_TOKEN_SECRET="as-..."

```

---

## 💡 Operational Mechanics & Behaviors

* **Observation Filter Rule:** To maximize render speeds, the map interface hides plumes by default upon initial page load. You must select an explicit **Observation Year** in the dashboard control sidebar to paint vector plumes across the layer stack.
* **Plume Shape Tracing:** Confirmed model alerts trigger a local spatial Convex Hull vectorizer. This wraps a geometric polygon boundary tightly around the anomalous mixing ratio pixels, storing coordinates cleanly inside the PostGIS layer.
* **Clipboard Integration:** Clicking any asset target on the interactive map copies the precise coordinates `(Latitude, Longitude)` directly into your system clipboard while presenting a toast confirmation window.
* **Global Style Integrity:** To guarantee vector features draw correctly, Mapbox styles are loaded globally inside `app/layout.js`. Modifying or isolating component CSS scopes may disrupt map layer scaling.

---

## 🚢 Deployment Protocols

1. **Deploy Cloud Compute Services:** Force-upload your model's normalization arrays to your persistent remote volume, then deploy your JIT execution graph to Modal:
```bash
modal volume put -f model-artifacts ./data/methane_ready/train_mean.pt /train_mean.pt
modal volume put -f model-artifacts ./data/methane_ready/train_std.pt /train_std.pt
modal deploy modal_inference.py

```


2. **Automate Nightly Sweeps:** Securely input your environment keys into your repository secrets panel on GitHub. The config file located in `.github/workflows/methane_cron.yml` will automatically wake up at `02:00 UTC` every night to parse, score, and append new spatial records seamlessly.

---

## 📄 License

This platform is open-source software licensed under the [MIT License](https://www.google.com/search?q=LICENSE).
