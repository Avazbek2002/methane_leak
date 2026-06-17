'use client';

import React, { useState } from 'react';
import MethaneMap from '../components/MethaneMap';

export default function Home() {
  const [selectedPlume, setSelectedPlume] = useState(null);
  const [yearFilter, setYearFilter] = useState('');
  const [probabilityFilter, setProbabilityFilter] = useState(0.5);
  const [showFacilities, setShowFacilities] = useState(true);
  const [showFacilityHighlights, setShowFacilityHighlights] = useState(true);

  // Helper to display facility name in the Anomaly Inspector
  const getDisplayFacilityName = (name) => {
    if (name === null || name === undefined) return 'Unregistered Facility';
    // treat numeric NaN as missing
    if (typeof name === 'number' && Number.isNaN(name)) return 'Unregistered Facility';
    const trimmed = String(name).trim();
    if (trimmed === '') return 'Unregistered Facility';
    const lower = trimmed.toLowerCase();
    if (lower === 'unnamed facility' || lower === 'unnamed facility') return 'Unregistered Facility';
    if (lower === 'nan') return 'Unregistered Facility';
    return trimmed;
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
      {/* Main Map View Container */}
      <main className="flex-1 relative h-full">
        {/* Header Overlay */}
        <header className="absolute top-6 left-6 z-10 bg-slate-900/80 backdrop-blur-md px-6 py-4 rounded-2xl border border-slate-750 shadow-2xl flex flex-col gap-1 pointer-events-auto">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500"></span>
            </span>
            <h1 className="text-xl font-black tracking-tight text-white bg-clip-text">
              MethaneLeak
            </h1>
          </div>
          <p className="text-xs text-slate-300 font-medium">
            Interactive Methane Plume Visualization
          </p>
        </header>

        {/* Map Component */}
        <MethaneMap
          selectedPlume={selectedPlume}
          onSelectPlume={setSelectedPlume}
          yearFilter={yearFilter}
          probabilityFilter={probabilityFilter}
          showFacilities={showFacilities}
          showFacilityHighlights={showFacilityHighlights}
        />
      </main>

      {/* Control Panel / Details Sidebar */}
      <aside className="w-[400px] h-full bg-[#111827] border-l border-slate-800 flex flex-col shadow-2xl overflow-y-auto">
        {/* Sidebar Header */}
        <div className="p-6 border-b border-slate-800 bg-slate-900/50">
          <h2 className="text-lg font-bold text-white tracking-wide">Anomaly Inspector</h2>
          <p className="text-xs text-slate-400 mt-1">
            Real-time Point-Source Emission Monitoring
          </p>
        </div>

        {/* Probability Filter Selector */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/10">
          <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 block mb-2">
            Minimum Probability Threshold
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={probabilityFilter}
              onChange={(e) => setProbabilityFilter(parseFloat(e.target.value))}
              className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-slate-800"
            />
            <span className="text-sm font-semibold text-slate-200 w-14 text-right">{Math.round(probabilityFilter * 100)}%</span>
          </div>
        </div>

        {/* Timeframe Range Selector */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/20">
          <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 block mb-2">
            Observation Year Filter
          </label>
          <div className="relative">
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="w-full bg-slate-850 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 appearance-none cursor-pointer"
            >
              <option value="" disabled>
                Select Year (no plumes shown by default)
              </option>
              <option value="2020">2020</option>
              <option value="2021">2021</option>
              <option value="2022">2022</option>
              <option value="2023">2023</option>
              <option value="2024">2024</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
              <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Facilities toggles */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/10">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-slate-200">Show Facilities</label>
            <input
              type="checkbox"
              checked={showFacilities}
              onChange={(e) => setShowFacilities(e.target.checked)}
              className="h-4 w-4 rounded"
            />
          </div>

          <div className="flex items-center justify-between mt-3">
            <label className="text-sm font-semibold text-slate-200">Highlight Facilities</label>
            <input
              type="checkbox"
              checked={showFacilityHighlights}
              onChange={(e) => setShowFacilityHighlights(e.target.checked)}
              className="h-4 w-4 rounded"
            />
          </div>
        </div>

        {/* Sidebar Content */}
        <div className="flex-1 p-6 flex flex-col">
          {!selectedPlume ? (
            /* Default State */
            <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
              <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center mb-4 border border-slate-700/50 animate-pulse">
                <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-slate-300 mb-1">No Plume Selected</h3>
              <p className="text-xs text-slate-400 max-w-[260px] leading-relaxed">
                Click on any high-probability anomaly vector shape highlighted on the map canvas to inspect detailed facility metrics.
              </p>
            </div>
          ) : (
            /* Active Selection State */
            <div className="space-y-6 animate-fadeIn">
              {/* Facility Name & Core Details */}
              <div className="bg-slate-900/60 rounded-2xl p-5 border border-slate-800">
                <span className="text-[10px] uppercase font-bold tracking-widest text-red-400 bg-red-950/50 px-2 py-1 rounded border border-red-900/40">
                  Confirmed Anomaly
                </span>
                <h3 className="text-xl font-bold text-white mt-3 leading-snug">
                  {getDisplayFacilityName(selectedPlume?.fac_name)}
                </h3>
                <div className="grid grid-cols-2 gap-4 mt-5">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">OGIM ID</span>
                    <span className="text-sm font-semibold text-slate-200">
                      {selectedPlume.ogim_id != null ? selectedPlume.ogim_id : 'N/A'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Detection Date</span>
                    <span className="text-sm font-semibold text-slate-200">
                      {selectedPlume.observation_date || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Confidence Metric Gauge */}
              <div className="bg-slate-900/60 rounded-2xl p-5 border border-slate-800">
                <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Model Confidence</span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-4xl font-extrabold text-white tracking-tight">
                    {selectedProbPercentText}
                  </span>
                  <span className="text-xs text-slate-400">Probability</span>
                </div>
                {/* Horizontal Progress bar */}
                <div className="w-full bg-slate-800 h-2.5 rounded-full mt-3 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-orange-550 to-red-500 h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: selectedProbWidth }}
                  />
                </div>
              </div>

              {/* Temporal Evolution Timeline Loop */}
              <div className="bg-slate-900/60 rounded-2xl p-5 border border-slate-850 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                    21-Day Temporal Evolution
                  </span>
                  <span className="text-[10px] text-slate-400 font-semibold px-2 py-0.5 rounded-full bg-slate-850 border border-slate-800">
                    Timelapse
                  </span>
                </div>
                
                <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950 flex items-center justify-center group">
                  {selectedPlume.animation_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img 
                      src={selectedPlume.animation_url}
                      onError={(e) => {
                        const fallbackSvg = 'data:image/svg+xml;utf8,' + encodeURIComponent(
                          '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="100%" height="100%" fill="#0b1220"/><text x="50%" y="50%" font-size="18" fill="#9ca3af" text-anchor="middle" dy=".3em">No timelapse available</text></svg>'
                        );
                        // prevent loop
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = fallbackSvg;
                        e.currentTarget.alt = 'No timelapse available';
                      }}
                      alt={`Methane evolution timelapse at ${selectedPlume.fac_name}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center p-6 text-center">
                      <svg className="w-8 h-8 text-slate-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span className="text-xs text-slate-500">No timelapse animation available</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-850 bg-slate-900/30 text-center">
          <span className="text-[10px] text-slate-500 font-mono">
            MethaneLeak Core v1.0.0
          </span>
        </div>
      </aside>
    </div>
  );
}
