/* Arundhati ERP — shared rules: constants, helpers and every write operation, with who may do it.
 * Runs in the browser (offline/local mode, via data.js) AND in server.js (authoritative).
 * Each op is (db, actor, args) -> result; it mutates db and throws Error on bad input or no permission.
 */
(function (root) {
  const LEAVE_TYPES = [
    { code: 'CL', name: 'Casual Leave' },
    { code: 'AL', name: 'Academic Leave' },
    { code: 'OD', name: 'On Duty' },
    { code: 'LOP', name: 'Loss of Pay' },
  ];
  // Yearly entitlement (days) by staff category (employees.js → leaveCategory). null = no cap; 0 = not entitled.
  const LEAVE_CATEGORY_QUOTAS = {
    doctor:      { CL: 24, AL: 8, OD: 10, LOP: null }, // CL 24 = 2/month (biometric CLS column)
    teaching:    { CL: 12, AL: 0, OD: 10, LOP: null },
    nonteaching: { CL: 12, AL: 0, OD: 10, LOP: null },
  };
  const DEFAULT_LEAVE_CATEGORY = 'nonteaching';
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
  const PENDING = [LEAVE_STATE.PENDING_HOD, LEAVE_STATE.PENDING_PRINCIPAL];

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
  const workingDays = (from, to) => daysBetween(from, to).filter((d) => !isSunday(d)); // Mon–Sat
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDate = (s) => { if (!s) return '—'; const d = parseISO(s.slice(0, 10)); return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  const byEmp = (db, id) => db.users.find((u) => u.empId === id);
  const hodOf = (db, dept) => db.users.find((u) => u.role === 'hod' && u.dept === dept);
  const principalOf = (db) => db.users.find((u) => u.role === 'principal');
  const deny = () => { throw new Error('You are not allowed to do that'); };
  const need = (actor, roles) => { if (!actor || !roles.includes(actor.role)) deny(); };
  function notify(db, to, text) { db.notifications.unshift({ id: uid('NT'), to, text, at: new Date().toISOString(), read: false }); }

  // ---------- reads used by the rules ----------
  function pendingFor(db, user) {
    if (user.role === 'hod') return db.leaves.filter((l) => l.status === LEAVE_STATE.PENDING_HOD && byEmp(db, l.empId)?.dept === user.dept);
    if (user.role === 'principal') return db.leaves.filter((l) => l.status === LEAVE_STATE.PENDING_PRINCIPAL);
    return [];
  }
  function balance(db, empId) {
    const year = String(new Date().getFullYear());
    const u = byEmp(db, empId);
    const quotas = LEAVE_CATEGORY_QUOTAS[(u && u.leaveCategory) || DEFAULT_LEAVE_CATEGORY] || LEAVE_CATEGORY_QUOTAS[DEFAULT_LEAVE_CATEGORY];
    return LEAVE_TYPES.map((t) => {
      const quota = quotas[t.code] === undefined ? null : quotas[t.code];
      const mine = db.leaves.filter((l) => l.empId === empId && l.type === t.code);
      const used = mine.filter((l) => l.status === LEAVE_STATE.APPROVED && l.from.startsWith(year)).reduce((s, l) => s + l.days, 0);
      const pending = mine.filter((l) => PENDING.includes(l.status)).reduce((s, l) => s + l.days, 0);
      return { ...t, quota, used, pending, remaining: quota == null ? null : quota - used };
    });
  }

  // ---------- write operations ----------
  const USER_FIELDS = ['name', 'username', 'role', 'dept', 'designation', 'email', 'phone', 'joinDate', 'leaveCategory', 'password'];
  const ROLES = ['admin', 'principal', 'dean', 'hod', 'faculty', 'student'];
  const pickUser = (u) => Object.fromEntries(USER_FIELDS.filter((k) => u[k] !== undefined).map((k) => [k, u[k]]));

  const ops = {
    'leave.apply'(db, actor, { type, from, to, reason, halfDay = false }) {
      if (!actor || ['student', 'admin'].includes(actor.role)) deny();
      const empId = actor.empId;
      if (!LEAVE_TYPES.some((t) => t.code === type)) throw new Error('Choose a leave type');
      if (!ISO_DATE.test(from || '') || !ISO_DATE.test(to || '') || to < from) throw new Error('Choose a valid date range');
      if (!reason || String(reason).trim().length < 5) throw new Error('Please give a reason (min 5 characters)');
      const days = halfDay ? 0.5 : workingDays(from, to).length;
      if (!days) throw new Error('Selected range has no working days');
      const overlap = db.leaves.find((l) => l.empId === empId && ![LEAVE_STATE.REJECTED, LEAVE_STATE.CANCELLED].includes(l.status) && l.from <= to && l.to >= from);
      if (overlap) throw new Error(`Overlaps with an existing leave (${fmtDate(overlap.from)} – ${fmtDate(overlap.to)})`);
      const bal = balance(db, empId).find((b) => b.code === type);
      if (bal.quota != null && bal.remaining - bal.pending < days) throw new Error(`Insufficient ${bal.name} balance (${bal.remaining - bal.pending} available)`);
      const status = actor.role === 'faculty' && hodOf(db, actor.dept) ? LEAVE_STATE.PENDING_HOD : LEAVE_STATE.PENDING_PRINCIPAL;
      const l = { id: uid('LV'), empId, type, from, to, days, halfDay: !!halfDay, reason: String(reason).trim(), status, appliedAt: new Date().toISOString(), history: [] };
      db.leaves.push(l);
      const approver = status === LEAVE_STATE.PENDING_HOD ? hodOf(db, actor.dept) : principalOf(db);
      if (approver) notify(db, approver.empId, `${actor.name} applied for ${type} (${days} day${days === 1 ? '' : 's'})`);
      return l;
    },
    // HOD approve = recommend -> Principal. Only the person the leave is waiting on may act.
    'leave.act'(db, actor, { id, action, remark = '' }) {
      const l = db.leaves.find((x) => x.id === id);
      if (!l) throw new Error('Leave not found');
      if (!actor || !pendingFor(db, actor).includes(l)) throw new Error('You cannot act on this request');
      const at = new Date().toISOString();
      remark = String(remark || '');
      if (action === 'reject') {
        l.status = LEAVE_STATE.REJECTED;
        l.history.push({ by: actor.empId, role: actor.role, action: 'Rejected', remark, at });
        notify(db, l.empId, `Your ${l.type} leave from ${fmtDate(l.from)} was rejected by ${actor.designation}`);
      } else if (actor.role === 'hod') {
        l.status = LEAVE_STATE.PENDING_PRINCIPAL;
        l.history.push({ by: actor.empId, role: actor.role, action: 'Recommended', remark, at });
        notify(db, l.empId, `Your ${l.type} leave was recommended by HOD and forwarded to Principal`);
        const p = principalOf(db); if (p) notify(db, p.empId, `Leave from ${byEmp(db, l.empId)?.name} awaiting approval`);
      } else {
        l.status = LEAVE_STATE.APPROVED;
        l.history.push({ by: actor.empId, role: actor.role, action: 'Approved', remark, at });
        notify(db, l.empId, `Your ${l.type} leave from ${fmtDate(l.from)} was approved`);
      }
      return l;
    },
    'leave.cancel'(db, actor, { id }) {
      const l = db.leaves.find((x) => x.id === id);
      if (!l || !actor || l.empId !== actor.empId) deny();
      if (!PENDING.includes(l.status)) throw new Error('Only pending requests can be cancelled');
      l.status = LEAVE_STATE.CANCELLED;
      l.history.push({ by: actor.empId, role: 'self', action: 'Cancelled', remark: '', at: new Date().toISOString() });
      return l;
    },

    // rows: [{empId, date, status, inTime, outTime}], already validated client-side; re-checked here. Same empId+date overwrites.
    'attendance.import'(db, actor, { rows, fileName }) {
      need(actor, ['admin']);
      if (!Array.isArray(rows) || !rows.length) throw new Error('No rows to import');
      const clean = rows.map((r) => ({ empId: String(r.empId), date: String(r.date), status: String(r.status), inTime: String(r.inTime || ''), outTime: String(r.outTime || '') }));
      const bad = clean.find((r) => !byEmp(db, r.empId) || !ISO_DATE.test(r.date) || !STATUS[r.status]);
      if (bad) throw new Error(`Invalid row: ${bad.empId} ${bad.date} ${bad.status}`);
      const id = uid('UP');
      const key = (r) => `${r.empId}|${r.date}`;
      const incoming = new Map(clean.map((r) => [key(r), { ...r, uploadId: id }]));
      let replaced = 0;
      db.attendance = db.attendance.filter((r) => { if (incoming.has(key(r))) { replaced++; return false; } return true; });
      db.attendance.push(...incoming.values());
      const dates = clean.map((r) => r.date).sort();
      const up = { id, fileName: String(fileName || 'upload'), uploadedBy: actor.empId, at: new Date().toISOString(), rows: incoming.size, replaced, from: dates[0], to: dates[dates.length - 1] };
      db.uploads.unshift(up);
      new Set(clean.map((r) => r.empId)).forEach((e) => notify(db, e, `Attendance updated for ${fmtDate(up.from)} – ${fmtDate(up.to)}`));
      return up;
    },
    'attendance.deleteUpload'(db, actor, { id }) {
      need(actor, ['admin']);
      db.attendance = db.attendance.filter((r) => r.uploadId !== id);
      db.uploads = db.uploads.filter((u) => u.id !== id);
    },

    'announcement.add'(db, actor, { title, body }) {
      need(actor, ['admin', 'principal', 'dean']);
      if (!String(title || '').trim() || !String(body || '').trim()) throw new Error('Title and message are required');
      const a = { id: uid('AN'), title: String(title).trim(), body: String(body).trim(), by: actor.empId, at: new Date().toISOString() };
      db.announcements.push(a);
      return a;
    },
    'announcement.remove'(db, actor, { id }) {
      const a = db.announcements.find((x) => x.id === id);
      if (!a || !actor || (actor.role !== 'admin' && a.by !== actor.empId)) deny();
      db.announcements = db.announcements.filter((x) => x.id !== id);
    },

    'notifications.markAllRead'(db, actor) {
      if (!actor) deny();
      db.notifications.forEach((n) => { if (n.to === actor.empId) n.read = true; });
    },

    'user.add'(db, actor, { user }) {
      need(actor, ['admin']);
      const u = { empId: String(user.empId || '').trim(), ...pickUser(user) };
      if (!u.empId || !u.name || !u.username || !ROLES.includes(u.role)) throw new Error('Employee ID, name, username and a valid role are required');
      if (db.users.some((x) => x.empId === u.empId)) throw new Error(`Employee ID ${u.empId} already exists`);
      if (db.users.some((x) => x.username === u.username)) throw new Error(`Username ${u.username} already taken`);
      db.users.push({ joinDate: today(), phone: '', ...u });
      return u;
    },
    'user.update'(db, actor, { empId, patch }) {
      need(actor, ['admin']);
      const u = byEmp(db, empId);
      if (!u) throw new Error('User not found');
      const p = pickUser(patch || {});
      if (p.role !== undefined && !ROLES.includes(p.role)) throw new Error('Invalid role');
      if (p.username && db.users.some((x) => x.username === p.username && x.empId !== empId)) throw new Error(`Username ${p.username} already taken`);
      if (empId === actor.empId && p.role && p.role !== 'admin') throw new Error('You cannot remove your own admin role.');
      Object.assign(u, p);
      return u;
    },
    'user.remove'(db, actor, { empId }) {
      need(actor, ['admin']);
      if (empId === actor.empId) throw new Error('You cannot remove yourself');
      db.users = db.users.filter((u) => u.empId !== empId);
    },
  };

  const CORE = {
    LEAVE_TYPES, LEAVE_CATEGORY_QUOTAS, DEFAULT_LEAVE_CATEGORY, STATUS, LEAVE_STATE,
    util: { pad, iso, today, parseISO, uid, isSunday, daysBetween, workingDays, fmtDate, MONTHS },
    byEmp, hodOf, pendingFor, balance, ops,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CORE; else root.ERP_CORE = CORE;
})(typeof window !== 'undefined' ? window : globalThis);
