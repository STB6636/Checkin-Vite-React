import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AdminLayout } from '../components/layout/AdminLayout.jsx';
import { MobileShortcutGrid } from '../components/common/MobileShortcutGrid.jsx';
import { OrgHierarchyFilter } from '../components/common/OrgHierarchyFilter.jsx';
import { PaginationBar } from '../components/common/PaginationBar.jsx';
import { ResponsiveModal } from '../components/common/ResponsiveModal.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useSettings } from '../contexts/SettingsContext.jsx';
import { AttendanceModel } from '../models/AttendanceModel.js';
import { PersonnelModel } from '../models/PersonnelModel.js';
import { Config } from '../core/Config.js';
import { UIHelpers } from '../core/UIHelpers.js';

const ALL_STATUS_KEYS = Config.OFFICIAL_STATUSES.map((s) => s.key);
const DEFAULT_STATUS_KEYS = ['normal', 'late', 'absent_duty', 'overtime'];

/**
 * ReportsPage — 100% Visual & Functional Parity with legacy reports.html (L128-550)
 * - MobileShortcutGrid + Floating Sapphire Blue Header (#0971CE -> #38BDF8) + Template Excel
 * - Single-Day / Date-Range Toggle + Group By Dropdown
 * - Multi-Select 5-Tag Status Chips + "เลือกค่าเริ่มต้น" / "เลือกทั้งหมด"
 * - Click row to open Resume Profile Modal + ADR-0040 Safe Edit Modal + Print PDF A4
 */
