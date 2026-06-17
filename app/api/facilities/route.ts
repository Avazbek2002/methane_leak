import { NextResponse } from 'next/server';
import { Pool } from 'pg';

/**
 * Server-side API route: /api/facilities
 * - Connects to Postgres/PostGIS via `pg` using `process.env.DATABASE_URL`
 * - Returns a GeoJSON FeatureCollection of active facilities
 * - Uses ST_AsGeoJSON and ST_X/ST_Y on the centroid so the client
 *   receives usable lon/lat and GeoJSON geometry.
 */

declare global {
  // Allow runtime reuse of the Pool across hot reloads / lambda warm
  // starts to avoid exhausting DB connections during development.
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  // Exporting a GET handler without a DB URL would be erroneous.
  console.error('DATABASE_URL is not set in environment');
}

const pool: Pool = global.__pgPool ?? new Pool({
  connectionString,
  // Many managed Postgres servers (Neon, Heroku) require SSL.
  // Accept self-signed certs when needed by setting rejectUnauthorized.
  ssl: connectionString ? { rejectUnauthorized: false } : undefined,
});
if (!global.__pgPool) global.__pgPool = pool;

export async function GET() {
  try {
    // Select active facilities and return both GeoJSON and centroid lat/lon
    const sql = `
      SELECT
        ogim_id,
        fac_name,
        category,
        ST_AsGeoJSON(geom) AS geojson,
        ST_X(ST_Centroid(geom)) AS lon,
        ST_Y(ST_Centroid(geom)) AS lat
      FROM facilities
      WHERE is_active = TRUE;
    `;

    const result = await pool.query(sql);

    const features = result.rows.map((r: any) => ({
      type: 'Feature',
      geometry: r.geojson ? JSON.parse(r.geojson) : null,
      properties: {
        ogim_id: r.ogim_id,
        fac_name: r.fac_name,
        category: r.category,
        lon: Number(r.lon),
        lat: Number(r.lat),
      },
    }));

    const geojson = {
      type: 'FeatureCollection',
      features,
    };

    return NextResponse.json(geojson, { status: 200 });
  } catch (err: any) {
    console.error('Error fetching facilities:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
