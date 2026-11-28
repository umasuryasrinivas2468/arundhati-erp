'use client';
import { useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import ERP from '@/lib/erp';
import { useErp, useRequireRole } from '@/lib/ErpProvider';
import { Shell } from '@/components/Shell';
import { Icon } from '@/components/Icon';
import { Stat, Meter, Empty, Avatar, ComingSoon, AnnouncementCard } from '@/components/ui';
import { AttendanceCalendar, CalendarLegend } from '@/components/Calendar';
import { DataTable } from '@/components/DataTable';
import { openModal } from '@/components/Modal';
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

// ================= DASHBOARD =================
function Dashboard({ me }) {
  useErp();
  const [from, to] = monthRange(now.getFullYear(), now.getMonth());
  const s = ERP.attendance.summaryFor(me.empId, from, to);
  const total = ERP.attendance.forEmp(me.empId).length;
  const anns = ERP.announcements.forUser(me).slice(0, 4);
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

// ================= ANNOUNCEMENTS =================
function Announcements({ me }) {
  useErp();
  const list = ERP.announcements.forUser(me);
  return (
    <div className="section" style={{ gap: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}><h2>Announcements</h2><span className="badge badge-muted">{list.length} notice{list.length === 1 ? '' : 's'}</span></div>
      <div className="ann-list">
        {list.length ? list.map((a) => <AnnouncementCard key={a.id} a={a} />) : <div className="card"><Empty msg="No announcements yet" iconName="megaphone" /></div>}
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

  const submit = async (e) => {
    e.preventDefault(); setErr({ msg: '', field: '' });
    const fail = (msg, field) => { setErr({ msg, field }); toast(msg, 'bad'); };
    if (!cur) return fail('Enter your current password', 'cur');
    if (next.length < 6) return fail('New password must be at least 6 characters', 'next');
    if (next === cur) return fail('New password must differ from the current one', 'next');
    if (next !== confirm) return fail('Passwords do not match', 'confirm');
    const error = await ERP.auth.changePassword(cur, next);
    if (error) return fail(error, /current/i.test(error) ? 'cur' : 'next');
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

// ================= FEES PAYMENT =================
const FEE_TONE = { paid: 'ok', partial: 'warn', pending: 'info', none: 'info' };
const FEE_LABEL = { paid: 'Paid in full', partial: 'Partially paid', pending: 'Yet to update', none: 'Not assigned' };

function openReceipt(p, me, category) {
  const body = (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <div><div className="muted small" style={{ fontWeight: 600 }}>Receipt no.</div><h2>{p.id}</h2></div>
        <span className="badge badge-ok">Paid</span>
      </div>
      <dl className="kv">
        <dt>Student</dt><dd>{me.name}</dd>
        <dt>Roll number</dt><dd><code>{me.rollNo}</code></dd>
        <dt>Programme</dt><dd>{me.designation}</dd>
        <dt>Fee category</dt><dd>Category {category}</dd>
        <dt>Academic year</dt><dd>{p.academicYear}</dd>
        <dt>Amount paid</dt><dd><b>{fmt.inr(p.amount)}</b></dd>
        <dt>Payment mode</dt><dd>{p.mode}</dd>
        <dt>Reference</dt><dd><code>{p.reference || '—'}</code></dd>
        <dt>Paid on</dt><dd>{fmt.dateTime(p.at)}</dd>
      </dl>
      <p className="muted small" style={{ margin: '18px 0 0' }}>This is a system-generated receipt from {ERP.INSTITUTION}. For any discrepancy, contact the accounts office.</p>
    </div>
  );
  openModal({ title: 'Payment receipt', body, actions: [{ label: 'Close', tone: 'ghost' }] });
}

function Fees({ me }) {
  useErp();
  const s = ERP.fees.summaryFor(me.rollNo);
  const hasPayments = s.payments.length > 0;

  if (!s.category) {
    return (
      <div className="card">
        <div className="card-head"><div><h3>Fees</h3><p>Academic year {s.academicYear}</p></div></div>
        <Empty msg="A fee category has not been assigned to your account yet. Please contact the accounts office." iconName="wallet" />
      </div>
    );
  }

  const rows = s.payments.map((p, i) => ({ ...p, __key: `${p.id}-${i}` }));
  const columns = [
    { key: 'at', label: 'Date', render: (p) => <span title={fmt.dateTime(p.at)}>{fmt.date(p.at)}</span> },
    { key: 'amount', label: 'Amount', align: 'right', render: (p) => <b>{fmt.inr(p.amount)}</b> },
    { key: 'mode', label: 'Mode' },
    { key: 'reference', label: 'Reference', render: (p) => <code>{p.reference || '—'}</code> },
    { key: 'id', label: '', noSort: true, align: 'right', render: (p) => <button className="btn btn-ghost btn-sm" onClick={() => openReceipt(p, me, s.category)}><Icon name="download" size={14} /> Receipt</button> },
  ];

  return (
    <>
      <div className="hero fx-hero">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ margin: '0 0 4px', opacity: .85, fontWeight: 600 }}>Tuition fee · {s.academicYear}</p>
          <h2>{fmt.inr(s.annual)} <small style={{ fontSize: 15, fontWeight: 600, opacity: .85 }}>/ year</small></h2>
          <div className="hero-meta">
            <span className="chip"><Icon name="wallet" size={14} /> Category {s.category}</span>
            <span className="chip"><Icon name="cap" size={14} /> {me.designation}</span>
            <span className="chip"><Icon name={s.status === 'paid' ? 'check' : 'clock'} size={14} /> {FEE_LABEL[s.status]}</span>
          </div>
        </div>
      </div>

      <div className="cards">
        <Stat label="Annual fee" value={fmt.inr(s.annual)} iconName="rupee" tone="accent" sub={`Category ${s.category} · ${s.academicYear}`} />
        <Stat label="Amount paid" value={hasPayments ? fmt.inr(s.paid) : '—'} iconName="check" tone={hasPayments ? 'ok' : 'info'} sub={hasPayments ? `${s.payments.length} payment${s.payments.length === 1 ? '' : 's'}` : 'Not updated yet'} />
        <Stat label="Balance due" value={hasPayments ? fmt.inr(s.balance) : '—'} iconName="alert" tone={hasPayments && s.balance ? 'bad' : 'info'} sub={hasPayments ? (s.balance ? 'Pending payment' : 'Nothing due') : 'Not updated yet'} />
        <Stat label="Status" value={FEE_LABEL[s.status]} iconName="wallet" tone={FEE_TONE[s.status]} sub={hasPayments ? `${s.percent}% of annual fee` : 'Awaiting accounts update'} />
      </div>

      <div className="card">
        <div className="card-head"><div><h3>Payment history</h3><p>{hasPayments ? 'Your recorded payments for this academic year' : 'No payments recorded yet'}</p></div></div>
        {hasPayments ? (
          <DataTable columns={columns} rows={rows} pageSize={8} emptyText="No payments recorded yet" />
        ) : (
          <Empty msg="Fee payment details are yet to be updated. Once the accounts office records your payment, it will appear here with a receipt." iconName="wallet" />
        )}
      </div>
    </>
  );
}

// ================= PAGE =================
export default function StudentPage() {
  const me = useRequireRole(['student']);
  if (!me) return null;
  const sections = [
    { id: 'dashboard', label: 'Dashboard', icon: 'home', render: (u) => <Dashboard me={u} /> },
    { id: 'attendance', label: 'My Attendance', icon: 'calendar', render: () => <ComingSoon name="My Attendance" iconName="calendar" /> },
    { id: 'fees', label: 'Fees Payment', icon: 'wallet', render: (u) => <Fees me={u} /> },
    { id: 'hostel', label: 'Hostel', icon: 'bed', render: () => <ComingSoon name="Hostel" iconName="bed" /> },
    { id: 'transport', label: 'Transport', icon: 'bus', render: () => <ComingSoon name="Transport" iconName="bus" /> },
    { id: 'announcements', label: 'Announcements', icon: 'megaphone', render: (u) => <Announcements me={u} /> },
    { id: 'profile', label: 'Profile', icon: 'id', render: (u) => <Profile me={u} /> },
  ];
  return <Shell user={me} sections={sections} />;
}
