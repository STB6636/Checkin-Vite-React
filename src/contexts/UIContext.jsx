import React, { createContext, useContext, useState, useCallback } from 'react';
import { UIHelpers } from '../core/UIHelpers.js';

const UIContext = createContext(null);

export function UIProvider({ children }) {
  const [busyMessage, setBusyMessage] = useState('');

  const showBusy = useCallback((msg = 'กำลังประมวลผล...') => {
    setBusyMessage(msg);
  }, []);

  const hideBusy = useCallback(() => {
    setBusyMessage('');
  }, []);

  const toast = useCallback((message, type = 'success', durationMs = 2600) => {
    return UIHelpers.showToast(message, type, durationMs);
  }, []);

  const alert = useCallback((title, text = '', icon = 'success') => {
    return UIHelpers.alert(title, text, icon);
  }, []);

  const confirm = useCallback((title, text = '', confirmText = 'ยืนยัน', icon = 'warning', options = {}) => {
    return UIHelpers.confirm(title, text, confirmText, icon, options);
  }, []);

  return (
    <UIContext.Provider value={{ busyMessage, showBusy, hideBusy, toast, alert, confirm }}>
      {children}
      {busyMessage && (
        <div className="fixed inset-0 z-[99980] bg-slate-950/55 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl px-6 py-5 flex items-center gap-4 max-w-sm w-full">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 shrink-0">
              <i className="fa-solid fa-circle-notch fa-spin text-xl" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-slate-800 dark:text-white text-sm truncate">{busyMessage}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">กรุณารอสักครู่...</p>
            </div>
          </div>
        </div>
      )}
    </UIContext.Provider>
  );
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within UIProvider');
  return ctx;
}
