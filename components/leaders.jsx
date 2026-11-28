'use client';
import { useEffect, useReducer, useRef, useState } from 'react';
import ERP from '@/lib/erp';
import { useErp } from '@/lib/ErpProvider';
import { Icon } from './Icon';
import { Avatar, Badge, LeaveBadge, StatusBadge, Meter, Empty, Stat, Donut } from './ui';
import { DataTable } from './DataTable';
import { openModal, confirmBox } from './Modal';
import { toast } from './Toast';
import { downloadXlsx } from '@/lib/xlsx';
import {
  PENDING, LIVE, STAFF_ROLES, TYPE_TONE, DOW, MONTHS_LONG,
  addDays, pctTone, short, isStaff, principal, dateRange, daysLabel, greeting, fileStamp,
  presetRange, PRESETS, keep, staffSummary, deptStats,
} from '@/lib/leaders-helpers';

const U = ERP.util, F = ERP.fmt, LS = ERP.LEAVE_STATE;
const ROLE_LABEL = { admin: 'Administrator', principal: 'Principal', dean: 'Dean', hod: 'Head of Department', faculty: 'Faculty / Staff', student: 'Student' };

// ---------- presentational ----------
export function Person({ u, sub, size = 34 }) {
  return (
    <div className="person">
      <Avatar name={u.name} size={size} />
      <div><b>{u.name}</b><small>{sub ?? `${u.designation}${u.dept ? ' · ' + u.dept : ''}`}</small></div>
    </div>
  );
}
export function TypeBadge({ code }) { return <span className={`badge badge-${TYPE_TONE[code] || 'muted'}`} title={F.leaveName(code)}>{code}</span>; }
const Num = ({ n }) => <span className={`ld-num ${n ? '' : 'zero'}`}>{n}</span>;
const PctCell = ({ p, total }) => (total ? <div className="ld-pct"><Meter pct={p} /><b>{p}%</b></div> : <span className="muted small">No records</span>);

// Persistent per-screen filter state (survives section switches via the module memo).
function usePersistent(key, init) {
  const store = keep(key, init);
  const [, force] = useReducer((x) => x + 1, 0);
  const patch = (p) => { Object.assign(store, typeof p === 'function' ? p(store) : p); force(); };
  return [store, patch];
}

