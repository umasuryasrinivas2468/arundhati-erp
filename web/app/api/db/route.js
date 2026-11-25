/* Arundhati ERP — shared data store (Next.js Route Handler + Supabase Postgres).
 *
 * Identical contract to the static build's /api/db:
 *   GET  /api/db        -> { ok:true, db:<object|null> }
 *   PUT  /api/db        body { db:<object> }   (POST accepted too, for sendBeacon)
 *
 * The whole ERP database is kept as ONE JSON value (a single `jsonb` row) in Supabase,
 * read/written through its REST API (no extra npm dependency).
 *
 * Env vars (injected by the Vercel → Supabase integration, or set from Supabase →
 * Settings → API):  SUPABASE_URL  and  SUPABASE_SERVICE_ROLE_KEY.
 * One-time table setup lives in supabase-schema.sql at the repo root.
 */

export const dynamic = 'force-dynamic'; // never cache this handler

const ROW_ID = 'arundhati-erp:v3';
const TABLE = 'erp_state';
const noStore = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };

function config() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase env vars missing — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
        '(Vercel → Integrations → Supabase, or Supabase → Project Settings → API).'
    );
  }
  return { base: url.replace(/\/+$/, ''), key };
}

function headers(key, extra) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra };
}

export async function GET() {
  try {
    const { base, key } = config();
    const url = `${base}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(ROW_ID)}&select=data&limit=1`;
    const r = await fetch(url, { headers: headers(key), cache: 'no-store' });
    if (!r.ok) throw new Error(`Supabase GET failed (${r.status}): ${await r.text()}`);
    const rows = await r.json();
    const db = Array.isArray(rows) && rows.length ? rows[0].data : null;
    return new Response(JSON.stringify({ ok: true, db }), { status: 200, headers: noStore });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e && e.message) || e) }), { status: 500, headers: noStore });
  }
}

async function write(req) {
  try {
    const { base, key } = config();
    let body = await req.text();
    try { body = JSON.parse(body); } catch (e) { body = null; }
    const db = body ? body.db : undefined;
    if (!db || typeof db !== 'object' || Array.isArray(db)) {
      return new Response(JSON.stringify({ ok: false, error: 'Request body must be { db: <object> }' }), { status: 400, headers: noStore });
    }
    const r = await fetch(`${base}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: headers(key, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ id: ROW_ID, data: db, updated_at: new Date().toISOString() }),
      cache: 'no-store',
    });
    if (!r.ok) throw new Error(`Supabase upsert failed (${r.status}): ${await r.text()}`);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: noStore });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e && e.message) || e) }), { status: 500, headers: noStore });
  }
}

export const PUT = write;
export const POST = write;
