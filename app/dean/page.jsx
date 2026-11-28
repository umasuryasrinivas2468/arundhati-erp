'use client';
import ERP from '@/lib/erp';
import { useErp, useRequireRole } from '@/lib/ErpProvider';
import { Shell, goSection } from '@/components/Shell';
import { Icon } from '@/components/Icon';
import { Stat, Meter, Badge } from '@/components/ui';
import {
  AttendanceReport, LeaveTable, MyLeave, Announcements,
  TrendChart, LeaveTypeDonut, LowList,
} from '@/components/leaders';
import {
  presetRange, isStaff, pctTone, greeting, weeklyTrend, deptStats, lowAttendance, setFilter, LIVE, PENDING,
} from '@/lib/leaders-helpers';

const F = ERP.fmt;

function Dashboard({ me }) {
  useErp();
  const r = presetRange('30');
  const staff = ERP.users.staff().filter(isStaff);
  const ids = new Set(staff.map((u) => u.empId));
  const all30 = ERP.attendance.summarize(ERP.attendance.all().filter((x) => ids.has(x.empId) && x.date >= r.from && x.date <= r.to));
  const weeks = weeklyTrend(4);
  const depts = deptStats(r.from, r.to).sort((a, b) => b.s.percent - a.s.percent);
  const low = lowAttendance(staff, r.from, r.to);
  const year = String(new Date().getFullYear());
  const yearLeaves = ERP.leaves.all().filter((l) => l.from.startsWith(year) && LIVE.includes(l.status));
  const pendingAll = ERP.leaves.all().filter((l) => PENDING.includes(l.status)).length;
  const thisW = weeks[weeks.length - 1], prevW = weeks[weeks.length - 2];
  const delta = thisW && prevW && thisW.s.total && prevW.s.total ? Math.round((thisW.s.percent - prevW.s.percent) * 10) / 10 : null;

  const openDept = (code) => { setFilter('dn-att', { dept: code }); goSection('analytics'); };

  return (
    <>
      <div className="hero ld-hero">
        <div><h2>{greeting()}, {me.name}</h2><p>Academic oversight · {staff.length} staff across {ERP.DEPARTMENTS.length} departments</p></div>
        <a className="btn ld-hero-btn" href="#analytics"><Icon name="chart" size={16} /> Attendance analytics</a>
      </div>
      <div className="cards">
        <Stat label="Institution attendance" value={all30.total ? `${all30.percent}%` : '—'} iconName="chart" tone={all30.total ? pctTone(all30.percent) : 'info'} sub="Last 30 days" />
        <Stat label="This week" value={thisW && thisW.s.total ? `${thisW.s.percent}%` : '—'} iconName="clock" tone="info" sub={delta == null ? 'vs last week: —' : `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)} pts vs last week`} />
        <Stat label="Below 75%" value={low.length} iconName="alert" tone={low.length ? 'bad' : 'ok'} sub="Staff, last 30 days" />
        <Stat label="Leave in pipeline" value={pendingAll} iconName="leave" tone="warn" sub={`${yearLeaves.reduce((s, l) => s + l.days, 0)} leave days booked in ${year}`} />
      </div>
      <div className="cols">
        <div className="card">
          <div className="card-head"><div><h3>Attendance trend</h3><p>Weekly %, last 4 weeks · all staff</p></div></div>
          <TrendChart weeks={weeks} />
        </div>
        <div className="card">
          <div className="card-head"><div><h3>Department ranking</h3><p>Last 30 days · click to analyse</p></div></div>
          <div className="ld-list">
            {depts.map((d, i) => (
              <button className="ld-item" key={d.code} onClick={() => openDept(d.code)}>
                <span className={`ld-rank-n ${i === 0 ? 'top' : ''}`}>{i + 1}</span>
                <div className="person" style={{ flex: 1, minWidth: 0 }}><div style={{ flex: 1, minWidth: 0 }}><b>{d.name}</b><small>{d.staff} staff · {d.s.A} absences</small><Meter pct={d.s.percent} /></div></div>
                <div className="ld-item-end"><Badge tone={pctTone(d.s.percent)}>{d.s.percent}%</Badge></div>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="cols">
        <div className="card">
          <div className="card-head"><div><h3><Icon name="alert" size={18} /> Low-attendance staff</h3><p>Institution-wide, below 75% in the last 30 days</p></div>{low.length ? <Badge tone="bad">{low.length}</Badge> : null}</div>
          <LowList rows={low} rng={r} />
        </div>
        <div className="card">
          <div className="card-head"><div><h3>Leave by type</h3><p>Days approved or pending in {year}</p></div><a className="btn btn-ghost btn-sm" href="#leaves">All leaves</a></div>
          <LeaveTypeDonut list={yearLeaves} />
        </div>
      </div>
    </>
  );
}

function LeavesSection({ me }) {
  useErp();
  const pend = ERP.leaves.all().filter((l) => PENDING.includes(l.status)).length;
  return (
    <>
      <div className="ld-note ld-note-info"><Icon name="file" size={15} /><span>Read-only view. Approvals are handled by HODs and the Principal{pend ? <> — <b>{pend}</b> request{pend === 1 ? ' is' : 's are'} currently in the pipeline</> : null}.</span></div>
      <div className="section"><LeaveTable me={me} opts={{ key: 'dn-leaves', source: () => ERP.leaves.all(), exportName: 'leave_overview' }} /></div>
    </>
  );
}

export default function DeanPage() {
  const me = useRequireRole(['dean']);
  if (!me) return null;
  const sections = [
    { id: 'dashboard', label: 'Dashboard', title: 'Academic Overview', icon: 'home', render: (u) => <Dashboard me={u} /> },
    { id: 'analytics', label: 'Attendance Analytics', icon: 'chart', render: (u) => <AttendanceReport me={u} opts={{ key: 'dn-att', deptSelectable: true, compare: true }} /> },
    { id: 'leaves', label: 'Leave Overview', icon: 'file', render: (u) => <LeavesSection me={u} /> },
    { id: 'myleave', label: 'My Leave', icon: 'leave', render: (u) => <MyLeave me={u} /> },
    { id: 'announcements', label: 'Announcements', icon: 'megaphone', render: (u) => <Announcements me={u} canPost /> },
  ];
  return <Shell user={me} sections={sections} />;
}
