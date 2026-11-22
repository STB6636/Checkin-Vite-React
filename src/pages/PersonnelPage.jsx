import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AdminLayout } from '../components/layout/AdminLayout.jsx';
import { OrgHierarchyFilter } from '../components/common/OrgHierarchyFilter.jsx';
import { PaginationBar } from '../components/common/PaginationBar.jsx';
import { ResponsiveModal } from '../components/common/ResponsiveModal.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useSettings } from '../contexts/SettingsContext.jsx';
import { PersonnelModel } from '../models/PersonnelModel.js';
import { SettingsModel } from '../models/SettingsModel.js';
import { UIHelpers } from '../core/UIHelpers.js';

function maskNationalIdPDPA(rawId = '') {
  const digits = String(rawId || '').replace(/\D/g, '');
  if (digits.length !== 13) return rawId || '-';
  return `${digits[0]}-xxxx-xxxxx-${digits.slice(10, 12)}-${digits[12]}`;
}

const EMPTY_PERSON = {
  id: null, national_id: '', prefix: 'นาย', first_name: '', last_name: '',
  position_type: '', position_title: '', position_level: '',
  organization: 'กรุงเทพมหานคร', bureau: '', division: '', work_group: '',
  phone: '', email: '', autoCreateAccount: true,
};

/**
 * PersonnelPage — 100% Parity with legacy personnel.html (L129-688)
 * - Floating Emerald Header (-mt-6) with ALL 4 buttons (เพิ่มบุคลากร, นำเข้า Excel, ส่งออก Excel, แม่แบบ ExcelJS)
 * - Group By Dropdown + Role Pastel Legend (SuperAdmin / Admin / User)
 * - Smart Bulk Import Preview Modal (Dropzone + Preview Table before DB commit)
 * - PDPA National ID Masking on table + Full Resume Modal with footer Action buttons
 */
