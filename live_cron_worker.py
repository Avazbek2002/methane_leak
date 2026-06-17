"""
live_cron_worker.py

Pure-Model local orchestrator. Insulated against Neon idle database timeouts
by splitting lifecycle reads and writes into separate ephemeral connections.
"""
import os
import io
import json
import base64
import tempfile
import logging
import datetime as dt
from typing import List, Dict, Any, Optional, Tuple

import numpy as np
import psycopg2
import psycopg2.extras
import shapely.geometry
import shapely.ops
from shapely.geometry import mapping, MultiPoint
from PIL import Image
import time

# Runtime control parameters
MAX_DAYS = int(os.environ.get("MAX_DAYS", "0"))
FAC_LIMIT = int(os.environ.get("FAC_LIMIT", "0"))
DRY_RUN = os.environ.get("DRY_RUN", "0") in ("1", "true", "True")
SKIP_REMOTE = os.environ.get("SKIP_REMOTE", "0") in ("1", "true", "True")

import ee
import modal

logger = logging.getLogger("live_cron_worker")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


def init_earthengine_from_env():
    token_b64 = os.environ.get("EARTHENGINE_TOKEN")
    if token_b64:
        key_json = base64.b64decode(token_b64)
        fd, path = tempfile.mkstemp(suffix="-ee-key.json")
        os.close(fd)
        with open(path, "wb") as f:
            f.write(key_json)
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = path
        logger.info("Wrote Earth Engine service account key to temporary file")

    ee_project = os.environ.get("EARTHENGINE_PROJECT")
    if ee_project:
        logger.info(f"Initializing Earth Engine with explicit routing project: {ee_project}")
        ee.Initialize(project=ee_project)
    else:
        logger.info("Initializing Earth Engine with ambient user defaults...")
        ee.Initialize()


def get_db_connection() -> psycopg2.extensions.connection:
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL environment variable is required")
    return psycopg2.connect(db_url, sslmode="require")


def get_last_observation_date(conn) -> Optional[dt.date]:
    with conn.cursor() as cur:
        cur.execute("SELECT MAX(observation_date) FROM methane_alerts;")
        row = cur.fetchone()
        if row and row[0]:
            return row[0]
    return None


def build_date_queue(start_date: Optional[dt.date]) -> List[dt.date]:
    today = dt.date.today()
    end_date = today - dt.timedelta(days=1)

    if start_date is None:
        start = dt.date(2026, 1, 1) 
    else:
        start = start_date + dt.timedelta(days=1)

    if start > end_date:
        return []

    days = (end_date - start).days + 1
    return [start + dt.timedelta(days=i) for i in range(days)]


def fetch_facilities(conn) -> List[Dict[str, Any]]:
    q = (
        "SELECT ogim_id, fac_name, "
        "ST_X(ST_Centroid(geom)) AS lon, ST_Y(ST_Centroid(geom)) AS lat "
        "FROM facilities WHERE is_active = TRUE;"
    )
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(q)
        return cur.fetchall()


