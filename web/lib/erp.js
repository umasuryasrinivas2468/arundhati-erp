/* CampusHub AIMS — data + business-logic layer.
 *
 * React/Next data layer:
 *   - seed data comes from ./seed/* ES modules (not window globals)
 *   - the DB loads ASYNchronously (fetch) instead of a synchronous XHR; call
 *     ERP.ready() once and await it before reading data (the ErpProvider does this)
 *   - save() notifies subscribers so React can re-render (ERP.subscribe)
 *   - auth has no navigation side-effects; homeFor() returns a route path and
 *     route-guarding lives in a React hook (useRequireRole)
 *
 * Backend contract is UNCHANGED: GET /api/db -> { ok, db }, PUT /api/db <- { db }.
 */
import { ERP_SEED } from './seed/employees';
import { ERP_STUDENTS } from './seed/students';
import { ERP_ATTENDANCE_SEED } from './seed/attendance-seed';

const KEY = 'arundhati-erp-db-v1';
const SESSION = 'arundhati-erp-session';

const INSTITUTION = 'Arundhati Medical College & Hospital';
const DEPARTMENTS = ERP_SEED.departments;

const LEAVE_TYPES = [
  { code: 'CL', name: 'Casual Leave', quota: 24 },
  { code: 'AL', name: 'Academic Leave', quota: 8 },
  { code: 'OD', name: 'On Duty', quota: null },
  { code: 'LOP', name: 'Loss of Pay', quota: null },
];

const STATUS = {
  P: { label: 'Present', tone: 'ok' },
  A: { label: 'Absent', tone: 'bad' },
  L: { label: 'On Leave', tone: 'warn' },
  HD: { label: 'Half Day', tone: 'info' },
  OD: { label: 'On Duty', tone: 'accent' },
};

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
const workingDays = (from, to) => daysBetween(from, to).filter((d) => !isSunday(d));

const DB_VERSION = 6;
const ROMAN = { 2: 'II', 3: 'III', 4: 'IV' };

// MBBS annual tuition fee per admission category (₹ per academic year).
const FEE_BY_CATEGORY = { A: 60000, B: 1155000, C: 2300000 };
// Academic year label for a date; the AY rolls over in June.
function academicYearOf(d = new Date()) {
  const y = d.getFullYear();
  return d.getMonth() >= 5 ? `${y}-${String((y + 1) % 100).padStart(2, '0')}` : `${y - 1}-${String(y % 100).padStart(2, '0')}`;
}
const CURRENT_AY = academicYearOf();

// ---------- seed ----------
function seedUsers() {
  return [
    { empId: 'ADM001', username: 'admin', password: 'admin123', role: 'admin', name: 'ERP Administrator', designation: 'ERP Administrator', dept: null, email: '', phone: '', joinDate: '' },
    ...ERP_SEED.employees.map((e) => ({ email: '', phone: '', joinDate: '', ...e })),
    ...seedStudents(),
  ];
}

function seedStudents() {
  const src = ERP_STUDENTS || [];
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
    category: s.category || null,
    designation: `${ROMAN[s.year] || s.year} MBBS Student`,
    dept: null, phone: '', joinDate: '',
  }));
}


const SEED_UPLOAD_ID = 'UP-seed-biometric-oct2026';
function seedAttendance() {
  const src = ERP_ATTENDANCE_SEED || [];
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
    version: DB_VERSION,
    institution: INSTITUTION,
    users: seedUsers(),
    attendance,
    uploads: seedUploads(attendance),
    leaves: [],
    feePayments: [],
    announcements: [
      { id: uid('AN'), title: 'Biometric sync', body: 'October 2026 attendance has been imported from the biometric Basic Work Duration reports. New months upload via Admin → Upload attendance.', by: 'ADM001', at: new Date().toISOString(), audience: ['all'] },
    ],
    notifications: [],
  };
}

// ---------- persistence ----------
const API = (typeof window !== 'undefined' && window.ERP_API_URL) || '/api/db';
let db = null;
let serverMode = false;
let me = null; // empId of the signed-in user (server mode: from the session cookie)
let loadPromise = null;
let putInFlight = false, putDirty = false, putTimer = null;

