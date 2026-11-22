import React, { useState, useMemo } from 'react';
import { UIHelpers } from '../../core/UIHelpers.js';
import { PaginationBar } from '../../components/common/PaginationBar.jsx';

/**
 * MobileHistoryDrawer — 100% Parity with checkin.html Mobile Off-Canvas Drawer (ADR-0004, ADR-0036, ADR-0039)
 * - Dark Emerald Header with user name & position
 * - Symmetrical 2x2 Menu Grid (row-span-2 on "ประวัติลงเวลา" for regular users; 4 tiles for Admin)
 * - SPA 3 Views: 'history' | 'special' | 'correction'
 * - History split: วันปัจจุบัน / ย้อนหลัง (pagination [5, 10, 15, 20, 30] on past only)
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
  correctableLogs,
  onDeleteSpecialRequest,
  onOpenSpecialRequest,
  onRequestTimeCorrection,
  onRefresh,
}) {
  const [view, setView] = useState('history'); // 'history' | 'special' | 'correction'
  const [historyScope, setHistoryScope] = useState('today'); // 'today' | 'past'
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const todayIso = UIHelpers.getTodayISO();
  const scopedHistory = useMemo(() => {
    const base = (historyLogs || []).slice(0, 35);
    return historyScope === 'today'
      ? base.filter((l) => l.work_date === todayIso)
      : base.filter((l) => l.work_date !== todayIso).slice(0, 30);
  }, [historyLogs, historyScope, todayIso]);

  const paginatedHistory = useMemo(() => {
    if (historyScope === 'today') return scopedHistory;
    const start = (page - 1) * pageSize;
    return scopedHistory.slice(start, start + pageSize);
  }, [scopedHistory, historyScope, page, pageSize]);

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
        <div className="px-4 py-3.5 bg-gradient-to-r from-[#00351B] to-[#00744B] text-white flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <p className="font-extrabold text-sm truncate">{user?.full_name || user?.username}</p>
            <p className="text-[11px] text-emerald-100/90 truncate">{posText || user?.role}</p>
          </div>
          <button type="button" onClick={onCloseMobile} className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        {/* 2x2 Menu Grid (row-span-2 for regular users when !isAdmin) */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setView('history')}
            className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition ${!isAdmin ? 'row-span-2 flex-col justify-center text-center' : ''} ${
              view === 'history' ? 'bg-emerald-50 dark:bg-emerald-950/50 border-[#00744B] text-[#00744B]' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
            }`}
          >
            <span className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 flex items-center justify-center shrink-0"><i className="fa-solid fa-table-list" /></span>
            <span>ประวัติลงเวลา</span>
          </button>

          <button
            type="button"
            onClick={() => setView('special')}
            className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition ${
              view === 'special' ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-500 text-indigo-700 dark:text-indigo-300' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
            }`}
          >
            <span className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center shrink-0"><i className="fa-solid fa-file-signature" /></span>
            <span>คำขอพิเศษ</span>
          </button>

          <button
            type="button"
            onClick={() => setView('correction')}
            className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition ${
              view === 'correction' ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-500 text-amber-800 dark:text-amber-300' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
            }`}
          >
            <span className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-700 flex items-center justify-center shrink-0"><i className="fa-solid fa-clock-rotate-left" /></span>
            <span>แก้ไขเวลา ({(correctableLogs || []).length})</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => { onCloseMobile(); onGoAdmin(); }}
              className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs font-bold flex items-center gap-2 transition"
            >
              <span className="w-7 h-7 rounded-lg bg-amber-400 text-slate-950 flex items-center justify-center shrink-0"><i className="fa-solid fa-user-shield" /></span>
              <span>ระบบผู้ดูแล</span>
            </button>
          )}
        </div>

        {/* Sub-Header for Active View */}
        <div className="px-3 py-2 flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900">
          <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
            {view === 'history' && `ประวัติการลงเวลา (${(historyLogs || []).length})`}
            {view === 'special' && `คำขอกรณีพิเศษ (${(specialRequests || []).length})`}
            {view === 'correction' && `รายการขอแก้ไขเวลา (${(correctableLogs || []).length})`}
          </span>
          <div className="flex items-center gap-1.5">
            {view === 'special' && (
              <button
                type="button"
                onClick={() => { onCloseMobile(); onOpenSpecialRequest(); }}
                className="px-2.5 py-1 rounded-lg bg-[#00744B] text-white text-[11px] font-bold"
              >
                <i className="fa-solid fa-plus mr-1" />ยื่นคำขอใหม่
              </button>
            )}
            <button type="button" onClick={onRefresh} className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs">
              <i className="fa-solid fa-rotate" />
            </button>
          </div>
        </div>

        {/* Scrollable SPA View Content */}
        <div className="flex-1 overflow-y-auto">
          {view === 'history' && (
            <>
              <div className="px-3 pt-2 flex gap-1.5 text-[11px] font-bold">
                <button type="button" onClick={() => { setHistoryScope('today'); setPage(1); }} className={`flex-1 py-1.5 rounded-lg border ${historyScope === 'today' ? 'border-[#00744B] bg-emerald-50 dark:bg-emerald-950/40 text-[#00744B]' : 'border-slate-200 dark:border-slate-700 text-slate-500'}`}>
                  วันปัจจุบัน
                </button>
                <button type="button" onClick={() => { setHistoryScope('past'); setPage(1); }} className={`flex-1 py-1.5 rounded-lg border ${historyScope === 'past' ? 'border-[#00744B] bg-emerald-50 dark:bg-emerald-950/40 text-[#00744B]' : 'border-slate-200 dark:border-slate-700 text-slate-500'}`}>
                  ย้อนหลัง (30 รายการ)
                </button>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 mt-2">
                {paginatedHistory.length === 0 ? (
                  <p className="text-center text-xs text-slate-400 py-8">ไม่มีรายการลงเวลา</p>
                ) : (
                  paginatedHistory.map((row) => {
                    const isLate = row.status === 'มาสาย';
                    const isOt = Boolean(row.is_overtime) || row.status === 'ปฏิบัติงานนอกเวลา';
                    return (
                      <div key={row.id} className="p-3 text-xs space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-extrabold text-slate-800 dark:text-white">{UIHelpers.formatThaiShortDate(row.work_date)}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isLate ? 'bg-amber-100 text-amber-800' : isOt ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {row.status || 'ปฏิบัติงานปกติ'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500 truncate">{row.shift_name}</span>
                          <span className="font-mono font-bold text-[#00744B] dark:text-[#00C08A] shrink-0">
                            {UIHelpers.formatTime24(row.check_in_time)} – {row.check_out_time ? UIHelpers.formatTime24(row.check_out_time) : 'รอออกงาน'}
                          </span>
                        </div>
                        {row.check_in_location && (
                          <p className="text-[11px] text-slate-400 truncate">
                            <i className="fa-solid fa-location-dot mr-1" />{row.check_in_location}
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
              {historyScope === 'past' && scopedHistory.length > 0 && (
                <PaginationBar
                  totalItems={scopedHistory.length}
                  page={page}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
                  pageSizeOptions={[5, 10, 15, 20, 30]}
                />
              )}
            </>
          )}

          {view === 'special' && (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {(specialRequests || []).length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <p className="text-xs text-slate-400">ยังไม่มีคำขอกรณีพิเศษ</p>
                  <button
                    type="button"
                    onClick={() => { onCloseMobile(); onOpenSpecialRequest(); }}
                    className="px-3.5 py-1.5 rounded-xl bg-[#00744B] text-white text-xs font-bold"
                  >
                    <i className="fa-solid fa-plus mr-1" />ยื่นคำขอกรณีพิเศษ
                  </button>
                </div>
              ) : (
                specialRequests.map((req) => (
                  <div key={req.id} className="p-3 text-xs space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="font-bold">{UIHelpers.formatThaiShortDate(req.work_date)}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${req.approval_status === 'approved' ? 'bg-emerald-100 text-emerald-700' : req.approval_status === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'}`}>
                        {req.approval_status === 'approved' ? 'อนุมัติแล้ว' : req.approval_status === 'rejected' ? 'ไม่อนุมัติ' : 'รออนุมัติ'}
                      </span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 font-semibold">{req.shift_name} ({UIHelpers.formatTime24(req.check_in_time)} – {UIHelpers.formatTime24(req.check_out_time)})</p>
                    <p className="text-slate-500">{req.remark}</p>
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

          {view === 'correction' && (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {(correctableLogs || []).length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-8">ไม่มีรายการเวลาที่ต้องขอแก้ไข (มาสาย / ออกก่อนเวลา / ลืมออกงาน)</p>
              ) : (
                correctableLogs.map((row) => (
                  <div key={row.id} className="p-3 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold">{UIHelpers.formatThaiShortDate(row.work_date)}</span>
                      <span className="font-mono font-bold text-amber-700 dark:text-amber-300">
                        {UIHelpers.formatTime24(row.check_in_time)} – {row.check_out_time ? UIHelpers.formatTime24(row.check_out_time) : 'ยังไม่ลงออก'}
                      </span>
                    </div>
                    <p className="text-slate-500">{row.shift_name} · {row.status}</p>
                    {row.time_correction_status === 'pending' ? (
                      <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                        <i className="fa-solid fa-hourglass-half mr-1" />รออนุมัติแก้ไขเวลา
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onRequestTimeCorrection(row)}
                        className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold"
                      >
                        <i className="fa-solid fa-clock-rotate-left mr-1" />ยื่นขอแก้ไขเวลา
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
