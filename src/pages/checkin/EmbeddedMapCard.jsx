import React, { useEffect, useRef } from 'react';
import { loadLeaflet } from '../../utils/vendorBridge.js';
import { getEffectiveOfficialLocations } from '../../hooks/useGeolocation5Tier.js';

function createPinIcon(L, colorHex) {
  return L.divIcon({
    className: 'bma-custom-leaflet-pin',
    html: `<div style="width:24px;height:24px;border-radius:50% 50% 50% 0;background:${colorHex};transform:rotate(-45deg);border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;"><div style="width:7px;height:7px;border-radius:50%;background:#fff;"></div></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -22],
  });
}

/**
 * EmbeddedMapCard (#gpsSectionCard — 100% Legacy Parity + Option A)
 * - Soft gray header #F1F3F5 displays resolved location name + loading icon (tappable to open ViewGpsMapModal; no "ขยาย" button)
 * - Leaflet container has id="inlineGpsLeafletMap" (hides cleanly when mobile drawer is open)
 * - Red user pin + Blue official pins + #10b981 geofence circles
 * - Circular white .shutter-glow refresh button with fa-arrows-rotate
 */
export function EmbeddedMapCard({
  coords,
  locationName,
  loading,
  resolvingPlace,
  error,
  onRefreshGps,
  onOpenFullMap,
  settings,
  hideMap = false,
  visible = true,
}) {
  const mapElRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const officialLayersRef = useRef([]);

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

      officialLayersRef.current.forEach((layer) => layer.remove());
      officialLayersRef.current = [];
      const officialLocs = getEffectiveOfficialLocations(settings?.official_locations);
      const bluePin = createPinIcon(L, '#2563eb');
      for (const loc of officialLocs) {
        const circle = L.circle([Number(loc.latitude), Number(loc.longitude)], {
          radius: Number(loc.radius_meters || 150),
          color: '#10b981',
          fillColor: '#10b981',
          fillOpacity: 0.16,
          weight: 1.5,
        }).addTo(map);
        const pin = L.marker([Number(loc.latitude), Number(loc.longitude)], { icon: bluePin }).addTo(map);
        officialLayersRef.current.push(circle, pin);
      }

      if (coords) {
        const redPin = createPinIcon(L, '#ef4444');
        if (!markerRef.current) {
          markerRef.current = L.marker([lat, lng], { icon: redPin, zIndexOffset: 500 }).addTo(map);
        } else {
          markerRef.current.setLatLng([lat, lng]);
        }
        map.setView([lat, lng], 17, { animate: true });
      }
      window.setTimeout(() => map.invalidateSize(), 150);
    }

    initOrUpdateMap();
    return () => { alive = false; };
  }, [coords, settings?.official_locations]);

  useEffect(() => {
    if (visible && mapInstanceRef.current) {
      const timer = window.setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 150);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [visible]);

  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
        officialLayersRef.current = [];
      }
    };
  }, []);

  const isBusy = Boolean(loading || resolvingPlace);
  const headerText = error
    ? error
    : isBusy && !locationName
      ? 'กำลังค้นหาสถานที่ใกล้เคียง...'
      : locationName || 'รอสัญญาณ GPS';

  return (
    <div id="gpsSectionCard" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col w-full aspect-[3/4] max-h-[30dvh]">
      {/* Option A: Legacy #F1F3F5 header with location name + spinner; tap header bar to expand ViewGpsMapModal */}
      <button
        type="button"
        onClick={onOpenFullMap}
        title="แตะเพื่อดูแผนที่ขนาดใหญ่"
        className="w-full px-2.5 py-1.5 bg-[#F1F3F5] dark:bg-slate-800/95 border-b border-slate-200 dark:border-slate-700 flex items-center gap-1.5 text-left hover:bg-slate-200/80 dark:hover:bg-slate-700/80 transition cursor-pointer shrink-0"
      >
        <i className={`fa-solid ${isBusy ? 'fa-circle-notch fa-spin text-[#00744B]' : error ? 'fa-triangle-exclamation text-rose-500' : 'fa-location-dot text-rose-500'} text-[11px] shrink-0`} />
        <span className={`text-[11px] font-bold truncate flex-1 ${error ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-200'}`}>
          {headerText}
        </span>
      </button>

      {/* Embedded Map (#inlineGpsLeafletMap) + Circular White .shutter-glow Refresh Button */}
      <div className="relative flex-1 min-h-0 w-full bg-slate-200 dark:bg-slate-800">
        <div
          id="inlineGpsLeafletMap"
          ref={mapElRef}
          className={`w-full h-full z-0 ${hideMap ? 'invisible pointer-events-none' : ''}`}
        />
        <button
          type="button"
          disabled={loading}
          onClick={() => onRefreshGps(true)}
          title="รีเฟรชพิกัด GPS ใหม่ (Hardware Cache-Busting)"
          className="shutter-glow absolute bottom-2.5 left-1/2 -translate-x-1/2 z-[400] w-10 h-10 rounded-full bg-white text-[#00744B] border-2 border-[#00744B]/60 shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition disabled:opacity-60 cursor-pointer"
        >
          <i className={`fa-solid fa-arrows-rotate ${loading ? 'fa-spin' : ''} text-sm`} />
        </button>
      </div>
    </div>
  );
}
