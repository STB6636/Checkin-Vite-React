import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminLayout } from '../components/layout/AdminLayout.jsx';
import { OrgHierarchyFilter } from '../components/common/OrgHierarchyFilter.jsx';
import { ResponsiveModal } from '../components/common/ResponsiveModal.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useSettings } from '../contexts/SettingsContext.jsx';
import { UserModel } from '../models/UserModel.js';
import { PersonnelModel } from '../models/PersonnelModel.js';
import { SettingsModel } from '../models/SettingsModel.js';
import { UIHelpers } from '../core/UIHelpers.js';

const HEADER_PURPLE = '#6F42C1';

const EMPTY_FORM = {
  id: null,
  personnel_id: '',
  username: '',
  password: '',
  confirmPassword: '',
  full_name: '',
  national_id: '',
  role: 'User',
  visibility_level: 'division',
  scope_bureau: '',
  scope_division: '',
  is_active: true,
};

function getUserScopeDescription(u) {
  if (!u) return 'เฉพาะบันทึกเวลาตนเอง';
  if (u.role === 'SuperAdmin' || u.visibility_level === 'all') {
    return 'ทุกหน่วยงาน / ทุกสังกัด';
  }
  if (u.role === 'Admin') {
    if (u.visibility_level === 'bureau') {
      return `ระดับสำนักงาน/กอง: ${u.allowed_bureau || u.scope_bureau || u.bureau || u.personnel?.bureau || '-'}`;
    }
    return `ระดับส่วน/ฝ่าย: ${u.allowed_division || u.scope_division || u.division || u.personnel?.division || '-'}`;
  }
  return 'เฉพาะบันทึกเวลาตนเอง';
}

/**
 * UsersPage — 100% Parity with legacy users.html & UsersController.js
 */
