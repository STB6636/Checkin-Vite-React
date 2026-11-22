import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AdminLayout } from '../components/layout/AdminLayout.jsx';
import { OrgHierarchyFilter } from '../components/common/OrgHierarchyFilter.jsx';
import { ResponsiveModal } from '../components/common/ResponsiveModal.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useSettings } from '../contexts/SettingsContext.jsx';
import { PersonnelModel } from '../models/PersonnelModel.js';
import { SettingsModel } from '../models/SettingsModel.js';
import { UIHelpers } from '../core/UIHelpers.js';

function maskNationalIdPDPA(rawId = '') {
  const digits = String(rawId || '').replace(/\D/g, '');
  if (digits.length !== 13) return rawId || '-';
  return `${digits[0]}-XXXX-XXXXX-${digits.slice(10, 12)}-${digits[12]}`;
}

function getInitials(person) {
  const fn = String(person?.first_name || '').trim();
  const ln = String(person?.last_name || '').trim();
  return `${fn.charAt(0) || 'บ'}${ln.charAt(0) || 'ค'}`;
}

const EMPTY_PERSON = {
  id: null,
  national_id: '',
  prefix: 'นาย',
  first_name: '',
  last_name: '',
  position_type: '',
  position_title: '',
  position_level: '',
  organization: 'กรุงเทพมหานคร',
  bureau: '',
  division: '',
  work_group: '',
  phone: '',
  email: '',
  autoCreateAccount: true,
};

/**
 * PersonnelPage — 100% Parity with legacy personnel.html & PersonnelController.js
 */
