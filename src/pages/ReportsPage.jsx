import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AdminLayout } from '../components/layout/AdminLayout.jsx';
import { MobileShortcutGrid } from '../components/common/MobileShortcutGrid.jsx';
import { OrgHierarchyFilter } from '../components/common/OrgHierarchyFilter.jsx';
import { ResponsiveModal } from '../components/common/ResponsiveModal.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useSettings } from '../contexts/SettingsContext.jsx';
import { AttendanceModel } from '../models/AttendanceModel.js';
import { PersonnelModel } from '../models/PersonnelModel.js';
import { Config } from '../core/Config.js';
import { UIHelpers } from '../core/UIHelpers.js';

const ALL_STATUS_KEYS = Config.OFFICIAL_STATUSES.map((s) => s.key);
const DEFAULT_STATUS_KEYS = ['normal', 'late'];

const SUPPRESSED_STATUS_REMARKS = new Set([
  'ปฏิบัติงานปกติ',
  'มาสาย',
  'ขาดราชการ',
  'ไม่ลงเวลา',
  'ปฏิบัติงานนอกเวลา',
  'ปฏิบัติงานนอกเวลาราชการ',
  'ในสถานที่',
]);

function formatLocationName(locName) {
  if (!locName) return '-';
  let trimmed = String(locName).trim();
  if (!trimmed || trimmed === '-' || trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'undefined') {
    return '-';
  }
  trimmed = trimmed.replace(/\(?พิกัด:?\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\)?/gi, '').trim();
  if (/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(trimmed)) {
    return '-';
  }
  if (!trimmed || trimmed === '-') return '-';
  if (/^(บริเวณ|ใกล้เคียง)/.test(trimmed)) {
    return trimmed;
  }
  return `บริเวณ ${trimmed}`;
}

function resolveLocationMode(rec, type = 'check_in') {
  if (!rec || (!rec.log_id && !rec.id)) return null;
  if (type === 'check_in') {
    const hasCheckIn = Boolean(rec.check_in_time || rec.check_in_lat || rec.check_in_location);
    if (!hasCheckIn && !rec.is_special_request) return null;
    if (rec.location_mode === 'OFFSITE' || rec.location_mode === 'offsite') return 'OFFSITE';
    if (rec.location_mode === 'ONSITE' || rec.location_mode === 'onsite') return 'ONSITE';
    if (rec.remark && ['อบรม', 'ประชุม', 'ปฏิบัติงานนอกสถานที่', 'ปฏิบัติงานที่บ้าน (WFH)', 'ปฏิบัติงานเวรประจำวัน'].includes(rec.remark.trim())) {
      return 'OFFSITE';
    }
    return 'ONSITE';
  }
  if (type === 'check_out') {
    const isCheckedOut = Boolean(rec.check_out_time || rec.check_out_lat || rec.check_out_location);
    if (!isCheckedOut && !rec.is_special_request) return null;
    if (rec.check_out_location_mode === 'OFFSITE' || rec.check_out_location_mode === 'offsite') return 'OFFSITE';
    if (rec.check_out_location_mode === 'ONSITE' || rec.check_out_location_mode === 'onsite') return 'ONSITE';
    if (rec.is_special_request) {
      return resolveLocationMode(rec, 'check_in') || 'ONSITE';
    }
    if (rec.location_mode === 'OFFSITE' || rec.location_mode === 'offsite') return 'OFFSITE';
    return 'ONSITE';
  }
  return null;
}

function resolveReportRemarkText(rec) {
  if (!rec || (!rec.log_id && !rec.id)) return '-';
  const rawRemarkCheck = String(rec.remark || '').trim();
  if (rawRemarkCheck === 'ขอแก้ไขเวลา' || rawRemarkCheck.endsWith('(แก้ไขเวลา)')) {
    return rawRemarkCheck;
  }
  if (rec.is_special_request) {
    const rawRemark = (rec.remark || '')
      .replace(/^กรณีพิเศษ\s*\((.*?)\)$/i, '$1')
      .replace(/^กรณีพิเศษ\s*[-:—–/]?\s*/i, '')
      .trim();
    const rawOffsite = (rec.offsite_reason || '').trim();
    const validRemark = (rawRemark && rawRemark !== '-' && !SUPPRESSED_STATUS_REMARKS.has(rawRemark) && rawRemark !== 'กรณีพิเศษ' && rawRemark !== 'ปฏิบัติงานนอกสถานที่' && rawRemark !== 'นอกสถานที่') ? rawRemark : '';
    const validOffsite = (rawOffsite && rawOffsite !== '-' && !SUPPRESSED_STATUS_REMARKS.has(rawOffsite) && rawOffsite !== 'กรณีพิเศษ') ? rawOffsite : '';
    let combinedReason = '';
    if (validRemark && validOffsite && validRemark !== validOffsite && !validRemark.includes(validOffsite)) {
      combinedReason = `${validRemark} (${validOffsite})`;
    } else {
      combinedReason = validRemark || validOffsite || '';
    }
    return combinedReason ? `กรณีพิเศษ\n${combinedReason}` : 'กรณีพิเศษ';
  }
  const inMode = rec.location_mode ? (rec.location_mode.toUpperCase() === 'OFFSITE' ? 'OFFSITE' : 'ONSITE') : resolveLocationMode(rec, 'check_in');
  if (inMode === 'ONSITE') return '-';
  if (inMode === 'OFFSITE') {
    const rawOffsite = (rec.offsite_reason || '').trim();
    if (rawOffsite && rawOffsite !== '-' && !SUPPRESSED_STATUS_REMARKS.has(rawOffsite)) return rawOffsite;
    const rawRemark = (rec.remark || '').trim();
    if (rawRemark && rawRemark !== '-' && !SUPPRESSED_STATUS_REMARKS.has(rawRemark)) return rawRemark;
    return 'ปฏิบัติงานนอกสถานที่';
  }
  return rawRemarkCheck || '-';
}

/**
 * ReportsPage — 100% Visual & Functional Parity with legacy reports.html & ReportsController.js
 */
