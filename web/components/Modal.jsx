'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

/* Imperative modal API mirroring ERP.ui.modal / ERP.ui.confirm.
 *   openModal({ title, body, actions, wide, onClose }) -> { id, close }
 *     body: a React node, or a function(close) => node
 *     actions: [{ label, tone:'primary'|'danger'|'ghost'|'ok', onClick(close) -> false to keep open }]
 *   confirmBox(title, message, { okLabel, tone, withRemark }) -> Promise<true | {remark} | null>
 */
let listeners = new Set();
let stack = [];
let seq = 0;
const emit = () => listeners.forEach((fn) => fn(stack));

export function openModal(cfg) {
  const id = ++seq;
  const close = () => {
    const existed = stack.some((m) => m.id === id);
    stack = stack.filter((m) => m.id !== id);
    emit();
    if (existed && cfg.onClose) cfg.onClose();
  };
  stack = [...stack, { id, close, ...cfg }];
  emit();
  return { id, close };
}

export function confirmBox(title, message, opts = {}) {
  const { okLabel = 'Confirm', tone = 'primary', withRemark = false } = opts;
  return new Promise((resolve) => {
    const box = { remark: '' };
    let done = false;
    openModal({
      title,
      body: (
        <>
          <p className="muted">{message}</p>
          {withRemark && (
            <label className="field">
              <span>Remark (optional)</span>
              <textarea rows={3} onChange={(e) => { box.remark = e.target.value; }} placeholder="Add a note for the applicant" />
            </label>
          )}
        </>
      ),
      actions: [
        { label: 'Cancel', tone: 'ghost' },
        { label: okLabel, tone, onClick: () => { done = true; resolve(withRemark ? { remark: box.remark.trim() } : true); } },
      ],
      onClose: () => { if (!done) resolve(null); },
    });
  });
}

function ModalView({ m, isTop }) {
  const [show, setShow] = useState(false);
  const backRef = useRef(null);
  useEffect(() => { requestAnimationFrame(() => setShow(true)); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && isTop) m.close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isTop, m]);

  const body = typeof m.body === 'function' ? m.body(m.close) : m.body;
  const actions = m.actions || [{ label: 'Close', tone: 'ghost' }];

  return (
    <div
      ref={backRef}
      className={`modal-back${show ? ' show' : ''}`}
      onMouseDown={(e) => { if (e.target === backRef.current) m.close(); }}
    >
      <div className={`modal ${m.wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={m.title}>
        <div className="modal-head">
          <h3>{m.title}</h3>
          <button className="icon-btn" aria-label="Close" onClick={m.close}><Icon name="x" /></button>
        </div>
        <div className="modal-body">{body}</div>
        <div className="modal-foot">
          {actions.map((a, i) => (
            <button
              key={i}
              className={`btn btn-${a.tone || 'ghost'}`}
              onClick={() => { if (!a.onClick || a.onClick(m.close) !== false) m.close(); }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ModalHost() {
  const [items, setItems] = useState(stack);
  useEffect(() => { const fn = (s) => setItems([...s]); listeners.add(fn); return () => listeners.delete(fn); }, []);
  return (
    <>
      {items.map((m, i) => (
        <ModalView key={m.id} m={m} isTop={i === items.length - 1} />
      ))}
    </>
  );
}

export default ModalHost;
