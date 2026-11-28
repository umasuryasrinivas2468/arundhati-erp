/* Arundhati ERP — Vercel deployment of the API (same logic as server.js, see lib/api.js), stored in Supabase.
 * vercel.json routes /api/{login,logout,db,op,password} and the three seed files here; nothing else.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (server-only), SESSION_SECRET (>= 32 random chars).
 * Tables: supabase-schema.sql (erp_state = the whole ERP blob, erp_passwords = scrypt hashes).
 */
const { createApi, json, STUBS, hash } = require('../lib/api.js');

const ROW = 'arundhati-erp:v3';
const base = () => `${String(process.env.SUPABASE_URL || '').replace(/\/+$/, '')}/rest/v1`;
async function sb(pathAndQuery, init = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.SUPABASE_URL || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
  const r = await fetch(base() + pathAndQuery, { ...init, cache: 'no-store', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers } });
  if (!r.ok) throw new Error(`Supabase ${init.method || 'GET'} failed (${r.status}): ${await r.text()}`);
  const text = await r.text(); // return=minimal replies have no body
  return text ? JSON.parse(text) : null;
}
const q = encodeURIComponent;

const store = {
  async load() {
    const rows = await sb(`/erp_state?id=eq.${q(ROW)}&select=data,updated_at`);
    return rows.length ? { db: rows[0].data, ver: rows[0].updated_at } : { db: null, ver: null };
  },
  // Optimistic write: only succeeds if nobody else wrote since our load().
  async save(db, ver) {
    const rows = await sb(`/erp_state?id=eq.${q(ROW)}&updated_at=eq.${q(ver)}&select=id`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ data: db, updated_at: new Date().toISOString() }),
    });
    return rows.length === 1;
  },
  async getHash(empId) { return (await sb(`/erp_passwords?emp_id=eq.${q(empId)}&select=hash`))[0]?.hash; },
  async setPassword(empId, pw) {
    await sb('/erp_passwords', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ emp_id: String(empId), hash: hash(pw) }) });
  },
  async deletePassword(empId) { await sb(`/erp_passwords?emp_id=eq.${q(empId)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); },
};

let api;
module.exports = async (req, res) => {
  const route = new URL(req.url, 'http://x').searchParams.get('route') || '';
  const stub = STUBS[`/js/${route.replace(/^stub\//, '')}.js`];
  if (route.startsWith('stub/') && stub) { res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' }); return res.end(stub); }
  try {
    api ||= createApi(store, process.env.SESSION_SECRET);
    await api(req, res, `/api/${route}`);
  } catch (e) {
    json(res, 500, { ok: false, error: String(e.message || e) });
  }
};
