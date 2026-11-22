import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AdminLayout } from '../components/layout/AdminLayout.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { AttendanceModel } from '../models/AttendanceModel.js';
import { PersonnelModel } from '../models/PersonnelModel.js';
import { UIHelpers } from '../core/UIHelpers.js';

const TABS = [
  { key: 'pending', label: 'รออนุมัติ', icon: 'fa-hourglass-half' },
  { key: 'approved', label: 'อนุมัติแล้ว', icon: 'fa-circle-check' },
  { key: 'rejected', label: 'ไม่อนุมัติ', icon: 'fa-circle-xmark' },
  { key: 'all', label: 'ทั้งหมด', icon: 'fa-list' },
];

/**
 * TimeCorrectionsPage — 100% Parity with legacy time-corrections.html & TimeCorrectionsController.js
 */
export default function TimeCorrectionsPage() {
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
        AttendanceModel.getTimeCorrectionRequests(user, statusTab),
        statusTab === 'pending'
          ? Promise.resolve(null)
          : AttendanceModel.getTimeCorrectionRequests(user, 'pending'),
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
      const name = `${p.prefix || ''}${p.first_name || ''} ${p.last_name || ''}`;
      return `${name} ${item.bureau} ${item.division} ${item.work_group} ${item.correction_request_reason || ''} ${item.shift_name || ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [normalizedItems, search]);

  const grouped = useMemo(
    () => PersonnelModel.groupPersonnel(filtered, groupBy),
    [filtered, groupBy]
  );

  const selectableVisibleIds = useMemo(
    () =>
      filtered
        .filter((i) => i.correction_status === 'pending' && i.approvalPermission?.allowed)
        .map((i) => i.id),
    [filtered]
  );
  const allVisibleSelected =
    selectableVisibleIds.length > 0 &&
    selectableVisibleIds.every((id) => selectedIds.includes(id));

  const toggleSelect = (id) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleBulkDecision = async (ids, decision) => {
    if (!ids.length || processing) return;
    let rejectReason = '';
    if (decision === 'approved') {
      const ok = await UIHelpers.confirm(
        'ยืนยันอนุมัติแก้ไขเวลา',
        `ต้องการอนุมัติจำนวน ${ids.length} รายการ (ปรับเฉพาะขาที่ผิดปกติ + ต่อท้าย "(แก้ไขเวลา)") ใช่หรือไม่?`,
        'ยืนยันอนุมัติ',
        'question'
      );
      if (!ok) return;
    } else {
      const modalRes = await UIHelpers.confirmWithInput('ระบุเหตุผลการไม่อนุมัติ (ไม่บังคับ)', {
        text: `คุณกำลังจะไม่อนุมัติคำขอแก้ไขเวลาจำนวน ${ids.length} รายการ`,
        inputPlaceholder: 'ระบุเหตุผล เช่น ข้อมูลไม่ตรงกับตารางเวร...',
        confirmText: 'ยืนยันไม่อนุมัติ',
        icon: 'warning',
      });
      if (!modalRes?.isConfirmed) return;
      rejectReason = modalRes.value || '';
    }

    setProcessing(true);
    try {
      const res = await AttendanceModel.processTimeCorrectionsBulk(ids, decision, user, rejectReason);
      if (res?.success) {
        UIHelpers.showToast(res.message || 'ดำเนินการเรียบร้อยแล้ว', 'success');
        await loadItems(true);
      } else {
        await UIHelpers.alert('ไม่สามารถดำเนินการได้', res?.message || 'เกิดข้อผิดพลาด', 'error');
      }
    } finally {
      setProcessing(false);
    }
  };

  const renderTimeCompareNode = (item) => {
    const preview = item.preview || {};
    const origIn = item.correction_original_check_in || item.check_in_time || '-';
    const origOut = item.correction_original_check_out || item.check_out_time || 'ไม่ออกงาน';
    const targetIn = preview.newCheckIn || item.check_in_time || '-';
    const targetOut = preview.newCheckOut || item.check_out_time || 'ไม่ออกงาน';

    const inChanged = Boolean(
      preview.checkInNeedsFix || (item.correction_status === 'approved' && origIn !== targetIn)
    );
    const outChanged = Boolean(
      preview.checkOutNeedsFix || (item.correction_status === 'approved' && origOut !== targetOut)
    );

    return (
      <div className="space-y-0.5 font-mono text-xs whitespace-nowrap">
        <div>
          <span className="text-slate-500 mr-1">เข้า:</span>
          {inChanged ? (
            <>
              <span className="line-through text-rose-500 mr-1">{origIn}</span>
              <span>→</span>
              <span className="font-extrabold text-[#00744B] dark:text-emerald-400 ml-1">
                {targetIn} น.
              </span>
            </>
          ) : (
            <span className="font-semibold">
              {origIn}
              {origIn !== '-' ? ' น.' : ''}
            </span>
          )}
        </div>
        <div>
          <span className="text-slate-500 mr-1">ออก:</span>
          {outChanged ? (
            <>
              <span className="line-through text-rose-500 mr-1">{origOut}</span>
              <span>→</span>
              <span className="font-extrabold text-[#00744B] dark:text-emerald-400 ml-1">
                {targetOut} น.
              </span>
            </>
          ) : (
            <span className="font-semibold">
              {origOut}
              {origOut !== 'ไม่ออกงาน' && origOut !== '-' ? ' น.' : ''}
            </span>
          )}
        </div>
      </div>
    );
  };

  let desktopSeq = 1;
  let mobileSeq = 1;

  const renderCorrectionRow = (item, seq) => {
    const p = item.personnel || {};
    const fullName = `${p.prefix || ''}${p.first_name || ''} ${p.last_name || ''}`.trim() || '-';
    const posText = UIHelpers.formatPosition(p.position_title, p.position_level, p.position_type);
    const isPending = item.correction_status === 'pending';
    const perm = item.approvalPermission || { allowed: false, reason: 'ไม่มีสิทธิ์' };

    return (
      <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
        <td className="px-3 py-3 text-center">
          {isPending && perm.allowed && (
            <input
              type="checkbox"
              checked={selectedIds.includes(item.id)}
              onChange={() => toggleSelect(item.id)}
            />
          )}
        </td>
        <td className="px-3 py-3 text-center font-mono text-slate-400">{seq}</td>
        <td className="px-3 py-3">
          <span className="font-bold text-slate-800 dark:text-white">{fullName}</span>
          {item.requester_role && item.requester_role !== 'User' && (
            <span className="ml-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-700">
              {item.requester_role}
            </span>
          )}
        </td>
        <td className="px-3 py-3">
          <p className="font-semibold">{posText}</p>
          <p className="text-[11px] text-slate-400">{item.division || '-'}</p>
        </td>
        <td className="px-3 py-3 whitespace-nowrap">
          <p className="font-bold">{UIHelpers.formatThaiShortDate(item.work_date)}</p>
          <p className="text-slate-500">{item.shift_name}</p>
        </td>
        <td className="px-3 py-3">{renderTimeCompareNode(item)}</td>
        <td className="px-3 py-3 max-w-[220px]">
          <p>{item.correction_request_reason || '-'}</p>
          {item.correction_reject_reason && (
            <p className="text-rose-600 mt-1">ไม่อนุมัติ: {item.correction_reject_reason}</p>
          )}
        </td>
        <td className="px-3 py-3 text-center">
          {isPending ? (
            perm.allowed ? (
              <div className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  title="อนุมัติ"
                  disabled={processing}
                  onClick={() => handleBulkDecision([item.id], 'approved')}
                  className="w-8.5 h-8.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shadow-xs"
                >
                  <i className="fa-solid fa-check" />
                </button>
                <button
                  type="button"
                  title="ไม่อนุมัติ"
                  disabled={processing}
                  onClick={() => handleBulkDecision([item.id], 'rejected')}
                  className="w-8.5 h-8.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center shadow-xs"
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-300/60 text-[10px] font-bold">
                <i className="fa-solid fa-lock" />
                {perm.reason}
              </span>
            )
          ) : (
            <span
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                item.correction_status === 'approved'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-rose-100 text-rose-700'
              }`}
            >
              {item.correction_status === 'approved' ? 'อนุมัติแล้ว' : 'ไม่อนุมัติ'}
            </span>
          )}
        </td>
      </tr>
    );
  };

  return (
    <AdminLayout
      title="อนุมัติคำขอแก้ไขเวลาเข้า-ออกงาน"
      subtitle="ปรับเฉพาะขาที่ผิดปกติพร้อม Double-Layer Executive RBAC (ADR-0039)"
      activePage="time-corrections"
      onRealtimeSync={() => loadItems(true)}
    >
      <div className="pt-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md overflow-visible">
          {/* Floating Emerald Header (-mt-6) + Persistent Pending Badge + Bulk Buttons Always Visible */}
          <div className="-mt-6 mx-4 px-5 py-4 rounded-2xl bg-gradient-to-r from-[#00351B] via-[#00744B] to-[#00A368] text-white shadow-lg flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <i className="fa-solid fa-clock-rotate-left text-lg" />
              <h2 className="font-extrabold text-sm sm:text-base flex items-center gap-2">
                <span>รายการคำขอแก้ไขเวลาเข้า-ออกงาน</span>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-xs font-extrabold">
                  {pendingTotalCount} รออนุมัติ
                </span>
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={processing || selectedIds.length === 0}
                onClick={() => handleBulkDecision(selectedIds, 'approved')}
                className="px-3 py-1.5 rounded-xl bg-white text-[#00744B] text-xs font-extrabold shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="fa-solid fa-check-double mr-1" />อนุมัติที่เลือก ({selectedIds.length})
              </button>
              <button
                type="button"
                disabled={processing || selectedIds.length === 0}
                onClick={() => handleBulkDecision(selectedIds, 'rejected')}
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
              {TABS.map((t) => (
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
                placeholder="ค้นหาชื่อ / เหตุผล..."
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs w-52"
              />
            </div>
          </div>

          {/* Mobile Select All Bar (#correctionsSelectAllMobileBar) */}
          {selectableVisibleIds.length > 0 && (
            <div
              id="correctionsSelectAllMobileBar"
              className="lg:hidden px-4 py-2.5 bg-emerald-50/70 dark:bg-emerald-950/30 border-b border-emerald-200/70 dark:border-emerald-800 flex items-center justify-between text-xs font-bold"
            >
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(e) => setSelectedIds(e.target.checked ? selectableVisibleIds : [])}
                />
                <span>เลือกทั้งหมดที่อนุมัติได้ ({selectableVisibleIds.length} รายการ)</span>
              </label>
              {selectedIds.length > 0 && <span className="text-[#00744B]">เลือกแล้ว {selectedIds.length}</span>}
            </div>
          )}

          {loading ? (
            <div className="p-10 text-center text-slate-400">
              <i className="fa-solid fa-circle-notch fa-spin text-2xl text-[#00744B] mb-2" />
              <p className="text-sm font-semibold">กำลังโหลดคำขอแก้ไขเวลา...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">ไม่มีคำขอแก้ไขเวลาในหมวดนี้</div>
          ) : (
            <>
              {/* Desktop 8-Column Grouped Table (NO Pagination) */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-xs text-left bma-table">
                  <thead className="bg-slate-100 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 font-extrabold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="px-3 py-3 w-10 text-center">
                        {selectableVisibleIds.length > 0 && (
                          <input
                            type="checkbox"
                            checked={allVisibleSelected}
                            onChange={(e) => setSelectedIds(e.target.checked ? selectableVisibleIds : [])}
                          />
                        )}
                      </th>
                      <th className="px-3 py-3 w-12 text-center">ลำดับ</th>
                      <th className="px-3 py-3">ชื่อ-นามสกุล</th>
                      <th className="px-3 py-3">ตำแหน่ง / สังกัด</th>
                      <th className="px-3 py-3">วันที่ / กะ</th>
                      <th className="px-3 py-3">เวลาเดิม → หลังอนุมัติ</th>
                      <th className="px-3 py-3">เหตุผลคำขอ</th>
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
                                      {memberList.map((item) => renderCorrectionRow(item, desktopSeq++))}
                                    </React.Fragment>
                                  );
                                })
                              : (Array.isArray(content) ? content : []).map((item) => renderCorrectionRow(item, desktopSeq++))}
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
                          const isPending = item.correction_status === 'pending';
                          const perm = item.approvalPermission || { allowed: false, reason: 'ไม่มีสิทธิ์' };
                          return (
                            <div key={item.id} className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 space-y-2.5">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2.5">
                                  {isPending && perm.allowed && (
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
                              </div>
                              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80">
                                {renderTimeCompareNode(item)}
                              </div>
                              <p className="text-xs text-slate-600 dark:text-slate-300">
                                เหตุผล: {item.correction_request_reason || '-'}
                              </p>
                              {isPending &&
                                (perm.allowed ? (
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      disabled={processing}
                                      onClick={() => handleBulkDecision([item.id], 'approved')}
                                      className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"
                                    >
                                      อนุมัติ
                                    </button>
                                    <button
                                      type="button"
                                      disabled={processing}
                                      onClick={() => handleBulkDecision([item.id], 'rejected')}
                                      className="flex-1 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold"
                                    >
                                      ไม่อนุมัติ
                                    </button>
                                  </div>
                                ) : (
                                  <p className="text-[11px] text-amber-600 dark:text-amber-400 font-bold">
                                    <i className="fa-solid fa-lock mr-1" />
                                    {perm.reason}
                                  </p>
                                ))}
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
