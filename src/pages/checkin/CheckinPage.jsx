import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useSettings } from '../../contexts/SettingsContext.jsx';
import { useTheme } from '../../contexts/ThemeContext.jsx';
import { useGeolocation5Tier } from '../../hooks/useGeolocation5Tier.js';
import { useAdminRealtimeSync } from '../../hooks/useAdminRealtimeSync.js';
import { useSystemUpdateCheck } from '../../hooks/useSystemUpdateCheck.js';
import { AttendanceModel } from '../../models/AttendanceModel.js';
import { UIHelpers } from '../../core/UIHelpers.js';

import { ShiftSelectorCard } from './ShiftSelectorCard.jsx';
import { EmbeddedMapCard } from './EmbeddedMapCard.jsx';
import { FullscreenCameraModal } from './FullscreenCameraModal.jsx';
import { OffsiteMapSearchModal } from './OffsiteMapSearchModal.jsx';
import { SpecialRequestModal } from './SpecialRequestModal.jsx';
import { TimeCorrectionModal } from './TimeCorrectionModal.jsx';
import { MobileHistoryDrawer } from './MobileHistoryDrawer.jsx';
import { ViewGpsMapModal } from './ViewGpsMapModal.jsx';
import { SystemUpdateModal } from '../../components/layout/SystemUpdateModal.jsx';
import { PaginationBar } from '../../components/common/PaginationBar.jsx';

/**
 * Native React CheckinPage — 100% Visual & Structural Parity with legacy checkin.html (L180-1135)
 * - Body .checkin-civic-gradient + White Header bg-white/95 (Desktop full controls | Mobile single green Hamburger w-11 h-11)
 * - Desktop 5-Tab Bar (ลงเวลา, ประวัติส่วนตัว, คำขอพิเศษ, แก้ไขเวลา+badge, คู่มือ) + 3 Floating Header Tables
 * - Unified Status Banner (green check-in / red check-out + big live clock)
 * - Cockpit 2-Column 3:4 (#photoPreviewCard + #gpsSectionCard)
 * - Work Mode Card ABOVE Shift Selection Card (+ #mainCustomTimeContainer)
 * - .bma-sticky-checkin-bar on Mobile + Footer
 */
