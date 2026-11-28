'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import ERP from '@/lib/erp';
import { useErp, useRequireRole } from '@/lib/ErpProvider';
import { Shell, goSection } from '@/components/Shell';
import { Icon } from '@/components/Icon';
import { Stat, Meter, Empty, Avatar, LeaveBadge, StatusBadge, Donut, AnnouncementCard, ComingSoon } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { AttendanceCalendar, CalendarLegend } from '@/components/Calendar';
import { openModal, confirmBox } from '@/components/Modal';
import { toast } from '@/components/Toast';
import { downloadXlsx } from '@/lib/xlsx';
import { DOW, FULL_MONTHS, pad, monthRange, hoursWorked, fmtDur, greeting, longDate, daysLabel } from '@/lib/dates';

const { util, fmt, LEAVE_STATE } = ERP;
const PENDING = [LEAVE_STATE.PENDING_HOD, LEAVE_STATE.PENDING_PRINCIPAL];
const ROLE_LABEL = { admin: 'Administrator', principal: 'Principal', dean: 'Dean', hod: 'Head of Department', faculty: 'Faculty / Staff', student: 'Student' };

// Page state that survives section switches.
const now = new Date();
const view = { year: now.getFullYear(), month: now.getMonth() };

const hodOf = (me) => ERP.users.hodOf(me.dept);
const principal = () => ERP.users.all().find((u) => u.role === 'principal');
const nameOf = (empId) => ERP.users.byEmp(empId)?.name || empId;
const dateSpan = (l) => (l.from === l.to ? fmt.date(l.from) : `${fmt.date(l.from)} – ${fmt.date(l.to)}`);
const latestUpload = () => ERP.attendance.uploads().slice().sort((a, b) => b.at.localeCompare(a.at))[0];

// ---------- leave detail modal ----------
function openLeaveModal(id, me) {
  const l = ERP.leaves.byId(id);
  if (!l) return toast('Leave not found', 'bad');
  const h = hodOf(me), p = principal();
  const toneOf = (a) => (a === 'Approved' ? 'ok' : a === 'Rejected' ? 'bad' : a === 'Cancelled' ? 'bad' : '');
  const steps = [];
  steps.push({ cls: '', b: 'Applied', p: `${me.name} submitted the request`, s: fmt.dateTime(l.appliedAt) });
  l.history.forEach((x) => {
    const who = x.role === 'self' ? 'You' : `${nameOf(x.by)} (${x.role === 'hod' ? 'HOD' : x.role === 'principal' ? 'Principal' : x.role})`;
    steps.push({ cls: toneOf(x.action), b: x.action, p: `by ${who}`, s: fmt.dateTime(x.at), remark: x.remark });
  });
  if (l.status === LEAVE_STATE.PENDING_HOD) {
    steps.push({ cls: 'wait', b: 'Awaiting HOD recommendation', p: h ? h.name : 'Head of Department' });
    steps.push({ cls: 'pend', b: 'Principal approval', p: p ? p.name : 'Principal' });
  } else if (l.status === LEAVE_STATE.PENDING_PRINCIPAL) {
    steps.push({ cls: 'wait', b: 'Awaiting Principal approval', p: p ? p.name : 'Principal' });
  }

  const body = (
    <>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <div><div className="muted small" style={{ fontWeight: 600 }}>{l.id}</div><h2>{fmt.leaveName(l.type)}</h2></div>
        <LeaveBadge state={l.status} />
      </div>
      <dl className="kv">
        <dt>Dates</dt><dd>{dateSpan(l)}</dd>
        <dt>Duration</dt><dd>{daysLabel(l.days)}{l.halfDay ? ' (half day)' : ''}</dd>
        <dt>Applied on</dt><dd>{fmt.dateTime(l.appliedAt)}</dd>
        <dt>Reason</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{l.reason}</dd>
      </dl>
      <h3 style={{ margin: '22px 0 14px' }}>Approval timeline</h3>
      <ol className="timeline">
        {steps.map((st, i) => (
          <li key={i} className={st.cls}>
            <b>{st.b}</b><p>{st.p}</p>{st.s ? <small>{st.s}</small> : null}
            {st.remark ? <div className="remark">“{st.remark}”</div> : null}
          </li>
        ))}
      </ol>
    </>
  );

  const actions = [{ label: 'Close', tone: 'ghost' }];
  if (PENDING.includes(l.status)) {
    actions.unshift({
      label: 'Cancel request', tone: 'danger',
      onClick: (close) => {
        confirmBox('Cancel this leave request?', `Your ${fmt.leaveName(l.type)} for ${dateSpan(l)} will be withdrawn. This cannot be undone.`, { okLabel: 'Yes, cancel it', tone: 'danger' })
          .then((ok) => {
            if (!ok) return;
            try { ERP.leaves.cancel(l.id, me.empId); close(); toast('Leave request cancelled'); } catch (err) { toast(err.message, 'bad'); }
          });
        return false;
      },
    });
  }
  openModal({ title: 'Leave request', body, actions });
}

