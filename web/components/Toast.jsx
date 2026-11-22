'use client';
import { useEffect, useState } from 'react';
import { Icon } from './Icon';

/* Imperative toast API (mirrors ERP.ui.toast) backed by a host mounted in layout. */
let listeners = new Set();
let seq = 0;

export function toast(msg, tone = 'ok') {
  const t = { id: ++seq, msg, tone };
  listeners.forEach((fn) => fn(t));
}

export function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const add = (t) => {
      setItems((cur) => [...cur, { ...t, show: false }]);
      requestAnimationFrame(() => setItems((cur) => cur.map((x) => (x.id === t.id ? { ...x, show: true } : x))));
      setTimeout(() => setItems((cur) => cur.map((x) => (x.id === t.id ? { ...x, show: false } : x))), 3200);
      setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== t.id)), 3500);
    };
    listeners.add(add);
    return () => listeners.delete(add);
  }, []);

  return (
    <div id="toasts">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}${t.show ? ' show' : ''}`}>
          <Icon name={t.tone === 'bad' ? 'alert' : 'check'} size={16} />
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

export default ToastHost;
