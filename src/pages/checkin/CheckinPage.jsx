import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useSettings } from '../../contexts/SettingsContext.jsx';
import { useTheme } from '../../contexts/ThemeContext.jsx';
import { useGeolocation5Tier, evaluateOfficialGeofence } from '../../hooks/useGeolocation5Tier.js';
import { useAdminRealtimeSync } from '../../hooks/useAdminRealtimeSync.js';
import { useSystemUpdateCheck } from '../../hooks/useSystemUpdateCheck.js';
import { AttendanceModel } from '../../models/AttendanceModel.js';
import { UIHelpers } from '../../core/UIHelpers.js';

import { ShiftSelectorCard } from './ShiftSelectorCard.jsx';
import { EmbeddedMapCard } from './EmbeddedMapCard.jsx';
import { FullscreenCameraModal } from './FullscreenCameraModal.jsx';
import { OffsiteMapSearchModal } from './OffsiteMapSearchModal.jsx';
import { SpecialRequestModal } from './SpecialRequestModal.jsx';
import { MobileHistoryDrawer } from './MobileHistoryDrawer.jsx';
import { ViewGpsMapModal } from './ViewGpsMapModal.jsx';
import { SystemUpdateModal } from '../../components/layout/SystemUpdateModal.jsx';
import { PaginationBar } from '../../components/common/PaginationBar.jsx';

/**
 * Isolated 1-second Live Clock component so CheckinPage never re-renders every second.
 */
const LiveClockDisplay = memo(function LiveClockDisplay() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return (
    <p id="liveClockDisplay" className="font-mono font-extrabold text-2xl sm:text-3xl leading-none tracking-tight">
      {hh}:{mm}<span className="text-sm sm:text-base opacity-80">:{ss}</span> <span className="text-xs sm:text-sm font-sans font-bold">น.</span>
    </p>
  );
});

/**
 * Native React CheckinPage — 100% Legacy Parity + All P0 Bug Fixes
 * - Viewport-Lock on desktop: lg:h-[100dvh] lg:max-h-[100dvh] lg:overflow-hidden flex flex-col
 * - 5-Case State Machine + 4-State Unified Status Banner (Green / Red / Yellow / Gray)
 * - Cockpit 3:4 Side-by-Side (#photoPreviewCard dark full-bleed + #gpsSectionCard Option A)
 * - Work Mode Card + Shift Selection Card (keyed by originalIdx, hidden in 1-click normal hours)
 * - Single .bma-sticky-checkin-bar submit button (locks during GPS place lookup)
 * - Stop Auto-Submit after photo capture + SweetAlert2 confirm/loading/alert
 * - Desktop 3 Tables (7/7/6 cols with ลำดับ, limit=35, past-only pagination) & Mobile 3-View Drawer
 */
