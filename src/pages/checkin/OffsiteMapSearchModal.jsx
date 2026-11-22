import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  const [searchTouched, setSearchTouched] = useState(false);
  const [picked, setPicked] = useState(initialCoords || { lat: 13.756331, lng: 100.501765, name: '' });

  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const searchSeqRef = useRef(0);
  const pickedRef = useRef(picked);

  useEffect(() => {
    pickedRef.current = picked;
  }, [picked]);

  // Sync picked coordinates & reset search state whenever modal opens
  useEffect(() => {
    if (!open) return;
    const initLat = Number(initialCoords?.lat);
    const initLng = Number(initialCoords?.lng);
    setPicked({
      lat: Number.isFinite(initLat) ? initLat : 13.756331,
      lng: Number.isFinite(initLng) ? initLng : 100.501765,
      name: initialCoords?.name || '',
    });
    setQuery('');
    setResults([]);
    setSearchTouched(false);
  }, [open, initialCoords?.lat, initialCoords?.lng, initialCoords?.name]);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;

    async function bootMap() {
      const L = await loadLeaflet();
      if (!alive || !mapElRef.current) return;
      const lat = Number.isFinite(Number(initialCoords?.lat)) ? Number(initialCoords.lat) : 13.756331;
      const lng = Number.isFinite(Number(initialCoords?.lng)) ? Number(initialCoords.lng) : 100.501765;

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

  const executeSearch = useCallback(async (qText) => {
    const trimmed = String(qText || '').trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearchTouched(false);
      return;
    }
    const seq = ++searchSeqRef.current;
    setSearching(true);
    setSearchTouched(true);
    try {
      const refPoint = pickedRef.current || { lat: 13.756331, lng: 100.501765 };
      const res = await AttendanceModel.searchPlaces(trimmed, {
        refLat: Number(refPoint.lat) || 13.756331,
        refLng: Number(refPoint.lng) || 100.501765,
        userProvince: 'กรุงเทพมหานคร',
        limit: 8,
      });
      if (seq !== searchSeqRef.current) return;
      setResults(Array.isArray(res) ? res : []);
    } finally {
      if (seq === searchSeqRef.current) {
        setSearching(false);
      }
    }
  }, []);

  // 350ms debounced search as user types
  useEffect(() => {
    if (!open) return undefined;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearchTouched(false);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      executeSearch(trimmed);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query, open, executeSearch]);

  const handleSearch = async (e) => {
    e.preventDefault();
    await executeSearch(query);
  };

  const handlePickResult = (place) => {
    const lat = Number(place.lat ?? place.latitude);
    const lng = Number(place.lng ?? place.longitude ?? place.lon);
    const name = place.mainName || place.display_name || place.name || query;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setPicked({ lat, lng, name });
      if (mapRef.current && markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
        const ext = place.extent;
        if (ext && Number.isFinite(ext.ymin) && Number.isFinite(ext.xmin) && Number.isFinite(ext.ymax) && Number.isFinite(ext.xmax)) {
          try {
            mapRef.current.fitBounds(
              [[ext.ymin, ext.xmin], [ext.ymax, ext.xmax]],
              { maxZoom: 17, padding: [24, 24] }
            );
          } catch (_) {
            mapRef.current.setView([lat, lng], 16);
          }
        } else {
          mapRef.current.setView([lat, lng], 16);
        }
      }
      setResults([]);
      setSearchTouched(false);
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
          <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {results.slice(0, 8).map((r, i) => {
              const title = r.mainName || r.name || r.display_name || 'สถานที่';
              const sub = r.subAddr || r.address || '';
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handlePickResult(r)}
                  className="w-full text-left px-3 py-2 hover:bg-emerald-50 dark:hover:bg-slate-800 transition flex items-start justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-800 dark:text-slate-100 truncate">{title}</p>
                    {sub && <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{sub}</p>}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-0.5 text-[10px]">
                    {r.distStr && (
                      <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold whitespace-nowrap">
                        {r.distStr}
                      </span>
                    )}
                    {r.category && (
                      <span className="text-slate-400 truncate max-w-[90px]">{r.category}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {searchTouched && !searching && results.length === 0 && (
          <div className="px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-[11px] text-amber-700 dark:text-amber-300">
            ไม่พบสถานที่ที่ตรงกับคำค้นหา — สามารถแตะหรือลากหมุดบนแผนที่ด้านล่างได้โดยตรง
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