const listeners = new Set();
const emit = () => { listeners.forEach((fn) => { try { fn(); } catch (e) {} }); };
function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// -> { db, me } when signed in, null when signed out (401), undefined when there's no usable server.
async function serverGet() {
  try {
    const res = await fetch(API, { cache: 'no-store' });
    if (res.status === 401) return null;
    if (!res.ok) return undefined;
    const j = await res.json();
    return j && j.ok ? j : undefined;
  } catch (e) { return undefined; }
}
// Signed out in server mode: nothing is loaded until /api/login succeeds.
const emptyDb = () => ({ version: DB_VERSION, institution: INSTITUTION, users: [], attendance: [], leaves: [], announcements: [], notifications: [], uploads: [], feePayments: [] });
async function serverPut() {
  try {
    const res = await fetch(API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ db }) });
    return res.ok;
  } catch (e) { return false; }
}
// Async write-through for ordinary saves (coalesced, last write wins).
function serverPutAsync() {
  putDirty = true;
  if (putInFlight) return;
  putInFlight = true; putDirty = false;
  fetch(API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ db }) })
    .then((r) => { if (!r.ok) putDirty = true; })
    .catch(() => { putDirty = true; })
    .finally(() => { putInFlight = false; if (putDirty) { clearTimeout(putTimer); putTimer = setTimeout(serverPutAsync, 400); } });
}
function saveLocal() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }

async function load() {
  const remote = await serverGet();
  if (remote === undefined) {            // no server reachable -> offline/local mode
    serverMode = false;
    try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; }
    if (!db || db.version !== DB_VERSION) { db = seed(); saveLocal(); }
    try { me = sessionStorage.getItem(SESSION); } catch (e) {}
    return db;
  }
  serverMode = true;
  try { localStorage.removeItem(KEY); } catch (e) {} // never keep server data in the browser
  if (!remote) { db = emptyDb(); me = null; return db; }
  db = remote.db && remote.db.version === DB_VERSION ? remote.db : emptyDb();
  me = remote.me;
  return db;
}

// Call once; awaited by the ErpProvider before the app renders.
function ready() { if (!loadPromise) loadPromise = load(); return loadPromise; }
const isReady = () => db !== null;

function save() { if (serverMode) serverPutAsync(); else saveLocal(); emit(); }
async function reset() { db = seed(); if (serverMode) await serverPut(); else saveLocal(); emit(); return db; }

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { if (serverMode && (putDirty || putInFlight)) { try { navigator.sendBeacon?.(API, new Blob([JSON.stringify({ db })], { type: 'application/json' })); } catch (e) {} } });
}

// ---------- users ----------
const users = {
  all: () => db.users,
  byEmp: (empId) => db.users.find((u) => u.empId === empId),
  byDept: (dept) => db.users.filter((u) => u.dept === dept),
  staff: () => db.users.filter((u) => u.role !== 'admin' && u.role !== 'student'),
  students: () => db.users.filter((u) => u.role === 'student'),
  byRoll: (roll) => db.users.find((u) => u.role === 'student' && u.rollNo === roll),
  hodOf: (dept) => db.users.find((u) => u.role === 'hod' && u.dept === dept),
  add(u) {
    if (db.users.some((x) => x.empId === u.empId)) throw new Error(`Employee ID ${u.empId} already exists`);
    if (db.users.some((x) => x.username === u.username)) throw new Error(`Username ${u.username} already taken`);
    db.users.push({ joinDate: today(), phone: '', ...u }); save();
  },
  update(empId, patch) { Object.assign(users.byEmp(empId), patch); save(); },
  remove(empId) { db.users = db.users.filter((u) => u.empId !== empId); save(); },
};

// ---------- auth (no navigation side-effects) ----------
const HOME = { admin: '/admin', principal: '/principal', dean: '/dean', hod: '/hod', faculty: '/faculty', student: '/student' };
const post = (path, data) => fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}) })
  .then((r) => r.json().catch(() => ({ ok: false, error: `Server error (${r.status})` })));
