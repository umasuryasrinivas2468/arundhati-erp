'use client';
import { Fragment, useEffect, useReducer, useRef, useState } from 'react';
import ERP from '@/lib/erp';
import { useErp, useRequireRole } from '@/lib/ErpProvider';
import { Shell, goSection } from '@/components/Shell';
import { Icon } from '@/components/Icon';
import { Stat, Empty, Avatar, Bars, Donut, StatusBadge } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { openModal, confirmBox } from '@/components/Modal';
import { toast } from '@/components/Toast';
import { downloadXlsx, XLSX } from '@/lib/xlsx';
import { DOW } from '@/lib/dates';

const A = ERP.attendance;
const { iso, today, parseISO, isSunday } = ERP.util;
const ROLE_LABEL = { admin: 'Administrator', principal: 'Principal', dean: 'Dean', hod: 'Head of Department', faculty: 'Faculty / Staff', student: 'Student' };

// ---------- small helpers ----------
const userName = (empId) => ERP.users.byEmp(empId)?.name || empId || '—';
const deptOf = (empId) => ERP.users.byEmp(empId)?.dept || null;
const plural = (n, w) => `${n.toLocaleString('en-IN')} ${w}${n === 1 ? '' : 's'}`;
const dmy = (isoDate) => { const [y, m, d] = isoDate.split('-'); return `${d}/${m}/${y}`; };
const STATUS_CODES = Object.keys(ERP.STATUS);
const STATUS_TONE_DONUT = { P: 'ok', A: 'bad', L: 'warn', HD: 'info', OD: 'accent' };
const pendingLeaves = () => ERP.leaves.all().filter((l) => [ERP.LEAVE_STATE.PENDING_HOD, ERP.LEAVE_STATE.PENDING_PRINCIPAL].includes(l.status));

function Notice({ tone, ic, children }) {
  return <div className={`notice notice-${tone}`}><Icon name={ic} size={16} /><div>{children}</div></div>;
}
function PersonCell({ u, sub }) {
  return <div className="person-cell"><Avatar name={u.name} size={32} /><div><b>{u.name}</b><small>{sub}</small></div></div>;
}
const rolePill = (role) => <span className={`rp role-${role}`}>{ROLE_LABEL[role] || role}</span>;

const toSheetRows = (recs) => recs.map((r) => {
  const u = ERP.users.byEmp(r.empId);
  return [r.empId, u?.name || '', u ? ERP.fmt.deptName(u.dept) : '', dmy(r.date), r.status, r.inTime || '', r.outTime || ''];
});
const stamp = () => today().replace(/-/g, '');

function fakeDay(rand) {
  const x = rand();
  let status = 'P';
  if (x > 0.95) status = 'A'; else if (x > 0.9) status = 'L'; else if (x > 0.86) status = 'HD'; else if (x > 0.83) status = 'OD';
  const p = (n) => String(n).padStart(2, '0');
  if (status === 'A' || status === 'L') return { status, inTime: '', outTime: '' };
  const inM = 30 + Math.floor(rand() * 45);
  const inTime = `${p(8 + Math.floor(inM / 60))}:${p(inM % 60)}`;
  const outTime = status === 'HD' ? `13:${p(Math.floor(rand() * 50))}` : `${16 + Math.floor(rand() * 2)}:${p(Math.floor(rand() * 59))}`;
  return { status, inTime, outTime };
}
function lastWorkingDays(n) {
  const out = []; const d = new Date();
  while (out.length < n) { const s = iso(d); if (!isSunday(s)) out.unshift(s); d.setDate(d.getDate() - 1); }
  return out;
}
function downloadTemplate(me) {
  const ex = ERP.users.staff()[0] || me;
  downloadXlsx('attendance_template.xlsx', A.TEMPLATE_HEADERS, [[ex.empId, ex.name, ERP.fmt.deptName(ex.dept), dmy(today()), 'P', '09:00', '17:00']], 'Attendance');
  toast('Blank template downloaded');
}
function downloadSample() {
  const days = lastWorkingDays(5);
  const staff = ERP.users.staff();
  const rand = Math.random;
  const rows = [];
  days.forEach((date) => staff.forEach((u) => {
    const f = fakeDay(rand);
    rows.push([u.empId, u.name, ERP.fmt.deptName(u.dept), dmy(date), f.status, f.inTime, f.outTime]);
  }));
  downloadXlsx(`attendance_sample_${stamp()}.xlsx`, A.TEMPLATE_HEADERS, rows, 'Attendance');
  toast(`Sample sheet with ${rows.length} rows downloaded`);
}

// Persistent (cross-section) state.
let uploadPending = null; // { fileName, valid, errors, totalRows, dupes }
let lastImportedId = null;
const recFilter = { from: '', to: '', dept: '', status: '', q: '' };
let recInit = false;
let staffRole = '';
let studentYear = '';