export default function CheckinPage() {
  const { user, isAdmin, logout } = useAuth();
  const { settings } = useSettings();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const { coords, locationName, geofence, loading: gpsLoading, error: gpsError, locate, setCoords, setLocationName } = useGeolocation5Tier(settings);
  const { versionInfo, showUpdateModal, dismissModal } = useSystemUpdateCheck(settings);

  const [desktopTab, setDesktopTab] = useState('checkin'); // 'checkin' | 'history' | 'special' | 'correction'
  const [historyScope, setHistoryScope] = useState('today'); // 'today' | 'past'
  const [histPage, setHistPage] = useState(1);
  const [histPageSize, setHistPageSize] = useState(10);

  const [nowClock, setNowClock] = useState(() => new Date());
  const [historyLogs, setHistoryLogs] = useState([]);
  const [specialRequests, setSpecialRequests] = useState([]);
  const [correctionLogs, setCorrectionLogs] = useState([]);
  const [activeCheckoutRecord, setActiveCheckoutRecord] = useState(null);

  const [selectedShiftName, setSelectedShiftName] = useState('');
  const [customShiftIn, setCustomShiftIn] = useState('08:30');
  const [customShiftOut, setCustomShiftOut] = useState('16:30');
  const [locationMode, setLocationMode] = useState('onsite');
  const [offsiteJobType, setOffsiteJobType] = useState('');
  const [offsiteCustomRemark, setOffsiteCustomRemark] = useState('');
  const [previewPhoto, setPreviewPhoto] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Modals & Drawers
  const [cameraOpen, setCameraOpen] = useState(false);
  const [offsiteMapOpen, setOffsiteMapOpen] = useState(false);
  const [viewGpsOpen, setViewGpsOpen] = useState(false);
  const [mapPickerTarget, setMapPickerTarget] = useState('checkin');
  const [specialPickedPlace, setSpecialPickedPlace] = useState(null);
  const [specialModalOpen, setSpecialModalOpen] = useState(false);
  const [timeCorrectionOpen, setTimeCorrectionOpen] = useState(false);
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
    const id = window.setInterval(() => setNowClock(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const loadPersonalData = useCallback(async () => {
    if (!user) return;
    try {
      const [hist, specials, activeCheckout, tcLogs] = await Promise.all([
        AttendanceModel.getPersonalAttendanceHistory(user.personnel_id, user.id, 30),
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
    locate(true);
  }, [loadPersonalData, locate]);

  useAdminRealtimeSync({
    enabled: Boolean(user),
    onSync: () => loadPersonalData(),
    pollIntervalMs: 15000,
  });

  const { availableShifts, normalHoursLocked } = useMemo(() => {
    const nowMin = nowClock.getHours() * 60 + nowClock.getMinutes();
    const todayIso = UIHelpers.getTodayISO();
    const recordedToday = new Set(
      historyLogs
        .filter((l) => l.work_date === todayIso && l.check_in_time && l.check_out_time)
        .map((l) => l.shift_name)
    );

    const disableNormal = Boolean(settings?.disable_normal_hours_checkin);
    const stdInMin = UIHelpers.timeToMinutes(settings?.standard_check_in || '08:30');
    const stdOutMin = UIHelpers.timeToMinutes(settings?.standard_check_out || '16:30');
    const isLocked = disableNormal && nowMin >= stdInMin && nowMin <= stdOutMin;

    const earlyWindow = Number(settings?.early_shift_window_minutes ?? 30);
    const filterRealtime = Boolean(settings?.filter_shifts_by_realtime);

    const list = (settings?.work_shifts || []).filter((sh) => {
      if (recordedToday.has(sh.name)) return false;
      if (disableNormal && sh.name === 'เวลาราชการปกติ') return false;
      if (!filterRealtime || sh.is_custom) return true;
      const startMin = UIHelpers.timeToMinutes(sh.check_in || '08:30') - earlyWindow;
      const endMin = UIHelpers.timeToMinutes(sh.check_out || '16:30') + 60;
      if (sh.is_overnight || endMin < startMin) {
        return nowMin >= startMin || nowMin <= (endMin % 1440);
      }
      return nowMin >= startMin && nowMin <= endMin;
    });

    return { availableShifts: list, normalHoursLocked: isLocked };
  }, [nowClock, historyLogs, settings]);

  const executeCheckinSubmission = async (photoDataUrl = '') => {
    if (submitting) return;
    setSubmitting(true);
    try {
      let photoUrl = '';
      if (photoDataUrl) {
        const uploaded = await UIHelpers.uploadPhotoToGoogleDrive(
          photoDataUrl,
          `${user.username}_${UIHelpers.getTodayISO()}`,
          settings
        ).catch(() => null);
        photoUrl = uploaded?.url || uploaded?.fileUrl || photoDataUrl;
      }

      const isCheckout = Boolean(activeCheckoutRecord);
      const selectedShift = (settings?.work_shifts || []).find((s) => s.name === (isCheckout ? activeCheckoutRecord.shift_name : selectedShiftName));

      let finalLat = coords?.lat ?? null;
      let finalLng = coords?.lng ?? null;
      let finalLocation = locationName || '';

      if (isCheckout && settings?.randomize_gps_checkout && finalLat != null && finalLng != null) {
        const radius = Math.max(5, Number(settings.randomize_gps_radius_meters || 20));
        const jitter = await AttendanceModel.resolveJitteredCheckoutWithLocation(finalLat, finalLng, radius);
        if (jitter?.lat != null && jitter?.lng != null) {
          finalLat = jitter.lat;
          finalLng = jitter.lng;
          finalLocation = jitter.locationName || finalLocation;
        }
      }

      const finalOffsiteReason = locationMode === 'offsite'
        ? (offsiteJobType === 'อื่นๆ' ? offsiteCustomRemark.trim() : offsiteJobType)
        : null;

      const res = await AttendanceModel.submitCheckinOrCheckout({
        personnel_id: user.personnel_id,
        user_id: user.id,
        work_date: UIHelpers.getTodayISO(),
        time: UIHelpers.getCurrentTimeHHMM(),
        shift_name: selectedShift?.name || selectedShiftName || 'เวลาราชการปกติ',
        shift_check_in: selectedShift?.is_custom ? customShiftIn : (selectedShift?.check_in || settings?.standard_check_in || '08:30'),
        shift_check_out: selectedShift?.is_custom ? customShiftOut : (selectedShift?.check_out || settings?.standard_check_out || '16:30'),
        is_overtime: Boolean(selectedShift?.is_overtime),
        single_click_checkin: Boolean(settings?.single_click_checkin),
        photo_url: photoUrl,
        lat: finalLat,
        lng: finalLng,
        location_name: finalLocation || 'ไม่ระบุสถานที่',
        location_mode: locationMode === 'offsite' ? 'OFFSITE' : 'ONSITE',
        offsite_reason: finalOffsiteReason,
        distance_from_official_meters: geofence?.distanceMeters ?? null,
      });

      if (res?.success) {
        setSelectedShiftName('');
        setOffsiteJobType('');
        setOffsiteCustomRemark('');
        setPreviewPhoto('');
        await loadPersonalData();
        await UIHelpers.showToast(res.message || 'บันทึกเวลาปฏิบัติราชการเรียบร้อยแล้ว', 'success', 3200);
      } else {
        await UIHelpers.alert('ไม่สามารถบันทึกเวลาได้', res?.message || 'เกิดข้อผิดพลาด', 'error');
      }
    } catch (err) {
      await UIHelpers.alert('เกิดข้อผิดพลาด', err?.message || 'ไม่สามารถบันทึกเวลาได้', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartCheckin = async () => {
    if (settings?.require_gps && !coords) {
      await UIHelpers.alert('ไม่พบพิกัด GPS', 'กรุณากดอัปเดตพิกัด GPS ก่อนลงเวลา', 'warning');
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
    if (settings?.require_photo && !previewPhoto) {
      setCameraOpen(true);
    } else {
      await executeCheckinSubmission(previewPhoto);
    }
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

  const handleLogout = async () => {
    const ok = await UIHelpers.confirm('ออกจากระบบ', 'คุณต้องการออกจากระบบใช่หรือไม่?', 'ออกจากระบบ', 'warning');
    if (!ok) return;
    logout();
    navigate('/', { replace: true });
  };

  const isCheckout = Boolean(activeCheckoutRecord);
  const hhmm = `${String(nowClock.getHours()).padStart(2, '0')}:${String(nowClock.getMinutes()).padStart(2, '0')} น.`;
  const posText = UIHelpers.formatPosition(
    user?.personnel?.position_title,
    user?.personnel?.position_level,
    user?.personnel?.position_type
  );
  const logoUrl = settings?.logo_url ? (UIHelpers.verifyImageUrl(settings.logo_url)?.url || settings.logo_url) : '';
  const yearBuddhist = new Date().getFullYear() + 543;
  const eligibleCorrectionsCount = correctionLogs.filter((l) => l.canRequestCorrection !== false && l.correction_status !== 'pending').length;

  const todayIso = UIHelpers.getTodayISO();
  const desktopScopedHistory = useMemo(() => {
    const base = historyLogs.slice(0, 30);
    return historyScope === 'today' ? base.filter((l) => l.work_date === todayIso) : base.filter((l) => l.work_date !== todayIso);
  }, [historyLogs, historyScope, todayIso]);
  const desktopPaginatedHistory = useMemo(() => desktopScopedHistory.slice((histPage - 1) * histPageSize, histPage * histPageSize), [desktopScopedHistory, histPage, histPageSize]);

  return (
    <div className="checkin-civic-gradient min-h-[100dvh] flex flex-col text-slate-800 dark:text-slate-100 pb-20 sm:pb-0">
      {/* Original White Header bg-white/95 */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 shadow-xs px-3 sm:px-6 py-2.5">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          {/* Desktop Brand + Divider + User | Mobile Name + Single Green Hamburger */}
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

          {/* Desktop Action Buttons with Text */}
          <div className="hidden lg:flex items-center gap-2 shrink-0">
            {isAdmin && (
              <button type="button" onClick={() => navigate('/dashboard')} className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold transition">
                <i className="fa-solid fa-user-shield mr-1.5" />ระบบผู้ดูแล
              </button>
            )}
            <button type="button" onClick={toggleTheme} className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold">
              <i className={`fa-solid ${isDark ? 'fa-sun text-amber-400' : 'fa-moon'} mr-1.5`} />
              {isDark ? 'โหมดสว่าง' : 'โหมดถนอมสายตา'}
            </button>
            <button type="button" onClick={handleLogout} className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300 text-xs font-bold hover:bg-rose-100 transition">
              <i className="fa-solid fa-right-from-bracket mr-1.5" />ออกจากระบบ
            </button>
          </div>

          {/* Mobile Single Solid Green Hamburger Button w-11 h-11 bg-[#00744B] */}
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

      {/* Desktop 5-Tab Bar (max-w-5xl) */}
      <div className="hidden lg:block max-w-5xl w-full mx-auto px-4 pt-4">
        <div className="bg-white/95 dark:bg-slate-900/95 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-1.5 flex items-center gap-1.5 shadow-sm">
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
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition ${
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
            className="py-2.5 px-3.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition"
          >
            <i className="fa-solid fa-book-open text-[#00744B]" />
            <span>คู่มือการใช้งาน</span>
          </a>
        </div>
      </div>

      {/* Main Content Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-3 sm:p-4 space-y-3.5">
        {/* TAB 1 (or always on Mobile): Check-in Workspace */}
        {(desktopTab === 'checkin' || window.innerWidth < 1024) && (
          <div className={desktopTab !== 'checkin' ? 'lg:hidden space-y-3.5' : 'space-y-3.5'}>
            {/* Unified Status Banner (Green check-in / Red check-out + Big Clock) */}
            <div
              id="unifiedStatusBanner"
              className={`rounded-2xl p-3.5 sm:p-4 text-white shadow-md flex items-center justify-between gap-3 ${
                isCheckout
                  ? 'bg-gradient-to-r from-rose-700 to-red-600'
                  : 'bg-gradient-to-r from-[#00351B] via-[#00744B] to-[#00A368]'
              }`}
            >
              <div className="min-w-0">
                <span className="inline-block px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-extrabold mb-1">
                  {isCheckout ? 'สถานะ: รอลงเวลาออกงาน' : 'สถานะ: พร้อมลงเวลาเข้างาน'}
                </span>
                <p className="font-extrabold text-sm sm:text-base truncate">
                  {UIHelpers.formatThaiFullDate(todayIso)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p id="liveClockDisplay" className="font-mono font-extrabold text-2xl sm:text-3xl leading-none tracking-tight">
                  {hhmm}
                </p>
              </div>
            </div>

            {/* Cockpit 2-Column Side-by-Side 3:4 (#photoPreviewCard + #gpsSectionCard) */}
            <div className="grid grid-cols-2 gap-3 items-stretch">
              {/* Left: #photoPreviewCard */}
              <div
                id="photoPreviewCard"
                onClick={() => setCameraOpen(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setCameraOpen(true); }}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col cursor-pointer group"
              >
                <div className="px-3 py-2 bg-[#F1F3F5] dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-200">
                    <i className="fa-solid fa-camera text-[#00744B] mr-1" />ภาพถ่ายยืนยัน
                  </span>
                  {previewPhoto && <span className="text-[10px] font-bold text-emerald-600">พร้อมแล้ว ✓</span>}
                </div>
                <div className="relative flex-1 min-h-[140px] sm:min-h-[175px] bg-slate-900 flex flex-col items-center justify-center overflow-hidden">
                  {previewPhoto ? (
                    <img src={previewPhoto} alt="ภาพถ่ายยืนยัน" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-white/90 p-3 text-center">
                      <span className="w-12 h-12 rounded-full bg-[#00744B] group-hover:scale-110 transition shadow-lg flex items-center justify-center">
                        <i className="fa-solid fa-camera text-lg" />
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-white/15 text-[11px] font-bold">แตะเพื่อถ่ายรูป</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: #gpsSectionCard */}
              <EmbeddedMapCard
                coords={coords}
                locationName={locationName}
                geofence={geofence}
                loading={gpsLoading}
                error={gpsError}
                onRefreshGps={locate}
                onOpenFullMap={() => setViewGpsOpen(true)}
                settings={settings}
              />
            </div>

            {/* Work Mode Card ABOVE Shift Selection Card */}
            <ShiftSelectorCard
              settings={settings}
              availableShifts={availableShifts}
              selectedShiftName={selectedShiftName}
              onSelectShift={setSelectedShiftName}
              customShiftIn={customShiftIn}
              customShiftOut={customShiftOut}
              onCustomShiftInChange={setCustomShiftIn}
              onCustomShiftOutChange={setCustomShiftOut}
              activeCheckoutRecord={activeCheckoutRecord}
              locationMode={locationMode}
              onLocationModeChange={setLocationMode}
              offsiteJobType={offsiteJobType}
              onOffsiteJobTypeChange={setOffsiteJobType}
              offsiteCustomRemark={offsiteCustomRemark}
              onOffsiteCustomRemarkChange={setOffsiteCustomRemark}
              onRefreshGps={locate}
              onOpenOffsiteMap={() => { setMapPickerTarget('checkin'); setOffsiteMapOpen(true); }}
              geofence={geofence}
              normalHoursLocked={normalHoursLocked}
              onStartCheckin={handleStartCheckin}
              submitting={submitting}
            />
          </div>
        )}

        {/* TAB 2 (Desktop): Personal Attendance History Table (Floating Emerald Header) */}
        {desktopTab === 'history' && (
          <div className="hidden lg:block pt-5">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md overflow-visible">
              <div className="-mt-5 mx-4 px-5 py-3.5 rounded-2xl bg-gradient-to-r from-[#00744B] to-[#00A368] text-white shadow-lg flex items-center justify-between">
                <h2 className="font-extrabold text-sm"><i className="fa-solid fa-table-list mr-2" />ตารางประวัติการลงเวลาส่วนตัว (สูงสุด 30 รายการ)</h2>
                <div className="flex gap-1.5 text-xs font-bold">
                  <button type="button" onClick={() => { setHistoryScope('today'); setHistPage(1); }} className={`px-3 py-1 rounded-lg ${historyScope === 'today' ? 'bg-white text-[#00744B]' : 'bg-white/15 text-white'}`}>วันปัจจุบัน</button>
                  <button type="button" onClick={() => { setHistoryScope('past'); setHistPage(1); }} className={`px-3 py-1 rounded-lg ${historyScope === 'past' ? 'bg-white text-[#00744B]' : 'bg-white/15 text-white'}`}>ย้อนหลัง</button>
                </div>
              </div>
              <div className="p-4 overflow-x-auto">
                <table className="w-full text-xs text-left bma-table">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500">
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
                      <tr><td colSpan={6} className="py-8 text-center text-slate-400">ไม่มีรายการลงเวลา</td></tr>
                    ) : (
                      desktopPaginatedHistory.map((row) => (
                        <tr key={row.id}>
                          <td className="py-2.5 px-3 font-bold">{UIHelpers.formatThaiShortDate(row.work_date)}</td>
                          <td className="py-2.5 px-3">{row.shift_name}</td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-[#00744B]">{UIHelpers.formatTime24(row.check_in_time)}</td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-sky-600">{UIHelpers.formatTime24(row.check_out_time)}</td>
                          <td className="py-2.5 px-3 max-w-xs truncate">{row.check_in_location || '-'}</td>
                          <td className="py-2.5 px-3 text-center font-bold">{row.status}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <PaginationBar totalItems={desktopScopedHistory.length} page={histPage} pageSize={histPageSize} onPageChange={setHistPage} onPageSizeChange={(n) => { setHistPageSize(n); setHistPage(1); }} pageSizeOptions={[5, 10, 15, 20, 30]} />
            </div>
          </div>
        )}

        {/* TAB 3 (Desktop): Special Requests Table (Floating Purple Header) */}
        {desktopTab === 'special' && (
          <div className="hidden lg:block pt-5">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md overflow-visible">
              <div className="-mt-5 mx-4 px-5 py-3.5 rounded-2xl bg-gradient-to-r from-[#480080] to-[#7C3AED] text-white shadow-lg flex items-center justify-between">
                <h2 className="font-extrabold text-sm"><i className="fa-solid fa-file-signature mr-2" />ประวัติการขอลงเวลากรณีพิเศษ</h2>
                <button type="button" onClick={() => setSpecialModalOpen(true)} className="px-3.5 py-1.5 rounded-xl bg-white text-purple-800 text-xs font-extrabold">
                  + ยื่นคำขอกรณีพิเศษ
                </button>
              </div>
              <div className="p-4 overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500">
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
                      <tr><td colSpan={6} className="py-8 text-center text-slate-400">ยังไม่มีคำขอกรณีพิเศษ</td></tr>
                    ) : (
                      specialRequests.map((req) => (
                        <tr key={req.id}>
                          <td className="py-2.5 px-3 font-bold">{UIHelpers.formatThaiShortDate(req.work_date)}</td>
                          <td className="py-2.5 px-3">{req.shift_name} ({UIHelpers.formatTime24(req.check_in_time)}–{UIHelpers.formatTime24(req.check_out_time)})</td>
                          <td className="py-2.5 px-3 max-w-xs truncate">{req.check_in_location || '-'}</td>
                          <td className="py-2.5 px-3">{req.remark}</td>
                          <td className="py-2.5 px-3 text-center font-bold">{req.approval_status}</td>
                          <td className="py-2.5 px-3 text-center">
                            {req.approval_status === 'pending' && (
                              <button type="button" onClick={() => handleDeleteSpecial(req)} className="text-rose-600 hover:underline font-bold">ยกเลิก</button>
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

        {/* TAB 4 (Desktop): Time Correction Full 6-Column Table (Floating Dark Emerald Header) */}
        {desktopTab === 'correction' && (
          <div className="hidden lg:block pt-5">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md overflow-visible">
              <div className="-mt-5 mx-4 px-5 py-3.5 rounded-2xl bg-gradient-to-r from-[#00351B] to-[#00744B] text-white shadow-lg flex items-center justify-between">
                <h2 className="font-extrabold text-sm"><i className="fa-solid fa-clock-rotate-left mr-2" />รายการขอแก้ไขเวลาเข้า-ออกงาน</h2>
                <button type="button" onClick={() => setTimeCorrectionOpen(true)} className="px-3.5 py-1.5 rounded-xl bg-amber-400 text-slate-950 text-xs font-extrabold">
                  + ยื่นคำขอแก้ไขเวลา
                </button>
              </div>
              <div className="p-4 overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500">
                      <th className="py-2.5 px-3">วันที่</th>
                      <th className="py-2.5 px-3">กะปฏิบัติงาน</th>
                      <th className="py-2.5 px-3 text-center">เวลาเดิม (เข้า/ออก)</th>
                      <th className="py-2.5 px-3">สถานะเดิม</th>
                      <th className="py-2.5 px-3">สถานะคำขอ</th>
                      <th className="py-2.5 px-3 text-center">ดำเนินการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {correctionLogs.length === 0 ? (
                      <tr><td colSpan={6} className="py-8 text-center text-slate-400">ไม่มีรายการผิดปกติที่ต้องแก้ไขเวลา</td></tr>
                    ) : (
                      correctionLogs.map((log) => (
                        <tr key={log.id}>
                          <td className="py-2.5 px-3 font-bold">{UIHelpers.formatThaiShortDate(log.work_date)}</td>
                          <td className="py-2.5 px-3">{log.shift_name}</td>
                          <td className="py-2.5 px-3 text-center font-mono">{log.check_in_time || '--:--'} / {log.check_out_time || '--:--'}</td>
                          <td className="py-2.5 px-3 text-rose-600 font-bold">{log.status || log.status_label}</td>
                          <td className="py-2.5 px-3 font-bold">{log.correction_status || 'ยังไม่ยื่นคำขอ'}</td>
                          <td className="py-2.5 px-3 text-center">
                            {log.canRequestCorrection !== false && log.correction_status !== 'pending' && (
                              <button type="button" onClick={() => setTimeCorrectionOpen(true)} className="px-3 py-1 rounded-lg bg-amber-500 text-white font-bold">ยื่นคำขอ</button>
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
      </main>

      {/* Mobile Sticky Bottom Check-in Bar (.bma-sticky-checkin-bar) */}
      <div className="bma-sticky-checkin-bar sm:hidden fixed bottom-0 inset-x-0 z-30 p-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 shadow-2xl">
        <button
          type="button"
          disabled={submitting || normalHoursLocked || (!isCheckout && !selectedShiftName)}
          onClick={handleStartCheckin}
          className={`w-full py-3.5 rounded-2xl text-white font-extrabold text-sm shadow-lg flex items-center justify-center gap-2 transition disabled:opacity-45 ${
            isCheckout
              ? 'bg-gradient-to-r from-rose-700 to-red-600'
              : 'bg-gradient-to-r from-[#00351B] via-[#00744B] to-[#00A368]'
          }`}
        >
          <i className={`fa-solid ${submitting ? 'fa-circle-notch fa-spin' : settings?.require_photo ? 'fa-camera' : 'fa-check-circle'}`} />
          <span>{submitting ? 'กำลังบันทึก...' : isCheckout ? 'บันทึกเวลาออกงาน' : 'บันทึกเวลาเข้าปฏิบัติราชการ'}</span>
        </button>
      </div>

      {/* Footer */}
      <footer className="hidden sm:block bma-footer-bar text-center px-4 py-3 text-xs text-white/90 mt-auto">
        <span className="font-bold text-[#F6DE51]">{settings?.bureau_name || 'สำนักเทศกิจ'}</span>{' '}
        {settings?.organization_name || 'กรุงเทพมหานคร'} © พ.ศ. {yearBuddhist}
      </footer>

      {/* Mobile Off-Canvas Drawer */}
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
        onDeleteSpecialRequest={handleDeleteSpecial}
        onOpenSpecialRequest={() => setSpecialModalOpen(true)}
        onOpenTimeCorrection={() => setTimeCorrectionOpen(true)}
        onRefresh={loadPersonalData}
      />

      {/* Modals */}
      <FullscreenCameraModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        allowGalleryFallback={settings?.allow_gallery_fallback !== false}
        onConfirmPhoto={(dataUrl) => {
          setCameraOpen(false);
          setPreviewPhoto(dataUrl);
          if (isCheckout || selectedShiftName) {
            executeCheckinSubmission(dataUrl);
          }
        }}
      />

      <OffsiteMapSearchModal
        open={offsiteMapOpen}
        onClose={() => setOffsiteMapOpen(false)}
        initialCoords={coords ? { lat: coords.lat, lng: coords.lng, name: locationName } : null}
        onSelectPlace={(place) => {
          if (mapPickerTarget === 'special') {
            setSpecialPickedPlace(place);
          } else {
            setCoords({ lat: place.lat, lng: place.lng, accuracy: 10 });
            setLocationName(place.name || `${place.lat.toFixed(6)}, ${place.lng.toFixed(6)}`);
          }
        }}
      />

      <ViewGpsMapModal
        open={viewGpsOpen}
        onClose={() => setViewGpsOpen(false)}
        coords={coords}
        locationName={locationName}
        geofence={geofence}
        settings={settings}
      />

      <SpecialRequestModal
        open={specialModalOpen}
        onClose={() => setSpecialModalOpen(false)}
        user={user}
        settings={settings}
        currentCoords={coords}
        currentLocationName={locationName}
        customPickedPlace={specialPickedPlace}
        onOpenMapPicker={() => { setMapPickerTarget('special'); setOffsiteMapOpen(true); }}
        onSubmitted={loadPersonalData}
      />

      <TimeCorrectionModal
        open={timeCorrectionOpen}
        onClose={() => setTimeCorrectionOpen(false)}
        user={user}
        settings={settings}
        onSubmitted={loadPersonalData}
      />

      <SystemUpdateModal open={showUpdateModal} onClose={dismissModal} settings={settings} versionInfo={versionInfo} />
    </div>
  );
}
