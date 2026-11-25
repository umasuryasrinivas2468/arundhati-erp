/* Arundhati ERP — self-hosted server (EC2): static files + /api/* + SQLite. Node >= 22.13, no npm deps.
 *
 *   node server.js                      serve on PORT (default 3000)
 *   node server.js import <db.json>     load a full ERP JSON blob (e.g. exported from Supabase)
 *
 * Env: PORT, DB_PATH (default ./data/erp.db — keep it OUTSIDE the served folders).
 *
 * Passwords never leave the server: scrypt hashes in their own table. Every request after
 * /api/login carries an HttpOnly session cookie, and:
 *   GET  /api/db  -> only what that user may see (view() below)
 *   POST /api/op  {op, args} -> one write, run through the shared rules + permission checks
 *                   in js/core.js against the server's copy, then the refreshed view.
 * The bulky seed files (staff/student rosters, attendance) are served as empty stubs.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const CORE = require('./js/core.js');

const ROOT = __dirname;
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'data', 'erp.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const sql = new DatabaseSync(DB_PATH);
sql.exec(`PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS state (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS passwords (empId TEXT PRIMARY KEY, hash TEXT NOT NULL);`);

const ROW = 'arundhati-erp:v3';
// The whole ERP state is one JSON row, cached in memory (single process, so the cache is the truth).
let cache;
const getState = () => { if (cache === undefined) { const r = sql.prepare('SELECT data FROM state WHERE id=?').get(ROW); cache = r ? JSON.parse(r.data) : null; } return cache; };
const putState = (db) => { sql.prepare('INSERT INTO state VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at')
  .run(ROW, JSON.stringify(db), new Date().toISOString()); cache = db; };

const hash = (pw) => { const salt = crypto.randomBytes(16).toString('hex'); return `${salt}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`; };
const verify = (pw, stored) => {
  if (!stored) return false;
  const [salt, h] = stored.split(':');
  return crypto.timingSafeEqual(Buffer.from(h, 'hex'), crypto.scryptSync(String(pw), salt, 32));
};
const setPassword = (empId, pw) => sql.prepare('INSERT INTO passwords VALUES (?,?) ON CONFLICT(empId) DO UPDATE SET hash=excluded.hash').run(String(empId), hash(String(pw)));
const getHash = (empId) => sql.prepare('SELECT hash FROM passwords WHERE empId=?').get(String(empId))?.hash;

// Pull plaintext passwords out of an incoming blob. `canSet(empId)` decides whose may be written.
function stripPasswords(db, canSet) {
  for (const u of db.users || []) {
    if (typeof u.password === 'string' && u.password && canSet(u.empId)) setPassword(u.empId, u.password);
    delete u.password;
  }
  return db;
}

if (process.argv[2] === 'import') {
  const db = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const blob = db.db || db.data || db; // accepts {db}, a Supabase row {data}, or the raw blob
  sql.exec('BEGIN'); putState(stripPasswords(blob, () => true)); sql.exec('COMMIT');
  console.log(`imported ${blob.users?.length ?? 0} users into ${DB_PATH}`);
  process.exit(0);
}

// ---------- sessions (in memory: a restart signs everyone out) ----------
const sessions = new Map(); // sid -> { empId, role, exp }
const TTL = 12 * 3600 * 1000;
function session(req) {
  const sid = /(?:^|;\s*)sid=([a-f0-9]{64})/.exec(req.headers.cookie || '')?.[1];
  const s = sid && sessions.get(sid);
  if (!s || s.exp < Date.now()) { if (s) sessions.delete(sid); return null; }
  return { sid, ...s };
}
const cookie = (sid, maxAge) => `sid=${sid}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;

// Failed-login throttle per IP: 10 misses / 15 min.
const fails = new Map();
const ipOf = (req) => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
const throttled = (ip) => { const f = fails.get(ip); return f && f.n >= 10 && f.until > Date.now(); };
const miss = (ip) => { const f = fails.get(ip); fails.set(ip, f && f.until > Date.now() ? { n: f.n + 1, until: f.until } : { n: 1, until: Date.now() + 15 * 60e3 }); };

function findUser(db, login) {
  const q = String(login || '').trim().toLowerCase();
  return (db?.users || []).filter((x) => String(x.username || '').toLowerCase() === q || String(x.empId).toLowerCase() === q || (x.email && x.email.toLowerCase() === q));
}

// ---------- http ----------
const json = (res, code, body, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(body)); };
function readBody(req, limit = 25e6) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

async function api(req, res, p) {
  if (p === '/api/login' && req.method === 'POST') {
    const ip = ipOf(req);
    if (throttled(ip)) return json(res, 429, { ok: false, error: 'Too many attempts. Try again in 15 minutes.' });
    const { username, password } = await readBody(req, 1e4);
    const u = findUser(getState(), username).find((x) => verify(password, getHash(x.empId)));
    if (!u) { miss(ip); return json(res, 401, { ok: false, error: 'Invalid username or password' }); }
    fails.delete(ip);
    const sid = crypto.randomBytes(32).toString('hex');
    sessions.set(sid, { empId: u.empId, role: u.role, exp: Date.now() + TTL });
    return json(res, 200, { ok: true, user: { empId: u.empId, name: u.name, role: u.role } }, { 'Set-Cookie': cookie(sid, TTL / 1000) });
  }
  if (p === '/api/logout') { const s = session(req); if (s) sessions.delete(s.sid); return json(res, 200, { ok: true }, { 'Set-Cookie': cookie('', 0) }); }

  const s = session(req);
  if (!s) {
    const u = getState()?.users || [];
    const stats = { staff: u.filter((x) => x.role !== 'admin' && x.role !== 'student').length, students: u.filter((x) => x.role === 'student').length };
    return json(res, 401, { ok: false, error: 'Not signed in', stats });
  }

  if (p === '/api/password' && req.method === 'POST') {
    const { current, next } = await readBody(req, 1e4);
    if (!verify(current, getHash(s.empId))) return json(res, 400, { ok: false, error: 'Current password is incorrect' });
    if (typeof next !== 'string' || next.length < 6) return json(res, 400, { ok: false, error: 'New password must be at least 6 characters' });
    setPassword(s.empId, next);
    return json(res, 200, { ok: true });
  }

  const db = getState();
  const actor = db && CORE.byEmp(db, s.empId);
  if (!actor) { sessions.delete(s.sid); return json(res, 401, { ok: false, error: 'Not signed in' }); }

  if (p === '/api/db' && req.method === 'GET') return json(res, 200, { ok: true, db: view(db, actor) });

  if (p === '/api/op' && req.method === 'POST') {
    const { op, args = {} } = await readBody(req);
    const fn = Object.hasOwn(CORE.ops, op) && CORE.ops[op];
    if (!fn || typeof args !== 'object') return json(res, 400, { ok: false, error: 'Unknown operation' });
    // Passwords go to the hash table, never into the shared state.
    const holder = op === 'user.add' ? args.user : op === 'user.update' ? args.patch : null;
    const pw = holder ? holder.password : undefined; if (holder) delete holder.password;
    if (op === 'user.add' && !(typeof pw === 'string' && pw.length >= 4)) return json(res, 400, { ok: false, error: 'Password must be at least 4 characters.' });
    if (pw != null && pw !== '' && !(typeof pw === 'string' && pw.length >= 4)) return json(res, 400, { ok: false, error: 'Password must be at least 4 characters.' });
    const draft = structuredClone(db); // a failed op must not leave half-applied changes in the cache
    let result;
    try { result = fn(draft, CORE.byEmp(draft, actor.empId), args); } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
    sql.exec('BEGIN');
    try {
      putState(draft);
      if (pw) setPassword(op === 'user.add' ? args.user.empId : args.empId, pw);
      if (op === 'user.remove') sql.prepare('DELETE FROM passwords WHERE empId=?').run(String(args.empId));
      sql.exec('COMMIT');
    } catch (e) { sql.exec('ROLLBACK'); cache = undefined; throw e; }
    return json(res, 200, { ok: true, result: result ?? null, db: view(draft, CORE.byEmp(draft, actor.empId) || actor) });
  }
  return json(res, 404, { ok: false, error: 'Not found' });
}

// What each role may read. Leaders (admin/principal/dean) see everything; a HOD sees their
// department; everyone else sees their own records. Other people's contact details and the
// student roster are only visible to leaders (and a HOD for their own department).
const LEADERS = ['admin', 'principal', 'dean'];
const publicUser = ({ empId, name, role, designation, dept }) => ({ empId, name, role, designation, dept });
function view(db, actor) {
  const all = LEADERS.includes(actor.role);
  const dept = actor.role === 'hod' ? actor.dept : undefined;
  const deptOf = new Map(db.users.map((u) => [u.empId, u.dept]));
  const sees = (empId) => all || empId === actor.empId || (dept !== undefined && deptOf.get(empId) === dept);
  return {
    ...db,
    users: db.users.filter((u) => all || u.empId === actor.empId || u.role !== 'student').map((u) => (sees(u.empId) ? u : publicUser(u))),
    attendance: db.attendance.filter((r) => sees(r.empId)),
    leaves: db.leaves.filter((l) => sees(l.empId)),
    notifications: db.notifications.filter((n) => n.to === actor.empId),
  };
}

// Seed files hold every staff member, student and attendance row; the server has the real data,
// so browsers only get the department list.
const seedCtx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'employees.js'), 'utf8'), seedCtx);
const STUBS = {
  '/js/employees.js': `window.ERP_SEED=${JSON.stringify({ departments: seedCtx.window.ERP_SEED.departments, employees: [] })};`,
  '/js/students.js': 'window.ERP_STUDENTS=[];',
  '/js/attendance-seed.js': 'window.ERP_ATTENDANCE_SEED=[];',
};

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json' };
const PUBLIC_DIRS = new Set(['js', 'css', 'assets']);

function serveStatic(req, res, p) {
  if (p === '/') p = '/index.html';
  if (STUBS[p]) { res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-cache' }); return res.end(STUBS[p]); }
  const parts = p.split('/').filter(Boolean);
  const ok = parts.every((x) => !x.startsWith('.')) &&
    ((parts.length === 1 && parts[0].endsWith('.html')) || (parts.length > 1 && PUBLIC_DIRS.has(parts[0])));
  const file = path.join(ROOT, ...parts);
  if (!ok || !file.startsWith(ROOT + path.sep)) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(buf);
  });
}

http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
  if (p.startsWith('/api/')) return api(req, res, p).catch((e) => json(res, 500, { ok: false, error: String(e.message || e) }));
  serveStatic(req, res, p);
}).listen(process.env.PORT || 3000, '127.0.0.1', () => console.log(`arundhati-erp on 127.0.0.1:${process.env.PORT || 3000}, db ${DB_PATH}`));
