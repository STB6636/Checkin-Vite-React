import React, { useState, useEffect, useRef } from 'react';
import { AdminLayout } from '../components/layout/AdminLayout.jsx';
import { SystemUpdateModal } from '../components/layout/SystemUpdateModal.jsx';
import { OffsiteMapSearchModal } from './checkin/OffsiteMapSearchModal.jsx';
import { useSettings } from '../contexts/SettingsContext.jsx';
import { SettingsModel } from '../models/SettingsModel.js';
import { Config } from '../core/Config.js';
import { UIHelpers } from '../core/UIHelpers.js';

// Exact original 7-Tab order from legacy settings.html (L129-1020)
const SETTING_TABS = [
  { id: 1, label: 'ข้อมูลทั่วไป & ฟังก์ชัน', icon: 'fa-building', grad: 'from-[#00351B] via-[#00744B] to-[#00A368]' },
  { id: 2, label: 'เกณฑ์เวลา & สีสถานะ', icon: 'fa-sliders', grad: 'from-[#0971CE] to-[#38BDF8]' },
  { id: 3, label: 'ช่วงเวลา / กะปฏิบัติงาน', icon: 'fa-clock', grad: 'from-teal-700 to-emerald-500' },
  { id: 4, label: 'คำนำหน้า / งาน / เหตุผล', icon: 'fa-tags', grad: 'from-indigo-700 to-purple-500' },
  { id: 5, label: 'ตำแหน่ง & โครงสร้างสังกัด', icon: 'fa-sitemap', grad: 'from-[#480080] to-[#7C3AED]' },
  { id: 6, label: 'สถานที่และรัศมี GPS', icon: 'fa-map-location-dot', grad: 'from-emerald-800 to-teal-500' },
  { id: 7, label: 'ประกาศระบบ', icon: 'fa-bullhorn', grad: 'from-[#D97706] to-[#FFB449]' },
];

