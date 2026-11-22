'use client';
import { useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import ERP from '@/lib/erp';
import { useErp, useRequireRole } from '@/lib/ErpProvider';
import { Shell } from '@/components/Shell';
import { Icon } from '@/components/Icon';
import { Stat, Meter, Empty, Avatar } from '@/components/ui';
import { AttendanceCalendar, CalendarLegend } from '@/components/Calendar';
import { toast } from '@/components/Toast';
import { FULL_MONTHS, monthRange, greeting, longDate } from '@/lib/dates';

const { fmt } = ERP;
const ROLE_LABEL = { admin: 'Administrator', principal: 'Principal', dean: 'Dean', hod: 'Head of Department', faculty: 'Faculty / Staff', student: 'Student' };

const nameOf = (empId) => ERP.users.byEmp(empId)?.name || empId;

const now = new Date();

// ---------- QR + student ID card ----------
const studentQrText = (u) => [
  'Arundhati Institute of Medical Sciences',
  `Name: ${u.name}`,
  `Roll No: ${u.rollNo}`,
  `Programme: ${u.designation}`,
  `Batch: ${u.batch}`,
  `Year: ${u.year}`,
  `Email: ${u.email}`,
].join('\n');

function IdCard({ u }) {
  const qr = useMemo(() => {
    try {
      const q = qrcode(0, 'M');
      q.addData(studentQrText(u));
      q.make();
      return q.createSvgTag({ scalable: true, margin: 0 });
    } catch (e) { return ''; }
  }, [u]);

  return (
    <div className="idcard">
      <div className="idcard-top">
        <span className="idcard-mark"><Icon name="cross" size={18} /></span>
        <div className="idcard-inst"><b>Arundhati Institute of Medical Sciences</b><small>Student Identity</small></div>
      </div>
      <div className="idcard-body">
        <Avatar name={u.name} size={60} />
        <div className="idcard-id">
          <h3>{u.name}</h3>
          <span className="idcard-prog">{u.designation}</span>
        </div>
      </div>
      <dl className="idcard-grid">
        <div><dt>Roll No.</dt><dd>{u.rollNo}</dd></div>
        <div><dt>Batch</dt><dd>{u.batch}</dd></div>
        <div><dt>Email</dt><dd className="trunc" title={u.email}>{u.email}</dd></div>
        <div><dt>Year</dt><dd>Year {u.year}</dd></div>
      </dl>
      <div className="idcard-foot">
        <div className="idcard-foottext"><b>{ERP.INSTITUTION}</b>Scan the QR for student details</div>
        {qr
          ? <div className="idcard-qr" title="Scan for student details" aria-label="QR code of student details" dangerouslySetInnerHTML={{ __html: qr }} />
          : <span className="idcard-barcode" aria-hidden="true" />}
      </div>
    </div>
  );
}

// ---------- coming soon ----------
function ComingSoon({ iconName, title, lead, note, feats }) {
  return (
    <div className="card soon">
      <div className="soon-ic"><Icon name={iconName} size={40} /></div>
      <div className="soon-badge"><i /> Coming soon</div>
      <h2>{title}</h2>
      <p dangerouslySetInnerHTML={{ __html: lead }} />
      <div className="soon-feats">
        {feats.map((f, i) => (
          <div className="soon-feat" key={i}>
            <span className="sf-ic"><Icon name={f[0]} size={17} /></span>
            <div><b>{f[1]}</b><small>{f[2]}</small></div>
          </div>
        ))}
      </div>
      {note ? <p className="muted small" style={{ marginTop: 26 }}>{note}</p> : null}
    </div>
  );
}

// ================= DASHBOARD =================
function Dashboard({ me }) {
  useErp();
  const [from, to] = monthRange(now.getFullYear(), now.getMonth());
  const s = ERP.attendance.summaryFor(me.empId, from, to);
  const total = ERP.attendance.forEmp(me.empId).length;
  const anns = ERP.announcements.all().slice(0, 4);
  const pctTone = !s.total ? 'info' : s.percent >= 85 ? 'ok' : s.percent >= 75 ? 'warn' : 'bad';
  const ringColor = `var(${s.percent >= 85 ? '--ok' : s.percent >= 75 ? '--warn' : '--bad'})`;

  return (
    <>
      <div className="hero st-hero">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ margin: '0 0 4px', opacity: .85, fontWeight: 600 }}>{greeting()},</p>
          <h2>{me.name}</h2>
          <div className="hero-meta">
            <span className="chip"><Icon name="cap" size={14} /> {me.designation}</span>
            <span className="chip"><Icon name="id" size={14} /> Roll {me.rollNo}</span>
            <span className="chip"><Icon name="calendar" size={14} /> {longDate()}</span>
          </div>
        </div>
        <div className="st-ring" style={{ '--p': s.total ? Math.min(100, s.percent) : 0, '--rc': ringColor }}>
          <div className="st-ring-in"><b>{s.total ? `${s.percent}%` : '—'}</b><small>{FULL_MONTHS[now.getMonth()].slice(0, 3)} attendance</small></div>
        </div>
      </div>
      <div className="cards">
        <Stat label="Attendance this month" value={s.total ? `${s.percent}%` : '—'} iconName="chart" tone={pctTone} sub={s.total ? `${s.total} marked day${s.total === 1 ? '' : 's'}` : 'No records yet'} />
        <Stat label="Present" value={s.P + s.OD} iconName="check" tone="ok" sub={`${s.P} present · ${s.OD} on duty · ${s.HD} half`} />
        <Stat label="Absences" value={s.A} iconName="alert" tone={s.A ? 'bad' : 'info'} sub={`${s.L} on leave this month`} />
        <Stat label="Total records" value={total} iconName="calendar" tone="accent" sub={total ? 'across all uploaded months' : 'awaiting first upload'} />
      </div>
      <div className="cols">
        <div className="section" style={{ gap: 20 }}>
          <div className="card">
            <div className="card-head"><div><h3>{FULL_MONTHS[now.getMonth()]} {now.getFullYear()}</h3><p>Hover a day for details</p></div><a href="#attendance" className="btn btn-ghost btn-sm">Full view</a></div>
            <div className="cal-wrap"><AttendanceCalendar empId={me.empId} year={now.getFullYear()} month={now.getMonth()} mini /></div>
            <CalendarLegend />
            {s.total ? (
              <div className="pct-block">
                <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted small" style={{ fontWeight: 600 }}>Monthly attendance</span><b>{s.percent}%</b></div>
                <Meter pct={s.percent} />
              </div>
            ) : <p className="muted small" style={{ margin: '14px 0 0', textAlign: 'center' }}>No attendance has been uploaded for your batch yet.</p>}
          </div>
          <div className="card">
            <div className="card-head"><div><h3>Announcements</h3><p>From the administration</p></div></div>
            <div className="list">
              {anns.length ? anns.map((a) => (
                <div className="list-item" key={a.id} style={{ justifyContent: 'flex-start', alignItems: 'flex-start' }}>
                  <span className="ann-icon"><Icon name="megaphone" size={17} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}><b>{a.title}</b><p>{a.body}</p><small className="muted">{nameOf(a.by)} · {fmt.ago(a.at)}</small></div>
                </div>
              )) : <Empty msg="No announcements" iconName="megaphone" />}
            </div>
          </div>
        </div>
        <div className="card" style={{ background: 'transparent', border: 0, boxShadow: 'none', padding: 0 }}>
          <IdCard u={me} />
          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-head"><div><h3>Good to know</h3></div></div>
            <ul className="muted small" style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <li>Your attendance is marked from the biometric / class registers uploaded by the office.</li>
              <li>A minimum of <b>75%</b> attendance is required to sit for university exams.</li>
              <li>Spot an error? Contact your class coordinator or the ERP administrator.</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

