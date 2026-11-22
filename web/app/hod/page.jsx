'use client';
import ERP from '@/lib/erp';
import { useErp, useRequireRole } from '@/lib/ErpProvider';
import { Shell } from '@/components/Shell';
import { Icon } from '@/components/Icon';
import { Stat, Empty, Badge } from '@/components/ui';
import {
  ApprovalQueue, AttendanceReport, LeaveTable, MyLeave, Announcements,
  ClickableBars, LowList, LeaveMiniList, openPersonModal,
} from '@/components/leaders';
import {
  presetRange, isStaff, pctTone, short, greeting, addDays, staffSummary, LIVE,
} from '@/lib/leaders-helpers';

const U = ERP.util, F = ERP.fmt;

function Dashboard({ me }) {
  useErp();
  const r = presetRange('30');
  const staff = ERP.users.byDept(me.dept).filter(isStaff);
  const s30 = ERP.attendance.deptSummary(me.dept, r.from, r.to);
  const latest = ERP.attendance.latestDate();
  const ids = new Set(staff.map((u) => u.empId));
  const dayRows = latest ? ERP.attendance.forDate(latest).filter((x) => ids.has(x.empId)) : [];
  const day = ERP.attendance.summarize(dayRows);
  const presentish = day.P + day.OD + day.HD;
  const pending = ERP.leaves.pendingFor(me).sort((a, b) => a.from.localeCompare(b.from));
  const per = staffSummary(staff, r.from, r.to).sort((a, b) => b.s.percent - a.s.percent);
  const low = per.filter((x) => x.s.total && x.s.percent < 75).sort((a, b) => a.s.percent - b.s.percent);
  const week = addDays(U.today(), 7);
  const away = ERP.leaves.forDept(me.dept).filter((l) => LIVE.includes(l.status) && l.to >= U.today() && l.from <= week).sort((a, b) => a.from.localeCompare(b.from));
  const n = pending.length;

  return (
    <>
      <div className="hero ld-hero">
        <div><h2>{greeting()}, {me.name}</h2><p>Department of {F.deptName(me.dept)} · {staff.length} staff · {F.date(U.today())}</p></div>
        <a className="btn ld-hero-btn" href="#approvals"><Icon name="check" size={16} /> Review requests {n ? <em>{n}</em> : null}</a>
      </div>
      <div className="cards">
        <Stat label="Department staff" value={staff.length} iconName="users" tone="info" sub={`${staff.filter((u) => u.role === 'faculty').length} faculty + HOD`} />
        <Stat label="Attendance · 30 days" value={s30.total ? `${s30.percent}%` : '—'} iconName="chart" tone={s30.total ? pctTone(s30.percent) : 'info'} sub={`${F.date(r.from).slice(0, 6)} – ${F.date(r.to).slice(0, 6)}`} />
        <Stat label={latest === U.today() ? 'Present today' : 'Present on latest day'} iconName="clock" tone="ok"
          value={latest ? <>{presentish}<small className="muted" style={{ fontSize: 15 }}> / {staff.length}</small></> : '—'}
          sub={latest ? `${F.date(latest)} · ${day.A} absent, ${day.L} on leave` : 'No attendance uploaded'} />
        <Stat label="Pending approvals" value={n} iconName="leave" tone={n ? 'warn' : 'ok'} sub={n ? `Next starts ${F.date(pending[0].from)}` : 'Nothing waiting'} />
      </div>
      <div className="cols">
        <div className="card">
          <div className="card-head"><div><h3>Faculty attendance</h3><p>Last 30 days · click a name for the calendar</p></div><a className="btn btn-ghost btn-sm" href="#attendance">Full report</a></div>
          {per.length ? <ClickableBars items={per.map((x) => ({ key: x.u.empId, label: short(x.u.name), title: x.u.name, value: x.s.percent, tone: pctTone(x.s.percent) }))} onPick={(it) => openPersonModal(it.key, r)} /> : <Empty msg="No staff in this department" iconName="users" />}
        </div>
        <div className="section">
          <div className="card">
            <div className="card-head"><div><h3><Icon name="alert" size={18} /> Low attendance</h3><p>Below 75% in the last 30 days</p></div>{low.length ? <Badge tone="bad">{low.length}</Badge> : null}</div>
            <LowList rows={low} rng={r} />
          </div>
          <div className="card">
            <div className="card-head"><div><h3>Away this week</h3><p>Approved or pending leave, next 7 days</p></div></div>
            <LeaveMiniList items={away} emptyMsg="Everyone is expected in this week" />
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><div><h3>Waiting for your recommendation</h3><p>Oldest and soonest requests first</p></div>{n ? <a className="btn btn-primary btn-sm" href="#approvals">Open queue</a> : null}</div>
        <LeaveMiniList items={pending.slice(0, 4)} emptyMsg="No pending requests — you're all caught up" />
      </div>
    </>
  );
}

export default function HodPage() {
  const me = useRequireRole(['hod']);
  if (!me) return null;
  const pendingCount = () => ERP.leaves.pendingFor(me).length;
  const sections = [
    { id: 'dashboard', label: 'Dashboard', title: `${F.deptName(me.dept)} · Dashboard`, icon: 'home', render: (u) => <Dashboard me={u} /> },
    { id: 'approvals', label: 'Leave Approvals', icon: 'check', badge: pendingCount, render: (u) => <ApprovalQueue me={u} /> },
    { id: 'attendance', label: 'Department Attendance', icon: 'calendar', render: (u) => <AttendanceReport me={u} opts={{ key: 'hod-att', fixedDept: u.dept }} /> },
    { id: 'history', label: 'Leave History', title: 'Department Leave History', icon: 'file', render: (u) => <LeaveTable me={u} opts={{ key: 'hod-hist', source: () => ERP.leaves.forDept(u.dept), showDept: false, deptFilter: false, exportName: `leaves_${u.dept}` }} /> },
    { id: 'myleave', label: 'My Leave', icon: 'leave', render: (u) => <MyLeave me={u} /> },
    { id: 'announcements', label: 'Announcements', icon: 'megaphone', render: (u) => <Announcements me={u} /> },
  ];
  return <Shell user={me} sections={sections} />;
}
