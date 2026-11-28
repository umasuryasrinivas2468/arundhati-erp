'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ERP from '@/lib/erp';
import { useErp } from '@/lib/ErpProvider';
import { Icon } from '@/components/Icon';
import { toggleTheme, isDark, ACCENTS, DEFAULT_ACCENT, getAccent, applyAccent } from '@/lib/theme';

export default function LoginPage() {
  useErp();
  const router = useRouter();
  const [dark, setDark] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [okName, setOkName] = useState('');
  const [accentOpen, setAccentOpen] = useState(false);
  const [accent, setAccent] = useState(DEFAULT_ACCENT);
  const formRef = useRef(null);
  const busyRef = useRef(false);

  useEffect(() => {
    setDark(isDark());
    setAccent(getAccent());
    const u = ERP.auth.current();
    if (u) router.replace(ERP.auth.homeFor(u.role));
  }, [router]);

  useEffect(() => {
    const close = (e) => { if (!e.target.closest?.('.accent-switch')) setAccentOpen(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const pickAccent = (hex) => { applyAccent(hex); setAccent(hex); };
  const resetAccent = () => { applyAccent(''); setAccent(DEFAULT_ACCENT); };

  const shake = () => {
    const f = formRef.current; if (!f) return;
    f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
  };
  const fail = (msg) => { setError(msg); setInfo(''); setBusy(false); busyRef.current = false; shake(); };

  const attempt = (user, pass, onDone) => {
    if (busyRef.current) return;
    if (!user.trim() || !pass) return fail('Enter both username and password.');
    setBusy(true); busyRef.current = true; setError('');
    ERP.auth.login(user, pass).then((u) => {
      setOkName(u.name.split(' ').slice(0, 2).join(' '));
      setTimeout(() => router.push(ERP.auth.homeFor(u.role)), 380);
    }, (e) => { onDone && onDone(false); fail(e.message); });
  };

  const onSubmit = (e) => { e.preventDefault(); attempt(username, password); };

  return (
    <div className="lg-page">
      <div className="lg-tools">
        <button className="icon-btn" aria-label="Toggle theme" onClick={() => setDark(toggleTheme() === 'dark')}>
          <Icon name={dark ? 'sun' : 'moon'} />
        </button>
        <div className="accent-switch">
          <button className="icon-btn accent-dot" aria-label="Accent colour" onClick={(e) => { e.stopPropagation(); setAccentOpen((v) => !v); }}>
            <span className="accent-chip" />
          </button>
          {accentOpen && (
            <div className="accent-panel">
              <div className="accent-head"><b>Accent colour</b><button className="accent-reset" onClick={resetAccent}><Icon name="swap" size={13} /> Reset</button></div>
              <div className="accent-grid">
                {ACCENTS.map((c) => (
                  <button key={c} className={`accent-sw${accent.toLowerCase() === c.toLowerCase() ? ' on' : ''}`} style={{ background: c, color: c }} aria-label={c} title={c} onClick={() => pickAccent(c)}>
                    {accent.toLowerCase() === c.toLowerCase() ? <Icon name="check" size={16} /> : null}
                  </button>
                ))}
              </div>
              <div className="accent-hex"><span className="sw" style={{ background: 'var(--primary)' }} /><code>{accent.toUpperCase()}</code><small>HEX</small></div>
            </div>
          )}
        </div>
      </div>

      <main className="lg-wrap">
        <header className="lg-head">
          <span className="lg-mark"><Icon name="home" size={26} /></span>
          <h1 className="lg-title">CampusHub AIMS</h1>
          <p className="lg-sub">Sign in to your portal</p>
        </header>

        <form className="lg-card" ref={formRef} onSubmit={onSubmit} noValidate autoComplete="on">
          {error && <div className="lg-err"><Icon name="alert" size={16} /><span>{error}</span></div>}
          {info && !error && <div className="lg-info"><Icon name="alert" size={16} /><span>{info}</span></div>}
          <label className="field">
            <span>Username</span>
            <input name="username" autoComplete="username" placeholder="Roll number, email or username" value={username}
              onChange={(e) => { setUsername(e.target.value); setError(''); setInfo(''); }} required />
          </label>
          <label className="field">
            <span>Password</span>
            <div className="pw-wrap">
              <input name="password" type={showPw ? 'text' : 'password'} autoComplete="current-password" placeholder="Password"
                value={password} onChange={(e) => { setPassword(e.target.value); setError(''); setInfo(''); }} required />
              <button type="button" className="pw-toggle" aria-label={showPw ? 'Hide password' : 'Show password'} onClick={() => setShowPw((v) => !v)}>
                <Icon name={showPw ? 'eyeOff' : 'eye'} />
              </button>
            </div>
          </label>
          <div className="lg-row-right">
            <button type="button" className="lg-forgot" onClick={() => { setInfo('Contact your administrator to reset your password.'); setError(''); }}>
              Forgot Password?
            </button>
          </div>
          <button className="btn btn-primary btn-block lg-submit" type="submit" disabled={busy}>
            {okName ? <><Icon name="check" size={16} /> Welcome, {okName}</> : busy ? <><span className="spin" /> Signing in…</> : 'Sign In'}
          </button>
        </form>

        <p className="lg-note">Facing an issue? Contact <a href="mailto:23r21a66h5@mlrit.ac.in">23r21a66h5@mlrit.ac.in</a></p>
      </main>
    </div>
  );
}
