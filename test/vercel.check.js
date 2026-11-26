// Check api/handler.js (Vercel + Supabase) against an in-memory fake of Supabase's REST API.
//   node test/vercel.check.js [blob.json]   (optional: a real ERP blob with plaintext passwords)
const http = require('node:http');
const fs = require('node:fs');
const assert = require('node:assert/strict');

const u = (empId, role, dept) => ({ empId, username: empId.toLowerCase(), password: 'pass1234', role, dept, name: `${role} ${empId}`, email: `${empId}@x`, phone: '99' });
const blob = process.argv[2] ? (({ db, data, ...r }) => db || data || r)(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')))
  : { version: 6, users: [u('PR', 'principal', 'X'), u('HX', 'hod', 'X'), u('F1', 'faculty', 'X'), u('F2', 'faculty', 'Y'), u('S1', 'student', null)], attendance: [], uploads: [], leaves: [], announcements: [], notifications: [] };
blob.leaves = [];

// --- fake PostgREST: erp_state (one row) + erp_passwords ---
let row = { id: 'arundhati-erp:v3', data: structuredClone(blob), updated_at: '2026-11-26T07:19:46.197123+00:00' };
const pw = new Map();
let raceOnce = false; // when set, the next PATCH loses to a "concurrent" write
const fake = http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => (body += c)).on('end', () => {
    const url = new URL(req.url, 'http://x'), p = url.searchParams, send = (x, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(x)); };
    assert.equal(req.headers.apikey, 'svc');
    if (url.pathname === '/rest/v1/erp_state') {
      if (req.method === 'GET') return send([{ data: row.data, updated_at: row.updated_at }]);
      if (raceOnce) { raceOnce = false; row.updated_at = new Date().toISOString(); }
      if (p.get('updated_at') !== `eq.${row.updated_at}`) return send([]);
      const b = JSON.parse(body); row = { ...row, data: b.data, updated_at: b.updated_at }; return send([{ id: row.id }]);
    }
    const id = (p.get('emp_id') || '').replace(/^eq\./, '');
    if (req.method === 'GET') return send(pw.has(id) ? [{ hash: pw.get(id) }] : []);
    if (req.method === 'POST') { const b = JSON.parse(body); pw.set(b.emp_id, b.hash); res.writeHead(201); return res.end(); }
    if (req.method === 'DELETE') { pw.delete(id); res.writeHead(204); return res.end(); }
  });
}).listen(3198);

process.env.SUPABASE_URL = 'http://127.0.0.1:3198'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc'; process.env.SESSION_SECRET = 'x'.repeat(40);
const handler = require('../api/handler.js');
// Mimic vercel.json routes.
const app = http.createServer((req, res) => {
  const m = /^\/api\/(login|logout|db|op|password)$/.exec(req.url) || /^\/js\/(employees|students|attendance-seed)\.js$/.exec(req.url);
  if (!m) { res.writeHead(404); return res.end(); }
  req.url = `/api/handler?route=${req.url.startsWith('/js/') ? 'stub/' : ''}${m[1]}`;
  handler(req, res);
}).listen(3199);
const B = 'http://127.0.0.1:3199';

async function login(id, password) {
  const r = await fetch(`${B}/api/login`, { method: 'POST', body: JSON.stringify({ username: id, password }) });
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  const call = async (p, b) => { const x = await fetch(B + p, b ? { method: 'POST', headers: { cookie }, body: JSON.stringify(b) } : { headers: { cookie } }); return { status: x.status, ...(await x.json()) }; };
  return { status: r.status, cookie, db: () => call('/api/db').then((x) => x.db), op: (op, args) => call('/api/op', { op, args }) };
}

(async () => {
  try {
    const anon = await fetch(`${B}/api/db`); assert.equal(anon.status, 401);
    const a = await anon.json(); assert.equal(a.db, undefined); assert.ok(a.stats.staff > 0);
    assert.equal(await (await fetch(`${B}/js/students.js`)).text(), 'window.ERP_STUDENTS=[];');
    assert.ok((await (await fetch(`${B}/js/employees.js`)).text()).includes('"employees":[]'));

    const fac = blob.users.find((x) => x.role === 'faculty' && x.password), hod = blob.users.find((x) => x.role === 'hod' && x.dept === fac.dept && x.password);
    assert.equal((await login(fac.empId, 'wrong-password')).status, 401);
    const f = await login(fac.empId, fac.password); assert.equal(f.status, 200);
    assert.ok(pw.has(fac.empId), 'plaintext login moved into the hash table');
    assert.equal((await login(fac.empId, fac.password)).status, 200, 'and still works from the hash');
    assert.equal((await fetch(`${B}/api/db`, { headers: { cookie: f.cookie.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')) } })).status, 401, 'tampered cookie rejected');

    const fdb = await f.db();
    assert.ok(!fdb.users.some((x) => 'password' in x), 'no passwords in any view');
    assert.ok(fdb.attendance.every((r) => r.empId === fac.empId), 'faculty sees only own attendance');

    raceOnce = true; // first write loses a race and must be retried, not lost
    const ap = await f.op('leave.apply', { type: 'LOP', from: '2026-12-01', to: '2026-12-01', reason: 'family function' });
    assert.equal(ap.ok, true, ap.error); assert.equal(row.data.leaves.length, 1);
    if (hod) {
      const h = await login(hod.empId, hod.password);
      assert.equal((await h.op('leave.act', { id: ap.result.id, action: 'approve' })).result.status, 'Pending Principal');
    }
    assert.equal((await f.op('user.update', { empId: fac.empId, patch: { role: 'admin' } })).ok, false, 'cannot promote yourself');
    console.log('vercel.check: all passed');
  } finally { fake.close(); app.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
