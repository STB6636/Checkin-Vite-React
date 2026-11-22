import React, { useMemo } from 'react';
import { SettingsModel } from '../../models/SettingsModel.js';
import { useSettings } from '../../contexts/SettingsContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';

/**
 * 3-Tier Cascading Organization Hierarchy Filter (สำนัก/กอง > ส่วน/ฝ่าย > กลุ่มงาน)
 * Enforces Admin RBAC scope locking automatically (ADR-0003).
 */
export function OrgHierarchyFilter({
  organization,
  bureau,
  division,
  workGroup,
  value,
  onChange,
  compact = false,
}) {
  const { settings } = useSettings();
  const { user, isSuperAdmin } = useAuth();

  const isDivisionAdmin = !isSuperAdmin && user?.role === 'Admin' && user?.visibility_level === 'division';
  const lockBureau = !isSuperAdmin && user?.role === 'Admin' && (user.visibility_level === 'bureau' || user.visibility_level === 'division');
  const lockDivision = isDivisionAdmin;

  const rawOrg = organization ?? value?.organization ?? '';
  const rawBureau = bureau ?? value?.bureau ?? '';
  const rawDivision = division ?? value?.division ?? '';
  const rawWorkGroup = workGroup ?? value?.workGroup ?? value?.work_group ?? '';

  const effectiveBureau = lockBureau ? (user?.scope_bureau || '') : rawBureau;
  const effectiveDivision = lockDivision ? (user?.scope_division || '') : rawDivision;

  const bureaus = useMemo(() => SettingsModel.getUniqueBureaus(settings, rawOrg), [settings, rawOrg]);
  const divisions = useMemo(
    () => SettingsModel.getUniqueDivisions(settings, effectiveBureau, rawOrg),
    [settings, effectiveBureau, rawOrg]
  );
  const groups = useMemo(
    () => SettingsModel.getUniqueGroups(settings, effectiveBureau, effectiveDivision, rawOrg),
    [settings, effectiveBureau, effectiveDivision, rawOrg]
  );

  // Hide the Org Hierarchy Filter Dock completely for division-level Admins (matches legacy UIHelpers.initOrgHierarchyFilterDock)
  if (isDivisionAdmin) {
    return null;
  }

  const selectClass = compact
    ? 'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed'
    : 'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed';

  const emitChange = (next) => {
    if (typeof onChange === 'function') {
      onChange({
        organization: rawOrg,
        ...next,
        work_group: next.workGroup,
      });
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
      <div>
        <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">สำนักงาน / กอง</label>
        <select
          value={effectiveBureau}
          disabled={lockBureau}
          onChange={(e) => emitChange({ bureau: e.target.value, division: '', workGroup: '' })}
          className={selectClass}
        >
          {!lockBureau && <option value="">ทุกสำนักงาน/กอง</option>}
          {bureaus.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">ส่วน / ฝ่าย</label>
        <select
          value={effectiveDivision}
          disabled={lockDivision || !effectiveBureau}
          onChange={(e) => emitChange({ bureau: effectiveBureau, division: e.target.value, workGroup: '' })}
          className={selectClass}
        >
          {!lockDivision && <option value="">ทุกส่วน/ฝ่าย</option>}
          {divisions.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">กลุ่มงาน</label>
        <select
          value={rawWorkGroup}
          disabled={!effectiveDivision}
          onChange={(e) => emitChange({ bureau: effectiveBureau, division: effectiveDivision, workGroup: e.target.value })}
          className={selectClass}
        >
          <option value="">ทุกกลุ่มงาน</option>
          {groups.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
