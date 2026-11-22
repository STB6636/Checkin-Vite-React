import React, { useEffect, useRef } from 'react';

/**
 * Viewport-Bounded 3-Zone Responsive Modal (ADR-0038)
 * - Uses 100dvh + my-auto to prevent top/bottom clipping on mobile viewports
 * - Sticky header & footer with independently scrollable body
 * - Enforces z-[9990] (below SweetAlert2 z-[99990]), ESC & backdrop close, and body scroll lock
 */
export function ResponsiveModal({
  open,
  onClose,
  title,
  subtitle = '',
  icon = '',
  maxWidthClass = 'max-w-xl',
  headerClass = 'bg-gradient-to-r from-[#00351B] via-[#00744B] to-[#00A368] text-white',
  footer = null,
  zIndexClass = 'z-[9990]',
  children,
}) {
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    document.body.classList.add('bma-modal-open');
    if (overlayRef.current) overlayRef.current.scrollTop = 0;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && typeof onClose === 'function') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.classList.remove('bma-modal-open');
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      className={`fixed inset-0 ${zIndexClass} bg-slate-950/60 backdrop-blur-xs overflow-y-auto flex justify-center p-3 sm:p-5`}
      style={{ height: '100dvh' }}
      onMouseDown={(e) => {
        if (e.target === overlayRef.current && typeof onClose === 'function') {
          onClose();
        }
      }}
    >
      <div
        className={`relative my-auto w-full ${maxWidthClass} max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2.5rem)] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden`}
      >
        {/* Zone 1: Sticky Header */}
        <div className={`shrink-0 px-5 py-4 flex items-center justify-between gap-3 ${headerClass}`}>
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                <i className={`fa-solid ${icon} text-base`} />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="font-bold text-base sm:text-lg leading-tight truncate">{title}</h3>
              {subtitle && <p className="text-xs opacity-85 truncate mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิดหน้าต่าง"
              className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0 transition"
            >
              <i className="fa-solid fa-xmark text-sm" />
            </button>
          )}
        </div>

        {/* Zone 2: Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5">{children}</div>

        {/* Zone 3: Sticky Footer */}
        {footer && (
          <div className="shrink-0 px-5 py-3.5 bg-slate-50 dark:bg-slate-800/70 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-2.5 flex-wrap">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