const auth = {
  // Resolves to the user; throws with a message to show on failure.
  async login(username, password) {
    if (serverMode) {
      const j = await post('/api/login', { username, password });
      if (!j.ok) throw new Error(j.error || 'Invalid username or password. Please try again.');
      const remote = await serverGet();
      if (!remote) throw new Error('Signed in, but the data could not be loaded. Please try again.');
      db = remote.db; me = remote.me; emit();
      return users.byEmp(me);
    }
    const q = String(username).trim().toLowerCase();
    const u = db.users.find((x) => x.password === password && (
      x.username.toLowerCase() === q ||
      String(x.empId).toLowerCase() === q ||
      (x.email && x.email.toLowerCase() === q)
    ));
    if (!u) throw new Error('Invalid username or password. Please try again.');
    me = u.empId;
    try { sessionStorage.setItem(SESSION, me); } catch (e) {}
    return u;
  },
  current: () => users.byEmp(me),
  logout() {
    me = null;
    try { sessionStorage.removeItem(SESSION); } catch (e) {}
    if (serverMode) { post('/api/logout'); db = emptyDb(); emit(); }
  },
  // Resolves to null on success, else an error message.
  async changePassword(current, next) {
    if (serverMode) { const j = await post('/api/password', { current, next }); return j.ok ? null : j.error || 'Could not change password'; }
    const u = users.byEmp(me);
    if (!u || u.password !== current) return 'Current password is incorrect';
    users.update(me, { password: next });
    return null;
  },
  homeFor: (role) => HOME[role] || '/',
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
      m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
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
      const row = i + 2;
      const empId = String(pick(o, ['employeeid', 'empid', 'empcode', 'employeecode', 'id'])).trim().toUpperCase();
      const dateRaw = pick(o, ['date', 'attendancedate']);
      const statusRaw = String(pick(o, ['status', 'attendance', 'att'])).trim().toUpperCase();
      if (!empId && !dateRaw && !statusRaw) return;
      const status = { PRESENT: 'P', ABSENT: 'A', LEAVE: 'L', 'HALF DAY': 'HD', HALFDAY: 'HD', 'ON DUTY': 'OD', ONDUTY: 'OD' }[statusRaw] || statusRaw;
      let date = normDate(dateRaw);
      if (date && iso(parseISO(date)) !== date) date = null;
      if (!empId) return errors.push({ row, message: 'Missing Employee ID' });
      if (!users.byEmp(empId)) return errors.push({ row, message: `Unknown Employee ID "${empId}"` });
      if (!date) return errors.push({ row, message: `Invalid date "${dateRaw}"` });
      if (!STATUS[status]) return errors.push({ row, message: `Invalid status "${statusRaw}" (use P, A, L, HD, OD)` });
      valid.push({ empId, date, status, inTime: normTime(pick(o, ['intime', 'in', 'checkin', 'punchin'])), outTime: normTime(pick(o, ['outtime', 'out', 'checkout', 'punchout'])) });
    });
    return { valid, errors };
  },
  TEMPLATE_HEADERS: ['Employee ID', 'Name', 'Department', 'Date', 'Status', 'In Time', 'Out Time'],
};

// ---------- leaves ----------
function notify(to, text, extra = {}) {
  db.notifications.unshift({ id: uid('NT'), to, text, sub: extra.sub || '', link: extra.link || '', priority: extra.priority || '', at: new Date().toISOString(), read: false });
}