// ---------- filter controls ----------
function RangeControls({ st, patch }) {
  const setDate = (k, v) => {
    if (!v) return;
    const nextFrom = k === 'from' ? v : st.from;
    const nextTo = k === 'to' ? v : st.to;
    if (nextFrom && nextTo && nextFrom > nextTo) { toast('"From" date must be on or before "To" date', 'bad'); return; }
    patch({ [k]: v, preset: '' });
  };
  return (
    <div className="ld-range">
      <label className="ld-in"><span>From</span><input type="date" value={st.from} onChange={(e) => setDate('from', e.target.value)} /></label>
      <label className="ld-in"><span>To</span><input type="date" value={st.to} onChange={(e) => setDate('to', e.target.value)} /></label>
      <div className="ld-presets">
        {PRESETS.map(([k, l]) => (
          <button type="button" key={k} className={`ld-chip ${st.preset === k ? 'active' : ''}`} onClick={() => patch({ ...presetRange(k), preset: k })}>{l}</button>
        ))}
      </div>
    </div>
  );
}
function DeptSelect({ value, onChange, allLabel = 'All departments' }) {
  return (
    <label className="ld-in"><span>Department</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{allLabel}</option>
        {ERP.DEPARTMENTS.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
      </select>
    </label>
  );
}

// ---------- charts ----------
export function TrendChart({ weeks }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    requestAnimationFrame(() => el.querySelectorAll('.ld-col-bar').forEach((b) => { b.style.height = `calc((100% - 70px) * ${b.dataset.h / 100})`; }));
  }, [weeks]);
  return (
    <div className="ld-colchart" ref={ref}>
      {weeks.map((w, i) => {
        const prev = weeks[i - 1];
        const d = prev && prev.s.total && w.s.total ? Math.round((w.s.percent - prev.s.percent) * 10) / 10 : null;
        return (
          <div className="ld-col" key={w.from} title={`${F.date(w.from)} – ${F.date(w.to)}: ${w.s.total} records`}>
            <span className="ld-col-val">{w.s.total ? w.s.percent + '%' : '—'}</span>
            {d != null ? <span className={`ld-delta ${d >= 0 ? 'up' : 'down'}`}>{d >= 0 ? '▲' : '▼'} {Math.abs(d)}</span> : <span className="ld-delta">&nbsp;</span>}
            <div className={`ld-col-bar bar-${pctTone(w.s.percent)}`} data-h={w.s.percent} />
            <span className="ld-col-lbl">Wk of {w.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ClickableBars({ items, onPick, max = 100, suffix = '%', active = null }) {
  const ref = useRef(null);
  const m = max ?? Math.max(1, ...items.map((i) => i.value));
  useEffect(() => {
    const el = ref.current; if (!el) return;
    requestAnimationFrame(() => el.querySelectorAll('.bar-fill').forEach((b) => { b.style.width = b.dataset.w + '%'; }));
  }, [items, m]);
  return (
    <div className="bars" ref={ref}>
      {items.map((it, i) => (
        <div key={it.key ?? i} className={`bar-row ld-pick${active != null && it.key === active ? ' on' : ''}`} tabIndex={0} role="button"
          title={`View ${it.title || it.label}`} onClick={() => onPick(it, i)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(it, i); } }}>
          <span className="bar-label">{it.label}</span>
          <div className="bar-track"><div className={`bar-fill bar-${it.tone || 'accent'}`} style={{ width: 0 }} data-w={(it.value / m) * 100} /></div>
          <span className="bar-val">{it.value}{suffix}</span>
        </div>
      ))}
    </div>
  );
}

export function statusDonutParts(rows) {
  const c = ERP.attendance.summarize(rows);
  return {
    parts: [
      { label: 'Present', value: c.P, tone: 'ok' }, { label: 'Absent', value: c.A, tone: 'bad' }, { label: 'On Leave', value: c.L, tone: 'warn' },
      { label: 'Half Day', value: c.HD, tone: 'info' }, { label: 'On Duty', value: c.OD, tone: 'accent' },
    ], center: `${c.percent}%`, c,
  };
}
export function StatusDonut({ rows, center }) { const { parts, center: cc } = statusDonutParts(rows); return <Donut parts={parts} center={center ?? cc} />; }
export function LeaveTypeDonut({ list }) {
  const parts = ERP.LEAVE_TYPES.map((t) => ({ label: t.name, value: list.filter((l) => l.type === t.code).reduce((s, l) => s + l.days, 0), tone: TYPE_TONE[t.code] }));
  return <Donut parts={parts} center={`${parts.reduce((s, p) => s + p.value, 0)}d`} />;
}

// ---------- person drill-down modal ----------
function PersonDrill({ u, empId, rng, ymRef }) {
  const [ym, setYm] = useState({ y: ymRef.y, m: ymRef.m });
  useEffect(() => { ymRef.y = ym.y; ymRef.m = ym.m; }, [ym, ymRef]);
  const now = U.parseISO(U.today());
  const rs = ERP.attendance.summaryFor(empId, rng.from, rng.to);
  const mFrom = U.iso(new Date(ym.y, ym.m, 1)), mTo = U.iso(new Date(ym.y, ym.m + 1, 0));
  const recs = ERP.attendance.forEmp(empId, mFrom, mTo);
  const map = new Map(recs.map((r) => [r.date, r]));
  const ms = ERP.attendance.summarize(recs);
  const lvs = ERP.leaves.forEmp(empId).filter((l) => LIVE.includes(l.status) && l.from <= mTo && l.to >= mFrom);
  const leaveOn = (d) => lvs.find((l) => l.from <= d && l.to >= d);
  const first = new Date(ym.y, ym.m, 1).getDay(), n = new Date(ym.y, ym.m + 1, 0).getDate();
  const atEnd = ym.y > now.getFullYear() || (ym.y === now.getFullYear() && ym.m >= now.getMonth());
  const step = (dir) => setYm((p) => { let m = p.m + dir, y = p.y; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } return { y, m }; });

  const cells = [];
  DOW.forEach((d) => cells.push(<div className="cal-h" key={`h${d}`}>{d.slice(0, 2)}</div>));
  for (let i = 0; i < first; i++) cells.push(<div className="cal-d blank" key={`b${i}`} />);
  for (let i = 1; i <= n; i++) {
    const iso = U.iso(new Date(ym.y, ym.m, i)), r = map.get(iso), lv = leaveOn(iso), sun = U.isSunday(iso);
    const tip = r ? `${F.date(iso)} · ${ERP.STATUS[r.status].label}${r.inTime ? ` · ${r.inTime}–${r.outTime || '?'}` : ''}` : lv ? `${F.date(iso)} · ${lv.type} leave (${lv.status})` : sun ? `${F.date(iso)} · Sunday` : `${F.date(iso)} · No record`;
    const cls = ['cal-d', r ? `s-${r.status}` : '', !r && sun ? 'sun' : '', !r && lv && !sun ? 'ld-onleave' : '', iso === U.today() ? 'today' : ''].filter(Boolean).join(' ');
    cells.push(<div className={cls} key={iso} title={tip}>{i}<small>{r ? r.status : !sun && lv ? lv.type : ''}</small></div>);
  }

  return (
    <>
      <div className="ld-modal-top">
        <Person u={u} sub={`${u.empId} · ${u.designation}${u.dept ? ' · ' + F.deptName(u.dept) : ''}`} size={44} />
        <div style={{ textAlign: 'right' }}><div className={`ld-big ${rs.total ? pctTone(rs.percent) : ''}`}>{rs.total ? rs.percent + '%' : '—'}</div><small className="muted">{F.date(rng.from)} – {F.date(rng.to)}</small></div>
      </div>
      <div className="ld-drill-grid">
        <div>
          <div className="ld-monthnav"><button className="icon-btn" aria-label="Previous month" onClick={() => step(-1)}>‹</button><b>{MONTHS_LONG[ym.m]} {ym.y}</b><button className="icon-btn" aria-label="Next month" disabled={atEnd} onClick={() => step(1)}>›</button></div>
          <div className="cal">{cells}</div>
          <div className="ld-legend">{Object.entries(ERP.STATUS).map(([k, v]) => <span key={k}><i className={`s-${k}`} />{v.label}</span>)}<span><i style={{ boxShadow: 'inset 0 0 0 2px var(--warn)' }} />Leave (no record)</span></div>
        </div>
        <div>
          <div className="ld-chips" style={{ marginBottom: 12 }}>{['P', 'A', 'L', 'HD', 'OD'].map((k) => <span key={k}><StatusBadge code={k} /> {ms[k] || 0}</span>)}<span>Month: <b>{ms.total ? ms.percent + '%' : '—'}</b></span></div>
          {recs.length ? (
            <div className="ld-records"><table><thead><tr><th>Date</th><th>Status</th><th>In</th><th>Out</th></tr></thead>
              <tbody>{recs.slice().reverse().map((r) => <tr key={r.date}><td>{F.date(r.date).slice(0, 6)} <span className="muted small">{DOW[U.parseISO(r.date).getDay()]}</span></td><td><StatusBadge code={r.status} /></td><td>{r.inTime || '—'}</td><td>{r.outTime || '—'}</td></tr>)}</tbody>
            </table></div>
          ) : <Empty msg="No attendance records for this month" iconName="calendar" />}
          {lvs.length ? (
            <><div className="ld-sub">Leaves this month</div><div className="ld-list">{lvs.map((l) => (
              <div className="ld-item" key={l.id} style={{ cursor: 'pointer' }} onClick={() => openLeaveModal(l.id)}><TypeBadge code={l.type} /><span style={{ flex: 1 }}>{dateRange(l)} <span className="muted small">· {daysLabel(l.days)}</span></span><LeaveBadge state={l.status} /></div>
            ))}</div></>
          ) : null}
        </div>
      </div>
    </>
  );
}
export function openPersonModal(empId, rng = presetRange('30')) {
  const u = ERP.users.byEmp(empId);
  if (!u) return toast('Employee not found', 'bad');
  const start = U.parseISO(rng.to && rng.to < U.today() ? rng.to : U.today());
  const ymRef = { y: start.getFullYear(), m: start.getMonth() };
  openModal({
    title: 'Attendance detail', wide: true,
    body: <PersonDrill u={u} empId={empId} rng={rng} ymRef={ymRef} />,
    actions: [
      { label: 'Export month', tone: 'ghost', onClick: () => {
        const mFrom = U.iso(new Date(ymRef.y, ymRef.m, 1)), mTo = U.iso(new Date(ymRef.y, ymRef.m + 1, 0));
        const recs = ERP.attendance.forEmp(empId, mFrom, mTo);
        if (!recs.length) { toast('Nothing to export for this month', 'bad'); return false; }
        downloadXlsx(`attendance_${u.empId}_${ymRef.y}-${String(ymRef.m + 1).padStart(2, '0')}.xlsx`, ERP.attendance.TEMPLATE_HEADERS,
          recs.map((r) => [u.empId, u.name, u.dept || '', r.date, r.status, r.inTime, r.outTime]), 'Attendance');
        toast('Exported'); return false;
      } },
      { label: 'Close', tone: 'primary' },
    ],
  });
}

// ---------- leave detail modal ----------
export function openLeaveModal(id, { actions } = {}) {
  const l = ERP.leaves.byId(id);
  if (!l) return toast('Leave not found', 'bad');
  const u = ERP.users.byEmp(l.empId) || { name: l.empId, designation: '', dept: null };
  const bal = ERP.leaves.balance(l.empId).find((b) => b.code === l.type);
  const tone = { Approved: 'ok', Recommended: 'ok', Rejected: 'bad', Cancelled: 'bad' };
  const steps = [{ cls: '', title: 'Applied', who: u.name, at: l.appliedAt }];
  l.history.forEach((h) => { const a = ERP.users.byEmp(h.by); steps.push({ cls: tone[h.action] || '', title: h.action, who: a ? `${a.name} · ${a.designation}` : h.role, at: h.at, remark: h.remark }); });
  if (l.status === LS.PENDING_HOD) steps.push({ cls: 'wait', title: 'Awaiting HOD recommendation', who: ERP.users.hodOf(u.dept)?.name || 'HOD' });
  if (l.status === LS.PENDING_PRINCIPAL) steps.push({ cls: 'wait', title: 'Awaiting Principal approval', who: principal()?.name || 'Principal' });
  const body = (
    <>
      <div className="ld-modal-top"><Person u={u} sub={`${u.empId || l.empId} · ${u.designation}${u.dept ? ' · ' + F.deptName(u.dept) : ''}`} size={42} /><LeaveBadge state={l.status} /></div>
      <div className="ld-kv">
        <div><small>Type</small><b>{F.leaveName(l.type)}</b></div>
        <div><small>Dates</small><b>{dateRange(l)}</b></div>
        <div><small>Working days</small><b>{l.halfDay ? 'Half day (0.5)' : l.days}</b></div>
        <div><small>Applied</small><b>{F.dateTime(l.appliedAt)}</b></div>
        <div><small>{l.type} balance</small><b>{bal && bal.quota != null ? `${bal.remaining} of ${bal.quota} left` : 'No cap'}</b></div>
      </div>
      <div className="ld-sub">Reason</div><p className="ld-quote">{l.reason}</p>
      <div className="ld-sub">Approval trail</div>
      <ul className="timeline">{steps.map((s, i) => <li key={i} className={s.cls}><b>{s.title}</b><small>{s.who || ''}{s.at ? ' · ' + F.dateTime(s.at) : ''}</small>{s.remark ? <p>{s.remark}</p> : null}</li>)}</ul>
    </>
  );
  return openModal({ title: `${F.leaveName(l.type)} request`, body, actions: actions || [{ label: 'Close', tone: 'primary' }] });
}

// ---------- approve / recommend / reject dialog ----------
function ActBody({ l, action, isHod, nextText, remarkRef }) {
  const u = ERP.users.byEmp(l.empId);
  return (
    <>
      <div className={`ld-note ld-note-${action === 'reject' ? 'warn' : 'info'}`} style={{ marginBottom: 14 }}>
        <Icon name={action === 'reject' ? 'alert' : 'check'} size={16} />
        <span><b>{u.name}</b> · {l.type} · {dateRange(l)} ({daysLabel(l.days)}).<br />{nextText}</span>
      </div>
      <label className="field"><span>Remark {action === 'reject' ? '(required)' : '(optional)'}</span>
        <textarea rows={3} onChange={(e) => { remarkRef.current = e.target.value; }} placeholder={action === 'reject' ? 'Why is this being rejected?' : 'Add a note for the record'} /></label>
    </>
  );
}
export function openActDialog(l, me, action, onDone) {
  const u = ERP.users.byEmp(l.empId);
  const isHod = me.role === 'hod';
  const verb = action === 'reject' ? 'Reject' : isHod ? 'Recommend' : 'Approve';
  const nextText = action === 'reject' ? `${short(u.name)} will be notified that the request was rejected.`
    : isHod ? 'The request will be forwarded to the Principal for final approval.' : `${short(u.name)} will be notified that the leave is approved.`;
  const remarkRef = { current: '' };
  openModal({
    title: `${verb} leave?`,
    body: <ActBody l={l} action={action} isHod={isHod} nextText={nextText} remarkRef={remarkRef} />,
    actions: [
      { label: 'Cancel', tone: 'ghost' },
      { label: verb, tone: action === 'reject' ? 'danger' : isHod ? 'primary' : 'ok', onClick: () => {
        const remark = (remarkRef.current || '').trim();
        if (action === 'reject' && remark.length < 3) { toast('Please give a reason for rejecting', 'bad'); return false; }
        try { ERP.leaves.act(l.id, me, action, remark); } catch (err) { toast(err.message, 'bad'); return true; }
        onDone(action, verb);
        return true;
      } },
    ],
  });
}

// ---------- staff profile modal ----------
export function openProfileModal(empId) {
  const u = ERP.users.byEmp(empId); if (!u) return;
  const r = presetRange('30'); const s = ERP.attendance.summaryFor(empId, r.from, r.to);
  const bal = ERP.leaves.balance(empId).filter((b) => b.quota != null);
  openModal({
    title: 'Staff profile',
    body: (
      <>
        <div className="ld-modal-top"><Person u={u} sub={`${u.designation} · ${ROLE_LABEL[u.role]}`} size={48} /><span className={`role-pill role-${u.role}`}>{u.empId}</span></div>
        <div className="ld-kv">
          <div><small>Department</small><b>{u.dept ? F.deptName(u.dept) : 'Administration'}</b></div>
          <div><small>Joined</small><b>{F.date(u.joinDate)}</b></div>
          <div><small>Email</small><b>{u.email ? <a href={`mailto:${u.email}`}>{u.email}</a> : '—'}</b></div>
          <div><small>Phone</small><b>{u.phone || '—'}</b></div>
        </div>
        <div className="ld-sub">Attendance · last 30 days</div>
        {s.total ? <><div className="ld-pct"><Meter pct={s.percent} /><b>{s.percent}%</b></div><div className="ld-chips" style={{ marginTop: 10 }}>{['P', 'A', 'L', 'HD', 'OD'].map((k) => <span key={k}><StatusBadge code={k} /> {s[k]}</span>)}</div></> : <p className="muted">No records.</p>}
        <div className="ld-sub">Leave balance</div>
        <div className="ld-chips">{bal.map((b) => <span key={b.code}><TypeBadge code={b.code} /> {b.remaining}/{b.quota}</span>)}</div>
      </>
    ),
    actions: [{ label: 'Close', tone: 'ghost' }, { label: 'Attendance calendar', tone: 'primary', onClick: () => { setTimeout(() => openPersonModal(empId, r), 220); } }],
  });
}

// ---------- compact dashboard lists ----------
export function LowList({ rows, emptyMsg = 'Everyone is at or above 75% attendance', rng = presetRange('30') }) {
  if (!rows.length) return <Empty msg={emptyMsg} iconName="check" />;
  return (
    <div className="ld-list">
      {rows.map((r) => (
        <button className="ld-item" key={r.u.empId} onClick={() => openPersonModal(r.u.empId, rng)}>
          <Person u={r.u} sub={`${r.u.designation}${r.u.dept ? ' · ' + r.u.dept : ''}`} size={32} />
          <div className="ld-item-end"><span className={`badge badge-${pctTone(r.s.percent)}`}>{r.s.percent}%</span><small className="muted">{r.s.A} absent</small></div>
        </button>
      ))}
    </div>
  );
}
export function LeaveMiniList({ items, emptyMsg = 'Nobody' }) {
  if (!items.length) return <Empty msg={emptyMsg} iconName="users" />;
  return (
    <div className="ld-list">
      {items.map((l) => {
        const u = ERP.users.byEmp(l.empId);
        return (
          <button className="ld-item" key={l.id} onClick={() => openLeaveModal(l.id)}>
            <Person u={u} sub={`${dateRange(l)} · ${daysLabel(l.days)}`} size={32} />
            <div className="ld-item-end"><TypeBadge code={l.type} />{PENDING.includes(l.status) ? <LeaveBadge state={l.status} /> : null}</div>
          </button>
        );
      })}
    </div>
  );
}

// ---------- approval queue ----------
export function ApprovalQueue({ me, onAct }) {
  useErp();
  const isHod = me.role === 'hod';
  const [st, patch] = usePersistent(`queue-${me.empId}`, () => ({ sort: 'soon', type: '', dept: '' }));

  let xs = ERP.leaves.pendingFor(me);
  const totalPending = xs.length;
  if (st.type) xs = xs.filter((l) => l.type === st.type);
  if (st.dept) xs = xs.filter((l) => ERP.users.byEmp(l.empId)?.dept === st.dept);
  const by = { soon: (a, b) => a.from.localeCompare(b.from), old: (a, b) => a.appliedAt.localeCompare(b.appliedAt), days: (a, b) => b.days - a.days }[st.sort];
  xs = xs.slice().sort(by);

  const done = (l) => (action) => {
    const nm = ERP.users.byEmp(l.empId)?.name || '';
    toast(action === 'reject' ? `Rejected ${nm}'s leave` : isHod ? 'Recommended — forwarded to Principal' : `Approved ${nm}'s leave`, action === 'reject' ? 'bad' : 'ok');
    if (onAct) onAct(l, action);
  };

  const card = (l) => {
    const u = ERP.users.byEmp(l.empId) || { name: l.empId, designation: '', dept: null, role: '' };
    const bal = ERP.leaves.balance(l.empId).find((b) => b.code === l.type);
    const after = bal.quota == null ? null : bal.remaining - l.days;
    const others = ERP.leaves.all().filter((x) => x.id !== l.id && x.empId !== l.empId && LIVE.includes(x.status) && x.from <= l.to && x.to >= l.from && ERP.users.byEmp(x.empId)?.dept === u.dept && u.dept);
    const starts = Math.round((U.parseISO(l.from) - U.parseISO(U.today())) / 86400000);
    const soon = starts < 0 ? `Started ${-starts}d ago` : starts <= 2 ? (starts === 0 ? 'Starts today' : `Starts in ${starts}d`) : '';
    const rec = [...l.history].reverse().find((h) => h.action === 'Recommended');
    const recBy = rec && ERP.users.byEmp(rec.by);
    return (
      <article className="ld-lcard" key={l.id}>
        <div className="ld-lcard-head"><Person u={u} sub={`${u.designation}${u.dept ? ' · ' + u.dept : ''} · applied ${F.ago(l.appliedAt)}`} size={42} /><div className="ld-tags"><TypeBadge code={l.type} />{soon ? <span className="ld-soon">{soon}</span> : null}</div></div>
        <div className="ld-facts">
          <div><small>Dates</small><b>{dateRange(l)}</b></div>
          <div><small>Days</small><b>{l.halfDay ? '½' : l.days}</b></div>
          <div><small>{l.type} balance</small><b className={after != null && after < 0 ? 'neg' : ''} title="Remaining after approving this request">{bal.quota == null ? 'No cap' : `${bal.remaining} → ${after} / ${bal.quota}`}</b></div>
        </div>
        <p className="ld-quote">{l.reason}</p>
        {!isHod && (rec ? (
          <div className="ld-note ld-note-info"><Icon name="check" size={15} /><span><b>Recommended by {recBy ? recBy.name : 'HOD'}</b> · {F.ago(rec.at)}{rec.remark ? <><br /><q>{rec.remark}</q></> : <><br /><span className="muted">No remark added.</span></>}</span></div>
        ) : (
          <div className="ld-note ld-note-muted"><Icon name="user" size={15} /><span>Direct request from {ROLE_LABEL[u.role] || 'staff'} — no HOD stage.</span></div>
        ))}
        {u.dept ? (others.length ? (
          <div className="ld-note ld-note-warn"><Icon name="alert" size={15} /><span><b>{others.length} other{others.length === 1 ? '' : 's'} in {u.dept} on leave on overlapping days:</b> {others.map((x) => `${short(ERP.users.byEmp(x.empId).name)} (${x.type}, ${dateRange(x).replace(/ \d{4}/g, '')}${x.status === LS.APPROVED ? '' : ', pending'})`).join('; ')}</span></div>
        ) : (
          <div className="ld-note ld-note-ok"><Icon name="users" size={15} /><span>No one else in {F.deptName(u.dept)} is on leave on these days.</span></div>
        )) : null}
        <div className="ld-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => openLeaveModal(l.id, { actions: [
            { label: 'Close', tone: 'ghost' },
            { label: 'Reject', tone: 'danger', onClick: () => { setTimeout(() => openActDialog(l, me, 'reject', done(l)), 220); } },
            { label: isHod ? 'Recommend' : 'Approve', tone: isHod ? 'primary' : 'ok', onClick: () => { setTimeout(() => openActDialog(l, me, 'approve', done(l)), 220); } },
          ] })}><Icon name="file" size={15} /> Details</button>
          <span className="ld-spacer" />
          <button className="btn btn-outline-bad btn-sm" onClick={() => openActDialog(l, me, 'reject', done(l))}><Icon name="x" size={15} /> Reject</button>
          <button className={`btn ${isHod ? 'btn-primary' : 'btn-ok'} btn-sm`} onClick={() => openActDialog(l, me, 'approve', done(l))}><Icon name="check" size={15} /> {isHod ? 'Recommend' : 'Approve'}</button>
        </div>
      </article>
    );
  };

  return (
    <>
      <div className="card ld-queue-head">
        <div><h3>{totalPending ? `${totalPending} request${totalPending === 1 ? '' : 's'} awaiting you` : 'All caught up'}</h3><p>{isHod ? `Faculty requests from ${F.deptName(me.dept)}. Recommended requests go to the Principal.` : 'Final approval. HOD recommendations are shown on each card.'}</p></div>
        <div className="row">
          {!isHod && <DeptSelect value={st.dept} onChange={(v) => patch({ dept: v })} />}
          <label className="ld-in"><span>Type</span><select value={st.type} onChange={(e) => patch({ type: e.target.value })}><option value="">All types</option>{ERP.LEAVE_TYPES.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}</select></label>
          <label className="ld-in"><span>Sort</span><select value={st.sort} onChange={(e) => patch({ sort: e.target.value })}><option value="soon">Starting soonest</option><option value="old">Waiting longest</option><option value="days">Most days</option></select></label>
        </div>
      </div>
      <div className="ld-queue">
        {xs.length ? xs.map(card) : <div className="card" style={{ gridColumn: '1/-1' }}><Empty msg={totalPending ? 'No requests match these filters' : "No pending leave requests. You're all caught up!"} iconName="check" /></div>}
      </div>
    </>
  );
}