def sample_60x60_for_facility(lon: float, lat: float, date: dt.date) -> Optional[Tuple[np.ndarray, Tuple[float, float, float, float]]]:
    half_side_deg = 0.02  
    min_lon, min_lat = lon - half_side_deg, lat - half_side_deg
    max_lon, max_lat = lon + half_side_deg, lat + half_side_deg
    roi = ee.Geometry.Rectangle([min_lon, min_lat, max_lon, max_lat])

    start_str = date.isoformat()
    end_str = (date + dt.timedelta(days=1)).isoformat()
    
    s5p_coll = ee.ImageCollection('COPERNICUS/S5P/OFFL/L3_CH4') \
        .filterDate(start_str, end_str).filterBounds(roi) \
        .select(['CH4_column_volume_mixing_ratio_dry_air', 'aerosol_optical_depth'])
        
    fallback_s5p = ee.Image.constant([-9999.0, -9999.0]).rename([
        'CH4_column_volume_mixing_ratio_dry_air', 'aerosol_optical_depth'
    ])
    s5p = ee.Image(ee.Algorithms.If(s5p_coll.size().gt(0), s5p_coll.mean(), fallback_s5p))
        
    era5_coll = ee.ImageCollection("ECMWF/ERA5_LAND/HOURLY") \
        .filterDate(start_str, end_str).filterBounds(roi) \
        .select(['surface_pressure', 'u_component_of_wind_10m', 'v_component_of_wind_10m'])
        
    fallback_era5 = ee.Image.constant([-9999.0, -9999.0, -9999.0]).rename([
        'surface_pressure', 'u_component_of_wind_10m', 'v_component_of_wind_10m'
    ])
    era5 = ee.Image(ee.Algorithms.If(era5_coll.size().gt(0), era5_coll.mean(), fallback_era5))
        
    pressure_hpa = era5.select('surface_pressure').divide(100.0).rename('surface_pressure')
    proxy_img = ee.Image.constant([-9999.0] * 6).rename([
        'albedo_SWIR', 'qa_value', 'pixel_surface_area', 'chi2', 'landflag_science', 'cloud_fraction'
    ])
    
    composite = ee.Image.cat([
        s5p.select('CH4_column_volume_mixing_ratio_dry_air'),
        pressure_hpa,
        proxy_img.select('albedo_SWIR'),
        s5p.select('aerosol_optical_depth'),
        proxy_img.select('qa_value'),
        proxy_img.select('cloud_fraction'),
        proxy_img.select('pixel_surface_area'),
        proxy_img.select('chi2'),
        proxy_img.select('landflag_science'),
        era5.select('v_component_of_wind_10m'),
        era5.select('u_component_of_wind_10m')
    ]).unmask(-9999.0).reproject(crs='EPSG:4326', scale=1113.2)

    try:
        feature = composite.sampleRectangle(region=roi, defaultValue=-9999.0).getInfo()['properties']
        band_keys = composite.bandNames().getInfo()
        
        if not band_keys or len(feature.get(band_keys[0], [])) == 0:
            return None
            
        arr = np.empty((11, 60, 60))
        for i, band in enumerate(band_keys):
            band_2d = np.array(feature[band], dtype=float)
            band_2d[band_2d == -9999.0] = np.nan
            
            H, W = band_2d.shape
            if (H, W) != (60, 60):
                img = Image.fromarray(np.nan_to_num(band_2d, nan=0.0))
                band_2d = np.array(img.resize((60, 60), resample=Image.BILINEAR))
                
            arr[i] = band_2d
            
        return arr, (min_lon, min_lat, max_lon, max_lat)
    except Exception as e:
        logger.warning("Data extraction fault encountered at %s, %s: %s", lon, lat, str(e))
        return None


def center_crop_32_from_60(matrix_60: np.ndarray) -> np.ndarray:
    crop_margin = (60 - 32) // 2
    return matrix_60[:, crop_margin:crop_margin + 32, crop_margin:crop_margin + 32]


def plume_vectorizer(matrix_60: np.ndarray, bbox: Tuple[float, float, float, float]) -> Optional[Dict]:
    min_lon, min_lat, max_lon, max_lat = bbox
    H, W = matrix_60.shape
    ys, xs = np.where(matrix_60 > 0.0)
    if len(xs) == 0:
        return None

    lon_vals = min_lon + (xs + 0.5) * (max_lon - min_lon) / W
    lat_vals = max_lat - (ys + 0.5) * (max_lat - min_lat) / H
    points = [(float(lon_vals[i]), float(lat_vals[i])) for i in range(len(xs))]
    mp = MultiPoint(points)
    geom = mp.convex_hull

    return mapping(geom)


def insert_alert_row(conn, ogim_id: str, fac_name: str, observation_date: dt.date, probability: float, geometry_geojson: Dict, animation_url: Optional[str] = None):
    geom_text = json.dumps(geometry_geojson)
    sql = (
        "INSERT INTO methane_alerts (ogim_id, fac_name, observation_date, probability, animation_url, geom) "
        "VALUES (%s, %s, %s, %s, %s, ST_Multi(ST_GeomFromGeoJSON(%s))) "
        "ON CONFLICT (ogim_id, observation_date) DO NOTHING;"
    )
    with conn.cursor() as cur:
        cur.execute(sql, (ogim_id, fac_name, observation_date.isoformat(), probability, animation_url, geom_text))
        conn.commit()