// ======================================================================
// DASHBOARD
// ======================================================================
function Dashboard({ me }) {
  useErp();
  const ups = A.uploads();
  const last = ups[0];
  const pend = pendingLeaves();
  const latest = A.latestDate();
  const latestRows = latest ? A.forDate(latest) : [];
  const sum = A.summarize(latestRows);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <div className="hero adm-hero">
        <div style={{ position: 'relative', zIndex: 1 }}><h2>{greet}, {me.name.split(' ')[0]}</h2>
          <p>{ERP.INSTITUTION} · {latest ? <>Latest attendance on file: <b>{ERP.fmt.date(latest)}</b></> : 'No attendance on file yet'}</p></div>
        <div className="row">
          <button className="btn btn-light" onClick={() => goSection('upload')}><Icon name="upload" size={16} /> Upload attendance</button>
          <button className="btn btn-glass" onClick={() => downloadTemplate(me)}><Icon name="download" size={16} /> Template</button>
        </div>
      </div>
      <div className="stats5">
        <Stat label="Total staff" value={ERP.users.staff().length} iconName="users" tone="accent" sub={`${ERP.users.all().filter((u) => u.role === 'faculty').length} faculty · ${ERP.users.all().filter((u) => u.role === 'hod').length} HODs`} />
        <Stat label="Departments" value={ERP.DEPARTMENTS.length} iconName="building" tone="info" sub={`${ERP.DEPARTMENTS.filter((d) => ERP.users.hodOf(d.code)).length} with a HOD`} />
        <Stat label="Attendance records" value={A.all().length.toLocaleString('en-IN')} iconName="calendar" tone="ok" sub={plural(ups.length, 'upload')} />
        <Stat label="Last upload" value={last ? ERP.fmt.ago(last.at) : '—'} iconName="excel" tone="warn" sub={last ? ERP.fmt.dateTime(last.at) : 'Nothing uploaded'} />
        <Stat label="Pending leaves" value={pend.length} iconName="leave" tone={pend.length ? 'bad' : 'ok'} sub={`${pend.filter((l) => l.status === ERP.LEAVE_STATE.PENDING_HOD).length} with HODs · ${pend.filter((l) => l.status === ERP.LEAVE_STATE.PENDING_PRINCIPAL).length} with Principal`} />
      </div>
      <div className="cols">
        <div className="section" style={{ gap: 20 }}>
          <div className="card">
            <div className="card-head"><div><h3>Attendance · {latest ? ERP.fmt.date(latest) : '—'}</h3><p>Latest date in the records · {latestRows.length} entr{latestRows.length === 1 ? 'y' : 'ies'}</p></div>
              <button className="btn btn-ghost btn-sm" onClick={() => goSection('records')}>View records</button></div>
            {latestRows.length
              ? <Donut parts={STATUS_CODES.map((c) => ({ label: ERP.STATUS[c].label, value: sum[c] || 0, tone: STATUS_TONE_DONUT[c] }))} center={`${sum.percent}%`} />
              : <Empty msg="No attendance records yet — upload a sheet to get started." iconName="calendar" />}
          </div>
          <div className="card">
            <div className="card-head"><div><h3>Department-wise attendance</h3><p>Attendance % on {latest ? ERP.fmt.date(latest) : '—'}</p></div></div>
            {latestRows.length
              ? <Bars items={ERP.DEPARTMENTS.map((d) => {
                  const s = A.summarize(latestRows.filter((r) => deptOf(r.empId) === d.code));
                  return { label: d.name, value: s.percent, tone: s.percent >= 85 ? 'ok' : s.percent >= 75 ? 'warn' : 'bad' };
                })} max={100} suffix="%" />
              : <Empty msg="Nothing to chart yet" iconName="chart" />}
          </div>
        </div>
        <div className="section" style={{ gap: 20 }}>
          <div className="card">
            <div className="card-head"><h3>Quick actions</h3></div>
            <div className="qa-grid">
              <button className="qa" onClick={() => goSection('upload')}><Icon name="upload" size={20} /><b>Upload attendance</b><small>Import an Excel / CSV sheet</small></button>
              <button className="qa" onClick={downloadSample}><Icon name="excel" size={20} /><b>Sample sheet</b><small>Last 5 working days, all staff</small></button>
              <button className="qa" onClick={() => goSection('staff')}><Icon name="users" size={20} /><b>Manage staff</b><small>Add, edit or remove users</small></button>
              <button className="qa" onClick={() => goSection('announcements')}><Icon name="megaphone" size={20} /><b>Announce</b><small>Post a notice to everyone</small></button>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><div><h3>Recent uploads</h3></div><button className="btn btn-ghost btn-sm" onClick={() => goSection('history')}>All uploads</button></div>
            {ups.length ? (
              <div className="list">
                {ups.slice(0, 5).map((u) => (
                  <div className="list-item" key={u.id}><span className="li-ic"><Icon name="excel" size={18} /></span>
                    <div className="li-main"><b title={u.fileName}>{u.fileName}</b><small>{userName(u.uploadedBy)} · {ERP.fmt.ago(u.at)}</small></div>
                    <span className="badge badge-muted">{plural(u.rows, 'row')}</span></div>
                ))}
              </div>
            ) : <Empty msg="No uploads yet" iconName="excel" />}
          </div>
        </div>
      </div>
    </>
  );
}

// ======================================================================
// UPLOAD ATTENDANCE
// ======================================================================
function Steps({ step }) {
  const S = (n, label) => <span className={`st ${n === step ? 'on' : n < step ? 'done' : ''}`}><i>{n < step ? '✓' : n}</i>{label}</span>;
  return <div className="steps">{S(1, 'Choose file')}<span className="sep" />{S(2, 'Review')}<span className="sep" />{S(3, 'Import')}</div>;
}

/* Biometric "Basic Work Duration" matrix report -> flat {Employee ID, Date, Status, In/Out} rows. */
function parseBasicWorkDuration(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null });
  const cell = (r, c) => { const v = (rows[r] && rows[r][c]); return v == null ? '' : String(v).trim(); };
  const titled = rows.slice(0, 4).some((r) => (r || []).some((c) => /basic work duration/i.test(String(c || ''))));
  const hasBlocks = rows.some((r) => (r && String(r[0] || '').trim()) === 'Emp. Code:');
  if (!titled && !hasBlocks) return null;
  const MAP = { P: 'P', A: 'A', L: 'L', HD: 'HD', OD: 'OD', WOP: 'P', HP: 'P', WO: null, H: null, HLD: null };
  let y = new Date().getFullYear(), mo = new Date().getMonth() + 1;
  for (let i = 0; i < Math.min(4, rows.length); i++) {
    const hit = (rows[i] || []).find((c) => c && /\d{4}/.test(String(c)) && /to/i.test(String(c)));
    if (hit) { const d = new Date(String(hit).split(/\s+To\s+/i)[0]); if (!isNaN(d)) { y = d.getFullYear(); mo = d.getMonth() + 1; } break; }
  }
  const pad = (n) => String(n).padStart(2, '0');
  let dayCols = {};
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const a = cell(i, 0);
    if (a === 'Days') {
      dayCols = {};
      const r = rows[i] || [];
      for (let c = 2; c < r.length; c++) { const m = String(r[c] == null ? '' : r[c]).trim().match(/^(\d{1,2})\b/); if (m) dayCols[c] = +m[1]; }
    } else if (a === 'Emp. Code:') {
      const code = cell(i, 3).toUpperCase();
      let statusRow, inRow, outRow;
      for (let k = 1; k <= 5 && i + k < rows.length; k++) {
        const lab = cell(i + k, 0);
        if (lab === 'Status') statusRow = rows[i + k];
        else if (lab === 'InTime') inRow = rows[i + k];
        else if (lab === 'OutTime') outRow = rows[i + k];
      }
      if (!code || !statusRow) continue;
      for (const c in dayCols) {
        const raw = String(statusRow[c] == null ? '' : statusRow[c]).trim().toUpperCase();
        if (!raw || !(raw in MAP) || MAP[raw] === null) continue;
        out.push({
          'Employee ID': code,
          'Date': `${y}-${pad(mo)}-${pad(dayCols[c])}`,
          'Status': MAP[raw],
          'In Time': String((inRow && inRow[c]) == null ? '' : inRow[c]).trim(),
          'Out Time': String((outRow && outRow[c]) == null ? '' : outRow[c]).trim(),
        });
      }
    }
  }
  return out.length ? out : null;
}

