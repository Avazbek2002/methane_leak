import { Client } from 'pg';
import { NextResponse } from 'next/server';

export async function GET() {
  // Initialize standard client using environment variable
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // Required for serverless Neon database connections
    }
  });

  try {
    await client.connect();

    // Query to retrieve all details and convert geometry to GeoJSON JSON format
    const query = `
      SELECT 
        id,
        ogim_id,
        fac_name,
        observation_date,
        probability,
        animation_url,
        ST_AsGeoJSON(geom)::json AS geojson
      FROM methane_alerts
      ORDER BY observation_date DESC;
    `;

    const res = await client.query(query);

    // Map database rows into a standardized GeoJSON FeatureCollection structure
    const features = res.rows.map(row => ({
      type: 'Feature',
      geometry: row.geojson,
      properties: {
        id: row.id,
        ogim_id: row.ogim_id,
        fac_name: row.fac_name,
        observation_date: row.observation_date ? new Date(row.observation_date).toISOString().split('T')[0] : null,
        probability: row.probability,
        animation_url: row.animation_url
      }
    }));

    const geoJsonData = {
      type: 'FeatureCollection',
      features: features
    };

    return NextResponse.json(geoJsonData, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('Error querying PostGIS database:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  } finally {
    // Terminate connection to avoid client resource leaks
    await client.end();
  }
}
