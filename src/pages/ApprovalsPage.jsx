import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AdminLayout } from '../components/layout/AdminLayout.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { AttendanceModel } from '../models/AttendanceModel.js';
import { PersonnelModel } from '../models/PersonnelModel.js';
import { UIHelpers } from '../core/UIHelpers.js';

const APPROVAL_TABS = [
  { key: 'pending', label: 'รออนุมัติ', icon: 'fa-hourglass-half' },
  { key: 'approved', label: 'อนุมัติแล้ว', icon: 'fa-circle-check' },
  { key: 'rejected', label: 'ไม่อนุมัติ', icon: 'fa-circle-xmark' },
  { key: 'all', label: 'ทั้งหมด', icon: 'fa-list' },
];

/**
 * ApprovalsPage — 100% Parity with legacy approvals.html & ApprovalsController.js
 */
export default function ApprovalsPage() {
  const { user } = useAuth();
  const [statusTab, setStatusTab] = useState('pending');
  const [groupBy, setGroupBy] = useState('division'); // 'division' | 'group'
  const [items, setItems] = useState([]);
  const [pendingTotalCount, setPendingTotalCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const loadItems = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    try {
      const [list, pendingList] = await Promise.all([
        AttendanceModel.getSpecialRequests(user, statusTab),
        statusTab === 'pending'
          ? Promise.resolve(null)
          : AttendanceModel.getSpecialRequests(user, 'pending'),
      ]);
      const validList = Array.isArray(list) ? list : [];
      setItems(validList);
      if (statusTab === 'pending') {
        setPendingTotalCount(validList.length);
      } else if (Array.isArray(pendingList)) {
        setPendingTotalCount(pendingList.length);
      }
      setSelectedIds([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [user, statusTab]);

  useEffect(() => { loadItems(false); }, [loadItems]);

  const normalizedItems = useMemo(() => {
    return items.map((item) => {
      const p = item.personnel || {};
      return {
        ...item,
        bureau: p.bureau || item.bureau || 'ไม่ระบุสำนักงาน/กอง',
        division: p.division || item.division || 'ไม่ระบุส่วน/ฝ่าย',
        work_group: p.work_group || item.work_group || 'ไม่ระบุกลุ่มงาน',
      };
    });
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return normalizedItems;
    return normalizedItems.filter((item) => {
      const p = item.personnel || {};
      const fullName = `${p.prefix || ''}${p.first_name || ''} ${p.last_name || ''}`;
      return `${fullName} ${item.bureau} ${item.division} ${item.work_group} ${item.remark || ''} ${item.offsite_reason || ''} ${item.check_in_location || ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [normalizedItems, search]);

  const grouped = useMemo(
    () => PersonnelModel.groupPersonnel(filtered, groupBy),
    [filtered, groupBy]
  );

  const handleDecision = async (ids, decision) => {
    if (!ids.length || processing) return;
    const label = decision === 'approved' ? 'อนุมัติ' : 'ไม่อนุมัติ';
    const ok = await UIHelpers.confirm(
      `ยืนยัน${label}คำขอกรณีพิเศษ`,
      `ต้องการ${label}จำนวน ${ids.length} รายการใช่หรือไม่?`,
      `ยืนยัน${label}`,
      decision === 'approved' ? 'question' : 'warning'
    );
    if (!ok) return;
    setProcessing(true);
    try {
      const res = await AttendanceModel.processSpecialRequestsBulk(ids, decision, user.id);
      if (res?.success) {
        UIHelpers.showToast(res.message || `${label}เรียบร้อยแล้ว`, 'success');
        await loadItems(true);
      } else {
        await UIHelpers.alert('ไม่สามารถดำเนินการได้', res?.message || 'เกิดข้อผิดพลาด', 'error');
      }
    } finally {
      setProcessing(false);
    }
  };

  const toggleSelect = (id) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const pendingVisibleIds = useMemo(
    () => filtered.filter((i) => i.approval_status === 'pending').map((i) => i.id),
    [filtered]
  );
  const allVisibleSelected =
    pendingVisibleIds.length > 0 && pendingVisibleIds.every((id) => selectedIds.includes(id));

  let desktopSeq = 1;
  let mobileSeq = 1;

  const renderRequestRow = (item, seq) => {
    const p = item.personnel || {};
    const fullName = `${p.prefix || ''}${p.first_name || ''} ${p.last_name || ''}`.trim() || '-';
    const posText = UIHelpers.formatPosition(p.position_title, p.position_level, p.position_type);
    const isPending = item.approval_status === 'pending';

    return (
      <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
        <td className="px-3 py-3 text-center">
          {isPending && (
            <input
              type="checkbox"
              checked={selectedIds.includes(item.id)}
              onChange={() => toggleSelect(item.id)}
            />
          )}
        </td>
        <td className="px-3 py-3 text-center font-mono text-slate-400">{seq}</td>
        <td className="px-3 py-3 font-bold text-slate-800 dark:text-white">{fullName}</td>
        <td className="px-3 py-3">
          <p className="font-semibold">{posText}</p>
          <p className="text-[11px] text-slate-400">{item.division || '-'}</p>
        </td>
        <td className="px-3 py-3 whitespace-nowrap">
          <p className="font-bold">{UIHelpers.formatThaiShortDate(item.work_date)}</p>
          <p className="text-slate-500">{item.shift_name}</p>
          <p className="font-mono text-[#00744B] font-bold">
            {UIHelpers.formatTime24(item.check_in_time)} – {UIHelpers.formatTime24(item.check_out_time)}
          </p>
        </td>
        <td className="px-3 py-3 max-w-[200px]">
          <span
            className={`inline-block px-2 py-0.5 rounded-md font-bold text-[10px] mb-1 ${
              item.location_mode === 'OFFSITE' || item.location_mode === 'offsite'
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-emerald-100 text-emerald-700'
            }`}
          >
            {item.location_mode === 'OFFSITE' || item.location_mode === 'offsite' ? 'นอกสถานที่' : 'ในสถานที่'}
          </span>
          <p className="line-clamp-2 text-slate-600 dark:text-slate-300">{item.check_in_location || '-'}</p>
        </td>
        <td className="px-3 py-3 max-w-[220px] space-y-1">
          <span className="inline-block px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-semibold border border-amber-200/70">
            {item.remark || '-'}
          </span>
          {item.offsite_reason && (
            <p className="text-[11px] text-indigo-700 dark:text-indigo-300 font-medium">{item.offsite_reason}</p>
          )}
        </td>
        <td className="px-3 py-3 text-center">
          {isPending ? (
            <div className="inline-flex items-center gap-1.5">
              <button
                type="button"
                title="อนุมัติ"
                disabled={processing}
                onClick={() => handleDecision([item.id], 'approved')}
                className="w-8.5 h-8.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shadow-xs"
              >
                <i className="fa-solid fa-check" />
              </button>
              <button
                type="button"
                title="ไม่อนุมัติ"
                disabled={processing}
                onClick={() => handleDecision([item.id], 'rejected')}
                className="w-8.5 h-8.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center shadow-xs"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
          ) : (
            <span
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                item.approval_status === 'approved'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-rose-100 text-rose-700'
              }`}
            >
              {item.approval_status === 'approved' ? 'อนุมัติแล้ว' : 'ไม่อนุมัติ'}
            </span>
          )}
        </td>
      </tr>
    );
  };

  return (
    <AdminLayout
      title="อนุมัติคำขอลงเวลากรณีพิเศษ"
      subtitle="พิจารณาคำขอลงเวลานอกสถานที่ / กรณีพิเศษในขอบเขตสังกัด"
      activePage="approvals"
      onRealtimeSync={() => loadItems(true)}
    >
      <div className="pt-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md overflow-visible">
          {/* Floating Emerald Header (-mt-6) with Persistent Pending Badge & Bulk Actions Always Visible */}
          <div className="-mt-6 mx-4 px-5 py-4 rounded-2xl bg-gradient-to-r from-[#00351B] via-[#00744B] to-[#00A368] text-white shadow-lg flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <i className="fa-solid fa-clipboard-check text-lg" />
              <div>
                <h2 className="font-extrabold text-sm sm:text-base flex items-center gap-2">
                  <span>รายการคำขอลงเวลากรณีพิเศษ</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-xs font-extrabold">
                    {pendingTotalCount} รออนุมัติ
                  </span>
                </h2>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={processing || selectedIds.length === 0}
                onClick={() => handleDecision(selectedIds, 'approved')}
                className="px-3 py-1.5 rounded-xl bg-white text-[#00744B] text-xs font-extrabold shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="fa-solid fa-check-double mr-1" />อนุมัติที่เลือก ({selectedIds.length})
              </button>
              <button
                type="button"
                disabled={processing || selectedIds.length === 0}
                onClick={() => handleDecision(selectedIds, 'rejected')}
                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="fa-solid fa-xmark mr-1" />ไม่อนุมัติที่เลือก
              </button>
              <button
                type="button"
                onClick={() => loadItems(false)}
                className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold"
              >
                <i className="fa-solid fa-rotate mr-1" />รีเฟรช
              </button>
            </div>
          </div>

          {/* Filter & Group By Bar */}
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {APPROVAL_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setStatusTab(t.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                    statusTab === t.key
                      ? 'bg-[#00744B] text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <i className={`fa-solid ${t.icon}`} />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value)}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold"
              >
                <option value="division">มุมมองที่ 1: สำนักงาน/กอง &gt; ส่วน/ฝ่าย</option>
                <option value="group">มุมมองที่ 2: สำนักงาน/กอง &gt; ส่วน/ฝ่าย &gt; กลุ่มงาน</option>
              </select>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาชื่อ / เหตุผล / สถานที่..."
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs w-52"
              />
            </div>
          </div>

          {/* Mobile Select All Bar (#approvalsSelectAllMobileBar) */}
          {pendingVisibleIds.length > 0 && (
            <div
              id="approvalsSelectAllMobileBar"
              className="lg:hidden px-4 py-2.5 bg-emerald-50/70 dark:bg-emerald-950/30 border-b border-emerald-200/70 dark:border-emerald-800 flex items-center justify-between text-xs font-bold"
            >
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(e) => setSelectedIds(e.target.checked ? pendingVisibleIds : [])}
                />
                <span>เลือกทั้งหมด ({pendingVisibleIds.length} รายการ)</span>
              </label>
              {selectedIds.length > 0 && <span className="text-[#00744B]">เลือกแล้ว {selectedIds.length}</span>}
            </div>
          )}

          {loading ? (
            <div className="p-10 text-center text-slate-400">
              <i className="fa-solid fa-circle-notch fa-spin text-2xl text-[#00744B] mb-2" />
              <p className="text-sm font-semibold">กำลังโหลดคำขอกรณีพิเศษ...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">ไม่มีรายการคำขอกรณีพิเศษในหมวดนี้</div>
          ) : (
            <>
              {/* Desktop 8-Column Grouped Table (NO Pagination) */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-xs text-left bma-table">
                  <thead className="bg-slate-100 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 font-extrabold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="px-3 py-3 w-10 text-center">
                        {pendingVisibleIds.length > 0 && (
                          <input
                            type="checkbox"
                            checked={allVisibleSelected}
                            onChange={(e) => setSelectedIds(e.target.checked ? pendingVisibleIds : [])}
                          />
                        )}
                      </th>
                      <th className="px-3 py-3 w-12 text-center">ลำดับ</th>
                      <th className="px-3 py-3">ชื่อ-นามสกุล</th>
                      <th className="px-3 py-3">ตำแหน่ง / สังกัด</th>
                      <th className="px-3 py-3">วันที่ขอ / ช่วงเวลา</th>
                      <th className="px-3 py-3">พิกัดสถานที่</th>
                      <th className="px-3 py-3">หมายเหตุ (2 บรรทัด)</th>
                      <th className="px-3 py-3 text-center">คำสั่ง</th>
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
                            <tr className="bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-l-4 border-indigo-500">
                              <td colSpan={8} className="font-bold text-xs sm:text-sm py-2.5 px-4">
                                <i className="fa-solid fa-building-user mr-1.5" />
                                {bureauName} &gt; {divisionName} ({divCount} รายการ)
                              </td>
                            </tr>
                            {groupBy === 'group'
                              ? Object.entries(content || {}).map(([groupName, members]) => {
                                  const memberList = Array.isArray(members) ? members : [];
                                  return (
                                    <React.Fragment key={`${bureauName}-${divisionName}-${groupName}`}>
                                      <tr className="bg-slate-100/80 dark:bg-slate-800/50">
                                        <td colSpan={8} className="font-semibold text-xs py-2 pl-8 text-slate-700 dark:text-slate-200">
                                          <i className="fa-solid fa-layer-group mr-1.5 text-indigo-600" />
                                          กลุ่มงาน: {groupName} ({memberList.length} รายการ)
                                        </td>
                                      </tr>
                                      {memberList.map((item) => renderRequestRow(item, desktopSeq++))}
                                    </React.Fragment>
                                  );
                                })
                              : (Array.isArray(content) ? content : []).map((item) => renderRequestRow(item, desktopSeq++))}
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
                        <div className="rounded-xl px-3.5 py-2 font-bold text-xs bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-l-4 border-indigo-500">
                          <i className="fa-solid fa-building-user mr-1.5" />
                          {bureauName} &gt; {divisionName} ({divCount} รายการ)
                        </div>
                        {flatMembers.map((item) => {
                          const seq = mobileSeq++;
                          const p = item.personnel || {};
                          const fullName = `${p.prefix || ''}${p.first_name || ''} ${p.last_name || ''}`.trim() || '-';
                          const isPending = item.approval_status === 'pending';
                          return (
                            <div key={item.id} className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 space-y-2.5">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2.5">
                                  {isPending && (
                                    <input
                                      type="checkbox"
                                      className="mt-1"
                                      checked={selectedIds.includes(item.id)}
                                      onChange={() => toggleSelect(item.id)}
                                    />
                                  )}
                                  <div>
                                    <p className="font-bold text-sm">
                                      <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 mr-1.5 rounded bg-slate-100 dark:bg-slate-700 text-[11px] font-extrabold">
                                        {seq}
                                      </span>
                                      {fullName}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      {UIHelpers.formatThaiShortDate(item.work_date)} · {item.shift_name}
                                    </p>
                                  </div>
                                </div>
                                <span className="font-mono text-xs font-bold text-[#00744B]">
                                  {UIHelpers.formatTime24(item.check_in_time)}–{UIHelpers.formatTime24(item.check_out_time)}
                                </span>
                              </div>
                              <div className="text-xs bg-slate-50 dark:bg-slate-800/80 rounded-xl p-2.5 space-y-1">
                                <p className="font-semibold text-amber-700 dark:text-amber-300">{item.remark || '-'}</p>
                                {item.offsite_reason && (
                                  <p className="text-indigo-600 dark:text-indigo-300">{item.offsite_reason}</p>
                                )}
                                <p className="text-slate-500">{item.check_in_location || '-'}</p>
                              </div>
                              {isPending && (
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    disabled={processing}
                                    onClick={() => handleDecision([item.id], 'approved')}
                                    className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"
                                  >
                                    อนุมัติ
                                  </button>
                                  <button
                                    type="button"
                                    disabled={processing}
                                    onClick={() => handleDecision([item.id], 'rejected')}
                                    className="flex-1 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold"
                                  >
                                    ไม่อนุมัติ
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
      </div>
    </AdminLayout>
  );
}
