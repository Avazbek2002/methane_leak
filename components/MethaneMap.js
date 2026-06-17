'use client';

import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';

// Set public access token from environment variables
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

const getRange = (year) => {
  // If no year selected, return nulls so caller can disable plume rendering
  if (!year) return { start: null, end: null };
  if (year === 'All') {
    return { start: '2020-01-01', end: '2026-06-30' };
  }
  if (year === '2026') {
    return { start: '2026-01-01', end: '2026-06-30' };
  }
  return { start: `${year}-01-01`, end: `${year}-12-31` };
};

export default function MethaneMap({ selectedPlume, onSelectPlume, yearFilter, probabilityFilter = 0.5, showFacilities = true, showFacilityHighlights = true }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const pulseFrameRef = useRef(null);

  const { start, end } = getRange(yearFilter);
  const msPerDay = 1000 * 60 * 60 * 24;
  const dateStart = start ? new Date(start) : null;
  const dateEnd = end ? new Date(end) : null;
  const totalDays = dateStart && dateEnd ? Math.ceil((dateEnd - dateStart) / msPerDay) : 0;

  const [currentDay, setCurrentDay] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Compute active date string for filters
  const currentDate = dateStart ? new Date(dateStart.getTime() + currentDay * msPerDay) : null;
  const dateString = currentDate ? currentDate.toISOString().split('T')[0] : null;

  // Sliding date window (e.g. show features observed within the last 30 days)
  const minDate = currentDate ? new Date(currentDate.getTime() - 30 * msPerDay).toISOString().split('T')[0] : null;
  const maxDate = dateString;

  const progressPercent = totalDays > 0 ? (currentDay / totalDays) * 100 : 0;

  // Reset timeline when year filter changes
  useEffect(() => {
    setCurrentDay(0);
    setIsPlaying(false);
  }, [yearFilter]);

  // Automated temporal playback loop
  useEffect(() => {
    let timer;
    if (isPlaying) {
      timer = setInterval(() => {
        setCurrentDay((prev) => {
          if (prev >= totalDays) {
            return 0; // Loop back to start
          }
          return Math.min(prev + 7, totalDays); // Move forward 7 days
        });
      }, 300);
    }
    return () => clearInterval(timer);
  }, [isPlaying, totalDays]);

  // Initialize Mapbox instance
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/satellite-v9', // Satellite imagery base layer
      center: [64.4246, 39.7747], // Uzbekistan geographic center
      zoom: 6, // Country-scale overview zoom
    });

    mapRef.current = map;
    // Expose map for quick debugging in the browser console
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-param-reassign, no-underscore-dangle
      window.__AutoMergeMap = map;
    }

    // Add navigation controls
    map.addControl(new mapboxgl.NavigationControl(), 'top-left');

    map.on('load', () => {
      // Add standard GeoJSON source pointing to our internal endpoint
      map.addSource('methane-plumes', {
        type: 'geojson',
        data: '/api/methane-data',
      });

      // Data-driven fill layer varying color/opacity by probability
      map.addLayer({
        id: 'plumes-layer-fill',
        type: 'fill',
        source: 'methane-plumes',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'probability'],
            0.5, '#f59e0b', // Amber for lower confidence
            0.9, '#ef4444'  // Red for higher confidence
          ],
          'fill-opacity': [
            'interpolate',
            ['linear'],
            ['get', 'probability'],
            0.5, 0.35,
            0.9, 0.75
          ],
        },
      });

      // Outline layer (animated/pulsing line-width)
      map.addLayer({
        id: 'plumes-layer-outline',
        type: 'line',
        source: 'methane-plumes',
        paint: {
          'line-color': [
            'interpolate',
            ['linear'],
            ['get', 'probability'],
            0.5, '#d97706',
            0.9, '#dc2626'
          ],
          'line-width': 2,
          'line-opacity': 0.8,
        },
      });

      // Bright highlight outline layer (cyan)
      map.addLayer({
        id: 'plumes-layer-highlight-outline',
        type: 'line',
        source: 'methane-plumes',
        paint: {
          'line-color': '#00ffff',
          'line-width': 4,
        },
        filter: ['==', ['get', 'id'], ''],
      });

      // Highlight fill layer (cyan with opacity)
      map.addLayer({
        id: 'plumes-layer-highlight-fill',
        type: 'fill',
        source: 'methane-plumes',
        paint: {
          'fill-color': '#00ffff',
          'fill-opacity': 0.35,
        },
        filter: ['==', ['get', 'id'], ''],
      });

      // Facilities: load from backend and render as a circle layer (points)
      (async () => {
        try {
          const res = await fetch('/api/facilities');
          if (!res.ok) throw new Error(`Failed to load facilities: ${res.status}`);
          const data = await res.json();

          // Normalize to a FeatureCollection of Point geometries (use centroid lon/lat if geometry isn't a Point)
          const features = (data?.type === 'FeatureCollection' && Array.isArray(data.features))
            ? data.features.map((f) => {
                const lon = f?.properties?.lon;
                const lat = f?.properties?.lat;
                let geom = f.geometry;
                if ((!geom || geom.type !== 'Point') && lon != null && lat != null) {
                  geom = { type: 'Point', coordinates: [Number(lon), Number(lat)] };
                }
                return { type: 'Feature', geometry: geom, properties: f.properties };
              })
            : [];

          const facilitiesGeo = { type: 'FeatureCollection', features };

          if (map.getSource('facilities')) {
            map.getSource('facilities').setData(facilitiesGeo);
          } else {
            map.addSource('facilities', { type: 'geojson', data: facilitiesGeo });

            map.addLayer({
              id: 'facilities-layer',
              type: 'circle',
              source: 'facilities',
              paint: {
                'circle-radius': 6,
                'circle-color': '#06b6d4',
                'circle-stroke-color': '#083344',
                'circle-stroke-width': 1,
                'circle-opacity': 0.95,
              },
            });

            // Highlight layer for selected facility (larger cyan circle)
            map.addLayer({
              id: 'facilities-highlight-layer',
              type: 'circle',
              source: 'facilities',
              paint: {
                'circle-radius': 10,
                'circle-color': '#00ffff',
                'circle-stroke-color': '#083344',
                'circle-stroke-width': 2,
                'circle-opacity': 0.95,
              },
              filter: ['==', ['get', 'ogim_id'], ''],
            });

            // Clipboard fallback helper
            const fallbackCopyTextToClipboard = (text) => {
              try {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.setAttribute('readonly', '');
                textarea.style.position = 'absolute';
                textarea.style.left = '-9999px';
                document.body.appendChild(textarea);
                textarea.select();
                textarea.setSelectionRange(0, textarea.value.length);
                document.execCommand('copy');
                document.body.removeChild(textarea);
              } catch (err) {
                // eslint-disable-next-line no-console
                console.error('Fallback: Oops, unable to copy', err);
              }
            };

            // Popup on click and copy coordinates to clipboard
            map.on('click', 'facilities-layer', (e) => {
              if (!e.features || e.features.length === 0) return;
              const feat = e.features[0];
              const coords = feat.geometry && feat.geometry.coordinates ? feat.geometry.coordinates.slice() : [0,0];
              const props = feat.properties || {};

              const lat = Number(coords[1]);
              const lng = Number(coords[0]);
              const coordsText = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

              // Try Clipboard API first, fallback to textarea copy
              if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                navigator.clipboard.writeText(coordsText).catch(() => fallbackCopyTextToClipboard(coordsText));
              } else {
                fallbackCopyTextToClipboard(coordsText);
              }

              // Show popup and include a small cue that coordinates were copied
              const popupHtml = `<strong>${props.fac_name ?? 'Unnamed Facility'}</strong><div style="font-size:12px;color:#666">${props.category ?? ''}</div><div style="font-size:12px;color:#0ff;margin-top:6px">Coordinates copied: ${coordsText}</div>`;

              // Ensure long/lat ordering for setLngLat
              new mapboxgl.Popup({ offset: 10 })
                .setLngLat(coords)
                .setHTML(popupHtml)
                .addTo(map);
            });

            map.on('mouseenter', 'facilities-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
            map.on('mouseleave', 'facilities-layer', () => { map.getCanvas().style.cursor = ''; });
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('Error loading facilities for map:', err);
        }
      })();

      // Load Uzbekistan country boundary (GeoJSON via Nominatim) and render subtle outline on the basemap
      (async () => {
        try {
          const res = await fetch('https://nominatim.openstreetmap.org/search.php?q=Uzbekistan&polygon_geojson=1&format=json');
          if (!res.ok) throw new Error(`Failed to fetch Uzbekistan boundary: ${res.status}`);
          const body = await res.json();
          if (Array.isArray(body) && body.length > 0 && body[0].geojson) {
            const uzGeo = body[0].geojson;
            const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: uzGeo, properties: { name: 'Uzbekistan' } }] };
            if (map.getSource('uzb-boundary')) {
              map.getSource('uzb-boundary').setData(fc);
            } else {
              map.addSource('uzb-boundary', { type: 'geojson', data: fc });
              map.addLayer({
                id: 'uzb-boundary-fill',
                type: 'fill',
                source: 'uzb-boundary',
                paint: {
                  'fill-color': '#00ffff',
                  'fill-opacity': 0.03,
                },
              });
              map.addLayer({
                id: 'uzb-boundary-line',
                type: 'line',
                source: 'uzb-boundary',
                paint: {
                  'line-color': '#00ffff',
                  'line-width': 3,
                  'line-opacity': 0.9,
                },
              });

              // Attempt to move the boundary below plume features but above the basemap tiles
              try {
                if (map.getLayer('plumes-layer-fill')) {
                  map.moveLayer('uzb-boundary-line', 'plumes-layer-fill');
                } else if (map.getLayer('facilities-layer')) {
                  map.moveLayer('uzb-boundary-line', 'facilities-layer');
                }
              } catch (e) {
                // ignore if moveLayer fails
              }
            }
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('Error loading Uzbekistan boundary', err);
        }
      })();

      // HOVER INTERACTIVITY: change pointer when hovering over plumes
      map.on('mouseenter', 'plumes-layer-fill', () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', 'plumes-layer-fill', () => {
        map.getCanvas().style.cursor = '';
      });

      // CLICK INTERACTIVITY: select plume feature and fly to coordinates
      map.on('click', 'plumes-layer-fill', (e) => {
        if (!e.features || e.features.length === 0) return;

        const feature = e.features[0];
        const properties = feature.properties;

        // Propagate selection to parent component/state
        onSelectPlume({
          id: properties.id,
          ogim_id: properties.ogim_id,
          fac_name: properties.fac_name,
          observation_date: properties.observation_date,
          probability: properties.probability,
          animation_url: properties.animation_url,
        });

        // Use click point or calculated center to center map animation
        const clickLngLat = e.lngLat;
        map.flyTo({
          center: [clickLngLat.lng, clickLngLat.lat],
          zoom: 11, // High resolution zoom level for detailed facility views
          essential: true,
          speed: 1.2,
          curve: 1.4,
        });
      });
    });

    // Cleanup reference instance to prevent canvas memory leaks
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [onSelectPlume]);

  // Handle active selected plume highlighting
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applySelectionFilter = () => {
      const id = selectedPlume ? selectedPlume.id : '';
      if (map.getLayer('plumes-layer-highlight-outline')) {
        map.setFilter('plumes-layer-highlight-outline', ['==', ['get', 'id'], id]);
      }
      if (map.getLayer('plumes-layer-highlight-fill')) {
        map.setFilter('plumes-layer-highlight-fill', ['==', ['get', 'id'], id]);
      }
    };

    if (map.isStyleLoaded()) {
      applySelectionFilter();
    } else {
      map.once('idle', applySelectionFilter);
    }
  }, [selectedPlume]);

  // Also highlight the facility marker that corresponds to the selected plume (by ogim_id)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const ogim = selectedPlume ? selectedPlume.ogim_id : '';

    const applyFacilityHighlight = () => {
      if (map.getLayer('facilities-highlight-layer')) {
        map.setFilter('facilities-highlight-layer', ['==', ['get', 'ogim_id'], ogim]);
      }
    };

    if (map.isStyleLoaded()) {
      applyFacilityHighlight();
    } else {
      map.once('idle', applyFacilityHighlight);
    }
  }, [selectedPlume]);

  // Toggle facility visibility and highlight layer based on props
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const setVisibility = (layerId, visible) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
    };

    const apply = () => {
      setVisibility('facilities-layer', showFacilities);
      setVisibility('facilities-highlight-layer', showFacilityHighlights);
    };

    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once('idle', apply);
    }
  }, [showFacilities, showFacilityHighlights]);

  // Handle live temporal filtering of plumes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyTimeFilter = () => {
      // If no year is selected, hide plume layers entirely
      if (!dateStart) {
        const hide = (id) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none'); };
        hide('plumes-layer-fill');
        hide('plumes-layer-outline');
        hide('plumes-layer-highlight-outline');
        hide('plumes-layer-highlight-fill');
        return;
      }

      // Ensure plume layers are visible when a year is selected
      const show = (id) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible'); };
      show('plumes-layer-fill');
      show('plumes-layer-outline');
      show('plumes-layer-highlight-outline');
      show('plumes-layer-highlight-fill');

      const filterExpr = [
        'all',
        ['>=', ['get', 'observation_date'], minDate],
        ['<=', ['get', 'observation_date'], maxDate],
        ['>=', ['get', 'probability'], probabilityFilter]
      ];

      if (map.getLayer('plumes-layer-fill')) {
        map.setFilter('plumes-layer-fill', filterExpr);
      }
      if (map.getLayer('plumes-layer-outline')) {
        map.setFilter('plumes-layer-outline', filterExpr);
      }
    };

    if (map.isStyleLoaded()) {
      applyTimeFilter();
    } else {
      map.once('idle', applyTimeFilter);
    }
  }, [currentDay, minDate, maxDate, probabilityFilter]);

  // Breathing pulse animation for vector outlines
  useEffect(() => {
    let pulseVal = 0;
    const animate = () => {
      pulseVal = (pulseVal + 0.05) % (Math.PI * 2);
      const strokeWidth = 2.0 + Math.sin(pulseVal) * 1.0; // range: 1.0px to 3.0px

      if (mapRef.current && mapRef.current.getLayer('plumes-layer-outline')) {
        mapRef.current.setPaintProperty('plumes-layer-outline', 'line-width', strokeWidth);
      }

      pulseFrameRef.current = requestAnimationFrame(animate);
    };

    pulseFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (pulseFrameRef.current) {
        cancelAnimationFrame(pulseFrameRef.current);
      }
    };
  }, []);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />
      
      {/* Legend overlaid on the map */}
      <div className="absolute bottom-32 left-6 z-10 bg-slate-900/90 backdrop-blur-md text-white p-4 rounded-xl border border-slate-750 shadow-2xl max-w-xs">
        <h4 className="text-sm font-semibold mb-2">MethaneLeak Layer</h4>
        <div className="flex items-center gap-3 mb-1">
          <span className="w-5 h-5 bg-[#ff4d4d]/55 border-2 border-[#e60505] rounded"></span>
          <span className="text-xs text-slate-300">Methane Plume (PostGIS Vector)</span>
        </div>
        <p className="text-[10px] text-slate-400 mt-2">
          Click on any highlighted plume anomaly shape to zoom in and view localized facility detection metrics.
        </p>
      </div>

      {/* Sleek glassmorphic timeline control widget */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-11/12 max-w-2xl bg-slate-900/80 backdrop-blur-md text-white px-6 py-4 rounded-2xl border border-slate-750 shadow-2xl flex items-center gap-4 pointer-events-auto">
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-teal-500 hover:bg-teal-400 text-slate-950 transition-colors shadow-lg shadow-teal-500/20"
        >
          {isPlaying ? (
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 fill-current ml-0.5" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <div className="flex-1 flex flex-col gap-1">
          <div className="flex justify-between items-center text-[10px] text-slate-400 font-semibold tracking-wider uppercase">
            <span>{start || 'Select a year'}</span>
            <span className="text-teal-400 font-bold text-xs bg-slate-950/60 px-3 py-1 rounded-full border border-slate-800">
              {currentDate ? currentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
            </span>
            <span>{end || ''}</span>
          </div>

          <input
            type="range"
            min="0"
            max={totalDays}
            value={currentDay}
            onChange={(e) => {
              setCurrentDay(parseInt(e.target.value, 10));
              setIsPlaying(false);
            }}
            className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-slate-800 accent-teal-400 focus:outline-none"
            style={{
              background: `linear-gradient(to right, #14b8a6 0%, #14b8a6 ${progressPercent}%, #1e293b ${progressPercent}%, #1e293b 100%)`
            }}
          />
        </div>
      </div>
    </div>
  );
}
