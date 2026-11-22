import React, { useState, useEffect } from 'react';
import { ResponsiveModal } from '../../components/common/ResponsiveModal.jsx';
import { AttendanceModel } from '../../models/AttendanceModel.js';
import { UIHelpers } from '../../core/UIHelpers.js';

/**
 * TimeCorrectionModal (ADR-0039)
 * Allows users to select an abnormal attendance log (late/absent_duty) and request leg-selective correction.
 */
export function TimeCorrectionModal({ open, onClose, user, settings, onSubmitted }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);
    setSelectedId('');
    setReason('');
    AttendanceModel.getPersonalTimeCorrectionLogs(user.personnel_id, user.id, settings)
      .then((list) => {
        const eligible = (list || []).filter((l) => l.canRequestCorrection !== false && l.correction_status !== 'pending');
        setLogs(eligible);
      })
      .finally(() => setLoading(false));
  }, [open, user, settings]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedId) {
      await UIHelpers.alert('กรุณาเลือกรายการ', 'โปรดเลือกวันที่ต้องการขอแก้ไขเวลา', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      const res = await AttendanceModel.submitTimeCorrectionRequest(selectedId, user, reason.trim());
      if (res?.success) {
        UIHelpers.showToast(res.message || 'ส่งคำขอแก้ไขเวลาเรียบร้อยแล้ว', 'success');
        onSubmitted?.();
        onClose();
      } else {
        await UIHelpers.alert('ไม่สามารถส่งคำขอได้', res?.message || 'เกิดข้อผิดพลาด', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      title="ส่งคำขอแก้ไขเวลาเข้า-ออกงาน"
      subtitle="เลือกวันที่ที่มีสถานะมาสายหรือขาดราชการเพื่อขอปรับเฉพาะขาที่ผิดปกติ"
      icon="fa-clock-rotate-left"
      maxWidthClass="max-w-lg"
      footer={
        <>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-semibold">ยกเลิก</button>
          <button type="submit" form="formTimeCorrection" disabled={submitting || !selectedId} className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold disabled:opacity-50">
            {submitting ? 'กำลังส่งคำขอ...' : 'ส่งคำขอแก้ไขเวลา'}
          </button>
        </>
      }
    >
      <form id="formTimeCorrection" onSubmit={handleSubmit} className="space-y-4 text-sm">
        {loading ? (
          <p className="text-center text-xs text-slate-400 py-6">กำลังตรวจสอบประวัติที่สามารถขอแก้ไขได้...</p>
        ) : logs.length === 0 ? (
          <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 text-center">
            <i className="fa-solid fa-circle-check text-xl mb-1 block" />
            ไม่พบรายการลงเวลาที่ผิดปกติสำหรับขอแก้ไขเวลา
          </div>
        ) : (
          <>
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {logs.map((log) => (
                <label
                  key={log.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                    String(selectedId) === String(log.id)
                      ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/30'
                      : 'border-slate-200 dark:border-slate-700 hover:border-amber-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="tcLogId"
                    value={log.id}
                    checked={String(selectedId) === String(log.id)}
                    onChange={() => setSelectedId(log.id)}
                    className="mt-1 accent-amber-600"
                  />
                  <div className="min-w-0 flex-1 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold">{UIHelpers.formatThaiShortDate(log.work_date)}</span>
                      <span className="font-mono text-rose-600 dark:text-rose-400 font-bold">
                        {log.check_in_time || '--:--'} / {log.check_out_time || '--:--'}
                      </span>
                    </div>
                    <p className="text-slate-500">{log.shift_name} · {log.status || log.status_label}</p>
                  </div>
                </label>
              ))}
            </div>

            <div>
              <label className="block text-xs font-bold mb-1">เหตุผลในการขอแก้ไขเวลา *</label>
              <textarea
                rows={3}
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="เช่น ติดภารกิจราชการเร่งด่วน / ลืมลงเวลาออกงาน..."
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
              />
            </div>
          </>
        )}
      </form>
    </ResponsiveModal>
  );
}