function Upload({ me }) {
  useErp();
  const [pending, setPendingState] = useState(uploadPending);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);
  const setPending = (v) => { uploadPending = v; setPendingState(v); };

  // Stop the browser from opening a file dropped outside the dropzone.
  useEffect(() => {
    const prevent = (e) => { if (!e.target.closest || !e.target.closest('.dropzone')) e.preventDefault(); };
    ['dragover', 'drop'].forEach((t) => window.addEventListener(t, prevent));
    return () => ['dragover', 'drop'].forEach((t) => window.removeEventListener(t, prevent));
  }, []);

  async function handleFile(file) {
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return toast('Please choose an .xlsx, .xls or .csv file', 'bad');
    setBusy(true);
    try {
      let wb;
      if (/\.csv$/i.test(file.name)) wb = XLSX.read(await file.text(), { type: 'string', raw: true });
      else wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error('The workbook has no sheets');
      const raw = parseBasicWorkDuration(ws) || XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!raw.length) throw new Error('The first sheet has no data rows');
      const valid = [], errors = [];
      raw.forEach((o, i) => {
        const res = A.validate([o]);
        res.errors.forEach((e) => errors.push({ row: i + 2, message: e.message }));
        res.valid.forEach((r) => {
          if (iso(parseISO(r.date)) !== r.date || +r.date.slice(0, 4) < 2000) errors.push({ row: i + 2, message: `Invalid calendar date (read as ${r.date})` });
          else valid.push(r);
        });
      });
      const map = new Map(); valid.forEach((r) => map.set(`${r.empId}|${r.date}`, r));
      const dedup = [...map.values()];
      setBusy(false);
      setPending({ fileName: file.name, valid: dedup, errors, totalRows: raw.length, dupes: valid.length - dedup.length });
    } catch (e) {
      console.error(e);
      setBusy(false);
      toast(`Couldn't read file: ${e.message || e}`, 'bad');
    }
  }

  if (pending) return <Preview me={me} pending={pending} setPending={setPending} />;

  const ex = ERP.users.staff()[0];
  return (
    <>
      <Steps step={1} />
      <div className="cols">
        <div className="card">
          <div className="card-head"><div><h3>Upload attendance sheet</h3><p>Excel (.xlsx, .xls) or CSV · first worksheet is read</p></div></div>
          <label className={`dropzone${drag ? ' drag' : ''}${busy ? ' busy' : ''}`} tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
            onDragEnter={(e) => { e.preventDefault(); setDrag(true); }}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDrag(false); }}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}>
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { if (e.target.files[0]) handleFile(e.target.files[0]); }} />
            {busy ? (
              <><div className="dz-spin" /><b>Reading…</b><span className="muted small">Parsing and validating rows</span></>
            ) : (
              <><div className="dz-ic"><Icon name="upload" size={30} /></div><b>Drop your attendance file here</b><span className="muted small">or <u>click to browse</u> · .xlsx, .xls, .csv</span></>
            )}
          </label>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn btn-ghost" onClick={() => downloadTemplate(me)}><Icon name="download" size={16} /> Download blank template</button>
            <button className="btn btn-ghost" onClick={downloadSample}><Icon name="excel" size={16} /> Download sample filled sheet</button>
          </div>
          <p className="muted small" style={{ margin: '10px 0 0' }}>Tip: the sample sheet contains every staff member for the last 5 working days — upload it straight back to see the import flow. Biometric <b>Monthly Status Report (Basic Work Duration)</b> exports are auto-detected too — just upload the .xls as-is.</p>
        </div>
        <div className="card">
          <div className="card-head"><div><h3>Required format</h3><p>Row 1 must be the header row</p></div></div>
          <div className="table-scroll"><table className="fmt-table"><thead><tr><th>Column</th><th>Example</th><th /></tr></thead><tbody>
            {A.TEMPLATE_HEADERS.map((h) => {
              const exv = { 'Employee ID': ex?.empId, Name: ex?.name, Department: ERP.fmt.deptName(ex?.dept), Date: dmy(today()), Status: 'P', 'In Time': '09:00', 'Out Time': '17:00' }[h];
              const req = ['Employee ID', 'Date', 'Status'].includes(h);
              return <tr key={h}><td><b>{h}</b></td><td><code>{exv || ''}</code></td><td>{req ? <span className="badge badge-bad">Required</span> : <span className="badge badge-muted">Optional</span>}</td></tr>;
            })}
          </tbody></table></div>
          <h4 style={{ margin: '16px 0 8px', fontSize: 13 }}>Status codes</h4>
          <div className="codes">{STATUS_CODES.map((c) => <span key={c}><StatusBadge code={c} /> {ERP.STATUS[c].label}</span>)}</div>
          <h4 style={{ margin: '16px 0 8px', fontSize: 13 }}>Rules</h4>
          <ul className="tips">
            <li>Date as <b>DD/MM/YYYY</b> or <b>YYYY-MM-DD</b> (real Excel dates also work).</li>
            <li>Times in 24-hour <b>HH:MM</b>; leave blank for A / L.</li>
            <li>Employee ID must exist in the Staff Directory.</li>
            <li>An existing record for the same employee &amp; date is <b>overwritten</b>.</li>
            <li>Name / Department columns are for readability and are ignored on import.</li>
          </ul>
        </div>
      </div>
    </>
  );
}

