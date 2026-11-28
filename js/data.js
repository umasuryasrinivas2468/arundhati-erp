/* Arundhati ERP — data layer.
 * Backed by a shared server store (/api/db → server.js + SQLite) when deployed, so all
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

  // Leave rules, constants and every write operation live in js/core.js (shared with server.js).
  const CORE = window.ERP_CORE;
  const { LEAVE_TYPES, STATUS, LEAVE_STATE } = CORE;
  const { pad, iso, today, parseISO, uid, isSunday, daysBetween, workingDays } = CORE.util;

  const DB_VERSION = 6;

  // Student roster (MBBS 1st/2nd/3rd/4th year) comes from js/students.js.
  const ROMAN = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };

  // ---------- seed ----------
  function seedUsers() {
    return [
      { empId: 'ADM001', username: 'admin', password: 'admin123', role: 'admin', name: 'ERP Administrator', designation: 'ERP Administrator', dept: null, email: '', phone: '', joinDate: '' },
      ...window.ERP_SEED.employees.map((e) => ({ email: '', phone: '', joinDate: '', ...e })),
      ...seedStudents(),
    ];
  }

  // Build login users for every MBBS student. Login is the college email
  // (roll.no@aims.ac.in) and the password is the roll number itself; students
  // may also sign in with the bare roll number (see auth.login).
  function seedStudents() {
    const src = (typeof window !== 'undefined' && window.ERP_STUDENTS) || [];
    return src.map((s) => ({
      empId: s.roll,
      rollNo: s.roll,
      username: `${s.roll}@aims.ac.in`,
      password: String(s.roll),
      email: `${s.roll}@aims.ac.in`,
      role: 'student',
      name: s.name,
      year: s.year,
      batch: s.batch,
      designation: `${ROMAN[s.year] || s.year} MBBS Student`,
      dept: null, phone: '', joinDate: '',
    }));
  }

  // Attendance baked in from the Oct 2026 biometric "Basic Work Duration" reports
  // (js/attendance-seed.js). Tagged as one synthetic Admin upload so it shows up in
  // Admin → Upload history like any uploaded sheet.
  // One synthetic Admin upload per monthly biometric report (so each shows up in
  // Admin → Upload history). Records are tagged by date to the matching report.
  const SEED_UPLOADS = [
    { id: 'UP-seed-biometric-oct2026', month: '2026-10', fileName: 'AIMS Oct 2026 — Basic Work Duration (Hospital + College).xls' },
    { id: 'UP-seed-biometric-nov2026', month: '2026-11', fileName: 'NOV 1-10 2026 — Basic Work Duration (College & Hospital).xls' },
  ];
  const seedUploadIdFor = (date) => (SEED_UPLOADS.find((u) => date.startsWith(u.month)) || SEED_UPLOADS[0]).id;
  function seedAttendance() {
    const src = (typeof window !== 'undefined' && window.ERP_ATTENDANCE_SEED) || [];
    return src.map((r) => ({ ...r, uploadId: seedUploadIdFor(r.date) }));
  }
  function seedUploads(att) {
    return SEED_UPLOADS.map((u) => {
      const rows = att.filter((r) => r.uploadId === u.id);
      if (!rows.length) return null;
      const dates = rows.map((r) => r.date).sort();
      return {
        id: u.id,
        fileName: u.fileName,
        uploadedBy: 'ADM001',
        at: new Date().toISOString(),
        rows: rows.length,
        replaced: 0,
        from: dates[0],
        to: dates[dates.length - 1],
      };
    }).filter(Boolean);
  }

  function seed() {
    const attendance = seedAttendance();
    return {
      version: DB_VERSION,
      institution: INSTITUTION,
      users: seedUsers(),
      attendance,
      uploads: seedUploads(attendance),
      leaves: [],
      announcements: [
        { id: uid('AN'), title: 'Biometric sync', body: 'October 2026 (01–26 Oct) and November 2026 (01–10 Nov) attendance has been imported from the biometric Basic Work Duration reports. New months upload via Admin → Upload attendance.', by: 'ADM001', at: new Date().toISOString() },
        { id: uid('AN'), title: 'Biometric attendance — late-punch policy', body: 'Reporting more than 15 minutes late counts as a late punch. 1st & 2nd late punches in a month: no loss of pay. 3rd to 5th late punches: half-day loss of pay each. Beyond the 5th late punch: one full day loss of pay each.', by: 'ADM001', at: new Date().toISOString() },
        { id: uid('AN'), title: 'Leave entitlement (2026–27)', body: 'Casual Leave (CL): Doctors 24/year (2 per month), Teaching & Non-teaching staff 12/year. Academic Leave (AL): Doctors 8/year. On Duty (OD) and Loss of Pay (LOP) apply to all. Leave types: CL, AL, OD, LOP.', by: 'ADM001', at: new Date().toISOString() },
      ],
      notifications: [], // {id, to: empId, text, at, read}
    };
  }

  // ---------- persistence ----------
  // With server.js: the server is the only store. Reads come from GET /api/db (already filtered
  // to what this user may see) and every change is one POST /api/op that the server checks and
  // applies, returning the refreshed view. Without a server (file:// or `npx serve`) the same
  // core.js ops run against a localStorage copy, so offline demos still work.
  const API = window.ERP_API_URL || '/api/db';
  let db, publicStats = null;
  let serverMode = false;

  // Synchronous XHR so the rest of the (synchronous) app sees ready data. Returns {status, body}.
  function xhr(method, url, body) {
    try {
      const x = new XMLHttpRequest();
      x.open(method, url, false);
      if (body !== undefined) x.setRequestHeader('Content-Type', 'application/json');
      x.send(body === undefined ? null : JSON.stringify(body));
      let parsed = null; try { parsed = JSON.parse(x.responseText); } catch (e) {}
      return { status: x.status, body: parsed };
    } catch (e) { return { status: 0, body: null }; }
  }
  const post = (url, body) => xhr('POST', url, body).body;
  function saveLocal() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.warn('cache save failed', e); } }

  function load() {
    const r = xhr('GET', API);
    if (r.status === 401) {                // signed out: empty in-memory data just for the login page
      serverMode = true; db = seed(); publicStats = r.body && r.body.stats;
      sessionStorage.removeItem(SESSION);
      try { localStorage.removeItem(KEY); } catch (e) {}
      if (!/(^|\/)(index\.html)?$/.test(location.pathname)) location.replace('index.html');
      return;
    }
    if (r.status === 200 && r.body && r.body.ok && r.body.db) { serverMode = true; db = r.body.db; return; }
    serverMode = false;                    // no server reachable -> offline/local mode
    try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; }
    if (!db || db.version !== DB_VERSION) { db = seed(); saveLocal(); }
  }
  // Run a write op: on the server when there is one, else locally. Throws Error with a readable message.
  function run(op, args = {}) {
    if (serverMode) {
      const r = xhr('POST', '/api/op', { op, args });
      if (r.status === 401) { sessionStorage.removeItem(SESSION); location.replace('index.html'); throw new Error('Session expired — please sign in again'); }
      if (!r.body || !r.body.ok) throw new Error((r.body && r.body.error) || 'Could not reach the server');
      db = r.body.db;
      return r.body.result;
    }
    const result = CORE.ops[op](db, auth.current(), args);
    saveLocal();
    return result;
  }
  function save() { if (!serverMode) saveLocal(); }
  function reset() { if (serverMode) throw new Error('Reset is not available on the server'); db = seed(); saveLocal(); }

  load();

  // ---------- users ----------
  const users = {
    all: () => db.users,
    byEmp: (empId) => db.users.find((u) => u.empId === empId),
    byDept: (dept) => db.users.filter((u) => u.dept === dept),
    staff: () => db.users.filter((u) => u.role !== 'admin' && u.role !== 'student'),
    students: () => db.users.filter((u) => u.role === 'student'),
    byRoll: (roll) => db.users.find((u) => u.role === 'student' && u.rollNo === roll),
    hodOf: (dept) => db.users.find((u) => u.role === 'hod' && u.dept === dept),
    add: (u) => run('user.add', { user: u }),
    update: (empId, patch) => run('user.update', { empId, patch }),
    remove: (empId) => run('user.remove', { empId }),
  };

  // ---------- auth ----------
  const auth = {
    login(username, password) {
      if (serverMode) {                    // server checks the password and sets an HttpOnly session cookie
        const r = post('/api/login', { username, password });
        if (!r || !r.ok) return null;
        sessionStorage.setItem(SESSION, r.user.empId);
        return r.user;
      }
      const q = String(username).trim().toLowerCase();
      // Match on username, employee ID / roll number, or email — so staff sign in
      // with their code and students with either their roll number or college email.
      const u = db.users.find((x) => x.password === password && (
        x.username.toLowerCase() === q ||
        String(x.empId).toLowerCase() === q ||
        (x.email && x.email.toLowerCase() === q)
      ));
      if (!u) return null;
      sessionStorage.setItem(SESSION, u.empId);
      return u;
    },
    current: () => users.byEmp(sessionStorage.getItem(SESSION)),
    logout() { if (serverMode) post('/api/logout', {}); sessionStorage.removeItem(SESSION); location.href = 'index.html'; },
    // Returns an error message, or null on success.
    changePassword(current, next) {
      if (serverMode) { const r = post('/api/password', { current, next }); return r && r.ok ? null : (r && r.error) || 'Could not change password'; }
      const me = auth.current();
      if (me.password !== current) return 'Current password is incorrect';
      me.password = next; saveLocal(); return null;
    },
    homeFor: (role) => ({ admin: 'admin.html', principal: 'principal.html', dean: 'dean.html', hod: 'hod.html', faculty: 'faculty.html', student: 'student.html' }[role]),
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
    importRows: (rows, fileName) => run('attendance.import', { rows, fileName }),
    uploads: () => db.uploads,
    deleteUpload: (id) => run('attendance.deleteUpload', { id }),
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

  const leaves = {
    all: () => db.leaves,
    byId: (id) => db.leaves.find((l) => l.id === id),
    forEmp: (empId) => db.leaves.filter((l) => l.empId === empId).sort((a, b) => b.appliedAt.localeCompare(a.appliedAt)),
    forDept: (dept) => db.leaves.filter((l) => users.byEmp(l.empId)?.dept === dept),
    // Leaves waiting on this user to act.
    pendingFor: (user) => CORE.pendingFor(db, user),
    balance: (empId) => CORE.balance(db, empId),
    // Apply for the signed-in user. {type, from, to, reason, halfDay}. Throws on validation errors.
    apply: ({ type, from, to, reason, halfDay = false }) => run('leave.apply', { type, from, to, reason, halfDay }),
    // action: 'approve' | 'reject'. HOD approve = recommend -> Principal. (actor = signed-in user)
    act: (id, actor, action, remark = '') => run('leave.act', { id, action, remark }),
    cancel: (id) => run('leave.cancel', { id }),
  };

  // ---------- announcements & notifications ----------
  const announcements = {
    all: () => db.announcements.slice().sort((a, b) => b.at.localeCompare(a.at)),
    add: (title, body) => run('announcement.add', { title, body }),
    remove: (id) => run('announcement.remove', { id }),
  };
  const notifications = {
    for: (empId) => db.notifications.filter((n) => n.to === empId),
    unread: (empId) => db.notifications.filter((n) => n.to === empId && !n.read).length,
    markAllRead: () => run('notifications.markAllRead'),
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
    db: () => db, save, reset, publicStats: () => publicStats,
    users, auth, attendance, leaves, announcements, notifications, fmt,
  };
})();