// ---------- attendance report ----------
export function AttendanceReport({ me, opts = {} }) {
  useErp();
  const { key = 'att', fixedDept = null, deptSelectable = false, compare = false } = opts;
  const [st, patch] = usePersistent(key, () => ({ ...presetRange('30'), preset: '30', dept: fixedDept || '' }));
  if (fixedDept && st.dept !== fixedDept) st.dept = fixedDept;
  const showDept = !fixedDept;

  const staffList = (st.dept ? ERP.users.byDept(st.dept) : ERP.users.staff()).filter(isStaff);
  const current = staffSummary(staffList, st.from, st.to).sort((a, b) => a.s.percent - b.s.percent);
  const all = ERP.attendance.summarize(staffList.flatMap((u) => ERP.attendance.forEmp(u.empId, st.from, st.to)));
  const low = current.filter((r) => r.s.total && r.s.percent < 75).length;

  const exp = (kind) => {
    const tag = fileStamp(`${st.dept || 'ALL'}_${st.from}_to_${st.to}`);
    if (kind === 'sum') {
      if (!current.length) return toast('Nothing to export', 'bad');
      downloadXlsx(`attendance_summary_${tag}.xlsx`, ['Employee ID', 'Name', 'Department', 'Designation', 'Present', 'Absent', 'Leave', 'Half Day', 'On Duty', 'Days Recorded', 'Attendance %'],
        current.map((r) => [r.u.empId, r.u.name, r.u.dept ? F.deptName(r.u.dept) : '', r.u.designation, r.s.P, r.s.A, r.s.L, r.s.HD, r.s.OD, r.s.total, r.s.percent]), 'Summary');
    } else {
      const rows = current.flatMap((r) => ERP.attendance.forEmp(r.u.empId, st.from, st.to).map((a) => [r.u.empId, r.u.name, r.u.dept ? F.deptName(r.u.dept) : '', a.date, a.status, a.inTime, a.outTime]));
      if (!rows.length) return toast('No records in this range', 'bad');
      rows.sort((a, b) => a[3].localeCompare(b[3]) || a[0].localeCompare(b[0]));
      downloadXlsx(`attendance_records_${tag}.xlsx`, ERP.attendance.TEMPLATE_HEADERS, rows, 'Attendance');
    }
    toast('Excel file downloaded');
  };

  const columns = [
    { key: 'name', label: 'Staff', render: (r) => <Person u={r.u} sub={`${r.u.empId} · ${r.u.designation}`} size={32} />, sort: (r) => r.u.name },
    ...(showDept ? [{ key: 'dept', label: 'Dept', render: (r) => <Badge tone="muted" title={F.deptName(r.u.dept)}>{r.u.dept || 'Admin'}</Badge>, sort: (r) => r.u.dept || '' }] : []),
    ...['P', 'A', 'L', 'HD', 'OD'].map((k) => ({ key: k, label: k, align: 'right', render: (r) => <Num n={r.s[k]} />, sort: (r) => r.s[k] })),
    { key: 'pct', label: 'Attendance', render: (r) => <PctCell p={r.s.percent} total={r.s.total} />, sort: (r) => (r.s.total ? r.s.percent : -1) },
  ];
  const rows = current.map((r) => ({ ...r, __key: r.u.empId, __rowClass: '', __onClick: () => openPersonModal(r.u.empId, st) }));

  const ds = compare ? deptStats(st.from, st.to) : null;

  return (
    <>
      <div className="card ld-filterbar">
        {deptSelectable ? <DeptSelect value={st.dept} onChange={(v) => patch({ dept: v })} /> : null}
        <RangeControls st={st} patch={patch} />
      </div>
      {compare ? (
        <div className="card">
          <div className="card-head"><div><h3>Department comparison</h3><p>Attendance % for the selected period — click a department to see its staff</p></div>{st.dept ? <button className="btn btn-ghost btn-sm" onClick={() => patch({ dept: '' })}>Show all departments</button> : null}</div>
          <ClickableBars items={ds.map((d) => ({ key: d.code, label: d.name, value: d.s.percent, tone: pctTone(d.s.percent) }))} active={st.dept} onPick={(it) => patch({ dept: st.dept === it.key ? '' : it.key })} />
        </div>
      ) : null}
      <div className="cards">
        <Stat label="Attendance" value={all.total ? `${all.percent}%` : '—'} iconName="chart" tone={all.total ? pctTone(all.percent) : 'info'} sub={`${all.total} day-records`} />
        <Stat label="Present" value={all.P} iconName="check" tone="ok" sub={`${all.OD} on duty · ${all.HD} half days`} />
        <Stat label="Absent" value={all.A} iconName="x" tone="bad" sub={`${all.L} leave days`} />
        <Stat label="Below 75%" value={low} iconName="alert" tone={low ? 'warn' : 'ok'} sub={`of ${staffList.length} staff`} />
      </div>
      <div className="card">
        <div className="card-head"><div><h3>{st.dept ? F.deptName(st.dept) : 'All staff'} · {F.date(st.from)} – {F.date(st.to)}</h3><p>Click a row to open the day-by-day calendar</p></div></div>
        <div className="ld-clickable">
          <DataTable columns={columns} rows={rows} pageSize={12} emptyText="No staff in this selection"
            search={(r) => `${r.u.name} ${r.u.empId} ${r.u.designation} ${r.u.dept || ''}`}
            toolbar={<><button className="btn btn-ghost btn-sm" onClick={() => exp('sum')}><Icon name="excel" size={16} /> Export summary</button><button className="btn btn-ghost btn-sm" onClick={() => exp('raw')}><Icon name="download" size={16} /> Daily records</button></>} />
        </div>
      </div>
    </>
  );
}