const leaves = {
  all: () => db.leaves,
  byId: (id) => db.leaves.find((l) => l.id === id),
  forEmp: (empId) => db.leaves.filter((l) => l.empId === empId).sort((a, b) => b.appliedAt.localeCompare(a.appliedAt)),
  forDept: (dept) => db.leaves.filter((l) => users.byEmp(l.empId)?.dept === dept),
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
// Audience groups a Dean/Principal can target. Membership is derived from the
// user's role (students) or their `company` (staff split).
const ANNOUNCEMENT_AUDIENCES = [
  { id: 'students', label: 'Students' },
  { id: 'doctors', label: 'Doctors' },
  { id: 'college', label: 'Faculty / College staff' },
  { id: 'hospital', label: 'Hospital staff' },
  { id: 'other', label: 'Other staff' },
];
const COMPANY_GROUP = { 'AIMS-DOCTORS': 'doctors', 'AIMS-COLLEGE': 'college', 'AIMS-HOSPITAL': 'hospital', 'AIMS-OTHER STAFF': 'other' };

const announcements = {
  AUDIENCES: ANNOUNCEMENT_AUDIENCES,
  all: () => db.announcements.slice().sort((a, b) => b.at.localeCompare(a.at)),
  // Which audience groups a user belongs to.
  groupsOf(user) {
    if (!user) return [];
    if (user.role === 'student') return ['students'];
    const g = COMPANY_GROUP[user.company];
    return g ? [g] : [];
  },
  // Can this user see this announcement?
  visibleTo(a, user) {
    const aud = (a.audience && a.audience.length) ? a.audience : ['all'];
    if (aud.includes('all')) return true;
    if (!user) return false;
    // Admin / Principal / Dean / HOD always see every notice (oversight).
    if (['admin', 'principal', 'dean', 'hod'].includes(user.role)) return true;
    return aud.some((g) => announcements.groupsOf(user).includes(g));
  },
  forUser: (user) => announcements.all().filter((a) => announcements.visibleTo(a, user)),
  // Human-readable audience label for a notice.
  audienceLabel(a) {
    const aud = (a.audience && a.audience.length) ? a.audience : ['all'];
    if (aud.includes('all')) return 'Everyone';
    return aud.map((g) => ANNOUNCEMENT_AUDIENCES.find((x) => x.id === g)?.label || g).join(', ');
  },
  // Priority badge metadata ({ label, cls }) for a notice or priority string.
  priorityMeta(x) {
    const p = (typeof x === 'string' ? x : x?.priority) || 'medium';
    const map = { low: ['Low', 'badge-muted'], medium: ['Medium', 'badge-warn'], high: ['High', 'badge-bad'] };
    const [label, cls] = map[p] || map.medium;
    return { label, cls, priority: p };
  },
  add(title, body, by, audience = ['all'], priority = 'medium', pdf = null) {
    const aud = Array.isArray(audience) && audience.length ? audience : ['all'];
    const prio = ['low', 'medium', 'high'].includes(priority) ? priority : 'medium';
    const att = pdf && pdf.dataUrl ? { name: pdf.name || 'attachment.pdf', dataUrl: pdf.dataUrl, size: pdf.size || 0 } : null;
    db.announcements.push({ id: uid('AN'), title, body, by, at: new Date().toISOString(), audience: aud, priority: prio, pdf: att });
    // Push a bell notification to everyone in the target audience (not the poster).
    db.users.forEach((u) => {
      if (u.empId === by) return;
      const inAud = aud.includes('all') || announcements.groupsOf(u).some((g) => aud.includes(g));
      if (inAud) notify(u.empId, `New announcement: ${title}`, { sub: body, link: '#announcements', priority: prio });
    });
    save();
  },
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
  inr: (n) => (n == null || n === '' ? '—' : `₹${Number(n).toLocaleString('en-IN')}`),
  MONTHS,
};

// ---------- fees ----------
const fees = {
  rates: () => ({ ...FEE_BY_CATEGORY }),
  rate: (cat) => FEE_BY_CATEGORY[cat] || 0,
  academicYear: () => CURRENT_AY,
  paymentsFor: (roll, ay = CURRENT_AY) => (db.feePayments || [])
    .filter((p) => p.roll === roll && p.academicYear === ay)
    .sort((a, b) => b.at.localeCompare(a.at)),
  summaryFor(roll) {
    const u = users.byRoll(roll);
    const category = u?.category || null;
    const annual = category ? FEE_BY_CATEGORY[category] : 0;
    const payments = fees.paymentsFor(roll);
    const paid = payments.reduce((s, p) => s + (p.amount || 0), 0);
    const balance = Math.max(0, annual - paid);
    const percent = annual > 0 ? Math.min(100, Math.round((paid / annual) * 100)) : 0;
    const status = !category ? 'none' : (annual > 0 && paid >= annual) ? 'paid' : paid > 0 ? 'partial' : 'pending';
    return { category, annual, paid, balance, percent, status, academicYear: CURRENT_AY, payments };
  },
  recordPayment({ roll, amount, mode = 'Cash', reference = '', recordedBy, academicYear = CURRENT_AY }) {
    const amt = Math.round(+amount || 0);
    if (!(amt > 0)) throw new Error('Enter a valid payment amount');
    if (!users.byRoll(roll)) throw new Error(`Unknown roll number ${roll}`);
    const p = { id: uid('FEE'), roll, academicYear, amount: amt, at: new Date().toISOString(), mode, reference, recordedBy };
    (db.feePayments = db.feePayments || []).push(p);
    notify(roll, `Fee payment of ${fmt.inr(amt)} recorded for ${academicYear}`);
    save();
    return p;
  },
};

const DEMO = [
  { role: 'admin', label: 'Admin', username: 'admin', password: 'admin123', empId: 'ADM001' },
  { role: 'principal', label: 'Principal', username: 'c024', password: 'aims@123', empId: 'C024' },
  { role: 'dean', label: 'Dean', username: '755', password: 'aims@123', empId: '755' },
  { role: 'hod', label: 'HOD (Pathology)', username: '817', password: 'aims@123', empId: '817' },
  { role: 'faculty', label: 'Faculty / Staff', username: '1140', password: 'aims@123', empId: '1140' },
  { role: 'student', label: 'Student (MBBS)', username: '2501052001', password: '2501052001', empId: '2501052001' },
];

export const ERP = {
  INSTITUTION, DEPARTMENTS, LEAVE_TYPES, STATUS, LEAVE_STATE, FEE_BY_CATEGORY,
  util: { iso, today, parseISO, daysBetween, workingDays, isSunday, uid },
  db: () => db, save, reset, ready, isReady, subscribe,
  users, auth, attendance, leaves, announcements, notifications, fees, fmt,
  DEMO,
};

export default ERP;
