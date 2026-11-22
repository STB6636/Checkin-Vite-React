import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AdminLayout } from '../components/layout/AdminLayout.jsx';
import { SystemUpdateModal, sanitizeImageUrl } from '../components/layout/SystemUpdateModal.jsx';
import { ResponsiveModal } from '../components/common/ResponsiveModal.jsx';
import { OffsiteMapSearchModal } from './checkin/OffsiteMapSearchModal.jsx';
import { useSettings } from '../contexts/SettingsContext.jsx';
import { SettingsModel } from '../models/SettingsModel.js';
import { Config } from '../core/Config.js';
import { UIHelpers } from '../core/UIHelpers.js';

// Exact 7-Tab Navigation from legacy settings.html (L128-157)
const SETTING_TABS = [
  { id: 1, targetId: 'tab-panel-general', label: '1. ข้อมูลหน่วยงาน & ระบบ', icon: 'fa-building-columns' },
  { id: 2, targetId: 'tab-panel-rules', label: '2. เกณฑ์เวลา & สีรายงาน', icon: 'fa-palette' },
  { id: 3, targetId: 'tab-panel-shifts', label: '3. ช่วงเวลาปฏิบัติราชการ', icon: 'fa-clock' },
  { id: 4, targetId: 'tab-panel-prefixes', label: '4. คำนำหน้า, ลักษณะงาน & หมายเหตุ', icon: 'fa-user-tag' },
  { id: 5, targetId: 'tab-panel-positions', label: '5. ตำแหน่ง & สังกัด', icon: 'fa-briefcase' },
  { id: 6, targetId: 'tab-panel-locations', label: '6. สถานที่และรัศมี', icon: 'fa-map-location-dot' },
  { id: 7, targetId: 'tab-panel-announcement', label: '7. ประกาศระบบ', icon: 'fa-bullhorn' },
];

const COLOR_CARDS = [
  { num: 1, key: 'normal', label: '1. ปฏิบัติงานปกติ', previewText: 'ตัวอย่าง: ปฏิบัติงานปกติ', defaultColor: '#2EC4B6' },
  { num: 2, key: 'late', label: '2. มาสาย', previewText: 'ตัวอย่าง: มาสาย', defaultColor: '#FFB449' },
  { num: 3, key: 'absent_duty', label: '3. ขาด/ไปราชการ/ลา', previewText: 'ตัวอย่าง: ขาดราชการ', defaultColor: '#EB3DA9' },
  { num: 4, key: 'no_checkin', label: '4. ยังไม่ลงเวลาเข้า', previewText: 'ตัวอย่าง: ยังไม่ลงเวลา', defaultColor: '#94A3B8' },
  { num: 5, key: 'overtime', label: '5. ปฏิบัติงานนอกเวลา', previewText: 'ตัวอย่าง: ปฏิบัติงานนอกเวลา', defaultColor: '#6F42C1' },
  { num: 6, key: 'group_header', label: '6. สีหัวตารางรายงาน', previewText: 'ตัวอย่าง: หัวตารางกลุ่ม', defaultColor: '#00744B' },
];

function stripShiftTimeSuffix(rawName = '') {
  return String(rawName || '')
    .replace(/\s*\(\d{1,2}[:.]\d{2}\s*-\s*\d{1,2}[:.]\d{2}.*?\)/g, '')
    .replace(/\s*\(ระบุเวลาเอง\)/g, '')
    .replace(/\s*\(ข้ามวัน\)/g, '')
    .trim();
}

