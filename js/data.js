/* Arundhati ERP — data layer.
 * Backed by a shared server store (/api/db → Upstash Redis) when deployed, so all
 * visitors see the same data; falls back to browser localStorage when no server is
 * reachable (opened as a file / `npx serve`). Everything hangs off the global `ERP`
 * object. Pages must load this file first (after employees.js + attendance-seed.js).
 */
(function () {
  const KEY = 'arundhati-erp-db-v1';
  const SESSION = 'arundhati-erp-session';

  const INSTITUTION = 'Arundhati Medical College & Hospital';

  // Departments and staff come from js/employees.js (generated from the employee Excel list).
  const DEPARTMENTS = window.ERP_SEED.departments;

  // Leave types and yearly entitlement (days). LOP has no cap.
  const LEAVE_TYPES = [
    { code: 'CL', name: 'Casual Leave', quota: 12 },
    { code: 'EL', name: 'Earned Leave', quota: 15 },
    { code: 'ML', name: 'Medical Leave', quota: 10 },
    { code: 'OD', name: 'On Duty', quota: 10 },
    { code: 'LOP', name: 'Loss of Pay', quota: null },
  ];

  // Attendance status codes accepted in the Excel sheet.
  const STATUS = {
    P: { label: 'Present', tone: 'ok' },
    A: { label: 'Absent', tone: 'bad' },
    L: { label: 'On Leave', tone: 'warn' },
    HD: { label: 'Half Day', tone: 'info' },
    OD: { label: 'On Duty', tone: 'accent' },
  };

  // Leave workflow: faculty -> HOD -> Principal. HOD's own leave goes straight to Principal.
  const LEAVE_STATE = {
    PENDING_HOD: 'Pending HOD',
    PENDING_PRINCIPAL: 'Pending Principal',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    CANCELLED: 'Cancelled',
  };

  // ---------- helpers ----------
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => iso(new Date());
  const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const uid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const isSunday = (s) => parseISO(s).getDay() === 0;

  function daysBetween(from, to) {
    const out = [];
    for (let d = parseISO(from); d <= parseISO(to); d.setDate(d.getDate() + 1)) out.push(iso(d));
    return out;
  }
  // Working days (Mon–Sat) in a range — what a leave actually consumes.
  const workingDays = (from, to) => daysBetween(from, to).filter((d) => !isSunday(d));

  // ---------- seed ----------
  function seedUsers() {
    return [
      { empId: 'ADM001', username: 'admin', password: 'admin123', role: 'admin', name: 'ERP Administrator', designation: 'ERP Administrator', dept: null, email: '', phone: '', joinDate: '' },
      ...window.ERP_SEED.employees.map((e) => ({ email: '', phone: '', joinDate: '', ...e })),
    ];
  }

  // Attendance baked in from the Oct 2026 biometric "Basic Work Duration" reports
  // (js/attendance-seed.js). Tagged as one synthetic Admin upload so it shows up in
  // Admin → Upload history like any uploaded sheet.
  const SEED_UPLOAD_ID = 'UP-seed-biometric-oct2026';
  function seedAttendance() {
    const src = (typeof window !== 'undefined' && window.ERP_ATTENDANCE_SEED) || [];
    return src.map((r) => ({ ...r, uploadId: SEED_UPLOAD_ID }));
  }
  function seedUploads(att) {
    if (!att.length) return [];
    const dates = att.map((r) => r.date).sort();
    return [{
      id: SEED_UPLOAD_ID,
      fileName: 'AIMS Oct 2026 — Basic Work Duration (Hospital + College).xls',
      uploadedBy: 'ADM001',
      at: new Date().toISOString(),
      rows: att.length,
      replaced: 0,
      from: dates[0],
      to: dates[dates.length - 1],
    }];
  }

  function seed() {
    const attendance = seedAttendance();
    return {
      version: 3,
      institution: INSTITUTION,
      users: seedUsers(),
      attendance,
      uploads: seedUploads(attendance),
      leaves: [],
      announcements: [
        { id: uid('AN'), title: 'Biometric sync', body: 'October 2026 attendance has been imported from the biometric Basic Work Duration reports. New months upload via Admin → Upload attendance.', by: 'ADM001', at: new Date().toISOString() },
      ],
      notifications: [], // {id, to: empId, text, at, read}
    };
  }

  // ---------- persistence ----------
  // Shared server store (Vercel function /api/db backed by Upstash Redis): every visitor
  // reads the same DB and writes are pushed back so uploads/leaves persist for everyone.
  // localStorage is kept as a cache + offline fallback, so the app still runs from a plain
  // file:// or `npx serve` with no server (serverMode stays false).
  const API = window.ERP_API_URL || '/api/db';
  let db;
  let serverMode = false;
  let putInFlight = false, putDirty = false, putTimer = null;

  // Synchronous GET so the rest of the (synchronous) app sees ready data at load time.
  function serverGetSync() {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', API, false);
      xhr.send();
      if (xhr.status !== 200) return undefined;
      const res = JSON.parse(xhr.responseText);
      return res && res.ok ? res.db : undefined; // db may be null when the store is empty
    } catch (e) { return undefined; }
  }
  // Synchronous PUT — used for the first seed and for reset, so an immediate page reload sees it.
  function serverPutSync() {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', API, false);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({ db }));
      return xhr.status === 200;
    } catch (e) { return false; }
  }
  // Async write-through for ordinary saves (fired immediately, coalesced, last write wins).
  function serverPutAsync() {
    putDirty = true;
    if (putInFlight) return;
    putInFlight = true; putDirty = false;
    fetch(API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ db }) })
      .then((r) => { if (!r.ok) putDirty = true; })
      .catch(() => { putDirty = true; })
      .finally(() => { putInFlight = false; if (putDirty) { clearTimeout(putTimer); putTimer = setTimeout(serverPutAsync, 400); } });
  }
  function saveLocal() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.warn('cache save failed', e); } }

  function load() {
    const remote = serverGetSync();
    if (remote === undefined) {            // no server reachable -> offline/local mode
      serverMode = false;
      try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; }
      if (!db || db.version !== 3) { db = seed(); saveLocal(); }
      return db;
    }
    serverMode = true;
    if (!remote || remote.version !== 3) { db = seed(); saveLocal(); serverPutSync(); } // seed empty/old store
    else { db = remote; saveLocal(); }
    return db;
  }
  function save() { saveLocal(); if (serverMode) serverPutAsync(); }
  function reset() { db = seed(); saveLocal(); if (serverMode) serverPutSync(); }

  // Best-effort flush of a pending write when the page is being hidden/closed.
  window.addEventListener('pagehide', () => { if (serverMode && (putDirty || putInFlight)) { try { serverPutSync(); } catch (e) {} } });

  load();

  // ---------- users ----------
  const users = {
    all: () => db.users,
    byEmp: (empId) => db.users.find((u) => u.empId === empId),
    byDept: (dept) => db.users.filter((u) => u.dept === dept),
    staff: () => db.users.filter((u) => u.role !== 'admin'),
    hodOf: (dept) => db.users.find((u) => u.role === 'hod' && u.dept === dept),
    add(u) {
      if (db.users.some((x) => x.empId === u.empId)) throw new Error(`Employee ID ${u.empId} already exists`);
      if (db.users.some((x) => x.username === u.username)) throw new Error(`Username ${u.username} already taken`);
      db.users.push({ joinDate: today(), phone: '', ...u }); save();
    },
    update(empId, patch) { Object.assign(users.byEmp(empId), patch); save(); },
    remove(empId) { db.users = db.users.filter((u) => u.empId !== empId); save(); },
  };

  // ---------- auth ----------
  const auth = {
    login(username, password) {
      const u = db.users.find((x) => x.username.toLowerCase() === String(username).trim().toLowerCase() && x.password === password);
      if (!u) return null;
      sessionStorage.setItem(SESSION, u.empId);
      return u;
    },
    loginAs(empId) { sessionStorage.setItem(SESSION, empId); return users.byEmp(empId); },
    current: () => users.byEmp(sessionStorage.getItem(SESSION)),
    logout() { sessionStorage.removeItem(SESSION); location.href = 'index.html'; },
    homeFor: (role) => ({ admin: 'admin.html', principal: 'principal.html', dean: 'dean.html', hod: 'hod.html', faculty: 'faculty.html' }[role]),
    // Call at top of each page. Redirects if not logged in or wrong role.
    require(roles) {
      const u = auth.current();
      if (!u) { location.replace('index.html'); return null; }
      if (roles && !roles.includes(u.role)) { location.replace(auth.homeFor(u.role)); return null; }
      return u;
    },
  };

  // ---------- attendance ----------
  const attendance = {
    all: () => db.attendance,
    forEmp(empId, from, to) {
      return db.attendance.filter((r) => r.empId === empId && (!from || r.date >= from) && (!to || r.date <= to))
        .sort((a, b) => a.date.localeCompare(b.date));
    },
    forDate: (date) => db.attendance.filter((r) => r.date === date),
    latestDate: () => db.attendance.reduce((m, r) => (r.date > m ? r.date : m), ''),
    // Summary counts + % for a set of rows. HD counts as 0.5, OD/L as present-equivalent for %? No: % = (P + OD + 0.5*HD) / (total - L).
    summarize(rows) {
      const c = { P: 0, A: 0, L: 0, HD: 0, OD: 0, total: rows.length };
      rows.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; });
      const base = c.total - c.L;
      c.percent = base ? Math.round(((c.P + c.OD + 0.5 * c.HD) / base) * 1000) / 10 : 0;
      return c;
    },
    summaryFor(empId, from, to) { return attendance.summarize(attendance.forEmp(empId, from, to)); },
    deptSummary(dept, from, to) {
      const ids = new Set(users.byDept(dept).map((u) => u.empId));
      return attendance.summarize(db.attendance.filter((r) => ids.has(r.empId) && (!from || r.date >= from) && (!to || r.date <= to)));
    },
    /* Import validated rows from an Excel upload. Same empId+date overwrites.
     * rows: [{empId, date, status, inTime, outTime}]; returns upload record. */
    importRows(rows, fileName, uploadedBy) {
      const id = uid('UP');
      const key = (r) => `${r.empId}|${r.date}`;
      const incoming = new Map(rows.map((r) => [key(r), { ...r, uploadId: id }]));
      let replaced = 0;
      db.attendance = db.attendance.filter((r) => { if (incoming.has(key(r))) { replaced++; return false; } return true; });
      db.attendance.push(...incoming.values());
      const dates = rows.map((r) => r.date).sort();
      const up = { id, fileName, uploadedBy, at: new Date().toISOString(), rows: incoming.size, replaced, from: dates[0], to: dates[dates.length - 1] };
      db.uploads.unshift(up);
      // notify each affected employee once
      new Set(rows.map((r) => r.empId)).forEach((e) => notify(e, `Attendance updated for ${fmt.date(up.from)} – ${fmt.date(up.to)}`));
      save();
      return up;
    },
    uploads: () => db.uploads,
    deleteUpload(id) {
      db.attendance = db.attendance.filter((r) => r.uploadId !== id);
      db.uploads = db.uploads.filter((u) => u.id !== id);
      save();
    },
    /* Validate raw sheet rows (objects keyed by header). Accepts flexible header names.
     * Returns { valid: [...], errors: [{row, message}] } */
    validate(rawRows) {
      const pick = (o, names) => {
        const k = Object.keys(o).find((h) => names.includes(h.toString().trim().toLowerCase().replace(/[\s_.-]+/g, '')));
        return k === undefined ? '' : o[k];
      };
      const normDate = (v) => {
        if (v instanceof Date && !isNaN(v)) return iso(v);
        if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 86400000)); return iso(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
        const s = String(v).trim();
        let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
        m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`; // DD/MM/YYYY
        return null;
      };
      const normTime = (v) => {
        if (v === '' || v == null) return '';
        if (typeof v === 'number') { const mins = Math.round(v * 1440); return `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`; }
        if (v instanceof Date) return `${pad(v.getHours())}:${pad(v.getMinutes())}`;
        const m = String(v).trim().match(/^(\d{1,2}):(\d{2})/); return m ? `${pad(m[1])}:${m[2]}` : '';
      };
      const valid = [], errors = [];
      rawRows.forEach((o, i) => {
        const row = i + 2; // header is row 1
        const empId = String(pick(o, ['employeeid', 'empid', 'empcode', 'employeecode', 'id'])).trim().toUpperCase();
        const dateRaw = pick(o, ['date', 'attendancedate']);
        const statusRaw = String(pick(o, ['status', 'attendance', 'att'])).trim().toUpperCase();
        if (!empId && !dateRaw && !statusRaw) return; // blank line
        const status = { PRESENT: 'P', ABSENT: 'A', LEAVE: 'L', 'HALF DAY': 'HD', HALFDAY: 'HD', 'ON DUTY': 'OD', ONDUTY: 'OD' }[statusRaw] || statusRaw;
        let date = normDate(dateRaw);
        if (date && iso(parseISO(date)) !== date) date = null; // rejects 31/02, 99/99 etc.
        if (!empId) return errors.push({ row, message: 'Missing Employee ID' });
        if (!users.byEmp(empId)) return errors.push({ row, message: `Unknown Employee ID "${empId}"` });
        if (!date) return errors.push({ row, message: `Invalid date "${dateRaw}"` });
        if (!STATUS[status]) return errors.push({ row, message: `Invalid status "${statusRaw}" (use P, A, L, HD, OD)` });
        valid.push({ empId, date, status, inTime: normTime(pick(o, ['intime', 'in', 'checkin', 'punchin'])), outTime: normTime(pick(o, ['outtime', 'out', 'checkout', 'punchout'])) });
      });
      return { valid, errors };
    },
    // Header row used for the downloadable template and exports.
    TEMPLATE_HEADERS: ['Employee ID', 'Name', 'Department', 'Date', 'Status', 'In Time', 'Out Time'],
  };

  // ---------- leaves ----------
  function notify(to, text) { db.notifications.unshift({ id: uid('NT'), to, text, at: new Date().toISOString(), read: false }); }

  const leaves = {
    all: () => db.leaves,
    byId: (id) => db.leaves.find((l) => l.id === id),
    forEmp: (empId) => db.leaves.filter((l) => l.empId === empId).sort((a, b) => b.appliedAt.localeCompare(a.appliedAt)),
    forDept: (dept) => db.leaves.filter((l) => users.byEmp(l.empId)?.dept === dept),
    // Leaves waiting on this user to act.
    pendingFor(user) {
      if (user.role === 'hod') return db.leaves.filter((l) => l.status === LEAVE_STATE.PENDING_HOD && users.byEmp(l.empId)?.dept === user.dept);
      if (user.role === 'principal') return db.leaves.filter((l) => l.status === LEAVE_STATE.PENDING_PRINCIPAL);
      return [];
    },
    balance(empId) {
      const year = String(new Date().getFullYear());
      return LEAVE_TYPES.map((t) => {
        const used = db.leaves.filter((l) => l.empId === empId && l.type === t.code && l.status === LEAVE_STATE.APPROVED && l.from.startsWith(year)).reduce((s, l) => s + l.days, 0);
        const pending = db.leaves.filter((l) => l.empId === empId && l.type === t.code && [LEAVE_STATE.PENDING_HOD, LEAVE_STATE.PENDING_PRINCIPAL].includes(l.status)).reduce((s, l) => s + l.days, 0);
        return { ...t, used, pending, remaining: t.quota == null ? null : t.quota - used };
      });
    },
    /* Apply. {empId, type, from, to, reason, halfDay}. Throws on validation errors. */
    apply({ empId, type, from, to, reason, halfDay = false }) {
      const u = users.byEmp(empId);
      if (!from || !to || to < from) throw new Error('Choose a valid date range');
      if (!reason || reason.trim().length < 5) throw new Error('Please give a reason (min 5 characters)');
      const days = halfDay ? 0.5 : workingDays(from, to).length;
      if (!days) throw new Error('Selected range has no working days');
      const overlap = db.leaves.find((l) => l.empId === empId && ![LEAVE_STATE.REJECTED, LEAVE_STATE.CANCELLED].includes(l.status) && l.from <= to && l.to >= from);
      if (overlap) throw new Error(`Overlaps with an existing leave (${fmt.date(overlap.from)} – ${fmt.date(overlap.to)})`);
      const bal = leaves.balance(empId).find((b) => b.code === type);
      if (bal.quota != null && bal.remaining - bal.pending < days) throw new Error(`Insufficient ${bal.name} balance (${bal.remaining - bal.pending} available)`);
      const status = u.role === 'faculty' && users.hodOf(u.dept) ? LEAVE_STATE.PENDING_HOD : LEAVE_STATE.PENDING_PRINCIPAL;
      const l = { id: uid('LV'), empId, type, from, to, days, halfDay, reason: reason.trim(), status, appliedAt: new Date().toISOString(), history: [] };
      db.leaves.push(l);
      const approver = status === LEAVE_STATE.PENDING_HOD ? users.hodOf(u.dept) : db.users.find((x) => x.role === 'principal');
      if (approver) notify(approver.empId, `${u.name} applied for ${type} (${days} day${days === 1 ? '' : 's'})`);
      save();
      return l;
    },
    /* actor acts on leave. action: 'approve' | 'reject'. HOD approve = recommend -> Principal. */
    act(id, actor, action, remark = '') {
      const l = leaves.byId(id);
      if (!l) throw new Error('Leave not found');
      if (!leaves.pendingFor(actor).includes(l)) throw new Error('You cannot act on this request');
      const at = new Date().toISOString();
      if (action === 'reject') {
        l.status = LEAVE_STATE.REJECTED;
        l.history.push({ by: actor.empId, role: actor.role, action: 'Rejected', remark, at });
        notify(l.empId, `Your ${l.type} leave from ${fmt.date(l.from)} was rejected by ${actor.designation}`);
      } else if (actor.role === 'hod') {
        l.status = LEAVE_STATE.PENDING_PRINCIPAL;
        l.history.push({ by: actor.empId, role: actor.role, action: 'Recommended', remark, at });
        notify(l.empId, `Your ${l.type} leave was recommended by HOD and forwarded to Principal`);
        const p = db.users.find((x) => x.role === 'principal'); if (p) notify(p.empId, `Leave from ${users.byEmp(l.empId).name} awaiting approval`);
      } else {
        l.status = LEAVE_STATE.APPROVED;
        l.history.push({ by: actor.empId, role: actor.role, action: 'Approved', remark, at });
        notify(l.empId, `Your ${l.type} leave from ${fmt.date(l.from)} was approved`);
      }
      save();
      return l;
    },
    cancel(id, empId) {
      const l = leaves.byId(id);
      if (!l || l.empId !== empId) throw new Error('Not allowed');
      if (![LEAVE_STATE.PENDING_HOD, LEAVE_STATE.PENDING_PRINCIPAL].includes(l.status)) throw new Error('Only pending requests can be cancelled');
      l.status = LEAVE_STATE.CANCELLED;
      l.history.push({ by: empId, role: 'self', action: 'Cancelled', remark: '', at: new Date().toISOString() });
      save();
    },
  };

  // ---------- announcements & notifications ----------
  const announcements = {
    all: () => db.announcements.slice().sort((a, b) => b.at.localeCompare(a.at)),
    add(title, body, by) { db.announcements.push({ id: uid('AN'), title, body, by, at: new Date().toISOString() }); save(); },
    remove(id) { db.announcements = db.announcements.filter((a) => a.id !== id); save(); },
  };
  const notifications = {
    for: (empId) => db.notifications.filter((n) => n.to === empId),
    unread: (empId) => db.notifications.filter((n) => n.to === empId && !n.read).length,
    markAllRead(empId) { db.notifications.forEach((n) => { if (n.to === empId) n.read = true; }); save(); },
  };

  // ---------- formatting ----------
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmt = {
    date: (s) => { if (!s) return '—'; const d = parseISO(s.slice(0, 10)); return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; },
    dateTime: (s) => { const d = new Date(s); return `${pad(d.getDate())} ${MONTHS[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`; },
    ago(s) {
      const sec = (Date.now() - new Date(s).getTime()) / 1000;
      if (sec < 60) return 'just now'; if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
      if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`; return `${Math.floor(sec / 86400)}d ago`;
    },
    deptName: (code) => DEPARTMENTS.find((d) => d.code === code)?.name || '—',
    leaveName: (code) => LEAVE_TYPES.find((t) => t.code === code)?.name || code,
    initials: (name) => name.replace(/^Dr\.\s*/, '').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase(),
    MONTHS,
  };

  window.ERP = {
    INSTITUTION, DEPARTMENTS, LEAVE_TYPES, STATUS, LEAVE_STATE,
    util: { iso, today, parseISO, daysBetween, workingDays, isSunday, uid },
    db: () => db, save, reset,
    users, auth, attendance, leaves, announcements, notifications, fmt,
    // Demo accounts shown on the login page and in the role switcher on every page.
    DEMO: [
      { role: 'admin', label: 'Admin', username: 'admin', password: 'admin123', empId: 'ADM001' },
      { role: 'principal', label: 'Principal', username: 'c024', password: 'aims@123', empId: 'C024' },
      { role: 'dean', label: 'Dean', username: '755', password: 'aims@123', empId: '755' },
      { role: 'hod', label: 'HOD (Pathology)', username: '817', password: 'aims@123', empId: '817' },
      { role: 'faculty', label: 'Faculty / Staff', username: '1140', password: 'aims@123', empId: '1140' },
    ],
  };
})();