// ================= COMING SOON SECTIONS =================
function Attendance() {
  useErp();
  return (
    <ComingSoon
      iconName="calendar"
      title="Attendance is on the way"
      lead="Soon you’ll be able to track your class and clinical attendance here — month by month, with a clear picture of where you stand against the <b>75%</b> exam-eligibility requirement."
      note="The office is setting up the attendance feed. You’ll see your records here the moment it goes live."
      feats={[
        ['chart', 'Live attendance %', 'Your running percentage, updated as each day is marked.'],
        ['calendar', 'Monthly calendar', 'A day-by-day grid with status and timings at a glance.'],
        ['alert', 'Shortage alerts', 'Early warnings if you dip below the required 75%.'],
        ['excel', 'Export to Excel', 'Download your record for any month in one click.'],
      ]}
    />
  );
}

function Fees() {
  useErp();
  return (
    <ComingSoon
      iconName="wallet"
      title="Fees & payments, coming soon"
      lead="A single place to view your fee structure, see what’s due, pay online securely, and download receipts — no more standing in queues at the accounts office."
      note="Online fee payment is being set up with the accounts office. Watch this space."
      feats={[
        ['rupee', 'Fee statement', 'Your full fee structure and running balance, term by term.'],
        ['wallet', 'Pay online', 'Secure payment by UPI, card or net-banking.'],
        ['file', 'Instant receipts', 'Download a receipt the moment a payment clears.'],
        ['bell', 'Due reminders', 'Timely nudges before each instalment is due.'],
      ]}
    />
  );
}