function Preview({ me, pending, setPending }) {
  const { fileName, valid, errors, totalRows, dupes } = pending;
  const [importing, setImporting] = useState(false);
  const existing = new Set(A.all().map((r) => `${r.empId}|${r.date}`));
  const overwrite = valid.filter((r) => existing.has(`${r.empId}|${r.date}`)).length;
  const dates = valid.map((r) => r.date).sort();
  const from = dates[0], to = dates[dates.length - 1];
  const sundays = new Set(valid.filter((r) => isSunday(r.date)).map((r) => r.date));
  const future = valid.filter((r) => r.date > today()).length;
  const staffCount = new Set(valid.map((r) => r.empId)).size;
  const sum = A.summarize(valid);

  const cancel = () => { setPending(null); toast('Upload cancelled', 'bad'); };
  const doImport = () => {
    setImporting(true);
    const up = A.importRows(valid, fileName, me.empId);
    lastImportedId = up.id;
    uploadPending = null;
    toast(`Imported ${up.rows} records${up.replaced ? ` (${up.replaced} updated)` : ''}`);
    goSection('history');
  };

  return (
    <>
      <Steps step={2} />
      <div className="card">
        <div className="pv-head">
          <div className="pv-file"><span className="li-ic"><Icon name="excel" size={22} /></span><div><b>{fileName}</b><small className="muted">{plural(totalRows, 'row')} read · {valid.length ? `${ERP.fmt.date(from)} – ${ERP.fmt.date(to)}` : 'no valid dates'}</small></div></div>
          <button className="btn btn-ghost btn-sm" onClick={cancel}><Icon name="x" size={14} /> Choose another file</button>
        </div>
      </div>
      <div className="stats5">
        <Stat label="Valid rows" value={valid.length.toLocaleString('en-IN')} iconName="check" tone="ok" sub={`${plural(staffCount, 'employee')}${dupes ? ` · ${dupes} duplicate${dupes === 1 ? '' : 's'} merged` : ''}`} />
        <Stat label="Rows with errors" value={errors.length} iconName="alert" tone={errors.length ? 'bad' : 'ok'} sub={errors.length ? 'Will be skipped' : 'All clear'} />
        <Stat label="Date range" value={valid.length ? <>{new Set(dates).size} <small>day{new Set(dates).size === 1 ? '' : 's'}</small></> : '—'} iconName="calendar" tone="info" sub={valid.length ? `${ERP.fmt.date(from)} – ${ERP.fmt.date(to)}` : ''} />
        <Stat label="Will overwrite" value={overwrite} iconName="swap" tone={overwrite ? 'warn' : 'accent'} sub={`${valid.length - overwrite} new record${valid.length - overwrite === 1 ? '' : 's'}`} />
      </div>
      {overwrite ? <Notice tone="warn" ic="alert"><b>{plural(overwrite, 'existing record')}</b> for the same employee &amp; date will be replaced by this file.</Notice> : null}
      {sundays.size ? <Notice tone="info" ic="calendar">Contains Sunday date{sundays.size > 1 ? 's' : ''}: {[...sundays].sort().map((d) => ERP.fmt.date(d)).join(', ')}.</Notice> : null}
      {future ? <Notice tone="info" ic="clock">{plural(future, 'row')} dated in the future.</Notice> : null}
      {errors.length ? (
        <div className="card"><div className="card-head"><div><h3>Errors ({errors.length})</h3><p>These rows will not be imported. Fix them in the sheet and re-upload, or continue without them.</p></div>
          <button className="btn btn-ghost btn-sm" onClick={() => downloadXlsx(`errors_${fileName.replace(/\.[^.]+$/, '')}.xlsx`, ['Row', 'Error'], errors.map((e) => [e.row, e.message]), 'Errors')}><Icon name="download" size={14} /> Error report</button></div>
          <div className="err-list">{errors.map((e, i) => <div key={i}><b>Row {e.row}</b><span>{e.message}</span></div>)}</div></div>
      ) : null}
      <div className="card">
        <div className="card-head"><div><h3>Preview of valid rows</h3><p>{STATUS_CODES.map((c, i) => <Fragment key={c}>{i ? ' · ' : ''}{c}: <b>{sum[c] || 0}</b></Fragment>)}</p></div></div>
        <DataTable
          rows={valid.map((r, i) => ({ ...r, __key: `${r.empId}|${r.date}|${i}` }))}
          pageSize={10}
          emptyText="No valid rows found in this file"
          search={(r) => `${r.empId} ${userName(r.empId)} ${ERP.fmt.deptName(deptOf(r.empId))} ${r.status}`}
          columns={[
            { key: 'empId', label: 'Emp ID', render: (r) => <span className="mono">{r.empId}</span> },
            { key: 'name', label: 'Name', sort: (r) => userName(r.empId), render: (r) => userName(r.empId) },
            { key: 'dept', label: 'Department', sort: (r) => deptOf(r.empId) || '', render: (r) => ERP.fmt.deptName(deptOf(r.empId)) },
            { key: 'date', label: 'Date', render: (r) => ERP.fmt.date(r.date) },
            { key: 'status', label: 'Status', render: (r) => <StatusBadge code={r.status} /> },
            { key: 'inTime', label: 'In', render: (r) => r.inTime || '—' },
            { key: 'outTime', label: 'Out', render: (r) => r.outTime || '—' },
            { key: 'ow', label: 'Action', sort: (r) => existing.has(`${r.empId}|${r.date}`) ? 1 : 0, render: (r) => existing.has(`${r.empId}|${r.date}`) ? <span className="badge badge-warn">Overwrite</span> : <span className="badge badge-ok">New</span> },
          ]}
        />
      </div>
      <div className="sticky-actions">
        <span className="muted small">{valid.length ? <>Ready to import <b>{valid.length.toLocaleString('en-IN')}</b> records{errors.length ? `, skipping ${errors.length}` : ''}.</> : 'No valid rows to import.'}</span>
        <button className="btn btn-ghost" onClick={cancel}>Cancel</button>
        <button className="btn btn-primary" disabled={!valid.length || importing} onClick={doImport}><Icon name="upload" size={16} /> Import {valid.length.toLocaleString('en-IN')} records</button>
      </div>
    </>
  );
}

