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

  // ---------- QR code ----------
  /* Scannable QR (SVG string) encoding the student's identity details.
   * Falls back to '' if the QR library didn't load, so the card still renders. */
  function qrSvg(text) {
    try {
      if (typeof window.qrcode !== 'function') return '';
      const qr = window.qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      return qr.createSvgTag({ scalable: true, margin: 0 });
    } catch (e) { return ''; }
  }
  const studentQrText = (u) => [
    'Arundhati Institute of Medical Sciences',
    `Name: ${u.name}`,
    `Roll No: ${u.rollNo}`,
    `Programme: ${u.designation}`,
    `Batch: ${u.batch}`,
    `Year: ${u.year}`,
    `Email: ${u.email}`,
  ].join('\n');

  // ---------- student ID card ----------
  function idCard(u) {
    const qr = qrSvg(studentQrText(u));
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
        <div class="idcard-foot">
          <div class="idcard-foottext"><b>${esc(ERP.INSTITUTION)}</b>Scan the QR for student details</div>
          ${qr ? `<div class="idcard-qr" title="Scan for student details" aria-label="QR code of student details">${qr}</div>` : '<span class="idcard-barcode" aria-hidden="true"></span>'}
        </div>
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

  // ================= COMING SOON =================
  /* Reusable "feature on the way" placeholder. */
  function comingSoon(el, { iconName, title, lead, note, feats }) {
    el.innerHTML = `
      <div class="card soon">
        <div class="soon-ic">${icon(iconName, 40)}</div>
        <div class="soon-badge"><i></i> Coming soon</div>
        <h2>${esc(title)}</h2>
        <p>${lead}</p>
        <div class="soon-feats">${feats.map((f) => `<div class="soon-feat"><span class="sf-ic">${icon(f[0], 17)}</span><div><b>${esc(f[1])}</b><small>${esc(f[2])}</small></div></div>`).join('')}</div>
        ${note ? `<p class="muted small" style="margin-top:26px">${esc(note)}</p>` : ''}
      </div>`;
  }

  function renderAttendance(el) {
    comingSoon(el, {
      iconName: 'calendar',
      title: 'Attendance is on the way',
      lead: 'Soon you’ll be able to track your class and clinical attendance here — month by month, with a clear picture of where you stand against the <b>75%</b> exam-eligibility requirement.',
      note: 'The office is setting up the attendance feed. You’ll see your records here the moment it goes live.',
      feats: [
        ['chart', 'Live attendance %', 'Your running percentage, updated as each day is marked.'],
        ['calendar', 'Monthly calendar', 'A day-by-day grid with status and timings at a glance.'],
        ['alert', 'Shortage alerts', 'Early warnings if you dip below the required 75%.'],
        ['excel', 'Export to Excel', 'Download your record for any month in one click.'],
      ],
    });
  }

  function renderFees(el) {
    comingSoon(el, {
      iconName: 'wallet',
      title: 'Fees & payments, coming soon',
      lead: 'A single place to view your fee structure, see what’s due, pay online securely, and download receipts — no more standing in queues at the accounts office.',
      note: 'Online fee payment is being set up with the accounts office. Watch this space.',
      feats: [
        ['rupee', 'Fee statement', 'Your full fee structure and running balance, term by term.'],
        ['wallet', 'Pay online', 'Secure payment by UPI, card or net-banking.'],
        ['file', 'Instant receipts', 'Download a receipt the moment a payment clears.'],
        ['bell', 'Due reminders', 'Timely nudges before each instalment is due.'],
      ],
    });
  }

  function renderHostel(el) {
    comingSoon(el, {
      iconName: 'bed',
      title: 'Hostel, coming soon',
      lead: 'Everything about your hostel life in one place — your room allotment, mess menu and bills, and a quick way to raise maintenance or leave requests with the warden.',
      note: 'The hostel office is onboarding to the ERP. Your room and mess details will appear here soon.',
      feats: [
        ['building', 'Room allotment', 'Your block, room number and roommates at a glance.'],
        ['rupee', 'Mess & hostel bills', 'Monthly charges and payment status, all in one view.'],
        ['file', 'Gate & leave pass', 'Apply for a hostel leave / outing pass online.'],
        ['bell', 'Warden notices', 'Hostel announcements delivered straight to you.'],
      ],
    });
  }

  function renderTransport(el) {
    comingSoon(el, {
      iconName: 'bus',
      title: 'Transport, coming soon',
      lead: 'Pick your college bus route, see live timings and stops, and manage your transport pass — so you always know exactly when and where to catch your bus.',
      note: 'College transport is being mapped into the ERP. Routes and timings will go live here shortly.',
      feats: [
        ['pin', 'Route & stops', 'Your assigned route with every stop and pickup time.'],
        ['bus', 'Live bus timings', 'Know when your bus is due at your stop.'],
        ['wallet', 'Transport pass', 'View and renew your bus pass online.'],
        ['bell', 'Service alerts', 'Instant notice of delays or route changes.'],
      ],
    });
  }

  // ================= ANNOUNCEMENTS =================
  function renderAnnouncements(el) {
    const list = ERP.announcements.all();
    el.innerHTML = `
      <div class="card">
        <div class="card-head"><div><h3>Announcements</h3><p>Notices from the administration</p></div><span class="badge badge-muted">${list.length}</span></div>
        <div class="list">${list.length ? list.map((a) => `
          <div class="list-item" style="justify-content:flex-start;align-items:flex-start">
            <span class="ann-icon">${icon('megaphone', 17)}</span>
            <div style="flex:1;min-width:0"><b>${esc(a.title)}</b><p>${esc(a.body)}</p><small class="muted">${esc(nameOf(a.by))} · ${fmt.dateTime(a.at)} (${fmt.ago(a.at)})</small></div>
          </div>`).join('') : ui.empty('No announcements yet', 'megaphone')}</div>
      </div>`;
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
      { id: 'fees', label: 'Fees Payment', icon: 'wallet', render: renderFees },
      { id: 'hostel', label: 'Hostel', icon: 'bed', render: renderHostel },
      { id: 'transport', label: 'Transport', icon: 'bus', render: renderTransport },
      { id: 'announcements', label: 'Announcements', icon: 'megaphone', render: renderAnnouncements },
      { id: 'profile', label: 'Profile', icon: 'id', render: renderProfile },
    ],
  });
})();
