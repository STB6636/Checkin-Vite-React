import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { SettingsModel } from '../models/SettingsModel.js';
import { Config } from '../core/Config.js';

const SettingsContext = createContext(null);

export function sanitizeBrandLogoUrl(rawUrl) {
  const cleanUrl = String(rawUrl || '').trim();
  if (!cleanUrl) return '';
  if (/(?:drive\.google\.com|docs\.google\.com)/i.test(cleanUrl)) {
    const match = cleanUrl.match(/(?:\/d\/|[?&]id=|\/file\/d\/)([-\w]{20,})/);
    if (match && match[1]) {
      return `https://lh3.googleusercontent.com/d/${match[1]}`;
    }
  }
  return cleanUrl;
}

function writeCachedBrand(data) {
  if (!data || typeof data !== 'object') return;
  try {
    const orgName = data.organization_name || 'กรุงเทพมหานคร';
    const bureauName = data.bureau_name || 'สำนักเทศกิจ';
    const headerTitle = data.header_system_title || 'BMA e-Government Time Attendance System';
    const normalizedLogo = sanitizeBrandLogoUrl(data.logo_url || '');
    const footerDesc = data.footer_description || '';
    localStorage.setItem(
      'bma_cached_brand_v2_7',
      JSON.stringify({
        organization_name: orgName,
        orgName,
        bureau_name: bureauName,
        bureauName,
        header_system_title: headerTitle,
        headerSystemTitle: headerTitle,
        logo_url: normalizedLogo,
        logoUrl: normalizedLogo,
        footer_description: footerDesc,
      })
    );
  } catch (_) {}
}

function readCachedSettings() {
  try {
    const cached =
      sessionStorage.getItem(Config.STORAGE_KEYS.CACHED_SETTINGS) ||
      localStorage.getItem(Config.STORAGE_KEYS.CACHED_SETTINGS);
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
        writeCachedBrand(data);
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
    const res = await SettingsModel.updateSettings(payload);
    if (res?.success && res.data) {
      setSettings(res.data);
      writeCachedBrand(res.data);
    }
    return res;
  }, []);

  useEffect(() => {
    reloadSettings(false);
    const onSettingsUpdated = (e) => {
      if (e?.detail) {
        setSettings((prev) => {
          const next = { ...prev, ...e.detail };
          writeCachedBrand(next);
          return next;
        });
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
