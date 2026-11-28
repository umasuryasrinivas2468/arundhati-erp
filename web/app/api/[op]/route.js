/* CampusHub AIMS — the server API (Next.js Route Handler, data in Supabase).
 *
 *   POST /api/login     { username, password } -> sets an HttpOnly session cookie
 *   POST /api/logout
 *   POST /api/password  { current, next }      -> change your own password
 *   GET  /api/db        -> { ok, db, me }: only what the signed-in user may see (401 when signed out)
 *   PUT  /api/db        { db } (POST too, for sendBeacon): leaders write the whole state; everyone
 *                       else only gets their own allowed changes merged in (see merge()).
 *
 * The whole ERP state is ONE jsonb row in Supabase (erp_state), read/written via its REST API.
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (server only), SESSION_SECRET (>= 32 chars).
 */
import crypto from 'node:crypto';

export const dynamic = 'force-dynamic';

const ROW = 'arundhati-erp:v3';
const LEADERS = ['admin', 'principal', 'dean'];
const PENDING = ['Pending HOD', 'Pending Principal'];

// ---------- Supabase store ----------
async function sb(pathAndQuery, init = {}) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
  const r = await fetch(`${url.replace(/\/+$/, '')}/rest/v1${pathAndQuery}`, {
    ...init, cache: 'no-store',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers },
  });
  if (!r.ok) throw new Error(`Supabase ${init.method || 'GET'} failed (${r.status}): ${await r.text()}`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}
async function load() {
  const rows = await sb(`/erp_state?id=eq.${encodeURIComponent(ROW)}&select=data,updated_at`);
  return rows.length ? { db: rows[0].data, ver: rows[0].updated_at } : { db: null, ver: null };
}
// Optimistic write: false when someone else wrote since our load() (caller retries on fresh state).
async function save(db, ver) {
  const rows = await sb(`/erp_state?id=eq.${encodeURIComponent(ROW)}&updated_at=eq.${encodeURIComponent(ver)}&select=id`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ data: db, updated_at: new Date().toISOString() }),
  });
  return rows.length === 1;
}

