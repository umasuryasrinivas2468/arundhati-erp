'use client';
import ERP from '@/lib/erp';
import { DOW, pad, monthRange, hoursWorked, fmtDur } from '@/lib/dates';

const TONE_VAR = { ok: '--ok', bad: '--bad', warn: '--warn', info: '--info', accent: '--accent' };

/* Month attendance grid for one employee. mini = compact (no status code text). */
export function AttendanceCalendar({ empId, year, month, mini = false }) {
  const [from, to] = monthRange(year, month);
  const recs = new Map(ERP.attendance.forEmp(empId, from, to).map((r) => [r.date, r]));
  const today = ERP.util.today();
  const first = new Date(year, month, 1).getDay();
  const last = new Date(year, month + 1, 0).getDate();

  const cells = [];
  DOW.forEach((d) => cells.push(<div className="cal-h" key={`h${d}`}>{mini ? d[0] : d}</div>));
  for (let i = 0; i < first; i++) cells.push(<div className="cal-d blank" key={`b${i}`} />);
  for (let d = 1; d <= last; d++) {
    const date = `${year}-${pad(month + 1)}-${pad(d)}`;
    const dow = new Date(year, month, d).getDay();
    const r = recs.get(date);
    const cls = ['cal-d'];
    let tip, code = '';
    if (r) {
      const st = ERP.STATUS[r.status];
      cls.push(`s-${r.status}`); code = r.status;
      tip = `${ERP.fmt.date(date)} · ${st ? st.label : r.status}`;
      if (r.inTime || r.outTime) tip += `\nIn ${r.inTime || '—'}  ·  Out ${r.outTime || '—'}`;
      const w = hoursWorked(r); if (w != null) tip += `\nWorked ${fmtDur(w)}`;
    } else if (dow === 0) {
      cls.push('sun'); tip = `${ERP.fmt.date(date)} · Sunday (holiday)`;
    } else if (date > today) {
      cls.push('future'); tip = `${ERP.fmt.date(date)} · Upcoming`;
    } else {
      cls.push('none'); tip = `${ERP.fmt.date(date)} · No record uploaded`;
    }
    if (date === today) cls.push('today');
    if (dow <= 1) cls.push('tip-l'); else if (dow >= 5) cls.push('tip-r');
    cells.push(
      <div className={cls.join(' ')} key={date} data-tip={tip} aria-label={tip.replace(/\n/g, ', ')}>
        {d}{code && !mini ? <small>{code}</small> : null}
      </div>
    );
  }
  return <div className={`cal ${mini ? 'cal-mini' : ''}`}>{cells}</div>;
}

export function CalendarLegend() {
  return (
    <div className="cal-legend">
      {Object.entries(ERP.STATUS).map(([k, s]) => (
        <span key={k}><i style={{ background: `var(${TONE_VAR[s.tone]})` }} />{k} · {s.label}</span>
      ))}
      <span><i className="cal-d sun" style={{ aspectRatio: 'auto', width: 12, height: 12 }} />Sunday</span>
    </div>
  );
}

export default AttendanceCalendar;
