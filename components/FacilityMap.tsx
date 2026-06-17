"use client";

import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import type { LatLngExpression } from "leaflet";

/**
 * FacilityMap
 * - Client-side React component for Next.js App Router
 * - Fetches /api/facilities and renders interactive markers
 *
 * Important: Import `leaflet` CSS globally in your app layout (app/layout.tsx):
 * import 'leaflet/dist/leaflet.css';
 */

type FacilityFeature = {
  type: "Feature";
  geometry: any | null;
  properties: {
    ogim_id: string;
    fac_name?: string | null;
    category?: string | null;
    lon?: number | null;
    lat?: number | null;
  };
};

export default function FacilityMap() {
  const [features, setFeatures] = useState<FacilityFeature[]>([]);

  useEffect(() => {
    let mounted = true;

    async function loadFacilities() {
      try {
        const res = await fetch("/api/facilities");
        if (!res.ok)
          throw new Error(`Failed to fetch facilities: ${res.status}`);
        const data = await res.json();

        // Accept either FeatureCollection or simple array of rows
        let rows: FacilityFeature[] = [];
        if (
          data?.type === "FeatureCollection" &&
          Array.isArray(data.features)
        ) {
          rows = data.features as FacilityFeature[];
        } else if (Array.isArray(data)) {
          rows = data.map((r: any) => ({
            type: "Feature",
            geometry: r.geojson ?? null,
            properties: r,
          }));
        }

        if (mounted)
          setFeatures(
            rows.filter(
              (f) => f.properties.lon != null && f.properties.lat != null,
            ),
          );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Error loading facilities", err);
      }
    }

    loadFacilities();
    return () => {
      mounted = false;
    };
  }, []);

  // Uzbekistan center
  const center: LatLngExpression = [41.5, 64.5];

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <MapContainer
        center={center}
        zoom={5.5}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {features.map((f) => {
          const { lon, lat, fac_name, category } = f.properties;
          if (lon == null || lat == null) return null;
          const position: LatLngExpression = [lat, lon];
          return (
            <CircleMarker
              key={f.properties.ogim_id}
              center={position}
              radius={6}
              pathOptions={{
                color: "#e53e3e",
                fillColor: "#fb923c",
                fillOpacity: 0.9,
              }}
            >
              <Popup>
                <div>
                  <strong>{fac_name ?? "Unnamed Facility"}</strong>
                  <div style={{ fontSize: 12, color: "#555" }}>
                    {category ?? "Uncategorized"}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