// ======================================================================
// UPLOAD HISTORY
// ======================================================================
function History() {
  useErp();
  const ups = A.uploads();
  const live = new Map(); A.all().forEach((r) => live.set(r.uploadId, (live.get(r.uploadId) || 0) + 1));
  const rangeOf = (u) => {
    if (u.from) return [u.from, u.to];
    const ds = A.all().filter((r) => r.uploadId === u.id).map((r) => r.date).sort();
    return ds.length ? [ds[0], ds[ds.length - 1]] : [null, null];
  };
  useEffect(() => { const t = setTimeout(() => { lastImportedId = null; }, 3000); return () => clearTimeout(t); }, []);

  const exportUpload = (u) => {
    const recs = A.all().filter((r) => r.uploadId === u.id).sort((a, b) => a.date.localeCompare(b.date) || a.empId.localeCompare(b.empId));
    if (!recs.length) return toast('This upload has no remaining records', 'bad');
    downloadXlsx(`export_${u.fileName.replace(/\.[^.]+$/, '')}.xlsx`, A.TEMPLATE_HEADERS, toSheetRows(recs), 'Attendance');
    toast(`Exported ${recs.length} records`);
  };
  const delUpload = async (u) => {
    const n = live.get(u.id) || 0;
    const ok = await confirmBox('Delete this upload?', `"${u.fileName}" and the ${n} attendance record${n === 1 ? '' : 's'} it owns will be permanently removed. Records it overwrote are not restored.`, { okLabel: 'Delete upload', tone: 'danger' });
    if (!ok) return;
    A.deleteUpload(u.id);
    if (lastImportedId === u.id) lastImportedId = null;
    toast(`Deleted ${u.fileName} (${n} records)`);
  };

  return (
    <div className="card">
      <div className="card-head"><div><h3>Upload history</h3><p>{plural(ups.length, 'upload')} · deleting an upload removes the attendance records it still owns</p></div>
        <button className="btn btn-primary" onClick={() => goSection('upload')}><Icon name="upload" size={16} /> New upload</button></div>
      <DataTable
        rows={ups.map((u) => ({ ...u, __key: u.id, __rowClass: u.id === lastImportedId ? 'hl' : '' }))}
        pageSize={10}
        emptyText="No uploads yet"
        search={(u) => `${u.fileName} ${userName(u.uploadedBy)}`}
        columns={[
          { key: 'fileName', label: 'File', render: (u) => (
            <div className="person-cell"><span className="li-ic" style={{ width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'var(--ok-soft)', color: 'var(--ok)', flex: 'none' }}><Icon name="excel" size={16} /></span>
              <div><b>{u.fileName}</b>{u.id === lastImportedId ? <span className="badge badge-ok">Just imported</span> : u.id === 'SEED' ? <small>Initial demo data</small> : null}</div></div>
          ) },
          { key: 'uploadedBy', label: 'Uploaded by', sort: (u) => userName(u.uploadedBy), render: (u) => userName(u.uploadedBy) },
          { key: 'at', label: 'Uploaded at', render: (u) => <>{ERP.fmt.dateTime(u.at)}<br /><small className="muted">{ERP.fmt.ago(u.at)}</small></> },
          { key: 'rows', label: 'Rows', align: 'right', render: (u) => { const l = live.get(u.id) || 0; return <><b>{u.rows.toLocaleString('en-IN')}</b>{l !== u.rows ? <><br /><small className="muted" title="Records still owned by this upload (others were overwritten by later uploads)">{l.toLocaleString('en-IN')} live</small></> : null}{u.replaced ? <><br /><small className="muted">{u.replaced} overwritten</small></> : null}</>; } },
          { key: 'from', label: 'Date range', sort: (u) => rangeOf(u)[0] || '', render: (u) => { const [f, t] = rangeOf(u); return f ? `${ERP.fmt.date(f)}${t !== f ? ` – ${ERP.fmt.date(t)}` : ''}` : '—'; } },
          { key: 'act', label: '', noSort: true, render: (u) => (
            <div className="acts"><button className="icon-btn" title="Export records as .xlsx" aria-label="Export" onClick={() => exportUpload(u)}><Icon name="download" size={15} /></button><button className="icon-btn danger" title="Delete upload" aria-label="Delete" onClick={() => delUpload(u)}><Icon name="trash" size={15} /></button></div>
          ) },
        ]}
      />
    </div>
  );
}

// ======================================================================
// ATTENDANCE RECORDS
// ======================================================================
function Records() {
  useErp();
  const [, bump] = useReducer((x) => x + 1, 0);
  const latest = A.latestDate();
  if (!recInit && latest) { recInit = true; recFilter.to = latest; const d = parseISO(latest); d.setDate(d.getDate() - 6); recFilter.from = iso(d); }

  const setF = (k, v) => { recFilter[k] = v; bump(); };
  const preset = (p) => {
    const end = A.latestDate() || today();
    if (p === 'clear') { Object.assign(recFilter, { from: '', to: '', dept: '', status: '', q: '' }); recInit = false; }
    else if (p === 'all') Object.assign(recFilter, { from: '', to: '' });
    else if (p === 'latest') Object.assign(recFilter, { from: end, to: end });
    else { const d = parseISO(end); d.setDate(d.getDate() - (+p - 1)); Object.assign(recFilter, { from: iso(d), to: end }); }
    bump();
  };

  const q = recFilter.q.trim().toLowerCase();
  const current = A.all().filter((r) => {
    if (recFilter.from && r.date < recFilter.from) return false;
    if (recFilter.to && r.date > recFilter.to) return false;
    if (recFilter.status && r.status !== recFilter.status) return false;
    const u = ERP.users.byEmp(r.empId);
    if (recFilter.dept) { const d = u?.dept || '-'; if (d !== recFilter.dept) return false; }
    if (q && !(`${r.empId} ${u?.name || ''}`.toLowerCase().includes(q))) return false;
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date) || a.empId.localeCompare(b.empId));
  const s = A.summarize(current);

  const doExport = () => {
    if (!current.length) return toast('Nothing to export', 'bad');
    const tag = [recFilter.from, recFilter.to].filter(Boolean).join('_to_') || 'all';
    downloadXlsx(`attendance_${tag}.xlsx`, A.TEMPLATE_HEADERS, toSheetRows(current), 'Attendance');
    toast(`Exported ${current.length} records`);
  };

  return (
    <>
      <div className="card">
        <div className="filters">
          <label className="field"><span>From</span><input type="date" value={recFilter.from} onChange={(e) => setF('from', e.target.value)} /></label>
          <label className="field"><span>To</span><input type="date" value={recFilter.to} onChange={(e) => setF('to', e.target.value)} /></label>
          <label className="field"><span>Department</span>
            <select value={recFilter.dept} onChange={(e) => setF('dept', e.target.value)}>
              <option value="">All departments</option>
              {ERP.DEPARTMENTS.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
              <option value="-">Administration (no dept)</option>
            </select>
          </label>
          <label className="field"><span>Status</span>
            <select value={recFilter.status} onChange={(e) => setF('status', e.target.value)}>
              <option value="">All statuses</option>
              {STATUS_CODES.map((c) => <option key={c} value={c}>{c} — {ERP.STATUS[c].label}</option>)}
            </select>
          </label>
          <div className="field grow"><span>Search</span><label className="search"><Icon name="search" size={16} /><input type="search" placeholder="Name or employee ID" value={recFilter.q} onChange={(e) => setF('q', e.target.value)} /></label></div>
        </div>
        <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => preset('latest')}>Latest day</button>
            <button className="btn btn-ghost btn-sm" onClick={() => preset('7')}>Last 7 days</button>
            <button className="btn btn-ghost btn-sm" onClick={() => preset('30')}>Last 30 days</button>
            <button className="btn btn-ghost btn-sm" onClick={() => preset('all')}>All time</button>
            <button className="btn btn-ghost btn-sm" onClick={() => preset('clear')}><Icon name="x" size={14} /> Reset</button>
          </div>
          <button className="btn btn-primary" onClick={doExport}><Icon name="download" size={16} /> Export filtered (.xlsx)</button>
        </div>
      </div>
      <div className="cards">
        <Stat label="Records" value={current.length.toLocaleString('en-IN')} iconName="file" tone="accent" sub={`${new Set(current.map((r) => r.empId)).size} employees`} />
        <Stat label="Attendance %" value={`${s.percent}%`} iconName="chart" tone={s.percent >= 85 ? 'ok' : s.percent >= 75 ? 'warn' : 'bad'} sub="(P + OD + ½HD) ÷ (total − L)" />
        <Stat label="Absent" value={s.A} iconName="x" tone="bad" sub={`${s.L} on leave · ${s.HD} half day`} />
        <Stat label="On duty" value={s.OD} iconName="building" tone="info" sub={`${s.P} present`} />
      </div>
      <div className="card">
        <DataTable
          rows={current.map((r, i) => ({ ...r, __key: `${r.empId}|${r.date}|${i}` }))}
          pageSize={15}
          emptyText="No records match these filters"
          columns={[
            { key: 'date', label: 'Date', render: (r) => <>{ERP.fmt.date(r.date)}<br /><small className="muted">{DOW[parseISO(r.date).getDay()]}</small></> },
            { key: 'empId', label: 'Employee', sort: (r) => userName(r.empId), render: (r) => { const u = ERP.users.byEmp(r.empId); return u ? <PersonCell u={u} sub={r.empId} /> : <><span className="mono">{r.empId}</span> <span className="badge badge-muted">removed</span></>; } },
            { key: 'dept', label: 'Department', sort: (r) => deptOf(r.empId) || '', render: (r) => ERP.fmt.deptName(deptOf(r.empId)) },
            { key: 'status', label: 'Status', render: (r) => <><StatusBadge code={r.status} /> <small className="muted">{ERP.STATUS[r.status]?.label || ''}</small></> },
            { key: 'inTime', label: 'In', render: (r) => r.inTime || '—' },
            { key: 'outTime', label: 'Out', render: (r) => r.outTime || '—' },
            { key: 'uploadId', label: 'Source', render: (r) => { const up = A.uploads().find((u) => u.id === r.uploadId); return <small className="muted" title={up?.fileName || ''}>{up ? (up.fileName.length > 26 ? up.fileName.slice(0, 24) + '…' : up.fileName) : '—'}</small>; } },
          ]}
        />
      </div>
    </>
  );
}

