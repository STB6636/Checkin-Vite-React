import React, { useEffect, useRef } from 'react';
import { ResponsiveModal } from '../../components/common/ResponsiveModal.jsx';
import { loadLeaflet } from '../../utils/vendorBridge.js';

/**
 * ViewGpsMapModal (#modalViewGpsMap from legacy checkin.html:1100-1134)
 * Displays expanded Leaflet map with current user position, official locations, and distance radius.
 */
export function ViewGpsMapModal({ open, onClose, coords, locationName, geofence, settings }) {
  const mapElRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;

    async function boot() {
      const L = await loadLeaflet();
      if (!alive || !mapElRef.current) return;
      const lat = coords?.lat ?? 13.756331;
      const lng = coords?.lng ?? 100.501765;

      const map = L.map(mapElRef.current).setView([lat, lng], 16);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
      if (coords) {
        L.marker([lat, lng]).addTo(map).bindPopup(locationName || 'พิกัดปัจจุบันของคุณ').openPopup();
      }
      for (const loc of settings?.official_locations || []) {
        if (loc.is_active === false || !loc.latitude || !loc.longitude) continue;
        L.circle([Number(loc.latitude), Number(loc.longitude)], {
          radius: Number(loc.radius_meters || 150),
          color: '#00744B',
          fillColor: '#00A368',
          fillOpacity: 0.16,
          weight: 2,
        }).addTo(map).bindPopup(`${loc.name} (รัศมี ${loc.radius_meters || 150} ม.)`);
      }
      mapRef.current = map;
      window.setTimeout(() => map.invalidateSize(), 200);
    }

    boot();
    return () => {
      alive = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [open, coords, locationName, settings]);

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      title="แผนที่พิกัด GPS และรัศมีสถานที่ราชการ"
      subtitle={locationName || 'ตำแหน่งปัจจุบันของคุณ'}
      icon="fa-map-location-dot"
      maxWidthClass="max-w-2xl"
    >
      <div className="space-y-3">
        <div ref={mapElRef} className="w-full h-72 sm:h-96 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden" />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
          <span className="font-mono text-slate-600 dark:text-slate-300">
            {coords ? `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)} (±${coords.accuracy} ม.)` : 'ยังไม่มีพิกัด'}
          </span>
          {geofence?.nearest && (
            <span className={`px-2.5 py-1 rounded-full font-bold ${geofence.withinRadius ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
              {geofence.nearest.name}: ห่าง {geofence.distanceMeters} ม. / รัศมี {geofence.radiusMeters} ม.
            </span>
          )}
        </div>
      </div>
    </ResponsiveModal>
  );
}
