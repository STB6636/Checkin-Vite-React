import React, { useState, useMemo } from 'react';
import { UIHelpers } from '../../core/UIHelpers.js';
import { PaginationBar } from '../../components/common/PaginationBar.jsx';

/**
 * MobileHistoryDrawer — 100% Parity with checkin.html Mobile Off-Canvas Drawer (ADR-0004, ADR-0036, ADR-0039)
 * - Dark Emerald Header with user name & position
 * - Symmetrical 2x2 Menu Grid (คำขอพิเศษ, ประวัติการลงเวลา, แก้ไขเวลา, ระบบผู้ดูแล)
 * - History split: วันปัจจุบัน / ย้อนหลัง (default 10 rows)
 * - Sticky Footer with 2 buttons (โหมดถนอมสายตา / ออกจากระบบ)
 */
export function MobileHistoryDrawer({
  mobileOpen,
  onCloseMobile,
  user,
  isAdmin,
  isDark,
  onToggleTheme,
  onGoAdmin,
  onLogout,
  historyLogs,
  specialRequests,
  onDeleteSpecialRequest,
  onOpenSpecialRequest,
  onOpenTimeCorrection,
  onRefresh,
}) {
  const [view, setView] = useState('menu'); // 'menu' | 'history' | 'special'
  const [historyScope, setHistoryScope] = useState('today'); // 'today' | 'past'
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const todayIso = UIHelpers.getTodayISO();
  const scopedHistory = useMemo(() => {
    const base = (historyLogs || []).slice(0, 30);
    return historyScope === 'today'
      ? base.filter((l) => l.work_date === todayIso)
      : base.filter((l) => l.work_date !== todayIso);
  }, [historyLogs, historyScope, todayIso]);

  const paginatedHistory = useMemo(() => {
    const start = (page - 1) * pageSize;
    return scopedHistory.slice(start, start + pageSize);
  }, [scopedHistory, page, pageSize]);

  if (!mobileOpen) return null;

  const posText = UIHelpers.formatPosition(
    user?.personnel?.position_title,
    user?.personnel?.position_level,
    user?.personnel?.position_type
  );

  return (
    <div className="fixed inset-0 z-[9980] lg:hidden flex justify-end">
      <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs" onClick={onCloseMobile} />
      <div className="relative w-full max-w-sm h-full bg-white dark:bg-slate-900 shadow-2xl z-10 flex flex-col overflow-hidden">
        {/* Dark Emerald Header */}
        <div className="px-4 py-4 bg-gradient-to-r from-[#00351B] to-[#00744B] text-white flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <p className="font-extrabold text-sm truncate">{user?.full_name || user?.username}</p>
            <p className="text-[11px] text-emerald-100/90 truncate">{posText || user?.role}</p>
          </div>
          <button type="button" onClick={onCloseMobile} className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        {/* Symmetrical 2x2 Menu Grid */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => { onCloseMobile(); onOpenSpecialRequest(); }}
            className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-xs font-bold flex items-center gap-2 transition"
          >
            <span className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center"><i className="fa-solid fa-file-signature" /></span>
            <span>คำขอพิเศษ</span>
          </button>
          <button
            type="button"
            onClick={() => setView(view === 'history' ? 'special' : 'history')}
            className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition ${
              view === 'history' ? 'bg-emerald-50 dark:bg-emerald-950/50 border-[#00744B] text-[#00744B]' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
            }`}
          >
            <span className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 flex items-center justify-center"><i className="fa-solid fa-table-list" /></span>
            <span>ประวัติลงเวลา</span>
          </button>
          <button
            type="button"
            onClick={() => { onCloseMobile(); onOpenTimeCorrection(); }}
            className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-amber-400 text-xs font-bold flex items-center gap-2 transition"
          >
            <span className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-700 flex items-center justify-center"><i className="fa-solid fa-clock-rotate-left" /></span>
            <span>แก้ไขเวลา</span>
          </button>
          {isAdmin ? (
            <button
              type="button"
              onClick={() => { onCloseMobile(); onGoAdmin(); }}
              className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs font-bold flex items-center gap-2 transition"
            >
              <span className="w-7 h-7 rounded-lg bg-amber-400 text-slate-950 flex items-center justify-center"><i className="fa-solid fa-user-shield" /></span>
              <span>ระบบผู้ดูแล</span>
            </button>
          ) : (
            <a
              href="./docs/manual/index.html"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center gap-2 transition"
            >
              <span className="w-7 h-7 rounded-lg bg-sky-100 dark:bg-sky-950/60 text-sky-700 flex items-center justify-center"><i className="fa-solid fa-book-open" /></span>
              <span>คู่มือใช้งาน</span>
            </a>
          )}
        </div>

        {/* Sub-Tabs */}
        <div className="px-3 pt-2.5 pb-2 flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex gap-1.5 text-xs font-bold">
            <button type="button" onClick={() => setView('history')} className={`px-2.5 py-1 rounded-lg ${view !== 'special' ? 'bg-[#00744B] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
              ประวัติ ({(historyLogs || []).length})
            </button>
            <button type="button" onClick={() => setView('special')} className={`px-2.5 py-1 rounded-lg ${view === 'special' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
              คำขอพิเศษ ({(specialRequests || []).length})
            </button>
          </div>
          <button type="button" onClick={onRefresh} className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs">
            <i className="fa-solid fa-rotate" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          {view !== 'special' ? (
            <>
              <div className="px-3 pt-2 flex gap-1.5 text-[11px] font-bold">
                <button type="button" onClick={() => { setHistoryScope('today'); setPage(1); }} className={`flex-1 py-1.5 rounded-lg border ${historyScope === 'today' ? 'border-[#00744B] bg-emerald-50 dark:bg-emerald-950/40 text-[#00744B]' : 'border-slate-200 dark:border-slate-700 text-slate-500'}`}>
                  วันปัจจุบัน
                </button>
                <button type="button" onClick={() => { setHistoryScope('past'); setPage(1); }} className={`flex-1 py-1.5 rounded-lg border ${historyScope === 'past' ? 'border-[#00744B] bg-emerald-50 dark:bg-emerald-950/40 text-[#00744B]' : 'border-slate-200 dark:border-slate-700 text-slate-500'}`}>
                  ย้อนหลัง
                </button>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 mt-2">
                {paginatedHistory.length === 0 ? (
                  <p className="text-center text-xs text-slate-400 py-8">ไม่มีรายการลงเวลา</p>
                ) : (
                  paginatedHistory.map((row) => (
                    <div key={row.id} className="p-3 text-xs space-y-1">
                      <div className="flex justify-between font-bold">
                        <span>{UIHelpers.formatThaiShortDate(row.work_date)}</span>
                        <span className="font-mono text-[#00744B] dark:text-[#00C08A]">
                          {UIHelpers.formatTime24(row.check_in_time)} – {UIHelpers.formatTime24(row.check_out_time)}
                        </span>
                      </div>
                      <p className="text-slate-500">{row.shift_name} · {row.status}</p>
                      {row.check_in_location && <p className="text-[11px] text-slate-400 truncate">{row.check_in_location}</p>}
                    </div>
                  ))
                )}
              </div>
              {scopedHistory.length > pageSize && (
                <PaginationBar totalItems={scopedHistory.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} pageSizeOptions={[5, 10, 15, 20, 30]} />
              )}
            </>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {(specialRequests || []).length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-8">ยังไม่มีคำขอกรณีพิเศษ</p>
              ) : (
                specialRequests.map((req) => (
                  <div key={req.id} className="p-3 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="font-bold">{UIHelpers.formatThaiShortDate(req.work_date)}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${req.approval_status === 'approved' ? 'bg-emerald-100 text-emerald-700' : req.approval_status === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'}`}>
                        {req.approval_status === 'approved' ? 'อนุมัติแล้ว' : req.approval_status === 'rejected' ? 'ไม่อนุมัติ' : 'รออนุมัติ'}
                      </span>
                    </div>
                    <p className="text-slate-500">{req.shift_name} · {req.remark}</p>
                    {req.approval_status === 'pending' && (
                      <button type="button" onClick={() => onDeleteSpecialRequest(req)} className="text-rose-600 font-bold text-[11px] hover:underline">
                        <i className="fa-solid fa-trash mr-1" />ยกเลิกคำขอ
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Sticky 2-Button Footer (Theme + Logout) */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 grid grid-cols-2 gap-2 shrink-0">
          <button type="button" onClick={onToggleTheme} className="py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold">
            <i className={`fa-solid ${isDark ? 'fa-sun text-amber-400' : 'fa-moon'} mr-1.5`} />
            {isDark ? 'โหมดสว่าง' : 'โหมดถนอมสายตา'}
          </button>
          <button type="button" onClick={() => { onCloseMobile(); onLogout(); }} className="py-2 rounded-xl bg-rose-600 text-white text-xs font-bold">
            <i className="fa-solid fa-right-from-bracket mr-1.5" />ออกจากระบบ
          </button>
        </div>
      </div>
    </div>
  );
}
