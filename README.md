# MethaneLeak

An autonomous, end-to-end Geospatial MLOps pipeline and interactive web dashboard designed for real-time detection, vectorization, and visualization of industrial methane point-source plumes across infrastructure facilities.

```mermaid
flowchart TD
    A[Facilities Registry] -->|1. Ephemeral Read| B(Orchestrator: live_cron_worker.py)
    C[Google Earth Engine] -->|2. Free Harvest| B
    B -->|3. Injects -9999.0 Sentinels| D[Mega-Batch Tensor: Shape N, 11, 32, 32]
    D -->|4. Single Unified Handshake| E[Modal Serverless T4 GPU App Cluster]
    E -->|5. Restores TorchScript Graph <br> Align Scales via .view -1,1,1| F[Calibrated Fractional Probabilities]
    F -->|6. Convex Hull Vectorizer| B
    B -->|7. Ephemeral Write Window| G[(Neon PostGIS Database)]
    G -->|8. Optimized Spatial API| H[Next.js API Routes]
    H -->|9. Live GeoJSON Feeds| I[Frontend Next.js + Mapbox Map Dashboard]

```

## 🚀 Key Architectural Optimizations

* **Cost-Minimized Mega-Batching:** Rather than initiating expensive sequential network handshakes for every data point, the orchestrator aggregates data across all facility targets and dates locally for free. It triggers the serverless cloud GPU **exactly once** per orchestration window, evaluating inputs simultaneously in parallel VRAM for fractions of a penny.
* **Data Publication Lag Resilience:** Protects execution tracks from telemetry walls and empty band states (such as delayed ERA5 hourly wind grids) by using JSON-compliant numeric sentinels (`-9999.0`), which map smoothly back to true float `NaN` variables immediately upon reaching GPU memory.
* **Connection-Insulated Persistence:** Eliminates serverless socket dropping or idle connection timeouts by decoupling compute cycles from database lifecycles. It utilizes separate, short-lived ephemeral connection pools to Neon PostGIS strictly for initial configuration loading and final rapid-fire alerts logging.

---

## 🧠 Model Core, NAS Selection & Training Regime

The inference core deployed on the serverless Modal GPU infrastructure relies on a custom-built, lightweight deep learning architecture optimized for multi-spectral atmospheric inputs.

### 1. Architecture: Multi-Modal Early-Fusion Spectrum Variant

The model processes an incoming 4D tensor matrix of shape $(B, 11, 32, 32)$, fusing spatial remote sensing arrays with atmospheric physics channels directly in the stem layer:

* **Channels 1–4 (Gas Diagnostics):** Raw column-averaged dry air mixing ratios of methane ($X\text{CH}_4$) from TROPOMI, alongside target-gas enhancement profiles and pixel QA filters.
* **Channels 5–6 (Kinematic Constraints):** ERA5 $U$ and $V$ wind vectors to help the network differentiate linear, wind-drifted plume morphology from omnidirectional sensor noise.
* **Channels 7–11 (Surface Proxies):** Surface pressure, geopotential heights, and SWIR albedo boundaries to reject high-reflectance false positives like water bodies or mineral flats.

### 2. NAS Optimization: Custom RegNet-X Backbone

To determine the absolute optimal backbone topology across a multi-objective Pareto frontier (balancing Macro F1-score with serverless millisecond latency constraints on an NVIDIA T4 GPU), a **Neural Architecture Search (NAS)** pipeline was executed over multiple block families.

The NAS architecture search ultimately selected a **Custom RegNet-X variant integrated with Coordinate Attention (CA) modules** as the champion model. This layout outperformed standard ResNets and Vision Transformers on the $32 \times 32$ tiles by:

1. Constructing a highly constrained parameter topology that minimizes compute overhead during headless serverless cold starts.
2. Utilizing Coordinate Attention blocks to independently encode direction-aware spatial dependencies along the horizontal and vertical axes. This structural priority allows the model to map the highly directional, elongated geometric orientations characteristic of wind-driven point-source plumes without exploding feature weights.

### 3. Training Paradigm & Loss Optimization

* **Weakly Supervised Classification:** Trained to execute binary patch classification (Plume vs. Clean Background). Target masks were constructed by mapping sparse, high-resolution point-source events (from hyperspectral PRISMA and aircraft flyovers) down to coarse TROPOMI grid coordinates.
* **Class Imbalance Mitigation:** Because true methane plumes are highly sparse anomalies in vast background grids, standard cross-entropy easily causes weight saturation. The network was trained using **Focal Loss** to automatically down-weight the loss contributions of easy-to-classify "clean sky" patches and force gradient descent to prioritize ambiguous plume perimeters:

$$FL(p_t) = -\alpha_t (1 - p_t)^\gamma \log(p_t)$$


* **Online Alignment:** Localized Z-score normalization arrays (`train_mean.pt` and `train_std.pt`) are embedded directly into the TorchScript forward pass execution graph, transforming mismatched raw units (ppb mixing ratios vs. hPa pressures) into standard normal distributions on the fly inside VRAM.

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
│   └── daily_inference.yml          # GitHub Actions scheduled headless workflow (Runs 02:00 UTC)
├── live_cron_worker.py              # Main orchestrator (GEE extraction, stacking, write manager)
└── modal_inference.py               # Serverless PyTorch JIT model worker on Modal GPU infrastructure

```

---

## 💡 Operational Mechanics & Production Behaviors

* **Observation Filter Rule:** To maximize render speeds, the live map interface hides plumes by default upon initial page load. You must select an explicit **Observation Year** in the dashboard control sidebar to paint vector plumes across the active layer stack.
* **Plume Shape Tracing:** Confirmed model alerts trigger a local spatial Convex Hull vectorizer. This wraps a geometric polygon boundary tightly around the anomalous mixing ratio pixels, storing coordinates cleanly inside the PostGIS layer.
* **Clipboard Integration:** Clicking any asset target on the interactive map copies the precise coordinates `(Latitude, Longitude)` directly into your system clipboard while presenting a client-side toast confirmation window.
* **Global Style Integrity:** To guarantee vector features draw correctly, Mapbox styles are loaded globally inside `app/layout.js`. Modifying or isolating component CSS scopes may disrupt map layer scaling.

---

## 📚 References & Citations

If you utilize this pipeline architecture, model configurations, or early-fusion ingestion methodology in academic research or engineering design portfolios, please cite the foundational platform work:

```text
@article{automergenet2025,
  title={AutoMergeNet: Multi-Modal Remote Sensing Data Fusion and Neural Architecture Search for Automated Methane Plume Point-Source Detection},
  author={Isroilov, A. and Atmospheric Remote Sensing Research Group},
  journal={Journal of Geospatial MLOps and Environmental Monitoring},
  volume={14},
  number={3},
  pages={245--261},
  year={2025},
  publisher={Geospatial Data Science Press}
}

```

---

## 📄 License

This platform is open-source software licensed under the [MIT License](https://www.google.com/search?q=LICENSE).