// ======================================================================
// STAFF DIRECTORY
// ======================================================================
function Staff({ me }) {
  useErp();
  const [, bump] = useReducer((x) => x + 1, 0);
  const all = ERP.users.all().filter((u) => u.role !== 'student');
  const counts = all.reduce((m, u) => { m[u.role] = (m[u.role] || 0) + 1; return m; }, {});
  const roles = ['admin', 'principal', 'dean', 'hod', 'faculty'];
  const setRole = (r) => { staffRole = r; bump(); };

  const removeUser = async (u) => {
    if (u.empId === me.empId) return;
    const ok = await confirmBox(`Delete ${u.name}?`, `${u.empId} · ${u.designation}. They will no longer be able to sign in. Existing attendance and leave records are kept.`, { okLabel: 'Delete user', tone: 'danger' });
    if (!ok) return;
    ERP.users.remove(u.empId);
    toast(`${u.name} removed`);
  };

  return (
    <div className="card">
      <div className="card-head"><div><h3>Staff directory</h3><p>{plural(all.length, 'user')} · login credentials (default password aims@123)</p></div>
        <div className="tabs">
          <button className={staffRole ? '' : 'active'} onClick={() => setRole('')}>All <small className="muted">{all.length}</small></button>
          {roles.map((r) => <button key={r} className={staffRole === r ? 'active' : ''} onClick={() => setRole(r)}>{r === 'faculty' ? 'Faculty' : r === 'hod' ? 'HODs' : ROLE_LABEL[r]} <small className="muted">{counts[r] || 0}</small></button>)}
        </div></div>
      <DataTable
        rows={all.filter((u) => !staffRole || u.role === staffRole).map((u) => ({ ...u, __key: u.empId }))}
        pageSize={12}
        emptyText="No users in this group"
        toolbar={<button className="btn btn-primary" onClick={() => openUserModal(null, me)}><Icon name="plus" size={16} /> Add user</button>}
        search={(u) => `${u.name} ${u.empId} ${u.username} ${u.email || ''} ${u.designation} ${ERP.fmt.deptName(u.dept)} ${u.role}`}
        columns={[
          { key: 'name', label: 'Name', render: (u) => <PersonCell u={u} sub={u.email || ''} /> },
          { key: 'empId', label: 'Emp ID', render: (u) => <span className="mono">{u.empId}</span> },
          { key: 'role', label: 'Role', render: (u) => rolePill(u.role) },
          { key: 'dept', label: 'Department', sort: (u) => u.dept || '', render: (u) => u.dept ? ERP.fmt.deptName(u.dept) : '—' },
          { key: 'designation', label: 'Designation' },
          { key: 'username', label: 'Login', render: (u) => <span className="cred mono">{u.username}<i>/</i>{u.password}</span> },
          { key: 'act', label: '', noSort: true, render: (u) => (
            <div className="acts"><button className="icon-btn" title="Edit" aria-label="Edit" onClick={() => openUserModal(u, me)}><Icon name="settings" size={15} /></button>
              <button className="icon-btn danger" disabled={u.empId === me.empId} title={u.empId === me.empId ? 'You cannot delete yourself' : 'Delete'} aria-label="Delete" onClick={() => removeUser(u)}><Icon name="trash" size={15} /></button></div>
          ) },
        ]}
      />
    </div>
  );
}

const DESIGNATIONS = ['Professor', 'Associate Professor', 'Assistant Professor', 'Senior Resident', 'Junior Resident', 'Tutor', 'Professor & HOD'];