export default function SettingsPage() {
  const { settings, saveSettings } = useSettings();
  const [activeTab, setActiveTab] = useState(1);
  const [draft, setDraft] = useState(() => ({ ...Config.DEFAULT_SETTINGS, ...settings }));
  const [saving, setSaving] = useState(false);

  // Verification Badges State (Tab 1 & Tab 7)
  const [logoBadge, setLogoBadge] = useState({ type: 'info', text: 'พร้อมตรวจสอบ' });
  const [gdriveBadge, setGdriveBadge] = useState({ type: 'info', text: 'ยังไม่ได้ตรวจสอบ' });
  const [annFolderVerifyState, setAnnFolderVerifyState] = useState({
    verifiedFolderName: null,
    verifyFailed: false,
  });
  const [annImgBadge, setAnnImgBadge] = useState({ type: 'info', text: 'พร้อมตรวจสอบ' });
  const [annUploadStatus, setAnnUploadStatus] = useState('');

  const logoFileRef = useRef(null);
  const annFileRef = useRef(null);
  const annFolderInputRef = useRef(null);

  // Tab 7 Preview Modal
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  // Generic Item Modal State (for Tabs 3, 4, 5, 6)
  const [itemModal, setItemModal] = useState({
    open: false,
    mode: '', // 'shift' | 'list-add' | 'list-edit' | 'pos-step1' | 'pos-step2' | 'pos-step3' | 'pos-edit' | 'aff-step1' | 'aff-step2' | 'aff-step3' | 'aff-step4' | 'aff-edit' | 'location'
    title: '',
    editIndex: null,
    fieldKey: '',
    fieldLabel: '',
    placeholder: '',
  });

  // Shift Modal Form
  const [shiftForm, setShiftForm] = useState({
    name: '',
    check_in: '08:30',
    check_out: '16:30',
    is_overtime: false,
    is_overnight: false,
    is_custom: false,
    allow_early_checkin: false,
  });

  // Dynamic Multi-Row Inputs State (Tabs 4 & 5)
  const [multiRows, setMultiRows] = useState(['']);
  const [singleTextVal, setSingleTextVal] = useState('');

  // Position & Affiliation Parent Selectors in Modal (Tab 5)
  const [posModalParents, setPosModalParents] = useState({ type: '', title: '', level: '' });
  const [affModalParents, setAffModalParents] = useState({
    organization: '',
    bureau: '',
    division: '',
    group: '',
  });

  // Official Location Modal Form (Tab 6)
  const [locForm, setLocForm] = useState({
    id: '',
    name: '',
    latitude: 13.756331,
    longitude: 100.501765,
    radius_meters: 150,
    is_active: true,
  });
  const [fetchingGps, setFetchingGps] = useState(false);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);

  useEffect(() => {
    const merged = { ...Config.DEFAULT_SETTINGS, ...settings };
    setDraft(merged);
    setLogoBadge(
      merged.logo_url
        ? { type: 'ok', text: 'ตั้งค่าโลโก้แล้ว' }
        : { type: 'info', text: 'ยังไม่ได้ระบุโลโก้' }
    );
    setGdriveBadge(
      merged.google_drive_script_url
        ? { type: 'info', text: 'ตั้งค่าลิงก์แล้ว' }
        : { type: 'warn', text: 'ยังไม่ได้ระบุลิงก์' }
    );
    setAnnImgBadge(
      String(merged.announcement_image_url || '').trim()
        ? { type: 'ok', text: 'ตั้งค่ารูปภาพแล้ว' }
        : { type: 'info', text: 'พร้อมตรวจสอบ' }
    );
  }, [settings]);

  const updateField = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));

  const badgeStyleClass = (type) => {
    if (type === 'ok') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300';
    if (type === 'err') return 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300';
    if (type === 'warn') return 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300';
    return 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300';
  };

  /**
   * Persist helper for Tabs 1–6:
   * Strictly preserves the 8 popup announcement fields from saved `settings` so saving Tab 1–6
   * never mutates `announcement_updated_at` (ADR-0035, SettingsController.js:1029-1075).
   */
  const persistNonAnnouncementSettings = async (nextDraft, showToast = true) => {
    setSaving(true);
    UIHelpers.showLoading('กำลังบันทึกการตั้งค่าระบบ...');
    try {
      const payload = {
        ...nextDraft,
        announcement_enabled: Boolean(settings?.announcement_enabled),
        announcement_mode: settings?.announcement_mode === 'image' ? 'image' : 'text',
        announcement_start_date: String(settings?.announcement_start_date || ''),
        announcement_end_date: String(settings?.announcement_end_date || ''),
        announcement_title: String(settings?.announcement_title || ''),
        announcement_body: String(settings?.announcement_body ?? ''),
        announcement_image_url: String(settings?.announcement_image_url || ''),
        announcement_updated_at: String(settings?.announcement_updated_at || ''),
      };
      const res = await saveSettings(payload);
      UIHelpers.hideLoading();
      if (!res?.success) {
        await UIHelpers.alert('บันทึกไม่สำเร็จ', res?.message || 'ไม่สามารถบันทึกการตั้งค่าได้', 'error');
        return false;
      }
      if (showToast) {
        await UIHelpers.showToast('บันทึกการตั้งค่าระบบเรียบร้อยแล้ว', 'success', 2500);
      }
      return true;
    } catch (err) {
      UIHelpers.hideLoading();
      await UIHelpers.alert('เกิดข้อผิดพลาด', err?.message || 'ไม่สามารถบันทึกการตั้งค่าได้', 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleMoveItem = async (fieldKey, idx, dir) => {
    const prevDraft = draft;
    const arr = Array.isArray(draft[fieldKey]) ? [...draft[fieldKey]] : [];
    if (SettingsModel.moveItemInArray(arr, idx, dir)) {
      const nextDraft = { ...draft, [fieldKey]: arr };
      setDraft(nextDraft);
      const ok = await persistNonAnnouncementSettings(nextDraft, false);
      if (!ok) {
        setDraft(prevDraft);
      }
    }
  };

  // --- Tab 1 Handlers ---
  const handleLogoFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await SettingsModel.fileToDataUrl(file);
      updateField('logo_url', dataUrl);
      setLogoBadge({ type: 'ok', text: '✓ อัปโหลดไฟล์รูปแล้ว' });
    } catch (_) {
      setLogoBadge({ type: 'err', text: '✗ อ่านไฟล์ไม่สำเร็จ' });
    }
  };

  const handleClearLogo = () => {
    if (logoFileRef.current) logoFileRef.current.value = '';
    updateField('logo_url', '');
    setLogoBadge({ type: 'warn', text: 'ล้างโลโก้แล้ว' });
  };

  const handleVerifyLogoUrl = async () => {
    UIHelpers.showLoading('กำลังตรวจสอบลิงก์รูปโลโก้หน่วยงาน...');
    const result = await UIHelpers.verifyImageUrl(draft.logo_url || '');
    UIHelpers.hideLoading();
    if (result.success) {
      updateField('logo_url', result.normalizedUrl);
      setLogoBadge({ type: 'ok', text: `✓ ลิงก์รูปใช้ได้ (${result.width}×${result.height})` });
      await UIHelpers.alert('ตรวจสอบลิงก์รูปโลโก้สำเร็จ', result.message, 'success');
    } else {
      setLogoBadge({ type: 'err', text: '✗ ลิงก์รูปไม่ถูกต้อง' });
      await UIHelpers.alert('ไม่สามารถโหลดรูปโลโก้ได้', result.message, 'warning');
    }
  };

  const handleVerifyGDrive = async () => {
    const scriptUrl = String(draft.google_drive_script_url || '').trim();
    const folderId = String(draft.google_drive_folder_id || '').trim();
    UIHelpers.showLoading('กำลังตรวจสอบลิงก์ Google Drive...');
    const res = await UIHelpers.verifyGoogleDriveLink(scriptUrl, folderId);
    UIHelpers.hideLoading();
    if (res.success) {
      setGdriveBadge({ type: 'ok', text: '✓ ลิงก์พร้อมใช้งาน' });
      await UIHelpers.alert('ตรวจสอบลิงก์สำเร็จ', res.message, 'success');
    } else {
      setGdriveBadge({ type: 'err', text: '✗ ลิงก์ไม่ถูกต้อง' });
      await UIHelpers.alert('ไม่สามารถเชื่อมต่อลิงก์ได้', res.message, 'warning');
    }
  };

  const handleVerifyAnnouncementFolder = async () => {
    const scriptUrl = String(draft.google_drive_script_url || '').trim();
    const folderId = String(draft.announcement_drive_folder_id || '').trim();
    if (!scriptUrl || !scriptUrl.includes('script.google.com') || !scriptUrl.includes('/exec')) {
      await UIHelpers.alert(
        'ยังไม่ได้ตั้งค่า Apps Script',
        'กรุณากรอกลิงก์ Google Apps Script Web App (.../exec) ด้านบน ก่อนตรวจสอบโฟลเดอร์ประกาศ',
        'warning'
      );
      return;
    }
    if (!folderId) {
      await UIHelpers.alert(
        'กรุณาระบุโฟลเดอร์ประกาศ',
        'กรุณาระบุรหัสหรือลิงก์โฟลเดอร์ Google Drive สำหรับเก็บรูปประกาศ (ห้ามเว้นว่าง)',
        'warning'
      );
      return;
    }
    UIHelpers.showLoading('กำลังตรวจสอบสิทธิ์โฟลเดอร์ประกาศใน Google Drive...');
    const res = await UIHelpers.verifyGoogleDriveLink(scriptUrl, folderId, { strictFolder: true });
    UIHelpers.hideLoading();
    if (res.success) {
      setAnnFolderVerifyState({
        verifiedFolderName: res.folderName || 'พร้อมใช้งาน',
        verifyFailed: false,
      });
      await UIHelpers.alert('ตรวจสอบโฟลเดอร์ประกาศสำเร็จ', res.message, 'success');
    } else {
      setAnnFolderVerifyState({ verifiedFolderName: null, verifyFailed: true });
      await UIHelpers.alert('ไม่สามารถเข้าถึงโฟลเดอร์ได้', res.message, 'warning');
    }
  };

  // --- Tab 3: Work Shifts Modal & Actions ---
  const openShiftModal = (editIdx = null) => {
    if (editIdx !== null) {
      const sh = (draft.work_shifts || [])[editIdx] || {};
      setShiftForm({
        name: stripShiftTimeSuffix(sh.name || ''),
        check_in: UIHelpers.formatTime24(sh.check_in || '08:30'),
        check_out: UIHelpers.formatTime24(sh.check_out || '16:30'),
        is_overtime: Boolean(sh.is_overtime),
        is_overnight: Boolean(sh.is_overnight),
        is_custom: Boolean(sh.is_custom),
        allow_early_checkin: Boolean(sh.allow_early_checkin),
      });
    } else {
      setShiftForm({
        name: '',
        check_in: '08:30',
        check_out: '16:30',
        is_overtime: false,
        is_overnight: false,
        is_custom: false,
        allow_early_checkin: false,
      });
    }
    setItemModal({
      open: true,
      mode: 'shift',
      title: editIdx !== null ? 'แก้ไขช่วงเวลาทำงาน' : 'เพิ่มช่วงเวลาทำงาน',
      editIndex: editIdx,
      fieldKey: 'work_shifts',
      fieldLabel: '',
      placeholder: '',
    });
  };

  const handleDeleteShift = async (idx) => {
    const sh = (draft.work_shifts || [])[idx];
    if (!sh) return;
    const ok = await UIHelpers.confirm('ยืนยันการลบช่วงเวลา', `ต้องการลบ "${sh.name}" ใช่หรือไม่?`, 'ลบรายการ');
    if (!ok) return;
    const nextShifts = (draft.work_shifts || []).filter((_, i) => i !== idx);
    const nextDraft = { ...draft, work_shifts: nextShifts };
    setDraft(nextDraft);
    await persistNonAnnouncementSettings(nextDraft, true);
  };

  // --- Tab 4: Prefixes, Offsite Job Types, Special Request Reasons ---
  const openListAddModal = (fieldKey, title, fieldLabel, placeholder) => {
    setMultiRows(['']);
    setItemModal({
      open: true,
      mode: 'list-add',
      title,
      editIndex: null,
      fieldKey,
      fieldLabel,
      placeholder,
    });
  };

  const openListEditModal = (fieldKey, idx, title, fieldLabel) => {
    const arr = Array.isArray(draft[fieldKey]) ? draft[fieldKey] : [];
    setSingleTextVal(String(arr[idx] || ''));
    setItemModal({
      open: true,
      mode: 'list-edit',
      title,
      editIndex: idx,
      fieldKey,
      fieldLabel,
      placeholder: '',
    });
  };

  const handleDeleteListItem = async (fieldKey, idx, confirmTitle) => {
    const arr = Array.isArray(draft[fieldKey]) ? [...draft[fieldKey]] : [];
    const targetVal = arr[idx];
    const ok = await UIHelpers.confirm(confirmTitle, `ต้องการลบ "${targetVal}" ใช่หรือไม่?`, 'ลบรายการ');
    if (!ok) return;
    arr.splice(idx, 1);
    const nextDraft = { ...draft, [fieldKey]: arr };
    setDraft(nextDraft);
    await persistNonAnnouncementSettings(nextDraft, true);
  };

  // --- Tab 5: Positions (3 Steps) & Affiliations (4 Steps) ---
  const uniquePosTypes = useMemo(() => SettingsModel.getUniquePositionTypes(draft), [draft]);

  const openPosStep1Modal = () => {
    setMultiRows(['']);
    setItemModal({
      open: true,
      mode: 'pos-step1',
      title: '1. เพิ่มประเภทตำแหน่ง (เพิ่มได้หลายรายการ)',
      editIndex: null,
      fieldKey: 'positions',
      fieldLabel: 'ชื่อประเภทตำแหน่ง',
      placeholder: 'เช่น ประเภททั่วไป, ประเภทวิชาการ, ประเภทอำนวยการ',
    });
  };

  const openPosStep2Modal = () => {
    if (uniquePosTypes.length === 0) {
      UIHelpers.alert('ยังไม่มีประเภทตำแหน่ง', 'กรุณากดปุ่ม "1. + เพิ่มประเภทตำแหน่ง" ก่อน', 'warning');
      return;
    }
    setPosModalParents({ type: uniquePosTypes[0] || '', title: '', level: '' });
    setMultiRows(['']);
    setItemModal({
      open: true,
      mode: 'pos-step2',
      title: '2. เพิ่มตำแหน่งในสายงาน (เชื่อมโยงประเภทตำแหน่ง)',
      editIndex: null,
      fieldKey: 'positions',
      fieldLabel: '2. ชื่อตำแหน่งในสายงาน (ค่าลูก)',
      placeholder: 'เช่น เจ้าพนักงานเทศกิจ, นักจัดการงานเทศกิจ',
    });
  };

  const openPosStep3Modal = () => {
    if (uniquePosTypes.length === 0) {
      UIHelpers.alert('ยังไม่มีข้อมูลตำแหน่ง', 'กรุณาเพิ่มประเภทตำแหน่งและชื่อตำแหน่งก่อน', 'warning');
      return;
    }
    const firstType = uniquePosTypes[0] || '';
    const titles = SettingsModel.getUniquePositionTitles(draft, firstType);
    if (titles.length === 0) {
      UIHelpers.alert('ยังไม่มีตำแหน่งในสายงาน', 'กรุณากดปุ่ม "2. + เพิ่มตำแหน่งในสายงาน" ก่อนเพิ่มระดับตำแหน่ง', 'warning');
      return;
    }
    setPosModalParents({ type: firstType, title: titles[0] || '', level: '' });
    setMultiRows(['']);
    setItemModal({
      open: true,
      mode: 'pos-step3',
      title: '3. เพิ่มระดับตำแหน่ง (เชื่อมโยงประเภทและชื่อตำแหน่ง)',
      editIndex: null,
      fieldKey: 'positions',
      fieldLabel: '3. ระดับตำแหน่ง (ค่าลูก)',
      placeholder: 'เช่น ปฏิบัติงาน, ชำนาญงาน, อาวุโส',
    });
  };

  const openPosEditModal = (idx) => {
    const item = (draft.positions || [])[idx] || {};
    setPosModalParents({
      type: item.type || '',
      title: item.title || '',
      level: item.level || '',
    });
    setItemModal({
      open: true,
      mode: 'pos-edit',
      title: 'แก้ไขรายการตำแหน่ง',
      editIndex: idx,
      fieldKey: 'positions',
      fieldLabel: '',
      placeholder: '',
    });
  };

  const handleDeletePosition = async (idx) => {
    const pos = (draft.positions || [])[idx];
    if (!pos) return;
    const ok = await UIHelpers.confirm(
      'ยืนยันการลบรายการตำแหน่ง',
      `ต้องการลบ "${pos.type} > ${pos.title || '-'} > ${pos.level || '-'}" ใช่หรือไม่?`,
      'ลบรายการ'
    );
    if (!ok) return;
    const next = (draft.positions || []).filter((_, i) => i !== idx);
    const nextDraft = { ...draft, positions: next };
    setDraft(nextDraft);
    await persistNonAnnouncementSettings(nextDraft, true);
  };

  const uniqueOrgs = useMemo(() => SettingsModel.getUniqueOrganizations(draft), [draft]);

  const openAffStep1Modal = () => {
    setMultiRows(['']);
    setItemModal({
      open: true,
      mode: 'aff-step1',
      title: '1. เพิ่มหน่วยงานหลัก (เพิ่มได้หลายรายการ)',
      editIndex: null,
      fieldKey: 'affiliations',
      fieldLabel: 'ชื่อหน่วยงานหลัก',
      placeholder: 'เช่น กรุงเทพมหานคร',
    });
  };

  const openAffStep2Modal = () => {
    const firstOrg = uniqueOrgs[0] || 'กรุงเทพมหานคร';
    setAffModalParents({ organization: firstOrg, bureau: '', division: '', group: '' });
    setMultiRows(['']);
    setItemModal({
      open: true,
      mode: 'aff-step2',
      title: '2. เพิ่มสำนักงาน/กอง (เชื่อมโยงหน่วยงานหลัก)',
      editIndex: null,
      fieldKey: 'affiliations',
      fieldLabel: '2. ชื่อสำนักงาน/กอง (ค่าลูก)',
      placeholder: 'เช่น สำนักเทศกิจ',
    });
  };

  const openAffStep3Modal = () => {
    const firstOrg = uniqueOrgs[0] || 'กรุงเทพมหานคร';
    const realBureaus = [...new Set(
      (draft.affiliations || [])
        .filter((a) => (!firstOrg || a.organization === firstOrg) && a.bureau)
        .map((a) => a.bureau)
    )];
    if (realBureaus.length === 0) {
      UIHelpers.alert('ยังไม่มีสำนักงาน/กอง', 'กรุณากดปุ่ม "2. + เพิ่มสำนักงาน/กอง" ก่อนเพิ่มส่วน/ฝ่าย', 'warning');
      return;
    }
    setAffModalParents({
      organization: firstOrg,
      bureau: realBureaus[0] || '',
      division: '',
      group: '',
    });
    setMultiRows(['']);
    setItemModal({
      open: true,
      mode: 'aff-step3',
      title: '3. เพิ่มส่วน/ฝ่าย (เชื่อมโยงสำนักงาน/กอง)',
      editIndex: null,
      fieldKey: 'affiliations',
      fieldLabel: '3. ชื่อส่วน/ฝ่าย (ค่าลูก)',
      placeholder: 'เช่น สำนักงานเลขานุการ, กองตรวจและปฏิบัติการพื้นที่ 1',
    });
  };

  const openAffStep4Modal = () => {
    const firstOrg = uniqueOrgs[0] || 'กรุงเทพมหานคร';
    const realBureaus = [...new Set(
      (draft.affiliations || [])
        .filter((a) => (!firstOrg || a.organization === firstOrg) && a.bureau)
        .map((a) => a.bureau)
    )];
    const firstBureau = realBureaus[0] || '';
    if (!firstBureau) {
      UIHelpers.alert('ยังไม่มีสำนักงาน/กอง', 'กรุณาเพิ่มสำนักงาน/กองและส่วน/ฝ่ายก่อนเพิ่มกลุ่มงาน', 'warning');
      return;
    }
    const divisions = SettingsModel.getUniqueDivisions(draft, firstBureau, firstOrg);
    if (divisions.length === 0) {
      UIHelpers.alert('ยังไม่มีส่วน/ฝ่าย', 'กรุณากดปุ่ม "3. + เพิ่มส่วน/ฝ่าย" ก่อนเพิ่มกลุ่มงาน', 'warning');
      return;
    }
    setAffModalParents({
      organization: firstOrg,
      bureau: firstBureau,
      division: divisions[0] || '',
      group: '',
    });
    setMultiRows(['']);
    setItemModal({
      open: true,
      mode: 'aff-step4',
      title: '4. เพิ่มกลุ่มงาน (เชื่อมโยงส่วน/ฝ่าย)',
      editIndex: null,
      fieldKey: 'affiliations',
      fieldLabel: '4. ชื่อกลุ่มงาน (ค่าลูก)',
      placeholder: 'เช่น กลุ่มงานการเจ้าหน้าที่, กลุ่มงานตรวจและปฏิบัติการ 1',
    });
  };

  const openAffEditModal = (idx) => {
    const item = (draft.affiliations || [])[idx] || {};
    setAffModalParents({
      organization: item.organization || '',
      bureau: item.bureau || '',
      division: item.division || '',
      group: item.group || '',
    });
    setItemModal({
      open: true,
      mode: 'aff-edit',
      title: 'แก้ไขรายการโครงสร้างสังกัด',
      editIndex: idx,
      fieldKey: 'affiliations',
      fieldLabel: '',
      placeholder: '',
    });
  };

  const handleDeleteAffiliation = async (idx) => {
    const aff = (draft.affiliations || [])[idx];
    if (!aff) return;
    const ok = await UIHelpers.confirm(
      'ยืนยันการลบรายการสังกัด',
      `ต้องการลบ "${aff.bureau || aff.organization} > ${aff.division || '-'} > ${aff.group || '-'}" ใช่หรือไม่?`,
      'ลบรายการ'
    );
    if (!ok) return;
    const next = (draft.affiliations || []).filter((_, i) => i !== idx);
    const nextDraft = { ...draft, affiliations: next };
    setDraft(nextDraft);
    await persistNonAnnouncementSettings(nextDraft, true);
  };

  // --- Tab 6: Official Locations Modal & Actions ---
  const openLocationModal = (editIdx = null) => {
    if (editIdx !== null) {
      const cur = (draft.official_locations || [])[editIdx] || {};
      setLocForm({
        id: cur.id || `LOC-${String(Date.now()).slice(-6)}`,
        name: cur.name || '',
        latitude: cur.latitude ?? 13.756331,
        longitude: cur.longitude ?? 100.501765,
        radius_meters: cur.radius_meters ?? 150,
        is_active: cur.is_active !== false,
      });
    } else {
      setLocForm({
        id: `LOC-${String(Date.now()).slice(-6)}`,
        name: '',
        latitude: 13.756331,
        longitude: 100.501765,
        radius_meters: 150,
        is_active: true,
      });
    }
    setItemModal({
      open: true,
      mode: 'location',
      title: editIdx !== null ? 'แก้ไขสถานที่ราชการ' : '+ เพิ่มสถานที่ราชการ',
      editIndex: editIdx,
      fieldKey: 'official_locations',
      fieldLabel: '',
      placeholder: '',
    });
  };

  const handleDeleteLocation = async (idx) => {
    const loc = (draft.official_locations || [])[idx];
    if (!loc) return;
    const ok = await UIHelpers.confirm(
      'ยืนยันการลบสถานที่ราชการ',
      `ต้องการลบ "${loc.name || 'สถานที่ราชการ'}" ใช่หรือไม่?\n(หากลบ บุคลากรจะไม่สามารถใช้สถานที่นี้ในการตรวจสอบ Geofence ได้)`,
      'ลบรายการ'
    );
    if (!ok) return;
    const next = (draft.official_locations || []).filter((_, i) => i !== idx);
    const nextDraft = { ...draft, official_locations: next };
    setDraft(nextDraft);
    await persistNonAnnouncementSettings(nextDraft, true);
  };

  const handleGetCurrentGpsForLocation = () => {
    if (!navigator.geolocation) {
      UIHelpers.alert('ไม่รองรับ GPS', 'เบราว์เซอร์ไม่รองรับ Geolocation', 'warning');
      return;
    }
    setFetchingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocForm((prev) => ({
          ...prev,
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
        }));
        setFetchingGps(false);
        UIHelpers.showToast('ดึงพิกัด GPS ปัจจุบันสำเร็จ', 'success');
      },
      (err) => {
        setFetchingGps(false);
        UIHelpers.alert(
          'ไม่สามารถดึงพิกัดได้',
          err?.message || 'กรุณาอนุญาตการเข้าถึงตำแหน่งที่ตั้ง',
          'warning'
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // --- Generic Item Modal Submit Handler ---
  const handleItemModalSubmit = async (e) => {
    e.preventDefault();
    const { mode, editIndex, fieldKey } = itemModal;
    const cleanMultiValues = multiRows.map((r) => r.trim()).filter(Boolean);

    if (mode === 'shift') {
      const checkIn = UIHelpers.formatTime24(shiftForm.check_in || '08:30');
      const checkOut = UIHelpers.formatTime24(shiftForm.check_out || '16:30');
      const autoOvernight = UIHelpers.timeToMinutes(checkOut) < UIHelpers.timeToMinutes(checkIn);
      const payload = {
        name: shiftForm.name.trim(),
        check_in: checkIn,
        check_out: checkOut,
        is_overtime: Boolean(shiftForm.is_overtime),
        is_overnight: Boolean(shiftForm.is_overnight || autoOvernight),
        is_custom: Boolean(shiftForm.is_custom),
        allow_early_checkin: Boolean(shiftForm.allow_early_checkin),
      };
      const next = [...(draft.work_shifts || [])];
      if (editIndex !== null) next[editIndex] = payload;
      else next.push(payload);
      const nextDraft = { ...draft, work_shifts: next };
      setDraft(nextDraft);
      setItemModal((prev) => ({ ...prev, open: false }));
      await persistNonAnnouncementSettings(nextDraft, true);
      return;
    }

    if (mode === 'list-add') {
      if (cleanMultiValues.length === 0) return;
      const next = [...(Array.isArray(draft[fieldKey]) ? draft[fieldKey] : []), ...cleanMultiValues];
      const nextDraft = { ...draft, [fieldKey]: next };
      setDraft(nextDraft);
      setItemModal((prev) => ({ ...prev, open: false }));
      await persistNonAnnouncementSettings(nextDraft, true);
      return;
    }

    if (mode === 'list-edit') {
      const val = singleTextVal.trim();
      if (!val || editIndex === null) return;
      const next = [...(Array.isArray(draft[fieldKey]) ? draft[fieldKey] : [])];
      next[editIndex] = val;
      const nextDraft = { ...draft, [fieldKey]: next };
      setDraft(nextDraft);
      setItemModal((prev) => ({ ...prev, open: false }));
      await persistNonAnnouncementSettings(nextDraft, true);
      return;
    }

    if (mode === 'pos-step1') {
      const next = [...(draft.positions || [])];
      for (const t of cleanMultiValues) {
        if (!next.some((p) => p.type === t)) {
          next.push({ type: t, title: '', level: '' });
        }
      }
      const nextDraft = { ...draft, positions: next };
      setDraft(nextDraft);
      setItemModal((prev) => ({ ...prev, open: false }));
      await persistNonAnnouncementSettings(nextDraft, true);
      return;
    }

    if (mode === 'pos-step2') {
      const parentType = posModalParents.type;
      if (!parentType || cleanMultiValues.length === 0) return;
      const next = [...(draft.positions || [])];
      for (const title of cleanMultiValues) {
        const emptyIdx = next.findIndex((p) => p.type === parentType && !p.title);
        if (emptyIdx !== -1) {
          next[emptyIdx] = { ...next[emptyIdx], title };
        } else {
          let lastTypeIdx = -1;
          next.forEach((p, idx) => {
            if (p.type === parentType) lastTypeIdx = idx;
          });
          const newObj = { type: parentType, title, level: '' };
          if (lastTypeIdx !== -1) next.splice(lastTypeIdx + 1, 0, newObj);
          else next.push(newObj);
        }
      }
      const nextDraft = { ...draft, positions: next };
      setDraft(nextDraft);
      setItemModal((prev) => ({ ...prev, open: false }));
      await persistNonAnnouncementSettings(nextDraft, true);
      return;
    }

    if (mode === 'pos-step3') {
      const parentType = posModalParents.type;
      const parentTitle = posModalParents.title;
      if (!parentType || !parentTitle || cleanMultiValues.length === 0) return;
      const next = [...(draft.positions || [])];
      for (const level of cleanMultiValues) {
        const emptyIdx = next.findIndex(
          (p) => p.type === parentType && p.title === parentTitle && !p.level
        );
        if (emptyIdx !== -1) {
          next[emptyIdx] = { ...next[emptyIdx], level };
        } else {
          let lastTitleIdx = -1;
          next.forEach((p, idx) => {
            if (p.type === parentType && p.title === parentTitle) lastTitleIdx = idx;
          });
          const newObj = { type: parentType, title: parentTitle, level };
          if (lastTitleIdx !== -1) next.splice(lastTitleIdx + 1, 0, newObj);
          else next.push(newObj);
        }
      }
      const nextDraft = { ...draft, positions: next };
      setDraft(nextDraft);
      setItemModal((prev) => ({ ...prev, open: false }));
      await persistNonAnnouncementSettings(nextDraft, true);
      return;
    }

    if (mode === 'pos-edit') {
      if (editIndex === null) return;
      const next = [...(draft.positions || [])];
      next[editIndex] = {
        type: posModalParents.type.trim(),
        title: posModalParents.title.trim(),
        level: posModalParents.level.trim(),
      };
      const nextDraft = { ...draft, positions: next };
      setDraft(nextDraft);
      setItemModal((prev) => ({ ...prev, open: false }));
      await persistNonAnnouncementSettings(nextDraft, true);
      return;
    }

    if (mode === 'aff-step1') {
      const next = [...(draft.affiliations || [])];
      for (const org of cleanMultiValues) {
        if (!next.some((a) => a.organization === org)) {
          next.push({ organization: org, bureau: '', division: '', group: '' });
        }
      }
      const nextDraft = { ...draft, affiliations: next };
      setDraft(nextDraft);
      setItemModal((prev) => ({ ...prev, open: false }));
      await persistNonAnnouncementSettings(nextDraft, true);
      return;
    }

    if (mode === 'aff-step2') {
      const parentOrg = affModalParents.organization;
      if (!parentOrg || cleanMultiValues.length === 0) return;
      const next = [...(draft.affiliations || [])];
      for (const bureau of cleanMultiValues) {
        const emptyIdx = next.findIndex((a) => a.organization === parentOrg && !a.bureau);
        if (emptyIdx !== -1) {
          next[emptyIdx] = { ...next[emptyIdx], bureau };
        } else {
          let lastOrgIdx = -1;
          next.forEach((a, idx) => {
            if (a.organization === parentOrg) lastOrgIdx = idx;
          });
          const newObj = { organization: parentOrg, bureau, division: '', group: '' };
          if (lastOrgIdx !== -1) next.splice(lastOrgIdx + 1, 0, newObj);
          else next.push(newObj);
        }
      }
      const nextDraft = { ...draft, affiliations: next };
      setDraft(nextDraft);
      setItemModal((prev) => ({ ...prev, open: false }));
      await persistNonAnnouncementSettings(nextDraft, true);
      return;
    }

    if (mode === 'aff-step3') {
      const parentOrg = affModalParents.organization;
      const parentBureau = affModalParents.bureau;
      if (!parentOrg || !parentBureau || cleanMultiValues.length === 0) return;
      const next = [...(draft.affiliations || [])];
      for (const div of cleanMultiValues) {
        const emptyIdx = next.findIndex(
          (a) => a.organization === parentOrg && a.bureau === parentBureau && !a.division
        );
        if (emptyIdx !== -1) {
          next[emptyIdx] = { ...next[emptyIdx], division: div };
        } else {
          let lastBureauIdx = -1;
          next.forEach((a, idx) => {
            if (a.organization === parentOrg && a.bureau === parentBureau) lastBureauIdx = idx;
          });
          const newObj = { organization: parentOrg, bureau: parentBureau, division: div, group: '' };
          if (lastBureauIdx !== -1) next.splice(lastBureauIdx + 1, 0, newObj);
          else next.push(newObj);
        }
      }
      const nextDraft = { ...draft, affiliations: next };
      setDraft(nextDraft);
      setItemModal((prev) => ({ ...prev, open: false }));
      await persistNonAnnouncementSettings(nextDraft, true);
      return;
    }

    if (mode === 'aff-step4') {
      const parentOrg = affModalParents.organization;
      const parentBureau = affModalParents.bureau;
      const parentDivision = affModalParents.division;
      if (!parentOrg || !parentBureau || !parentDivision || cleanMultiValues.length === 0) return;
      const next = [...(draft.affiliations || [])];
      for (const grp of cleanMultiValues) {
        const emptyIdx = next.findIndex(
          (a) =>
            a.organization === parentOrg &&
            a.bureau === parentBureau &&
            a.division === parentDivision &&
            !a.group
        );
        if (emptyIdx !== -1) {
          next[emptyIdx] = { ...next[emptyIdx], group: grp };
        } else {
          let lastDivIdx = -1;
          next.forEach((a, idx) => {
            if (
              a.organization === parentOrg &&
              a.bureau === parentBureau &&
              a.division === parentDivision
            ) {
              lastDivIdx = idx;
            }
          });
          const newObj = {
            organization: parentOrg,
            bureau: parentBureau,
            division: parentDivision,
            group: grp,
          };
          if (lastDivIdx !== -1) next.splice(lastDivIdx + 1, 0, newObj);
          else next.push(newObj);
        }
      }
      const nextDraft = { ...draft, affiliations: next };
      setDraft(nextDraft);
      setItemModal((prev) => ({ ...prev, open: false }));
      await persistNonAnnouncementSettings(nextDraft, true);
      return;
    }

    if (mode === 'aff-edit') {
      if (editIndex === null) return;
      const next = [...(draft.affiliations || [])];
      next[editIndex] = {
        organization: affModalParents.organization.trim(),
        bureau: affModalParents.bureau.trim(),
        division: affModalParents.division.trim(),
        group: affModalParents.group.trim(),
      };
      const nextDraft = { ...draft, affiliations: next };
      setDraft(nextDraft);
      setItemModal((prev) => ({ ...prev, open: false }));
      await persistNonAnnouncementSettings(nextDraft, true);
      return;
    }

    if (mode === 'location') {
      const name = String(locForm.name || '').trim();
      const lat = Number(locForm.latitude);
      const lng = Number(locForm.longitude);
      const radius = Number(locForm.radius_meters);
      if (!name) {
        await UIHelpers.alert('ข้อมูลไม่ครบถ้วน', 'กรุณาระบุชื่อสถานที่ราชการ', 'warning');
        return;
      }
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        await UIHelpers.alert('พิกัดไม่ถูกต้อง', 'กรุณาระบุพิกัดละติจูดและลองจิจูดให้ถูกต้อง', 'warning');
        return;
      }
      const locItem = {
        id: locForm.id || `LOC-${String(Date.now()).slice(-6)}`,
        name,
        latitude: lat,
        longitude: lng,
        radius_meters: Number.isFinite(radius) ? radius : 150,
        is_active: Boolean(locForm.is_active),
        updated_at: new Date().toISOString(),
      };
      const next = [...(draft.official_locations || [])];
      if (editIndex !== null) next[editIndex] = locItem;
      else next.push(locItem);
      const nextDraft = { ...draft, official_locations: next };
      setDraft(nextDraft);
      setItemModal((prev) => ({ ...prev, open: false }));
      await persistNonAnnouncementSettings(nextDraft, true);
    }
  };

  // --- Tab 7: Announcement Handlers ---
  const handleJumpToTab1Folder = () => {
    setActiveTab(1);
    setTimeout(() => {
      if (annFolderInputRef.current) {
        annFolderInputRef.current.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        annFolderInputRef.current.focus?.();
      }
    }, 80);
  };

  const handleFillAnnouncementTemplate = () => {
    setDraft((prev) => ({
      ...prev,
      announcement_title: 'แจ้งปรับปรุง ระบบลงเวลาปฏิบัติราชการ (สตบ.)',
      announcement_body: [
        '- ปรับปรุงหน้าลงเวลาปฏิบัติราชการใหม่ ใช้ง่ายกว่าเดิม',
        '- เพิ่มเลือก "ในสถานที่/นอกสถานที่" และจำกัดรัศมีลงเวลากรณีใช้ในสถานที่ (ต้องอยู่ในพิกัดรัศมีเท่านั้นถึงลงเวลาได้)',
        '- ระบบผู้ดูแล Admin , เพิ่มฟังชั่น Sync ข้อมูล RealTime ไม่ต้องคอยรีเฟรชจออัพเดทข้อมูล',
        '- ระบบผู้ดูแล Admin , แก้ไขการพิมพ์ข้อมูลหน้ารายงาน ให้สวยงามและตารางต่อเนื่องไม่เว้นช่วงหน้ากระดาษ',
      ].join('\n'),
    }));
    UIHelpers.showToast('ใส่เทมเพลตประกาศ v2.10.0 เรียบร้อยแล้ว', 'success', 2000);
  };

  const handleUploadAnnImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(String(file.type || '').toLowerCase())) {
      e.target.value = '';
      await UIHelpers.alert('ไฟล์ไม่รองรับ', 'กรุณาเลือกไฟล์รูปภาพ PNG, JPG หรือ WebP เท่านั้น', 'warning');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      e.target.value = '';
      await UIHelpers.alert('ไฟล์มีขนาดใหญ่เกินไป', 'ขนาดไฟล์ต้องไม่เกิน 5 MB', 'warning');
      return;
    }

    const scriptUrl = String(draft.google_drive_script_url || '').trim();
    const folderId = String(draft.announcement_drive_folder_id || '').trim();
    if (!scriptUrl || !scriptUrl.includes('script.google.com') || !scriptUrl.includes('/exec')) {
      e.target.value = '';
      await UIHelpers.alert(
        'ยังไม่ได้ตั้งค่า Apps Script',
        'กรุณากรอกลิงก์ Google Apps Script Web App (.../exec) ในแท็บ 1 (ข้อมูลหน่วยงาน & ระบบ) ก่อนอัปโหลดรูปภาพ',
        'warning'
      );
      return;
    }
    if (!folderId) {
      e.target.value = '';
      await UIHelpers.alert(
        'กรุณาระบุโฟลเดอร์ประกาศ',
        'กรุณาระบุโฟลเดอร์ Google Drive เก็บรูปประกาศในแท็บ 1 (ข้อมูลหน่วยงาน & ระบบ) > การ์ด "ข้อมูลหน่วยงาน และข้อความระบบ" ก่อนอัปโหลดรูปภาพ',
        'warning'
      );
      return;
    }

    setAnnUploadStatus('กำลังอัปโหลดไปยัง Google Drive...');
    UIHelpers.showLoading('กำลังอัปโหลดรูปประกาศไปยัง Google Drive...');
    try {
      const dataUrl = await SettingsModel.fileToDataUrl(file);
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const uploadedUrl = await UIHelpers.uploadPhotoToGoogleDrive(
        dataUrl,
        'Announcement',
        { ...draft, google_drive_script_url: scriptUrl },
        {
          folderId,
          strictFolder: true,
          mimeType: file.type,
          fileName: `Announcement_${UIHelpers.getTodayISO()}_${Date.now()}.${ext}`,
        }
      );
      const finalUrl = typeof uploadedUrl === 'string'
        ? uploadedUrl.trim()
        : String(uploadedUrl?.url || '').trim();
      if (!finalUrl || finalUrl.startsWith('data:')) {
        throw new Error('Google Drive ไม่ได้ส่งลิงก์รูปภาพกลับมา (ยกเลิกการเก็บ Base64 ลงฐานข้อมูล)');
      }
      updateField('announcement_image_url', finalUrl);
      setAnnUploadStatus('✓ อัปโหลดสำเร็จ');
      setAnnImgBadge({ type: 'ok', text: '✓ อัปโหลดขึ้น Drive แล้ว' });
      UIHelpers.hideLoading();
      await UIHelpers.showToast('อัปโหลดรูปประกาศขึ้น Google Drive สำเร็จ', 'success', 2500);
    } catch (err) {
      UIHelpers.hideLoading();
      setAnnUploadStatus('✗ อัปโหลดไม่สำเร็จ');
      await UIHelpers.alert(
        'อัปโหลดรูปภาพไม่สำเร็จ',
        err?.message || 'กรุณาตรวจสอบสิทธิ์โฟลเดอร์และการ Deploy Google Apps Script',
        'error'
      );
    } finally {
      e.target.value = '';
    }
  };

  const handleVerifyAnnouncementImage = async () => {
    UIHelpers.showLoading('กำลังตรวจสอบลิงก์รูปภาพประกาศ...');
    const result = await UIHelpers.verifyImageUrl(draft.announcement_image_url || '');
    UIHelpers.hideLoading();
    if (result.success) {
      updateField('announcement_image_url', result.normalizedUrl);
      setAnnImgBadge({ type: 'ok', text: `✓ ใช้ได้ (${result.width}×${result.height})` });
      await UIHelpers.alert('ตรวจสอบลิงก์รูปภาพสำเร็จ', result.message, 'success');
    } else {
      setAnnImgBadge({ type: 'err', text: '✗ ลิงก์รูปไม่ถูกต้อง' });
      await UIHelpers.alert('ไม่สามารถโหลดรูปภาพได้', result.message, 'warning');
    }
  };

  const handleClearAnnouncementImage = () => {
    if (annFileRef.current) annFileRef.current.value = '';
    updateField('announcement_image_url', '');
    setAnnUploadStatus('');
    setAnnImgBadge({ type: 'warn', text: 'ล้างรูปภาพแล้ว' });
  };

  const handleSaveAnnouncementSettings = async () => {
    const start = String(draft.announcement_start_date || '').trim();
    const end = String(draft.announcement_end_date || '').trim();
    if (start && end && end < start) {
      await UIHelpers.alert('ช่วงวันที่ไม่ถูกต้อง', 'วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น', 'warning');
      return;
    }
    if (draft.announcement_enabled) {
      if (draft.announcement_mode === 'image') {
        if (!String(draft.announcement_image_url || '').trim()) {
          await UIHelpers.alert(
            'ข้อมูลยังไม่ครบถ้วน',
            'กรุณาอัปโหลดรูปภาพหรือระบุลิงก์รูปภาพประกาศก่อนเปิดใช้งาน',
            'warning'
          );
          return;
        }
      } else if (!String(draft.announcement_title || '').trim() && !String(draft.announcement_body || '').trim()) {
        await UIHelpers.alert(
          'ข้อมูลยังไม่ครบถ้วน',
          'กรุณากรอกหัวข้อหรือรายละเอียดประกาศก่อนเปิดใช้งาน',
          'warning'
        );
        return;
      }
    }

    setSaving(true);
    UIHelpers.showLoading('กำลังบันทึกการตั้งค่าประกาศระบบ...');
    try {
      // Scoped Tab 7 save: preserve saved Tab 1–6 settings and update only the 7 announcement fields + timestamp
      const payload = {
        ...Config.DEFAULT_SETTINGS,
        ...settings,
        announcement_enabled: Boolean(draft.announcement_enabled),
        announcement_mode: draft.announcement_mode === 'image' ? 'image' : 'text',
        announcement_start_date: String(draft.announcement_start_date || ''),
        announcement_end_date: String(draft.announcement_end_date || ''),
        announcement_title: String(draft.announcement_title || ''),
        announcement_body: String(draft.announcement_body ?? ''),
        announcement_image_url: String(draft.announcement_image_url || ''),
        announcement_updated_at: new Date().toISOString(),
      };
      const res = await saveSettings(payload);
      UIHelpers.hideLoading();
      if (!res?.success) {
        await UIHelpers.alert('บันทึกไม่สำเร็จ', res?.message || 'เกิดข้อผิดพลาด', 'error');
        return;
      }
      await UIHelpers.showToast('บันทึกการตั้งค่าประกาศระบบเรียบร้อยแล้ว', 'success', 2500);
    } catch (err) {
      UIHelpers.hideLoading();
      await UIHelpers.alert('เกิดข้อผิดพลาด', err?.message || 'ไม่สามารถบันทึกได้', 'error');
    } finally {
      setSaving(false);
    }
  };

  // --- Computed UI Helpers ---
  const renderSortButtons = (fieldKey, index, totalLength) => (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={index === 0}
        onClick={() => handleMoveItem(fieldKey, index, 'up')}
        title="เลื่อนขึ้น"
        className="btn-sort-arrow w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-600 dark:text-slate-300 inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      >
        <i className="fa-solid fa-arrow-up text-[11px]" />
      </button>
      <button
        type="button"
        disabled={index === totalLength - 1}
        onClick={() => handleMoveItem(fieldKey, index, 'down')}
        title="เลื่อนลง"
        className="btn-sort-arrow w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-600 dark:text-slate-300 inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      >
        <i className="fa-solid fa-arrow-down text-[11px]" />
      </button>
    </div>
  );

  const logoPreviewUrl = sanitizeImageUrl(draft.logo_url) || draft.logo_url || '';
  const annPreviewUrl = sanitizeImageUrl(draft.announcement_image_url);

  const annFolderBadgeInfo = useMemo(() => {
    const folderId = String(draft.announcement_drive_folder_id || '').trim();
    if (annFolderVerifyState.verifyFailed) {
      return { type: 'err', text: '✗ โฟลเดอร์ไม่ถูกต้อง' };
    }
    if (annFolderVerifyState.verifiedFolderName) {
      return { type: 'ok', text: `✓ ${annFolderVerifyState.verifiedFolderName}` };
    }
    if (folderId) {
      return { type: 'info', text: 'ระบุโฟลเดอร์แล้ว' };
    }
    return { type: 'warn', text: 'รอระบุโฟลเดอร์' };
  }, [draft.announcement_drive_folder_id, annFolderVerifyState]);

  const annLiveStatus = useMemo(() => {
    if (!draft.announcement_enabled) {
      return {
        className:
          'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-slate-900/40 border border-white/20 text-slate-200 shrink-0',
        icon: 'fa-circle text-[8px] text-slate-400',
        label: 'ปิดใช้งาน',
      };
    }
    const today = UIHelpers.getTodayISO();
    const start = String(draft.announcement_start_date || '').trim();
    const end = String(draft.announcement_end_date || '').trim();
    const inRange = (!start || today >= start) && (!end || today <= end);
    if (!inRange) {
      return {
        className:
          'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-amber-500/25 border border-amber-300/40 text-amber-100 shrink-0',
        icon: 'fa-clock text-[10px] text-[#F6DE51]',
        label: 'นอกช่วงวันที่',
      };
    }
    return {
      className:
        'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-emerald-400/25 border border-emerald-200/50 text-white shrink-0',
      icon: 'fa-circle text-[8px] text-emerald-300 animate-pulse',
      label: 'เปิดใช้งาน',
    };
  }, [draft.announcement_enabled, draft.announcement_start_date, draft.announcement_end_date]);

  const renderTab7FolderHint = () => {
    const scriptUrl = String(draft.google_drive_script_url || '').trim();
    const folderId = String(draft.announcement_drive_folder_id || '').trim();
    const hasValidScript = Boolean(
      scriptUrl && scriptUrl.includes('script.google.com') && scriptUrl.includes('/exec')
    );

    if (annFolderVerifyState.verifyFailed) {
      return (
        <>
          <span className="text-rose-600 dark:text-rose-400 font-bold">
            ✗ ตรวจสอบโฟลเดอร์รูปประกาศไม่ผ่าน
          </span>{' '}
          — กรุณาตรวจสอบสิทธิ์หรือรหัสโฟลเดอร์ใน{' '}
          <b>แท็บ 1 (ข้อมูลหน่วยงาน &amp; ระบบ) &gt; การ์ด "ข้อมูลหน่วยงาน และข้อความระบบ"</b>
        </>
      );
    }
    if (!hasValidScript && !folderId) {
      return (
        <>
          <span className="text-amber-600 dark:text-amber-400 font-bold">
            ⚠ ยังไม่ได้ระบุ Apps Script URL และโฟลเดอร์รูปประกาศ
          </span>{' '}
          — ตั้งค่าได้ที่{' '}
          <b>แท็บ 1 (ข้อมูลหน่วยงาน &amp; ระบบ) &gt; การ์ด "ข้อมูลหน่วยงาน และข้อความระบบ"</b>
        </>
      );
    }
    if (!hasValidScript) {
      return (
        <>
          <span className="text-amber-600 dark:text-amber-400 font-bold">
            ⚠ ยังไม่ได้ระบุ Google Apps Script Web App URL
          </span>{' '}
          — โฟลเดอร์ประกาศปัจจุบัน:{' '}
          <code className="font-mono break-all px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
            {folderId}
          </code>{' '}
          (ตั้งค่าใน <b>แท็บ 1 &gt; ข้อมูลหน่วยงาน และข้อความระบบ</b>)
        </>
      );
    }
    if (!folderId) {
      return (
        <>
          <span className="text-amber-600 dark:text-amber-400 font-bold">
            ⚠ ยังไม่ได้ระบุโฟลเดอร์ Google Drive เก็บรูปประกาศ
          </span>{' '}
          — กดปุ่ม <b>"ไปตั้งค่าในแท็บ 1"</b> เพื่อระบุใน{' '}
          <b>แท็บ 1 (ข้อมูลหน่วยงาน &amp; ระบบ) &gt; การ์ด "ข้อมูลหน่วยงาน และข้อความระบบ"</b>
        </>
      );
    }
    if (annFolderVerifyState.verifiedFolderName) {
      return (
        <>
          <span className="text-emerald-700 dark:text-emerald-400 font-bold">
            ✓ พร้อมใช้งาน ({annFolderVerifyState.verifiedFolderName})
          </span>{' '}
          — โฟลเดอร์:{' '}
          <code className="font-mono break-all px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
            {folderId}
          </code>{' '}
          (แก้ไขได้ที่ <b>แท็บ 1 &gt; ข้อมูลหน่วยงาน และข้อความระบบ</b>)
        </>
      );
    }
    return (
      <>
        <span className="text-emerald-700 dark:text-emerald-400 font-bold">✓ ตั้งค่าแล้ว</span> —
        ใช้ Apps Script Web App ร่วมกับโฟลเดอร์รูปประกาศ:{' '}
        <code className="font-mono break-all px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
          {folderId}
        </code>{' '}
        (แก้ไขได้ที่ <b>แท็บ 1 &gt; ข้อมูลหน่วยงาน และข้อความระบบ</b>)
      </>
    );
  };

  const renderMultiRowInputsUI = () => (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-extrabold text-slate-800 dark:text-white">
          {itemModal.fieldLabel} (เพิ่มได้หลายรายการพร้อมกัน) *
        </label>
        <button
          type="button"
          onClick={() => setMultiRows((prev) => [...prev, ''])}
          className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-[#00744B] dark:text-emerald-300 text-xs font-bold hover:bg-emerald-100 transition cursor-pointer"
        >
          <i className="fa-solid fa-plus mr-1" />
          เพิ่มแถวรายการ
        </button>
      </div>
      <div className="space-y-2">
        {multiRows.map((val, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              type="text"
              required={idx === 0}
              value={val}
              placeholder={itemModal.placeholder}
              onChange={(e) => {
                const next = [...multiRows];
                next[idx] = e.target.value;
                setMultiRows(next);
              }}
              className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => {
                if (multiRows.length <= 1) {
                  setMultiRows(['']);
                } else {
                  setMultiRows(multiRows.filter((_, i) => i !== idx));
                }
              }}
              title="ลบแถวนี้"
              className="py-2 px-2.5 rounded-xl border border-rose-200 dark:border-rose-800 text-rose-500 hover:bg-rose-50 text-xs cursor-pointer"
            >
              <i className="fa-solid fa-trash" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <AdminLayout
      title="ตั้งค่าระบบพื้นฐาน (สำหรับ SuperAdmin)"
      subtitle="จัดการหน่วยงาน, เวลาเริ่มเข้างาน, เกณฑ์เวลาออกงาน, กรองกะตามเวลาจริง และโครงสร้างแม่-ลูก"
      activePage="settings"
    >
      <input
        ref={logoFileRef}
        id="setLogoFileInput"
        type="file"
        accept="image/*"
        onChange={handleLogoFileChange}
        className="hidden"
      />
      <input
        ref={annFileRef}
        id="setAnnouncementImageFile"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleUploadAnnImage}
        className="hidden"
      />

      {/* Settings Sub-Navigation Tabs (#settingsTabNav, settings.html:128-157) */}
      <div
        id="settingsTabNav"
        className="bg-white dark:bg-slate-800 rounded-2xl p-2 shadow-sm border border-slate-200/80 dark:border-slate-700/60 flex flex-wrap gap-2 mb-6"
      >
        {SETTING_TABS.map((t) => {
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              data-tab-target={t.targetId}
              onClick={() => setActiveTab(t.id)}
              className={`settings-tab-btn inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#00744B] text-white shadow-md shadow-emerald-900/20 active'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700/60 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              <i className={`fa-solid ${t.icon}`} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: 1. ข้อมูลหน่วยงาน & ระบบ (settings.html:160-412) */}
      {activeTab === 1 && (
        <div id="tab-panel-general" className="settings-tab-pane space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Card (6/12): ข้อมูลหน่วยงาน โลโก้ และ Google Drive */}
            <div className="lg:col-span-6 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200/80 dark:border-slate-700/60 p-6 space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-200 dark:border-slate-700">
                <span className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-[#00744B] flex items-center justify-center text-sm shadow-xs">
                  <i className="fa-solid fa-building-columns" />
                </span>
                <h2 className="text-base font-extrabold text-slate-800 dark:text-white">
                  ข้อมูลหน่วยงาน และข้อความระบบ
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label htmlFor="setOrgName" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    ชื่อหน่วยงานหลัก *
                  </label>
                  <input
                    id="setOrgName"
                    type="text"
                    value={draft.organization_name || ''}
                    onChange={(e) => updateField('organization_name', e.target.value)}
                    placeholder="เช่น กรุงเทพมหานคร"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold"
                  />
                </div>
                <div>
                  <label htmlFor="setBureauName" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    ชื่อสังกัด [สำนักงาน/กอง] *
                  </label>
                  <input
                    id="setBureauName"
                    type="text"
                    value={draft.bureau_name || ''}
                    onChange={(e) => updateField('bureau_name', e.target.value)}
                    placeholder="เช่น สำนักเทศกิจ"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="setHeaderSystemTitle" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  <i className="fa-solid fa-heading mr-1 text-[#00744B]" />
                  ข้อความแถบ Header หน้าเข้าสู่ระบบ
                </label>
                <input
                  id="setHeaderSystemTitle"
                  type="text"
                  value={draft.header_system_title || ''}
                  onChange={(e) => updateField('header_system_title', e.target.value)}
                  placeholder="เช่น BMA e-Government Time Attendance System"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold"
                />
              </div>

              <div>
                <label htmlFor="setFooterDescInput" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  <i className="fa-solid fa-quote-left mr-1 text-[#00744B]" />
                  ข้อความอธิบาย Footer (บรรทัดที่ 2)
                </label>
                <input
                  id="setFooterDescInput"
                  type="text"
                  value={draft.footer_description || ''}
                  onChange={(e) => updateField('footer_description', e.target.value)}
                  placeholder="เช่น ระบบบันทึกเวลาปฏิบัติราชการอิเล็กทรอนิกส์ เพื่อการบริหารงานบุคคลที่มีประสิทธิภาพ"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
                />
              </div>

              {/* โลโก้หน่วยงาน */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-700/60 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300">
                    รูปโลโก้หน่วยงาน
                  </label>
                  <span
                    id="logoUrlVerifyBadge"
                    className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold ${badgeStyleClass(logoBadge.type)}`}
                  >
                    {logoBadge.text}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div
                    id="setLogoPreviewBox"
                    className="w-20 h-20 rounded-2xl border-2 border-emerald-500/30 flex items-center justify-center bg-white dark:bg-slate-800 p-2 shrink-0 shadow-sm overflow-hidden"
                  >
                    {logoPreviewUrl ? (
                      <img src={logoPreviewUrl} alt="Logo Preview" className="w-full h-full object-contain rounded-xl" />
                    ) : (
                      <i className="fa-solid fa-image text-2xl text-slate-400" />
                    )}
                  </div>
                  <div className="flex-1 space-y-2 w-full">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => logoFileRef.current?.click()}
                        className="px-3 py-1 rounded-lg text-xs font-bold bg-[#00744B] text-white hover:bg-[#005B3A] transition cursor-pointer"
                      >
                        <i className="fa-solid fa-upload mr-1" />
                        เลือกไฟล์รูปภาพ
                      </button>
                      <button
                        type="button"
                        id="btnClearLogo"
                        onClick={handleClearLogo}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold text-rose-500 border border-rose-300 hover:bg-rose-50 transition cursor-pointer"
                      >
                        ล้างโลโก้
                      </button>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        id="setLogoUrlInput"
                        type="text"
                        value={draft.logo_url || ''}
                        onChange={(e) => updateField('logo_url', e.target.value)}
                        placeholder="วางลิงก์ URL รูปโลโก้ที่นี่..."
                        className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs flex-1"
                      />
                      <button
                        type="button"
                        id="btnVerifyLogoUrl"
                        onClick={handleVerifyLogoUrl}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 transition cursor-pointer whitespace-nowrap"
                      >
                        <i className="fa-solid fa-magnifying-glass-chart" />
                        <span>ตรวจสอบลิงก์</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Google Drive */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-700/60 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-extrabold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <i className="fa-brands fa-google-drive text-[#00744B] text-sm" />
                    <span>จัดเก็บไฟล์รูปถ่ายใน Google Drive</span>
                  </div>
                  <span
                    id="gdriveVerifyBadge"
                    className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold ${badgeStyleClass(gdriveBadge.type)}`}
                  >
                    {gdriveBadge.text}
                  </span>
                </div>

                <div className="space-y-2.5">
                  <div>
                    <label htmlFor="setGDriveScriptUrl" className="block text-[11px] font-bold text-slate-500 mb-0.5">
                      Google Apps Script Web App URL (ใช้ร่วมกันทั้งระบบ)
                    </label>
                    <input
                      id="setGDriveScriptUrl"
                      type="text"
                      value={draft.google_drive_script_url || ''}
                      onChange={(e) => {
                        updateField('google_drive_script_url', e.target.value);
                        setAnnFolderVerifyState({ verifiedFolderName: null, verifyFailed: false });
                      }}
                      placeholder="https://script.google.com/macros/s/.../exec"
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label htmlFor="setGDriveFolderId" className="block text-[11px] font-bold text-slate-500 mb-0.5">
                      Google Drive Folder ID (เก็บรูปถ่ายลงเวลา)
                    </label>
                    <input
                      id="setGDriveFolderId"
                      type="text"
                      value={draft.google_drive_folder_id || ''}
                      onChange={(e) => updateField('google_drive_folder_id', e.target.value)}
                      placeholder="เช่น 1A2b3C4d5E..."
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-mono"
                    />
                  </div>
                  <button
                    type="button"
                    id="btnVerifyGDrive"
                    onClick={handleVerifyGDrive}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 transition cursor-pointer"
                  >
                    <i className="fa-solid fa-shield-check" />
                    <span>ตรวจสอบการเชื่อมต่อ Google Drive</span>
                  </button>

                  {/* โฟลเดอร์ Google Drive เก็บรูปประกาศ */}
                  <div className="pt-3 mt-1 border-t border-slate-200/80 dark:border-slate-700/60 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label htmlFor="setAnnouncementDriveFolderId" className="block text-[11px] font-extrabold text-slate-700 dark:text-slate-200">
                        <i className="fa-brands fa-google-drive mr-1 text-emerald-600" />
                        โฟลเดอร์ Google Drive เก็บรูปประกาศ *
                      </label>
                      <span
                        id="announcementFolderVerifyBadge"
                        className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold ${badgeStyleClass(annFolderBadgeInfo.type)}`}
                      >
                        {annFolderBadgeInfo.text}
                      </span>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        ref={annFolderInputRef}
                        id="setAnnouncementDriveFolderId"
                        type="text"
                        value={draft.announcement_drive_folder_id || ''}
                        onChange={(e) => {
                          updateField('announcement_drive_folder_id', e.target.value);
                          setAnnFolderVerifyState({ verifiedFolderName: null, verifyFailed: false });
                        }}
                        placeholder="วาง Folder ID หรือลิงก์โฟลเดอร์ Google Drive (ห้ามเว้นว่าง)"
                        className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-mono flex-1"
                      />
                      <button
                        type="button"
                        id="btnVerifyAnnouncementFolder"
                        onClick={handleVerifyAnnouncementFolder}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white transition shrink-0 cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <i className="fa-solid fa-folder-check" />
                        <span>ตรวจสอบโฟลเดอร์</span>
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      ใช้ลิงก์ Apps Script Web App ด้านบนร่วมกับโฟลเดอร์ประกาศนี้ (ระบบบังคับตรวจสอบโฟลเดอร์เฉพาะ ไม่ตกหล่นไปโฟลเดอร์ลงเวลา และบันทึกได้ผ่านปุ่มบันทึกหลักในแท็บ 1)
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Card (6/12): สวิตช์เปิด/ปิดฟังก์ชัน และรูปแบบการบันทึกเวลา */}
            <div className="lg:col-span-6 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200/80 dark:border-slate-700/60 p-6 space-y-5">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-200 dark:border-slate-700">
                <span className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-[#00744B] flex items-center justify-center text-sm shadow-xs">
                  <i className="fa-solid fa-sliders" />
                </span>
                <h2 className="text-base font-extrabold text-slate-800 dark:text-white">
                  การควบคุมฟังก์ชันลงเวลา
                </h2>
              </div>

              {/* 7 Full-Width Pill Switch Cards */}
              <div className="space-y-3">
                {/* 1. บังคับถ่ายภาพยืนยันตัวตน */}
                <label className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-700/60 cursor-pointer select-none">
                  <div className="pr-3">
                    <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-white block">
                      บังคับถ่ายภาพยืนยันตัวตน
                    </span>
                    <span className="text-xs text-slate-500 block mt-0.5">
                      ผู้ใช้ต้องเปิดกล้องและถ่ายภาพทุกครั้งที่ลงเวลา
                    </span>
                  </div>
                  <div className="relative inline-flex items-center shrink-0">
                    <input
                      id="toggleRequirePhoto"
                      type="checkbox"
                      checked={Boolean(draft.require_photo)}
                      onChange={(e) => updateField('require_photo', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00744B]" />
                  </div>
                </label>

                {/* 2. อนุญาตเลือกภาพถ่ายจากเครื่องเมื่อเปิดใน LINE หรือไม่มีกล้อง */}
                <label className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-700/60 cursor-pointer select-none">
                  <div className="pr-3">
                    <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-white block">
                      อนุญาตเลือกภาพถ่ายจากเครื่องเมื่อเปิดใน LINE หรือไม่มีกล้อง
                    </span>
                    <span className="text-xs text-slate-500 block mt-0.5">
                      เมื่อเปิดใน LINE In-App Browser หรือไม่มีเว็บแคม ปุ่มถ่ายภาพจะเปิดคลังภาพ/กล้องของเครื่องให้อัตโนมัติ
                    </span>
                  </div>
                  <div className="relative inline-flex items-center shrink-0">
                    <input
                      id="toggleAllowGalleryFallback"
                      type="checkbox"
                      checked={Boolean(draft.allow_gallery_fallback !== false)}
                      onChange={(e) => updateField('allow_gallery_fallback', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00744B]" />
                  </div>
                </label>

                {/* 3. บังคับพิกัด GPS */}
                <label className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-700/60 cursor-pointer select-none">
                  <div className="pr-3">
                    <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-white block">
                      บังคับพิกัด GPS
                    </span>
                    <span className="text-xs text-slate-500 block mt-0.5">
                      ต้องอนุญาตตำแหน่งพิกัด GPS จึงจะลงเวลาได้
                    </span>
                  </div>
                  <div className="relative inline-flex items-center shrink-0">
                    <input
                      id="toggleRequireGps"
                      type="checkbox"
                      checked={Boolean(draft.require_gps)}
                      onChange={(e) => updateField('require_gps', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00744B]" />
                  </div>
                </label>

                {/* 4. บังคับตรวจสอบรัศมีสถานที่ทำงาน (Geofence) */}
                <label className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-700/60 cursor-pointer select-none">
                  <div className="pr-3">
                    <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-white block">
                      บังคับตรวจสอบรัศมีสถานที่ทำงาน (Geofence)
                    </span>
                    <span className="text-xs text-slate-500 block mt-0.5">
                      หากปิด ระบบจะอนุญาตให้ลงเวลาได้โดยไม่จำกัดรัศมี โดยยังคงบันทึกพิกัด GPS จริงตามปกติ
                    </span>
                  </div>
                  <div className="relative inline-flex items-center shrink-0">
                    <input
                      id="toggleEnforceGeofenceRadius"
                      type="checkbox"
                      checked={Boolean(draft.enforce_geofence_radius !== false)}
                      onChange={(e) => updateField('enforce_geofence_radius', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00744B]" />
                  </div>
                </label>

                {/* 5. สุ่มระยะ GPS ขาออกงาน + Embedded Radius Input */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-700/60">
                  <label className="flex items-center justify-between cursor-pointer select-none">
                    <div className="pr-3">
                      <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-white block">
                        สุ่มระยะ GPS ขาออกงาน (สำหรับการลงเวลารูปแบบพิเศษ)
                      </span>
                      <span className="text-xs text-slate-500 block mt-0.5">
                        สุ่มพิกัด GPS ขาออกในรัศมีที่กำหนด พร้อมค้นหาสถานที่ใกล้เคียง เพื่อให้พิกัดเข้า-ออกงานไม่ซ้ำกัน
                      </span>
                    </div>
                    <div className="relative inline-flex items-center shrink-0">
                      <input
                        id="toggleRandomizeGpsCheckout"
                        type="checkbox"
                        checked={Boolean(draft.randomize_gps_checkout)}
                        onChange={(e) => updateField('randomize_gps_checkout', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00744B]" />
                    </div>
                  </label>
                  <div
                    id="containerRandomizeGpsRadius"
                    className={`mt-2.5 pt-2.5 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between transition ${
                      !draft.randomize_gps_checkout ? 'opacity-40 pointer-events-none' : ''
                    }`}
                  >
                    <div className="pr-3">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                        รัศมีระยะสุ่มพิกัด (เมตร)
                      </span>
                      <span className="text-[11px] text-slate-500 block">
                        กำหนดรัศมีสุ่มพิกัด GPS ขาออก (ค่าเริ่มต้น 20 เมตร, กำหนดได้ 5 - 100 เมตร)
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        id="setRandomizeGpsRadius"
                        type="number"
                        min={5}
                        max={100}
                        step={1}
                        disabled={!draft.randomize_gps_checkout}
                        value={draft.randomize_gps_radius_meters ?? 20}
                        onChange={(e) => updateField('randomize_gps_radius_meters', Number(e.target.value))}
                        className="w-20 text-center font-mono font-bold text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 py-1 px-2"
                      />
                      <span className="text-xs text-slate-500 font-bold">เมตร</span>
                    </div>
                  </div>
                </div>

                {/* 6. กรองช่วงเวลากะตามเวลาจริง + Embedded Early Shift Window Input */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-700/60">
                  <label className="flex items-center justify-between cursor-pointer select-none">
                    <div className="pr-3">
                      <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-white block">
                        กรองช่วงเวลากะตามเวลาจริง (Real-time Filter)
                      </span>
                      <span className="text-xs text-slate-500 block mt-0.5">
                        แสดงเฉพาะผลัดหรือช่วงเวลาที่ตรงกับเวลาปัจจุบัน
                      </span>
                    </div>
                    <div className="relative inline-flex items-center shrink-0">
                      <input
                        id="toggleFilterShiftsByRealtime"
                        type="checkbox"
                        checked={Boolean(draft.filter_shifts_by_realtime !== false)}
                        onChange={(e) => updateField('filter_shifts_by_realtime', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00744B]" />
                    </div>
                  </label>
                  <div
                    id="containerEarlyShiftWindow"
                    className={`mt-2.5 pt-2.5 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between transition ${
                      !draft.filter_shifts_by_realtime ? 'opacity-40 pointer-events-none' : ''
                    }`}
                  >
                    <div className="pr-3">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                        เวลาเริ่มทำงานก่อนเวลาของช่วงเวลา (นาที)
                      </span>
                      <span className="text-[11px] text-slate-500 block">
                        กำหนดให้เริ่มเลือกช่วงเวลาปฏิบัติงานก่อนเวลาเริ่มงานจริง สำหรับช่วงเวลาที่เลือกเงื่อนไข "ทำงานก่อนเวลาเริ่มงานได้" (ค่าเริ่มต้น 30 นาที)
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        id="setEarlyShiftWindowMinutes"
                        type="number"
                        min={0}
                        max={360}
                        step={1}
                        disabled={!draft.filter_shifts_by_realtime}
                        value={draft.early_shift_window_minutes ?? 30}
                        onChange={(e) => updateField('early_shift_window_minutes', Number(e.target.value))}
                        className="w-20 text-center font-mono font-bold text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 py-1 px-2"
                      />
                      <span className="text-xs text-slate-500 font-bold">นาที</span>
                    </div>
                  </div>
                </div>

                {/* 7. ปิดการลงเวลาในช่วงเวลาปกติ (08:30 - 16:30 น.) */}
                <label className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-700/60 cursor-pointer select-none">
                  <div className="pr-3">
                    <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-white block">
                      ปิดการลงเวลาในช่วงเวลาปกติ (08:30 - 16:30 น.)
                    </span>
                    <span className="text-xs text-slate-500 block mt-0.5">
                      ไม่อนุญาตให้กดบันทึกเวลาหน้าหลักในช่วงเวลาราชการปกติ ทั้งรูปแบบปกติและรูปแบบพิเศษ
                    </span>
                  </div>
                  <div className="relative inline-flex items-center shrink-0">
                    <input
                      id="toggleDisableNormalHoursCheckin"
                      type="checkbox"
                      checked={Boolean(draft.disable_normal_hours_checkin)}
                      onChange={(e) => updateField('disable_normal_hours_checkin', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00744B]" />
                  </div>
                </label>
              </div>

              {/* รูปแบบการบันทึกเวลาทำงาน (ปกติ vs ครั้งเดียว) */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-700/60 space-y-3">
                <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300 block">
                  รูปแบบการบันทึกเวลาทำงาน
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label
                    id="cardModeNormal"
                    className={`flex items-start gap-3 p-3.5 rounded-xl border-2 bg-white dark:bg-slate-800 cursor-pointer transition ${
                      !draft.single_click_checkin
                        ? 'border-[#00744B]'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="checkinRecordingMode"
                      value="normal"
                      checked={!draft.single_click_checkin}
                      onChange={() => updateField('single_click_checkin', false)}
                      className="accent-[#00744B] mt-1 shrink-0"
                    />
                    <div className="text-xs">
                      <span className="font-extrabold text-slate-800 dark:text-white block">
                        1. รูปแบบปกติ
                      </span>
                      <span className="text-slate-500 block mt-0.5 leading-relaxed">
                        ลงเวลาเข้างาน และลงเวลาออกงานตามเวลาจริง
                      </span>
                    </div>
                  </label>

                  <label
                    id="cardModeSingleClick"
                    className={`flex items-start gap-3 p-3.5 rounded-xl border-2 bg-white dark:bg-slate-800 cursor-pointer transition ${
                      draft.single_click_checkin
                        ? 'border-[#00744B]'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="checkinRecordingMode"
                      value="single_click"
                      checked={Boolean(draft.single_click_checkin)}
                      onChange={() => updateField('single_click_checkin', true)}
                      className="accent-[#00744B] mt-1 shrink-0"
                    />
                    <div className="text-xs">
                      <span className="font-extrabold text-[#00744B] dark:text-emerald-400 block">
                        2. รูปแบบพิเศษ (ครั้งเดียว)
                      </span>
                      <span className="text-slate-500 block mt-0.5 leading-relaxed">
                        กดครั้งเดียว บันทึกทั้งเข้าและออกตามเกณฑ์
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              <button
                type="button"
                id="btnSaveMainSettings"
                disabled={saving}
                onClick={() => persistNonAnnouncementSettings(draft, true)}
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-5 rounded-2xl text-sm font-bold bg-[#00744B] hover:bg-[#005B3A] text-white shadow-lg shadow-emerald-900/30 transition cursor-pointer disabled:opacity-50"
              >
                <i className="fa-solid fa-floppy-disk" />
                <span>บันทึกการตั้งค่าหลักทั้งหมด</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: 2. เกณฑ์เวลา & สีรายงาน (settings.html:415-539) */}
      {activeTab === 2 && (
        <div id="tab-panel-rules" className="settings-tab-pane space-y-6">
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200/80 dark:border-slate-700/60 mt-8 mb-6">
            <div className="-mt-6 mx-4 sm:mx-6 rounded-2xl p-5 bg-gradient-to-r from-[#00744B] via-[#008F5D] to-[#00A368] text-white shadow-lg shadow-emerald-900/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white text-lg shadow-inner">
                  <i className="fa-solid fa-palette" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-extrabold tracking-wide text-white">
                    เกณฑ์เวลามาตรฐาน (24 ชม.) และสีประจำสถานะ
                  </h2>
                  <p className="text-xs text-emerald-100/90 font-medium mt-0.5">
                    กำหนดเวลาเริ่มเข้างาน, เวลาเข้า-ออกงานมาตรฐาน, นาทีอนุโลมสาย, นาทีบันทึกออกงาน และ 8 สีสถานะระบบ BMA
                  </p>
                </div>
              </div>
              <button
                type="button"
                id="btnSaveStatusAndColors"
                disabled={saving}
                onClick={async () => {
                  const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
                  const startT = String(draft.allow_checkin_start_time || '').trim();
                  const inT = String(draft.standard_check_in || '').trim();
                  const outT = String(draft.standard_check_out || '').trim();
                  if (!timeRegex.test(startT) || !timeRegex.test(inT) || !timeRegex.test(outT)) {
                    await UIHelpers.alert(
                      'รูปแบบเวลาไม่ถูกต้อง',
                      'กรุณาระบุเวลาทั้ง 3 ช่อง (เวลาเริ่มเปิดลงเวลา, เวลาเข้างานมาตรฐาน, เวลาเลิกงานมาตรฐาน) เป็นรูปแบบ 24 ชั่วโมง HH:mm เช่น 06:00, 08:30, 16:30',
                      'warning'
                    );
                    return;
                  }
                  await persistNonAnnouncementSettings(
                    {
                      ...draft,
                      allow_checkin_start_time: startT,
                      standard_check_in: inT,
                      standard_check_out: outT,
                    },
                    true
                  );
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-white text-[#00744B] hover:bg-emerald-50 transition shadow-md cursor-pointer self-start sm:self-auto"
              >
                <i className="fa-solid fa-floppy-disk" />
                <span>บันทึกเกณฑ์เวลาและสี</span>
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-6">
              {/* 5 Time Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-700/60">
                <div>
                  <label htmlFor="setAllowCheckinStartTime" className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                    <i className="fa-solid fa-sun mr-1 text-amber-500" />
                    เวลาเริ่มเปิดให้ลงเวลาเข้างาน (24 ชม.) *
                  </label>
                  <input
                    id="setAllowCheckinStartTime"
                    type="text"
                    value={draft.allow_checkin_start_time || '06:00'}
                    onChange={(e) => updateField('allow_checkin_start_time', e.target.value)}
                    placeholder="06:00"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono font-bold text-center text-sm"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    อนุญาตให้เริ่มกดลงเวลาเข้างานได้ตั้งแต่เวลานี้ (เช่น 05:00)
                  </p>
                </div>

                <div>
                  <label htmlFor="setStdCheckIn" className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                    <i className="fa-regular fa-clock mr-1 text-emerald-600" />
                    เวลาเข้างานมาตรฐาน *
                  </label>
                  <input
                    id="setStdCheckIn"
                    type="text"
                    value={draft.standard_check_in || '08:30'}
                    onChange={(e) => updateField('standard_check_in', e.target.value)}
                    placeholder="08:30"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono font-bold text-center text-sm"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    เวลามาตรฐานเริ่มปฏิบัติราชการ (เช่น 08:30)
                  </p>
                </div>

                <div>
                  <label htmlFor="setLateThresholdMin" className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                    <i className="fa-solid fa-hourglass-half mr-1 text-amber-600" />
                    อนุโลมสาย (นาที) *
                  </label>
                  <input
                    id="setLateThresholdMin"
                    type="number"
                    min={0}
                    max={240}
                    value={draft.late_threshold_minutes ?? 30}
                    onChange={(e) => updateField('late_threshold_minutes', Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono font-bold text-center text-sm"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    นาทีที่อนุโลมให้หลังเวลาเข้างาน (เช่น 15 = สายตั้งแต่ 08:46)
                  </p>
                </div>

                <div>
                  <label htmlFor="setStdCheckOut" className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                    <i className="fa-solid fa-right-from-bracket mr-1 text-sky-600" />
                    เวลาเลิกงานมาตรฐาน *
                  </label>
                  <input
                    id="setStdCheckOut"
                    type="text"
                    value={draft.standard_check_out || '16:30'}
                    onChange={(e) => updateField('standard_check_out', e.target.value)}
                    placeholder="16:30"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono font-bold text-center text-sm"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    เวลามาตรฐานเลิกปฏิบัติราชการ (เช่น 16:30)
                  </p>
                </div>

                <div>
                  <label htmlFor="setCheckoutGraceMin" className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                    <i className="fa-solid fa-business-time mr-1 text-purple-600" />
                    หลังเลิกงาน (นาที) *
                  </label>
                  <input
                    id="setCheckoutGraceMin"
                    type="number"
                    min={0}
                    max={480}
                    value={draft.checkout_grace_minutes ?? 30}
                    onChange={(e) => updateField('checkout_grace_minutes', Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono font-bold text-center text-sm"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    ช่วงเวลาอนุญาตให้กดออกงานปกติ (เช่น 30 = 16:30 ถึง 17:00)
                  </p>
                </div>
              </div>

              {/* 6 Palette Color Controls */}
              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                  การกำหนดสีประจำสถานะและหัวตาราง (BMA 9-Color System)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {COLOR_CARDS.map((c) => {
                    const colorVal = draft.category_colors?.[c.key] || c.defaultColor;
                    return (
                      <div
                        key={c.key}
                        className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-700/60 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            {c.label}
                          </span>
                          <input
                            type="color"
                            value={colorVal}
                            onChange={(e) =>
                              updateField('category_colors', {
                                ...(draft.category_colors || {}),
                                [c.key]: e.target.value,
                              })
                            }
                            className="w-8 h-8 rounded-lg cursor-pointer border-0"
                          />
                        </div>
                        <span
                          className="bma-badge flex items-center justify-center text-white font-bold rounded-full w-full py-1 text-xs shadow-xs"
                          style={{ backgroundColor: colorVal }}
                        >
                          {c.previewText}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: 3. ช่วงเวลาปฏิบัติราชการ (settings.html:542-579) */}
      {activeTab === 3 && (
        <div id="tab-panel-shifts" className="settings-tab-pane space-y-6">
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200/80 dark:border-slate-700/60 mt-8 mb-6">
            <div className="-mt-6 mx-4 sm:mx-6 rounded-2xl p-5 bg-gradient-to-r from-[#00744B] via-[#008F5D] to-[#00A368] text-white shadow-lg shadow-emerald-900/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white text-lg shadow-inner">
                  <i className="fa-solid fa-clock" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold tracking-wide text-white">
                    จัดการช่วงเวลาปฏิบัติราชการ
                  </h3>
                  <p className="text-xs text-emerald-100/90 font-medium mt-0.5">
                    กำหนดช่วงเวลากะ/ผลัดปกติ หรือนอกเวลา (Tag สีม่วง) และตั้งเวลาข้ามวันได้
                  </p>
                </div>
              </div>
              <button
                type="button"
                id="btnAddShift"
                onClick={() => openShiftModal(null)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-white text-[#00744B] hover:bg-emerald-50 transition shadow-md cursor-pointer self-start sm:self-auto"
              >
                <i className="fa-solid fa-plus" />
                <span>เพิ่มช่วงเวลาปฏิบัติงาน</span>
              </button>
            </div>

            <div className="p-4 sm:p-6">
              <div className="bma-table-container rounded-xl overflow-x-auto border border-slate-200/80 dark:border-slate-700/60">
                <table className="bma-table text-sm w-full text-left">
                  <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 text-xs uppercase font-extrabold tracking-wider border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="w-14 text-center py-3.5 px-3">ลำดับ</th>
                      <th className="w-28 text-center py-3.5 px-3">เรียงลำดับ</th>
                      <th className="py-3.5 px-3">ชื่อช่วงเวลาทำงาน (รูปแบบใน Dropdown)</th>
                      <th className="text-center py-3.5 px-3">เวลาเริ่มงาน (24 ชม.)</th>
                      <th className="text-center py-3.5 px-3">เวลาเลิกงาน (24 ชม.)</th>
                      <th className="text-center py-3.5 px-3">ประเภท / เงื่อนไข</th>
                      <th className="w-32 text-center py-3.5 px-3">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody id="shiftsTableBody" className="divide-y divide-slate-200 dark:divide-slate-700/60">
                    {(draft.work_shifts || []).map((shift, idx) => {
                      const checkIn24 = UIHelpers.formatTime24(shift.check_in);
                      const checkOut24 = UIHelpers.formatTime24(shift.check_out);
                      const isOvernight = Boolean(
                        shift.is_overnight ||
                          UIHelpers.timeToMinutes(checkOut24) < UIHelpers.timeToMinutes(checkIn24)
                      );
                      const formattedDisplay = SettingsModel.formatShiftDisplayText(shift);

                      return (
                        <tr key={idx}>
                          <td className="text-center font-semibold py-3 px-3">{idx + 1}</td>
                          <td className="text-center py-3 px-3">
                            {renderSortButtons('work_shifts', idx, (draft.work_shifts || []).length)}
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-800 dark:text-white">{formattedDisplay}</div>
                          </td>
                          <td className="text-center font-mono font-bold py-3 px-3">
                            {shift.is_custom ? 'ระบุเอง' : `${checkIn24} น.`}
                          </td>
                          <td className="text-center font-mono font-bold py-3 px-3">
                            {shift.is_custom ? 'ระบุเอง' : `${checkOut24} น.${isOvernight ? ' (ข้ามวัน)' : ''}`}
                          </td>
                          <td className="text-center py-3 px-3">
                            {shift.is_custom ? (
                              <span className="bma-badge px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                อื่นๆ
                              </span>
                            ) : shift.is_overtime ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300">
                                <i className="fa-solid fa-business-time" />
                                <span>ปฏิบัติงานนอกเวลา</span>
                              </span>
                            ) : (
                              <span className="bma-badge px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                ปฏิบัติงานปกติ
                              </span>
                            )}
                            {shift.allow_early_checkin && (
                              <span className="inline-flex items-center justify-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 mt-1 block">
                                <i className="fa-solid fa-clock-rotate-left" /> เข้าก่อนเวลาได้
                              </span>
                            )}
                          </td>
                          <td className="text-center space-x-1 whitespace-nowrap py-3 px-3">
                            <button
                              type="button"
                              onClick={() => openShiftModal(idx)}
                              className="py-1 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-sky-500 hover:bg-sky-50 dark:hover:bg-slate-700 cursor-pointer"
                              title="แก้ไข"
                            >
                              <i className="fa-solid fa-pen" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteShift(idx)}
                              className="py-1 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-rose-500 hover:bg-rose-50 dark:hover:bg-slate-700 cursor-pointer"
                              title="ลบ"
                            >
                              <i className="fa-solid fa-trash" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: 4. คำนำหน้า, ลักษณะงาน & หมายเหตุ (settings.html:582-635) */}
      {activeTab === 4 && (
        <div id="tab-panel-prefixes" className="settings-tab-pane space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8 mb-6">
            {/* 1. คำนำหน้าชื่อ */}
            <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200/80 dark:border-slate-700/60">
              <div className="-mt-6 mx-4 rounded-2xl p-4 bg-gradient-to-r from-[#00744B] to-[#00995D] text-white shadow-lg shadow-emerald-900/30 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <i className="fa-solid fa-user-tag text-lg" />
                  <h3 className="font-extrabold text-sm sm:text-base text-white">1. คำนำหน้าชื่อ</h3>
                </div>
                <button
                  type="button"
                  id="btnAddPrefix"
                  onClick={() =>
                    openListAddModal(
                      'prefixes',
                      'เพิ่มคำนำหน้าชื่อ',
                      'คำนำหน้าชื่อ',
                      'เช่น นาย, นาง, นางสาว, ว่าที่ร้อยตรี'
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white text-[#00744B] hover:bg-emerald-50 transition shadow-sm cursor-pointer"
                >
                  <i className="fa-solid fa-plus" /> เพิ่มคำนำหน้า
                </button>
              </div>
              <div className="p-5">
                <p className="text-xs text-slate-500 mb-3">
                  กดปุ่มลูกศร ขึ้น/ลง เพื่อจัดลำดับการแสดงผลใน Dropdown
                </p>
                <div id="prefixListContainer" className="space-y-2">
                  {(draft.prefixes || []).map((prefix, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm"
                    >
                      <div className="flex items-center gap-2.5">
                        {renderSortButtons('prefixes', idx, (draft.prefixes || []).length)}
                        <span className="font-bold text-slate-800 dark:text-white">
                          {idx + 1}. {prefix}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            openListEditModal('prefixes', idx, 'แก้ไขคำนำหน้าชื่อ', 'คำนำหน้าชื่อ')
                          }
                          className="py-1 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-sky-500 hover:bg-sky-50 cursor-pointer"
                          title="แก้ไข"
                        >
                          <i className="fa-solid fa-pen" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleDeleteListItem('prefixes', idx, 'ยืนยันการลบคำนำหน้า')
                          }
                          className="py-1 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-rose-500 hover:bg-rose-50 cursor-pointer"
                          title="ลบ"
                        >
                          <i className="fa-solid fa-trash" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 2. ลักษณะงานนอกสถานที่ */}
            <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200/80 dark:border-slate-700/60">
              <div className="-mt-6 mx-4 rounded-2xl p-4 bg-gradient-to-r from-[#0284C7] to-[#0EA5E9] text-white shadow-lg shadow-sky-900/30 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <i className="fa-solid fa-briefcase text-lg" />
                  <h3 className="font-extrabold text-sm sm:text-base text-white">
                    2. ลักษณะงานนอกสถานที่
                  </h3>
                </div>
                <button
                  type="button"
                  id="btnAddOffsiteJobType"
                  onClick={() =>
                    openListAddModal(
                      'offsite_job_types',
                      'เพิ่มลักษณะงานนอกสถานที่',
                      'ลักษณะงานนอกสถานที่',
                      'เช่น ปฏิบัติงานนอกสถานที่, อบรม/สัมมนา'
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white text-[#0284C7] hover:bg-sky-50 transition shadow-sm cursor-pointer"
                >
                  <i className="fa-solid fa-plus" /> เพิ่มลักษณะงาน
                </button>
              </div>
              <div className="p-5">
                <p className="text-xs text-slate-500 mb-3">
                  สำหรับตัวเลือกลงเวลานอกสถานที่ (ปกติ และกรณีพิเศษ)
                </p>
                <div id="offsiteJobTypeListContainer" className="space-y-2">
                  {(draft.offsite_job_types || []).map((jobType, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm"
                    >
                      <div className="flex items-center gap-2.5">
                        {renderSortButtons(
                          'offsite_job_types',
                          idx,
                          (draft.offsite_job_types || []).length
                        )}
                        <span className="font-semibold text-slate-800 dark:text-white">
                          {idx + 1}. {jobType}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            openListEditModal(
                              'offsite_job_types',
                              idx,
                              'แก้ไขลักษณะงานนอกสถานที่',
                              'ลักษณะงานนอกสถานที่'
                            )
                          }
                          className="py-1 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-sky-500 hover:bg-sky-50 cursor-pointer"
                          title="แก้ไข"
                        >
                          <i className="fa-solid fa-pen" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleDeleteListItem(
                              'offsite_job_types',
                              idx,
                              'ยืนยันการลบลักษณะงานนอกสถานที่'
                            )
                          }
                          className="py-1 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-rose-500 hover:bg-rose-50 cursor-pointer"
                          title="ลบ"
                        >
                          <i className="fa-solid fa-trash" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 3. เหตุผลลงเวลากรณีพิเศษ */}
            <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200/80 dark:border-slate-700/60">
              <div className="-mt-6 mx-4 rounded-2xl p-4 bg-gradient-to-r from-[#D97706] to-[#F59E0B] text-white shadow-lg shadow-amber-900/30 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <i className="fa-solid fa-file-circle-exclamation text-lg" />
                  <h3 className="font-extrabold text-sm sm:text-base text-white">
                    3. เหตุผลลงเวลากรณีพิเศษ
                  </h3>
                </div>
                <button
                  type="button"
                  id="btnAddSpecialReason"
                  onClick={() =>
                    openListAddModal(
                      'special_request_reasons',
                      'เพิ่มเหตุผลลงเวลากรณีพิเศษ',
                      'เหตุผลลงเวลากรณีพิเศษ',
                      'เช่น ลืมลงเวลาปฏิบัติราชการ, โทรศัพท์ขัดข้อง'
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white text-[#D97706] hover:bg-amber-50 transition shadow-sm cursor-pointer"
                >
                  <i className="fa-solid fa-plus" /> เพิ่มเหตุผล
                </button>
              </div>
              <div className="p-5">
                <p className="text-xs text-slate-500 mb-3">
                  สำหรับตัวเลือกเหตุผลในการยื่นคำขอลงเวลากรณีพิเศษ
                </p>
                <div id="specialReasonListContainer" className="space-y-2">
                  {(draft.special_request_reasons || []).map((reason, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm"
                    >
                      <div className="flex items-center gap-2.5">
                        {renderSortButtons(
                          'special_request_reasons',
                          idx,
                          (draft.special_request_reasons || []).length
                        )}
                        <span className="font-semibold text-slate-800 dark:text-white">
                          {idx + 1}. {reason}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            openListEditModal(
                              'special_request_reasons',
                              idx,
                              'แก้ไขเหตุผลลงเวลากรณีพิเศษ',
                              'เหตุผลลงเวลากรณีพิเศษ'
                            )
                          }
                          className="py-1 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-amber-500 hover:bg-amber-50 cursor-pointer"
                          title="แก้ไข"
                        >
                          <i className="fa-solid fa-pen" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleDeleteListItem(
                              'special_request_reasons',
                              idx,
                              'ยืนยันการลบเหตุผลกรณีพิเศษ'
                            )
                          }
                          className="py-1 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-rose-500 hover:bg-rose-50 cursor-pointer"
                          title="ลบ"
                        >
                          <i className="fa-solid fa-trash" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: 5. ตำแหน่ง & สังกัด (settings.html:637-728) */}
      {activeTab === 5 && (
        <div id="tab-panel-positions" className="settings-tab-pane space-y-8">
          {/* Card 1: ตำแหน่ง */}
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200/80 dark:border-slate-700/60 mt-8">
            <div className="-mt-6 mx-4 sm:mx-6 rounded-2xl p-5 bg-gradient-to-r from-[#480080] via-[#5B1099] to-[#7C3AED] text-white shadow-lg shadow-purple-900/30 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white text-lg shadow-inner">
                  <i className="fa-solid fa-briefcase" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold tracking-wide text-white">
                    จัดการข้อมูลตำแหน่ง (ประเภท &gt; ตำแหน่ง &gt; ระดับ)
                  </h3>
                  <p className="text-xs text-purple-200/90 font-medium mt-0.5">
                    เพิ่มข้อมูลแบบแยกส่วนตามลำดับชั้น และกดปุ่มลูกศร ขึ้น/ลง เพื่อจัดลำดับ
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  id="btnAddPosStep1Type"
                  onClick={openPosStep1Modal}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/15 hover:bg-white/25 text-white backdrop-blur-md border border-white/20 transition cursor-pointer"
                >
                  <i className="fa-solid fa-layer-group" /> 1. + เพิ่มประเภทตำแหน่ง
                </button>
                <button
                  type="button"
                  id="btnAddPosStep2Title"
                  onClick={openPosStep2Modal}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/15 hover:bg-white/25 text-white backdrop-blur-md border border-white/20 transition cursor-pointer"
                >
                  <i className="fa-solid fa-user-tie" /> 2. + เพิ่มตำแหน่ง
                </button>
                <button
                  type="button"
                  id="btnAddPosStep3Level"
                  onClick={openPosStep3Modal}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white text-[#480080] hover:bg-purple-50 transition shadow-md cursor-pointer"
                >
                  <i className="fa-solid fa-ranking-star" /> 3. + เพิ่มระดับ
                </button>
              </div>
            </div>
            <div className="p-4 sm:p-6">
              <div className="bma-table-container rounded-xl overflow-x-auto border border-slate-200/80 dark:border-slate-700/60">
                <table className="bma-table text-sm w-full text-left">
                  <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 text-xs uppercase font-extrabold tracking-wider border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="w-14 text-center py-3.5 px-3">ลำดับ</th>
                      <th className="w-28 text-center py-3.5 px-3">เรียงลำดับ</th>
                      <th className="py-3.5 px-3">1. ประเภทตำแหน่ง (แม่)</th>
                      <th className="py-3.5 px-3">2. ชื่อตำแหน่งในสายงาน (ลูก)</th>
                      <th className="py-3.5 px-3">3. ระดับตำแหน่ง (ลูกย่อย)</th>
                      <th className="w-32 text-center py-3.5 px-3">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody id="positionsTableBody" className="divide-y divide-slate-200 dark:divide-slate-700/60">
                    {(draft.positions || []).map((pos, idx) => (
                      <tr key={idx}>
                        <td className="text-center font-semibold py-3 px-3">{idx + 1}</td>
                        <td className="text-center py-3 px-3">
                          {renderSortButtons('positions', idx, (draft.positions || []).length)}
                        </td>
                        <td className="py-3 px-3">
                          <span className="bma-badge px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300">
                            {pos.type || '-'}
                          </span>
                        </td>
                        <td className="font-bold text-slate-800 dark:text-white py-3 px-3">
                          {pos.title || (
                            <span className="text-slate-400 text-xs italic font-normal">
                              (ยังไม่ได้เพิ่มตำแหน่งลูก)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {pos.level ? (
                            <span className="bma-badge px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                              {pos.level}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs italic">(ยังไม่ได้เพิ่มระดับลูก)</span>
                          )}
                        </td>
                        <td className="text-center space-x-1 whitespace-nowrap py-3 px-3">
                          <button
                            type="button"
                            onClick={() => openPosEditModal(idx)}
                            className="py-1 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-sky-500 hover:bg-sky-50 cursor-pointer"
                            title="แก้ไข"
                          >
                            <i className="fa-solid fa-pen" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePosition(idx)}
                            className="py-1 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-rose-500 hover:bg-rose-50 cursor-pointer"
                            title="ลบ"
                          >
                            <i className="fa-solid fa-trash" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Card 2: สังกัด */}
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200/80 dark:border-slate-700/60 mt-8 mb-6">
            <div className="-mt-6 mx-4 sm:mx-6 rounded-2xl p-5 bg-gradient-to-r from-[#00744B] via-[#008F5D] to-[#00A368] text-white shadow-lg shadow-emerald-900/30 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white text-lg shadow-inner">
                  <i className="fa-solid fa-sitemap" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold tracking-wide text-white">
                    จัดการโครงสร้างสังกัด (หน่วยงาน &gt; สำนักงาน/กอง &gt; ส่วน/ฝ่าย &gt; กลุ่มงาน)
                  </h3>
                  <p className="text-xs text-emerald-100/90 font-medium mt-0.5">
                    เลือกค่าหลักแม่จาก Dropdown เพื่อเพิ่มค่าลูกได้หลายแถวพร้อมกัน
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  id="btnAddAffStep1Org"
                  onClick={openAffStep1Modal}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/15 hover:bg-white/25 text-white backdrop-blur-md border border-white/20 transition cursor-pointer"
                >
                  <i className="fa-solid fa-landmark" /> 1. + เพิ่มหน่วยงาน
                </button>
                <button
                  type="button"
                  id="btnAddAffStep2Bureau"
                  onClick={openAffStep2Modal}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/15 hover:bg-white/25 text-white backdrop-blur-md border border-white/20 transition cursor-pointer"
                >
                  <i className="fa-solid fa-building" /> 2. + เพิ่มสำนักงาน/กอง
                </button>
                <button
                  type="button"
                  id="btnAddAffStep3Division"
                  onClick={openAffStep3Modal}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/15 hover:bg-white/25 text-white backdrop-blur-md border border-white/20 transition cursor-pointer"
                >
                  <i className="fa-solid fa-network-wired" /> 3. + เพิ่มส่วน/ฝ่าย
                </button>
                <button
                  type="button"
                  id="btnAddAffStep4Group"
                  onClick={openAffStep4Modal}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white text-[#00744B] hover:bg-emerald-50 transition shadow-md cursor-pointer"
                >
                  <i className="fa-solid fa-people-group" /> 4. + เพิ่มกลุ่มงาน
                </button>
              </div>
            </div>
            <div className="p-4 sm:p-6">
              <div className="bma-table-container rounded-xl overflow-x-auto border border-slate-200/80 dark:border-slate-700/60">
                <table className="bma-table text-sm w-full text-left">
                  <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 text-xs uppercase font-extrabold tracking-wider border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="w-14 text-center py-3.5 px-3">ลำดับ</th>
                      <th className="w-28 text-center py-3.5 px-3">เรียงลำดับ</th>
                      <th className="py-3.5 px-3">1. หน่วยงาน</th>
                      <th className="py-3.5 px-3">2. สำนักงาน/กอง</th>
                      <th className="py-3.5 px-3">3. ส่วน/ฝ่าย</th>
                      <th className="py-3.5 px-3">4. กลุ่มงาน</th>
                      <th className="w-32 text-center py-3.5 px-3">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody id="affiliationsTableBody" className="divide-y divide-slate-200 dark:divide-slate-700/60">
                    {(draft.affiliations || []).map((aff, idx) => (
                      <tr key={idx}>
                        <td className="text-center font-semibold py-3 px-3">{idx + 1}</td>
                        <td className="text-center py-3 px-3">
                          {renderSortButtons('affiliations', idx, (draft.affiliations || []).length)}
                        </td>
                        <td className="font-semibold py-3 px-3">{aff.organization || '-'}</td>
                        <td className="font-bold text-[#00744B] dark:text-emerald-400 py-3 px-3">
                          {aff.bureau || (
                            <span className="text-slate-400 text-xs italic font-normal">
                              (รอกำหนดสำนักงาน/กอง)
                            </span>
                          )}
                        </td>
                        <td className="font-semibold text-slate-800 dark:text-white py-3 px-3">
                          {aff.division || (
                            <span className="text-slate-400 text-xs italic font-normal">
                              (รอกำหนดส่วน/ฝ่าย)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {aff.group || (
                            <span className="text-slate-400 text-xs italic">(รอกำหนดกลุ่มงาน)</span>
                          )}
                        </td>
                        <td className="text-center space-x-1 whitespace-nowrap py-3 px-3">
                          <button
                            type="button"
                            onClick={() => openAffEditModal(idx)}
                            className="py-1 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-sky-500 hover:bg-sky-50 cursor-pointer"
                            title="แก้ไข"
                          >
                            <i className="fa-solid fa-pen" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAffiliation(idx)}
                            className="py-1 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-rose-500 hover:bg-rose-50 cursor-pointer"
                            title="ลบ"
                          >
                            <i className="fa-solid fa-trash" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: 6. สถานที่และรัศมี (settings.html:731-766) */}
      {activeTab === 6 && (
        <div id="tab-panel-locations" className="settings-tab-pane space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200/80 dark:border-slate-700/60 overflow-hidden">
            <div className="p-6 bg-gradient-to-r from-[#00744B] to-[#005B3A] text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-lg shadow-sm">
                  <i className="fa-solid fa-map-location-dot" />
                </span>
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold tracking-wide text-white">
                    จัดการสถานที่ราชการและรัศมี (Official Locations &amp; Radius)
                  </h3>
                  <p className="text-xs text-emerald-100/90 font-medium mt-0.5">
                    กำหนดพิกัดละติจูด ลองจิจูด และรัศมีที่อนุญาตให้ลงเวลาปฏิบัติราชการ (เมตร) รองรับหลายสถานที่
                  </p>
                </div>
              </div>
              <button
                type="button"
                id="btnAddOfficialLocation"
                onClick={() => openLocationModal(null)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-white text-[#00744B] hover:bg-emerald-50 transition shadow-md cursor-pointer"
              >
                <i className="fa-solid fa-plus" /> + เพิ่มสถานที่ราชการ
              </button>
            </div>
            <div className="p-4 sm:p-6">
              <div className="bma-table-container rounded-xl overflow-x-auto border border-slate-200/80 dark:border-slate-700/60">
                <table className="bma-table text-sm w-full text-left">
                  <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 text-xs uppercase font-extrabold tracking-wider border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="w-14 text-center py-3.5 px-3">ลำดับ</th>
                      <th className="w-28 text-center py-3.5 px-3">เรียงลำดับ</th>
                      <th className="py-3.5 px-3">ชื่อสถานที่ราชการ</th>
                      <th className="py-3.5 px-3">พิกัด (ละติจูด, ลองจิจูด)</th>
                      <th className="w-36 text-center py-3.5 px-3">รัศมีอนุญาต (เมตร)</th>
                      <th className="w-28 text-center py-3.5 px-3">สถานะ</th>
                      <th className="w-32 text-center py-3.5 px-3">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody id="officialLocationsTableBody" className="divide-y divide-slate-200 dark:divide-slate-700/60">
                    {(draft.official_locations || []).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-8 text-slate-400 dark:text-slate-500">
                          <i className="fa-solid fa-map-location-dot text-2xl mb-2 block" />
                          ยังไม่มีรายการสถานที่ราชการ กรุณากดปุ่ม "+ เพิ่มสถานที่ราชการ" เพื่อเริ่มต้น
                        </td>
                      </tr>
                    ) : (
                      (draft.official_locations || []).map((loc, idx) => {
                        const lat = Number(loc.latitude || 0).toFixed(6);
                        const lng = Number(loc.longitude || 0).toFixed(6);
                        const radius = Number(loc.radius_meters || 150);
                        const isActive = loc.is_active !== false;
                        const mapLink = `https://www.google.com/maps?q=${lat},${lng}`;

                        return (
                          <tr key={loc.id || idx}>
                            <td className="text-center font-semibold py-3 px-3">{idx + 1}</td>
                            <td className="text-center py-3 px-3">
                              {renderSortButtons(
                                'official_locations',
                                idx,
                                (draft.official_locations || []).length
                              )}
                            </td>
                            <td className="py-3 px-3">
                              <div className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <i className="fa-solid fa-building text-[#00744B]" />
                                <span>{loc.name || '-'}</span>
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2 font-mono text-xs">
                                <span className="text-slate-700 dark:text-slate-300">
                                  {lat}, {lng}
                                </span>
                                <a
                                  href={mapLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sky-600 hover:text-sky-700 text-[11px] inline-flex items-center gap-1"
                                  title="ดูบน Google Maps"
                                >
                                  <i className="fa-solid fa-arrow-up-right-from-square" />
                                </a>
                              </div>
                            </td>
                            <td className="text-center py-3 px-3">
                              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/40 text-[#00744B] dark:text-emerald-300 border border-emerald-300/40">
                                {radius.toLocaleString()} ม.
                              </span>
                            </td>
                            <td className="text-center py-3 px-3">
                              {isActive ? (
                                <span className="bma-badge px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                  เปิดใช้งาน
                                </span>
                              ) : (
                                <span className="bma-badge px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400 text-[11px] font-bold">
                                  ปิดใช้งาน
                                </span>
                              )}
                            </td>
                            <td className="text-center space-x-1 whitespace-nowrap py-3 px-3">
                              <button
                                type="button"
                                onClick={() => openLocationModal(idx)}
                                className="py-1 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-sky-500 hover:bg-sky-50 cursor-pointer"
                                title="แก้ไข"
                              >
                                <i className="fa-solid fa-pen" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteLocation(idx)}
                                className="py-1 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-rose-500 hover:bg-rose-50 cursor-pointer"
                                title="ลบ"
                              >
                                <i className="fa-solid fa-trash" />
                              </button>
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
        </div>
      )}

      {/* TAB 7: 7. ประกาศระบบ (settings.html:769-969) */}
      {activeTab === 7 && (
        <div id="tab-panel-announcement" className="settings-tab-pane space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200/80 dark:border-slate-700/60 overflow-hidden">
            <div className="p-6 bg-gradient-to-r from-[#00351B] to-[#00744B] text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-lg text-[#F6DE51] shadow-sm">
                  <i className="fa-solid fa-bullhorn" />
                </span>
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold tracking-wide text-white">
                    จัดการประกาศระบบ (System Announcement)
                  </h3>
                  <p className="text-xs text-emerald-100/90 font-medium mt-0.5">
                    แสดงป๊อปอัปแจ้งข่าวสาร 1 ครั้งต่อรอบประกาศ ทั้งหน้าเข้าสู่ระบบและผู้ใช้งาน Session 7 วัน
                  </p>
                </div>
              </div>
              <span id="announcementLiveStatusBadge" className={annLiveStatus.className}>
                <i className={`fa-solid ${annLiveStatus.icon}`} />
                <span>{annLiveStatus.label}</span>
              </span>
            </div>

            <div className="p-5 sm:p-6 space-y-6">
              {/* แถว 1: สวิตช์เปิด-ปิด และช่วงวันที่ */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <div className="lg:col-span-5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between gap-4">
                  <div>
                    <label
                      htmlFor="setAnnouncementEnabled"
                      className="block text-sm font-extrabold text-slate-800 dark:text-white cursor-pointer"
                    >
                      เปิดแสดงประกาศระบบอัตโนมัติ
                    </label>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      เมื่อเปิดใช้งาน ระบบจะเด้งประกาศให้ผู้ใช้กดรับทราบ 1 ครั้งต่อรอบการบันทึก
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      id="setAnnouncementEnabled"
                      type="checkbox"
                      checked={Boolean(draft.announcement_enabled)}
                      onChange={(e) => updateField('announcement_enabled', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-12 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-6 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00744B]" />
                  </label>
                </div>

                <div className="lg:col-span-7 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
                      <i className="fa-regular fa-calendar-days mr-1 text-[#00744B]" /> ช่วงวันที่แสดงประกาศ (เวลาไทย UTC+7)
                    </span>
                    <button
                      type="button"
                      id="btnClearAnnouncementEndDate"
                      onClick={() => updateField('announcement_end_date', '')}
                      className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                    >
                      <i className="fa-solid fa-eraser mr-1" />
                      ล้างวันสิ้นสุด (แสดงต่อเนื่อง)
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="setAnnouncementStartDate"
                        className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1"
                      >
                        วันที่เริ่มต้น (เว้นว่าง = ทันที)
                      </label>
                      <input
                        id="setAnnouncementStartDate"
                        type="date"
                        value={draft.announcement_start_date || ''}
                        onChange={(e) => updateField('announcement_start_date', e.target.value)}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="setAnnouncementEndDate"
                        className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1"
                      >
                        วันที่สิ้นสุด (เว้นว่าง = ต่อเนื่อง)
                      </label>
                      <input
                        id="setAnnouncementEndDate"
                        type="date"
                        value={draft.announcement_end_date || ''}
                        onChange={(e) => updateField('announcement_end_date', e.target.value)}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* แถว 2: เลือกรูปแบบประกาศ */}
              <div className="space-y-2.5">
                <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300">
                  รูปแบบการแสดงประกาศระบบ
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="cursor-pointer">
                    <input
                      id="radioAnnouncementModeText"
                      type="radio"
                      name="announcementMode"
                      value="text"
                      checked={draft.announcement_mode !== 'image'}
                      onChange={() => updateField('announcement_mode', 'text')}
                      className="sr-only peer"
                    />
                    <div className="p-3.5 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 peer-checked:border-[#00744B] peer-checked:bg-emerald-50/70 dark:peer-checked:bg-emerald-950/30 transition flex items-center gap-3">
                      <span className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-[#00744B] dark:text-emerald-300 flex items-center justify-center shrink-0">
                        <i className="fa-solid fa-align-left" />
                      </span>
                      <div>
                        <div className="text-xs sm:text-sm font-extrabold text-slate-800 dark:text-white">
                          เขียนข้อความเอง
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          กำหนดหัวข้อและเนื้อหา พร้อมจัดรูปแบบการ์ดอัตโนมัติ
                        </div>
                      </div>
                    </div>
                  </label>
                  <label className="cursor-pointer">
                    <input
                      id="radioAnnouncementModeImage"
                      type="radio"
                      name="announcementMode"
                      value="image"
                      checked={draft.announcement_mode === 'image'}
                      onChange={() => updateField('announcement_mode', 'image')}
                      className="sr-only peer"
                    />
                    <div className="p-3.5 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 peer-checked:border-[#00744B] peer-checked:bg-emerald-50/70 dark:peer-checked:bg-emerald-950/30 transition flex items-center gap-3">
                      <span className="w-9 h-9 rounded-xl bg-teal-100 dark:bg-teal-900/60 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0">
                        <i className="fa-regular fa-image" />
                      </span>
                      <div>
                        <div className="text-xs sm:text-sm font-extrabold text-slate-800 dark:text-white">
                          อัปโหลดรูป / ลิงก์รูป
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          แสดงรูปภาพโปสเตอร์แทนตัวหนังสือ (เหมาะกับมือถือ)
                        </div>
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Panel A: เขียนข้อความเอง */}
              {draft.announcement_mode !== 'image' ? (
                <div
                  id="announcementPanelText"
                  className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-700/60 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-2 text-xs font-extrabold text-slate-800 dark:text-white">
                      <i className="fa-solid fa-bullhorn text-[#00744B]" />
                      <span>เนื้อหาประกาศแบบข้อความ</span>
                    </div>
                    <button
                      type="button"
                      id="btnFillAnnouncementTemplate"
                      onClick={handleFillAnnouncementTemplate}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-emerald-100 dark:bg-emerald-900/50 text-[#00744B] dark:text-emerald-300 hover:bg-emerald-200 transition cursor-pointer"
                    >
                      <i className="fa-solid fa-wand-magic-sparkles" />
                      <span>ใส่เทมเพลตประกาศ v2.10.0</span>
                    </button>
                  </div>

                  <div>
                    <label
                      htmlFor="setAnnouncementTitle"
                      className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
                    >
                      <i className="fa-solid fa-bullhorn mr-1 text-[#00744B]" />
                      หัวข้อประกาศ (Head)
                    </label>
                    <input
                      id="setAnnouncementTitle"
                      type="text"
                      value={draft.announcement_title || ''}
                      onChange={(e) => updateField('announcement_title', e.target.value)}
                      placeholder="เช่น แจ้งปรับปรุง ระบบลงเวลาปฏิบัติราชการ (สตบ.)"
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-sm font-bold"
                    />
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                      <label
                        htmlFor="setAnnouncementBody"
                        className="block text-xs font-bold text-slate-700 dark:text-slate-300"
                      >
                        รายละเอียดประกาศ (Body)
                      </label>
                      <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                        ขึ้นต้นด้วย -, •, * หรือ 1. เพื่อจัดเป็นการ์ดไฮไลต์อัตโนมัติ
                      </span>
                    </div>
                    <textarea
                      id="setAnnouncementBody"
                      rows={6}
                      value={draft.announcement_body || ''}
                      onChange={(e) => updateField('announcement_body', e.target.value)}
                      placeholder={'- รายละเอียดข้อที่ 1\n- รายละเอียดข้อที่ 2'}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs sm:text-sm leading-relaxed"
                    />
                  </div>
                </div>
              ) : (
                /* Panel B: อัปโหลดรูป / ลิงก์รูป */
                <div
                  id="announcementPanelImage"
                  className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-700/60 space-y-4"
                >
                  <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2.5">
                    <i className="fa-solid fa-mobile-screen-button text-base mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div>
                      <div className="font-extrabold">
                        แนะนำขนาดภาพแนวตั้งสำหรับมือถือ: 1080 × 1350 px (4:5) หรือ 1080 × 1920 px (9:16)
                      </div>
                      <div className="text-[11px] opacity-90 mt-0.5">
                        รองรับไฟล์ PNG, JPG, WebP ขนาดไม่เกิน 5 MB • รูปภาพจะแสดงแทนตัวหนังสือในป๊อปอัปประกาศ
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                    <div className="lg:col-span-7 space-y-4">
                      {/* สถานะโฟลเดอร์ Google Drive เก็บรูปประกาศ (ตั้งค่าในแท็บ 1) */}
                      <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs font-extrabold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                            <i className="fa-brands fa-google-drive text-emerald-600" />
                            <span>โฟลเดอร์ Google Drive เก็บรูปประกาศ</span>
                          </div>
                          <button
                            type="button"
                            onClick={handleJumpToTab1Folder}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/50 dark:hover:bg-sky-900/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60 transition cursor-pointer shrink-0"
                          >
                            <i className="fa-solid fa-arrow-up-right-from-square" />
                            <span>ไปตั้งค่าในแท็บ 1</span>
                          </button>
                        </div>
                        <p
                          id="tab7AnnouncementFolderHint"
                          className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed"
                        >
                          {renderTab7FolderHint()}
                        </p>
                      </div>

                      {/* อัปโหลดไฟล์รูปภาพ */}
                      <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2.5">
                        <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-200">
                          อัปโหลดไฟล์รูปภาพประกาศขึ้น Google Drive
                        </label>
                        <div className="flex flex-wrap items-center gap-2.5">
                          <button
                            type="button"
                            id="btnTriggerAnnouncementUpload"
                            onClick={() => annFileRef.current?.click()}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#00744B] hover:bg-[#005B3A] text-white transition shadow-sm cursor-pointer"
                          >
                            <i className="fa-solid fa-cloud-arrow-up" />
                            <span>เลือกไฟล์รูปและอัปโหลด (PNG / JPG / WebP)</span>
                          </button>
                          {annUploadStatus && (
                            <span
                              id="announcementUploadStatus"
                              className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold"
                            >
                              {annUploadStatus}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* ลิงก์รูปภาพประกาศ */}
                      <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <label
                            htmlFor="setAnnouncementImageUrl"
                            className="block text-xs font-extrabold text-slate-700 dark:text-slate-200"
                          >
                            ลิงก์รูปภาพประกาศ (Direct URL / Google Drive URL)
                          </label>
                          <span
                            id="announcementImageVerifyBadge"
                            className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold ${badgeStyleClass(annImgBadge.type)}`}
                          >
                            {annImgBadge.text}
                          </span>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            id="setAnnouncementImageUrl"
                            type="url"
                            value={draft.announcement_image_url || ''}
                            onChange={(e) => updateField('announcement_image_url', e.target.value)}
                            placeholder="https://lh3.googleusercontent.com/d/..."
                            className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs flex-1"
                          />
                          <button
                            type="button"
                            id="btnVerifyAnnouncementImage"
                            onClick={handleVerifyAnnouncementImage}
                            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition shrink-0 cursor-pointer"
                          >
                            <i className="fa-solid fa-magnifying-glass mr-1" />
                            ตรวจลิงก์รูป
                          </button>
                          <button
                            type="button"
                            id="btnClearAnnouncementImage"
                            onClick={handleClearAnnouncementImage}
                            className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 transition shrink-0 cursor-pointer"
                          >
                            ล้างรูป
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* กรอบตัวอย่างแนวมือถือ (Mobile 9:16 / 4:5 Preview Card) */}
                    <div className="lg:col-span-5 flex flex-col items-center">
                      <div className="w-full max-w-[260px] rounded-[28px] border-4 border-slate-800 dark:border-slate-600 bg-slate-900 p-2 shadow-xl">
                        <div className="w-16 h-1.5 bg-slate-700 rounded-full mx-auto mb-2" />
                        <div
                          id="announcementImagePreviewBox"
                          className="w-full aspect-[4/5] rounded-2xl bg-slate-100 dark:bg-slate-800 flex flex-col items-center justify-center overflow-hidden text-slate-400 p-2"
                        >
                          {annPreviewUrl ? (
                            <img
                              src={annPreviewUrl}
                              alt="Preview"
                              className="w-full h-full object-contain rounded-xl bg-white dark:bg-slate-900"
                            />
                          ) : (
                            <>
                              <i className="fa-regular fa-image text-3xl mb-1.5 opacity-60" />
                              <span className="text-[11px] text-center">
                                ตัวอย่างภาพประกาศบนหน้าจอมือถือ (4:5 / 9:16)
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ปุ่มคำสั่งแท็บ 7 */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3">
                <button
                  type="button"
                  id="btnPreviewAnnouncement"
                  onClick={() => setPreviewModalOpen(true)}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600 transition cursor-pointer"
                >
                  <i className="fa-solid fa-eye" />
                  <span>ดูตัวอย่างป๊อปอัปจริง (Preview)</span>
                </button>
                <button
                  type="button"
                  id="btnSaveAnnouncementSettings"
                  disabled={saving}
                  onClick={handleSaveAnnouncementSettings}
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-[#00744B] hover:bg-[#005B3A] text-white shadow-md transition cursor-pointer disabled:opacity-50"
                >
                  <i className="fa-solid fa-floppy-disk" />
                  <span>บันทึกการตั้งค่าประกาศระบบ</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Generic Modal for Tabs 3, 4, 5, 6 (#modalSettingsItem) */}
      <ResponsiveModal
        open={itemModal.open}
        onClose={() => setItemModal((prev) => ({ ...prev, open: false }))}
        title={itemModal.title}
        icon="fa-sliders"
        maxWidthClass="max-w-xl"
        footer={
          <>
            <button
              type="button"
              onClick={() => setItemModal((prev) => ({ ...prev, open: false }))}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 transition cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              form="formSettingsItem"
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-[#00744B] hover:bg-[#005B3A] text-white shadow-md transition cursor-pointer"
            >
              <i className="fa-solid fa-floppy-disk" />
              <span>บันทึกรายการทั้งหมด</span>
            </button>
          </>
        }
      >
        <form id="formSettingsItem" onSubmit={handleItemModalSubmit} className="space-y-4 text-sm">
          {/* Mode: shift (Tab 3) */}
          {itemModal.mode === 'shift' && (
            <>
              <div>
                <label className="block text-xs font-bold mb-1">
                  ชื่อช่วงเวลาทำงาน (ไม่ต้องใส่วงเล็บเวลา ระบบจะต่อท้ายเวลาให้อัตโนมัติ) *
                </label>
                <input
                  id="mShiftName"
                  type="text"
                  required
                  value={shiftForm.name}
                  onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })}
                  placeholder="เช่น เวลาราชการปกติ หรือ ปฏิบัติงานนอกเวลา"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">เวลาเริ่มงาน (24 ชม.) *</label>
                  <input
                    id="mShiftIn"
                    type="text"
                    required
                    value={shiftForm.check_in}
                    onChange={(e) => {
                      const nextIn = e.target.value;
                      const inMin = UIHelpers.timeToMinutes(nextIn);
                      const outMin = UIHelpers.timeToMinutes(shiftForm.check_out);
                      setShiftForm((prev) => ({
                        ...prev,
                        check_in: nextIn,
                        is_overnight:
                          inMin >= 0 && outMin >= 0 && outMin < inMin ? true : prev.is_overnight,
                      }));
                    }}
                    placeholder="เช่น 08:30 หรือ 22:00"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-mono font-bold text-center text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">เวลาเลิกงาน (24 ชม.) *</label>
                  <input
                    id="mShiftOut"
                    type="text"
                    required
                    value={shiftForm.check_out}
                    onChange={(e) => {
                      const nextOut = e.target.value;
                      const inMin = UIHelpers.timeToMinutes(shiftForm.check_in);
                      const outMin = UIHelpers.timeToMinutes(nextOut);
                      setShiftForm((prev) => ({
                        ...prev,
                        check_out: nextOut,
                        is_overnight:
                          inMin >= 0 && outMin >= 0 && outMin < inMin ? true : prev.is_overnight,
                      }));
                    }}
                    placeholder="เช่น 16:30 หรือ 01:00"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-mono font-bold text-center text-sm"
                  />
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5">
                <label className="flex items-start gap-2.5 text-xs font-bold cursor-pointer">
                  <input
                    id="mShiftOvertime"
                    type="checkbox"
                    checked={shiftForm.is_overtime}
                    onChange={(e) => setShiftForm({ ...shiftForm, is_overtime: e.target.checked })}
                    className="w-4 h-4 accent-purple-600 mt-0.5 shrink-0"
                  />
                  <div>
                    <span className="text-purple-700 dark:text-purple-300 font-extrabold block">
                      ช่วงเวลานี้คือ "ปฏิบัติงานนอกเวลา"
                    </span>
                    <span className="text-slate-500 font-normal block mt-0.5">
                      เมื่อเลือกช่วงเวลานี้ ระบบจะใช้การบันทึกเวลารูปแบบพิเศษโดยอัตโนมัติ
                    </span>
                  </div>
                </label>
                <label className="flex items-center gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-700 text-xs font-bold cursor-pointer">
                  <input
                    id="mShiftOvernight"
                    type="checkbox"
                    checked={shiftForm.is_overnight}
                    onChange={(e) => setShiftForm({ ...shiftForm, is_overnight: e.target.checked })}
                    className="w-4 h-4 accent-indigo-600 shrink-0"
                  />
                  <span>เป็นเวลาเลิกงานข้ามวัน (ระบบจะต่อท้าย "(ข้ามวัน)" ในตัวเลือกอัตโนมัติ)</span>
                </label>
                <label className="flex items-center gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-700 text-xs font-bold cursor-pointer">
                  <input
                    id="mShiftCustom"
                    type="checkbox"
                    checked={shiftForm.is_custom}
                    onChange={(e) => setShiftForm({ ...shiftForm, is_custom: e.target.checked })}
                    className="w-4 h-4 accent-emerald-600 shrink-0"
                  />
                  <span>เป็นตัวเลือก "อื่นๆ" (ให้ผู้ใช้กรอกเวลาเข้างานและเวลาเลิกงานเองได้)</span>
                </label>
                <label className="flex items-start gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-700 text-xs font-bold cursor-pointer">
                  <input
                    id="mShiftAllowEarlyCheckin"
                    type="checkbox"
                    checked={shiftForm.allow_early_checkin}
                    onChange={(e) =>
                      setShiftForm({ ...shiftForm, allow_early_checkin: e.target.checked })
                    }
                    className="w-4 h-4 accent-blue-600 mt-0.5 shrink-0"
                  />
                  <div>
                    <span className="text-blue-700 dark:text-blue-300 font-extrabold block">
                      ให้เริ่มเลือก ทำงานก่อนเวลาเริ่มงานได้
                    </span>
                    <span className="text-slate-500 font-normal block mt-0.5">
                      เมื่อเปิดใช้ Real-time Filter ช่วงเวลานี้จะแสดงให้เลือกก่อนเวลาเริ่มงานตามจำนวนนาทีที่กำหนดในระบบ
                    </span>
                  </div>
                </label>
              </div>
            </>
          )}

          {/* Mode: list-add (Tab 4) */}
          {itemModal.mode === 'list-add' && renderMultiRowInputsUI()}

          {/* Mode: list-edit (Tab 4) */}
          {itemModal.mode === 'list-edit' && (
            <div>
              <label className="block text-xs font-bold mb-1">{itemModal.fieldLabel} *</label>
              <input
                type="text"
                required
                value={singleTextVal}
                onChange={(e) => setSingleTextVal(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              />
            </div>
          )}

          {/* Mode: pos-step1 (Tab 5) */}
          {itemModal.mode === 'pos-step1' && renderMultiRowInputsUI()}

          {/* Mode: pos-step2 (Tab 5) */}
          {itemModal.mode === 'pos-step2' && (
            <>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <label className="block text-xs font-extrabold">
                  1. เลือกประเภทตำแหน่ง (ค่าหลักแม่) *
                </label>
                <select
                  required
                  value={posModalParents.type}
                  onChange={(e) => setPosModalParents({ ...posModalParents, type: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold"
                >
                  {uniquePosTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              {renderMultiRowInputsUI()}
            </>
          )}

          {/* Mode: pos-step3 (Tab 5) */}
          {itemModal.mode === 'pos-step3' && (
            <>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-extrabold mb-1">
                    1. เลือกประเภทตำแหน่ง (ค่าหลักแม่) *
                  </label>
                  <select
                    required
                    value={posModalParents.type}
                    onChange={(e) => {
                      const nextType = e.target.value;
                      const titles = SettingsModel.getUniquePositionTitles(draft, nextType);
                      setPosModalParents({
                        ...posModalParents,
                        type: nextType,
                        title: titles[0] || '',
                      });
                    }}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold"
                  >
                    {uniquePosTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-extrabold mb-1">
                    2. เลือกชื่อตำแหน่งในสายงาน (ค่าแม่) *
                  </label>
                  <select
                    required
                    value={posModalParents.title}
                    onChange={(e) =>
                      setPosModalParents({ ...posModalParents, title: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold"
                  >
                    {SettingsModel.getUniquePositionTitles(draft, posModalParents.type).map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {renderMultiRowInputsUI()}
            </>
          )}

          {/* Mode: pos-edit (Tab 5) */}
          {itemModal.mode === 'pos-edit' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold mb-1">1. ประเภทตำแหน่ง *</label>
                <input
                  type="text"
                  required
                  value={posModalParents.type}
                  onChange={(e) => setPosModalParents({ ...posModalParents, type: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">2. ชื่อตำแหน่งในสายงาน</label>
                <input
                  type="text"
                  value={posModalParents.title}
                  onChange={(e) =>
                    setPosModalParents({ ...posModalParents, title: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">3. ระดับตำแหน่ง</label>
                <input
                  type="text"
                  value={posModalParents.level}
                  onChange={(e) =>
                    setPosModalParents({ ...posModalParents, level: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}

          {/* Mode: aff-step1 (Tab 5) */}
          {itemModal.mode === 'aff-step1' && renderMultiRowInputsUI()}

          {/* Mode: aff-step2 (Tab 5) */}
          {itemModal.mode === 'aff-step2' && (
            <>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <label className="block text-xs font-extrabold">
                  1. เลือกหน่วยงานหลัก (ค่าแม่) *
                </label>
                <select
                  required
                  value={affModalParents.organization}
                  onChange={(e) =>
                    setAffModalParents({ ...affModalParents, organization: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold"
                >
                  {uniqueOrgs.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              {renderMultiRowInputsUI()}
            </>
          )}

          {/* Mode: aff-step3 (Tab 5) */}
          {itemModal.mode === 'aff-step3' && (
            <>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                <div>
                  <label className="block text-xs font-extrabold mb-1">1. เลือกหน่วยงานหลัก *</label>
                  <select
                    required
                    value={affModalParents.organization}
                    onChange={(e) => {
                      const nextOrg = e.target.value;
                      const bureaus = SettingsModel.getUniqueBureaus(draft, nextOrg);
                      setAffModalParents({
                        ...affModalParents,
                        organization: nextOrg,
                        bureau: bureaus[0] || '',
                      });
                    }}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold"
                  >
                    {uniqueOrgs.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-extrabold mb-1">
                    2. เลือกสำนักงาน/กอง (ค่าแม่) *
                  </label>
                  <select
                    required
                    value={affModalParents.bureau}
                    onChange={(e) =>
                      setAffModalParents({ ...affModalParents, bureau: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold"
                  >
                    {SettingsModel.getUniqueBureaus(draft, affModalParents.organization).map(
                      (b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      )
                    )}
                  </select>
                </div>
              </div>
              {renderMultiRowInputsUI()}
            </>
          )}

          {/* Mode: aff-step4 (Tab 5) */}
          {itemModal.mode === 'aff-step4' && (
            <>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                <div>
                  <label className="block text-xs font-extrabold mb-1">1. เลือกหน่วยงานหลัก *</label>
                  <select
                    required
                    value={affModalParents.organization}
                    onChange={(e) => {
                      const nextOrg = e.target.value;
                      const bureaus = SettingsModel.getUniqueBureaus(draft, nextOrg);
                      const firstBureau = bureaus[0] || '';
                      const divs = SettingsModel.getUniqueDivisions(draft, firstBureau, nextOrg);
                      setAffModalParents({
                        ...affModalParents,
                        organization: nextOrg,
                        bureau: firstBureau,
                        division: divs[0] || '',
                      });
                    }}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold"
                  >
                    {uniqueOrgs.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-extrabold mb-1">2. เลือกสำนักงาน/กอง *</label>
                  <select
                    required
                    value={affModalParents.bureau}
                    onChange={(e) => {
                      const nextBureau = e.target.value;
                      const divs = SettingsModel.getUniqueDivisions(
                        draft,
                        nextBureau,
                        affModalParents.organization
                      );
                      setAffModalParents({
                        ...affModalParents,
                        bureau: nextBureau,
                        division: divs[0] || '',
                      });
                    }}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold"
                  >
                    {SettingsModel.getUniqueBureaus(draft, affModalParents.organization).map(
                      (b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      )
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-extrabold mb-1">
                    3. เลือกส่วน/ฝ่าย (ค่าแม่) *
                  </label>
                  <select
                    required
                    value={affModalParents.division}
                    onChange={(e) =>
                      setAffModalParents({ ...affModalParents, division: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold"
                  >
                    {SettingsModel.getUniqueDivisions(
                      draft,
                      affModalParents.bureau,
                      affModalParents.organization
                    ).map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {renderMultiRowInputsUI()}
            </>
          )}

          {/* Mode: aff-edit (Tab 5) */}
          {itemModal.mode === 'aff-edit' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold mb-1">1. หน่วยงานหลัก *</label>
                <input
                  type="text"
                  required
                  value={affModalParents.organization}
                  onChange={(e) =>
                    setAffModalParents({ ...affModalParents, organization: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">2. สำนักงาน/กอง</label>
                <input
                  type="text"
                  value={affModalParents.bureau}
                  onChange={(e) =>
                    setAffModalParents({ ...affModalParents, bureau: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">3. ส่วน/ฝ่าย</label>
                <input
                  type="text"
                  value={affModalParents.division}
                  onChange={(e) =>
                    setAffModalParents({ ...affModalParents, division: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">4. กลุ่มงาน</label>
                <input
                  type="text"
                  value={affModalParents.group}
                  onChange={(e) =>
                    setAffModalParents({ ...affModalParents, group: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}

          {/* Mode: location (Tab 6) */}
          {itemModal.mode === 'location' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold mb-1">ชื่อสถานที่ราชการ *</label>
                <input
                  id="modalLocName"
                  type="text"
                  required
                  value={locForm.name}
                  onChange={(e) => setLocForm({ ...locForm, name: e.target.value })}
                  placeholder="เช่น สำนักเทศกิจ หรือ สำนักงานตรวจและบังคับการ"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">พิกัดละติจูด (Latitude) *</label>
                  <input
                    id="modalLocLat"
                    type="number"
                    step="any"
                    required
                    value={locForm.latitude}
                    onChange={(e) => setLocForm({ ...locForm, latitude: e.target.value })}
                    placeholder="13.756331"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">พิกัดลองจิจูด (Longitude) *</label>
                  <input
                    id="modalLocLng"
                    type="number"
                    step="any"
                    required
                    value={locForm.longitude}
                    onChange={(e) => setLocForm({ ...locForm, longitude: e.target.value })}
                    placeholder="100.501765"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-mono text-sm"
                  />
                </div>
              </div>

              {/* ปุ่มช่วยเหลือดึงพิกัด GPS */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  id="btnModalLocGetGps"
                  disabled={fetchingGps}
                  onClick={handleGetCurrentGpsForLocation}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 hover:bg-sky-100 transition border border-sky-300/40 cursor-pointer"
                >
                  <i
                    className={`fa-solid ${
                      fetchingGps ? 'fa-spinner fa-spin' : 'fa-location-crosshairs text-sky-600'
                    }`}
                  />
                  <span>{fetchingGps ? 'กำลังดึงพิกัด...' : 'ดึงพิกัด GPS ปัจจุบัน'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMapPickerOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 dark:bg-emerald-950/40 text-[#00744B] dark:text-emerald-300 hover:bg-emerald-100 transition border border-emerald-300/40 cursor-pointer"
                >
                  <i className="fa-solid fa-map-pin" />
                  <span>เลือกพิกัดจากแผนที่</span>
                </button>
                <a
                  id="btnModalLocViewMap"
                  href={`https://www.google.com/maps?q=${locForm.latitude},${locForm.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 transition border border-slate-300/40 no-underline cursor-pointer"
                >
                  <i className="fa-solid fa-map-location-dot text-emerald-600" />
                  <span>ดูตำแหน่งบน Google Maps</span>
                </a>
              </div>

              <div>
                <label className="block text-xs font-bold mb-1">
                  รัศมีที่อนุญาตให้ลงเวลาได้ (เมตร) *
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="modalLocRadius"
                    type="number"
                    min={10}
                    max={5000}
                    required
                    value={locForm.radius_meters}
                    onChange={(e) => setLocForm({ ...locForm, radius_meters: e.target.value })}
                    className="w-40 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-mono text-sm"
                  />
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    เมตร (ค่าแนะนำ: 100 - 200 เมตร)
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-white">
                    สถานะเปิดใช้งานสถานที่นี้
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    หากปิดใช้งาน ผู้ใช้จะไม่สามารถใช้สถานที่นี้ในการตรวจเช็ค Geofence ได้
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    id="modalLocIsActive"
                    type="checkbox"
                    checked={Boolean(locForm.is_active)}
                    onChange={(e) => setLocForm({ ...locForm, is_active: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00744B]" />
                </label>
              </div>
            </div>
          )}
        </form>
      </ResponsiveModal>

      {/* Tab 6 Map Picker Modal */}
      <OffsiteMapSearchModal
        open={mapPickerOpen}
        onClose={() => setMapPickerOpen(false)}
        initialCoords={{
          lat: Number(locForm.latitude || 13.756331),
          lng: Number(locForm.longitude || 100.501765),
          name: locForm.name || '',
        }}
        onSelectPlace={(place) => {
          setLocForm((prev) => ({
            ...prev,
            latitude: Number(place.lat.toFixed(6)),
            longitude: Number(place.lng.toFixed(6)),
            name: !prev.name && place.name ? place.name : prev.name,
          }));
        }}
      />

      {/* Tab 7 Live Announcement Preview Modal (#modalAnnouncementPreview) */}
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
