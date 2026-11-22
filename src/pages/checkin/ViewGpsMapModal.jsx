import React, { useEffect, useRef } from 'react';
import { ResponsiveModal } from '../../components/common/ResponsiveModal.jsx';
import { loadLeaflet } from '../../utils/vendorBridge.js';
import { getEffectiveOfficialLocations } from '../../hooks/useGeolocation5Tier.js';

function createModalPinIcon(L, colorHex) {
  return L.divIcon({
    className: 'bma-custom-leaflet-pin',
    html: `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;background:${colorHex};transform:rotate(-45deg);border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;"><div style="width:8px;height:8px;border-radius:50%;background:#fff;"></div></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    popupAnchor: [0, -24],
  });
}

/**
 * ViewGpsMapModal (#modalViewGpsMap — Option A)
 * Displays expanded Leaflet map with current user position (red pin), official locations (blue pin + #10b981 circle), and distance radius.
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
        L.marker([lat, lng], { icon: createModalPinIcon(L, '#ef4444'), zIndexOffset: 500 })
          .addTo(map)
          .bindPopup(locationName || 'พิกัดปัจจุบันของคุณ')
          .openPopup();
      }
      const officialLocs = getEffectiveOfficialLocations(settings?.official_locations);
      const bluePin = createModalPinIcon(L, '#2563eb');
      for (const loc of officialLocs) {
        L.circle([Number(loc.latitude), Number(loc.longitude)], {
          radius: Number(loc.radius_meters || 150),
          color: '#10b981',
          fillColor: '#10b981',
          fillOpacity: 0.16,
          weight: 2,
        }).addTo(map);
        L.marker([Number(loc.latitude), Number(loc.longitude)], { icon: bluePin })
          .addTo(map)
          .bindPopup(`${loc.name} (รัศมี ${loc.radius_meters || 150} ม.)`);
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
  }, [open, coords, locationName, settings?.official_locations]);

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
            {coords
              ? `${Number(coords.lat).toFixed(6)}, ${Number(coords.lng).toFixed(6)}${coords.accuracy != null ? ` (±${coords.accuracy} ม.)` : ''}`
              : 'ยังไม่มีพิกัด'}
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
