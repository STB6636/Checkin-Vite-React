import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthService } from '../core/AuthService.js';
import { DatabaseService } from '../core/DatabaseService.js';
import { SettingsModel } from '../models/SettingsModel.js';
import { UIHelpers } from '../core/UIHelpers.js';
import { toSpaRoute } from '../utils/spaNavigation.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useSettings } from '../contexts/SettingsContext.jsx';

function readCachedBrand0ms() {
  try {
    const raw = localStorage.getItem('bma_cached_brand_v2_7');
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        organization_name: parsed.organization_name || parsed.orgName || 'กรุงเทพมหานคร',
        bureau_name: parsed.bureau_name || parsed.bureauName || 'สำนักเทศกิจ',
        header_system_title: parsed.header_system_title || parsed.systemTitle || 'BMA e-Government Time Attendance System',
        logo_url: parsed.logo_url || parsed.logoUrl || '',
      };
    }
  } catch (_) {}
  return {
    organization_name: 'กรุงเทพมหานคร',
    bureau_name: 'สำนักเทศกิจ',
    header_system_title: 'BMA e-Government Time Attendance System',
    logo_url: '',
  };
}

/**
 * Native React LoadingPage — 100% Visual Parity with legacy loading.html (L302-436)
 * - Uses .ld-card (max-w-sm) + top login-card-header-gradient h-1.5
 * - Uses .logo-stage + .halo-ring + .logo-frame
 * - Order: organization_name -> bureau_name
 * - Uses .ld-chip + .ld-bar (160px x 4px)
 */
export default function LoadingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const entryMode = searchParams.get('entry') || 'session';
  const { refreshUser, logout } = useAuth();
  const { reloadSettings } = useSettings();

  const [brand, setBrand] = useState(readCachedBrand0ms);
  const [statusText, setStatusText] = useState('กำลังตรวจสอบสิทธิ์การเข้าใช้งาน...');
  const [errorState, setErrorState] = useState('');
  const [runCounter, setRunCounter] = useState(0);
  const watchdogRef = useRef(null);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const runBootSequence = useCallback(async () => {
    let alive = true;
    const startTime = performance.now();
    setErrorState('');
    setStatusText('กำลังตรวจสอบ Session ผู้ใช้งาน...');

    clearWatchdog();
    watchdogRef.current = window.setTimeout(() => {
      if (alive) {
        setErrorState('ใช้เวลาเชื่อมต่อนานผิดปกติ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง');
      }
    }, 15000);

    try {
      const sessionUser = AuthService.getCurrentUser(true);
      if (!sessionUser) {
        clearWatchdog();
        navigate('/', { replace: true });
        return;
      }

      setStatusText('กำลังเชื่อมต่อฐานข้อมูล Supabase...');
      const dbOk = await DatabaseService.getInstance().checkConnection();
      if (!dbOk) {
        throw new Error('ไม่สามารถเชื่อมต่อฐานข้อมูลได้ในขณะนี้');
      }

      setStatusText('กำลังโหลดการตั้งค่าหน่วยงาน...');
      const [validSession, freshSettings] = await Promise.all([
        AuthService.verifySessionWithDatabase(),
        SettingsModel.getSettings(false).catch(() => null),
      ]);

      if (!validSession) {
        clearWatchdog();
        logout();
        navigate('/', { replace: true });
        return;
      }

      if (freshSettings) {
        setBrand({
          organization_name: freshSettings.organization_name || 'กรุงเทพมหานคร',
          bureau_name: freshSettings.bureau_name || 'สำนักเทศกิจ',
          header_system_title: freshSettings.header_system_title || 'BMA e-Government Time Attendance System',
          logo_url: freshSettings.logo_url || '',
        });
        reloadSettings(false);
      }
      refreshUser();

      setStatusText('เตรียมหน้าจอพร้อมใช้งาน...');

      const elapsed = performance.now() - startTime;
      const minFloor = entryMode === 'login' ? 650 : 350;
      if (elapsed < minFloor) {
        await new Promise((r) => window.setTimeout(r, minFloor - elapsed));
      }

      clearWatchdog();

      const latestUser = AuthService.getCurrentUser(false) || sessionUser;
      let targetLegacy = AuthService.getRedirectUrlForSession(latestUser);
      if (!targetLegacy || targetLegacy.includes('loading.html')) {
        targetLegacy = latestUser.last_login_mode === 'admin' && ['SuperAdmin', 'Admin'].includes(latestUser.role)
          ? 'dashboard.html'
          : 'checkin.html';
      }
      navigate(toSpaRoute(targetLegacy), { replace: true });
    } catch (err) {
      clearWatchdog();
      setErrorState(err?.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูลระบบ');
    }

    return () => {
      alive = false;
      clearWatchdog();
    };
  }, [clearWatchdog, entryMode, logout, navigate, refreshUser, reloadSettings]);

  useEffect(() => {
    runBootSequence();
    return () => clearWatchdog();
  }, [runBootSequence, runCounter, clearWatchdog]);

  const logoUrl = brand?.logo_url ? (UIHelpers.verifyImageUrl(brand.logo_url)?.url || brand.logo_url) : '';

  return (
    <div className="login-vertical-gradient min-h-[100dvh] w-full flex items-center justify-center p-4">
      <div className="ld-card w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl text-center">
        <div className="login-card-header-gradient h-1.5 w-full" />
        <div className="px-6 py-8 flex flex-col items-center">
          {/* Original .logo-stage + .halo-ring + .logo-frame */}
          <div className="logo-stage mb-4">
            <div className="halo-ring" />
            <div className="logo-frame">
              {logoUrl ? (
                <img src={logoUrl} alt="ตราสัญลักษณ์หน่วยงาน" className="w-full h-full object-contain" />
              ) : (
                <i className="fa-solid fa-landmark text-4xl text-[#00744B]" />
              )}
            </div>
          </div>

          <h1 className="text-base font-extrabold text-slate-800 dark:text-white tracking-tight">
            {brand.organization_name || 'กรุงเทพมหานคร'}
          </h1>
          <p className="text-sm font-bold text-[#00744B] dark:text-[#00C08A] mt-0.5">
            {brand.bureau_name || 'สำนักเทศกิจ'}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {brand.header_system_title}
          </p>

          {!errorState ? (
            <div className="mt-6 flex flex-col items-center gap-3 w-full">
              <div className="ld-chip inline-flex items-center gap-2 text-xs font-bold">
                <i className="fa-solid fa-circle-notch fa-spin text-[#00744B]" />
                <span>{statusText}</span>
              </div>
              <div className="ld-bar" />
            </div>
          ) : (
            <div className="mt-5 w-full p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 space-y-3">
              <p className="text-xs text-rose-700 dark:text-rose-200 font-semibold">{errorState}</p>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setRunCounter((c) => c + 1)}
                  className="px-4 py-2 rounded-full bg-[#00744B] text-white font-bold text-xs hover:bg-[#005a3a] transition"
                >
                  <i className="fa-solid fa-rotate-right mr-1.5" />ลองใหม่อีกครั้ง
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearWatchdog();
                    logout();
                    navigate('/', { replace: true });
                  }}
                  className="px-4 py-2 rounded-full border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-bold text-xs transition"
                >
                  กลับหน้าเข้าสู่ระบบ
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
