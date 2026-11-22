import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';

/**
 * MobileShortcutGrid (#mobileShortcutContainer / #reportMobileShortcutContainer)
 * 8 iOS-style quick-access tiles displayed on mobile (< lg) on Dashboard & Reports pages.
 */
export function MobileShortcutGrid() {
  const navigate = useNavigate();
  const { isSuperAdmin, canViewUsersMenu } = useAuth();

  const shortcuts = [
    { to: '/dashboard', label: 'ภาพรวม', icon: 'fa-chart-line', bg: 'from-emerald-500 to-teal-600', show: true },
    { to: '/reports', label: 'รายงาน', icon: 'fa-file-lines', bg: 'from-sky-500 to-blue-600', show: true },
    { to: '/approvals', label: 'กรณีพิเศษ', icon: 'fa-clipboard-check', bg: 'from-indigo-500 to-purple-600', show: true },
    { to: '/time-corrections', label: 'แก้ไขเวลา', icon: 'fa-clock-rotate-left', bg: 'from-amber-500 to-orange-600', show: true },
    { to: '/personnel', label: 'บุคลากร', icon: 'fa-id-card', bg: 'from-teal-500 to-emerald-600', show: true },
    { to: '/users', label: 'ผู้ใช้งาน', icon: 'fa-users-gear', bg: 'from-purple-600 to-fuchsia-600', show: canViewUsersMenu },
    { to: '/settings', label: 'ตั้งค่าระบบ', icon: 'fa-gears', bg: 'from-rose-500 to-pink-600', show: isSuperAdmin },
    { to: '/checkin', label: 'หน้าลงเวลา', icon: 'fa-fingerprint', bg: 'from-[#00351B] to-[#00744B]', show: true },
  ].filter((s) => s.show);

  return (
    <div className="lg:hidden grid grid-cols-4 gap-2.5 mb-4">
      {shortcuts.map((item) => (
        <button
          key={item.to}
          type="button"
          onClick={() => navigate(item.to)}
          className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs active:scale-95 transition"
        >
          <span className={`w-10 h-10 rounded-xl bg-gradient-to-br ${item.bg} text-white flex items-center justify-center shadow-sm mb-1.5`}>
            <i className={`fa-solid ${item.icon} text-sm`} />
          </span>
          <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200 truncate max-w-full">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
