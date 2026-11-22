import { useState, useEffect, useCallback } from 'react';
import { Config } from '../core/Config.js';
import { UIHelpers } from '../core/UIHelpers.js';

/**
 * Fetches public/version.json safely via relative URL resolution and evaluates
 * whether System Update or Tab 7 Announcement should be displayed (ADR-0023, ADR-0033).
 */
export function useSystemUpdateCheck(settings) {
  const [versionInfo, setVersionInfo] = useState({ appVersion: 'v3.0.0', buildId: '', updatedAt: '', releaseNotes: null });
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [hasActiveAnnouncement, setHasActiveAnnouncement] = useState(false);

  const checkAnnouncementActive = useCallback((cfg) => {
    if (!cfg || !cfg.announcement_enabled) return false;
    const today = UIHelpers.getTodayISO();
    if (cfg.announcement_start_date && today < cfg.announcement_start_date) return false;
    if (cfg.announcement_end_date && today > cfg.announcement_end_date) return false;
    const hasContent = cfg.announcement_mode === 'image'
      ? Boolean(cfg.announcement_image_url)
      : Boolean(cfg.announcement_title || cfg.announcement_body);
    return hasContent;
  }, []);

  useEffect(() => {
    let alive = true;
    const versionUrl = new URL('./version.json?_t=' + Date.now(), window.location.href).href;
    fetch(versionUrl, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!alive || !data) return;
        setVersionInfo({
          appVersion: data.appVersion || 'v3.0.0',
          buildId: data.buildId || '',
          updatedAt: data.updatedAt || '',
          releaseNotes: data.releaseNotes || null,
        });
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const active = checkAnnouncementActive(settings);
    setHasActiveAnnouncement(active);
    if (active && settings?.announcement_updated_at) {
      try {
        const lastSeen = localStorage.getItem(Config.STORAGE_KEYS.LAST_SEEN_ANNOUNCEMENT);
        if (lastSeen !== settings.announcement_updated_at) {
          setShowUpdateModal(true);
        }
      } catch (_) {}
    }
  }, [settings, checkAnnouncementActive]);

  const dismissModal = useCallback(() => {
    setShowUpdateModal(false);
    try {
      if (settings?.announcement_updated_at) {
        localStorage.setItem(Config.STORAGE_KEYS.LAST_SEEN_ANNOUNCEMENT, settings.announcement_updated_at);
      }
      if (versionInfo.buildId) {
        localStorage.setItem('bma_last_seen_update_build', versionInfo.buildId);
      }
    } catch (_) {}
  }, [settings, versionInfo.buildId]);

  return {
    versionInfo,
    hasActiveAnnouncement,
    showUpdateModal,
    openUpdateModal: () => setShowUpdateModal(true),
    dismissModal,
  };
}