export default function PersonnelPage() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const fileInputRef = useRef(null);

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [orgFilter, setOrgFilter] = useState({ bureau: '', division: '', workGroup: '' });
  const [groupBy, setGroupBy] = useState('none');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

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
    const base = list.filter((p) => {
      if (orgFilter.bureau && p.bureau !== orgFilter.bureau) return false;
      if (orgFilter.division && p.division !== orgFilter.division) return false;
      if (orgFilter.workGroup && p.work_group !== orgFilter.workGroup) return false;
      if (q) {
        const hay = `${p.prefix || ''}${p.first_name || ''} ${p.last_name || ''} ${p.national_id || ''} ${p.position_title || ''} ${p.division || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (groupBy === 'division') return [...base].sort((a, b) => (a.division || '').localeCompare(b.division || ''));
    if (groupBy === 'group') return [...base].sort((a, b) => (a.work_group || '').localeCompare(b.work_group || ''));
    return base;
  }, [list, orgFilter, search, groupBy]);

  const paginated = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);
  useEffect(() => { setPage(1); }, [orgFilter, search, groupBy]);

  const posTypes = useMemo(() => SettingsModel.getUniquePositionTypes(settings), [settings]);
  const posTitles = useMemo(() => SettingsModel.getUniquePositionTitles(settings, form.position_type), [settings, form.position_type]);
  const posLevels = useMemo(() => SettingsModel.getUniquePositionLevels(settings, form.position_type, form.position_title), [settings, form.position_type, form.position_title]);
  const bureaus = useMemo(() => SettingsModel.getUniqueBureaus(settings), [settings]);
  const divisions = useMemo(() => SettingsModel.getUniqueDivisions(settings, form.bureau), [settings, form.bureau]);
  const groups = useMemo(() => SettingsModel.getUniqueGroups(settings, form.bureau, form.division), [settings, form.bureau, form.division]);

  const openCreate = () => {
    setForm({ ...EMPTY_PERSON, organization: settings?.organization_name || 'กรุงเทพมหานคร', bureau: user?.scope_bureau || settings?.bureau_name || '', division: user?.scope_division || '' });
    setModalOpen(true);
  };

  const openEdit = (p) => {
    setForm({
      id: p.id, national_id: p.national_id || '', prefix: p.prefix || 'นาย',
      first_name: p.first_name || '', last_name: p.last_name || '',
      position_type: p.position_type || '', position_title: p.position_title || '', position_level: p.position_level || '',
      organization: p.organization || 'กรุงเทพมหานคร', bureau: p.bureau || '', division: p.division || '', work_group: p.work_group || '',
      phone: p.phone || '', email: p.email || '', autoCreateAccount: false,
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        national_id: form.national_id.trim(), prefix: form.prefix,
        first_name: form.first_name.trim(), last_name: form.last_name.trim(),
        position_type: form.position_type, position_title: form.position_title, position_level: form.position_level,
        organization: form.organization, bureau: form.bureau, division: form.division, work_group: form.work_group,
        phone: form.phone, email: form.email,
      };
      const res = form.id ? await PersonnelModel.update(form.id, payload) : await PersonnelModel.create(payload, form.autoCreateAccount);
      if (res?.success === false) {
        await UIHelpers.alert('บันทึกไม่สำเร็จ', res.message || 'เกิดข้อผิดพลาด', 'error');
        return;
      }
      setModalOpen(false);
      UIHelpers.showToast(form.id ? 'อัปเดตข้อมูลบุคลากรแล้ว' : 'เพิ่มข้อมูลบุคลากรเรียบร้อยแล้ว', 'success');
      await loadData(true);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p) => {
    const name = `${p.prefix || ''}${p.first_name || ''} ${p.last_name || ''}`.trim();
    const ok = await UIHelpers.confirm('ลบข้อมูลบุคลากร', `ต้องการลบข้อมูลของ "${name}" ใช่หรือไม่?`, 'ลบข้อมูล', 'warning');
    if (!ok) return;
    const res = await PersonnelModel.delete(p.id);
    if (res?.success === false) { await UIHelpers.alert('ลบไม่สำเร็จ', res.message || 'เกิดข้อผิดพลาด', 'error'); return; }
    UIHelpers.showToast('ลบข้อมูลบุคลากรเรียบร้อยแล้ว', 'success');
    setResumePerson(null);
    await loadData(true);
  };

  const handleQuickCreateAccount = async (p) => {
    const res = await PersonnelModel.quickCreateAccount(p.id);
    if (res?.success) {
      UIHelpers.showToast(res.message || 'สร้างบัญชีผู้ใช้สำเร็จ', 'success');
      await loadData(true);
    } else {
      await UIHelpers.alert('ไม่สามารถสร้างบัญชีได้', res?.message || 'เกิดข้อผิดพลาด', 'warning');
    }
  };

  const handleExportExcel = async () => {
    const rows = filtered.map((p, idx) => ({
      'ลำดับ': idx + 1,
      'คำนำหน้า': p.prefix || '',
      'ชื่อ': p.first_name || '',
      'นามสกุล': p.last_name || '',
      'ตำแหน่ง': UIHelpers.formatPosition(p.position_title, p.position_level, p.position_type),
      'สำนัก/กอง': p.bureau || '',
      'ส่วน/ฝ่าย': p.division || '',
      'กลุ่มงาน': p.work_group || '',
      'โทรศัพท์': p.phone || '',
    }));
    await UIHelpers.exportToExcelUTF8(rows, 'ทะเบียนประวัติบุคลากร', 'บุคลากร');
    UIHelpers.showToast('ส่งออกไฟล์ Excel เรียบร้อยแล้ว', 'success');
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
      await UIHelpers.alert(res?.success ? 'นำเข้าข้อมูลเรียบร้อยแล้ว' : 'ผลการนำเข้า', res?.message || `ประมวลผล ${importRows.length} แถว`, res?.success ? 'success' : 'warning');
      await loadData(true);
    } finally {
      setImporting(false);
    }
  };

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
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่อ-สกุล / ตำแหน่ง / สังกัด..." className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs w-64" />
                <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold">
                  <option value="none">จัดกลุ่ม: ไม่จัดกลุ่ม</option>
                  <option value="division">จัดกลุ่ม: ตามส่วน/ฝ่าย</option>
                  <option value="group">จัดกลุ่ม: ตามกลุ่มงาน</option>
                </select>
              </div>

              {/* Role Pastel Legend (personnel.html:190-195) */}
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                <span className="text-slate-400">สีป้ายสิทธิ์:</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">SuperAdmin</span>
                <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">Admin</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">User</span>
              </div>
            </div>
            <OrgHierarchyFilter bureau={orgFilter.bureau} division={orgFilter.division} workGroup={orgFilter.workGroup} onChange={setOrgFilter} compact />
          </div>

          {loading ? (
            <div className="p-10 text-center text-slate-400"><i className="fa-solid fa-circle-notch fa-spin text-2xl text-[#00744B] mb-2" /><p className="text-sm font-semibold">กำลังโหลดทะเบียนบุคลากร...</p></div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">ไม่พบข้อมูลบุคลากร</div>
          ) : (
            <>
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-sm text-left bma-table">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="px-4 py-3 w-12 text-center">ลำดับ</th>
                      <th className="px-4 py-3">ชื่อ-สกุล / เลขบัตร (PDPA)</th>
                      <th className="px-4 py-3">ตำแหน่ง / ระดับ</th>
                      <th className="px-4 py-3">สังกัด</th>
                      <th className="px-4 py-3 text-center">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {paginated.map((p, idx) => {
                      const fullName = `${p.prefix || ''}${p.first_name || ''} ${p.last_name || ''}`.trim();
                      const pos = UIHelpers.formatPosition(p.position_title, p.position_level, p.position_type);
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-3 text-center text-xs font-mono text-slate-400">{(page - 1) * pageSize + idx + 1}</td>
                          <td className="px-4 py-3">
                            <button type="button" onClick={() => setResumePerson(p)} className="font-bold text-slate-800 dark:text-white hover:text-[#00744B] text-left">{fullName}</button>
                            <p className="text-xs font-mono text-slate-400">{maskNationalIdPDPA(p.national_id)}</p>
                          </td>
                          <td className="px-4 py-3 text-xs"><p className="font-semibold">{pos}</p><p className="text-slate-400">{p.position_type || '-'}</p></td>
                          <td className="px-4 py-3 text-xs"><p className="font-semibold">{p.division || '-'}</p><p className="text-slate-400">{p.work_group || p.bureau || '-'}</p></td>
                          <td className="px-4 py-3 text-center">
                            <div className="inline-flex gap-1.5">
                              <button type="button" onClick={() => handleQuickCreateAccount(p)} title="สร้างบัญชีผู้ใช้ด่วน" className="w-8 h-8 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 flex items-center justify-center"><i className="fa-solid fa-user-plus text-xs" /></button>
                              <button type="button" onClick={() => openEdit(p)} title="แก้ไข" className="w-8 h-8 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 flex items-center justify-center"><i className="fa-solid fa-pen text-xs" /></button>
                              <button type="button" onClick={() => handleDelete(p)} title="ลบ" className="w-8 h-8 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 flex items-center justify-center"><i className="fa-solid fa-trash text-xs" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="lg:hidden divide-y divide-slate-200 dark:divide-slate-800">
                {paginated.map((p) => (
                  <div key={p.id} onClick={() => setResumePerson(p)} className="p-4 flex items-center justify-between gap-2 cursor-pointer">
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate">{`${p.prefix || ''}${p.first_name || ''} ${p.last_name || ''}`.trim()}</p>
                      <p className="text-xs text-slate-500 truncate">{UIHelpers.formatPosition(p.position_title, p.position_level, p.position_type)}</p>
                      <p className="text-[11px] text-slate-400 truncate">{p.division || '-'}</p>
                    </div>
                    <i className="fa-solid fa-chevron-right text-xs text-slate-400" />
                  </div>
                ))}
              </div>

              <PaginationBar totalItems={filtered.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} />
            </>
          )}
        </div>
      </div>

      {/* Smart Bulk Import Preview Modal (personnel.html:522-688) */}
      <ResponsiveModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title="นำเข้าข้อมูลบุคลากรจากไฟล์ Excel (Smart Bulk Import)"
        subtitle="ตรวจสอบข้อมูลตัวอย่างก่อนยืนยันนำเข้าสู่ฐานข้อมูล"
        icon="fa-file-import"
        maxWidthClass="max-w-3xl"
        footer={
          <>
            <button type="button" onClick={() => setImportModalOpen(false)} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-semibold">ยกเลิก</button>
            <button type="button" disabled={importing || importRows.length === 0} onClick={handleConfirmImport} className="px-5 py-2 rounded-xl bg-[#00744B] hover:bg-[#005a3a] text-white text-sm font-bold disabled:opacity-50">
              {importing ? 'กำลังนำเข้า...' : `ยืนยันนำเข้า (${importRows.length} แถว)`}
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
            <label className="inline-flex items-center gap-2 text-xs font-bold cursor-pointer">
              <input type="checkbox" checked={form.autoCreateAccount} onChange={(e) => setForm({ ...form, autoCreateAccount: e.target.checked })} />
              <span>สร้างบัญชีเข้าใช้งานอัตโนมัติ (รหัสผ่าน = 6 หลักท้ายเลขบัตรประชาชน)</span>
            </label>
          )}
        </form>
      </ResponsiveModal>

      {/* Full Resume Modal with Footer Action Buttons */}
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
              <button type="button" onClick={() => handleQuickCreateAccount(resumePerson)} className="px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"><i className="fa-solid fa-user-plus mr-1" />สร้างบัญชี</button>
              <button type="button" onClick={() => { const p = resumePerson; setResumePerson(null); openEdit(p); }} className="px-3.5 py-2 rounded-xl bg-amber-500 text-white text-xs font-bold"><i className="fa-solid fa-pen mr-1" />แก้ไข</button>
              <button type="button" onClick={() => handleDelete(resumePerson)} className="px-3.5 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold"><i className="fa-solid fa-trash mr-1" />ลบ</button>
            </>
          )
        }
      >
        {resumePerson && (
          <dl className="grid grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-800/70 rounded-xl p-4">
            <div><dt className="text-slate-400">เลขบัตรประชาชน (PDPA)</dt><dd className="font-mono font-bold mt-0.5">{maskNationalIdPDPA(resumePerson.national_id)}</dd></div>
            <div><dt className="text-slate-400">ประเภทตำแหน่ง</dt><dd className="font-bold mt-0.5">{resumePerson.position_type || '-'}</dd></div>
            <div><dt className="text-slate-400">องค์กร</dt><dd className="font-bold mt-0.5">{resumePerson.organization || 'กรุงเทพมหานคร'}</dd></div>
            <div><dt className="text-slate-400">สำนัก/กอง</dt><dd className="font-bold mt-0.5">{resumePerson.bureau || '-'}</dd></div>
            <div><dt className="text-slate-400">ส่วน/ฝ่าย</dt><dd className="font-bold mt-0.5">{resumePerson.division || '-'}</dd></div>
            <div><dt className="text-slate-400">กลุ่มงาน</dt><dd className="font-bold mt-0.5">{resumePerson.work_group || '-'}</dd></div>
            <div><dt className="text-slate-400">โทรศัพท์</dt><dd className="font-bold mt-0.5">{resumePerson.phone || '-'}</dd></div>
            <div><dt className="text-slate-400">อีเมล</dt><dd className="font-bold mt-0.5">{resumePerson.email || '-'}</dd></div>
          </dl>
        )}
      </ResponsiveModal>
    </AdminLayout>
  );
}
