import React from 'react';
import { SettingsModel } from '../../models/SettingsModel.js';
import { UIHelpers } from '../../core/UIHelpers.js';

/**
 * ShiftSelectorCard — 100% Parity with checkin.html Card Order:
 * 1) Work Mode Card (ในสถานที่ / นอกสถานที่ [bg-sky-600] + #onsiteGeofenceStatusCard + [GPS ปัจจุบัน bg-[#00744B]] vs [ค้นหาพิกัดเอง bg-indigo-600])
 * 2) Shift Selection Card (#checkinActionCard — hidden in 1-click normal hours mode, keyed by originalIdx)
 * Note: Submit button lives in a single unified .bma-sticky-checkin-bar in CheckinPage.jsx
 */
export function ShiftSelectorCard({
  settings,
  availableShifts, // Array of { shift, originalIdx }
  selectedShiftIdx,
  onSelectShiftIdx,
  customShiftIn,
  customShiftOut,
  onCustomShiftInChange,
  onCustomShiftOutChange,
  activeCheckoutRecord,
  hideShiftCard = false,
  locationMode,
  onLocationModeChange,
  offsiteJobType,
  onOffsiteJobTypeChange,
  offsiteCustomRemark,
  onOffsiteCustomRemarkChange,
  offsiteGpsSource, // 'current' | 'custom'
  onOffsiteGpsSourceChange,
  offsiteCustomGps, // { lat, lng, name } | null
  onRefreshGps,
  onOpenOffsiteMap,
  geofence,
  normalHoursLocked,
  hasOvertimeAvailable = false,
}) {
  const isCheckout = Boolean(activeCheckoutRecord);
  const enforceGeofence = Boolean(settings?.enforce_geofence_radius);
  const selectedEntry = (availableShifts || []).find((e) => String(e.originalIdx) === String(selectedShiftIdx));
  const selectedShiftObj = selectedEntry?.shift || null;
  const isCustomShift = Boolean(selectedShiftObj?.is_custom);

  const offsiteJobTypes = settings?.offsite_job_types || [
    'ปฏิบัติงานนอกสถานที่',
    'อบรม/สัมมนา/ประชุมราชการ',
    'ปฏิบัติงานที่บ้าน (WFH)',
    'ปฏิบัติงานเวรประจำวัน',
    'อื่นๆ',
  ];

  return (
    <div className="space-y-2.5">
      {/* CARD 1: Work Mode Card (ในสถานที่ / นอกสถานที่) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-3 sm:p-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
            <i className="fa-solid fa-map-pin text-[#00744B] mr-1.5" />รูปแบบการปฏิบัติงาน
          </span>
          <span className="text-[10px] font-bold text-slate-400">
            {locationMode === 'onsite' ? 'ในสถานที่ราชการ' : 'นอกสถานที่'}
          </span>
        </div>

        {/* Segmented Control */}
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => onLocationModeChange('onsite')}
            className={`py-2 px-3 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              locationMode === 'onsite'
                ? 'bg-[#00744B] text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700/60'
            }`}
          >
            <i className="fa-solid fa-building-flag" />
            <span>ในสถานที่</span>
          </button>
          <button
            type="button"
            onClick={() => onLocationModeChange('offsite')}
            className={`py-2 px-3 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              locationMode === 'offsite'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700/60'
            }`}
          >
            <i className="fa-solid fa-route" />
            <span>นอกสถานที่</span>
          </button>
        </div>

        {/* #onsiteGeofenceStatusCard */}
        {locationMode === 'onsite' && (
          <div
            id="onsiteGeofenceStatusCard"
            className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
              !enforceGeofence || geofence?.withinRadius
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
            }`}
          >
            <span className="font-semibold leading-snug">
              <i className={`fa-solid ${!enforceGeofence || geofence?.withinRadius ? 'fa-circle-check' : 'fa-triangle-exclamation'} mr-1.5`} />
              {geofence?.nearest
                ? `${geofence.nearest.name} (ห่าง ${geofence.distanceMeters ?? '-'} ม. / รัศมี ${geofence.radiusMeters ?? 150} ม.${geofence.withinRadius ? ' • อยู่ในพื้นที่' : enforceGeofence ? ' • นอกรัศมี' : ''})`
                : 'กำลังตรวจสอบพิกัดสถานที่ราชการ...'}
            </span>
          </div>
        )}

        {/* Offsite Controls: Job Type + [GPS ปัจจุบัน bg-[#00744B]] vs [ค้นหาพิกัดเอง bg-indigo-600] */}
        {locationMode === 'offsite' && (
          <div className="p-2.5 rounded-xl bg-sky-50/70 dark:bg-sky-950/25 border border-sky-200 dark:border-sky-800/60 space-y-2.5">
            <div>
              <label className="block text-[11px] font-bold text-sky-900 dark:text-sky-200 mb-1">ลักษณะงานนอกสถานที่ *</label>
              <select
                value={offsiteJobType}
                onChange={(e) => onOffsiteJobTypeChange(e.target.value)}
                className="w-full rounded-xl border border-sky-200 dark:border-sky-800 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold"
              >
                <option value="">-- เลือกลักษณะงานนอกสถานที่ --</option>
                {offsiteJobTypes.map((jt) => <option key={jt} value={jt}>{jt}</option>)}
              </select>
            </div>
            {offsiteJobType === 'อื่นๆ' && (
              <input
                type="text"
                value={offsiteCustomRemark}
                onChange={(e) => onOffsiteCustomRemarkChange(e.target.value)}
                placeholder="ระบุลักษณะงานนอกสถานที่เพิ่มเติม..."
                className="w-full rounded-xl border border-sky-200 dark:border-sky-800 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
              />
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  onOffsiteGpsSourceChange('current');
                  onRefreshGps(true);
                }}
                className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                  offsiteGpsSource === 'current'
                    ? 'bg-[#00744B] text-white border-[#00744B] shadow-sm'
                    : 'border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-800 text-[#00744B] dark:text-emerald-300 hover:bg-emerald-50'
                }`}
              >
                <i className="fa-solid fa-crosshairs mr-1" />GPS ปัจจุบัน
              </button>
              <button
                type="button"
                onClick={() => {
                  onOffsiteGpsSourceChange('custom');
                  onOpenOffsiteMap();
                }}
                className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                  offsiteGpsSource === 'custom'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50'
                }`}
              >
                <i className="fa-solid fa-map-location-dot mr-1" />ค้นหาพิกัดเอง
              </button>
            </div>
            {offsiteGpsSource === 'custom' && offsiteCustomGps && (
              <div className="px-2.5 py-1.5 rounded-lg bg-indigo-100/80 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-[11px] text-indigo-900 dark:text-indigo-200 flex items-center justify-between gap-2">
                <span className="truncate font-semibold">
                  <i className="fa-solid fa-map-pin mr-1 text-indigo-600" />
                  {offsiteCustomGps.name || `${Number(offsiteCustomGps.lat).toFixed(5)}, ${Number(offsiteCustomGps.lng).toFixed(5)}`}
                </span>
                <button type="button" onClick={onOpenOffsiteMap} className="shrink-0 font-bold underline text-indigo-700 dark:text-indigo-300">
                  เปลี่ยน
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CARD 2: Shift Selection Card (#checkinActionCard — hidden in 1-click normal hours mode) */}
      {!hideShiftCard && (
        <div id="checkinActionCard" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-3 sm:p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-[#00744B] dark:text-[#00C08A] text-[11px] font-extrabold border border-emerald-200 dark:border-emerald-800">
              <i className="fa-solid fa-clock" />เงื่อนไขการบันทึกเวลา
            </span>
            {isCheckout && (
              <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 truncate">
                กะ: {activeCheckoutRecord.shift_name} (เข้า {UIHelpers.formatTime24(activeCheckoutRecord.check_in_time)})
              </span>
            )}
          </div>

          {normalHoursLocked && !hasOvertimeAvailable && (
            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 font-semibold">
              <i className="fa-solid fa-lock mr-1.5" />ปิดการลงเวลาเวลาราชการปกติ (08:30–16:30 น.)
            </div>
          )}

          {normalHoursLocked && hasOvertimeAvailable && !isCheckout && (
            <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-[11px] text-sky-800 dark:text-sky-200 font-semibold">
              <i className="fa-solid fa-circle-info mr-1" />เวลาราชการปกติปิดอยู่ — สามารถเลือกลงเวลากะนอกเวลา (OT) ด้านล่างได้
            </div>
          )}

          {!isCheckout && (
            <div>
              <select
                value={selectedShiftIdx}
                onChange={(e) => onSelectShiftIdx(e.target.value)}
                disabled={availableShifts.length === 0}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm font-bold text-slate-800 dark:text-white disabled:opacity-50"
              >
                <option value="">
                  {availableShifts.length === 0 ? '-- ไม่มีกะเวลาที่เปิดให้ลงเวลาในขณะนี้ --' : '-- กรุณาเลือกกะปฏิบัติงาน --'}
                </option>
                {availableShifts.map(({ shift: sh, originalIdx }) => (
                  <option key={originalIdx} value={String(originalIdx)}>
                    {SettingsModel.formatShiftDisplayText(sh)} {sh.is_overnight ? '(ข้ามวัน +1 วัน)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* #mainCustomTimeContainer when custom shift ("อื่นๆ") is selected */}
          {!isCheckout && isCustomShift && (
            <div id="mainCustomTimeContainer" className="grid grid-cols-2 gap-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
              <div>
                <label className="block text-[11px] font-bold mb-1">เวลาเข้ากำหนดเอง (24 ชม.)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="08:30"
                  value={customShiftIn}
                  onChange={(e) => onCustomShiftInChange(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono text-center text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold mb-1">เวลาออกกำหนดเอง (24 ชม.)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="16:30"
                  value={customShiftOut}
                  onChange={(e) => onCustomShiftOutChange(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono text-center text-xs"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
