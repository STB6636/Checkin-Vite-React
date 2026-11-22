import React from 'react';
import { SettingsModel } from '../../models/SettingsModel.js';
import { UIHelpers } from '../../core/UIHelpers.js';

/**
 * ShiftSelectorCard — 100% Parity with checkin.html Card Order:
 * 1) Work Mode Card (ในสถานที่ / นอกสถานที่ + #onsiteGeofenceStatusCard + 2 buttons [GPS ปัจจุบัน] / [ค้นหาพิกัดเอง])
 * 2) Shift Selection Card (#checkinActionCard + tag "เงื่อนไขการบันทึกเวลา" + #mainCustomTimeContainer for custom shifts)
 */
export function ShiftSelectorCard({
  settings,
  availableShifts,
  selectedShiftName,
  onSelectShift,
  customShiftIn,
  customShiftOut,
  onCustomShiftInChange,
  onCustomShiftOutChange,
  activeCheckoutRecord,
  locationMode,
  onLocationModeChange,
  offsiteJobType,
  onOffsiteJobTypeChange,
  offsiteCustomRemark,
  onOffsiteCustomRemarkChange,
  onRefreshGps,
  onOpenOffsiteMap,
  geofence,
  normalHoursLocked,
  onStartCheckin,
  submitting,
}) {
  const isCheckout = Boolean(activeCheckoutRecord);
  const enforceGeofence = Boolean(settings?.enforce_geofence_radius);
  const selectedShiftObj = (settings?.work_shifts || []).find((s) => s.name === selectedShiftName);
  const isCustomShift = Boolean(selectedShiftObj?.is_custom);

  const offsiteJobTypes = settings?.offsite_job_types || [
    'ปฏิบัติงานนอกสถานที่',
    'อบรม/สัมมนา/ประชุมราชการ',
    'ปฏิบัติงานที่บ้าน (WFH)',
    'ปฏิบัติงานเวรประจำวัน',
    'อื่นๆ',
  ];

  const canSubmit = !submitting && !normalHoursLocked && (isCheckout || Boolean(selectedShiftName));

  return (
    <div className="space-y-3">
      {/* CARD 1 (ABOVE): Work Mode Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-3.5 sm:p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
            <i className="fa-solid fa-map-pin text-[#00744B] mr-1.5" />รูปแบบสถานที่ปฏิบัติงาน
          </span>
          <span className="text-[10px] font-bold text-slate-400">ขั้นตอนที่ 1</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onLocationModeChange('onsite')}
            className={`py-2.5 px-3 rounded-xl text-xs font-extrabold border flex items-center justify-center gap-1.5 transition ${
              locationMode === 'onsite'
                ? 'bg-[#00744B] text-white border-[#00744B] shadow-sm'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            <i className="fa-solid fa-building-flag" />
            <span>ในสถานที่ราชการ</span>
          </button>
          <button
            type="button"
            onClick={() => onLocationModeChange('offsite')}
            className={`py-2.5 px-3 rounded-xl text-xs font-extrabold border flex items-center justify-center gap-1.5 transition ${
              locationMode === 'offsite'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
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
            <span className="font-semibold">
              <i className={`fa-solid ${!enforceGeofence || geofence?.withinRadius ? 'fa-circle-check' : 'fa-triangle-exclamation'} mr-1.5`} />
              {geofence?.nearest
                ? `${geofence.nearest.name} (ห่าง ${geofence.distanceMeters ?? '-'} ม. / รัศมี ${geofence.radiusMeters ?? 150} ม.)`
                : 'ตรวจสอบพิกัดสถานที่ราชการ'}
            </span>
          </div>
        )}

        {/* Offsite Controls + 2 Location Source Buttons ([GPS ปัจจุบัน] / [ค้นหาพิกัดเอง]) */}
        {locationMode === 'offsite' && (
          <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/70 space-y-2.5">
            <div>
              <label className="block text-[11px] font-bold text-indigo-800 dark:text-indigo-200 mb-1">ลักษณะงานนอกสถานที่ *</label>
              <select
                value={offsiteJobType}
                onChange={(e) => onOffsiteJobTypeChange(e.target.value)}
                className="w-full rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold"
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
                className="w-full rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
              />
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onRefreshGps(true)}
                className="py-2 px-2.5 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold hover:bg-emerald-50 transition"
              >
                <i className="fa-solid fa-crosshairs mr-1" />GPS ปัจจุบัน
              </button>
              <button
                type="button"
                onClick={onOpenOffsiteMap}
                className="py-2 px-2.5 rounded-xl border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 text-xs font-bold hover:bg-indigo-50 transition"
              >
                <i className="fa-solid fa-map-location-dot mr-1" />ค้นหาพิกัดเอง
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CARD 2 (BELOW): Shift Selection Card (#checkinActionCard) */}
      <div id="checkinActionCard" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-3.5 sm:p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-[#00744B] dark:text-[#00C08A] text-[11px] font-extrabold border border-emerald-200 dark:border-emerald-800">
            <i className="fa-solid fa-clock" />เงื่อนไขการบันทึกเวลา
          </span>
          {isCheckout && (
            <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
              กะ: {activeCheckoutRecord.shift_name} (เข้า {UIHelpers.formatTime24(activeCheckoutRecord.check_in_time)})
            </span>
          )}
        </div>

        {normalHoursLocked && (
          <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 font-semibold">
            <i className="fa-solid fa-lock mr-1.5" />ปิดการลงเวลาหน้าหลักในเวลาราชการปกติ (08:30–16:30 น.)
          </div>
        )}

        {!isCheckout && (
          <div>
            <select
              value={selectedShiftName}
              onChange={(e) => onSelectShift(e.target.value)}
              disabled={availableShifts.length === 0 || normalHoursLocked}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm font-bold text-slate-800 dark:text-white disabled:opacity-50"
            >
              <option value="">
                {availableShifts.length === 0 ? '-- ไม่มีกะเวลาที่เปิดให้ลงเวลาในขณะนี้ --' : '-- กรุณาเลือกกะปฏิบัติงาน --'}
              </option>
              {availableShifts.map((sh) => (
                <option key={sh.name} value={sh.name}>
                  {SettingsModel.formatShiftDisplayText(sh)} {sh.is_overnight ? '(ข้ามวัน +1 วัน)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* #mainCustomTimeContainer when custom shift ("อื่นๆ") is selected */}
        {!isCheckout && isCustomShift && (
          <div id="mainCustomTimeContainer" className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
            <div>
              <label className="block text-[11px] font-bold mb-1">เวลาเข้ากำหนดเอง</label>
              <input type="time" value={customShiftIn} onChange={(e) => onCustomShiftInChange(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono text-xs" />
            </div>
            <div>
              <label className="block text-[11px] font-bold mb-1">เวลาออกกำหนดเอง</label>
              <input type="time" value={customShiftOut} onChange={(e) => onCustomShiftOutChange(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono text-xs" />
            </div>
          </div>
        )}

        {/* Desktop Submit Button (Mobile uses sticky bar below) */}
        <button
          type="button"
          disabled={!canSubmit}
          onClick={onStartCheckin}
          className={`hidden sm:flex w-full py-3.5 rounded-2xl text-white font-extrabold text-sm shadow-lg items-center justify-center gap-2 transition disabled:opacity-45 ${
            isCheckout
              ? 'bg-gradient-to-r from-rose-700 to-red-600 hover:brightness-105 shadow-rose-900/25'
              : 'bg-gradient-to-r from-[#00351B] via-[#00744B] to-[#00A368] hover:brightness-105 shadow-emerald-900/25'
          }`}
        >
          <i className={`fa-solid ${submitting ? 'fa-circle-notch fa-spin' : settings?.require_photo ? 'fa-camera' : 'fa-check-circle'}`} />
          <span>
            {submitting
              ? 'กำลังบันทึกข้อมูล...'
              : isCheckout
                ? 'บันทึกเวลาออกงาน'
                : 'บันทึกเวลาเข้าปฏิบัติราชการ'}
          </span>
        </button>
      </div>
    </div>
  );
}
