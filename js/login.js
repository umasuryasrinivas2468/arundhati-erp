/* Arundhati ERP — login page. Requires data.js + ui.js (helpers only; the shell is not used here). */
(function () {
  const { $, esc, icon } = ERP.ui;

  // Already signed in? Go straight home (also guarded inline in <head>).
  const cur = ERP.auth.current();
  if (cur) { location.replace(ERP.auth.homeFor(cur.role)); return; }

  const EYE = '<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF = '<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.8 9.8 0 005.4-1.6"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/></svg>';

  // ---------- branding ----------
  $('#lg-mark').innerHTML = icon('cross', 24);
  $('#lg-inst').textContent = ERP.INSTITUTION;
  const feats = [
    ['excel', 'Excel attendance upload', 'Drop the monthly biometric sheet — validated, previewed, imported.'],
    ['leave', 'Leave workflow', '<span class="lg-flow"><em>Faculty</em>→<em>HOD</em>→<em>Principal</em></span> with live status &amp; balances.'],
    ['chart', 'Role dashboards', 'Tailored views for Admin, Principal, Dean, HOD and Faculty.'],
  ];
  $('#lg-feats').innerHTML = feats.map(([ic, t, d]) => `<li><span class="fi">${icon(ic, 20)}</span><div><b>${t}</b><span>${d}</span></div></li>`).join('');
  $('#lg-note').innerHTML = `${icon('alert', 16)}<span>Demo build: all data is stored locally in your browser (localStorage). Nothing is sent to a server — clearing site data resets everything.</span>`;

  // ---------- theme ----------
  const themeBtn = $('#lg-theme');
  const isDark = () => document.documentElement.dataset.theme === 'dark';
  const syncTheme = () => { themeBtn.innerHTML = icon(isDark() ? 'sun' : 'moon'); themeBtn.title = isDark() ? 'Light mode' : 'Dark mode'; };
  themeBtn.onclick = () => { ERP.ui.applyTheme(isDark() ? 'light' : 'dark'); syncTheme(); };
  syncTheme();

  // ---------- form ----------
  const form = $('#lg-form'), user = $('#lg-user'), pass = $('#lg-pass'), eye = $('#lg-eye'), err = $('#lg-err'), submit = $('#lg-submit');
  eye.innerHTML = EYE;
  eye.onclick = () => {
    const show = pass.type === 'password';
    pass.type = show ? 'text' : 'password';
    eye.innerHTML = show ? EYE_OFF : EYE;
    eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    pass.focus();
  };

  let busy = false;
  function fail(msg) {
    err.innerHTML = `${icon('alert', 16)}<span>${esc(msg)}</span>`;
    err.hidden = false;
    form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
    setBusy(false);
  }
  form.addEventListener('animationend', (e) => { if (e.animationName === 'shake') form.classList.remove('shake'); });
  [user, pass].forEach((i) => i.addEventListener('input', () => { err.hidden = true; }));

  function setBusy(on, label = 'Signing in…') {
    busy = on;
    submit.disabled = on;
    submit.innerHTML = on ? `<span class="spin"></span>${esc(label)}` : 'Sign in';
  }

  function attempt(username, password, after) {
    if (busy) return;
    if (!username.trim() || !password) return fail('Enter both username and password.');
    setBusy(true);
    // Small delay so the transition is perceptible.
    setTimeout(() => {
      const u = ERP.auth.login(username, password);
      if (!u) { after && after(false); return fail('Invalid username or password. Try one of the demo logins below.'); }
      submit.innerHTML = `${icon('check', 16)} Welcome, ${esc(u.name.split(' ').slice(0, 2).join(' '))}`;
      setTimeout(() => location.href = ERP.auth.homeFor(u.role), 380);
    }, 420);
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); attempt(user.value, pass.value); });

  // ---------- demo cards ----------
  const ROLE_ICON = { admin: 'settings', principal: 'building', dean: 'chart', hod: 'users', faculty: 'user' };
  const grid = $('#lg-demo');
  grid.innerHTML = ERP.DEMO.map((d, i) => `<button type="button" class="demo-card role-${d.role}" data-i="${i}" title="Sign in as ${esc(d.label)}">
      <span class="rc">${icon(ROLE_ICON[d.role] || 'user', 18)}</span>
      <span><b>${esc(d.label)}</b><small>${esc(d.username)} / ${esc(d.password)}</small></span></button>`).join('');
  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.demo-card'); if (!card || busy) return;
    const d = ERP.DEMO[+card.dataset.i];
    err.hidden = true;
    grid.querySelectorAll('.demo-card').forEach((c) => c.classList.remove('go'));
    card.classList.add('go');
    // Type the credentials in quickly, then sign in.
    user.value = ''; pass.value = ''; pass.type = 'password'; eye.innerHTML = EYE;
    const steps = [];
    for (let i = 1; i <= d.username.length; i++) steps.push(() => { user.value = d.username.slice(0, i); });
    for (let i = 1; i <= d.password.length; i++) steps.push(() => { pass.value = d.password.slice(0, i); });
    const per = Math.max(12, Math.floor(320 / steps.length));
    busy = true;
    steps.forEach((fn, i) => setTimeout(fn, i * per));
    setTimeout(() => { busy = false; attempt(d.username, d.password, () => card.classList.remove('go')); }, steps.length * per + 60);
  });

  setTimeout(() => user.focus(), 50);
})();
