import React, { useState, useEffect } from 'react';
import { UIHelpers } from '../../core/UIHelpers.js';

const CARD_STYLES = [
  {
    bg: 'bg-emerald-50 dark:bg-slate-800/80',
    border: 'border-emerald-100 dark:border-slate-700',
    iconBg: 'bg-emerald-600',
    text: 'text-emerald-950 dark:text-slate-100',
  },
  {
    bg: 'bg-teal-50 dark:bg-slate-800/80',
    border: 'border-teal-100 dark:border-slate-700',
    iconBg: 'bg-teal-600',
    text: 'text-teal-950 dark:text-slate-100',
  },
  {
    bg: 'bg-indigo-50 dark:bg-slate-800/80',
    border: 'border-indigo-100 dark:border-slate-700',
    iconBg: 'bg-indigo-600',
    text: 'text-indigo-950 dark:text-slate-100',
  },
  {
    bg: 'bg-amber-50 dark:bg-slate-800/80',
    border: 'border-amber-100 dark:border-slate-700',
    iconBg: 'bg-amber-600',
    text: 'text-amber-950 dark:text-slate-100',
  },
];

export function sanitizeImageUrl(rawUrl) {
  const cleanUrl = String(rawUrl || '').trim();
  if (!cleanUrl) return '';
  const isSafe = /^(?:https?:\/\/[^\s'"()<>]+|data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+)$/i.test(cleanUrl);
  if (!isSafe) return '';
  if (/(?:drive\.google\.com|docs\.google\.com)/i.test(cleanUrl)) {
    const match = cleanUrl.match(/(?:\/d\/|[?&]id=|\/file\/d\/)([-\w]{20,})/);
    if (match && match[1]) {
      return `https://lh3.googleusercontent.com/d/${match[1]}`;
    }
  }
  return cleanUrl;
}

export function parseAnnouncementItems(body = '') {
  const lines = String(body || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  let bulletIdx = 0;
  return lines.map((line) => {
    const bulletMatch = line.match(/^(?:[-•*▪►✅📌🔔]|\d+[.)])\s*(.+)$/);
    if (bulletMatch) {
      const numMatch = line.match(/^(\d+)[.)]\s*/);
      const style = CARD_STYLES[bulletIdx % CARD_STYLES.length];
      bulletIdx += 1;
      return {
        isBullet: true,
        number: numMatch ? numMatch[1] : null,
        text: bulletMatch[1].trim(),
        style,
      };
    }
    return {
      isBullet: false,
      text: line,
    };
  });
}

/**
 * Native React SystemUpdateModal (Full Parity with legacy SystemUpdateModal.js & #modalAnnouncementPreview)
 */
export function SystemUpdateModal({ open, onClose, settings, versionInfo, previewMode = false }) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [open, settings?.announcement_image_url]);

  useEffect(() => {
    if (!open) return undefined;
    document.body.classList.add('bma-modal-open');
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('bma-modal-open');
    };
  }, [open, onClose]);

  if (!open) return null;

  const isAnnouncement = Boolean(
    previewMode ||
      (settings?.announcement_enabled &&
        (settings?.announcement_title ||
          settings?.announcement_body ||
          settings?.announcement_image_url))
  );
  const isImageMode = isAnnouncement && settings?.announcement_mode === 'image';
  const sanitizedImg = sanitizeImageUrl(settings?.announcement_image_url);
  const parsedBlocks =
    isAnnouncement && !isImageMode ? parseAnnouncementItems(settings?.announcement_body) : [];

  const releaseHighlights = Array.isArray(versionInfo?.releaseNotes?.highlights)
    ? versionInfo.releaseNotes.highlights
    : [
        'อัปเกรดสถาปัตยกรรมเป็น Vite + React 18 + Tailwind CSS v4 (Zero CDN) โหลดเร็วขึ้นกว่าเดิม',
        'รองรับการทำงานพร้อมกันบน GitHub Pages (branch main) และ Cloudflare Pages + Supabase',
        'Tri-Layer Realtime Sync, Double-Layer Executive RBAC, GPS 5-Tier และ Camera Lifecycle Guard',
      ];

  const dateParts = [];
  if (settings?.announcement_start_date) {
    dateParts.push(`เริ่ม ${settings.announcement_start_date}`);
  }
  if (settings?.announcement_end_date) {
    dateParts.push(`ถึง ${settings.announcement_end_date}`);
  }

  return (
    <div
      id={previewMode ? 'modalAnnouncementPreview' : 'bmaSystemUpdateModal'}
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9995] bg-black/65 backdrop-blur-sm overflow-y-auto flex justify-center p-2.5 sm:p-4"
      style={{ height: '100dvh' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="relative my-auto w-full max-w-md max-h-[calc(100dvh-1.25rem)] sm:max-h-[92dvh] flex flex-col rounded-2xl sm:rounded-3xl bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden">
        {/* Centered BMA Gradient Header */}
        <div className="shrink-0 bg-gradient-to-r from-[#00351B] to-[#00744B] text-white p-4 sm:p-5 text-center relative">
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="absolute right-3.5 top-3.5 w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition cursor-pointer"
          >
            <i className="fa-solid fa-xmark text-sm" />
          </button>

          {previewMode && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-400/25 border border-amber-300/50 text-[#F6DE51] text-[10px] font-bold mb-1.5">
              <i className="fa-solid fa-eye" /> โหมดตัวอย่าง (ไม่บันทึกการรับทราบ)
            </span>
          )}

          {!isImageMode && (
            <div className="w-11 h-11 mx-auto rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center mb-2 shadow-md text-[#F6DE51]">
              <i className={`fa-solid ${isAnnouncement ? 'fa-bullhorn' : 'fa-rocket'} text-lg`} />
            </div>
          )}

          <h3 className="font-black text-base sm:text-lg leading-snug px-4 text-white">
            {isAnnouncement
              ? settings?.announcement_title || 'ประกาศจากระบบ'
              : versionInfo?.releaseNotes?.title ||
                `อัปเดตระบบเวอร์ชัน ${versionInfo?.appVersion || 'v3.0.0'}`}
          </h3>

          {isAnnouncement && dateParts.length > 0 && (
            <p className="text-[11px] text-emerald-100/90 mt-1">{dateParts.join(' • ')}</p>
          )}

          {!isAnnouncement && (
            <p className="text-xs text-emerald-100/90 mt-0.5 font-mono">
              {versionInfo?.appVersion || 'v3.0.0'}
              {versionInfo?.buildId ? ` · Build ${versionInfo.buildId}` : ''}
            </p>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-3">
          {isAnnouncement ? (
            isImageMode ? (
              sanitizedImg ? (
                imgError ? (
                  <div
                    id="bmaAnnouncementImgErrorBox"
                    className="flex flex-col items-center justify-center py-8 px-4 text-center text-slate-500 dark:text-slate-400"
                  >
                    <i className="fa-regular fa-image text-3xl mb-2 text-rose-400" />
                    <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                      ไม่สามารถโหลดรูปภาพประกาศได้
                    </p>
                    <p className="text-[11px] mt-1">
                      กรุณาตรวจสอบลิงก์รูปภาพหรือสิทธิ์การเข้าถึงบน Google Drive
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center">
                    <img
                      src={sanitizedImg}
                      alt={settings?.announcement_title || 'ประกาศจากระบบ'}
                      onError={() => setImgError(true)}
                      className="max-h-[70dvh] w-auto max-w-full object-contain rounded-2xl shadow-md bg-white dark:bg-slate-800"
                    />
                  </div>
                )
              ) : (
                <p className="text-xs text-center text-slate-400 py-8">
                  ยังไม่ได้ระบุลิงก์รูปภาพประกาศ
                </p>
              )
            ) : parsedBlocks.length > 0 ? (
              <div className="space-y-2.5">
                {parsedBlocks.map((block, idx) =>
                  block.isBullet ? (
                    <div
                      key={idx}
                      className={`p-3 rounded-2xl border ${block.style.bg} ${block.style.border} flex gap-3 items-start transition-all`}
                    >
                      <span
                        className={`w-6 h-6 rounded-xl ${block.style.iconBg} text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5`}
                      >
                        {block.number ? (
                          <span className="font-bold text-[11px]">{block.number}</span>
                        ) : (
                          <i className="fa-solid fa-check text-[10px]" />
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs sm:text-[13px] ${block.style.text} font-medium leading-relaxed break-words`}>
                          {block.text}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p
                      key={idx}
                      className="text-xs sm:text-[13px] text-slate-700 dark:text-slate-200 leading-relaxed break-words px-1"
                    >
                      {block.text}
                    </p>
                  )
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic text-center py-4">ไม่มีรายละเอียดเพิ่มเติม</p>
            )
          ) : (
            <div className="space-y-2.5">
              {releaseHighlights.map((item, idx) => {
                const st = CARD_STYLES[idx % CARD_STYLES.length];
                const text = typeof item === 'string' ? item : item?.text || item?.title || '';
                return (
                  <div
                    key={idx}
                    className={`p-3 rounded-2xl border ${st.bg} ${st.border} flex items-start gap-3`}
                  >
                    <span
                      className={`w-6 h-6 rounded-xl ${st.iconBg} text-white flex items-center justify-center shrink-0 text-xs mt-0.5`}
                    >
                      <i className="fa-solid fa-check text-[10px]" />
                    </span>
                    <p className={`text-xs sm:text-[13px] ${st.text} font-medium leading-relaxed`}>
                      {text}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Capsule Footer Button */}
        <div className="shrink-0 p-3.5 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-center">
          <button
            id={previewMode ? 'btnAckAnnouncementPreviewModal' : 'btnModalCloseBottomAck'}
            type="button"
            onClick={onClose}
            className="w-full max-w-[260px] py-2.5 px-6 rounded-full font-bold text-xs sm:text-sm text-white bg-gradient-to-r from-[#00351B] to-[#00744B] hover:brightness-110 transition shadow-md cursor-pointer"
          >
            {previewMode ? (
              <>
                <i className="fa-solid fa-circle-check mr-1" /> ปิดตัวอย่างประกาศ
              </>
            ) : (
              'รับทราบ'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
