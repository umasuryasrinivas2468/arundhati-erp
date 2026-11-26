/* Arundhati ERP — shared data store (Vercel Serverless Function + Supabase Postgres).
 *
 * The whole ERP database is kept as ONE JSON value (a single `jsonb` row) in Supabase
 * so every visitor sees the same data and admin uploads persist for everyone.
 *   GET  /api/db        -> { ok:true, db:<object|null> }
 *   PUT  /api/db        body { db:<object> }  (POST is accepted too, for sendBeacon)
 *
 * Talks to Supabase through its auto-generated REST API (PostgREST) with `fetch`,
 * so there is no extra npm dependency and it runs on the default Node.js runtime.
 *
 * Required env vars (injected by the Vercel → Supabase marketplace integration, or set
 * manually from your Supabase project → Settings → API):
 *   SUPABASE_URL                (e.g. https://xxxx.supabase.co)
 *   SUPABASE_SERVICE_ROLE_KEY   (server-side secret — the "service_role" key, NOT the anon key)
 *
 * One-time table setup (run in Supabase → SQL Editor, also in supabase-schema.sql):
 *   create table if not exists public.erp_state (
 *     id text primary key,
 *     data jsonb not null,
 *     updated_at timestamptz not null default now()
 *   );
 */

const ROW_ID = 'arundhati-erp:v3';
const TABLE = 'erp_state';

function config() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase env vars missing — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
        '(add the Supabase integration in Vercel → Integrations, or copy them from ' +
        'Supabase → Project Settings → API).'
    );
  }
  return { base: url.replace(/\/+$/, ''), key };
}

function headers(key, extra) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { base, key } = config();
    const rest = `${base}/rest/v1/${TABLE}`;

    if (req.method === 'GET') {
      const url = `${rest}?id=eq.${encodeURIComponent(ROW_ID)}&select=data&limit=1`;
      const r = await fetch(url, { headers: headers(key) });
      if (!r.ok) throw new Error(`Supabase GET failed (${r.status}): ${await r.text()}`);
      const rows = await r.json();
      const db = Array.isArray(rows) && rows.length ? rows[0].data : null;
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).send(JSON.stringify({ ok: true, db }));
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
      const db = body ? body.db : undefined;
      if (!db || typeof db !== 'object' || Array.isArray(db)) {
        return res.status(400).json({ ok: false, error: 'Request body must be { db: <object> }' });
      }
      // Upsert the single row (resolution=merge-duplicates => insert or update on PK conflict).
      const r = await fetch(rest, {
        method: 'POST',
        headers: headers(key, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify({ id: ROW_ID, data: db, updated_at: new Date().toISOString() }),
      });
      if (!r.ok) throw new Error(`Supabase upsert failed (${r.status}): ${await r.text()}`);
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, PUT, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
};
