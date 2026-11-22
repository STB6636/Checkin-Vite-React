import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { SettingsModel } from '../models/SettingsModel.js';
import { Config } from '../core/Config.js';

const SettingsContext = createContext(null);

function readCachedSettings() {
  try {
    const cached = sessionStorage.getItem(Config.STORAGE_KEYS.CACHED_SETTINGS)
      || localStorage.getItem(Config.STORAGE_KEYS.CACHED_SETTINGS);
    if (cached) {
      return { ...Config.DEFAULT_SETTINGS, ...JSON.parse(cached) };
    }
  } catch (_) {}
  return { ...Config.DEFAULT_SETTINGS };
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(readCachedSettings);
  const [loading, setLoading] = useState(true);

  const reloadSettings = useCallback(async (forceRefresh = false) => {
    try {
      const data = await SettingsModel.getSettings(forceRefresh);
      if (data) {
        setSettings(data);
        try {
          localStorage.setItem('bma_cached_brand_v2_7', JSON.stringify({
            organization_name: data.organization_name || '',
            bureau_name: data.bureau_name || '',
            header_system_title: data.header_system_title || '',
            logo_url: data.logo_url || '',
            footer_description: data.footer_description || '',
          }));
        } catch (_) {}
      }
      return data;
    } catch (err) {
      console.warn('[SettingsContext] Failed to load settings:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const saveSettings = useCallback(async (payload) => {
    const updated = await SettingsModel.updateSettings(payload);
    if (updated) {
      setSettings(updated);
      try {
        localStorage.setItem('bma_cached_brand_v2_7', JSON.stringify({
          organization_name: updated.organization_name || '',
          bureau_name: updated.bureau_name || '',
          header_system_title: updated.header_system_title || '',
          logo_url: updated.logo_url || '',
          footer_description: updated.footer_description || '',
        }));
      } catch (_) {}
    }
    return updated;
  }, []);

  useEffect(() => {
    reloadSettings(false);
    const onSettingsUpdated = (e) => {
      if (e?.detail) {
        setSettings((prev) => ({ ...prev, ...e.detail }));
      } else {
        reloadSettings(true);
      }
    };
    window.addEventListener('bma:settings-updated', onSettingsUpdated);
    return () => window.removeEventListener('bma:settings-updated', onSettingsUpdated);
  }, [reloadSettings]);

  return (
    <SettingsContext.Provider value={{ settings, loading, reloadSettings, saveSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