def run_pipeline_once():
    init_earthengine_from_env()
    
    # --- PHASE 1: INITIAL METADATA READING READS ---
    logger.info("🔌 Opening ephemeral database connection for configuration discovery...")
    read_conn = get_db_connection()
    try:
        last_date = get_last_observation_date(read_conn)
        queue = build_date_queue(last_date)
        if not queue:
            logger.info("No dates to process (data already up-to-date)")
            return

        if MAX_DAYS > 0:
            logger.info("Limiting date queue to first %d days for testing", MAX_DAYS)
            queue = queue[:MAX_DAYS]

        facilities = fetch_facilities(read_conn)
        if FAC_LIMIT > 0:
            logger.info("Limiting facilities to first %d entries for testing", FAC_LIMIT)
            facilities = facilities[:FAC_LIMIT]
    finally:
        read_conn.close()
        logger.info("🔒 Closed initial database channel. Beginning compute phase.")

    logger.info("Processing %d dates for %d facilities", len(queue), len(facilities))

    # --- PHASE 2: DETACHED DATA HARVESTING & INFERENCE ---
    mega_crops = []
    mega_metadata = []

    for date in queue:
        logger.info("Harvesting matrices from GEE for date: %s", date)
        for fac in facilities:
            sample = sample_60x60_for_facility(float(fac["lon"]), float(fac["lat"]), date)
            if sample is None:
                continue
            matrix_60, bbox = sample
            crop32 = center_crop_32_from_60(matrix_60)

            mega_crops.append(crop32.astype(np.float32))
            mega_metadata.append({
                "ogim_id": fac["ogim_id"], 
                "fac_name": fac["fac_name"], 
                "matrix_60": matrix_60[0], 
                "bbox": bbox,
                "date": date
            })

    if len(mega_crops) == 0:
        logger.error("Zero valid satellite data footprints captured across the timeframe timeline.")
        return

    stacked = np.array(mega_crops, dtype=np.float32)
    logger.info("🚀 Assembled complete timeline Mega-Batch tensor shape: %s", stacked.shape)

    probs = []
    if SKIP_REMOTE:
        logger.info("Using local mock scoring for %d samples", stacked.shape[0])
        probs = [0.1] * stacked.shape[0]
    else:
        try:
            logger.info("Connecting to serverless GPU cluster for unified forward pass...")
            MethaneModelInference = modal.Cls.from_name("automergenet-inference", "Model")
            remote_handle = MethaneModelInference()
            
            probs = remote_handle.predict_batch.remote(stacked)
            probs = np.asarray(probs, dtype=float)
            
            logger.info("Unified inference return received successfully. Max prob: %.4f | Min prob: %.4f", max(probs), min(probs))
        except Exception as exc:
            logger.exception("Unified remote inference failed: %s", exc)
            return

    # --- PHASE 3: FRESH EPHEMERAL CONNECTION FOR ALERTS WRITE ---
    committed_count = 0
    any_anomalies = any(p >= 0.6 for p in probs)
    
    if any_anomalies:
        logger.info("🔌 Opening fresh write-only database connection channel...")
        write_conn = get_db_connection()
        try:
            for idx, p in enumerate(probs):
                if p >= 0.6:
                    meta = mega_metadata[idx]
                    date = meta["date"]
                    geom = plume_vectorizer(meta["matrix_60"], meta["bbox"])
                    if geom is None:
                        continue

                    animation_url = "https://yourstorage.com/placeholder_anim.gif"
                    try:
                        insert_alert_row(write_conn, meta["ogim_id"], meta["fac_name"], date, p, geom, animation_url)
                        logger.info("✨ Pure Model Alert Saved: %s on %s (p=%.3f)", meta["fac_name"], date, p)
                        committed_count += 1
                    except Exception:
                        logger.exception("Failed database record commit for facility: %s", meta["ogim_id"])
        finally:
            write_conn.close()
            logger.info("🔒 Closed write connection channel safely.")
    else:
        logger.info("No plume candidates crossed the 0.6 confidence threshold. Skipping database write block.")

    logger.info("Pipeline run complete. Total rows committed by pure model inference: %d", committed_count)


if __name__ == "__main__":
    run_pipeline_once()