export default function PersonnelPage() {
  const { user, isSuperAdmin } = useAuth();
  const { settings } = useSettings();
  const fileInputRef = useRef(null);

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [orgFilter, setOrgFilter] = useState({ bureau: '', division: '', workGroup: '' });
  const [groupBy, setGroupBy] = useState('division'); // 'division' | 'group'
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_PERSON);
  const [saving, setSaving] = useState(false);
  const [resumePerson, setResumePerson] = useState(null);

  // Smart Bulk Import Preview Modal state
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importRows, setImportRows] = useState([]);
  const [importing, setImporting] = useState(false);

  const loadData = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    try {
      const data = await PersonnelModel.getAll(user);
      setList(Array.isArray(data) ? data : []);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadData(false); }, [loadData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((p) => {
      if (orgFilter.bureau && p.bureau !== orgFilter.bureau) return false;
      if (orgFilter.division && p.division !== orgFilter.division) return false;
      if (orgFilter.workGroup && p.work_group !== orgFilter.workGroup) return false;
      if (q) {
        const hay = `${p.prefix || ''}${p.first_name || ''} ${p.last_name || ''} ${p.national_id || ''} ${p.position_title || ''} ${p.bureau || ''} ${p.division || ''} ${p.work_group || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [list, orgFilter, search]);

  const grouped = useMemo(
    () => PersonnelModel.groupPersonnel(filtered, groupBy),
    [filtered, groupBy]
  );

  const importStats = useMemo(() => {
    let validCount = 0;
    let autoFixCount = 0;
    let errorCount = 0;
    for (const r of importRows) {
      const fn = String(r['ชื่อ'] || r['first_name'] || '').trim();
      const ln = String(r['นามสกุล'] || r['last_name'] || '').trim();
      const rawNid = String(r['เลขบัตรประชาชน'] || r['เลขบัตรประชาชน (13 หลัก)'] || r['national_id'] || '').trim();
      const cleanNid = rawNid.replace(/\D/g, '');
      if (!fn || !ln) {
        errorCount += 1;
      } else if (rawNid && rawNid !== cleanNid) {
        autoFixCount += 1;
        validCount += 1;
      } else {
        validCount += 1;
      }
    }
    return {
      total: importRows.length,
      valid: validCount,
      autoFix: autoFixCount,
      error: errorCount,
    };
  }, [importRows]);

  const posTypes = useMemo(() => SettingsModel.getUniquePositionTypes(settings), [settings]);
  const posTitles = useMemo(() => SettingsModel.getUniquePositionTitles(settings, form.position_type), [settings, form.position_type]);
  const posLevels = useMemo(() => SettingsModel.getUniquePositionLevels(settings, form.position_type, form.position_title), [settings, form.position_type, form.position_title]);
  const bureaus = useMemo(() => SettingsModel.getUniqueBureaus(settings), [settings]);
  const divisions = useMemo(() => SettingsModel.getUniqueDivisions(settings, form.bureau), [settings, form.bureau]);
  const groups = useMemo(() => SettingsModel.getUniqueGroups(settings, form.bureau, form.division), [settings, form.bureau, form.division]);

  const groupHeaderColor = settings?.category_colors?.group_header || '#00744B';

  const openCreate = () => {
    setForm({
      ...EMPTY_PERSON,
      organization: settings?.organization_name || 'กรุงเทพมหานคร',
      bureau: user?.scope_bureau || settings?.bureau_name || '',
      division: user?.scope_division || '',
    });
    setModalOpen(true);
  };

  const openEdit = (p) => {
    setForm({
      id: p.id,
      national_id: p.national_id || '',
      prefix: p.prefix || 'นาย',
      first_name: p.first_name || '',
      last_name: p.last_name || '',
      position_type: p.position_type || '',
      position_title: p.position_title || '',
      position_level: p.position_level || '',
      organization: p.organization || 'กรุงเทพมหานคร',
      bureau: p.bureau || '',
      division: p.division || '',
      work_group: p.work_group || '',
      phone: p.phone || '',
      email: p.email || '',
      autoCreateAccount: false,
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        national_id: form.national_id.trim(),
        prefix: form.prefix,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        position_type: form.position_type,
        position_title: form.position_title,
        position_level: form.position_level,
        organization: form.organization,
        bureau: form.bureau,
        division: form.division,
        work_group: form.work_group,
        phone: form.phone,
        email: form.email,
      };
      const res = form.id
        ? await PersonnelModel.update(form.id, payload)
        : await PersonnelModel.create(payload, form.autoCreateAccount);
      if (res?.success === false) {
        await UIHelpers.alert('บันทึกไม่สำเร็จ', res.message || 'เกิดข้อผิดพลาด', 'error');
        return;
      }
      setModalOpen(false);
      UIHelpers.showToast(res?.message || (form.id ? 'อัปเดตข้อมูลบุคลากรแล้ว' : 'เพิ่มข้อมูลบุคลากรเรียบร้อยแล้ว'), 'success');
      await loadData(true);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p) => {
    if (!isSuperAdmin) return;
    const name = `${p.prefix || ''}${p.first_name || ''} ${p.last_name || ''}`.trim();
    const ok = await UIHelpers.confirm('ลบข้อมูลบุคลากร', `ต้องการลบข้อมูลของ "${name}" ใช่หรือไม่?`, 'ลบข้อมูล', 'warning');
    if (!ok) return;
    const res = await PersonnelModel.delete(p.id);
    if (res?.success === false) {
      await UIHelpers.alert('ลบไม่สำเร็จ', res.message || 'เกิดข้อผิดพลาด', 'error');
      return;
    }
    UIHelpers.showToast('ลบข้อมูลบุคลากรเรียบร้อยแล้ว', 'success');
    setResumePerson(null);
    await loadData(true);
  };

  const handleQuickCreateAccount = async (p) => {
    const fullName = `${p.prefix || ''}${p.first_name || ''} ${p.last_name || ''}`.trim();
    const cleanNationalId = String(p.national_id || '').replace(/\D/g, '');
    if (cleanNationalId.length !== 13) {
      await UIHelpers.alert(
        'ไม่สามารถสร้างบัญชีอัตโนมัติได้',
        `บุคลากร "${fullName}" ยังไม่มีเลขประจำตัวประชาชนครบ 13 หลัก กรุณาแก้ไขข้อมูลบุคลากรเพื่อระบุเลขบัตรประชาชนก่อน`,
        'warning'
      );
      return;
    }
    const idCheck = UIHelpers.validateThaiNationalId(cleanNationalId, false);
    if (!idCheck.valid) {
      await UIHelpers.alert('เลขบัตรประชาชนไม่ถูกต้อง', idCheck.message, 'warning');
      return;
    }

    const initialPassword = UIHelpers.getLast6DigitsFromNationalId(cleanNationalId);
    const confirmed = await UIHelpers.confirm(
      'ยืนยันการสร้างบัญชีผู้ใช้งานอัตโนมัติ',
      `ต้องการสร้างบัญชีผู้ใช้งานให้ "${fullName}" หรือไม่?\n• Username: ${cleanNationalId}\n• รหัสผ่านเริ่มต้น: ${initialPassword} (6 ตัวท้ายบัตรประชาชน)`,
      'สร้างบัญชีทันที',
      'question'
    );
    if (!confirmed) return;

    UIHelpers.showLoading('กำลังสร้างบัญชีผู้ใช้งานอัตโนมัติ...');
    try {
      const res = await PersonnelModel.quickCreateAccount(p.id);
      UIHelpers.hideLoading();
      if (res?.success) {
        await loadData(true);
        if (resumePerson && String(resumePerson.id) === String(p.id)) {
          setResumePerson((prev) => (prev ? { ...prev, has_account: true, account_role: 'User', account_username: cleanNationalId } : null));
        }
        await UIHelpers.alert(
          'สร้างบัญชีผู้ใช้งานสำเร็จ',
          `ชื่อบุคลากร: ${res.fullName || fullName}\nUsername: ${res.username || cleanNationalId}\nรหัสผ่านเริ่มต้น: ${res.password || initialPassword}`,
          'success'
        );
      } else {
        await UIHelpers.alert('ไม่สามารถสร้างบัญชีได้', res?.message || 'เกิดข้อผิดพลาด', 'warning');
      }
    } catch (err) {
      UIHelpers.hideLoading();
      await UIHelpers.alert('เกิดข้อผิดพลาด', err?.message || 'ไม่สามารถสร้างบัญชีได้', 'error');
    }
  };

  const handleExportExcel = async () => {
    const rows = filtered.map((p, idx) => {
      const fullName = `${p.prefix || ''}${p.first_name || ''} ${p.last_name || ''}`.trim();
      const posFull = UIHelpers.formatPosition(p.position_title, p.position_level, p.position_type);
      return {
        'ลำดับ': idx + 1,
        'เลขบัตรประชาชน (13 หลัก)': p.national_id || '-',
        'คำนำหน้า': p.prefix || '',
        'ชื่อ-นามสกุล': fullName,
        'ประเภทตำแหน่ง': p.position_type || '-',
        'สายงาน/ชื่อตำแหน่ง': p.position_title || '-',
        'ระดับตำแหน่ง': p.position_level || '-',
        'ชื่อตำแหน่งเต็ม': posFull,
        'หน่วยงาน': p.organization || 'กรุงเทพมหานคร',
        'สำนักงาน/กอง': p.bureau || '-',
        'ส่วน/ฝ่าย': p.division || '-',
        'กลุ่มงาน': p.work_group && p.work_group !== 'ไม่มี' ? p.work_group : '-',
        'มีบัญชีผู้ใช้': p.has_account ? `มี (${p.account_role || 'User'})` : 'ยังไม่มี',
      };
    });
    await UIHelpers.exportToExcelUTF8(rows, `ทะเบียนประวัติบุคลากร_${UIHelpers.getTodayISO()}`, 'Personnel');
    UIHelpers.showToast('ส่งออกไฟล์ Excel ครบ 13 คอลัมน์เรียบร้อยแล้ว', 'success');
  };

  const handlePickImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const rows = await UIHelpers.parseExcelFileUTF8(file);
      setImportRows(Array.isArray(rows) ? rows : []);
    } catch (err) {
      await UIHelpers.alert('อ่านไฟล์ไม่สำเร็จ', err?.message || 'ไฟล์ Excel ไม่ถูกต้อง', 'error');
    }
  };

  const handleConfirmImport = async () => {
    if (!importRows.length || importing) return;
    setImporting(true);
    try {
      const res = await PersonnelModel.bulkImportFromExcel(importRows, true);
      setImportModalOpen(false);
      setImportRows([]);
      await UIHelpers.alert(
        res?.success ? 'นำเข้าข้อมูลเรียบร้อยแล้ว' : 'ผลการนำเข้า',
        res?.message || `ประมวลผล ${importRows.length} แถว`,
        res?.success ? 'success' : 'warning'
      );
      await loadData(true);
    } finally {
      setImporting(false);
    }
  };

  const renderPersonRow = (p, runningNo) => {
    const fullName = `${p.prefix || ''}${p.first_name || ''} ${p.last_name || ''}`.trim();
    const posFull = UIHelpers.formatPosition(p.position_title, p.position_level, p.position_type);
    const workGroupText = p.work_group && p.work_group.trim() !== 'ไม่มี' ? p.work_group : '-';
    const roleMeta = p.role_meta || PersonnelModel.getRolePastelMeta(p.account_role || 'User');
    const dotClass = !p.has_account
      ? 'bg-amber-400'
      : p.account_role === 'SuperAdmin'
      ? 'role-dot-superadmin bg-rose-400'
      : p.account_role === 'Admin'
      ? 'role-dot-admin bg-amber-300'
      : 'role-dot-user bg-emerald-400';

    return (
      <tr
        key={p.id}
        onClick={() => setResumePerson(p)}
        className="hover:bg-emerald-50/50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
      >
        <td className="w-14 text-center py-3.5 px-3 text-xs font-semibold text-slate-500">{runningNo}</td>
        <td className="min-w-[180px] py-3.5 px-3">
          <div className="flex items-center gap-2.5 whitespace-nowrap">
            <span className={`w-3 h-3 rounded-full shrink-0 ${dotClass}`} />
            <span className="font-bold text-slate-800 dark:text-white">{fullName}</span>
          </div>
        </td>
        <td className="min-w-[180px] py-3.5 px-3 text-xs">
          <span className="font-semibold text-slate-800 dark:text-slate-100 block">{posFull}</span>
          <span className="text-slate-400 block mt-0.5">{p.position_type || ''}</span>
        </td>
        <td className="min-w-[150px] py-3.5 px-3 text-xs text-slate-600 dark:text-slate-300">
          {workGroupText}
        </td>
        <td className="w-28 text-center py-3.5 px-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          {!p.has_account ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleQuickCreateAccount(p);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 border border-amber-500/30 transition cursor-pointer shadow-2xs"
              title="คลิกเพื่อสร้างบัญชีผู้ใช้งานอัตโนมัติ"
            >
              <i className="fa-solid fa-user-plus text-[11px]" />
              <span>+ สร้างบัญชี</span>
            </button>
          ) : (
            <span className={`bma-badge inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${roleMeta.badgeClass}`}>
              {roleMeta.label}
            </span>
          )}
        </td>
        <td className="w-28 text-center py-3.5 px-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          <div className="inline-flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => openEdit(p)}
              title="แก้ไข"
              className="w-8 h-8 rounded-lg bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/50 text-sky-600 dark:text-sky-300 border border-sky-200 dark:border-sky-800 flex items-center justify-center"
            >
              <i className="fa-solid fa-pen text-xs" />
            </button>
            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => handleDelete(p)}
                title="ลบ"
                className="w-8 h-8 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 flex items-center justify-center"
              >
                <i className="fa-solid fa-trash text-xs" />
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  };

  let desktopSeq = 1;
  let mobileSeq = 1;
  const cleanNidPreview = form.national_id.replace(/\D/g, '');

  return (
    <AdminLayout
      title="ทะเบียนประวัติบุคลากร"
      subtitle="จัดการข้อมูลบุคลากร โครงสร้างสังกัด และนำเข้า-ส่งออก Excel"
      activePage="personnel"
      onRealtimeSync={() => loadData(true)}
    >
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handlePickImportFile} className="hidden" />

      <div className="pt-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md overflow-visible">
          {/* Floating Emerald Header (-mt-6) with ALL 4 Buttons */}
          <div className="-mt-6 mx-4 px-5 py-4 rounded-2xl bg-gradient-to-r from-[#00351B] via-[#00744B] to-[#00A368] text-white shadow-lg flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <i className="fa-solid fa-id-card text-lg" />
              <h2 className="font-extrabold text-sm sm:text-base">ทะเบียนประวัติบุคลากร ({filtered.length} คน)</h2>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={openCreate} className="px-3 py-1.5 rounded-xl bg-white text-[#00744B] text-xs font-extrabold shadow-xs">
                <i className="fa-solid fa-plus mr-1" />เพิ่มบุคลากร
              </button>
              <button type="button" onClick={() => { setImportRows([]); setImportModalOpen(true); }} className="px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold shadow-xs">
                <i className="fa-solid fa-file-import mr-1" />นำเข้า Excel
              </button>
              <button type="button" onClick={handleExportExcel} className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold shadow-xs">
                <i className="fa-solid fa-file-excel mr-1" />ส่งออก Excel
              </button>
              <button
                type="button"
                onClick={() => UIHelpers.exportTemplateWithValidationsExcel({ settings, templateRows: PersonnelModel.getExcelTemplateRows(), fileName: 'Template_นำเข้าบุคลากร_กทม' })}
                className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold"
              >
                <i className="fa-solid fa-file-arrow-down mr-1" />แม่แบบ ExcelJS
              </button>
            </div>
          </div>

          {/* Filters + Group By + Role Pastel Legend */}
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ค้นหาชื่อ-สกุล / ตำแหน่ง / สังกัด..."
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs w-64"
                />
                <select
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value)}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold"
                >
                  <option value="division">มุมมองที่ 1: สำนักงาน/กอง &gt; ส่วน/ฝ่าย</option>
                  <option value="group">มุมมองที่ 2: สำนักงาน/กอง &gt; ส่วน/ฝ่าย &gt; กลุ่มงาน</option>
                </select>
              </div>

              {/* Role Pastel Legend (personnel.html:190-195) */}
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                <span className="text-slate-400">สถานะบัญชี:</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                  <span className="w-2 h-2 rounded-full bg-rose-400" />SuperAdmin
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                  <span className="w-2 h-2 rounded-full bg-amber-300" />Admin
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />User
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-300">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />ยังไม่มีบัญชี
                </span>
              </div>
            </div>

            <OrgHierarchyFilter bureau={orgFilter.bureau} division={orgFilter.division} workGroup={orgFilter.workGroup} onChange={setOrgFilter} compact />

            {/* Count Banner */}
            <div className="flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 rounded-xl px-3.5 py-2">
              <span>
                <i className="fa-solid fa-users text-[#00744B] mr-1.5" />
                จำนวนบุคลากรที่แสดงผล: {filtered.length} คน
              </span>
              <span className="text-[11px] text-slate-400">คลิกที่แถวรายชื่อเพื่อดูข้อมูลโปรไฟล์บุคลากร</span>
            </div>
          </div>

          {loading ? (
            <div className="p-10 text-center text-slate-400">
              <i className="fa-solid fa-circle-notch fa-spin text-2xl text-[#00744B] mb-2" />
              <p className="text-sm font-semibold">กำลังโหลดทะเบียนบุคลากร...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">ไม่พบข้อมูลบุคลากร</div>
          ) : (
            <>
              {/* Desktop 6-Column Grouped Table (NO Pagination) */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-sm text-left bma-table">
                  <thead className="bg-slate-100 dark:bg-slate-800/90 text-xs uppercase font-extrabold tracking-wider text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="w-14 text-center py-3.5 px-3">ลำดับ</th>
                      <th className="min-w-[180px] py-3.5 px-3">ชื่อ-นามสกุล</th>
                      <th className="min-w-[180px] py-3.5 px-3">ตำแหน่ง</th>
                      <th className="min-w-[150px] py-3.5 px-3">กลุ่มงาน</th>
                      <th className="w-28 text-center py-3.5 px-3">ระดับบัญชี</th>
                      <th className="w-28 text-center py-3.5 px-3">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {Object.entries(grouped || {}).map(([bureauName, divisionsObj]) =>
                      Object.entries(divisionsObj || {}).map(([divisionName, content]) => {
                        const divCount = groupBy === 'group'
                          ? Object.values(content || {}).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0)
                          : (Array.isArray(content) ? content.length : 0);

                        return (
                          <React.Fragment key={`${bureauName}-${divisionName}`}>
                            <tr
                              style={{ backgroundColor: `${groupHeaderColor}18` }}
                              className="border-y border-slate-200 dark:border-slate-700"
                            >
                              <td
                                colSpan={6}
                                className="font-bold text-sm py-2.5 px-4"
                                style={{ color: groupHeaderColor, borderLeft: `4px solid ${groupHeaderColor}` }}
                              >
                                <i className="fa-solid fa-building-user mr-1.5" />
                                {bureauName || '-'} &gt; {divisionName || '-'} ({divCount} คน)
                              </td>
                            </tr>
                            {groupBy === 'group'
                              ? Object.entries(content || {}).map(([groupName, members]) => {
                                  const memberList = Array.isArray(members) ? members : [];
                                  return (
                                    <React.Fragment key={`${bureauName}-${divisionName}-${groupName}`}>
                                      <tr className="bg-slate-100/80 dark:bg-slate-800/50">
                                        <td colSpan={6} className="font-semibold text-xs py-2 pl-8 text-slate-700 dark:text-slate-200">
                                          <i className="fa-solid fa-layer-group mr-1.5 text-emerald-600" />
                                          กลุ่มงาน: {groupName || '-'} ({memberList.length} คน)
                                        </td>
                                      </tr>
                                      {memberList.map((p) => renderPersonRow(p, desktopSeq++))}
                                    </React.Fragment>
                                  );
                                })
                              : (Array.isArray(content) ? content : []).map((p) => renderPersonRow(p, desktopSeq++))}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile Grouped Cards */}
              <div className="lg:hidden p-3 space-y-3">
                {Object.entries(grouped || {}).map(([bureauName, divisionsObj]) =>
                  Object.entries(divisionsObj || {}).map(([divisionName, content]) => {
                    const divCount = groupBy === 'group'
                      ? Object.values(content || {}).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0)
                      : (Array.isArray(content) ? content.length : 0);
                    const flatMembers = groupBy === 'group'
                      ? Object.values(content || {}).flat()
                      : (Array.isArray(content) ? content : []);

                    return (
                      <div key={`m-${bureauName}-${divisionName}`} className="space-y-2">
                        <div
                          className="rounded-xl px-3.5 py-2 font-bold text-xs shadow-xs border-l-4"
                          style={{ backgroundColor: `${groupHeaderColor}18`, color: groupHeaderColor, borderLeftColor: groupHeaderColor }}
                        >
                          <i className="fa-solid fa-building-user mr-1.5" />
                          {bureauName || '-'} &gt; {divisionName || '-'} ({divCount} คน)
                        </div>
                        {flatMembers.map((p) => {
                          const seq = mobileSeq++;
                          const fullName = `${p.prefix || ''}${p.first_name || ''} ${p.last_name || ''}`.trim();
                          const posFull = UIHelpers.formatPosition(p.position_title, p.position_level, p.position_type);
                          const roleMeta = p.role_meta || PersonnelModel.getRolePastelMeta(p.account_role || 'User');
                          return (
                            <div
                              key={p.id}
                              onClick={() => setResumePerson(p)}
                              className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 p-4 shadow-xs space-y-2 text-xs cursor-pointer"
                            >
                              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-700">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded bg-slate-100 dark:bg-slate-700 font-extrabold text-[11px]">
                                    {seq}
                                  </span>
                                  <span className="font-extrabold text-slate-800 dark:text-white truncate">{fullName}</span>
                                </div>
                                {!p.has_account ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleQuickCreateAccount(p);
                                    }}
                                    className="px-2 py-1 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-bold text-[11px]"
                                  >
                                    + สร้างบัญชี
                                  </button>
                                ) : (
                                  <span className={`bma-badge px-2 py-0.5 rounded-full text-[11px] font-bold ${roleMeta.badgeClass}`}>
                                    {roleMeta.label}
                                  </span>
                                )}
                              </div>
                              <div className="flex justify-between gap-2">
                                <span className="text-slate-400">ตำแหน่ง</span>
                                <span className="font-semibold text-right">{posFull}</span>
                              </div>
                              <div className="flex justify-between gap-2">
                                <span className="text-slate-400">กลุ่มงาน</span>
                                <span className="font-semibold text-right">{p.work_group && p.work_group !== 'ไม่มี' ? p.work_group : '-'}</span>
                              </div>
                              <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <button type="button" onClick={() => openEdit(p)} className="px-3 py-1 rounded-xl bg-sky-50 text-sky-700 font-bold text-[11px]">
                                  <i className="fa-solid fa-pen mr-1" />แก้ไข
                                </button>
                                {isSuperAdmin && (
                                  <button type="button" onClick={() => handleDelete(p)} className="px-3 py-1 rounded-xl bg-rose-50 text-rose-600 font-bold text-[11px]">
                                    <i className="fa-solid fa-trash mr-1" />ลบ
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Smart Bulk Import Preview Modal (personnel.html:522-688) */}
      <ResponsiveModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title="นำเข้าข้อมูลบุคลากรจากไฟล์ Excel (Smart Bulk Import)"
        subtitle="ตรวจสอบข้อมูลตัวอย่างและสรุปสถานะก่อนยืนยันนำเข้าสู่ฐานข้อมูล"
        icon="fa-file-import"
        maxWidthClass="max-w-3xl"
        footer={
          <>
            <button type="button" onClick={() => setImportModalOpen(false)} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-semibold">ยกเลิก</button>
            <button type="button" disabled={importing || importRows.length === 0} onClick={handleConfirmImport} className="px-5 py-2 rounded-xl bg-[#00744B] hover:bg-[#005a3a] text-white text-sm font-bold disabled:opacity-50">
              {importing ? 'กำลังนำเข้า...' : `ยืนยันนำเข้า (${importStats.valid} รายการ)`}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-emerald-400 dark:border-emerald-700 rounded-2xl p-6 text-center bg-emerald-50/40 dark:bg-emerald-950/20 cursor-pointer hover:bg-emerald-50 transition"
          >
            <i className="fa-solid fa-cloud-arrow-up text-3xl text-[#00744B] mb-2" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">คลิกเพื่อเลือกไฟล์ Excel (.xlsx / .xls / .csv)</p>
            <p className="text-xs text-slate-400 mt-0.5">รองรับไฟล์แม่แบบ ExcelJS พร้อมระบบสร้างบัญชีผู้ใช้อัตโนมัติ</p>
          </div>

          {/* 4 KPI Summary Boxes */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <p className="text-[11px] font-bold text-slate-500">ทั้งหมดในไฟล์</p>
              <p className="text-xl font-extrabold text-slate-800 dark:text-white mt-0.5">{importStats.total}</p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
              <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">ถูกต้องสมบูรณ์</p>
              <p className="text-xl font-extrabold text-[#00744B] dark:text-emerald-300 mt-0.5">{importStats.valid}</p>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
              <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400">ปรับแก้อัตโนมัติ</p>
              <p className="text-xl font-extrabold text-amber-600 dark:text-amber-300 mt-0.5">{importStats.autoFix}</p>
            </div>
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800">
              <p className="text-[11px] font-bold text-rose-700 dark:text-rose-400">ข้อมูลผิดพลาด</p>
              <p className="text-xl font-extrabold text-rose-600 dark:text-rose-300 mt-0.5">{importStats.error}</p>
            </div>
          </div>

          {importRows.length > 0 && (
            <div className="overflow-x-auto max-h-64 border border-slate-200 dark:border-slate-700 rounded-xl">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    {Object.keys(importRows[0]).slice(0, 6).map((k) => <th key={k} className="px-3 py-2">{k}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {importRows.slice(0, 15).map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 font-mono text-slate-400">{i + 1}</td>
                      {Object.keys(importRows[0]).slice(0, 6).map((k) => <td key={k} className="px-3 py-1.5 truncate max-w-[140px]">{String(r[k] ?? '')}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </ResponsiveModal>

      {/* Add/Edit Modal */}
      <ResponsiveModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.id ? 'แก้ไขข้อมูลบุคลากร' : 'เพิ่มทะเบียนบุคลากรใหม่'}
        icon="fa-id-card"
        maxWidthClass="max-w-2xl"
        footer={
          <>
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-semibold">ยกเลิก</button>
            <button type="submit" form="formPersonnel" disabled={saving} className="px-5 py-2 rounded-xl bg-[#00744B] hover:bg-[#005a3a] text-white text-sm font-bold disabled:opacity-50">{saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}</button>
          </>
        }
      >
        <form id="formPersonnel" onSubmit={handleSave} className="space-y-3.5 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className="block text-xs font-bold mb-1">เลขประจำตัวประชาชน 13 หลัก *</label><input type="text" required maxLength={13} value={form.national_id} onChange={(e) => setForm({ ...form, national_id: e.target.value.replace(/\D/g, '') })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-mono text-sm" /></div>
            <div><label className="block text-xs font-bold mb-1">คำนำหน้า</label><select value={form.prefix} onChange={(e) => setForm({ ...form, prefix: e.target.value })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm">{(settings?.prefixes || ['นาย', 'นาง', 'นางสาว']).map((px) => <option key={px} value={px}>{px}</option>)}</select></div>
            <div><label className="block text-xs font-bold mb-1">ชื่อ *</label><input type="text" required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="block text-xs font-bold mb-1">นามสกุล *</label><input type="text" required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs font-bold mb-1">เบอร์โทรศัพท์</label><input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className="block text-xs font-bold mb-1">ประเภทตำแหน่ง</label><select value={form.position_type} onChange={(e) => setForm({ ...form, position_type: e.target.value, position_title: '', position_level: '' })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"><option value="">-- เลือก --</option>{posTypes.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
            <div><label className="block text-xs font-bold mb-1">ตำแหน่ง</label><select value={form.position_title} onChange={(e) => setForm({ ...form, position_title: e.target.value, position_level: '' })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"><option value="">-- เลือก --</option>{posTitles.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
            <div><label className="block text-xs font-bold mb-1">ระดับ</label><select value={form.position_level} onChange={(e) => setForm({ ...form, position_level: e.target.value })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"><option value="">-- เลือก --</option>{posLevels.map((l) => <option key={l} value={l}>{l}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className="block text-xs font-bold mb-1">สำนักงาน / กอง</label><select value={form.bureau} onChange={(e) => setForm({ ...form, bureau: e.target.value, division: '', work_group: '' })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"><option value="">-- เลือก --</option>{bureaus.map((b) => <option key={b} value={b}>{b}</option>)}</select></div>
            <div><label className="block text-xs font-bold mb-1">ส่วน / ฝ่าย</label><select value={form.division} onChange={(e) => setForm({ ...form, division: e.target.value, work_group: '' })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"><option value="">-- เลือก --</option>{divisions.map((d) => <option key={d} value={d}>{d}</option>)}</select></div>
            <div><label className="block text-xs font-bold mb-1">กลุ่มงาน</label><select value={form.work_group} onChange={(e) => setForm({ ...form, work_group: e.target.value })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"><option value="">-- เลือก --</option>{groups.map((g) => <option key={g} value={g}>{g}</option>)}</select></div>
          </div>
          {!form.id && (
            <div className="p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-2">
              <label className="inline-flex items-center gap-2 text-xs font-bold cursor-pointer">
                <input type="checkbox" checked={form.autoCreateAccount} onChange={(e) => setForm({ ...form, autoCreateAccount: e.target.checked })} />
                <span>สร้างบัญชีเข้าใช้งานอัตโนมัติ (รหัสผ่าน = 6 หลักท้ายเลขบัตรประชาชน)</span>
              </label>
              {form.autoCreateAccount && cleanNidPreview.length === 13 && (
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 text-xs font-mono flex flex-wrap items-center justify-between gap-2">
                  <span>Username: <strong className="text-[#00744B] dark:text-emerald-400">{cleanNidPreview}</strong></span>
                  <span>รหัสผ่านเริ่มต้น: <strong className="text-amber-600 dark:text-amber-400">{cleanNidPreview.slice(-6)}</strong></span>
                </div>
              )}
            </div>
          )}
        </form>
      </ResponsiveModal>

      {/* Full Resume Modal with Avatar Initials, Masked National ID & Footer Action Buttons */}
      <ResponsiveModal
        open={Boolean(resumePerson)}
        onClose={() => setResumePerson(null)}
        title={resumePerson ? `${resumePerson.prefix || ''}${resumePerson.first_name || ''} ${resumePerson.last_name || ''}`.trim() : ''}
        subtitle={resumePerson ? UIHelpers.formatPosition(resumePerson.position_title, resumePerson.position_level, resumePerson.position_type) : ''}
        icon="fa-address-card"
        maxWidthClass="max-w-lg"
        footer={
          resumePerson && (
            <>
              <button type="button" onClick={() => setResumePerson(null)} className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-bold">ปิดหน้าต่าง</button>
              {!resumePerson.has_account && (
                <button type="button" onClick={() => handleQuickCreateAccount(resumePerson)} className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold">
                  <i className="fa-solid fa-user-plus mr-1" />สร้างบัญชีอัตโนมัติ
                </button>
              )}
              <button type="button" onClick={() => { const p = resumePerson; setResumePerson(null); openEdit(p); }} className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold">
                <i className="fa-solid fa-pen mr-1" />แก้ไขข้อมูล
              </button>
              {isSuperAdmin && (
                <button type="button" onClick={() => handleDelete(resumePerson)} className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold">
                  <i className="fa-solid fa-trash mr-1" />ลบบุคลากร
                </button>
              )}
            </>
          )
        }
      >
        {resumePerson && (
          <div className="space-y-4">
            <div className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/60">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#00744B] to-[#00A368] text-white font-extrabold text-lg flex items-center justify-center shrink-0 shadow-sm">
                {getInitials(resumePerson)}
              </div>
              <div className="min-w-0">
                <p className="font-extrabold text-sm text-slate-800 dark:text-white truncate">
                  {`${resumePerson.prefix || ''}${resumePerson.first_name || ''} ${resumePerson.last_name || ''}`.trim()}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {UIHelpers.formatPosition(resumePerson.position_title, resumePerson.position_level, resumePerson.position_type)}
                </p>
                <div className="mt-1">
                  {resumePerson.has_account ? (
                    <span className={`bma-badge px-2.5 py-0.5 rounded-full text-[11px] font-bold ${PersonnelModel.getRolePastelMeta(resumePerson.account_role).badgeClass}`}>
                      มีบัญชีแล้ว ({resumePerson.account_role})
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
                      ยังไม่มีบัญชีผู้ใช้งาน
                    </span>
                  )}
                </div>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-800/70 rounded-xl p-4">
              <div><dt className="text-slate-400">เลขบัตรประชาชน (PDPA)</dt><dd className="font-mono font-bold mt-0.5">{maskNationalIdPDPA(resumePerson.national_id)}</dd></div>
              <div><dt className="text-slate-400">ประเภทตำแหน่ง</dt><dd className="font-bold mt-0.5">{resumePerson.position_type || '-'}</dd></div>
              <div><dt className="text-slate-400">องค์กร</dt><dd className="font-bold mt-0.5">{resumePerson.organization || 'กรุงเทพมหานคร'}</dd></div>
              <div><dt className="text-slate-400">สำนักงาน / กอง</dt><dd className="font-bold mt-0.5">{resumePerson.bureau || '-'}</dd></div>
              <div><dt className="text-slate-400">ส่วน / ฝ่าย</dt><dd className="font-bold mt-0.5">{resumePerson.division || '-'}</dd></div>
              <div><dt className="text-slate-400">กลุ่มงาน</dt><dd className="font-bold mt-0.5">{resumePerson.work_group && resumePerson.work_group !== 'ไม่มี' ? resumePerson.work_group : '-'}</dd></div>
              <div><dt className="text-slate-400">โทรศัพท์</dt><dd className="font-bold mt-0.5">{resumePerson.phone || '-'}</dd></div>
              <div><dt className="text-slate-400">อีเมล</dt><dd className="font-bold mt-0.5">{resumePerson.email || '-'}</dd></div>
            </dl>
          </div>
        )}
      </ResponsiveModal>
    </AdminLayout>
  );
}
