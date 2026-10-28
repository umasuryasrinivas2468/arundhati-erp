/* Arundhati ERP — HOD portal (scoped to the HOD's own department). */
(function () {
  const me = ERP.auth.require(['hod']);
  if (!me) return;
  const L = window.Leaders, { esc, icon, stat, empty } = ERP.ui, F = ERP.fmt, U = ERP.util;
  const deptStaff = () => ERP.users.byDept(me.dept).filter(L.isStaff);
  const pendingCount = () => ERP.leaves.pendingFor(me).length;

  function dashboard(el) {
    const r = L.presetRange('30');
    const staff = deptStaff();
    const s30 = ERP.attendance.deptSummary(me.dept, r.from, r.to);
    const latest = ERP.attendance.latestDate();
    const ids = new Set(staff.map((u) => u.empId));
    const dayRows = latest ? ERP.attendance.forDate(latest).filter((x) => ids.has(x.empId)) : [];
    const day = ERP.attendance.summarize(dayRows);
    const presentish = day.P + day.OD + day.HD;
    const pending = ERP.leaves.pendingFor(me).sort((a, b) => a.from.localeCompare(b.from));
    const per = L.staffSummary(staff, r.from, r.to).sort((a, b) => b.s.percent - a.s.percent);
    const low = per.filter((x) => x.s.total && x.s.percent < 75).sort((a, b) => a.s.percent - b.s.percent);
    const week = L.addDays(U.today(), 7);
    const away = ERP.leaves.forDept(me.dept).filter((l) => L.LIVE.includes(l.status) && l.to >= U.today() && l.from <= week).sort((a, b) => a.from.localeCompare(b.from));
    const n = pending.length;

    el.innerHTML = `
      <div class="hero ld-hero">
        <div><h2>${L.greeting()}, ${esc(me.name)}</h2><p>Department of ${esc(F.deptName(me.dept))} · ${staff.length} staff · ${F.date(U.today())}</p></div>
        <a class="btn ld-hero-btn" href="#approvals">${icon('check', 16)} Review requests ${n ? `<em>${n}</em>` : ''}</a>
      </div>
      <div class="cards">
        ${stat('Department staff', staff.length, { iconName: 'users', tone: 'info', sub: `${staff.filter((u) => u.role === 'faculty').length} faculty + HOD` })}
        ${stat('Attendance · 30 days', s30.total ? `${s30.percent}%` : '—', { iconName: 'chart', tone: s30.total ? L.pctTone(s30.percent) : 'info', sub: `${F.date(r.from).slice(0, 6)} – ${F.date(r.to).slice(0, 6)}` })}
        ${stat(latest === U.today() ? 'Present today' : 'Present on latest day', latest ? `${presentish}<small class="muted" style="font-size:15px"> / ${staff.length}</small>` : '—', { iconName: 'clock', tone: 'ok', sub: latest ? `${F.date(latest)} · ${day.A} absent, ${day.L} on leave` : 'No attendance uploaded' })}
        ${stat('Pending approvals', n, { iconName: 'leave', tone: n ? 'warn' : 'ok', sub: n ? `Next starts ${F.date(pending[0].from)}` : 'Nothing waiting' })}
      </div>
      <div class="cols">
        <div class="card">
          <div class="card-head"><div><h3>Faculty attendance</h3><p>Last 30 days · click a name for the calendar</p></div><a class="btn btn-ghost btn-sm" href="#attendance">Full report</a></div>
          <div data-bars></div>
        </div>
        <div class="section">
          <div class="card">
            <div class="card-head"><div><h3>${icon('alert', 18)} Low attendance</h3><p>Below 75% in the last 30 days</p></div>${low.length ? `<span class="badge badge-bad">${low.length}</span>` : ''}</div>
            <div data-low>${L.lowList(low)}</div>
          </div>
          <div class="card">
            <div class="card-head"><div><h3>Away this week</h3><p>Approved or pending leave, next 7 days</p></div></div>
            <div data-away>${L.leaveList(away, 'Everyone is expected in this week')}</div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>Waiting for your recommendation</h3><p>Oldest and soonest requests first</p></div>${n ? '<a class="btn btn-primary btn-sm" href="#approvals">Open queue</a>' : ''}</div>
        <div data-pend>${L.leaveList(pending.slice(0, 4), 'No pending requests — you\'re all caught up')}</div>
      </div>`;

    const barsEl = el.querySelector('[data-bars]');
    if (per.length) {
      L.clickableBars(barsEl, per.map((x) => ({ key: x.u.empId, label: L.short(x.u.name), title: x.u.name, value: x.s.percent, tone: L.pctTone(x.s.percent) })), (it) => L.personModal(it.key, r));
    } else barsEl.innerHTML = empty('No staff in this department', 'users');
    L.bindDrill(el.querySelector('[data-low]'), () => r);
    L.bindLeaveClicks(el.querySelector('[data-away]'));
    L.bindLeaveClicks(el.querySelector('[data-pend]'));
  }

  ERP.ui.shell({
    user: me,
    sections: [
      { id: 'dashboard', label: 'Dashboard', title: `${F.deptName(me.dept)} · Dashboard`, icon: 'home', render: dashboard },
      { id: 'approvals', label: 'Leave Approvals', icon: 'check', badge: pendingCount, render: (el) => L.approvalQueue(el, me) },
      { id: 'attendance', label: 'Department Attendance', icon: 'calendar', render: (el) => L.attendanceReport(el, { key: 'hod-att', fixedDept: me.dept }) },
      { id: 'history', label: 'Leave History', icon: 'file', title: 'Department Leave History',
        render: (el) => L.leaveTable(el, { key: 'hod-hist', source: () => ERP.leaves.forDept(me.dept), showDept: false, deptFilter: false, exportName: `leaves_${me.dept}` }) },
      { id: 'myleave', label: 'My Leave', icon: 'leave', render: (el) => L.myLeave(el, me) },
      { id: 'announcements', label: 'Announcements', icon: 'megaphone', render: (el) => L.announcements(el, me) },
    ],
  });
})();
