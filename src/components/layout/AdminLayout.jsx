import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  useMemo,
  Suspense,
} from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useSettings } from '../../contexts/SettingsContext.jsx';
import { useTheme } from '../../contexts/ThemeContext.jsx';
import { useAdminRealtimeSync } from '../../hooks/useAdminRealtimeSync.js';
import { useSystemUpdateCheck } from '../../hooks/useSystemUpdateCheck.js';
import { AttendanceModel } from '../../models/AttendanceModel.js';
import { UserModel } from '../../models/UserModel.js';
import { UIHelpers } from '../../core/UIHelpers.js';
import { SystemUpdateModal, sanitizeImageUrl } from './SystemUpdateModal.jsx';

export const AdminLayoutContext = createContext(null);

export const ROUTE_META_MAP = {
  '/dashboard': {
    activePage: 'dashboard',
    title: 'ภาพรวมการลงเวลาปฏิบัติราชการ',
    subtitle: '',
  },
  '/reports': {
    activePage: 'reports',
    title: 'รายงานการลงเวลาปฏิบัติราชการ',
    subtitle: 'รายงาน 5 หมวดหมู่ แยกตารางตาม TAG สถานะ พิกัด GPS แยกเข้า-ออก พร้อมส่งออก Excel และพิมพ์ PDF แนวนอน A4',
  },
  '/approvals': {
    activePage: 'approvals',
    title: 'อนุมัติคำขอลงเวลากรณีพิเศษ',
    subtitle: 'พิจารณาคำขอลงเวลานอกสถานที่ / กรณีพิเศษในขอบเขตสังกัด',
  },
  '/time-corrections': {
    activePage: 'time-corrections',
    title: 'อนุมัติคำขอแก้ไขเวลาเข้า-ออกงาน',
    subtitle: 'ปรับเฉพาะขาที่ผิดปกติพร้อม Double-Layer Executive RBAC (ADR-0039)',
  },
  '/personnel': {
    activePage: 'personnel',
    title: 'จัดการข้อมูลบุคลากร',
    subtitle: '',
  },
  '/users': {
    activePage: 'users',
    title: 'จัดการบัญชีผู้ใช้งานและสิทธิ์การเข้าถึง',
    subtitle: '',
  },
  '/settings': {
    activePage: 'settings',
    title: 'ตั้งค่าระบบพื้นฐาน (สำหรับ SuperAdmin)',
    subtitle: 'จัดการหน่วยงาน, เวลาเริ่มเข้างาน, เกณฑ์เวลาออกงาน, กรองกะตามเวลาจริง และโครงสร้างแม่-ลูก',
  },
};

/**
 * AdminMainSkeleton — 100% Visual Parity with legacy AppLayout.renderMainSkeleton() (AppLayout.js:224-262)
 * Renders ONLY inside <main> during lazy chunk transitions while Sidebar, Topbar, Bottom Nav & Footer stay persistent.
 */
export function AdminMainSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Floating Header Skeleton */}
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200/80 dark:border-slate-700/60 mt-8 mb-6 p-6">
        <div className="-mt-12 mx-2 rounded-2xl p-5 bg-slate-200 dark:bg-slate-700 bma-skeleton-shimmer h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-slate-300 dark:bg-slate-600" />
            <div className="space-y-2">
              <div className="w-48 h-4 rounded-md bg-slate-300 dark:bg-slate-600" />
              <div className="w-72 h-3 rounded-md bg-slate-300 dark:bg-slate-600 hidden sm:block" />
            </div>
          </div>
          <div className="hidden sm:flex gap-2">
            <div className="w-28 h-9 rounded-xl bg-slate-300 dark:bg-slate-600" />
            <div className="w-28 h-9 rounded-xl bg-slate-300 dark:bg-slate-600" />
          </div>
        </div>

        {/* Filters Skeleton */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-10 rounded-xl bg-slate-100 dark:bg-slate-700/50 bma-skeleton-shimmer" />
          <div className="h-10 rounded-xl bg-slate-100 dark:bg-slate-700/50 bma-skeleton-shimmer" />
          <div className="h-10 rounded-xl bg-slate-100 dark:bg-slate-700/50 bma-skeleton-shimmer" />
        </div>

        {/* Table Rows Skeleton */}
        <div className="mt-6 space-y-3">
          <div className="h-12 rounded-xl bg-slate-100 dark:bg-slate-700/60 bma-skeleton-shimmer" />
          <div className="h-14 rounded-xl bg-slate-50 dark:bg-slate-800/60 bma-skeleton-shimmer" />
          <div className="h-14 rounded-xl bg-slate-50 dark:bg-slate-800/60 bma-skeleton-shimmer" />
          <div className="h-14 rounded-xl bg-slate-50 dark:bg-slate-800/60 bma-skeleton-shimmer" />
          <div className="h-14 rounded-xl bg-slate-50 dark:bg-slate-800/60 bma-skeleton-shimmer" />
          <div className="h-14 rounded-xl bg-slate-50 dark:bg-slate-800/60 bma-skeleton-shimmer" />
        </div>
      </div>
    </div>
  );
}