function Hostel() {
  useErp();
  return (
    <ComingSoon
      iconName="bed"
      title="Hostel, coming soon"
      lead="Everything about your hostel life in one place — your room allotment, mess menu and bills, and a quick way to raise maintenance or leave requests with the warden."
      note="The hostel office is onboarding to the ERP. Your room and mess details will appear here soon."
      feats={[
        ['building', 'Room allotment', 'Your block, room number and roommates at a glance.'],
        ['rupee', 'Mess & hostel bills', 'Monthly charges and payment status, all in one view.'],
        ['file', 'Gate & leave pass', 'Apply for a hostel leave / outing pass online.'],
        ['bell', 'Warden notices', 'Hostel announcements delivered straight to you.'],
      ]}
    />
  );
}

function Transport() {
  useErp();
  return (
    <ComingSoon
      iconName="bus"
      title="Transport, coming soon"
      lead="Pick your college bus route, see live timings and stops, and manage your transport pass — so you always know exactly when and where to catch your bus."
      note="College transport is being mapped into the ERP. Routes and timings will go live here shortly."
      feats={[
        ['pin', 'Route & stops', 'Your assigned route with every stop and pickup time.'],
        ['bus', 'Live bus timings', 'Know when your bus is due at your stop.'],
        ['wallet', 'Transport pass', 'View and renew your bus pass online.'],
        ['bell', 'Service alerts', 'Instant notice of delays or route changes.'],
      ]}
    />
  );
}

// ================= ANNOUNCEMENTS =================
function Announcements() {
  useErp();
  const list = ERP.announcements.all();
  return (
    <div className="card">
      <div className="card-head"><div><h3>Announcements</h3><p>Notices from the administration</p></div><span className="badge badge-muted">{list.length}</span></div>
      <div className="list">
        {list.length ? list.map((a) => (
          <div className="list-item" key={a.id} style={{ justifyContent: 'flex-start', alignItems: 'flex-start' }}>
            <span className="ann-icon"><Icon name="megaphone" size={17} /></span>
            <div style={{ flex: 1, minWidth: 0 }}><b>{a.title}</b><p>{a.body}</p><small className="muted">{nameOf(a.by)} · {fmt.dateTime(a.at)} ({fmt.ago(a.at)})</small></div>
          </div>
        )) : <Empty msg="No announcements yet" iconName="megaphone" />}
      </div>
    </div>
  );
}

