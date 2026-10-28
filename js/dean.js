/* Arundhati ERP — Dean portal (academic oversight; read-only on approvals). */
(function () {
  const me = ERP.auth.require(['dean']);
  if (!me) return;
  const L = window.Leaders, { esc, icon, stat } = ERP.ui, F = ERP.fmt, U = ERP.util, LS = ERP.LEAVE_STATE;

  function dashboard(el) {
    const r = L.presetRange('30');
    const staff = ERP.users.staff().filter(L.isStaff);
    const ids = new Set(staff.map((u) => u.empId));
    const all30 = ERP.attendance.summarize(ERP.attendance.all().filter((x) => ids.has(x.empId) && x.date >= r.from && x.date <= r.to));
    const weeks = L.weeklyTrend(4);
    const depts = L.deptStats(r.from, r.to).sort((a, b) => b.s.percent - a.s.percent);
    const low = L.lowAttendance(staff, r.from, r.to);
    const year = String(new Date().getFullYear());
    const yearLeaves = ERP.leaves.all().filter((l) => l.from.startsWith(year) && L.LIVE.includes(l.status));
    const pendingAll = ERP.leaves.all().filter((l) => L.PENDING.includes(l.status)).length;
    const thisW = weeks[weeks.length - 1], prevW = weeks[weeks.length - 2];
    const delta = thisW && prevW && thisW.s.total && prevW.s.total ? Math.round((thisW.s.percent - prevW.s.percent) * 10) / 10 : null;

    el.innerHTML = `
      <div class="hero ld-hero">
        <div><h2>${L.greeting()}, ${esc(me.name)}</h2><p>Academic oversight · ${staff.length} staff across ${ERP.DEPARTMENTS.length} departments</p></div>
        <a class="btn ld-hero-btn" href="#analytics">${icon('chart', 16)} Attendance analytics</a>
      </div>
      <div class="cards">
        ${stat('Institution attendance', all30.total ? `${all30.percent}%` : '—', { iconName: 'chart', tone: all30.total ? L.pctTone(all30.percent) : 'info', sub: 'Last 30 days' })}
        ${stat('This week', thisW && thisW.s.total ? `${thisW.s.percent}%` : '—', { iconName: 'clock', tone: 'info', sub: delta == null ? 'vs last week: —' : `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)} pts vs last week` })}
        ${stat('Below 75%', low.length, { iconName: 'alert', tone: low.length ? 'bad' : 'ok', sub: 'Staff, last 30 days' })}
        ${stat('Leave in pipeline', pendingAll, { iconName: 'leave', tone: 'warn', sub: `${yearLeaves.reduce((s, l) => s + l.days, 0)} leave days booked in ${year}` })}
      </div>
      <div class="cols">
        <div class="card">
          <div class="card-head"><div><h3>Attendance trend</h3><p>Weekly %, last 4 weeks · all staff</p></div></div>
          <div data-trend></div>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>Department ranking</h3><p>Last 30 days · click to analyse</p></div></div>
          <div class="ld-list" data-rank>${depts.map((d, i) => `<button class="ld-item" data-dept="${d.code}">
            <span class="ld-rank-n ${i === 0 ? 'top' : ''}">${i + 1}</span>
            <div class="person" style="flex:1;min-width:0"><div style="flex:1;min-width:0"><b>${esc(d.name)}</b><small>${d.staff} staff · ${d.s.A} absences</small>${ERP.ui.meter(d.s.percent)}</div></div>
            <div class="ld-item-end"><span class="badge badge-${L.pctTone(d.s.percent)}">${d.s.percent}%</span></div></button>`).join('')}</div>
        </div>
      </div>
      <div class="cols">
        <div class="card">
          <div class="card-head"><div><h3>${icon('alert', 18)} Low-attendance staff</h3><p>Institution-wide, below 75% in the last 30 days</p></div>${low.length ? `<span class="badge badge-bad">${low.length}</span>` : ''}</div>
          <div data-low>${L.lowList(low)}</div>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>Leave by type</h3><p>Days approved or pending in ${year}</p></div><a class="btn btn-ghost btn-sm" href="#leaves">All leaves</a></div>
          <div data-donut></div>
        </div>
      </div>`;

    L.trendChart(el.querySelector('[data-trend]'), weeks);
    L.leaveTypeDonut(el.querySelector('[data-donut]'), yearLeaves);
    L.bindDrill(el.querySelector('[data-low]'), () => r);
    el.querySelectorAll('[data-dept]').forEach((b) => b.onclick = () => { L.setFilter('dn-att', { dept: b.dataset.dept }); ERP.ui.go('analytics'); });
  }

  ERP.ui.shell({
    user: me,
    sections: [
      { id: 'dashboard', label: 'Dashboard', title: 'Academic Overview', icon: 'home', render: dashboard },
      { id: 'analytics', label: 'Attendance Analytics', icon: 'chart', render: (el) => L.attendanceReport(el, { key: 'dn-att', deptSelectable: true, compare: true }) },
      { id: 'leaves', label: 'Leave Overview', icon: 'file',
        render: (el) => {
          const pend = ERP.leaves.all().filter((l) => l.status === LS.PENDING_HOD || l.status === LS.PENDING_PRINCIPAL).length;
          const note = document.createElement('div');
          note.className = 'ld-note ld-note-info';
          note.innerHTML = `${icon('file', 15)}<span>Read-only view. Approvals are handled by HODs and the Principal${pend ? ` — <b>${pend}</b> request${pend === 1 ? ' is' : 's are'} currently in the pipeline` : ''}.</span>`;
          el.appendChild(note);
          const box = document.createElement('div'); box.className = 'section'; el.appendChild(box);
          L.leaveTable(box, { key: 'dn-leaves', source: () => ERP.leaves.all(), exportName: 'leave_overview' });
        } },
      { id: 'myleave', label: 'My Leave', icon: 'leave', render: (el) => L.myLeave(el, me) },
      { id: 'announcements', label: 'Announcements', icon: 'megaphone', render: (el) => L.announcements(el, me, { canPost: true }) },
    ],
  });
})();
