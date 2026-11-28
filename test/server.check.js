// Permission check for server.js:  node test/server.check.js   (exits non-zero on failure)
const { spawn, execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-check-'));
const DB_PATH = path.join(dir, 'erp.db'), PORT = '3197', B = `http://127.0.0.1:${PORT}`;
const u = (empId, role, dept, extra = {}) => ({ empId, username: empId.toLowerCase(), password: 'pass1234', role, dept, name: `${role} ${empId}`, designation: role, email: `${empId}@x`, phone: '99', ...extra });
fs.writeFileSync(path.join(dir, 'seed.json'), JSON.stringify({
  version: 6, users: [u('ADM', 'admin', null), u('PR', 'principal', 'X'), u('HX', 'hod', 'X'), u('F1', 'faculty', 'X', { company: 'AIMS-COLLEGE' }), u('F2', 'faculty', 'Y', { company: 'AIMS-DOCTORS' }), u('S1', 'student', null)],
  attendance: [{ empId: 'F1', date: '2026-11-02', status: 'P' }, { empId: 'F2', date: '2026-11-02', status: 'A' }, { empId: 'S1', date: '2026-11-02', status: 'P' }],
  uploads: [], leaves: [], announcements: [], notifications: [],
}));
const env = { ...process.env, DB_PATH, PORT };
execFileSync(process.execPath, ['server.js', 'import', path.join(dir, 'seed.json')], { cwd: path.join(__dirname, '..'), env, stdio: 'ignore' });
const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env, stdio: 'ignore' });