// ---------- leave table (read-only) ----------
export function LeaveTable({ me, opts = {} }) {
  useErp();
  const { key = 'leaves', source, showDept = true, deptFilter = true, exportName = 'leaves' } = opts;
  const [st, patch] = usePersistent(key, () => ({ status: 'all', type: '', dept: '', period: '' }));
  const TABS = [['all', 'All'], ['pending', 'Pending'], [LS.APPROVED, 'Approved'], [LS.REJECTED, 'Rejected'], [LS.CANCELLED, 'Cancelled']];
  const yr = new Date().getFullYear();

  const inPeriod = (l) => {
    if (!st.period) return true;
    if (st.period === 'upcoming') return l.to >= U.today();
    if (st.period === 'year') return l.from.startsWith(String(yr)) || l.to.startsWith(String(yr));
    return l.to >= addDays(U.today(), -30) && l.from <= U.today();
  };
  const statusOk = (l, s) => s === 'all' || (s === 'pending' ? PENDING.includes(l.status) : l.status === s);
  const base = source().filter((l) => (!st.type || l.type === st.type) && (!st.dept || ERP.users.byEmp(l.empId)?.dept === st.dept) && inPeriod(l));
  const current = base.filter((l) => statusOk(l, st.status)).sort((a, b) => b.appliedAt.localeCompare(a.appliedAt))
    .map((l) => ({ l, u: ERP.users.byEmp(l.empId) || { name: l.empId, designation: '', dept: null } }));

  const columns = [
    { key: 'who', label: 'Applicant', render: (r) => <Person u={r.u} sub={r.u.designation} size={30} />, sort: (r) => r.u.name },
    ...(showDept ? [{ key: 'dept', label: 'Dept', render: (r) => <Badge tone="muted">{r.u.dept || '—'}</Badge>, sort: (r) => r.u.dept || '' }] : []),
    { key: 'type', label: 'Type', render: (r) => <TypeBadge code={r.l.type} />, sort: (r) => r.l.type },
    { key: 'dates', label: 'Dates', render: (r) => dateRange(r.l), sort: (r) => r.l.from },
    { key: 'days', label: 'Days', align: 'right', render: (r) => (r.l.halfDay ? '½' : r.l.days), sort: (r) => r.l.days },
    { key: 'applied', label: 'Applied', render: (r) => <span className="muted small">{F.date(r.l.appliedAt)}</span>, sort: (r) => r.l.appliedAt },
    { key: 'status', label: 'Status', render: (r) => <LeaveBadge state={r.l.status} />, sort: (r) => r.l.status },
  ];
  const rows = current.map((r) => ({ ...r, __key: r.l.id, __rowClass: '', __onClick: () => openLeaveModal(r.l.id) }));

  const exp = () => {
    if (!current.length) return toast('Nothing to export', 'bad');
    downloadXlsx(`${fileStamp(exportName)}_${U.today()}.xlsx`, ['Employee ID', 'Name', 'Department', 'Type', 'From', 'To', 'Days', 'Reason', 'Status', 'Applied On', 'Last Action', 'Last Remark'],
      current.map(({ l, u }) => { const h = l.history[l.history.length - 1]; return [l.empId, u.name, u.dept ? F.deptName(u.dept) : '', F.leaveName(l.type), l.from, l.to, l.days, l.reason, l.status, l.appliedAt.slice(0, 10), h ? `${h.action} (${h.role})` : '', h ? h.remark : '']; }), 'Leaves');
    toast('Excel file downloaded');
  };

  return (
    <>
      <div className="card ld-filterbar">
        <div className="tabs ld-tabs">
          {TABS.map(([k, l]) => <button key={k} className={st.status === k ? 'active' : ''} onClick={() => patch({ status: k })}>{l}<em>{base.filter((x) => statusOk(x, k)).length}</em></button>)}
        </div>
        <span className="ld-spacer" />
        {deptFilter ? <DeptSelect value={st.dept} onChange={(v) => patch({ dept: v })} /> : null}
        <label className="ld-in"><span>Type</span><select value={st.type} onChange={(e) => patch({ type: e.target.value })}><option value="">All types</option>{ERP.LEAVE_TYPES.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}</select></label>
        <label className="ld-in"><span>Period</span><select value={st.period} onChange={(e) => patch({ period: e.target.value })}>
          <option value="">Any time</option><option value="upcoming">Upcoming / ongoing</option><option value="30">Last 30 days</option><option value="year">This year ({yr})</option></select></label>
      </div>
      <div className="card"><div className="ld-clickable">
        <DataTable columns={columns} rows={rows} pageSize={10} emptyText="No leave requests match these filters"
          search={(r) => `${r.u.name} ${r.l.empId} ${r.l.reason} ${F.leaveName(r.l.type)}`}
          toolbar={<button className="btn btn-ghost btn-sm" onClick={exp}><Icon name="excel" size={16} /> Export</button>} />
      </div></div>
    </>
  );
}

