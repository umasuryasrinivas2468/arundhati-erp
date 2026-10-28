/* Arundhati ERP — section renderers shared by the HOD, Dean and Principal portals.
 * Load after data.js and ui.js. Exposes window.Leaders.
 */
(function () {
  const { esc, icon, avatar, leaveBadge, statusBadge, meter, stat, empty, modal, toast } = ERP.ui;
  const U = ERP.util, F = ERP.fmt, LS = ERP.LEAVE_STATE;
  const PENDING = [LS.PENDING_HOD, LS.PENDING_PRINCIPAL];
  const LIVE = [...PENDING, LS.APPROVED];
  const STAFF_ROLES = ['faculty', 'hod', 'dean', 'principal'];
  const TYPE_TONE = { CL: 'accent', EL: 'info', ML: 'bad', OD: 'ok', LOP: 'warn' };
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // ---------- small helpers ----------
  const addDays = (s, n) => { const d = U.parseISO(s); d.setDate(d.getDate() + n); return U.iso(d); };
  const pctTone = (p) => (p >= 85 ? 'ok' : p >= 75 ? 'warn' : 'bad');
  const short = (name) => name.replace(/^Dr\.\s*/, '');
  const isStaff = (u) => STAFF_ROLES.includes(u.role);
  const principal = () => ERP.users.all().find((u) => u.role === 'principal');
  const typeBadge = (code) => `<span class="badge badge-${TYPE_TONE[code] || 'muted'}" title="${esc(F.leaveName(code))}">${esc(code)}</span>`;
  const dateRange = (l) => (l.from === l.to ? F.date(l.from) : `${F.date(l.from)} – ${F.date(l.to)}`);
  const daysLabel = (n) => `${n} day${n === 1 ? '' : 's'}`;
  const person = (u, sub, size = 34) => `<div class="person">${avatar(u.name, size)}<div><b>${esc(u.name)}</b><small>${esc(sub ?? `${u.designation}${u.dept ? ' · ' + u.dept : ''}`)}</small></div></div>`;
  const pctCell = (p, total) => (total ? `<div class="ld-pct">${meter(p)}<b>${p}%</b></div>` : '<span class="muted small">No records</span>');
  const num = (n) => `<span class="ld-num ${n ? '' : 'zero'}">${n}</span>`;
  const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
  const fileStamp = (s) => s.replace(/[^\w-]+/g, '_');

  function presetRange(p) {
    const t = U.today(), d = U.parseISO(t);
    if (p === 'month') return { from: U.iso(new Date(d.getFullYear(), d.getMonth(), 1)), to: t };
    if (p === 'lastmonth') return { from: U.iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), to: U.iso(new Date(d.getFullYear(), d.getMonth(), 0)) };
    return { from: addDays(t, -(+p) + 1), to: t };
  }
  const PRESETS = [['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['month', 'This month'], ['lastmonth', 'Last month']];

  // Filter state survives section re-renders (keyed per screen).
  const memo = {};
  const keep = (key, init) => memo[key] || (memo[key] = init());
  const setFilter = (key, patch) => { if (memo[key]) Object.assign(memo[key], patch); else memo[key] = { ...presetRange('30'), preset: '30', dept: '', ...patch }; };

  const rangeControls = (st) => `<div class="ld-range">
      <label class="ld-in"><span>From</span><input type="date" data-f="from" value="${st.from}"></label>
      <label class="ld-in"><span>To</span><input type="date" data-f="to" value="${st.to}"></label>
      <div class="ld-presets">${PRESETS.map(([k, l]) => `<button type="button" class="ld-chip ${st.preset === k ? 'active' : ''}" data-preset="${k}">${l}</button>`).join('')}</div>
    </div>`;
  const deptSelect = (val, allLabel = 'All departments') => `<label class="ld-in"><span>Department</span><select data-f="dept"><option value="">${allLabel}</option>${ERP.DEPARTMENTS.map((d) => `<option value="${d.code}" ${val === d.code ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>`;

  // Wires [data-f] inputs/selects and [data-preset] chips inside root to the state object.
  function bindFilters(root, st, onChange) {
    root.querySelectorAll('[data-f]').forEach((inp) => inp.addEventListener('change', () => {
      const k = inp.dataset.f;
      if ((k === 'from' || k === 'to') && !inp.value) { inp.value = st[k]; return; }
      const prev = st[k]; st[k] = inp.value;
      if (st.from && st.to && st.from > st.to) { st[k] = prev; inp.value = prev; toast('"From" date must be on or before "To" date', 'bad'); return; }
      if (k === 'from' || k === 'to') { st.preset = ''; root.querySelectorAll('[data-preset]').forEach((b) => b.classList.remove('active')); }
      onChange(k);
    }));
    root.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
      Object.assign(st, presetRange(b.dataset.preset), { preset: b.dataset.preset });
      root.querySelector('[data-f="from"]').value = st.from; root.querySelector('[data-f="to"]').value = st.to;
      root.querySelectorAll('[data-preset]').forEach((x) => x.classList.toggle('active', x === b));
      onChange('range');
    }));
  }

  // Any element with data-drill="empId" inside root opens the person drill-down.
  function bindDrill(root, rangeFn = () => presetRange('30')) {
    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-drill]');
      if (t && root.contains(t)) personModal(t.dataset.drill, rangeFn());
    });
  }

  // Makes ERP.ui.bars() rows clickable. items[i] receives onPick(item, i).
  function clickableBars(container, items, onPick, { max = 100, suffix = '%', active = null } = {}) {
    ERP.ui.bars(container, items, { max, suffix });
    container.querySelectorAll('.bar-row').forEach((row, i) => {
      row.classList.add('ld-pick'); row.tabIndex = 0; row.setAttribute('role', 'button');
      if (active != null && items[i].key === active) row.classList.add('on');
      row.title = `View ${items[i].title || items[i].label}`;
      row.onclick = () => onPick(items[i], i);
      row.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(items[i], i); } };
    });
  }

  // ---------- analytics helpers ----------
  const staffSummary = (list, from, to) => list.map((u) => ({ u, s: ERP.attendance.summaryFor(u.empId, from, to) }));
  const lowAttendance = (list, from, to, thr = 75) => staffSummary(list, from, to).filter((r) => r.s.total && r.s.percent < thr).sort((a, b) => a.s.percent - b.s.percent);
  const onLeaveOn = (date, list) => {
    const ids = list ? new Set(list.map((u) => u.empId)) : null;
    return ERP.leaves.all().filter((l) => l.status === LS.APPROVED && l.from <= date && l.to >= date && (!ids || ids.has(l.empId)));
  };
  function deptStats(from, to) {
    return ERP.DEPARTMENTS.map((d) => ({ ...d, s: ERP.attendance.deptSummary(d.code, from, to), staff: ERP.users.byDept(d.code).filter(isStaff).length }));
  }
  // Calendar weeks (Mon–Sun) ending with the week of the latest attendance date.
  function weeklyTrend(n = 4, list = null) {
    const ids = list ? new Set(list.map((u) => u.empId)) : null;
    const last = ERP.attendance.latestDate() || U.today();
    const monday = addDays(last, -((U.parseISO(last).getDay() + 6) % 7));
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const from = addDays(monday, -7 * i), to = addDays(from, 6);
      const rows = ERP.attendance.all().filter((r) => r.date >= from && r.date <= to && (!ids || ids.has(r.empId)));
      out.push({ from, to, label: F.date(from).slice(0, 6), s: ERP.attendance.summarize(rows) });
    }
    return out;
  }
  function trendChart(el, weeks) {
    el.innerHTML = `<div class="ld-colchart">${weeks.map((w, i) => {
      const prev = weeks[i - 1]; const d = prev && prev.s.total && w.s.total ? Math.round((w.s.percent - prev.s.percent) * 10) / 10 : null;
      return `<div class="ld-col" title="${F.date(w.from)} – ${F.date(w.to)}: ${w.s.total} records">
        <span class="ld-col-val">${w.s.total ? w.s.percent + '%' : '—'}</span>
        ${d != null ? `<span class="ld-delta ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(d)}</span>` : '<span class="ld-delta">&nbsp;</span>'}
        <div class="ld-col-bar bar-${pctTone(w.s.percent)}" data-h="${w.s.percent}"></div>
        <span class="ld-col-lbl">Wk of ${esc(w.label)}</span></div>`;
    }).join('')}</div>`;
    requestAnimationFrame(() => el.querySelectorAll('.ld-col-bar').forEach((b) => { b.style.height = `calc((100% - 70px) * ${b.dataset.h / 100})`; }));
  }
  function statusDonut(el, rows, center) {
    const c = ERP.attendance.summarize(rows);
    ERP.ui.donut(el, [
      { label: 'Present', value: c.P, tone: 'ok' }, { label: 'Absent', value: c.A, tone: 'bad' }, { label: 'On Leave', value: c.L, tone: 'warn' },
      { label: 'Half Day', value: c.HD, tone: 'info' }, { label: 'On Duty', value: c.OD, tone: 'accent' },
    ], center ?? `${c.percent}%`);
    return c;
  }
  function leaveTypeDonut(el, list) {
    const parts = ERP.LEAVE_TYPES.map((t) => ({ label: t.name, value: list.filter((l) => l.type === t.code).reduce((s, l) => s + l.days, 0), tone: TYPE_TONE[t.code] }));
    ERP.ui.donut(el, parts, `${parts.reduce((s, p) => s + p.value, 0)}d`);
  }

  // ---------- person drill-down (month calendar + records) ----------
  function personModal(empId, rng = presetRange('30')) {
    const u = ERP.users.byEmp(empId);
    if (!u) return toast('Employee not found', 'bad');
    const now = U.parseISO(U.today());
    const start = U.parseISO(rng.to && rng.to < U.today() ? rng.to : U.today());
    const ym = { y: start.getFullYear(), m: start.getMonth() };
    const body = document.createElement('div');
    const rs = ERP.attendance.summaryFor(empId, rng.from, rng.to);

    function render() {
      const mFrom = U.iso(new Date(ym.y, ym.m, 1)), mTo = U.iso(new Date(ym.y, ym.m + 1, 0));
      const recs = ERP.attendance.forEmp(empId, mFrom, mTo);
      const map = new Map(recs.map((r) => [r.date, r]));
      const ms = ERP.attendance.summarize(recs);
      const lvs = ERP.leaves.forEmp(empId).filter((l) => LIVE.includes(l.status) && l.from <= mTo && l.to >= mFrom);
      const leaveOn = (d) => lvs.find((l) => l.from <= d && l.to >= d);
      const first = new Date(ym.y, ym.m, 1).getDay(), n = new Date(ym.y, ym.m + 1, 0).getDate();
      let cells = DOW.map((d) => `<div class="cal-h">${d.slice(0, 2)}</div>`).join('') + '<div class="cal-d blank"></div>'.repeat(first);
      for (let i = 1; i <= n; i++) {
        const iso = U.iso(new Date(ym.y, ym.m, i)), r = map.get(iso), lv = leaveOn(iso), sun = U.isSunday(iso);
        const tip = r ? `${F.date(iso)} · ${ERP.STATUS[r.status].label}${r.inTime ? ` · ${r.inTime}–${r.outTime || '?'}` : ''}` : lv ? `${F.date(iso)} · ${lv.type} leave (${lv.status})` : sun ? `${F.date(iso)} · Sunday` : `${F.date(iso)} · No record`;
        cells += `<div class="cal-d ${r ? 's-' + r.status : ''} ${!r && sun ? 'sun' : ''} ${!r && lv && !sun ? 'ld-onleave' : ''} ${iso === U.today() ? 'today' : ''}" title="${esc(tip)}">${i}<small>${r ? r.status : !sun && lv ? lv.type : ''}</small></div>`;
      }
      const atEnd = ym.y > now.getFullYear() || (ym.y === now.getFullYear() && ym.m >= now.getMonth());
      body.innerHTML = `
        <div class="ld-modal-top">${person(u, `${u.empId} · ${u.designation}${u.dept ? ' · ' + F.deptName(u.dept) : ''}`, 44)}
          <div style="text-align:right"><div class="ld-big ${rs.total ? pctTone(rs.percent) : ''}">${rs.total ? rs.percent + '%' : '—'}</div><small class="muted">${F.date(rng.from)} – ${F.date(rng.to)}</small></div></div>
        <div class="ld-drill-grid">
          <div>
            <div class="ld-monthnav"><button class="icon-btn" data-m="-1" aria-label="Previous month">‹</button><b>${MONTHS_LONG[ym.m]} ${ym.y}</b><button class="icon-btn" data-m="1" aria-label="Next month" ${atEnd ? 'disabled' : ''}>›</button></div>
            <div class="cal">${cells}</div>
            <div class="ld-legend">${Object.entries(ERP.STATUS).map(([k, v]) => `<span><i class="s-${k}"></i>${v.label}</span>`).join('')}<span><i style="box-shadow:inset 0 0 0 2px var(--warn)"></i>Leave (no record)</span></div>
          </div>
          <div>
            <div class="ld-chips" style="margin-bottom:12px">${['P', 'A', 'L', 'HD', 'OD'].map((k) => `<span>${statusBadge(k)} ${ms[k] || 0}</span>`).join('')}<span>Month: <b>${ms.total ? ms.percent + '%' : '—'}</b></span></div>
            ${recs.length ? `<div class="ld-records"><table><thead><tr><th>Date</th><th>Status</th><th>In</th><th>Out</th></tr></thead><tbody>${recs.slice().reverse().map((r) => `<tr><td>${F.date(r.date).slice(0, 6)} <span class="muted small">${DOW[U.parseISO(r.date).getDay()]}</span></td><td>${statusBadge(r.status)}</td><td>${esc(r.inTime || '—')}</td><td>${esc(r.outTime || '—')}</td></tr>`).join('')}</tbody></table></div>` : empty('No attendance records for this month', 'calendar')}
            ${lvs.length ? `<div class="ld-sub">Leaves this month</div><div class="ld-list">${lvs.map((l) => `<div class="ld-item" data-leave="${l.id}">${typeBadge(l.type)}<span style="flex:1">${dateRange(l)} <span class="muted small">· ${daysLabel(l.days)}</span></span>${leaveBadge(l.status)}</div>`).join('')}</div>` : ''}
          </div>
        </div>`;
      body.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { ym.m += +b.dataset.m; if (ym.m < 0) { ym.m = 11; ym.y--; } if (ym.m > 11) { ym.m = 0; ym.y++; } render(); });
      body.querySelectorAll('[data-leave]').forEach((b) => b.onclick = () => leaveModal(b.dataset.leave));
    }
    render();
    return modal({
      title: 'Attendance detail', body, wide: true,
      actions: [
        { label: 'Export month', tone: 'ghost', onClick: () => {
          const mFrom = U.iso(new Date(ym.y, ym.m, 1)), mTo = U.iso(new Date(ym.y, ym.m + 1, 0));
          const recs = ERP.attendance.forEmp(empId, mFrom, mTo);
          if (!recs.length) { toast('Nothing to export for this month', 'bad'); return false; }
          ERP.ui.downloadXlsx(`attendance_${u.empId}_${ym.y}-${String(ym.m + 1).padStart(2, '0')}.xlsx`, ERP.attendance.TEMPLATE_HEADERS,
            recs.map((r) => [u.empId, u.name, u.dept || '', r.date, r.status, r.inTime, r.outTime]), 'Attendance');
          toast('Exported'); return false;
        } },
        { label: 'Close', tone: 'primary' },
      ],
    });
  }

  // ---------- leave detail modal with history timeline ----------
  function leaveModal(id, { actions } = {}) {
    const l = ERP.leaves.byId(id);
    if (!l) return toast('Leave not found', 'bad');
    const u = ERP.users.byEmp(l.empId) || { name: l.empId, designation: '', dept: null };
    const bal = ERP.leaves.balance(l.empId).find((b) => b.code === l.type);
    const tone = { Approved: 'ok', Recommended: 'ok', Rejected: 'bad', Cancelled: 'bad' };
    const steps = [{ cls: '', title: 'Applied', who: u.name, at: l.appliedAt }];
    l.history.forEach((h) => { const a = ERP.users.byEmp(h.by); steps.push({ cls: tone[h.action] || '', title: h.action, who: a ? `${a.name} · ${a.designation}` : h.role, at: h.at, remark: h.remark }); });
    if (l.status === LS.PENDING_HOD) steps.push({ cls: 'wait', title: 'Awaiting HOD recommendation', who: ERP.users.hodOf(u.dept)?.name || 'HOD' });
    if (l.status === LS.PENDING_PRINCIPAL) steps.push({ cls: 'wait', title: 'Awaiting Principal approval', who: principal()?.name || 'Principal' });
    const body = `
      <div class="ld-modal-top">${person(u, `${u.empId || l.empId} · ${u.designation}${u.dept ? ' · ' + F.deptName(u.dept) : ''}`, 42)}${leaveBadge(l.status)}</div>
      <div class="ld-kv">
        <div><small>Type</small><b>${esc(F.leaveName(l.type))}</b></div>
        <div><small>Dates</small><b>${dateRange(l)}</b></div>
        <div><small>Working days</small><b>${l.halfDay ? 'Half day (0.5)' : l.days}</b></div>
        <div><small>Applied</small><b>${F.dateTime(l.appliedAt)}</b></div>
        <div><small>${esc(l.type)} balance</small><b>${bal && bal.quota != null ? `${bal.remaining} of ${bal.quota} left` : 'No cap'}</b></div>
      </div>
      <div class="ld-sub">Reason</div><p class="ld-quote">${esc(l.reason)}</p>
      <div class="ld-sub">Approval trail</div>
      <ul class="timeline">${steps.map((s) => `<li class="${s.cls}"><b>${esc(s.title)}</b><small>${esc(s.who || '')}${s.at ? ' · ' + F.dateTime(s.at) : ''}</small>${s.remark ? `<p>${esc(s.remark)}</p>` : ''}</li>`).join('')}</ul>`;
    return modal({ title: `${F.leaveName(l.type)} request`, body, actions: actions || [{ label: 'Close', tone: 'primary' }] });
  }

  // ---------- approve / recommend / reject with remark ----------
  function actDialog(l, me, action, onDone) {
    const u = ERP.users.byEmp(l.empId);
    const isHod = me.role === 'hod';
    const verb = action === 'reject' ? 'Reject' : isHod ? 'Recommend' : 'Approve';
    const next = action === 'reject' ? `${short(u.name)} will be notified that the request was rejected.`
      : isHod ? 'The request will be forwarded to the Principal for final approval.' : `${short(u.name)} will be notified that the leave is approved.`;
    modal({
      title: `${verb} leave?`,
      body: `<div class="ld-note ld-note-${action === 'reject' ? 'warn' : 'info'}" style="margin-bottom:14px">${icon(action === 'reject' ? 'alert' : 'check', 16)}<span><b>${esc(u.name)}</b> · ${esc(l.type)} · ${dateRange(l)} (${daysLabel(l.days)}).<br>${esc(next)}</span></div>
        <label class="field"><span>Remark ${action === 'reject' ? '(required)' : '(optional)'}</span><textarea rows="3" data-remark placeholder="${action === 'reject' ? 'Why is this being rejected?' : 'Add a note for the record'}"></textarea></label>`,
      actions: [
        { label: 'Cancel', tone: 'ghost' },
        { label: verb, tone: action === 'reject' ? 'danger' : isHod ? 'primary' : 'ok', onClick: (close, root) => {
          const ta = root.querySelector('[data-remark]'); const remark = ta.value.trim();
          if (action === 'reject' && remark.length < 3) { toast('Please give a reason for rejecting', 'bad'); ta.focus(); return false; }
          try { ERP.leaves.act(l.id, me, action, remark); } catch (err) { toast(err.message, 'bad'); return true; }
          onDone(action, verb);
          return true;
        } },
      ],
    });
  }

  // ---------- leave approval queue ----------
  function approvalQueue(el, me, { onAct } = {}) {
    const isHod = me.role === 'hod';
    const st = keep(`queue-${me.empId}`, () => ({ sort: 'soon', type: '', dept: '' }));
    el.innerHTML = `
      <div class="card ld-queue-head">
        <div><h3 data-count></h3><p>${isHod ? `Faculty requests from ${esc(F.deptName(me.dept))}. Recommended requests go to the Principal.` : 'Final approval. HOD recommendations are shown on each card.'}</p></div>
        <div class="row">
          ${isHod ? '' : deptSelect(st.dept)}
          <label class="ld-in"><span>Type</span><select data-f="type"><option value="">All types</option>${ERP.LEAVE_TYPES.map((t) => `<option value="${t.code}" ${st.type === t.code ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
          <label class="ld-in"><span>Sort</span><select data-f="sort"><option value="soon" ${st.sort === 'soon' ? 'selected' : ''}>Starting soonest</option><option value="old" ${st.sort === 'old' ? 'selected' : ''}>Waiting longest</option><option value="days" ${st.sort === 'days' ? 'selected' : ''}>Most days</option></select></label>
        </div>
      </div>
      <div class="ld-queue" data-q></div>`;
    const q = el.querySelector('[data-q]'), countEl = el.querySelector('[data-count]');
    const list = () => {
      let xs = ERP.leaves.pendingFor(me);
      if (st.type) xs = xs.filter((l) => l.type === st.type);
      if (st.dept) xs = xs.filter((l) => ERP.users.byEmp(l.empId)?.dept === st.dept);
      const by = { soon: (a, b) => a.from.localeCompare(b.from), old: (a, b) => a.appliedAt.localeCompare(b.appliedAt), days: (a, b) => b.days - a.days }[st.sort];
      return xs.sort(by);
    };
    const setCount = () => {
      const total = ERP.leaves.pendingFor(me).length, shown = q.querySelectorAll('.ld-lcard:not(.out-ok):not(.out-bad)').length;
      countEl.textContent = total ? `${total} request${total === 1 ? '' : 's'} awaiting you${shown !== total ? ` · ${shown} shown` : ''}` : 'All caught up';
    };
    function card(l) {
      const u = ERP.users.byEmp(l.empId) || { name: l.empId, designation: '', dept: null, role: '' };
      const bal = ERP.leaves.balance(l.empId).find((b) => b.code === l.type);
      const after = bal.quota == null ? null : bal.remaining - l.days;
      const others = ERP.leaves.all().filter((x) => x.id !== l.id && x.empId !== l.empId && LIVE.includes(x.status) && x.from <= l.to && x.to >= l.from && ERP.users.byEmp(x.empId)?.dept === u.dept && u.dept);
      const starts = Math.round((U.parseISO(l.from) - U.parseISO(U.today())) / 86400000);
      const soon = starts < 0 ? `<span class="ld-soon">Started ${-starts}d ago</span>` : starts <= 2 ? `<span class="ld-soon">${starts === 0 ? 'Starts today' : `Starts in ${starts}d`}</span>` : '';
      const rec = [...l.history].reverse().find((h) => h.action === 'Recommended');
      const recBy = rec && ERP.users.byEmp(rec.by);
      const recNote = isHod ? '' : rec
        ? `<div class="ld-note ld-note-info">${icon('check', 15)}<span><b>Recommended by ${esc(recBy ? recBy.name : 'HOD')}</b> · ${F.ago(rec.at)}${rec.remark ? `<br><q>${esc(rec.remark)}</q>` : '<br><span class="muted">No remark added.</span>'}</span></div>`
        : `<div class="ld-note ld-note-muted">${icon('user', 15)}<span>Direct request from ${esc(ERP.ui.ROLE_LABEL[u.role] || 'staff')} — no HOD stage.</span></div>`;
      const conflict = !u.dept ? '' : others.length
        ? `<div class="ld-note ld-note-warn">${icon('alert', 15)}<span><b>${others.length} other${others.length === 1 ? '' : 's'} in ${esc(u.dept)} on leave on overlapping days:</b> ${others.map((x) => `${esc(short(ERP.users.byEmp(x.empId).name))} (${x.type}, ${dateRange(x).replace(/ \d{4}/g, '')}${x.status === LS.APPROVED ? '' : ', pending'})`).join('; ')}</span></div>`
        : `<div class="ld-note ld-note-ok">${icon('users', 15)}<span>No one else in ${esc(F.deptName(u.dept))} is on leave on these days.</span></div>`;
      return `<article class="ld-lcard" data-id="${l.id}">
        <div class="ld-lcard-head">${person(u, `${u.designation}${u.dept ? ' · ' + u.dept : ''} · applied ${F.ago(l.appliedAt)}`, 42)}
          <div class="ld-tags">${typeBadge(l.type)}${soon}</div></div>
        <div class="ld-facts">
          <div><small>Dates</small><b>${dateRange(l)}</b></div>
          <div><small>Days</small><b>${l.halfDay ? '½' : l.days}</b></div>
          <div><small>${esc(l.type)} balance</small><b class="${after != null && after < 0 ? 'neg' : ''}" title="Remaining after approving this request">${bal.quota == null ? 'No cap' : `${bal.remaining} → ${after} / ${bal.quota}`}</b></div>
        </div>
        <p class="ld-quote">${esc(l.reason)}</p>
        ${recNote}${conflict}
        <div class="ld-actions">
          <button class="btn btn-ghost btn-sm" data-act="view">${icon('file', 15)} Details</button><span class="ld-spacer"></span>
          <button class="btn btn-outline-bad btn-sm" data-act="reject">${icon('x', 15)} Reject</button>
          <button class="btn ${isHod ? 'btn-primary' : 'btn-ok'} btn-sm" data-act="approve">${icon('check', 15)} ${isHod ? 'Recommend' : 'Approve'}</button>
        </div></article>`;
    }
    function draw() {
      const xs = list();
      q.innerHTML = xs.length ? xs.map(card).join('')
        : `<div class="card" style="grid-column:1/-1">${empty(ERP.leaves.pendingFor(me).length ? 'No requests match these filters' : 'No pending leave requests. You\'re all caught up!', 'check')}</div>`;
      setCount();
    }
    function remove(cardEl, action) {
      cardEl.style.maxHeight = cardEl.offsetHeight + 'px';
      cardEl.classList.add(action === 'reject' ? 'out-bad' : 'out-ok');
      setCount();
      setTimeout(() => cardEl.classList.add('collapse'), 220);
      setTimeout(() => { cardEl.remove(); if (!q.querySelector('.ld-lcard')) draw(); }, 650);
    }
    q.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const cardEl = b.closest('.ld-lcard'); const l = ERP.leaves.byId(cardEl.dataset.id);
      if (!l) return;
      const done = (action, verb) => {
        const nm = ERP.users.byEmp(l.empId)?.name || '';
        toast(action === 'reject' ? `Rejected ${nm}'s leave` : isHod ? `Recommended — forwarded to Principal` : `Approved ${nm}'s leave`, action === 'reject' ? 'bad' : 'ok');
        remove(cardEl, action); ERP.ui.syncBadges(); if (onAct) onAct(l, action);
      };
      if (b.dataset.act === 'view') {
        leaveModal(l.id, { actions: [
          { label: 'Close', tone: 'ghost' },
          { label: 'Reject', tone: 'danger', onClick: () => { setTimeout(() => actDialog(l, me, 'reject', done), 220); } },
          { label: isHod ? 'Recommend' : 'Approve', tone: isHod ? 'primary' : 'ok', onClick: () => { setTimeout(() => actDialog(l, me, 'approve', done), 220); } },
        ] });
      } else actDialog(l, me, b.dataset.act, done);
    });
    bindFilters(el.querySelector('.ld-queue-head'), st, draw);
    draw();
  }

  // ---------- staff attendance report ----------
  /* opts: key, fixedDept, deptSelectable, compare (dept comparison card w/ click-to-filter), title */
  function attendanceReport(el, { key = 'att', fixedDept = null, deptSelectable = false, compare = false } = {}) {
    const st = keep(key, () => ({ ...presetRange('30'), preset: '30', dept: fixedDept || '' }));
    if (fixedDept) st.dept = fixedDept;
    const showDept = !fixedDept;
    el.innerHTML = `
      <div class="card ld-filterbar">${deptSelectable ? deptSelect(st.dept) : ''}${rangeControls(st)}</div>
      ${compare ? '<div class="card"><div class="card-head"><div><h3>Department comparison</h3><p>Attendance % for the selected period — click a department to see its staff</p></div><button class="btn btn-ghost btn-sm" data-cmp-all hidden>Show all departments</button></div><div data-cmp></div></div>' : ''}
      <div class="cards" data-sum></div>
      <div class="card"><div class="card-head"><div><h3 data-title></h3><p>Click a row to open the day-by-day calendar</p></div></div><div data-tbl class="ld-clickable"></div></div>`;
    const staffList = () => (st.dept ? ERP.users.byDept(st.dept) : ERP.users.staff()).filter(isStaff);
    const columns = [
      { key: 'name', label: 'Staff', render: (r) => `<span data-drill="${r.u.empId}">${person(r.u, `${r.u.empId} · ${r.u.designation}`, 32)}</span>`, sort: (r) => r.u.name },
      ...(showDept ? [{ key: 'dept', label: 'Dept', render: (r) => `<span class="badge badge-muted" title="${esc(F.deptName(r.u.dept))}">${esc(r.u.dept || 'Admin')}</span>`, sort: (r) => r.u.dept || '' }] : []),
      ...['P', 'A', 'L', 'HD', 'OD'].map((k) => ({ key: k, label: k, align: 'right', render: (r) => num(r.s[k]), sort: (r) => r.s[k] })),
      { key: 'pct', label: 'Attendance', render: (r) => pctCell(r.s.percent, r.s.total), sort: (r) => (r.s.total ? r.s.percent : -1) },
    ];
    const rowsNow = () => staffSummary(staffList(), st.from, st.to).sort((a, b) => a.s.percent - b.s.percent);
    let current = rowsNow();
    const tbl = ERP.ui.table(el.querySelector('[data-tbl]'), {
      columns, rows: current, pageSize: 12, emptyText: 'No staff in this selection',
      search: (r) => `${r.u.name} ${r.u.empId} ${r.u.designation} ${r.u.dept || ''}`,
      toolbar: `<button class="btn btn-ghost btn-sm" data-exp="sum">${icon('excel', 16)} Export summary</button><button class="btn btn-ghost btn-sm" data-exp="raw">${icon('download', 16)} Daily records</button>`,
    });
    el.querySelector('[data-tbl]').addEventListener('click', (e) => {
      if (e.target.closest('button, input, a')) return;
      const tr = e.target.closest('tbody tr'); const d = tr && tr.querySelector('[data-drill]');
      if (d) personModal(d.dataset.drill, st);
    });
    el.querySelectorAll('[data-exp]').forEach((b) => b.onclick = () => {
      const tag = fileStamp(`${st.dept || 'ALL'}_${st.from}_to_${st.to}`);
      if (b.dataset.exp === 'sum') {
        if (!current.length) return toast('Nothing to export', 'bad');
        ERP.ui.downloadXlsx(`attendance_summary_${tag}.xlsx`, ['Employee ID', 'Name', 'Department', 'Designation', 'Present', 'Absent', 'Leave', 'Half Day', 'On Duty', 'Days Recorded', 'Attendance %'],
          current.map((r) => [r.u.empId, r.u.name, r.u.dept ? F.deptName(r.u.dept) : '', r.u.designation, r.s.P, r.s.A, r.s.L, r.s.HD, r.s.OD, r.s.total, r.s.percent]), 'Summary');
      } else {
        const rows = current.flatMap((r) => ERP.attendance.forEmp(r.u.empId, st.from, st.to).map((a) => [r.u.empId, r.u.name, r.u.dept ? F.deptName(r.u.dept) : '', a.date, a.status, a.inTime, a.outTime]));
        if (!rows.length) return toast('No records in this range', 'bad');
        rows.sort((a, b) => a[3].localeCompare(b[3]) || a[0].localeCompare(b[0]));
        ERP.ui.downloadXlsx(`attendance_records_${tag}.xlsx`, ERP.attendance.TEMPLATE_HEADERS, rows, 'Attendance');
      }
      toast('Excel file downloaded');
    });
    const cmpAll = el.querySelector('[data-cmp-all]');
    if (cmpAll) cmpAll.onclick = () => { st.dept = ''; const s = el.querySelector('select[data-f="dept"]'); if (s) s.value = ''; draw(); };
    function draw() {
      current = rowsNow();
      tbl.setRows(current);
      const sel = staffList();
      const all = ERP.attendance.summarize(sel.flatMap((u) => ERP.attendance.forEmp(u.empId, st.from, st.to)));
      const low = current.filter((r) => r.s.total && r.s.percent < 75).length;
      el.querySelector('[data-title]').textContent = `${st.dept ? F.deptName(st.dept) : 'All staff'} · ${F.date(st.from)} – ${F.date(st.to)}`;
      el.querySelector('[data-sum]').innerHTML =
        stat('Attendance', all.total ? `${all.percent}%` : '—', { iconName: 'chart', tone: all.total ? pctTone(all.percent) : 'info', sub: `${all.total} day-records` }) +
        stat('Present', all.P, { iconName: 'check', tone: 'ok', sub: `${all.OD} on duty · ${all.HD} half days` }) +
        stat('Absent', all.A, { iconName: 'x', tone: 'bad', sub: `${all.L} leave days` }) +
        stat('Below 75%', low, { iconName: 'alert', tone: low ? 'warn' : 'ok', sub: `of ${sel.length} staff` });
      if (compare) {
        const ds = deptStats(st.from, st.to);
        clickableBars(el.querySelector('[data-cmp]'), ds.map((d) => ({ key: d.code, label: d.name, value: d.s.percent, tone: pctTone(d.s.percent) })), (it) => {
          st.dept = st.dept === it.key ? '' : it.key; const s = el.querySelector('select[data-f="dept"]'); if (s) s.value = st.dept; draw();
          if (st.dept) el.querySelector('[data-tbl]').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, { active: st.dept });
        cmpAll.hidden = !st.dept;
      }
    }
    bindFilters(el.querySelector('.ld-filterbar'), st, draw);
    draw();
  }

  // ---------- leave table (history / all leaves, read-only) ----------
  /* opts: key, source() -> leaves, showDept, deptFilter, exportName */
  function leaveTable(el, { key = 'leaves', source, showDept = true, deptFilter = true, exportName = 'leaves' }) {
    const st = keep(key, () => ({ status: 'all', type: '', dept: '', period: '' }));
    const TABS = [['all', 'All'], ['pending', 'Pending'], [LS.APPROVED, 'Approved'], [LS.REJECTED, 'Rejected'], [LS.CANCELLED, 'Cancelled']];
    const yr = new Date().getFullYear();
    el.innerHTML = `
      <div class="card ld-filterbar">
        <div class="tabs ld-tabs" data-tabs>${TABS.map(([k, l]) => `<button data-tab="${esc(k)}" class="${st.status === k ? 'active' : ''}">${l}<em data-n="${esc(k)}"></em></button>`).join('')}</div>
        <span class="ld-spacer"></span>
        ${deptFilter ? deptSelect(st.dept) : ''}
        <label class="ld-in"><span>Type</span><select data-f="type"><option value="">All types</option>${ERP.LEAVE_TYPES.map((t) => `<option value="${t.code}" ${st.type === t.code ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
        <label class="ld-in"><span>Period</span><select data-f="period">
          <option value="">Any time</option><option value="upcoming" ${st.period === 'upcoming' ? 'selected' : ''}>Upcoming / ongoing</option>
          <option value="30" ${st.period === '30' ? 'selected' : ''}>Last 30 days</option><option value="year" ${st.period === 'year' ? 'selected' : ''}>This year (${yr})</option></select></label>
      </div>
      <div class="card"><div data-tbl class="ld-clickable"></div></div>`;
    const inPeriod = (l) => {
      if (!st.period) return true;
      if (st.period === 'upcoming') return l.to >= U.today();
      if (st.period === 'year') return l.from.startsWith(String(yr)) || l.to.startsWith(String(yr));
      return l.to >= addDays(U.today(), -30) && l.from <= U.today();
    };
    const statusOk = (l, s) => s === 'all' || (s === 'pending' ? PENDING.includes(l.status) : l.status === s);
    const base = () => source().filter((l) => (!st.type || l.type === st.type) && (!st.dept || ERP.users.byEmp(l.empId)?.dept === st.dept) && inPeriod(l));
    const columns = [
      { key: 'who', label: 'Applicant', render: (r) => person(r.u, r.u.designation, 30), sort: (r) => r.u.name },
      ...(showDept ? [{ key: 'dept', label: 'Dept', render: (r) => `<span class="badge badge-muted">${esc(r.u.dept || '—')}</span>`, sort: (r) => r.u.dept || '' }] : []),
      { key: 'type', label: 'Type', render: (r) => typeBadge(r.l.type), sort: (r) => r.l.type },
      { key: 'dates', label: 'Dates', render: (r) => dateRange(r.l), sort: (r) => r.l.from },
      { key: 'days', label: 'Days', align: 'right', render: (r) => (r.l.halfDay ? '½' : r.l.days), sort: (r) => r.l.days },
      { key: 'applied', label: 'Applied', render: (r) => `<span class="muted small">${F.date(r.l.appliedAt)}</span>`, sort: (r) => r.l.appliedAt },
      { key: 'status', label: 'Status', render: (r) => `<span data-leave="${r.l.id}">${leaveBadge(r.l.status)}</span>`, sort: (r) => r.l.status },
    ];
    const toRows = () => base().filter((l) => statusOk(l, st.status)).sort((a, b) => b.appliedAt.localeCompare(a.appliedAt))
      .map((l) => ({ l, u: ERP.users.byEmp(l.empId) || { name: l.empId, designation: '', dept: null } }));
    let current = toRows();
    const tbl = ERP.ui.table(el.querySelector('[data-tbl]'), {
      columns, rows: current, pageSize: 10, emptyText: 'No leave requests match these filters',
      search: (r) => `${r.u.name} ${r.l.empId} ${r.l.reason} ${F.leaveName(r.l.type)}`,
      toolbar: `<button class="btn btn-ghost btn-sm" data-exp>${icon('excel', 16)} Export</button>`,
    });
    el.querySelector('[data-tbl]').addEventListener('click', (e) => {
      if (e.target.closest('button, input')) return;
      const tr = e.target.closest('tbody tr'); const d = tr && tr.querySelector('[data-leave]');
      if (d) leaveModal(d.dataset.leave);
    });
    el.querySelector('[data-exp]').onclick = () => {
      if (!current.length) return toast('Nothing to export', 'bad');
      ERP.ui.downloadXlsx(`${fileStamp(exportName)}_${U.today()}.xlsx`, ['Employee ID', 'Name', 'Department', 'Type', 'From', 'To', 'Days', 'Reason', 'Status', 'Applied On', 'Last Action', 'Last Remark'],
        current.map(({ l, u }) => { const h = l.history[l.history.length - 1]; return [l.empId, u.name, u.dept ? F.deptName(u.dept) : '', F.leaveName(l.type), l.from, l.to, l.days, l.reason, l.status, l.appliedAt.slice(0, 10), h ? `${h.action} (${h.role})` : '', h ? h.remark : '']; }), 'Leaves');
      toast('Excel file downloaded');
    };
    function draw() {
      const b = base();
      el.querySelectorAll('[data-n]').forEach((n) => { n.textContent = b.filter((l) => statusOk(l, n.dataset.n)).length; });
      current = toRows(); tbl.setRows(current);
    }
    el.querySelectorAll('[data-tab]').forEach((t) => t.onclick = () => {
      st.status = t.dataset.tab; el.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('active', x === t)); draw();
    });
    bindFilters(el.querySelector('.ld-filterbar'), st, draw);
    draw();
  }

  // ---------- my leave (HOD / Dean / Principal apply for themselves) ----------
  function myLeave(el, me) {
    const goesTo = me.role === 'principal' ? 'Your request will be recorded for the Principal\'s office.' : 'Your request goes directly to the Principal for approval (no HOD stage).';
    const bal = ERP.leaves.balance(me.empId);
    const mine = ERP.leaves.forEmp(me.empId);
    const t = U.today();
    el.innerHTML = `
      <div class="ld-bal-grid">${bal.map((b) => `<div class="ld-bal" data-type="${b.code}" title="Apply for ${esc(b.name)}">
        <div class="ld-bal-top"><span class="ld-bal-name">${esc(b.name)}</span>${typeBadge(b.code)}</div>
        <div class="ld-bal-val">${b.quota == null ? `${b.used}<small> used</small>` : `${b.remaining}<small> / ${b.quota} left</small>`}</div>
        ${b.quota == null ? '<div class="meter"><div style="width:0"></div></div>' : meter(b.quota ? (b.remaining / b.quota) * 100 : 0, b.remaining / b.quota > 0.5 ? 'ok' : b.remaining / b.quota > 0.2 ? 'warn' : 'bad')}
        <div class="ld-bal-foot">${b.used} used${b.pending ? ` · ${b.pending} pending` : ''}</div></div>`).join('')}</div>
      <div class="cols">
        <div class="card">
          <div class="card-head"><div><h3>My leave history</h3><p>${mine.length} request${mine.length === 1 ? '' : 's'} · click a row for the approval trail</p></div></div>
          <div data-hist class="ld-clickable"></div>
        </div>
        <form class="card" data-form novalidate>
          <div class="card-head"><div><h3>Apply for leave</h3><p>${esc(goesTo)}</p></div></div>
          <label class="field"><span>Leave type</span><select name="type">${bal.map((b) => `<option value="${b.code}">${esc(b.name)}${b.quota == null ? '' : ` — ${b.remaining - b.pending} available`}</option>`).join('')}</select></label>
          <div class="grid-2">
            <label class="field"><span>From</span><input type="date" name="from" value="${t}" min="${t}"></label>
            <label class="field"><span>To</span><input type="date" name="to" value="${t}" min="${t}"></label>
          </div>
          <label class="ld-check"><input type="checkbox" name="halfDay"> Half day (single date)</label>
          <label class="field"><span>Reason</span><textarea name="reason" rows="3" placeholder="Brief reason for the leave"></textarea></label>
          <div class="ld-preview"><span class="muted small" data-preview></span></div>
          <button class="btn btn-primary btn-block" type="submit">${icon('leave', 16)} Submit request</button>
        </form>
      </div>`;
    const f = el.querySelector('[data-form]');
    const preview = () => {
      const { from, to } = f; const half = f.halfDay.checked;
      if (half) { to.value = from.value; to.disabled = true; } else to.disabled = false;
      const p = el.querySelector('[data-preview]');
      if (!from.value || !to.value || to.value < from.value) { p.innerHTML = '<span style="color:var(--bad)">Choose a valid date range</span>'; return; }
      const n = half ? 0.5 : U.workingDays(from.value, to.value).length;
      const b = bal.find((x) => x.code === f.type.value);
      const avail = b.quota == null ? null : b.remaining - b.pending;
      p.innerHTML = `<b>${n}</b> working day${n === 1 ? '' : 's'} (Sundays excluded)${avail != null ? ` · ${avail} ${esc(b.code)} available${n > avail ? ' — <span style="color:var(--bad)">insufficient balance</span>' : ''}` : ''}`;
      el.querySelectorAll('.ld-bal').forEach((x) => x.classList.toggle('sel', x.dataset.type === f.type.value));
    };
    ['change', 'input'].forEach((ev) => f.addEventListener(ev, (e) => { if (e.target.name === 'from' && f.to.value < f.from.value) f.to.value = f.from.value; if (e.target.name === 'from') f.to.min = f.from.value; preview(); }));
    el.querySelectorAll('.ld-bal').forEach((b) => b.onclick = () => { f.type.value = b.dataset.type; preview(); f.reason.focus(); });
    preview();
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        const l = ERP.leaves.apply({ empId: me.empId, type: f.type.value, from: f.from.value, to: f.halfDay.checked ? f.from.value : f.to.value, reason: f.reason.value, halfDay: f.halfDay.checked });
        toast(`${l.type} leave request submitted (${daysLabel(l.days)})`);
        ERP.ui.refresh();
      } catch (err) { toast(err.message, 'bad'); }
    });
    const hist = ERP.ui.table(el.querySelector('[data-hist]'), {
      rows: mine, pageSize: 8, emptyText: 'You have not applied for any leave yet',
      columns: [
        { key: 'type', label: 'Type', render: (l) => `<span data-leave="${l.id}">${typeBadge(l.type)}</span>` },
        { key: 'from', label: 'Dates', render: (l) => dateRange(l) },
        { key: 'days', label: 'Days', align: 'right', render: (l) => (l.halfDay ? '½' : l.days) },
        { key: 'status', label: 'Status', render: (l) => leaveBadge(l.status) },
        { key: 'x', label: '', noSort: true, align: 'right', render: (l) => (PENDING.includes(l.status) ? `<button class="btn btn-ghost btn-sm" data-cancel="${l.id}">Cancel</button>` : '') },
      ],
    });
    void hist;
    el.querySelector('[data-hist]').addEventListener('click', async (e) => {
      const c = e.target.closest('[data-cancel]');
      if (c) {
        if (await ERP.ui.confirm('Cancel this request?', 'The pending leave request will be withdrawn. This cannot be undone.', { okLabel: 'Withdraw request', tone: 'danger' })) {
          try { ERP.leaves.cancel(c.dataset.cancel, me.empId); toast('Leave request cancelled'); ERP.ui.refresh(); } catch (err) { toast(err.message, 'bad'); }
        }
        return;
      }
      const tr = e.target.closest('tbody tr'); const d = tr && tr.querySelector('[data-leave]');
      if (d) leaveModal(d.dataset.leave);
    });
  }

  // ---------- announcements ----------
  function announcements(el, me, { canPost = false } = {}) {
    const list = ERP.announcements.all();
    el.innerHTML = `
      <div class="card ld-queue-head"><div><h3>Announcements</h3><p>${list.length} notice${list.length === 1 ? '' : 's'} for all staff</p></div>
        ${canPost ? `<button class="btn btn-primary" data-new>${icon('plus', 16)} New announcement</button>` : ''}</div>
      <div class="ld-ann-list">${list.length ? list.map((a) => {
        const by = ERP.users.byEmp(a.by) || { name: 'Unknown', designation: '' };
        const fresh = Date.now() - new Date(a.at).getTime() < 172800000;
        return `<article class="card ld-ann" data-id="${a.id}">${avatar(by.name, 40)}
          <div class="ld-ann-body"><h3>${esc(a.title)}${fresh ? '<span class="badge badge-accent">New</span>' : ''}</h3><p>${esc(a.body)}</p>
          <div class="ld-ann-meta"><b>${esc(by.name)}</b> · ${esc(by.designation)} · <span title="${F.dateTime(a.at)}">${F.ago(a.at)}</span></div></div>
          ${a.by === me.empId ? `<button class="icon-btn" data-del="${a.id}" title="Delete announcement" aria-label="Delete">${icon('trash', 16)}</button>` : ''}</article>`;
      }).join('') : `<div class="card">${empty('No announcements yet', 'megaphone')}</div>`}</div>`;
    el.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      if (!(await ERP.ui.confirm('Delete announcement?', 'It will be removed for all staff.', { okLabel: 'Delete', tone: 'danger' }))) return;
      ERP.announcements.remove(b.dataset.del);
      const card = b.closest('.ld-ann'); card.classList.add('out');
      toast('Announcement deleted');
      setTimeout(() => ERP.ui.refresh(), 300);
    });
    const nb = el.querySelector('[data-new]');
    if (nb) nb.onclick = () => modal({
      title: 'New announcement',
      body: `<label class="field"><span>Title</span><input data-t maxlength="90" placeholder="e.g. Faculty meeting on Friday"></label>
        <label class="field"><span>Message</span><textarea data-b rows="5" placeholder="Details for all staff"></textarea></label>
        <p class="muted small" style="margin:0">Visible to every staff member on their dashboard.</p>`,
      actions: [{ label: 'Cancel', tone: 'ghost' }, { label: 'Post', tone: 'primary', onClick: (close, root) => {
        const title = root.querySelector('[data-t]').value.trim(), body = root.querySelector('[data-b]').value.trim();
        if (title.length < 3) { toast('Title is too short', 'bad'); return false; }
        if (body.length < 5) { toast('Please write a message', 'bad'); return false; }
        ERP.announcements.add(title, body, me.empId); toast('Announcement posted'); ERP.ui.refresh(); return true;
      } }],
    });
  }

  // ---------- staff directory (read-only) ----------
  function directory(el, { key = 'dir' } = {}) {
    const st = keep(key, () => ({ dept: '', role: '' }));
    el.innerHTML = `
      <div class="card ld-filterbar">${deptSelect(st.dept)}
        <label class="ld-in"><span>Role</span><select data-f="role"><option value="">All roles</option>${STAFF_ROLES.map((r) => `<option value="${r}" ${st.role === r ? 'selected' : ''}>${esc(ERP.ui.ROLE_LABEL[r])}</option>`).join('')}</select></label>
        <span class="ld-spacer"></span><span class="ld-count" data-count></span></div>
      <div class="card"><div data-tbl class="ld-clickable"></div></div>`;
    const rows = () => ERP.users.staff().filter((u) => (!st.dept || u.dept === st.dept) && (!st.role || u.role === st.role)).sort((a, b) => (a.dept || '').localeCompare(b.dept || '') || a.name.localeCompare(b.name));
    const tbl = ERP.ui.table(el.querySelector('[data-tbl]'), {
      rows: rows(), pageSize: 12, emptyText: 'No staff match these filters',
      search: (u) => `${u.name} ${u.empId} ${u.designation} ${u.email} ${u.phone} ${u.dept || ''}`,
      toolbar: `<button class="btn btn-ghost btn-sm" data-exp>${icon('excel', 16)} Export</button>`,
      columns: [
        { key: 'name', label: 'Name', render: (u) => `<span data-u="${u.empId}">${person(u, u.empId, 32)}</span>` },
        { key: 'designation', label: 'Designation' },
        { key: 'dept', label: 'Department', render: (u) => esc(u.dept ? F.deptName(u.dept) : 'Administration') },
        { key: 'email', label: 'Email', render: (u) => `<a href="mailto:${esc(u.email)}">${esc(u.email)}</a>` },
        { key: 'phone', label: 'Phone', render: (u) => `<span class="muted">${esc(u.phone || '—')}</span>` },
      ],
    });
    const draw = () => { const r = rows(); tbl.setRows(r); el.querySelector('[data-count]').textContent = `${r.length} staff`; };
    el.querySelector('[data-exp]').onclick = () => {
      const r = rows();
      ERP.ui.downloadXlsx(`staff_directory_${U.today()}.xlsx`, ['Employee ID', 'Name', 'Role', 'Designation', 'Department', 'Email', 'Phone', 'Joined'],
        r.map((u) => [u.empId, u.name, ERP.ui.ROLE_LABEL[u.role], u.designation, u.dept ? F.deptName(u.dept) : '', u.email, u.phone, u.joinDate]), 'Staff');
      toast('Excel file downloaded');
    };
    el.querySelector('[data-tbl]').addEventListener('click', (e) => {
      if (e.target.closest('a, button, input')) return;
      const tr = e.target.closest('tbody tr'); const d = tr && tr.querySelector('[data-u]');
      if (d) profileModal(d.dataset.u);
    });
    bindFilters(el.querySelector('.ld-filterbar'), st, draw);
    draw();
  }
  function profileModal(empId) {
    const u = ERP.users.byEmp(empId); if (!u) return;
    const r = presetRange('30'); const s = ERP.attendance.summaryFor(empId, r.from, r.to);
    const bal = ERP.leaves.balance(empId).filter((b) => b.quota != null);
    modal({
      title: 'Staff profile',
      body: `<div class="ld-modal-top">${person(u, `${u.designation} · ${ERP.ui.ROLE_LABEL[u.role]}`, 48)}<span class="role-pill role-${u.role}">${esc(u.empId)}</span></div>
        <div class="ld-kv">
          <div><small>Department</small><b>${esc(u.dept ? F.deptName(u.dept) : 'Administration')}</b></div>
          <div><small>Joined</small><b>${F.date(u.joinDate)}</b></div>
          <div><small>Email</small><b><a href="mailto:${esc(u.email)}">${esc(u.email)}</a></b></div>
          <div><small>Phone</small><b>${esc(u.phone || '—')}</b></div>
        </div>
        <div class="ld-sub">Attendance · last 30 days</div>
        ${s.total ? `<div class="ld-pct">${meter(s.percent)}<b>${s.percent}%</b></div><div class="ld-chips" style="margin-top:10px">${['P', 'A', 'L', 'HD', 'OD'].map((k) => `<span>${statusBadge(k)} ${s[k]}</span>`).join('')}</div>` : '<p class="muted">No records.</p>'}
        <div class="ld-sub">Leave balance</div>
        <div class="ld-chips">${bal.map((b) => `<span>${typeBadge(b.code)} ${b.remaining}/${b.quota}</span>`).join('')}</div>`,
      actions: [{ label: 'Close', tone: 'ghost' }, { label: 'Attendance calendar', tone: 'primary', onClick: () => { setTimeout(() => personModal(empId, r), 220); } }],
    });
  }

  // ---------- compact list renderers for dashboards ----------
  const lowList = (rows, emptyMsg = 'Everyone is at or above 75% attendance') => (rows.length
    ? `<div class="ld-list">${rows.map((r) => `<button class="ld-item" data-drill="${r.u.empId}">${person(r.u, `${r.u.designation}${r.u.dept ? ' · ' + r.u.dept : ''}`, 32)}<div class="ld-item-end"><span class="badge badge-${pctTone(r.s.percent)}">${r.s.percent}%</span><small class="muted">${r.s.A} absent</small></div></button>`).join('')}</div>`
    : empty(emptyMsg, 'check'));
  const leaveList = (ls, emptyMsg = 'Nobody') => (ls.length
    ? `<div class="ld-list">${ls.map((l) => { const u = ERP.users.byEmp(l.empId); return `<button class="ld-item" data-leave="${l.id}">${person(u, `${dateRange(l)} · ${daysLabel(l.days)}`, 32)}<div class="ld-item-end">${typeBadge(l.type)}${PENDING.includes(l.status) ? leaveBadge(l.status) : ''}</div></button>`; }).join('')}</div>`
    : empty(emptyMsg, 'users'));
  // Delegate clicks for [data-leave] items inside root.
  function bindLeaveClicks(root) {
    root.addEventListener('click', (e) => { const t = e.target.closest('button[data-leave], .ld-item[data-leave]'); if (t && root.contains(t)) leaveModal(t.dataset.leave); });
  }

  window.Leaders = {
    // helpers
    addDays, pctTone, short, isStaff, presetRange, setFilter, typeBadge, dateRange, person, greeting, TYPE_TONE, LIVE, PENDING,
    staffSummary, lowAttendance, onLeaveOn, deptStats, weeklyTrend,
    // renderers
    trendChart, statusDonut, leaveTypeDonut, clickableBars, lowList, leaveList, bindDrill, bindLeaveClicks,
    personModal, leaveModal, profileModal,
    approvalQueue, attendanceReport, leaveTable, myLeave, announcements, directory,
  };
})();
