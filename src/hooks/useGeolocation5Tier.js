import { useState, useCallback, useRef, useEffect } from 'react';
import { AttendanceModel } from '../models/AttendanceModel.js';
import { Config } from '../core/Config.js';

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getEffectiveOfficialLocations(officialLocations) {
  const list = Array.isArray(officialLocations) && officialLocations.length > 0
    ? officialLocations
    : (Config.DEFAULT_OFFICIAL_LOCATIONS || Config.DEFAULT_SETTINGS?.official_locations || []);
  return list.filter(
    (l) => l && l.is_active !== false && Number.isFinite(Number(l.latitude)) && Number.isFinite(Number(l.longitude))
  );
}

export function evaluateOfficialGeofence(lat, lng, officialLocations = []) {
  const activeLocs = getEffectiveOfficialLocations(officialLocations);
  if (activeLocs.length === 0 || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    return { matched: false, withinRadius: false, nearest: null, distanceMeters: null, radiusMeters: 150, accuracyBuffer: 25 };
  }
  let nearest = null;
  let minDist = Infinity;
  for (const loc of activeLocs) {
    const dist = haversineMeters(Number(lat), Number(lng), Number(loc.latitude), Number(loc.longitude));
    if (dist < minDist) {
      minDist = dist;
      nearest = loc;
    }
  }
  const radius = Number(nearest?.radius_meters || 150);
  const accuracyBuffer = 25;
  const withinRadius = minDist <= (radius + accuracyBuffer);
  return {
    matched: withinRadius,
    withinRadius,
    nearest,
    distanceMeters: Math.round(minDist),
    radiusMeters: radius,
    accuracyBuffer,
  };
}

/**
 * GPS 5-Tier Nearby Places + Hardware Cache-Busting Hook (ADR-0021, ADR-0022, ADR-0024)
 */
export function useGeolocation5Tier(settings) {
  const [coords, setCoords] = useState(null); // { lat, lng, accuracy }
  const [locationName, setLocationName] = useState('');
  const [zoomMeta, setZoomMeta] = useState(null);
  const [geofence, setGeofence] = useState({
    matched: false,
    withinRadius: false,
    nearest: null,
    distanceMeters: null,
    radiusMeters: 150,
    accuracyBuffer: 25,
  });
  const [loading, setLoading] = useState(false);
  const [resolvingPlace, setResolvingPlace] = useState(false);
  const [error, setError] = useState('');
  const seqRef = useRef(0);
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Re-evaluate geofence immediately whenever official_locations or coords change (without re-firing GPS hardware)
  useEffect(() => {
    if (!coords) return;
    const gf = evaluateOfficialGeofence(coords.lat, coords.lng, settings?.official_locations);
    setGeofence(gf);
  }, [coords, settings?.official_locations]);

  const locate = useCallback(async (forceFresh = true) => {
    const curSettings = settingsRef.current || {};
    if (curSettings.require_gps === false) {
      setLoading(false);
      setResolvingPlace(false);
      setError('');
      return null;
    }

    const mySeq = ++seqRef.current;
    setLoading(true);
    setResolvingPlace(false);
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

      const officialLocs = getEffectiveOfficialLocations(settingsRef.current?.official_locations);
      const gf = evaluateOfficialGeofence(lat, lng, officialLocs);
      setGeofence(gf);

      setResolvingPlace(true);
      const meta = await AttendanceModel.resolveLocationWithZoomMeta(lat, lng, {
        officialLocations: officialLocs,
        bypassCache: forceFresh,
      });
      if (mySeq !== seqRef.current) return null;

      const resolvedName = meta?.locationName || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      setLocationName(resolvedName);
      setZoomMeta(meta || null);
      setResolvingPlace(false);
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
      setResolvingPlace(false);
      setLoading(false);
      return null;
    }
  }, []);

  return {
    coords,
    locationName,
    zoomMeta,
    geofence,
    loading,
    resolvingPlace,
    error,
    locate,
    setCoords,
    setLocationName,
  };
}
