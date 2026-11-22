import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from '../components/layout/AdminLayout.jsx';
import { MobileShortcutGrid } from '../components/common/MobileShortcutGrid.jsx';
import { OrgHierarchyFilter } from '../components/common/OrgHierarchyFilter.jsx';
import { PaginationBar } from '../components/common/PaginationBar.jsx';
import { ResponsiveModal } from '../components/common/ResponsiveModal.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { AttendanceModel } from '../models/AttendanceModel.js';
import { UIHelpers } from '../core/UIHelpers.js';

const STATUS_BADGE = {
  normal: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  late: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  absent_duty: 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300',
  no_checkin: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
  overtime: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
};

const KPI_ICON_BOX = {
  total: 'from-[#00C08A] to-[#00744B]',
  normal: 'from-[#00744B] to-[#00A368]',
  late: 'from-amber-400 to-amber-600',
  absent_duty: 'from-[#EB3DA9] to-rose-600',
  overtime: 'from-[#0971CE] to-sky-500',
};

/**
 * DashboardPage — 100% Visual Parity with legacy dashboard.html (L125-275) + Option 1 Enhancements
 * - MobileShortcutGrid on mobile
 * - Date Selector Bar ABOVE KPI cards with Thai Date Badge + blinking emerald dot
 * - 5 .material-stat-card KPI cards with floating top-left .material-stat-icon-box & right-aligned numbers
 * - Floating Emerald Table Header (-mt-6) + "เปิดหน้ารายงานฉบับเต็ม" + Pagination ABOVE table (default 5) + 7 columns
 */