// ================= DASHBOARD =================
function Dashboard({ me }) {
  useErp();
  const [from, to] = monthRange(now.getFullYear(), now.getMonth());
  const s = ERP.attendance.summaryFor(me.empId, from, to);
  const bal = ERP.leaves.balance(me.empId);
  const cl = bal.find((b) => b.code === 'CL');
  const clAvail = cl.remaining - cl.pending;
  const pctTone = !s.total ? 'info' : s.percent >= 85 ? 'ok' : s.percent >= 75 ? 'warn' : 'bad';
  const myLeaves = ERP.leaves.forEmp(me.empId).slice(0, 5);
  const anns = ERP.announcements.forUser(me).slice(0, 4);
  const pend = ERP.leaves.forEmp(me.empId).filter((l) => PENDING.includes(l.status)).length;

  return (
    <>
      <div className="hero fx-hero">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ margin: '0 0 4px', opacity: .8, fontWeight: 600 }}>{greeting()},</p>
          <h2>{me.name}</h2>
          <div className="hero-meta">
            <span className="chip"><Icon name="user" size={14} /> {me.designation}</span>
            <span className="chip"><Icon name="building" size={14} /> {fmt.deptName(me.dept)}</span>
            <span className="chip"><Icon name="calendar" size={14} /> {longDate()}</span>
          </div>
        </div>
        <button className="btn btn-hero" onClick={() => goSection('apply')}><Icon name="plus" size={18} /> Apply for leave</button>
      </div>
      <div className="cards">
        <Stat label="Attendance this month" value={s.total ? `${s.percent}%` : '—'} iconName="chart" tone={pctTone} sub={s.total ? `${FULL_MONTHS[now.getMonth()]} · ${s.total} marked days` : 'No records yet this month'} />
        <Stat label="Present days" value={s.P + s.OD} iconName="check" tone="ok" sub={`${s.P} present · ${s.OD} on duty · ${s.HD} half`} />
        <Stat label="Absences" value={s.A} iconName="alert" tone={s.A ? 'bad' : 'info'} sub={`${s.L} on leave this month`} />
        <Stat label="Casual leave left" iconName="leave" tone="accent"
          value={<>{clAvail}<small className="muted" style={{ fontSize: 14, fontWeight: 600 }}> / {cl.quota}</small></>}
          sub={cl.pending ? `${cl.pending} pending approval` : `${cl.used} used this year`} />
      </div>
      <div className="cols">
        <div className="section" style={{ gap: 20 }}>
          <div className="card">
            <div className="card-head"><div><h3>Recent leave requests</h3><p>{pend ? `${pend} awaiting approval` : 'Your latest applications'}</p></div><a href="#leaves" className="btn btn-ghost btn-sm">View all</a></div>
            <div className="list">
              {myLeaves.length ? myLeaves.map((l) => (
                <div className="list-item click" key={l.id} onClick={() => openLeaveModal(l.id, me)}>
                  <div><b>{fmt.leaveName(l.type)}</b> <span className="muted small">· {daysLabel(l.days)}</span><p>{dateSpan(l)}</p></div>
                  <LeaveBadge state={l.status} />
                </div>
              )) : (
                <>
                  <Empty msg="No leave requests yet" iconName="leave" />
                  <div style={{ textAlign: 'center' }}><button className="btn btn-primary btn-sm" onClick={() => goSection('apply')}><Icon name="plus" size={16} /> Apply now</button></div>
                </>
              )}
            </div>
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
        <div className="card">
          <div className="card-head"><div><h3>{FULL_MONTHS[now.getMonth()]} {now.getFullYear()}</h3><p>Hover a day for details</p></div><a href="#attendance" className="btn btn-ghost btn-sm">Full view</a></div>
          <div className="cal-wrap"><AttendanceCalendar empId={me.empId} year={now.getFullYear()} month={now.getMonth()} mini /></div>
          <CalendarLegend />
          {s.total ? (
            <div className="pct-block">
              <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted small" style={{ fontWeight: 600 }}>Monthly attendance</span><b>{s.percent}%</b></div>
              <Meter pct={s.percent} />
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

// ================= ATTENDANCE =================
function monthOptions(me) {
  const opts = [];
  for (let i = 0; i < 12; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); opts.push([d.getFullYear(), d.getMonth()]); }
  const first = ERP.attendance.forEmp(me.empId)[0];
  if (first) {
    const [fy, fm] = first.date.split('-').map(Number);
    let d = new Date(opts[opts.length - 1][0], opts[opts.length - 1][1] - 1, 1);
    while (d >= new Date(fy, fm - 1, 1)) { opts.push([d.getFullYear(), d.getMonth()]); d = new Date(d.getFullYear(), d.getMonth() - 1, 1); }
  }
  return opts;
}

function Attendance({ me }) {
  useErp();
  const [y, setY] = useState(view.year);
  const [m, setM] = useState(view.month);
  const [tab, setTab] = useState('calendar');
  useEffect(() => { view.year = y; view.month = m; }, [y, m]);

  const opts = monthOptions(me);
  const idx = opts.findIndex(([oy, om]) => oy === y && om === m);
  const [from, to] = monthRange(y, m);
  const rows = ERP.attendance.forEmp(me.empId, from, to);
  const s = ERP.attendance.summarize(rows);
  const up = latestUpload();
  const mineUp = rows.length ? ERP.attendance.uploads().find((u) => u.id === rows[rows.length - 1].uploadId) : null;
  const go = (i) => { if (i < 0 || i >= opts.length) return; setY(opts[i][0]); setM(opts[i][1]); };

  const exportRows = () => {
    downloadXlsx(`Attendance_${me.empId}_${y}-${pad(m + 1)}.xlsx`,
      ['Employee ID', 'Name', 'Date', 'Day', 'Status', 'In Time', 'Out Time', 'Hours Worked'],
      rows.map((r) => [me.empId, me.name, r.date, DOW[util.parseISO(r.date).getDay()], ERP.STATUS[r.status]?.label || r.status, r.inTime, r.outTime, hoursWorked(r) == null ? '' : +(hoursWorked(r) / 60).toFixed(2)]),
      `${FULL_MONTHS[m].slice(0, 3)} ${y}`);
    toast('Attendance exported');
  };

  const tableRows = rows.slice().reverse().map((r, i) => ({ ...r, __key: `${r.date}-${i}` }));

  return (
    <>
      <div className="card" style={{ padding: '14px 18px' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="month-nav">
            <button className="icon-btn" aria-label="Previous month" disabled={idx >= opts.length - 1} onClick={() => go(idx + 1)}>
              <svg className="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg>
            </button>
            <select aria-label="Month" value={idx} onChange={(e) => go(Number(e.target.value))}>
              {opts.map(([oy, om], i) => <option key={i} value={i}>{FULL_MONTHS[om]} {oy}</option>)}
            </select>
            <button className="icon-btn" aria-label="Next month" disabled={idx <= 0} onClick={() => go(idx - 1)}>
              <svg className="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </div>
          <div className="tabs" role="tablist">
            <button className={tab === 'calendar' ? 'active' : ''} onClick={() => setTab('calendar')}>Calendar</button>
            <button className={tab === 'list' ? 'active' : ''} onClick={() => setTab('list')}>List</button>
          </div>
        </div>
      </div>

      {up ? (
        <div className="banner banner-info"><Icon name="clock" size={18} /><div><b>Last updated from upload on {fmt.dateTime(up.at)}</b><span className="small">{up.fileName}{up.from ? ` · covers ${fmt.date(up.from)} – ${fmt.date(up.to)}` : ''}{mineUp && mineUp.id !== up.id ? ` · this month's data from “${mineUp.fileName}”` : ''}</span></div></div>
      ) : null}
      {rows.length && s.percent < 75 ? (
        <div className="banner banner-bad"><Icon name="alert" size={18} /><div><b>Attendance below 75% for {FULL_MONTHS[m]} {y}</b><span className="small">You are at {s.percent}%. The institution requires a minimum of 75%. Please contact your HOD if any records look incorrect.</span></div></div>
      ) : null}

      <div className="cols">
        <div className="card" id="att-main">
          {tab === 'calendar' ? (
            <>
              <div className="card-head"><div><h3>{FULL_MONTHS[m]} {y}</h3><p>Hover or tap a day to see status and punch times</p></div></div>
              <div className="cal-wrap"><AttendanceCalendar empId={me.empId} year={y} month={m} /></div>
              <CalendarLegend />
              {!rows.length ? <p className="muted small" style={{ margin: '14px 0 0', textAlign: 'center' }}>No records uploaded for this month{from > util.today() ? ' — it hasn\'t started yet' : ''}.</p> : null}
            </>
          ) : (
            <>
              <div className="card-head"><div><h3>Daily records</h3><p>{daysLabel(rows.length)} recorded</p></div></div>
              <DataTable
                rows={tableRows}
                pageSize={10}
                emptyText="No records for this month"
                toolbar={<button className="btn btn-ghost btn-sm" disabled={!rows.length} onClick={exportRows}><Icon name="excel" size={16} /> Export to Excel</button>}
                columns={[
                  { key: 'date', label: 'Date', render: (r) => <b>{fmt.date(r.date)}</b> },
                  { key: 'day', label: 'Day', render: (r) => DOW[util.parseISO(r.date).getDay()], sort: (r) => util.parseISO(r.date).getDay() },
                  { key: 'status', label: 'Status', render: (r) => <><StatusBadge code={r.status} /> <span className="muted small">{ERP.STATUS[r.status]?.label || ''}</span></> },
                  { key: 'inTime', label: 'In', render: (r) => r.inTime || '—' },
                  { key: 'outTime', label: 'Out', render: (r) => r.outTime || '—' },
                  { key: 'hours', label: 'Hours', align: 'right', render: (r) => fmtDur(hoursWorked(r)), sort: (r) => hoursWorked(r) ?? -1 },
                ]}
              />
            </>
          )}
        </div>
        <div className="card">
          <div className="card-head"><div><h3>Month summary</h3><p>{FULL_MONTHS[m]} {y}</p></div></div>
          {rows.length ? (
            <>
              <Donut parts={Object.entries(ERP.STATUS).map(([k, st]) => ({ label: st.label, value: s[k] || 0, tone: st.tone }))} center={`${s.percent}%`} />
              <div className="pct-block">
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}><span className="muted small" style={{ fontWeight: 600 }}>Attendance</span><span className="pct-big" style={{ color: `var(${s.percent >= 85 ? '--ok' : s.percent >= 75 ? '--warn' : '--bad'})` }}>{s.percent}%</span></div>
                <Meter pct={s.percent} />
                <span className="muted small">(Present + On duty + ½ × Half day) ÷ (marked days − leave). Minimum required: 75%.</span>
              </div>
            </>
          ) : <Empty msg="No attendance records for this month yet." iconName="calendar" />}
        </div>
      </div>
    </>
  );
}

// ================= PROFILE =================
function Profile({ me }) {
  useErp();
  const u = ERP.users.byEmp(me.empId);
  const h = hodOf(me);
  const years = u.joinDate ? (Date.now() - util.parseISO(u.joinDate).getTime()) / (365.25 * 86400000) : null;

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
        <button type="button" onClick={() => setShow((s) => ({ ...s, [field]: !s[field] }))}>{show[field] ? 'Hide' : 'Show'}</button>
      </div>
    </label>
  );

  return (
    <div className="cols">
      <div className="card">
        <div className="profile-head"><Avatar name={u.name} size={72} /><div><h2>{u.name}</h2><p className="muted" style={{ margin: '4px 0 8px' }}>{u.designation} · {fmt.deptName(u.dept)}</p><span className="badge badge-accent">{ROLE_LABEL[u.role]}</span></div></div>
        <dl className="kv">
          <dt>Employee ID</dt><dd><code>{u.empId}</code></dd>
          <dt>Department</dt><dd>{fmt.deptName(u.dept)} ({u.dept})</dd>
          <dt>Designation</dt><dd>{u.designation}</dd>
          <dt>Email</dt><dd>{u.email ? <a href={`mailto:${u.email}`}>{u.email}</a> : '—'}</dd>
          <dt>Phone</dt><dd>{u.phone || '—'}</dd>
          <dt>Joined</dt><dd>{fmt.date(u.joinDate)}{years == null ? '' : <span className="muted small"> · {years >= 1 ? `${Math.floor(years)} yr${Math.floor(years) > 1 ? 's' : ''} of service` : 'less than a year'}</span>}</dd>
          <dt>Timings</dt><dd>{u.timings || '—'}</dd>
          <dt>Reporting to</dt><dd>{h ? `${h.name} (HOD)` : (u.reportsTo || '—')}</dd>
          <dt>Username</dt><dd><code>{u.username}</code></dd>
        </dl>
        <p className="muted small" style={{ margin: '18px 0 0' }}>To correct any of these details, please contact the ERP administrator.</p>
      </div>
      <form className="card" onSubmit={submit} noValidate>
        <div className="card-head"><div><h3>Change password</h3><p>Use at least 6 characters</p></div></div>
        {err.msg ? <div className="form-error"><Icon name="alert" size={16} /><span>{err.msg}</span></div> : null}
        {pwField('Current password', 'cur', cur, setCur, 'current-password')}
        {pwField('New password', 'next', next, setNext, 'new-password')}
        <div className="pw-strength"><div style={{ width: next ? `${Math.max(12, score * 20)}%` : 0, background: `var(${score <= 1 ? '--bad' : score <= 3 ? '--warn' : '--ok'})` }} /></div>
        {pwField('Confirm new password', 'confirm', confirm, setConfirm, 'new-password')}
        <button className="btn btn-primary btn-block" type="submit"><Icon name="check" size={16} /> Update password</button>
      </form>
    </div>
  );
}

// ================= APPLY LEAVE =================
function Apply({ me }) {
  useErp();
  const bal = ERP.leaves.balance(me.empId);
  const avail = (b) => (b.quota == null ? Infinity : b.remaining - b.pending);
  const h = hodOf(me), p = principal();
  const firstType = (bal.find((b) => avail(b) > 0) || bal[0]).code;
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); if (d.getDay() === 0) d.setDate(d.getDate() + 1); return util.iso(d); })();

  const [type, setType] = useState(firstType);
  const [from, setFrom] = useState(tomorrow);
  const [to, setTo] = useState(tomorrow);
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState(null); // { msg, field }

  const toVal = (!to || to < from) ? from : to;
  const single = from && from === toVal && !util.isSunday(from);
  const effHalf = single && halfDay;
  const b = bal.find((x) => x.code === type) || bal[0];
  const wd = (from && toVal) ? util.workingDays(from, toVal).length : 0;
  const total = (from && toVal) ? util.daysBetween(from, toVal).length : 0;
  const n = effHalf ? 0.5 : wd;
  const a = avail(b);
  const over = b.quota != null && n > a;
  const sundays = total - wd;
  const len = reason.length;

  const clearErr = () => setErr(null);
  const reset = () => { setType(firstType); setFrom(tomorrow); setTo(tomorrow); setHalfDay(false); setReason(''); setErr(null); };

  const submit = (e) => {
    e.preventDefault();
    clearErr();
    if (!from) return setErr({ msg: 'Choose a start date', field: 'from' });
    if (!toVal) return setErr({ msg: 'Choose an end date', field: 'to' });
    try {
      const l = ERP.leaves.apply({ empId: me.empId, type, from, to: toVal, reason, halfDay: effHalf });
      toast(`${l.type} leave for ${daysLabel(l.days)} submitted to ${l.status === LEAVE_STATE.PENDING_HOD ? 'HOD' : 'Principal'}`);
      goSection('leaves');
    } catch (ex) {
      const msg = ex.message || String(ex);
      const field = /reason/i.test(msg) ? 'reason' : /balance/i.test(msg) ? 'type' : /date|range|overlap|working/i.test(msg) ? 'from' : null;
      setErr({ msg, field });
      toast(msg, 'bad');
    }
  };

  return (
    <>
      <div className="card">
        <div className="card-head"><div><h3>Your leave balance · {now.getFullYear()}</h3><p>Click a card to choose that leave type</p></div></div>
        <div className="bal-grid">
          {bal.map((bc) => {
            const av = avail(bc);
            const pct = bc.quota ? ((bc.used + bc.pending) / bc.quota) * 100 : 0;
            const exhausted = bc.quota != null && av <= 0;
            const pick = () => { if (exhausted) return toast(`No ${bc.code} balance left`, 'bad'); setType(bc.code); clearErr(); };
            return (
              <div key={bc.code} className={`bal-card${bc.code === type ? ' sel' : ''}`} tabIndex={0} role="button" aria-label={bc.name}
                onClick={pick} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="code">{bc.code}</span>
                  {bc.quota == null ? <span className="badge badge-muted">No cap</span> : exhausted ? <span className="badge badge-bad">Exhausted</span> : null}
                </div>
                <div>
                  <div className="muted small" style={{ fontWeight: 600 }}>{bc.name}</div>
                  <div className="big">{bc.quota == null ? '∞' : av}{bc.quota == null ? null : <small> / {bc.quota} left</small>}</div>
                </div>
                {bc.quota == null ? <div className="meter"><div style={{ width: 0 }} /></div> : <Meter pct={100 - pct} tone={pct >= 90 ? 'bad' : pct >= 60 ? 'warn' : 'ok'} />}
                <div className="nums"><span>Used <b>{bc.used}</b></span><span>Pending <b>{bc.pending}</b></span></div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="cols">
        <form className="card" onSubmit={submit} noValidate>
          <div className="card-head"><div><h3>Leave application</h3><p>Sundays are excluded automatically</p></div></div>
          {err ? <div className="form-error"><Icon name="alert" size={16} /><span>{err.msg}</span></div> : null}
          <label className={`field${err?.field === 'type' ? ' err' : ''}`}><span>Leave type</span>
            <select value={type} onChange={(e) => { setType(e.target.value); clearErr(); }}>
              {bal.map((bc) => (
                <option key={bc.code} value={bc.code} disabled={bc.quota != null && avail(bc) <= 0}>
                  {bc.name} ({bc.code}) — {bc.quota == null ? 'no limit' : `${avail(bc)} of ${bc.quota} remaining`}
                </option>
              ))}
            </select>
          </label>
          <div className="grid-2">
            <label className={`field${err?.field === 'from' ? ' err' : ''}`}><span>From</span><input type="date" value={from} onChange={(e) => { setFrom(e.target.value); clearErr(); }} /></label>
            <label className={`field${err?.field === 'to' ? ' err' : ''}`}><span>To</span><input type="date" min={from} value={toVal} onChange={(e) => { setTo(e.target.value); clearErr(); }} /></label>
          </div>
          <label className={`check${single ? '' : ' disabled'}`}><input type="checkbox" checked={effHalf} disabled={!single} onChange={(e) => setHalfDay(e.target.checked)} /> Half day <span className="muted small" style={{ fontWeight: 500 }}>(only for single-day leave)</span></label>
          <div className={`daycount${over ? ' over' : ''}`}>
            <span className="n">{n}</span>
            <div>
              <b>{`working day${n === 1 ? '' : 's'}${effHalf ? ' (half day)' : ''}`}</b>
              <small>{over ? `Exceeds your ${b.code} balance of ${a}` : (from && toVal ? `${fmt.date(from)}${from !== toVal ? ` → ${fmt.date(toVal)}` : ''}${sundays ? ` · ${sundays} Sunday${sundays > 1 ? 's' : ''} excluded` : ''}` : 'Pick your dates')}</small>
            </div>
          </div>
          <label className={`field${err?.field === 'reason' ? ' err' : ''}`}><span>Reason</span><textarea rows={4} maxLength={500} placeholder="Briefly describe the reason for your leave" value={reason} onChange={(e) => { setReason(e.target.value); clearErr(); }} /></label>
          <div className={`counter ${len > 450 ? 'warn' : ''} ${len && len < 5 ? 'bad' : ''}`}>{len} / 500{len && len < 5 ? ' · at least 5 characters' : ''}</div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={reset}>Clear</button>
            <button type="submit" className="btn btn-primary"><Icon name="check" size={16} /> Submit application</button>
          </div>
        </form>
        <div className="section" style={{ gap: 20 }}>
          <div className="card">
            <div className="card-head"><div><h3>Approval route</h3><p>Your request moves through these steps</p></div></div>
            <div className="route">
              <div className="step"><Avatar name={me.name} size={28} /><div><b>You</b><small>Apply</small></div></div><span className="arrow">→</span>
              <div className="step"><Avatar name={h ? h.name : 'HOD'} size={28} /><div><b>HOD{h ? ` (${h.name})` : ''}</b><small>Recommend</small></div></div><span className="arrow">→</span>
              <div className="step"><Avatar name={p ? p.name : 'Principal'} size={28} /><div><b>Principal</b><small>{p ? p.name : 'Final approval'}</small></div></div>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><div><h3>Good to know</h3></div></div>
            <ul className="muted small" style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>Pending requests count against your balance until decided.</li>
              <li>Half day uses 0.5 of the selected leave type.</li>
              <li>You can cancel a request while it is still pending.</li>
              <li>On Duty (OD) is for conferences, camps and official work.</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

// ================= MY LEAVES =================
const FILTERS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'pending', label: 'Pending', test: (l) => PENDING.includes(l.status) },
  { id: 'approved', label: 'Approved', test: (l) => l.status === LEAVE_STATE.APPROVED },
  { id: 'rejected', label: 'Rejected', test: (l) => l.status === LEAVE_STATE.REJECTED },
];

function MyLeaves({ me }) {
  useErp();
  const [filter, setFilter] = useState('all');
  const all = ERP.leaves.forEmp(me.empId);
  const rows = all
    .filter(FILTERS.find((x) => x.id === filter).test)
    .map((l) => ({ ...l, __key: l.id, __rowClass: 'clickable', __onClick: () => openLeaveModal(l.id, me) }));
  const columns = [
    { key: 'type', label: 'Type', render: (l) => <><b>{l.type}</b> <span className="muted small">{fmt.leaveName(l.type)}</span></> },
    { key: 'from', label: 'Dates', render: (l) => <>{dateSpan(l)}{l.halfDay ? <> <span className="badge badge-info">½</span></> : null}</> },
    { key: 'days', label: 'Days', align: 'right' },
    { key: 'status', label: 'Status', render: (l) => <LeaveBadge state={l.status} /> },
    { key: 'appliedAt', label: 'Applied', render: (l) => <span title={fmt.dateTime(l.appliedAt)}>{fmt.date(l.appliedAt)}</span> },
    { key: 'id', label: '', noSort: true, align: 'right', render: (l) => <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); openLeaveModal(l.id, me); }}>View</button> },
  ];
  return (
    <div className="card">
      <div className="leave-tabs">
        <div className="tabs" role="tablist">
          {FILTERS.map((x) => (
            <button key={x.id} className={filter === x.id ? 'active' : ''} onClick={() => setFilter(x.id)}>{x.label}<em>{all.filter(x.test).length}</em></button>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => goSection('apply')}><Icon name="plus" size={16} /> Apply for leave</button>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        pageSize={10}
        search={(l) => `${l.type} ${fmt.leaveName(l.type)} ${l.reason} ${l.status} ${l.from} ${l.to}`}
        emptyText={filter === 'all' ? 'You have not applied for any leave yet' : `No ${filter} requests`}
      />
    </div>
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

// ================= PAGE =================
export default function FacultyPage() {
  const me = useRequireRole(['faculty']);
  if (!me) return null;
  const pendingCount = () => ERP.leaves.forEmp(me.empId).filter((l) => PENDING.includes(l.status)).length;
  const sections = [
    { id: 'dashboard', label: 'Dashboard', icon: 'home', render: (u) => <Dashboard me={u} /> },
    { id: 'attendance', label: 'My Attendance', icon: 'calendar', render: (u) => <Attendance me={u} /> },
    { id: 'apply', label: 'Apply Leave', icon: 'plus', render: () => <ComingSoon name="Apply Leave" /> },
    { id: 'leaves', label: 'My Leaves', icon: 'leave', render: () => <ComingSoon name="My Leaves" /> },
    { id: 'announcements', label: 'Announcements', icon: 'megaphone', render: (u) => <Announcements me={u} /> },
    { id: 'profile', label: 'Profile', icon: 'user', render: (u) => <Profile me={u} /> },
  ];
  return <Shell user={me} sections={sections} />;
}
