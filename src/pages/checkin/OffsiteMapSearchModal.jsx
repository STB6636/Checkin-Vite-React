import React, { useState, useEffect, useRef } from 'react';
import { ResponsiveModal } from '../../components/common/ResponsiveModal.jsx';
import { AttendanceModel } from '../../models/AttendanceModel.js';
import { loadLeaflet } from '../../utils/vendorBridge.js';

/**
 * OffsiteMapSearchModal (ADR-0025: Unified ArcGIS Forward Geocoding + Interactive Pin)
 */
export function OffsiteMapSearchModal({ open, onClose, initialCoords, onSelectPlace }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState(initialCoords || { lat: 13.756331, lng: 100.501765, name: '' });

  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;

    async function bootMap() {
      const L = await loadLeaflet();
      if (!alive || !mapElRef.current) return;
      const lat = picked.lat || 13.756331;
      const lng = picked.lng || 100.501765;

      const map = L.map(mapElRef.current).setView([lat, lng], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
      const marker = L.marker([lat, lng], { draggable: true }).addTo(map);

      const updatePoint = async (newLat, newLng) => {
        const name = await AttendanceModel.resolveLocationName(newLat, newLng).catch(() => `${newLat.toFixed(6)}, ${newLng.toFixed(6)}`);
        if (alive) setPicked({ lat: newLat, lng: newLng, name });
      };

      map.on('click', (e) => {
        marker.setLatLng(e.latlng);
        updatePoint(e.latlng.lat, e.latlng.lng);
      });
      marker.on('dragend', () => {
        const ll = marker.getLatLng();
        updatePoint(ll.lat, ll.lng);
      });

      mapRef.current = map;
      markerRef.current = marker;
      window.setTimeout(() => map.invalidateSize(), 200);
    }

    bootMap();
    return () => {
      alive = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, [open]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await AttendanceModel.searchPlaces(query.trim());
      setResults(Array.isArray(res) ? res : []);
    } finally {
      setSearching(false);
    }
  };

  const handlePickResult = (place) => {
    const lat = Number(place.lat ?? place.latitude);
    const lng = Number(place.lng ?? place.longitude ?? place.lon);
    const name = place.display_name || place.name || query;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setPicked({ lat, lng, name });
      if (mapRef.current && markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
        mapRef.current.setView([lat, lng], 16);
      }
      setResults([]);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      title="ค้นหาและปักหมุดสถานที่ปฏิบัติงาน"
      subtitle="ค้นหาด้วย ArcGIS / แตะบนแผนที่เพื่อเลือกตำแหน่ง"
      icon="fa-map-location-dot"
      maxWidthClass="max-w-xl"
      footer={
        <>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-semibold">ยกเลิก</button>
          <button
            type="button"
            onClick={() => {
              onSelectPlace(picked);
              onClose();
            }}
            className="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold"
          >
            ยืนยันตำแหน่งนี้
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="พิมพ์ชื่อสถานที่ เช่น ศาลาว่าการ กทม., สำนักเทศกิจ..."
            className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs"
          />
          <button type="submit" disabled={searching} className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold">
            {searching ? <i className="fa-solid fa-circle-notch fa-spin" /> : 'ค้นหา'}
          </button>
        </form>

        {results.length > 0 && (
          <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {results.slice(0, 6).map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handlePickResult(r)}
                className="w-full text-left px-3 py-2 hover:bg-emerald-50 dark:hover:bg-slate-800 transition"
              >
                <p className="font-bold truncate">{r.name || r.display_name}</p>
                {r.address && <p className="text-[11px] text-slate-400 truncate">{r.address}</p>}
              </button>
            ))}
          </div>
        )}

        <div ref={mapElRef} className="w-full h-60 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden" />

        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs">
          <p className="font-bold text-emerald-700 dark:text-emerald-400">{picked.name || 'แตะบนแผนที่เพื่อเลือกจุด'}</p>
          <p className="font-mono text-[11px] text-slate-400">{Number(picked.lat).toFixed(6)}, {Number(picked.lng).toFixed(6)}</p>
        </div>
      </div>
    </ResponsiveModal>
  );
}