async function login(id, pw = 'pass1234') {
  const r = await fetch(`${B}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: id, password: pw }) });
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  const call = async (p, body) => {
    const res = await fetch(B + p, body ? { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) } : { headers: { cookie } });
    return { status: res.status, ...(await res.json()) };
  };
  return { status: r.status, cookie, db: () => call('/api/db').then((x) => x.db), op: (op, args) => call('/api/op', { op, args }), call };
}

(async () => {
  for (let i = 0; i < 50; i++) { try { await fetch(B); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }

  // signed out: nothing but counts; seed files are stubs; old bulk PUT is gone
  const anon = await fetch(`${B}/api/db`); assert.equal(anon.status, 401);
  assert.deepEqual((await anon.json()).stats, { staff: 4, students: 1 });
  assert.equal(await (await fetch(`${B}/js/students.js`)).text(), 'window.ERP_STUDENTS=[];');
  assert.equal((await fetch(`${B}/server.js`)).status, 404);
  assert.equal((await login('F1', 'nope')).status, 401);

  const adm = await login('ADM'), hod = await login('HX'), f1 = await login('F1'), f2 = await login('F2'), st = await login('S1'), pr = await login('PR');
  assert.equal((await f1.call('/api/db', { db: { users: [] } })).status, 404, 'no bulk overwrite endpoint');

  // reads are scoped
  const sdb = await st.db();
  assert.deepEqual(sdb.attendance.map((r) => r.empId), ['S1']);
  assert.ok(!sdb.users.some((x) => x.role === 'student' && x.empId !== 'S1'), 'students see no other students');
  assert.equal(sdb.users.find((x) => x.empId === 'F1').phone, undefined, 'no staff contact details for students');
  assert.ok(!sdb.users.some((x) => 'password' in x), 'no passwords ever');
  assert.deepEqual((await f1.db()).attendance.map((r) => r.empId), ['F1']);
  assert.deepEqual((await hod.db()).attendance.map((r) => r.empId).sort(), ['F1'], 'HOD sees own dept only');
  assert.equal((await adm.db()).attendance.length, 3);

  // writes are checked
  assert.equal((await st.op('leave.apply', { type: 'LOP', from: '2026-12-01', to: '2026-12-01', reason: 'family function' })).status, 400);
  const ap = await f1.op('leave.apply', { empId: 'F2', type: 'LOP', from: '2026-12-01', to: '2026-12-02', reason: 'family function' });
  assert.equal(ap.ok, true); assert.equal(ap.result.empId, 'F1', 'always applies for yourself'); assert.equal(ap.result.status, 'Pending HOD');
  const id = ap.result.id;
  assert.equal((await f2.op('leave.cancel', { id })).ok, false, "can't cancel someone else's leave");
  assert.equal((await f1.op('leave.act', { id, action: 'approve' })).ok, false, "can't approve your own");
  assert.equal((await pr.op('leave.act', { id, action: 'approve' })).ok, false, 'principal waits for HOD stage');
  assert.equal((await hod.op('leave.act', { id, action: 'approve' })).result.status, 'Pending Principal');
  assert.equal((await pr.op('leave.act', { id, action: 'approve' })).result.status, 'Approved');
  assert.ok((await f1.db()).notifications.some((n) => /approved/.test(n.text)));

  assert.equal((await f1.op('user.update', { empId: 'F1', patch: { role: 'admin' } })).ok, false, 'no self-promotion');
  assert.equal((await f1.op('attendance.import', { rows: [{ empId: 'F1', date: '2026-11-03', status: 'P' }], fileName: 'x' })).ok, false);
  assert.equal((await hod.op('announcement.add', { title: 't', body: 'b' })).ok, false);
  const an = await pr.op('announcement.add', { title: 'Notice', body: 'Hello' }); assert.equal(an.ok, true);
  assert.equal((await f1.op('announcement.remove', { id: an.result.id })).ok, false);
  assert.equal((await f1.op('nope', {})).ok, false);

  // announcements reach only their audience; PDFs are fetched separately and only by that audience
  const pdf = { name: 'circular.pdf', dataUrl: 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 test').toString('base64') };
  assert.equal((await pr.op('announcement.add', { title: 'Bad file', pdf: { name: 'x.pdf', dataUrl: 'data:text/html;base64,PGI+' } })).ok, false, 'PDF only');
  const sa = await pr.op('announcement.add', { title: 'Students only', audience: ['students'], priority: 'high', pdf });
  assert.equal(sa.ok, true, 'message is optional');
  const said = sa.result.id;
  const sView = (await st.db()).announcements.find((a) => a.id === said);
  assert.ok(sView && sView.pdf.name === 'circular.pdf' && !sView.pdf.dataUrl, 'student sees it, without the PDF bytes');
  assert.ok(!(await f1.db()).announcements.some((a) => a.id === said), 'college staff do not see a students-only notice');
  assert.ok((await hod.db()).announcements.some((a) => a.id === said), 'leaders see every notice');
  assert.ok((await st.db()).notifications.some((n) => n.link === '#announcements' && n.priority === 'high'));
  assert.ok(!(await f1.db()).notifications.some((n) => /Students only/.test(n.text)));
  const got = await fetch(`${B}/api/announcement-pdf?id=${said}`, { headers: { cookie: st.cookie } });
  assert.equal(got.status, 200); assert.equal(got.headers.get('content-type'), 'application/pdf');
  assert.equal(await got.text(), '%PDF-1.4 test');
  assert.equal((await fetch(`${B}/api/announcement-pdf?id=${said}`, { headers: { cookie: f1.cookie } })).status, 404);
  assert.equal((await fetch(`${B}/api/announcement-pdf?id=${said}`)).status, 401);

  // admin can manage users; passwords are hashed server-side
  assert.equal((await adm.op('user.add', { user: { empId: 'N1', name: 'New', username: 'n1', role: 'faculty', dept: 'Y', password: 'secret9' } })).ok, true);
  assert.equal((await login('n1', 'secret9')).status, 200);
  assert.equal((await adm.op('user.update', { empId: 'N1', patch: { password: 'other99' } })).ok, true);
  assert.equal((await login('n1', 'secret9')).status, 401);
  assert.equal((await adm.op('attendance.import', { rows: [{ empId: 'F1', date: '2026-11-03', status: 'P' }], fileName: 'nov.xlsx' })).result.rows, 1);
  assert.equal((await adm.op('attendance.import', { rows: [{ empId: 'GHOST', date: '2026-11-03', status: 'P' }] })).ok, false);

  console.log('server.check: all passed');
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => { srv.kill(); });