function UserForm({ u, me, onClose }) {
  const edit = !!u;
  const [v, setV] = useState(u || { empId: '', name: '', username: '', password: '', role: 'faculty', dept: ERP.DEPARTMENTS[0].code, designation: '', email: '' });
  const [err, setErr] = useState('');
  const [userTouched, setUserTouched] = useState(edit);
  const set = (k, val) => { setV((cur) => ({ ...cur, [k]: val })); setErr(''); };
  const needsDept = ['faculty', 'hod'].includes(v.role);

  const onRole = (role) => {
    setV((cur) => {
      const next = { ...cur, role };
      const nd = ['faculty', 'hod'].includes(role);
      if (!nd) next.dept = '';
      else if (!next.dept) next.dept = ERP.DEPARTMENTS[0].code;
      if (role === 'hod' && !next.designation) next.designation = 'Professor & HOD';
      return next;
    });
    setErr('');
  };
  const onName = (name) => {
    setV((cur) => {
      const next = { ...cur, name };
      if (!edit && !userTouched) { const first = name.replace(/^Dr\.?\s*/i, '').trim().split(/\s+/)[0] || ''; next.username = first.toLowerCase().replace(/[^a-z0-9.]/g, ''); }
      return next;
    });
    setErr('');
  };

  const save = () => {
    const d = {
      empId: v.empId.trim().toUpperCase(), name: v.name.trim(), username: v.username.trim().toLowerCase(),
      password: v.password, role: v.role, dept: v.dept || null, designation: v.designation.trim(), email: v.email.trim(),
    };
    const fail = (m) => { setErr(m); return false; };
    if (!d.empId || !/^[A-Z0-9-]{2,}$/.test(d.empId)) return fail('Employee ID is required (letters, digits or -).');
    if (!d.name) return fail('Full name is required.');
    if (!d.username || /\s/.test(d.username)) return fail('Username is required and cannot contain spaces.');
    if (!d.password || d.password.length < 4) return fail('Password must be at least 4 characters.');
    if (!d.designation) return fail('Designation is required.');
    if (['faculty', 'hod'].includes(d.role) && !d.dept) return fail('Faculty and HODs must belong to a department.');
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return fail('Email address looks invalid.');
    const clash = ERP.users.all().find((x) => x.username.toLowerCase() === d.username && x.empId !== (edit ? u.empId : null));
    if (clash) return fail(`Username "${d.username}" is already used by ${clash.name}.`);
    if (d.role === 'hod') { const h = ERP.users.hodOf(d.dept); if (h && h.empId !== (edit ? u.empId : null)) return fail(`${ERP.fmt.deptName(d.dept)} already has a HOD (${h.name}).`); }
    if (edit && u.empId === me.empId && d.role !== 'admin') return fail('You cannot remove your own admin role.');
    try {
      if (edit) { const { empId, ...patch } = d; ERP.users.update(u.empId, patch); toast(`${d.name} updated`); }
      else { ERP.users.add(d); toast(`${d.name} added`); }
    } catch (ex) { return fail(ex.message); }
    return true;
  };

  const submit = (e) => { e.preventDefault(); if (save()) onClose(); };

  return (
    <form noValidate onSubmit={submit}>
      <div className="grid-2">
        <label className="field"><span>Employee ID *</span><input value={v.empId} readOnly={edit} title={edit ? 'Employee ID cannot be changed' : undefined} placeholder="e.g. MED005" style={{ textTransform: 'uppercase' }} onChange={(e) => set('empId', e.target.value)} /></label>
        <label className="field"><span>Full name *</span><input value={v.name} placeholder="Dr. Firstname Lastname" onChange={(e) => onName(e.target.value)} /></label>
        <label className="field"><span>Username *</span><input value={v.username} autoComplete="off" placeholder="login name" onChange={(e) => { setUserTouched(true); set('username', e.target.value); }} /></label>
        <label className="field"><span>Password *</span><input value={v.password} autoComplete="off" placeholder="min 4 characters" onChange={(e) => set('password', e.target.value)} /></label>
        <label className="field"><span>Role *</span><select value={v.role} onChange={(e) => onRole(e.target.value)}>{['faculty', 'hod', 'dean', 'principal', 'admin'].map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></label>
        <label className="field"><span>Department</span><select value={v.dept || ''} disabled={!needsDept} onChange={(e) => set('dept', e.target.value)}><option value="">— None —</option>{ERP.DEPARTMENTS.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}</select></label>
        <label className="field"><span>Designation *</span><input value={v.designation} placeholder="e.g. Assistant Professor" list="desig-list" onChange={(e) => set('designation', e.target.value)} /></label>
        <label className="field"><span>Email</span><input type="email" value={v.email || ''} placeholder="name@arundhati.edu" onChange={(e) => set('email', e.target.value)} /></label>
      </div>
      <datalist id="desig-list">{DESIGNATIONS.map((d) => <option key={d} value={d} />)}</datalist>
      {err ? <div className="notice notice-bad"><Icon name="alert" size={16} /><div>{err}</div></div> : null}
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary">{edit ? 'Save changes' : 'Add user'}</button>
      </div>
    </form>
  );
}

function openUserModal(u, me) {
  openModal({ title: u ? `Edit ${u.name}` : 'Add user', wide: true, actions: [], body: (close) => <UserForm u={u} me={me} onClose={close} /> });
}

// ======================================================================
// STUDENTS (MBBS directory)
// ======================================================================
const YEAR_ROMAN = { 2: 'II', 3: 'III', 4: 'IV' };

function Students() {
  useErp();
  const [, bump] = useReducer((x) => x + 1, 0);
  const all = ERP.users.students();
  const counts = all.reduce((m, u) => { m[u.year] = (m[u.year] || 0) + 1; return m; }, {});
  const years = [2, 3, 4];
  const withAtt = all.filter((u) => ERP.attendance.forEmp(u.empId).length).length;
  const setYear = (y) => { studentYear = y; bump(); };

  return (
    <>
      <div className="cards">
        <Stat label="Total students" value={all.length} iconName="cap" tone="accent" sub={years.map((y) => `${YEAR_ROMAN[y]}: ${counts[y] || 0}`).join(' · ')} />
        <Stat label="With attendance" value={withAtt} iconName="calendar" tone={withAtt ? 'ok' : 'info'} sub={withAtt ? `${all.length - withAtt} awaiting first upload` : 'Upload via Upload Attendance'} />
        <Stat label="MBBS batches" value={years.length} iconName="users" tone="info" sub="II · III · IV year" />
      </div>
      <div className="card">
        <div className="card-head"><div><h3>Student directory</h3><p>{plural(all.length, 'student')} · login is the college email <span className="mono">rollno@aims.ac.in</span>, password is the roll number</p></div>
          <div className="tabs">
            <button className={studentYear ? '' : 'active'} onClick={() => setYear('')}>All <small className="muted">{all.length}</small></button>
            {years.map((y) => <button key={y} className={String(studentYear) === String(y) ? 'active' : ''} onClick={() => setYear(String(y))}>{YEAR_ROMAN[y]} MBBS <small className="muted">{counts[y] || 0}</small></button>)}
          </div></div>
        <DataTable
          rows={all.filter((u) => !studentYear || String(u.year) === String(studentYear)).map((u) => ({ ...u, __key: u.empId }))}
          pageSize={12}
          emptyText="No students in this group"
          search={(u) => `${u.name} ${u.rollNo} ${u.email} ${u.batch} ${u.designation}`}
          columns={[
            { key: 'name', label: 'Name', render: (u) => <PersonCell u={u} sub={u.email} /> },
            { key: 'rollNo', label: 'Roll No.', render: (u) => <span className="mono">{u.rollNo}</span> },
            { key: 'year', label: 'Year', sort: (u) => u.year, render: (u) => <span className="badge badge-info">{YEAR_ROMAN[u.year] || u.year} MBBS</span> },
            { key: 'batch', label: 'Batch' },
            { key: 'att', label: 'Attendance', noSort: true, render: (u) => { const s = ERP.attendance.summarize(ERP.attendance.forEmp(u.empId)); return s.total ? <><StatusBadge code="P" /> <b>{s.percent}%</b> <small className="muted">· {s.total}d</small></> : <span className="muted small">—</span>; } },
            { key: 'login', label: 'Login', render: (u) => <span className="cred mono">{u.rollNo}<i>/</i>{u.password}</span> },
            { key: 'act', label: '', noSort: true, render: (u) => <button className="btn btn-ghost btn-sm" onClick={() => openStudentModal(u)}>View</button> },
          ]}
        />
      </div>
    </>
  );
}

function openStudentModal(u) {
  if (!u) return;
  const rows = ERP.attendance.forEmp(u.empId);
  const s = ERP.attendance.summarize(rows);
  const recent = rows.slice(-6).reverse();
  const body = (
    <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div className="person-cell"><Avatar name={u.name} size={44} /><div><b style={{ fontSize: 16 }}>{u.name}</b><small>{u.designation} · {u.batch}</small></div></div>
        <span className="badge badge-info">{YEAR_ROMAN[u.year] || u.year} MBBS</span>
      </div>
      <dl className="kv" style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '9px 16px', fontSize: 13.5 }}>
        <dt style={{ color: 'var(--muted)', fontWeight: 600 }}>Roll number</dt><dd style={{ margin: 0 }}><code>{u.rollNo}</code></dd>
        <dt style={{ color: 'var(--muted)', fontWeight: 600 }}>College email</dt><dd style={{ margin: 0 }}>{u.email}</dd>
        <dt style={{ color: 'var(--muted)', fontWeight: 600 }}>Login password</dt><dd style={{ margin: 0 }}><code>{u.password}</code></dd>
      </dl>
      <h3 style={{ margin: '22px 0 12px' }}>Attendance {s.total ? `· ${s.percent}%` : ''}</h3>
      {s.total ? (
        <>
          <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))' }}>
            <Stat label="Overall" value={`${s.percent}%`} iconName="chart" tone={s.percent >= 85 ? 'ok' : s.percent >= 75 ? 'warn' : 'bad'} sub={`${s.total} marked days`} />
            <Stat label="Present" value={s.P + s.OD} iconName="check" tone="ok" sub={`${s.HD} half · ${s.OD} OD`} />
            <Stat label="Absent" value={s.A} iconName="alert" tone={s.A ? 'bad' : 'info'} sub={`${s.L} on leave`} />
          </div>
          <h4 style={{ margin: '18px 0 8px', fontSize: 13, color: 'var(--muted)' }}>Recent records</h4>
          <div className="list">
            {recent.map((r, i) => (
              <div className="list-item" key={i}><div><b>{ERP.fmt.date(r.date)}</b> <small className="muted">{DOW[parseISO(r.date).getDay()]}</small></div><div><StatusBadge code={r.status} /> <small className="muted">{r.inTime || '—'}–{r.outTime || '—'}</small></div></div>
            ))}
          </div>
        </>
      ) : <Notice tone="info" ic="calendar">No attendance has been uploaded for {u.name} yet. Student attendance imports through <b>Upload Attendance</b> — the roll number is the Employee ID in the sheet.</Notice>}
    </>
  );
  openModal({ title: 'Student record', body, wide: true, actions: [{ label: 'Close', tone: 'ghost' }] });
}

