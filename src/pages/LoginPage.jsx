import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useSettings } from '../contexts/SettingsContext.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';
import { useSystemUpdateCheck } from '../hooks/useSystemUpdateCheck.js';
import { AuthService } from '../core/AuthService.js';
import { Config } from '../core/Config.js';
import { UIHelpers } from '../core/UIHelpers.js';
import { ResponsiveModal } from '../components/common/ResponsiveModal.jsx';
import { SystemUpdateModal } from '../components/layout/SystemUpdateModal.jsx';

/**
 * Native React LoginPage — 100% Visual Parity with legacy index.html (L207-446)
 * - Top bar: Left blinking green dot + headerSystemTitleText · Right Theme Pill with label
 * - Card max-w-[365px], Logo w-12 h-12 (fa-landmark), org -> bureau, Version Badge top-right of card header
 * - Centered "Login" heading, rounded-full inputs, .bma-toggle-track Remember switch, 2 stacked Pill buttons (Login + Admin)
 * - Gold #F6DE51 bureau highlight in Footer & minLength=6 + live #cpMatchStatus in Change Password Modal
 */
export default function LoginPage() {
  const { user, login } = useAuth();
  const { settings } = useSettings();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const { versionInfo, showUpdateModal, openUpdateModal, dismissModal } = useSystemUpdateCheck(settings);

  const [username, setUsername] = useState(() => {
    try {
      return localStorage.getItem(Config.STORAGE_KEYS.REMEMBER_ME) === 'true'
        ? (localStorage.getItem(Config.STORAGE_KEYS.REMEMBER_USERNAME) || '')
        : '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => {
    try {
      return localStorage.getItem(Config.STORAGE_KEYS.REMEMBER_ME) === 'true';
    } catch {
      return false;
    }
  });
  const [submittingMode, setSubmittingMode] = useState(''); // '' | 'checkin' | 'admin'

  // Change Password Modal state (minLength=6 + live match indicator)
  const [changePwOpen, setChangePwOpen] = useState(false);
  const [cpForm, setCpForm] = useState({ username: '', oldPassword: '', newPassword: '', confirmPassword: '' });
  const [cpBusy, setCpBusy] = useState(false);

  // Forgot Password Modal state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotNatId, setForgotNatId] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);

  useEffect(() => {
    if (user?.id) {
      navigate('/loading?entry=session', { replace: true });
    }
  }, [user, navigate]);

  const executeLogin = async (mode) => {
    if (submittingMode) return;
    if (!username.trim() || !password.trim()) {
      await UIHelpers.alert('กรุณากรอกข้อมูล', 'โปรดระบุชื่อบัญชีผู้ใช้งานและรหัสผ่านให้ครบถ้วน', 'warning');
      return;
    }
    setSubmittingMode(mode);
    try {
      const res = await login(username, password, mode);
      if (!res.success) {
        await UIHelpers.alert('ไม่สามารถเข้าสู่ระบบได้', res.message, 'error');
        return;
      }
      try {
        if (rememberMe) {
          localStorage.setItem(Config.STORAGE_KEYS.REMEMBER_ME, 'true');
          localStorage.setItem(Config.STORAGE_KEYS.REMEMBER_USERNAME, username.trim());
        } else {
          localStorage.removeItem(Config.STORAGE_KEYS.REMEMBER_ME);
          localStorage.removeItem(Config.STORAGE_KEYS.REMEMBER_USERNAME);
        }
      } catch (_) {}
      navigate('/loading?entry=login', { replace: true });
    } catch (err) {
      await UIHelpers.alert('เกิดข้อผิดพลาด', err?.message || 'ไม่สามารถเชื่อมต่อระบบได้', 'error');
    } finally {
      setSubmittingMode('');
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (cpForm.newPassword.length < 6) {
      await UIHelpers.alert('รหัสผ่านสั้นเกินไป', 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร', 'warning');
      return;
    }
    setCpBusy(true);
    try {
      const res = await AuthService.changePassword(
        cpForm.username,
        cpForm.oldPassword,
        cpForm.newPassword,
        cpForm.confirmPassword
      );
      if (!res.success) {
        await UIHelpers.alert('ไม่สามารถเปลี่ยนรหัสผ่านได้', res.message, 'error');
        return;
      }
      setChangePwOpen(false);
      setCpForm({ username: '', oldPassword: '', newPassword: '', confirmPassword: '' });
      await UIHelpers.alert('สำเร็จ', res.message, 'success');
    } finally {
      setCpBusy(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setForgotBusy(true);
    try {
      const res = await AuthService.requestPasswordResetByNationalId(forgotNatId);
      if (!res.success) {
        await UIHelpers.alert('ไม่พบข้อมูล', res.message, 'error');
        return;
      }
      setForgotOpen(false);
      setForgotNatId('');
      await UIHelpers.alert('ส่งคำขอเรียบร้อยแล้ว', res.message, 'success');
    } finally {
      setForgotBusy(false);
    }
  };

  const logoUrl = settings?.logo_url ? (UIHelpers.verifyImageUrl(settings.logo_url)?.url || settings.logo_url) : '';
  const yearBuddhist = new Date().getFullYear() + 543;
  const cpHasConfirm = cpForm.confirmPassword.length > 0;
  const cpMatched = cpHasConfirm && cpForm.newPassword === cpForm.confirmPassword;

  return (
    <div className="login-vertical-gradient min-h-[100dvh] w-full flex flex-col justify-between px-4 py-3 sm:px-6 sm:py-4 overflow-x-hidden">
      {/* Top Utility Bar (Original: Left blinking dot + System Title | Right Theme Pill with Label) */}
      <header className="w-full max-w-5xl mx-auto flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 text-white min-w-0">
          <span className="w-2.5 h-2.5 rounded-full bg-[#00C08A] animate-pulse shrink-0 shadow-[0_0_8px_#00C08A]" />
          <span className="text-xs sm:text-sm font-bold truncate drop-shadow-xs">
            {settings?.header_system_title || 'BMA e-Government Time Attendance System'}
          </span>
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 text-white border border-white/25 backdrop-blur-md text-xs font-bold shrink-0 transition"
        >
          <i className={`fa-solid ${isDark ? 'fa-sun text-amber-300' : 'fa-moon'}`} />
          <span>{isDark ? 'โหมดสว่าง' : 'โหมดถนอมสายตา'}</span>
        </button>
      </header>

      {/* Main Centered Login Card (max-w-[365px]) */}
      <main className="flex-1 flex items-center justify-center py-3">
        <div className="w-full max-w-[365px] rounded-3xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl border border-white/40 dark:border-slate-700/80 overflow-hidden">
          {/* Card Header with Top-Right Version Badge */}
          <div className="login-card-header-gradient px-5 pt-6 pb-5 text-center text-white relative">
            <button
              id="loginVersionBadgeSlot"
              type="button"
              onClick={openUpdateModal}
              title="ดูข้อมูลอัปเดตเวอร์ชัน"
              className="absolute right-3 top-3 px-2.5 py-0.5 rounded-full bg-white/15 hover:bg-white/25 border border-white/30 text-[10px] font-bold text-[#F6DE51] flex items-center gap-1 transition"
            >
              <i className="fa-solid fa-sparkles text-[9px]" />
              <span>{versionInfo.appVersion}</span>
            </button>

            <div className="w-12 h-12 mx-auto rounded-2xl bg-white/15 border border-white/30 shadow-md flex items-center justify-center overflow-hidden p-1.5 mb-2.5">
              {logoUrl ? (
                <img src={logoUrl} alt="ตราสัญลักษณ์หน่วยงาน" className="w-full h-full object-contain" />
              ) : (
                <i className="fa-solid fa-landmark text-2xl text-[#F6DE51]" />
              )}
            </div>
            <p className="text-xs font-bold text-emerald-100 tracking-wide">
              {settings?.organization_name || 'กรุงเทพมหานคร'}
            </p>
            <h1 className="text-lg font-extrabold tracking-tight mt-0.5 drop-shadow-xs">
              {settings?.bureau_name || 'สำนักเทศกิจ'}
            </h1>
          </div>

          {/* Form Body */}
          <form
            onSubmit={(e) => { e.preventDefault(); executeLogin('checkin'); }}
            className="px-6 pt-5 pb-6 space-y-3.5"
          >
            <h2 className="text-center text-lg font-extrabold text-slate-800 dark:text-white tracking-tight">
              Login
            </h2>

            <div className="relative">
              <i className="fa-solid fa-user absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
              <input
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ชื่อบัญชีผู้ใช้งาน / เลขบัตรประชาชน"
                className="w-full pl-10 pr-4 py-2.5 rounded-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 outline-none"
              />
            </div>

            <div className="relative">
              <i className="fa-solid fa-lock absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="รหัสผ่าน"
                className="w-full pl-10 pr-11 py-2.5 rounded-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                aria-label="แสดง/ซ่อนรหัสผ่าน"
              >
                <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'} text-xs`} />
              </button>
            </div>

            {/* Remember Toggle Switch + Forgot Password */}
            <div className="flex items-center justify-between text-xs pt-0.5">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none text-slate-600 dark:text-slate-300 font-semibold">
                <span className="relative inline-flex items-center">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="sr-only peer"
                  />
                  <span className="bma-toggle-track w-9 h-5 rounded-full bg-slate-300 dark:bg-slate-700 peer-checked:bg-[#00744B] transition relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4" />
                </span>
                <span>จดจำ</span>
              </label>

              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                className="text-emerald-700 dark:text-emerald-400 hover:underline font-bold"
              >
                ลืมรหัสผ่าน?
              </button>
            </div>

            {/* 2 Stacked Pill Buttons: Login (Green) + Admin (Slate) */}
            <div className="space-y-2 pt-1">
              <button
                type="submit"
                disabled={Boolean(submittingMode)}
                className="w-full py-2.5 rounded-full bg-gradient-to-r from-[#00744B] to-[#00A368] hover:brightness-105 text-white font-extrabold text-sm shadow-lg shadow-emerald-900/25 flex items-center justify-center gap-2 transition disabled:opacity-60"
              >
                {submittingMode === 'checkin' ? (
                  <><i className="fa-solid fa-circle-notch fa-spin" /><span>กำลังเข้าสู่ระบบ...</span></>
                ) : (
                  <><i className="fa-solid fa-right-to-bracket" /><span>Login</span></>
                )}
              </button>

              <button
                type="button"
                disabled={Boolean(submittingMode)}
                onClick={() => executeLogin('admin')}
                className="w-full py-2.5 rounded-full bg-slate-700 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-2 transition disabled:opacity-60"
              >
                {submittingMode === 'admin' ? (
                  <><i className="fa-solid fa-circle-notch fa-spin" /><span>กำลังตรวจสอบสิทธิ์ผู้ดูแล...</span></>
                ) : (
                  <><i className="fa-solid fa-user-shield" /><span>เข้าสู่ระบบผู้ดูแลระบบ</span></>
                )}
              </button>
            </div>

            {/* Bottom Links */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
              <button
                type="button"
                onClick={() => { setCpForm((p) => ({ ...p, username: username || p.username })); setChangePwOpen(true); }}
                className="text-slate-500 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-400 font-semibold"
              >
                <i className="fa-solid fa-key mr-1" />เปลี่ยนรหัสผ่านด้วยตนเอง
              </button>
              <a
                href="./docs/manual/index.html"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-500 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-400 font-semibold"
              >
                <i className="fa-solid fa-book-open mr-1" />คู่มือการใช้งาน
              </a>
            </div>
          </form>
        </div>
      </main>

      {/* Footer with Gold Bureau Highlight */}
      <footer className="text-center text-xs text-white/90 pb-1">
        <p className="font-bold">
          <span className="text-[#F6DE51]">{settings?.bureau_name || 'สำนักเทศกิจ'}</span>{' '}
          {settings?.organization_name || 'กรุงเทพมหานคร'} © พ.ศ. {yearBuddhist}
        </p>
        <p className="text-[11px] opacity-80 mt-0.5">
          {settings?.footer_description || 'ระบบบันทึกเวลาปฏิบัติราชการอิเล็กทรอนิกส์ เพื่อการบริหารงานบุคคลที่มีประสิทธิภาพ'}
        </p>
      </footer>

      {/* Modal: เปลี่ยนรหัสผ่าน (minLength=6 + live #cpMatchStatus) */}
      <ResponsiveModal
        open={changePwOpen}
        onClose={() => setChangePwOpen(false)}
        title="เปลี่ยนรหัสผ่านด้วยตนเอง"
        icon="fa-key"
        maxWidthClass="max-w-md"
        footer={
          <>
            <button type="button" onClick={() => setChangePwOpen(false)} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-semibold">ยกเลิก</button>
            <button type="submit" form="formChangePw" disabled={cpBusy || (cpHasConfirm && !cpMatched)} className="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold disabled:opacity-50">
              {cpBusy ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}
            </button>
          </>
        }
      >
        <form id="formChangePw" onSubmit={handleChangePassword} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold mb-1">ชื่อบัญชีผู้ใช้งาน</label>
            <input type="text" required value={cpForm.username} onChange={(e) => setCpForm({ ...cpForm, username: e.target.value })} className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1">รหัสผ่านเดิม</label>
            <input type="password" required value={cpForm.oldPassword} onChange={(e) => setCpForm({ ...cpForm, oldPassword: e.target.value })} className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1">รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)</label>
            <input type="password" required minLength={6} value={cpForm.newPassword} onChange={(e) => setCpForm({ ...cpForm, newPassword: e.target.value })} className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1">ยืนยันรหัสผ่านใหม่</label>
            <input type="password" required minLength={6} value={cpForm.confirmPassword} onChange={(e) => setCpForm({ ...cpForm, confirmPassword: e.target.value })} className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
            {cpHasConfirm && (
              <p id="cpMatchStatus" className={`text-xs font-bold mt-1.5 ${cpMatched ? 'text-emerald-600' : 'text-rose-600'}`}>
                <i className={`fa-solid ${cpMatched ? 'fa-circle-check' : 'fa-circle-xmark'} mr-1`} />
                {cpMatched ? 'รหัสผ่านใหม่ตรงกัน' : 'รหัสผ่านใหม่ยังไม่ตรงกัน'}
              </p>
            )}
          </div>
        </form>
      </ResponsiveModal>

      {/* Modal: ลืมรหัสผ่าน */}
      <ResponsiveModal
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        title="ส่งคำขอรีเซ็ตรหัสผ่าน"
        subtitle="ระบุเลขบัตรประจำตัวประชาชน 13 หลัก"
        icon="fa-unlock-keyhole"
        maxWidthClass="max-w-md"
        footer={
          <>
            <button type="button" onClick={() => setForgotOpen(false)} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-semibold">ยกเลิก</button>
            <button type="submit" form="formForgotPw" disabled={forgotBusy} className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold disabled:opacity-50">
              {forgotBusy ? 'กำลังส่งคำขอ...' : 'ส่งคำขอรีเซ็ต'}
            </button>
          </>
        }
      >
        <form id="formForgotPw" onSubmit={handleForgotPassword} className="space-y-3">
          <p className="text-xs text-slate-600 dark:text-slate-300">
            ระบบจะส่งคำขอรีเซ็ตรหัสผ่านไปยังผู้ดูแลระบบประจำหน่วยงานของคุณ เมื่ออนุมัติแล้วรหัสผ่านจะถูกรีเซ็ตเป็นเลขท้าย 6 หลักของบัตรประชาชน
          </p>
          <div>
            <label className="block text-xs font-bold mb-1">เลขประจำตัวประชาชน 13 หลัก</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={13}
              required
              value={forgotNatId}
              onChange={(e) => setForgotNatId(e.target.value.replace(/\D/g, '').slice(0, 13))}
              placeholder="กรอกตัวเลข 13 หลัก"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono tracking-wider"
            />
          </div>
        </form>
      </ResponsiveModal>

      <SystemUpdateModal open={showUpdateModal} onClose={dismissModal} settings={settings} versionInfo={versionInfo} />
    </div>
  );
}
