// Pure helpers shared by the HOD / Dean / Principal portals (ported from js/leaders.js).
import ERP from './erp';

const U = ERP.util, F = ERP.fmt, LS = ERP.LEAVE_STATE;

export const PENDING = [LS.PENDING_HOD, LS.PENDING_PRINCIPAL];
export const LIVE = [...PENDING, LS.APPROVED];
export const STAFF_ROLES = ['faculty', 'hod', 'dean', 'principal'];
export const TYPE_TONE = { CL: 'accent', EL: 'info', ML: 'bad', OD: 'ok', LOP: 'warn' };
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const addDays = (s, n) => { const d = U.parseISO(s); d.setDate(d.getDate() + n); return U.iso(d); };
export const pctTone = (p) => (p >= 85 ? 'ok' : p >= 75 ? 'warn' : 'bad');
export const short = (name) => name.replace(/^Dr\.\s*/, '');
export const isStaff = (u) => STAFF_ROLES.includes(u.role);
export const principal = () => ERP.users.all().find((u) => u.role === 'principal');
export const dateRange = (l) => (l.from === l.to ? F.date(l.from) : `${F.date(l.from)} – ${F.date(l.to)}`);
export const daysLabel = (n) => `${n} day${n === 1 ? '' : 's'}`;
export const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
export const fileStamp = (s) => s.replace(/[^\w-]+/g, '_');

export function presetRange(p) {
  const t = U.today(), d = U.parseISO(t);
  if (p === 'month') return { from: U.iso(new Date(d.getFullYear(), d.getMonth(), 1)), to: t };
  if (p === 'lastmonth') return { from: U.iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), to: U.iso(new Date(d.getFullYear(), d.getMonth(), 0)) };
  return { from: addDays(t, -(+p) + 1), to: t };
}
export const PRESETS = [['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['month', 'This month'], ['lastmonth', 'Last month']];

// Filter state persists across section switches (keyed per screen).
export const memo = {};
export const keep = (key, init) => memo[key] || (memo[key] = init());
export const setFilter = (key, patch) => { if (memo[key]) Object.assign(memo[key], patch); else memo[key] = { ...presetRange('30'), preset: '30', dept: '', ...patch }; };

export const staffSummary = (list, from, to) => list.map((u) => ({ u, s: ERP.attendance.summaryFor(u.empId, from, to) }));
export const lowAttendance = (list, from, to, thr = 75) => staffSummary(list, from, to).filter((r) => r.s.total && r.s.percent < thr).sort((a, b) => a.s.percent - b.s.percent);
export const onLeaveOn = (date, list) => {
  const ids = list ? new Set(list.map((u) => u.empId)) : null;
  return ERP.leaves.all().filter((l) => l.status === LS.APPROVED && l.from <= date && l.to >= date && (!ids || ids.has(l.empId)));
};
export function deptStats(from, to) {
  return ERP.DEPARTMENTS.map((d) => ({ ...d, s: ERP.attendance.deptSummary(d.code, from, to), staff: ERP.users.byDept(d.code).filter(isStaff).length }));
}
export function weeklyTrend(n = 4, list = null) {
  const ids = list ? new Set(list.map((u) => u.empId)) : null;
  const last = ERP.attendance.latestDate() || U.today();
  const monday = addDays(last, -((U.parseISO(last).getDay() + 6) % 7));
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const from = addDays(monday, -7 * i), to = addDays(from, 6);
    const rows = ERP.attendance.all().filter((r) => r.date >= from && r.date <= to && (!ids || ids.has(r.empId)));
    out.push({ from, to, label: F.date(from).slice(0, 6), s: ERP.attendance.summarize(rows) });
  }
  return out;
}
