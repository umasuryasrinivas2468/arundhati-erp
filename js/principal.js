/* Arundhati ERP — Principal portal (institution-wide, final leave approvals). */
(function () {
  const me = ERP.auth.require(['principal']);
  if (!me) return;
  const L = window.Leaders, { esc, icon, stat, empty } = ERP.ui, F = ERP.fmt, U = ERP.util;
  const pendingCount = () => ERP.leaves.pendingFor(me).length;

  function dashboard(el) {
    const r = L.presetRange('30');
    const staff = ERP.users.staff().filter(L.isStaff);
    const ids = new Set(staff.map((u) => u.empId));
    const all30 = ERP.attendance.summarize(ERP.attendance.all().filter((x) => ids.has(x.empId) && x.date >= r.from && x.date <= r.to));
    const latest = ERP.attendance.latestDate();
    const today = U.today();
    const away = L.onLeaveOn(today);
    const pending = ERP.leaves.pendingFor(me).sort((a, b) => a.from.localeCompare(b.from));
    const n = pending.length;
    const depts = L.deptStats(r.from, r.to).sort((a, b) => b.s.percent - a.s.percent);
    const low = L.lowAttendance(staff, r.from, r.to);

    el.innerHTML = `
      <div class="hero ld-hero">
        <div><h2>${L.greeting()}, ${esc(me.name)}</h2><p>${esc(ERP.INSTITUTION)} · ${ERP.DEPARTMENTS.length} departments · ${F.date(today)}</p></div>
        <a class="btn ld-hero-btn" href="#approvals">${icon('check', 16)} Final approvals ${n ? `<em>${n}</em>` : ''}</a>
      </div>
      <div class="cards">
        ${stat('Overall attendance', all30.total ? `${all30.percent}%` : '—', { iconName: 'chart', tone: all30.total ? L.pctTone(all30.percent) : 'info', sub: 'Last 30 days, all staff' })}
        ${stat('Total staff', staff.length, { iconName: 'users', tone: 'info', sub: `${staff.filter((u) => u.role === 'hod').length} HODs · ${staff.filter((u) => u.role === 'faculty').length} faculty` })}
        ${stat('Pending approvals', n, { iconName: 'leave', tone: n ? 'warn' : 'ok', sub: n ? `${pending.filter((l) => l.history.length).length} HOD-recommended` : 'Nothing waiting' })}
        ${stat('On leave today', away.length, { iconName: 'calendar', tone: 'accent', sub: away.length ? away.map((l) => L.short(ERP.users.byEmp(l.empId).name)).slice(0, 2).join(', ') + (away.length > 2 ? '…' : '') : 'Full strength' })}
      </div>
      <div class="cols">
        <div class="card">
          <div class="card-head"><div><h3>Department comparison</h3><p>Attendance %, last 30 days · click to open the report</p></div><a class="btn btn-ghost btn-sm" href="#reports">Reports</a></div>
          <div data-depts></div>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>Status on ${latest ? F.date(latest) : '—'}</h3><p>${latest === today ? 'Today' : 'Latest uploaded day'} · all staff</p></div></div>
          <div data-donut></div>
        </div>
      </div>
      <div class="cols">
        <div class="card">
          <div class="card-head"><div><h3>Awaiting your approval</h3><p>Soonest first</p></div>${n ? '<a class="btn btn-primary btn-sm" href="#approvals">Open queue</a>' : ''}</div>
          <div data-pend>${L.leaveList(pending.slice(0, 5), 'No requests are waiting for you')}</div>
        </div>
        <div class="section">
          <div class="card">
            <div class="card-head"><div><h3>On leave today</h3><p>${F.date(today)}</p></div></div>
            <div data-away>${L.leaveList(away, 'Nobody is on approved leave today')}</div>
          </div>
          <div class="card">
            <div class="card-head"><div><h3>${icon('alert', 18)} Low attendance</h3><p>Below 75%, last 30 days</p></div>${low.length ? `<span class="badge badge-bad">${low.length}</span>` : ''}</div>
            <div data-low>${L.lowList(low.slice(0, 6))}</div>
          </div>
        </div>
      </div>`;

    L.clickableBars(el.querySelector('[data-depts]'), depts.map((d) => ({ key: d.code, label: d.name, value: d.s.percent, tone: L.pctTone(d.s.percent) })), (it) => {
      L.setFilter('pr-att', { dept: it.key }); ERP.ui.go('reports');
    });
    const donutEl = el.querySelector('[data-donut]');
    if (latest) L.statusDonut(donutEl, ERP.attendance.forDate(latest).filter((x) => ids.has(x.empId)));
    else donutEl.innerHTML = empty('No attendance uploaded yet', 'calendar');
    L.bindLeaveClicks(el.querySelector('[data-pend]'));
    L.bindLeaveClicks(el.querySelector('[data-away]'));
    L.bindDrill(el.querySelector('[data-low]'), () => r);
  }

  ERP.ui.shell({
    user: me,
    sections: [
      { id: 'dashboard', label: 'Dashboard', title: 'Institution Overview', icon: 'home', render: dashboard },
      { id: 'approvals', label: 'Leave Approvals', title: 'Final Leave Approvals', icon: 'check', badge: pendingCount, render: (el) => L.approvalQueue(el, me) },
      { id: 'reports', label: 'Attendance Reports', icon: 'chart', render: (el) => L.attendanceReport(el, { key: 'pr-att', deptSelectable: true }) },
      { id: 'leaves', label: 'All Leaves', icon: 'file', render: (el) => L.leaveTable(el, { key: 'pr-leaves', source: () => ERP.leaves.all(), exportName: 'all_leaves' }) },
      { id: 'directory', label: 'Staff Directory', icon: 'users', render: (el) => L.directory(el, { key: 'pr-dir' }) },
      { id: 'announcements', label: 'Announcements', icon: 'megaphone', render: (el) => L.announcements(el, me, { canPost: true }) },
    ],
  });
})();
