import React, { useState, useEffect } from 'react';
import { UIHelpers } from '../../core/UIHelpers.js';

const CARD_STYLES = [
  { bg: 'bg-emerald-50/90 dark:bg-emerald-950/40', border: 'border-emerald-200 dark:border-emerald-800/70', iconBg: 'bg-emerald-600', icon: 'fa-circle-check' },
  { bg: 'bg-sky-50/90 dark:bg-sky-950/40', border: 'border-sky-200 dark:border-sky-800/70', iconBg: 'bg-sky-600', icon: 'fa-circle-info' },
  { bg: 'bg-amber-50/90 dark:bg-amber-950/40', border: 'border-amber-200 dark:border-amber-800/70', iconBg: 'bg-amber-500', icon: 'fa-star' },
  { bg: 'bg-purple-50/90 dark:bg-purple-950/40', border: 'border-purple-200 dark:border-purple-800/70', iconBg: 'bg-purple-600', icon: 'fa-sparkles' },
];

function parseAnnouncementItems(body = '') {
  const lines = String(body || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length <= 1) return null;
  const bulletLines = lines.filter((l) => /^([-•*▪►✅📌🔔]|\d+[.)])\s*/.test(l));
  if (bulletLines.length < 2) return null;
  return lines.map((l) => l.replace(/^([-•*▪►✅📌🔔]|\d+[.)])\s*/, '').trim()).filter(Boolean);
}

/**
 * Native React SystemUpdateModal (Full Parity with legacy SystemUpdateModal.js)
 * - Centered BMA Header Gradient (from-[#00351B] to-[#00744B])
 * - 4-color Auto-formatted Highlight Cards for multi-line announcements
 * - Reads releaseNotes.highlights from version.json
 * - Image error fallback box (#bmaAnnouncementImgErrorBox)
 * - Pill "รับทราบ" button & Preview Mode support for Settings Tab 7
 */