export default function ReportsPage() {
  const { user, isSuperAdmin, canEditAttendance, canDeleteAttendance } = useAuth();
  const { settings } = useSettings();

  const canManageRecords = Boolean(
    isSuperAdmin || (user?.role === 'Admin' && user?.visibility_level !== 'division')
  );
  const showGps = Boolean(settings?.require_gps);

  const today = UIHelpers.getTodayISO();
  const [dateMode, setDateMode] = useState('single'); // 'single' | 'range'
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [groupBy, setGroupBy] = useState('division'); // 'division' | 'group'
  const [orgFilter, setOrgFilter] = useState({ bureau: '', division: '', workGroup: '' });
  const [selectedTags, setSelectedTags] = useState(DEFAULT_STATUS_KEYS);
  const [search, setSearch] = useState('');
  const [records, setRecords] = useState([]);
  const [personnelList, setPersonnelList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [profileRow, setProfileRow] = useState(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    log_id: '',
    personnel_id: '',
    work_date: today,
    shift_name: 'เวลาราชการปกติ',
    check_in_time: '08:30',
    check_out_time: '',
    status: 'ปฏิบัติงานปกติ',
    check_in_location: '',
    check_out_location: '',
    remark: '',
    is_special_request: false,
  });

  const effectiveEndDate = dateMode === 'single' ? startDate : endDate;

  const loadData = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    try {
      const [rows, pList] = await Promise.all([
        AttendanceModel.getReportRecordsByDateRange(startDate, effectiveEndDate, user),
        personnelList.length ? Promise.resolve(personnelList) : PersonnelModel.getAll(user),
      ]);
      setRecords(Array.isArray(rows) ? rows : []);
      if (Array.isArray(pList) && pList.length) setPersonnelList(pList);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [startDate, effectiveEndDate, user, personnelList.length]);

  useEffect(() => { loadData(false); }, [loadData]);

  const orgFiltered = useMemo(() => {
    return records.filter((r) => {
      if (orgFilter.bureau && r.bureau !== orgFilter.bureau) return false;
      if (orgFilter.division && r.division !== orgFilter.division) return false;
      if (orgFilter.workGroup && r.work_group !== orgFilter.workGroup) return false;
      return true;
    });
  }, [records, orgFilter]);

  const searchFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orgFiltered;
    return orgFiltered.filter((r) => {
      const hay = `${r.full_name || ''} ${r.position_full || r.position || ''} ${r.bureau || ''} ${r.division || ''} ${r.work_group || ''} ${r.shift_name || ''} ${r.remark || ''} ${r.check_in_location || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [orgFiltered, search]);

  const tagCounts = useMemo(() => {
    const map = { normal: 0, late: 0, absent_duty: 0, no_checkin: 0, overtime: 0 };
    for (const r of searchFiltered) {
      if (map[r.status_category] !== undefined) map[r.status_category] += 1;
    }
    return map;
  }, [searchFiltered]);

  const filtered = useMemo(() => {
    return searchFiltered.filter((r) => selectedTags.includes(r.status_category));
  }, [searchFiltered, selectedTags]);

  const toggleTag = (key) => {
    setSelectedTags((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const getStatusColor = useCallback((statusKey) => {
    return settings?.category_colors?.[statusKey]
      || Config.OFFICIAL_STATUSES.find((s) => s.key === statusKey)?.defaultColor
      || '#007B3E';
  }, [settings]);

  const groupHeaderColor = settings?.category_colors?.group_header || '#00744B';

  const openAddModal = () => {
    setEditForm({
      log_id: '',
      personnel_id: '',
      work_date: startDate,
      shift_name: settings?.work_shifts?.[0]?.name || 'เวลาราชการปกติ',
      check_in_time: settings?.standard_check_in || '08:30',
      check_out_time: '',
      status: 'ปฏิบัติงานปกติ',
      check_in_location: settings?.bureau_name || '',
      check_out_location: '',
      remark: '',
      is_special_request: false,
    });
    setEditOpen(true);
  };

  const openEditModal = (row) => {
    const targetLogId = row.log_id || row.id || '';
    setEditForm({
      log_id: targetLogId,
      personnel_id: row.personnel_id || '',
      work_date: row.work_date || startDate,
      shift_name: row.shift_name || 'เวลาราชการปกติ',
      check_in_time: row.check_in_time ? row.check_in_time.slice(0, 5) : (settings?.standard_check_in || '08:30'),
      check_out_time: row.check_out_time ? row.check_out_time.slice(0, 5) : '',
      status: row.status_label && row.status_label !== 'ไม่ลงเวลา' ? row.status_label : 'ปฏิบัติงานปกติ',
      check_in_location: row.check_in_location || '',
      check_out_location: row.check_out_location || '',
      remark: row.remark || '',
      is_special_request: Boolean(row.is_special_request),
    });
    setEditOpen(true);
  };

  const handleSaveRecord = async (e) => {
    e.preventDefault();
    setEditSaving(true);
    try {
      const targetLogId = editForm.log_id || editForm.id || null;
      const res = await AttendanceModel.saveAdminAttendanceRecord({
        log_id: targetLogId,
        id: targetLogId,
        personnel_id: editForm.personnel_id,
        work_date: editForm.work_date,
        shift_name: editForm.shift_name,
        check_in_time: editForm.check_in_time || null,
        check_out_time: editForm.check_out_time || null,
        status: editForm.status || 'ปฏิบัติงานปกติ',
        check_in_location: editForm.check_in_location || null,
        check_out_location: editForm.check_out_location || null,
        remark: editForm.remark || '',
        is_special_request: editForm.is_special_request,
        editor_user_id: user?.id,
      });
      if (res?.success === false) {
        await UIHelpers.alert('บันทึกไม่สำเร็จ', res.message || 'เกิดข้อผิดพลาด', 'error');
        return;
      }
      setEditOpen(false);
      UIHelpers.showToast(res?.message || 'บันทึกข้อมูลการลงเวลาเรียบร้อยแล้ว', 'success');
      await loadData(true);
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteRecord = async (row) => {
    const targetLogId = row.log_id || row.id || '';
    if (!targetLogId) return;
    const ok = await UIHelpers.confirm(
      'ยืนยันการลบข้อมูลลงเวลา',
      `ต้องการลบข้อมูลการลงเวลาของ "${row.full_name}" รายการนี้ใช่หรือไม่?`,
      'ลบรายการ',
      'warning'
    );
    if (!ok) return;
    const res = await AttendanceModel.deleteAttendanceRecord(targetLogId);
    if (res?.success) {
      UIHelpers.showToast('ลบรายการลงเวลาเรียบร้อยแล้ว', 'success');
      await loadData(true);
    } else {
      await UIHelpers.alert('ลบไม่สำเร็จ', res?.message || 'เกิดข้อผิดพลาด', 'error');
    }
  };

  const handleTemplateExcel = async () => {
    const templateRows = [
      {
        'วันที่': UIHelpers.formatThaiFullDate(UIHelpers.getTodayISO()),
        'เลขบัตรประชาชน (13 หลัก)': '1100100123456',
        'คำนำหน้า': 'นาย',
        'ชื่อ-นามสกุล': 'นายสมชาย สายตรวจ',
        'ตำแหน่ง': 'เจ้าพนักงานเทศกิจ',
        'ระดับตำแหน่ง': 'ปฏิบัติงาน',
        'ประเภทตำแหน่ง': 'ประเภททั่วไป',
        'สำนักงาน/กอง': 'สำนักเทศกิจ',
        'ส่วน/ฝ่าย': 'กองตรวจและปฏิบัติการพื้นที่ 1',
        'กลุ่มงาน': 'กลุ่มงานตรวจและปฏิบัติการ 1',
        'เวลาเข้างาน': '08:15',
        'เวลาออกงาน': '16:35',
        'สถานะ': 'ปฏิบัติงานปกติ',
        'หมายเหตุ': '-',
      },
    ];
    await UIHelpers.exportToExcelUTF8(templateRows, 'Template_รายงานการลงเวลา_กทม', 'Template');
    UIHelpers.showToast('ดาวน์โหลดแม่แบบรายงานการลงเวลาเรียบร้อยแล้ว', 'success');
  };

  const handleExportExcel = async () => {
    if (filtered.length === 0) {
      await UIHelpers.alert('ไม่มีข้อมูลส่งออก', 'ไม่พบรายการใน TAG สถานะที่เลือก', 'warning');
      return;
    }
    const rows = filtered.map((r, idx) => {
      const inMode = resolveLocationMode(r, 'check_in');
      const inLoc = formatLocationName(r.check_in_location || (r.is_special_request ? r.check_out_location : ''));
      let inGpsDisplay = '-';
      if (inMode) {
        const modeTxt = inMode === 'ONSITE' ? 'ในสถานที่' : 'นอกสถานที่';
        inGpsDisplay = inLoc && inLoc !== '-' ? `${modeTxt}\n${inLoc}` : modeTxt;
      }

      const outMode = resolveLocationMode(r, 'check_out');
      const outLoc = formatLocationName(r.check_out_location || (r.is_special_request ? r.check_in_location : ''));
      let outGpsDisplay = '-';
      if (outMode) {
        const modeTxt = outMode === 'ONSITE' ? 'ในสถานที่' : 'นอกสถานที่';
        outGpsDisplay = outLoc && outLoc !== '-' ? `${modeTxt}\n${outLoc}` : modeTxt;
      }

      const rowObj = {
        'ลำดับ': idx + 1,
        'วันที่': r.work_date_thai_full || UIHelpers.formatThaiFullDate(r.work_date),
        'ชื่อ-นามสกุล': r.full_name || '-',
        'ตำแหน่ง': r.position_full || UIHelpers.formatPosition(r.position_title, r.position_level, r.position_type, r.position),
        'สำนักงาน/กอง': r.bureau || '-',
        'ส่วน/ฝ่าย': r.division || '-',
        'กลุ่มงาน': r.work_group || '-',
        'เวลาเข้างาน': r.check_in_time || '-',
        'เวลาออกงาน': r.check_out_time || '-',
      };
      if (showGps) {
        rowObj['พิกัด GPS เข้างาน'] = inGpsDisplay;
        rowObj['พิกัด GPS ออกงาน'] = outGpsDisplay;
      }
      rowObj['สถานะ'] = r.status_label || r.status || '-';
      rowObj['หมายเหตุ'] = resolveReportRemarkText(r);
      return rowObj;
    });
    await UIHelpers.exportToExcelUTF8(rows, `รายงานการลงเวลา_${startDate}_${effectiveEndDate}`, 'AttendanceReport');
    UIHelpers.showToast('ส่งออกไฟล์ Excel เรียบร้อยแล้ว', 'success');
  };

  const buildPrintTableHtmlForDay = (dayRecords, daySubtitle, activeStatuses) => {
    const colSpan = showGps ? 8 : 6;
    const colgroupHtml = showGps
      ? `<colgroup>
          <col style="width: 5%;">
          <col style="width: 18%;">
          <col style="width: 17%;">
          <col style="width: 9%;">
          <col style="width: 9%;">
          <col style="width: 15%;">
          <col style="width: 15%;">
          <col style="width: 12%;">
        </colgroup>`
      : `<colgroup>
          <col style="width: 6%;">
          <col style="width: 25%;">
          <col style="width: 25%;">
          <col style="width: 12%;">
          <col style="width: 12%;">
          <col style="width: 20%;">
        </colgroup>`;

    const theadHtml = showGps
      ? `<thead>
          <tr>
            <th style="text-align: center;">ลำดับ</th>
            <th>ชื่อ-นามสกุล</th>
            <th>ตำแหน่ง</th>
            <th style="text-align: center;">เวลาเข้างาน</th>
            <th style="text-align: center;">เวลาออกงาน</th>
            <th>พิกัด GPS เข้างาน</th>
            <th>พิกัด GPS ออกงาน</th>
            <th>หมายเหตุ</th>
          </tr>
        </thead>`
      : `<thead>
          <tr>
            <th style="text-align: center;">ลำดับ</th>
            <th>ชื่อ-นามสกุล</th>
            <th>ตำแหน่ง</th>
            <th style="text-align: center;">เวลาเข้างาน</th>
            <th style="text-align: center;">เวลาออกงาน</th>
            <th>หมายเหตุ</th>
          </tr>
        </thead>`;

    let html = '';
    for (const statusMeta of activeStatuses) {
      const statusColor = getStatusColor(statusMeta.key);
      const tagRecords = dayRecords.filter((r) => r.status_category === statusMeta.key);
      let rowsHtml = '';

      if (tagRecords.length === 0) {
        rowsHtml = `<tr><td colspan="${colSpan}" style="text-align:center; padding: 14px; color:#64748B;">ไม่มีข้อมูลบุคลากรในสถานะนี้</td></tr>`;
      } else {
        const grouped = PersonnelModel.groupPersonnel(tagRecords, groupBy);
        let runningNo = 1;
        for (const [bureauName, divisionsObj] of Object.entries(grouped || {})) {
          for (const [divisionName, content] of Object.entries(divisionsObj || {})) {
            const divCount = groupBy === 'group'
              ? Object.values(content || {}).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0)
              : (Array.isArray(content) ? content.length : 0);

            rowsHtml += `
              <tr class="group-row">
                <td colspan="${colSpan}" style="background-color: ${groupHeaderColor} !important; color: #FFFFFF !important; font-weight: 700; padding: 7px 12px;">
                  ${UIHelpers.escapeHtml(bureauName || '-')} &gt; ${UIHelpers.escapeHtml(divisionName || '-')} (${divCount} คน)
                </td>
              </tr>
            `;

            const renderPrintRow = (rec) => {
              const posDisplay = UIHelpers.escapeHtml(rec.position_full || UIHelpers.formatPosition(rec.position_title, rec.position_level, rec.position_type, rec.position) || '-');
              const inMode = resolveLocationMode(rec, 'check_in');
              const inLoc = UIHelpers.escapeHtml(formatLocationName(rec.check_in_location || (rec.is_special_request ? rec.check_out_location : '')));
              const outMode = resolveLocationMode(rec, 'check_out');
              const outLoc = UIHelpers.escapeHtml(formatLocationName(rec.check_out_location || (rec.is_special_request ? rec.check_in_location : '')));
              const remarkTxt = UIHelpers.escapeHtml(resolveReportRemarkText(rec)).replace(/\n/g, '<br/>');

              const gpsCells = showGps
                ? `<td style="font-size: 11px;">
                    ${inMode ? `<div><strong>${inMode === 'ONSITE' ? 'ในสถานที่' : 'นอกสถานที่'}</strong></div><div>${inLoc}</div>` : '-'}
                  </td>
                  <td style="font-size: 11px;">
                    ${outMode ? `<div><strong>${outMode === 'ONSITE' ? 'ในสถานที่' : 'นอกสถานที่'}</strong></div><div>${outLoc}</div>` : '-'}
                  </td>`
                : '';

              return `
                <tr>
                  <td style="text-align: center;">${runningNo++}</td>
                  <td><strong>${UIHelpers.escapeHtml(rec.full_name || '-')}</strong></td>
                  <td>${posDisplay}</td>
                  <td style="text-align: center; font-family: monospace; font-weight: 700;">${rec.check_in_time ? `${UIHelpers.escapeHtml(rec.check_in_time)} น.` : '-'}</td>
                  <td style="text-align: center; font-family: monospace; font-weight: 700;">${rec.check_out_time ? `${UIHelpers.escapeHtml(rec.check_out_time)} น.` : '-'}</td>
                  ${gpsCells}
                  <td>${remarkTxt}</td>
                </tr>
              `;
            };

            if (groupBy === 'group') {
              for (const [groupName, members] of Object.entries(content || {})) {
                const memberList = Array.isArray(members) ? members : [];
                rowsHtml += `
                  <tr class="sub-group-row">
                    <td colspan="${colSpan}" style="padding-left: 24px; font-weight: 700;">
                      กลุ่มงาน: ${UIHelpers.escapeHtml(groupName || '-')} (${memberList.length} คน)
                    </td>
                  </tr>
                `;
                for (const rec of memberList) {
                  rowsHtml += renderPrintRow(rec);
                }
              }
            } else {
              for (const rec of (Array.isArray(content) ? content : [])) {
                rowsHtml += renderPrintRow(rec);
              }
            }
          }
        }
      }

      html += `
        <div class="tag-section-block">
          <div class="tag-section-title" style="background-color: ${statusColor};">
            ตาราง: ${UIHelpers.escapeHtml(statusMeta.label)} - ประจำวันที่ ${UIHelpers.escapeHtml(daySubtitle)} (รวม ${tagRecords.length} รายการ)
          </div>
          <table>
            ${colgroupHtml}
            ${theadHtml}
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      `;
    }
    return html;
  };

  const handlePrintPdf = () => {
    const activeStatuses = Config.OFFICIAL_STATUSES.filter((st) => selectedTags.includes(st.key));
    if (activeStatuses.length === 0) {
      UIHelpers.alert('กรุณาเลือกสถานะ', 'โปรดเลือก TAG สถานะอย่างน้อย 1 รายการก่อนสั่งพิมพ์ PDF', 'warning');
      return;
    }

    let combinedHtml = '';
    if (dateMode === 'range') {
      const dates = AttendanceModel.getDatesBetween(startDate, effectiveEndDate);
      for (const d of dates) {
        const dayRecords = searchFiltered.filter((r) => r.work_date === d);
        if (dayRecords.length === 0) continue;
        const dayThai = UIHelpers.formatThaiFullDate(d);
        combinedHtml += `
          <div class="day-section-banner" style="background-color: #00351B; color: #FFFFFF; padding: 8px 14px; font-weight: 800; font-size: 15px; border-radius: 6px; margin-top: 18px; margin-bottom: 12px;">
            รายงานประจำวันที่ ${UIHelpers.escapeHtml(dayThai)} (รวม ${dayRecords.length} รายการ)
          </div>
        `;
        combinedHtml += buildPrintTableHtmlForDay(dayRecords, dayThai, activeStatuses);
      }
    } else {
      const dayThai = UIHelpers.formatThaiFullDate(startDate);
      combinedHtml = buildPrintTableHtmlForDay(searchFiltered, dayThai, activeStatuses);
    }

    const subtitleDate = dateMode === 'single'
      ? `ประจำวันที่ ${UIHelpers.formatThaiFullDate(startDate)}`
      : `ช่วงวันที่ ${UIHelpers.formatThaiFullDate(startDate)} ถึง ${UIHelpers.formatThaiFullDate(effectiveEndDate)}`;

    UIHelpers.printReportInNewTab({
      title: `รายงานการลงเวลาปฏิบัติราชการ ${settings?.organization_name || 'กรุงเทพมหานคร'}`,
      subtitle: `สังกัด: ${settings?.bureau_name || 'สำนักเทศกิจ'} • ${subtitleDate}`,
      tableHtml: combinedHtml,
      headerColor: groupHeaderColor,
    });
  };

  const activeShiftObj = (settings?.work_shifts || []).find((s) => s.name === editForm.shift_name);
  const activeStatuses = useMemo(
    () => Config.OFFICIAL_STATUSES.filter((s) => selectedTags.includes(s.key)),
    [selectedTags]
  );

  const totalCols = (showGps ? 8 : 6) + (canManageRecords ? 1 : 0);

  const renderGpsCell = (row, type) => {
    const mode = resolveLocationMode(row, type);
    if (!mode) {
      return <td className="w-44 min-w-[180px] py-3 px-3 text-center text-slate-400 font-medium">-</td>;
    }
    const rawLoc = type === 'check_in'
      ? (row.check_in_location || (row.is_special_request ? row.check_out_location : ''))
      : (row.check_out_location || (row.is_special_request ? row.check_in_location : ''));
    const locName = formatLocationName(rawLoc);

    return (
      <td className="w-44 min-w-[180px] py-3 px-3">
        <div className="flex flex-col items-start justify-center">
          {mode === 'ONSITE' ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300/40">
              <i className="fa-solid fa-building text-[10px]" />ในสถานที่
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-300/40">
              <i className="fa-solid fa-map-location-dot text-[10px]" />นอกสถานที่
            </span>
          )}
          {locName && locName !== '-' ? (
            <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate max-w-[170px] mt-1" title={locName}>
              <i className="fa-solid fa-location-dot text-slate-400 mr-1" />{locName}
            </div>
          ) : (
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">-</div>
          )}
        </div>
      </td>
    );
  };

  const renderRemarkNode = (row) => {
    const txt = resolveReportRemarkText(row);
    if (txt === 'ขอแก้ไขเวลา' || txt.endsWith('(แก้ไขเวลา)')) {
      return <span className="font-bold text-[#00744B] dark:text-emerald-400">{txt}</span>;
    }
    const lines = txt.split('\n');
    if (lines.length > 1) {
      return (
        <div>
          <div className="font-bold text-slate-800 dark:text-slate-200">{lines[0]}</div>
          <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">{lines.slice(1).join(' ')}</div>
        </div>
      );
    }
    return <span>{txt}</span>;
  };

  const renderPersonRow = (row, runningNo) => {
    const posDisplay = row.position_full || UIHelpers.formatPosition(row.position_title, row.position_level, row.position_type, row.position) || '-';
    const targetLogId = row.log_id || row.id || '';
    const allowEdit = canManageRecords && canEditAttendance(row);
    const allowDelete = canManageRecords && isSuperAdmin && Boolean(targetLogId) && canDeleteAttendance(row);

    return (
      <tr
        key={row.row_uid || targetLogId || `${row.personnel_id}-${row.work_date}-${runningNo}`}
        onClick={() => setProfileRow(row)}
        className="hover:bg-sky-50/40 dark:hover:bg-slate-800/40 cursor-pointer transition"
        title="คลิกเพื่อดูโปรไฟล์ รูปถ่าย และพิกัด Google Map ของรายการนี้"
      >
        <td className="w-14 text-center py-3 px-2.5 font-semibold text-slate-500">{runningNo}</td>
        <td className={`${showGps ? 'min-w-[170px]' : 'min-w-[200px]'} py-3 px-3 whitespace-nowrap`}>
          <div className="font-bold text-slate-800 dark:text-white flex items-center">
            <i className="fa-solid fa-id-badge text-emerald-600/80 mr-1.5" />
            <span>{row.full_name || '-'}</span>
          </div>
        </td>
        <td className={`${showGps ? 'min-w-[160px]' : 'min-w-[200px]'} py-3 px-3 whitespace-nowrap font-medium text-slate-700 dark:text-slate-200`}>
          {posDisplay}
        </td>
        <td className={`${showGps ? 'w-28' : 'w-32'} text-center py-3 px-2.5 font-mono font-bold whitespace-nowrap text-[#00744B] dark:text-[#00C08A]`}>
          {row.check_in_time ? `${row.check_in_time} น.` : '-'}
        </td>
        <td className={`${showGps ? 'w-28' : 'w-32'} text-center py-3 px-2.5 font-mono font-bold whitespace-nowrap text-slate-700 dark:text-slate-200`}>
          {row.check_out_time ? `${row.check_out_time} น.` : '-'}
        </td>
        {showGps && renderGpsCell(row, 'check_in')}
        {showGps && renderGpsCell(row, 'check_out')}
        <td className={`${showGps ? 'min-w-[130px]' : 'min-w-[180px]'} py-3 px-3 text-xs text-slate-600 dark:text-slate-300`}>
          {renderRemarkNode(row)}
        </td>
        {canManageRecords && (
          <td className="w-24 text-center py-3 px-2.5 whitespace-nowrap no-print" onClick={(e) => e.stopPropagation()}>
            <div className="inline-flex items-center gap-1">
              {allowEdit && (
                <button
                  type="button"
                  onClick={() => openEditModal(row)}
                  title="บันทึก/แก้ไขเวลา"
                  className="w-7 h-7 rounded-lg bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/50 text-sky-600 dark:text-sky-300 border border-sky-200 dark:border-sky-800 flex items-center justify-center"
                >
                  <i className="fa-solid fa-pen text-[11px]" />
                </button>
              )}
              {allowDelete && (
                <button
                  type="button"
                  onClick={() => handleDeleteRecord(row)}
                  title="ลบรายการ"
                  className="w-7 h-7 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 flex items-center justify-center"
                >
                  <i className="fa-solid fa-trash text-[11px]" />
                </button>
              )}
            </div>
          </td>
        )}
      </tr>
    );
  };

  const renderSingleTagTableCard = (statusMeta, dayRecords, daySubtitle, keyPrefix = '') => {
    const statusColor = getStatusColor(statusMeta.key);
    const tagRecords = dayRecords.filter((r) => r.status_category === statusMeta.key);
    const grouped = PersonnelModel.groupPersonnel(tagRecords, groupBy);
    let runningNo = 1;
    let mobileRunningNo = 1;

    return (
      <div
        key={`${keyPrefix}${statusMeta.key}`}
        className="bma-card bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 space-y-3"
        style={{ borderTop: `4px solid ${statusColor}` }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <span
              className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs"
              style={{ backgroundColor: statusColor }}
            />
            <div>
              <h4 className="font-extrabold text-sm md:text-base text-slate-800 dark:text-white">
                ตาราง: <span style={{ color: statusColor }}>{statusMeta.label}</span>
              </h4>
              <p className="text-[11px] text-slate-400">ประจำวันที่ {daySubtitle}</p>
            </div>
          </div>
          <span
            className="px-3 py-1 rounded-full text-xs font-extrabold text-white shadow-xs"
            style={{ backgroundColor: statusColor }}
          >
            รวม {tagRecords.length} รายการ
          </span>
        </div>

        {/* Desktop Grouped Table */}
        <div className="hidden lg:block overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-700/60">
          <table className="w-full text-xs text-left bma-table">
            <thead className="bg-slate-100 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 font-extrabold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="w-14 text-center py-3 px-2.5">ลำดับ</th>
                <th className={`${showGps ? 'min-w-[170px]' : 'min-w-[200px]'} py-3 px-3`}>ชื่อ-นามสกุล</th>
                <th className={`${showGps ? 'min-w-[160px]' : 'min-w-[200px]'} py-3 px-3`}>ตำแหน่ง</th>
                <th className={`${showGps ? 'w-28' : 'w-32'} text-center py-3 px-2.5`}>เวลาเข้างาน</th>
                <th className={`${showGps ? 'w-28' : 'w-32'} text-center py-3 px-2.5`}>เวลาออกงาน</th>
                {showGps && <th className="w-44 min-w-[180px] py-3 px-3">พิกัด GPS เข้างาน</th>}
                {showGps && <th className="w-44 min-w-[180px] py-3 px-3">พิกัด GPS ออกงาน</th>}
                <th className={`${showGps ? 'min-w-[130px]' : 'min-w-[180px]'} py-3 px-3`}>หมายเหตุ</th>
                {canManageRecords && <th className="w-24 text-center py-3 px-2.5 no-print">จัดการ</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {tagRecords.length === 0 ? (
                <tr>
                  <td colSpan={totalCols} className="text-center py-6 text-slate-400 font-medium">
                    ไม่มีข้อมูลบุคลากรในสถานะนี้
                  </td>
                </tr>
              ) : (
                Object.entries(grouped || {}).map(([bureauName, divisionsObj]) =>
                  Object.entries(divisionsObj || {}).map(([divisionName, content]) => {
                    const divCount = groupBy === 'group'
                      ? Object.values(content || {}).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0)
                      : (Array.isArray(content) ? content.length : 0);

                    return (
                      <React.Fragment key={`${bureauName}-${divisionName}`}>
                        <tr className="group-row" style={{ backgroundColor: groupHeaderColor }}>
                          <td colSpan={totalCols} className="font-bold text-xs sm:text-sm py-2.5 px-4 text-white">
                            <i className="fa-solid fa-building-user mr-1.5" />
                            {bureauName || '-'} &gt; {divisionName || '-'} ({divCount} คน)
                          </td>
                        </tr>
                        {groupBy === 'group'
                          ? Object.entries(content || {}).map(([groupName, members]) => {
                              const memberList = Array.isArray(members) ? members : [];
                              return (
                                <React.Fragment key={`${bureauName}-${divisionName}-${groupName}`}>
                                  <tr className="sub-group-row bg-emerald-950/5 dark:bg-slate-800/60">
                                    <td colSpan={totalCols} className="font-semibold text-xs py-2 pl-8 text-slate-700 dark:text-slate-200">
                                      <i className="fa-solid fa-layer-group mr-1.5 text-emerald-600" />
                                      กลุ่มงาน: {groupName || '-'} ({memberList.length} คน)
                                    </td>
                                  </tr>
                                  {memberList.map((rec) => renderPersonRow(rec, runningNo++))}
                                </React.Fragment>
                              );
                            })
                          : (Array.isArray(content) ? content : []).map((rec) => renderPersonRow(rec, runningNo++))}
                      </React.Fragment>
                    );
                  })
                )
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Grouped Cards */}
        <div className="lg:hidden space-y-2.5 bg-slate-100/80 dark:bg-slate-950/40 p-3 rounded-2xl">
          {tagRecords.length === 0 ? (
            <div className="rounded-xl bg-white dark:bg-slate-800 p-5 text-center text-xs text-slate-400">
              ไม่มีข้อมูลบุคลากรในสถานะนี้
            </div>
          ) : (
            Object.entries(grouped || {}).map(([bureauName, divisionsObj]) =>
              Object.entries(divisionsObj || {}).map(([divisionName, content]) => {
                const divCount = groupBy === 'group'
                  ? Object.values(content || {}).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0)
                  : (Array.isArray(content) ? content.length : 0);
                const flatMembers = groupBy === 'group'
                  ? Object.values(content || {}).flat()
                  : (Array.isArray(content) ? content : []);

                return (
                  <div key={`m-${bureauName}-${divisionName}`} className="space-y-2">
                    <div
                      className="rounded-xl px-3.5 py-2 font-bold text-xs text-white shadow-xs"
                      style={{ backgroundColor: groupHeaderColor }}
                    >
                      <i className="fa-solid fa-building-user mr-1.5" />
                      {bureauName || '-'} &gt; {divisionName || '-'} ({divCount} คน)
                    </div>
                    {flatMembers.map((row) => {
                      const seq = mobileRunningNo++;
                      const posDisplay = row.position_full || UIHelpers.formatPosition(row.position_title, row.position_level, row.position_type, row.position) || '-';
                      const targetLogId = row.log_id || row.id || '';
                      return (
                        <div
                          key={row.row_uid || targetLogId || `${row.personnel_id}-${seq}`}
                          onClick={() => setProfileRow(row)}
                          className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 p-3.5 shadow-xs space-y-2 text-xs cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-700">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded bg-slate-100 dark:bg-slate-700 font-extrabold text-[11px]">
                                {seq}
                              </span>
                              <span className="font-extrabold text-slate-800 dark:text-white truncate">{row.full_name}</span>
                            </div>
                            <i className="fa-solid fa-id-badge text-emerald-600/80" />
                          </div>
                          <div className="flex justify-between gap-2">
                            <span className="text-slate-400">ตำแหน่ง</span>
                            <span className="font-semibold text-right">{posDisplay}</span>
                          </div>
                          <div className="flex justify-between gap-2 font-mono">
                            <span>เข้า: <strong className="text-[#00744B]">{row.check_in_time ? `${row.check_in_time} น.` : '-'}</strong></span>
                            <span>ออก: <strong>{row.check_out_time ? `${row.check_out_time} น.` : '-'}</strong></span>
                          </div>
                          {canManageRecords && (
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                              {canEditAttendance(row) && (
                                <button type="button" onClick={() => openEditModal(row)} className="px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 font-bold text-[11px]">
                                  <i className="fa-solid fa-pen mr-1" />แก้ไข
                                </button>
                              )}
                              {isSuperAdmin && targetLogId && canDeleteAttendance(row) && (
                                <button type="button" onClick={() => handleDeleteRecord(row)} className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-600 font-bold text-[11px]">
                                  <i className="fa-solid fa-trash mr-1" />ลบ
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )
          )}
        </div>
      </div>
    );
  };

  return (
    <AdminLayout
      title="รายงานการลงเวลาปฏิบัติราชการ"
      subtitle="รายงาน 5 หมวดหมู่ แยกตารางตาม TAG สถานะ พิกัด GPS แยกเข้า-ออก พร้อมส่งออก Excel และพิมพ์ PDF แนวนอน A4"
      activePage="reports"
      onRealtimeSync={() => loadData(true)}
    >
      <MobileShortcutGrid />

      <div className="pt-4 space-y-5">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md overflow-visible">
          {/* Floating Sapphire Blue Header (#0971CE -> #38BDF8) */}
          <div className="-mt-6 mx-4 px-5 py-4 rounded-2xl bg-gradient-to-r from-[#0971CE] to-[#38BDF8] text-white shadow-lg flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <i className="fa-solid fa-file-lines text-lg" />
              <div>
                <h2 className="font-extrabold text-sm sm:text-base">รายงานการลงเวลาปฏิบัติราชการ ({filtered.length} รายการ)</h2>
                <p className="text-[11px] text-sky-100">
                  {dateMode === 'single' ? UIHelpers.formatThaiFullDate(startDate) : `${UIHelpers.formatThaiShortDate(startDate)} – ${UIHelpers.formatThaiShortDate(effectiveEndDate)}`}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {canManageRecords && (
                <button type="button" onClick={openAddModal} className="px-3 py-1.5 rounded-xl bg-white text-sky-800 hover:bg-sky-50 text-xs font-extrabold shadow-xs transition">
                  <i className="fa-solid fa-plus mr-1" />เพิ่มเวลาปฏิบัติราชการ
                </button>
              )}
              <button type="button" onClick={handleExportExcel} className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition">
                <i className="fa-solid fa-file-excel mr-1" />ส่งออก Excel
              </button>
              <button
                type="button"
                onClick={handleTemplateExcel}
                className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition"
              >
                <i className="fa-solid fa-file-arrow-down mr-1" />Template Excel
              </button>
              <button type="button" onClick={handlePrintPdf} className="px-3 py-1.5 rounded-xl bg-slate-900/85 hover:bg-slate-900 text-white text-xs font-bold transition">
                <i className="fa-solid fa-file-pdf text-rose-300 mr-1.5" />พิมพ์/ส่งออก
              </button>
            </div>
          </div>

          {/* Multi-Select 5-Tag Status Chips + Quick Selectors */}
          <div className="p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {Config.OFFICIAL_STATUSES.map((st) => {
                const active = selectedTags.includes(st.key);
                const color = getStatusColor(st.key);
                return (
                  <button
                    key={st.key}
                    type="button"
                    onClick={() => toggleTag(st.key)}
                    style={active ? { backgroundColor: color, borderColor: color, color: '#fff' } : undefined}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition ${
                      active ? 'shadow-xs' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <i className={`fa-solid ${active ? 'fa-square-check' : 'fa-square'}`} style={!active ? { color } : undefined} />
                    <span>{st.label}</span>
                    <span className="font-mono">({tagCounts[st.key] || 0})</span>
                  </button>
                );
              })}
              <div className="ml-auto flex flex-wrap gap-1.5 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setSelectedTags(DEFAULT_STATUS_KEYS)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition"
                >
                  ค่าเริ่มต้น (ปฏิบัติงานปกติ + มาสาย)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTags(ALL_STATUS_KEYS)}
                  className="px-2.5 py-1 rounded-lg bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 hover:bg-sky-100 transition"
                >
                  เลือกทั้งหมด (5 สถานะ)
                </button>
              </div>
            </div>

            {/* Single/Range Date Toggle + Group By + Search */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end">
              <div className="md:col-span-3">
                <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-[11px] font-bold">
                  <button type="button" onClick={() => setDateMode('single')} className={`py-1.5 rounded-lg ${dateMode === 'single' ? 'bg-white dark:bg-slate-900 text-sky-700 shadow-xs' : 'text-slate-500'}`}>เลือกวันเดียว</button>
                  <button type="button" onClick={() => setDateMode('range')} className={`py-1.5 rounded-lg ${dateMode === 'range' ? 'bg-white dark:bg-slate-900 text-sky-700 shadow-xs' : 'text-slate-500'}`}>เลือกเป็นช่วง</button>
                </div>
              </div>
              <div className={dateMode === 'single' ? 'md:col-span-2' : 'md:col-span-2'}>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold" />
              </div>
              {dateMode === 'range' && (
                <div className="md:col-span-2">
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold" />
                </div>
              )}
              <div className={dateMode === 'single' ? 'md:col-span-4' : 'md:col-span-3'}>
                <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold">
                  <option value="division">มุมมองที่ 1: สำนักงาน/กอง &gt; ส่วน/ฝ่าย</option>
                  <option value="group">มุมมองที่ 2: สำนักงาน/กอง &gt; ส่วน/ฝ่าย &gt; กลุ่มงาน</option>
                </select>
              </div>
              <div className={dateMode === 'single' ? 'md:col-span-3' : 'md:col-span-2'}>
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่อ / สังกัด / หมายเหตุ..." className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs" />
              </div>
            </div>

            <OrgHierarchyFilter bureau={orgFilter.bureau} division={orgFilter.division} workGroup={orgFilter.workGroup} onChange={setOrgFilter} compact />

            {/* Profile Click Hint Bar (reports.html:172-175) */}
            <p className="text-[11px] text-sky-700 dark:text-sky-300 bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200/70 dark:border-sky-900/60 rounded-xl px-3 py-1.5">
              <i className="fa-solid fa-circle-info mr-1.5" />คลิกที่แถวรายชื่อเพื่อเปิดดูโปรไฟล์ ภาพถ่าย 3:4 และพิกัด Google Maps แยกขาเข้า-ขาออก
            </p>
          </div>
        </div>

        {/* TAG-Separated Table Cards Container (NO Pagination) */}
        {loading ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center text-slate-400">
            <i className="fa-solid fa-circle-notch fa-spin text-2xl text-sky-600 mb-2" />
            <p className="text-sm font-semibold">กำลังประมวลผลรายงาน...</p>
          </div>
        ) : activeStatuses.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center text-slate-500">
            <i className="fa-solid fa-tags text-3xl mb-2 text-emerald-600 block" />
            <p className="text-sm font-bold">กรุณาคลิกเลือก TAG สถานะด้านบนอย่างน้อย 1 สถานะ เพื่อแสดงตารางรายงาน</p>
          </div>
        ) : dateMode === 'range' ? (
          <div className="space-y-6">
            {AttendanceModel.getDatesBetween(startDate, effectiveEndDate).map((dayDate) => {
              const dayRecords = searchFiltered.filter((r) => r.work_date === dayDate);
              if (dayRecords.length === 0) return null;
              const dayThaiFull = UIHelpers.formatThaiFullDate(dayDate);
              return (
                <div key={dayDate} className="space-y-4">
                  <div className="p-3.5 rounded-2xl bg-gradient-to-r from-[#00351B] to-[#00744B] text-white shadow-md flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center text-[#FDD835]">
                        <i className="fa-solid fa-calendar-day" />
                      </span>
                      <h3 className="text-sm sm:text-base font-extrabold text-white">
                        รายงานประจำวันที่ {dayThaiFull} (รวม {dayRecords.length} รายการ)
                      </h3>
                    </div>
                    <span className="text-xs text-emerald-100 font-semibold bg-white/10 px-3 py-1 rounded-full">
                      รวม {dayRecords.length} รายการ
                    </span>
                  </div>
                  <div className="space-y-4">
                    {activeStatuses.map((statusMeta) =>
                      renderSingleTagTableCard(statusMeta, dayRecords, dayThaiFull, `${dayDate}-`)
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4">
            {activeStatuses.map((statusMeta) =>
              renderSingleTagTableCard(statusMeta, searchFiltered, UIHelpers.formatThaiFullDate(startDate))
            )}
          </div>
        )}
      </div>

      {/* 2-Column Row Profile Modal (reports.html:415-555) */}
      <ResponsiveModal
        open={Boolean(profileRow)}
        onClose={() => setProfileRow(null)}
        title={profileRow?.full_name || 'โปรไฟล์การลงเวลาบุคลากร'}
        subtitle={profileRow ? `${UIHelpers.formatPosition(profileRow.position_title, profileRow.position_level, profileRow.position_type, profileRow.position_full || profileRow.position)} • ${profileRow.work_date_thai_full || UIHelpers.formatThaiFullDate(profileRow.work_date)}` : ''}
        icon="fa-id-badge"
        maxWidthClass="max-w-5xl"
        footer={
          <>
            <button type="button" onClick={() => setProfileRow(null)} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-bold">
              ปิดหน้าต่าง
            </button>
            {profileRow && canManageRecords && canEditAttendance(profileRow) && (
              <button
                type="button"
                onClick={() => { const target = profileRow; setProfileRow(null); openEditModal(target); }}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold"
              >
                <i className="fa-solid fa-pen mr-1.5" />แก้ไขบันทึกเวลานี้
              </button>
            )}
          </>
        }
      >
        {profileRow && (() => {
          const inPhoto = profileRow.check_in_photo || profileRow.check_in_photo_url || (profileRow.is_special_request ? (profileRow.check_out_photo || profileRow.check_out_photo_url) : '') || '';
          const outPhoto = profileRow.check_out_photo || profileRow.check_out_photo_url || (profileRow.is_special_request ? inPhoto : '') || '';
          const inMode = resolveLocationMode(profileRow, 'check_in');
          const outMode = resolveLocationMode(profileRow, 'check_out');
          const inLat = profileRow.check_in_lat ?? (profileRow.is_special_request ? profileRow.check_out_lat : null);
          const inLng = profileRow.check_in_lng ?? (profileRow.is_special_request ? profileRow.check_out_lng : null);
          const outLat = profileRow.check_out_lat ?? (profileRow.is_special_request ? profileRow.check_in_lat : null);
          const outLng = profileRow.check_out_lng ?? (profileRow.is_special_request ? profileRow.check_in_lng : null);
          const inPlace = formatLocationName(profileRow.check_in_location || (profileRow.is_special_request ? profileRow.check_out_location : ''));
          const outPlace = formatLocationName(profileRow.check_out_location || (profileRow.is_special_request ? profileRow.check_in_location : ''));
          const hasValidInCoords = typeof inLat === 'number' && typeof inLng === 'number' && !Number.isNaN(inLat) && !Number.isNaN(inLng);
          const hasValidOutCoords = typeof outLat === 'number' && typeof outLng === 'number' && !Number.isNaN(outLat) && !Number.isNaN(outLng);

          return (
            <div className="space-y-4 text-xs">
              {/* Summary Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/70 rounded-2xl p-3.5 border border-slate-200/70 dark:border-slate-700">
                <div>
                  <span className="text-slate-400 block">สำนักงาน / กอง</span>
                  <strong className="text-slate-800 dark:text-white mt-0.5 block">{profileRow.bureau || '-'}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">ส่วน / ฝ่าย</span>
                  <strong className="text-slate-800 dark:text-white mt-0.5 block">{profileRow.division || '-'}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">กลุ่มงาน</span>
                  <strong className="text-slate-800 dark:text-white mt-0.5 block">{profileRow.work_group || '-'}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">กะปฏิบัติงาน / สถานะ</span>
                  <strong className="text-slate-800 dark:text-white mt-0.5 block">{profileRow.shift_name || '-'} ({profileRow.status_label || '-'})</strong>
                </div>
              </div>

              {/* 2-Column Comparison: Left = Check-in, Right = Check-out */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Left Column: Check-in */}
                <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/30 dark:bg-emerald-950/20 p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-emerald-200/70 dark:border-emerald-800/60 pb-2.5">
                    <h4 className="font-extrabold text-sm text-[#00744B] dark:text-emerald-400 flex items-center gap-2">
                      <i className="fa-solid fa-right-to-bracket" />
                      <span>ข้อมูลขาเข้างาน (Check-in)</span>
                    </h4>
                    <span className="font-mono text-sm font-extrabold text-[#00744B] dark:text-emerald-300">
                      {profileRow.check_in_time ? `${profileRow.check_in_time} น.` : 'ไม่ได้ลงเวลา'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                    <div className="sm:col-span-5">
                      <div className="aspect-[3/4] w-full max-w-[180px] mx-auto rounded-xl overflow-hidden bg-slate-900 border border-slate-300 dark:border-slate-700 flex items-center justify-center">
                        {inPhoto ? (
                          <img src={inPhoto} alt="ภาพถ่ายขาเข้างาน" className="w-full h-full object-cover" />
                        ) : (
                          <div className="text-center p-3 text-slate-400">
                            <i className="fa-solid fa-camera-slash text-2xl mb-1 block text-amber-400" />
                            <span className="text-[11px]">ไม่มีภาพถ่ายขาเข้า</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="sm:col-span-7 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">ประเภทสถานที่:</span>
                        {inMode ? (
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${inMode === 'ONSITE' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'}`}>
                            {inMode === 'ONSITE' ? 'ในสถานที่' : 'นอกสถานที่'}
                          </span>
                        ) : (
                          <span>-</span>
                        )}
                      </div>
                      <div>
                        <span className="text-slate-500 block">สถานที่บันทึก:</span>
                        <p className="font-bold text-slate-800 dark:text-white mt-0.5">{inPlace}</p>
                      </div>
                      <div>
                        <span className="text-slate-500 block">พิกัด GPS (Lat, Lng):</span>
                        <p className="font-mono font-semibold text-slate-700 dark:text-slate-300 mt-0.5">
                          {hasValidInCoords ? `${Number(inLat).toFixed(6)}, ${Number(inLng).toFixed(6)}` : 'ไม่ได้บันทึกพิกัด GPS'}
                        </p>
                      </div>
                      {hasValidInCoords && (
                        <div className="space-y-2 pt-1">
                          <a
                            href={`https://www.google.com/maps?q=${inLat},${inLng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#00744B] text-white font-bold text-[11px]"
                          >
                            <i className="fa-solid fa-map-location-dot" />เปิดดูใน Google Maps
                          </a>
                          <iframe
                            title="แผนที่ขาเข้างาน"
                            src={`https://maps.google.com/maps?q=${inLat},${inLng}&hl=th&z=16&output=embed`}
                            className="w-full h-36 rounded-xl border border-slate-200 dark:border-slate-700"
                            loading="lazy"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Column: Check-out */}
                <div className="rounded-2xl border border-sky-200 dark:border-sky-800/70 bg-sky-50/30 dark:bg-sky-950/20 p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-sky-200/70 dark:border-sky-800/60 pb-2.5">
                    <h4 className="font-extrabold text-sm text-sky-700 dark:text-sky-400 flex items-center gap-2">
                      <i className="fa-solid fa-right-from-bracket" />
                      <span>ข้อมูลขาออกงาน (Check-out)</span>
                    </h4>
                    <span className="font-mono text-sm font-extrabold text-sky-700 dark:text-sky-300">
                      {profileRow.check_out_time ? `${profileRow.check_out_time} น.` : 'ยังไม่ได้ลงเวลาออก'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                    <div className="sm:col-span-5">
                      <div className="aspect-[3/4] w-full max-w-[180px] mx-auto rounded-xl overflow-hidden bg-slate-900 border border-slate-300 dark:border-slate-700 flex items-center justify-center">
                        {outPhoto ? (
                          <img src={outPhoto} alt="ภาพถ่ายขาออกงาน" className="w-full h-full object-cover" />
                        ) : (
                          <div className="text-center p-3 text-slate-400">
                            <i className="fa-solid fa-camera-slash text-2xl mb-1 block text-amber-400" />
                            <span className="text-[11px]">ไม่มีภาพถ่ายขาออก</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="sm:col-span-7 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">ประเภทสถานที่:</span>
                        {outMode ? (
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${outMode === 'ONSITE' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'}`}>
                            {outMode === 'ONSITE' ? 'ในสถานที่' : 'นอกสถานที่'}
                          </span>
                        ) : (
                          <span>-</span>
                        )}
                      </div>
                      <div>
                        <span className="text-slate-500 block">สถานที่บันทึก:</span>
                        <p className="font-bold text-slate-800 dark:text-white mt-0.5">{outPlace}</p>
                      </div>
                      <div>
                        <span className="text-slate-500 block">พิกัด GPS (Lat, Lng):</span>
                        <p className="font-mono font-semibold text-slate-700 dark:text-slate-300 mt-0.5">
                          {hasValidOutCoords ? `${Number(outLat).toFixed(6)}, ${Number(outLng).toFixed(6)}` : 'ไม่ได้บันทึกพิกัด GPS'}
                        </p>
                      </div>
                      {hasValidOutCoords && (
                        <div className="space-y-2 pt-1">
                          <a
                            href={`https://www.google.com/maps?q=${outLat},${outLng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-600 text-white font-bold text-[11px]"
                          >
                            <i className="fa-solid fa-map-location-dot" />เปิดดูใน Google Maps
                          </a>
                          <iframe
                            title="แผนที่ขาออกงาน"
                            src={`https://maps.google.com/maps?q=${outLat},${outLng}&hl=th&z=16&output=embed`}
                            className="w-full h-36 rounded-xl border border-slate-200 dark:border-slate-700"
                            loading="lazy"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Remark Footer */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                <span className="text-slate-400 font-bold mr-2">หมายเหตุ:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-200">{resolveReportRemarkText(profileRow).replace(/\n/g, ' • ')}</span>
              </div>
            </div>
          );
        })()}
      </ResponsiveModal>

      {/* ADR-0040 Safe Add/Edit Attendance Modal */}
      <ResponsiveModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={editForm.log_id ? 'แก้ไขบันทึกเวลาปฏิบัติราชการ' : 'เพิ่มเวลาปฏิบัติราชการ'}
        icon="fa-clock"
        maxWidthClass="max-w-lg"
        footer={
          <>
            <button type="button" onClick={() => setEditOpen(false)} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-semibold">ยกเลิก</button>
            <button type="submit" form="formReportEdit" disabled={editSaving} className="px-5 py-2 rounded-xl bg-[#00744B] hover:bg-[#005a3a] text-white text-sm font-bold disabled:opacity-50">
              {editSaving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
            </button>
          </>
        }
      >
        <form id="formReportEdit" onSubmit={handleSaveRecord} className="space-y-3.5 text-sm">
          <div>
            <label className="block text-xs font-bold mb-1">บุคลากร *</label>
            <select required disabled={Boolean(editForm.log_id)} value={editForm.personnel_id} onChange={(e) => setEditForm({ ...editForm, personnel_id: e.target.value })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm disabled:opacity-60">
              <option value="">-- เลือกบุคลากร --</option>
              {personnelList.map((p) => <option key={p.id} value={p.id}>{`${p.prefix || ''}${p.first_name || ''} ${p.last_name || ''}`.trim()} ({p.division || '-'})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold mb-1">วันที่ *</label>
              <input type="date" required disabled={Boolean(editForm.log_id)} value={editForm.work_date} onChange={(e) => setEditForm({ ...editForm, work_date: e.target.value })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm disabled:opacity-60" />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">สถานะการลงเวลา *</label>
              <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-bold">
                <option value="ปฏิบัติงานปกติ">ปฏิบัติงานปกติ</option>
                <option value="มาสาย">มาสาย</option>
                <option value="ขาดราชการ">ขาดราชการ</option>
                <option value="ปฏิบัติงานนอกเวลา">ปฏิบัติงานนอกเวลา</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold">เวลาเข้างาน</label>
                <div className="flex gap-1.5 text-[10px]">
                  {activeShiftObj && <button type="button" onClick={() => setEditForm({ ...editForm, check_in_time: activeShiftObj.check_in })} className="text-[#00744B] font-bold hover:underline">ตามกะ ({activeShiftObj.check_in})</button>}
                  <button type="button" onClick={() => setEditForm({ ...editForm, check_in_time: '' })} className="text-rose-600 font-bold hover:underline">ล้าง</button>
                </div>
              </div>
              <input type="time" value={editForm.check_in_time} onChange={(e) => setEditForm({ ...editForm, check_in_time: e.target.value })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-mono text-sm" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold">เวลาออกงาน</label>
                <div className="flex gap-1.5 text-[10px]">
                  <button type="button" onClick={() => setEditForm({ ...editForm, check_out_time: activeShiftObj?.check_out || settings?.standard_check_out || '16:30' })} className="text-sky-600 font-bold hover:underline">มาตรฐาน ({activeShiftObj?.check_out || settings?.standard_check_out || '16:30'})</button>
                  <button type="button" onClick={() => setEditForm({ ...editForm, check_out_time: '' })} className="text-rose-600 font-bold hover:underline">ล้าง</button>
                </div>
              </div>
              <input type="time" value={editForm.check_out_time} onChange={(e) => setEditForm({ ...editForm, check_out_time: e.target.value })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-mono text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold mb-1">หมายเหตุ</label>
            <input type="text" value={editForm.remark} onChange={(e) => setEditForm({ ...editForm, remark: e.target.value })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" placeholder="ระบุหมายเหตุ (ถ้ามี)..." />
          </div>
        </form>
      </ResponsiveModal>
    </AdminLayout>
  );
}
