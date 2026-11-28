// Security check for app/api/[op]/route.js against a fake Supabase. Needs a build first:
//   npm run build && node test/api.check.mjs
import http from 'node:http';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const SB = 3197, APP = 3196;
const users = [
  { empId: 'ADM001', username: 'admin', password: 'adminpw', role: 'admin', name: 'Admin' },
  { empId: 'P1', username: 'prin', password: 'prinpw', role: 'principal', name: 'Principal' },
  { empId: 'H1', username: 'hod', password: 'hodpw', role: 'hod', dept: 'PATH', name: 'Hod' },
  { empId: 'F1', username: 'fac', password: 'facpw', role: 'faculty', dept: 'PATH', name: 'Fac', phone: '999' },
  { empId: 'F2', username: 'fac2', password: 'fac2pw', role: 'faculty', dept: 'ANAT', name: 'Fac2' },
  { empId: 'S1', rollNo: 'S1', username: 's1', password: 's1pw', role: 'student', name: 'Stu' },
];
let row = {
  id: 'arundhati-erp:v3', updated_at: 'v0',
  data: { version: 6, users, attendance: [{ empId: 'F1', date: '2026-11-01', status: 'P' }, { empId: 'F2', date: '2026-11-01', status: 'A' }],
    leaves: [{ id: 'L2', empId: 'F2', status: 'Pending HOD', history: [] }], announcements: [], notifications: [{ id: 'N1', to: 'F2', text: 'x', read: false }], uploads: [], feePayments: [] },
};
let n = 0;
const fake = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET') return res.end(JSON.stringify([{ data: row.data, updated_at: row.updated_at }]));
    if (req.method === 'PATCH') {
      if (u.searchParams.get('updated_at') !== `eq.${row.updated_at}`) return res.end('[]');
      row = { ...row, data: JSON.parse(b).data, updated_at: `v${++n}` };
      return res.end(JSON.stringify([{ id: row.id }]));
    }
    res.statusCode = 405; res.end('[]');
  });
}).listen(SB);

const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(APP)], {
  env: { ...process.env, SUPABASE_URL: `http://127.0.0.1:${SB}`, SUPABASE_SERVICE_ROLE_KEY: 'svc', SESSION_SECRET: 'x'.repeat(40) }, stdio: 'ignore',
});
const base = `http://127.0.0.1:${APP}/api`;
for (let i = 0; ; i++) { try { await fetch(`${base}/db`); break; } catch { if (i > 60) throw new Error('app did not start'); await new Promise((r) => setTimeout(r, 500)); } }

const call = async (path, { method = 'GET', body, sid } = {}) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(sid ? { cookie: `sid=${sid}` } : {}) }, body: body && JSON.stringify(body) });
  return { status: r.status, j: await r.json(), sid: /sid=([^;]*)/.exec(r.headers.get('set-cookie') || '')?.[1] };
};
const login = async (username, password) => (await call('/login', { method: 'POST', body: { username, password } })).sid;
const noPw = (db) => db.users.every((u) => !('password' in u));

