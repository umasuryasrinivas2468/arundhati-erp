/* Arundhati ERP — the /api/* logic, shared by server.js (EC2 + SQLite) and api/handler.js (Vercel + Supabase).
 *
 * createApi(store, secret) -> async (req, res, path). `store` is async:
 *   load() -> { db, ver }          the whole ERP state (one JSON blob) + a version for optimistic writes
 *   save(db, ver) -> bool          false = someone else wrote first (the op is retried on fresh state)
 *   getHash(empId) / setPassword(empId, pw) / deletePassword(empId)
 *
 * Passwords never leave the server: scrypt hashes in their own table. /api/login sets an HttpOnly
 * cookie signed with `secret` (stateless, so it works on serverless), and then:
 *   GET  /api/db  -> only what that user may see (view() below)
 *   POST /api/op  {op, args} -> one write, run through the shared rules + permission checks in js/core.js
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const CORE = require('../js/core.js');

const hash = (pw) => { const salt = crypto.randomBytes(16).toString('hex'); return `${salt}:${crypto.scryptSync(String(pw), salt, 32).toString('hex')}`; };
function verify(pw, stored) {
  if (!stored) return false;
  const [salt, h] = stored.split(':');
  return crypto.timingSafeEqual(Buffer.from(h, 'hex'), crypto.scryptSync(String(pw), salt, 32));
}
const sameText = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// Pull plaintext passwords out of an imported blob into the hash table.
async function stripPasswords(db, store) {
  for (const u of db.users || []) {
    if (typeof u.password === 'string' && u.password) await store.setPassword(u.empId, u.password);
    delete u.password;
  }
  return db;
}

// What each role may read. Leaders (admin/principal/dean) see everything; a HOD sees their
// department; everyone else sees their own records. Other people's contact details and the
// student roster are only visible to leaders (and a HOD for their own department).
const LEADERS = ['admin', 'principal', 'dean'];
const publicUser = ({ empId, name, role, designation, dept }) => ({ empId, name, role, designation, dept });
const noPassword = ({ password, ...u }) => u;
function view(db, actor) {
  const all = LEADERS.includes(actor.role);
  const dept = actor.role === 'hod' ? actor.dept : undefined;
  const deptOf = new Map(db.users.map((u) => [u.empId, u.dept]));
  const sees = (empId) => all || empId === actor.empId || (dept !== undefined && deptOf.get(empId) === dept);
  return {
    ...db,
    users: db.users.filter((u) => all || u.empId === actor.empId || u.role !== 'student').map((u) => (sees(u.empId) ? noPassword(u) : publicUser(u))),
    attendance: db.attendance.filter((r) => sees(r.empId)),
    leaves: db.leaves.filter((l) => sees(l.empId)),
    notifications: db.notifications.filter((n) => n.to === actor.empId),
    // PDF bytes stay on the server (GET /api/announcement-pdf); the view only carries name + size.
    announcements: db.announcements.filter((a) => CORE.visibleTo(a, actor)).map((a) => (a.pdf ? { ...a, pdf: { name: a.pdf.name, size: a.pdf.size } } : a)),
    feePayments: (db.feePayments || []).filter((f) => all || f.roll === actor.empId),
  };
}

// Seed files hold every staff member, student and attendance row; the server has the real data,
// so browsers only get the department list.
const seedCtx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'employees.js'), 'utf8'), seedCtx);
const STUBS = {
  '/js/employees.js': `window.ERP_SEED=${JSON.stringify({ departments: seedCtx.window.ERP_SEED.departments, employees: [] })};`,
  '/js/students.js': 'window.ERP_STUDENTS=[];',
  '/js/attendance-seed.js': 'window.ERP_ATTENDANCE_SEED=[];',
};

const json = (res, code, body, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(body)); };
function readBody(req, limit = 25e6) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function findUser(db, login) {
  const q = String(login || '').trim().toLowerCase();
  return (db?.users || []).filter((x) => String(x.username || '').toLowerCase() === q || String(x.empId).toLowerCase() === q || (x.email && x.email.toLowerCase() === q));
}

function createApi(store, secret) {
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');

  // ---------- sessions: "empId.expiry.hmac" in an HttpOnly cookie ----------
  const TTL = 12 * 3600 * 1000;
  const sign = (s) => crypto.createHmac('sha256', secret).update(s).digest('base64url');
  const token = (empId) => { const s = `${Buffer.from(empId).toString('base64url')}.${Date.now() + TTL}`; return `${s}.${sign(s)}`; };
  function session(req) {
    const t = /(?:^|;\s*)sid=([\w-]+\.\d+\.[\w-]+)/.exec(req.headers.cookie || '')?.[1];
    if (!t) return null;
    const [id, exp, mac] = t.split('.');
    if (!sameText(mac, sign(`${id}.${exp}`)) || Number(exp) < Date.now()) return null;
    return { empId: Buffer.from(id, 'base64url').toString() };
  }
  // ponytail: logout only clears the cookie; a copied token stays valid until it expires (12h). Add a revocation list if that matters.
  const cookie = (v, maxAge) => `sid=${v}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;

  // Failed-login throttle per IP: 10 misses / 15 min.
  // ponytail: in memory, so on serverless each instance counts separately. Move to the store if brute force shows up.
  const fails = new Map();
  const ipOf = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  const throttled = (ip) => { const f = fails.get(ip); return f && f.n >= 10 && f.until > Date.now(); };
  const miss = (ip) => { const f = fails.get(ip); fails.set(ip, f && f.until > Date.now() ? { n: f.n + 1, until: f.until } : { n: 1, until: Date.now() + 15 * 60e3 }); };

  // A user's password: the hash table wins; a plaintext left in an un-migrated blob still works until they get a hash.
  async function checkPassword(u, pw) {
    const h = await store.getHash(u.empId);
    if (h) return verify(pw, h);
    if (typeof u.password === 'string' && u.password && sameText(pw, u.password)) { await store.setPassword(u.empId, pw); return true; }
    return false;
  }

  return async function api(req, res, p) {
    if (p === '/api/login' && req.method === 'POST') {
      const ip = ipOf(req);
      if (throttled(ip)) return json(res, 429, { ok: false, error: 'Too many attempts. Try again in 15 minutes.' });
      const { username, password } = await readBody(req, 1e4);
      const { db } = await store.load();
      let u = null;
      for (const x of findUser(db, username)) if (await checkPassword(x, password)) { u = x; break; }
      if (!u) { miss(ip); return json(res, 401, { ok: false, error: 'Invalid username or password' }); }
      fails.delete(ip);
      return json(res, 200, { ok: true, user: { empId: u.empId, name: u.name, role: u.role } }, { 'Set-Cookie': cookie(token(u.empId), TTL / 1000) });
    }
    if (p === '/api/logout') return json(res, 200, { ok: true }, { 'Set-Cookie': cookie('', 0) });

    const s = session(req);
    if (!s) {
      const u = (await store.load()).db?.users || [];
      const stats = { staff: u.filter((x) => x.role !== 'admin' && x.role !== 'student').length, students: u.filter((x) => x.role === 'student').length };
      return json(res, 401, { ok: false, error: 'Not signed in', stats });
    }

    if (p === '/api/password' && req.method === 'POST') {
      const { current, next } = await readBody(req, 1e4);
      const me = CORE.byEmp((await store.load()).db, s.empId);
      if (!me || !(await checkPassword(me, current))) return json(res, 400, { ok: false, error: 'Current password is incorrect' });
      if (typeof next !== 'string' || next.length < 6) return json(res, 400, { ok: false, error: 'New password must be at least 6 characters' });
      await store.setPassword(s.empId, next);
      return json(res, 200, { ok: true });
    }

    if (p === '/api/db' && req.method === 'GET') {
      const { db } = await store.load();
      const actor = db && CORE.byEmp(db, s.empId);
      if (!actor) return json(res, 401, { ok: false, error: 'Not signed in' }, { 'Set-Cookie': cookie('', 0) });
      return json(res, 200, { ok: true, db: view(db, actor) });
    }

    if (p === '/api/announcement-pdf' && req.method === 'GET') {
      const { db } = await store.load();
      const actor = db && CORE.byEmp(db, s.empId);
      const a = actor && db.announcements.find((x) => x.id === new URL(req.url, 'http://x').searchParams.get('id'));
      if (!a || !a.pdf || !CORE.visibleTo(a, actor)) return json(res, 404, { ok: false, error: 'Not found' });
      const name = a.pdf.name.replace(/[^\w.\- ]+/g, '_');
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${name}"`, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
      return res.end(Buffer.from(a.pdf.dataUrl.slice(a.pdf.dataUrl.indexOf(',') + 1), 'base64'));
    }

    if (p === '/api/op' && req.method === 'POST') {
      const { op, args = {} } = await readBody(req);
      const fn = Object.hasOwn(CORE.ops, op) && CORE.ops[op];
      if (!fn || !args || typeof args !== 'object') return json(res, 400, { ok: false, error: 'Unknown operation' });
      // Passwords go to the hash table, never into the shared state.
      const holder = op === 'user.add' ? args.user : op === 'user.update' ? args.patch : null;
      const pw = holder ? holder.password : undefined; if (holder) delete holder.password;
      if (op === 'user.add' && !(typeof pw === 'string' && pw.length >= 4)) return json(res, 400, { ok: false, error: 'Password must be at least 4 characters.' });
      if (pw != null && pw !== '' && !(typeof pw === 'string' && pw.length >= 4)) return json(res, 400, { ok: false, error: 'Password must be at least 4 characters.' });
      for (let attempt = 0; attempt < 5; attempt++) {
        const { db, ver } = await store.load();
        const actor = db && CORE.byEmp(db, s.empId);
        if (!actor) return json(res, 401, { ok: false, error: 'Not signed in' }, { 'Set-Cookie': cookie('', 0) });
        const draft = structuredClone(db); // a failed op must not leave half-applied changes
        let result;
        try { result = fn(draft, CORE.byEmp(draft, actor.empId), structuredClone(args)); } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
        if (!(await store.save(draft, ver))) continue; // lost a race: rerun the op on the fresh state
        if (pw) await store.setPassword(op === 'user.add' ? args.user.empId : args.empId, pw);
        if (op === 'user.remove') await store.deletePassword(args.empId);
        return json(res, 200, { ok: true, result: result ?? null, db: view(draft, CORE.byEmp(draft, actor.empId) || actor) });
      }
      return json(res, 409, { ok: false, error: 'The server is busy, please try again.' });
    }
    return json(res, 404, { ok: false, error: 'Not found' });
  };
}

module.exports = { createApi, stripPasswords, hash, json, STUBS };
