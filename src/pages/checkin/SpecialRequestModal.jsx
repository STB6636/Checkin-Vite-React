import React, { useState, useEffect, useRef } from 'react';
import { ResponsiveModal } from '../../components/common/ResponsiveModal.jsx';
import { AttendanceModel } from '../../models/AttendanceModel.js';
import { SettingsModel } from '../../models/SettingsModel.js';
import { UIHelpers } from '../../core/UIHelpers.js';
import { loadLeaflet } from '../../utils/vendorBridge.js';
import { getEffectiveOfficialLocations, evaluateOfficialGeofence } from '../../hooks/useGeolocation5Tier.js';

/**
 * SpecialRequestModal — 100% Parity with legacy checkin.html (L809-980)
 * - Resets form cleanly every time `open` becomes true
 * - Custom time inputs shown ONLY when selected shift has `is_custom === true`
 * - Embedded `#spCurrentGpsBox` + `#spCustomGpsBox` (`#spLeafletMap` draggable pin + ArcGIS search)
 * - Optional photo attachment uploaded to Google Drive (`photo_url` string)
 */
export function SpecialRequestModal({ open, onClose, user, settings, currentCoords, currentLocationName, onSubmitted }) {
  const shifts = (settings?.work_shifts || []).filter((s) =>
    !(settings?.disable_normal_hours_checkin && s.name === 'เวลาราชการปกติ')
  );
  const officialLocations = getEffectiveOfficialLocations(settings?.official_locations);
  const offsiteJobTypes = settings?.offsite_job_types || ['ปฏิบัติงานนอกสถานที่', 'อบรม/สัมมนา/ประชุมราชการ', 'ปฏิบัติงานที่บ้าน (WFH)', 'อื่นๆ'];
  const reasons = settings?.special_request_reasons || ['ลืมลงเวลาปฏิบัติราชการ', 'โทรศัพท์/อุปกรณ์ขัดข้อง', 'ระบบอินเทอร์เน็ตขัดข้อง', 'ปฏิบัติงานภารกิจเร่งด่วน', 'อื่นๆ'];

  const [workDate, setWorkDate] = useState(UIHelpers.getTodayISO());
  const [shiftName, setShiftName] = useState('');
  const [checkInTime, setCheckInTime] = useState('08:30');
  const [checkOutTime, setCheckOutTime] = useState('16:30');
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [locMode, setLocMode] = useState('ONSITE');
  const [officialLocId, setOfficialLocId] = useState('');
  const [offsiteJobType, setOffsiteJobType] = useState('');
  const [customOffsiteJob, setCustomOffsiteJob] = useState('');
  const [gpsSource, setGpsSource] = useState('current'); // 'current' | 'custom'
  const [spCustomPlace, setSpCustomPlace] = useState({ lat: 13.756331, lng: 100.501765, name: '' });
  const [spSearchQuery, setSpSearchQuery] = useState('');
  const [spSearchResults, setSpSearchResults] = useState([]);
  const [spSearching, setSpSearching] = useState(false);
  const [attachPhotoDataUrl, setAttachPhotoDataUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const spMapElRef = useRef(null);
  const spMapRef = useRef(null);
  const spMarkerRef = useRef(null);
  const photoInputRef = useRef(null);

  // Reset form every time modal opens
  useEffect(() => {
    if (!open) return;
    const firstShift = shifts[0] || { name: 'เวลาราชการปกติ', check_in: '08:30', check_out: '16:30' };
    setWorkDate(UIHelpers.getTodayISO());
    setShiftName(firstShift.name);
    setCheckInTime(firstShift.check_in || '08:30');
    setCheckOutTime(firstShift.check_out || '16:30');
    setReason(reasons[0] || '');
    setCustomReason('');
    setLocMode('ONSITE');
    setOfficialLocId(officialLocations[0]?.id || '');
    setOffsiteJobType(offsiteJobTypes[0] || '');
    setCustomOffsiteJob('');
    setGpsSource('current');
    setSpCustomPlace({
      lat: currentCoords?.lat ?? 13.756331,
      lng: currentCoords?.lng ?? 100.501765,
      name: currentLocationName || '',
    });
    setSpSearchQuery('');
    setSpSearchResults([]);
    setAttachPhotoDataUrl('');
  }, [open]);

  // Boot inline #spLeafletMap when OFFSITE + custom GPS source is selected
  useEffect(() => {
    if (!open || locMode !== 'OFFSITE' || gpsSource !== 'custom') {
      if (spMapRef.current) {
        spMapRef.current.remove();
        spMapRef.current = null;
        spMarkerRef.current = null;
      }
      return undefined;
    }

    let alive = true;
    async function bootSpMap() {
      const L = await loadLeaflet();
      if (!alive || !spMapElRef.current) return;
      const lat = Number(spCustomPlace.lat) || 13.756331;
      const lng = Number(spCustomPlace.lng) || 100.501765;

      const map = L.map(spMapElRef.current).setView([lat, lng], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
      const marker = L.marker([lat, lng], { draggable: true }).addTo(map);

      const updatePoint = async (newLat, newLng) => {
        const name = await AttendanceModel.resolveLocationName(newLat, newLng).catch(() => `${newLat.toFixed(6)}, ${newLng.toFixed(6)}`);
        if (alive) setSpCustomPlace({ lat: newLat, lng: newLng, name });
      };

      map.on('click', (e) => {
        marker.setLatLng(e.latlng);
        updatePoint(e.latlng.lat, e.latlng.lng);
      });
      marker.on('dragend', () => {
        const ll = marker.getLatLng();
        updatePoint(ll.lat, ll.lng);
      });

      spMapRef.current = map;
      spMarkerRef.current = marker;
      window.setTimeout(() => map.invalidateSize(), 200);
    }

    bootSpMap();
    return () => {
      alive = false;
      if (spMapRef.current) {
        spMapRef.current.remove();
        spMapRef.current = null;
        spMarkerRef.current = null;
      }
    };
  }, [open, locMode, gpsSource]);

  const selectedShift = shifts.find((s) => s.name === shiftName);
  const isCustomShift = Boolean(selectedShift?.is_custom);

  const handleShiftChange = (name) => {
    setShiftName(name);
    const sh = shifts.find((s) => s.name === name);
    if (sh) {
      setCheckInTime(sh.check_in || '08:30');
      setCheckOutTime(sh.check_out || '16:30');
    }
  };

  const handleSpSearch = async () => {
    const q = spSearchQuery.trim();
    if (q.length < 2) return;
    setSpSearching(true);
    try {
      const res = await AttendanceModel.searchPlaces(q, {
        refLat: Number(spCustomPlace.lat) || 13.756331,
        refLng: Number(spCustomPlace.lng) || 100.501765,
        userProvince: 'กรุงเทพมหานคร',
        limit: 6,
      });
      setSpSearchResults(Array.isArray(res) ? res : []);
    } finally {
      setSpSearching(false);
    }
  };

  const handlePickSpResult = (r) => {
    const lat = Number(r.lat ?? r.latitude);
    const lng = Number(r.lng ?? r.longitude);
    const name = r.mainName || r.name || spSearchQuery;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setSpCustomPlace({ lat, lng, name });
      if (spMapRef.current && spMarkerRef.current) {
        spMarkerRef.current.setLatLng([lat, lng]);
        spMapRef.current.setView([lat, lng], 16);
      }
      setSpSearchResults([]);
    }
  };

  const handlePhotoPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await SettingsModel.fileToDataUrl(file);
      setAttachPhotoDataUrl(dataUrl);
    } catch (_) {}
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const finalRemark = reason === 'อื่นๆ' ? customReason.trim() : reason;
    if (!finalRemark) {
      await UIHelpers.alert('กรุณาระบุเหตุผล', 'โปรดเลือกหรือกรอกเหตุผลการขอลงเวลากรณีพิเศษ', 'warning');
      return;
    }

    const finalOffsiteJob = offsiteJobType === 'อื่นๆ' ? customOffsiteJob.trim() : offsiteJobType;
    if (locMode === 'OFFSITE' && !finalOffsiteJob) {
      await UIHelpers.alert('กรุณาระบุลักษณะงาน', 'โปรดเลือกหรือกรอกลักษณะงานนอกสถานที่', 'warning');
      return;
    }

    if (isCustomShift) {
      const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (!timeRegex.test(checkInTime.trim()) || !timeRegex.test(checkOutTime.trim())) {
        await UIHelpers.alert('รูปแบบเวลาไม่ถูกต้อง', 'กรุณาระบุเวลาเข้าและเวลาออกเป็นรูปแบบ 24 ชม. เช่น 08:30', 'warning');
        return;
      }
    }

    let lat = currentCoords?.lat ?? null;
    let lng = currentCoords?.lng ?? null;
    let locName = currentLocationName || 'ขอลงเวลากรณีพิเศษ';

    if (locMode === 'ONSITE') {
      const off = officialLocations.find((l) => String(l.id) === String(officialLocId)) || officialLocations[0];
      if (off) {
        lat = Number(off.latitude);
        lng = Number(off.longitude);
        locName = off.name;
      }
    } else if (gpsSource === 'custom') {
      lat = Number(spCustomPlace.lat);
      lng = Number(spCustomPlace.lng);
      locName = spCustomPlace.name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }

    const gf = lat != null && lng != null ? evaluateOfficialGeofence(lat, lng, officialLocations) : null;

    setSubmitting(true);
    UIHelpers.showLoading('กำลังส่งคำขอลงเวลากรณีพิเศษ...');
    try {
      let photoUrl = '';
      if (attachPhotoDataUrl) {
        const uploaded = await UIHelpers.uploadPhotoToGoogleDrive(
          attachPhotoDataUrl,
          `${user?.full_name || user?.username || 'user'}_special_${workDate}`,
          settings
        );
        if (typeof uploaded === 'string' && uploaded.trim()) {
          photoUrl = uploaded.trim();
        }
      }

      const res = await AttendanceModel.submitSpecialRequest({
        personnel_id: user?.personnel_id,
        user_id: user?.id,
        work_date: workDate,
        shift_name: shiftName,
        check_in_time: isCustomShift ? checkInTime.trim() : (selectedShift?.check_in || '08:30'),
        check_out_time: isCustomShift ? checkOutTime.trim() : (selectedShift?.check_out || '16:30'),
        is_overtime: Boolean(selectedShift?.is_overtime),
        location_mode: locMode,
        check_out_location_mode: locMode,
        offsite_reason: locMode === 'OFFSITE' ? finalOffsiteJob : null,
        check_out_offsite_reason: locMode === 'OFFSITE' ? finalOffsiteJob : null,
        distance_from_official_meters: gf?.distanceMeters ?? null,
        check_out_distance_from_official_meters: gf?.distanceMeters ?? null,
        lat,
        lng,
        location_name: locName,
        photo_url: photoUrl,
        remark: finalRemark,
      });

      UIHelpers.hideLoading();
      if (res?.success) {
        UIHelpers.showToast(res.message || 'ส่งคำขอลงเวลากรณีพิเศษเรียบร้อยแล้ว', 'success');
        onSubmitted?.();
        onClose();
      } else {
        await UIHelpers.alert('ส่งคำขอไม่สำเร็จ', res?.message || 'เกิดข้อผิดพลาด', 'error');
      }
    } catch (err) {
      UIHelpers.hideLoading();
      await UIHelpers.alert('เกิดข้อผิดพลาด', err?.message || 'ไม่สามารถส่งคำขอได้', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      title="ยื่นคำขอลงเวลากรณีพิเศษ"
      subtitle="กรอกรายละเอียดให้ครบถ้วนเพื่อส่งให้ผู้ดูแลระบบอนุมัติ"
      icon="fa-file-signature"
      maxWidthClass="max-w-lg"
      footer={
        <>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-semibold">ยกเลิก</button>
          <button type="submit" form="formSpecialRequest" disabled={submitting} className="px-5 py-2 rounded-xl bg-[#00744B] hover:bg-[#005a3a] text-white text-sm font-extrabold shadow-sm disabled:opacity-50">
            {submitting ? 'กำลังส่งคำขอ...' : 'ส่งคำขออนุมัติ'}
          </button>
        </>
      }
    >
      <form id="formSpecialRequest" onSubmit={handleSubmit} className="space-y-3.5 text-sm">
        {/* Info Banner */}
        <div className="p-3 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200">
          <i className="fa-solid fa-circle-info mr-1.5 text-[#00744B]" />
          คำขอจะเข้าสู่สถานะ <strong>รออนุมัติ</strong> และบันทึกเข้าสู่รายงานอัตโนมัติเมื่อผู้ดูแลหน่วยงานอนุมัติแล้ว
        </div>

        {/* Step 1: Date & Shift */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold mb-1">1. วันที่ปฏิบัติราชการ *</label>
            <input type="date" required value={workDate} onChange={(e) => setWorkDate(e.target.value)} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs" />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1">กะปฏิบัติงาน *</label>
            <select value={shiftName} onChange={(e) => handleShiftChange(e.target.value)} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs">
              {shifts.map((s) => <option key={s.name} value={s.name}>{SettingsModel.formatShiftDisplayText(s)}</option>)}
            </select>
          </div>
        </div>

        {/* Custom time inputs shown ONLY when selected shift has is_custom === true */}
        {isCustomShift ? (
          <div className="grid grid-cols-2 gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
            <div>
              <label className="block text-xs font-bold mb-1">เวลาเข้า (24 ชม.) *</label>
              <input type="text" inputMode="numeric" maxLength={5} required placeholder="08:30" value={checkInTime} onChange={(e) => setCheckInTime(e.target.value)} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono text-center text-xs" />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">เวลาออก (24 ชม.) *</label>
              <input type="text" inputMode="numeric" maxLength={5} required placeholder="16:30" value={checkOutTime} onChange={(e) => setCheckOutTime(e.target.value)} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono text-center text-xs" />
            </div>
          </div>
        ) : (
          <div className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 flex items-center justify-between">
            <span>ช่วงเวลากะที่เลือก:</span>
            <span className="font-mono font-bold text-[#00744B] dark:text-[#00C08A]">{checkInTime} – {checkOutTime} น.</span>
          </div>
        )}

        {/* Step 2: Special Request Reason */}
        <div>
          <label className="block text-xs font-bold mb-1">2. เหตุผลลงเวลากรณีพิเศษ *</label>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs">
            {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {reason === 'อื่นๆ' && (
            <input
              type="text"
              required
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="ระบุเหตุผลเพิ่มเติม..."
              className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
            />
          )}
        </div>

        {/* Step 3: Location Mode ONSITE vs OFFSITE */}
        <div>
          <label className="block text-xs font-bold mb-1.5">3. รูปแบบสถานที่ปฏิบัติงาน</label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setLocMode('ONSITE')} className={`py-2 rounded-xl text-xs font-bold border ${locMode === 'ONSITE' ? 'bg-[#00744B] text-white border-[#00744B]' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
              <i className="fa-solid fa-building mr-1" />ในสถานที่ราชการ
            </button>
            <button type="button" onClick={() => setLocMode('OFFSITE')} className={`py-2 rounded-xl text-xs font-bold border ${locMode === 'OFFSITE' ? 'bg-sky-600 text-white border-sky-600' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
              <i className="fa-solid fa-map-pin mr-1" />นอกสถานที่
            </button>
          </div>
        </div>

        {locMode === 'ONSITE' ? (
          <div>
            <label className="block text-xs font-bold mb-1">4. สถานที่ราชการทางการ</label>
            <select value={officialLocId} onChange={(e) => setOfficialLocId(e.target.value)} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs">
              {officialLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        ) : (
          <div className="space-y-2.5 p-3 rounded-xl bg-sky-50/60 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800">
            <div>
              <label className="block text-xs font-bold mb-1">ลักษณะงานนอกสถานที่ *</label>
              <select value={offsiteJobType} onChange={(e) => setOffsiteJobType(e.target.value)} className="w-full rounded-xl border border-sky-200 dark:border-sky-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs">
                {offsiteJobTypes.map((jt) => <option key={jt} value={jt}>{jt}</option>)}
              </select>
              {offsiteJobType === 'อื่นๆ' && (
                <input
                  type="text"
                  required
                  value={customOffsiteJob}
                  onChange={(e) => setCustomOffsiteJob(e.target.value)}
                  placeholder="ระบุลักษณะงานนอกสถานที่..."
                  className="mt-2 w-full rounded-xl border border-sky-200 dark:border-sky-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
                />
              )}
            </div>

            {/* Step 4: Embedded #spCurrentGpsBox + #spCustomGpsBox (#spLeafletMap draggable) */}
            <div className="space-y-2 text-xs">
              <label className="block font-bold">4. แหล่งพิกัดสถานที่นอกสถานที่</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setGpsSource('current')}
                  className={`py-1.5 px-2.5 rounded-xl border font-bold text-xs ${gpsSource === 'current' ? 'bg-[#00744B] text-white border-[#00744B]' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700'}`}
                >
                  <i className="fa-solid fa-crosshairs mr-1" />GPS ปัจจุบัน
                </button>
                <button
                  type="button"
                  onClick={() => setGpsSource('custom')}
                  className={`py-1.5 px-2.5 rounded-xl border font-bold text-xs ${gpsSource === 'custom' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700'}`}
                >
                  <i className="fa-solid fa-map-location-dot mr-1" />ปักหมุด/ค้นหาเอง
                </button>
              </div>

              {gpsSource === 'current' ? (
                <div id="spCurrentGpsBox" className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs">
                  <p className="font-bold text-[#00744B] dark:text-emerald-400 truncate">
                    <i className="fa-solid fa-location-dot mr-1" />
                    {currentLocationName || 'ใช้พิกัด GPS ปัจจุบัน'}
                  </p>
                  {currentCoords && (
                    <p className="font-mono text-[10px] text-slate-400 mt-0.5">
                      {currentCoords.lat.toFixed(6)}, {currentCoords.lng.toFixed(6)}
                    </p>
                  )}
                </div>
              ) : (
                <div id="spCustomGpsBox" className="space-y-2">
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={spSearchQuery}
                      onChange={(e) => setSpSearchQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSpSearch(); } }}
                      placeholder="ค้นหาชื่อสถานที่..."
                      className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs"
                    />
                    <button type="button" onClick={handleSpSearch} disabled={spSearching} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold">
                      {spSearching ? <i className="fa-solid fa-circle-notch fa-spin" /> : 'ค้นหา'}
                    </button>
                  </div>
                  {spSearchResults.length > 0 && (
                    <div className="max-h-32 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {spSearchResults.map((r, i) => (
                        <button key={i} type="button" onClick={() => handlePickSpResult(r)} className="w-full text-left px-2.5 py-1.5 hover:bg-indigo-50 dark:hover:bg-slate-800">
                          <p className="font-bold truncate">{r.mainName || r.name}</p>
                          {r.subAddr && <p className="text-[10px] text-slate-400 truncate">{r.subAddr}</p>}
                        </button>
                      ))}
                    </div>
                  )}
                  <div id="spLeafletMap" ref={spMapElRef} className="w-full h-44 rounded-xl border border-slate-300 dark:border-slate-700 overflow-hidden" />
                  <p className="text-[11px] font-semibold text-indigo-800 dark:text-indigo-200 truncate">
                    <i className="fa-solid fa-map-pin mr-1" />
                    {spCustomPlace.name || `${Number(spCustomPlace.lat).toFixed(6)}, ${Number(spCustomPlace.lng).toFixed(6)}`}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 5: Optional Photo Attachment */}
        <div>
          <label className="block text-xs font-bold mb-1">5. แนบภาพถ่ายยืนยัน (ถ้ามี)</label>
          <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoPick} className="hidden" />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition"
            >
              <i className="fa-solid fa-paperclip mr-1.5 text-[#00744B]" />
              {attachPhotoDataUrl ? 'เปลี่ยนรูปแนบ' : 'เลือกรูปภาพแนบ'}
            </button>
            {attachPhotoDataUrl && (
              <>
                <img src={attachPhotoDataUrl} alt="แนบภาพ" className="w-10 h-10 rounded-lg object-cover border border-slate-200" />
                <button type="button" onClick={() => setAttachPhotoDataUrl('')} className="text-xs text-rose-600 font-bold hover:underline">
                  ลบออก
                </button>
              </>
            )}
          </div>
        </div>
      </form>
    </ResponsiveModal>
  );
}
