// Shared date/time helpers (ported from the faculty/student portals).
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const pad = (n) => String(n).padStart(2, '0');
export const monthRange = (y, m) => {
  const last = new Date(y, m + 1, 0).getDate();
  return [`${y}-${pad(m + 1)}-01`, `${y}-${pad(m + 1)}-${pad(last)}`];
};
export const minutes = (t) => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const hoursWorked = (r) => {
  const a = minutes(r.inTime), b = minutes(r.outTime);
  if (a == null || b == null || b <= a) return null;
  return b - a;
};
export const fmtDur = (mins) => (mins == null ? '—' : `${Math.floor(mins / 60)}h ${pad(mins % 60)}m`);
export const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
export const longDate = (d = new Date()) => `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${FULL_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
export const daysLabel = (n) => `${n} day${n === 1 ? '' : 's'}`;
