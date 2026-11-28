'use client';
import { useEffect, useRef } from 'react';
import { Icon } from './Icon';
import { openPdfViewer, downloadPdf } from './Modal';
import ERP from '@/lib/erp';

export const initials = (name) => ERP.fmt.initials(name);

// Shared announcement card (priority label + audience, title, body, meta, PDF actions).
// Pass onDelete to show a delete button (poster's own notices).
export function AnnouncementCard({ a, onDelete = null }) {
  const by = ERP.users.byEmp(a.by) || { name: 'Unknown', designation: '' };
  const prio = ERP.announcements.priorityMeta(a);
  const fresh = Date.now() - new Date(a.at).getTime() < 172800000;
  const sizeKB = a.pdf && a.pdf.size ? `${Math.max(1, Math.round(a.pdf.size / 1024))} KB` : '';
  return (
    <article className="ann-card">
      <div className="ann-main">
        <div className="ann-top">
          <span className={`ann-cat prio-${prio.priority}`}>{prio.label} priority</span>
          <span className="ann-aud"><Icon name="users" size={12} /> {ERP.announcements.audienceLabel(a)}</span>
          {fresh ? <span className="badge badge-accent">New</span> : null}
        </div>
        <h3 className="ann-title">{a.title}</h3>
        {a.body ? <p className="ann-body">{a.body}</p> : null}
        <div className="ann-meta">
          <span><Icon name="calendar" size={13} /> Published {ERP.fmt.dateTime(a.at)}</span>
          {a.pdf ? <span><Icon name="file" size={13} /> {a.pdf.name}{sizeKB ? ` (${sizeKB})` : ''}</span> : null}
          <span>By {by.name}</span>
        </div>
      </div>
      <div className="ann-actions">
        {a.pdf ? <button className="btn btn-ghost btn-sm" onClick={() => openPdfViewer(a.pdf)}><Icon name="eye" size={15} /> Preview</button> : null}
        {a.pdf ? <button className="btn btn-ghost btn-sm" onClick={() => downloadPdf(a.pdf)}><Icon name="download" size={15} /> Download</button> : null}
        {onDelete ? <button className="icon-btn" title="Delete announcement" aria-label="Delete" onClick={onDelete}><Icon name="trash" size={16} /></button> : null}
      </div>
    </article>
  );
}

export function Avatar({ name, size = 36 }) {
  let h = 0; for (const c of name || '') h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span className="avatar" style={{ '--av': h, width: size, height: size, fontSize: Math.round(size * 0.38) }}>
      {ERP.fmt.initials(name || '')}
    </span>
  );
}

export function Badge({ tone = 'muted', title, children }) {
  return <span className={`badge badge-${tone}`} title={title}>{children}</span>;
}

export function StatusBadge({ code }) {
  const s = ERP.STATUS[code];
  return s ? <span className={`badge badge-${s.tone}`} title={s.label}>{code}</span> : <>{code}</>;
}

const LEAVE_TONE = { 'Pending HOD': 'warn', 'Pending Principal': 'info', Approved: 'ok', Rejected: 'bad', Cancelled: 'muted' };
export function LeaveBadge({ state }) {
  return <span className={`badge badge-${LEAVE_TONE[state] || 'muted'}`}>{state}</span>;
}

export function Stat({ label, value, sub, iconName = 'chart', tone = 'accent' }) {
  return (
    <div className={`stat stat-${tone}`}>
      <div className="stat-icon"><Icon name={iconName} size={20} /></div>
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        {sub ? <div className="stat-sub">{sub}</div> : null}
      </div>
    </div>
  );
}

export function Meter({ pct, tone }) {
  const t = tone || (pct >= 85 ? 'ok' : pct >= 75 ? 'warn' : 'bad');
  const w = Math.max(0, Math.min(100, pct));
  return <div className={`meter meter-${t}`}><div style={{ width: `${w}%` }} /></div>;
}

export function Empty({ msg, iconName = 'file' }) {
  return <div className="empty"><Icon name={iconName} size={32} /><p>{msg}</p></div>;
}

/* "Coming soon" placeholder for modules that are not built yet. */
export function ComingSoon({ name, note, iconName = 'rocket' }) {
  return (
    <div className="coming-soon">
      <span className="cs-mark"><Icon name={iconName} size={30} /></span>
      <h2 className="cs-title">{name}</h2>
      <span className="cs-pill">Coming soon</span>
      <p className="cs-note">{note || 'This feature is under development and will be available soon.'}</p>
    </div>
  );
}

/* Animated horizontal bar chart. items: [{label, value, tone?}] */
export function Bars({ items, max = null, suffix = '' }) {
  const ref = useRef(null);
  const m = max ?? Math.max(1, ...items.map((i) => i.value));
  useEffect(() => {
    const el = ref.current; if (!el) return;
    requestAnimationFrame(() => {
      el.querySelectorAll('.bar-fill').forEach((b) => { b.style.width = b.dataset.w + '%'; });
    });
  }, [items, m]);
  return (
    <div className="bars" ref={ref}>
      {items.map((i, idx) => (
        <div className="bar-row" key={idx}>
          <span className="bar-label" title={i.title || i.label}>{i.label}</span>
          <div className="bar-track"><div className={`bar-fill bar-${i.tone || 'accent'}`} style={{ width: 0 }} data-w={(i.value / m) * 100} /></div>
          <span className="bar-val">{i.value}{suffix}</span>
        </div>
      ))}
    </div>
  );
}

/* Donut chart. parts: [{label, value, tone}] */
export function Donut({ parts, center = '' }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const R = 54, C = 2 * Math.PI * R;
  let acc = 0;
  const segs = parts.map((p, i) => {
    const len = (p.value / total) * C;
    const seg = (
      <circle key={i} r={R} cx="70" cy="70" fill="none" className={`seg seg-${p.tone}`} strokeWidth="16" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc}>
        <title>{`${p.label}: ${p.value}`}</title>
      </circle>
    );
    acc += len;
    return seg;
  });
  return (
    <div className="donut">
      <svg viewBox="0 0 140 140" width="140" height="140">
        <g transform="rotate(-90 70 70)">
          <circle r={R} cx="70" cy="70" fill="none" className="seg-track" strokeWidth="16" />
          {segs}
        </g>
        <text x="70" y="74" textAnchor="middle" className="donut-center">{center}</text>
      </svg>
      <ul className="legend">
        {parts.map((p, i) => (
          <li key={i}><i className={`dot dot-${p.tone}`} />{p.label}<b>{p.value}</b></li>
        ))}
      </ul>
    </div>
  );
}