export function SystemUpdateModal({ open, onClose, settings, versionInfo, previewMode = false }) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [open, settings?.announcement_image_url]);

  useEffect(() => {
    if (!open) return undefined;
    document.body.classList.add('bma-modal-open');
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('bma-modal-open');
    };
  }, [open, onClose]);

  if (!open) return null;

  const isAnnouncement = Boolean(
    previewMode ||
    (settings?.announcement_enabled && (settings?.announcement_title || settings?.announcement_body || settings?.announcement_image_url))
  );
  const sanitizedImg = settings?.announcement_image_url
    ? (UIHelpers.verifyImageUrl(settings.announcement_image_url)?.url || settings.announcement_image_url)
    : '';
  const bulletItems = isAnnouncement && settings?.announcement_mode !== 'image'
    ? parseAnnouncementItems(settings?.announcement_body)
    : null;
  const releaseHighlights = Array.isArray(versionInfo?.releaseNotes?.highlights)
    ? versionInfo.releaseNotes.highlights
    : [
        'อัปเกรดสถาปัตยกรรมเป็น Vite + React 18 + Tailwind CSS v4 (Zero CDN) โหลดเร็วขึ้นกว่าเดิม',
        'รองรับการทำงานพร้อมกันบน GitHub Pages (branch main) และ Cloudflare Pages + Supabase',
        'Tri-Layer Realtime Sync, Double-Layer Executive RBAC, GPS 5-Tier และ Camera Lifecycle Guard',
      ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9995] bg-slate-950/65 backdrop-blur-xs overflow-y-auto flex justify-center p-3 sm:p-5"
      style={{ height: '100dvh' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className="relative my-auto w-full max-w-lg max-h-[calc(100dvh-2rem)] flex flex-col rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden">
        {/* Centered BMA Gradient Header */}
        <div className="shrink-0 bg-gradient-to-r from-[#00351B] via-[#00744B] to-[#00A368] text-white px-6 py-5 text-center relative">
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="absolute right-3.5 top-3.5 w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition"
          >
            <i className="fa-solid fa-xmark text-sm" />
          </button>
          <div className="w-12 h-12 mx-auto rounded-2xl bg-white/15 border border-white/30 flex items-center justify-center mb-2.5 shadow-md">
            <i className={`fa-solid ${isAnnouncement ? 'fa-bullhorn' : 'fa-rocket'} text-xl text-[#F6DE51]`} />
          </div>
          {previewMode && (
            <span className="inline-block px-2.5 py-0.5 mb-1.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-extrabold">
              ตัวอย่างการแสดงผล (Preview)
            </span>
          )}
          <h3 className="font-extrabold text-lg leading-snug">
            {isAnnouncement
              ? (settings?.announcement_title || 'ประกาศแจ้งเตือนจากระบบ')
              : (versionInfo?.releaseNotes?.title || `อัปเดตระบบเวอร์ชัน ${versionInfo?.appVersion || 'v3.0.0'}`)}
          </h3>
          <p className="text-xs text-emerald-100/90 mt-0.5 font-mono">
            {versionInfo?.appVersion || 'v3.0.0'}{versionInfo?.buildId ? ` · Build ${versionInfo.buildId}` : ''}
          </p>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3.5">
          {isAnnouncement ? (
            <>
              {settings?.announcement_mode === 'image' && sanitizedImg ? (
                imgError ? (
                  <div id="bmaAnnouncementImgErrorBox" className="p-5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-center text-xs text-rose-700 dark:text-rose-300 space-y-1.5">
                    <i className="fa-solid fa-image-slash text-2xl block" />
                    <p className="font-bold">ไม่สามารถโหลดรูปภาพประกาศได้</p>
                    <p className="opacity-80 break-all">{sanitizedImg}</p>
                  </div>
                ) : (
                  <img
                    src={sanitizedImg}
                    alt={settings?.announcement_title || 'ประกาศระบบ'}
                    onError={() => setImgError(true)}
                    className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 object-contain max-h-[52dvh] bg-slate-50 dark:bg-slate-800"
                  />
                )
              ) : bulletItems ? (
                <div className="space-y-2.5">
                  {bulletItems.map((line, idx) => {
                    const st = CARD_STYLES[idx % CARD_STYLES.length];
                    return (
                      <div key={idx} className={`p-3 rounded-2xl border ${st.bg} ${st.border} flex items-start gap-3`}>
                        <span className={`w-6 h-6 rounded-lg ${st.iconBg} text-white flex items-center justify-center shrink-0 text-xs mt-0.5`}>
                          <i className={`fa-solid ${st.icon}`} />
                        </span>
                        <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{line}</p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-200 bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/60 rounded-2xl p-4">
                  {settings?.announcement_body || 'ไม่มีรายละเอียดประกาศ'}
                </div>
              )}

              {(settings?.announcement_start_date || settings?.announcement_end_date) && (
                <p className="text-[11px] text-center text-slate-500 dark:text-slate-400">
                  <i className="fa-regular fa-calendar mr-1.5" />
                  ระยะเวลาประกาศ: {settings.announcement_start_date ? UIHelpers.formatThaiShortDate(settings.announcement_start_date) : 'ไม่ระบุ'} — {settings.announcement_end_date ? UIHelpers.formatThaiShortDate(settings.announcement_end_date) : 'ไม่ระบุ'}
                </p>
              )}
            </>
          ) : (
            <div className="space-y-2.5">
              {releaseHighlights.map((item, idx) => {
                const st = CARD_STYLES[idx % CARD_STYLES.length];
                const text = typeof item === 'string' ? item : (item?.text || item?.title || '');
                return (
                  <div key={idx} className={`p-3 rounded-2xl border ${st.bg} ${st.border} flex items-start gap-3`}>
                    <span className={`w-6 h-6 rounded-lg ${st.iconBg} text-white flex items-center justify-center shrink-0 text-xs mt-0.5`}>
                      <i className={`fa-solid ${st.icon}`} />
                    </span>
                    <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{text}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Capsule Footer Button */}
        <div className="shrink-0 px-6 py-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex justify-center">
          <button
            id="btnModalCloseBottomAck"
            type="button"
            onClick={onClose}
            className="px-10 py-2.5 rounded-full bg-gradient-to-r from-[#00744B] to-[#00A368] hover:brightness-105 text-white font-extrabold text-sm shadow-md transition"
          >
            รับทราบ
          </button>
        </div>
      </div>
    </div>
  );
}
