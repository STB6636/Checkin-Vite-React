import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminLayout } from '../components/layout/AdminLayout.jsx';
import { OrgHierarchyFilter } from '../components/common/OrgHierarchyFilter.jsx';
import { PaginationBar } from '../components/common/PaginationBar.jsx';
import { ResponsiveModal } from '../components/common/ResponsiveModal.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useSettings } from '../contexts/SettingsContext.jsx';
import { UserModel } from '../models/UserModel.js';
import { PersonnelModel } from '../models/PersonnelModel.js';
import { SettingsModel } from '../models/SettingsModel.js';
import { UIHelpers } from '../core/UIHelpers.js';

const EMPTY_FORM = {
  id: null, personnel_id: '', username: '', password: '', full_name: '', national_id: '',
  role: 'User', visibility_level: 'none', scope_bureau: '', scope_division: '', is_active: true,
};

/**
 * UsersPage — 100% Parity with legacy users.html (L128-468)
 * - Tab 1: Floating Imperial Purple Header (#480080 -> #7C3AED) + ALL 4 buttons (เพิ่มบัญชี, นำเข้า Excel, ส่งออก Excel, Template Excel)
 * - Tab 2: Floating Amber Header (#D97706 -> #FFB449) + Tab 2 Search + Desktop Table + Mobile Cards
 */