// ---------- sessions: "base64url(empId).expiry.hmac" in an HttpOnly cookie ----------
const TTL = 12 * 3600;
function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
  return s;
}
const sign = (s) => crypto.createHmac('sha256', secret()).update(s).digest('base64url');
const sameText = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
function token(empId) { const s = `${Buffer.from(empId).toString('base64url')}.${Date.now() + TTL * 1000}`; return `${s}.${sign(s)}`; }
function session(req) {
  const t = /(?:^|;\s*)sid=([\w-]+\.\d+\.[\w-]+)/.exec(req.headers.get('cookie') || '')?.[1];
  if (!t) return null;
  const [id, exp, mac] = t.split('.');
  if (!sameText(mac, sign(`${id}.${exp}`)) || Number(exp) < Date.now()) return null;
  return Buffer.from(id, 'base64url').toString();
}
// ponytail: logout only clears the cookie; a copied token stays valid until it expires (12h). Add a revocation list if that matters.
const cookie = (v, maxAge) => `sid=${v}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;

// Failed-login throttle per IP: 10 misses / 15 min. One Node process on EC2, so in memory is enough.
const fails = new Map();
const ipOf = (req) => String(req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
const throttled = (ip) => { const f = fails.get(ip); return f && f.n >= 10 && f.until > Date.now(); };
const miss = (ip) => { const f = fails.get(ip); fails.set(ip, f && f.until > Date.now() ? { n: f.n + 1, until: f.until } : { n: 1, until: Date.now() + 15 * 60e3 }); };

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });
const byEmp = (db, empId) => db?.users?.find((u) => u.empId === empId);

// ---------- what each role may see ----------
// Admin: everything (the admin screens show login credentials). Principal/Dean: everything but passwords.
// HOD: their department. Others: their own records. Non-leaders see other staff only by name/role.
// ponytail: passwords are stored in plaintext inside the blob (service-role only). Move to scrypt hashes
// in their own table (as the old server did) once the admin screens stop displaying them.
const noPassword = ({ password, ...u }) => u;
const publicUser = ({ empId, name, role, designation, dept, company }) => ({ empId, name, role, designation, dept, company });
function view(db, me) {
  if (me.role === 'admin') return db;
  if (LEADERS.includes(me.role)) return { ...db, users: db.users.map(noPassword) };
  const deptOf = new Map(db.users.map((u) => [u.empId, u.dept]));
  const sees = (empId) => empId === me.empId || (me.role === 'hod' && deptOf.get(empId) === me.dept);
  return {
    ...db,
    users: db.users.filter((u) => u.empId === me.empId || u.role !== 'student').map((u) => (sees(u.empId) ? noPassword(u) : publicUser(u))),
    attendance: db.attendance.filter((r) => sees(r.empId)),
    leaves: db.leaves.filter((l) => sees(l.empId)),
    notifications: db.notifications.filter((n) => n.to === me.empId),
    uploads: [],
    feePayments: (db.feePayments || []).filter((f) => f.roll === me.rollNo),
  };
}

// ---------- what each role may write ----------
// Leaders send the whole state. Passwords can't be changed that way except by admin (user form);
// a blank/missing password always keeps the stored one.
// Everyone else: only leave applications/cancellations of their own, a HOD's recommend/reject on
// their department's pending leaves, read-marks on their own notifications, and the notifications
// those leave actions create. Anything else in the body is ignored.
function merge(stored, incoming, me) {
  if (LEADERS.includes(me.role)) {
    const pw = new Map(stored.users.map((u) => [u.empId, u.password]));
    return {
      ...incoming,
      users: incoming.users.map((u) => ({ ...u, password: me.role === 'admin' && u.password ? u.password : pw.get(u.empId) ?? u.password })),
    };
  }
  const deptOf = new Map(stored.users.map((u) => [u.empId, u.dept]));
  const old = new Map(stored.leaves.map((l) => [l.id, l]));
  const leaves = new Map(old);
  for (const l of Array.isArray(incoming.leaves) ? incoming.leaves : []) {
    const s = old.get(l?.id);
    if (!s) {
      if (l.empId === me.empId && PENDING.includes(l.status)) leaves.set(l.id, { ...l, history: [] });
    } else if (s.empId === me.empId && PENDING.includes(s.status) && l.status === 'Cancelled') {
      leaves.set(s.id, { ...s, status: l.status, history: l.history });
    } else if (me.role === 'hod' && s.empId !== me.empId && deptOf.get(s.empId) === me.dept &&
               s.status === 'Pending HOD' && ['Pending Principal', 'Rejected'].includes(l.status)) {
      leaves.set(s.id, { ...s, status: l.status, history: l.history });
    }
  }
  const inNotes = Array.isArray(incoming.notifications) ? incoming.notifications : [];
  const readIds = new Set(inNotes.filter((n) => n?.to === me.empId && n.read).map((n) => n.id));
  const known = new Set(stored.notifications.map((n) => n.id));
  // ponytail: new notifications are accepted from any signed-in user (leave flows create them for
  // approvers). Generate them server-side if anyone abuses it.
  const fresh = inNotes.filter((n) => n && typeof n.id === 'string' && !known.has(n.id) && typeof n.to === 'string' && typeof n.text === 'string')
    .map(({ id, to, text, sub, link, priority, at }) => ({ id, to, text: text.slice(0, 300), sub, link, priority, at, read: false }));
  return {
    ...stored,
    leaves: [...leaves.values()],
    notifications: [...fresh, ...stored.notifications.map((n) => (readIds.has(n.id) ? { ...n, read: true } : n))],
  };
}

async function body(req) { try { return await req.json(); } catch { return {}; } }

async function handle(req, op) {
  if (op === 'login' && req.method === 'POST') {
    const ip = ipOf(req);
    if (throttled(ip)) return json(429, { ok: false, error: 'Too many attempts. Try again in 15 minutes.' });
    const { username, password } = await body(req);
    const q = String(username || '').trim().toLowerCase();
    const { db } = await load();
    const u = typeof password === 'string' && password && (db?.users || []).find((x) =>
      (String(x.username || '').toLowerCase() === q || String(x.empId).toLowerCase() === q || (x.email && x.email.toLowerCase() === q)) &&
      typeof x.password === 'string' && sameText(x.password, password));
    if (!u) { miss(ip); return json(401, { ok: false, error: 'Invalid username or password. Please try again.' }); }
    fails.delete(ip);
    return json(200, { ok: true, me: u.empId }, { 'Set-Cookie': cookie(token(u.empId), TTL) });
  }
  if (op === 'logout') return json(200, { ok: true }, { 'Set-Cookie': cookie('', 0) });

  const empId = session(req);
  const signedOut = () => json(401, { ok: false, error: 'Not signed in' }, { 'Set-Cookie': cookie('', 0) });
  if (!empId) return signedOut();

  if (op === 'db' && req.method === 'GET') {
    const { db } = await load();
    const me = byEmp(db, empId);
    return me ? json(200, { ok: true, db: view(db, me), me: empId }) : signedOut();
  }

  if (op === 'password' && req.method === 'POST') {
    const { current, next } = await body(req);
    if (typeof next !== 'string' || next.length < 6) return json(400, { ok: false, error: 'New password must be at least 6 characters' });
    for (let i = 0; i < 5; i++) {
      const { db, ver } = await load();
      const me = byEmp(db, empId);
      if (!me) return signedOut();
      if (typeof current !== 'string' || !sameText(me.password || '', current)) return json(400, { ok: false, error: 'Current password is incorrect' });
      const draft = { ...db, users: db.users.map((u) => (u.empId === empId ? { ...u, password: next } : u)) };
      if (await save(draft, ver)) return json(200, { ok: true });
    }
    return json(409, { ok: false, error: 'The server is busy, please try again.' });
  }

  if (op === 'db' && (req.method === 'PUT' || req.method === 'POST')) {
    const incoming = (await body(req)).db;
    if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.users) || !Array.isArray(incoming.leaves) || !Array.isArray(incoming.notifications)) {
      return json(400, { ok: false, error: 'Request body must be { db: <ERP state> }' });
    }
    for (let i = 0; i < 5; i++) {
      const { db, ver } = await load();
      const me = byEmp(db, empId);
      if (!me) return signedOut();
      if (await save(merge(db, incoming, me), ver)) return json(200, { ok: true });
    }
    return json(409, { ok: false, error: 'The server is busy, please try again.' });
  }
  return json(404, { ok: false, error: 'Not found' });
}

async function route(req, { params }) {
  try { return await handle(req, (await params).op); }
  catch (e) { return json(500, { ok: false, error: String(e?.message || e) }); }
}
export { route as GET, route as PUT, route as POST };
