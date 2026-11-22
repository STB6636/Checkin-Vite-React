import { useState, useCallback, useRef } from 'react';
import { AttendanceModel } from '../models/AttendanceModel.js';

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function evaluateOfficialGeofence(lat, lng, officialLocations = []) {
  const activeLocs = (officialLocations || []).filter((l) => l && l.is_active !== false && Number.isFinite(Number(l.latitude)) && Number.isFinite(Number(l.longitude)));
  if (activeLocs.length === 0) {
    return { matched: false, withinRadius: false, nearest: null, distanceMeters: null };
  }
  let nearest = null;
  let minDist = Infinity;
  for (const loc of activeLocs) {
    const dist = haversineMeters(lat, lng, Number(loc.latitude), Number(loc.longitude));
    if (dist < minDist) {
      minDist = dist;
      nearest = loc;
    }
  }
  const radius = Number(nearest?.radius_meters || 150);
  const withinRadius = minDist <= radius;
  return {
    matched: withinRadius,
    withinRadius,
    nearest,
    distanceMeters: Math.round(minDist),
    radiusMeters: radius,
  };
}

/**
 * GPS 5-Tier Nearby Places + Hardware Cache-Busting Hook (ADR-0021, ADR-0022, ADR-0024)
 */
export function useGeolocation5Tier(settings) {
  const [coords, setCoords] = useState(null); // { lat, lng, accuracy }
  const [locationName, setLocationName] = useState('');
  const [zoomMeta, setZoomMeta] = useState(null);
  const [geofence, setGeofence] = useState({ matched: false, withinRadius: false, nearest: null, distanceMeters: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const seqRef = useRef(0);

  const locate = useCallback(async (forceFresh = true) => {
    const mySeq = ++seqRef.current;
    setLoading(true);
    setError('');

    if (forceFresh) {
      AttendanceModel.clearLocationCache();
    }

    if (!navigator.geolocation) {
      setError('เบราว์เซอร์นี้ไม่รองรับการระบุพิกัด GPS');
      setLoading(false);
      return null;
    }

    const getPos = (highAccuracy, timeout) =>
      new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: highAccuracy,
          timeout,
          maximumAge: 0, // ADR-0022 Hardware Cache-Busting
        });
      });

    try {
      let pos;
      try {
        pos = await getPos(true, 12000);
      } catch (_) {
        pos = await getPos(false, 10000);
      }
      if (mySeq !== seqRef.current) return null;

      const lat = Number(pos.coords.latitude);
      const lng = Number(pos.coords.longitude);
      const accuracy = Math.round(Number(pos.coords.accuracy || 0));
      const nextCoords = { lat, lng, accuracy };
      setCoords(nextCoords);

      const officialLocs = settings?.official_locations || [];
      const gf = evaluateOfficialGeofence(lat, lng, officialLocs);
      setGeofence(gf);

      const meta = await AttendanceModel.resolveLocationWithZoomMeta(lat, lng, {
        officialLocations: officialLocs,
        forceRefresh: forceFresh,
      });
      if (mySeq !== seqRef.current) return null;

      const resolvedName = meta?.locationName || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      setLocationName(resolvedName);
      setZoomMeta(meta || null);
      setLoading(false);
      return { coords: nextCoords, locationName: resolvedName, geofence: gf, zoomMeta: meta };
    } catch (err) {
      if (mySeq !== seqRef.current) return null;
      const msg = err?.code === 1
        ? 'กรุณาอนุญาตการเข้าถึงตำแหน่ง GPS ของเบราว์เซอร์'
        : err?.code === 3
          ? 'หมดเวลาการค้นหาสัญญาณ GPS กรุณากดรีเฟรชอีกครั้ง'
          : 'ไม่สามารถรับสัญญาณ GPS ได้ในขณะนี้';
      setError(msg);
      setLoading(false);
      return null;
    }
  }, [settings]);

  return { coords, locationName, zoomMeta, geofence, loading, error, locate, setCoords, setLocationName };
}
