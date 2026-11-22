import React, { useEffect, useRef } from 'react';
import { loadLeaflet } from '../../utils/vendorBridge.js';

/**
 * EmbeddedMapCard (#gpsSectionCard — 100% Parity with checkin.html)
 * - Soft gray header #F1F3F5 "พื้นที่ใกล้เคียง" + View full map button
 * - Embedded Leaflet map + circular white .shutter-glow refresh button bottom-center
 */
export function EmbeddedMapCard({
  coords,
  locationName,
  geofence,
  loading,
  error,
  onRefreshGps,
  onOpenFullMap,
  settings,
}) {
  const mapElRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const circlesRef = useRef([]);

  useEffect(() => {
    let alive = true;

    async function initOrUpdateMap() {
      const L = await loadLeaflet();
      if (!alive || !mapElRef.current) return;

      const lat = coords?.lat ?? 13.756331;
      const lng = coords?.lng ?? 100.501765;

      if (!mapInstanceRef.current) {
        mapInstanceRef.current = L.map(mapElRef.current, {
          zoomControl: false,
          attributionControl: false,
        }).setView([lat, lng], coords ? 17 : 13);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
        }).addTo(mapInstanceRef.current);
      }

      const map = mapInstanceRef.current;

      circlesRef.current.forEach((c) => c.remove());
      circlesRef.current = [];
      for (const loc of settings?.official_locations || []) {
        if (loc.is_active === false || !loc.latitude || !loc.longitude) continue;
        const circle = L.circle([Number(loc.latitude), Number(loc.longitude)], {
          radius: Number(loc.radius_meters || 150),
          color: '#00744B',
          fillColor: '#00A368',
          fillOpacity: 0.14,
          weight: 1.5,
        }).addTo(map);
        circlesRef.current.push(circle);
      }

      if (coords) {
        if (!markerRef.current) {
          markerRef.current = L.marker([lat, lng]).addTo(map);
        } else {
          markerRef.current.setLatLng([lat, lng]);
        }
        map.setView([lat, lng], 17, { animate: true });
      }
      window.setTimeout(() => map.invalidateSize(), 150);
    }

    initOrUpdateMap();
    return () => { alive = false; };
  }, [coords, settings]);

  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
        circlesRef.current = [];
      }
    };
  }, []);

  return (
    <div id="gpsSectionCard" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col h-full">
      {/* Original Soft Gray Header #F1F3F5 */}
      <div className="px-3 py-2 bg-[#F1F3F5] dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-1.5">
        <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-200 truncate">
          <i className="fa-solid fa-location-dot text-[#00744B] mr-1" />พื้นที่ใกล้เคียง
        </span>
        {onOpenFullMap && (
          <button
            type="button"
            onClick={onOpenFullMap}
            title="ขยายดูแผนที่"
            className="text-[10px] font-bold text-[#00744B] dark:text-[#00C08A] hover:underline shrink-0"
          >
            <i className="fa-solid fa-expand mr-0.5" />ขยาย
          </button>
        )}
      </div>

      {/* Embedded Map + Circular White .shutter-glow Refresh Button */}
      <div className="relative flex-1 min-h-[140px] sm:min-h-[175px] w-full bg-slate-200 dark:bg-slate-800">
        <div ref={mapElRef} className="w-full h-full z-0" />
        <button
          type="button"
          disabled={loading}
          onClick={() => onRefreshGps(true)}
          title="รีเฟรชพิกัด GPS ใหม่ (Hardware Cache-Busting)"
          className="shutter-glow absolute bottom-2.5 left-1/2 -translate-x-1/2 z-[400] w-10 h-10 rounded-full bg-white text-[#00744B] border-2 border-[#00744B]/60 shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition disabled:opacity-60"
        >
          <i className={`fa-solid ${loading ? 'fa-circle-notch fa-spin' : 'fa-crosshairs'} text-sm`} />
        </button>
      </div>

      {/* Resolved Address Footer */}
      <div className="px-2.5 py-2 text-[11px] bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
        {error ? (
          <p className="text-rose-600 dark:text-rose-400 font-semibold line-clamp-2">{error}</p>
        ) : (
          <p className="font-bold text-slate-700 dark:text-slate-200 line-clamp-2 leading-snug">
            {locationName || (loading ? 'กำลังค้นหาสถานที่ใกล้เคียง...' : 'รอสัญญาณ GPS')}
          </p>
        )}
        {geofence?.distanceMeters != null && (
          <span className={`inline-block mt-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
            geofence.withinRadius ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
          }`}>
            {geofence.withinRadius ? `ในรัศมี ${geofence.distanceMeters} ม.` : `ห่าง ${geofence.distanceMeters} ม.`}
          </span>
        )}
      </div>
    </div>
  );
}