export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [workDate, setWorkDate] = useState(UIHelpers.getTodayISO());
  const [orgFilter, setOrgFilter] = useState({ bureau: '', division: '', workGroup: '' });
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [previewRecord, setPreviewRecord] = useState(null);

  const loadData = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    try {
      const rows = await AttendanceModel.getDailyReportRecords(workDate, user);
      setRecords(Array.isArray(rows) ? rows : []);
    } catch (err) {
      console.error('[DashboardPage] loadData error:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [workDate, user]);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  const orgFiltered = useMemo(() => {
    return records.filter((r) => {
      if (orgFilter.bureau && r.bureau !== orgFilter.bureau) return false;
      if (orgFilter.division && r.division !== orgFilter.division) return false;
      if (orgFilter.workGroup && r.work_group !== orgFilter.workGroup) return false;
      return true;
    });
  }, [records, orgFilter]);

  const metrics = useMemo(() => AttendanceModel.calculateDashboardMetrics(orgFiltered), [orgFiltered]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orgFiltered.filter((r) => {
      if (statusFilter !== 'all') {
        if (statusFilter === 'absent_duty') {
          if (r.status_category !== 'absent_duty' && r.status_category !== 'no_checkin') return false;
        } else if (r.status_category !== statusFilter) {
          return false;
        }
      }
      if (q) {
        const hay = `${r.full_name || ''} ${r.position || ''} ${r.division || ''} ${r.work_group || ''} ${r.remark || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orgFiltered, statusFilter, search]);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [workDate, orgFilter, statusFilter, search]);

  const handleExportExcel = async () => {
    const exportRows = filtered.map((r, idx) => ({
      'ลำดับ': idx + 1,
      'วันที่': UIHelpers.formatThaiShortDate(r.work_date || workDate),
      'ชื่อ-สกุล': r.full_name || '-',
      'ตำแหน่ง': UIHelpers.formatPosition(r.position_title, r.position_level, r.position_type, r.position),
      'ส่วน/ฝ่าย': r.division || '-',
      'กะ/ช่วงเวลา': r.shift_name || '-',
      'เวลาเข้า': r.check_in_time || '-',
      'เวลาออก': r.check_out_time || '-',
      'สถานะ': r.status_label || r.status || '-',
      'หมายเหตุ': r.remark || '-',
    }));
    await UIHelpers.exportToExcelUTF8(exportRows, `ภาพรวมการลงเวลา_${workDate}`, 'ภาพรวม');
    UIHelpers.showToast('ส่งออกไฟล์ Excel เรียบร้อยแล้ว', 'success');
  };

  return (
    <AdminLayout
      title="ภาพรวมการลงเวลาปฏิบัติราชการ"
      subtitle={`ประจำวันที่ ${UIHelpers.formatThaiFullDate(workDate)}`}
      activePage="dashboard"
      onRealtimeSync={() => loadData(true)}
    >
      {/* Mobile Shortcut Grid (8 iOS-style buttons) */}
      <MobileShortcutGrid />

      {/* Date Selector Bar ABOVE KPI Cards (Original dashboard.html position) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 mb-7 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#00C08A] animate-pulse shadow-[0_0_8px_#00C08A]" />
          <span className="px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs font-extrabold text-[#00744B] dark:text-[#00C08A]">
            <i className="fa-regular fa-calendar-check mr-1.5" />
            {UIHelpers.formatThaiFullDate(workDate)}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-bold"
          />
          <button
            type="button"
            onClick={() => loadData(false)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-xs font-bold"
          >
            <i className="fa-solid fa-rotate mr-1" />รีเฟรช
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3 py-1.5 rounded-xl bg-[#00744B] hover:bg-[#005a3a] text-white text-xs font-bold"
          >
            <i className="fa-solid fa-file-excel mr-1" />ส่งออก Excel
          </button>
        </div>
      </div>

      {/* 5 .material-stat-card KPI Cards with Floating Top-Left Icon Box & Right-Aligned Numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          className={`material-stat-card relative text-right p-4 pt-3 rounded-2xl bg-white dark:bg-slate-900 border transition shadow-sm ${
            statusFilter === 'all' ? 'border-[#00744B] ring-2 ring-emerald-500/20' : 'border-slate-200 dark:border-slate-800'
          }`}
        >
          <div className={`material-stat-icon-box -mt-7 w-12 h-12 rounded-2xl bg-gradient-to-br ${KPI_ICON_BOX.total} text-white shadow-lg flex items-center justify-center`}>
            <i className="fa-solid fa-users text-lg" />
          </div>
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-1">บุคลากรทั้งหมด</p>
          <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white leading-tight mt-0.5">{metrics.total}</p>
          <p className="text-[11px] text-slate-400 mt-1 border-t border-slate-100 dark:border-slate-800 pt-1.5 text-left">
            บันทึกวันนี้ {orgFiltered.length} รายการ
          </p>
        </button>

        {metrics.categories.map((cat) => (
          <button
            key={cat.key}
            type="button"
            onClick={() => setStatusFilter((prev) => (prev === cat.key ? 'all' : cat.key))}
            className={`material-stat-card relative text-right p-4 pt-3 rounded-2xl bg-white dark:bg-slate-900 border transition shadow-sm ${
              statusFilter === cat.key ? 'border-[#00744B] ring-2 ring-emerald-500/20' : 'border-slate-200 dark:border-slate-800'
            }`}
          >
            <div className={`material-stat-icon-box -mt-7 w-12 h-12 rounded-2xl bg-gradient-to-br ${KPI_ICON_BOX[cat.key] || KPI_ICON_BOX.normal} text-white shadow-lg flex items-center justify-center`}>
              <i className={`fa-solid ${cat.icon} text-lg`} />
            </div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-1 truncate">{cat.label}</p>
            <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white leading-tight mt-0.5">{cat.count}</p>
            <div className="mt-1 border-t border-slate-100 dark:border-slate-800 pt-1.5 flex items-center justify-between text-[11px]">
              <span className="font-bold" style={{ color: cat.color }}>{cat.percent}%</span>
              <span className="text-slate-400">ของทั้งหมด</span>
            </div>
          </button>
        ))}
      </div>

      {/* Main Card with Floating Emerald Header (-mt-6) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md overflow-visible">
        <div className="-mt-5 mx-4 px-5 py-4 rounded-2xl bg-gradient-to-r from-[#00351B] via-[#00744B] to-[#00A368] text-white shadow-lg flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-extrabold text-sm sm:text-base flex items-center gap-2">
              <i className="fa-solid fa-table-list" />
              <span>ตารางการลงเวลารายบุคคล ({filtered.length} รายการ)</span>
            </h2>
            <p className="text-[11px] text-emerald-100/90">อัปเดตเรียลไทม์อัตโนมัติ (Tri-Layer Sync)</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/reports')}
            className="px-3.5 py-2 rounded-xl bg-white text-[#00744B] hover:bg-emerald-50 text-xs font-extrabold shadow-xs transition"
          >
            <i className="fa-solid fa-arrow-up-right-from-square mr-1.5" />เปิดหน้ารายงานฉบับเต็ม
          </button>
        </div>

        {/* Option 1 Blended Filters */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
            <div className="lg:col-span-4">
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">ค้นหาชื่อ / ตำแหน่ง / สังกัด</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="พิมพ์คำค้นหา..."
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
              />
            </div>
            <div className="lg:col-span-8">
              <OrgHierarchyFilter bureau={orgFilter.bureau} division={orgFilter.division} workGroup={orgFilter.workGroup} onChange={setOrgFilter} compact />
            </div>
          </div>
        </div>

        {/* Pagination ABOVE Table (Original dashboard.html position, default 5) */}
        {!loading && filtered.length > 0 && (
          <PaginationBar
            totalItems={filtered.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
            pageSizeOptions={[5, 10, 15, 20, 30]}
          />
        )}

        {loading ? (
          <div className="p-10 text-center text-slate-400">
            <i className="fa-solid fa-circle-notch fa-spin text-2xl text-[#00744B] mb-2" />
            <p className="text-sm font-semibold">กำลังโหลดข้อมูลการลงเวลา...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">ไม่พบข้อมูลการลงเวลาตามเงื่อนไขที่เลือก</div>
        ) : (
          <>
            {/* Desktop 7-Column Table (Original: ลำดับ | ชื่อ-นามสกุล | ตำแหน่ง | สังกัด | เวลาเข้างาน | เวลาออกงาน | สถานะ) */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm text-left bma-table">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-4 py-3 w-12 text-center">ลำดับ</th>
                    <th className="px-4 py-3">ชื่อ-นามสกุล</th>
                    <th className="px-4 py-3">ตำแหน่ง</th>
                    <th className="px-4 py-3">สังกัด</th>
                    <th className="px-4 py-3 text-center">เวลาเข้างาน</th>
                    <th className="px-4 py-3 text-center">เวลาออกงาน</th>
                    <th className="px-4 py-3 text-center">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {paginated.map((row, idx) => {
                    const posText = UIHelpers.formatPosition(row.position_title, row.position_level, row.position_type, row.position);
                    return (
                      <tr
                        key={row.id || `${row.personnel_id}-${idx}`}
                        onClick={() => setPreviewRecord(row)}
                        className="hover:bg-emerald-50/40 dark:hover:bg-slate-800/50 transition cursor-pointer"
                      >
                        <td className="px-4 py-3 text-center text-xs text-slate-400 font-mono">{(page - 1) * pageSize + idx + 1}</td>
                        <td className="px-4 py-3 font-bold text-slate-800 dark:text-white">{row.full_name || '-'}</td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{posText}</td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{row.division || '-'}</td>
                        <td className="px-4 py-3 text-center font-mono text-xs font-bold text-[#00744B] dark:text-[#00C08A]">{row.check_in_time || '--:--'}</td>
                        <td className="px-4 py-3 text-center font-mono text-xs font-bold text-sky-600 dark:text-sky-400">{row.check_out_time || '--:--'}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${STATUS_BADGE[row.status_category] || STATUS_BADGE.normal}`}>
                            {row.status_label || row.status || '-'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden divide-y divide-slate-200 dark:divide-slate-800">
              {paginated.map((row, idx) => {
                const posText = UIHelpers.formatPosition(row.position_title, row.position_level, row.position_type, row.position);
                return (
                  <div key={row.id || `${row.personnel_id}-${idx}`} onClick={() => setPreviewRecord(row)} className="p-4 space-y-2 cursor-pointer">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate">{row.full_name || '-'}</p>
                        <p className="text-xs text-slate-500 truncate">{posText}</p>
                        <p className="text-[11px] text-slate-400 truncate">{row.division || '-'}</p>
                      </div>
                      <span className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold ${STATUS_BADGE[row.status_category] || STATUS_BADGE.normal}`}>
                        {row.status_label || row.status || '-'}
                      </span>
                    </div>
                    <div className="text-xs font-mono bg-slate-50 dark:bg-slate-800/70 rounded-xl px-3 py-2 flex justify-between">
                      <span>เข้า <strong className="text-[#00744B]">{row.check_in_time || '--:--'}</strong></span>
                      <span>ออก <strong className="text-sky-600">{row.check_out_time || '--:--'}</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Photo & GPS Detail Modal (Option 1 Enhancement) */}
      <ResponsiveModal
        open={Boolean(previewRecord)}
        onClose={() => setPreviewRecord(null)}
        title={previewRecord?.full_name || 'รายละเอียดการลงเวลา'}
        subtitle={previewRecord ? `${UIHelpers.formatThaiFullDate(previewRecord.work_date || workDate)} · ${previewRecord.shift_name || ''}` : ''}
        icon="fa-location-dot"
        maxWidthClass="max-w-lg"
      >
        {previewRecord && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                <p className="text-xs text-slate-500">เวลาเข้างาน</p>
                <p className="text-lg font-mono font-extrabold text-[#00744B]">{previewRecord.check_in_time || '--:--'}</p>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{previewRecord.check_in_location || 'ไม่ระบุพิกัด'}</p>
              </div>
              <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800">
                <p className="text-xs text-slate-500">เวลาออกงาน</p>
                <p className="text-lg font-mono font-extrabold text-sky-700">{previewRecord.check_out_time || '--:--'}</p>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{previewRecord.check_out_location || 'ยังไม่ลงเวลาออก'}</p>
              </div>
            </div>
            {previewRecord.remark && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
                <span className="font-bold text-slate-500 block mb-0.5">หมายเหตุ:</span>
                <span>{previewRecord.remark}</span>
              </div>
            )}
          </div>
        )}
      </ResponsiveModal>
    </AdminLayout>
  );
}
