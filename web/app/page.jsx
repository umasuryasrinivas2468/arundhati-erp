'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ERP from '@/lib/erp';
import { useErp } from '@/lib/ErpProvider';
import { Icon } from '@/components/Icon';
import { toggleTheme, isDark } from '@/lib/theme';

const FEATURES = [
  ['excel', 'Excel attendance upload', 'Drop the monthly biometric sheet — validated, previewed, imported.'],
  ['leave', 'Leave workflow', null],
  ['chart', 'Role dashboards', 'Tailored views for Admin, Principal, Dean, HOD and Faculty.'],
];
const ROLE_ICON = { admin: 'settings', principal: 'building', dean: 'chart', hod: 'users', faculty: 'user', student: 'cap' };

export default function LoginPage() {
  useErp();
  const router = useRouter();
  const [dark, setDark] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [okName, setOkName] = useState('');
  const [goCard, setGoCard] = useState(null);
  const formRef = useRef(null);
  const busyRef = useRef(false);

  useEffect(() => {
    setDark(isDark());
    const u = ERP.auth.current();
    if (u) router.replace(ERP.auth.homeFor(u.role));
  }, [router]);

  const shake = () => {
    const f = formRef.current; if (!f) return;
    f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
  };
  const fail = (msg) => { setError(msg); setBusy(false); busyRef.current = false; shake(); };

  const attempt = (user, pass, onDone) => {
    if (busyRef.current) return;
    if (!user.trim() || !pass) return fail('Enter both username and password.');
    setBusy(true); busyRef.current = true; setError('');
    setTimeout(() => {
      const u = ERP.auth.login(user, pass);
      if (!u) { onDone && onDone(false); return fail('Invalid username or password. Try one of the demo logins below.'); }
      setOkName(u.name.split(' ').slice(0, 2).join(' '));
      setTimeout(() => router.push(ERP.auth.homeFor(u.role)), 380);
    }, 420);
  };

  const onSubmit = (e) => { e.preventDefault(); attempt(username, password); };

  const demoLogin = (d) => {
    if (busyRef.current) return;
    setError(''); setGoCard(d.empId);
    setUsername(''); setPassword(''); setShowPw(false);
    const steps = [];
    for (let i = 1; i <= d.username.length; i++) steps.push(() => setUsername(d.username.slice(0, i)));
    for (let i = 1; i <= d.password.length; i++) steps.push(() => setPassword(d.password.slice(0, i)));
    const per = Math.max(12, Math.floor(320 / steps.length));
    busyRef.current = true;
    steps.forEach((fn, i) => setTimeout(fn, i * per));
    setTimeout(() => { busyRef.current = false; attempt(d.username, d.password, () => setGoCard(null)); }, steps.length * per + 60);
  };

  return (
    <div className="lg-page">
      <button className="icon-btn lg-theme" aria-label="Toggle theme" onClick={() => setDark(toggleTheme() === 'dark')}>
        <Icon name={dark ? 'sun' : 'moon'} />
      </button>

      <section className="lg-brand">
        <div className="lg-logo">
          <span className="mark"><Icon name="cross" size={24} /></span>
          <span><b>Arundhati ERP</b><small>{ERP.INSTITUTION}</small></span>
        </div>
        <div className="lg-pitch">
          <h1>Staff attendance &amp; leave, in one place.</h1>
          <p>A lightweight ERP for faculty, departments and administration of the medical college and teaching hospital.</p>
          <ul className="lg-feats">
            {FEATURES.map(([ic, t, d]) => (
              <li key={t}>
                <span className="fi"><Icon name={ic} size={20} /></span>
                <div>
                  <b>{t}</b>
                  {d ? <span>{d}</span> : (
                    <span className="lg-flow"><em>Faculty</em>→<em>HOD</em>→<em>Principal</em> with live status &amp; balances.</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="lg-foot">Demo build · shared data via the ERP server store.</div>
      </section>

      <section className="lg-side">
        <form className="lg-card" ref={formRef} onSubmit={onSubmit} noValidate autoComplete="on">
          <h2>Welcome back</h2>
          <p className="muted">Sign in with your ERP credentials.</p>
          {error && <div className="lg-err"><Icon name="alert" size={16} /><span>{error}</span></div>}
          <label className="field">
            <span>Username</span>
            <input name="username" autoComplete="username" placeholder="e.g. admin" value={username}
              onChange={(e) => { setUsername(e.target.value); setError(''); }} required />
          </label>
          <label className="field">
            <span>Password</span>
            <div className="pw-wrap">
              <input name="password" type={showPw ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••"
                value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} required />
              <button type="button" className="pw-toggle" aria-label={showPw ? 'Hide password' : 'Show password'} onClick={() => setShowPw((v) => !v)}>
                <Icon name={showPw ? 'eyeOff' : 'eye'} />
              </button>
            </div>
          </label>
          <button className="btn btn-primary btn-block lg-submit" type="submit" disabled={busy}>
            {okName ? <><Icon name="check" size={16} /> Welcome, {okName}</> : busy ? <><span className="spin" /> Signing in…</> : 'Sign in'}
          </button>
        </form>

        <div className="lg-demo">
          <div className="lg-demo-head">Demo logins · one click</div>
          <div className="demo-grid">
            {ERP.DEMO.map((d) => (
              <button key={d.empId} type="button" className={`demo-card role-${d.role}${goCard === d.empId ? ' go' : ''}`}
                title={`Sign in as ${d.label}`} onClick={() => demoLogin(d)}>
                <span className="rc"><Icon name={ROLE_ICON[d.role] || 'user'} size={18} /></span>
                <span><b>{d.label}</b><small>{d.username} / {d.password}</small></span>
              </button>
            ))}
          </div>
        </div>
        <p className="lg-note">
          <Icon name="alert" size={16} className="icon" />
          <span>Demo build: data is stored in the shared ERP server store (Upstash Redis) and cached in this browser.</span>
        </p>
      </section>
    </div>
  );
}