// ================= PROFILE =================
function Profile({ me }) {
  useErp();
  const u = ERP.users.byEmp(me.empId);
  const all = ERP.attendance.forEmp(me.empId);
  const overall = ERP.attendance.summarize(all);

  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState({});
  const [err, setErr] = useState({ msg: '', field: '' });

  let score = 0; if (next.length >= 6) score++; if (next.length >= 10) score++; if (/[A-Z]/.test(next) && /[a-z]/.test(next)) score++; if (/\d/.test(next)) score++; if (/[^A-Za-z0-9]/.test(next)) score++;

  const submit = (e) => {
    e.preventDefault(); setErr({ msg: '', field: '' });
    const user = ERP.users.byEmp(me.empId);
    const fail = (msg, field) => { setErr({ msg, field }); toast(msg, 'bad'); };
    if (cur !== user.password) return fail('Current password is incorrect', 'cur');
    if (next.length < 6) return fail('New password must be at least 6 characters', 'next');
    if (next === cur) return fail('New password must differ from the current one', 'next');
    if (next !== confirm) return fail('Passwords do not match', 'confirm');
    ERP.users.update(me.empId, { password: next });
    setCur(''); setNext(''); setConfirm('');
    toast('Password updated successfully');
  };

  const pwField = (label, field, val, set, autoComplete) => (
    <label className={`field${err.field === field ? ' err' : ''}`}><span>{label}</span>
      <div className="pw-wrap">
        <input type={show[field] ? 'text' : 'password'} autoComplete={autoComplete} value={val} onChange={(e) => { set(e.target.value); setErr({ msg: '', field: '' }); }} />
        <button type="button" onClick={() => setShow((sx) => ({ ...sx, [field]: !sx[field] }))}>{show[field] ? 'Hide' : 'Show'}</button>
      </div>
    </label>
  );

  return (
    <div className="cols">
      <div className="section" style={{ gap: 20 }}>
        <IdCard u={u} />
        <div className="card">
          <div className="card-head"><div><h3>Student details</h3></div><span className="badge badge-accent">{ROLE_LABEL[u.role]}</span></div>
          <dl className="kv">
            <dt>Full name</dt><dd>{u.name}</dd>
            <dt>Roll number</dt><dd><code>{u.rollNo}</code></dd>
            <dt>Programme</dt><dd>{u.designation}</dd>
            <dt>Batch</dt><dd>{u.batch}</dd>
            <dt>Academic year</dt><dd>Year {u.year}</dd>
            <dt>College email</dt><dd><a href={`mailto:${u.email}`}>{u.email}</a></dd>
            <dt>Overall attendance</dt><dd>{all.length ? <>{overall.percent}% <span className="muted small">· {all.length} day{all.length === 1 ? '' : 's'} on record</span></> : <span className="muted">No records yet</span>}</dd>
            <dt>Login (email)</dt><dd><code>{u.username}</code></dd>
          </dl>
          <p className="muted small" style={{ margin: '18px 0 0' }}>To correct any of these details, please contact the ERP administrator or your class coordinator.</p>
        </div>
      </div>
      <form className="card" onSubmit={submit} noValidate>
        <div className="card-head"><div><h3>Change password</h3><p>Use at least 6 characters</p></div></div>
        {err.msg ? <div className="form-error"><Icon name="alert" size={16} /><span>{err.msg}</span></div> : null}
        {pwField('Current password', 'cur', cur, setCur, 'current-password')}
        {pwField('New password', 'next', next, setNext, 'new-password')}
        <div className="pw-strength"><div style={{ width: next ? `${Math.max(12, score * 20)}%` : 0, background: `var(${score <= 1 ? '--bad' : score <= 3 ? '--warn' : '--ok'})` }} /></div>
        {pwField('Confirm new password', 'confirm', confirm, setConfirm, 'new-password')}
        <button className="btn btn-primary btn-block" type="submit"><Icon name="check" size={16} /> Update password</button>
        <p className="muted small" style={{ margin: '12px 0 0' }}>Your first-time password is your roll number — change it to something only you know.</p>
      </form>
    </div>
  );
}

// ================= PAGE =================
export default function StudentPage() {
  const me = useRequireRole(['student']);
  if (!me) return null;
  const sections = [
    { id: 'dashboard', label: 'Dashboard', icon: 'home', render: (u) => <Dashboard me={u} /> },
    { id: 'attendance', label: 'My Attendance', icon: 'calendar', render: () => <Attendance /> },
    { id: 'fees', label: 'Fees Payment', icon: 'wallet', render: () => <Fees /> },
    { id: 'hostel', label: 'Hostel', icon: 'bed', render: () => <Hostel /> },
    { id: 'transport', label: 'Transport', icon: 'bus', render: () => <Transport /> },
    { id: 'announcements', label: 'Announcements', icon: 'megaphone', render: () => <Announcements /> },
    { id: 'profile', label: 'Profile', icon: 'id', render: (u) => <Profile me={u} /> },
  ];
  return <Shell user={me} sections={sections} />;
}
