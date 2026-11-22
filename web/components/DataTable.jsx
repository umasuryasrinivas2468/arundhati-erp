'use client';
import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { Empty } from './ui';

/* Sortable, searchable, paginated table (ported from ERP.ui.table).
 * columns: [{ key, label, render?(row)->node, sort?(row)->value, align:'right', noSort }]
 * search: (row) => string | null ; toolbar: React node
 */
export function DataTable({ columns, rows, pageSize = 10, search = null, emptyText = 'Nothing to show', toolbar = null }) {
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState(1);
  const [page, setPage] = useState(0);

  const view = useMemo(() => {
    let v = q && search ? rows.filter((r) => (search(r) || '').toLowerCase().includes(q)) : rows.slice();
    if (sortKey != null) {
      const c = columns[sortKey];
      const val = c.sort || ((r) => r[c.key]);
      v.sort((a, b) => { const x = val(a), y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * sortDir; });
    }
    return v;
  }, [rows, q, search, sortKey, sortDir, columns]);

  const pages = Math.max(1, Math.ceil(view.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const slice = view.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const clickSort = (i) => {
    if (columns[i].noSort) return;
    setSortDir((d) => (sortKey === i ? -d : 1));
    setSortKey(i);
  };

  return (
    <div className="table-wrap">
      {(search || toolbar) && (
        <div className="table-tools">
          {search ? (
            <label className="search">
              <Icon name="search" size={16} />
              <input type="search" placeholder="Search…" value={q} onChange={(e) => { setQ(e.target.value.trim().toLowerCase()); setPage(0); }} />
            </label>
          ) : <span />}
          <div className="table-extra">{toolbar}</div>
        </div>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={i} className={`${c.align === 'right' ? 'r' : ''} ${c.noSort ? '' : 'sortable'}`} onClick={() => clickSort(i)}>
                  {c.label}<span className="sort-ind">{i === sortKey ? (sortDir > 0 ? ' ▲' : ' ▼') : ''}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.length ? slice.map((r, ri) => (
              <tr key={r.__key ?? ri} className={r.__rowClass || ''} onClick={r.__onClick}>
                {columns.map((c, ci) => (
                  <td key={ci} className={c.align === 'right' ? 'r' : ''}>{c.render ? c.render(r) : r[c.key]}</td>
                ))}
              </tr>
            )) : (
              <tr><td colSpan={columns.length}><Empty msg={emptyText} /></td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="table-foot">
        <span className="muted small">{view.length ? `Showing ${safePage * pageSize + 1}–${safePage * pageSize + slice.length} of ${view.length}` : ''}</span>
        {pages > 1 && (
          <div className="pager">
            <button className="btn btn-ghost btn-sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Prev</button>
            <button className="btn btn-ghost btn-sm" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default DataTable;