export default function CheckinPage() {
  const { user, isAdmin, logout } = useAuth();
  const { settings } = useSettings();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const {
    coords,
    locationName,
    geofence,
    loading: gpsLoading,
    resolvingPlace,
    error: gpsError,
    locate,
  } = useGeolocation5Tier(settings);
  const { versionInfo, showUpdateModal, dismissModal } = useSystemUpdateCheck(settings);

  const [desktopTab, setDesktopTab] = useState('checkin'); // 'checkin' | 'history' | 'special' | 'correction'
  const [historyScope, setHistoryScope] = useState('today'); // 'today' | 'past'
  const [histPage, setHistPage] = useState(1);
  const [histPageSize, setHistPageSize] = useState(10);

  // Minute-level clock tick (every 30s) for shift window recalculation without 1s full-page re-render
  const [minuteTick, setMinuteTick] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

  const [historyLogs, setHistoryLogs] = useState([]);
  const [specialRequests, setSpecialRequests] = useState([]);
  const [correctionLogs, setCorrectionLogs] = useState([]);
  const [activeCheckoutRecord, setActiveCheckoutRecord] = useState(null);

  const [selectedShiftIdx, setSelectedShiftIdx] = useState('');
  const [customShiftIn, setCustomShiftIn] = useState('08:30');
  const [customShiftOut, setCustomShiftOut] = useState('16:30');
  const [locationMode, setLocationMode] = useState('onsite'); // 'onsite' | 'offsite'
  const [offsiteJobType, setOffsiteJobType] = useState('');
  const [offsiteCustomRemark, setOffsiteCustomRemark] = useState('');
  const [offsiteGpsSource, setOffsiteGpsSource] = useState('current'); // 'current' | 'custom'
  const [offsiteCustomGps, setOffsiteCustomGps] = useState(null); // { lat, lng, name }
  const [previewPhoto, setPreviewPhoto] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Modals & Drawers
  const [cameraOpen, setCameraOpen] = useState(false);
  const [offsiteMapOpen, setOffsiteMapOpen] = useState(false);
  const [viewGpsOpen, setViewGpsOpen] = useState(false);
  const [specialModalOpen, setSpecialModalOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  useEffect(() => {
    UIHelpers.maskUrlToRoot('checkin.html');
  }, []);

  useEffect(() => {
    try {
      const welcome = sessionStorage.getItem('bma_checkin_welcome_toast_v2_7');
      if (welcome) {
        sessionStorage.removeItem('bma_checkin_welcome_toast_v2_7');
        UIHelpers.showToast(`ยินดีต้อนรับ ${welcome}`, 'success', 2600);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const d = new Date();
      setMinuteTick(d.getHours() * 60 + d.getMinutes());
    }, 30000);
    return () => window.clearInterval(id);
  }, []);

  const loadPersonalData = useCallback(async () => {
    if (!user) return;
    try {
      const [hist, specials, activeCheckout, tcLogs] = await Promise.all([
        AttendanceModel.getPersonalAttendanceHistory(user.personnel_id, user.id, 35),
        AttendanceModel.getPersonalSpecialRequests(user.personnel_id, user.id),
        AttendanceModel.getActiveRegularRecordForCheckout(user.personnel_id, user.id, settings),
        AttendanceModel.getPersonalTimeCorrectionLogs(user.personnel_id, user.id, settings).catch(() => []),
      ]);
      setHistoryLogs(Array.isArray(hist) ? hist : []);
      setSpecialRequests(Array.isArray(specials) ? specials : []);
      setActiveCheckoutRecord(activeCheckout || null);
      setCorrectionLogs(Array.isArray(tcLogs) ? tcLogs : []);
    } catch (err) {
      console.warn('[CheckinPage] loadPersonalData error:', err);
    }
  }, [user, settings]);

  useEffect(() => {
    loadPersonalData();
  }, [loadPersonalData]);

  useEffect(() => {
    locate(true);
  }, [locate]);

  useAdminRealtimeSync({
    enabled: Boolean(user),
    onSync: () => loadPersonalData(),
    pollIntervalMs: 15000,
    settingsHotReloadMs: 5000,
  });

  // 5-Case State Machine (CheckinController.js:379-570)
  const {
    availableShifts,
    normalHoursLocked,
    isRegularCompletedToday,
    hasOvertimeAvailable,
    hideShiftCard,
    defaultRegularShiftIdx,
  } = useMemo(() => {
    const nowMin = minuteTick;
    const todayIso = UIHelpers.getTodayISO();
    const todayRecords = (historyLogs || []).filter(
      (l) => l.work_date === todayIso && l.approval_status !== 'rejected'
    );

    const regularCompleted = todayRecords.some(
      (l) => !l.is_overtime && l.status !== 'ปฏิบัติงานนอกเวลา' && l.check_in_time && l.check_out_time
    );

    const recordedShiftNamesToday = new Set(
      todayRecords
        .filter((l) => l.check_in_time && l.check_out_time)
        .map((l) => l.shift_name)
    );

    const disableNormal = Boolean(settings?.disable_normal_hours_checkin);
    const allowStartMin = UIHelpers.timeToMinutes(settings?.allow_checkin_start_time || '06:00');
    const stdOutMin = UIHelpers.timeToMinutes(settings?.standard_check_out || '16:30');
    const isNormalLockedNow = disableNormal && nowMin < stdOutMin;

    const earlyWindow = Math.max(0, Number(settings?.early_shift_window_minutes ?? 30));
    const filterRealtime = settings?.filter_shifts_by_realtime !== false;

    const allShifts = Array.isArray(settings?.work_shifts) ? settings.work_shifts : [];
    const list = [];
    let regIdx = '';

    allShifts.forEach((sh, originalIdx) => {
      if (!sh) return;
      const isOt = Boolean(sh.is_overtime);
      const isRegularShift = !isOt && !sh.is_custom;

      // Skip already completed shift today
      if (recordedShiftNamesToday.has(sh.name)) return;
      // If regular work completed today, hide non-OT regular shifts
      if (regularCompleted && isRegularShift) return;
      // If normal hours check-in disabled, hide ONLY normal shifts (OT remains unlocked!)
      if (isNormalLockedNow && !isOt) return;

      if (filterRealtime && !sh.is_custom) {
        const rawStartMin = UIHelpers.timeToMinutes(sh.check_in || '08:30');
        const endMin = UIHelpers.timeToMinutes(sh.check_out || '16:30');
        if (rawStartMin >= 0 && endMin >= 0) {
          let shiftStartMin;
          if (sh.allow_early_checkin) {
            shiftStartMin = rawStartMin - earlyWindow;
          } else {
            shiftStartMin = isOt ? rawStartMin : Math.min(rawStartMin, allowStartMin);
          }
          const isOvernight = Boolean(sh.is_overnight || endMin < rawStartMin);
          let inWindow;
          if (shiftStartMin < 0) {
            const normalizedShiftStart = shiftStartMin + 1440;
            inWindow = (nowMin >= normalizedShiftStart) || (nowMin <= endMin);
          } else if (isOvernight) {
            inWindow = (nowMin >= shiftStartMin) || (nowMin <= endMin);
          } else {
            inWindow = nowMin >= shiftStartMin && nowMin <= endMin;
          }
          if (!inWindow) return;
        }
      }

      if (isRegularShift && regIdx === '') {
        regIdx = String(originalIdx);
      }
      list.push({ shift: sh, originalIdx });
    });

    const otAvail = list.some((e) => Boolean(e.shift.is_overtime));
    const singleClickHide = Boolean(
      settings?.single_click_checkin &&
      !activeCheckoutRecord &&
      !regularCompleted &&
      !isNormalLockedNow &&
      regIdx !== ''
    );

    return {
      availableShifts: list,
      normalHoursLocked: isNormalLockedNow,
      isRegularCompletedToday: regularCompleted,
      hasOvertimeAvailable: otAvail,
      hideShiftCard: singleClickHide,
      defaultRegularShiftIdx: regIdx,
    };
  }, [minuteTick, historyLogs, settings, activeCheckoutRecord]);

  // Auto-select default regular shift in 1-click normal hours mode, or clear invalid selection
  useEffect(() => {
    if (hideShiftCard && defaultRegularShiftIdx !== '') {
      setSelectedShiftIdx(defaultRegularShiftIdx);
      return;
    }
    if (selectedShiftIdx !== '' && !availableShifts.some((e) => String(e.originalIdx) === String(selectedShiftIdx))) {
      setSelectedShiftIdx('');
    }
  }, [hideShiftCard, defaultRegularShiftIdx, availableShifts, selectedShiftIdx]);

  const selectedShiftEntry = useMemo(
    () => availableShifts.find((e) => String(e.originalIdx) === String(selectedShiftIdx)) || null,
    [availableShifts, selectedShiftIdx]
  );

  // Active coordinates & location name depending on onsite vs offsite custom pin
  const activeCoords = useMemo(() => {
    if (locationMode === 'offsite' && offsiteGpsSource === 'custom' && offsiteCustomGps) {
      return { lat: Number(offsiteCustomGps.lat), lng: Number(offsiteCustomGps.lng), accuracy: 10 };
    }
    return coords;
  }, [locationMode, offsiteGpsSource, offsiteCustomGps, coords]);

  const activeLocationName = useMemo(() => {
    if (locationMode === 'offsite' && offsiteGpsSource === 'custom' && offsiteCustomGps) {
      return offsiteCustomGps.name || `${Number(offsiteCustomGps.lat).toFixed(6)}, ${Number(offsiteCustomGps.lng).toFixed(6)}`;
    }
    return locationName;
  }, [locationMode, offsiteGpsSource, offsiteCustomGps, locationName]);

  const executeCheckinSubmission = async (photoDataUrl = '') => {
    if (submitting) return;
    const isCheckout = Boolean(activeCheckoutRecord);
    const allShifts = Array.isArray(settings?.work_shifts) ? settings.work_shifts : [];
    const selectedShift = isCheckout
      ? allShifts.find((s) => s.name === activeCheckoutRecord.shift_name) || { name: activeCheckoutRecord.shift_name }
      : selectedShiftEntry?.shift;

    if (!isCheckout && !selectedShift) {
      await UIHelpers.alert('กรุณาเลือกกะปฏิบัติงาน', 'โปรดเลือกช่วงเวลา/กะปฏิบัติงานก่อนบันทึกเวลา', 'warning');
      return;
    }

    if (!isCheckout && selectedShift?.is_custom) {
      const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (!timeRegex.test(customShiftIn.trim()) || !timeRegex.test(customShiftOut.trim())) {
        await UIHelpers.alert('รูปแบบเวลาไม่ถูกต้อง', 'กรุณาระบุเวลาเข้า-ออกกำหนดเองเป็นรูปแบบ 24 ชม. เช่น 08:30', 'warning');
        return;
      }
    }

    const modeLabel = locationMode === 'offsite' ? 'นอกสถานที่' : 'ในสถานที่ราชการ';
    const finalOffsiteReason = locationMode === 'offsite'
      ? (offsiteJobType === 'อื่นๆ' ? offsiteCustomRemark.trim() : offsiteJobType)
      : null;

    const confirmTitle = isCheckout ? 'ยืนยันบันทึกเวลาออกงาน' : 'ยืนยันบันทึกเวลาเข้าปฏิบัติราชการ';
    const confirmLines = [
      `กะปฏิบัติงาน: ${selectedShift?.name || 'เวลาราชการปกติ'}`,
      `รูปแบบ: ${modeLabel}${finalOffsiteReason ? ` (${finalOffsiteReason})` : ''}`,
      `สถานที่: ${activeLocationName || 'ไม่ระบุสถานที่'}`,
      `เวลาปัจจุบัน: ${UIHelpers.getCurrentTimeHHMM()} น.`,
    ].join('\n');

    const ok = await UIHelpers.confirm(confirmTitle, confirmLines, isCheckout ? 'ยืนยันลงเวลาออก' : 'ยืนยันลงเวลาเข้า', 'question');
    if (!ok) return;

    setSubmitting(true);
    UIHelpers.showLoading(isCheckout ? 'กำลังบันทึกเวลาออกงาน...' : 'กำลังบันทึกเวลาปฏิบัติราชการ...');
    try {
      let photoUrl = '';
      if (photoDataUrl) {
        const uploaded = await UIHelpers.uploadPhotoToGoogleDrive(
          photoDataUrl,
          `${user.username}_${UIHelpers.getTodayISO()}_${isCheckout ? 'out' : 'in'}`,
          settings
        ).catch(() => null);
        photoUrl = typeof uploaded === 'string' && uploaded.trim() ? uploaded.trim() : '';
      }

      const finalLat = activeCoords?.lat ?? null;
      const finalLng = activeCoords?.lng ?? null;
      const finalLocation = activeLocationName || 'ไม่ระบุสถานที่';
      const activeGf = finalLat != null && finalLng != null
        ? evaluateOfficialGeofence(finalLat, finalLng, settings?.official_locations)
        : geofence;

      const locModeEnum = locationMode === 'offsite' ? 'OFFSITE' : 'ONSITE';
      const shiftIn = selectedShift?.is_custom ? customShiftIn.trim() : (selectedShift?.check_in || settings?.standard_check_in || '08:30');
      const shiftOut = selectedShift?.is_custom ? customShiftOut.trim() : (selectedShift?.check_out || settings?.standard_check_out || '16:30');

      const res = await AttendanceModel.submitCheckinOrCheckout({
        personnel_id: user.personnel_id,
        user_id: user.id,
        work_date: UIHelpers.getTodayISO(),
        time: UIHelpers.getCurrentTimeHHMM(),
        shift_name: selectedShift?.name || 'เวลาราชการปกติ',
        shift_check_in: shiftIn,
        shift_check_out: shiftOut,
        custom_check_in_time: selectedShift?.is_custom ? customShiftIn.trim() : null,
        custom_check_out_time: selectedShift?.is_custom ? customShiftOut.trim() : null,
        is_overtime_shift: Boolean(selectedShift?.is_overtime),
        is_overnight: Boolean(selectedShift?.is_overnight),
        single_click_checkin: Boolean(settings?.single_click_checkin),
        photo_url: photoUrl,
        lat: finalLat,
        lng: finalLng,
        location_name: finalLocation,
        location_mode: locModeEnum,
        offsite_reason: finalOffsiteReason,
        distance_from_official_meters: activeGf?.distanceMeters ?? null,
        check_out_location_mode: locModeEnum,
        check_out_offsite_reason: finalOffsiteReason,
        check_out_distance_from_official_meters: activeGf?.distanceMeters ?? null,
        remark: finalOffsiteReason || (selectedShift?.is_overtime ? 'ปฏิบัติงานนอกเวลา' : ''),
      });

      UIHelpers.hideLoading();
      if (res?.success) {
        if (!hideShiftCard) setSelectedShiftIdx('');
        setOffsiteJobType('');
        setOffsiteCustomRemark('');
        setOffsiteCustomGps(null);
        setOffsiteGpsSource('current');
        setPreviewPhoto('');
        await loadPersonalData();
        await UIHelpers.alert('บันทึกเวลาสำเร็จ', res.message || 'บันทึกเวลาปฏิบัติราชการเรียบร้อยแล้ว', 'success');
      } else {
        await UIHelpers.alert('ไม่สามารถบันทึกเวลาได้', res?.message || 'เกิดข้อผิดพลาด', 'error');
      }
    } catch (err) {
      UIHelpers.hideLoading();
      await UIHelpers.alert('เกิดข้อผิดพลาด', err?.message || 'ไม่สามารถบันทึกเวลาได้', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartCheckin = async () => {
    if (gpsLoading || resolvingPlace) return;
    if (settings?.require_gps !== false && !activeCoords) {
      await UIHelpers.alert('ไม่พบพิกัด GPS', 'กรุณากดรีเฟรชพิกัด GPS ก่อนลงเวลา', 'warning');
      return;
    }
    if (locationMode === 'onsite' && settings?.enforce_geofence_radius && geofence?.distanceMeters != null && !geofence.withinRadius) {
      await UIHelpers.alert('อยู่นอกรัศมีสถานที่ราชการ', 'กรุณาเปลี่ยนเป็นโหมด "นอกสถานที่" หรือเข้าใกล้สถานที่ราชการที่กำหนด', 'warning');
      return;
    }
    if (locationMode === 'offsite' && !offsiteJobType) {
      await UIHelpers.alert('กรุณาเลือกลักษณะงานนอกสถานที่', 'โปรดเลือกลักษณะงานก่อนบันทึกเวลา', 'warning');
      return;
    }
    if (locationMode === 'offsite' && offsiteJobType === 'อื่นๆ' && !offsiteCustomRemark.trim()) {
      await UIHelpers.alert('กรุณาระบุลักษณะงานเพิ่มเติม', 'โปรดกรอกรายละเอียดงานนอกสถานที่', 'warning');
      return;
    }
    if (settings?.require_photo && !previewPhoto) {
      await UIHelpers.alert('กรุณาถ่ายภาพยืนยันก่อนลงเวลา', 'แตะที่กรอบกล้องด้านซ้ายเพื่อถ่ายภาพยืนยันตัวตนก่อนกดบันทึกเวลา', 'warning');
      setCameraOpen(true);
      return;
    }
    await executeCheckinSubmission(previewPhoto);
  };

  const handleDeleteSpecial = async (req) => {
    const ok = await UIHelpers.confirm('ยกเลิกคำขอกรณีพิเศษ', 'ต้องการยกเลิกคำขอที่รออนุมัตินี้ใช่หรือไม่?', 'ยืนยันยกเลิก', 'warning');
    if (!ok) return;
    const res = await AttendanceModel.deletePendingSpecialRequestByUser(req.id, user.personnel_id, user.id);
    if (res?.success) {
      UIHelpers.showToast('ยกเลิกคำขอเรียบร้อยแล้ว', 'success');
      await loadPersonalData();
    } else {
      await UIHelpers.alert('ยกเลิกไม่สำเร็จ', res?.message || 'เกิดข้อผิดพลาด', 'error');
    }
  };

  const handleRequestTimeCorrection = async (log) => {
    const stdIn = settings?.standard_check_in || '08:30';
    const stdOut = settings?.standard_check_out || '16:30';
    const curIn = log.check_in_time ? UIHelpers.formatTime24(log.check_in_time) : 'ไม่ลงเวลา';
    const curOut = log.check_out_time ? UIHelpers.formatTime24(log.check_out_time) : 'ยังไม่ลงเวลาออก';
    const inAbnormal = log.status === 'มาสาย' || !log.check_in_time;
    const outAbnormal = !log.check_out_time || (log.check_out_time && UIHelpers.timeToMinutes(log.check_out_time) < UIHelpers.timeToMinutes(stdOut));

    const infoHtml = [
      `<div><strong>วันที่:</strong> ${UIHelpers.escapeHtml(UIHelpers.formatThaiShortDate(log.work_date))} (${UIHelpers.escapeHtml(log.shift_name || '-')})</div>`,
      inAbnormal
        ? `<div class="text-amber-700 dark:text-amber-300 font-semibold">• เวลาเข้า: ${UIHelpers.escapeHtml(curIn)} → ปรับเป็น ${UIHelpers.escapeHtml(stdIn)} น.</div>`
        : `<div>• เวลาเข้า: ${UIHelpers.escapeHtml(curIn)} น. (ปกติ)</div>`,
      outAbnormal
        ? `<div class="text-amber-700 dark:text-amber-300 font-semibold">• เวลาออก: ${UIHelpers.escapeHtml(curOut)} → ปรับเป็น ${UIHelpers.escapeHtml(stdOut)} น.</div>`
        : `<div>• เวลาออก: ${UIHelpers.escapeHtml(curOut)} น. (ปกติ)</div>`,
    ].join('');

    const { isConfirmed, value: reason } = await UIHelpers.confirmWithInput(
      'ยื่นคำขอแก้ไขเวลาปฏิบัติราชการ',
      {
        icon: 'question',
        infoHtml,
        inputLabel: 'เหตุผลการขอแก้ไขเวลา',
        inputPlaceholder: 'ระบุเหตุผลการขอแก้ไขเวลา (เช่น ลืมลงเวลาออกงาน, ติดภารกิจ)...',
        confirmText: 'ส่งคำขอแก้ไขเวลา',
      }
    );
    if (!isConfirmed) return;
    if (!reason) {
      await UIHelpers.alert('กรุณาระบุเหตุผล', 'โปรดระบุเหตุผลการขอแก้ไขเวลาปฏิบัติราชการ', 'warning');
      return;
    }

    UIHelpers.showLoading('กำลังส่งคำขอแก้ไขเวลา...');
    try {
      const res = await AttendanceModel.submitTimeCorrectionRequest(log.id, user, reason);
      UIHelpers.hideLoading();
      if (res?.success) {
        UIHelpers.showToast(res.message || 'ส่งคำขอแก้ไขเวลาเรียบร้อยแล้ว', 'success');
        await loadPersonalData();
      } else {
        await UIHelpers.alert('ส่งคำขอไม่สำเร็จ', res?.message || 'เกิดข้อผิดพลาด', 'error');
      }
    } catch (err) {
      UIHelpers.hideLoading();
      await UIHelpers.alert('เกิดข้อผิดพลาด', err?.message || 'ไม่สามารถส่งคำขอได้', 'error');
    }
  };

  const handleLogout = async () => {
    const ok = await UIHelpers.confirm('ออกจากระบบ', 'คุณต้องการออกจากระบบใช่หรือไม่?', 'ออกจากระบบ', 'warning');
    if (!ok) return;
    logout();
    navigate('/', { replace: true });
  };

  const isCheckout = Boolean(activeCheckoutRecord);
  const posText = UIHelpers.formatPosition(
    user?.personnel?.position_title,
    user?.personnel?.position_level,
    user?.personnel?.position_type
  );
  const logoUrl = settings?.logo_url ? (UIHelpers.verifyImageUrl(settings.logo_url)?.url || settings.logo_url) : '';
  const yearBuddhist = new Date().getFullYear() + 543;
  const eligibleCorrectionsCount = correctionLogs.filter(
    (l) => l.canRequestCorrection !== false && l.time_correction_status !== 'pending' && l.correction_status !== 'pending'
  ).length;

  const todayIso = UIHelpers.getTodayISO();
  const desktopScopedHistory = useMemo(() => {
    const base = historyLogs.slice(0, 35);
    return historyScope === 'today'
      ? base.filter((l) => l.work_date === todayIso)
      : base.filter((l) => l.work_date !== todayIso).slice(0, 30);
  }, [historyLogs, historyScope, todayIso]);

  const desktopPaginatedHistory = useMemo(() => {
    if (historyScope === 'today') return desktopScopedHistory;
    return desktopScopedHistory.slice((histPage - 1) * histPageSize, histPage * histPageSize);
  }, [desktopScopedHistory, historyScope, histPage, histPageSize]);

  // 4-State Unified Status Banner (Red / Green / Yellow / Gray)
  const bannerMeta = useMemo(() => {
    if (isCheckout) {
      return {
        gradient: 'bg-gradient-to-r from-rose-700 to-red-600 text-white',
        badge: 'สถานะ: รอลงเวลาออกงาน',
      };
    }
    if (isRegularCompletedToday && hasOvertimeAvailable) {
      return {
        gradient: 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950',
        badge: 'สถานะ: ลงเวลาปกติครบแล้ว (ลงเวลา OT เพิ่มเติมได้)',
      };
    }
    if (availableShifts.length === 0) {
      return {
        gradient: 'bg-gradient-to-r from-slate-600 to-slate-700 text-white',
        badge: isRegularCompletedToday ? 'สถานะ: เสร็จสิ้นการลงเวลาวันนี้แล้ว' : 'สถานะ: ไม่มีกะเวลาที่เปิดให้ลงเวลาในขณะนี้',
      };
    }
    if (normalHoursLocked && hasOvertimeAvailable) {
      return {
        gradient: 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950',
        badge: 'สถานะ: เวลาราชการปกติปิด (สามารถลงเวลากะ OT ได้)',
      };
    }
    return {
      gradient: 'bg-gradient-to-r from-[#00351B] via-[#00744B] to-[#00A368] text-white',
      badge: hideShiftCard ? 'สถานะ: พร้อมลงเวลาปฏิบัติราชการ (1 คลิก)' : 'สถานะ: พร้อมลงเวลาเข้างาน',
    };
  }, [isCheckout, isRegularCompletedToday, hasOvertimeAvailable, availableShifts.length, normalHoursLocked, hideShiftCard]);

  const isGpsResolving = Boolean(gpsLoading || resolvingPlace);
  const canPressSubmit =
    !submitting &&
    !isGpsResolving &&
    (isCheckout || Boolean(selectedShiftEntry));

  return (
    <div className="checkin-civic-gradient min-h-[100dvh] lg:h-[100dvh] lg:max-h-[100dvh] lg:overflow-hidden flex flex-col text-slate-800 dark:text-slate-100 pb-20 lg:pb-0">
      {/* Single-Row Header */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 shadow-xs px-3 sm:px-6 py-2 shrink-0">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="hidden lg:flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center p-1 shrink-0">
                {logoUrl ? <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" /> : <i className="fa-solid fa-landmark text-[#00744B]" />}
              </div>
              <div className="leading-tight">
                <p className="text-xs font-extrabold text-[#00744B] dark:text-[#00C08A]">{settings?.bureau_name || 'สำนักเทศกิจ'}</p>
                <p className="text-[10px] text-slate-400">{settings?.header_system_title}</p>
              </div>
              <span className="h-7 w-px bg-slate-200 dark:bg-slate-700 mx-1" />
            </div>

            <div className="flex items-center gap-2.5 min-w-0">
              <div className="hidden sm:flex w-9 h-9 rounded-full bg-gradient-to-br from-[#00744B] to-[#00A368] text-white font-extrabold text-xs items-center justify-center shrink-0">
                {(user?.full_name || 'U').slice(0, 2)}
              </div>
              <div className="min-w-0">
                <p className="font-extrabold text-sm text-slate-800 dark:text-white truncate">{user?.full_name || user?.username}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{posText || settings?.bureau_name}</p>
              </div>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-2 shrink-0">
            {isAdmin && (
              <button type="button" onClick={() => navigate('/dashboard')} className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold transition cursor-pointer">
                <i className="fa-solid fa-user-shield mr-1.5" />ระบบผู้ดูแล
              </button>
            )}
            <button type="button" onClick={toggleTheme} className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold cursor-pointer">
              <i className={`fa-solid ${isDark ? 'fa-sun text-amber-400' : 'fa-moon'} mr-1.5`} />
              {isDark ? 'โหมดสว่าง' : 'โหมดถนอมสายตา'}
            </button>
            <button type="button" onClick={handleLogout} className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300 text-xs font-bold hover:bg-rose-100 transition cursor-pointer">
              <i className="fa-solid fa-right-from-bracket mr-1.5" />ออกจากระบบ
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMobileDrawerOpen(true)}
            aria-label="เปิดเมนู"
            className="lg:hidden w-11 h-11 rounded-2xl bg-[#00744B] hover:bg-[#005a3a] text-white shadow-md flex items-center justify-center shrink-0 transition"
          >
            <i className="fa-solid fa-bars text-lg" />
          </button>
        </div>
      </header>

      {/* Sticky Full-Width Desktop Tab Bar */}
      <nav className="hidden lg:block sticky top-[57px] z-20 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 shrink-0">
        <div className="max-w-5xl w-full mx-auto px-4 py-1.5 flex items-center gap-1.5">
          {[
            { id: 'checkin', label: 'ลงเวลาปฏิบัติราชการ', icon: 'fa-fingerprint' },
            { id: 'history', label: 'ตารางประวัติการลงเวลาส่วนตัว', icon: 'fa-table-list' },
            { id: 'special', label: 'ประวัติการขอลงเวลากรณีพิเศษ', icon: 'fa-file-signature' },
            { id: 'correction', label: 'แก้ไขเวลา', icon: 'fa-clock-rotate-left', badge: eligibleCorrectionsCount },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setDesktopTab(t.id)}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                desktopTab === t.id
                  ? 'bg-[#00744B] text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <i className={`fa-solid ${t.icon}`} />
              <span>{t.label}</span>
              {t.badge > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-extrabold">{t.badge}</span>
              )}
            </button>
          ))}
          <a
            href="./docs/manual/index.html"
            target="_blank"
            rel="noopener noreferrer"
            className="py-2 px-3.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition shrink-0"
          >
            <i className="fa-solid fa-book-open text-[#00744B]" />
            <span>คู่มือการใช้งาน</span>
          </a>
        </div>
      </nav>

      {/* Main Content Container (scrollable inside viewport lock on lg+) */}
      <main className="flex-1 min-h-0 lg:overflow-y-auto max-w-5xl w-full mx-auto p-3 sm:p-4 space-y-3">
        {/* TAB 1 (or always on Mobile): Check-in Workspace */}
        <div className={desktopTab !== 'checkin' ? 'lg:hidden space-y-3' : 'max-w-xl mx-auto space-y-3'}>
          {/* 4-State Unified Status Banner */}
          <div
            id="unifiedStatusBanner"
            className={`rounded-2xl p-3 sm:p-3.5 shadow-md flex items-center justify-between gap-3 ${bannerMeta.gradient}`}
          >
            <div className="min-w-0">
              <span className="inline-block px-2 py-0.5 rounded-full bg-black/15 text-[10px] font-extrabold mb-1">
                {bannerMeta.badge}
              </span>
              <p className="font-extrabold text-sm sm:text-base truncate">
                {UIHelpers.formatThaiFullDate(todayIso)}
              </p>
            </div>
            <div className="text-right shrink-0">
              <LiveClockDisplay />
            </div>
          </div>

          {/* Cockpit 2-Column 3:4 Side-by-Side (#photoPreviewCard dark full-bleed + #gpsSectionCard Option A) */}
          <div className="grid grid-cols-2 gap-3 items-stretch">
            {/* Left: #photoPreviewCard — dark full-bleed 3:4, NO top header bar */}
            <div
              id="photoPreviewCard"
              onClick={() => setCameraOpen(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setCameraOpen(true); }}
              className="relative w-full aspect-[3/4] max-h-[30dvh] rounded-2xl border border-slate-700/80 bg-slate-900 shadow-sm overflow-hidden flex flex-col items-center justify-center cursor-pointer group"
            >
              {previewPhoto ? (
                <>
                  <img src={previewPhoto} alt="ภาพถ่ายยืนยัน" className="w-full h-full object-cover" />
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-emerald-600/90 text-white text-[10px] font-bold shadow">
                    พร้อมแล้ว ✓
                  </span>
                  <span className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-bold">
                    แตะเพื่อถ่ายใหม่
                  </span>
                </>
              ) : (
                <div className="flex flex-col items-center gap-2 text-white/90 p-3 text-center">
                  <span className="w-12 h-12 rounded-full bg-[#00744B] group-hover:scale-110 transition shadow-lg flex items-center justify-center">
                    <i className="fa-solid fa-camera text-lg" />
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-white/15 text-[11px] font-bold">แตะเพื่อถ่ายรูป</span>
                </div>
              )}
            </div>

            {/* Right: #gpsSectionCard (Option A — tap location header bar to expand) */}
            <EmbeddedMapCard
              coords={activeCoords}
              locationName={activeLocationName}
              loading={gpsLoading}
              resolvingPlace={resolvingPlace}
              error={gpsError}
              onRefreshGps={locate}
              onOpenFullMap={() => setViewGpsOpen(true)}
              settings={settings}
              hideMap={mobileDrawerOpen}
              visible={desktopTab === 'checkin'}
            />
          </div>

          {/* Work Mode Card + Shift Selection Card */}
          <ShiftSelectorCard
            settings={settings}
            availableShifts={availableShifts}
            selectedShiftIdx={selectedShiftIdx}
            onSelectShiftIdx={setSelectedShiftIdx}
            customShiftIn={customShiftIn}
            customShiftOut={customShiftOut}
            onCustomShiftInChange={setCustomShiftIn}
            onCustomShiftOutChange={setCustomShiftOut}
            activeCheckoutRecord={activeCheckoutRecord}
            hideShiftCard={hideShiftCard}
            locationMode={locationMode}
            onLocationModeChange={setLocationMode}
            offsiteJobType={offsiteJobType}
            onOffsiteJobTypeChange={setOffsiteJobType}
            offsiteCustomRemark={offsiteCustomRemark}
            onOffsiteCustomRemarkChange={setOffsiteCustomRemark}
            offsiteGpsSource={offsiteGpsSource}
            onOffsiteGpsSourceChange={setOffsiteGpsSource}
            offsiteCustomGps={offsiteCustomGps}
            onRefreshGps={locate}
            onOpenOffsiteMap={() => setOffsiteMapOpen(true)}
            geofence={geofence}
            normalHoursLocked={normalHoursLocked}
            hasOvertimeAvailable={hasOvertimeAvailable}
          />

          {/* Single Unified Check-in Bar (.bma-sticky-checkin-bar) */}
          <div className="bma-sticky-checkin-bar fixed bottom-0 inset-x-0 z-30 p-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 shadow-2xl lg:static lg:p-0 lg:bg-transparent lg:dark:bg-transparent lg:border-0 lg:shadow-none">
            <button
              type="button"
              disabled={!canPressSubmit}
              onClick={handleStartCheckin}
              className={`w-full py-3.5 rounded-2xl text-white font-extrabold text-sm shadow-lg flex items-center justify-center gap-2 transition disabled:opacity-45 cursor-pointer ${
                isCheckout
                  ? 'bg-gradient-to-r from-rose-700 to-red-600 hover:brightness-105'
                  : 'bg-gradient-to-r from-[#00351B] via-[#00744B] to-[#00A368] hover:brightness-105'
              }`}
            >
              <i className={`fa-solid ${submitting || isGpsResolving ? 'fa-circle-notch fa-spin' : isCheckout ? 'fa-right-from-bracket' : 'fa-fingerprint'}`} />
              <span>
                {submitting
                  ? 'กำลังบันทึกข้อมูล...'
                  : isGpsResolving
                    ? 'กำลังค้นหาสถานที่ใกล้เคียง...'
                    : isCheckout
                      ? 'บันทึกเวลาออกงาน'
                      : 'บันทึกเวลาเข้าปฏิบัติราชการ'}
              </span>
            </button>
          </div>
        </div>

        {/* TAB 2 (Desktop): Personal Attendance History Table (7 cols with ลำดับ, limit=35, past-only pagination) */}
        {desktopTab === 'history' && (
          <div className="hidden lg:block pt-5">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md overflow-visible">
              <div className="-mt-5 mx-4 px-5 py-3.5 rounded-2xl bg-gradient-to-r from-[#00744B] to-[#00A368] text-white shadow-lg flex items-center justify-between">
                <h2 className="font-extrabold text-sm"><i className="fa-solid fa-table-list mr-2" />ตารางประวัติการลงเวลาส่วนตัว (ย้อนหลัง 30 รายการ)</h2>
                <div className="flex gap-1.5 text-xs font-bold">
                  <button type="button" onClick={() => { setHistoryScope('today'); setHistPage(1); }} className={`px-3 py-1 rounded-lg cursor-pointer ${historyScope === 'today' ? 'bg-white text-[#00744B]' : 'bg-white/15 text-white'}`}>วันปัจจุบัน</button>
                  <button type="button" onClick={() => { setHistoryScope('past'); setHistPage(1); }} className={`px-3 py-1 rounded-lg cursor-pointer ${historyScope === 'past' ? 'bg-white text-[#00744B]' : 'bg-white/15 text-white'}`}>ย้อนหลัง</button>
                </div>
              </div>
              <div className="p-4 overflow-x-auto">
                <table className="w-full text-xs text-left bma-table">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500">
                      <th className="py-2.5 px-3 text-center w-12">ลำดับ</th>
                      <th className="py-2.5 px-3">วันที่</th>
                      <th className="py-2.5 px-3">กะปฏิบัติงาน</th>
                      <th className="py-2.5 px-3 text-center">เข้า</th>
                      <th className="py-2.5 px-3 text-center">ออก</th>
                      <th className="py-2.5 px-3">สถานที่</th>
                      <th className="py-2.5 px-3 text-center">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {desktopPaginatedHistory.length === 0 ? (
                      <tr><td colSpan={7} className="py-8 text-center text-slate-400">ไม่มีรายการลงเวลา</td></tr>
                    ) : (
                      desktopPaginatedHistory.map((row, i) => {
                        const seq = historyScope === 'today' ? i + 1 : (histPage - 1) * histPageSize + i + 1;
                        return (
                          <tr key={row.id}>
                            <td className="py-2.5 px-3 text-center font-mono text-slate-400">{seq}</td>
                            <td className="py-2.5 px-3 font-bold">{UIHelpers.formatThaiShortDate(row.work_date)}</td>
                            <td className="py-2.5 px-3">{row.shift_name}</td>
                            <td className="py-2.5 px-3 text-center font-mono font-bold text-[#00744B]">{UIHelpers.formatTime24(row.check_in_time)}</td>
                            <td className="py-2.5 px-3 text-center font-mono font-bold text-sky-600">{row.check_out_time ? UIHelpers.formatTime24(row.check_out_time) : '-'}</td>
                            <td className="py-2.5 px-3 max-w-xs truncate">{row.check_in_location || '-'}</td>
                            <td className="py-2.5 px-3 text-center font-bold">{row.status}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {historyScope === 'past' && (
                <PaginationBar
                  totalItems={desktopScopedHistory.length}
                  page={histPage}
                  pageSize={histPageSize}
                  onPageChange={setHistPage}
                  onPageSizeChange={(n) => { setHistPageSize(n); setHistPage(1); }}
                  pageSizeOptions={[5, 10, 15, 20, 30]}
                />
              )}
            </div>
          </div>
        )}

        {/* TAB 3 (Desktop): Special Requests Table (7 cols with ลำดับ) */}
        {desktopTab === 'special' && (
          <div className="hidden lg:block pt-5">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md overflow-visible">
              <div className="-mt-5 mx-4 px-5 py-3.5 rounded-2xl bg-gradient-to-r from-[#480080] to-[#7C3AED] text-white shadow-lg flex items-center justify-between">
                <h2 className="font-extrabold text-sm"><i className="fa-solid fa-file-signature mr-2" />ประวัติการขอลงเวลากรณีพิเศษ</h2>
                <button type="button" onClick={() => setSpecialModalOpen(true)} className="px-3.5 py-1.5 rounded-xl bg-white text-purple-800 text-xs font-extrabold cursor-pointer">
                  + ยื่นคำขอกรณีพิเศษ
                </button>
              </div>
              <div className="p-4 overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500">
                      <th className="py-2.5 px-3 text-center w-12">ลำดับ</th>
                      <th className="py-2.5 px-3">วันที่</th>
                      <th className="py-2.5 px-3">กะ / เวลา</th>
                      <th className="py-2.5 px-3">สถานที่</th>
                      <th className="py-2.5 px-3">เหตุผล</th>
                      <th className="py-2.5 px-3 text-center">สถานะ</th>
                      <th className="py-2.5 px-3 text-center">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {specialRequests.length === 0 ? (
                      <tr><td colSpan={7} className="py-8 text-center text-slate-400">ยังไม่มีคำขอกรณีพิเศษ</td></tr>
                    ) : (
                      specialRequests.map((req, i) => (
                        <tr key={req.id}>
                          <td className="py-2.5 px-3 text-center font-mono text-slate-400">{i + 1}</td>
                          <td className="py-2.5 px-3 font-bold">{UIHelpers.formatThaiShortDate(req.work_date)}</td>
                          <td className="py-2.5 px-3">{req.shift_name} ({UIHelpers.formatTime24(req.check_in_time)}–{UIHelpers.formatTime24(req.check_out_time)})</td>
                          <td className="py-2.5 px-3 max-w-xs truncate">{req.check_in_location || '-'}</td>
                          <td className="py-2.5 px-3">{req.remark}</td>
                          <td className="py-2.5 px-3 text-center font-bold">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${req.approval_status === 'approved' ? 'bg-emerald-100 text-emerald-700' : req.approval_status === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'}`}>
                              {req.approval_status === 'approved' ? 'อนุมัติแล้ว' : req.approval_status === 'rejected' ? 'ไม่อนุมัติ' : 'รออนุมัติ'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {req.approval_status === 'pending' && (
                              <button type="button" onClick={() => handleDeleteSpecial(req)} className="text-rose-600 hover:underline font-bold cursor-pointer">ยกเลิก</button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4 (Desktop): Time Correction Table (6 cols with ลำดับ, direct row button -> UIHelpers.confirmWithInput) */}
        {desktopTab === 'correction' && (
          <div className="hidden lg:block pt-5">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md overflow-visible">
              <div className="-mt-5 mx-4 px-5 py-3.5 rounded-2xl bg-gradient-to-r from-[#00351B] to-[#00744B] text-white shadow-lg flex items-center justify-between">
                <h2 className="font-extrabold text-sm"><i className="fa-solid fa-clock-rotate-left mr-2" />รายการขอแก้ไขเวลาเข้า-ออกงาน</h2>
                <span className="text-xs text-emerald-100">คลิกปุ่ม "ขอแก้ไขเวลา" ที่แถวรายการเพื่อยื่นคำขอโดยตรง</span>
              </div>
              <div className="p-4 overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500">
                      <th className="py-2.5 px-3 text-center w-12">ลำดับ</th>
                      <th className="py-2.5 px-3">วันที่</th>
                      <th className="py-2.5 px-3">กะปฏิบัติงาน</th>
                      <th className="py-2.5 px-3 text-center">เวลาเดิม (เข้า/ออก)</th>
                      <th className="py-2.5 px-3">สถานะ</th>
                      <th className="py-2.5 px-3 text-center">ดำเนินการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {correctionLogs.length === 0 ? (
                      <tr><td colSpan={6} className="py-8 text-center text-slate-400">ไม่มีรายการผิดปกติที่ต้องแก้ไขเวลา</td></tr>
                    ) : (
                      correctionLogs.map((log, i) => {
                        const isPending = log.time_correction_status === 'pending' || log.correction_status === 'pending';
                        return (
                          <tr key={log.id}>
                            <td className="py-2.5 px-3 text-center font-mono text-slate-400">{i + 1}</td>
                            <td className="py-2.5 px-3 font-bold">{UIHelpers.formatThaiShortDate(log.work_date)}</td>
                            <td className="py-2.5 px-3">{log.shift_name}</td>
                            <td className="py-2.5 px-3 text-center font-mono">{log.check_in_time ? UIHelpers.formatTime24(log.check_in_time) : '--:--'} / {log.check_out_time ? UIHelpers.formatTime24(log.check_out_time) : '--:--'}</td>
                            <td className="py-2.5 px-3">
                              <span className="text-rose-600 font-bold">{log.status || log.status_label}</span>
                              {isPending && (
                                <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">รออนุมัติ</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {log.canRequestCorrection !== false && !isPending && (
                                <button
                                  type="button"
                                  onClick={() => handleRequestTimeCorrection(log)}
                                  className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold cursor-pointer"
                                >
                                  ขอแก้ไขเวลา
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="hidden lg:block bma-footer-bar text-center px-4 py-2 text-xs text-white/90 shrink-0">
        <span className="font-bold text-[#F6DE51]">{settings?.bureau_name || 'สำนักเทศกิจ'}</span>{' '}
        {settings?.organization_name || 'กรุงเทพมหานคร'} © พ.ศ. {yearBuddhist}
      </footer>

      {/* Mobile Off-Canvas Drawer (3 SPA views) */}
      <MobileHistoryDrawer
        mobileOpen={mobileDrawerOpen}
        onCloseMobile={() => setMobileDrawerOpen(false)}
        user={user}
        isAdmin={isAdmin}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        onGoAdmin={() => navigate('/dashboard')}
        onLogout={handleLogout}
        historyLogs={historyLogs}
        specialRequests={specialRequests}
        correctableLogs={correctionLogs}
        onDeleteSpecialRequest={handleDeleteSpecial}
        onOpenSpecialRequest={() => setSpecialModalOpen(true)}
        onRequestTimeCorrection={(log) => {
          setMobileDrawerOpen(false);
          handleRequestTimeCorrection(log);
        }}
        onRefresh={loadPersonalData}
      />

      {/* Fullscreen Camera Modal (Option 1 — NEVER auto-submits check-in!) */}
      <FullscreenCameraModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        allowGalleryFallback={settings?.allow_gallery_fallback !== false}
        onConfirmPhoto={(dataUrl) => {
          setCameraOpen(false);
          setPreviewPhoto(dataUrl);
        }}
      />

      {/* Offsite Custom GPS Map Picker (writes to offsiteCustomGps, preserving live GPS coords) */}
      <OffsiteMapSearchModal
        open={offsiteMapOpen}
        onClose={() => setOffsiteMapOpen(false)}
        initialCoords={
          offsiteCustomGps
            ? offsiteCustomGps
            : coords
              ? { lat: coords.lat, lng: coords.lng, name: locationName }
              : null
        }
        onSelectPlace={(place) => {
          setOffsiteCustomGps(place);
          setOffsiteGpsSource('custom');
        }}
      />

      {/* Expanded GPS Map Modal (Option A — opened by tapping EmbeddedMapCard header bar) */}
      <ViewGpsMapModal
        open={viewGpsOpen}
        onClose={() => setViewGpsOpen(false)}
        coords={activeCoords}
        locationName={activeLocationName}
        geofence={geofence}
        settings={settings}
      />

      {/* Special Request Modal */}
      <SpecialRequestModal
        open={specialModalOpen}
        onClose={() => setSpecialModalOpen(false)}
        user={user}
        settings={settings}
        currentCoords={coords}
        currentLocationName={locationName}
        onSubmitted={loadPersonalData}
      />

      <SystemUpdateModal open={showUpdateModal} onClose={dismissModal} settings={settings} versionInfo={versionInfo} />
    </div>
  );
}
