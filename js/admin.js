/* Arundhati ERP — Admin portal. Requires data.js + ui.js + SheetJS (window.XLSX). */
(function () {
  const me = ERP.auth.require(['admin']);
  if (!me) return;

  const U = ERP.ui;
  const { $, $$, esc, icon } = U;
  const A = ERP.attendance;
  const { iso, today, parseISO, isSunday } = ERP.util;

  // ---------- small helpers ----------
  const userName = (empId) => ERP.users.byEmp(empId)?.name || empId || '—';
  const deptOf = (empId) => ERP.users.byEmp(empId)?.dept || null;
  const plural = (n, w) => `${n.toLocaleString('en-IN')} ${w}${n === 1 ? '' : 's'}`;
  const dmy = (isoDate) => { const [y, m, d] = isoDate.split('-'); return `${d}/${m}/${y}`; };
  const STATUS_CODES = Object.keys(ERP.STATUS);
  const STATUS_TONE_DONUT = { P: 'ok', A: 'bad', L: 'warn', HD: 'info', OD: 'accent' };
  const notice = (tone, ic, html) => `<div class="notice notice-${tone}">${icon(ic, 16)}<div>${html}</div></div>`;
  const pendingLeaves = () => ERP.leaves.all().filter((l) => [ERP.LEAVE_STATE.PENDING_HOD, ERP.LEAVE_STATE.PENDING_PRINCIPAL].includes(l.status));
  const rolePill = (role) => `<span class="rp role-${role}">${esc(U.ROLE_LABEL[role] || role)}</span>`;
  const personCell = (u, sub) => `<div class="person-cell">${U.avatar(u.name, 32)}<div><b>${esc(u.name)}</b><small>${esc(sub)}</small></div></div>`;

  // Rows -> sheet rows in TEMPLATE_HEADERS order.
  const toSheetRows = (recs) => recs.map((r) => {
    const u = ERP.users.byEmp(r.empId);
    return [r.empId, u?.name || '', u ? ERP.fmt.deptName(u.dept) : '', dmy(r.date), r.status, r.inTime || '', r.outTime || ''];
  });
  const stamp = () => today().replace(/-/g, '');

  // Realistic status/time generator for the sample sheet.
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

  function downloadTemplate() {
    const ex = ERP.users.staff()[0] || me;
    U.downloadXlsx('attendance_template.xlsx', A.TEMPLATE_HEADERS, [[ex.empId, ex.name, ERP.fmt.deptName(ex.dept), dmy(today()), 'P', '09:00', '17:00']], 'Attendance');
    U.toast('Blank template downloaded');
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
    U.downloadXlsx(`attendance_sample_${stamp()}.xlsx`, A.TEMPLATE_HEADERS, rows, 'Attendance');
    U.toast(`Sample sheet with ${rows.length} rows downloaded`);
  }

  // ======================================================================
  // DASHBOARD
  // ======================================================================
  function renderDashboard(el) {
    const ups = A.uploads();
    const last = ups[0];
    const pend = pendingLeaves();
    const latest = A.latestDate();
    const latestRows = latest ? A.forDate(latest) : [];
    const sum = A.summarize(latestRows);
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    el.innerHTML = `
      <div class="hero adm-hero">
        <div style="position:relative;z-index:1"><h2>${greet}, ${esc(me.name.split(' ')[0])}</h2>
          <p>${esc(ERP.INSTITUTION)} · ${latest ? `Latest attendance on file: <b>${ERP.fmt.date(latest)}</b>` : 'No attendance on file yet'}</p></div>
        <div class="row"><button class="btn btn-light" data-go="upload">${icon('upload', 16)} Upload attendance</button>
          <button class="btn btn-glass" data-dl="template">${icon('download', 16)} Template</button></div>
      </div>
      <div class="stats5">
        ${U.stat('Total staff', ERP.users.staff().length, { iconName: 'users', tone: 'accent', sub: `${ERP.users.all().filter((u) => u.role === 'faculty').length} faculty · ${ERP.users.all().filter((u) => u.role === 'hod').length} HODs` })}
        ${U.stat('Departments', ERP.DEPARTMENTS.length, { iconName: 'building', tone: 'info', sub: `${ERP.DEPARTMENTS.filter((d) => ERP.users.hodOf(d.code)).length} with a HOD` })}
        ${U.stat('Attendance records', A.all().length.toLocaleString('en-IN'), { iconName: 'calendar', tone: 'ok', sub: plural(ups.length, 'upload') })}
        ${U.stat('Last upload', last ? ERP.fmt.ago(last.at) : '—', { iconName: 'excel', tone: 'warn', sub: last ? esc(ERP.fmt.dateTime(last.at)) : 'Nothing uploaded' })}
        ${U.stat('Pending leaves', pend.length, { iconName: 'leave', tone: pend.length ? 'bad' : 'ok', sub: `${pend.filter((l) => l.status === ERP.LEAVE_STATE.PENDING_HOD).length} with HODs · ${pend.filter((l) => l.status === ERP.LEAVE_STATE.PENDING_PRINCIPAL).length} with Principal` })}
      </div>
      <div class="cols">
        <div class="section" style="gap:20px">
          <div class="card">
            <div class="card-head"><div><h3>Attendance · ${latest ? ERP.fmt.date(latest) : '—'}</h3><p>Latest date in the records · ${latestRows.length} entr${latestRows.length === 1 ? 'y' : 'ies'}</p></div>
              <button class="btn btn-ghost btn-sm" data-go="records">View records</button></div>
            <div id="dash-donut"></div>
          </div>
          <div class="card">
            <div class="card-head"><div><h3>Department-wise attendance</h3><p>Attendance % on ${latest ? ERP.fmt.date(latest) : '—'}</p></div></div>
            <div id="dash-bars"></div>
          </div>
        </div>
        <div class="section" style="gap:20px">
          <div class="card">
            <div class="card-head"><h3>Quick actions</h3></div>
            <div class="qa-grid">
              <button class="qa" data-go="upload">${icon('upload', 20)}<b>Upload attendance</b><small>Import an Excel / CSV sheet</small></button>
              <button class="qa" data-dl="sample">${icon('excel', 20)}<b>Sample sheet</b><small>Last 5 working days, all staff</small></button>
              <button class="qa" data-go="staff">${icon('users', 20)}<b>Manage staff</b><small>Add, edit or remove users</small></button>
              <button class="qa" data-go="announcements">${icon('megaphone', 20)}<b>Announce</b><small>Post a notice to everyone</small></button>
            </div>
          </div>
          <div class="card">
            <div class="card-head"><div><h3>Recent uploads</h3></div><button class="btn btn-ghost btn-sm" data-go="history">All uploads</button></div>
            ${ups.length ? `<div class="list">${ups.slice(0, 5).map((u) => `<div class="list-item"><span class="li-ic">${icon('excel', 18)}</span>
              <div class="li-main"><b title="${esc(u.fileName)}">${esc(u.fileName)}</b><small>${esc(userName(u.uploadedBy))} · ${ERP.fmt.ago(u.at)}</small></div>
              <span class="badge badge-muted">${plural(u.rows, 'row')}</span></div>`).join('')}</div>` : U.empty('No uploads yet', 'excel')}
          </div>
        </div>
      </div>`;

    if (latestRows.length) {
      U.donut($('#dash-donut', el), STATUS_CODES.map((c) => ({ label: ERP.STATUS[c].label, value: sum[c] || 0, tone: STATUS_TONE_DONUT[c] })), `${sum.percent}%`);
      U.bars($('#dash-bars', el), ERP.DEPARTMENTS.map((d) => {
        const s = A.summarize(latestRows.filter((r) => deptOf(r.empId) === d.code));
        return { label: d.name, value: s.percent, tone: s.percent >= 85 ? 'ok' : s.percent >= 75 ? 'warn' : 'bad' };
      }), { max: 100, suffix: '%' });
    } else {
      $('#dash-donut', el).innerHTML = U.empty('No attendance records yet — upload a sheet to get started.', 'calendar');
      $('#dash-bars', el).innerHTML = U.empty('Nothing to chart yet', 'chart');
    }
    wireCommon(el);
  }

  function wireCommon(el) {
    $$('[data-go]', el).forEach((b) => b.addEventListener('click', () => U.go(b.dataset.go)));
    $$('[data-dl]', el).forEach((b) => b.addEventListener('click', () => (b.dataset.dl === 'sample' ? downloadSample() : downloadTemplate())));
  }

  // ======================================================================
  // UPLOAD ATTENDANCE
  // ======================================================================
  let pending = null; // { fileName, valid, errors, totalRows, dupes }
  let lastImportedId = null;

  function stepsHtml(step) {
    const s = (n, label) => `<span class="st ${n === step ? 'on' : n < step ? 'done' : ''}"><i>${n < step ? '✓' : n}</i>${label}</span>`;
    return `<div class="steps">${s(1, 'Choose file')}<span class="sep"></span>${s(2, 'Review')}<span class="sep"></span>${s(3, 'Import')}</div>`;
  }

  function renderUpload(el) {
    if (pending) return renderPreview(el);
    const ex = ERP.users.staff()[0];
    el.innerHTML = `
      ${stepsHtml(1)}
      <div class="cols">
        <div class="card">
          <div class="card-head"><div><h3>Upload attendance sheet</h3><p>Excel (.xlsx, .xls) or CSV · first worksheet is read</p></div></div>
          <label class="dropzone" id="dz" tabindex="0">
            <input type="file" id="dz-input" accept=".xlsx,.xls,.csv" hidden>
            <div class="dz-ic">${icon('upload', 30)}</div>
            <b>Drop your attendance file here</b>
            <span class="muted small">or <u>click to browse</u> · .xlsx, .xls, .csv</span>
          </label>
          <div class="row" style="margin-top:14px">
            <button class="btn btn-ghost" data-dl="template">${icon('download', 16)} Download blank template</button>
            <button class="btn btn-ghost" data-dl="sample">${icon('excel', 16)} Download sample filled sheet</button>
          </div>
          <p class="muted small" style="margin:10px 0 0">Tip: the sample sheet contains every staff member for the last 5 working days — upload it straight back to see the import flow. Biometric <b>Monthly Status Report (Basic Work Duration)</b> exports are auto-detected too — just upload the .xls as-is.</p>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>Required format</h3><p>Row 1 must be the header row</p></div></div>
          <div class="table-scroll"><table class="fmt-table"><thead><tr><th>Column</th><th>Example</th><th></th></tr></thead><tbody>
            ${A.TEMPLATE_HEADERS.map((h) => {
              const exv = { 'Employee ID': ex?.empId, Name: ex?.name, Department: ERP.fmt.deptName(ex?.dept), Date: dmy(today()), Status: 'P', 'In Time': '09:00', 'Out Time': '17:00' }[h];
              const req = ['Employee ID', 'Date', 'Status'].includes(h);
              return `<tr><td><b>${esc(h)}</b></td><td><code>${esc(exv || '')}</code></td><td>${req ? '<span class="badge badge-bad">Required</span>' : '<span class="badge badge-muted">Optional</span>'}</td></tr>`;
            }).join('')}
          </tbody></table></div>
          <h4 style="margin:16px 0 8px;font-size:13px">Status codes</h4>
          <div class="codes">${STATUS_CODES.map((c) => `<span>${U.statusBadge(c)} ${esc(ERP.STATUS[c].label)}</span>`).join('')}</div>
          <h4 style="margin:16px 0 8px;font-size:13px">Rules</h4>
          <ul class="tips">
            <li>Date as <b>DD/MM/YYYY</b> or <b>YYYY-MM-DD</b> (real Excel dates also work).</li>
            <li>Times in 24-hour <b>HH:MM</b>; leave blank for A / L.</li>
            <li>Employee ID must exist in the Staff Directory.</li>
            <li>An existing record for the same employee &amp; date is <b>overwritten</b>.</li>
            <li>Name / Department columns are for readability and are ignored on import.</li>
          </ul>
        </div>
      </div>`;
    wireCommon(el);

    const dz = $('#dz', el), input = $('#dz-input', el);
    dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', () => { if (input.files[0]) handleFile(input.files[0], dz); });
    ['dragenter', 'dragover'].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
    ['dragleave', 'dragend'].forEach((t) => dz.addEventListener(t, (e) => { if (!dz.contains(e.relatedTarget)) dz.classList.remove('drag'); }));
    dz.addEventListener('drop', (e) => {
      e.preventDefault(); dz.classList.remove('drag');
      const f = e.dataTransfer.files[0]; if (f) handleFile(f, dz);
    });
  }

  /* Biometric "Monthly Status Report (Basic Work Duration)" matrix reports export days
   * across columns and a Status/InTime/OutTime block per employee. Detect that shape and
   * flatten it to the same {Employee ID, Date, Status, In Time, Out Time} rows the normal
   * upload path validates. Returns null when the sheet is not in this format. */
  function parseBasicWorkDuration(ws) {
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null });
    const cell = (r, c) => { const v = (rows[r] && rows[r][c]); return v == null ? '' : String(v).trim(); };
    const titled = rows.slice(0, 4).some((r) => (r || []).some((c) => /basic work duration/i.test(String(c || ''))));
    const hasBlocks = rows.some((r) => (r && String(r[0] || '').trim()) === 'Emp. Code:');
    if (!titled && !hasBlocks) return null;

    // weekly-off (WO) and holiday (H) are non-working days -> no attendance record.
    const MAP = { P: 'P', A: 'A', L: 'L', HD: 'HD', OD: 'OD', WOP: 'P', HP: 'P', WO: null, H: null, HLD: null };
    // month/year from the "Oct 01 2026  To  Oct 26 2026" header line
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

  async function handleFile(file, dz) {
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return U.toast('Please choose an .xlsx, .xls or .csv file', 'bad');
    if (!window.XLSX) return U.toast('Excel library failed to load — check your internet connection', 'bad');
    dz.classList.add('busy');
    dz.innerHTML = `<div class="dz-spin"></div><b>Reading ${esc(file.name)}…</b><span class="muted small">Parsing and validating rows</span>`;
    try {
      let wb;
      if (/\.csv$/i.test(file.name)) {
        // raw:true keeps "13/10/2026" etc. as text so DD/MM isn't misread as MM/DD.
        wb = XLSX.read(await file.text(), { type: 'string', raw: true });
      } else {
        // cellDates:false -> real Excel dates/times arrive as serial numbers, which
        // ERP.attendance.validate() converts timezone-safely (Date objects from
        // SheetJS can drift by minutes in IST for time-only cells).
        wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
      }
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error('The workbook has no sheets');
      // Biometric "Basic Work Duration" matrix reports are flattened first; any other
      // sheet falls back to the plain one-row-per-record format.
      const raw = parseBasicWorkDuration(ws) || XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!raw.length) throw new Error('The first sheet has no data rows');
      // Validate row-by-row so we keep each row's sheet number, and additionally reject
      // impossible calendar dates (e.g. 31/02/2026) that validate() would roll over.
      const valid = [], errors = [];
      raw.forEach((o, i) => {
        const res = A.validate([o]);
        res.errors.forEach((e) => errors.push({ row: i + 2, message: e.message }));
        res.valid.forEach((r) => {
          if (iso(parseISO(r.date)) !== r.date || +r.date.slice(0, 4) < 2000) errors.push({ row: i + 2, message: `Invalid calendar date (read as ${r.date})` });
          else valid.push(r);
        });
      });
      // De-duplicate empId+date inside the file (last one wins, like importRows).
      const map = new Map(); valid.forEach((r) => map.set(`${r.empId}|${r.date}`, r));
      const dedup = [...map.values()];
      pending = { fileName: file.name, valid: dedup, errors, totalRows: raw.length, dupes: valid.length - dedup.length };
      U.refresh();
    } catch (e) {
      console.error(e);
      U.refresh();
      U.toast(`Couldn't read file: ${e.message || e}`, 'bad');
    }
  }

  function renderPreview(el) {
    const { fileName, valid, errors, totalRows, dupes } = pending;
    const existing = new Set(A.all().map((r) => `${r.empId}|${r.date}`));
    const overwrite = valid.filter((r) => existing.has(`${r.empId}|${r.date}`)).length;
    const dates = valid.map((r) => r.date).sort();
    const from = dates[0], to = dates[dates.length - 1];
    const sundays = new Set(valid.filter((r) => isSunday(r.date)).map((r) => r.date));
    const future = valid.filter((r) => r.date > today()).length;
    const staffCount = new Set(valid.map((r) => r.empId)).size;
    const sum = A.summarize(valid);

    el.innerHTML = `
      ${stepsHtml(2)}
      <div class="card">
        <div class="pv-head">
          <div class="pv-file"><span class="li-ic">${icon('excel', 22)}</span><div><b>${esc(fileName)}</b><small class="muted">${plural(totalRows, 'row')} read · ${valid.length ? `${ERP.fmt.date(from)} – ${ERP.fmt.date(to)}` : 'no valid dates'}</small></div></div>
          <button class="btn btn-ghost btn-sm" data-cancel>${icon('x', 14)} Choose another file</button>
        </div>
      </div>
      <div class="stats5">
        ${U.stat('Valid rows', valid.length.toLocaleString('en-IN'), { iconName: 'check', tone: 'ok', sub: `${plural(staffCount, 'employee')}${dupes ? ` · ${dupes} duplicate${dupes === 1 ? '' : 's'} merged` : ''}` })}
        ${U.stat('Rows with errors', errors.length, { iconName: 'alert', tone: errors.length ? 'bad' : 'ok', sub: errors.length ? 'Will be skipped' : 'All clear' })}
        ${U.stat('Date range', valid.length ? `${new Set(dates).size} <small>day${new Set(dates).size === 1 ? '' : 's'}</small>` : '—', { iconName: 'calendar', tone: 'info', sub: valid.length ? `${ERP.fmt.date(from)} – ${ERP.fmt.date(to)}` : '' })}
        ${U.stat('Will overwrite', overwrite, { iconName: 'swap', tone: overwrite ? 'warn' : 'accent', sub: `${valid.length - overwrite} new record${valid.length - overwrite === 1 ? '' : 's'}` })}
      </div>
      ${overwrite ? notice('warn', 'alert', `<b>${plural(overwrite, 'existing record')}</b> for the same employee &amp; date will be replaced by this file.`) : ''}
      ${sundays.size ? notice('info', 'calendar', `Contains Sunday date${sundays.size > 1 ? 's' : ''}: ${[...sundays].sort().map((d) => ERP.fmt.date(d)).join(', ')}.`) : ''}
      ${future ? notice('info', 'clock', `${plural(future, 'row')} dated in the future.`) : ''}
      ${errors.length ? `<div class="card"><div class="card-head"><div><h3>Errors (${errors.length})</h3><p>These rows will not be imported. Fix them in the sheet and re-upload, or continue without them.</p></div>
          <button class="btn btn-ghost btn-sm" data-err-dl>${icon('download', 14)} Error report</button></div>
          <div class="err-list">${errors.map((e) => `<div><b>Row ${e.row}</b><span>${esc(e.message)}</span></div>`).join('')}</div></div>` : ''}
      <div class="card">
        <div class="card-head"><div><h3>Preview of valid rows</h3><p>${STATUS_CODES.map((c) => `${c}: <b>${sum[c] || 0}</b>`).join(' · ')}</p></div></div>
        <div id="pv-table"></div>
      </div>
      <div class="sticky-actions">
        <span class="muted small">${valid.length ? `Ready to import <b>${valid.length.toLocaleString('en-IN')}</b> records${errors.length ? `, skipping ${errors.length}` : ''}.` : 'No valid rows to import.'}</span>
        <button class="btn btn-ghost" data-cancel>Cancel</button>
        <button class="btn btn-primary" data-import ${valid.length ? '' : 'disabled'}>${icon('upload', 16)} Import ${valid.length.toLocaleString('en-IN')} records</button>
      </div>`;

    U.table($('#pv-table', el), {
      rows: valid,
      pageSize: 10,
      emptyText: 'No valid rows found in this file',
      search: (r) => `${r.empId} ${userName(r.empId)} ${ERP.fmt.deptName(deptOf(r.empId))} ${r.status}`,
      columns: [
        { key: 'empId', label: 'Emp ID', render: (r) => `<span class="mono">${esc(r.empId)}</span>` },
        { key: 'name', label: 'Name', sort: (r) => userName(r.empId), render: (r) => esc(userName(r.empId)) },
        { key: 'dept', label: 'Department', sort: (r) => deptOf(r.empId) || '', render: (r) => esc(ERP.fmt.deptName(deptOf(r.empId))) },
        { key: 'date', label: 'Date', render: (r) => ERP.fmt.date(r.date) },
        { key: 'status', label: 'Status', render: (r) => U.statusBadge(r.status) },
        { key: 'inTime', label: 'In', render: (r) => esc(r.inTime || '—') },
        { key: 'outTime', label: 'Out', render: (r) => esc(r.outTime || '—') },
        { key: 'ow', label: 'Action', sort: (r) => existing.has(`${r.empId}|${r.date}`) ? 1 : 0, render: (r) => existing.has(`${r.empId}|${r.date}`) ? '<span class="badge badge-warn">Overwrite</span>' : '<span class="badge badge-ok">New</span>' },
      ],
    });

    $$('[data-cancel]', el).forEach((b) => b.addEventListener('click', () => { pending = null; U.refresh(); U.toast('Upload cancelled', 'bad'); }));
    $('[data-err-dl]', el)?.addEventListener('click', () => U.downloadXlsx(`errors_${fileName.replace(/\.[^.]+$/, '')}.xlsx`, ['Row', 'Error'], errors.map((e) => [e.row, e.message]), 'Errors'));
    $('[data-import]', el).addEventListener('click', (e) => {
      const btn = e.target.closest('button'); btn.disabled = true;
      const up = A.importRows(valid, fileName, me.empId);
      lastImportedId = up.id;
      pending = null;
      U.toast(`Imported ${up.rows} records${up.replaced ? ` (${up.replaced} updated)` : ''}`);
      U.go('history');
    });
  }

  // ======================================================================
  // UPLOAD HISTORY
  // ======================================================================
  function renderHistory(el) {
    const ups = A.uploads();
    const live = new Map(); A.all().forEach((r) => live.set(r.uploadId, (live.get(r.uploadId) || 0) + 1));
    const rangeOf = (u) => {
      if (u.from) return [u.from, u.to];
      const ds = A.all().filter((r) => r.uploadId === u.id).map((r) => r.date).sort();
      return ds.length ? [ds[0], ds[ds.length - 1]] : [null, null];
    };
    el.innerHTML = `
      <div class="card">
        <div class="card-head"><div><h3>Upload history</h3><p>${plural(ups.length, 'upload')} · deleting an upload removes the attendance records it still owns</p></div>
          <button class="btn btn-primary" data-go="upload">${icon('upload', 16)} New upload</button></div>
        <div id="hist-table"></div>
      </div>`;
    wireCommon(el);
    const box = $('#hist-table', el);
    U.table(box, {
      rows: ups,
      pageSize: 10,
      emptyText: 'No uploads yet',
      search: (u) => `${u.fileName} ${userName(u.uploadedBy)}`,
      columns: [
        { key: 'fileName', label: 'File', render: (u) => `<div class="person-cell" data-hl="${u.id === lastImportedId ? 1 : ''}"><span class="li-ic" style="width:32px;height:32px;border-radius:9px;display:grid;place-items:center;background:var(--ok-soft);color:var(--ok);flex:none">${icon('excel', 16)}</span><div><b>${esc(u.fileName)}</b>${u.id === lastImportedId ? '<span class="badge badge-ok">Just imported</span>' : u.id === 'SEED' ? '<small>Initial demo data</small>' : ''}</div></div>` },
        { key: 'uploadedBy', label: 'Uploaded by', sort: (u) => userName(u.uploadedBy), render: (u) => esc(userName(u.uploadedBy)) },
        { key: 'at', label: 'Uploaded at', render: (u) => `${esc(ERP.fmt.dateTime(u.at))}<br><small class="muted">${ERP.fmt.ago(u.at)}</small>` },
        { key: 'rows', label: 'Rows', align: 'right', render: (u) => { const l = live.get(u.id) || 0; return `<b>${u.rows.toLocaleString('en-IN')}</b>${l !== u.rows ? `<br><small class="muted" title="Records still owned by this upload (others were overwritten by later uploads)">${l.toLocaleString('en-IN')} live</small>` : ''}${u.replaced ? `<br><small class="muted">${u.replaced} overwritten</small>` : ''}`; } },
        { key: 'from', label: 'Date range', sort: (u) => rangeOf(u)[0] || '', render: (u) => { const [f, t] = rangeOf(u); return f ? `${ERP.fmt.date(f)}${t !== f ? ` – ${ERP.fmt.date(t)}` : ''}` : '—'; } },
        { key: 'act', label: '', noSort: true, render: (u) => `<div class="acts"><button class="icon-btn" data-exp="${esc(u.id)}" title="Export records as .xlsx" aria-label="Export">${icon('download', 15)}</button><button class="icon-btn danger" data-del="${esc(u.id)}" title="Delete upload" aria-label="Delete">${icon('trash', 15)}</button></div>` },
      ],
    });
    const hl = () => $$('[data-hl="1"]', box).forEach((n) => n.closest('tr')?.classList.add('hl'));
    hl();
    box.addEventListener('click', async (e) => {
      const exp = e.target.closest('[data-exp]'), del = e.target.closest('[data-del]');
      if (exp) {
        const u = ups.find((x) => x.id === exp.dataset.exp);
        const recs = A.all().filter((r) => r.uploadId === u.id).sort((a, b) => a.date.localeCompare(b.date) || a.empId.localeCompare(b.empId));
        if (!recs.length) return U.toast('This upload has no remaining records', 'bad');
        U.downloadXlsx(`export_${u.fileName.replace(/\.[^.]+$/, '')}.xlsx`, A.TEMPLATE_HEADERS, toSheetRows(recs), 'Attendance');
        U.toast(`Exported ${recs.length} records`);
      } else if (del) {
        const u = ups.find((x) => x.id === del.dataset.del);
        const n = live.get(u.id) || 0;
        const ok = await U.confirm('Delete this upload?', `"${u.fileName}" and the ${n} attendance record${n === 1 ? '' : 's'} it owns will be permanently removed. Records it overwrote are not restored.`, { okLabel: 'Delete upload', tone: 'danger' });
        if (!ok) return;
        A.deleteUpload(u.id);
        if (lastImportedId === u.id) lastImportedId = null;
        U.toast(`Deleted ${u.fileName} (${n} records)`);
        U.refresh();
      }
    });
    setTimeout(() => { lastImportedId = null; }, 3000);
  }

  // ======================================================================
  // ATTENDANCE RECORDS
  // ======================================================================
  const recFilter = { from: '', to: '', dept: '', status: '', q: '' };
  let recInit = false;
  function renderRecords(el) {
    const latest = A.latestDate();
    if (!recInit && latest) { recInit = true; recFilter.to = latest; const d = parseISO(latest); d.setDate(d.getDate() - 6); recFilter.from = iso(d); }
    el.innerHTML = `
      <div class="card">
        <div class="filters">
          <label class="field"><span>From</span><input type="date" data-f="from" value="${recFilter.from}"></label>
          <label class="field"><span>To</span><input type="date" data-f="to" value="${recFilter.to}"></label>
          <label class="field"><span>Department</span><select data-f="dept"><option value="">All departments</option>${ERP.DEPARTMENTS.map((d) => `<option value="${d.code}" ${recFilter.dept === d.code ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}<option value="-" ${recFilter.dept === '-' ? 'selected' : ''}>Administration (no dept)</option></select></label>
          <label class="field"><span>Status</span><select data-f="status"><option value="">All statuses</option>${STATUS_CODES.map((c) => `<option value="${c}" ${recFilter.status === c ? 'selected' : ''}>${c} — ${esc(ERP.STATUS[c].label)}</option>`).join('')}</select></label>
          <div class="field grow"><span>Search</span><label class="search">${icon('search', 16)}<input type="search" data-f="q" placeholder="Name or employee ID" value="${esc(recFilter.q)}"></label></div>
        </div>
        <div class="row" style="margin-top:14px;justify-content:space-between">
          <div class="row" id="rec-presets" style="gap:6px">
            <button class="btn btn-ghost btn-sm" data-preset="latest">Latest day</button>
            <button class="btn btn-ghost btn-sm" data-preset="7">Last 7 days</button>
            <button class="btn btn-ghost btn-sm" data-preset="30">Last 30 days</button>
            <button class="btn btn-ghost btn-sm" data-preset="all">All time</button>
            <button class="btn btn-ghost btn-sm" data-preset="clear">${icon('x', 14)} Reset</button>
          </div>
          <button class="btn btn-primary" data-export>${icon('download', 16)} Export filtered (.xlsx)</button>
        </div>
      </div>
      <div class="cards" id="rec-stats"></div>
      <div class="card"><div id="rec-table"></div></div>`;

    const filtered = () => {
      const q = recFilter.q.trim().toLowerCase();
      return A.all().filter((r) => {
        if (recFilter.from && r.date < recFilter.from) return false;
        if (recFilter.to && r.date > recFilter.to) return false;
        if (recFilter.status && r.status !== recFilter.status) return false;
        const u = ERP.users.byEmp(r.empId);
        if (recFilter.dept) { const d = u?.dept || '-'; if (d !== recFilter.dept) return false; }
        if (q && !(`${r.empId} ${u?.name || ''}`.toLowerCase().includes(q))) return false;
        return true;
      }).sort((a, b) => b.date.localeCompare(a.date) || a.empId.localeCompare(b.empId));
    };

    const t = U.table($('#rec-table', el), {
      rows: [],
      pageSize: 15,
      emptyText: 'No records match these filters',
      columns: [
        { key: 'date', label: 'Date', render: (r) => `${ERP.fmt.date(r.date)}<br><small class="muted">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][parseISO(r.date).getDay()]}</small>` },
        { key: 'empId', label: 'Employee', sort: (r) => userName(r.empId), render: (r) => { const u = ERP.users.byEmp(r.empId); return u ? personCell(u, r.empId) : `<span class="mono">${esc(r.empId)}</span> <span class="badge badge-muted">removed</span>`; } },
        { key: 'dept', label: 'Department', sort: (r) => deptOf(r.empId) || '', render: (r) => esc(ERP.fmt.deptName(deptOf(r.empId))) },
        { key: 'status', label: 'Status', render: (r) => `${U.statusBadge(r.status)} <small class="muted">${esc(ERP.STATUS[r.status]?.label || '')}</small>` },
        { key: 'inTime', label: 'In', render: (r) => esc(r.inTime || '—') },
        { key: 'outTime', label: 'Out', render: (r) => esc(r.outTime || '—') },
        { key: 'uploadId', label: 'Source', render: (r) => { const up = A.uploads().find((u) => u.id === r.uploadId); return `<small class="muted" title="${esc(up?.fileName || '')}">${esc(up ? (up.fileName.length > 26 ? up.fileName.slice(0, 24) + '…' : up.fileName) : '—')}</small>`; } },
      ],
    });

    let current = [];
    const draw = () => {
      current = filtered();
      t.setRows(current);
      const s = A.summarize(current);
      $('#rec-stats', el).innerHTML = [
        U.stat('Records', current.length.toLocaleString('en-IN'), { iconName: 'file', tone: 'accent', sub: `${new Set(current.map((r) => r.empId)).size} employees` }),
        U.stat('Attendance %', `${s.percent}%`, { iconName: 'chart', tone: s.percent >= 85 ? 'ok' : s.percent >= 75 ? 'warn' : 'bad', sub: '(P + OD + ½HD) ÷ (total − L)' }),
        U.stat('Absent', s.A, { iconName: 'x', tone: 'bad', sub: `${s.L} on leave · ${s.HD} half day` }),
        U.stat('On duty', s.OD, { iconName: 'building', tone: 'info', sub: `${s.P} present` }),
      ].join('');
    };
    draw();

    let deb;
    $$('[data-f]', el).forEach((inp) => inp.addEventListener(inp.type === 'search' ? 'input' : 'change', () => {
      recFilter[inp.dataset.f] = inp.value;
      clearTimeout(deb); deb = setTimeout(draw, inp.type === 'search' ? 180 : 0);
    }));
    $('#rec-presets', el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-preset]'); if (!b) return;
      const p = b.dataset.preset, end = A.latestDate() || today();
      if (p === 'clear') Object.assign(recFilter, { from: '', to: '', dept: '', status: '', q: '' });
      else if (p === 'all') Object.assign(recFilter, { from: '', to: '' });
      else if (p === 'latest') Object.assign(recFilter, { from: end, to: end });
      else { const d = parseISO(end); d.setDate(d.getDate() - (+p - 1)); Object.assign(recFilter, { from: iso(d), to: end }); }
      if (p === 'clear') recInit = false; // renderRecords re-seeds the default 7-day window
      U.refresh();
    });
    $('[data-export]', el).addEventListener('click', () => {
      if (!current.length) return U.toast('Nothing to export', 'bad');
      const tag = [recFilter.from, recFilter.to].filter(Boolean).join('_to_') || 'all';
      U.downloadXlsx(`attendance_${tag}.xlsx`, A.TEMPLATE_HEADERS, toSheetRows(current), 'Attendance');
      U.toast(`Exported ${current.length} records`);
    });
  }

  // ======================================================================
  // STAFF DIRECTORY
  // ======================================================================
  let staffRole = '';
  function renderStaff(el) {
    const all = ERP.users.all();
    const counts = all.reduce((m, u) => { m[u.role] = (m[u.role] || 0) + 1; return m; }, {});
    const roles = ['admin', 'principal', 'dean', 'hod', 'faculty'];
    el.innerHTML = `
      <div class="card">
        <div class="card-head"><div><h3>Staff directory</h3><p>${plural(all.length, 'user')} · login credentials (default password aims@123)</p></div>
          <div class="tabs" id="role-tabs"><button data-role="" class="${staffRole ? '' : 'active'}">All <small class="muted">${all.length}</small></button>${roles.map((r) => `<button data-role="${r}" class="${staffRole === r ? 'active' : ''}">${esc(r === 'faculty' ? 'Faculty' : r === 'hod' ? 'HODs' : U.ROLE_LABEL[r])} <small class="muted">${counts[r] || 0}</small></button>`).join('')}</div></div>
        <div id="staff-table"></div>
      </div>`;
    const box = $('#staff-table', el);
    U.table(box, {
      rows: all.filter((u) => !staffRole || u.role === staffRole),
      pageSize: 12,
      emptyText: 'No users in this group',
      toolbar: `<button class="btn btn-primary" data-add>${icon('plus', 16)} Add user</button>`,
      search: (u) => `${u.name} ${u.empId} ${u.username} ${u.email || ''} ${u.designation} ${ERP.fmt.deptName(u.dept)} ${u.role}`,
      columns: [
        { key: 'name', label: 'Name', render: (u) => personCell(u, u.email || '') },
        { key: 'empId', label: 'Emp ID', render: (u) => `<span class="mono">${esc(u.empId)}</span>` },
        { key: 'role', label: 'Role', render: (u) => rolePill(u.role) },
        { key: 'dept', label: 'Department', sort: (u) => u.dept || '', render: (u) => esc(u.dept ? ERP.fmt.deptName(u.dept) : '—') },
        { key: 'designation', label: 'Designation' },
        { key: 'username', label: 'Login (demo)', render: (u) => `<span class="cred mono">${esc(u.username)}<i>/</i>${esc(u.password)}</span>` },
        { key: 'act', label: '', noSort: true, render: (u) => `<div class="acts"><button class="icon-btn" data-edit="${esc(u.empId)}" title="Edit" aria-label="Edit">${icon('settings', 15)}</button><button class="icon-btn danger" data-rm="${esc(u.empId)}" ${u.empId === me.empId ? 'disabled title="You cannot delete yourself"' : 'title="Delete"'} aria-label="Delete">${icon('trash', 15)}</button></div>` },
      ],
    });
    $('#role-tabs', el).addEventListener('click', (e) => { const b = e.target.closest('[data-role]'); if (!b) return; staffRole = b.dataset.role; U.refresh(); });
    box.addEventListener('click', async (e) => {
      if (e.target.closest('[data-add]')) return userModal(null);
      const ed = e.target.closest('[data-edit]'), rm = e.target.closest('[data-rm]');
      if (ed) return userModal(ERP.users.byEmp(ed.dataset.edit));
      if (rm && !rm.disabled) {
        const u = ERP.users.byEmp(rm.dataset.rm);
        if (u.empId === me.empId) return;
        const ok = await U.confirm(`Delete ${u.name}?`, `${u.empId} · ${u.designation}. They will no longer be able to sign in. Existing attendance and leave records are kept.`, { okLabel: 'Delete user', tone: 'danger' });
        if (!ok) return;
        ERP.users.remove(u.empId);
        U.toast(`${u.name} removed`);
        U.refresh();
      }
    });
  }

  function userModal(u) {
    const edit = !!u;
    const v = u || { empId: '', name: '', username: '', password: '', role: 'faculty', dept: ERP.DEPARTMENTS[0].code, designation: '', email: '' };
    const body = document.createElement('form');
    body.noValidate = true;
    body.innerHTML = `
      <div class="grid-2">
        <label class="field"><span>Employee ID *</span><input name="empId" value="${esc(v.empId)}" ${edit ? 'readonly title="Employee ID cannot be changed"' : ''} placeholder="e.g. MED005" style="text-transform:uppercase"></label>
        <label class="field"><span>Full name *</span><input name="name" value="${esc(v.name)}" placeholder="Dr. Firstname Lastname"></label>
        <label class="field"><span>Username *</span><input name="username" value="${esc(v.username)}" autocomplete="off" placeholder="login name"></label>
        <label class="field"><span>Password *</span><input name="password" value="${esc(v.password)}" autocomplete="off" placeholder="min 4 characters"></label>
        <label class="field"><span>Role *</span><select name="role">${['faculty', 'hod', 'dean', 'principal', 'admin'].map((r) => `<option value="${r}" ${v.role === r ? 'selected' : ''}>${esc(U.ROLE_LABEL[r])}</option>`).join('')}</select></label>
        <label class="field"><span>Department</span><select name="dept"><option value="">— None —</option>${ERP.DEPARTMENTS.map((d) => `<option value="${d.code}" ${v.dept === d.code ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Designation *</span><input name="designation" value="${esc(v.designation)}" placeholder="e.g. Assistant Professor" list="desig-list"></label>
        <label class="field"><span>Email</span><input name="email" type="email" value="${esc(v.email || '')}" placeholder="name@arundhati.edu"></label>
      </div>
      <datalist id="desig-list">${['Professor', 'Associate Professor', 'Assistant Professor', 'Senior Resident', 'Junior Resident', 'Tutor', 'Professor & HOD'].map((d) => `<option value="${d}">`).join('')}</datalist>
      <div class="notice notice-bad" data-err hidden></div>`;
    const f = (n) => body.elements[n];
    const syncDept = () => {
      const needs = ['faculty', 'hod'].includes(f('role').value);
      f('dept').disabled = !needs;
      if (!needs) f('dept').value = '';
      else if (!f('dept').value) f('dept').value = ERP.DEPARTMENTS[0].code;
      if (f('role').value === 'hod' && !f('designation').value) f('designation').value = 'Professor & HOD';
    };
    f('role').addEventListener('change', syncDept);
    syncDept();
    if (!edit) f('name').addEventListener('input', () => {
      if (f('username').dataset.touched) return;
      const first = f('name').value.replace(/^Dr\.?\s*/i, '').trim().split(/\s+/)[0] || '';
      f('username').value = first.toLowerCase().replace(/[^a-z0-9.]/g, '');
    });
    f('username').addEventListener('input', () => { f('username').dataset.touched = '1'; });

    const err = (msg) => { const e = $('[data-err]', body); e.innerHTML = `${icon('alert', 16)}<div>${esc(msg)}</div>`; e.hidden = false; return false; };
    const save = () => {
      const d = {
        empId: f('empId').value.trim().toUpperCase(), name: f('name').value.trim(), username: f('username').value.trim().toLowerCase(),
        password: f('password').value, role: f('role').value, dept: f('dept').value || null, designation: f('designation').value.trim(), email: f('email').value.trim(),
      };
      if (!d.empId || !/^[A-Z0-9-]{2,}$/.test(d.empId)) return err('Employee ID is required (letters, digits or -).');
      if (!d.name) return err('Full name is required.');
      if (!d.username || /\s/.test(d.username)) return err('Username is required and cannot contain spaces.');
      if (!d.password || d.password.length < 4) return err('Password must be at least 4 characters.');
      if (!d.designation) return err('Designation is required.');
      if (['faculty', 'hod'].includes(d.role) && !d.dept) return err('Faculty and HODs must belong to a department.');
      if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return err('Email address looks invalid.');
      const clash = ERP.users.all().find((x) => x.username.toLowerCase() === d.username && x.empId !== (edit ? u.empId : null));
      if (clash) return err(`Username "${d.username}" is already used by ${clash.name}.`);
      if (d.role === 'hod') { const h = ERP.users.hodOf(d.dept); if (h && h.empId !== (edit ? u.empId : null)) return err(`${ERP.fmt.deptName(d.dept)} already has a HOD (${h.name}).`); }
      if (edit && u.empId === me.empId && d.role !== 'admin') return err('You cannot remove your own admin role.');
      try {
        if (edit) { const { empId, ...patch } = d; ERP.users.update(u.empId, patch); U.toast(`${d.name} updated`); }
        else { ERP.users.add(d); U.toast(`${d.name} added`); }
      } catch (ex) { return err(ex.message); }
      U.refresh();
      return true;
    };
    const m = U.modal({ title: edit ? `Edit ${u.name}` : 'Add user', body, wide: true, actions: [{ label: 'Cancel', tone: 'ghost' }, { label: edit ? 'Save changes' : 'Add user', tone: 'primary', onClick: () => save() }] });
    body.addEventListener('submit', (e) => { e.preventDefault(); if (save()) m.close(); });
    body.addEventListener('input', () => { $('[data-err]', body).hidden = true; });
  }

  // ======================================================================
  // ANNOUNCEMENTS
  // ======================================================================
  function renderAnnouncements(el) {
    const list = ERP.announcements.all();
    el.innerHTML = `
      <div class="cols">
        <div class="card">
          <div class="card-head"><div><h3>All announcements</h3><p>Visible on every role's dashboard</p></div><span class="badge badge-muted">${list.length}</span></div>
          ${list.length ? `<div class="ann-list">${list.map((a) => {
            const by = ERP.users.byEmp(a.by);
            return `<div class="ann"><span class="ann-ic">${icon('megaphone', 18)}</span><div class="ann-main"><b>${esc(a.title)}</b><p>${esc(a.body)}</p>
              <small class="muted">${by ? `${esc(by.name)} · ${esc(by.designation)}` : esc(a.by)} · ${ERP.fmt.dateTime(a.at)} (${ERP.fmt.ago(a.at)})</small></div>
              <div class="acts"><button class="icon-btn danger" data-del="${esc(a.id)}" title="Delete" aria-label="Delete">${icon('trash', 15)}</button></div></div>`;
          }).join('')}</div>` : U.empty('No announcements yet', 'megaphone')}
        </div>
        <form class="card" id="ann-form" novalidate>
          <div class="card-head"><div><h3>Post an announcement</h3><p>Posted as ${esc(me.name)}</p></div></div>
          <label class="field"><span>Title</span><input name="title" maxlength="90" placeholder="e.g. Biometric maintenance on Saturday"></label>
          <label class="field"><span>Message</span><textarea name="body" rows="5" maxlength="600" placeholder="Details for staff…"></textarea></label>
          <div class="char-count"><span data-cc>0</span>/600</div>
          <button class="btn btn-primary btn-block" type="submit">${icon('megaphone', 16)} Publish</button>
        </form>
      </div>`;
    const form = $('#ann-form', el);
    form.elements.body.addEventListener('input', () => { $('[data-cc]', form).textContent = form.elements.body.value.length; });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = form.elements.title.value.trim(), body = form.elements.body.value.trim();
      if (title.length < 3) { form.elements.title.focus(); return U.toast('Title must be at least 3 characters', 'bad'); }
      if (body.length < 5) { form.elements.body.focus(); return U.toast('Message must be at least 5 characters', 'bad'); }
      ERP.announcements.add(title, body, me.empId);
      U.toast('Announcement published');
      U.refresh();
    });
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-del]'); if (!b) return;
      const a = list.find((x) => x.id === b.dataset.del);
      if (!(await U.confirm('Delete announcement?', `"${a.title}" will be removed for everyone.`, { okLabel: 'Delete', tone: 'danger' }))) return;
      ERP.announcements.remove(a.id);
      U.toast('Announcement deleted');
      U.refresh();
    });
  }

  // Stop the browser from opening a file dropped outside the dropzone.
  ['dragover', 'drop'].forEach((t) => window.addEventListener(t, (e) => { if (!e.target.closest || !e.target.closest('.dropzone')) e.preventDefault(); }));

  // ======================================================================
  U.shell({
    user: me,
    sections: [
      { id: 'dashboard', label: 'Dashboard', title: 'Admin dashboard', icon: 'home', render: renderDashboard },
      { id: 'upload', label: 'Upload Attendance', icon: 'upload', render: renderUpload, badge: () => (pending ? '1' : 0) },
      { id: 'history', label: 'Upload History', icon: 'excel', render: renderHistory },
      { id: 'records', label: 'Attendance Records', icon: 'calendar', render: renderRecords },
      { id: 'staff', label: 'Staff Directory', icon: 'users', render: renderStaff },
      { id: 'announcements', label: 'Announcements', icon: 'megaphone', render: renderAnnouncements },
    ],
  });
})();