try {
  // signed out: nothing readable or writable
  let r = await call('/db'); assert.equal(r.status, 401); assert.equal(r.j.ok, false); assert.equal(r.j.db, undefined);
  r = await call('/db', { method: 'PUT', body: { db: { users: [], leaves: [], notifications: [] } } }); assert.equal(r.status, 401);
  r = await call('/db', { method: 'PUT', body: { db: row.data }, sid: 'forged.9999999999999.mac' }); assert.equal(r.status, 401);
  assert.equal((await call('/login', { method: 'POST', body: { username: 'fac', password: 'nope' } })).status, 401);

  // faculty: own records only, no passwords, no students
  const fac = await login('fac', 'facpw'); assert.ok(fac);
  r = await call('/db', { sid: fac }); assert.equal(r.j.me, 'F1'); const fv = r.j.db;
  assert.ok(noPw(fv)); assert.ok(!fv.users.some((u) => u.role === 'student'));
  assert.deepEqual(fv.attendance.map((a) => a.empId), ['F1']); assert.equal(fv.leaves.length, 0); assert.equal(fv.notifications.length, 0);
  assert.equal(fv.users.find((u) => u.empId === 'F2').phone, undefined);

  // faculty can't wipe or rewrite: only an own pending leave (+ its notification) lands
  await call('/db', { method: 'PUT', sid: fac, body: { db: { ...fv, users: [], attendance: [],
    leaves: [{ id: 'L1', empId: 'F1', status: 'Pending HOD', history: [] }, { id: 'LX', empId: 'F1', status: 'Approved', history: [] }, { id: 'L2', empId: 'F2', status: 'Approved' }],
    notifications: [{ id: 'N2', to: 'H1', text: 'Fac applied', read: true }] } } });
  let d = row.data;
  assert.equal(d.users.length, users.length); assert.equal(d.attendance.length, 2);
  assert.deepEqual(d.leaves.map((l) => `${l.id}:${l.status}`).sort(), ['L1:Pending HOD', 'L2:Pending HOD']);
  assert.equal(d.notifications.find((x) => x.id === 'N2').read, false);

  // HOD recommends own-dept leave only
  const hod = await login('hod', 'hodpw');
  r = await call('/db', { sid: hod }); assert.deepEqual(r.j.db.leaves.map((l) => l.id), ['L1']);
  await call('/db', { method: 'PUT', sid: hod, body: { db: { ...r.j.db, leaves: [{ ...r.j.db.leaves[0], status: 'Pending Principal', history: [{ by: 'H1' }] }, { id: 'L2', empId: 'F2', status: 'Rejected' }] } } });
  assert.equal(row.data.leaves.find((l) => l.id === 'L1').status, 'Pending Principal');
  assert.equal(row.data.leaves.find((l) => l.id === 'L2').status, 'Pending HOD');

  // student sees self only
  const stu = await login('s1', 's1pw'); r = await call('/db', { sid: stu });
  assert.ok(noPw(r.j.db)); assert.equal(r.j.db.users.filter((u) => u.role === 'student').length, 1);

  // principal: everything but passwords; a whole-state write can't change passwords
  const pr = await login('prin', 'prinpw'); r = await call('/db', { sid: pr });
  assert.ok(noPw(r.j.db)); assert.equal(r.j.db.users.length, users.length);
  await call('/db', { method: 'PUT', sid: pr, body: { db: { ...r.j.db, users: r.j.db.users.map((u) => (u.empId === 'F1' ? { ...u, password: 'hacked', phone: '111' } : u)) } } });
  assert.equal(row.data.users.find((u) => u.empId === 'F1').password, 'facpw');
  assert.equal(row.data.users.find((u) => u.empId === 'F1').phone, '111');

  // admin sees passwords and can set one; blank keeps the stored one
  const adm = await login('admin', 'adminpw'); r = await call('/db', { sid: adm });
  assert.equal(r.j.db.users.find((u) => u.empId === 'F2').password, 'fac2pw');
  await call('/db', { method: 'PUT', sid: adm, body: { db: { ...r.j.db, users: r.j.db.users.map((u) => (u.empId === 'F2' ? { ...u, password: 'newpw' } : u.empId === 'F1' ? { ...u, password: '' } : u)) } } });
  assert.equal(row.data.users.find((u) => u.empId === 'F2').password, 'newpw');
  assert.equal(row.data.users.find((u) => u.empId === 'F1').password, 'facpw');

  // own password change needs the current one
  assert.equal((await call('/password', { method: 'POST', sid: fac, body: { current: 'bad', next: 'newfacpw' } })).status, 400);
  assert.equal((await call('/password', { method: 'POST', sid: fac, body: { current: 'facpw', next: 'newfacpw' } })).j.ok, true);
  assert.ok(await login('fac', 'newfacpw'));

  console.log('api.check: all passed');
} finally { app.kill(); fake.close(); }
