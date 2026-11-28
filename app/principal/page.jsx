'use client';
import ERP from '@/lib/erp';
import { useErp, useRequireRole } from '@/lib/ErpProvider';
import { Shell, goSection } from '@/components/Shell';
import { Icon } from '@/components/Icon';
import { Stat, Empty } from '@/components/ui';
import {
  ApprovalQueue, AttendanceReport, LeaveTable, Directory, Announcements,
  ClickableBars, StatusDonut, LowList, LeaveMiniList,
} from '@/components/leaders';
import {
  presetRange, isStaff, pctTone, short, greeting, deptStats, lowAttendance, onLeaveOn, setFilter,
} from '@/lib/leaders-helpers';

const U = ERP.util, F = ERP.fmt;

function Dashboard({ me }) {
  useErp();
  const r = presetRange('30');
  const staff = ERP.users.staff().filter(isStaff);
  const ids = new Set(staff.map((u) => u.empId));
  const all30 = ERP.attendance.summarize(ERP.attendance.all().filter((x) => ids.has(x.empId) && x.date >= r.from && x.date <= r.to));
  const latest = ERP.attendance.latestDate();
  const today = U.today();
  const away = onLeaveOn(today);
  const pending = ERP.leaves.pendingFor(me).sort((a, b) => a.from.localeCompare(b.from));
  const n = pending.length;
  const depts = deptStats(r.from, r.to).sort((a, b) => b.s.percent - a.s.percent);
  const low = lowAttendance(staff, r.from, r.to);

  const openDept = (code) => { setFilter('pr-att', { dept: code }); goSection('reports'); };

  return (
    <>
      <div className="hero ld-hero">
        <div><h2>{greeting()}, {me.name}</h2><p>{ERP.INSTITUTION} · {ERP.DEPARTMENTS.length} departments · {F.date(today)}</p></div>
        <a className="btn ld-hero-btn" href="#approvals"><Icon name="check" size={16} /> Final approvals {n ? <em>{n}</em> : null}</a>
      </div>
      <div className="cards">
        <Stat label="Overall attendance" value={all30.total ? `${all30.percent}%` : '—'} iconName="chart" tone={all30.total ? pctTone(all30.percent) : 'info'} sub="Last 30 days, all staff" />
        <Stat label="Total staff" value={staff.length} iconName="users" tone="info" sub={`${staff.filter((u) => u.role === 'hod').length} HODs · ${staff.filter((u) => u.role === 'faculty').length} faculty`} />
        <Stat label="Pending approvals" value={n} iconName="leave" tone={n ? 'warn' : 'ok'} sub={n ? `${pending.filter((l) => l.history.length).length} HOD-recommended` : 'Nothing waiting'} />
        <Stat label="On leave today" value={away.length} iconName="calendar" tone="accent" sub={away.length ? away.map((l) => short(ERP.users.byEmp(l.empId).name)).slice(0, 2).join(', ') + (away.length > 2 ? '…' : '') : 'Full strength'} />
      </div>
      <div className="cols">
        <div className="card">
          <div className="card-head"><div><h3>Department comparison</h3><p>Attendance %, last 30 days · click to open the report</p></div><a className="btn btn-ghost btn-sm" href="#reports">Reports</a></div>
          <ClickableBars items={depts.map((d) => ({ key: d.code, label: d.name, value: d.s.percent, tone: pctTone(d.s.percent) }))} onPick={(it) => openDept(it.key)} />
        </div>
        <div className="card">
          <div className="card-head"><div><h3>Status on {latest ? F.date(latest) : '—'}</h3><p>{latest === today ? 'Today' : 'Latest uploaded day'} · all staff</p></div></div>
          {latest ? <StatusDonut rows={ERP.attendance.forDate(latest).filter((x) => ids.has(x.empId))} /> : <Empty msg="No attendance uploaded yet" iconName="calendar" />}
        </div>
      </div>
      <div className="cols">
        <div className="card">
          <div className="card-head"><div><h3>Awaiting your approval</h3><p>Soonest first</p></div>{n ? <a className="btn btn-primary btn-sm" href="#approvals">Open queue</a> : null}</div>
          <LeaveMiniList items={pending.slice(0, 5)} emptyMsg="No requests are waiting for you" />
        </div>
        <div className="section">
          <div className="card">
            <div className="card-head"><div><h3>On leave today</h3><p>{F.date(today)}</p></div></div>
            <LeaveMiniList items={away} emptyMsg="Nobody is on approved leave today" />
          </div>
          <div className="card">
            <div className="card-head"><div><h3><Icon name="alert" size={18} /> Low attendance</h3><p>Below 75%, last 30 days</p></div></div>
            <LowList rows={low.slice(0, 6)} rng={r} />
          </div>
        </div>
      </div>
    </>
  );
}

export default function PrincipalPage() {
  const me = useRequireRole(['principal']);
  if (!me) return null;
  const pendingCount = () => ERP.leaves.pendingFor(me).length;
  const sections = [
    { id: 'dashboard', label: 'Dashboard', title: 'Institution Overview', icon: 'home', render: (u) => <Dashboard me={u} /> },
    { id: 'approvals', label: 'Leave Approvals', title: 'Final Leave Approvals', icon: 'check', badge: pendingCount, render: (u) => <ApprovalQueue me={u} /> },
    { id: 'reports', label: 'Attendance Reports', icon: 'chart', render: (u) => <AttendanceReport me={u} opts={{ key: 'pr-att', deptSelectable: true }} /> },
    { id: 'leaves', label: 'All Leaves', icon: 'file', render: (u) => <LeaveTable me={u} opts={{ key: 'pr-leaves', source: () => ERP.leaves.all(), exportName: 'all_leaves' }} /> },
    { id: 'directory', label: 'Staff Directory', icon: 'users', render: (u) => <Directory me={u} keyName="pr-dir" /> },
    { id: 'announcements', label: 'Announcements', icon: 'megaphone', render: (u) => <Announcements me={u} canPost /> },
  ];
  return <Shell user={me} sections={sections} />;
}
