'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import ERP from '@/lib/erp';
import { useErp } from '@/lib/ErpProvider';
import { toggleTheme, isDark, ACCENTS, DEFAULT_ACCENT, getAccent, applyAccent } from '@/lib/theme';
import { Icon } from './Icon';
import { Avatar } from './ui';

const ROLE_LABEL = { admin: 'Administrator', principal: 'Principal', dean: 'Dean', hod: 'Head of Department', faculty: 'Faculty / Staff', student: 'Student' };
const PORTAL_LABEL = { admin: 'Admin Portal', principal: 'Principal Portal', dean: 'Dean Portal', hod: 'HOD Portal', faculty: 'Faculty Portal', student: 'Student Portal' };

export function Shell({ user, sections }) {
  const erp = useErp();
  const router = useRouter();
  const [hash, setHash] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [accentOpen, setAccentOpen] = useState(false);
  const [accent, setAccent] = useState(DEFAULT_ACCENT);
  const rootRef = useRef(null);

  useEffect(() => { setDark(isDark()); setAccent(getAccent()); }, []);
  useEffect(() => {
    const read = () => setHash(location.hash.slice(1));
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  useEffect(() => {
    const onDoc = (e) => {
      if (!e.target.closest?.('.notif')) setNotifOpen(false);
      if (!e.target.closest?.('.accent-switch')) setAccentOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  const active = sections.find((s) => s.id === hash) || sections[0];

  // Keep document title + scroll in sync with the active section.
  useEffect(() => {
    document.title = `${active.label} · CampusHub`;
    window.scrollTo(0, 0);
    setNavOpen(false);
  }, [active]);

  // Mark notifications read when the panel opens.
  const openNotif = (e) => {
    e.stopPropagation();
    const next = !notifOpen;
    setNotifOpen(next);
    if (next) { ERP.notifications.markAllRead(user.empId); }
  };

  const pickAccent = (hex) => { applyAccent(hex); setAccent(hex); };
  const resetAccent = () => { applyAccent(''); setAccent(DEFAULT_ACCENT); };

  const unread = ERP.notifications.unread(user.empId);
  const notifs = notifOpen ? ERP.notifications.for(user.empId).slice(0, 12) : [];

  return (
    <div className={`app-shell${navOpen ? ' nav-open' : ''}`} ref={rootRef}>
      <aside className="sidebar" id="sidebar">
        <a className="brand" href={ERP.auth.homeFor(user.role)}>
          <span className="brand-mark"><Icon name="home" size={20} /></span>
          <span><b>CampusHub AIMS</b><small className="brand-portal">{PORTAL_LABEL[user.role] || 'Portal'}</small></span>
        </a>
        <nav className="nav">
          {sections.map((s) => {
            const n = s.badge ? s.badge() : 0;
            return (
              <a key={s.id} href={`#${s.id}`} className={active.id === s.id ? 'active' : ''}>
                <Icon name={s.icon || 'home'} />
                <span>{s.label}</span>
                {s.badge && n ? <em className="nav-badge">{n}</em> : null}
              </a>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="me">
            <Avatar name={user.name} size={34} />
            <div><b>{user.name}</b><small>{user.designation}{user.dept ? ` · ${user.dept}` : ''}</small></div>
          </div>
          <button className="btn btn-ghost btn-block" onClick={() => { ERP.auth.logout(); router.replace('/'); }}>
            <Icon name="logout" size={16} /> Sign out
          </button>
        </div>
      </aside>

      <div className="scrim" onClick={() => setNavOpen(false)} />

      <div className="main">
        <header className="topbar">
          <button className="icon-btn only-mobile" aria-label="Menu" onClick={() => setNavOpen(true)}><Icon name="menu" /></button>
          <div className="crumbs">
            <span className={`role-pill role-${user.role}`}>{ROLE_LABEL[user.role]}</span>
            <h1>{active.title || active.label}</h1>
          </div>
          <div className="top-actions">
            <button className="icon-btn" aria-label="Toggle theme" onClick={() => setDark(toggleTheme() === 'dark')}>
              <Icon name={dark ? 'sun' : 'moon'} />
            </button>
            <div className="accent-switch">
              <button className="icon-btn accent-dot" aria-label="Accent colour" onClick={(e) => { e.stopPropagation(); setAccentOpen((v) => !v); setNotifOpen(false); }}>
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
            <div className="notif">
              <button className="icon-btn" aria-label="Notifications" onClick={openNotif}>
                <Icon name="bell" />{unread ? <em className="notif-dot" /> : null}
              </button>
              {notifOpen && (
                <div className="notif-panel">
                  <div className="demo-head">Notifications</div>
                  {notifs.length ? notifs.map((n) => {
                    const prio = n.priority ? ERP.announcements.priorityMeta(n.priority) : null;
                    return (
                      <div key={n.id} className={`notif-item ${n.read ? '' : 'unread'}${n.link ? ' click' : ''}`}
                        onClick={n.link ? () => { setNotifOpen(false); if (location.hash === n.link) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = n.link; } : undefined}>
                        <b>{n.text}</b>{n.sub ? <p>{n.sub}</p> : null}
                        <div className="notif-foot">{prio ? <span className={`badge ${prio.cls}`}>{prio.label}</span> : null}<small>{ERP.fmt.ago(n.at)}</small></div>
                      </div>
                    );
                  }) : <p className="muted small" style={{ padding: '12px 14px' }}>You&apos;re all caught up.</p>}
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="view">
          <div className="section fade-in" key={active.id}>
            {active.render(user)}
          </div>
        </main>
      </div>
    </div>
  );
}

// Programmatic section navigation (mirror of ERP.ui.go) for use inside pages.
export const goSection = (id) => {
  if (typeof location === 'undefined') return;
  if (location.hash.slice(1) === id) { window.dispatchEvent(new HashChangeEvent('hashchange')); }
  else location.hash = id;
};

export default Shell;
