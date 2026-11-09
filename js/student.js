/* Arundhati ERP — Student portal (MBBS). Requires data.js + ui.js + SheetJS. */
(function () {
  const me = ERP.auth.require(['student']);
  if (!me) return;

  const { ui, fmt, util } = ERP;
  const { esc, icon, $, $$ } = ui;
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const TONE_VAR = { ok: '--ok', bad: '--bad', warn: '--warn', info: '--info', accent: '--accent' };

  const now = new Date();
  const view = { year: now.getFullYear(), month: now.getMonth(), attTab: 'calendar' };

  // ---------- helpers ----------
  const pad = (n) => String(n).padStart(2, '0');
  const monthRange = (y, m) => { const last = new Date(y, m + 1, 0).getDate(); return [`${y}-${pad(m + 1)}-01`, `${y}-${pad(m + 1)}-${pad(last)}`]; };
  const minutes = (t) => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const hoursWorked = (r) => { const a = minutes(r.inTime), b = minutes(r.outTime); return (a == null || b == null || b <= a) ? null : b - a; };
  const fmtDur = (mins) => (mins == null ? '—' : `${Math.floor(mins / 60)}h ${pad(mins % 60)}m`);
  const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
  const longDate = (d = new Date()) => `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${FULL_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const nameOf = (empId) => ERP.users.byEmp(empId)?.name || empId;
  const daysLabel = (n) => `${n} day${n === 1 ? '' : 's'}`;
  const latestUpload = () => ERP.attendance.uploads().slice().sort((a, b) => b.at.localeCompare(a.at))[0];

  // ---------- calendar ----------
  function calendarHtml(y, m, { mini = false } = {}) {
    const [from, to] = monthRange(y, m);
    const recs = new Map(ERP.attendance.forEmp(me.empId, from, to).map((r) => [r.date, r]));
    const today = util.today();
    const first = new Date(y, m, 1).getDay();
    const last = new Date(y, m + 1, 0).getDate();
    let cells = DOW.map((d) => `<div class="cal-h">${mini ? d[0] : d}</div>`).join('');
    for (let i = 0; i < first; i++) cells += '<div class="cal-d blank"></div>';
    for (let d = 1; d <= last; d++) {
      const date = `${y}-${pad(m + 1)}-${pad(d)}`;
      const dow = new Date(y, m, d).getDay();
      const r = recs.get(date);
      const cls = ['cal-d'];
      let tip, code = '';
      if (r) {
        const st = ERP.STATUS[r.status];
        cls.push(`s-${r.status}`); code = r.status;
        tip = `${fmt.date(date)} · ${st ? st.label : r.status}`;
        if (r.inTime || r.outTime) tip += `\nIn ${r.inTime || '—'}  ·  Out ${r.outTime || '—'}`;
        const w = hoursWorked(r); if (w != null) tip += `\nOn campus ${fmtDur(w)}`;
      } else if (dow === 0) { cls.push('sun'); tip = `${fmt.date(date)} · Sunday (holiday)`; }
      else if (date > today) { cls.push('future'); tip = `${fmt.date(date)} · Upcoming`; }
      else { cls.push('none'); tip = `${fmt.date(date)} · No record`; }
      if (date === today) cls.push('today');
      if (dow <= 1) cls.push('tip-l'); else if (dow >= 5) cls.push('tip-r');
      cells += `<div class="${cls.join(' ')}" data-tip="${esc(tip)}" aria-label="${esc(tip.replace(/\n/g, ', '))}">${d}${code && !mini ? `<small>${code}</small>` : ''}</div>`;
    }
    return `<div class="cal ${mini ? 'cal-mini' : ''}">${cells}</div>`;
  }
  const legendHtml = () => `<div class="cal-legend">${Object.entries(ERP.STATUS).map(([k, s]) => `<span><i style="background:var(${TONE_VAR[s.tone]})"></i>${k} · ${s.label}</span>`).join('')}<span><i class="cal-d sun" style="aspect-ratio:auto;width:12px;height:12px"></i>Sunday</span></div>`;

  // ---------- student ID card ----------
  function idCard(u) {
    return `<div class="idcard">
        <div class="idcard-top">
          <span class="idcard-mark">${icon('cross', 18)}</span>
          <div class="idcard-inst"><b>Arundhati Institute of Medical Sciences</b><small>Student Identity</small></div>
        </div>
        <div class="idcard-body">
          ${ui.avatar(u.name, 60)}
          <div class="idcard-id">
            <h3>${esc(u.name)}</h3>
            <span class="idcard-prog">${esc(u.designation)}</span>
          </div>
        </div>
        <dl class="idcard-grid">
          <div><dt>Roll No.</dt><dd>${esc(u.rollNo)}</dd></div>
          <div><dt>Batch</dt><dd>${esc(u.batch)}</dd></div>
          <div><dt>Email</dt><dd class="trunc" title="${esc(u.email)}">${esc(u.email)}</dd></div>
          <div><dt>Year</dt><dd>Year ${esc(u.year)}</dd></div>
        </dl>
        <div class="idcard-foot"><span>${esc(ERP.INSTITUTION)}</span><span class="idcard-barcode" aria-hidden="true"></span></div>
      </div>`;
  }

  // ================= DASHBOARD =================
  function renderDashboard(el) {
    const [from, to] = monthRange(now.getFullYear(), now.getMonth());
    const s = ERP.attendance.summaryFor(me.empId, from, to);
    const total = ERP.attendance.forEmp(me.empId).length;
    const anns = ERP.announcements.all().slice(0, 4);
    const pctTone = !s.total ? 'info' : s.percent >= 85 ? 'ok' : s.percent >= 75 ? 'warn' : 'bad';
    const ringColor = `var(${s.percent >= 85 ? '--ok' : s.percent >= 75 ? '--warn' : '--bad'})`;

    el.innerHTML = `
      <div class="hero st-hero">
        <div style="position:relative;z-index:1">
          <p style="margin:0 0 4px;opacity:.85;font-weight:600">${greeting()},</p>
          <h2>${esc(me.name)}</h2>
          <div class="hero-meta">
            <span class="chip">${icon('cap', 14)} ${esc(me.designation)}</span>
            <span class="chip">${icon('id', 14)} Roll ${esc(me.rollNo)}</span>
            <span class="chip">${icon('calendar', 14)} ${esc(longDate())}</span>
          </div>
        </div>
        <div class="st-ring" style="--p:${s.total ? Math.min(100, s.percent) : 0};--rc:${ringColor}">
          <div class="st-ring-in"><b>${s.total ? `${s.percent}%` : '—'}</b><small>${FULL_MONTHS[now.getMonth()].slice(0, 3)} attendance</small></div>
        </div>
      </div>
      <div class="cards">
        ${ui.stat('Attendance this month', s.total ? `${s.percent}%` : '—', { sub: s.total ? `${s.total} marked day${s.total === 1 ? '' : 's'}` : 'No records yet', iconName: 'chart', tone: pctTone })}
        ${ui.stat('Present', s.P + s.OD, { sub: `${s.P} present · ${s.OD} on duty · ${s.HD} half`, iconName: 'check', tone: 'ok' })}
        ${ui.stat('Absences', s.A, { sub: `${s.L} on leave this month`, iconName: 'alert', tone: s.A ? 'bad' : 'info' })}
        ${ui.stat('Total records', total, { sub: total ? 'across all uploaded months' : 'awaiting first upload', iconName: 'calendar', tone: 'accent' })}
      </div>
      <div class="cols">
        <div class="section" style="gap:20px">
          <div class="card">
            <div class="card-head"><div><h3>${FULL_MONTHS[now.getMonth()]} ${now.getFullYear()}</h3><p>Hover a day for details</p></div><a href="#attendance" class="btn btn-ghost btn-sm">Full view</a></div>
            <div class="cal-wrap">${calendarHtml(now.getFullYear(), now.getMonth(), { mini: true })}</div>
            ${legendHtml()}
            ${s.total ? `<div class="pct-block"><div class="row" style="justify-content:space-between"><span class="muted small" style="font-weight:600">Monthly attendance</span><b>${s.percent}%</b></div>${ui.meter(s.percent)}</div>`
              : `<p class="muted small" style="margin:14px 0 0;text-align:center">No attendance has been uploaded for your batch yet.</p>`}
          </div>
          <div class="card">
            <div class="card-head"><div><h3>Announcements</h3><p>From the administration</p></div></div>
            <div class="list">${anns.length ? anns.map((a) => `
              <div class="list-item" style="justify-content:flex-start;align-items:flex-start">
                <span class="ann-icon">${icon('megaphone', 17)}</span>
                <div style="flex:1;min-width:0"><b>${esc(a.title)}</b><p>${esc(a.body)}</p><small class="muted">${esc(nameOf(a.by))} · ${fmt.ago(a.at)}</small></div>
              </div>`).join('') : ui.empty('No announcements', 'megaphone')}</div>
          </div>
        </div>
        <div class="card" style="background:transparent;border:0;box-shadow:none;padding:0">
          ${idCard(me)}
          <div class="card" style="margin-top:20px">
            <div class="card-head"><div><h3>Good to know</h3></div></div>
            <ul class="muted small" style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:7px">
              <li>Your attendance is marked from the biometric / class registers uploaded by the office.</li>
              <li>A minimum of <b>75%</b> attendance is required to sit for university exams.</li>
              <li>Spot an error? Contact your class coordinator or the ERP administrator.</li>
            </ul>
          </div>
        </div>
      </div>`;
  }

  // ================= ATTENDANCE =================
  function monthOptions() {
    const opts = [];
    for (let i = 0; i < 12; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); opts.push([d.getFullYear(), d.getMonth()]); }
    const first = ERP.attendance.forEmp(me.empId)[0];
    if (first) {
      const [fy, fm] = first.date.split('-').map(Number);
      let d = new Date(opts[opts.length - 1][0], opts[opts.length - 1][1] - 1, 1);
      while (d >= new Date(fy, fm - 1, 1)) { opts.push([d.getFullYear(), d.getMonth()]); d = new Date(d.getFullYear(), d.getMonth() - 1, 1); }
    }
    return opts;
  }

  function renderAttendance(el) {
    const opts = monthOptions();
    const idx = opts.findIndex(([y, m]) => y === view.year && m === view.month);
    const { year: y, month: m } = view;
    const [from, to] = monthRange(y, m);
    const rows = ERP.attendance.forEmp(me.empId, from, to);
    const s = ERP.attendance.summarize(rows);
    const up = latestUpload();

    el.innerHTML = `
      <div class="card" style="padding:14px 18px">
        <div class="row" style="justify-content:space-between">
          <div class="month-nav">
            <button class="icon-btn" data-step="1" aria-label="Previous month" ${idx >= opts.length - 1 ? 'disabled' : ''}><svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg></button>
            <select aria-label="Month">${opts.map(([oy, om], i) => `<option value="${i}" ${i === idx ? 'selected' : ''}>${FULL_MONTHS[om]} ${oy}</option>`).join('')}</select>
            <button class="icon-btn" data-step="-1" aria-label="Next month" ${idx <= 0 ? 'disabled' : ''}><svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg></button>
          </div>
          <div class="tabs" role="tablist">
            <button data-tab="calendar" class="${view.attTab === 'calendar' ? 'active' : ''}">Calendar</button>
            <button data-tab="list" class="${view.attTab === 'list' ? 'active' : ''}">List</button>
          </div>
        </div>
      </div>
      ${up ? `<div class="banner banner-info">${icon('clock', 18)}<div><b>Last updated from upload on ${fmt.dateTime(up.at)}</b><span class="small">${esc(up.fileName)}${up.from ? ` · covers ${fmt.date(up.from)} – ${fmt.date(up.to)}` : ''}</span></div></div>` : ''}
      ${rows.length && s.percent < 75 ? `<div class="banner banner-bad">${icon('alert', 18)}<div><b>Attendance below 75% for ${FULL_MONTHS[m]} ${y}</b><span class="small">You are at ${s.percent}%. A minimum of 75% is required to be eligible for exams. Please contact your class coordinator if any records look incorrect.</span></div></div>` : ''}
      <div class="cols">
        <div class="card" id="att-main"></div>
        <div class="card">
          <div class="card-head"><div><h3>Month summary</h3><p>${FULL_MONTHS[m]} ${y}</p></div></div>
          ${rows.length ? `<div id="att-donut"></div>
            <div class="pct-block">
              <div class="row" style="justify-content:space-between;align-items:flex-end"><span class="muted small" style="font-weight:600">Attendance</span><span class="pct-big" style="color:var(${s.percent >= 85 ? '--ok' : s.percent >= 75 ? '--warn' : '--bad'})">${s.percent}%</span></div>
              ${ui.meter(s.percent)}
              <span class="muted small">(Present + On duty + ½ × Half day) ÷ (marked days − leave). Minimum required: 75%.</span>
            </div>` : ui.empty('No attendance records for this month yet.', 'calendar')}
        </div>
      </div>`;

    const go = (i) => { if (i < 0 || i >= opts.length) return; [view.year, view.month] = opts[i]; ui.refresh(); };
    $$('[data-step]', el).forEach((b) => b.onclick = () => go(idx + Number(b.dataset.step)));
    $('select', el).onchange = (e) => go(Number(e.target.value));
    $$('[data-tab]', el).forEach((b) => b.onclick = () => { view.attTab = b.dataset.tab; $$('[data-tab]', el).forEach((x) => x.classList.toggle('active', x === b)); drawMain(); });

    if (rows.length) ui.donut($('#att-donut', el), Object.entries(ERP.STATUS).map(([k, st]) => ({ label: st.label, value: s[k] || 0, tone: st.tone })), `${s.percent}%`);

    function drawMain() {
      const box = $('#att-main', el);
      box.classList.remove('fade-in'); void box.offsetWidth; box.classList.add('fade-in');
      if (view.attTab === 'calendar') {
        box.innerHTML = `<div class="card-head"><div><h3>${FULL_MONTHS[m]} ${y}</h3><p>Hover or tap a day to see status and timings</p></div></div>
          <div class="cal-wrap">${calendarHtml(y, m)}</div>${legendHtml()}
          ${rows.length ? '' : `<p class="muted small" style="margin:14px 0 0;text-align:center">No records for this month${from > util.today() ? ' — it hasn\'t started yet' : ''}.</p>`}`;
        return;
      }
      box.innerHTML = '<div class="card-head"><div><h3>Daily records</h3><p>' + daysLabel(rows.length) + ' recorded</p></div></div><div id="att-table"></div>';
      const tableRows = rows.slice().reverse();
      ui.table($('#att-table', box), {
        columns: [
          { key: 'date', label: 'Date', render: (r) => `<b>${fmt.date(r.date)}</b>` },
          { key: 'day', label: 'Day', render: (r) => DOW[util.parseISO(r.date).getDay()], sort: (r) => util.parseISO(r.date).getDay() },
          { key: 'status', label: 'Status', render: (r) => `${ui.statusBadge(r.status)} <span class="muted small">${esc(ERP.STATUS[r.status]?.label || '')}</span>` },
          { key: 'inTime', label: 'In', render: (r) => esc(r.inTime || '—') },
          { key: 'outTime', label: 'Out', render: (r) => esc(r.outTime || '—') },
          { key: 'hours', label: 'Hours', align: 'right', render: (r) => fmtDur(hoursWorked(r)), sort: (r) => hoursWorked(r) ?? -1 },
        ],
        rows: tableRows, pageSize: 10,
        emptyText: 'No records for this month',
        toolbar: `<button class="btn btn-ghost btn-sm" data-export ${rows.length ? '' : 'disabled'}>${icon('excel', 16)} Export to Excel</button>`,
      });
      const ex = $('[data-export]', box);
      if (ex) ex.onclick = () => {
        ui.downloadXlsx(`Attendance_${me.rollNo}_${y}-${pad(m + 1)}.xlsx`,
          ['Roll No', 'Name', 'Date', 'Day', 'Status', 'In Time', 'Out Time', 'Hours'],
          rows.map((r) => [me.rollNo, me.name, r.date, DOW[util.parseISO(r.date).getDay()], ERP.STATUS[r.status]?.label || r.status, r.inTime, r.outTime, hoursWorked(r) == null ? '' : +(hoursWorked(r) / 60).toFixed(2)]),
          `${FULL_MONTHS[m].slice(0, 3)} ${y}`);
        ui.toast('Attendance exported');
      };
    }
    drawMain();
  }

  // ================= PROFILE =================
  function renderProfile(el) {
    const u = ERP.users.byEmp(me.empId);
    const all = ERP.attendance.forEmp(me.empId);
    const overall = ERP.attendance.summarize(all);
    el.innerHTML = `
      <div class="cols">
        <div class="section" style="gap:20px">
          ${idCard(u)}
          <div class="card">
            <div class="card-head"><div><h3>Student details</h3></div><span class="badge badge-accent">${esc(ui.ROLE_LABEL[u.role])}</span></div>
            <dl class="kv">
              <dt>Full name</dt><dd>${esc(u.name)}</dd>
              <dt>Roll number</dt><dd><code>${esc(u.rollNo)}</code></dd>
              <dt>Programme</dt><dd>${esc(u.designation)}</dd>
              <dt>Batch</dt><dd>${esc(u.batch)}</dd>
              <dt>Academic year</dt><dd>Year ${esc(u.year)}</dd>
              <dt>College email</dt><dd><a href="mailto:${esc(u.email)}">${esc(u.email)}</a></dd>
              <dt>Overall attendance</dt><dd>${all.length ? `${overall.percent}% <span class="muted small">· ${all.length} day${all.length === 1 ? '' : 's'} on record</span>` : '<span class="muted">No records yet</span>'}</dd>
              <dt>Login (email)</dt><dd><code>${esc(u.username)}</code></dd>
            </dl>
            <p class="muted small" style="margin:18px 0 0">To correct any of these details, please contact the ERP administrator or your class coordinator.</p>
          </div>
        </div>
        <form class="card" id="pw-form" novalidate>
          <div class="card-head"><div><h3>Change password</h3><p>Use at least 6 characters</p></div></div>
          <div id="pw-error"></div>
          <label class="field" data-f="cur"><span>Current password</span><div class="pw-wrap"><input type="password" name="cur" autocomplete="current-password"><button type="button" data-show>Show</button></div></label>
          <label class="field" data-f="next"><span>New password</span><div class="pw-wrap"><input type="password" name="next" autocomplete="new-password"><button type="button" data-show>Show</button></div></label>
          <div class="pw-strength"><div></div></div>
          <label class="field" data-f="confirm"><span>Confirm new password</span><div class="pw-wrap"><input type="password" name="confirm" autocomplete="new-password"><button type="button" data-show>Show</button></div></label>
          <button class="btn btn-primary btn-block" type="submit">${icon('check', 16)} Update password</button>
          <p class="muted small" style="margin:12px 0 0">Your first-time password is your roll number — change it to something only you know.</p>
        </form>
      </div>`;

    const form = $('#pw-form', el), f = form.elements, err = $('#pw-error', el);
    $$('[data-show]', form).forEach((b) => b.onclick = () => { const i = b.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; b.textContent = i.type === 'password' ? 'Show' : 'Hide'; });
    const clear = () => { err.innerHTML = ''; $$('.field.err', form).forEach((x) => x.classList.remove('err')); };
    const fail = (msg, field) => { err.innerHTML = `<div class="form-error">${icon('alert', 16)}<span>${esc(msg)}</span></div>`; $(`[data-f="${field}"]`, form).classList.add('err'); ui.toast(msg, 'bad'); };
    form.addEventListener('input', () => {
      clear();
      const v = f.next.value;
      let score = 0; if (v.length >= 6) score++; if (v.length >= 10) score++; if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++; if (/\d/.test(v)) score++; if (/[^A-Za-z0-9]/.test(v)) score++;
      const bar = $('.pw-strength div', form);
      bar.style.width = v ? `${Math.max(12, score * 20)}%` : '0';
      bar.style.background = `var(${score <= 1 ? '--bad' : score <= 3 ? '--warn' : '--ok'})`;
    });
    form.onsubmit = (e) => {
      e.preventDefault(); clear();
      const cur = ERP.users.byEmp(me.empId);
      if (f.cur.value !== cur.password) return fail('Current password is incorrect', 'cur');
      if (f.next.value.length < 6) return fail('New password must be at least 6 characters', 'next');
      if (f.next.value === f.cur.value) return fail('New password must differ from the current one', 'next');
      if (f.next.value !== f.confirm.value) return fail('Passwords do not match', 'confirm');
      ERP.users.update(me.empId, { password: f.next.value });
      form.reset(); $('.pw-strength div', form).style.width = '0';
      ui.toast('Password updated successfully');
    };
  }

  // ================= SHELL =================
  ui.shell({
    user: me,
    sections: [
      { id: 'dashboard', label: 'Dashboard', icon: 'home', render: renderDashboard },
      { id: 'attendance', label: 'My Attendance', icon: 'calendar', render: renderAttendance },
      { id: 'profile', label: 'Profile', icon: 'id', render: renderProfile },
    ],
  });
})();