// ---------- my leave (self-apply for HOD/Dean/Principal) ----------
export function MyLeave({ me }) {
  useErp();
  const goesTo = me.role === 'principal' ? "Your request will be recorded for the Principal's office." : 'Your request goes directly to the Principal for approval (no HOD stage).';
  const bal = ERP.leaves.balance(me.empId);
  const mine = ERP.leaves.forEmp(me.empId);
  const t = U.today();

  const [type, setType] = useState(bal[0].code);
  const [from, setFrom] = useState(t);
  const [to, setTo] = useState(t);
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState('');

  const effTo = halfDay ? from : (to && to >= from ? to : from);
  const valid = from && effTo && effTo >= from;
  const n = halfDay ? 0.5 : (valid ? U.workingDays(from, effTo).length : 0);
  const b = bal.find((x) => x.code === type);
  const avail = b.quota == null ? null : b.remaining - b.pending;

  const submit = (e) => {
    e.preventDefault();
    try {
      const l = ERP.leaves.apply({ empId: me.empId, type, from, to: halfDay ? from : effTo, reason, halfDay });
      toast(`${l.type} leave request submitted (${daysLabel(l.days)})`);
      setReason(''); setHalfDay(false); setFrom(t); setTo(t);
    } catch (err) { toast(err.message, 'bad'); }
  };

  const histRows = mine.map((l) => ({ ...l, __key: l.id, __rowClass: '', __onClick: () => openLeaveModal(l.id) }));
  const cancel = async (id) => {
    if (await confirmBox('Cancel this request?', 'The pending leave request will be withdrawn. This cannot be undone.', { okLabel: 'Withdraw request', tone: 'danger' })) {
      try { ERP.leaves.cancel(id, me.empId); toast('Leave request cancelled'); } catch (err) { toast(err.message, 'bad'); }
    }
  };

  return (
    <>
      <div className="ld-bal-grid">
        {bal.map((bb) => {
          const ratio = bb.quota ? bb.remaining / bb.quota : 0;
          return (
            <div className={`ld-bal${type === bb.code ? ' sel' : ''}`} key={bb.code} title={`Apply for ${bb.name}`} onClick={() => setType(bb.code)}>
              <div className="ld-bal-top"><span className="ld-bal-name">{bb.name}</span><TypeBadge code={bb.code} /></div>
              <div className="ld-bal-val">{bb.quota == null ? <>{bb.used}<small> used</small></> : <>{bb.remaining}<small> / {bb.quota} left</small></>}</div>
              {bb.quota == null ? <div className="meter"><div style={{ width: 0 }} /></div> : <Meter pct={bb.quota ? ratio * 100 : 0} tone={ratio > 0.5 ? 'ok' : ratio > 0.2 ? 'warn' : 'bad'} />}
              <div className="ld-bal-foot">{bb.used} used{bb.pending ? ` · ${bb.pending} pending` : ''}</div>
            </div>
          );
        })}
      </div>
      <div className="cols">
        <div className="card">
          <div className="card-head"><div><h3>My leave history</h3><p>{mine.length} request{mine.length === 1 ? '' : 's'} · click a row for the approval trail</p></div></div>
          <div className="ld-clickable">
            <DataTable rows={histRows} pageSize={8} emptyText="You have not applied for any leave yet" columns={[
              { key: 'type', label: 'Type', render: (l) => <TypeBadge code={l.type} /> },
              { key: 'from', label: 'Dates', render: (l) => dateRange(l) },
              { key: 'days', label: 'Days', align: 'right', render: (l) => (l.halfDay ? '½' : l.days) },
              { key: 'status', label: 'Status', render: (l) => <LeaveBadge state={l.status} /> },
              { key: 'x', label: '', noSort: true, align: 'right', render: (l) => (PENDING.includes(l.status) ? <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); cancel(l.id); }}>Cancel</button> : null) },
            ]} />
          </div>
        </div>
        <form className="card" onSubmit={submit} noValidate>
          <div className="card-head"><div><h3>Apply for leave</h3><p>{goesTo}</p></div></div>
          <label className="field"><span>Leave type</span><select value={type} onChange={(e) => setType(e.target.value)}>{bal.map((bb) => <option key={bb.code} value={bb.code}>{bb.name}{bb.quota == null ? '' : ` — ${bb.remaining - bb.pending} available`}</option>)}</select></label>
          <div className="grid-2">
            <label className="field"><span>From</span><input type="date" value={from} min={t} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} /></label>
            <label className="field"><span>To</span><input type="date" value={halfDay ? from : effTo} min={from} disabled={halfDay} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
          <label className="ld-check"><input type="checkbox" checked={halfDay} onChange={(e) => setHalfDay(e.target.checked)} /> Half day (single date)</label>
          <label className="field"><span>Reason</span><textarea rows={3} placeholder="Brief reason for the leave" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <div className="ld-preview"><span className="muted small">{!valid ? <span style={{ color: 'var(--bad)' }}>Choose a valid date range</span> : <><b>{n}</b> working day{n === 1 ? '' : 's'} (Sundays excluded){avail != null ? <> · {avail} {b.code} available{n > avail ? <> — <span style={{ color: 'var(--bad)' }}>insufficient balance</span></> : null}</> : null}</>}</span></div>
          <button className="btn btn-primary btn-block" type="submit"><Icon name="leave" size={16} /> Submit request</button>
        </form>
      </div>
    </>
  );
}

