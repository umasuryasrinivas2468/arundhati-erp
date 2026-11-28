/* Arundhati ERP — shared UI shell & helpers. Load after data.js.
 *
 * Page usage:
 *   const me = ERP.auth.require(['faculty']);
 *   ERP.ui.shell({
 *     user: me,
 *     sections: [{ id: 'dashboard', label: 'Dashboard', icon: 'home', render: (el) => {...} }, ...],
 *   });
 * Each section's render(el) receives an empty container and fills it. Sections are
 * switched via location.hash (#dashboard) and re-rendered on every visit, so render
 * functions should read fresh data from ERP each time. Call ERP.ui.refresh() after a
 * data change to re-render the current section and the notification badge.
 */
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Minimal stroke icon set (24px viewBox, currentColor).
  const ICONS = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    upload: '<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 20h16"/>',
    download: '<path d="M12 4v12"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    leave: '<path d="M4 20c8 0 16-6 16-16C10 4 4 10 4 20z"/><path d="M4 20l8-8"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14.8c1.8.8 3 2.6 3.5 5.2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    check: '<path d="M5 12l5 5L20 7"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    bell: '<path d="M6 16V11a6 6 0 1112 0v5l2 2H4z"/><path d="M10 20a2 2 0 004 0"/>',
    logout: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h11"/>',
    file: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/>',
    excel: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/><path d="M9 11l4 6M13 11l-4 6"/>',
    megaphone: '<path d="M3 10v4h4l8 4V6l-8 4z"/><path d="M18 9a4 4 0 010 6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    swap: '<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    building: '<path d="M4 21V5l8-2v18M12 21V9l8 2v10M2 21h20"/><path d="M7 8h2M7 12h2M7 16h2M15 14h2M15 18h2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
    cross: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
    cap: '<path d="M22 9L12 4 2 9l10 5 10-5z"/><path d="M6 11.5V16c0 1.3 2.7 3 6 3s6-1.7 6-3v-4.5"/><path d="M22 9v5"/>',
    wallet: '<path d="M3 7a2 2 0 012-2h12a2 2 0 012 2v1"/><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2v-6a2 2 0 00-2-2H5a2 2 0 01-2-2z"/><circle cx="17" cy="14" r="1.3"/>',
    rupee: '<path d="M7 5h10M7 9h10M16.5 5c0 4-3 6-7 6h-1l6 8"/>',
    rocket: '<path d="M5 15c-1.5 1.3-2 5-2 5s3.7-.5 5-2a3 3 0 00-3-3z"/><path d="M14.5 4.5C17 2 21 2 21 2s0 4-2.5 6.5L13 14l-3-3 4.5-6.5z"/><path d="M9 11l-4 1 3-3M13 15l-1 4 3-3"/><circle cx="15" cy="8" r="1.2"/>',
    bed: '<path d="M3 18V7M3 13h15a3 3 0 013 3v2M21 18v-2M3 18v2M3 11V9a2 2 0 012-2h5a2 2 0 012 2v4"/><circle cx="7.5" cy="10.5" r="1.4"/>',
    bus: '<rect x="4" y="4" width="16" height="13" rx="2"/><path d="M4 11h16M8 4v7M16 4v7"/><path d="M7 17v2M17 17v2"/><circle cx="8" cy="14" r="1"/><circle cx="16" cy="14" r="1"/>',
    pin: '<path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z"/><path d="M14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"/>',
    id: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M5.5 16.5c.6-1.6 2-2.4 3.5-2.4s2.9.8 3.5 2.4"/><path d="M15 9.5h4M15 13h4"/>',
  };
  const icon = (name, size = 18) => `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  const PORTAL_LABEL = { admin: 'Admin Portal', principal: 'Principal Portal', dean: 'Dean Portal', hod: 'HOD Portal', faculty: 'Faculty Portal', student: 'Student Portal' };
  const ROLE_LABEL = { admin: 'Administrator', principal: 'Principal', dean: 'Dean', hod: 'Head of Department', faculty: 'Faculty / Staff', student: 'Student' };

  // ---------- theme ----------
  const THEME_KEY = 'arundhati-theme';
  function applyTheme(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem(THEME_KEY, t); } catch (e) {} }
  try {
    const t = localStorage.getItem(THEME_KEY) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = t;
  } catch (e) {}

  // ---------- toast ----------
  function toast(msg, tone = 'ok') {
    let host = $('#toasts');
    if (!host) { host = document.createElement('div'); host.id = 'toasts'; document.body.appendChild(host); }
    const t = document.createElement('div');
    t.className = `toast toast-${tone}`;
    t.innerHTML = `${icon(tone === 'bad' ? 'alert' : 'check', 16)}<span>${esc(msg)}</span>`;
    host.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3200);
  }

  // ---------- modal ----------
  /* modal({ title, body (html string or Node), actions: [{label, tone:'primary'|'danger'|'ghost', onClick(close, root) -> false to keep open}], wide })
   * Returns { root, close }. */
  function modal({ title, body, actions = [{ label: 'Close', tone: 'ghost' }], wide = false }) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-x aria-label="Close">${icon('x')}</button></div>
      <div class="modal-body"></div><div class="modal-foot"></div></div>`;
    const bodyEl = $('.modal-body', back);
    if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
    const close = () => { back.classList.remove('show'); setTimeout(() => back.remove(), 200); document.removeEventListener('keydown', onKey); };
    // Only the top-most modal reacts to Escape (a confirm can sit on top of a detail modal).
    const onKey = (e) => { if (e.key === 'Escape' && Array.from(document.querySelectorAll('.modal-back')).pop() === back) close(); };
    actions.forEach((a) => {
      const b = document.createElement('button');
      b.className = `btn btn-${a.tone || 'ghost'}`; b.textContent = a.label;
      b.onclick = () => { if (!a.onClick || a.onClick(close, back) !== false) close(); };
      $('.modal-foot', back).appendChild(b);
    });
    $('[data-x]', back).onclick = close;
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(back);
    requestAnimationFrame(() => back.classList.add('show'));
    setTimeout(() => $('input,textarea,select', bodyEl)?.focus(), 50);
    return { root: back, close };
  }
  function confirmBox(title, message, { okLabel = 'Confirm', tone = 'primary', withRemark = false } = {}) {
    return new Promise((resolve) => {
      let done = false;
      const body = `<p class="muted">${esc(message)}</p>${withRemark ? '<label class="field"><span>Remark (optional)</span><textarea rows="3" id="cf-remark" placeholder="Add a note for the applicant"></textarea></label>' : ''}`;
      const m = modal({
        title, body,
        actions: [
          { label: 'Cancel', tone: 'ghost' },
          { label: okLabel, tone, onClick: (close, root) => { done = true; resolve(withRemark ? { remark: $('#cf-remark', root).value.trim() } : true); } },
        ],
      });
      const obs = new MutationObserver(() => { if (!document.body.contains(m.root)) { obs.disconnect(); if (!done) resolve(null); } });
      obs.observe(document.body, { childList: true });
    });
  }

  // ---------- small render helpers ----------
  const avatar = (name, size = 36) => {
    let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
    return `<span class="avatar" style="--av:${h};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px">${esc(ERP.fmt.initials(name))}</span>`;
  };
  const statusBadge = (code) => { const s = ERP.STATUS[code]; return s ? `<span class="badge badge-${s.tone}" title="${s.label}">${code}</span>` : esc(code); };
  const leaveBadge = (state) => {
    const tone = { 'Pending HOD': 'warn', 'Pending Principal': 'info', Approved: 'ok', Rejected: 'bad', Cancelled: 'muted' }[state] || 'muted';
    return `<span class="badge badge-${tone}">${esc(state)}</span>`;
  };
  // Stat card. tone: ok|bad|warn|info|accent
  const stat = (label, value, { sub = '', iconName = 'chart', tone = 'accent' } = {}) =>
    `<div class="stat stat-${tone}"><div class="stat-icon">${icon(iconName, 20)}</div><div><div class="stat-label">${esc(label)}</div><div class="stat-value">${value}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</div></div>`;
  const empty = (msg, iconName = 'file') => `<div class="empty">${icon(iconName, 32)}<p>${esc(msg)}</p></div>`;
  // Horizontal progress meter (0–100).
  const meter = (pct, tone) => {
    const t = tone || (pct >= 85 ? 'ok' : pct >= 75 ? 'warn' : 'bad');
    return `<div class="meter meter-${t}"><div style="width:${Math.max(0, Math.min(100, pct))}%"></div></div>`;
  };

  /* Sortable, searchable, paginated table.
   * table(container, { columns: [{key, label, render?(row), sort?(row)->value, align?}], rows, pageSize=10, search: fn(row)->string | null, emptyText })
   * Returns { setRows(rows) }. */
  function table(container, { columns, rows, pageSize = 10, search = null, emptyText = 'Nothing to show', toolbar = '' }) {
    let data = rows, q = '', sortKey = null, sortDir = 1, page = 0;
    container.innerHTML = `<div class="table-wrap">${search || toolbar ? `<div class="table-tools">${search ? `<label class="search">${icon('search', 16)}<input type="search" placeholder="Search…"></label>` : '<span></span>'}<div class="table-extra">${toolbar}</div></div>` : ''}
      <div class="table-scroll"><table><thead><tr>${columns.map((c, i) => `<th data-i="${i}" class="${c.align === 'right' ? 'r' : ''} ${c.noSort ? '' : 'sortable'}">${esc(c.label)}<span class="sort-ind"></span></th>`).join('')}</tr></thead><tbody></tbody></table></div>
      <div class="table-foot"><span class="muted small"></span><div class="pager"><button class="btn btn-ghost btn-sm" data-p="-1">Prev</button><button class="btn btn-ghost btn-sm" data-p="1">Next</button></div></div></div>`;
    const tbody = $('tbody', container), foot = $('.table-foot .muted', container);
    function draw() {
      let view = q && search ? data.filter((r) => search(r).toLowerCase().includes(q)) : data.slice();
      if (sortKey != null) {
        const c = columns[sortKey]; const val = c.sort || ((r) => r[c.key]);
        view.sort((a, b) => { const x = val(a), y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * sortDir; });
      }
      const pages = Math.max(1, Math.ceil(view.length / pageSize)); page = Math.min(page, pages - 1);
      const slice = view.slice(page * pageSize, page * pageSize + pageSize);
      tbody.innerHTML = slice.length ? slice.map((r) => `<tr>${columns.map((c) => `<td class="${c.align === 'right' ? 'r' : ''}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="${columns.length}">${empty(emptyText)}</td></tr>`;
      foot.textContent = view.length ? `Showing ${page * pageSize + 1}–${page * pageSize + slice.length} of ${view.length}` : '';
      $$('[data-p]', container).forEach((b) => { const d = +b.dataset.p; b.disabled = (d < 0 && page === 0) || (d > 0 && page >= pages - 1); });
      $('.pager', container).style.display = pages > 1 ? '' : 'none';
      $$('th', container).forEach((th) => { th.querySelector('.sort-ind').textContent = +th.dataset.i === sortKey ? (sortDir > 0 ? ' ▲' : ' ▼') : ''; });
    }
    $('input[type=search]', container)?.addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); page = 0; draw(); });
    $$('th.sortable', container).forEach((th) => th.addEventListener('click', () => { const i = +th.dataset.i; sortDir = sortKey === i ? -sortDir : 1; sortKey = i; draw(); }));
    $$('[data-p]', container).forEach((b) => b.addEventListener('click', () => { page += +b.dataset.p; draw(); }));
    draw();
    return { setRows(r) { data = r; draw(); } };
  }

  /* Simple SVG bar chart: bars(container, [{label, value, tone?}], {max=100, suffix='%'}) */
  function bars(container, items, { max = null, suffix = '' } = {}) {
    const m = max ?? Math.max(1, ...items.map((i) => i.value));
    container.innerHTML = `<div class="bars">${items.map((i) => `<div class="bar-row"><span class="bar-label">${esc(i.label)}</span><div class="bar-track"><div class="bar-fill bar-${i.tone || 'accent'}" style="width:0" data-w="${(i.value / m) * 100}"></div></div><span class="bar-val">${i.value}${suffix}</span></div>`).join('')}</div>`;
    requestAnimationFrame(() => $$('.bar-fill', container).forEach((b) => { b.style.width = b.dataset.w + '%'; }));
  }

  /* Donut: donut(container, [{label, value, tone}], centerLabel) */
  function donut(container, parts, center = '') {
    const total = parts.reduce((s, p) => s + p.value, 0) || 1;
    let acc = 0; const R = 54, C = 2 * Math.PI * R;
    const segs = parts.map((p) => { const len = (p.value / total) * C; const s = `<circle r="${R}" cx="70" cy="70" fill="none" class="seg seg-${p.tone}" stroke-width="16" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-acc}"><title>${esc(p.label)}: ${p.value}</title></circle>`; acc += len; return s; }).join('');
    container.innerHTML = `<div class="donut"><svg viewBox="0 0 140 140" width="140" height="140"><g transform="rotate(-90 70 70)"><circle r="${R}" cx="70" cy="70" fill="none" class="seg-track" stroke-width="16"/>${segs}</g><text x="70" y="74" text-anchor="middle" class="donut-center">${esc(center)}</text></svg>
      <ul class="legend">${parts.map((p) => `<li><i class="dot dot-${p.tone}"></i>${esc(p.label)}<b>${p.value}</b></li>`).join('')}</ul></div>`;
  }

  /* Download rows as .xlsx via SheetJS (window.XLSX must be loaded). */
  function downloadXlsx(filename, headers, rows, sheet = 'Sheet1') {
    if (!window.XLSX) return toast('Excel library not loaded', 'bad');
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = headers.map((h) => ({ wch: Math.max(12, h.length + 4) }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, sheet);
    XLSX.writeFile(wb, filename);
  }

  // ---------- shell ----------
  let state = null;

  function shell({ user, sections }) {
    state = { user, sections };
    document.body.classList.add('app');
    document.body.innerHTML = `
      <aside class="sidebar" id="sidebar">
        <a class="brand" href="${ERP.auth.homeFor(user.role)}">
          <span class="brand-mark">${icon('home', 20)}</span>
          <span><b>CampusHub AIMS</b><small class="brand-portal">${PORTAL_LABEL[user.role] || 'Portal'}</small></span>
        </a>
        <nav class="nav">${sections.map((s) => `<a href="#${s.id}" data-sec="${s.id}">${icon(s.icon || 'home')}<span>${esc(s.label)}</span>${s.badge ? `<em class="nav-badge" data-badge="${s.id}"></em>` : ''}</a>`).join('')}</nav>
        <div class="sidebar-foot">
          <div class="me">${avatar(user.name, 34)}<div><b>${esc(user.name)}</b><small>${esc(user.designation)}${user.dept ? ' · ' + user.dept : ''}</small></div></div>
          <button class="btn btn-ghost btn-block" data-logout>${icon('logout', 16)} Sign out</button>
        </div>
      </aside>
      <div class="scrim" data-close-nav></div>
      <div class="main">
        <header class="topbar">
          <button class="icon-btn only-mobile" data-open-nav aria-label="Menu">${icon('menu')}</button>
          <div class="crumbs"><span class="role-pill role-${user.role}">${esc(ROLE_LABEL[user.role])}</span><h1 id="page-title"></h1></div>
          <div class="top-actions">
            <button class="icon-btn" data-theme aria-label="Toggle theme">${icon('moon')}</button>
            <div class="notif">
              <button class="icon-btn" data-notif aria-label="Notifications">${icon('bell')}<em class="notif-dot" hidden></em></button>
              <div class="notif-panel" hidden></div>
            </div>
          </div>
        </header>
        <main id="view" class="view"></main>
      </div>`;

    $('[data-logout]').onclick = () => ERP.auth.logout();
    $('[data-open-nav]').onclick = () => document.body.classList.add('nav-open');
    $('[data-close-nav]').onclick = () => document.body.classList.remove('nav-open');

    const themeBtn = $('button[data-theme]');
    const syncThemeIcon = () => { const dark = document.documentElement.dataset.theme === 'dark'; themeBtn.innerHTML = icon(dark ? 'sun' : 'moon'); };
    themeBtn.onclick = () => { applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); syncThemeIcon(); };
    syncThemeIcon();

    // notifications
    const panel = $('.notif-panel');
    $('[data-notif]').onclick = (e) => {
      e.stopPropagation(); panel.hidden = !panel.hidden;
      if (!panel.hidden) {
        const list = ERP.notifications.for(user.empId).slice(0, 12);
        panel.innerHTML = `<div class="demo-head">Notifications</div>${list.length ? list.map((n) => {
          const prio = n.priority ? ERP.announcements.priorityMeta(n.priority) : null;
          return `<div class="notif-item ${n.read ? '' : 'unread'}${n.link ? ' click' : ''}"${n.link ? ` data-link="${esc(n.link)}"` : ''}><b>${esc(n.text)}</b>${n.sub ? `<p>${esc(n.sub)}</p>` : ''}
            <div class="notif-foot">${prio ? `<span class="badge ${prio.cls}">${prio.label}</span>` : ''}<small>${ERP.fmt.ago(n.at)}</small></div></div>`;
        }).join('') : '<p class="muted small" style="padding:12px 14px">You\'re all caught up.</p>'}`;
        panel.querySelectorAll('[data-link]').forEach((d) => { d.onclick = () => { panel.hidden = true; go(d.dataset.link.slice(1)); }; });
        ERP.notifications.markAllRead(user.empId); syncBadges();
      }
    };
    document.addEventListener('click', (e) => { if (!e.target.closest('.notif')) panel.hidden = true; });

    window.addEventListener('hashchange', route);
    route();
  }

  function syncBadges() {
    if (!state) return;
    $('.notif-dot').hidden = ERP.notifications.unread(state.user.empId) === 0;
    state.sections.forEach((s) => {
      if (!s.badge) return; const n = s.badge(); const el = $(`[data-badge="${s.id}"]`);
      if (el) { el.textContent = n || ''; el.hidden = !n; }
    });
  }

  function route() {
    const { sections } = state;
    const id = location.hash.slice(1);
    const sec = sections.find((s) => s.id === id) || sections[0];
    $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.sec === sec.id));
    $('#page-title').textContent = sec.title || sec.label;
    document.title = `${sec.label} · CampusHub AIMS`;
    const view = $('#view');
    view.innerHTML = '';
    const el = document.createElement('div'); el.className = 'section fade-in';
    view.appendChild(el);
    sec.render(el, state.user);
    document.body.classList.remove('nav-open');
    syncBadges();
    view.scrollTop = 0; window.scrollTo(0, 0);
  }

  const go = (id) => { if (location.hash.slice(1) === id) route(); else location.hash = id; };
  const refresh = () => route();

  // ================= COMING SOON =================
  /* Reusable "feature on the way" placeholder. */
  function comingSoon(el, { iconName, title, lead, note, feats }) {
    el.innerHTML = `
      <div class="card soon">
        <div class="soon-ic">${icon(iconName, 40)}</div>
        <div class="soon-badge"><i></i> Coming soon</div>
        <h2>${esc(title)}</h2>
        <p>${lead}</p>
        <div class="soon-feats">${feats.map((f) => `<div class="soon-feat"><span class="sf-ic">${icon(f[0], 17)}</span><div><b>${esc(f[1])}</b><small>${esc(f[2])}</small></div></div>`).join('')}</div>
        ${note ? `<p class="muted small" style="margin-top:26px">${esc(note)}</p>` : ''}
      </div>`;
  }

  // ponytail: leave module paused on prod; swap back to the real renderers when it relaunches.
  const leaveSoon = (el) => comingSoon(el, {
    iconName: 'leave',
    title: 'Online leave, coming soon',
    lead: 'Apply for leave, track approvals and see your balance right here. Until it goes live, please apply for leave the usual way through your HOD / office.',
    note: 'The leave module is being finalised and will be switched on shortly.',
    feats: [
      ['plus', 'Apply online', 'CL, AL, OD and LOP in a few clicks, half days included.'],
      ['check', 'Track approvals', 'See where each request is, from HOD to Principal.'],
      ['leave', 'Live balance', 'Your remaining leave for the year at a glance.'],
      ['bell', 'Notifications', 'Get notified the moment a request is approved.'],
    ],
  });

  // ================= ANNOUNCEMENTS =================
  /* One announcements page for every portal. On the server, only notices this user may see arrive. */
  function annCard(a, me) {
    const by = ERP.users.byEmp(a.by) || { name: 'Unknown' };
    const prio = ERP.announcements.priorityMeta(a);
    const fresh = Date.now() - new Date(a.at).getTime() < 172800000;
    const kb = a.pdf && a.pdf.size ? ` (${Math.max(1, Math.round(a.pdf.size / 1024))} KB)` : '';
    return `<article class="ann-card" data-id="${esc(a.id)}">
      <div class="ann-main">
        <div class="ann-top"><span class="ann-cat prio-${prio.priority}">${prio.label} priority</span>
          <span class="ann-aud">${icon('users', 12)} ${esc(ERP.announcements.audienceLabel(a))}</span>${fresh ? '<span class="badge badge-accent">New</span>' : ''}</div>
        <h3 class="ann-title">${esc(a.title)}</h3>${a.body ? `<p class="ann-body">${esc(a.body)}</p>` : ''}
        <div class="ann-meta"><span>${icon('calendar', 13)} Published ${ERP.fmt.dateTime(a.at)}</span>${a.pdf ? `<span>${icon('file', 13)} ${esc(a.pdf.name)}${kb}</span>` : ''}<span>By ${esc(by.name)}</span></div>
      </div>
      <div class="ann-actions">
        ${a.pdf ? `<button class="btn btn-ghost btn-sm" data-pdf-view>${icon('eye', 15)} Preview</button><a class="btn btn-ghost btn-sm" download="${esc(a.pdf.name)}" href="${esc(ERP.announcements.pdfUrl(a))}">${icon('download', 15)} Download</a>` : ''}
        ${me && (a.by === me.empId || me.role === 'admin') ? `<button class="icon-btn" data-del title="Delete announcement" aria-label="Delete">${icon('trash', 16)}</button>` : ''}
      </div></article>`;
  }
  function newAnnouncement() {
    let pdf = null;
    const chips = (name, items, on) => `<div class="aud-picker" data-pick="${name}">${items.map(([id, label]) => `<button type="button" class="aud-chip${name === 'prio' ? ` prio-${id}` : ''}${on(id) ? ' on' : ''}" data-v="${id}">${esc(label)}</button>`).join('')}</div>`;
    const { root } = modal({
      title: 'New announcement',
      body: `<label class="field"><span>Title</span><input data-t maxlength="90" placeholder="e.g. Faculty meeting on Friday"></label>
        <label class="field"><span>Message (optional)</span><textarea data-b rows="5" placeholder="Write the announcement details"></textarea></label>
        <div class="field"><span>Attachment (PDF, optional)</span><div data-file></div><p class="muted small" style="margin:6px 0 0">Max 2&nbsp;MB.</p></div>
        <div class="field"><span>Priority</span>${chips('prio', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], (id) => id === 'medium')}</div>
        <div class="field"><span>Send to</span>${chips('aud', [['all', 'Everyone'], ...ERP.announcements.AUDIENCES.map((g) => [g.id, g.label])], (id) => id === 'all')}</div>
        <p class="muted small" data-aud-note style="margin:0"></p>`,
      actions: [{ label: 'Cancel', tone: 'ghost' }, { label: 'Post', tone: 'primary', onClick: (close, r) => {
        const title = $('[data-t]', r).value.trim();
        if (title.length < 3) { toast('Title is too short', 'bad'); return false; }
        const audience = $$('[data-pick="aud"] .on', r).map((b) => b.dataset.v);
        const priority = $('[data-pick="prio"] .on', r).dataset.v;
        try { ERP.announcements.add({ title, body: $('[data-b]', r).value.trim(), audience: audience.includes('all') ? ['all'] : audience, priority, pdf }); }
        catch (e) { toast(e.message, 'bad'); return false; }
        toast('Announcement posted'); refresh(); return true;
      } }],
    });
    const fileBox = $('[data-file]', root);
    const drawFile = () => {
      fileBox.innerHTML = pdf ? `<div class="file-pill">${icon('file', 16)}<span title="${esc(pdf.name)}">${esc(pdf.name)}</span><button type="button" class="icon-btn" aria-label="Remove PDF">${icon('x', 14)}</button></div>`
        : `<label class="btn btn-ghost" style="align-self:flex-start">${icon('upload', 16)} Choose PDF<input type="file" accept="application/pdf,.pdf" hidden></label>`;
      if (pdf) { $('button', fileBox).onclick = () => { pdf = null; drawFile(); }; return; }
      $('input', fileBox).onchange = (e) => {
        const f = e.target.files[0]; if (!f) return;
        if (f.type !== 'application/pdf' && !/\.pdf$/i.test(f.name)) return toast('Please choose a PDF file', 'bad');
        if (f.size > 2 * 1024 * 1024) return toast('PDF is too large (max 2 MB)', 'bad');
        const rd = new FileReader();
        rd.onload = () => { pdf = { name: f.name, dataUrl: String(rd.result).replace(/^data:[^;]*;/, 'data:application/pdf;') }; drawFile(); };
        rd.onerror = () => toast('Could not read that file', 'bad');
        rd.readAsDataURL(f);
      };
    };
    drawFile();
    const note = () => {
      const on = $$('[data-pick="aud"] .on', root).map((b) => b.textContent);
      $('[data-aud-note]', root).textContent = on.includes('Everyone') ? 'Visible to everyone — students, doctors and all staff.' : `Visible only to: ${on.join(', ')}.`;
    };
    $('[data-pick="prio"]', root).onclick = (e) => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      $$('[data-pick="prio"] .on', root).forEach((x) => x.classList.remove('on')); b.classList.add('on');
    };
    $('[data-pick="aud"]', root).onclick = (e) => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      const all = $('[data-v="all"]', root);
      if (b === all) { $$('[data-pick="aud"] .on', root).forEach((x) => x.classList.remove('on')); all.classList.add('on'); }
      else { all.classList.remove('on'); b.classList.toggle('on'); if (!$('[data-pick="aud"] .on', root)) all.classList.add('on'); }
      note();
    };
    note();
  }
  function announcementsPage(el, me, { canPost = false } = {}) {
    const list = ERP.announcements.all();
    el.innerHTML = `
      <div class="card row" style="justify-content:space-between"><div><h3>Announcements</h3><p class="muted" style="margin:2px 0 0">${list.length} notice${list.length === 1 ? '' : 's'}${canPost ? '' : ' for you'}</p></div>
        ${canPost ? `<button class="btn btn-primary" data-new>${icon('plus', 16)} New announcement</button>` : ''}</div>
      <div class="ann-list">${list.length ? list.map((a) => annCard(a, me)).join('') : `<div class="card">${empty('No announcements yet', 'megaphone')}</div>`}</div>`;
    if (canPost) $('[data-new]', el).onclick = newAnnouncement;
    el.querySelectorAll('.ann-card').forEach((c) => {
      const a = list.find((x) => x.id === c.dataset.id);
      const v = $('[data-pdf-view]', c);
      if (v) v.onclick = () => modal({ title: a.pdf.name, wide: true, body: `<iframe title="${esc(a.pdf.name)}" src="${esc(ERP.announcements.pdfUrl(a))}#toolbar=0&navpanes=0" style="width:100%;height:72vh;border:0;border-radius:12px;background:#fff"></iframe>` });
      const d = $('[data-del]', c);
      if (d) d.onclick = async () => {
        if (!(await confirmBox('Delete announcement?', 'It will be removed for everyone who can see it.', { okLabel: 'Delete', tone: 'danger' }))) return;
        try { ERP.announcements.remove(a.id); } catch (e) { return toast(e.message, 'bad'); }
        toast('Announcement deleted'); refresh();
      };
    });
  }

  window.ERP.ui = { $, $$, esc, icon, toast, modal, confirm: confirmBox, avatar, statusBadge, leaveBadge, stat, empty, meter, table, bars, donut, downloadXlsx, shell, go, refresh, syncBadges, applyTheme, ROLE_LABEL, comingSoon, leaveSoon, announcementsPage };
})();
