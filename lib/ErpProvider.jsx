'use client';
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import ERP from './erp';

/* Reactive glue around the ERP data layer.
 *   <ErpProvider> awaits ERP.ready() once, then renders the app.
 *   useErp()     -> ERP, re-rendering the caller whenever ERP.save() fires.
 *   useRequireRole(roles) -> the current user, redirecting if absent / wrong role.
 */

// Single module-level subscription bumps a snapshot counter; useSyncExternalStore
// reads it so any save()/reset() re-renders every subscribed component.
let snapshot = 0;
if (typeof window !== 'undefined') ERP.subscribe(() => { snapshot++; });
const subscribe = (cb) => ERP.subscribe(cb);
const getSnapshot = () => snapshot;
const getServerSnapshot = () => 0;

const ErpCtx = createContext(0);

export function ErpProvider({ children }) {
  const [ready, setReady] = useState(() => ERP.isReady());
  const tick = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    let alive = true;
    ERP.ready().then(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);

  if (!ready) {
    return (
      <div className="boot">
        <div className="boot-mark" />
        <p>Loading CampusHub AIMS…</p>
      </div>
    );
  }
  return <ErpCtx.Provider value={tick}>{children}</ErpCtx.Provider>;
}

export function useErp() {
  useContext(ErpCtx); // subscribe to provider re-renders
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return ERP;
}

// Client-side route guard. Returns the current user once resolved, else null.
export function useRequireRole(roles) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  useEffect(() => {
    const u = ERP.auth.current();
    if (!u) { router.replace('/'); return; }
    if (roles && !roles.includes(u.role)) { router.replace(ERP.auth.homeFor(u.role)); return; }
    setUser(u);
  }, [router, roles]);
  return user;
}