export default function SettingsPage() {
  const { settings, saveSettings } = useSettings();
  const [activeTab, setActiveTab] = useState(1);
  const [draft, setDraft] = useState(() => ({ ...Config.DEFAULT_SETTINGS, ...settings }));
  const [saving, setSaving] = useState(false);

  // Tab 1 Verification Badges
  const [logoStatus, setLogoStatus] = useState({ type: '', msg: '' });
  const [driveStatus, setDriveStatus] = useState({ type: '', msg: '' });
  const [annFolderStatus, setAnnFolderStatus] = useState({ type: '', msg: '' });
  const logoFileRef = useRef(null);
  const annFileRef = useRef(null);

  // Tab 6 Map Picker Modal state
  const [mapPickerIdx, setMapPickerIdx] = useState(-1);

  // Tab 7 Announcement Preview Modal state
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  useEffect(() => {
    setDraft({ ...Config.DEFAULT_SETTINGS, ...settings });
  }, [settings]);

  const updateField = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));

  const handleMoveArrayItem = (fieldKey, index, direction) => {
    const arr = Array.isArray(draft[fieldKey]) ? [...draft[fieldKey]] : [];
    const moved = SettingsModel.moveItemInArray(arr, index, direction);
    if (moved) {
      updateField(fieldKey, arr);
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const payload = { ...draft };
      if (
        payload.announcement_enabled !== settings.announcement_enabled ||
        payload.announcement_title !== settings.announcement_title ||
        payload.announcement_body !== settings.announcement_body ||
        payload.announcement_image_url !== settings.announcement_image_url ||
        payload.announcement_mode !== settings.announcement_mode
      ) {
        payload.announcement_updated_at = new Date().toISOString();
      }
      await saveSettings(payload);
      UIHelpers.showToast('บันทึกการตั้งค่าระบบและซิงค์เรียลไทม์เรียบร้อยแล้ว', 'success');
    } catch (err) {
      await UIHelpers.alert('บันทึกไม่สำเร็จ', err?.message || 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Tab 1: Upload Logo file as Data URL
  const handleLogoFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await SettingsModel.fileToDataUrl(file);
      updateField('logo_url', dataUrl);
      setLogoStatus({ type: 'ok', msg: 'อัปโหลดไฟล์โลโก้พร้อมบันทึกแล้ว' });
    } catch (_) {
      setLogoStatus({ type: 'err', msg: 'ไม่สามารถอ่านไฟล์ภาพได้' });
    }
  };

  const handleVerifyLogoUrl = async () => {
    const res = await UIHelpers.verifyImageUrl(draft.logo_url || '');
    if (res?.success) {
      updateField('logo_url', res.normalizedUrl || draft.logo_url);
      setLogoStatus({ type: 'ok', msg: res.message || 'ลิงก์รูปภาพใช้งานได้' });
      UIHelpers.showToast(res.message || 'ลิงก์รูปภาพใช้งานได้', 'success');
    } else {
      setLogoStatus({ type: 'err', msg: res?.message || 'ลิงก์รูปภาพไม่ถูกต้อง' });
      UIHelpers.showToast(res?.message || 'ลิงก์รูปภาพไม่ถูกต้อง', 'error');
    }
  };

  const handleVerifyDrive = async (isAnnFolder = false) => {
    const folderId = isAnnFolder ? draft.announcement_drive_folder_id : draft.google_drive_folder_id;
    const setter = isAnnFolder ? setAnnFolderStatus : setDriveStatus;
    if (!draft.google_drive_script_url) {
      setter({ type: 'err', msg: 'กรุณาระบุ Google Apps Script Web App URL ก่อน' });
      return;
    }
    setter({ type: 'info', msg: 'กำลังตรวจสอบการเชื่อมต่อ...' });
    const res = await UIHelpers.verifyGoogleDriveLink(draft.google_drive_script_url, folderId || '');
    setter({
      type: res?.success ? 'ok' : 'err',
      msg: res?.message || (res?.success ? 'เชื่อมต่อสำเร็จ' : 'เชื่อมต่อไม่สำเร็จ'),
    });
  };

  // Tab 7: Upload Announcement Image to Google Drive
  const handleUploadAnnImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      UIHelpers.showLoading('กำลังอัปโหลดรูปประกาศขึ้น Google Drive...');
      const dataUrl = await SettingsModel.fileToDataUrl(file);
      const uploaded = await UIHelpers.uploadPhotoToGoogleDrive(dataUrl, `announcement_${Date.now()}`, {
        ...draft,
        google_drive_folder_id: draft.announcement_drive_folder_id || draft.google_drive_folder_id,
      });
      UIHelpers.hideLoading();
      const finalUrl = typeof uploaded === 'string' ? uploaded : (uploaded?.url || uploaded?.fileUrl || dataUrl);
      updateField('announcement_image_url', finalUrl);
      updateField('announcement_mode', 'image');
      UIHelpers.showToast('อัปโหลดรูปประกาศเรียบร้อยแล้ว', 'success');
    } catch (err) {
      UIHelpers.hideLoading();
      await UIHelpers.alert('อัปโหลดไม่สำเร็จ', err?.message || 'เกิดข้อผิดพลาด', 'error');
    }
  };

  const currentTabMeta = SETTING_TABS.find((t) => t.id === activeTab) || SETTING_TABS[0];
  const logoPreviewUrl = draft.logo_url || '';

  const renderReorderButtons = (fieldKey, idx, total) => (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={idx === 0}
        onClick={() => handleMoveArrayItem(fieldKey, idx, 'up')}
        title="เลื่อนขึ้น"
        className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-600 dark:text-slate-300 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <i className="fa-solid fa-arrow-up text-[11px]" />
      </button>
      <button
        type="button"
        disabled={idx === total - 1}
        onClick={() => handleMoveArrayItem(fieldKey, idx, 'down')}
        title="เลื่อนลง"
        className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-600 dark:text-slate-300 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <i className="fa-solid fa-arrow-down text-[11px]" />
      </button>
    </div>
  );

  const renderColoredListCard = (title, fieldKey, accentBorder, headerBg) => {
    const arr = Array.isArray(draft[fieldKey]) ? draft[fieldKey] : [];
    return (
      <div className={`rounded-2xl border ${accentBorder} overflow-hidden flex flex-col`}>
        <div className={`${headerBg} text-white px-4 py-3 flex items-center justify-between`}>
          <h4 className="font-extrabold text-xs">{title} ({arr.length})</h4>
          <button
            type="button"
            onClick={() => updateField(fieldKey, [...arr, 'รายการใหม่'])}
            className="px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-[11px] font-bold"
          >
            + เพิ่ม
          </button>
        </div>
        <div className="p-3 bg-white dark:bg-slate-900 overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-xs text-left bma-table">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="w-10 text-center py-2 px-1.5">ลำดับ</th>
                <th className="py-2 px-2">รายการ</th>
                <th className="w-20 text-center py-2 px-1.5">เรียงลำดับ</th>
                <th className="w-12 text-center py-2 px-1.5">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {arr.map((val, idx) => (
                <tr key={idx}>
                  <td className="text-center font-mono text-slate-400 py-1.5 px-1.5">{idx + 1}</td>
                  <td className="py-1.5 px-2">
                    <input
                      type="text"
                      value={val}
                      onChange={(e) => {
                        const next = [...arr];
                        next[idx] = e.target.value;
                        updateField(fieldKey, next);
                      }}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 text-xs"
                    />
                  </td>
                  <td className="text-center py-1.5 px-1.5">
                    {renderReorderButtons(fieldKey, idx, arr.length)}
                  </td>
                  <td className="text-center py-1.5 px-1.5">
                    <button
                      type="button"
                      onClick={() => updateField(fieldKey, arr.filter((_, i) => i !== idx))}
                      className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 inline-flex items-center justify-center"
                    >
                      <i className="fa-solid fa-trash text-[11px]" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <AdminLayout
      title="ตั้งค่าระบบ (SuperAdmin)"
      subtitle="จัดการข้อมูลหน่วยงาน กะเวลา โครงสร้างองค์กร พิกัดสถานที่ และประกาศระบบ (7 แท็บตามต้นฉบับ)"
      activePage="settings"
    >
      <input ref={logoFileRef} type="file" accept="image/*" onChange={handleLogoFile} className="hidden" />
      <input ref={annFileRef} type="file" accept="image/*" onChange={handleUploadAnnImage} className="hidden" />

      {/* 7-Tab Selector Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 mb-7 flex flex-wrap items-center justify-between gap-2 shadow-xs">
        <div className="flex flex-wrap gap-1.5">
          {SETTING_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                activeTab === t.id
                  ? `bg-gradient-to-r ${t.grad} text-white shadow-sm`
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <i className={`fa-solid ${t.icon}`} />
              <span>{t.id}. {t.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={handleSaveAll}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#00351B] via-[#00744B] to-[#00A368] text-white text-xs font-extrabold shadow-md disabled:opacity-50"
        >
          <i className={`fa-solid ${saving ? 'fa-circle-notch fa-spin' : 'fa-floppy-disk'} mr-1.5`} />
          {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่าทั้งหมด'}
        </button>
      </div>

      {/* Main Card with Floating Tab-Colored Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md overflow-visible">
        <div className={`-mt-5 mx-4 px-5 py-4 rounded-2xl bg-gradient-to-r ${currentTabMeta.grad} text-white shadow-lg flex items-center justify-between`}>
          <h2 className="font-extrabold text-sm sm:text-base flex items-center gap-2">
            <i className={`fa-solid ${currentTabMeta.icon}`} />
            <span>แท็บที่ {currentTabMeta.id}: {currentTabMeta.label}</span>
          </h2>
        </div>

        <div className="p-5">
          {/* TAB 1: ข้อมูลทั่วไป, โลโก้, Google Drive Verify & ควบคุมฟังก์ชัน */}
          {activeTab === 1 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 text-sm">
              {/* Left 6/12: Agency Info & Logo Preview/Upload/Verify */}
              <div className="lg:col-span-6 space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold mb-1">ชื่อองค์กรหลัก</label>
                    <input type="text" value={draft.organization_name || ''} onChange={(e) => updateField('organization_name', e.target.value)} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">ชื่อหน่วยงาน (สำนัก/กอง)</label>
                    <input type="text" value={draft.bureau_name || ''} onChange={(e) => updateField('bureau_name', e.target.value)} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">ชื่อระบบส่วนหัว (Header Title)</label>
                  <input type="text" value={draft.header_system_title || ''} onChange={(e) => updateField('header_system_title', e.target.value)} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">ข้อความท้ายหน้า (Footer Description)</label>
                  <input type="text" value={draft.footer_description || ''} onChange={(e) => updateField('footer_description', e.target.value)} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2" />
                </div>

                {/* Logo Preview + Upload + Clear + Verify Link + Status Badge */}
                <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 space-y-2.5">
                  <label className="block text-xs font-extrabold">ตราสัญลักษณ์ / โลโก้หน่วยงาน</label>
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center p-1.5 shrink-0 overflow-hidden">
                      {logoPreviewUrl ? <img src={logoPreviewUrl} alt="Logo Preview" className="w-full h-full object-contain" /> : <i className="fa-solid fa-landmark text-2xl text-slate-300" />}
                    </div>
                    <div className="flex-1 space-y-2 min-w-0">
                      <input type="text" value={draft.logo_url || ''} onChange={(e) => updateField('logo_url', e.target.value)} placeholder="วาง URL รูปภาพ หรืออัปโหลดไฟล์..." className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 font-mono text-xs" />
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" onClick={() => logoFileRef.current?.click()} className="px-2.5 py-1 rounded-lg bg-[#00744B] text-white text-[11px] font-bold">
                          <i className="fa-solid fa-upload mr-1" />อัปโหลดไฟล์
                        </button>
                        <button type="button" onClick={handleVerifyLogoUrl} className="px-2.5 py-1 rounded-lg bg-sky-600 text-white text-[11px] font-bold">
                          <i className="fa-solid fa-link mr-1" />ตรวจสอบลิงก์
                        </button>
                        <button type="button" onClick={() => { updateField('logo_url', ''); setLogoStatus({ type: 'info', msg: 'ล้างโลโก้แล้ว' }); }} className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-700 text-[11px] font-bold">
                          ล้างโลโก้
                        </button>
                      </div>
                    </div>
                  </div>
                  {logoStatus.msg && (
                    <p className={`text-[11px] font-bold ${logoStatus.type === 'ok' ? 'text-emerald-600' : logoStatus.type === 'err' ? 'text-rose-600' : 'text-slate-500'}`}>
                      {logoStatus.msg}
                    </p>
                  )}
                </div>

                {/* Google Drive Verify Tools */}
                <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 space-y-2.5">
                  <label className="block text-xs font-extrabold">การเชื่อมต่อ Google Drive (Apps Script Bridge)</label>
                  <input type="text" value={draft.google_drive_script_url || ''} onChange={(e) => updateField('google_drive_script_url', e.target.value)} placeholder="Google Apps Script Web App URL" className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 font-mono text-xs" />
                  <div className="flex gap-2">
                    <input type="text" value={draft.google_drive_folder_id || ''} onChange={(e) => updateField('google_drive_folder_id', e.target.value)} placeholder="Folder ID รูปลงเวลา" className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 font-mono text-xs" />
                    <button type="button" onClick={() => handleVerifyDrive(false)} className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold shrink-0">ตรวจสอบ Drive</button>
                  </div>
                  {driveStatus.msg && <p className={`text-[11px] font-bold ${driveStatus.type === 'ok' ? 'text-emerald-600' : driveStatus.type === 'err' ? 'text-rose-600' : 'text-sky-600'}`}>{driveStatus.msg}</p>}

                  <div className="flex gap-2 pt-1">
                    <input type="text" value={draft.announcement_drive_folder_id || ''} onChange={(e) => updateField('announcement_drive_folder_id', e.target.value)} placeholder="Folder ID รูปประกาศ Tab 7" className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 font-mono text-xs" />
                    <button type="button" onClick={() => handleVerifyDrive(true)} className="px-3 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-bold shrink-0">ตรวจสอบโฟลเดอร์</button>
                  </div>
                  {annFolderStatus.msg && <p className={`text-[11px] font-bold ${annFolderStatus.type === 'ok' ? 'text-emerald-600' : annFolderStatus.type === 'err' ? 'text-rose-600' : 'text-sky-600'}`}>{annFolderStatus.msg}</p>}
                </div>
              </div>

              {/* Right 6/12: Feature Toggles + GPS Jitter + Early Shift Buffer + Attendance Recording Mode Radio Cards */}
              <div className="lg:col-span-6 space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    ['require_photo', 'บังคับถ่ายภาพยืนยันตัวตน'],
                    ['allow_gallery_fallback', 'อนุญาตเลือกรูปจากคลังภาพ'],
                    ['require_gps', 'บังคับระบุพิกัด GPS'],
                    ['enforce_geofence_radius', 'บังคับตรวจสอบรัศมีสถานที่ราชการ'],
                    ['filter_shifts_by_realtime', 'กรองกะเวลาตามเวลาจริง'],
                    ['disable_normal_hours_checkin', 'ปิดลงเวลาหน้าหลักเวลาราชการปกติ'],
                    ['randomize_gps_checkout', 'สุ่มระยะพิกัด GPS ขาออกงาน'],
                  ].map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 cursor-pointer">
                      <input type="checkbox" checked={Boolean(draft[key])} onChange={(e) => updateField(key, e.target.checked)} className="w-4 h-4 accent-[#00744B]" />
                      <span className="text-xs font-bold">{label}</span>
                    </label>
                  ))}
                </div>

                {/* GPS Jitter Meters & Pre-Shift Buffer Minutes directly under switches (settings.html:324-368) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40">
                  <div>
                    <label className="block text-xs font-bold mb-1">รัศมีสุ่มพิกัดขาออกงาน (เมตร)</label>
                    <input
                      type="number"
                      min={5}
                      max={100}
                      value={draft.randomize_gps_radius_meters ?? 20}
                      onChange={(e) => updateField('randomize_gps_radius_meters', Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 font-mono text-xs font-bold"
                    />
                    <p className="text-[11px] text-slate-400 mt-0.5">ค่าเริ่มต้น 20 เมตร (5 - 100 เมตร)</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">เปิดให้ลงเวลาเข้างานล่วงหน้าก่อนเวลากะ (นาที)</label>
                    <input
                      type="number"
                      min={0}
                      max={360}
                      value={draft.early_shift_window_minutes ?? 30}
                      onChange={(e) => updateField('early_shift_window_minutes', Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 font-mono text-xs font-bold"
                    />
                    <p className="text-[11px] text-slate-400 mt-0.5">ค่าเริ่มต้น 30 นาทีก่อนเริ่มกะ</p>
                  </div>
                </div>

                {/* 2 Radio Cards for Attendance Recording Mode (settings.html:383-404) */}
                <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 space-y-2.5">
                  <span className="block text-xs font-extrabold">รูปแบบการบันทึกเวลาปฏิบัติราชการ</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label
                      className={`flex items-start gap-2.5 p-3 rounded-xl border-2 cursor-pointer transition ${
                        !draft.single_click_checkin
                          ? 'border-[#00744B] bg-emerald-50/50 dark:bg-emerald-950/30'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <input
                        type="radio"
                        name="attendanceRecordMode"
                        checked={!draft.single_click_checkin}
                        onChange={() => updateField('single_click_checkin', false)}
                        className="accent-[#00744B] mt-0.5"
                      />
                      <div className="text-xs">
                        <span className="font-extrabold block text-slate-800 dark:text-white">
                          1. รูปแบบปกติ (Paired)
                        </span>
                        <span className="text-[11px] text-slate-500 block mt-0.5 leading-snug">
                          บันทึกเข้า-ออกงานในแถวเดียวกัน (มาตรฐาน กทม.)
                        </span>
                      </div>
                    </label>

                    <label
                      className={`flex items-start gap-2.5 p-3 rounded-xl border-2 cursor-pointer transition ${
                        draft.single_click_checkin
                          ? 'border-[#00744B] bg-emerald-50/50 dark:bg-emerald-950/30'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <input
                        type="radio"
                        name="attendanceRecordMode"
                        checked={Boolean(draft.single_click_checkin)}
                        onChange={() => updateField('single_click_checkin', true)}
                        className="accent-[#00744B] mt-0.5"
                      />
                      <div className="text-xs">
                        <span className="font-extrabold block text-[#00744B] dark:text-emerald-400">
                          2. รูปแบบพิเศษ (Single-Click)
                        </span>
                        <span className="text-[11px] text-slate-500 block mt-0.5 leading-snug">
                          กดครั้งเดียว บันทึกทั้งเข้าและออกตามเกณฑ์
                        </span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: เกณฑ์เวลา & สีสถานะ (5 Time Controls + 6 Color Pickers including group_header) */}
          {activeTab === 2 && (
            <div className="space-y-5 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <div>
                  <label className="block text-xs font-bold mb-1">เริ่มเข้างาน (24 ชม.) *</label>
                  <input
                    type="time"
                    value={draft.allow_checkin_start_time || '06:00'}
                    onChange={(e) => updateField('allow_checkin_start_time', e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono font-bold"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">เริ่มเปิดให้ลงเวลาเข้างานปกติ</p>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">เวลาเข้างานมาตรฐาน *</label>
                  <input
                    type="time"
                    value={draft.standard_check_in || '08:30'}
                    onChange={(e) => updateField('standard_check_in', e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono font-bold"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">ไม่เกินนี้ = ปฏิบัติงานปกติ</p>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">อนุโลมสาย (นาที) *</label>
                  <input
                    type="number"
                    min={0}
                    max={240}
                    value={draft.late_threshold_minutes ?? 30}
                    onChange={(e) => updateField('late_threshold_minutes', Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono font-bold"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">ไม่เกินนี้ = มาสาย</p>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">เวลาเลิกงานมาตรฐาน *</label>
                  <input
                    type="time"
                    value={draft.standard_check_out || '16:30'}
                    onChange={(e) => updateField('standard_check_out', e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono font-bold"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">ออกก่อนนี้ = ขาดราชการ</p>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">หลังเลิกงาน (นาที) *</label>
                  <input
                    type="number"
                    min={0}
                    max={480}
                    value={draft.checkout_grace_minutes ?? 30}
                    onChange={(e) => updateField('checkout_grace_minutes', Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono font-bold"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">เกินเกณฑ์นี้ = นอกเวลา</p>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                <h4 className="font-extrabold text-xs text-slate-600 dark:text-slate-300 mb-3">
                  สีหมวดหมู่สถานะการลงเวลาและหัวตารางจัดกลุ่มรายงาน (6 สี)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {Config.OFFICIAL_STATUSES.map((st, idx) => (
                    <div key={st.key} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <i className={`fa-solid ${st.icon}`} style={{ color: draft.category_colors?.[st.key] || st.defaultColor }} />
                        <span className="text-xs font-bold">{idx + 1}. {st.label}</span>
                      </div>
                      <input
                        type="color"
                        value={draft.category_colors?.[st.key] || st.defaultColor}
                        onChange={(e) => updateField('category_colors', { ...(draft.category_colors || {}), [st.key]: e.target.value })}
                        className="w-9 h-8 rounded-lg border cursor-pointer"
                      />
                    </div>
                  ))}
                  {/* 6th Color Picker: group_header */}
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <i className="fa-solid fa-table-columns" style={{ color: draft.category_colors?.group_header || '#00744B' }} />
                      <span className="text-xs font-bold">6. สีหัวตารางจัดกลุ่มรายงาน</span>
                    </div>
                    <input
                      type="color"
                      value={draft.category_colors?.group_header || '#00744B'}
                      onChange={(e) => updateField('category_colors', { ...(draft.category_colors || {}), group_header: e.target.value })}
                      className="w-9 h-8 rounded-lg border cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ช่วงเวลา / กะปฏิบัติงาน (.bma-table with Up/Down Reordering) */}
          {activeTab === 3 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm">กะปฏิบัติงานทั้งหมด ({(draft.work_shifts || []).length})</h3>
                <button
                  type="button"
                  onClick={() => updateField('work_shifts', [...(draft.work_shifts || []), { name: 'กะใหม่', check_in: '08:30', check_out: '16:30', is_overtime: false, is_overnight: false, is_custom: false }])}
                  className="px-3 py-1.5 rounded-xl bg-[#00744B] text-white text-xs font-bold"
                >
                  + เพิ่มกะปฏิบัติงาน
                </button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-xs text-left bma-table">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-extrabold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="w-14 text-center py-3 px-2.5">ลำดับ</th>
                      <th className="w-24 text-center py-3 px-2.5">เรียงลำดับ</th>
                      <th className="py-3 px-3">ชื่อช่วงเวลาทำงาน</th>
                      <th className="w-32 text-center py-3 px-2.5">เวลาเริ่มงาน (24 ชม.)</th>
                      <th className="w-32 text-center py-3 px-2.5">เวลาเลิกงาน (24 ชม.)</th>
                      <th className="py-3 px-3">ประเภท / เงื่อนไข</th>
                      <th className="w-20 text-center py-3 px-2.5">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(draft.work_shifts || []).map((sh, idx) => (
                      <tr key={idx}>
                        <td className="text-center font-mono text-slate-400 py-2.5 px-2.5">{idx + 1}</td>
                        <td className="text-center py-2.5 px-2.5">
                          {renderReorderButtons('work_shifts', idx, (draft.work_shifts || []).length)}
                        </td>
                        <td className="py-2.5 px-3">
                          <input
                            type="text"
                            value={sh.name || ''}
                            onChange={(e) => {
                              const next = [...draft.work_shifts];
                              next[idx] = { ...sh, name: e.target.value };
                              updateField('work_shifts', next);
                            }}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold"
                          />
                        </td>
                        <td className="text-center py-2.5 px-2.5">
                          <input
                            type="time"
                            value={sh.check_in || '08:30'}
                            onChange={(e) => {
                              const next = [...draft.work_shifts];
                              next[idx] = { ...sh, check_in: e.target.value };
                              updateField('work_shifts', next);
                            }}
                            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 font-mono text-xs"
                          />
                        </td>
                        <td className="text-center py-2.5 px-2.5">
                          <input
                            type="time"
                            value={sh.check_out || '16:30'}
                            onChange={(e) => {
                              const next = [...draft.work_shifts];
                              next[idx] = { ...sh, check_out: e.target.value };
                              updateField('work_shifts', next);
                            }}
                            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 font-mono text-xs"
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <label className="inline-flex items-center gap-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={Boolean(sh.is_overtime)}
                                onChange={(e) => {
                                  const next = [...draft.work_shifts];
                                  next[idx] = { ...sh, is_overtime: e.target.checked };
                                  updateField('work_shifts', next);
                                }}
                              />
                              <span>นอกเวลา</span>
                            </label>
                            <label className="inline-flex items-center gap-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={Boolean(sh.is_overnight)}
                                onChange={(e) => {
                                  const next = [...draft.work_shifts];
                                  next[idx] = { ...sh, is_overnight: e.target.checked };
                                  updateField('work_shifts', next);
                                }}
                              />
                              <span>ข้ามวัน</span>
                            </label>
                          </div>
                        </td>
                        <td className="text-center py-2.5 px-2.5">
                          <button
                            type="button"
                            onClick={() => updateField('work_shifts', draft.work_shifts.filter((_, i) => i !== idx))}
                            className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 inline-flex items-center justify-center"
                          >
                            <i className="fa-solid fa-trash text-xs" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: 3 Cards in 3 Colors (คำนำหน้า / ลักษณะงานนอกสถานที่ / เหตุผลกรณีพิเศษ) */}
          {activeTab === 4 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {renderColoredListCard('คำนำหน้าชื่อ', 'prefixes', 'border-emerald-200 dark:border-emerald-800', 'bg-gradient-to-r from-[#00744B] to-[#00A368]')}
              {renderColoredListCard('ลักษณะงานนอกสถานที่', 'offsite_job_types', 'border-indigo-200 dark:border-indigo-800', 'bg-gradient-to-r from-indigo-700 to-purple-600')}
              {renderColoredListCard('เหตุผลลงเวลากรณีพิเศษ', 'special_request_reasons', 'border-amber-200 dark:border-amber-800', 'bg-gradient-to-r from-amber-600 to-amber-500')}
            </div>
          )}

          {/* TAB 5: ตำแหน่ง (3 ระดับ) & โครงสร้างสังกัด (4 ระดับ) (.bma-table with Up/Down Reordering) */}
          {activeTab === 5 && (
            <div className="space-y-6">
              {/* Positions 3-Tier */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-sm">โครงสร้างตำแหน่ง 3 ระดับ ({(draft.positions || []).length})</h4>
                  <button
                    type="button"
                    onClick={() => updateField('positions', [...(draft.positions || []), { type: 'ประเภทวิชาการ', title: 'ตำแหน่งใหม่', level: 'ปฏิบัติการ' }])}
                    className="px-3 py-1.5 rounded-xl bg-purple-700 text-white text-xs font-bold"
                  >
                    + เพิ่มตำแหน่ง
                  </button>
                </div>
                <div className="overflow-x-auto max-h-80 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="w-full text-xs text-left bma-table">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-extrabold border-b border-slate-200 dark:border-slate-700 sticky top-0">
                      <tr>
                        <th className="w-14 text-center py-3 px-2.5">ลำดับ</th>
                        <th className="w-24 text-center py-3 px-2.5">เรียงลำดับ</th>
                        <th className="py-3 px-3">1. ประเภทตำแหน่ง (แม่)</th>
                        <th className="py-3 px-3">2. ชื่อตำแหน่งในสายงาน (ลูก)</th>
                        <th className="py-3 px-3">3. ระดับตำแหน่ง (ลูกย่อย)</th>
                        <th className="w-20 text-center py-3 px-2.5">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {(draft.positions || []).map((pos, idx) => (
                        <tr key={idx}>
                          <td className="text-center font-mono text-slate-400 py-2 px-2.5">{idx + 1}</td>
                          <td className="text-center py-2 px-2.5">
                            {renderReorderButtons('positions', idx, (draft.positions || []).length)}
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={pos.type || ''}
                              onChange={(e) => {
                                const n = [...draft.positions];
                                n[idx] = { ...pos, type: e.target.value };
                                updateField('positions', n);
                              }}
                              placeholder="ประเภทตำแหน่ง"
                              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={pos.title || ''}
                              onChange={(e) => {
                                const n = [...draft.positions];
                                n[idx] = { ...pos, title: e.target.value };
                                updateField('positions', n);
                              }}
                              placeholder="ชื่อตำแหน่ง"
                              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-bold"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={pos.level || ''}
                              onChange={(e) => {
                                const n = [...draft.positions];
                                n[idx] = { ...pos, level: e.target.value };
                                updateField('positions', n);
                              }}
                              placeholder="ระดับ"
                              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs"
                            />
                          </td>
                          <td className="text-center py-2 px-2.5">
                            <button
                              type="button"
                              onClick={() => updateField('positions', draft.positions.filter((_, i) => i !== idx))}
                              className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 inline-flex items-center justify-center"
                            >
                              <i className="fa-solid fa-trash text-xs" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Affiliations 4-Tier */}
              <div className="space-y-2.5 pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-sm">โครงสร้างสังกัด 4 ระดับ ({(draft.affiliations || []).length})</h4>
                  <button
                    type="button"
                    onClick={() => updateField('affiliations', [...(draft.affiliations || []), { organization: draft.organization_name || 'กรุงเทพมหานคร', bureau: draft.bureau_name || 'สำนักเทศกิจ', division: 'ส่วน/ฝ่ายใหม่', group: 'กลุ่มงานใหม่' }])}
                    className="px-3 py-1.5 rounded-xl bg-[#00744B] text-white text-xs font-bold"
                  >
                    + เพิ่มสังกัด
                  </button>
                </div>
                <div className="overflow-x-auto max-h-80 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="w-full text-xs text-left bma-table">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-extrabold border-b border-slate-200 dark:border-slate-700 sticky top-0">
                      <tr>
                        <th className="w-14 text-center py-3 px-2.5">ลำดับ</th>
                        <th className="w-24 text-center py-3 px-2.5">เรียงลำดับ</th>
                        <th className="py-3 px-3">1. หน่วยงานหลัก</th>
                        <th className="py-3 px-3">2. สำนักงาน/กอง</th>
                        <th className="py-3 px-3">3. ส่วน/ฝ่าย</th>
                        <th className="py-3 px-3">4. กลุ่มงาน</th>
                        <th className="w-20 text-center py-3 px-2.5">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {(draft.affiliations || []).map((aff, idx) => (
                        <tr key={idx}>
                          <td className="text-center font-mono text-slate-400 py-2 px-2.5">{idx + 1}</td>
                          <td className="text-center py-2 px-2.5">
                            {renderReorderButtons('affiliations', idx, (draft.affiliations || []).length)}
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={aff.organization || ''}
                              onChange={(e) => {
                                const n = [...draft.affiliations];
                                n[idx] = { ...aff, organization: e.target.value };
                                updateField('affiliations', n);
                              }}
                              placeholder="หน่วยงานหลัก"
                              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={aff.bureau || ''}
                              onChange={(e) => {
                                const n = [...draft.affiliations];
                                n[idx] = { ...aff, bureau: e.target.value };
                                updateField('affiliations', n);
                              }}
                              placeholder="สำนักงาน/กอง"
                              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-bold"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={aff.division || ''}
                              onChange={(e) => {
                                const n = [...draft.affiliations];
                                n[idx] = { ...aff, division: e.target.value };
                                updateField('affiliations', n);
                              }}
                              placeholder="ส่วน/ฝ่าย"
                              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={aff.group || ''}
                              onChange={(e) => {
                                const n = [...draft.affiliations];
                                n[idx] = { ...aff, group: e.target.value };
                                updateField('affiliations', n);
                              }}
                              placeholder="กลุ่มงาน"
                              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs"
                            />
                          </td>
                          <td className="text-center py-2 px-2.5">
                            <button
                              type="button"
                              onClick={() => updateField('affiliations', draft.affiliations.filter((_, i) => i !== idx))}
                              className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 inline-flex items-center justify-center"
                            >
                              <i className="fa-solid fa-trash text-xs" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: สถานที่ราชการและรัศมี GPS (.bma-table with Up/Down Reordering + Leaflet Map Picker) */}
          {activeTab === 6 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm">สถานที่ราชการที่อนุญาตลงเวลาในสถานที่ ({(draft.official_locations || []).length})</h3>
                <button
                  type="button"
                  onClick={() => updateField('official_locations', [...(draft.official_locations || []), { id: `LOC-${Date.now()}`, name: 'สถานที่ใหม่', latitude: 13.756331, longitude: 100.501765, radius_meters: 150, is_active: true }])}
                  className="px-3 py-1.5 rounded-xl bg-[#00744B] text-white text-xs font-bold"
                >
                  + เพิ่มสถานที่ราชการ
                </button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-xs text-left bma-table">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-extrabold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="w-14 text-center py-3 px-2.5">ลำดับ</th>
                      <th className="w-24 text-center py-3 px-2.5">เรียงลำดับ</th>
                      <th className="py-3 px-3">ชื่อสถานที่ราชการ</th>
                      <th className="py-3 px-3">พิกัด (ละติจูด, ลองจิจูด)</th>
                      <th className="w-32 text-center py-3 px-2.5">รัศมีอนุญาต (เมตร)</th>
                      <th className="w-36 text-center py-3 px-2.5">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(draft.official_locations || []).map((loc, idx) => (
                      <tr key={loc.id || idx}>
                        <td className="text-center font-mono text-slate-400 py-2.5 px-2.5">{idx + 1}</td>
                        <td className="text-center py-2.5 px-2.5">
                          {renderReorderButtons('official_locations', idx, (draft.official_locations || []).length)}
                        </td>
                        <td className="py-2.5 px-3">
                          <input
                            type="text"
                            value={loc.name || ''}
                            onChange={(e) => {
                              const n = [...draft.official_locations];
                              n[idx] = { ...loc, name: e.target.value };
                              updateField('official_locations', n);
                            }}
                            placeholder="ชื่อสถานที่"
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold"
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="number"
                              step="any"
                              value={loc.latitude ?? ''}
                              onChange={(e) => {
                                const n = [...draft.official_locations];
                                n[idx] = { ...loc, latitude: Number(e.target.value) };
                                updateField('official_locations', n);
                              }}
                              placeholder="Latitude"
                              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 font-mono text-xs"
                            />
                            <input
                              type="number"
                              step="any"
                              value={loc.longitude ?? ''}
                              onChange={(e) => {
                                const n = [...draft.official_locations];
                                n[idx] = { ...loc, longitude: Number(e.target.value) };
                                updateField('official_locations', n);
                              }}
                              placeholder="Longitude"
                              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 font-mono text-xs"
                            />
                          </div>
                        </td>
                        <td className="text-center py-2.5 px-2.5">
                          <input
                            type="number"
                            min={10}
                            value={loc.radius_meters ?? 150}
                            onChange={(e) => {
                              const n = [...draft.official_locations];
                              n[idx] = { ...loc, radius_meters: Number(e.target.value) };
                              updateField('official_locations', n);
                            }}
                            placeholder="รัศมี(ม.)"
                            className="w-24 text-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 font-mono text-xs"
                          />
                        </td>
                        <td className="text-center py-2.5 px-2.5">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setMapPickerIdx(idx)}
                              title="เลือกพิกัดบนแผนที่"
                              className="px-2.5 py-1.5 rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-800 text-xs font-bold"
                            >
                              <i className="fa-solid fa-map-pin mr-1" />แผนที่
                            </button>
                            <button
                              type="button"
                              onClick={() => updateField('official_locations', draft.official_locations.filter((_, i) => i !== idx))}
                              className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 inline-flex items-center justify-center"
                            >
                              <i className="fa-solid fa-trash text-xs" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 7: ประกาศระบบ + Upload to Drive + Preview Modal */}
          {activeTab === 7 && (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="inline-flex items-center gap-2.5 font-bold cursor-pointer">
                  <input type="checkbox" checked={Boolean(draft.announcement_enabled)} onChange={(e) => updateField('announcement_enabled', e.target.checked)} className="w-4 h-4 accent-[#00744B]" />
                  <span>เปิดแสดงประกาศแจ้งเตือนระบบเมื่อผู้ใช้เข้าสู่ระบบ</span>
                </label>
                <button type="button" onClick={() => setPreviewModalOpen(true)} className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold shadow-xs">
                  <i className="fa-solid fa-eye mr-1.5" />ตัวอย่างการแสดงผล (Preview)
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">รูปแบบประกาศ</label>
                  <select value={draft.announcement_mode || 'text'} onChange={(e) => updateField('announcement_mode', e.target.value)} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm">
                    <option value="text">ข้อความ (Text / Bullet Cards)</option>
                    <option value="image">รูปภาพ (Image / Drive)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">วันที่เริ่มแสดง</label>
                  <input type="date" value={draft.announcement_start_date || ''} onChange={(e) => updateField('announcement_start_date', e.target.value)} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">วันที่สิ้นสุด</label>
                  <input type="date" value={draft.announcement_end_date || ''} onChange={(e) => updateField('announcement_end_date', e.target.value)} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">หัวข้อประกาศ</label>
                <input type="text" value={draft.announcement_title || ''} onChange={(e) => updateField('announcement_title', e.target.value)} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2" />
              </div>
              {draft.announcement_mode === 'image' ? (
                <div className="space-y-2">
                  <label className="block text-xs font-bold">URL รูปภาพประกาศ หรืออัปโหลดขึ้น Google Drive</label>
                  <div className="flex gap-2">
                    <input type="text" value={draft.announcement_image_url || ''} onChange={(e) => updateField('announcement_image_url', e.target.value)} className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 font-mono text-xs" />
                    <button type="button" onClick={() => annFileRef.current?.click()} className="px-4 py-2 rounded-xl bg-[#00744B] text-white text-xs font-bold shrink-0">
                      <i className="fa-solid fa-cloud-arrow-up mr-1.5" />อัปโหลดขึ้น Drive
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold mb-1">เนื้อหาประกาศ (ขึ้นบรรทัดใหม่ด้วย - หรือ 1. เพื่อจัดเป็นการ์ดไฮไลท์ 4 สี)</label>
                  <textarea rows={5} value={draft.announcement_body || ''} onChange={(e) => updateField('announcement_body', e.target.value)} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tab 6 Map Picker Modal */}
      <OffsiteMapSearchModal
        open={mapPickerIdx >= 0}
        onClose={() => setMapPickerIdx(-1)}
        initialCoords={mapPickerIdx >= 0 && draft.official_locations?.[mapPickerIdx] ? {
          lat: Number(draft.official_locations[mapPickerIdx].latitude || 13.756331),
          lng: Number(draft.official_locations[mapPickerIdx].longitude || 100.501765),
          name: draft.official_locations[mapPickerIdx].name || '',
        } : null}
        onSelectPlace={(place) => {
          if (mapPickerIdx < 0) return;
          const next = [...(draft.official_locations || [])];
          next[mapPickerIdx] = {
            ...next[mapPickerIdx],
            latitude: Number(place.lat.toFixed(6)),
            longitude: Number(place.lng.toFixed(6)),
            name: next[mapPickerIdx].name === 'สถานที่ใหม่' && place.name ? place.name : next[mapPickerIdx].name,
          };
          updateField('official_locations', next);
        }}
      />

      {/* Tab 7 Live Announcement Preview Modal */}
      <SystemUpdateModal
        open={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        settings={draft}
        versionInfo={{ appVersion: 'v3.0.0', buildId: 'Preview' }}
        previewMode
      />
    </AdminLayout>
  );
}