// ---------- announcements ----------
function NewAnnouncementBody({ titleRef, bodyRef }) {
  return (
    <>
      <label className="field"><span>Title</span><input maxLength={90} placeholder="e.g. Faculty meeting on Friday" onChange={(e) => { titleRef.current = e.target.value; }} /></label>
      <label className="field"><span>Message</span><textarea rows={5} placeholder="Details for all staff" onChange={(e) => { bodyRef.current = e.target.value; }} /></label>
      <p className="muted small" style={{ margin: 0 }}>Visible to every staff member on their dashboard.</p>
    </>
  );
}
export function Announcements({ me, canPost = false }) {
  useErp();
  const list = ERP.announcements.all();
  const del = async (id) => {
    if (!(await confirmBox('Delete announcement?', 'It will be removed for all staff.', { okLabel: 'Delete', tone: 'danger' }))) return;
    ERP.announcements.remove(id); toast('Announcement deleted');
  };
  const newAnn = () => {
    const titleRef = { current: '' }, bodyRef = { current: '' };
    openModal({
      title: 'New announcement',
      body: <NewAnnouncementBody titleRef={titleRef} bodyRef={bodyRef} />,
      actions: [{ label: 'Cancel', tone: 'ghost' }, { label: 'Post', tone: 'primary', onClick: () => {
        const title = (titleRef.current || '').trim(), body = (bodyRef.current || '').trim();
        if (title.length < 3) { toast('Title is too short', 'bad'); return false; }
        if (body.length < 5) { toast('Please write a message', 'bad'); return false; }
        ERP.announcements.add(title, body, me.empId); toast('Announcement posted'); return true;
      } }],
    });
  };
  return (
    <>
      <div className="card ld-queue-head"><div><h3>Announcements</h3><p>{list.length} notice{list.length === 1 ? '' : 's'} for all staff</p></div>
        {canPost ? <button className="btn btn-primary" onClick={newAnn}><Icon name="plus" size={16} /> New announcement</button> : null}</div>
      <div className="ld-ann-list">
        {list.length ? list.map((a) => {
          const by = ERP.users.byEmp(a.by) || { name: 'Unknown', designation: '' };
          const fresh = Date.now() - new Date(a.at).getTime() < 172800000;
          return (
            <article className="card ld-ann" key={a.id}><Avatar name={by.name} size={40} />
              <div className="ld-ann-body"><h3>{a.title}{fresh ? <span className="badge badge-accent">New</span> : null}</h3><p>{a.body}</p>
                <div className="ld-ann-meta"><b>{by.name}</b> · {by.designation} · <span title={F.dateTime(a.at)}>{F.ago(a.at)}</span></div></div>
              {a.by === me.empId ? <button className="icon-btn" title="Delete announcement" aria-label="Delete" onClick={() => del(a.id)}><Icon name="trash" size={16} /></button> : null}
            </article>
          );
        }) : <div className="card"><Empty msg="No announcements yet" iconName="megaphone" /></div>}
      </div>
    </>
  );
}

