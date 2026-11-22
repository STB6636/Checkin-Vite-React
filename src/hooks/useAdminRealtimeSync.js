import { useEffect, useRef } from 'react';
import { DatabaseService } from '../core/DatabaseService.js';
import { AttendanceModel } from '../models/AttendanceModel.js';
import { SettingsModel } from '../models/SettingsModel.js';

/**
 * Tri-Layer Realtime Sync Hook (ADR-0018)
 * Layer 1: Supabase Broadcast Bus (`bma_global_realtime_bus`)
 * Layer 2: Postgres Changes Subscription (`attendance_logs`, `user_accounts`, `personnel`, `system_settings`)
 * Layer 3: Watermark Polling Failsafe (every 12s while tab is visible)
 * Cleanly unsubscribes and clears all intervals/listeners on unmount or user logout.
 */
export function useAdminRealtimeSync({ enabled = true, onSync, onSettingsUpdated, pollIntervalMs = 12000 }) {
  const onSyncRef = useRef(onSync);
  const onSettingsRef = useRef(onSettingsUpdated);
  const watermarkRef = useRef('');

  useEffect(() => {
    onSyncRef.current = onSync;
  }, [onSync]);

  useEffect(() => {
    onSettingsRef.current = onSettingsUpdated;
  }, [onSettingsUpdated]);

  useEffect(() => {
    if (!enabled) return undefined;

    const db = DatabaseService.getInstance().client;
    const activeSchema = DatabaseService.getActiveSchema();
    const channelId = `bma_react_realtime_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let alive = true;
    let debounceTimer = null;

    const triggerSync = (reason) => {
      if (!alive) return;
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        if (alive && typeof onSyncRef.current === 'function') {
          onSyncRef.current(reason);
        }
      }, 250);
    };

    const handleSettingsChange = async () => {
      if (!alive) return;
      try {
        const fresh = await SettingsModel.getSettings(true);
        if (alive && fresh) {
          window.dispatchEvent(new CustomEvent('bma:settings-updated', { detail: fresh }));
          if (typeof onSettingsRef.current === 'function') {
            onSettingsRef.current(fresh);
          }
        }
      } catch (_) {}
      triggerSync('settings');
    };

    const pgChannel = db
      .channel(channelId)
      .on('postgres_changes', { event: '*', schema: activeSchema, table: 'attendance_logs' }, () => triggerSync('attendance_logs'))
      .on('postgres_changes', { event: '*', schema: activeSchema, table: 'user_accounts' }, () => triggerSync('user_accounts'))
      .on('postgres_changes', { event: '*', schema: activeSchema, table: 'personnel' }, () => triggerSync('personnel'))
      .on('postgres_changes', { event: '*', schema: activeSchema, table: 'system_settings' }, handleSettingsChange)
      .subscribe();

    const busChannel = db
      .channel('bma_global_realtime_bus')
      .on('broadcast', { event: 'attendance_changed' }, () => triggerSync('broadcast_attendance'))
      .on('broadcast', { event: 'special_request_changed' }, () => triggerSync('broadcast_special'))
      .on('broadcast', { event: 'time_correction_changed' }, () => triggerSync('broadcast_correction'))
      .on('broadcast', { event: 'user_changed' }, () => triggerSync('broadcast_user'))
      .on('broadcast', { event: 'settings_updated' }, handleSettingsChange)
      .subscribe();

    const checkWatermark = async () => {
      if (!alive || document.visibilityState !== 'visible') return;
      try {
        const wm = await AttendanceModel.getTodaySyncWatermark();
        const serialized = JSON.stringify(wm || '');
        if (watermarkRef.current && watermarkRef.current !== serialized) {
          triggerSync('watermark');
        }
        watermarkRef.current = serialized;
      } catch (_) {}
    };

    const pollTimer = window.setInterval(checkWatermark, pollIntervalMs);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        triggerSync('visibility');
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      alive = false;
      window.clearTimeout(debounceTimer);
      window.clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      try {
        db.removeChannel(pgChannel);
        db.removeChannel(busChannel);
      } catch (_) {}
    };
  }, [enabled, pollIntervalMs]);
}