/**
 * Persistent Admin SPA Shell — keeps Sidebar, Topbar, Mobile Bottom Nav, Footer, Notification Bell,
 * and Tri-Layer Realtime Sync mounted 100% permanently across all 7 Admin routes (AppLayout.js parity).
 */
export function AdminShell({
  defaultTitle = '',
  defaultSubtitle = '',
  defaultActivePage = 'dashboard',
  defaultOnRealtimeSync = null,
  children,
}) {
  const { user, isSuperAdmin, canViewUsersMenu, scopeLabel, logout } = useAuth();
  const { settings } = useSettings();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState('');
  const [quickOpen, setQuickOpen] = useState(false);
  const bellRef = useRef(null);
  const quickRef = useRef(null);

  const [headerOverride, setHeaderOverride] = useState({
    path: '',
    title: defaultTitle,
    subtitle: defaultSubtitle,
    activePage: defaultActivePage,
  });
  const realtimeSyncRef = useRef(defaultOnRealtimeSync);

  const [counts, setCounts] = useState({
    specialRequests: 0,
    timeCorrections: 0,
    passwordResets: 0,
    pendingSpecialList: [],
    pendingCorrectionList: [],
  });

  const { versionInfo, showUpdateModal, openUpdateModal, dismissModal } = useSystemUpdateCheck(settings);

  const routeDefault = ROUTE_META_MAP[location.pathname] || {
    activePage: defaultActivePage || 'dashboard',
    title: defaultTitle || 'ภาพรวมการลงเวลาปฏิบัติราชการ',
    subtitle: defaultSubtitle || '',
  };

  const isOverrideForCurrentPath = headerOverride.path === location.pathname;
  const title = isOverrideForCurrentPath && headerOverride.title ? headerOverride.title : routeDefault.title;
  const subtitle =
    isOverrideForCurrentPath && headerOverride.subtitle !== undefined
      ? headerOverride.subtitle
      : routeDefault.subtitle;
  const activePage =
    isOverrideForCurrentPath && headerOverride.activePage ? headerOverride.activePage : routeDefault.activePage;

  useEffect(() => {
    if (title) {
      document.title = `${title} - กรุงเทพมหานคร`;
    }
  }, [title]);

  useEffect(() => {
    const cleanRoute = location.pathname.replace(/^\/+/, '');
    if (cleanRoute && cleanRoute !== 'loading' && cleanRoute !== 'login') {
      UIHelpers.maskUrlToRoot(`${cleanRoute}.html`);
    }
  }, [location.pathname]);

  useEffect(() => {
    try {
      const welcomeName = sessionStorage.getItem('bma_checkin_welcome_toast_v2_7');
      if (welcomeName) {
        sessionStorage.removeItem('bma_checkin_welcome_toast_v2_7');
        UIHelpers.showToast(`ยินดีต้อนรับ ${welcomeName}`, 'success', 2800);
      }
    } catch (_) {}
  }, []);

  // Background Idle Preload of all 7 Admin page chunks so switching menus is 0ms instantaneous
  useEffect(() => {
    const preloadChunks = () => {
      import('../../pages/DashboardPage.jsx').catch(() => {});
      import('../../pages/ReportsPage.jsx').catch(() => {});
      import('../../pages/ApprovalsPage.jsx').catch(() => {});
      import('../../pages/TimeCorrectionsPage.jsx').catch(() => {});
      import('../../pages/PersonnelPage.jsx').catch(() => {});
      import('../../pages/UsersPage.jsx').catch(() => {});
      import('../../pages/SettingsPage.jsx').catch(() => {});
    };

    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(preloadChunks, { timeout: 1200 });
      return () => window.cancelIdleCallback(idleId);
    }
    const timer = setTimeout(preloadChunks, 300);
    return () => clearTimeout(timer);
  }, []);

  const refreshNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const [specials, corrections, resets] = await Promise.all([
        AttendanceModel.getSpecialRequests(user, 'pending').catch(() => []),
        AttendanceModel.getTimeCorrectionRequests(user, 'pending').catch(() => []),
        canViewUsersMenu ? UserModel.getPendingPasswordResetRequests(user).catch(() => []) : Promise.resolve([]),
      ]);
      setCounts({
        specialRequests: specials.length,
        timeCorrections: corrections.length,
        passwordResets: resets.length,
        pendingSpecialList: specials.slice(0, 4),
        pendingCorrectionList: corrections.slice(0, 4),
      });
    } catch (_) {}
  }, [user, canViewUsersMenu]);

  useEffect(() => {
    refreshNotifications();
  }, [refreshNotifications]);

  useAdminRealtimeSync({
    enabled: Boolean(user),
    onSync: (reason) => {
      refreshNotifications();
      if (typeof realtimeSyncRef.current === 'function') {
        realtimeSyncRef.current(reason);
      }
    },
  });

  useEffect(() => {
    const onDown = (e) => {
      if (bellOpen && bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false);
      if (quickOpen && quickRef.current && !quickRef.current.contains(e.target)) setQuickOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [bellOpen, quickOpen]);

  const setHeaderMeta = useCallback((meta) => {
    setHeaderOverride((prev) => {
      if (
        prev.path === meta.path &&
        prev.title === meta.title &&
        prev.subtitle === meta.subtitle &&
        prev.activePage === meta.activePage
      ) {
        return prev;
      }
      return meta;
    });
  }, []);

  const registerRealtimeSync = useCallback((fn) => {
    realtimeSyncRef.current = fn;
    return () => {
      if (realtimeSyncRef.current === fn) {
        realtimeSyncRef.current = null;
      }
    };
  }, []);

  const shellContextValue = useMemo(
    () => ({
      setHeaderMeta,
      registerRealtimeSync,
      refreshNotifications,
    }),
    [setHeaderMeta, registerRealtimeSync, refreshNotifications]
  );

  const handleLogout = async () => {
    const ok = await UIHelpers.confirm('ออกจากระบบ', 'คุณต้องการออกจากระบบผู้ดูแลใช่หรือไม่?', 'ออกจากระบบ', 'warning');
    if (!ok) return;
    logout();
    navigate('/', { replace: true });
  };

  const handleNavLinkClick = (e, targetTo) => {
    setMobileMenuOpen(false);
    if (location.pathname === targetTo) {
      e.preventDefault();
    }
  };

  // Exact original 7-item order from AppLayout.js
  const navItems = useMemo(() => [
    { id: 'dashboard', to: '/dashboard', label: 'ภาพรวมการลงเวลา', shortLabel: 'ภาพรวม', icon: 'fa-chart-line', iconBg: 'bg-emerald-500/15 text-emerald-400', badge: 0, show: true, keywords: 'dashboard ภาพรวม สรุป' },
    { id: 'reports', to: '/reports', label: 'รายงานการลงเวลา', shortLabel: 'รายงาน', icon: 'fa-file-lines', iconBg: 'bg-sky-500/15 text-sky-400', badge: 0, show: true, keywords: 'reports รายงาน excel pdf พิมพ์' },
    { id: 'approvals', to: '/approvals', label: 'อนุมัติกรณีพิเศษ', shortLabel: 'กรณีพิเศษ', icon: 'fa-clipboard-check', iconBg: 'bg-indigo-500/15 text-indigo-400', badge: counts.specialRequests, show: true, keywords: 'approvals อนุมัติ กรณีพิเศษ นอกสถานที่' },
    { id: 'time-corrections', to: '/time-corrections', label: 'อนุมัติแก้ไขเวลา', shortLabel: 'แก้เวลา', icon: 'fa-clock-rotate-left', iconBg: 'bg-amber-500/15 text-amber-400', badge: counts.timeCorrections, show: true, keywords: 'time corrections แก้ไขเวลา มาสาย' },
    { id: 'personnel', to: '/personnel', label: 'ทะเบียนประวัติบุคลากร', shortLabel: 'บุคลากร', icon: 'fa-id-card', iconBg: 'bg-teal-500/15 text-teal-400', badge: 0, show: true, keywords: 'personnel บุคลากร พนักงาน exceljs' },
    { id: 'users', to: '/users', label: 'จัดการบัญชีผู้ใช้งาน', shortLabel: 'ผู้ใช้งาน', icon: 'fa-users-gear', iconBg: 'bg-purple-500/15 text-purple-400', badge: counts.passwordResets, show: canViewUsersMenu, keywords: 'users บัญชีผู้ใช้ รีเซ็ตรหัสผ่าน rbac' },
    { id: 'settings', to: '/settings', label: 'ตั้งค่าระบบ', shortLabel: 'ตั้งค่า', icon: 'fa-gears', iconBg: 'bg-rose-500/15 text-rose-400', badge: 0, show: isSuperAdmin, keywords: 'settings ตั้งค่า กะ สถานที่ ประกาศ' },
  ].filter((item) => item.show), [counts, canViewUsersMenu, isSuperAdmin]);

  const quickNavResults = useMemo(() => {
    const q = quickQuery.trim().toLowerCase();
    const allTargets = [
      ...navItems,
      { id: 'checkin', to: '/checkin', label: 'หน้าลงเวลาปฏิบัติราชการ', icon: 'fa-fingerprint', iconBg: 'bg-emerald-500/15 text-emerald-400', keywords: 'checkin ลงเวลา เข้างาน ออกงาน' },
    ];
    if (!q) return allTargets;
    return allTargets.filter((t) => `${t.label} ${t.keywords || ''}`.toLowerCase().includes(q));
  }, [navItems, quickQuery]);

  const totalPending = counts.specialRequests + counts.timeCorrections + counts.passwordResets;
  const yearBuddhist = new Date().getFullYear() + 543;
  const logoUrl = sanitizeImageUrl(settings?.logo_url) || settings?.logo_url || '';
  const initials = (user?.full_name || user?.username || 'A').trim().slice(0, 2);

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full bg-[#111827] dark:bg-[#0B132B] text-slate-100 border-r border-slate-800/80">
      {/* Brand Header (Line 1: organization_name -> Line 2: bureau_name) */}
      <div className="px-4 py-4 border-b border-slate-800 flex items-center gap-3">
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="w-10 h-10 rounded-xl object-contain bg-white/10 p-1 border border-white/15 shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-xl bg-emerald-600/25 border border-emerald-400/30 flex items-center justify-center shrink-0">
            <i className="fa-solid fa-landmark text-emerald-300 text-lg" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-emerald-400 truncate">{settings?.organization_name || 'กรุงเทพมหานคร'}</p>
          <p className="font-extrabold text-sm text-white truncate">{settings?.bureau_name || 'สำนักเทศกิจ'}</p>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center"
        >
          <i className="fa-solid fa-xmark" />
        </button>
      </div>

      {/* Capsule User Profile Card with Circular Avatar */}
      <div className="px-3.5 py-3 border-b border-slate-800/80">
        <div className="p-2.5 rounded-2xl bg-slate-800/70 border border-slate-700/70 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 text-white font-extrabold text-xs flex items-center justify-center shrink-0 shadow-md border border-white/20">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-xs text-white truncate">{user?.full_name || user?.username}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${isSuperAdmin ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30' : 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30'}`}>
                {user?.role}
              </span>
              <span className="text-[10px] text-slate-400 truncate" title={scopeLabel}>{scopeLabel}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        <p className="px-3 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          เมนูระบบบริหารจัดการ
        </p>

        {navItems.map((item) => (
          <NavLink
            key={item.id}
            to={item.to}
            onClick={(e) => handleNavLinkClick(e, item.to)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition ${
                isActive || activePage === item.id
                  ? 'bg-gradient-to-r from-[#00744B] to-[#00A368] text-white shadow-md shadow-emerald-950/60'
                  : 'text-slate-300 hover:bg-white/6 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs shrink-0 ${isActive || activePage === item.id ? 'bg-white/20 text-white' : item.iconBg}`}>
                  <i className={`fa-solid ${item.icon}`} />
                </span>
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-bold flex items-center justify-center">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}

        {/* Bottom Utility Links (Original order: Manual -> Check-in) */}
        <div className="pt-3 mt-3 border-t border-slate-800 space-y-1">
          <a
            href="./docs/manual/index.html"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold text-slate-300 hover:bg-white/6 hover:text-white transition"
          >
            <span className="w-7 h-7 rounded-lg bg-slate-700/70 text-slate-300 flex items-center justify-center text-xs shrink-0">
              <i className="fa-solid fa-book-open" />
            </span>
            <span className="flex-1 truncate">คู่มือการใช้งานระบบ</span>
            <i className="fa-solid fa-arrow-up-right-from-square text-[10px] opacity-70" />
          </a>
          <NavLink
            to="/checkin"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold text-emerald-300 hover:bg-emerald-900/35 hover:text-white transition"
          >
            <span className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-300 flex items-center justify-center text-xs shrink-0">
              <i className="fa-solid fa-fingerprint" />
            </span>
            <span className="flex-1 truncate">ไปหน้าลงเวลาปฏิบัติราชการ</span>
          </NavLink>
        </div>
      </nav>

      {/* Sidebar Footer: Version + Outline Logout */}
      <div className="p-3 border-t border-slate-800 space-y-2">
        <button
          type="button"
          onClick={openUpdateModal}
          className="w-full px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] text-slate-300 flex items-center justify-between transition"
        >
          <span><i className="fa-solid fa-code-branch text-emerald-400 mr-1.5" />{versionInfo.appVersion}</span>
          <span className="font-mono opacity-75">{versionInfo.buildId ? versionInfo.buildId.slice(-8) : 'Vite'}</span>
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border border-rose-500/35 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-white text-sm font-bold transition"
        >
          <i className="fa-solid fa-right-from-bracket" />
          <span>ออกจากระบบ</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#E7ECE9] dark:bg-[#0B132B] text-slate-800 dark:text-slate-100">
      {/* Desktop Sidebar w-72 */}
      <aside className="hidden lg:block w-72 shrink-0 sticky top-0 h-screen shadow-xl z-30">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[9980] lg:hidden flex">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-72 max-w-[85vw] h-full shadow-2xl z-10">
            {renderSidebarContent()}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen pb-16 lg:pb-0">
        {/* Sticky Topbar */}
        <header className="sticky top-0 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          {/* Left: Hamburger + House Breadcrumb */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="เปิดเมนู"
            >
              <i className="fa-solid fa-bars-staggered" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <button type="button" onClick={() => navigate('/dashboard')} className="hover:text-emerald-600 transition" title="ภาพรวม">
                  <i className="fa-solid fa-house" />
                </button>
                <span>/</span>
                <span className="text-emerald-700 dark:text-emerald-400 font-bold truncate">{title}</span>
              </div>
              <h1 className="text-base sm:text-lg font-extrabold text-slate-800 dark:text-white truncate leading-tight">
                {title}
              </h1>
              {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 truncate hidden sm:block">{subtitle}</p>}
            </div>
          </div>

          {/* Right: Quick Nav Search (Option A) -> Notification Bell (4-item preview) -> Theme Pill with Label */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Option A: Quick Navigation Search */}
            <div className="relative hidden md:block" ref={quickRef}>
              <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
              <input
                type="text"
                value={quickQuery}
                onFocus={() => setQuickOpen(true)}
                onChange={(e) => { setQuickQuery(e.target.value); setQuickOpen(true); }}
                placeholder="ค้นหาเมนู / ไปยังหน้า..."
                className="w-52 lg:w-60 pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 outline-none"
              />
              {quickOpen && (
                <div className="absolute right-0 mt-1.5 w-64 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden z-50">
                  <div className="px-3 py-2 text-[10px] font-bold text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    ทางลัดไปยังหน้าต่างๆ
                  </div>
                  <div className="max-h-60 overflow-y-auto p-1.5 space-y-0.5">
                    {quickNavResults.length === 0 ? (
                      <p className="text-center text-xs text-slate-400 py-3">ไม่พบเมนูที่ค้นหา</p>
                    ) : (
                      quickNavResults.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setQuickOpen(false);
                            setQuickQuery('');
                            if (location.pathname !== item.to) {
                              navigate(item.to);
                            }
                          }}
                          className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-emerald-50 dark:hover:bg-slate-800 flex items-center gap-2.5 text-xs font-semibold transition"
                        >
                          <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] ${item.iconBg}`}>
                            <i className={`fa-solid ${item.icon}`} />
                          </span>
                          <span className="truncate">{item.label}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Notification Bell (with 4-item Previews per AppLayout.js:812-889) */}
            <div className="relative" ref={bellRef}>
              <button
                type="button"
                onClick={() => setBellOpen((v) => !v)}
                className="relative w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-200 transition"
                aria-label="แจ้งเตือนรออนุมัติ"
              >
                <i className="fa-solid fa-bell" />
                {totalPending > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
                    {totalPending > 99 ? '99+' : totalPending}
                  </span>
                )}
              </button>

              {bellOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 max-w-[92vw] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-800 dark:text-white">
                      <i className="fa-solid fa-bell text-emerald-600 mr-1.5" />แจ้งเตือนรออนุมัติ
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300">
                      {totalPending} รายการ
                    </span>
                  </div>
                  <div className="p-3 space-y-2.5 max-h-[65dvh] overflow-y-auto">
                    {totalPending === 0 ? (
                      <p className="text-center text-xs text-slate-400 py-6">ไม่มีรายการรออนุมัติในขณะนี้</p>
                    ) : (
                      <>
                        {counts.specialRequests > 0 && (
                          <div className="rounded-xl border border-indigo-200/80 dark:border-indigo-900/60 overflow-hidden">
                            <button
                              type="button"
                              onClick={() => { setBellOpen(false); navigate('/approvals'); }}
                              className="w-full px-3 py-2 bg-indigo-50/80 dark:bg-indigo-950/40 flex items-center justify-between text-xs font-extrabold text-indigo-800 dark:text-indigo-200"
                            >
                              <span><i className="fa-solid fa-clipboard-check mr-1.5" />คำขอกรณีพิเศษรออนุมัติ</span>
                              <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[10px]">{counts.specialRequests}</span>
                            </button>
                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                              {counts.pendingSpecialList.map((item) => {
                                const p = item.personnel || {};
                                const name = `${p.prefix || ''}${p.first_name || ''} ${p.last_name || ''}`.trim() || '-';
                                return (
                                  <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => { setBellOpen(false); navigate('/approvals'); }}
                                    className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition flex items-start justify-between gap-2 text-xs"
                                  >
                                    <div className="min-w-0">
                                      <p className="font-bold truncate">{name}</p>
                                      <p className="text-[11px] text-slate-500 truncate">{p.division || '-'} · {item.remark || '-'}</p>
                                    </div>
                                    <span className="text-[10px] font-bold text-indigo-600 whitespace-nowrap shrink-0">
                                      {UIHelpers.formatThaiShortDate(item.work_date)}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {counts.timeCorrections > 0 && (
                          <div className="rounded-xl border border-amber-200/80 dark:border-amber-900/60 overflow-hidden">
                            <button
                              type="button"
                              onClick={() => { setBellOpen(false); navigate('/time-corrections'); }}
                              className="w-full px-3 py-2 bg-amber-50/80 dark:bg-amber-950/40 flex items-center justify-between text-xs font-extrabold text-amber-800 dark:text-amber-200"
                            >
                              <span><i className="fa-solid fa-clock-rotate-left mr-1.5" />คำขอแก้ไขเวลารออนุมัติ</span>
                              <span className="px-2 py-0.5 rounded-full bg-amber-600 text-white text-[10px]">{counts.timeCorrections}</span>
                            </button>
                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                              {counts.pendingCorrectionList.map((item) => {
                                const p = item.personnel || {};
                                const name = `${p.prefix || ''}${p.first_name || ''} ${p.last_name || ''}`.trim() || '-';
                                return (
                                  <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => { setBellOpen(false); navigate('/time-corrections'); }}
                                    className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition flex items-start justify-between gap-2 text-xs"
                                  >
                                    <div className="min-w-0">
                                      <p className="font-bold truncate">{name}</p>
                                      <p className="text-[11px] text-slate-500 truncate">{p.division || '-'} · {item.correction_request_reason || '-'}</p>
                                    </div>
                                    <span className="text-[10px] font-bold text-amber-600 whitespace-nowrap shrink-0">
                                      {UIHelpers.formatThaiShortDate(item.work_date)}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {counts.passwordResets > 0 && (
                          <button
                            type="button"
                            onClick={() => { setBellOpen(false); navigate('/users?tab=password-resets'); }}
                            className="w-full text-left p-3 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/30 hover:bg-rose-50 transition flex items-center justify-between gap-2"
                          >
                            <span className="text-xs font-extrabold text-rose-800 dark:text-rose-200">
                              <i className="fa-solid fa-key mr-1.5" />คำขอรีเซ็ตรหัสผ่าน
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-600 text-white">
                              {counts.passwordResets} รายการ
                            </span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Theme Toggle Pill with Label */}
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-amber-300 transition"
            >
              <i className={`fa-solid ${isDark ? 'fa-sun' : 'fa-moon'}`} />
              <span className="hidden sm:inline">{isDark ? 'โหมดสว่าง' : 'โหมดถนอมสายตา'}</span>
            </button>
          </div>
        </header>

        {/* Page Body — inner Suspense shows AdminMainSkeleton ONLY inside <main> while shell stays persistent */}
        <AdminLayoutContext.Provider value={shellContextValue}>
          <main className="flex-1 p-4 sm:p-6 max-w-[1600px] w-full mx-auto">
            <Suspense fallback={<AdminMainSkeleton />}>
              {children || <Outlet />}
            </Suspense>
          </main>
        </AdminLayoutContext.Provider>

        {/* Original Centered .bma-footer-bar (All Viewports) */}
        <footer className="bma-footer-bar text-center px-4 py-3 text-xs border-t border-slate-200/70 dark:border-slate-800 mt-auto">
          <p className="font-semibold text-slate-600 dark:text-slate-300">
            <span className="text-[#00744B] dark:text-[#00C08A] font-bold">{settings?.bureau_name || 'สำนักเทศกิจ'}</span>{' '}
            {settings?.organization_name || 'กรุงเทพมหานคร'} © พ.ศ. {yearBuddhist}
          </p>
          {settings?.footer_description && (
            <p className="text-[11px] text-slate-400 mt-0.5">{settings.footer_description}</p>
          )}
        </footer>
      </div>

      {/* Mobile Bottom Navigation (Exact Sidebar Order, Text/Icon color active) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-1 py-1.5 flex items-center justify-around shadow-2xl">
        {navItems.slice(0, 7).map((item) => (
          <NavLink
            key={item.id}
            to={item.to}
            onClick={(e) => handleNavLinkClick(e, item.to)}
            className={({ isActive }) =>
              `relative flex flex-col items-center justify-center px-1 py-1 text-[10px] font-bold transition min-w-0 flex-1 ${
                isActive || activePage === item.id
                  ? 'text-[#00744B] dark:text-[#00C08A]'
                  : 'text-slate-500 dark:text-slate-400'
              }`
            }
          >
            <i className={`fa-solid ${item.icon} text-sm mb-0.5`} />
            <span className="truncate max-w-full">{item.shortLabel}</span>
            {item.badge > 0 && (
              <span className="absolute top-0 right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                {item.badge > 9 ? '9+' : item.badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <SystemUpdateModal open={showUpdateModal} onClose={dismissModal} settings={settings} versionInfo={versionInfo} />
    </div>
  );
}

/**
 * AdminLayout — Lightweight Page-to-Shell Bridge
 * When rendered inside <AdminShell /> (all 7 Admin routes), it syncs title, subtitle, activePage,
 * and onRealtimeSync into the persistent shell without re-mounting the Sidebar, Topbar, Bottom Nav, or Footer.
 */
export function AdminLayout({ title, subtitle = '', activePage = 'dashboard', onRealtimeSync, children }) {
  const shellCtx = useContext(AdminLayoutContext);
  const location = useLocation();

  useLayoutEffect(() => {
    if (!shellCtx) return;
    shellCtx.setHeaderMeta({
      path: location.pathname,
      title,
      subtitle,
      activePage,
    });
  }, [shellCtx, location.pathname, title, subtitle, activePage]);

  useEffect(() => {
    if (!shellCtx) return undefined;
    return shellCtx.registerRealtimeSync(onRealtimeSync);
  }, [shellCtx, onRealtimeSync]);

  if (shellCtx) {
    return <>{children}</>;
  }

  return (
    <AdminShell
      defaultTitle={title}
      defaultSubtitle={subtitle}
      defaultActivePage={activePage}
      defaultOnRealtimeSync={onRealtimeSync}
    >
      {children}
    </AdminShell>
  );
}