// ---------- staff directory ----------
export function Directory({ me, keyName = 'dir' }) {
  useErp();
  const [st, patch] = usePersistent(keyName, () => ({ dept: '', role: '' }));
  const rows = ERP.users.staff().filter((u) => (!st.dept || u.dept === st.dept) && (!st.role || u.role === st.role)).sort((a, b) => (a.dept || '').localeCompare(b.dept || '') || a.name.localeCompare(b.name));
  const tableRows = rows.map((u) => ({ ...u, __key: u.empId, __rowClass: '', __onClick: () => openProfileModal(u.empId) }));
  const exp = () => {
    downloadXlsx(`staff_directory_${U.today()}.xlsx`, ['Employee ID', 'Name', 'Role', 'Designation', 'Department', 'Email', 'Phone', 'Joined'],
      rows.map((u) => [u.empId, u.name, ROLE_LABEL[u.role], u.designation, u.dept ? F.deptName(u.dept) : '', u.email, u.phone, u.joinDate]), 'Staff');
    toast('Excel file downloaded');
  };
  return (
    <>
      <div className="card ld-filterbar"><DeptSelect value={st.dept} onChange={(v) => patch({ dept: v })} />
        <label className="ld-in"><span>Role</span><select value={st.role} onChange={(e) => patch({ role: e.target.value })}><option value="">All roles</option>{STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></label>
        <span className="ld-spacer" /><span className="ld-count">{rows.length} staff</span></div>
      <div className="card"><div className="ld-clickable">
        <DataTable rows={tableRows} pageSize={12} emptyText="No staff match these filters"
          search={(u) => `${u.name} ${u.empId} ${u.designation} ${u.email} ${u.phone} ${u.dept || ''}`}
          toolbar={<button className="btn btn-ghost btn-sm" onClick={exp}><Icon name="excel" size={16} /> Export</button>}
          columns={[
            { key: 'name', label: 'Name', render: (u) => <Person u={u} sub={u.empId} size={32} /> },
            { key: 'designation', label: 'Designation' },
            { key: 'dept', label: 'Department', render: (u) => (u.dept ? F.deptName(u.dept) : 'Administration') },
            { key: 'email', label: 'Email', render: (u) => <a href={`mailto:${u.email}`} onClick={(e) => e.stopPropagation()}>{u.email}</a> },
            { key: 'phone', label: 'Phone', render: (u) => <span className="muted">{u.phone || '—'}</span> },
          ]} />
      </div></div>
    </>
  );
}