export default function UsersPage() {
  const { user, isSuperAdmin } = useAuth();
  const { settings } = useSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const importUsersRef = useRef(null);

  const [activeTab, setActiveTab] = useState(
    searchParams.get('tab') === 'password-resets' ? 'password-resets' : 'users'
  );
  useEffect(() => {
    const qTab = searchParams.get('tab');
    if (qTab === 'password-resets') setActiveTab('password-resets');
    else if (qTab === 'users') setActiveTab('users');
  }, [searchParams]);

  const [users, setUsers] = useState([]);
  const [personnelList, setPersonnelList] = useState([]);
  const [resetRequests, setResetRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const [orgFilter, setOrgFilter] = useState({ bureau: '', division: '', workGroup: '' });
  const [roleFilter, setRoleFilter] = useState('all');
  const [groupBy, setGroupBy] = useState('division'); // 'division' | 'group'
  const [search, setSearch] = useState('');
  const [resetSearch, setResetSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [personnelFilterText, setPersonnelFilterText] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    try {
      const [uList, pList, resets] = await Promise.all([
        UserModel.getAll(user),
        PersonnelModel.getAll(user),
        UserModel.getPendingPasswordResetRequests(user),
      ]);
      setUsers(Array.isArray(uList) ? uList : []);
      setPersonnelList(Array.isArray(pList) ? pList : []);
      setResetRequests(Array.isArray(resets) ? resets : []);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadData(false); }, [loadData]);

  const normalizedUsers = useMemo(() => {
    return users.map((u) => {
      const p = u.personnel || {};
      return {
        ...u,
        bureau: p.bureau || u.scope_bureau || 'ไม่ระบุสำนักงาน/กอง',
        division: p.division || u.scope_division || 'ไม่ระบุส่วน/ฝ่าย',
        work_group: p.work_group || u.work_group || 'ไม่ระบุกลุ่มงาน',
      };
    });
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return normalizedUsers.filter((u) => {
      if (orgFilter.bureau && u.bureau !== orgFilter.bureau) return false;
      if (orgFilter.division && u.division !== orgFilter.division) return false;
      if (orgFilter.workGroup && u.work_group !== orgFilter.workGroup) return false;
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (q) {
        const hay = `${u.full_name || ''} ${u.username || ''} ${u.national_id || ''} ${u.bureau || ''} ${u.division || ''} ${u.role || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [normalizedUsers, orgFilter, roleFilter, search]);

  const groupedUsers = useMemo(
    () => PersonnelModel.groupPersonnel(filteredUsers, groupBy),
    [filteredUsers, groupBy]
  );

  const filteredResets = useMemo(() => {
    const q = resetSearch.trim().toLowerCase();
    if (!q) return resetRequests;
    return resetRequests.filter((r) =>
      `${r.full_name || ''} ${r.username || ''} ${r.national_id || ''} ${r.personnel?.division || r.scope_division || ''}`
        .toLowerCase()
        .includes(q)
    );
  }, [resetRequests, resetSearch]);

  const filteredPersonnelOptions = useMemo(() => {
    const q = personnelFilterText.trim().toLowerCase();
    if (!q) return personnelList;
    return personnelList.filter((p) => {
      const name = `${p.prefix || ''}${p.first_name || ''} ${p.last_name || ''}`.toLowerCase();
      const nid = String(p.national_id || '').toLowerCase();
      const div = String(p.division || '').toLowerCase();
      return name.includes(q) || nid.includes(q) || div.includes(q);
    });
  }, [personnelList, personnelFilterText]);

  const bureaus = useMemo(() => SettingsModel.getUniqueBureaus(settings), [settings]);
  const formDivisions = useMemo(() => SettingsModel.getUniqueDivisions(settings, form.scope_bureau), [settings, form.scope_bureau]);

  const openCreateModal = () => {
    setPersonnelFilterText('');
    setForm({
      ...EMPTY_FORM,
      scope_bureau: !isSuperAdmin ? (user?.scope_bureau || '') : (settings?.bureau_name || ''),
      scope_division: !isSuperAdmin ? (user?.scope_division || '') : '',
    });
    setModalOpen(true);
  };

  const openEditModal = (u) => {
    if (!isSuperAdmin) return;
    setPersonnelFilterText('');
    setForm({
      id: u.id,
      personnel_id: u.personnel_id || '',
      username: u.username || '',
      password: '',
      confirmPassword: '',
      full_name: u.full_name || '',
      national_id: u.national_id || u.personnel?.national_id || '',
      role: u.role || 'User',
      visibility_level: u.visibility_level === 'bureau' ? 'bureau' : 'division',
      scope_bureau: u.scope_bureau || u.personnel?.bureau || '',
      scope_division: u.scope_division || u.personnel?.division || '',
      is_active: u.is_active !== false,
    });
    setModalOpen(true);
  };

  const handlePersonnelSelect = (pid) => {
    const person = personnelList.find((p) => String(p.id) === String(pid));
    if (!person) {
      setForm((prev) => ({ ...prev, personnel_id: pid }));
      return;
    }
    const fullName = `${person.prefix || ''}${person.first_name || ''} ${person.last_name || ''}`.trim();
    const autoPwd = UIHelpers.getLast6DigitsFromNationalId(person.national_id || '');
    setForm((prev) => ({
      ...prev,
      personnel_id: person.id,
      full_name: fullName,
      national_id: person.national_id || prev.national_id,
      username: prev.id ? prev.username : (person.national_id || prev.username),
      password: prev.id ? prev.password : autoPwd,
      confirmPassword: prev.id ? prev.confirmPassword : autoPwd,
      scope_bureau: person.bureau || prev.scope_bureau,
      scope_division: person.division || prev.scope_division,
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (form.password.trim() && form.password.trim() !== form.confirmPassword.trim()) {
      await UIHelpers.alert('รหัสผ่านไม่ตรงกัน', 'กรุณากรอกรหัสผ่านและยืนยันรหัสผ่านให้ตรงกัน', 'warning');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        personnel_id: form.personnel_id || null,
        username: form.username.trim(),
        full_name: form.full_name.trim(),
        national_id: form.national_id.trim(),
        role: isSuperAdmin ? form.role : (form.role === 'SuperAdmin' ? 'Admin' : form.role),
        visibility_level:
          form.role === 'SuperAdmin'
            ? 'all'
            : form.role === 'Admin'
            ? (form.visibility_level === 'bureau' ? 'bureau' : 'division')
            : 'none',
        scope_bureau: form.scope_bureau || null,
        scope_division: form.visibility_level === 'bureau' ? '' : (form.scope_division || null),
        is_active: form.is_active,
      };
      if (form.password.trim()) {
        payload.password = form.password.trim();
        payload.confirm_password = form.confirmPassword.trim();
      }
      const res = form.id
        ? await UserModel.update(form.id, payload, user)
        : await UserModel.create(payload, user);
      if (res?.success === false) {
        await UIHelpers.alert('ไม่สามารถบันทึกได้', res.message || 'เกิดข้อผิดพลาด', 'error');
        return;
      }
      setModalOpen(false);
      UIHelpers.showToast(form.id ? 'อัปเดตบัญชีผู้ใช้งานแล้ว' : 'สร้างบัญชีผู้ใช้งานเรียบร้อยแล้ว', 'success');
      await loadData(true);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (u) => {
    if (!isSuperAdmin) return;
    const ok = await UIHelpers.confirm('ลบบัญชีผู้ใช้งาน', `ต้องการลบบัญชี "${u.full_name || u.username}" ใช่หรือไม่?`, 'ลบบัญชี', 'warning');
    if (!ok) return;
    const res = await UserModel.delete(u.id, user);
    if (res?.success === false) {
      await UIHelpers.alert('ลบไม่สำเร็จ', res.message || 'ไม่มีสิทธิ์ลบรายการนี้', 'error');
      return;
    }
    UIHelpers.showToast('ลบบัญชีผู้ใช้งานแล้ว', 'success');
    await loadData(true);
  };

  const handleResetDecision = async (reqUser, approve) => {
    const ok = await UIHelpers.confirm(
      approve ? 'อนุมัติรีเซ็ตรหัสผ่าน' : 'ปฏิเสธคำขอรีเซ็ตรหัสผ่าน',
      approve
        ? `อนุมัติรีเซ็ตรหัสผ่านของ "${reqUser.full_name}" เป็นเลขท้าย 6 หลักของบัตรประชาชน?`
        : `ปฏิเสธคำขอของ "${reqUser.full_name}"?`,
      approve ? 'อนุมัติรีเซ็ต' : 'ไม่อนุมัติ',
      approve ? 'question' : 'warning'
    );
    if (!ok) return;
    const res = await UserModel.processPasswordResetRequest(reqUser.id, approve, user);
    if (res?.success) {
      await loadData(true);
      const resetPwd = res.resetPassword || res.resetPasswordTo;
      if (approve && resetPwd) {
        await UIHelpers.alert(
          'อนุมัติรีเซ็ตรหัสผ่านสำเร็จ',
          res.message || `รหัสผ่านใหม่คือ: ${resetPwd}`,
          'success'
        );
      } else {
        UIHelpers.showToast(res.message || 'ดำเนินการเรียบร้อยแล้ว', 'success');
      }
    } else {
      await UIHelpers.alert('เกิดข้อผิดพลาด', res?.message || 'ไม่สามารถดำเนินการได้', 'error');
    }
  };

  const handleExportUsersExcel = async () => {
    const rows = filteredUsers.map((u, idx) => ({
      'ลำดับ': idx + 1,
      'ชื่อบัญชีผู้ใช้ (Username)': u.username || '-',
      'ชื่อ-นามสกุล': u.full_name || '-',
      'เลขบัตรประชาชน': u.national_id || u.personnel?.national_id || '-',
      'บทบาท (Role)': u.role || 'User',
      'ระดับการมองเห็น': u.visibility_level || 'none',
      'ขอบเขตสำนักงาน/กอง': u.scope_bureau || u.personnel?.bureau || '-',
      'ขอบเขตส่วน/ฝ่าย': u.scope_division || u.personnel?.division || '-',
    }));
    await UIHelpers.exportToExcelUTF8(rows, `บัญชีผู้ใช้งานระบบ_${UIHelpers.getTodayISO()}`, 'Users');
    UIHelpers.showToast('ส่งออกไฟล์ Excel บัญชีผู้ใช้งานเรียบร้อยแล้ว', 'success');
  };

  const handleImportUsersExcel = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      UIHelpers.showLoading('กำลังนำเข้าบัญชีผู้ใช้งานจาก Excel...');
      const rows = await UIHelpers.parseExcelFileUTF8(file);
      const res = await UserModel.bulkImportFromExcel(rows, user);
      UIHelpers.hideLoading();
      await UIHelpers.alert(
        res?.success ? 'นำเข้าบัญชีสำเร็จ' : 'ผลการนำเข้า',
        res?.message || `ประมวลผล ${rows.length} แถว`,
        res?.success ? 'success' : 'warning'
      );
      await loadData(true);
    } catch (err) {
      UIHelpers.hideLoading();
      await UIHelpers.alert('นำเข้าไม่สำเร็จ', err?.message || 'ไฟล์ Excel ไม่ถูกต้อง', 'error');
    }
  };

  const switchTab = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
  };

  const totalCols = isSuperAdmin ? 6 : 5;
  let desktopSeq = 1;
  let mobileSeq = 1;

  const renderUserRow = (u, seq) => {
    const meta = PersonnelModel.getRolePastelMeta(u.role);
    const scopeText = getUserScopeDescription(u);
    return (
      <tr key={u.id} className="hover:bg-purple-50/30 dark:hover:bg-slate-800/40 transition-colors">
        <td className="w-14 text-center py-3.5 px-3 text-xs font-semibold text-slate-500">{seq}</td>
        <td className="min-w-[150px] py-3.5 px-3 font-mono font-bold text-slate-800 dark:text-white">
          {u.username}
        </td>
        <td className="min-w-[180px] py-3.5 px-3">
          <div className="font-bold text-slate-800 dark:text-white">{u.full_name || '-'}</div>
          <div className="text-[11px] text-slate-400 font-mono">
            เลขบัตร: {u.national_id || u.personnel?.national_id || '-'}
          </div>
        </td>
        <td className="w-32 text-center py-3.5 px-3">
          <span className={`bma-badge inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${meta?.badgeClass || 'bg-slate-100 text-slate-700'}`}>
            {u.role}
          </span>
        </td>
        <td className="min-w-[160px] py-3.5 px-3 text-xs text-slate-600 dark:text-slate-300 font-medium">
          {scopeText}
        </td>
        {isSuperAdmin && (
          <td className="w-28 text-center py-3.5 px-3 whitespace-nowrap">
            <div className="inline-flex gap-1.5">
              <button
                type="button"
                onClick={() => openEditModal(u)}
                title="แก้ไขบัญชี"
                className="w-8 h-8 rounded-lg bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/50 text-sky-600 dark:text-sky-300 border border-sky-200 dark:border-sky-800 flex items-center justify-center"
              >
                <i className="fa-solid fa-pen text-xs" />
              </button>
              <button
                type="button"
                onClick={() => handleDelete(u)}
                title="ลบบัญชี"
                className="w-8 h-8 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 flex items-center justify-center"
              >
                <i className="fa-solid fa-trash text-xs" />
              </button>
            </div>
          </td>
        )}
      </tr>
    );
  };

  return (
    <AdminLayout
      title="จัดการบัญชีผู้ใช้งาน"
      subtitle="กำหนดสิทธิ์การเข้าถึง (RBAC) และอนุมัติคำขอรีเซ็ตรหัสผ่าน"
      activePage="users"
      onRealtimeSync={() => loadData(true)}
    >
      <input ref={importUsersRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImportUsersExcel} className="hidden" />

      {/* Top 2-Tab Switcher */}
      <div className="flex flex-wrap gap-2 mb-7">
        <button
          type="button"
          onClick={() => switchTab('users')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 transition shadow-xs ${
            activeTab === 'users'
              ? 'bg-gradient-to-r from-[#480080] to-[#7C3AED] text-white'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
          }`}
        >
          <i className="fa-solid fa-users" />
          <span>บัญชีผู้ใช้งานทั้งหมด</span>
          <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px]">{users.length}</span>
        </button>
        <button
          type="button"
          onClick={() => switchTab('password-resets')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 transition shadow-xs ${
            activeTab === 'password-resets'
              ? 'bg-gradient-to-r from-[#D97706] to-[#FFB449] text-white'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
          }`}
        >
          <i className="fa-solid fa-key" />
          <span>คำขอรีเซ็ตรหัสผ่าน</span>
          {resetRequests.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px]">{resetRequests.length}</span>
          )}
        </button>
      </div>

      {activeTab === 'users' ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md overflow-visible">
          {/* Tab 1: Floating Imperial Purple Header (#480080 -> #7C3AED) with ALL 4 Buttons */}
          <div className="-mt-5 mx-4 px-5 py-4 rounded-2xl bg-gradient-to-r from-[#480080] to-[#7C3AED] text-white shadow-lg flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <i className="fa-solid fa-users-gear text-lg" />
              <h2 className="font-extrabold text-sm sm:text-base">บัญชีผู้ใช้งานระบบ ({filteredUsers.length} บัญชี)</h2>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={openCreateModal} className="px-3 py-1.5 rounded-xl bg-white text-purple-900 text-xs font-extrabold shadow-xs">
                <i className="fa-solid fa-user-plus mr-1" />เพิ่มบัญชีผู้ใช้งาน
              </button>
              <button type="button" onClick={() => importUsersRef.current?.click()} className="px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold shadow-xs">
                <i className="fa-solid fa-file-import mr-1" />นำเข้า Excel
              </button>
              <button
                type="button"
                onClick={handleExportUsersExcel}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs"
              >
                <i className="fa-solid fa-file-excel mr-1" />ส่งออก Excel
              </button>
              <button
                type="button"
                onClick={() => UIHelpers.exportToExcelUTF8(UserModel.getExcelTemplateRows(), 'Template_นำเข้าบัญชีผู้ใช้งาน', 'Template')}
                className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold"
              >
                <i className="fa-solid fa-file-arrow-down mr-1" />Template Excel
              </button>
            </div>
          </div>

          <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-5">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ค้นหาชื่อ / Username / เลขบัตรประชาชน..."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs"
                />
              </div>
              <div className="md:col-span-3">
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold"
                >
                  <option value="all">ทุกบทบาท (Role)</option>
                  {isSuperAdmin && <option value="SuperAdmin">SuperAdmin</option>}
                  <option value="Admin">Admin</option>
                  <option value="User">User</option>
                </select>
              </div>
              <div className="md:col-span-4">
                <select
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold"
                >
                  <option value="division">มุมมองที่ 1: สำนักงาน/กอง &gt; ส่วน/ฝ่าย</option>
                  <option value="group">มุมมองที่ 2: สำนักงาน/กอง &gt; ส่วน/ฝ่าย &gt; กลุ่มงาน</option>
                </select>
              </div>
            </div>

            <OrgHierarchyFilter bureau={orgFilter.bureau} division={orgFilter.division} workGroup={orgFilter.workGroup} onChange={setOrgFilter} compact />

            {/* Count Banner */}
            <div className="flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300 bg-purple-50/50 dark:bg-slate-800/60 rounded-xl px-3.5 py-2">
              <span>
                <i className="fa-solid fa-user-shield text-purple-600 mr-1.5" />
                จำนวนบัญชีผู้ใช้งานที่แสดงผล: {filteredUsers.length} บัญชี
              </span>
            </div>
          </div>

          {loading ? (
            <div className="p-10 text-center text-slate-400">
              <i className="fa-solid fa-circle-notch fa-spin text-2xl text-purple-600 mb-2" />
              <p className="text-sm font-semibold">กำลังโหลดบัญชีผู้ใช้งาน...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">ไม่พบบัญชีผู้ใช้งานตามเงื่อนไข</div>
          ) : (
            <>
              {/* Desktop 6-Column Grouped Table (NO Pagination) */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-sm text-left bma-table">
                  <thead className="bg-slate-100 dark:bg-slate-800/90 text-xs uppercase font-extrabold tracking-wider text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="w-14 text-center py-3.5 px-3">ลำดับ</th>
                      <th className="min-w-[150px] py-3.5 px-3">ชื่อบัญชี (Username)</th>
                      <th className="min-w-[180px] py-3.5 px-3">ชื่อ-นามสกุล (บุคลากรที่ผูก)</th>
                      <th className="w-32 text-center py-3.5 px-3">ระดับสิทธิ์ (Role)</th>
                      <th className="min-w-[160px] py-3.5 px-3">ขอบเขตการมองเห็น</th>
                      {isSuperAdmin && <th className="w-28 text-center py-3.5 px-3">จัดการ</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {Object.entries(groupedUsers || {}).map(([bureauName, divisionsObj]) =>
                      Object.entries(divisionsObj || {}).map(([divisionName, content]) => {
                        const divCount = groupBy === 'group'
                          ? Object.values(content || {}).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0)
                          : (Array.isArray(content) ? content.length : 0);

                        return (
                          <React.Fragment key={`${bureauName}-${divisionName}`}>
                            <tr
                              style={{ backgroundColor: `${HEADER_PURPLE}18` }}
                              className="border-y border-slate-200 dark:border-slate-700"
                            >
                              <td
                                colSpan={totalCols}
                                className="font-bold text-sm py-2.5 px-4"
                                style={{ color: HEADER_PURPLE, borderLeft: `4px solid ${HEADER_PURPLE}` }}
                              >
                                <i className="fa-solid fa-building-user mr-1.5" />
                                {bureauName} &gt; {divisionName} ({divCount} บัญชี)
                              </td>
                            </tr>
                            {groupBy === 'group'
                              ? Object.entries(content || {}).map(([groupName, members]) => {
                                  const memberList = Array.isArray(members) ? members : [];
                                  return (
                                    <React.Fragment key={`${bureauName}-${divisionName}-${groupName}`}>
                                      <tr className="bg-slate-100/80 dark:bg-slate-800/50">
                                        <td colSpan={totalCols} className="font-semibold text-xs py-2 pl-8 text-slate-700 dark:text-slate-200">
                                          <i className="fa-solid fa-layer-group mr-1.5 text-emerald-600" />
                                          กลุ่มงาน: {groupName} ({memberList.length} บัญชี)
                                        </td>
                                      </tr>
                                      {memberList.map((u) => renderUserRow(u, desktopSeq++))}
                                    </React.Fragment>
                                  );
                                })
                              : (Array.isArray(content) ? content : []).map((u) => renderUserRow(u, desktopSeq++))}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile Grouped Cards */}
              <div className="lg:hidden p-3 space-y-3">
                {Object.entries(groupedUsers || {}).map(([bureauName, divisionsObj]) =>
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
                          style={{ backgroundColor: `${HEADER_PURPLE}18`, color: HEADER_PURPLE, borderLeftColor: HEADER_PURPLE }}
                        >
                          <i className="fa-solid fa-building-user mr-1.5" />
                          {bureauName} &gt; {divisionName} ({divCount} บัญชี)
                        </div>
                        {flatMembers.map((u) => {
                          const seq = mobileSeq++;
                          const meta = PersonnelModel.getRolePastelMeta(u.role);
                          return (
                            <div key={u.id} className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 space-y-2 text-xs shadow-xs">
                              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-700">
                                <div className="min-w-0">
                                  <p className="font-bold text-sm truncate">
                                    <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 mr-1.5 rounded bg-slate-100 dark:bg-slate-700 text-[11px] font-extrabold">
                                      {seq}
                                    </span>
                                    {u.full_name || '-'}
                                  </p>
                                  <p className="font-mono text-xs text-slate-500 mt-0.5">Username: {u.username}</p>
                                </div>
                                <span className={`bma-badge px-2.5 py-0.5 rounded-full text-xs font-bold ${meta?.badgeClass || ''}`}>
                                  {u.role}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500">
                                <div>เลขบัตร: <span className="font-mono">{u.national_id || u.personnel?.national_id || '-'}</span></div>
                                <div>ขอบเขต: <span className="font-semibold text-slate-700 dark:text-slate-200">{getUserScopeDescription(u)}</span></div>
                              </div>
                              {isSuperAdmin && (
                                <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-1.5">
                                  <button type="button" onClick={() => openEditModal(u)} className="px-3 py-1 rounded-xl bg-sky-50 text-sky-700 font-bold text-[11px]">
                                    <i className="fa-solid fa-pen mr-1" />แก้ไข
                                  </button>
                                  <button type="button" onClick={() => handleDelete(u)} className="px-3 py-1 rounded-xl bg-rose-50 text-rose-600 font-bold text-[11px]">
                                    <i className="fa-solid fa-trash mr-1" />ลบ
                                  </button>
                                </div>
                              )}
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
      ) : (
        /* Tab 2: Password Reset Requests 6-Column Table */
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md overflow-visible">
          <div className="-mt-5 mx-4 px-5 py-4 rounded-2xl bg-gradient-to-r from-[#D97706] to-[#FFB449] text-white shadow-lg flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <i className="fa-solid fa-key text-lg" />
              <h2 className="font-extrabold text-sm sm:text-base">คำขอรีเซ็ตรหัสผ่านที่รออนุมัติ ({filteredResets.length} รายการ)</h2>
            </div>
            <input
              type="text"
              value={resetSearch}
              onChange={(e) => setResetSearch(e.target.value)}
              placeholder="ค้นหาชื่อ / Username..."
              className="rounded-xl bg-white/95 text-slate-800 px-3 py-1.5 text-xs w-56"
            />
          </div>

          {filteredResets.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">ไม่มีคำขอเปลี่ยนรหัสผ่าน</div>
          ) : (
            <>
              <div className="hidden lg:block overflow-x-auto p-4">
                <table className="w-full text-sm text-left bma-table">
                  <thead className="bg-slate-100 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 text-xs uppercase font-extrabold tracking-wider text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="w-14 text-center py-3.5 px-3">ลำดับ</th>
                      <th className="min-w-[150px] py-3.5 px-3">ชื่อบัญชี (Username)</th>
                      <th className="min-w-[180px] py-3.5 px-3">ชื่อ-นามสกุล (บุคลากร)</th>
                      <th className="w-32 text-center py-3.5 px-3">ระดับสิทธิ์ (Role)</th>
                      <th className="min-w-[160px] py-3.5 px-3">ขอบเขตการมองเห็น</th>
                      <th className="w-40 text-center py-3.5 px-3">คำสั่งดำเนินการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredResets.map((req, idx) => {
                      const roleMeta = PersonnelModel.getRolePastelMeta(req.role);
                      return (
                        <tr key={req.id} className="bg-amber-50/20 dark:bg-amber-950/10">
                          <td className="w-14 text-center py-3.5 px-3 font-semibold text-xs text-slate-500">{idx + 1}</td>
                          <td className="min-w-[150px] py-3.5 px-3 font-mono font-bold text-slate-800 dark:text-white">
                            {req.username}
                          </td>
                          <td className="min-w-[180px] py-3.5 px-3">
                            <div className="font-bold text-slate-800 dark:text-white">{req.full_name || '-'}</div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              เลขบัตร: {req.national_id || req.personnel?.national_id || '-'}
                            </div>
                          </td>
                          <td className="w-32 text-center py-3.5 px-3">
                            <span className={`bma-badge inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${roleMeta.badgeClass}`}>
                              {req.role}
                            </span>
                          </td>
                          <td className="min-w-[160px] py-3.5 px-3 text-xs text-slate-600 dark:text-slate-300">
                            {getUserScopeDescription(req)}
                          </td>
                          <td className="w-40 text-center py-3.5 px-3 whitespace-nowrap">
                            <div className="inline-flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleResetDecision(req, true)}
                                className="py-1.5 px-3 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs"
                              >
                                <i className="fa-solid fa-check mr-1" />อนุมัติ
                              </button>
                              <button
                                type="button"
                                onClick={() => handleResetDecision(req, false)}
                                className="py-1.5 px-3 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-rose-300 dark:border-rose-800 rounded-lg"
                              >
                                <i className="fa-solid fa-xmark mr-1" />ไม่อนุมัติ
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="lg:hidden divide-y divide-slate-200 dark:divide-slate-800">
                {filteredResets.map((req, idx) => (
                  <div key={req.id} className="p-4 space-y-2.5 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-sm">{idx + 1}. {req.full_name || req.username}</p>
                        <p className="font-mono text-slate-500 mt-0.5">Username: {req.username}</p>
                        <p className="font-mono text-[11px] text-slate-400">เลขบัตร: {req.national_id || req.personnel?.national_id || '-'}</p>
                      </div>
                      <span className={`bma-badge px-2.5 py-0.5 rounded-full text-xs font-bold ${PersonnelModel.getRolePastelMeta(req.role).badgeClass}`}>
                        {req.role}
                      </span>
                    </div>
                    <p className="text-slate-500">{getUserScopeDescription(req)}</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => handleResetDecision(req, true)} className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold">
                        <i className="fa-solid fa-check mr-1" />อนุมัติ
                      </button>
                      <button type="button" onClick={() => handleResetDecision(req, false)} className="flex-1 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold">
                        <i className="fa-solid fa-xmark mr-1" />ไม่อนุมัติ
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Create / Edit User Account Modal (users.html:344-471) */}
      <ResponsiveModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.id ? 'แก้ไขบัญชีผู้ใช้งาน' : 'เพิ่มบัญชีผู้ใช้งานและผูกข้อมูลบุคลากร'}
        icon="fa-user-gear"
        maxWidthClass="max-w-xl"
        footer={
          <>
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-semibold">ยกเลิก</button>
            <button type="submit" form="formUser" disabled={saving} className="px-5 py-2 rounded-xl bg-[#480080] hover:bg-purple-900 text-white text-sm font-bold disabled:opacity-50">
              {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
            </button>
          </>
        }
      >
        <form id="formUser" onSubmit={handleSave} className="space-y-4 text-sm">
          {/* Personnel Search Filter + Dropdown */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5">
            <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-200">
              <i className="fa-solid fa-link mr-1 text-purple-600" />เชื่อมโยงข้อมูลจากทะเบียนบุคลากร
            </label>
            <input
              type="text"
              value={personnelFilterText}
              onChange={(e) => setPersonnelFilterText(e.target.value)}
              placeholder="พิมพ์ค้นหาชื่อ หรือ เลขบัตรประชาชน เพื่อกรองตัวเลือก..."
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs"
            />
            <select
              value={form.personnel_id}
              onChange={(e) => handlePersonnelSelect(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            >
              <option value="">-- เลือกบุคลากรในสังกัด ({filteredPersonnelOptions.length} คน) --</option>
              {filteredPersonnelOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {`${p.prefix || ''}${p.first_name || ''} ${p.last_name || ''}`.trim()} ({p.national_id || 'ไม่มีเลขบัตร'} • {p.division || '-'})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold mb-1">ชื่อ-นามสกุล *</label>
              <input
                type="text"
                required
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">เลขบัตรประชาชน (13 หลัก)</label>
              <input
                type="text"
                maxLength={13}
                value={form.national_id}
                onChange={(e) => setForm({ ...form, national_id: e.target.value.replace(/\D/g, '') })}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold mb-1">ชื่อบัญชีผู้ใช้งาน (Username) *</label>
            <input
              type="text"
              required
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-mono font-bold"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold mb-1">
                {form.id ? 'รหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)' : 'รหัสผ่าน (Password) *'}
              </label>
              <input
                type="text"
                required={!form.id}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">
                {form.id ? 'ยืนยันรหัสผ่านใหม่' : 'ยืนยันรหัสผ่าน *'}
              </label>
              <input
                type="text"
                required={!form.id || Boolean(form.password)}
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>

          {/* 3 Role Radio Cards */}
          <div>
            <label className="block text-xs font-extrabold mb-2">กำหนดระดับสิทธิ์ผู้ใช้งาน (Role) *</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {[
                {
                  key: 'User',
                  title: 'User (ทั่วไป)',
                  desc: 'ลงเวลาและดูประวัติเฉพาะตนเอง',
                  color: 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30',
                },
                {
                  key: 'Admin',
                  title: 'Admin (ผู้ดูแล)',
                  desc: 'ดูแลรายงานและอนุมัติตามขอบเขตสังกัด',
                  color: 'border-amber-500 bg-amber-50/60 dark:bg-amber-950/30',
                },
                ...(isSuperAdmin
                  ? [
                      {
                        key: 'SuperAdmin',
                        title: 'SuperAdmin',
                        desc: 'ผู้ดูแลระบบสูงสุด ทุกสังกัดและตั้งค่าระบบ',
                        color: 'border-rose-500 bg-rose-50/60 dark:bg-rose-950/30',
                      },
                    ]
                  : []),
              ].map((rc) => {
                const checked = form.role === rc.key;
                return (
                  <label
                    key={rc.key}
                    className={`p-3 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
                      checked ? rc.color : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="usrRoleRadio"
                        value={rc.key}
                        checked={checked}
                        onChange={() => setForm({ ...form, role: rc.key })}
                        className="accent-purple-700"
                      />
                      <span className="font-extrabold text-xs">{rc.title}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-snug">{rc.desc}</p>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Admin Visibility Scope Box */}
          {form.role === 'Admin' && (
            <div className="p-3.5 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 space-y-3">
              <div>
                <label className="block text-xs font-extrabold mb-1.5">ระดับขอบเขตการมองเห็นของ Admin</label>
                <div className="grid grid-cols-2 gap-2">
                  <label className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer ${form.visibility_level === 'division' ? 'border-amber-500 bg-white dark:bg-slate-900' : 'border-slate-200 dark:border-slate-700'}`}>
                    <input
                      type="radio"
                      name="usrVisLevel"
                      value="division"
                      checked={form.visibility_level === 'division'}
                      onChange={() => setForm({ ...form, visibility_level: 'division' })}
                    />
                    <span>ระดับ ส่วน/ฝ่าย</span>
                  </label>
                  <label className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer ${form.visibility_level === 'bureau' ? 'border-amber-500 bg-white dark:bg-slate-900' : 'border-slate-200 dark:border-slate-700'}`}>
                    <input
                      type="radio"
                      name="usrVisLevel"
                      value="bureau"
                      checked={form.visibility_level === 'bureau'}
                      onChange={() => setForm({ ...form, visibility_level: 'bureau', scope_division: '' })}
                    />
                    <span>ระดับ สำนักงาน/กอง</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">ขอบเขตสำนักงาน/กอง *</label>
                  <select
                    value={form.scope_bureau}
                    onChange={(e) => setForm({ ...form, scope_bureau: e.target.value, scope_division: '' })}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                  >
                    <option value="">-- เลือกสำนักงาน/กอง --</option>
                    {bureaus.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                {form.visibility_level !== 'bureau' && (
                  <div>
                    <label className="block text-xs font-bold mb-1">ขอบเขตส่วน/ฝ่าย *</label>
                    <select
                      value={form.scope_division}
                      onChange={(e) => setForm({ ...form, scope_division: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                    >
                      <option value="">-- เลือกส่วน/ฝ่าย --</option>
                      {formDivisions.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          <label className="inline-flex items-center gap-2 text-xs font-bold cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            <span>เปิดใช้งานบัญชีนี้</span>
          </label>
        </form>
      </ResponsiveModal>
    </AdminLayout>
  );
}