export default function UsersPage() {
  const { user, isSuperAdmin } = useAuth();
  const { settings } = useSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const importUsersRef = useRef(null);

  const [activeTab, setActiveTab] = useState(searchParams.get('tab') === 'password-resets' ? 'password-resets' : 'users');
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
  const [search, setSearch] = useState('');
  const [resetSearch, setResetSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
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

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      const p = u.personnel || {};
      const bureau = u.scope_bureau || p.bureau || '';
      const division = u.scope_division || p.division || '';
      const workGroup = p.work_group || '';
      if (orgFilter.bureau && bureau !== orgFilter.bureau) return false;
      if (orgFilter.division && division !== orgFilter.division) return false;
      if (orgFilter.workGroup && workGroup !== orgFilter.workGroup) return false;
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (q) {
        const hay = `${u.full_name || ''} ${u.username || ''} ${u.national_id || ''} ${division} ${u.role || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [users, orgFilter, roleFilter, search]);

  const filteredResets = useMemo(() => {
    const q = resetSearch.trim().toLowerCase();
    if (!q) return resetRequests;
    return resetRequests.filter((r) => `${r.full_name || ''} ${r.username || ''} ${r.national_id || ''} ${r.personnel?.division || ''}`.toLowerCase().includes(q));
  }, [resetRequests, resetSearch]);

  const paginated = useMemo(() => filteredUsers.slice((page - 1) * pageSize, page * pageSize), [filteredUsers, page, pageSize]);
  useEffect(() => { setPage(1); }, [orgFilter, roleFilter, search, activeTab]);

  const bureaus = useMemo(() => SettingsModel.getUniqueBureaus(settings), [settings]);
  const formDivisions = useMemo(() => SettingsModel.getUniqueDivisions(settings, form.scope_bureau), [settings, form.scope_bureau]);

  const openCreateModal = () => {
    setForm({ ...EMPTY_FORM, scope_bureau: !isSuperAdmin ? (user?.scope_bureau || '') : '' });
    setModalOpen(true);
  };

  const openEditModal = (u) => {
    setForm({
      id: u.id, personnel_id: u.personnel_id || '', username: u.username || '', password: '',
      full_name: u.full_name || '', national_id: u.national_id || u.personnel?.national_id || '',
      role: u.role || 'User', visibility_level: u.visibility_level || 'none',
      scope_bureau: u.scope_bureau || u.personnel?.bureau || '',
      scope_division: u.scope_division || u.personnel?.division || '',
      is_active: u.is_active !== false,
    });
    setModalOpen(true);
  };

  const handlePersonnelSelect = (pid) => {
    const person = personnelList.find((p) => String(p.id) === String(pid));
    if (!person) { setForm((prev) => ({ ...prev, personnel_id: pid })); return; }
    const fullName = `${person.prefix || ''}${person.first_name || ''} ${person.last_name || ''}`.trim();
    setForm((prev) => ({
      ...prev,
      personnel_id: person.id, full_name: fullName, national_id: person.national_id || prev.national_id,
      username: prev.id ? prev.username : (person.national_id || prev.username),
      password: prev.id ? prev.password : UIHelpers.getLast6DigitsFromNationalId(person.national_id || ''),
      scope_bureau: person.bureau || prev.scope_bureau, scope_division: person.division || prev.scope_division,
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        personnel_id: form.personnel_id || null,
        username: form.username.trim(),
        full_name: form.full_name.trim(),
        national_id: form.national_id.trim(),
        role: isSuperAdmin ? form.role : (form.role === 'SuperAdmin' ? 'Admin' : form.role),
        visibility_level: form.role === 'SuperAdmin' ? 'all' : form.role === 'Admin' ? (form.visibility_level === 'none' ? 'division' : form.visibility_level) : 'none',
        scope_bureau: form.scope_bureau || null,
        scope_division: form.scope_division || null,
        is_active: form.is_active,
      };
      if (form.password.trim()) payload.password = form.password.trim();
      const res = form.id ? await UserModel.update(form.id, payload, user) : await UserModel.create(payload, user);
      if (res?.success === false) { await UIHelpers.alert('ไม่สามารถบันทึกได้', res.message || 'เกิดข้อผิดพลาด', 'error'); return; }
      setModalOpen(false);
      UIHelpers.showToast(form.id ? 'อัปเดตบัญชีผู้ใช้งานแล้ว' : 'สร้างบัญชีผู้ใช้งานเรียบร้อยแล้ว', 'success');
      await loadData(true);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (u) => {
    const ok = await UIHelpers.confirm('ลบบัญชีผู้ใช้งาน', `ต้องการลบบัญชี "${u.full_name || u.username}" ใช่หรือไม่?`, 'ลบบัญชี', 'warning');
    if (!ok) return;
    const res = await UserModel.delete(u.id, user);
    if (res?.success === false) { await UIHelpers.alert('ลบไม่สำเร็จ', res.message || 'ไม่มีสิทธิ์ลบรายการนี้', 'error'); return; }
    UIHelpers.showToast('ลบบัญชีผู้ใช้งานแล้ว', 'success');
    await loadData(true);
  };

  const handleResetDecision = async (reqUser, approve) => {
    const ok = await UIHelpers.confirm(
      approve ? 'อนุมัติรีเซ็ตรหัสผ่าน' : 'ปฏิเสธคำขอรีเซ็ตรหัสผ่าน',
      approve ? `อนุมัติรีเซ็ตรหัสผ่านของ "${reqUser.full_name}" เป็นเลขท้าย 6 หลักของบัตรประชาชน?` : `ปฏิเสธคำขอของ "${reqUser.full_name}"?`,
      approve ? 'อนุมัติรีเซ็ต' : 'ปฏิเสธ',
      approve ? 'question' : 'warning'
    );
    if (!ok) return;
    const res = await UserModel.processPasswordResetRequest(reqUser.id, approve, user);
    if (res?.success) {
      UIHelpers.showToast(res.message || 'ดำเนินการเรียบร้อยแล้ว', 'success');
      await loadData(true);
    } else {
      await UIHelpers.alert('เกิดข้อผิดพลาด', res?.message || 'ไม่สามารถดำเนินการได้', 'error');
    }
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
      await UIHelpers.alert(res?.success ? 'นำเข้าบัญชีสำเร็จ' : 'ผลการนำเข้า', res?.message || `ประมวลผล ${rows.length} แถว`, res?.success ? 'success' : 'warning');
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
            activeTab === 'users' ? 'bg-gradient-to-r from-[#480080] to-[#7C3AED] text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
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
            activeTab === 'password-resets' ? 'bg-gradient-to-r from-[#D97706] to-[#FFB449] text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
          }`}
        >
          <i className="fa-solid fa-key" />
          <span>คำขอรีเซ็ตรหัสผ่าน</span>
          {resetRequests.length > 0 && <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px]">{resetRequests.length}</span>}
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
                onClick={() => {
                  const rows = filteredUsers.map((u, idx) => ({
                    'ลำดับ': idx + 1, 'ชื่อผู้ใช้งาน': u.username, 'ชื่อ-สกุล': u.full_name,
                    'บทบาท': u.role, 'ขอบเขต': u.visibility_level,
                    'สำนัก/กอง': u.scope_bureau || u.personnel?.bureau || '-',
                    'ส่วน/ฝ่าย': u.scope_division || u.personnel?.division || '-',
                    'สถานะ': u.is_active ? 'ใช้งาน' : 'ปิดใช้งาน',
                  }));
                  UIHelpers.exportToExcelUTF8(rows, 'บัญชีผู้ใช้งานระบบ', 'Users');
                }}
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
              <div className="md:col-span-8">
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่อ / Username / เลขบัตรประชาชน..." className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs" />
              </div>
              <div className="md:col-span-4">
                <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold">
                  <option value="all">ทุกบทบาท (Role)</option>
                  {isSuperAdmin && <option value="SuperAdmin">SuperAdmin</option>}
                  <option value="Admin">Admin</option>
                  <option value="User">User</option>
                </select>
              </div>
            </div>
            <OrgHierarchyFilter bureau={orgFilter.bureau} division={orgFilter.division} workGroup={orgFilter.workGroup} onChange={setOrgFilter} compact />
          </div>

          {loading ? (
            <div className="p-10 text-center text-slate-400"><i className="fa-solid fa-circle-notch fa-spin text-2xl text-purple-600 mb-2" /><p className="text-sm font-semibold">กำลังโหลดบัญชีผู้ใช้งาน...</p></div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">ไม่พบบัญชีผู้ใช้งานตามเงื่อนไข</div>
          ) : (
            <>
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-sm text-left bma-table">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="px-4 py-3">ชื่อ-สกุล / Username</th>
                      <th className="px-4 py-3">สังกัด</th>
                      <th className="px-4 py-3 text-center">บทบาท / ขอบเขต</th>
                      <th className="px-4 py-3 text-center">สถานะ</th>
                      <th className="px-4 py-3 text-center">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {paginated.map((u) => {
                      const meta = PersonnelModel.getRolePastelMeta(u.role);
                      return (
                        <tr key={u.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-3"><p className="font-bold text-slate-800 dark:text-white">{u.full_name || '-'}</p><p className="text-xs font-mono text-slate-500">@{u.username}</p></td>
                          <td className="px-4 py-3 text-xs"><p className="font-semibold">{u.scope_division || u.personnel?.division || '-'}</p><p className="text-slate-400">{u.scope_bureau || u.personnel?.bureau || '-'}</p></td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${meta?.badgeClass || 'bg-slate-100 text-slate-700'}`}>{u.role}</span>
                            {u.role === 'Admin' && <p className="text-[10px] text-slate-400 mt-0.5">{u.visibility_level}</p>}
                          </td>
                          <td className="px-4 py-3 text-center"><span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${u.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{u.is_active ? 'ใช้งานปกติ' : 'ปิดใช้งาน'}</span></td>
                          <td className="px-4 py-3 text-center">
                            <div className="inline-flex gap-1.5">
                              <button type="button" onClick={() => openEditModal(u)} className="w-8 h-8 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 flex items-center justify-center"><i className="fa-solid fa-pen text-xs" /></button>
                              <button type="button" onClick={() => handleDelete(u)} className="w-8 h-8 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 flex items-center justify-center"><i className="fa-solid fa-trash text-xs" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="lg:hidden divide-y divide-slate-200 dark:divide-slate-800">
                {paginated.map((u) => (
                  <div key={u.id} className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0"><p className="font-bold text-sm truncate">{u.full_name || '-'}</p><p className="text-xs font-mono text-slate-500">@{u.username} · {u.role}</p></div>
                    <div className="flex gap-1.5 shrink-0">
                      <button type="button" onClick={() => openEditModal(u)} className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center"><i className="fa-solid fa-pen text-xs" /></button>
                      <button type="button" onClick={() => handleDelete(u)} className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center"><i className="fa-solid fa-trash text-xs" /></button>
                    </div>
                  </div>
                ))}
              </div>

              <PaginationBar totalItems={filteredUsers.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} />
            </>
          )}
        </div>
      ) : (
        /* Tab 2: Floating Amber Header + Search + Desktop Table + Mobile Cards */
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md overflow-visible">
          <div className="-mt-5 mx-4 px-5 py-4 rounded-2xl bg-gradient-to-r from-[#D97706] to-[#FFB449] text-white shadow-lg flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <i className="fa-solid fa-key text-lg" />
              <h2 className="font-extrabold text-sm sm:text-base">คำขอรีเซ็ตรหัสผ่านที่รออนุมัติ ({filteredResets.length} รายการ)</h2>
            </div>
            <input type="text" value={resetSearch} onChange={(e) => setResetSearch(e.target.value)} placeholder="ค้นหาชื่อ / Username..." className="rounded-xl bg-white/95 text-slate-800 px-3 py-1.5 text-xs w-56" />
          </div>

          {filteredResets.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">ไม่มีคำขอรีเซ็ตรหัสผ่านค้างอยู่</div>
          ) : (
            <>
              <div className="hidden lg:block overflow-x-auto p-4">
                <table className="w-full text-xs text-left bma-table">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3 w-12 text-center">#</th>
                      <th className="px-4 py-3">ชื่อ-สกุล</th>
                      <th className="px-4 py-3">Username</th>
                      <th className="px-4 py-3">สังกัด</th>
                      <th className="px-4 py-3 text-center">ดำเนินการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredResets.map((req, idx) => (
                      <tr key={req.id}>
                        <td className="px-4 py-3 text-center font-mono text-slate-400">{idx + 1}</td>
                        <td className="px-4 py-3 font-bold">{req.full_name || '-'}</td>
                        <td className="px-4 py-3 font-mono">@{req.username}</td>
                        <td className="px-4 py-3">{req.personnel?.division || req.scope_division || '-'}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="inline-flex gap-2">
                            <button type="button" onClick={() => handleResetDecision(req, true)} className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold">อนุมัติรีเซ็ต</button>
                            <button type="button" onClick={() => handleResetDecision(req, false)} className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold">ปฏิเสธ</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="lg:hidden divide-y divide-slate-200 dark:divide-slate-800">
                {filteredResets.map((req) => (
                  <div key={req.id} className="p-4 space-y-2.5">
                    <div>
                      <p className="font-bold text-sm">{req.full_name || req.username}</p>
                      <p className="text-xs font-mono text-slate-500">@{req.username} · {req.personnel?.division || '-'}</p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => handleResetDecision(req, true)} className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold">อนุมัติรีเซ็ต</button>
                      <button type="button" onClick={() => handleResetDecision(req, false)} className="flex-1 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold">ปฏิเสธ</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Create / Edit User Modal */}
      <ResponsiveModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.id ? 'แก้ไขบัญชีผู้ใช้งาน' : 'เพิ่มบัญชีผู้ใช้งานใหม่'}
        icon="fa-user-gear"
        maxWidthClass="max-w-lg"
        footer={
          <>
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-semibold">ยกเลิก</button>
            <button type="submit" form="formUser" disabled={saving} className="px-5 py-2 rounded-xl bg-[#480080] hover:bg-purple-900 text-white text-sm font-bold disabled:opacity-50">{saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}</button>
          </>
        }
      >
        <form id="formUser" onSubmit={handleSave} className="space-y-3.5 text-sm">
          <div>
            <label className="block text-xs font-bold mb-1">เชื่อมโยงทะเบียนบุคลากร</label>
            <select value={form.personnel_id} onChange={(e) => handlePersonnelSelect(e.target.value)} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm">
              <option value="">-- ไม่ผูก / เลือกบุคลากร --</option>
              {personnelList.map((p) => <option key={p.id} value={p.id}>{`${p.prefix || ''}${p.first_name || ''} ${p.last_name || ''}`.trim()} ({p.division || '-'})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="block text-xs font-bold mb-1">ชื่อบัญชีผู้ใช้งาน *</label><input type="text" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-mono" /></div>
            <div><label className="block text-xs font-bold mb-1">{form.id ? 'รหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)' : 'รหัสผ่าน *'}</label><input type="text" required={!form.id} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-mono" /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="block text-xs font-bold mb-1">ชื่อ-สกุล *</label><input type="text" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs font-bold mb-1">เลขบัตรประชาชน</label><input type="text" maxLength={13} value={form.national_id} onChange={(e) => setForm({ ...form, national_id: e.target.value.replace(/\D/g, '') })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-mono" /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold mb-1">บทบาท (Role)</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm">
                <option value="User">User</option>
                <option value="Admin">Admin</option>
                {isSuperAdmin && <option value="SuperAdmin">SuperAdmin</option>}
              </select>
            </div>
            {form.role === 'Admin' && (
              <div>
                <label className="block text-xs font-bold mb-1">ระดับขอบเขต</label>
                <select value={form.visibility_level} onChange={(e) => setForm({ ...form, visibility_level: e.target.value })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm">
                  <option value="division">ระดับส่วน/ฝ่าย</option>
                  <option value="bureau">ระดับสำนัก/กอง</option>
                  {isSuperAdmin && <option value="all">ทั้งหมด</option>}
                </select>
              </div>
            )}
          </div>
          {form.role === 'Admin' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="block text-xs font-bold mb-1">ขอบเขตสำนัก/กอง</label><select value={form.scope_bureau} onChange={(e) => setForm({ ...form, scope_bureau: e.target.value, scope_division: '' })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"><option value="">-- เลือก --</option>{bureaus.map((b) => <option key={b} value={b}>{b}</option>)}</select></div>
              <div><label className="block text-xs font-bold mb-1">ขอบเขตส่วน/ฝ่าย</label><select value={form.scope_division} onChange={(e) => setForm({ ...form, scope_division: e.target.value })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"><option value="">-- เลือก --</option>{formDivisions.map((d) => <option key={d} value={d}>{d}</option>)}</select></div>
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
