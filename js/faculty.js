/* Arundhati ERP — Faculty / Staff portal. */
(function () {
  const me = ERP.auth.require(['faculty']);
  if (!me) return;

  const { ui, fmt, util, LEAVE_STATE } = ERP;
  const { esc, icon, $, $$ } = ui;
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const PENDING = [LEAVE_STATE.PENDING_HOD, LEAVE_STATE.PENDING_PRINCIPAL];
  const TONE_VAR = { ok: '--ok', bad: '--bad', warn: '--warn', info: '--info', accent: '--accent' };

  // Page state that survives section re-renders.
  const now = new Date();
  const view = { year: now.getFullYear(), month: now.getMonth(), attTab: 'calendar', leaveFilter: 'all', preset: null };

  // ---------- helpers ----------
  const pad = (n) => String(n).padStart(2, '0');
  const monthRange = (y, m) => {
    const last = new Date(y, m + 1, 0).getDate();
    return [`${y}-${pad(m + 1)}-01`, `${y}-${pad(m + 1)}-${pad(last)}`];
  };
  const minutes = (t) => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const hoursWorked = (r) => {
    const a = minutes(r.inTime), b = minutes(r.outTime);
    if (a == null || b == null || b <= a) return null;
    return b - a;
  };
  const fmtDur = (mins) => (mins == null ? '—' : `${Math.floor(mins / 60)}h ${pad(mins % 60)}m`);
  const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const longDate = (d = new Date()) => `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${FULL_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const nameOf = (empId) => ERP.users.byEmp(empId)?.name || empId;
  const hod = () => ERP.users.hodOf(me.dept);
  const principal = () => ERP.users.all().find((u) => u.role === 'principal');
  const pendingCount = () => ERP.leaves.forEmp(me.empId).filter((l) => PENDING.includes(l.status)).length;
  const daysLabel = (n) => `${n} day${n === 1 ? '' : 's'}`;
  const dateSpan = (l) => (l.from === l.to ? fmt.date(l.from) : `${fmt.date(l.from)} – ${fmt.date(l.to)}`);
  const latestUpload = () => ERP.attendance.uploads().slice().sort((a, b) => b.at.localeCompare(a.at))[0];

  // ---------- calendar ----------
  /* Renders a month grid. Returns HTML. mini = compact (no status code text). */
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
        const w = hoursWorked(r); if (w != null) tip += `\nWorked ${fmtDur(w)}`;
      } else if (dow === 0) {
        cls.push('sun'); tip = `${fmt.date(date)} · Sunday (holiday)`;
      } else if (date > today) {
        cls.push('future'); tip = `${fmt.date(date)} · Upcoming`;
      } else {
        cls.push('none'); tip = `${fmt.date(date)} · No record uploaded`;
      }
      if (date === today) cls.push('today');
      if (dow <= 1) cls.push('tip-l'); else if (dow >= 5) cls.push('tip-r');
      cells += `<div class="${cls.join(' ')}" data-tip="${esc(tip)}" aria-label="${esc(tip.replace(/\n/g, ', '))}">${d}${code && !mini ? `<small>${code}</small>` : ''}</div>`;
    }
    return `<div class="cal ${mini ? 'cal-mini' : ''}">${cells}</div>`;
  }
  const legendHtml = () => `<div class="cal-legend">${Object.entries(ERP.STATUS).map(([k, s]) => `<span><i style="background:var(${TONE_VAR[s.tone]})"></i>${k} · ${s.label}</span>`).join('')}<span><i class="cal-d sun" style="aspect-ratio:auto;width:12px;height:12px"></i>Sunday</span></div>`;

  // ================= DASHBOARD =================
  function renderDashboard(el) {
    const [from, to] = monthRange(now.getFullYear(), now.getMonth());
    const s = ERP.attendance.summaryFor(me.empId, from, to);
    const bal = ERP.leaves.balance(me.empId);
    const cl = bal.find((b) => b.code === 'CL');
    const clAvail = cl.remaining - cl.pending;
    const pctTone = !s.total ? 'info' : s.percent >= 85 ? 'ok' : s.percent >= 75 ? 'warn' : 'bad';
    const myLeaves = ERP.leaves.forEmp(me.empId).slice(0, 5);
    const anns = ERP.announcements.all().slice(0, 4);
    const pend = pendingCount();

    el.innerHTML = `
      <div class="hero fx-hero">
        <div style="position:relative;z-index:1">
          <p style="margin:0 0 4px;opacity:.8;font-weight:600">${greeting()},</p>
          <h2>${esc(me.name)}</h2>
          <div class="hero-meta">
            <span class="chip">${icon('user', 14)} ${esc(me.designation)}</span>
            <span class="chip">${icon('building', 14)} ${esc(fmt.deptName(me.dept))}</span>
            <span class="chip">${icon('calendar', 14)} ${esc(longDate())}</span>
          </div>
        </div>
        <button class="btn btn-hero" data-go="apply">${icon('plus', 18)} Apply for leave</button>
      </div>
      <div class="cards">
        ${ui.stat('Attendance this month', s.total ? `${s.percent}%` : '—', { sub: s.total ? `${FULL_MONTHS[now.getMonth()]} · ${s.total} marked days` : 'No records yet this month', iconName: 'chart', tone: pctTone })}
        ${ui.stat('Present days', s.P + s.OD, { sub: `${s.P} present · ${s.OD} on duty · ${s.HD} half`, iconName: 'check', tone: 'ok' })}
        ${ui.stat('Absences', s.A, { sub: `${s.L} on leave this month`, iconName: 'alert', tone: s.A ? 'bad' : 'info' })}
        ${ui.stat('Casual leave left', `${clAvail}<small class="muted" style="font-size:14px;font-weight:600"> / ${cl.quota}</small>`, { sub: cl.pending ? `${cl.pending} pending approval` : `${cl.used} used this year`, iconName: 'leave', tone: 'accent' })}
      </div>
      <div class="cols">
        <div class="section" style="gap:20px">
          <div class="card">
            <div class="card-head"><div><h3>Recent leave requests</h3><p>${pend ? `${pend} awaiting approval` : 'Your latest applications'}</p></div><a href="#leaves" class="btn btn-ghost btn-sm">View all</a></div>
            <div class="list" id="dash-leaves">${myLeaves.length ? myLeaves.map((l) => `
              <div class="list-item click" data-leave="${l.id}">
                <div><b>${esc(fmt.leaveName(l.type))}</b> <span class="muted small">· ${daysLabel(l.days)}</span><p>${dateSpan(l)}</p></div>
                ${ui.leaveBadge(l.status)}
              </div>`).join('') : `${ui.empty('No leave requests yet', 'leave')}<div style="text-align:center"><button class="btn btn-primary btn-sm" data-go="apply">${icon('plus', 16)} Apply now</button></div>`}</div>
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
        <div class="card">
          <div class="card-head"><div><h3>${FULL_MONTHS[now.getMonth()]} ${now.getFullYear()}</h3><p>Hover a day for details</p></div><a href="#attendance" class="btn btn-ghost btn-sm">Full view</a></div>
          <div class="cal-wrap">${calendarHtml(now.getFullYear(), now.getMonth(), { mini: true })}</div>
          ${legendHtml()}
          ${s.total ? `<div class="pct-block"><div class="row" style="justify-content:space-between"><span class="muted small" style="font-weight:600">Monthly attendance</span><b>${s.percent}%</b></div>${ui.meter(s.percent)}</div>` : ''}
        </div>
      </div>`;

    $$('[data-go]', el).forEach((b) => b.onclick = () => ui.go(b.dataset.go));
    $$('[data-leave]', el).forEach((r) => r.onclick = () => openLeave(r.dataset.leave));
  }

  // ================= ATTENDANCE =================
  function monthOptions() {
    // Last 12 months up to the current one (plus any older month that has data).
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
    const mineUp = rows.length ? ERP.attendance.uploads().find((u) => u.id === rows[rows.length - 1].uploadId) : null;

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
      ${up ? `<div class="banner banner-info">${icon('clock', 18)}<div><b>Last updated from upload on ${fmt.dateTime(up.at)}</b><span class="small">${esc(up.fileName)}${up.from ? ` · covers ${fmt.date(up.from)} – ${fmt.date(up.to)}` : ''}${mineUp && mineUp.id !== up.id ? ` · this month's data from “${esc(mineUp.fileName)}”` : ''}</span></div></div>` : ''}
      ${rows.length && s.percent < 75 ? `<div class="banner banner-bad">${icon('alert', 18)}<div><b>Attendance below 75% for ${FULL_MONTHS[m]} ${y}</b><span class="small">You are at ${s.percent}%. The institution requires a minimum of 75%. Please contact your HOD if any records look incorrect.</span></div></div>` : ''}
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

    if (rows.length) {
      ui.donut($('#att-donut', el), Object.entries(ERP.STATUS).map(([k, st]) => ({ label: st.label, value: s[k] || 0, tone: st.tone })), `${s.percent}%`);
    }

    function drawMain() {
      const box = $('#att-main', el);
      box.classList.remove('fade-in'); void box.offsetWidth; box.classList.add('fade-in');
      if (view.attTab === 'calendar') {
        box.innerHTML = `<div class="card-head"><div><h3>${FULL_MONTHS[m]} ${y}</h3><p>Hover or tap a day to see status and punch times</p></div></div>
          <div class="cal-wrap">${calendarHtml(y, m)}</div>${legendHtml()}
          ${rows.length ? '' : `<p class="muted small" style="margin:14px 0 0;text-align:center">No records uploaded for this month${from > util.today() ? ' — it hasn\'t started yet' : ''}.</p>`}`;
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
        ui.downloadXlsx(`Attendance_${me.empId}_${y}-${pad(m + 1)}.xlsx`,
          ['Employee ID', 'Name', 'Date', 'Day', 'Status', 'In Time', 'Out Time', 'Hours Worked'],
          rows.map((r) => [me.empId, me.name, r.date, DOW[util.parseISO(r.date).getDay()], ERP.STATUS[r.status]?.label || r.status, r.inTime, r.outTime, hoursWorked(r) == null ? '' : +(hoursWorked(r) / 60).toFixed(2)]),
          `${FULL_MONTHS[m].slice(0, 3)} ${y}`);
        ui.toast('Attendance exported');
      };
    }
    drawMain();
  }

  // ================= APPLY LEAVE =================
  function renderApply(el) {
    const bal = ERP.leaves.balance(me.empId);
    const avail = (b) => (b.quota == null ? Infinity : b.remaining - b.pending);
    const h = hod(), p = principal();
    const preset = view.preset || {}; view.preset = null;
    const firstType = preset.type || (bal.find((b) => avail(b) > 0) || bal[0]).code;
    const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); if (d.getDay() === 0) d.setDate(d.getDate() + 1); return util.iso(d); })();

    el.innerHTML = `
      <div class="card">
        <div class="card-head"><div><h3>Your leave balance · ${now.getFullYear()}</h3><p>Click a card to choose that leave type</p></div></div>
        <div class="bal-grid">${bal.map((b) => {
          const a = avail(b);
          const pct = b.quota ? ((b.used + b.pending) / b.quota) * 100 : 0;
          return `<div class="bal-card" data-type="${b.code}" tabindex="0" role="button" aria-label="${esc(b.name)}">
            <div class="row" style="justify-content:space-between"><span class="code">${b.code}</span>${b.quota == null ? '<span class="badge badge-muted">No cap</span>' : a <= 0 ? '<span class="badge badge-bad">Exhausted</span>' : ''}</div>
            <div><div class="muted small" style="font-weight:600">${esc(b.name)}</div>
            <div class="big">${b.quota == null ? '∞' : a}${b.quota == null ? '' : `<small> / ${b.quota} left</small>`}</div></div>
            ${b.quota == null ? '<div class="meter"><div style="width:0"></div></div>' : ui.meter(100 - pct, pct >= 90 ? 'bad' : pct >= 60 ? 'warn' : 'ok')}
            <div class="nums"><span>Used <b>${b.used}</b></span><span>Pending <b>${b.pending}</b></span></div>
          </div>`;
        }).join('')}</div>
      </div>
      <div class="cols">
        <form class="card" id="leave-form" novalidate>
          <div class="card-head"><div><h3>Leave application</h3><p>Sundays are excluded automatically</p></div></div>
          <div id="form-error"></div>
          <label class="field" data-f="type"><span>Leave type</span>
            <select name="type">${bal.map((b) => `<option value="${b.code}" ${b.code === firstType ? 'selected' : ''} ${b.quota != null && avail(b) <= 0 ? 'disabled' : ''}>${esc(b.name)} (${b.code}) — ${b.quota == null ? 'no limit' : `${avail(b)} of ${b.quota} remaining`}</option>`).join('')}</select>
          </label>
          <div class="grid-2">
            <label class="field" data-f="from"><span>From</span><input type="date" name="from" value="${preset.from || tomorrow}"></label>
            <label class="field" data-f="to"><span>To</span><input type="date" name="to" value="${preset.to || preset.from || tomorrow}"></label>
          </div>
          <label class="check" id="hd-wrap"><input type="checkbox" name="halfDay"> Half day <span class="muted small" style="font-weight:500">(only for single-day leave)</span></label>
          <div class="daycount" id="daycount"><span class="n">0</span><div><b id="dc-label">working days</b><small id="dc-sub"></small></div></div>
          <label class="field" data-f="reason"><span>Reason</span><textarea name="reason" rows="4" maxlength="500" placeholder="Briefly describe the reason for your leave">${esc(preset.reason || '')}</textarea></label>
          <div class="counter" id="counter">0 / 500</div>
          <div class="row" style="justify-content:flex-end">
            <button type="reset" class="btn btn-ghost">Clear</button>
            <button type="submit" class="btn btn-primary">${icon('check', 16)} Submit application</button>
          </div>
        </form>
        <div class="section" style="gap:20px">
          <div class="card">
            <div class="card-head"><div><h3>Approval route</h3><p>Your request moves through these steps</p></div></div>
            <div class="route">
              <div class="step">${ui.avatar(me.name, 28)}<div><b>You</b><small>Apply</small></div></div><span class="arrow">→</span>
              <div class="step">${ui.avatar(h ? h.name : 'HOD', 28)}<div><b>HOD${h ? ` (${esc(h.name)})` : ''}</b><small>Recommend</small></div></div><span class="arrow">→</span>
              <div class="step">${ui.avatar(p ? p.name : 'Principal', 28)}<div><b>Principal</b><small>${p ? esc(p.name) : 'Final approval'}</small></div></div>
            </div>
          </div>
          <div class="card">
            <div class="card-head"><div><h3>Good to know</h3></div></div>
            <ul class="muted small" style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px">
              <li>Pending requests count against your balance until decided.</li>
              <li>Half day uses 0.5 of the selected leave type.</li>
              <li>You can cancel a request while it is still pending.</li>
              <li>On Duty (OD) is for conferences, camps and official work.</li>
            </ul>
          </div>
        </div>
      </div>`;

    const form = $('#leave-form', el);
    const f = form.elements;
    const hdWrap = $('#hd-wrap', el);
    const errBox = $('#form-error', el);
    const clearErr = () => { errBox.innerHTML = ''; $$('.field.err', form).forEach((x) => x.classList.remove('err')); };
    const showErr = (msg, field) => {
      errBox.innerHTML = `<div class="form-error">${icon('alert', 16)}<span>${esc(msg)}</span></div>`;
      if (field) $(`[data-f="${field}"]`, form)?.classList.add('err');
    };

    let lastN = null;
    function update() {
      const from = f.from.value, to = f.to.value;
      if (from && (!to || to < from)) f.to.value = from;
      f.to.min = from || '';
      const single = from && from === f.to.value && !util.isSunday(from);
      f.halfDay.disabled = !single; if (!single) f.halfDay.checked = false;
      hdWrap.classList.toggle('disabled', !single);
      const b = bal.find((x) => x.code === f.type.value);
      let n = 0, sub = '';
      if (from && f.to.value) {
        const wd = util.workingDays(from, f.to.value).length;
        const total = util.daysBetween(from, f.to.value).length;
        n = f.halfDay.checked ? 0.5 : wd;
        sub = `${fmt.date(from)}${from !== f.to.value ? ` → ${fmt.date(f.to.value)}` : ''}${total - wd ? ` · ${total - wd} Sunday${total - wd > 1 ? 's' : ''} excluded` : ''}`;
      }
      const a = avail(b);
      const over = b.quota != null && n > a;
      $('#daycount', el).classList.toggle('over', over);
      const nEl = $('#daycount .n', el);
      nEl.textContent = n;
      if (lastN !== null && lastN !== n) { nEl.classList.add('bump'); setTimeout(() => nEl.classList.remove('bump'), 180); }
      lastN = n;
      $('#dc-label', el).textContent = `working day${n === 1 ? '' : 's'}${f.halfDay.checked ? ' (half day)' : ''}`;
      $('#dc-sub', el).textContent = over ? `Exceeds your ${b.code} balance of ${a}` : (sub || 'Pick your dates');
      $$('.bal-card', el).forEach((c) => c.classList.toggle('sel', c.dataset.type === f.type.value));
      const len = f.reason.value.length, c = $('#counter', el);
      c.textContent = `${len} / 500${len && len < 5 ? ' · at least 5 characters' : ''}`;
      c.className = `counter ${len > 450 ? 'warn' : ''} ${len && len < 5 ? 'bad' : ''}`;
    }
    form.addEventListener('input', () => { clearErr(); update(); });
    form.addEventListener('change', update);
    form.addEventListener('reset', () => setTimeout(() => { clearErr(); update(); }, 0));
    $$('.bal-card', el).forEach((c) => {
      const pick = () => {
        const opt = $(`option[value="${c.dataset.type}"]`, f.type);
        if (opt.disabled) return ui.toast(`No ${c.dataset.type} balance left`, 'bad');
        f.type.value = c.dataset.type; update(); f.type.focus();
      };
      c.onclick = pick; c.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } };
    });

    form.onsubmit = (e) => {
      e.preventDefault(); clearErr();
      if (!f.from.value) return showErr('Choose a start date', 'from');
      if (!f.to.value) return showErr('Choose an end date', 'to');
      try {
        const l = ERP.leaves.apply({ empId: me.empId, type: f.type.value, from: f.from.value, to: f.to.value, reason: f.reason.value, halfDay: f.halfDay.checked });
        ui.toast(`${l.type} leave for ${daysLabel(l.days)} submitted to ${l.status === LEAVE_STATE.PENDING_HOD ? 'HOD' : 'Principal'}`);
        view.leaveFilter = 'all';
        ui.go('leaves');
      } catch (err) {
        const msg = err.message || String(err);
        const field = /reason/i.test(msg) ? 'reason' : /balance/i.test(msg) ? 'type' : /date|range|overlap|working/i.test(msg) ? 'from' : null;
        showErr(msg, field);
        ui.toast(msg, 'bad');
      }
    };
    update();
  }

  // ================= MY LEAVES =================
  const FILTERS = [
    { id: 'all', label: 'All', test: () => true },
    { id: 'pending', label: 'Pending', test: (l) => PENDING.includes(l.status) },
    { id: 'approved', label: 'Approved', test: (l) => l.status === LEAVE_STATE.APPROVED },
    { id: 'rejected', label: 'Rejected', test: (l) => l.status === LEAVE_STATE.REJECTED },
  ];

  function renderLeaves(el) {
    const all = ERP.leaves.forEmp(me.empId);
    el.innerHTML = `
      <div class="card">
        <div class="leave-tabs">
          <div class="tabs" role="tablist">${FILTERS.map((x) => `<button data-filter="${x.id}" class="${view.leaveFilter === x.id ? 'active' : ''}">${x.label}<em>${all.filter(x.test).length}</em></button>`).join('')}</div>
          <button class="btn btn-primary btn-sm" data-new>${icon('plus', 16)} Apply for leave</button>
        </div>
        <div id="leave-table"></div>
      </div>`;
    const box = $('#leave-table', el);
    const filtered = () => all.filter(FILTERS.find((x) => x.id === view.leaveFilter).test);
    const t = ui.table(box, {
      columns: [
        { key: 'type', label: 'Type', render: (l) => `<b>${l.type}</b> <span class="muted small">${esc(fmt.leaveName(l.type))}</span>` },
        { key: 'from', label: 'Dates', render: (l) => `${dateSpan(l)}${l.halfDay ? ' <span class="badge badge-info">½</span>' : ''}` },
        { key: 'days', label: 'Days', align: 'right' },
        { key: 'status', label: 'Status', render: (l) => ui.leaveBadge(l.status) },
        { key: 'appliedAt', label: 'Applied', render: (l) => `<span title="${fmt.dateTime(l.appliedAt)}">${fmt.date(l.appliedAt)}</span>` },
        { key: 'id', label: '', noSort: true, align: 'right', render: (l) => `<button class="btn btn-ghost btn-sm" data-view="${l.id}">View</button>` },
      ],
      rows: filtered(), pageSize: 10,
      search: (l) => `${l.type} ${fmt.leaveName(l.type)} ${l.reason} ${l.status} ${l.from} ${l.to}`,
      emptyText: view.leaveFilter === 'all' ? 'You have not applied for any leave yet' : `No ${view.leaveFilter} requests`,
    });
    const markRows = () => $$('tbody tr', box).forEach((tr) => { if ($('[data-view]', tr)) tr.classList.add('clickable'); });
    markRows();
    box.addEventListener('click', (e) => {
      const tr = e.target.closest('tbody tr'); if (!tr) return;
      const b = $('[data-view]', tr); if (b) openLeave(b.dataset.view);
    });
    new MutationObserver(markRows).observe($('tbody', box), { childList: true });
    $$('[data-filter]', el).forEach((b) => b.onclick = () => {
      view.leaveFilter = b.dataset.filter;
      $$('[data-filter]', el).forEach((x) => x.classList.toggle('active', x === b));
      t.setRows(filtered());
    });
    $('[data-new]', el).onclick = () => ui.go('apply');
  }

  function openLeave(id) {
    const l = ERP.leaves.byId(id);
    if (!l) return ui.toast('Leave not found', 'bad');
    const h = hod(), p = principal();
    const toneOf = (a) => (a === 'Approved' ? 'ok' : a === 'Rejected' ? 'bad' : a === 'Cancelled' ? 'bad' : '');
    const steps = [`<li><b>Applied</b><p>${esc(me.name)} submitted the request</p><small>${fmt.dateTime(l.appliedAt)}</small></li>`];
    l.history.forEach((x) => {
      const who = x.role === 'self' ? 'You' : `${nameOf(x.by)} (${x.role === 'hod' ? 'HOD' : x.role === 'principal' ? 'Principal' : x.role})`;
      steps.push(`<li class="${toneOf(x.action)}"><b>${esc(x.action)}</b><p>by ${esc(who)}</p><small>${fmt.dateTime(x.at)}</small>${x.remark ? `<div class="remark">“${esc(x.remark)}”</div>` : ''}</li>`);
    });
    if (l.status === LEAVE_STATE.PENDING_HOD) {
      steps.push(`<li class="wait"><b>Awaiting HOD recommendation</b><p>${esc(h ? h.name : 'Head of Department')}</p></li>`);
      steps.push(`<li class="pend"><b>Principal approval</b><p>${esc(p ? p.name : 'Principal')}</p></li>`);
    } else if (l.status === LEAVE_STATE.PENDING_PRINCIPAL) {
      steps.push(`<li class="wait"><b>Awaiting Principal approval</b><p>${esc(p ? p.name : 'Principal')}</p></li>`);
    }
    const body = `
      <div class="row" style="justify-content:space-between;margin-bottom:16px"><div><div class="muted small" style="font-weight:600">${esc(l.id)}</div><h2>${esc(fmt.leaveName(l.type))}</h2></div>${ui.leaveBadge(l.status)}</div>
      <dl class="kv">
        <dt>Dates</dt><dd>${dateSpan(l)}</dd>
        <dt>Duration</dt><dd>${daysLabel(l.days)}${l.halfDay ? ' (half day)' : ''}</dd>
        <dt>Applied on</dt><dd>${fmt.dateTime(l.appliedAt)}</dd>
        <dt>Reason</dt><dd style="white-space:pre-wrap">${esc(l.reason)}</dd>
      </dl>
      <h3 style="margin:22px 0 14px">Approval timeline</h3>
      <ol class="timeline">${steps.join('')}</ol>`;
    const actions = [{ label: 'Close', tone: 'ghost' }];
    if (PENDING.includes(l.status)) {
      actions.unshift({
        label: 'Cancel request', tone: 'danger',
        onClick: (close) => {
          ui.confirm('Cancel this leave request?', `Your ${fmt.leaveName(l.type)} for ${dateSpan(l)} will be withdrawn. This cannot be undone.`, { okLabel: 'Yes, cancel it', tone: 'danger' })
            .then((ok) => {
              if (!ok) return;
              try { ERP.leaves.cancel(l.id, me.empId); close(); ui.toast('Leave request cancelled'); ui.refresh(); }
              catch (err) { ui.toast(err.message, 'bad'); }
            });
          return false;
        },
      });
    }
    ui.modal({ title: 'Leave request', body, actions, wide: false });
  }

  // ================= PROFILE =================
  function renderProfile(el) {
    const u = ERP.users.byEmp(me.empId);
    const h = hod();
    const years = u.joinDate ? (Date.now() - util.parseISO(u.joinDate).getTime()) / (365.25 * 86400000) : null;
    el.innerHTML = `
      <div class="cols">
        <div class="card">
          <div class="profile-head">${ui.avatar(u.name, 72)}<div><h2>${esc(u.name)}</h2><p class="muted" style="margin:4px 0 8px">${esc(u.designation)} · ${esc(fmt.deptName(u.dept))}</p><span class="badge badge-accent">${esc(ui.ROLE_LABEL[u.role])}</span></div></div>
          <dl class="kv">
            <dt>Employee ID</dt><dd><code>${esc(u.empId)}</code></dd>
            <dt>Department</dt><dd>${esc(fmt.deptName(u.dept))} (${esc(u.dept)})</dd>
            <dt>Designation</dt><dd>${esc(u.designation)}</dd>
            <dt>Email</dt><dd>${u.email ? `<a href="mailto:${esc(u.email)}">${esc(u.email)}</a>` : '—'}</dd>
            <dt>Phone</dt><dd>${esc(u.phone || '—')}</dd>
            <dt>Joined</dt><dd>${fmt.date(u.joinDate)}${years == null ? '' : ` <span class="muted small">· ${years >= 1 ? `${Math.floor(years)} yr${Math.floor(years) > 1 ? 's' : ''} of service` : 'less than a year'}</span>`}</dd>
            <dt>Timings</dt><dd>${esc(u.timings || '—')}</dd>
            <dt>Reporting to</dt><dd>${h ? esc(h.name) + ' (HOD)' : esc(u.reportsTo || '—')}</dd>
            <dt>Username</dt><dd><code>${esc(u.username)}</code></dd>
          </dl>
          <p class="muted small" style="margin:18px 0 0">To correct any of these details, please contact the ERP administrator.</p>
        </div>
        <form class="card" id="pw-form" novalidate>
          <div class="card-head"><div><h3>Change password</h3><p>Use at least 6 characters</p></div></div>
          <div id="pw-error"></div>
          <label class="field" data-f="cur"><span>Current password</span><div class="pw-wrap"><input type="password" name="cur" autocomplete="current-password"><button type="button" data-show>Show</button></div></label>
          <label class="field" data-f="next"><span>New password</span><div class="pw-wrap"><input type="password" name="next" autocomplete="new-password"><button type="button" data-show>Show</button></div></label>
          <div class="pw-strength"><div></div></div>
          <label class="field" data-f="confirm"><span>Confirm new password</span><div class="pw-wrap"><input type="password" name="confirm" autocomplete="new-password"><button type="button" data-show>Show</button></div></label>
          <button class="btn btn-primary btn-block" type="submit">${icon('check', 16)} Update password</button>
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
      { id: 'apply', label: 'Apply Leave', icon: 'plus', render: renderApply },
      { id: 'leaves', label: 'My Leaves', icon: 'leave', render: renderLeaves, badge: pendingCount },
      { id: 'profile', label: 'Profile', icon: 'user', render: renderProfile },
    ],
  });
})();