// ======================================================================
// ANNOUNCEMENTS
// ======================================================================
function Announcements({ me }) {
  useErp();
  const list = ERP.announcements.all();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const publish = (e) => {
    e.preventDefault();
    if (title.trim().length < 3) return toast('Title must be at least 3 characters', 'bad');
    if (body.trim().length < 5) return toast('Message must be at least 5 characters', 'bad');
    ERP.announcements.add(title.trim(), body.trim(), me.empId);
    toast('Announcement published');
    setTitle(''); setBody('');
  };
  const del = async (a) => {
    if (!(await confirmBox('Delete announcement?', `"${a.title}" will be removed for everyone.`, { okLabel: 'Delete', tone: 'danger' }))) return;
    ERP.announcements.remove(a.id);
    toast('Announcement deleted');
  };

  return (
    <div className="cols">
      <div className="card">
        <div className="card-head"><div><h3>All announcements</h3><p>Visible on every role&apos;s dashboard</p></div><span className="badge badge-muted">{list.length}</span></div>
        {list.length ? (
          <div className="ann-list">
            {list.map((a) => {
              const by = ERP.users.byEmp(a.by);
              return (
                <div className="ann" key={a.id}><span className="ann-ic"><Icon name="megaphone" size={18} /></span><div className="ann-main"><b>{a.title}</b><p>{a.body}</p>
                  <small className="muted">{by ? `${by.name} · ${by.designation}` : a.by} · {ERP.fmt.dateTime(a.at)} ({ERP.fmt.ago(a.at)})</small></div>
                  <div className="acts"><button className="icon-btn danger" title="Delete" aria-label="Delete" onClick={() => del(a)}><Icon name="trash" size={15} /></button></div></div>
              );
            })}
          </div>
        ) : <Empty msg="No announcements yet" iconName="megaphone" />}
      </div>
      <form className="card" noValidate onSubmit={publish}>
        <div className="card-head"><div><h3>Post an announcement</h3><p>Posted as {me.name}</p></div></div>
        <label className="field"><span>Title</span><input maxLength={90} placeholder="e.g. Biometric maintenance on Saturday" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="field"><span>Message</span><textarea rows={5} maxLength={600} placeholder="Details for staff…" value={body} onChange={(e) => setBody(e.target.value)} /></label>
        <div className="char-count"><span>{body.length}</span>/600</div>
        <button className="btn btn-primary btn-block" type="submit"><Icon name="megaphone" size={16} /> Publish</button>
      </form>
    </div>
  );
}

// ======================================================================
export default function AdminPage() {
  const me = useRequireRole(['admin']);
  if (!me) return null;
  const sections = [
    { id: 'dashboard', label: 'Dashboard', title: 'Admin dashboard', icon: 'home', render: (u) => <Dashboard me={u} /> },
    { id: 'upload', label: 'Upload Attendance', icon: 'upload', render: (u) => <Upload me={u} />, badge: () => (uploadPending ? 1 : 0) },
    { id: 'history', label: 'Upload History', icon: 'excel', render: () => <History /> },
    { id: 'records', label: 'Attendance Records', icon: 'calendar', render: () => <Records /> },
    { id: 'staff', label: 'Staff Directory', icon: 'users', render: (u) => <Staff me={u} /> },
    { id: 'students', label: 'Students', icon: 'cap', render: () => <Students /> },
    { id: 'announcements', label: 'Announcements', icon: 'megaphone', render: (u) => <Announcements me={u} /> },
  ];
  return <Shell user={me} sections={sections} />;
}