export default function ReportsPage() {
  const { user, canEditAttendance, canDeleteAttendance } = useAuth();
  const { settings } = useSettings();

  const today = UIHelpers.getTodayISO();
  const [dateMode, setDateMode] = useState('single'); // 'single' | 'range'
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [groupBy, setGroupBy] = useState('none'); // 'none' | 'division' | 'date'
  const [orgFilter, setOrgFilter] = useState({ bureau: '', division: '', workGroup: '' });
  const [selectedTags, setSelectedTags] = useState(ALL_STATUS_KEYS);
  const [search, setSearch] = useState('');
  const [records, setRecords] = useState([]);
  const [personnelList, setPersonnelList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [resumeRow, setResumeRow] = useState(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    id: null,
    personnel_id: '',
    work_date: today,
    shift_name: 'เวลาราชการปกติ',
    check_in_time: '',
    check_out_time: '',
    check_in_location: '',
    check_out_location: '',
    remark: '',
    is_special_request: false,
  });

  const effectiveEndDate = dateMode === 'single' ? startDate : endDate;

  const loadData = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    try {
      const [rows, pList] = await Promise.all([
        AttendanceModel.getReportRecordsByDateRange(startDate, effectiveEndDate, user),
        personnelList.length ? Promise.resolve(personnelList) : PersonnelModel.getAll(user),
      ]);
      setRecords(Array.isArray(rows) ? rows : []);
      if (Array.isArray(pList) && pList.length) setPersonnelList(pList);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [startDate, effectiveEndDate, user, personnelList.length]);

  useEffect(() => { loadData(false); }, [loadData]);

  const orgFiltered = useMemo(() => {
    return records.filter((r) => {
      if (orgFilter.bureau && r.bureau !== orgFilter.bureau) return false;
      if (orgFilter.division && r.division !== orgFilter.division) return false;
      if (orgFilter.workGroup && r.work_group !== orgFilter.workGroup) return false;
      return true;
    });
  }, [records, orgFilter]);

  const tagCounts = useMemo(() => {
    const map = { normal: 0, late: 0, absent_duty: 0, no_checkin: 0, overtime: 0 };
    for (const r of orgFiltered) {
      if (map[r.status_category] !== undefined) map[r.status_category] += 1;
    }
    return map;
  }, [orgFiltered]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = orgFiltered.filter((r) => {
      if (selectedTags.length > 0 && !selectedTags.includes(r.status_category)) return false;
      if (q) {
        const hay = `${r.full_name || ''} ${r.division || ''} ${r.shift_name || ''} ${r.remark || ''} ${r.check_in_location || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (groupBy === 'division') return [...base].sort((a, b) => (a.division || '').localeCompare(b.division || ''));
    if (groupBy === 'date') return [...base].sort((a, b) => (b.work_date || '').localeCompare(a.work_date || ''));
    return base;
  }, [orgFiltered, selectedTags, search, groupBy]);

  const paginated = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  useEffect(() => { setPage(1); }, [startDate, effectiveEndDate, orgFilter, selectedTags, search, groupBy]);

  const toggleTag = (key) => {
    setSelectedTags((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const openAddModal = () => {
    setEditForm({
      id: null,
      personnel_id: '',
      work_date: startDate,
      shift_name: settings?.work_shifts?.[0]?.name || 'เวลาราชการปกติ',
      check_in_time: '',
      check_out_time: '',
      check_in_location: settings?.bureau_name || '',
      check_out_location: '',
      remark: '',
      is_special_request: false,
    });
    setEditOpen(true);
  };

  const openEditModal = (row) => {
    setEditForm({
      id: row.id || null,
      personnel_id: row.personnel_id || '',
      work_date: row.work_date || startDate,
      shift_name: row.shift_name || 'เวลาราชการปกติ',
      check_in_time: row.check_in_time ? row.check_in_time.slice(0, 5) : '',
      check_out_time: row.check_out_time ? row.check_out_time.slice(0, 5) : '',
      check_in_location: row.check_in_location || '',
      check_out_location: row.check_out_location || '',
      remark: row.remark || '',
      is_special_request: Boolean(row.is_special_request),
    });
    setEditOpen(true);
  };

  const handleSaveRecord = async (e) => {
    e.preventDefault();
    setEditSaving(true);
    try {
      const res = await AttendanceModel.saveAdminAttendanceRecord({
        id: editForm.id,
        personnel_id: editForm.personnel_id,
        work_date: editForm.work_date,
        shift_name: editForm.shift_name,
        check_in_time: editForm.check_in_time || null,
        check_out_time: editForm.check_out_time || null,
        check_in_location: editForm.check_in_location || null,
        check_out_location: editForm.check_out_location || null,
        remark: editForm.remark || '',
        is_special_request: editForm.is_special_request,
        editor_user_id: user?.id,
      });
      if (res?.success === false) {
        await UIHelpers.alert('บันทึกไม่สำเร็จ', res.message || 'เกิดข้อผิดพลาด', 'error');
        return;
      }
      setEditOpen(false);
      UIHelpers.showToast('บันทึกข้อมูลการลงเวลาเรียบร้อยแล้ว', 'success');
      await loadData(true);
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteRecord = async (row) => {
    if (!row.id) return;
    const ok = await UIHelpers.confirm('ลบรายการลงเวลา', `ต้องการลบรายการลงเวลาของ "${row.full_name}" ใช่หรือไม่?`, 'ลบรายการ', 'warning');
    if (!ok) return;
    const res = await AttendanceModel.deleteAttendanceRecord(row.id);
    if (res?.success) {
      UIHelpers.showToast('ลบรายการลงเวลาเรียบร้อยแล้ว', 'success');
      await loadData(true);
    } else {
      await UIHelpers.alert('ลบไม่สำเร็จ', res?.message || 'เกิดข้อผิดพลาด', 'error');
    }
  };

  const handleExportExcel = async () => {
    const rows = filtered.map((r, i) => ({
      'ลำดับ': i + 1,
      'วันที่': UIHelpers.formatThaiShortDate(r.work_date),
      'ชื่อ-สกุล': r.full_name || '-',
      'ตำแหน่ง': UIHelpers.formatPosition(r.position_title, r.position_level, r.position_type, r.position),
      'ส่วน/ฝ่าย': r.division || '-',
      'กะปฏิบัติงาน': r.shift_name || '-',
      'เวลาเข้า': r.check_in_time || '-',
      'เวลาออก': r.check_out_time || '-',
      'พิกัดเข้า': r.check_in_location || '-',
      'พิกัดออก': r.check_out_location || '-',
      'สถานะ': r.status_label || r.status || '-',
      'หมายเหตุ': r.remark || '-',
    }));
    await UIHelpers.exportToExcelUTF8(rows, `รายงานการลงเวลา_${startDate}_${effectiveEndDate}`, 'รายงานลงเวลา');
    UIHelpers.showToast('ส่งออกไฟล์ Excel เรียบร้อยแล้ว', 'success');
  };

  const handlePrintPdf = () => {
    const trHtml = filtered.map((r, i) => {
      const pos = UIHelpers.formatPosition(r.position_title, r.position_level, r.position_type, r.position);
      return `<tr>
        <td style="text-align:center">${i + 1}</td>
        <td>${UIHelpers.escapeHtml(UIHelpers.formatThaiShortDate(r.work_date))}</td>
        <td><strong>${UIHelpers.escapeHtml(r.full_name || '-')}</strong><br/><small>${UIHelpers.escapeHtml(pos)}</small></td>
        <td>${UIHelpers.escapeHtml(r.division || '-')}</td>
        <td style="text-align:center">${UIHelpers.escapeHtml(r.check_in_time || '-')}</td>
        <td style="text-align:center">${UIHelpers.escapeHtml(r.check_out_time || '-')}</td>
        <td>${UIHelpers.escapeHtml(r.check_in_location || '-')}</td>
        <td>${UIHelpers.escapeHtml(r.check_out_location || '-')}</td>
        <td style="text-align:center">${UIHelpers.escapeHtml(r.status_label || r.status || '-')}</td>
        <td>${UIHelpers.escapeHtml(r.remark || '-')}</td>
      </tr>`;
    }).join('');

    UIHelpers.printReportInNewTab({
      title: `รายงานการลงเวลาปฏิบัติราชการ ${settings?.bureau_name || 'สำนักเทศกิจ'}`,
      subtitle: `ช่วงวันที่ ${UIHelpers.formatThaiFullDate(startDate)} ถึง ${UIHelpers.formatThaiFullDate(effectiveEndDate)} (ทั้งหมด ${filtered.length} รายการ)`,
      tableHtml: `<table><thead><tr><th>ที่</th><th>วันที่</th><th>ชื่อ-สกุล / ตำแหน่ง</th><th>สังกัด</th><th>เข้า</th><th>ออก</th><th>พิกัดเข้า</th><th>พิกัดออก</th><th>สถานะ</th><th>หมายเหตุ</th></tr></thead><tbody>${trHtml}</tbody></table>`,
      headerColor: settings?.category_colors?.group_header || '#007B3E',
    });
  };

  const activeShiftObj = (settings?.work_shifts || []).find((s) => s.name === editForm.shift_name);

  return (
    <AdminLayout
      title="รายงานการลงเวลาปฏิบัติราชการ"
      subtitle="รายงาน 5 หมวดหมู่ พิกัด GPS แยกเข้า-ออก พร้อมส่งออก Excel และพิมพ์ PDF แนวนอน A4"
      activePage="reports"
      onRealtimeSync={() => loadData(true)}
    >
      <MobileShortcutGrid />

      <div className="pt-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md overflow-visible">
          {/* Floating Sapphire Blue Header (#0971CE -> #38BDF8) */}
          <div className="-mt-6 mx-4 px-5 py-4 rounded-2xl bg-gradient-to-r from-[#0971CE] to-[#38BDF8] text-white shadow-lg flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <i className="fa-solid fa-file-lines text-lg" />
              <div>
                <h2 className="font-extrabold text-sm sm:text-base">รายงานการลงเวลาปฏิบัติราชการ ({filtered.length} รายการ)</h2>
                <p className="text-[11px] text-sky-100">
                  {dateMode === 'single' ? UIHelpers.formatThaiFullDate(startDate) : `${UIHelpers.formatThaiShortDate(startDate)} – ${UIHelpers.formatThaiShortDate(effectiveEndDate)}`}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {canEditAttendance() && (
                <button type="button" onClick={openAddModal} className="px-3 py-1.5 rounded-xl bg-white text-sky-800 text-xs font-extrabold shadow-xs">
                  <i className="fa-solid fa-plus mr-1" />บันทึกเวลา
                </button>
              )}
              <button type="button" onClick={handleExportExcel} className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs">
                <i className="fa-solid fa-file-excel mr-1" />ส่งออก Excel
              </button>
              <button
                type="button"
                onClick={() => UIHelpers.exportTemplateWithValidationsExcel({ settings, templateRows: PersonnelModel.getExcelTemplateRows(), fileName: 'Template_รายงานลงเวลา' })}
                className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold"
              >
                <i className="fa-solid fa-file-arrow-down mr-1" />Template Excel
              </button>
              <button type="button" onClick={handlePrintPdf} className="px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-900 text-white text-xs font-bold">
                <i className="fa-solid fa-print mr-1" />พิมพ์ PDF A4
              </button>
            </div>
          </div>

          {/* Multi-Select 5-Tag Status Chips + Quick Selectors */}
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {Config.OFFICIAL_STATUSES.map((st) => {
                const active = selectedTags.includes(st.key);
                const color = settings?.category_colors?.[st.key] || st.defaultColor;
                return (
                  <button
                    key={st.key}
                    type="button"
                    onClick={() => toggleTag(st.key)}
                    style={active ? { backgroundColor: color, borderColor: color, color: '#fff' } : undefined}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition ${
                      active ? 'shadow-xs' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <i className={`fa-solid ${active ? 'fa-square-check' : 'fa-square'}`} style={!active ? { color } : undefined} />
                    <span>{st.label}</span>
                    <span className="font-mono">({tagCounts[st.key] || 0})</span>
                  </button>
                );
              })}
              <div className="ml-auto flex gap-1.5 text-[11px] font-bold">
                <button type="button" onClick={() => setSelectedTags(DEFAULT_STATUS_KEYS)} className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200">
                  เลือกค่าเริ่มต้น
                </button>
                <button type="button" onClick={() => setSelectedTags(ALL_STATUS_KEYS)} className="px-2.5 py-1 rounded-lg bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 hover:bg-sky-100">
                  เลือกทั้งหมด
                </button>
              </div>
            </div>

            {/* Single/Range Date Toggle + Group By + Search */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end">
              <div className="md:col-span-3">
                <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-[11px] font-bold">
                  <button type="button" onClick={() => setDateMode('single')} className={`py-1.5 rounded-lg ${dateMode === 'single' ? 'bg-white dark:bg-slate-900 text-sky-700 shadow-xs' : 'text-slate-500'}`}>เลือกวันเดียว</button>
                  <button type="button" onClick={() => setDateMode('range')} className={`py-1.5 rounded-lg ${dateMode === 'range' ? 'bg-white dark:bg-slate-900 text-sky-700 shadow-xs' : 'text-slate-500'}`}>เลือกเป็นช่วง</button>
                </div>
              </div>
              <div className={dateMode === 'single' ? 'md:col-span-3' : 'md:col-span-2'}>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold" />
              </div>
              {dateMode === 'range' && (
                <div className="md:col-span-2">
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold" />
                </div>
              )}
              <div className={dateMode === 'single' ? 'md:col-span-3' : 'md:col-span-2'}>
                <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold">
                  <option value="none">จัดกลุ่ม: ไม่จัดกลุ่ม</option>
                  <option value="division">จัดกลุ่ม: ตามส่วน/ฝ่าย</option>
                  <option value="date">จัดกลุ่ม: ตามวันที่</option>
                </select>
              </div>
              <div className="md:col-span-3">
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่อ / สังกัด / หมายเหตุ..." className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs" />
              </div>
            </div>

            <OrgHierarchyFilter bureau={orgFilter.bureau} division={orgFilter.division} workGroup={orgFilter.workGroup} onChange={setOrgFilter} compact />

            {/* Profile Click Hint Bar (reports.html:172-175) */}
            <p className="text-[11px] text-sky-700 dark:text-sky-300 bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200/70 dark:border-sky-900/60 rounded-xl px-3 py-1.5">
              <i className="fa-solid fa-circle-info mr-1.5" />คลิกที่แถวรายชื่อเพื่อเปิดดูโปรไฟล์และข้อมูลการลงเวลาอย่างละเอียด
            </p>
          </div>

          {loading ? (
            <div className="p-10 text-center text-slate-400">
              <i className="fa-solid fa-circle-notch fa-spin text-2xl text-sky-600 mb-2" />
              <p className="text-sm font-semibold">กำลังประมวลผลรายงาน...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">ไม่พบข้อมูลรายงานตามเงื่อนไขที่เลือก</div>
          ) : (
            <>
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-xs text-left bma-table">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="px-3 py-3">วันที่ / กะ</th>
                      <th className="px-3 py-3">ชื่อ-สกุล / ตำแหน่ง</th>
                      <th className="px-3 py-3 text-center">เวลาเข้า-ออก</th>
                      <th className="px-3 py-3">พิกัดเข้างาน</th>
                      <th className="px-3 py-3">พิกัดออกงาน</th>
                      <th className="px-3 py-3 text-center">สถานะ</th>
                      <th className="px-3 py-3">หมายเหตุ</th>
                      <th className="px-3 py-3 text-center">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {paginated.map((row, idx) => {
                      const pos = UIHelpers.formatPosition(row.position_title, row.position_level, row.position_type, row.position);
                      const statusColor = settings?.category_colors?.[row.status_category] || '#007B3E';
                      return (
                        <tr key={row.id || `${row.personnel_id}-${row.work_date}-${idx}`} onClick={() => setResumeRow(row)} className="hover:bg-sky-50/40 dark:hover:bg-slate-800/40 cursor-pointer">
                          <td className="px-3 py-3 whitespace-nowrap">
                            <p className="font-bold">{UIHelpers.formatThaiShortDate(row.work_date)}</p>
                            <p className="text-[11px] text-slate-400">{row.shift_name || '-'}</p>
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-bold text-slate-800 dark:text-white">{row.full_name || '-'}</p>
                            <p className="text-[11px] text-slate-500">{pos}</p>
                          </td>
                          <td className="px-3 py-3 text-center font-mono whitespace-nowrap">
                            <span className="font-bold text-[#00744B]">{row.check_in_time || '--:--'}</span>
                            <span className="mx-1 text-slate-400">/</span>
                            <span className="font-bold text-sky-600">{row.check_out_time || '--:--'}</span>
                          </td>
                          <td className="px-3 py-3 max-w-[180px]"><p className="line-clamp-2">{row.check_in_location || '-'}</p></td>
                          <td className="px-3 py-3 max-w-[180px]"><p className="line-clamp-2">{row.check_out_location || '-'}</p></td>
                          <td className="px-3 py-3 text-center whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold text-white" style={{ backgroundColor: statusColor }}>{row.status_label || row.status || '-'}</span>
                          </td>
                          <td className="px-3 py-3 max-w-[180px]"><p className="line-clamp-2">{row.remark || '-'}</p></td>
                          <td className="px-3 py-3 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className="inline-flex gap-1">
                              {canEditAttendance(row) && (
                                <button type="button" onClick={() => openEditModal(row)} title="แก้ไขเวลา" className="w-7 h-7 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 flex items-center justify-center"><i className="fa-solid fa-pen text-[11px]" /></button>
                              )}
                              {canDeleteAttendance(row) && row.id && (
                                <button type="button" onClick={() => handleDeleteRecord(row)} title="ลบ" className="w-7 h-7 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 flex items-center justify-center"><i className="fa-solid fa-trash text-[11px]" /></button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="lg:hidden divide-y divide-slate-200 dark:divide-slate-800">
                {paginated.map((row, idx) => (
                  <div key={row.id || `${row.personnel_id}-${row.work_date}-${idx}`} onClick={() => setResumeRow(row)} className="p-4 space-y-2 cursor-pointer">
                    <div className="flex justify-between gap-2">
                      <div>
                        <p className="font-bold text-sm">{row.full_name || '-'}</p>
                        <p className="text-xs text-slate-500">{UIHelpers.formatThaiShortDate(row.work_date)} · {row.shift_name}</p>
                      </div>
                      <span className="font-mono text-xs font-bold text-[#00744B]">{row.check_in_time || '--:--'} / {row.check_out_time || '--:--'}</span>
                    </div>
                    <p className="text-xs text-slate-500">{row.check_in_location || '-'} {row.remark ? `· ${row.remark}` : ''}</p>
                  </div>
                ))}
              </div>

              <PaginationBar totalItems={filtered.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} />
            </>
          )}
        </div>
      </div>

      {/* Resume Profile Modal (reports.html:374-550) */}
      <ResponsiveModal
        open={Boolean(resumeRow)}
        onClose={() => setResumeRow(null)}
        title={resumeRow?.full_name || 'โปรไฟล์บุคลากร'}
        subtitle={resumeRow ? UIHelpers.formatPosition(resumeRow.position_title, resumeRow.position_level, resumeRow.position_type, resumeRow.position) : ''}
        icon="fa-id-badge"
        maxWidthClass="max-w-lg"
        footer={
          resumeRow && canEditAttendance(resumeRow) ? (
            <button type="button" onClick={() => { const target = resumeRow; setResumeRow(null); openEditModal(target); }} className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold">
              <i className="fa-solid fa-pen mr-1.5" />แก้ไขบันทึกเวลานี้
            </button>
          ) : null
        }
      >
        {resumeRow && (
          <div className="space-y-3 text-xs">
            <dl className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/70 rounded-xl p-3.5">
              <div><dt className="text-slate-400">สำนัก / กอง</dt><dd className="font-bold mt-0.5">{resumeRow.bureau || '-'}</dd></div>
              <div><dt className="text-slate-400">ส่วน / ฝ่าย</dt><dd className="font-bold mt-0.5">{resumeRow.division || '-'}</dd></div>
              <div><dt className="text-slate-400">กลุ่มงาน</dt><dd className="font-bold mt-0.5">{resumeRow.work_group || '-'}</dd></div>
              <div><dt className="text-slate-400">วันที่ / กะ</dt><dd className="font-bold mt-0.5">{UIHelpers.formatThaiShortDate(resumeRow.work_date)} ({resumeRow.shift_name})</dd></div>
              <div><dt className="text-slate-400">เวลาเข้างาน</dt><dd className="font-mono font-bold text-[#00744B] mt-0.5">{resumeRow.check_in_time || '--:--'}</dd></div>
              <div><dt className="text-slate-400">เวลาออกงาน</dt><dd className="font-mono font-bold text-sky-600 mt-0.5">{resumeRow.check_out_time || '--:--'}</dd></div>
            </dl>
            <div className="space-y-1.5">
              <p><strong className="text-slate-500">พิกัดเข้า:</strong> {resumeRow.check_in_location || '-'}</p>
              <p><strong className="text-slate-500">พิกัดออก:</strong> {resumeRow.check_out_location || '-'}</p>
              <p><strong className="text-slate-500">หมายเหตุ:</strong> {resumeRow.remark || '-'}</p>
            </div>
          </div>
        )}
      </ResponsiveModal>

      {/* ADR-0040 Safe Add/Edit Attendance Modal */}
      <ResponsiveModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={editForm.id ? 'แก้ไขบันทึกเวลาปฏิบัติราชการ' : 'บันทึกเวลาปฏิบัติราชการ (Admin)'}
        icon="fa-clock"
        maxWidthClass="max-w-lg"
        footer={
          <>
            <button type="button" onClick={() => setEditOpen(false)} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-semibold">ยกเลิก</button>
            <button type="submit" form="formReportEdit" disabled={editSaving} className="px-5 py-2 rounded-xl bg-[#00744B] hover:bg-[#005a3a] text-white text-sm font-bold disabled:opacity-50">
              {editSaving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
            </button>
          </>
        }
      >
        <form id="formReportEdit" onSubmit={handleSaveRecord} className="space-y-3.5 text-sm">
          <div>
            <label className="block text-xs font-bold mb-1">บุคลากร *</label>
            <select required disabled={Boolean(editForm.id)} value={editForm.personnel_id} onChange={(e) => setEditForm({ ...editForm, personnel_id: e.target.value })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm disabled:opacity-60">
              <option value="">-- เลือกบุคลากร --</option>
              {personnelList.map((p) => <option key={p.id} value={p.id}>{`${p.prefix || ''}${p.first_name || ''} ${p.last_name || ''}`.trim()} ({p.division || '-'})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold mb-1">วันที่ *</label>
              <input type="date" required disabled={Boolean(editForm.id)} value={editForm.work_date} onChange={(e) => setEditForm({ ...editForm, work_date: e.target.value })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm disabled:opacity-60" />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">กะปฏิบัติงาน</label>
              <select value={editForm.shift_name} onChange={(e) => setEditForm({ ...editForm, shift_name: e.target.value })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm">
                {(settings?.work_shifts || []).map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold">เวลาเข้างาน</label>
                <div className="flex gap-1.5 text-[10px]">
                  {activeShiftObj && <button type="button" onClick={() => setEditForm({ ...editForm, check_in_time: activeShiftObj.check_in })} className="text-[#00744B] font-bold hover:underline">ตามกะ ({activeShiftObj.check_in})</button>}
                  <button type="button" onClick={() => setEditForm({ ...editForm, check_in_time: '' })} className="text-rose-600 font-bold hover:underline">ล้าง</button>
                </div>
              </div>
              <input type="time" value={editForm.check_in_time} onChange={(e) => setEditForm({ ...editForm, check_in_time: e.target.value })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-mono text-sm" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold">เวลาออกงาน</label>
                <div className="flex gap-1.5 text-[10px]">
                  {activeShiftObj && <button type="button" onClick={() => setEditForm({ ...editForm, check_out_time: activeShiftObj.check_out })} className="text-sky-600 font-bold hover:underline">ตามกะ ({activeShiftObj.check_out})</button>}
                  <button type="button" onClick={() => setEditForm({ ...editForm, check_out_time: '' })} className="text-rose-600 font-bold hover:underline">ล้าง</button>
                </div>
              </div>
              <input type="time" value={editForm.check_out_time} onChange={(e) => setEditForm({ ...editForm, check_out_time: e.target.value })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-mono text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="block text-xs font-bold mb-1">สถานที่เข้างาน</label><input type="text" value={editForm.check_in_location} onChange={(e) => setEditForm({ ...editForm, check_in_location: e.target.value })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs font-bold mb-1">สถานที่ออกงาน</label><input type="text" value={editForm.check_out_location} onChange={(e) => setEditForm({ ...editForm, check_out_location: e.target.value })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" /></div>
          </div>
          <div><label className="block text-xs font-bold mb-1">หมายเหตุ</label><input type="text" value={editForm.remark} onChange={(e) => setEditForm({ ...editForm, remark: e.target.value })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" /></div>
        </form>
      </ResponsiveModal>
    </AdminLayout>
  );
}
