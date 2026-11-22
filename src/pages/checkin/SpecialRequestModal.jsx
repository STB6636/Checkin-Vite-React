import React, { useState } from 'react';
import { ResponsiveModal } from '../../components/common/ResponsiveModal.jsx';
import { AttendanceModel } from '../../models/AttendanceModel.js';
import { UIHelpers } from '../../core/UIHelpers.js';

/**
 * SpecialRequestModal — 100% Parity with legacy checkin.html (L809-980)
 * - Info Banner explaining approval workflow
 * - Original step order (1: วันที่ & กะ/เวลา, 2: เหตุผลกรณีพิเศษ, 3: โหมดสถานที่ ONSITE/OFFSITE + custom offsite input, 4: แหล่งพิกัด GPS/Map)
 * - Emerald #00744B Submit button
 */
export function SpecialRequestModal({ open, onClose, user, settings, currentCoords, currentLocationName, onOpenMapPicker, customPickedPlace, onSubmitted }) {
  const shifts = (settings?.work_shifts || []).filter((s) =>
    !(settings?.disable_normal_hours_checkin && s.name === 'เวลาราชการปกติ')
  );
  const officialLocations = (settings?.official_locations || []).filter((l) => l.is_active !== false);
  const offsiteJobTypes = settings?.offsite_job_types || ['ปฏิบัติงานนอกสถานที่', 'อบรม/สัมมนา/ประชุมราชการ', 'ปฏิบัติงานที่บ้าน (WFH)', 'อื่นๆ'];
  const reasons = settings?.special_request_reasons || ['ลืมลงเวลาปฏิบัติราชการ', 'โทรศัพท์/อุปกรณ์ขัดข้อง', 'ระบบอินเทอร์เน็ตขัดข้อง', 'ปฏิบัติงานภารกิจเร่งด่วน', 'อื่นๆ'];

  const [workDate, setWorkDate] = useState(UIHelpers.getTodayISO());
  const [shiftName, setShiftName] = useState(shifts[0]?.name || 'เวลาราชการปกติ');
  const [checkInTime, setCheckInTime] = useState(shifts[0]?.check_in || '08:30');
  const [checkOutTime, setCheckOutTime] = useState(shifts[0]?.check_out || '16:30');
  const [reason, setReason] = useState(reasons[0] || '');
  const [customReason, setCustomReason] = useState('');
  const [locMode, setLocMode] = useState('ONSITE');
  const [officialLocId, setOfficialLocId] = useState(officialLocations[0]?.id || '');
  const [offsiteJobType, setOffsiteJobType] = useState(offsiteJobTypes[0] || '');
  const [customOffsiteJob, setCustomOffsiteJob] = useState('');
  const [gpsSource, setGpsSource] = useState('current'); // 'current' | 'custom'
  const [submitting, setSubmitting] = useState(false);

  const handleShiftChange = (name) => {
    setShiftName(name);
    const sh = shifts.find((s) => s.name === name);
    if (sh) {
      setCheckInTime(sh.check_in || '08:30');
      setCheckOutTime(sh.check_out || '16:30');
    }
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

    const selectedShift = shifts.find((s) => s.name === shiftName);
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
    } else if (gpsSource === 'custom' && customPickedPlace) {
      lat = Number(customPickedPlace.lat);
      lng = Number(customPickedPlace.lng);
      locName = customPickedPlace.name || locName;
    }

    setSubmitting(true);
    try {
      const res = await AttendanceModel.submitSpecialRequest({
        personnel_id: user?.personnel_id,
        user_id: user?.id,
        work_date: workDate,
        shift_name: shiftName,
        check_in_time: checkInTime,
        check_out_time: checkOutTime,
        is_overtime: Boolean(selectedShift?.is_overtime),
        location_mode: locMode,
        offsite_reason: locMode === 'OFFSITE' ? finalOffsiteJob : null,
        lat,
        lng,
        location_name: locName,
        remark: finalRemark,
      });

      if (res?.success) {
        UIHelpers.showToast(res.message || 'ส่งคำขอลงเวลากรณีพิเศษเรียบร้อยแล้ว', 'success');
        onSubmitted?.();
        onClose();
      } else {
        await UIHelpers.alert('ส่งคำขอไม่สำเร็จ', res?.message || 'เกิดข้อผิดพลาด', 'error');
      }
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

        {/* Step 1: Date, Shift, Time */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold mb-1">1. วันที่ปฏิบัติราชการ *</label>
            <input type="date" required value={workDate} onChange={(e) => setWorkDate(e.target.value)} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs" />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1">กะปฏิบัติงาน *</label>
            <select value={shiftName} onChange={(e) => handleShiftChange(e.target.value)} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs">
              {shifts.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold mb-1">เวลาเข้า *</label>
            <input type="time" required value={checkInTime} onChange={(e) => setCheckInTime(e.target.value)} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-mono text-xs" />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1">เวลาออก *</label>
            <input type="time" required value={checkOutTime} onChange={(e) => setCheckOutTime(e.target.value)} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-mono text-xs" />
          </div>
        </div>

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
            <button type="button" onClick={() => setLocMode('OFFSITE')} className={`py-2 rounded-xl text-xs font-bold border ${locMode === 'OFFSITE' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
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
          <div className="space-y-2.5 p-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800">
            <div>
              <label className="block text-xs font-bold mb-1">ลักษณะงานนอกสถานที่ *</label>
              <select value={offsiteJobType} onChange={(e) => setOffsiteJobType(e.target.value)} className="w-full rounded-xl border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs">
                {offsiteJobTypes.map((jt) => <option key={jt} value={jt}>{jt}</option>)}
              </select>
              {offsiteJobType === 'อื่นๆ' && (
                <input
                  type="text"
                  required
                  value={customOffsiteJob}
                  onChange={(e) => setCustomOffsiteJob(e.target.value)}
                  placeholder="ระบุลักษณะงานนอกสถานที่..."
                  className="mt-2 w-full rounded-xl border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
                />
              )}
            </div>

            {/* Step 4: Inline Radio GPS Source */}
            <div className="space-y-1.5 text-xs">
              <label className="block font-bold">4. แหล่งพิกัดสถานที่นอกสถานที่</label>
              <div className="flex flex-wrap gap-3">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="srGpsSrc" checked={gpsSource === 'current'} onChange={() => setGpsSource('current')} />
                  <span>ใช้พิกัด GPS ปัจจุบัน</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="srGpsSrc" checked={gpsSource === 'custom'} onChange={() => setGpsSource('custom')} />
                  <span>ปักหมุด/ค้นหาพิกัดเอง</span>
                </label>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="truncate text-slate-600 dark:text-slate-300">
                  <i className="fa-solid fa-location-dot text-indigo-600 mr-1" />
                  {gpsSource === 'custom' && customPickedPlace?.name ? customPickedPlace.name : (currentLocationName || 'ใช้พิกัดปัจจุบัน')}
                </span>
                {gpsSource === 'custom' && (
                  <button type="button" onClick={onOpenMapPicker} className="shrink-0 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-indigo-300 text-indigo-700 dark:text-indigo-300 font-bold">
                    เปิดแผนที่ปักหมุด
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </form>
    </ResponsiveModal>
  );
}
